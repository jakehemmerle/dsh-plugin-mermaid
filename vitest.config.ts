import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/fence.property.test.ts', 'test/fiber.test.ts'] } },
      {
        test: {
          name: 'browser',
          include: ['test/render.property.test.ts', 'test/e2e.test.ts'],
          globalSetup: ['test/build.setup.ts'],
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
