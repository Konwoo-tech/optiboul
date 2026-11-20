import { expect, test, type Page } from '@playwright/test';

// US-056 : une livraison encaissée au clavier seul, sur le vrai serveur.
// Prérequis : un poste de confiance (cookie `optiboul_poste`) et un compte caissier. Le parcours
// n'a pas besoin de souris ; seuls les chiffres du code sont cliqués sur le pavé de connexion.
//   OPTIBOUL_E2E_CAISSIER = nom affiché sur la carte du compte (ex. « Davy »)
//   OPTIBOUL_E2E_CODE     = code à 4 chiffres de ce compte
const NOM = process.env.OPTIBOUL_E2E_CAISSIER;
const CODE = process.env.OPTIBOUL_E2E_CODE;

test.skip(!NOM || !CODE, 'OPTIBOUL_E2E_CAISSIER et OPTIBOUL_E2E_CODE sont requis');

async function seConnecter(page: Page) {
  await page.goto('/connexion');
  await page
    .getByRole('button', { name: new RegExp(NOM!) })
    .first()
    .click();
  for (const chiffre of CODE!) {
    await page.getByRole('button', { name: chiffre, exact: true }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'));
}

const focus = (page: Page) =>
  page.evaluate(() => {
    const e = document.activeElement;
    return e
      ? `${e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? e.textContent}`
      : '';
  });

test('encaisser une livraison au clavier : F2, Entrée, Tab, F4, F8, Échap', async ({ page }) => {
  await seConnecter(page);
  await page.goto('/comptoir/session');

  // La session du jour s'ouvre au clavier si elle ne l'est pas encore.
  const ouvrir = page.getByRole('button', { name: /Ouvrir la session de jour/ });
  if (await ouvrir.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ouvrir.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByText(/Session de jour · ouverte/)).toBeVisible();

  // F2 : nouvelle livraison, le curseur est dans la recherche du client.
  await page.keyboard.press('F2');
  await expect.poll(() => focus(page)).toMatch(/Rechercher un client/);
  await page.keyboard.type('Ala');
  // Entrée : le client est choisi, le curseur passe aux pains.
  await page.keyboard.press('Enter');
  await expect.poll(() => focus(page)).toMatch(/BAG/);
  await page.keyboard.type('2');
  // Tab : champs suivants puis mode de paiement.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab');
  await expect.poll(() => focus(page)).toMatch(/Espèces/);
  await page.keyboard.press('Enter');

  // F4 : encaisser, la livraison est enregistrée.
  const enregistrement = page.waitForResponse(
    (r) => r.url().includes('/api/v1/livraisons/') && r.request().method() === 'POST',
  );
  await page.keyboard.press('F4');
  expect((await enregistrement).status()).toBe(201);

  // F8 : bon de livraison, Échap : fermeture.
  await page.keyboard.press('F8');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
