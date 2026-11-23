import sql from 'mssql';

// The typings do not expose these as types under Node's ESM resolution, so derive them from the values.
type Config = ConstructorParameters<typeof sql.ConnectionPool>[0] & object;
type Tx = InstanceType<typeof sql.Transaction>;
import { splitBatches } from './split.js';
import { MIGRATION_TABLE, type AppliedMigration, type MigrationDriver } from './runner.js';
import type { MigrationFile } from './files.js';

function configFromUrl(url: string): Config {
  const parsed = new URL(url);
  return {
    server: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 1433,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    // Same as the API's TypeORM options.
    options: { encrypt: false, trustServerCertificate: true },
  };
}

/**
 * The whole run is one transaction that holds a transaction-owned application lock. DDL is transactional in
 * SQL Server, so a failed migration leaves nothing behind. The lock is released by commit or rollback.
 */
export function mssqlDriver(url: string): MigrationDriver {
  const pool = new sql.ConnectionPool({ ...configFromUrl(url), pool: { max: 1 } });
  let tx: Tx | undefined;
  let failed = false;
  const request = () => new sql.Request(tx!);
  const guard = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      failed = true;
      throw error;
    }
  };
  const insert = (migration: MigrationFile) =>
    request()
      .input('version', sql.Int, migration.version)
      .input('name', sql.NVarChar(200), migration.name)
      .input('checksum', sql.NVarChar(64), migration.checksum)
      .query(`INSERT INTO users.${MIGRATION_TABLE} (version, name, checksum) VALUES (@version, @name, @checksum)`);

  return {
    async lock() {
      await pool.connect();
      tx = new sql.Transaction(pool);
      await tx.begin();
      const result = await request().query(
        `DECLARE @r int; EXEC @r = sp_getapplock @Resource = N'doorward_migrate', @LockMode = N'Exclusive',
           @LockOwner = N'Transaction', @LockTimeout = 60000; SELECT @r AS r;`,
      );
      if (result.recordset[0].r < 0) {
        failed = true;
        throw new Error('Another Doorward migration holds the database lock; try again shortly.');
      }
    },
    async unlock() {
      if (tx) {
        if (failed) await tx.rollback().catch(() => {});
        else await tx.commit();
        tx = undefined;
      }
    },
    userTables: () =>
      guard(async () => {
        const result = await request().query(
          `SELECT t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = N'users'`,
        );
        return result.recordset.map((row: { name: string }) => row.name);
      }),
    ensureMigrationTable: () =>
      guard(async () => {
        await request().batch(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'users') EXEC(N'CREATE SCHEMA users AUTHORIZATION dbo')`);
        await request().batch(`IF OBJECT_ID(N'users.${MIGRATION_TABLE}') IS NULL
          CREATE TABLE users.${MIGRATION_TABLE} (
            version    int           NOT NULL PRIMARY KEY,
            name       nvarchar(200) NOT NULL,
            checksum   nvarchar(64)  NOT NULL,
            applied_at datetime2     NOT NULL DEFAULT SYSUTCDATETIME()
          )`);
      }),
    applied: () =>
      guard(async () => {
        const result = await request().query(
          `SELECT version, name, checksum FROM users.${MIGRATION_TABLE} ORDER BY version`,
        );
        return result.recordset as AppliedMigration[];
      }),
    exec: (script) =>
      guard(async () => {
        for (const batch of splitBatches(script)) await request().batch(batch);
      }),
    query: (text, params = []) =>
      guard(async () => {
        const req = request();
        params.forEach((value, index) => req.input(`p${index + 1}`, value as string | null));
        return (await req.query(text)).recordset ?? [];
      }),
    atomic: (work) => guard(work),
    apply: (migration) =>
      guard(async () => {
        for (const batch of splitBatches(migration.sql)) await request().batch(batch);
        await insert(migration);
      }),
    record: (migration) => guard(async () => void (await insert(migration))),
    async close() {
      await pool.close();
    },
  };
}
