import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PRODUCT_NAME } from '@doorward/domain';
import { DataSource } from 'typeorm';
import { schemaVersion } from './infrastructure/database/migrate/startup.js';

const DB_PROBE_TIMEOUT_MS = 2000;
const DB_PROBE_CACHE_MS = 5000;
const log = new Logger('Health');

@Injectable()
export class AppService {
  // The endpoint is public and not rate limited, so one probe at a time plus a 5 s cache caps database load.
  private inflight?: Promise<boolean>;
  private last?: { ok: boolean; at: number };
  // A timed-out query is not cancelled; reuse it so a hung database never holds more than one connection.
  private query?: Promise<unknown>;

  // Optional: the module only wires the database when DATABASE_URL is set.
  constructor(@Optional() @InjectDataSource() private readonly db?: DataSource) {}

  /** Runs `SELECT 1` (at most one per 5 s per process); 503 when it fails or takes longer than 2 s. */
  async getHealth(): Promise<{ status: string; name: string; schemaVersion?: number }> {
    if (this.db) {
      const cached = this.last && Date.now() - this.last.at < DB_PROBE_CACHE_MS ? this.last.ok : undefined;
      const ok =
        cached ??
        (await (this.inflight ??= this.probe(this.db).finally(() => {
          this.inflight = undefined;
        })));
      if (!ok) throw new ServiceUnavailableException({ status: 'unavailable', name: PRODUCT_NAME });
    }
    return { status: 'ok', name: PRODUCT_NAME, schemaVersion: schemaVersion() };
  }

  private async probe(db: DataSource): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    let ok = true;
    try {
      await Promise.race([
        (this.query ??= db.query('SELECT 1').finally(() => {
          this.query = undefined;
        })),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('database probe timed out')), DB_PROBE_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      // Log only the error class name: driver messages can carry connection details.
      log.warn(`Health check: database unavailable (${err instanceof Error ? err.name : 'error'})`);
      ok = false;
    } finally {
      clearTimeout(timer);
    }
    this.last = { ok, at: Date.now() };
    return ok;
  }
}
