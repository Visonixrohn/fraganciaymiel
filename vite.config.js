import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'pages-assets',
  },
});
