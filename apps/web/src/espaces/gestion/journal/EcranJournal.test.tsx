import { configurerApi, ErreurApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';
import EcranJournal from './EcranJournal.tsx';
import {
  LIMITE_AFFICHEE,
  type EntreeJournal,
  type FiltresJournal,
  type InstantaneJournal,
  type TypeAction,
} from './types.ts';

/*
 * L'écran Journal rendu depuis le modèle de l'écran ; la conversion des lignes du serveur
 * (`journal/`, `journal/acteurs/`) est testée dans reel.test.tsx et mapping.test.ts. La personne
 * connectée (droits) vient de `users/me/`, sur un faux serveur au format de l'API réelle.
 */

const lecture = vi.hoisted(() => ({ lireJournalReel: vi.fn() }));
vi.mock('./reel.ts', () => lecture);

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const AUJOURDHUI = '2026-10-14';
const VEILLE = '2026-10-13';

const PROFILS: Record<string, { nom: string; profil: Profil }> = {
  davy: { nom: 'Davy', profil: 'caissier' },
  serge: { nom: 'Serge', profil: 'production' },
  willy: { nom: 'Willy', profil: 'gerant' },
  fotso: { nom: 'M. Fotso', profil: 'proprietaire' },
  admin: { nom: 'Support OptiBoul', profil: 'administrateur' },
};

const PROFIL_DE_L_AUTEUR: Record<string, Profil | null> = {
  Davy: 'caissier',
  Serge: 'production',
  Willy: 'gerant',
};

function entree(
  rang: number,
  jour: string,
  heure: string,
  auteur: string,
  type: TypeAction,
  texte: string,
  changement?: { avant: string; apres: string },
): EntreeJournal {
  return {
    id: `J-${rang}`,
    quand: new Date(`${jour}T${heure}:00+01:00`).toISOString(),
    jour,
    heure,
    auteur,
    profil: PROFIL_DE_L_AUTEUR[auteur] ?? null,
    type,
    texte,
    ...(changement ?? {}),
  };
}

/** Les dix lignes de la maquette : neuf de la session du jour, une de la veille. */
const DEPART = (): EntreeJournal[] =>
  (
    [
      [
        AUJOURDHUI,
        '21:41',
        'Davy',
        'session',
        'Livraison Aïcha – 7 800 FCFA dû, 7 800 reçu (Orange Money)',
      ],
      [AUJOURDHUI, '21:28', 'Davy', 'session', 'Livraison Hervé – 11 550 FCFA dû, 11 550 reçu'],
      [
        AUJOURDHUI,
        '21:15',
        'Davy',
        'session',
        'Livraison Mama Ngono – 16 700 FCFA dû, 16 700 reçu (MTN MoMo)',
      ],
      [AUJOURDHUI, '21:02', 'Davy', 'session', 'Livraison White – 10 700 FCFA dû, 10 200 reçu'],
      [AUJOURDHUI, '20:51', 'Davy', 'session', 'Livraison Alex – 12 200 FCFA dû, 12 200 reçu'],
      [AUJOURDHUI, '20:30', 'Davy', 'session', 'Mouvement interne : ration 12 BAG'],
      [AUJOURDHUI, '19:10', 'Davy', 'depense', 'Dépense : Levure – 25 000 FCFA'],
      [AUJOURDHUI, '18:02', 'Davy', 'session', 'Ouverture de la session de nuit du 14 oct.'],
      [AUJOURDHUI, '17:55', 'Serge', 'connexion', 'Connexion'],
      [VEILLE, '16:40', 'Willy', 'depense', 'Dépense soumise : Réparation du pétrin – 65 000 FCFA'],
    ] as const
  ).map(([jour, heure, auteur, type, texte], rang) =>
    entree(rang + 1, jour, heure, auteur, type, texte),
  );

/** Le registre du « serveur », les plus récentes en premier. */
let registre: EntreeJournal[];
let connecte: string | null;

/** Ce que fait le serveur : filtres (auteur, type, période), limite et total. */
function lireLeRegistre(filtres: FiltresJournal): InstantaneJournal {
  const retenues = registre.filter(
    (e) =>
      (!filtres.auteur || e.auteur === filtres.auteur) &&
      (!filtres.type || e.type === filtres.type) &&
      (!filtres.du || e.jour >= filtres.du) &&
      (!filtres.au || e.jour <= filtres.au),
  );
  return {
    entrees: retenues.slice(0, LIMITE_AFFICHEE),
    total: retenues.length,
    auteurs: [...new Set(registre.map((e) => e.auteur))].sort(),
    aujourdhui: AUJOURDHUI,
  };
}

beforeEach(() => {
  registre = DEPART();
  lecture.lireJournalReel.mockReset();
  lecture.lireJournalReel.mockImplementation(async (filtres: FiltresJournal) =>
    lireLeRegistre(filtres),
  );
});

async function ouvrir(utilisateur: string | null = 'fotso', langue: 'fr' | 'en' = 'fr') {
  connecte = utilisateur;
  await initI18n('fr').changeLanguage(langue);
  serveur.use(
    http.get('*/api/v1/users/me/', () => {
      const personne = connecte ? PROFILS[connecte] : undefined;
      return personne
        ? HttpResponse.json({
            id: 1,
            name: personne.nom,
            email: 'x@optiboul.local',
            url: 'http://localhost/api/v1/users/1/',
            profil: personne.profil,
          })
        : HttpResponse.json({ detail: 'Non connecté.' }, { status: 403 });
    }),
  );
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
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
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
    registre.unshift(
      entree(11, AUJOURDHUI, '18:02', 'Willy', 'paie', 'Jour de paie d’octobre fixé au 2026-10-30'),
    );
    await ouvrir();
    const l = await lignes();
    expect(l).toHaveLength(11);
    expect(visible(l[0]!)).toBe(
      '18:02|Willy · Gérant de la semaine|Jour de paie d’octobre fixé au 2026-10-30',
    );
  });

  it('un auteur sans compte (le système) s’affiche sans profil', async () => {
    registre.unshift(entree(11, AUJOURDHUI, '18:02', 'Système', 'production', 'Archivage'));
    await ouvrir();
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
    for (let i = 0; i < 45; i += 1) {
      registre.unshift(entree(100 + i, AUJOURDHUI, '19:00', 'Willy', 'caisse', `A${i}`));
    }
    await ouvrir();
    expect(await lignes()).toHaveLength(40);
    expect(await screen.findByText(/40 dernières actions affichées sur 55/)).toBeTruthy();
  });

  it('affiche l’état vide quand le journal ne contient rien', async () => {
    registre = [];
    await ouvrir();
    expect(await screen.findByText('Aucune action consignée pour l’instant.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('Gestion › Journal : valeurs avant / après', () => {
  it('montre « Avant → Après » sous l’action, et « — » pour un avant vide', async () => {
    registre.unshift(
      entree(
        12,
        AUJOURDHUI,
        '18:03',
        'Willy',
        'paie',
        'Jour de paie de novembre planifié au 2026-11-30',
        {
          avant: '',
          apres: '2026-11-30',
        },
      ),
      entree(
        11,
        AUJOURDHUI,
        '18:02',
        'Willy',
        'paie',
        'Jour de paie d’octobre fixé au 2026-10-30',
        {
          avant: '2026-10-29',
          apres: '2026-10-30',
        },
      ),
    );
    await ouvrir();
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

    fireEvent.change(screen.getByLabelText('Du'), { target: { value: AUJOURDHUI } });
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
    const avant = lecture.lireJournalReel.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: AUJOURDHUI } });
    await waitFor(() => expect(lecture.lireJournalReel.mock.calls.length).toBe(avant + 1));
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: VEILLE } });
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Le premier jour doit précéder le dernier.');
    expect(screen.getByLabelText('Au').getAttribute('aria-describedby')).toBe(alerte.id);
    expect(screen.getByLabelText('Au').getAttribute('aria-invalid')).toBe('true');
    expect(lecture.lireJournalReel.mock.calls.length).toBe(avant + 1);
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: AUJOURDHUI } });
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
      await ouvrir(id);
      expect((await screen.findByRole('alert')).textContent).toContain('réservé au gérant');
      expect(screen.queryByRole('list')).toBeNull();
      expect(lecture.lireJournalReel).not.toHaveBeenCalled();
    },
  );

  it('dit que le journal est réservé quand personne n’est connecté', async () => {
    await ouvrir(null);
    expect((await screen.findByRole('alert')).textContent).toContain('réservé');
  });

  it('une erreur du journal affiche « Réessayer » et recharge au clic', async () => {
    lecture.lireJournalReel.mockRejectedValueOnce(
      new ErreurApi(500, { detail: 'Panne', code: 'panne' }),
    );
    await ouvrir();
    expect(await screen.findByText(/Le journal n’a pas pu être chargé/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await lignes()).toHaveLength(10);
  });

  it('un serveur injoignable affiche l’erreur et « Réessayer »', async () => {
    await ouvrir('fotso');
    await lignes();
    cleanup();
    serveur.use(http.get('*/api/v1/users/me/', () => HttpResponse.error()));
    render(
      <OptiboulProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter initialEntries={['/gestion/journal']}>
            <EcranJournal
              ecran={ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'journal')!}
            />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
