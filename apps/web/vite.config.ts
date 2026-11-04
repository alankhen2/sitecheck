import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Request ke /api/* diteruskan ke Fastify, jadi tidak perlu CORS saat development.
    // `vite preview` memakai proxy yang sama. Tes Playwright mengarahkannya ke API-nya sendiri.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
