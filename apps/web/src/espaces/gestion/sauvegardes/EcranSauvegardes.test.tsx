import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranSauvegardes from './EcranSauvegardes.tsx';

/*
 * L'écran Sauvegardes joué sur un faux serveur au format de l'API réelle (MSW) : état, liste,
 * lancement d'une copie, restauration guidée, refus et gardes. La lecture des routes elles-mêmes est
 * testée dans reel.test.tsx.
 */

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

type Copie = {
  id: number;
  genre: 'locale' | 'cloud';
  declencheur: string;
  statut: string;
  fin: string | null;
};

const MAINTENANT = '2026-10-14T17:02:00Z';
const copie = (id: number, genre: 'locale' | 'cloud', declencheur: string, fin: string): Copie => ({
  id,
  genre,
  declencheur,
  statut: 'reussie',
  fin,
});

/** Quatre copies, comme la maquette : la dernière cloud date de plus de 48 h. */
const COPIES_DE_DEPART = (): Copie[] => [
  copie(4, 'locale', 'planifiee', '2026-10-14T12:30:00Z'),
  copie(3, 'locale', 'cloture_caisse', '2026-10-13T12:30:00Z'),
  copie(2, 'cloud', 'planifiee', '2026-10-12T16:52:00Z'),
  copie(1, 'locale', 'planifiee', '2026-10-12T08:30:00Z'),
];

const appels = { lectures: 0, lancer: [] as unknown[], restaurer: 0 };
let copies: Copie[] = [];
let prochainId = 5;

const complete = (c: Copie) => ({
  ...c,
  source: null,
  emplacement: `/sauvegardes/${c.id}.dump`,
  taille: 1024,
  erreur: '',
  debut: c.fin,
});
const derniere = (genre: 'locale' | 'cloud') =>
  copies
    .filter((c) => c.genre === genre && c.statut === 'reussie')
    .sort((a, b) => (b.fin ?? '').localeCompare(a.fin ?? ''))[0]?.fin ?? null;

/** Le faux serveur : lectures cohérentes avec les copies créées, lancement suivi, restauration. */
function fauxServeur(options: { administrateur?: boolean } = {}) {
  const administrateur = options.administrateur ?? true;
  copies = COPIES_DE_DEPART();
  prochainId = 5;
  appels.lectures = 0;
  appels.lancer = [];
  appels.restaurer = 0;
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: 1,
        name: administrateur ? 'Admin Dev' : 'Willy Gérant',
        email: 'x@optiboul.local',
        url: 'http://localhost/api/v1/users/1/',
        profil: administrateur ? 'administrateur' : 'gerant',
      }),
    ),
    http.get('*/api/v1/sauvegardes/', () => {
      appels.lectures += 1;
      if (!administrateur) {
        return HttpResponse.json({ detail: 'x', code: 'droit_insuffisant' }, { status: 403 });
      }
      return HttpResponse.json({
        count: copies.length,
        next: null,
        previous: null,
        results: copies.map(complete),
      });
    }),
    http.get('*/api/v1/sauvegardes/etat/', () => {
      if (!administrateur) {
        return HttpResponse.json({ detail: 'x', code: 'droit_insuffisant' }, { status: 403 });
      }
      const cloud = derniere('cloud');
      return HttpResponse.json({
        derniere_locale: derniere('locale'),
        derniere_cloud: cloud,
        cloud_en_retard:
          cloud === null || Date.parse(MAINTENANT) - Date.parse(cloud) > 48 * 3_600_000,
        seuil_alerte_heures: 48,
        derniere_echec: null,
      });
    }),
    http.post('*/api/v1/sauvegardes/lancer/', async ({ request }) => {
      const { genre } = (await request.json()) as { genre: 'locale' | 'cloud' };
      appels.lancer.push(genre);
      const nouvelle = copie(prochainId, genre, 'manuelle', new Date().toISOString());
      prochainId += 1;
      copies = [nouvelle, ...copies];
      return HttpResponse.json({ id: nouvelle.id, genre, statut: 'en_cours' }, { status: 202 });
    }),
    http.get('*/api/v1/sauvegardes/:id/', ({ params }) => {
      const trouvee = copies.find((c) => String(c.id) === params.id);
      return trouvee
        ? HttpResponse.json(complete(trouvee))
        : HttpResponse.json({ detail: 'x', code: 'sauvegarde_inconnue' }, { status: 404 });
    }),
    http.post('*/api/v1/sauvegardes/:id/restaurer/', ({ params }) => {
      appels.restaurer += 1;
      const avant = copie(prochainId, 'locale', 'avant_restauration', new Date().toISOString());
      prochainId += 1;
      copies = [avant, ...copies];
      return HttpResponse.json({
        copie_avant: complete(avant),
        controles: [
          { cle: 'sessions', ok: true, avant: 3, apres: 3 },
          { cle: 'soldes_clients', ok: true, avant: 100, apres: 100 },
          { cle: 'stocks', ok: true, avant: 9, apres: 9 },
        ],
        restauration: {
          id: 7,
          statut: 'terminee',
          sauvegarde: Number(params.id),
          copie_de_surete: avant.id,
        },
      });
    }),
  );
}

