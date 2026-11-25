import { configurerApi } from '@/api';
import { changerLangue, initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranCaisses from './Ecran.tsx';

/*
 * L'écran Caisses sur un faux serveur au format de l'API réelle : `caisses/` (la caissière ne reçoit
 * que les siennes), `recapitulatif`, `prochaine`, `{id}/especes`, `semaines/` et les quatre actions
 * (ouvrir, fermer, remettre, rouvrir), dont les réponses font évoluer l'état. La personne connectée
 * vient de `users/me/`.
 */

const serveur = creerServeurApi();

const ecran = ECRANS.find((e) => e.espace === 'comptoir' && e.cle === 'caisses')!;
const NBSP = String.fromCodePoint(0xa0);

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES: Record<string, { id: number; nom: string; profil: string }> = {
  davy: { id: 1, nom: 'Davy', profil: 'caissier' },
  rachel: { id: 2, nom: 'Rachel', profil: 'caissier' },
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
};
const personne = (cle: string) => ({ id: PERSONNES[cle]!.id, nom: PERSONNES[cle]!.nom });

type CaisseServeur = {
  id: number;
  jour: string;
  creneau: 'jour' | 'nuit';
  caissiere: { id: number; nom: string };
  ouverte_par: { id: number; nom: string };
  fermee_par: { id: number; nom: string } | null;
  recette: number;
  fonds: number;
  attendu: number | null;
  compte: number | null;
  ecart: number | null;
  statut: 'ouverte' | 'fermee';
  en_cours: boolean;
  ouverte_le: string;
  fermee_le: string | null;
};

const fermee = (
  id: number,
  caissiere: string,
  jour: string,
  creneau: 'jour' | 'nuit',
  ecart: number,
): CaisseServeur => ({
  id,
  jour,
  creneau,
  caissiere: personne(caissiere),
  ouverte_par: personne(caissiere),
  fermee_par: personne(caissiere),
  recette: 0,
  fonds: 20000,
  attendu: 31500,
  compte: 31500 + ecart,
  ecart,
  statut: 'fermee',
  en_cours: false,
  ouverte_le: `${jour}T${creneau === 'jour' ? '06:01' : '18:00'}:00+01:00`,
  fermee_le: `${jour}T${creneau === 'jour' ? '17:30' : '23:50'}:00+01:00`,
});

/** La plus récente d'abord, comme le serveur : la caisse de nuit de Davy est ouverte. */
const CAISSES = (): CaisseServeur[] => [
  {
    ...fermee(6, 'davy', '2026-10-14', 'nuit', 0),
    fermee_par: null,
    attendu: null,
    compte: null,
    ecart: null,
    statut: 'ouverte',
    en_cours: true,
    ouverte_le: '2026-10-14T18:02:00+01:00',
    fermee_le: null,
  },
  fermee(5, 'rachel', '2026-10-14', 'jour', 0),
  fermee(4, 'davy', '2026-10-13', 'nuit', -500),
  fermee(3, 'rachel', '2026-10-13', 'jour', 500),
  fermee(2, 'davy', '2026-10-12', 'jour', 0),
  fermee(1, 'rachel', '2026-10-12', 'nuit', 0),
];

// Recette de chaque caissière, donnée par le récapitulatif (une caisse seule n'a pas de recette).
const RECETTES: Record<number, number> = { 1: 400_000, 2: 287_050 };

let caisses: CaisseServeur[];
let connecte: string;
/** Espèces encaissées dans la caisse ouverte, remises déjà faites. */
let especes: number;
let remises: number;
let appels: string[];
let semaineOuverte: boolean;

const parId = (id: string | readonly string[] | undefined) =>
  caisses.find((c) => c.id === Number(id))!;
const vues = () =>
  PERSONNES[connecte]!.profil === 'caissier'
    ? caisses.filter((c) => c.caissiere.id === PERSONNES[connecte]!.id)
    : caisses;

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
    http.get('*/api/v1/caisses/', () => {
      const liste = vues();
      return HttpResponse.json({ count: liste.length, next: null, previous: null, results: liste });
    }),
    http.get('*/api/v1/caisses/recapitulatif/', () =>
      HttpResponse.json(
        [1, 2]
          .filter((id) => PERSONNES[connecte]!.profil !== 'caissier' || id === moi.id)
          .map((id) => {
            const siennes = caisses.filter((c) => c.caissiere.id === id);
            return {
              caissiere: personne(id === 1 ? 'davy' : 'rachel'),
              ouvertures: siennes.length,
              recette: RECETTES[id],
              ecart_cumule: siennes.reduce((somme, c) => somme + (c.ecart ?? 0), 0),
              manques: siennes.filter((c) => (c.ecart ?? 0) < 0).length,
            };
          }),
      ),
    ),
    http.get('*/api/v1/caisses/prochaine/', () => {
      const ouverte = caisses.find((c) => c.en_cours);
      const derniere = caisses[0]!;
      return HttpResponse.json({
        jour: derniere.creneau === 'nuit' ? '2026-10-15' : derniere.jour,
        creneau: derniere.creneau === 'nuit' ? 'jour' : 'nuit',
        planifiee: personne('rachel'),
        fonds_propose: 20000,
        caisse_en_cours: ouverte ?? null,
      });
    }),
    http.get('*/api/v1/semaines/', () =>
      HttpResponse.json({
        count: 1,
        next: null,
        previous: null,
        results: semaineOuverte
          ? [
              {
                id: 1,
                numero: 42,
                du: '2026-10-12',
                au: '2026-10-18',
                statut: 'ouverte',
                gerant: personne('willy'),
                production: null,
              },
            ]
          : [],
      }),
    ),
    http.get('*/api/v1/caisses/:id/especes/', ({ params }) => {
      const caisse = parId(params.id);
      return HttpResponse.json({
        fonds: caisse.fonds,
        especes,
        depenses: 0,
        remises,
        attendu: caisse.fonds + especes - remises,
        plafond: 100000,
        remise_proposee: 0,
      });
    }),
    http.post('*/api/v1/caisses/ouvrir/', async ({ request }) => {
      const { fonds } = (await request.json()) as { fonds: number };
      appels.push(`ouvrir ${fonds}`);
      const nouvelle: CaisseServeur = {
        ...fermee(7, connecte, '2026-10-15', 'jour', 0),
        fermee_par: null,
        attendu: null,
        compte: null,
        ecart: null,
        statut: 'ouverte',
        en_cours: true,
        fonds,
        ouverte_le: '2026-10-15T06:00:00+01:00',
        fermee_le: null,
      };
      caisses.unshift(nouvelle);
      especes = 0;
      remises = 0;
      return HttpResponse.json(nouvelle, { status: 201 });
    }),
    http.post('*/api/v1/caisses/:id/fermer/', async ({ params, request }) => {
      const { compte } = (await request.json()) as { compte: number };
      appels.push(`fermer ${compte}`);
      const caisse = parId(params.id);
      const attendu = caisse.fonds + especes - remises;
      Object.assign(caisse, {
        statut: 'fermee',
        en_cours: false,
        attendu,
        compte,
        ecart: compte - attendu,
        fermee_par: personne(connecte),
        fermee_le: '2026-10-14T23:55:00+01:00',
      });
      return HttpResponse.json(caisse);
    }),
    http.post('*/api/v1/caisses/:id/remettre/', async ({ request }) => {
      const corps = (await request.json()) as { montant: number; receveur: number | null };
      appels.push(`remettre ${corps.montant} ${corps.receveur}`);
      remises += corps.montant;
      return HttpResponse.json({ attendu: 20000 + especes - remises });
    }),
    http.post('*/api/v1/caisses/:id/rouvrir/', async ({ params, request }) => {
      const { motif } = (await request.json()) as { motif: string };
      appels.push(`rouvrir ${motif}`);
      Object.assign(parId(params.id), {
        statut: 'ouverte',
        en_cours: true,
        fermee_le: null,
        fermee_par: null,
        attendu: null,
        compte: null,
        ecart: null,
      });
      return HttpResponse.json({});
    }),
  );
}

