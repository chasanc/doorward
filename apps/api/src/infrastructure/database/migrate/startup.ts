import type { DatabaseKind } from '@doorward/domain';
import { loadMigrations } from './files.js';
import { migrate, status } from './runner.js';
import { adminFromEnv, seed } from './seed.js';
import { createDriver, migrationsDir, seedSql } from './setup.js';

let known: number | undefined;

/** Schema version found at startup, for /api/health. Undefined before the check ran (or without a database). */
export function schemaVersion(): number | undefined {
  return known;
}

/**
 * Startup gate. With `autoMigrate` it brings the database up to date; otherwise it refuses to continue when
 * the database is behind or ahead of the bundled migrations, so the API never runs against a schema it does not match.
 */
export async function ensureSchema(options: {
  kind: DatabaseKind;
  url: string;
  autoMigrate: boolean;
  /** Also create the default data and first admin (see `seed`). Needs DOORWARD_ADMIN_PASSWORD in production. */
  autoSeed: boolean;
  log?: (message: string) => void;
}): Promise<number> {
  const files = loadMigrations(migrationsDir(options.kind));
  const driver = createDriver(options.kind, options.url);
  try {
    const result = options.autoMigrate
      ? await migrate(driver, files, options.log)
      : await status(driver, files);
    const current = result.applied.at(-1)?.version ?? 0;
    const wanted = files.at(-1)?.version ?? 0;
    if (result.unknown.length > 0) {
      throw new Error(
        `The database is at schema version ${current}, newer than this build (${wanted}). Run a newer version of Doorward.`,
      );
    }
    if (result.pending.length > 0) {
      throw new Error(
        `The database is at schema version ${current}, this build needs ${wanted}. ` +
          `Run \`pnpm db:migrate\` (or start the API with AUTO_MIGRATE=true).`,
      );
    }
    if (options.autoSeed) {
      await seed(driver, options.kind, seedSql(options.kind), adminFromEnv(process.env), options.log);
    }
    known = current;
    return current;
  } finally {
    await driver.close();
  }
}
