import { configurerApi } from '@/api';
import { changerLangue, initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, useLocation } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ecran } from '../../navigation.ts';
import EcranClients from './EcranClients.tsx';

/*
 * L'écran Clients et dettes sur un faux serveur au format de l'API réelle : `clients/`,
 * `clients/dettes/`, `livraisons/`, relances et relevés. La personne connectée vient de `users/me/`.
 */

const serveur = creerServeurApi();

beforeAll(() => {
  initI18n('fr');
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const ECRAN: Ecran = { cle: 'clients', espace: 'comptoir', profils: ['caissier'] };
const espace = (texte: string) => texte.replace(/[\u00a0\u202f]/g, ' ');

const PERSONNES: Record<string, { id: number; nom: string; profil: string }> = {
  davy: { id: 1, nom: 'Davy', profil: 'caissier' },
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
};

// id, nom, type, lieu, téléphone, prix BAG, KO, GC135, solde (négatif : le client doit).
const LIGNES: Array<[number, string, string, string, string, number, number, number, number]> = [
  [1, 'Alain', 'livreur', 'Marché Etoudi', '6 77 21 45 10', 110, 75, 165, -1250],
  [2, 'Alex', 'livreur', 'Carrefour Emana', '6 99 08 33 41', 100, 70, 160, 0],
  [3, 'Ebène', 'livreur', 'Lycée d’Etoudi', '6 55 72 19 08', 100, 70, 160, -2350],
  [4, 'White', 'livreur', 'Olembé', '6 78 40 12 66', 110, 75, 165, -500],
  [5, 'Mama Ngono', 'livreur', 'Marché Etoudi', '6 94 15 70 22', 100, 70, 160, 0],
  [6, 'Junior', 'livreur', 'Messassi', '6 70 66 01 93', 100, 70, 160, -1900],
  [7, 'Brice', 'livreur', 'Nkolondom', '6 51 38 27 74', 100, 75, 165, -4200],
  [8, 'Clarisse', 'livreur', 'Emana', '6 97 82 64 05', 100, 70, 160, -300],
  [9, 'Hervé', 'restaurant', 'Etoudi Château', '6 76 59 30 18', 110, 75, 165, 0],
  [10, 'Sandrine', 'livreur', 'Olembé', '6 93 24 81 57', 100, 70, 160, -2750],
  [11, 'Yannick', 'livreur', 'Messassi', '6 58 11 96 42', 100, 70, 160, -800],
  [12, 'Aïcha', 'hotel', 'Carrefour Emana', '6 90 47 05 36', 100, 70, 160, 0],
];

const CLIENTS = LIGNES.map(([id, nom, type, lieu, telephone, bag, ko, gc, solde]) => ({
  id,
  nom,
  type,
  lieu,
  telephone,
  prix: { BAG: bag, KO: ko, GC135: gc },
  solde,
  plafond_effectif: 2000,
  actif: true,
}));

const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

/** Les clients déjà relancés (« dernière relance » de `clients/dettes/`). */
let relances: Set<number>;
let appels: string[];

function installerServeur(utilisateur: string) {
  const p = PERSONNES[utilisateur]!;
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: p.id,
        name: p.nom,
        email: 'x@optiboul.local',
        url: `http://localhost/api/v1/users/${p.id}/`,
        profil: p.profil,
      }),
    ),
    http.get('*/api/v1/clients/', () => HttpResponse.json(page(CLIENTS))),
    http.get('*/api/v1/clients/dettes/', () =>
      HttpResponse.json({
        clients: CLIENTS.filter((c) => c.solde < 0).map((c) => ({
          id: c.id,
          derniere_relance: relances.has(c.id) ? '2026-10-14T10:00:00+01:00' : null,
        })),
      }),
    ),
    http.get('*/api/v1/livraisons/', ({ request }) => {
      const client = new URL(request.url).searchParams.get('client');
      return HttpResponse.json(
        page(
          client === '7'
            ? [
                {
                  numero: 128,
                  jour: '2026-10-13',
                  creneau: 'nuit',
                  cree_le: '2026-10-13T21:41:00+01:00',
                  statut: 'livree',
                  montant_du: 6000,
                  recu: 1800,
                },
              ]
            : [],
        ),
      );
    }),
    http.post('*/api/v1/clients/:id/relancer/', ({ params }) => {
      appels.push(`relancer ${params.id}`);
      relances.add(Number(params.id));
      return HttpResponse.json({ relances: [{ client: Number(params.id) }], ignores: [] });
    }),
    http.post('*/api/v1/clients/relancer-groupe/', async ({ request }) => {
      const { clients } = (await request.json()) as { clients: number[] };
      appels.push(`relancer-groupe ${clients.length}`);
      for (const id of clients) relances.add(id);
      return HttpResponse.json({ relances: clients.map((client) => ({ client })), ignores: [] });
    }),
    http.post('*/api/v1/clients/:id/envoyer-releve/', async ({ params }) => {
      appels.push(`releve ${params.id}`);
      await delay(0);
      return HttpResponse.json({});
    }),
  );
}

