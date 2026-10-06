import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The non-TTY reporter defaults to hiding passing tests' logs; the streaming e2e prints its release-to-diagram latency.
    silent: false,
    projects: [
      { test: { name: 'unit', include: ['test/fence.property.test.ts', 'test/fiber.test.ts'] } },
      {
        test: {
          name: 'browser',
          include: ['test/render.property.test.ts', 'test/e2e.test.ts', 'test/streaming.e2e.test.ts'],
          globalSetup: ['test/build.setup.ts'],
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
