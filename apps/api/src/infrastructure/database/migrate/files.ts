import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationFile {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

const FILE_NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Hash of the file with LF line endings, so a Windows checkout (CRLF) matches a Linux one. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/** Reads `NNNN_name.sql` files from a folder, in version order. Versions must run 1, 2, 3 with no gap. */
export function loadMigrations(dir: string): MigrationFile[] {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const migrations = files.map((file) => {
    const match = FILE_NAME.exec(file);
    if (!match) {
      throw new Error(`Migration file ${file} in ${dir} must be named NNNN_snake_case.sql`);
    }
    const sql = readFileSync(join(dir, file), 'utf8');
    return { version: Number(match[1]), name: match[2], checksum: checksumOf(sql), sql };
  });
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migrations in ${dir} must be numbered 0001, 0002, ... without gaps or repeats; ` +
          `expected ${String(index + 1).padStart(4, '0')} but found ${String(migration.version).padStart(4, '0')}_${migration.name}.sql`,
      );
    }
  });
  return migrations;
}
