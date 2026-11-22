import './config/env.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import loadEnv from './config/env.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { pinoOptions } from './logging/pino-options.js';
import { UsersModule } from './users.module.js';

const withDatabase = Boolean(process.env.DATABASE_URL);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [loadEnv],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        pinoOptions({
          level: config.getOrThrow<string>('logLevel'),
          httpRequests: config.getOrThrow<boolean>('logHttpRequests'),
        }),
    }),
    ...(withDatabase ? [DatabaseModule, UsersModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
