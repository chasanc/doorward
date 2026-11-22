import './tracing.js';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { ServerCredentials } from '@grpc/grpc-js';
import { AppModule } from './app.module.js';
import { createRateLimitMiddleware } from './http/rate-limit.middleware.js';
import { mountOidc } from './infrastructure/oidc/mount-oidc.js';
import { quietUntilReady } from './logging/startup-quiet.js';

const withDatabase = Boolean(process.env.DATABASE_URL);

const protoPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../packages/proto/doorward.proto',
);

function grpcTls(config: ConfigService): ServerCredentials {
  if (!config.getOrThrow<boolean>('grpcTls')) {
    return ServerCredentials.createInsecure();
  }
  const certPath = config.getOrThrow<string>('grpcTlsCert');
  const keyPath = config.getOrThrow<string>('grpcTlsKey');
  const caPath = config.getOrThrow<string>('grpcTlsCa');
  const rootCerts = caPath ? readFileSync(caPath) : null;
  return ServerCredentials.createSsl(
    rootCerts,
    [{ cert_chain: readFileSync(certPath), private_key: readFileSync(keyPath) }],
    config.getOrThrow<boolean>('grpcTlsRequireClientCert'),
  );
}

async function bootstrap() {
  // Buffer until the pino logger below is installed, so boot messages are not printed in Nest's format.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const pino = app.get(Logger);
  const quiet = config.getOrThrow<boolean>('logStartup') ? undefined : quietUntilReady(pino);
  app.useLogger(quiet ?? pino);

  const httpHost = config.getOrThrow<string>('httpHost');
  const httpPort = config.getOrThrow<number>('httpPort');
  const grpcPort = config.getOrThrow<number>('grpcPort');
  const corsOrigin = config.getOrThrow<string>('corsOrigin');

  // Without this, req.ip is the proxy address and every client shares one rate-limit bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', config.getOrThrow('trustProxy'));
  // Before the body parsers and the global rate limiter below: the provider reads its own bodies.
  if (withDatabase) mountOidc(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.use(
    createRateLimitMiddleware({
      enabled: config.getOrThrow<boolean>('rateLimitEnabled'),
      max: config.getOrThrow<number>('rateLimitMax'),
      windowSeconds: config.getOrThrow<number>('rateLimitWindowSeconds'),
    }),
  );
  app.enableCors({ origin: corsOrigin, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Doorward')
    .setDescription('REST admin API. Same application services as gRPC doorward.v1.')
    .setVersion('0.0.1')
    .addCookieAuth('doorward_token')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { useGlobalPrefix: true },
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'doorward.v1',
      // One package, eight services; Nest registers every service the controller handles.
      protoPath,
      url: `${httpHost}:${grpcPort}`,
      credentials: grpcTls(config),
    },
  });

  await app.startAllMicroservices();
  await app.listen(httpPort, httpHost);
  // LOG_STARTUP=false keeps boot chatter out; once listening, normal info logs flow again.
  quiet?.ready();
}

await bootstrap();
