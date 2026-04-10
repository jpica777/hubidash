import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  define: {
    // Expose HUBITAT_MODE to client as a build-time constant for the mode badge.
    // Falls back to 'local' at runtime if not set during build.
    'import.meta.env.VITE_HUBITAT_MODE': JSON.stringify(process.env.HUBITAT_MODE ?? 'local'),
  },
});
