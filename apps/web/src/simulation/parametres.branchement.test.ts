import { beforeEach, describe, expect, it } from 'vitest';

import { ligneHorsTolerance } from '@/espaces/atelier/stocks/regles.ts';

import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

/* Les faux serveurs lisent leurs seuils dans `parametres.ts` : une modification du propriétaire
 * se voit partout, et la réinitialisation les remet à leur défaut. */

async function lire(chemin: string) {
  const reponse = repondre(new URL(`http://x/api/v1/simulation/${chemin}`), 'GET', {});
  return { statut: reponse.status, json: (await reponse.json()) as any };
}

async function regler(cle: string, valeur: number) {
  memoriserUtilisateurConnecte('fotso');
  const reponse = repondre(
    new URL(`http://x/api/v1/simulation/gestion/parametres/${cle}/`),
    'PUT',
    { valeur },
  );
  expect(reponse.status).toBe(200);
}

beforeEach(() => {
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('fotso');
});

describe('faux serveurs branchés sur les paramètres', () => {
  it('le plafond de dette suit le paramètre (clients, comptoir, tableau de bord)', async () => {
    expect((await lire('clients/')).json.plafond).toBe(2_000);
    await regler('plafond_dette_client', 3_500);
    expect((await lire('clients/')).json.plafond).toBe(3_500);
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('fotso');
    expect((await lire('clients/')).json.plafond).toBe(2_000);
  });

  it('le plafond d’espèces suit le paramètre (caisses)', async () => {
    const avant = (await lire('caisses/')).json;
    expect(avant.plafond).toBe(100_000);
    await regler('plafond_especes', 150_000);
    expect((await lire('caisses/')).json.plafond).toBe(150_000);
  });

  it('le seuil de validation des dépenses suit le paramètre', async () => {
    expect((await lire('comptoir/depenses/')).json.seuil).toBe(50_000);
    await regler('seuil_validation_depenses', 80_000);
    expect((await lire('comptoir/depenses/')).json.seuil).toBe(80_000);
  });

  it('la tolérance d’inventaire suit le paramètre (règle partagée)', () => {
    const ligne = { theorique: 100, compte: 93 };
    expect(ligneHorsTolerance(ligne)).toBe(true);
    expect(ligneHorsTolerance(ligne, 10)).toBe(false);
  });
});