async function ouvrir(options: { administrateur?: boolean; langue?: 'fr' | 'en' } = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(MAINTENANT));
  await initI18n('fr').changeLanguage(options.langue ?? 'fr');
  fauxServeur(options);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'sauvegardes')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/gestion/sauvegardes']}>
          <EcranSauvegardes ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const copieDuJour = 'Restaurer la copie du 14 oct. 13:30';

describe('Gestion › Sauvegardes : état', () => {
  it('affiche les cartes, le bandeau des 48 h et les quatre copies', async () => {
    await ouvrir();
    expect(await screen.findByText('Copie locale')).toBeTruthy();
    expect(screen.getByText('14 oct. 13:30', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('Copie cloud')).toBeTruthy();
    expect(screen.getByText('En retard')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'Aucune copie cloud depuis plus de 48 h (dernière : 12 oct. 17:52).',
    );
    const liste = screen.getByRole('list');
    expect(within(liste).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('button', { name: copieDuJour })).toBeTruthy();
  });

  it('existe en anglais', async () => {
    await ouvrir({ langue: 'en' });
    expect(await screen.findByText('Local copy')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start cloud backup' })).toBeTruthy();
  });

  it('affiche une erreur quand le serveur refuse (profil sans droit)', async () => {
    await ouvrir({ administrateur: false });
    expect(await screen.findByText('Impossible de lire les sauvegardes. Réessayez.')).toBeTruthy();
  });
});

describe('Gestion › Sauvegardes : sauvegarder', () => {
  it('lance une copie locale : le genre est envoyé, toast et nouvelle copie en tête', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Sauvegarder maintenant' }));
    expect(await screen.findByText('Copie locale faite à 18:02')).toBeTruthy();
    expect(appels.lancer).toEqual(['locale']);
    await waitFor(() => expect(copies).toHaveLength(5));
    expect(screen.getByText('14 oct. 18:02', { selector: 'div' })).toBeTruthy();
  });

  it('une seule copie malgré deux clics rapides', async () => {
    await ouvrir();
    const bouton = await screen.findByRole('button', { name: 'Sauvegarder maintenant' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Copie locale faite à 18:02');
    expect(appels.lancer).toEqual(['locale']);
  });

  it('lance une copie cloud : le bandeau disparaît et la pastille passe à « À jour »', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la sauvegarde cloud' }));
    expect(await screen.findByText('Copie cloud envoyée et vérifiée')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('À jour')).toBeTruthy();
    expect(appels.lancer).toEqual(['cloud']);
  });

  it('hors ligne : la copie cloud ne part pas, un message le dit', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    await ouvrir();
    expect(
      await screen.findByText('Hors ligne : la copie partira au retour d’internet'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la sauvegarde cloud' }));
    expect(await screen.findByText('Hors ligne : sauvegarde cloud en attente')).toBeTruthy();
    expect(appels.lancer).toEqual([]);
    // La copie locale reste possible.
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder maintenant' }));
    await screen.findByText('Copie locale faite à 18:02');
  });

  it('un refus du serveur à la copie locale : message du serveur, état relu', async () => {
    await ouvrir();
    serveur.use(
      http.post('*/api/v1/sauvegardes/lancer/', () =>
        HttpResponse.json(
          { detail: 'Une copie est déjà en cours.', code: 'copie_en_cours' },
          { status: 409 },
        ),
      ),
    );
    const avant = appels.lectures;
    fireEvent.click(await screen.findByRole('button', { name: 'Sauvegarder maintenant' }));
    expect(await screen.findByText('Une copie est déjà en cours.')).toBeTruthy();
    await waitFor(() => expect(appels.lectures).toBeGreaterThan(avant));
    expect(copies).toHaveLength(4);
  });
});

describe('Gestion › Sauvegardes : restauration guidée', () => {
  const ouvrirLaFenetre = async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: copieDuJour }));
    return screen.findByRole('dialog');
  };
  const confirmer = (fenetre: HTMLElement) =>
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Restaurer cette copie' }));

  it('annonce les trois étapes avec la date de la copie, sans rien restaurer encore', async () => {
    const fenetre = await ouvrirLaFenetre();
    expect(within(fenetre).getByText('Restauration guidée')).toBeTruthy();
    expect(
      within(fenetre).getByText('Une copie de l’état actuel est faite automatiquement.'),
    ).toBeTruthy();
    expect(within(fenetre).getByText('La copie du 14 oct. 13:30 est restaurée.')).toBeTruthy();
    expect(
      within(fenetre).getByText('Les totaux sont vérifiés : sessions, soldes clients, stocks.'),
    ).toBeTruthy();
    expect(appels.restaurer).toBe(0);
  });

  it('annuler ferme la fenêtre sans rien changer', async () => {
    const fenetre = await ouvrirLaFenetre();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(appels.restaurer).toBe(0);
  });

  it('confirmer restaure une seule fois (même après deux clics) et annonce les totaux vérifiés', async () => {
    const fenetre = await ouvrirLaFenetre();
    const bouton = within(fenetre).getByRole('button', { name: 'Restaurer cette copie' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    expect(
      await screen.findByText(
        'Restauration terminée : sessions, soldes clients et stocks vérifiés.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(appels.restaurer).toBe(1);
  });

  it('un contrôle qui ne concorde pas est annoncé', async () => {
    const fenetre = await ouvrirLaFenetre();
    serveur.use(
      http.post('*/api/v1/sauvegardes/:id/restaurer/', () =>
        HttpResponse.json({
          copie_avant: complete(copie(9, 'locale', 'avant_restauration', MAINTENANT)),
          controles: [
            { cle: 'sessions', ok: true, avant: 3, apres: 3 },
            { cle: 'soldes_clients', ok: false, avant: 100, apres: 90 },
            { cle: 'stocks', ok: true, avant: 9, apres: 9 },
          ],
          restauration: { id: 7, statut: 'terminee', sauvegarde: 4, copie_de_surete: 9 },
        }),
      ),
    );
    confirmer(fenetre);
    expect(
      await screen.findByText(
        'Restauration terminée, mais le contrôle ne concorde pas : soldes clients.',
      ),
    ).toBeTruthy();
  });

  it('refus du droit (403) : message dans la fenêtre, fenêtre ouverte, état relu', async () => {
    const fenetre = await ouvrirLaFenetre();
    serveur.use(
      http.post('*/api/v1/sauvegardes/:id/restaurer/', () =>
        HttpResponse.json({ detail: 'x', code: 'droit_insuffisant' }, { status: 403 }),
      ),
    );
    const avant = appels.lectures;
    confirmer(fenetre);
    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toBe('Votre profil ne permet pas cette action.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(appels.lectures).toBeGreaterThan(avant));
  });

  it('copie disparue (404) : la fenêtre se ferme, un message le dit, la liste est relue', async () => {
    const fenetre = await ouvrirLaFenetre();
    serveur.use(
      http.post('*/api/v1/sauvegardes/:id/restaurer/', () =>
        HttpResponse.json({ detail: 'x', code: 'sauvegarde_inconnue' }, { status: 404 }),
      ),
    );
    const avant = appels.lectures;
    confirmer(fenetre);
    expect(
      await screen.findByText('Cette copie n’existe plus : la liste vient d’être actualisée.'),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(appels.lectures).toBeGreaterThan(avant));
  });

  it('restauration impossible : la cause donnée par le serveur est dans la fenêtre, base inchangée', async () => {
    const fenetre = await ouvrirLaFenetre();
    serveur.use(
      http.post('*/api/v1/sauvegardes/:id/restaurer/', () =>
        HttpResponse.json(
          {
            detail: 'Restauration impossible, base inchangée : pg_restore introuvable',
            code: 'restauration_impossible',
          },
          { status: 409 },
        ),
      ),
    );
    confirmer(fenetre);
    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toContain('pg_restore introuvable');
    // On peut réessayer : le bouton est de nouveau actif et décrit par l'erreur.
    const bouton = within(fenetre).getByRole('button', { name: 'Restaurer cette copie' });
    expect(bouton.getAttribute('aria-disabled')).toBe('false');
    expect(bouton.getAttribute('aria-describedby')).toBe(alerte.id);
  });

  it('Échap ferme la fenêtre ; le focus revient au bouton qui l’a ouverte', async () => {
    await ouvrir();
    const declencheur = await screen.findByRole('button', { name: copieDuJour });
    declencheur.focus();
    fireEvent.click(declencheur);
    const fenetre = await screen.findByRole('dialog');
    expect(fenetre.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(declencheur);
  });

  it('Tab reste dans la fenêtre : de la dernière à la première, Maj+Tab dans l’autre sens', async () => {
    const fenetre = await ouvrirLaFenetre();
    const annuler = within(fenetre).getByRole('button', { name: 'Annuler' });
    const valider = within(fenetre).getByRole('button', { name: 'Restaurer cette copie' });
    valider.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(annuler);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(valider);
  });

  it('pendant l’envoi, Échap et Annuler ne ferment pas la fenêtre', async () => {
    const fenetre = await ouvrirLaFenetre();
    let liberer: () => void = () => undefined;
    serveur.use(
      http.post('*/api/v1/sauvegardes/:id/restaurer/', async () => {
        await new Promise<void>((fait) => {
          liberer = fait;
        });
        return HttpResponse.json({
          copie_avant: complete(copie(9, 'locale', 'avant_restauration', MAINTENANT)),
          controles: [{ cle: 'sessions', ok: true, avant: 1, apres: 1 }],
          restauration: { id: 7, statut: 'terminee', sauvegarde: 4, copie_de_surete: 9 },
        });
      }),
    );
    confirmer(fenetre);
    await waitFor(() =>
      expect(
        within(fenetre).getByRole('button', { name: 'Annuler' }).getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    liberer();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
