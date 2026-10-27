import type { InstantaneTableauDeBord } from '@/espaces/gestion/tableau-de-bord/types.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installerApiSimulee, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/gestion/tableau-de-bord/';

async function appeler<T = Record<string, unknown>>(
  methode: string,
  adresse: string,
  corps?: object,
) {
  const reponse = await fetch(`http://localhost${adresse}`, {
    method: methode,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await reponse.text();
  return {
    status: reponse.status,
    corps: (texte ? JSON.parse(texte) : {}) as T & { code?: string },
  };
}

const lire = async () => (await appeler<InstantaneTableauDeBord>('GET', RACINE)).corps;

const types = (instantane: InstantaneTableauDeBord) => instantane.alertes.map((a) => a.type);

let retablir: () => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
});
afterEach(() => {
  retablir();
  vi.useRealTimers();
});

describe('faux serveur du tableau de bord : droits', () => {
  it('refuse sans connexion (403)', async () => {
    memoriserUtilisateurConnecte(null);
    const reponse = await appeler('GET', RACINE);
    expect(reponse.status).toBe(403);
    expect(reponse.corps.code).toBe('non_authentifie');
  });

  it('refuse à la caissière, au chef de production et à l’administrateur (403)', async () => {
    for (const id of ['davy', 'rachel', 'serge', 'ignace', 'admin']) {
      memoriserUtilisateurConnecte(id);
      const reponse = await appeler('GET', RACINE);
      expect(reponse.status, id).toBe(403);
      expect(reponse.corps.code, id).toBe('droit_insuffisant');
    }
  });

  it('le gérant et le propriétaire voient la même chose', async () => {
    const gerant = await lire();
    for (const id of ['patrick', 'fotso']) {
      memoriserUtilisateurConnecte(id);
      expect(await lire(), id).toEqual(gerant);
    }
  });

  it('est en lecture seule : aucune écriture, route inconnue (404)', async () => {
    for (const methode of ['POST', 'PUT', 'DELETE']) {
      expect((await appeler(methode, RACINE, {})).status, methode).toBe(404);
    }
    expect((await appeler('GET', `${RACINE}autre/`)).status).toBe(404);
  });
});

describe('faux serveur du tableau de bord : chiffres de la maquette', () => {
  it('additionne la session en cours au cumul du mois', async () => {
    const { recette } = await lire();
    // 4 172 950 + 58 450 encaissés ; 4 337 800 + 58 950 dus (taux 96,2 %).
    expect(recette).toEqual({ encaissee: 4_231_400, due: 4_396_750 });
  });

  it('compte les dettes des clients et ceux qui dépassent le plafond', async () => {
    const { dettesClients } = await lire();
    expect(dettesClients).toEqual({ montant: 14_050, clients: 8, auDessusDuPlafond: 3 });
  });

  it('additionne les factures fournisseurs impayées et compte celles en retard', async () => {
    expect((await lire()).dettesFournisseurs).toEqual({ montant: 2_334_900, facturesEnRetard: 2 });
  });

  it('donne la semaine en cours avec son gérant et son responsable de production', async () => {
    expect((await lire()).semaine).toEqual({
      numero: 42,
      du: '2026-10-12',
      au: '2026-10-18',
      gerant: 'Willy',
      production: 'Serge',
    });
  });

  it('donne quatorze barres : treize nuits passées, puis la session en cours', async () => {
    const { recettesParNuit } = await lire();
    expect(recettesParNuit).toHaveLength(14);
    expect(recettesParNuit[0]).toEqual({ jour: '2026-10-01', montant: 312_400 });
    expect(recettesParNuit[12]).toEqual({ jour: '2026-10-13', montant: 309_800 });
    expect(recettesParNuit[13]).toEqual({ jour: '2026-10-14', montant: 58_450 });
  });

  it('donne la production du mois par produit', async () => {
    const { production } = await lire();
    expect(production.map((p) => p.produit)).toEqual([
      'BAG',
      'KO',
      'GC 135',
      'GC 170',
      'PL',
      'C2',
      'PSL',
    ]);
    expect(production[0]?.pains).toBe(34_120);
  });

  it('classe les alertes comme la maquette : urgentes, puis à voir', async () => {
    const instantane = await lire();
    expect(types(instantane)).toEqual([
      'facture-en-retard',
      'facture-en-retard',
      'clients-au-dela-du-plafond',
      'budget-depasse',
      'manquant-fournisseur',
      'manque-de-caisse',
      'demandes-en-attente',
    ]);
    expect(instantane.alertes.map((a) => a.niveau)).toEqual([
      'bloquant',
      'bloquant',
      'bloquant',
      'bloquant',
      'surveiller',
      'surveiller',
      'surveiller',
    ]);
    expect(instantane.alertes[0]).toMatchObject({ numero: 'FAC-41', montant: 1_405_800 });
    expect(instantane.alertes[3]).toMatchObject({ categorie: 'technique' });
    expect(instantane.alertes[4]).toMatchObject({ commande: 'BC-032', manque: 4 });
    expect(instantane.alertes[5]).toMatchObject({
      jour: '2026-10-12',
      creneau: 'nuit',
      caissiere: 'Davy',
      ecart: -500,
    });
    expect(instantane.alertes[6]).toMatchObject({ nombre: 1 });
  });

  it('chaque alerte ouvre un écran que le gérant et le propriétaire voient', async () => {
    const { alertes } = await lire();
    expect(alertes.map((a) => `${a.destination.espace}/${a.destination.ecran}`)).toEqual([
      'gestion/fournisseurs',
      'gestion/fournisseurs',
      'gestion/clients',
      'gestion/depenses',
      'gestion/fournisseurs',
      'comptoir/caisses',
      'gestion/demandes',
    ]);
    expect(alertes[2]?.destination.parametres).toEqual({ filtre: 'depasse' });
  });
});

