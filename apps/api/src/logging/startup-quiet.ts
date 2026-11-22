import type { LoggerService } from '@nestjs/common';

/**
 * Hides info/debug/verbose output until ready() is called, so LOG_STARTUP=false drops the boot
 * chatter (module init, routes) but still shows warnings and errors that happen while starting.
 */
export function quietUntilReady(inner: LoggerService): LoggerService & { ready(): void } {
  let starting = true;
  return {
    log: (...args: [unknown, ...unknown[]]) => {
      if (!starting) inner.log(...args);
    },
    debug: (...args: [unknown, ...unknown[]]) => {
      if (!starting) inner.debug?.(...args);
    },
    verbose: (...args: [unknown, ...unknown[]]) => {
      if (!starting) inner.verbose?.(...args);
    },
    warn: (...args: [unknown, ...unknown[]]) => inner.warn(...args),
    error: (...args: [unknown, ...unknown[]]) => inner.error(...args),
    fatal: (...args: [unknown, ...unknown[]]) => inner.fatal?.(...args),
    ready: () => {
      starting = false;
    },
  };
}
