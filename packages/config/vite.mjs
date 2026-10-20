import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En développement, chaque application garde une seule origine : /api est relayé vers Django,
// les cookies de session et le jeton CSRF fonctionnent comme en production.
const API = process.env.OPTIBOUL_API_URL ?? 'http://localhost:8000';

/** @param {{ base: string, port: number }} options */
export function defineOptiboulApp({ base, port }) {
  return defineConfig({
    base,
    plugins: [react()],
    server: {
      port,
      strictPort: true,
      proxy: { '/api': { target: API } },
    },
    preview: { port, strictPort: true },
    build: { outDir: 'dist', sourcemap: true },
    test: { environment: 'jsdom', setupFiles: ['@optiboul/testing/setup'] },
  });
}
