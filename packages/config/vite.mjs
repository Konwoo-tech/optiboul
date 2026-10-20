import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En développement, l'application garde une seule origine : Django est relayé par Vite,
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
      // Django sert aussi la connexion allauth, l'admin et ses fichiers statiques.
      proxy: Object.fromEntries(
        ['/api', '/accounts', '/admin', '/static'].map((prefixe) => [prefixe, { target: API }]),
      ),
    },
    preview: { port, strictPort: true },
    build: { outDir: 'dist', sourcemap: true },
    test: { environment: 'jsdom', setupFiles: ['@optiboul/testing/setup'] },
  });
}