beforeEach(() => {
  relances = new Set();
  appels = [];
  // Le dimanche de la semaine est calculé sur la date du jour : mercredi 14 octobre 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
});
afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  vi.useRealTimers();
  await changerLangue('fr');
});

/** Montre l'adresse courante, pour vérifier ce que l'écran y écrit. */
function Adresse() {
  return <output data-testid="adresse">{useLocation().search}</output>;
}

function ouvrir(
  utilisateur: string,
  adresse = '/',
  surcharges: Parameters<typeof serveur.use> = [],
) {
  installerServeur(utilisateur);
  serveur.use(...surcharges);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[adresse]}>
          <EcranClients ecran={ECRAN} />
          <Adresse />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

const lignes = async () =>
  within(await screen.findByRole('list', { name: 'Liste des clients' })).getAllByRole('listitem');

describe('Clients et dettes', () => {
  it('affiche les trois chiffres clés et les filtres avec leur nombre', async () => {
    ouvrir('davy');
    expect(await screen.findByText('Dettes clients')).toBeTruthy();
    expect(espace(screen.getByText('Dettes clients').nextElementSibling?.textContent ?? '')).toBe(
      '−14 050 FCFA',
    );
    expect(screen.getByText('Clients en dette').nextElementSibling?.textContent).toBe('8');
    expect(espace(screen.getByText(/^Au-delà du plafond de/).textContent ?? '')).toBe(
      'Au-delà du plafond de 2 000',
    );
    // Espace insécable U+00A0 des milliers, comme le design (pas U+202F).
    expect(screen.getByText('Dettes clients').nextElementSibling?.textContent).toBe(
      '−14\u00A0050 FCFA',
    );
    expect(screen.getByRole('button', { name: 'Tous · 12' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'À régler avant dimanche · 8' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plafond dépassé · 3' })).toBeTruthy();
  });

  it('classe du plus endetté au moins endetté, avec le statut de chacun', async () => {
    ouvrir('davy');
    const toutes = await lignes();
    expect(toutes).toHaveLength(12);
    expect(within(toutes[0]!).getByText('Brice')).toBeTruthy();
    expect(within(toutes[0]!).getByText('Plafond dépassé')).toBeTruthy();
    expect(espace(within(toutes[0]!).getByText(/^4.200 \/ 2.000 FCFA$/).textContent ?? '')).toBe(
      '4 200 / 2 000 FCFA',
    );
    expect(within(toutes[3]!).getByText('Dette')).toBeTruthy();
    expect(within(toutes[11]!).getByText('À jour')).toBeTruthy();
    expect(within(toutes[11]!).getByText('Aucune dette')).toBeTruthy();
  });

  it('filtre la liste et marque le filtre actif', async () => {
    ouvrir('davy');
    await lignes();
    fireEvent.click(screen.getByRole('button', { name: 'Plafond dépassé · 3' }));
    expect(await lignes()).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: 'Plafond dépassé · 3' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Tous · 12' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'À régler avant dimanche · 8' }));
    expect(await lignes()).toHaveLength(8);
  });

  it('la caissière ne relance pas', async () => {
    ouvrir('davy');
    await lignes();
    expect(screen.queryByRole('button', { name: /^Relancer/ })).toBeNull();
  });

  it('le gérant relance un client ou tous les clients en dette, avec un message', async () => {
    ouvrir('willy');
    await lignes();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer Brice' }));
    expect(
      espace((await screen.findByText(/^Relance WhatsApp envoyée à Brice/)).textContent ?? ''),
    ).toBe('Relance WhatsApp envoyée à Brice : 4 200 FCFA à régler avant dimanche.');
    expect(await screen.findByRole('button', { name: 'Relancé : Brice' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Relancer les 8 clients en dette' }));
    expect(await screen.findByText('8 relances WhatsApp envoyées')).toBeTruthy();
    expect(appels).toEqual(['relancer 7', 'relancer-groupe 8']);
  });

  it('la caissière n’a pas de bouton « Nouveau client »', async () => {
    ouvrir('davy');
    await lignes();
    expect(screen.queryByRole('button', { name: 'Nouveau client' })).toBeNull();
  });

  it('le gérant crée un client avec ses prix propres ; un numéro invalide est refusé avant l’envoi', async () => {
    let corps: Record<string, unknown> | undefined;
    ouvrir('willy', '/', [
      http.post('*/api/v1/clients/', async ({ request }) => {
        corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...CLIENTS[0], id: 99, nom: corps.nom }, { status: 201 });
      }),
    ]);
    await lignes();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau client' }));
    fireEvent.change(await screen.findByLabelText('Nom du client'), {
      target: { value: ' Chez Léa ' },
    });
    fireEvent.change(screen.getByLabelText(/^Type de client/), { target: { value: 'restaurant' } });
    fireEvent.change(screen.getByLabelText(/^Lieu/), { target: { value: 'Etoudi' } });
    fireEvent.change(screen.getByLabelText(/^Téléphone/), { target: { value: '577' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le client' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Numéro invalide/);
    expect(corps).toBeUndefined();

    fireEvent.change(screen.getByLabelText(/^Téléphone/), { target: { value: '677001234' } });
    fireEvent.change(screen.getByLabelText('Prix de la baguette'), { target: { value: '105' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le client' }));
    expect(await screen.findByText('Client Chez Léa créé')).toBeTruthy();
    expect(corps).toEqual({
      nom: 'Chez Léa',
      type: 'restaurant',
      lieu: 'Etoudi',
      telephone: '677001234',
      tarifs: { BAG: 105 },
    });
  });

  it('un refus du serveur à la création laisse la fenêtre ouverte avec un message', async () => {
    ouvrir('willy', '/', [
      http.post('*/api/v1/clients/', () =>
        HttpResponse.json({ detail: 'Erreur.' }, { status: 500 }),
      ),
    ]);
    await lignes();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau client' }));
    fireEvent.change(await screen.findByLabelText('Nom du client'), { target: { value: 'Alain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le client' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /nom du client est obligatoire|n’a pas pu/,
    );
  });

  it('ouvre le détail d’un client au clic et y place le focus', async () => {
    ouvrir('davy');
    const [brice] = await lignes();
    expect(screen.getByText(/^Sélectionnez un client/)).toBeTruthy();
    fireEvent.click(brice!);
    const titre = await screen.findByRole('heading', { name: 'Brice', level: 2 });
    expect(document.activeElement).toBe(titre);
    expect(screen.getByText('À régler avant dimanche 18 octobre')).toBeTruthy();
    expect(screen.getByText('Tarifs : BAG 100 · KO 75 · GC 135 165 FCFA')).toBeTruthy();
    expect(await screen.findByText('Livraison bon n° 128')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relevé PDF' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le relevé par WhatsApp' }));
    expect(await screen.findByText('Relevé envoyé par WhatsApp à Brice')).toBeTruthy();
    expect(appels).toEqual(['releve 7']);
  });

  it('rouvre le client et le filtre demandés dans l’adresse', async () => {
    ouvrir('willy', '/?filtre=depasse&client=3');
    expect(await lignes()).toHaveLength(3);
    expect(await screen.findByRole('heading', { name: 'Ebène', level: 2 })).toBeTruthy();
  });

  it('un clic écrit le client et le filtre dans l’adresse, un second clic referme le détail', async () => {
    ouvrir('davy');
    const [brice] = await lignes();
    fireEvent.click(brice!);
    expect(screen.getByTestId('adresse').textContent).toBe('?client=7');
    fireEvent.click(screen.getByRole('button', { name: 'Plafond dépassé · 3' }));
    expect(screen.getByTestId('adresse').textContent).toBe('?client=7&filtre=depasse');
    fireEvent.click((await lignes())[0]!);
    expect(screen.getByTestId('adresse').textContent).toBe('?filtre=depasse');
    expect(screen.queryByRole('heading', { name: 'Brice', level: 2 })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tous · 12' }));
    expect(screen.getByTestId('adresse').textContent).toBe('');
  });

  it('Échap referme le détail et rend le focus à la ligne', async () => {
    ouvrir('davy');
    fireEvent.click((await lignes())[0]!);
    const titre = await screen.findByRole('heading', { name: 'Brice', level: 2 });
    fireEvent.keyDown(titre, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Brice', level: 2 })).toBeNull();
    expect(document.activeElement?.textContent).toBe('Brice');
  });

  it('n’enlève pas le focus à l’arrivée avec ?client= dans l’adresse', async () => {
    ouvrir('davy', '/?client=7');
    const titre = await screen.findByRole('heading', { name: 'Brice', level: 2 });
    expect(document.activeElement).not.toBe(titre);
  });

  it('ignore un filtre inconnu dans l’adresse', async () => {
    ouvrir('davy', '/?filtre=nimporte');
    expect(await lignes()).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Tous · 12' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('le propriétaire relance comme le gérant', async () => {
    ouvrir('fotso');
    await lignes();
    expect(screen.getByRole('button', { name: 'Relancer les 8 clients en dette' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Relancer Brice' })).toBeTruthy();
  });

  it('signale une erreur de chargement', async () => {
    ouvrir('davy', '/', [
      http.get('*/api/v1/clients/', () => HttpResponse.json({}, { status: 500 })),
    ]);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Impossible de charger les clients.',
    );
  });

  it('une relance qui échoue ne dit pas « envoyée »', async () => {
    ouvrir('willy');
    await lignes();
    serveur.use(
      http.post('*/api/v1/clients/:id/relancer/', () => HttpResponse.json({}, { status: 500 })),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Relancer Brice' }));
    expect(await screen.findByText('La relance a échoué : réessayez.')).toBeTruthy();
    expect(screen.queryByText(/^Relance WhatsApp envoyée/)).toBeNull();
  });

  it('parle anglais', async () => {
    await changerLangue('en');
    ouvrir('willy');
    expect(await screen.findByText('Customer debts')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remind all 8 customers in debt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Due before Sunday · 8' })).toBeTruthy();
  });
});
