import { afterEach, expect, it, vi } from 'vitest';
import { boundedShutdown } from './bounded-shutdown.js';

afterEach(() => vi.useRealTimers());

it('returns as soon as the shutdown finishes', async () => {
  vi.useFakeTimers();
  const shutdown = vi.fn().mockResolvedValue(undefined);
  await boundedShutdown(shutdown, 3000);
  expect(shutdown).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0); // the timeout timer is cleared
});

it('gives up after the limit when the shutdown never finishes', async () => {
  vi.useFakeTimers();
  let done = false;
  const pending = boundedShutdown(() => new Promise(() => undefined), 3000).then(() => (done = true));
  await vi.advanceTimersByTimeAsync(2999);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(done).toBe(true);
});

it('does not reject when the shutdown fails', async () => {
  await expect(boundedShutdown(() => Promise.reject(new Error('collector down')), 3000)).resolves.toBeUndefined();
});
