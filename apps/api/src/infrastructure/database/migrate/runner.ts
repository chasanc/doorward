import type { MigrationFile } from './files.js';

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

/** What the runner needs from a database. One implementation per SQL dialect. */
export interface MigrationDriver {
  /** Held for the whole run so two instances never migrate at once. */
  lock(): Promise<void>;
  unlock(): Promise<void>;
  /** Names of the tables in the `users` schema, without the schema prefix. */
  userTables(): Promise<string[]>;
  /** Creates the `users` schema and `users.schema_migration` when they are missing. */
  ensureMigrationTable(): Promise<void>;
  applied(): Promise<AppliedMigration[]>;
  /** Runs a script of several statements (split on `GO` for SQL Server). */
  exec(sql: string): Promise<void>;
  /** One parameterised statement. Placeholders are `$1`, `$2`… on PostgreSQL and `@p1`, `@p2`… on SQL Server. */
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs `work` all-or-nothing. SQL Server already runs everything under the lock in one transaction. */
  atomic(work: () => Promise<void>): Promise<void>;
  /** Runs the file and records it as applied, in one transaction. */
  apply(migration: MigrationFile): Promise<void>;
  /** Records the file as applied without running it (adopting an existing database). */
  record(migration: MigrationFile): Promise<void>;
  close(): Promise<void>;
}

/** The tables `0001_baseline` creates. Adopting an existing database requires exactly these. */
export const BASELINE_TABLES = [
  'audit_log',
  'company',
  'grant',
  'oidc_client',
  'oidc_payload',
  'permission',
  'scope',
  'user',
  'user_group',
  'user_group_member',
  'user_totp',
] as const;

export const MIGRATION_TABLE = 'schema_migration';

export interface MigrationStatus {
  /** `fresh`: nothing there yet. `adoptable`: tables from the old install scripts. `managed`: has a migration table. */
  state: 'fresh' | 'adoptable' | 'managed';
  applied: AppliedMigration[];
  pending: MigrationFile[];
  /** Applied versions the bundled files do not contain: the database is newer than this code. */
  unknown: AppliedMigration[];
}

function describeDrift(tables: string[]): string {
  const missing = BASELINE_TABLES.filter((name) => !tables.includes(name));
  const extra = tables.filter((name) => !(BASELINE_TABLES as readonly string[]).includes(name));
  return `missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`;
}

/** Throws if an applied file was edited, or a lower version was skipped. */
function verify(applied: AppliedMigration[], files: MigrationFile[]): void {
  for (const row of applied) {
    const file = files.find((candidate) => candidate.version === row.version);
    if (file && file.checksum !== row.checksum) {
      throw new Error(
        `Migration ${row.version} (${row.name}) was changed after it was applied. ` +
          `Released migrations are immutable; put the change in a new file.`,
      );
    }
  }
  const highest = Math.max(0, ...applied.map((row) => row.version));
  for (const file of files) {
    if (file.version < highest && !applied.some((row) => row.version === file.version)) {
      throw new Error(`Migration ${file.version} (${file.name}) was never applied but a later one was.`);
    }
  }
}

/** Read-only view. Does not take the lock and changes nothing. */
export async function status(driver: MigrationDriver, files: MigrationFile[]): Promise<MigrationStatus> {
  const tables = await driver.userTables();
  const managed = tables.includes(MIGRATION_TABLE);
  const applied = managed ? await driver.applied() : [];
  verify(applied, files);
  const known = new Set(files.map((file) => file.version));
  const unknown = applied.filter((row) => !known.has(row.version));
  const done = new Set(applied.map((row) => row.version));
  const pending = files.filter((file) => !done.has(file.version));
  const state = managed ? 'managed' : tables.includes('company') ? 'adoptable' : 'fresh';
  return { state, applied, pending, unknown };
}

/** Applies every pending migration. Adopts a database built from the old install scripts first. */
export async function migrate(
  driver: MigrationDriver,
  files: MigrationFile[],
  log: (message: string) => void = () => {},
): Promise<MigrationStatus> {
  await driver.lock();
  try {
    let current = await status(driver, files);
    if (current.unknown.length > 0) {
      throw new Error(
        `The database has migration ${current.unknown.map((row) => row.version).join(', ')} that this code does not know. ` +
          `Run a newer version of Doorward.`,
      );
    }
    if (current.state === 'adoptable') {
      const tables = await driver.userTables();
      if (describeDrift(tables) !== 'missing=- extra=-') {
        throw new Error(`Cannot adopt this database; its tables do not match the baseline: ${describeDrift(tables)}`);
      }
      await driver.ensureMigrationTable();
      await driver.record(files[0]);
      log(`adopted existing database as ${files[0].version} ${files[0].name}`);
      current = await status(driver, files);
    } else if (current.state === 'fresh') {
      await driver.ensureMigrationTable();
    }
    for (const migration of current.pending) {
      await driver.apply(migration);
      log(`applied ${String(migration.version).padStart(4, '0')} ${migration.name}`);
    }
    return await status(driver, files);
  } finally {
    await driver.unlock();
  }
}
