import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.js'],
    fileParallelism: false, // tests share one real Postgres database
    testTimeout: 30000,
    env: { NODE_ENV: 'test', BCRYPT_ROUNDS: '4' },
  },
});
