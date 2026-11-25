import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/staging/r139-transactions.emulator.test.js'],
    passWithNoTests: false
  }
});
