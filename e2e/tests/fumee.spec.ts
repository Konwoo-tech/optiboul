import { expect, test } from '@playwright/test';

test('chaque application web répond sous son préfixe', async ({ page }) => {
  for (const prefixe of ['/', '/comptoir/', '/atelier/', '/gestion/']) {
    await page.goto(prefixe);
    await expect(page).toHaveTitle(/OptiBoul/);
  }
});

test("l'API répond", async ({ request }) => {
  const reponse = await request.get('/api/v1/sante/');
  expect(reponse.ok()).toBeTruthy();
});
