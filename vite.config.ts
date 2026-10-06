import { defineConfig } from 'vite';

export default defineConfig({
  base: '/apdl-dojo/',
  optimizeDeps: { exclude: ['manifold-3d'] },
  worker: { format: 'es' },
  assetsInclude: ['**/*.wasm'],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
