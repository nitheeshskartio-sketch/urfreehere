import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Stamps the service worker with a build ID, so every deploy gets a fresh cache. */
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      writeFileSync(file, readFileSync(file, 'utf8').replace("'__BUILD__'", `'${Date.now().toString(36)}'`));
    },
  };
}
import react from '@vitejs/plugin-react';

const signalingTarget = process.env.SIGNALING_DEV_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  // Read VITE_* settings from the project-root .env shared with the server.
  envDir: '..',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: signalingTarget, ws: true, changeOrigin: true },
      '/api': { target: signalingTarget, changeOrigin: true },
    },
  },
  build: {
    target: 'es2021',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
});
