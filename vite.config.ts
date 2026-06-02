import { defineConfig } from 'vite';

// base: './' — относительные пути в сборке, чтобы Electron мог грузить index.html
// через file:// (абсолютные '/assets/...' там не работают).
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
});
