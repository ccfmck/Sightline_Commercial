import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Sightline_Commercial/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
}));
