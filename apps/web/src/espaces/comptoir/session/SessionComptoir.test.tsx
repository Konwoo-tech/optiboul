import { configurerApi, ErreurApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEPART } from './instantane.test-donnees.ts';
import SessionComptoir from './SessionComptoir.tsx';
import type { DemandePlafond, InstantaneSession, Livraison, Quantites } from './types.ts';

/*
 * L'écran Session rendu depuis un instantané au format de l'écran ; la composition de l'instantané à
 * partir des routes du serveur est testée dans reel.test.tsx. Chaque écriture (commande, livraison,
 * décision, mouvement, clôture) appelle un faux serveur au format de l'API réelle, dont la réponse
 * fait évoluer l'instantané relu ensuite. La personne connectée vient de `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lireSessionReelle: vi.fn() }));
vi.mock('./reel.ts', async (original) => ({
  ...(await original<typeof import('./reel.ts')>()),
  lireSessionReelle: lecture.lireSessionReelle,
  // Le faux serveur répond directement une livraison au format de l'écran.
  versLivraison: (livraison: unknown) => livraison,
}));

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES: Record<string, { id: number; nom: string; profil: string }> = {
  davy: { id: 1, nom: 'Davy', profil: 'caissier' },
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
};

/** L'instantané côté « serveur », la personne connectée, les appels reçus. */
let etat: InstantaneSession;
let connecte: string;
let appels: string[];
/** Livraison au-delà du plafond, gardée jusqu'à la décision (202). */
let enAttente: { demande: DemandePlafond; livraison: Livraison } | null;

const heure = '18:02';
const fcfa = (q: Quantites, p: Quantites) =>
  (q.BAG ?? 0) * (p.BAG ?? 0) + (q.KO ?? 0) * (p.KO ?? 0) + (q.GC ?? 0) * (p.GC ?? 0);

beforeEach(() => {
  etat = structuredClone(DEPART);
  appels = [];
  enAttente = null;
  lecture.lireSessionReelle.mockReset();
  lecture.lireSessionReelle.mockImplementation(async () => {
    if (connecte === 'serge') {
      throw new ErreurApi(403, { detail: 'Refusé.', code: 'droit_insuffisant' });
    }
    return structuredClone(etat);
  });
});

const parClient = (id: string | number) => etat.clients.find((c) => c.id === String(id))!;

function creerLivraison(corps: {
  client: number;
  lignes: { BAG: number; KO: number; GC135: number };
  paiement: { mode: string; montant: number; reference: string } | null;
}): Livraison {
  const client = parClient(corps.client);
  const quantites: Quantites = {
    BAG: corps.lignes.BAG,
    KO: corps.lignes.KO,
    GC: corps.lignes.GC135,
  };
  const du = fcfa(quantites, client.prix);
  const recu = corps.paiement?.montant ?? 0;
  const numero = etat.numeroProchainBon;
  return {
    id: `d${numero}`,
    numero,
    clientId: client.id,
    nom: client.nom,
    quantites,
    prix: client.prix,
    du,
    recu,
    mode: (corps.paiement?.mode ?? 'especes') as Livraison['mode'],
    reference: corps.paiement?.reference ?? '',
    reste: recu - du,
    soldeAvant: client.solde,
    soldeApres: client.solde + recu - du,
    heure,
    par: PERSONNES[connecte]!.nom,
    autorisePar: '',
  };
}

function enregistrer(livraison: Livraison) {
  parClient(livraison.clientId).solde = livraison.soldeApres;
  etat.livraisons.unshift(livraison);
  etat.numeroProchainBon += 1;
  etat.dernierBon = livraison.id;
}

