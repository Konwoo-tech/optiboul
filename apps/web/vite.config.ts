import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// En développement, l'application garde une seule origine : Django est relayé par Vite,
// les cookies de session et le jeton CSRF fonctionnent comme en production.
const API = process.env.OPTIBOUL_API_URL ?? 'http://localhost:8000';
// Le comptoir se connecte depuis un poste de confiance (cookie HttpOnly `optiboul_poste`, O1) : le
// navigateur de développement n'en a pas. Si cette variable est définie, le proxy l'ajoute aux
// requêtes vers l'API, sans toucher aux cookies de session du navigateur.
const COOKIE_POSTE = process.env.OPTIBOUL_POSTE_COOKIE;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Django sert aussi la connexion allauth, l'admin et ses fichiers statiques.
    proxy: Object.fromEntries(
      ['/api', '/accounts', '/admin', '/static'].map((prefixe) => [
        prefixe,
        {
          target: API,
          configure: (proxy: {
            on: (
              evenement: 'proxyReq',
              ecouteur: (requete: {
                getHeader: (nom: string) => unknown;
                setHeader: (nom: string, valeur: string) => void;
              }) => void,
            ) => void;
          }) => {
            if (!COOKIE_POSTE) return;
            proxy.on('proxyReq', (requete) => {
              const existants = requete.getHeader('cookie');
              requete.setHeader(
                'cookie',
                [typeof existants === 'string' ? existants : '', `optiboul_poste=${COOKIE_POSTE}`]
                  .filter(Boolean)
                  .join('; '),
              );
            });
          },
        },
      ]),
    ),
  },
  preview: { port: 5173, strictPort: true },
  // Pas de cartes sources dans le paquet servi : elles contiendraient tout le code source en clair
  // (y compris, en mode simulation, comptes et codes de démonstration).
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
