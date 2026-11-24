// LDAP sign-in against a throwaway OpenLDAP and a SCRATCH Postgres. Start both:
//   docker run -d --rm --name dw-test-ldap -p 127.0.0.1:10389:10389 rroemhild/test-openldap
//   docker run -d --rm --name dw-test-pg -e POSTGRES_USER=doorward -e POSTGRES_PASSWORD=doorward \
//     -e POSTGRES_DB=doorward_ldaptest -p 127.0.0.1:55433:5432 postgres:16-alpine
// then run:
//   LDAP_E2E_DATABASE_URL=postgresql://doorward:doorward@127.0.0.1:55433/doorward_ldaptest \
//   LDAP_E2E_URL=ldap://127.0.0.1:10389 LDAP_E2E_BIND_PASSWORD=<admin password from the test-openldap README> \
//   pnpm test:e2e ldap
// The spec migrates and seeds that database and writes users into it. Never point it at one you keep.
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AccessService } from '../src/application/access.service.js';
import { AuthService } from '../src/application/auth.service.js';
import { Tenancy } from '../src/application/common.js';
import { LdapService } from '../src/application/ldap.service.js';
import { PasswordService } from '../src/application/password.service.js';
import { UsersService } from '../src/application/users.service.js';
import { loadMigrations } from '../src/infrastructure/database/migrate/files.js';
import { migrate } from '../src/infrastructure/database/migrate/runner.js';
import { seed } from '../src/infrastructure/database/migrate/seed.js';
import { createDriver, migrationsDir, seedSql } from '../src/infrastructure/database/migrate/setup.js';
import { typeOrmEntities } from '../src/infrastructure/database/entities/index.js';
import { UserEntity } from '../src/infrastructure/database/entities/user.entity.js';

const dbUrl = process.env.LDAP_E2E_DATABASE_URL;
const ldapUrl = process.env.LDAP_E2E_URL;
let COMPANY_KEY = ''; // company_key of the seeded Default company, read in beforeAll
const BASE = 'dc=planetexpress,dc=com';
const GROUPS = JSON.stringify({
  [`cn=admin_staff,ou=people,${BASE}`]: 'Admin',
  [`cn=ship_crew,ou=people,${BASE}`]: 'Crew',
});
const call = { source: 'rest' } as const;

const settings = (over: Record<string, unknown> = {}) => ({
  multiCompanyMode: false,
  logAuthFailures: false,
  ldapUrl,
  ldapBindDn: `cn=admin,${BASE}`,
  ldapBindPassword: process.env.LDAP_E2E_BIND_PASSWORD ?? '',
  ldapUserBase: `ou=people,${BASE}`,
  ldapUserFilter: '(uid={username})',
  ldapCompanyKey: COMPANY_KEY,
  ldapGroupMap: GROUPS,
  ...over,
});