function installerServeur() {
  const moi = PERSONNES[connecte]!;
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: moi.id,
        name: moi.nom,
        email: 'x@optiboul.local',
        url: `http://localhost/api/v1/users/${moi.id}/`,
        profil: moi.profil,
      }),
    ),
    http.post('*/api/v1/commandes/', async ({ request }) => {
      const corps = (await request.json()) as {
        client: number;
        lignes: { BAG: number; KO: number; GC135: number };
      };
      appels.push(`commande ${corps.client} ${JSON.stringify(corps.lignes)}`);
      const texte = (n: number) => (n ? String(n) : '');
      etat.commandes[String(corps.client)] = {
        BAG: texte(corps.lignes.BAG),
        KO: texte(corps.lignes.KO),
        GC: texte(corps.lignes.GC135),
      };
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/commandes/relancer-habituels/', async ({ request }) => {
      const { clients } = (await request.json()) as { clients: number[] };
      appels.push(`relancer ${clients.join(',')}`);
      for (const id of clients) etat.relances[String(id)] = heure;
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/commandes/reprendre-habituelle/', async ({ request }) => {
      const { client } = (await request.json()) as { client: number };
      appels.push(`reprendre ${client}`);
      const h = etat.habituelles[String(client)]!;
      etat.commandes[String(client)] = { BAG: String(h.BAG), KO: String(h.KO), GC: String(h.GC) };
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/livraisons/', async ({ request }) => {
      const corps = (await request.json()) as Parameters<typeof creerLivraison>[0] & {
        demander_autorisation?: string;
      };
      const livraison = creerLivraison(corps);
      if (livraison.soldeApres < -etat.plafond) {
        if (!corps.demander_autorisation) {
          return HttpResponse.json(
            { detail: 'Plafond de dette dépassé.', code: 'plafond_depasse' },
            { status: 409 },
          );
        }
        // Le gérant ou le propriétaire qui demande est livré d'emblée (201), sans autre valideur.
        if (moi.profil !== 'caissier') {
          const livree = { ...livraison, autorisePar: moi.nom };
          appels.push(`livraison autorisée ${livraison.clientId}`);
          enregistrer(livree);
          return HttpResponse.json(livree, { status: 201 });
        }
        const demande: DemandePlafond = {
          id: '22',
          numero: 22,
          clientId: livraison.clientId,
          clientNom: livraison.nom,
          soldeApres: livraison.soldeApres,
          plafond: etat.plafond,
          par: moi.nom,
          jour: '2026-10-14',
          heure,
          statut: 'en-attente',
        };
        etat.demandes.unshift(demande);
        enAttente = { demande, livraison };
        appels.push('livraison en attente');
        return HttpResponse.json({}, { status: 202 });
      }
      appels.push(`livraison ${livraison.clientId} ${livraison.du} ${livraison.recu}`);
      enregistrer(livraison);
      return HttpResponse.json(livraison, { status: 201 });
    }),
    http.post('*/api/v1/demandes/:id/accorder/', async ({ request }) => {
      const corps = (await request.json()) as { code_gerant?: { code: string } };
      if (corps.code_gerant && corps.code_gerant.code !== '1234') {
        return HttpResponse.json(
          { detail: 'Code incorrect.', code: 'code_incorrect' },
          { status: 403 },
        );
      }
      appels.push('accorder');
      const attente = enAttente;
      if (attente) {
        Object.assign(attente.demande, { statut: 'acceptee', decidePar: 'Willy', decideA: heure });
        enregistrer({ ...attente.livraison, autorisePar: 'Willy' });
        enAttente = null;
      }
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/demandes/:id/refuser/', async ({ request }) => {
      const corps = (await request.json()) as { code_gerant?: { code: string } };
      if (corps.code_gerant && corps.code_gerant.code !== '1234') {
        return HttpResponse.json(
          { detail: 'Code incorrect.', code: 'code_incorrect' },
          { status: 403 },
        );
      }
      appels.push('refuser');
      if (enAttente) {
        Object.assign(enAttente.demande, { statut: 'refusee', decidePar: 'Willy', decideA: heure });
        enAttente = null;
      }
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/mouvements-internes/', async ({ request }) => {
      const corps = (await request.json()) as {
        genre: string;
        produit: string;
        quantite: number;
        motif: string;
      };
      appels.push(`mouvement ${corps.genre} ${corps.produit} ${corps.quantite}`);
      const type =
        (
          { vente_guichet: 'vente-guichet', reste_en_salle: 'reste-en-salle' } as Record<
            string,
            string
          >
        )[corps.genre] ?? corps.genre;
      etat.mouvements.unshift({
        id: `m${etat.mouvements.length + 1}`,
        type: type as never,
        produit: (corps.produit === 'GC135' ? 'GC' : corps.produit) as never,
        quantite: corps.quantite,
        motif: corps.motif,
        par: moi.nom,
        heure,
      });
      return HttpResponse.json({}, { status: 201 });
    }),
    http.post('*/api/v1/caisses/:id/fermer/', async ({ request }) => {
      const { compte } = (await request.json()) as { compte: number };
      appels.push(`fermer ${compte}`);
      Object.assign(etat.session, {
        statut: 'cloturee',
        clotureeA: heure,
        cloturePar: moi.nom,
        especesComptees: String(compte),
      });
      etat.prochaine = { jour: '2026-10-15', type: 'jour' };
      return HttpResponse.json({});
    }),
    http.get('*/api/v1/caisses/prochaine/', () =>
      HttpResponse.json({
        jour: '2026-10-15',
        creneau: 'jour',
        planifiee: null,
        fonds_propose: 20000,
        caisse_en_cours: null,
      }),
    ),
    http.post('*/api/v1/caisses/ouvrir/', async ({ request }) => {
      const { fonds } = (await request.json()) as { fonds: number };
      appels.push(`ouvrir ${fonds}`);
      etat.session = {
        ...etat.session,
        caisseId: '7',
        type: 'jour',
        date: '2026-10-15',
        statut: 'ouverte',
        ouverteA: heure,
        ouvertePar: moi.nom,
        clotureeA: '',
        cloturePar: '',
        especesComptees: '',
        fonds,
      };
      delete etat.prochaine;
      return HttpResponse.json({}, { status: 201 });
    }),
  );
}

