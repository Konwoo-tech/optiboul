import { defineConfig, devices } from '@playwright/test';

// URL de l'environnement complet (Traefik devant Django et le conteneur web).
const baseURL = process.env.OPTIBOUL_E2E_URL ?? 'https://optiboul.local';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, ignoreHTTPSErrors: true, trace: 'retain-on-failure', locale: 'fr-FR' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
