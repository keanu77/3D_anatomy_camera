import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => ({
  root: resolve('src'),
  publicDir: resolve('public'),
  base: process.env.BASE_PATH || '/',
  plugins: command === 'serve' ? [basicSsl()] : [],
  server: { host: true, strictPort: true },
  worker: { format: 'iife', rollupOptions: { output: { codeSplitting: false } } },
  build: {
    outDir: resolve('dist'), emptyOutDir: true, sourcemap: false,
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three';
      if (id.includes('/node_modules/@mediapipe/tasks-vision/')) return 'vision';
    } } },
  },
}));
