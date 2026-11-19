import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { consigner } from '@/simulation/journal.ts';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Ces tests jouent l'écran sur le faux serveur ; la lecture du vrai serveur est dans reel.test.tsx.
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

import { ECRANS } from '../../../navigation.ts';
import EcranJournal from './EcranJournal.tsx';

let retablir: () => void;
const JOURNAL = '/api/v1/simulation/gestion/journal/';

/** Appels du faux serveur au journal, et réponse remplacée si `surcharge` en donne une. */
function espionner(surcharge?: (url: URL) => Response | undefined) {
  const appels: string[] = [];
  const reel = globalThis.fetch;
  globalThis.fetch = async (entree, init) => {
    const url = new URL(
      entree instanceof Request ? entree.url : String(entree),
      'http://localhost',
    );
    if (url.pathname === JOURNAL) appels.push(url.search);
    const remplacee = surcharge?.(url);
    return remplacee ?? reel(entree, init);
  };
  return appels;
}

async function ouvrir(
  utilisateur: string | null = 'fotso',
  langue: 'fr' | 'en' = 'fr',
  /** Gestes joués sur le faux serveur avant l'ouverture de l'écran. */
  avant?: () => void,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  avant?.();
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'journal')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/gestion/journal']}>
          <EcranJournal ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const lignes = async () =>
  within(await screen.findByRole('list')).getAllByRole('listitem') as HTMLElement[];

/** Texte visible d'une ligne : sans les étiquettes lues par les lecteurs d'écran. */
const visible = (ligne: HTMLElement) =>
  Array.from(ligne.querySelectorAll('span'))
    .filter((s) => s.parentElement === ligne)
    .map((s) =>
      Array.from(s.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE || (n as Element).tagName !== 'SPAN')
        .map((n) => n.textContent)
        .join(''),
    )
    .join('|');

