import { expect, test } from '@playwright/test';

test("l'application web répond sur ses routes", async ({ page }) => {
  for (const route of ['/', '/connexion', '/comptoir', '/gestion']) {
    await page.goto(route);
    await expect(page).toHaveTitle(/OptiBoul/);
  }
});

test("l'API répond", async ({ request }) => {
  const reponse = await request.get('/api/v1/sante/');
  expect(reponse.ok()).toBeTruthy();
});
