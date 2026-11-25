import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const signalingTarget = process.env.SIGNALING_DEV_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
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
