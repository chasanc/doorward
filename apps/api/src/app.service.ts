import { Injectable } from '@nestjs/common';
import { PRODUCT_NAME } from '@doorward/domain';
import { schemaVersion } from './infrastructure/database/migrate/startup.js';

@Injectable()
export class AppService {
  /** Process is up. `schemaVersion` is what startup saw; this call does not touch the database. */
  getHealth(): { status: string; name: string; schemaVersion?: number } {
    return { status: 'ok', name: PRODUCT_NAME, schemaVersion: schemaVersion() };
  }
}