beforeEach(() => {
  caisses = CAISSES();
  especes = 2950;
  remises = 0;
  appels = [];
  semaineOuverte = true;
});

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await changerLangue('fr');
});

async function monter(utilisateur: string) {
  connecte = utilisateur;
  installerServeur();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EcranCaisses ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('table');
}

const lignesDonnees = () => screen.getAllByRole('row').slice(1);
const cellules = (ligne: HTMLElement) =>
  within(ligne)
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('Comptoir › Caisses', () => {
  describe('vue de la caissière', () => {
    it('affiche son titre, ses trois caisses et sa carte seulement', async () => {
      await monter('davy');
      expect(
        screen.getByRole('heading', { name: 'Ouvertures et fermetures de caisse' }),
      ).toBeTruthy();
      expect(lignesDonnees()).toHaveLength(3);
      // Pas de filtre par caissière : la caissière n'a que les siennes.
      expect(screen.queryByRole('button', { name: 'Toutes les caissières' })).toBeNull();
      expect(screen.getByText('3 ouvertures · 2 fermetures')).toBeTruthy();
      expect(screen.queryByText('Rachel')).toBeNull();
    });

    it('a un tableau de dix colonnes et une ligne en cours', async () => {
      await monter('davy');
      expect(screen.getAllByRole('columnheader')).toHaveLength(10);
      const [enCours] = lignesDonnees();
      expect(cellules(enCours!)).toEqual([
        'Nuit',
        'Davy',
        '18:02 · Davy',
        'En cours',
        `20${NBSP}000`,
        `22${NBSP}950`,
        '—',
        '—',
        'Ouverte',
      ]);
    });

    it('montre la bannière « Caisse ouverte » avec « Fermer la caisse »', async () => {
      await monter('davy');
      expect(
        screen.getByText('Caisse ouverte · session de nuit du 14 oct. · Davy depuis 18:02'),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Fermer la caisse' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Ouvrir la caisse/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rouvrir la caisse' })).toBeNull();
    });

    it('n’affiche pas « Remettre au coffre » sous le plafond', async () => {
      await monter('davy');
      expect(screen.queryByRole('button', { name: 'Remettre au coffre' })).toBeNull();
    });
  });

  describe('vue de la direction', () => {
    it('le gérant voit toutes les caisses, le filtre et une carte par caissière', async () => {
      await monter('willy');
      expect(lignesDonnees()).toHaveLength(6);
      expect(screen.getByRole('button', { name: 'Toutes les caissières' })).toBeTruthy();
      expect(screen.getByText('3 ouvertures · 3 fermetures')).toBeTruthy();
      // La recette vient du récapitulatif du serveur : un total par caissière.
      expect(screen.getByText('400 000 FCFA')).toBeTruthy();
      expect(screen.getByText('287 050 FCFA')).toBeTruthy();
      expect(screen.getByText(`−500 FCFA`)).toBeTruthy();
      expect(screen.getByText(`+500 FCFA`)).toBeTruthy();
    });

    it('filtre par caissière, par le bouton ou par la carte', async () => {
      await monter('willy');
      fireEvent.click(screen.getByRole('button', { name: 'Rachel' }));
      expect(lignesDonnees()).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Rachel' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Toutes les caissières' }));
      expect(lignesDonnees()).toHaveLength(6);
      fireEvent.click(screen.getByRole('button', { name: /^Davys*3 ouvertures/ }));
      expect(lignesDonnees()).toHaveLength(3);
    });

    it('le propriétaire consulte seulement : ni ouvrir, ni fermer, ni remettre au coffre', async () => {
      await monter('fotso');
      expect(lignesDonnees()).toHaveLength(6);
      expect(screen.getByText(/^Caisse ouverte · session de nuit/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Fermer la caisse' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Remettre au coffre' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Ouvrir la caisse/ })).toBeNull();
    });

    it('l’autre caissière voit la bannière sans pouvoir fermer la caisse de Davy', async () => {
      await monter('rachel');
      expect(screen.getByText(/^Caisse ouverte · session de nuit/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Fermer la caisse' })).toBeNull();
      expect(lignesDonnees()).toHaveLength(3);
    });
  });

  describe('fermeture avec un seul comptage', () => {
    it('calcule l’écart tout de suite puis ferme la caisse', async () => {
      await monter('davy');
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la caisse' }));
      const fenetre = await screen.findByRole('dialog', { name: 'Fermeture de caisse' });
      const confirmer = within(fenetre).getByRole('button', { name: 'Fermer la caisse' });
      expect(confirmer).toHaveProperty('disabled', true);
      expect(within(fenetre).getByText(`22 950 FCFA`)).toBeTruthy();
      expect(within(fenetre).getByText('Saisissez les espèces comptées')).toBeTruthy();

      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22450' },
      });
      expect(within(fenetre).getByText('Manque 500 FCFA')).toBeTruthy();
      expect(within(fenetre).getByText('−500 FCFA')).toBeTruthy();

      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '23000' },
      });
      expect(within(fenetre).getByText('Excédent de 50 FCFA')).toBeTruthy();
      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22950' },
      });
      expect(within(fenetre).getByText('Caisse juste')).toBeTruthy();

      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22450' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Fermer la caisse' }));

      expect(await screen.findByText('Caisse fermée et verrouillée')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
      const bouton = await screen.findByRole('button', { name: 'Ouvrir la caisse · jour 15 oct.' });
      expect(bouton).toBeTruthy();
      const [premiere] = lignesDonnees();
      expect(cellules(premiere!).at(-1)).toBe('Manque');
      expect(cellules(premiere!).at(-2)).toBe(`−500`);
      expect(appels).toEqual(['fermer 22450']);
    });
  });

  describe('ouverture avec comptage du fonds', () => {
    async function fermerPuisOuvrirLaModale(utilisateur: string) {
      await monter(utilisateur);
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la caisse' }));
      const fenetre = await screen.findByRole('dialog');
      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22950' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Fermer la caisse' }));
      const ouvrir = await screen.findByRole('button', { name: 'Ouvrir la caisse · jour 15 oct.' });
      // La fenêtre de fermeture rend d'abord le focus au titre de la page (son bouton a disparu) :
      // on attend cet effet avant de replacer le focus sur « Ouvrir la caisse ».
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })),
      );
      ouvrir.focus();
      fireEvent.click(ouvrir);
      return {
        ouvrir,
        fenetre: await screen.findByRole('dialog', { name: 'Ouverture de caisse' }),
      };
    }

    it('propose 20 000 FCFA et signale une ouverture hors planning', async () => {
      const { fenetre } = await fermerPuisOuvrirLaModale('davy');
      expect(within(fenetre).getByLabelText('Fonds de caisse compté (FCFA)')).toHaveProperty(
        'value',
        '20000',
      );
      expect(within(fenetre).getByText('Caissière planifiée : Rachel')).toBeTruthy();
      expect(within(fenetre).getByText(/Vous n’êtes pas la personne planifiée/)).toBeTruthy();
      expect(within(fenetre).getByText(/^Ouverture par Davy · \d\d:\d\d$/)).toBeTruthy();
    });

    it('n’alerte pas la caissière planifiée', async () => {
      // Le gérant ferme, puis ouvre : il n'est pas la personne planifiée.
      await fermerPuisOuvrirLaModale('willy');
      expect(screen.getByText(/Vous n’êtes pas la personne planifiée/)).toBeTruthy();
    });

    it('rend le focus au bouton à la fermeture et ouvre la caisse avec le fonds compté', async () => {
      const { ouvrir, fenetre } = await fermerPuisOuvrirLaModale('davy');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(ouvrir);

      fireEvent.click(ouvrir);
      const reouverte = await screen.findByRole('dialog', { name: 'Ouverture de caisse' });
      expect(reouverte).not.toBe(fenetre);
      fireEvent.change(within(reouverte).getByLabelText('Fonds de caisse compté (FCFA)'), {
        target: { value: '25 000 FCFA' },
      });
      fireEvent.click(within(reouverte).getByRole('button', { name: 'Ouvrir la caisse' }));

      expect(await screen.findByText(`Caisse ouverte · fonds 25 000 FCFA`)).toBeTruthy();
      expect(
        await screen.findByText(/^Caisse ouverte · session de jour du 15 oct\. · Davy depuis/),
      ).toBeTruthy();
      expect(cellules(lignesDonnees()[0]!)[0]).toBe('Jour');
      // Le bouton « Ouvrir la caisse » a disparu : le focus passe au titre de la page.
      expect(ouvrir.isConnected).toBe(false);
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
      expect(appels).toEqual(['fermer 22950', 'ouvrir 25000']);
    });
  });

  describe('remise au coffre', () => {
    it('est proposée au-delà de 100 000 FCFA, avec la remise de tout sauf le fonds', async () => {
      // 80 000 FCFA d'espèces de plus dans la caisse ouverte.
      especes += 80_000;
      await monter('davy');
      expect(screen.getByText(`Plus de 100 000 FCFA en caisse`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remettre au coffre' }));
      const fenetre = await screen.findByRole('dialog', { name: 'Remise au coffre' });
      expect(within(fenetre).getByLabelText('Montant remis au coffre (FCFA)')).toHaveProperty(
        'value',
        '82950',
      );
      expect(within(fenetre).getByText(`Reste attendu en caisse : 20 000 FCFA`)).toBeTruthy();

      // Au-delà des espèces en caisse : refusé.
      fireEvent.change(within(fenetre).getByLabelText('Montant remis au coffre (FCFA)'), {
        target: { value: '200000' },
      });
      expect(within(fenetre).getByRole('alert').textContent).toMatch(/ne pas dépasser/);
      expect(within(fenetre).getByRole('button', { name: 'Enregistrer la remise' })).toHaveProperty(
        'disabled',
        true,
      );

      fireEvent.change(within(fenetre).getByLabelText('Montant remis au coffre (FCFA)'), {
        target: { value: '82950' },
      });
      fireEvent.change(within(fenetre).getByLabelText('Remis à'), { target: { value: '3' } });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Enregistrer la remise' }));

      expect(
        await screen.findByText(`Remise de 82 950 FCFA au coffre · reçue par Willy`),
      ).toBeTruthy();
      // Sous le plafond, la proposition disparaît ; l'attendu a baissé du montant remis.
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Remettre au coffre' })).toBeNull(),
      );
      expect(appels).toEqual(['remettre 82950 3']);
    });
  });

  describe('réouverture avec motif', () => {
    async function fermerEnTantQueGerant() {
      await monter('willy');
      fireEvent.click(screen.getByRole('button', { name: 'Fermer la caisse' }));
      const fenetre = await screen.findByRole('dialog');
      fireEvent.change(within(fenetre).getByLabelText('Espèces comptées'), {
        target: { value: '22950' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Fermer la caisse' }));
      return screen.findByRole('button', { name: 'Rouvrir la caisse' });
    }

    it('est proposée au gérant seulement, une fois la caisse fermée', async () => {
      await monter('willy');
      expect(screen.queryByRole('button', { name: 'Rouvrir la caisse' })).toBeNull();
      expect(await fermerEnTantQueGerant()).toBeTruthy();
    });

    it('exige un motif puis rouvre la caisse', async () => {
      fireEvent.click(await fermerEnTantQueGerant());
      const fenetre = await screen.findByRole('dialog', { name: 'Rouvrir la caisse' });
      expect(within(fenetre).getByText('Caisse de la session de nuit du 14 oct.')).toBeTruthy();

      fireEvent.click(within(fenetre).getByRole('button', { name: 'Rouvrir la caisse' }));
      expect(within(fenetre).getByRole('alert').textContent).toBe(
        'Motif obligatoire : précisez la raison de la réouverture.',
      );

      fireEvent.change(within(fenetre).getByLabelText('Motif de la réouverture'), {
        target: { value: 'Erreur de comptage' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: 'Rouvrir la caisse' }));

      expect(await screen.findByText('Caisse rouverte · tracé dans le journal')).toBeTruthy();
      expect(await screen.findByRole('button', { name: 'Fermer la caisse' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Rouvrir la caisse' })).toBeNull();
      expect(appels).toEqual(['fermer 22950', 'rouvrir Erreur de comptage']);
    });
  });

  it('affiche les textes en anglais', async () => {
    await changerLangue('en');
    await monter('willy');
    expect(screen.getByRole('button', { name: 'All cashiers' })).toBeTruthy();
    expect(
      screen.getByText('Cash desk open · night session Oct 14 · Davy since 18:02'),
    ).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Cashier' })).toBeTruthy();
    expect(screen.getAllByText('Mon Oct 12').length).toBeGreaterThan(0);
  });
});
