import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DatabaseKind } from '@doorward/domain';
import { typeOrmEntities } from './entities/index.js';

export function createTypeOrmOptions(params: {
  kind: DatabaseKind;
  url: string;
  poolMax?: number;
  connectTimeoutMs?: number;
  ssl?: boolean;
}): TypeOrmModuleOptions {
  if (!params.url) {
    throw new Error('DATABASE_URL is required');
  }

  const base = {
    url: params.url,
    entities: [...typeOrmEntities],
    synchronize: false,
    migrationsRun: false,
  };

  if (params.kind === 'mssql') {
    return {
      ...base,
      type: 'mssql',
      pool: { max: params.poolMax },
      // shortcut: trustServerCertificate skips CA checks until a CA path is configured.
      extra: { options: { encrypt: params.ssl === true, trustServerCertificate: true } },
    };
  }
  // node-postgres waits forever for a free connection unless this timeout is set.
  return {
    ...base,
    type: 'postgres',
    poolSize: params.poolMax,
    connectTimeoutMS: params.connectTimeoutMs,
    // shortcut: rejectUnauthorized false encrypts without verifying the server certificate.
    ...(params.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}
