import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Served by Laravel at /command (built into api/public/command inside the Docker image; not committed).
// `npm run dev -w command` proxies the API to the Laravel server on :8000.
const laravel = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  base: '/command/',
  build: { outDir: '../api/public/command', emptyOutDir: true },
  server: {
    proxy: { '/api': laravel, '/sanctum': laravel, '/command/session': laravel, '/broadcasting': laravel },
  },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.tsx'] },
});
