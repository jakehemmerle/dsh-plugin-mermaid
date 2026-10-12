import { defineConfig } from 'vitest/config';

const slow = { testTimeout: 3_600_000, hookTimeout: 180_000 };

export default defineConfig({
  test: {
    // The non-TTY reporter defaults to hiding passing tests' logs; seeds and latencies are printed there.
    silent: false,
    projects: [
      { test: { name: 'unit', include: ['test/fence.property.test.ts', 'test/fiber.test.ts'] } },
      { test: { name: 'contract', include: ['test/contract/*.test.ts'] } },
      {
        test: {
          name: 'browser',
          include: ['test/render.property.test.ts', 'test/client.dispose.test.ts'],
          globalSetup: ['test/build.setup.ts'],
          ...slow,
        },
      },
      {
        test: {
          name: 'web',
          include: ['test/web/*.test.ts', 'test/streaming.e2e.test.ts'],
          globalSetup: ['test/build.setup.ts'],
          fileParallelism: false,
          ...slow,
        },
      },
      { test: { name: 'tui', include: ['test/tui/*.test.ts'], fileParallelism: false, ...slow } },
    ],
  },
});
