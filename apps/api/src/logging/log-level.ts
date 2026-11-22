const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

/** pino throws on an unknown level deep inside module init, so check it up front with a message that names the variable. */
export function parseLogLevel(value: string | undefined): string {
  const level = (value ?? '').trim().toLowerCase();
  if ((LEVELS as readonly string[]).includes(level)) return level;
  throw new Error(`LOG_LEVEL must be one of ${LEVELS.join(', ')}, got ${JSON.stringify(value)}`);
}
