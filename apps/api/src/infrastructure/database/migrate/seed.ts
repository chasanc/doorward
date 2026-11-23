import { randomUUID } from 'node:crypto';
import type { DatabaseKind } from '@doorward/domain';
import { uuidv7 } from '../../../application/ids.js';
import { PasswordService } from '../../../application/password.service.js';
import { MIGRATION_TABLE, type MigrationDriver } from './runner.js';

const DEMO_PASSWORD = 'changeme';

export interface AdminCredentials {
  username: string;
  password: string;
}

/**
 * First admin from the environment. In production an empty password or the demo password is refused,
 * so a deployment cannot go live with a publicly known login. `DOORWARD_DEMO=true` lifts that (Compose demo).
 */
export function adminFromEnv(env: Record<string, string | undefined>): AdminCredentials {
  const username = (env.DOORWARD_ADMIN_USERNAME ?? '').trim() || 'admin';
  const given = env.DOORWARD_ADMIN_PASSWORD ?? '';
  const strict = env.NODE_ENV === 'production' && env.DOORWARD_DEMO !== 'true';
  if (strict && (given === '' || given === DEMO_PASSWORD)) {
    throw new Error(
      'Set DOORWARD_ADMIN_PASSWORD to a real password: an empty value or "changeme" is refused when NODE_ENV=production.',
    );
  }
  return { username, password: given === '' ? DEMO_PASSWORD : given };
}

/**
 * Fills an empty database with the default company, groups, scope and permission, then makes sure someone
 * holds `doorward.admin`. Both steps are skipped once their data exists, so it is safe to run on every start.
 * `seedSql` is only run when no company exists, so a company you renamed or deleted is never recreated.
 */
export async function seed(
  driver: MigrationDriver,
  kind: DatabaseKind,
  seedSql: string,
  admin: AdminCredentials,
  log: (message: string) => void = () => {},
): Promise<void> {
  const ms = kind === 'mssql';
  const ph = (n: number) => (ms ? `@p${n}` : `$${n}`);
  const userTable = ms ? 'users.[user]' : 'users."user"';
  const grantTable = ms ? 'users.[grant]' : 'users."grant"';
  const active = ms ? '1' : 'true';
  const exists = async (sql: string, params: unknown[] = []) => (await driver.query(sql, params)).length > 0;

  await driver.lock();
  try {
    if (!(await driver.userTables()).includes(MIGRATION_TABLE)) {
      throw new Error('The database has no schema yet. Run `pnpm db:migrate` first.');
    }
    // Hash first: argon2 is slow and must not run while the transaction holds locks.
    const passwordHash = await new PasswordService().hash(admin.password);
    await driver.atomic(async () => {
      if (!(await exists('SELECT 1 AS x WHERE NOT EXISTS (SELECT 1 FROM users.company)'))) {
        log('database already has a company; default data skipped');
      } else {
        await driver.exec(seedSql);
        log('created default company, groups, scope and permission');
      }

      const held = await exists(
        `SELECT 1 AS x FROM ${grantTable} g JOIN users.permission p ON p.id = g.permission_id
          WHERE p.name = 'doorward.admin' AND p.deleted_at IS NULL`,
      );
      if (held) {
        log('someone already holds doorward.admin; admin user skipped');
        return;
      }
      const [permission] = await driver.query(
        `SELECT id, company_id FROM users.permission WHERE name = 'doorward.admin' AND deleted_at IS NULL`,
      );
      if (!permission) throw new Error('The permission doorward.admin does not exist; cannot create an admin.');
      const companyId = String(permission.company_id);
      if (
        await exists(
          `SELECT 1 AS x FROM ${userTable} WHERE company_id = ${ph(1)} AND lower(username) = lower(${ph(2)}) AND deleted_at IS NULL`,
          [companyId, admin.username],
        )
      ) {
        throw new Error(
          `User "${admin.username}" already exists but holds no admin rights. Set DOORWARD_ADMIN_USERNAME to a new name.`,
        );
      }
      const userId = uuidv7();
      await driver.query(
        `INSERT INTO ${userTable} (id, company_id, user_key, username, first_name, last_name, email, password_hash, active)
         VALUES (${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, 'System', 'Admin', ${ph(5)}, ${ph(6)}, ${active})`,
        [userId, companyId, randomUUID(), admin.username, `${admin.username}@localhost`, passwordHash],
      );
      await driver.query(
        `INSERT INTO ${grantTable} (id, user_id, group_id, permission_id, scope_id)
         VALUES (${ph(1)}, ${ph(2)}, NULL, ${ph(3)}, NULL)`,
        [uuidv7(), userId, String(permission.id)],
      );
      const [group] = await driver.query(
        `SELECT id FROM users.user_group WHERE company_id = ${ph(1)} AND name = 'Admin' AND deleted_at IS NULL`,
        [companyId],
      );
      if (group) {
        await driver.query(`INSERT INTO users.user_group_member (user_id, group_id) VALUES (${ph(1)}, ${ph(2)})`, [
          userId,
          String(group.id),
        ]);
      }
      log(`created admin user "${admin.username}"`);
    });
  } finally {
    await driver.unlock();
  }
}
