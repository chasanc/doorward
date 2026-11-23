import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseKind } from '@doorward/domain';
import { findRepoRoot } from '../../../config/load-env.js';
import { mssqlDriver } from './mssql-driver.js';
import { postgresDriver } from './postgres-driver.js';
import type { MigrationDriver } from './runner.js';

export function createDriver(kind: DatabaseKind, url: string): MigrationDriver {
  return kind === 'mssql' ? mssqlDriver(url) : postgresDriver(url);
}

export function seedSql(kind: DatabaseKind): string {
  const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  return readFileSync(resolve(root, 'db', kind, 'seed', 'default.sql'), 'utf8');
}

/** `db/<kind>/migrations` at the repo root (the Docker image keeps the same layout under /app). */
export function migrationsDir(kind: DatabaseKind): string {
  const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  return resolve(root, 'db', kind, 'migrations');
}
