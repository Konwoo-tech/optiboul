import type { Demande, ReponseDemandes } from '@/espaces/comptoir/demandes/types.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { journalComptoir } from './comptoir.ts';
import { journalDemandes } from './demandes.ts';
import { installerApiSimulee, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

type Resultat<T> = { status: number; corps: T & { code?: string } };

async function appeler<T>(methode: 'GET' | 'POST', chemin: string, corps?: object) {
  const reponse = await fetch(`http://localhost${chemin}`, {
    method: methode,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return { status: reponse.status, corps: await reponse.json() } as Resultat<T>;
}

const lister = () => appeler<ReponseDemandes>('GET', '/api/v1/simulation/demandes/');
const decider = (id: string, accord: boolean) =>
  appeler<{ demande: Demande }>('POST', `/api/v1/simulation/demandes/${id}/decider/`, { accord });

/** Brice doit 4 200 FCFA : 30 BAG à crédit le mettent bien au-delà du plafond. */
const demanderLAutorisationDeBrice = () =>
  appeler('POST', '/api/v1/simulation/comptoir/session/autorisations/', {
    clientId: 'brice',
    soldeApres: -7200,
  });

describe('API simulée des demandes', () => {
  let retablir: () => void;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('davy');
  });
  afterEach(() => {
    retablir();
    vi.unstubAllGlobals();
  });

  describe('qui peut lire', () => {
    it('exige d’être connecté, et un profil du comptoir ou de la direction', async () => {
      memoriserUtilisateurConnecte(null);
      expect((await lister()).status).toBe(403);
      memoriserUtilisateurConnecte('serge'); // chef de production
      expect((await lister()).status).toBe(403);
      memoriserUtilisateurConnecte('admin');
      expect((await lister()).status).toBe(403);
    });

    it('démarre comme la maquette : une dépense de Willy en attente, DEM-021', async () => {
      memoriserUtilisateurConnecte('willy');
      const { status, corps } = await lister();
      expect(status).toBe(200);
      expect(corps.gerant).toBe('Willy');
      expect(corps.demandes).toHaveLength(1);
      expect(corps.demandes[0]).toMatchObject({
        id: 'q1',
        numero: 21,
        type: 'depense',
        par: 'Willy',
        parProfil: 'gerant',
        statut: 'en-attente',
      });
    });

    it('la caissière ne reçoit que ses demandes', async () => {
      expect((await lister()).corps.demandes).toEqual([]);
      memoriserUtilisateurConnecte('fotso');
      expect((await lister()).corps.demandes).toHaveLength(1);
    });
  });

  describe('qui peut décider', () => {
    it('la caissière ne décide rien : 403, et rien ne change', async () => {
      memoriserUtilisateurConnecte('willy');
      // Elle ne voit pas la dépense de Willy : introuvable pour elle.
      memoriserUtilisateurConnecte('davy');
      expect((await decider('q1', true)).status).toBe(404);
      await demanderLAutorisationDeBrice();
      const { corps } = await lister();
      const demande = corps.demandes[0]!;
      expect((await decider(demande.id, true)).status).toBe(403);
      expect((await lister()).corps.demandes[0]?.statut).toBe('en-attente');
    });

    it('le gérant ne valide pas sa propre dépense : 403 ; le propriétaire, si', async () => {
      memoriserUtilisateurConnecte('willy');
      const refus = await decider('q1', true);
      expect(refus.status).toBe(403);
      expect(refus.corps.code).toBe('droit_insuffisant');

      memoriserUtilisateurConnecte('fotso');
      const { status, corps } = await decider('q1', true);
      expect(status).toBe(200);
      expect(corps.demande).toMatchObject({ statut: 'acceptee', decidePar: 'M. Fotso' });
      expect(corps.demande.decideA).toMatch(/^\d{2}:\d{2}$/);
    });

    it('un refus est enregistré comme tel et tracé au journal', async () => {
      memoriserUtilisateurConnecte('fotso');
      const { corps } = await decider('q1', false);
      expect(corps.demande.statut).toBe('refusee');
      expect(journalDemandes()[0]).toMatchObject({
        qui: 'M. Fotso',
        quoi: 'Refus – Dépense : Réparation du pétrin',
      });
    });

    it('une demande décidée ne se décide pas deux fois : 409', async () => {
      memoriserUtilisateurConnecte('fotso');
      await decider('q1', true);
      const encore = await decider('q1', false);
      expect(encore.status).toBe(409);
      expect(encore.corps.code).toBe('deja_decidee');
    });

    it('refuse une demande inconnue (404) et une décision mal formée (400)', async () => {
      memoriserUtilisateurConnecte('fotso');
      expect((await decider('inconnue', true)).status).toBe(404);
      const mal = await appeler('POST', '/api/v1/simulation/demandes/q1/decider/', {});
      expect(mal.status).toBe(400);
    });
  });

  describe('plusieurs demandes de plafond', () => {
    const demander = (clientId: string, soldeApres: number) =>
      appeler('POST', '/api/v1/simulation/comptoir/session/autorisations/', {
        clientId,
        soldeApres,
      });

    it('se numérotent à la suite, dans l’ordre d’émission, sans changer après une décision', async () => {
      await demanderLAutorisationDeBrice();
      await demander('ebene', -3000);
      await demander('sandrine', -4000);
      const avant = (await lister()).corps.demandes;
      expect(avant.map((d) => [d.numero, d.objet && 'nom' in d.objet ? d.objet.nom : ''])).toEqual([
        [24, 'Sandrine'],
        [23, 'Ebène'],
        [22, 'Brice'],
      ]);
      memoriserUtilisateurConnecte('willy');
      await decider(avant[1]!.id, true);
      const apres = (await lister()).corps.demandes;
      expect(apres.map((d) => [d.numero, d.statut])).toEqual([
        [24, 'en-attente'],
        [23, 'acceptee'],
        [22, 'en-attente'],
        [21, 'en-attente'],
      ]);
    });
  });

  describe('jour d’émission', () => {
    afterEach(() => vi.useRealTimers());

    it('est figé à l’émission : il ne suit pas l’horloge', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T17:00:00Z'));
      await demanderLAutorisationDeBrice();
      vi.setSystemTime(new Date('2026-10-16T17:00:00Z'));
      const { corps } = await lister();
      expect(corps.demandes[0]).toMatchObject({ jour: '2026-10-14', heure: '18:00' });
    });
  });

  describe('décision prise dans la session, puis lue dans les demandes', () => {
    it('affiche qui a décidé et à quelle heure', async () => {
      await demanderLAutorisationDeBrice();
      const id = (await lister()).corps.demandes[0]!.id;
      const decision = await appeler(
        'POST',
        '/api/v1/simulation/comptoir/session/autorisations/decider/',
        {
          demandeId: id,
          code: '1234',
          accord: true,
        },
      );
      expect(decision.status).toBe(200);
      const demande = (await lister()).corps.demandes[0]!;
      expect(demande.statut).toBe('acceptee');
      expect(demande.decidePar).toBe('Willy');
      expect(demande.decideA).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('demande de dépassement du plafond, émise dans la session', () => {
    it('apparaît pour sa caissière et pour la direction, numérotée à la suite', async () => {
      await demanderLAutorisationDeBrice();
      const { corps } = await lister();
      expect(corps.demandes).toHaveLength(1);
      expect(corps.demandes[0]).toMatchObject({
        numero: 22,
        type: 'plafond',
        par: 'Davy',
        parProfil: 'caissier',
        titre: 'Livraison au-delà du plafond : Brice',
        titreEn: 'Delivery over the limit: Brice',
        objet: { genre: 'client', id: 'brice', nom: 'Brice', solde: -4200 },
      });
      memoriserUtilisateurConnecte('rachel');
      expect((await lister()).corps.demandes).toEqual([]);
      memoriserUtilisateurConnecte('willy');
      expect((await lister()).corps.demandes.map((d) => d.numero)).toEqual([22, 21]);
    });

    it('accordée par le gérant : la livraison est autorisée dans la session', async () => {
      await demanderLAutorisationDeBrice();
      const id = (await lister()).corps.demandes[0]!.id;
      memoriserUtilisateurConnecte('willy');
      const { status, corps } = await decider(id, true);
      expect(status).toBe(200);
      expect(corps.demande).toMatchObject({ statut: 'acceptee', decidePar: 'Willy' });

      memoriserUtilisateurConnecte('davy');
      const session = await appeler<{ autorisations: Record<string, { par: string }> }>(
        'GET',
        '/api/v1/simulation/comptoir/session/',
      );
      expect(session.corps.autorisations.brice?.par).toBe('Willy');
      expect(journalComptoir()[0]?.quoi).toBe('Accord – Livraison au-delà du plafond : Brice');
    });

    it('refusée : aucune autorisation, et la caissière voit la décision', async () => {
      await demanderLAutorisationDeBrice();
      const id = (await lister()).corps.demandes[0]!.id;
      memoriserUtilisateurConnecte('fotso');
      await decider(id, false);
      memoriserUtilisateurConnecte('davy');
      const { corps } = await lister();
      expect(corps.demandes[0]).toMatchObject({ statut: 'refusee', decidePar: 'M. Fotso' });
      const session = await appeler<{ autorisations: object }>(
        'GET',
        '/api/v1/simulation/comptoir/session/',
      );
      expect(session.corps.autorisations).toEqual({});
    });
  });
});