describe('Gestion › Journal : liste', () => {
  it('affiche les dix lignes de la maquette : heure, auteur · profil, action', async () => {
    await ouvrir();
    const l = await lignes();
    expect(l).toHaveLength(10);
    expect(visible(l[0]!)).toBe(
      '21:41|Davy · Caissier|Livraison Aïcha – 7 800 FCFA dû, 7 800 reçu (Orange Money)',
    );
    expect(visible(l[8]!)).toBe('17:55|Serge · Chef de production|Connexion');
    expect(visible(l[9]!)).toBe(
      '13 oct. 16:40|Willy · Gérant de la semaine|Dépense soumise : Réparation du pétrin – 65 000 FCFA',
    );
    expect(
      screen.getByRole('heading', { name: 'Toutes les actions, avec auteur et heure' }),
    ).toBeTruthy();
  });

  it('étiquette l’heure, l’auteur et l’action pour les lecteurs d’écran', async () => {
    await ouvrir();
    const premiere = (await lignes())[0]!;
    expect(premiere.textContent).toContain('Heure : 21:41');
    expect(premiere.textContent).toContain('Auteur : Davy · Caissier');
    expect(premiere.textContent).toContain('Action : Livraison Aïcha');
  });

  it('montre en tête une action faite sur un autre écran, avec son auteur et son profil', async () => {
    await ouvrir('fotso', 'fr', () =>
      consigner({
        auteur: 'Willy',
        type: 'paie',
        texte: 'Jour de paie d’octobre fixé au 2026-10-30',
      }),
    );
    const l = await lignes();
    expect(l).toHaveLength(11);
    expect(visible(l[0]!)).toBe(
      '18:02|Willy · Gérant de la semaine|Jour de paie d’octobre fixé au 2026-10-30',
    );
  });

  it('un auteur sans compte (le système) s’affiche sans profil', async () => {
    await ouvrir('fotso', 'fr', () =>
      consigner({ auteur: 'Système', type: 'production', texte: 'Archivage' }),
    );
    expect(visible((await lignes())[0]!)).toBe('18:02|Système|Archivage');
  });

  it('est traduit en anglais, y compris la date de la veille', async () => {
    await ouvrir('fotso', 'en');
    const l = await lignes();
    expect(visible(l[0]!)).toContain('Davy · Cashier');
    expect(visible(l[9]!)).toMatch(/^Oct 13 16:40\|Willy · Manager of the week\|/);
    expect(
      screen.getByRole('heading', { name: 'Every action, with author and time' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Author')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Users and groups' })).toBeTruthy();
  });

  it('ne montre que les 40 dernières actions et indique le total', async () => {
    await ouvrir('fotso', 'fr', () => {
      for (let i = 0; i < 45; i += 1)
        consigner({ auteur: 'Willy', type: 'caisse', texte: `A${i}` });
    });
    expect(await lignes()).toHaveLength(40);
    expect(await screen.findByText(/40 dernières actions affichées sur 55/)).toBeTruthy();
  });

  it('affiche l’état vide quand le journal ne contient rien', async () => {
    await ouvrir('fotso', 'fr', () => {
      const reel = globalThis.fetch;
      globalThis.fetch = async (entree, init) => {
        const url = new URL(
          entree instanceof Request ? entree.url : String(entree),
          'http://localhost',
        );
        return url.pathname === JOURNAL
          ? Response.json({ entrees: [], total: 0, auteurs: [], aujourdhui: '2026-10-14' })
          : reel(entree, init);
      };
    });
    expect(await screen.findByText('Aucune action consignée pour l’instant.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('Gestion › Journal : valeurs avant / après', () => {
  it('montre « Avant → Après » sous l’action, et « — » pour un avant vide', async () => {
    await ouvrir('fotso', 'fr', () => {
      consigner({
        auteur: 'Willy',
        type: 'paie',
        texte: 'Jour de paie d’octobre fixé au 2026-10-30',
        avant: '2026-10-29',
        apres: '2026-10-30',
      });
      consigner({
        auteur: 'Willy',
        type: 'paie',
        texte: 'Jour de paie de novembre planifié au 2026-11-30',
        avant: '',
        apres: '2026-11-30',
      });
    });
    const l = await lignes();
    expect(l[0]!.textContent).toContain('Avant : — → Après : 2026-11-30');
    expect(l[1]!.textContent).toContain('Avant : 2026-10-29 → Après : 2026-10-30');
  });
});

describe('Gestion › Journal : filtres', () => {
  it('filtre par auteur, par type et par période, et efface les filtres', async () => {
    await ouvrir();
    await lignes();
    fireEvent.change(screen.getByLabelText('Auteur'), { target: { value: 'Serge' } });
    await waitFor(async () => expect(await lignes()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    await waitFor(async () => expect(await lignes()).toHaveLength(10));

    fireEvent.change(screen.getByLabelText('Type d’action'), { target: { value: 'depense' } });
    await waitFor(async () => expect(await lignes()).toHaveLength(2));

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-10-14' } });
    await waitFor(async () => expect(await lignes()).toHaveLength(1));
  });

  it('propose les quatorze types avec leur libellé', async () => {
    await ouvrir();
    await lignes();
    const type = screen.getByLabelText('Type d’action') as HTMLSelectElement;
    const libelles = Array.from(type.options).map((o) => o.textContent);
    expect(libelles).toHaveLength(15);
    expect(libelles).toEqual(
      expect.arrayContaining(['Utilisateurs et groupes', 'Sauvegardes', 'Paramètres', 'Autres']),
    );
  });

  it('annonce le nombre de résultats dans une région d’état, pas la liste entière', async () => {
    await ouvrir();
    await lignes();
    expect((await screen.findByRole('status')).textContent).toBe('10 résultats');
    expect(document.querySelector('[aria-live]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Auteur'), { target: { value: 'Serge' } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 résultat'));
  });

  it('dit quand rien ne correspond', async () => {
    await ouvrir();
    await lignes();
    fireEvent.change(screen.getByLabelText('Auteur'), { target: { value: 'Willy' } });
    fireEvent.change(screen.getByLabelText('Type d’action'), { target: { value: 'caisse' } });
    expect(await screen.findByText('Aucune action ne correspond à ces filtres.')).toBeTruthy();
  });

  it('annonce une période inversée, relie l’erreur aux champs, n’appelle pas le serveur et l’efface à la saisie', async () => {
    await ouvrir();
    await lignes();
    const appels = espionner();
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-10-14' } });
    await waitFor(() => expect(appels).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-10-13' } });
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Le premier jour doit précéder le dernier.');
    expect(screen.getByLabelText('Au').getAttribute('aria-describedby')).toBe(alerte.id);
    expect(screen.getByLabelText('Au').getAttribute('aria-invalid')).toBe('true');
    expect(appels).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-10-14' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Au').getAttribute('aria-invalid')).toBe('false');
  });

  it('le bloc des filtres porte l’attribut que le banc visuel masque', async () => {
    await ouvrir();
    await lignes();
    expect(document.querySelector('[data-filtres-journal]')).not.toBeNull();
  });
});

describe('Gestion › Journal : droits et erreurs', () => {
  it.each([
    ['willy', 'gérant'],
    ['fotso', 'propriétaire'],
    ['admin', 'administrateur'],
  ])('est ouvert à %s (%s)', async (id) => {
    await ouvrir(id);
    expect(await lignes()).toHaveLength(10);
  });

  it.each(['davy', 'serge'])(
    'refuse le profil de %s : message, pas de liste, aucun appel au journal',
    async (id) => {
      const appels: string[] = [];
      await ouvrir(id, 'fr', () => {
        const reel = globalThis.fetch;
        globalThis.fetch = async (entree, init) => {
          const url = new URL(
            entree instanceof Request ? entree.url : String(entree),
            'http://localhost',
          );
          if (url.pathname === JOURNAL) appels.push(url.search);
          return reel(entree, init);
        };
      });
      expect((await screen.findByRole('alert')).textContent).toContain('réservé au gérant');
      expect(screen.queryByRole('list')).toBeNull();
      expect(appels).toHaveLength(0);
    },
  );

  it('dit que le journal est réservé quand personne n’est connecté', async () => {
    await ouvrir(null);
    expect((await screen.findByRole('alert')).textContent).toContain('réservé');
  });

  it('une erreur du journal affiche « Réessayer » et recharge au clic', async () => {
    let panne = true;
    await ouvrir('fotso', 'fr', () => {
      const reel = globalThis.fetch;
      globalThis.fetch = async (entree, init) => {
        const url = new URL(
          entree instanceof Request ? entree.url : String(entree),
          'http://localhost',
        );
        if (url.pathname === JOURNAL && panne) {
          return Response.json({ detail: 'Panne', code: 'panne' }, { status: 500 });
        }
        return reel(entree, init);
      };
    });
    expect(await screen.findByText(/Le journal n’a pas pu être chargé/)).toBeTruthy();
    panne = false;
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await lignes()).toHaveLength(10);
  });

  it('un serveur injoignable affiche l’erreur et « Réessayer »', async () => {
    await ouvrir('fotso', 'fr', () => {
      const reel = globalThis.fetch;
      globalThis.fetch = async (entree, init) => {
        const url = new URL(
          entree instanceof Request ? entree.url : String(entree),
          'http://localhost',
        );
        if (url.pathname === '/api/v1/users/me/') throw new TypeError('Failed to fetch');
        return reel(entree, init);
      };
    });
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
