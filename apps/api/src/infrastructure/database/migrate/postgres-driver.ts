import pg from 'pg';
import type { MigrationFile } from './files.js';
import { MIGRATION_TABLE, type AppliedMigration, type MigrationDriver } from './runner.js';

/** Arbitrary constant shared by every Doorward process, so they queue on one advisory lock. */
const LOCK_KEY = 727274;

/** One connection for the whole run: the advisory lock belongs to the session. */
export function postgresDriver(url: string): MigrationDriver {
  const client = new pg.Client({ connectionString: url });
  let connected = false;
  const ready = async () => {
    if (!connected) {
      await client.connect();
      connected = true;
    }
    return client;
  };
  const insert = (migration: MigrationFile) =>
    client.query(
      `INSERT INTO users.${MIGRATION_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migration.checksum],
    );

  return {
    async lock() {
      await (await ready()).query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    },
    async unlock() {
      if (connected) await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    },
    async userTables() {
      const result = await (await ready()).query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'users'`,
      );
      return result.rows.map((row: { table_name: string }) => row.table_name);
    },
    async ensureMigrationTable() {
      await (await ready()).query(`
        CREATE SCHEMA IF NOT EXISTS users;
        CREATE TABLE IF NOT EXISTS users.${MIGRATION_TABLE} (
          version    integer     PRIMARY KEY,
          name       text        NOT NULL,
          checksum   text        NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        );`);
    },
    async applied() {
      const result = await (await ready()).query(
        `SELECT version, name, checksum FROM users.${MIGRATION_TABLE} ORDER BY version`,
      );
      return result.rows as AppliedMigration[];
    },
    async exec(sql) {
      await (await ready()).query(sql);
    },
    async query(sql, params = []) {
      return (await (await ready()).query(sql, params)).rows;
    },
    async atomic(work) {
      await ready();
      await client.query('BEGIN');
      try {
        await work();
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
    async apply(migration) {
      await this.atomic(async () => {
        await client.query(migration.sql);
        await insert(migration);
      });
    },
    async record(migration) {
      await ready();
      await insert(migration);
    },
    async close() {
      if (connected) await client.end();
      connected = false;
    },
  };
}
