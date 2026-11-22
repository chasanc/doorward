/**
 * Runs a shutdown step but gives up after `ms`, so an unreachable collector cannot hold the process
 * past the platform's stop grace period (Docker and ECS wait 10 s before SIGKILL). Never rejects.
 */
export async function boundedShutdown(shutdown: () => Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([shutdown().catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