async function ouvrir(utilisateur = 'davy') {
  connecte = utilisateur;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  initI18n('fr');
  installerServeur();
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/comptoir/session']}>
          <SessionComptoir />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('tab', { name: 'Livraisons' });
}

afterEach(() => {
  cleanup();
  serveur.resetHandlers();
  vi.useRealTimers();
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });
const touche = (champ: HTMLElement | Window, key: string) => fireEvent.keyDown(champ, { key });

const quantite = (produit: string) => screen.getByLabelText(`${produit} livrés`);

/** Choisit un client dans la liste de gauche et attend que la fiche s'affiche. */
async function choisir(nom: RegExp | string) {
  fireEvent.click(screen.getByRole('button', { name: nom }));
  await screen.findByLabelText('BAG livrés');
}

const champsDeLaFiche = () => [
  quantite('BAG') as HTMLInputElement,
  quantite('KO') as HTMLInputElement,
  quantite('GC 135') as HTMLInputElement,
  screen.getAllByPlaceholderText('0')[3] as HTMLInputElement,
];

describe('Comptoir › Session en cours', () => {
  beforeEach(() => ouvrir());

  it('ouvre sur les livraisons, avec les quatre onglets et les douze clients', () => {
    const onglets = screen.getAllByRole('tab').map((o) => o.textContent);
    expect(onglets).toEqual(['Commandes', 'Livraisons', 'Mouvements internes', 'Clôture']);
    expect(screen.getByRole('tab', { name: 'Livraisons' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByText('Aucune livraison en cours')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Marché Etoudi|Olembé|Emana/ }).length).toBe(7);
    expect(screen.getByRole('heading', { name: 'Session de nuit du 14 oct.' })).toBeTruthy();
  });

  it('affiche les statistiques et les dernières livraisons de la session', () => {
    expect(screen.getByText('Dernières livraisons')).toBeTruthy();
    expect(screen.getByText('Bon n° 146 · 21:41 · Orange Money')).toBeTruthy();
    // 5 livraisons, 600 pains, 58 950 attendus, 58 450 encaissés, −500 de dettes.
    expect(screen.getByText('58 950')).toBeTruthy();
    expect(screen.getByText('58 450')).toBeTruthy();
  });

  describe('clavier', () => {
    it('Entrée enchaîne BAG → KO → GC → Reçu, puis valide', async () => {
      await choisir(/^Hervé/);
      await waitFor(() => expect(document.activeElement).toBe(quantite('BAG')));

      saisir(quantite('BAG'), '60');
      touche(quantite('BAG'), 'Enter');
      expect(document.activeElement).toBe(quantite('KO'));
      touche(quantite('KO'), 'Enter');
      expect(document.activeElement).toBe(quantite('GC 135'));
      saisir(quantite('GC 135'), '30');
      touche(quantite('GC 135'), 'Enter');
      const champRecu = champsDeLaFiche()[3]!;
      expect(document.activeElement).toBe(champRecu);

      // Hervé : tarif B, 60 × 110 + 30 × 165 = 11 550 FCFA.
      expect(screen.getAllByText('11 550', { exact: false }).length).toBeGreaterThan(0);
      saisir(champRecu, '11550');
      touche(champRecu, 'Enter');

      expect(await screen.findByText('Livraison enregistrée · Hervé · bon n° 147')).toBeTruthy();
      // Retour à la recherche pour le client suivant.
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText('Rechercher un client')),
      );
      expect(screen.getByText('Bon n° 147 · 18:02 · Espèces', { exact: false })).toBeTruthy();
      expect(appels).toEqual(['livraison 9 11550 11550']);
    });

    it('Entrée dans la recherche choisit le premier client trouvé', async () => {
      const recherche = screen.getByLabelText('Rechercher un client');
      saisir(recherche, 'mam');
      touche(recherche, 'Enter');
      expect(await screen.findByText(/Client livreur · Marché Etoudi/)).toBeTruthy();
      expect(screen.getByRole('button', { name: /^Mama Ngono/ }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });

    it('F2 repart d’une nouvelle livraison, Échap l’annule', async () => {
      await choisir(/^Alain/);
      saisir(quantite('BAG'), '10');
      touche(window, 'F2');
      await waitFor(() => expect(screen.getByText('Aucune livraison en cours')).toBeTruthy());
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByLabelText('Rechercher un client')),
      );

      await choisir(/^Alain/);
      touche(window, 'Escape');
      await waitFor(() => expect(screen.getByText('Aucune livraison en cours')).toBeTruthy());
    });

    it('F4 encaisse la livraison prête, F8 ouvre le bon, Échap le ferme', async () => {
      await choisir(/^Alex/);
      saisir(quantite('BAG'), '50');
      saisir(champsDeLaFiche()[3]!, '5000');

      touche(window, 'F4');
      expect(await screen.findByText('Livraison enregistrée · Alex · bon n° 147')).toBeTruthy();

      touche(window, 'F8');
      const bon = await screen.findByRole('dialog', { name: 'Bon de livraison' });
      expect(within(bon).getByText('N° 147')).toBeTruthy();
      expect(within(bon).getByText('BAG · 50 × 100')).toBeTruthy();
      touche(window, 'Escape');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('F4 sur une livraison incomplète ramène au montant reçu sans rien enregistrer', async () => {
      await choisir(/^Alex/);
      saisir(quantite('BAG'), '50');
      touche(window, 'F4');
      expect(document.activeElement).toBe(champsDeLaFiche()[3]);
      expect(screen.queryByText(/Livraison enregistrée/)).toBeNull();
      expect(appels).toEqual([]);
    });

    it('F8 ne fait rien tant qu’aucun bon n’existe', () => {
      touche(window, 'F8');
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('paiement', () => {
    it('« Exact » reprend le montant dû ; une dette apparaît dans le reste', async () => {
      await choisir(/^Alex/);
      saisir(quantite('BAG'), '50');
      fireEvent.click(screen.getByRole('button', { name: 'Exact' }));
      expect(champsDeLaFiche()[3]!.value).toBe('5000');
      expect(screen.getByText('Payé exactement')).toBeTruthy();

      saisir(champsDeLaFiche()[3]!, '4000');
      expect(screen.getByText('Devient une dette')).toBeTruthy();
      expect(screen.getAllByText('−1 000 FCFA').length).toBeGreaterThan(0);
    });

    it('MTN MoMo exige une référence de transaction', async () => {
      await choisir(/^Mama Ngono/);
      saisir(quantite('BAG'), '100');
      fireEvent.click(screen.getByRole('button', { name: 'MTN MoMo' }));
      fireEvent.click(screen.getByRole('button', { name: 'Exact' }));
      const valider = screen.getByRole('button', { name: 'Valider la livraison' });
      expect(screen.getByText('Référence obligatoire pour le mobile money.')).toBeTruthy();
      expect(valider.getAttribute('aria-disabled')).toBe('true');

      fireEvent.change(screen.getByPlaceholderText('MP241014.2150.C7'), {
        target: { value: 'MP241014.2150.C7' },
      });
      expect(valider.getAttribute('aria-disabled')).toBe('false');
    });
  });

  it('« Livrer comme commandé » refusé au-delà du plafond : le message du serveur dit combien encaisser', async () => {
    serveur.use(
      http.post('*/api/v1/livraisons/livrer-comme-commande/', () =>
        HttpResponse.json(
          {
            detail:
              'Plafond de dette dépassé : encaissez 18750 FCFA ou demandez l’accord du gérant.',
            code: 'plafond_depasse',
            manque: 18750,
          },
          { status: 409 },
        ),
      ),
    );
    await choisir(/^Alain/);
    fireEvent.click(await screen.findByRole('button', { name: 'Livrer comme commandé' }));
    expect(
      await screen.findByText(/encaissez 18750 FCFA ou demandez l’accord du gérant/),
    ).toBeTruthy();
  });

  describe('plafond de 2 000 FCFA', () => {
    async function depasserLePlafond() {
      await choisir(/^Brice/);
      saisir(quantite('BAG'), '30');
      saisir(champsDeLaFiche()[3]!, '1000');
    }

    it('bloque la livraison et propose d’encaisser le complément', async () => {
      await depasserLePlafond();
      expect(screen.getByText('Plafond de 2 000 FCFA dépassé')).toBeTruthy();
      expect(screen.getByText('Plafond dépassé')).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Valider la livraison' }).getAttribute('aria-disabled'),
      ).toBe('true');

      fireEvent.click(screen.getByRole('button', { name: /^Encaisser 4\s200 FCFA de plus/ }));
      expect(champsDeLaFiche()[3]!.value).toBe('5200');
      expect(screen.queryByText('Plafond de 2 000 FCFA dépassé')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Valider la livraison' }).getAttribute('aria-disabled'),
      ).toBe('false');
    });

    it('la caissière envoie la livraison en attente, le gérant saisit son code', async () => {
      await depasserLePlafond();
      fireEvent.click(screen.getByRole('button', { name: 'Demander l’autorisation du gérant' }));

      const fenetre = await screen.findByRole('dialog', { name: 'Autorisation du gérant' });
      expect(
        within(fenetre).getByText(/Brice : −6 200 FCFA \/ 2 000 FCFA de plafond/),
      ).toBeTruthy();
      expect(appels).toEqual(['livraison en attente']);
      const code = within(fenetre).getByLabelText('Code du gérant');
      await waitFor(() => expect(document.activeElement).toBe(code));

      saisir(code, '9999');
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Autoriser la livraison' }));
      expect(
        await within(fenetre).findByText(
          'Code incorrect : seul le gérant ou le propriétaire peut décider.',
        ),
      ).toBeTruthy();

      saisir(code, '1234');
      touche(code, 'Enter');
      expect(
        await screen.findByText('Accordé · Livraison au-delà du plafond : Brice'),
      ).toBeTruthy();
      // L'accord crée la livraison sur le serveur : elle apparaît dans la liste.
      await waitFor(() => expect(screen.getByText('Bon n° 147', { exact: false })).toBeTruthy());
      expect(appels).toEqual(['livraison en attente', 'accorder']);
    });

    it('« Laisser en attente » garde la demande, que le gérant retrouve ensuite', async () => {
      await depasserLePlafond();
      fireEvent.click(screen.getByRole('button', { name: 'Demander l’autorisation du gérant' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Laisser en attente' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      // La livraison est déjà posée en attente sur le serveur : la saisie repart à zéro.
      expect(screen.getByText('Aucune livraison en cours')).toBeTruthy();
      expect(screen.queryByText('Bon n° 147', { exact: false })).toBeNull();
      expect(appels).toEqual(['livraison en attente']);
    });

    it('un refus ne débloque pas la livraison', async () => {
      await depasserLePlafond();
      fireEvent.click(screen.getByRole('button', { name: 'Demander l’autorisation du gérant' }));
      const fenetre = await screen.findByRole('dialog');
      saisir(within(fenetre).getByLabelText('Code du gérant'), '1234');
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Refuser' }));
      expect(await screen.findByText('Refusé · Livraison au-delà du plafond : Brice')).toBeTruthy();
      // Refusée : la livraison n'est jamais créée.
      expect(screen.queryByText('Bon n° 147', { exact: false })).toBeNull();
      expect(appels).toEqual(['livraison en attente', 'refuser']);
    });
  });

  describe('commandes', () => {
    beforeEach(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Commandes' }));
    });

    it('relance les trois habituels sans commande et reprend leur commande', async () => {
      expect(await screen.findByText('3 clients habituels n’ont pas encore commandé')).toBeTruthy();
      expect(screen.getByText('Habituel : 60 BAG · 40 KO')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Relancer les 3' }));
      expect(await screen.findByText('3 messages WhatsApp envoyés')).toBeTruthy();
      expect(screen.getAllByText('Relancé à 18:02')).toHaveLength(3);

      fireEvent.click(screen.getByRole('button', { name: 'Reprendre l’habituel de Brice' }));
      expect(await screen.findByText('Commande de Brice ajoutée')).toBeTruthy();
      expect(await screen.findByText('2 clients habituels n’ont pas encore commandé')).toBeTruthy();
      expect(appels).toEqual(['relancer 7,10,11', 'reprendre 7']);
    });

    it('calcule le total des pains et les sacs à pétrir', async () => {
      await screen.findByText('Sacs à pétrir');
      // BAG : 120+80+100+70+100+90+80+60+50 = 750 pains (Brice, Sandrine et Yannick n’ont rien commandé) → 3 sacs de 315.
      const total = screen.getByText('Total pains').parentElement!;
      expect(within(total).getByText('750')).toBeTruthy();
      const sacs = screen.getByText('Sacs à pétrir').parentElement!;
      expect(within(sacs).getAllByText('3').length).toBeGreaterThan(0);
    });

    it('saisir une commande met à jour le montant estimé et le plan', async () => {
      vi.useRealTimers();
      const champ = (await screen.findByLabelText('Commande BAG de Brice')) as HTMLInputElement;
      saisir(champ, '315');
      await waitFor(() => expect(champ.value).toBe('315'));
      // Brice : 315 × 100 = 31 500 FCFA estimés.
      expect(await screen.findByText('31 500')).toBeTruthy();
      saisir(champ, 'abc4');
      await waitFor(() => expect(champ.value).toBe('4'));
      // L'envoi suit la frappe, une fois qu'elle s'arrête (600 ms).
      await waitFor(() => expect(appels.some((a) => a.startsWith('commande 7'))).toBe(true), {
        timeout: 3000,
      });
    });

    it('Entrée passe au champ suivant du tableau', async () => {
      const bag = await screen.findByLabelText('Commande BAG de Alain');
      touche(bag, 'Enter');
      expect(document.activeElement).toBe(screen.getByLabelText('Commande KO de Alain'));
    });

    it('la caissière ne voit pas le plan de production', () => {
      expect(screen.queryByRole('button', { name: 'Voir le plan de production' })).toBeNull();
    });
  });

  describe('mouvements internes', () => {
    beforeEach(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Mouvements internes' }));
    });

    it('exige une quantité puis un motif', async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Ajouter le mouvement' }));
      expect(await screen.findByText('Indiquez une quantité.')).toBeTruthy();

      saisir(screen.getByPlaceholderText('0'), '8');
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter le mouvement' }));
      expect(
        await screen.findByText('Motif obligatoire : précisez la raison du mouvement.'),
      ).toBeTruthy();
      expect(appels).toEqual([]);
    });

    it('ajoute un mouvement à la liste de la session', async () => {
      await screen.findByText('Mouvements de la session');
      expect(screen.getByText('Ration · 12 BAG')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Retours' }));
      fireEvent.click(screen.getByRole('button', { name: 'KO' }));
      saisir(screen.getByPlaceholderText('0'), '8');
      saisir(screen.getByLabelText('Motif (obligatoire)'), 'Retour du client');
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter le mouvement' }));

      expect(await screen.findByText('Retours · 8 KO')).toBeTruthy();
      expect(screen.getByText('Mouvement ajouté aux totaux de la session')).toBeTruthy();
      expect(screen.getByText(/Retour du client · Davy · 18:02/)).toBeTruthy();
      expect(appels).toEqual(['mouvement retours KO 8']);
    });
  });

  describe('clôture', () => {
    beforeEach(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Clôture' }));
    });

    it('récapitule la session et attend un comptage', async () => {
      expect(await screen.findByText('Récapitulatif de la session')).toBeTruthy();
      // Fonds 20 000 + espèces 33 950 − dépenses 31 000 = 22 950.
      expect(screen.getByText('22 950 FCFA')).toBeTruthy();
      expect(screen.getByText('Saisissez les espèces comptées')).toBeTruthy();
      expect(
        screen.getByRole('button', { name: 'Clôturer la session' }).getAttribute('aria-disabled'),
      ).toBe('true');
    });

    it('annonce un manque, un excédent ou une caisse juste', async () => {
      const comptees = (await screen.findByLabelText('Espèces comptées')) as HTMLInputElement;
      saisir(comptees, '22500');
      expect(await screen.findByText('Manque 450 FCFA')).toBeTruthy();
      saisir(comptees, '23000');
      expect(await screen.findByText('Excédent de 50 FCFA')).toBeTruthy();
      saisir(comptees, '22950');
      expect(await screen.findByText('Caisse juste')).toBeTruthy();
    });

    it('clôture après confirmation, puis la session est en lecture seule', async () => {
      saisir(await screen.findByLabelText('Espèces comptées'), '22950');
      const bouton = screen.getByRole('button', { name: 'Clôturer la session' });
      await waitFor(() => expect(bouton.getAttribute('aria-disabled')).toBe('false'));
      fireEvent.click(bouton);

      const fenetre = await screen.findByRole('dialog', { name: 'Confirmer la clôture' });
      expect(within(fenetre).getByText('0 FCFA · Caisse juste', { exact: false })).toBeTruthy();
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Confirmer la clôture' }));

      expect(await screen.findByText('Session clôturée et verrouillée')).toBeTruthy();
      expect(
        screen.getByText('Session de nuit du 14 oct. clôturée à 18:02 par Davy · lecture seule'),
      ).toBeTruthy();
      expect((screen.getByLabelText('Espèces comptées') as HTMLInputElement).disabled).toBe(true);
      expect(screen.queryByRole('button', { name: 'Clôturer la session' })).toBeNull();
      expect(screen.getByText('Session de nuit · clôturée')).toBeTruthy();

      fireEvent.click(screen.getByRole('tab', { name: 'Livraisons' }));
      expect(
        await screen.findByText('La session est clôturée : la saisie est verrouillée.'),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Valider la livraison' })).toBeNull();
      // Le caissier ne peut pas rouvrir, mais ouvre la session suivante.
      expect(screen.queryByRole('button', { name: 'Rouvrir la session' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la session de jour du 15 oct.' }));
      expect(await screen.findByText('Session ouverte · soldes clients repris')).toBeTruthy();
      expect(await screen.findByText('Session de jour du 15 oct.')).toBeTruthy();
      expect(appels).toEqual(['fermer 22950', 'ouvrir 20000']);
    });

    it('Annuler dans la confirmation laisse la session ouverte', async () => {
      saisir(await screen.findByLabelText('Espèces comptées'), '22950');
      const bouton = screen.getByRole('button', { name: 'Clôturer la session' });
      await waitFor(() => expect(bouton.getAttribute('aria-disabled')).toBe('false'));
      fireEvent.click(bouton);
      const fenetre = await screen.findByRole('dialog');
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByRole('button', { name: 'Clôturer la session' })).toBeTruthy();
      expect(appels).toEqual([]);
    });
  });

  it('la session s’affiche aussi en anglais', async () => {
    await initI18n('fr').changeLanguage('en');
    expect(await screen.findByRole('tab', { name: 'Deliveries' })).toBeTruthy();
    expect(screen.getByText('No delivery in progress')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Internal movements' })).toBeTruthy();
    await initI18n('fr').changeLanguage('fr');
  });
});

describe('profils', () => {
  it('le propriétaire consulte sans saisir', async () => {
    await ouvrir('fotso');
    expect(
      await screen.findByText('Lecture seule : votre profil consulte la session sans saisir.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Valider la livraison' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Commandes' }));
    expect(
      ((await screen.findByLabelText('Commande BAG de Alain')) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Voir le plan de production' })).toBeTruthy();
  });

  it('le gérant autorise lui-même le dépassement du plafond', async () => {
    await ouvrir('willy');
    fireEvent.click(screen.getByRole('button', { name: /^Brice/ }));
    saisir(await screen.findByLabelText('BAG livrés'), '30');
    fireEvent.click(screen.getByRole('button', { name: 'Autoriser le dépassement' }));
    expect(await screen.findByText('Dépassement autorisé et tracé')).toBeTruthy();
    expect(appels).toEqual(['livraison autorisée 7']);
  });
});

describe('droits et clavier', () => {
  /** Une livraison enregistrée (F4) puis son bon ouvert (F8). */
  async function ouvrirUnBon() {
    await choisir(/^Alex/);
    saisir(quantite('BAG'), '50');
    saisir(champsDeLaFiche()[3]!, '5000');
    touche(window, 'F4');
    await screen.findByText('Livraison enregistrée · Alex · bon n° 147');
    touche(window, 'F8');
    return screen.findByRole('dialog', { name: 'Bon de livraison' });
  }

  it('le propriétaire ne relance ni ne clôture : tout est en lecture seule', async () => {
    await ouvrir('fotso');
    fireEvent.click(screen.getByRole('tab', { name: 'Commandes' }));
    await screen.findByLabelText('Commande BAG de Alain');
    expect(screen.queryByText(/clients habituels n’ont pas encore commandé/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Relancer/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Clôture' }));
    const comptees = (await screen.findByLabelText('Espèces comptées')) as HTMLInputElement;
    expect(comptees.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Clôturer la session' })).toBeNull();
  });

  it('F2 et F8 sont ignorés quand une fenêtre est ouverte', async () => {
    await ouvrir();
    await ouvrirUnBon();
    touche(window, 'F2');
    touche(window, 'F8');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('Échap ne ferme pas la fenêtre quand il vient d’un sélecteur natif', async () => {
    await ouvrir();
    await ouvrirUnBon();
    const liste = document.createElement('select');
    document.body.append(liste);
    fireEvent.keyDown(liste, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    liste.remove();
    touche(window, 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
