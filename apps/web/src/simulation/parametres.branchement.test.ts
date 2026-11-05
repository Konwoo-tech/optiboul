import { beforeEach, describe, expect, it } from 'vitest';

import { ligneHorsTolerance } from '@/espaces/atelier/stocks/regles.ts';

import { reinitialiserSimulation, repondre } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

/* Les faux serveurs lisent leurs seuils dans `parametres.ts` : une modification du propriétaire
 * se voit partout, et la réinitialisation les remet à leur défaut. */

async function appeler(methode: string, chemin: string, corps: Record<string, unknown> = {}) {
  const reponse = repondre(new URL(`http://x/api/v1/simulation/${chemin}`), methode, corps);
  const texte = await reponse.text();
  return { statut: reponse.status, json: (texte ? JSON.parse(texte) : {}) as any };
}

const lire = (chemin: string) => appeler('GET', chemin);

/** Le propriétaire règle un paramètre, puis on revient à la personne qui agissait. */
async function reglerPuisRevenir(cle: string, valeur: number, id: string) {
  await regler(cle, valeur);
  memoriserUtilisateurConnecte(id);
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

  it('l’écran Session affiche le plafond en vigueur, pas celui du démarrage', async () => {
    memoriserUtilisateurConnecte('davy');
    expect((await lire('comptoir/session/')).json.plafond).toBe(2_000);
    await reglerPuisRevenir('plafond_dette_client', 4_000, 'davy');
    expect((await lire('comptoir/session/')).json.plafond).toBe(4_000);
  });

  it('le tableau de bord suit le plafond de dette', async () => {
    memoriserUtilisateurConnecte('willy');
    const avant = JSON.stringify((await lire('gestion/tableau-de-bord/')).json);
    expect(avant).toContain('"plafond":2000');
    await reglerPuisRevenir('plafond_dette_client', 4_000, 'willy');
    const apres = JSON.stringify((await lire('gestion/tableau-de-bord/')).json);
    expect(apres).toContain('"plafond":4000');
    expect(apres).not.toContain('"plafond":2000');
  });

  it('une dépense au seuil modifié passe en attente de validation', async () => {
    memoriserUtilisateurConnecte('davy');
    const saisie = {
      categorie: 'technique',
      libelle: 'Joint de porte',
      montant: 60_000,
      mode: 'caisse',
      photo: true,
      rattachement: 'semaine',
    };
    expect((await appeler('POST', 'comptoir/depenses/', saisie)).json.depense.statut).toBe(
      'en-attente',
    );
    reinitialiserSimulation();
    await reglerPuisRevenir('seuil_validation_depenses', 80_000, 'davy');
    expect((await lire('comptoir/depenses/')).json.seuil).toBe(80_000);
    expect((await appeler('POST', 'comptoir/depenses/', saisie)).json.depense.statut).toBe(
      'validee',
    );
  });

  it('la production annonce le seuil d’écart matière modifié', async () => {
    memoriserUtilisateurConnecte('serge');
    expect((await lire('atelier/production/')).json.seuilEcartKg).toBe(2);
    await reglerPuisRevenir('ecart_matiere_kg_par_sac', 3, 'serge');
    expect((await lire('atelier/production/')).json.seuilEcartKg).toBe(3);
  });

  it('un inventaire est jugé avec la tolérance en vigueur', async () => {
    const comptages = {
      farine: 28.4,
      sel: 14.4,
      levure: 2.7,
      ameliorant: 7.2,
      glace: 118,
      bois: 4,
      huile: 20,
    };
    memoriserUtilisateurConnecte('willy');
    expect(
      (await appeler('POST', 'atelier/stocks/inventaires/', { comptages })).json.inventaire.statut,
    ).toBe('a-valider');
    reinitialiserSimulation();
    await reglerPuisRevenir('tolerance_inventaire', 10, 'willy');
    expect(
      (await appeler('POST', 'atelier/stocks/inventaires/', { comptages })).json.inventaire.statut,
    ).toBe('valide');
  });

  it('la caisse s’ouvre avec le fonds du paramètre quand aucun fonds n’est compté', async () => {
    memoriserUtilisateurConnecte('davy');
    await appeler('POST', 'caisses/fermer/', { compte: 22_450 });
    await reglerPuisRevenir('fonds_caisse', 25_000, 'davy');
    expect((await appeler('POST', 'caisses/ouvrir/', {})).statut).toBe(204);
    const sessions = (await lire('caisses/')).json.sessions;
    expect(sessions.at(-1)).toMatchObject({ enCours: true, fonds: 25_000 });
  });

  it('la tolérance d’inventaire suit le paramètre (règle partagée)', () => {
    const ligne = { theorique: 100, compte: 93 };
    expect(ligneHorsTolerance(ligne)).toBe(true);
    expect(ligneHorsTolerance(ligne, 10)).toBe(false);
  });
});
