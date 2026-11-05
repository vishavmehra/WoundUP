import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that file loads the IWSDK dev plugin
// (managed browser + dev server), which must not start during unit tests.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
