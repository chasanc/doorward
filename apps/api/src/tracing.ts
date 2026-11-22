// Must be the first import in main.ts: the instrumentations patch http, express, pg and grpc as they load.
// Off unless an OTLP endpoint is configured, and then the SDK is not even loaded.
import './config/env.js';
import { boundedShutdown } from './logging/bounded-shutdown.js';
import { httpTraceOptions } from './logging/http-trace-options.js';

const endpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();

if (endpoint && process.env.OTEL_SDK_DISABLED !== 'true') {
  process.env.OTEL_SERVICE_NAME ??= 'doorward-api';
  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { ExpressInstrumentation }, { NestInstrumentation }, { PgInstrumentation }, { GrpcInstrumentation }] =
    await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/instrumentation-http'),
      import('@opentelemetry/instrumentation-express'),
      import('@opentelemetry/instrumentation-nestjs-core'),
      import('@opentelemetry/instrumentation-pg'),
      import('@opentelemetry/instrumentation-grpc'),
    ]);
  const sdk = new NodeSDK({
    // Endpoint, headers and timeout come from the standard OTEL_EXPORTER_OTLP_* variables.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation(httpTraceOptions),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new PgInstrumentation(),
      new GrpcInstrumentation(),
    ],
  });
  sdk.start();
  // Flush buffered spans on shutdown, then let the default SIGTERM behaviour end the process.
  // Bounded: with the collector down the flush would otherwise run into the platform's SIGKILL.
  process.once('SIGTERM', () => {
    void boundedShutdown(() => sdk.shutdown(), 3000).then(() => process.kill(process.pid, 'SIGTERM'));
  });
}
