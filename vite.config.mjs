import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Never map REACT_APP_GEMINI_API_KEY or any other secret into client-side Vite variables.
  // No Vercel Preview fallback to real Firebase: explicit isolated config is required.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
});
