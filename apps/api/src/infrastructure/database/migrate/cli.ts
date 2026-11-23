import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDatabaseKind } from '@doorward/domain';
import { apiEnv } from '../../../config/load-env.js';
import { loadMigrations } from './files.js';
import { migrate, status } from './runner.js';
import { adminFromEnv, seed } from './seed.js';
import { createDriver, migrationsDir, seedSql } from './setup.js';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'status' && command !== 'seed') {
    throw new Error('Usage: migrate | status | seed');
  }
  // A variable set in the shell wins over the .env files (loading them overwrites process.env), so a one-off
  // run can target another database or admin password without editing .env.
  const shell = { ...process.env };
  const env = apiEnv();
  const kind = parseDatabaseKind(shell.DATABASE_KIND ?? env.DATABASE_KIND);
  const files = loadMigrations(migrationsDir(kind));
  const driver = createDriver(kind, shell.DATABASE_URL ?? env.DATABASE_URL);
  try {
    if (command === 'seed') {
      await seed(driver, kind, seedSql(kind), adminFromEnv({ ...env, ...shell }), (line) => console.log(line));
    } else if (command === 'migrate') {
      const result = await migrate(driver, files, (line) => console.log(line));
      console.log(`database is at version ${result.applied.at(-1)?.version ?? 0}`);
    } else {
      const result = await status(driver, files);
      console.log(`state: ${result.state}`);
      for (const row of result.applied) console.log(`applied  ${String(row.version).padStart(4, '0')} ${row.name}`);
      for (const file of result.pending) console.log(`pending  ${String(file.version).padStart(4, '0')} ${file.name}`);
      for (const row of result.unknown) console.log(`unknown  ${String(row.version).padStart(4, '0')} ${row.name}`);
      if (result.pending.length > 0 || result.unknown.length > 0) process.exitCode = 1;
    }
  } finally {
    await driver.close();
  }
}

// Run only when started as a script, not when imported by the API or a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
