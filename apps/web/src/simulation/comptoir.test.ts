import type { InstantaneSession, Livraison } from '@/espaces/comptoir/session/types.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { journalComptoir } from './comptoir.ts';
import { installerApiSimulee, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = '/api/v1/simulation/comptoir/session/';

async function appeler<T = { instantane: InstantaneSession }>(
  methode: 'GET' | 'POST' | 'PUT',
  chemin: string,
  corps?: object,
) {
  const reponse = await fetch(`http://localhost${RACINE}${chemin}`, {
    method: methode,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return { status: reponse.status, corps: (await reponse.json()) as T & { code?: string } };
}

const instantane = async () => (await appeler<InstantaneSession>('GET', '')).corps;
const livrer = (corps: object) =>
  appeler<{ instantane: InstantaneSession; livraison: Livraison }>('POST', 'livraisons/', corps);

/** 30 BAG à Brice (tarif 100, solde −4 200) : dû 3 000. */
const venteDeBrice = (recu: number) => ({
  clientId: 'brice',
  quantites: { BAG: 30, KO: 0, GC: 0 },
  mode: 'especes',
  recu,
  reference: '',
});

describe('API simulée de la session du comptoir', () => {
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

  it('exige d’être connecté, et un profil du comptoir', async () => {
    memoriserUtilisateurConnecte(null);
    expect((await appeler('GET', '')).status).toBe(403);
    memoriserUtilisateurConnecte('serge'); // chef de production
    expect((await appeler('GET', '')).status).toBe(403);
    memoriserUtilisateurConnecte('admin');
    expect((await appeler('GET', '')).status).toBe(403);
  });

  it('démarre comme la maquette : 12 clients, 5 livraisons, plafond de 2 000 FCFA', async () => {
    const etat = await instantane();
    expect(etat.clients).toHaveLength(12);
    expect(etat.livraisons.map((l) => l.numero)).toEqual([146, 145, 144, 143, 142]);
    expect(etat.plafond).toBe(2000);
    expect(etat.numeroProchainBon).toBe(147);
    expect(etat.session.statut).toBe('ouverte');
    expect(etat.session.fonds).toBe(20000);
    expect(etat.depensesCaisse).toBe(31000);
    // Brice, Sandrine et Yannick n'ont pas encore commandé.
    expect(etat.commandes.brice).toEqual({ BAG: '', KO: '', GC: '' });
    expect(etat.commandes.alain).toEqual({ BAG: '120', KO: '80', GC: '20' });
  });

  describe('livraison', () => {
    it('enregistre, met à jour le solde du client et numérote le bon', async () => {
      const reponse = await livrer({
        clientId: 'alex',
        quantites: { BAG: 50, KO: 0, GC: 0 },
        mode: 'especes',
        recu: 4000,
        reference: '',
      });
      expect(reponse.status).toBe(200);
      expect(reponse.corps.livraison).toMatchObject({
        numero: 147,
        du: 5000,
        recu: 4000,
        reste: -1000,
        soldeAvant: 0,
        soldeApres: -1000,
        par: 'Davy',
      });
      const etat = reponse.corps.instantane;
      expect(etat.clients.find((c) => c.id === 'alex')?.solde).toBe(-1000);
      expect(etat.livraisons[0]?.numero).toBe(147);
      expect(etat.numeroProchainBon).toBe(148);
      expect(etat.dernierBon).toBe('d147');
      expect(journalComptoir()[0]?.quoi).toContain('Livraison Alex');
    });

    it('recalcule le montant dû avec le tarif du client, pas celui du navigateur', async () => {
      const reponse = await livrer({
        clientId: 'alain', // tarif B : BAG 110
        quantites: { BAG: 10, KO: 0, GC: 0 },
        mode: 'especes',
        recu: 1100,
        reference: '',
        du: 1,
      });
      expect(reponse.corps.livraison.du).toBe(1100);
    });

    it('refuse une livraison vide ou mal formée', async () => {
      const vide = await livrer({ ...venteDeBrice(0), quantites: { BAG: 0, KO: 0, GC: 0 } });
      expect(vide.status).toBe(400);
      expect(vide.corps.code).toBe('montant_nul');
      const flottant = await livrer({ ...venteDeBrice(0), quantites: { BAG: 1.5 } });
      expect(flottant.status).toBe(400);
      const inconnu = await livrer({ ...venteDeBrice(0), clientId: 'personne' });
      expect(inconnu.status).toBe(404);
    });

    it('exige une référence pour MTN MoMo et Orange Money', async () => {
      const sans = await livrer({ ...venteDeBrice(5200), mode: 'mtn', reference: ' ' });
      expect(sans.status).toBe(400);
      expect(sans.corps.code).toBe('reference_obligatoire');
      const avec = await livrer({
        ...venteDeBrice(5200),
        mode: 'mtn',
        reference: 'MP241014.1.A1',
      });
      expect(avec.status).toBe(200);
      expect(avec.corps.livraison.reference).toBe('MP241014.1.A1');
    });

    it('bloque au-delà du plafond tant que le gérant n’a pas autorisé', async () => {
      const refusee = await livrer(venteDeBrice(1000));
      expect(refusee.status).toBe(409);
      expect(refusee.corps.code).toBe('plafond_depasse');
      expect((await instantane()).livraisons).toHaveLength(5);
    });

    it('accepte si le client paie assez pour repasser sous le plafond', async () => {
      // Dû 3 000 ; il faut 4 200 de plus que le solde −4 200 + 2 000 de marge : 3 000 + 2 200.
      const acceptee = await livrer(venteDeBrice(5200));
      expect(acceptee.status).toBe(200);
      expect(acceptee.corps.livraison.soldeApres).toBe(-2000);
    });
  });

  describe('autorisation du plafond', () => {
    it('la caissière demande, le gérant décide avec son code, l’autorisation sert une fois', async () => {
      const demande = await appeler<{
        instantane: InstantaneSession;
        demande: { id: string; statut: string; soldeApres: number; plafond: number };
      }>('POST', 'autorisations/', { clientId: 'brice', soldeApres: -6200 });
      expect(demande.corps.demande).toMatchObject({
        statut: 'en-attente',
        soldeApres: -6200,
        plafond: 2000,
      });
      const { id } = demande.corps.demande;

      const faux = await appeler('POST', 'autorisations/decider/', {
        demandeId: id,
        code: '0000',
        accord: true,
      });
      expect(faux.status).toBe(400);
      expect(faux.corps.code).toBe('code_incorrect');

      const decide = await appeler<{ instantane: InstantaneSession; decideur: string }>(
        'POST',
        'autorisations/decider/',
        { demandeId: id, code: '1234', accord: true },
      );
      expect(decide.status).toBe(200);
      expect(decide.corps.decideur).toBe('Willy');
      expect(decide.corps.instantane.autorisations.brice?.par).toBe('Willy');

      const livraison = await livrer(venteDeBrice(1000));
      expect(livraison.status).toBe(200);
      expect(livraison.corps.livraison.autorisePar).toBe('Willy');
      expect(livraison.corps.instantane.autorisations.brice).toBeUndefined();
      // Une seule fois : la suivante est de nouveau bloquée.
      expect((await livrer(venteDeBrice(0))).status).toBe(409);
    });

    it('un refus ne débloque rien', async () => {
      const { corps } = await appeler<{ demande: { id: string } }>('POST', 'autorisations/', {
        clientId: 'brice',
        soldeApres: -6200,
      });
      const refus = await appeler<{ instantane: InstantaneSession }>(
        'POST',
        'autorisations/decider/',
        { demandeId: corps.demande.id, code: '1234', accord: false },
      );
      expect(refus.corps.instantane.demandes[0]?.statut).toBe('refusee');
      expect((await livrer(venteDeBrice(1000))).status).toBe(409);
    });

    it('une demande déjà en attente n’est pas dupliquée', async () => {
      await appeler('POST', 'autorisations/', { clientId: 'brice', soldeApres: -6200 });
      await appeler('POST', 'autorisations/', { clientId: 'brice', soldeApres: -6200 });
      expect((await instantane()).demandes).toHaveLength(1);
    });

    it('le gérant autorise lui-même, sans code', async () => {
      memoriserUtilisateurConnecte('willy');
      const reponse = await appeler<{ autorise: boolean; instantane: InstantaneSession }>(
        'POST',
        'autorisations/',
        { clientId: 'brice', soldeApres: -6200 },
      );
      expect(reponse.corps.autorise).toBe(true);
      expect(reponse.corps.instantane.autorisations.brice?.par).toBe('Willy');
      expect(journalComptoir()[0]?.quoi).toContain('Autorisation de dépassement du plafond');
    });
  });

  describe('commandes', () => {
    it('ne garde que les chiffres', async () => {
      await appeler('PUT', 'commandes/', { clientId: 'brice', produit: 'BAG', valeur: '6a0' });
      expect((await instantane()).commandes.brice?.BAG).toBe('60');
    });

    it('reprend la commande habituelle et note la relance', async () => {
      await appeler('POST', 'commandes/habituelle/', { clientId: 'brice' });
      expect((await instantane()).commandes.brice).toEqual({ BAG: '60', KO: '40', GC: '' });
      const relance = await appeler<{ instantane: InstantaneSession }>('POST', 'relances/', {
        clientIds: ['sandrine', 'yannick'],
      });
      expect(Object.keys(relance.corps.instantane.relances)).toEqual(['sandrine', 'yannick']);
    });

    it('le propriétaire consulte sans saisir', async () => {
      memoriserUtilisateurConnecte('fotso');
      expect((await instantane()).clients).toHaveLength(12);
      const saisie = await appeler('PUT', 'commandes/', {
        clientId: 'brice',
        produit: 'BAG',
        valeur: '1',
      });
      expect(saisie.status).toBe(403);
      expect((await livrer(venteDeBrice(5200))).status).toBe(403);
    });
  });

  describe('mouvements internes', () => {
    it('exige une quantité et un motif', async () => {
      const sansQuantite = await appeler('POST', 'mouvements/', {
        type: 'ration',
        produit: 'BAG',
        quantite: 0,
        motif: 'x',
      });
      expect(sansQuantite.corps.code).toBe('quantite_obligatoire');
      const sansMotif = await appeler('POST', 'mouvements/', {
        type: 'ration',
        produit: 'BAG',
        quantite: 3,
        motif: '  ',
      });
      expect(sansMotif.corps.code).toBe('motif_obligatoire');
    });

    it('ajoute en tête de la liste, avec l’auteur et l’heure', async () => {
      const reponse = await appeler<{ instantane: InstantaneSession }>('POST', 'mouvements/', {
        type: 'retours',
        produit: 'KO',
        quantite: 8,
        motif: 'Retour du client',
      });
      expect(reponse.corps.instantane.mouvements).toHaveLength(2);
      expect(reponse.corps.instantane.mouvements[0]).toMatchObject({
        type: 'retours',
        produit: 'KO',
        quantite: 8,
        par: 'Davy',
      });
    });
  });

  describe('clôture', () => {
    it('exige un comptage, puis verrouille la session', async () => {
      expect((await appeler('POST', 'cloturer/')).corps.code).toBe('comptage_requis');
      await appeler('PUT', 'comptage/', { especes: '22 950' });
      const cloture = await appeler<{ instantane: InstantaneSession }>('POST', 'cloturer/');
      expect(cloture.status).toBe(200);
      expect(cloture.corps.instantane.session).toMatchObject({
        statut: 'cloturee',
        cloturePar: 'Davy',
        especesComptees: '22950',
      });
      // Plus aucune saisie.
      expect((await livrer(venteDeBrice(5200))).corps.code).toBe('session_cloturee');
      expect((await appeler('PUT', 'comptage/', { especes: '1' })).status).toBe(409);
    });

    it('seul le gérant ou le propriétaire rouvre la session', async () => {
      await appeler('PUT', 'comptage/', { especes: '22950' });
      await appeler('POST', 'cloturer/');
      expect((await appeler('POST', 'rouvrir/')).status).toBe(403); // Davy, caissier
      memoriserUtilisateurConnecte('willy');
      const rouverte = await appeler<{ instantane: InstantaneSession }>('POST', 'rouvrir/');
      expect(rouverte.corps.instantane.session).toMatchObject({
        statut: 'ouverte',
        rouvertePar: 'Willy',
      });
    });

    it('la caissière ouvre la session suivante : tout repart de zéro', async () => {
      await livrer({
        clientId: 'alex',
        quantites: { BAG: 5, KO: 0, GC: 0 },
        mode: 'especes',
        recu: 500,
        reference: '',
      });
      expect((await appeler('POST', 'ouvrir-suivante/')).status).toBe(409); // déjà ouverte
      await appeler('PUT', 'comptage/', { especes: '1000' });
      await appeler('POST', 'cloturer/');
      const avant = await instantane();
      const suivante = await appeler<{ instantane: InstantaneSession }>('POST', 'ouvrir-suivante/');
      const etat = suivante.corps.instantane;
      expect(etat.session.statut).toBe('ouverte');
      expect(etat.session.type).not.toBe(avant.session.type);
      expect(etat.livraisons).toEqual([]);
      expect(etat.mouvements).toEqual([]);
      expect(etat.session.especesComptees).toBe('');
      expect(etat.depensesCaisse).toBe(0);
      // Les soldes des clients sont repris.
      expect(etat.clients.find((c) => c.id === 'alex')?.solde).toBe(
        avant.clients.find((c) => c.id === 'alex')?.solde,
      );
      expect(etat.commandes.alain).toEqual({ BAG: '', KO: '', GC: '' });
    });
  });
});

describe('droits et autorisations de la session (cahier des charges §3.3)', () => {
  let retablir: () => void;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
  });
  afterEach(() => {
    retablir();
    vi.unstubAllGlobals();
  });

  it('le propriétaire consulte seulement : ni relance, ni habituelle, ni comptage, ni clôture', async () => {
    memoriserUtilisateurConnecte('davy');
    await appeler('PUT', 'comptage/', { especes: '22950' });
    memoriserUtilisateurConnecte('fotso');
    expect((await instantane()).session.statut).toBe('ouverte');
    const refuses = [
      await appeler('POST', 'relances/', { clientIds: ['brice'] }),
      await appeler('POST', 'commandes/habituelle/', { clientId: 'brice' }),
      await appeler('PUT', 'comptage/', { especes: '1' }),
      await appeler('POST', 'cloturer/'),
    ];
    expect(refuses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    const etat = await instantane();
    expect(etat.session.especesComptees).toBe('22950');
    expect(etat.relances).toEqual({});
    expect(etat.session.statut).toBe('ouverte');
  });

  it('refuse une demande pour un client qui ne dépasse pas le plafond', async () => {
    memoriserUtilisateurConnecte('davy');
    const reponse = await appeler('POST', 'autorisations/', { clientId: 'alex', soldeApres: -500 });
    expect(reponse.status).toBe(400);
    expect(reponse.corps.code).toBe('pas_de_depassement');
  });

  it('une autorisation ne couvre pas un solde plus bas que celui demandé', async () => {
    memoriserUtilisateurConnecte('willy');
    await appeler('POST', 'autorisations/', { clientId: 'brice', soldeApres: -6200 });
    memoriserUtilisateurConnecte('davy');
    // 40 BAG payés 1 000 : solde −7 200, au-delà des −6 200 autorisés.
    const trop = await livrer({
      clientId: 'brice',
      quantites: { BAG: 40, KO: 0, GC: 0 },
      mode: 'especes',
      recu: 1000,
      reference: '',
    });
    expect(trop.status).toBe(409);
    expect(trop.corps.code).toBe('plafond_depasse');
    expect((await livrer(venteDeBrice(1000))).status).toBe(200);
  });
});
