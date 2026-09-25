import { defineConfig } from 'vitest/config';

// "unit" runs anywhere with no emulator. "emulated" needs the Firebase emulators
// (see `npm run test:emulated`, which wraps the run in `firebase emulators:exec`).
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['shared/**/*.test.ts', 'functions/src/**/*.test.ts', 'web/src/**/*.test.ts'] } },
      { test: { name: 'emulated', include: ['rules-tests/**/*.test.ts'], fileParallelism: false, testTimeout: 20000 } },
    ],
  },
});