describe('faux serveur du tableau de bord : suit les autres écrans', () => {
  it('une livraison à crédit change la recette, les dettes et le graphique', async () => {
    memoriserUtilisateurConnecte('davy');
    const livraison = await appeler('POST', '/api/v1/simulation/comptoir/session/livraisons/', {
      clientId: 'alex',
      quantites: { BAG: 50, KO: 0, GC: 0 },
      mode: 'especes',
      recu: 4000,
      reference: '',
    });
    expect(livraison.status).toBe(200);

    memoriserUtilisateurConnecte('willy');
    const instantane = await lire();
    expect(instantane.recette).toEqual({ encaissee: 4_235_400, due: 4_401_750 });
    expect(instantane.dettesClients).toMatchObject({ montant: 15_050, clients: 9 });
    expect(instantane.recettesParNuit[13]?.montant).toBe(62_450);
  });

  it('une demande de dépense décidée sort de la liste des demandes en attente', async () => {
    memoriserUtilisateurConnecte('fotso');
    const decision = await appeler('POST', '/api/v1/simulation/comptoir/depenses/decision/', {
      demandeId: 'q1',
      accord: true,
    });
    expect(decision.status).toBe(200);

    const instantane = await lire();
    expect(types(instantane)).not.toContain('demandes-en-attente');
    // Le pétrin (65 000) est validé : la catégorie Technique était déjà dépassée, elle le reste.
    expect(types(instantane)).toContain('budget-depasse');
  });

  it('un manque de caisse à la fermeture devient une alerte', async () => {
    memoriserUtilisateurConnecte('davy');
    const fermeture = await appeler('POST', '/api/v1/simulation/caisses/fermer/', { compte: 1 });
    expect(fermeture.status).toBe(204);

    memoriserUtilisateurConnecte('willy');
    const manques = (await lire()).alertes.filter((a) => a.type === 'manque-de-caisse');
    expect(manques).toHaveLength(2);
    expect(manques[1]).toMatchObject({ jour: '2026-10-14', creneau: 'nuit', caissiere: 'Davy' });
  });

  it('une demande en attente se compte avec celles du plafond', async () => {
    memoriserUtilisateurConnecte('davy');
    const demande = await appeler('POST', '/api/v1/simulation/comptoir/session/autorisations/', {
      clientId: 'brice',
      soldeApres: -6200,
    });
    expect(demande.status).toBe(200);

    memoriserUtilisateurConnecte('willy');
    const alerte = (await lire()).alertes.find((a) => a.type === 'demandes-en-attente');
    expect(alerte).toMatchObject({ nombre: 2 });
  });
});