describe.skipIf(!dbUrl || !ldapUrl)('LDAP sign-in (live OpenLDAP + scratch Postgres)', () => {
  let db: DataSource;
  let auth: AuthService;
  let users: UsersService;
  const passwords = new PasswordService();

  const build = (over: Record<string, unknown> = {}) => {
    const config = new ConfigService(settings(over));
    const tenancy = new Tenancy(config);
    return new AuthService(db, passwords, new AccessService(db, tenancy), tenancy, config, new LdapService(config));
  };
  const row = (username: string) => db.getRepository(UserEntity).findOneBy({ username });
  const groupsOf = async (username: string) =>
    (
      await db.query(
        `SELECT g.name FROM users.user_group_member m JOIN users.user_group g ON g.id = m.group_id
         JOIN users."user" u ON u.id = m.user_id WHERE u.username = $1 ORDER BY g.name`,
        [username],
      )
    ).map((r: { name: string }) => r.name);

  beforeAll(async () => {
    const driver = createDriver('postgres', dbUrl!);
    try {
      await migrate(driver, loadMigrations(migrationsDir('postgres')));
      await seed(driver, 'postgres', seedSql('postgres'), { username: 'admin', password: 'changeme' });
    } finally {
      await driver.close();
    }
    db = new DataSource({ type: 'postgres', url: dbUrl, entities: [...typeOrmEntities] });
    await db.initialize();
    // Start from the seeded state so a second run sees the same database as the first.
    await db.query(`DELETE FROM users.user_group_member WHERE user_id IN (SELECT id FROM users."user" WHERE username <> 'admin')`);
    await db.query(`DELETE FROM users."user" WHERE username <> 'admin'`);
    await db.query(`DELETE FROM users.audit_log`);
    await db.query(
      `INSERT INTO users.user_group (id, company_id, name) VALUES
       ('01930000-0000-7000-8000-0000000000c1', '01930000-0000-7000-8000-000000000001', 'Crew')
       ON CONFLICT DO NOTHING`,
    );
    COMPANY_KEY = (await db.query(`SELECT company_key FROM users.company WHERE deleted_at IS NULL`))[0].company_key;
    auth = build();
    const config = new ConfigService(settings());
    users = new UsersService(db, new Tenancy(config), passwords);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  it('creates the user on first sign-in with data and groups from the directory', async () => {
    const user = await auth.authenticate({ username: 'professor', password: 'professor' }, call);
    expect(user).toMatchObject({ username: 'professor', firstName: 'Hubert', lastName: 'Farnsworth' });
    const stored = await row('professor');
    expect(stored).toMatchObject({ authSource: 'ldap', passwordHash: '', email: 'professor@planetexpress.com' });
    expect(await groupsOf('professor')).toEqual(['Admin']);
  });

  it('signs the same user in again without creating a second row', async () => {
    await auth.authenticate({ username: 'professor', password: 'professor' }, call);
    expect(await db.getRepository(UserEntity).countBy({ username: 'professor' })).toBe(1);
  });

  it('rejects a wrong password and creates nothing', async () => {
    await expect(auth.authenticate({ username: 'fry', password: 'nope' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    expect(await row('fry')).toBeNull();
  });

  it('rejects an unknown directory user', async () => {
    await expect(auth.authenticate({ username: 'nobody', password: 'x' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  it('rejects an empty password instead of treating it as an anonymous bind', async () => {
    await expect(auth.authenticate({ username: 'fry', password: '' }, call)).rejects.toMatchObject({ kind: 'invalid' });
    expect(await row('fry')).toBeNull();
  });

  it.each(['*', 'fr*', 'fry)(uid=*', '*)(objectClass=*'])('does not let %j change the filter', async (name) => {
    await expect(auth.authenticate({ username: name, password: 'fry' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    expect(await db.getRepository(UserEntity).countBy({ authSource: 'ldap' })).toBe(1); // only professor
  });

  it('keeps the seeded local admin on local passwords', async () => {
    const user = await auth.authenticate({ username: 'admin', password: 'changeme' }, call);
    expect(user.username).toBe('admin');
    expect((await row('admin'))?.authSource).toBe('local');
  });

  it('still signs the local admin in when the directory is down', async () => {
    const down = build({ ldapUrl: 'ldap://127.0.0.1:1' });
    await expect(down.authenticate({ username: 'admin', password: 'changeme' }, call)).resolves.toBeTruthy();
    await expect(down.authenticate({ username: 'leela', password: 'leela' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    await expect(down.authenticate({ username: 'professor', password: 'professor' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  it('does not let a directory password take over a local user', async () => {
    await users.create(
      { companyId: '01930000-0000-7000-8000-000000000001', username: 'bender', firstName: 'Local', lastName: 'Bender', password: 'localpass1' },
      call,
    );
    await expect(auth.authenticate({ username: 'bender', password: 'bender' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    await expect(auth.authenticate({ username: 'bender', password: 'localpass1' }, call)).resolves.toBeTruthy();
    // Same name in another case collides with the local user's unique name and is refused.
    await expect(auth.authenticate({ username: 'Bender', password: 'bender' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  it('refuses to set a Doorward password for a directory user', async () => {
    const stored = (await row('professor'))!;
    await expect(users.setPassword(stored.id, 'newpassword1', call)).rejects.toMatchObject({ kind: 'invalid' });
    expect((await row('professor'))?.passwordHash).toBe('');
  });

  it('syncs mapped groups both ways and leaves unmapped groups alone', async () => {
    const professor = (await row('professor'))!;
    // Crew is mapped and the directory does not list it for professor; Everyone is not mapped.
    await db.query(
      `INSERT INTO users.user_group_member (user_id, group_id) VALUES ($1, '01930000-0000-7000-8000-0000000000c1'), ($1, '01930000-0000-7000-8000-000000000004')`,
      [professor.id],
    );
    expect(await groupsOf('professor')).toEqual(['Admin', 'Crew', 'Everyone']);
    await auth.authenticate({ username: 'professor', password: 'professor' }, call);
    expect(await groupsOf('professor')).toEqual(['Admin', 'Everyone']);
    const audit = await db.query(
      `SELECT payload, actor_user_id FROM users.audit_log WHERE entity_id = $1 AND event_type = 'ldap_sync'`,
      [professor.id],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_user_id).toBe(professor.id);
    // A raw query returns the payload as the transformer stored it, which may be JSON text.
    const payload = typeof audit[0].payload === 'string' ? JSON.parse(audit[0].payload) : audit[0].payload;
    expect(payload.removed).toEqual(['01930000-0000-7000-8000-0000000000c1']);
  });

  it('adds a group the directory lists', async () => {
    await auth.authenticate({ username: 'fry', password: 'fry' }, call);
    expect(await groupsOf('fry')).toEqual(['Crew']);
  });

  it('blocks a user deactivated in Doorward', async () => {
    const fry = (await row('fry'))!;
    await users.update(fry.id, { active: false }, call);
    await expect(auth.authenticate({ username: 'fry', password: 'fry' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  it('does not provision into a company other than the one asked for', async () => {
    await expect(
      auth.authenticate({ username: 'leela', password: 'leela', companyId: '01930000-0000-7000-8000-0000000000ff' }, call),
    ).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(await row('leela')).toBeNull();
  });

  it('does not provision when LDAP is off', async () => {
    const off = build({ ldapUrl: '' });
    await expect(off.authenticate({ username: 'leela', password: 'leela' }, call)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    expect(await row('leela')).toBeNull();
  });
});
