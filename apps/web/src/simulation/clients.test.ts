import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reinitialiserClients, type ClientSimule, type ListeClientsSimulee } from './clients.ts';
import { installerApiSimulee, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const appeler = (chemin: string, corps?: object) =>
  fetch(`http://localhost${chemin}`, {
    method: corps ? 'POST' : 'GET',
    body: corps ? JSON.stringify(corps) : undefined,
  });

describe('API simulée : clients et dettes', () => {
  let retablir: () => void;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('police')),
    );
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
  });
  afterEach(() => {
    retablir();
    vi.unstubAllGlobals();
    reinitialiserClients();
    memoriserUtilisateurConnecte(null);
  });

  it('exige une connexion', async () => {
    expect((await appeler('/api/v1/simulation/clients/')).status).toBe(403);
  });

  it('refuse l’atelier', async () => {
    memoriserUtilisateurConnecte('serge');
    expect((await appeler('/api/v1/simulation/clients/')).status).toBe(403);
  });

  it('sert les 12 clients de la maquette, plafond de 2 000 FCFA et échéance du dimanche', async () => {
    memoriserUtilisateurConnecte('davy');
    const liste = (await (
      await appeler('/api/v1/simulation/clients/')
    ).json()) as ListeClientsSimulee;
    expect(liste.plafond).toBe(2000);
    expect(liste.echeance).toBe('2026-10-18');
    expect(liste.clients).toHaveLength(12);
    const brice = liste.clients.find((c: ClientSimule) => c.id === 'brice');
    expect(brice).toMatchObject({ solde: -4200, tarifs: { BAG: 100, KO: 75, GC: 165 } });
    // Tous les montants sont des entiers FCFA.
    for (const client of liste.clients) {
      expect(Number.isInteger(client.solde)).toBe(true);
      for (const prix of Object.values(client.tarifs)) expect(Number.isInteger(prix)).toBe(true);
    }
  });

  it('donne l’historique d’un client : livraison du jour, puis deux sessions passées', async () => {
    memoriserUtilisateurConnecte('davy');
    const reponse = await appeler('/api/v1/simulation/clients/white/historique/');
    const lignes = (await reponse.json()) as { bon: number; recu: number }[];
    expect(lignes.map((l) => l.bon)).toEqual([143, 128, 103]);
    expect(lignes[1]!.recu).toBe(9800 - 500);
    expect((await appeler('/api/v1/simulation/clients/inconnu/historique/')).status).toBe(404);
  });

  it('la caissière ne relance pas, le gérant oui (et seuls les clients en dette sont relancés)', async () => {
    memoriserUtilisateurConnecte('davy');
    expect((await appeler('/api/v1/simulation/clients/relancer/', { ids: ['brice'] })).status).toBe(
      403,
    );

    memoriserUtilisateurConnecte('willy');
    const reponse = await appeler('/api/v1/simulation/clients/relancer/', {
      ids: ['brice', 'alex'],
    });
    expect(await reponse.json()).toEqual({ relances: 1 });
    const liste = (await (
      await appeler('/api/v1/simulation/clients/')
    ).json()) as ListeClientsSimulee;
    expect(liste.clients.filter((c) => c.relance).map((c) => c.id)).toEqual(['brice']);
  });
});
