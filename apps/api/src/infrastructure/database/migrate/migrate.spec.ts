import { describe, expect, it } from 'vitest';
import { checksumOf, type MigrationFile } from './files.js';
import { BASELINE_TABLES, migrate, status, type AppliedMigration, type MigrationDriver } from './runner.js';
import { adminFromEnv } from './seed.js';
import { splitBatches } from './split.js';

function file(version: number, sql = `-- ${version}`): MigrationFile {
  return { version, name: `m${version}`, sql, checksum: checksumOf(sql) };
}

/** In-memory stand-in for a database. */
function fakeDriver(initial: { tables?: string[]; applied?: AppliedMigration[] } = {}) {
  const state = { tables: [...(initial.tables ?? [])], applied: [...(initial.applied ?? [])], locked: false, ran: [] as number[] };
  const driver: MigrationDriver = {
    lock: async () => void (state.locked = true),
    unlock: async () => void (state.locked = false),
    userTables: async () => state.tables,
    ensureMigrationTable: async () => {
      if (!state.tables.includes('schema_migration')) state.tables.push('schema_migration');
    },
    applied: async () => state.applied,
    exec: async () => {},
    query: async () => [],
    atomic: async (work) => work(),
    apply: async (m) => {
      state.ran.push(m.version);
      state.applied.push({ version: m.version, name: m.name, checksum: m.checksum });
    },
    record: async (m) => void state.applied.push({ version: m.version, name: m.name, checksum: m.checksum }),
    close: async () => {},
  };
  return { driver, state };
}

describe('splitBatches', () => {
  it('splits on GO lines, ignoring case, CRLF and trailing comments', () => {
    expect(splitBatches('A;\r\nGO\r\nB;\ngo -- done\nC;')).toEqual(['A;', 'B;', 'C;']);
  });
  it('does not split on a word that merely starts with GO', () => {
    expect(splitBatches('GOTO x\nGO\nB')).toEqual(['GOTO x', 'B']);
  });
});

describe('adminFromEnv', () => {
  it('defaults to admin / changeme outside production', () => {
    expect(adminFromEnv({})).toEqual({ username: 'admin', password: 'changeme' });
  });
  it('uses the given username and password', () => {
    expect(adminFromEnv({ NODE_ENV: 'production', DOORWARD_ADMIN_USERNAME: 'root', DOORWARD_ADMIN_PASSWORD: 's3cret-pw' })).toEqual({
      username: 'root',
      password: 's3cret-pw',
    });
  });
  it('refuses an empty or demo password in production', () => {
    expect(() => adminFromEnv({ NODE_ENV: 'production' })).toThrow(/DOORWARD_ADMIN_PASSWORD/);
    expect(() => adminFromEnv({ NODE_ENV: 'production', DOORWARD_ADMIN_PASSWORD: 'changeme' })).toThrow();
  });
  it('allows the demo password in production only with DOORWARD_DEMO=true', () => {
    expect(adminFromEnv({ NODE_ENV: 'production', DOORWARD_DEMO: 'true' }).password).toBe('changeme');
  });
});

describe('checksumOf', () => {
  it('ignores line-ending style', () => {
    expect(checksumOf('a\r\nb')).toBe(checksumOf('a\nb'));
  });
});

describe('migrate', () => {
  it('applies every file to a fresh database and locks while doing so', async () => {
    const { driver, state } = fakeDriver();
    const result = await migrate(driver, [file(1), file(2)]);
    expect(state.ran).toEqual([1, 2]);
    expect(result.pending).toEqual([]);
    expect(state.locked).toBe(false);
  });

  it('is a no-op when everything is applied', async () => {
    const { driver, state } = fakeDriver();
    await migrate(driver, [file(1)]);
    state.ran.length = 0;
    await migrate(driver, [file(1)]);
    expect(state.ran).toEqual([]);
  });

  it('adopts a database built by the old scripts, then applies only later files', async () => {
    const { driver, state } = fakeDriver({ tables: [...BASELINE_TABLES] });
    await migrate(driver, [file(1), file(2)]);
    expect(state.ran).toEqual([2]);
    expect(state.applied.map((row) => row.version)).toEqual([1, 2]);
  });

  it('refuses to adopt when tables are missing or extra', async () => {
    const missing = fakeDriver({ tables: BASELINE_TABLES.filter((t) => t !== 'scope') });
    await expect(migrate(missing.driver, [file(1)])).rejects.toThrow(/missing=scope/);
    const extra = fakeDriver({ tables: [...BASELINE_TABLES, 'oddity'] });
    await expect(migrate(extra.driver, [file(1)])).rejects.toThrow(/extra=oddity/);
    expect(missing.state.locked).toBe(false);
  });

  it('rejects an applied file that was edited', async () => {
    const { driver } = fakeDriver({ tables: ['schema_migration'], applied: [{ version: 1, name: 'm1', checksum: 'old' }] });
    await expect(migrate(driver, [file(1)])).rejects.toThrow(/changed after it was applied/);
  });

  it('rejects a database that is ahead of the code', async () => {
    const { driver } = fakeDriver({ tables: ['schema_migration'], applied: [{ version: 1, name: 'm1', checksum: file(1).checksum }, { version: 2, name: 'm2', checksum: 'x' }] });
    await expect(migrate(driver, [file(1)])).rejects.toThrow(/does not know/);
  });

  it('status reports pending files without changing anything', async () => {
    const { driver, state } = fakeDriver();
    const result = await status(driver, [file(1)]);
    expect(result.state).toBe('fresh');
    expect(result.pending).toHaveLength(1);
    expect(state.tables).toEqual([]);
  });
});
