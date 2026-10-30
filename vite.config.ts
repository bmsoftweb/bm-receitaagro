import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: { __VERSAO__: JSON.stringify(JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR === 'true' ? false : { port: 24682 },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
