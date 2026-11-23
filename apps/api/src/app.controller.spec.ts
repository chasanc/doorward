import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

const controller = (query: () => Promise<unknown>) =>
  new AppController(new AppService({ query } as never));

describe('AppController', () => {
  describe('health', () => {
    it('should report ok when the database answers', async () => {
      await expect(controller(async () => [{ '?column?': 1 }]).getHealth()).resolves.toMatchObject({
        status: 'ok',
        name: 'Doorward',
      });
    });

    it('should report ok without a database configured', async () => {
      await expect(new AppController(new AppService()).getHealth()).resolves.toMatchObject({ status: 'ok' });
    });

    it('should answer 503 without the error text when the query fails', async () => {
      const failing = controller(async () => {
        throw new Error('connect ECONNREFUSED secret-host:5432');
      });
      const err = await failing.getHealth().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getStatus()).toBe(503);
      expect(JSON.stringify((err as ServiceUnavailableException).getResponse())).not.toContain('secret-host');
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ status: 'unavailable', name: 'Doorward' });
    });
  });

  describe('health load bound', () => {
    afterEach(() => vi.useRealTimers());

    it('runs one query for 50 concurrent calls', async () => {
      const query = vi.fn(async () => [1]);
      const c = controller(query);
      await Promise.all(Array.from({ length: 50 }, () => c.getHealth()));
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('answers from cache within the TTL and queries again after it', async () => {
      vi.useFakeTimers();
      const query = vi.fn(async () => [1]);
      const c = controller(query);
      await c.getHealth();
      vi.advanceTimersByTime(4000);
      await c.getHealth();
      expect(query).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1500);
      await c.getHealth();
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('keeps answering 503 from cache within the TTL', async () => {
      vi.useFakeTimers();
      const query = vi.fn(async () => {
        throw new Error('down');
      });
      const c = controller(query);
      await expect(c.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
      vi.advanceTimersByTime(4000);
      await expect(c.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('reuses a hung query instead of opening another after the TTL', async () => {
      vi.useFakeTimers();
      const query = vi.fn(() => new Promise(() => {}));
      const c = controller(query);
      const first = expect(c.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await vi.advanceTimersByTimeAsync(2000);
      await first;
      vi.advanceTimersByTime(6000);
      const second = expect(c.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await vi.advanceTimersByTimeAsync(2000);
      await second;
      expect(query).toHaveBeenCalledTimes(1);
    });
  });
});
