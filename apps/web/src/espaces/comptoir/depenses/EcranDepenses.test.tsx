import { configurerApi, ErreurApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { File as NodeFile } from 'node:buffer';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';
import EcranDepenses from './EcranDepenses.tsx';
import { AMPOULES, DEPART, GROSSE } from './instantanes.test-donnees.ts';
import type { InstantaneDepenses } from './types.ts';

/*
 * L'écran Dépenses rendu depuis des instantanés au format de l'écran ; la composition de
 * l'instantané à partir des routes du serveur est testée dans reel.test.tsx. L'enregistrement d'une
 * dépense (`POST /depenses/`, multipart avec le justificatif) appelle un faux serveur au format de
 * l'API réelle, dont la réponse fait passer le « serveur » à l'instantané suivant. La personne
 * connectée vient de `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lireDepensesReelles: vi.fn() }));
vi.mock('./reel.ts', async (original) => ({
  ...(await original<typeof import('./reel.ts')>()),
  lireDepensesReelles: lecture.lireDepensesReelles,
}));

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES: Record<string, { id: number; nom: string; profil: Profil }> = {
  davy: { id: 1, nom: 'Davy', profil: 'caissier' },
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  serge: { id: 4, nom: 'Serge', profil: 'production' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
};

/** L'instantané côté « serveur », la personne connectée, les envois reçus. */
let etat: InstantaneDepenses;
let connecte: string;
let envois: Array<{ categorie: string; libelle: string; montant: string; justificatif: boolean }>;

beforeEach(() => {
  etat = structuredClone(DEPART);
  envois = [];
  lecture.lireDepensesReelles.mockReset();
  lecture.lireDepensesReelles.mockImplementation(async () => {
    if (connecte === 'serge') {
      throw new ErreurApi(403, { detail: 'Refusé.', code: 'droit_insuffisant' });
    }
    return structuredClone(etat);
  });
});

function installerServeur() {
  serveur.use(
    http.get('*/api/v1/users/me/', () => {
      const p = PERSONNES[connecte]!;
      return HttpResponse.json({
        id: p.id,
        name: p.nom,
        email: 'x@optiboul.local',
        url: `http://localhost/api/v1/users/${p.id}/`,
        profil: p.profil,
      });
    }),
    http.post('*/api/v1/depenses/', async ({ request }) => {
      // Corps multipart lu comme du texte : un champ par bloc « name="…" ».
      const texte = await request.text();
      const champ = (nom: string) =>
        new RegExp(
          `name="${nom}"(?:; filename="[^"]*")?\r?\n(?:[^\r\n]+\r?\n)*\r?\n([^\r\n]*)`,
        ).exec(texte)?.[1] ?? null;
      envois.push({
        categorie: String(champ('categorie')),
        libelle: String(champ('libelle')),
        montant: String(champ('montant')),
        justificatif: texte.includes('name="justificatif"'),
      });
      if (connecte === 'serge') {
        return HttpResponse.json(
          {
            detail: 'Votre profil ne permet pas d’enregistrer une dépense.',
            code: 'droit_insuffisant',
          },
          { status: 403 },
        );
      }
      const attente = Number(champ('montant')) >= 50000;
      etat = structuredClone(attente ? GROSSE : AMPOULES);
      return HttpResponse.json({ id: 17, demande: attente ? 'DEM-022' : null }, { status: 201 });
    }),
  );
}

async function ouvrir(utilisateur = 'davy', langue: 'fr' | 'en' = 'fr') {
  connecte = utilisateur;
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
  const espace = utilisateur === 'davy' ? 'comptoir' : 'gestion';
  const ecran = ECRANS.find((e) => e.espace === espace && e.cle === 'depenses')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[`/${espace}/depenses`]}>
          <EcranDepenses ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  if (utilisateur === 'serge') return;
  await screen.findByText(/^DEP-0016/);
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });
const lignes = () =>
  within(screen.getByRole('region', { name: 'Liste des dépenses' })).getAllByRole('listitem');

describe('Comptoir › Dépenses (caissière)', () => {
  beforeEach(() => ouvrir());

  it('affiche le budget du mois, le formulaire et les huit dépenses', () => {
    expect(screen.getByRole('heading', { name: 'Budget d’octobre par catégorie' })).toBeTruthy();
    expect(screen.getByText('3 349 500 / 7 860 000 FCFA · 43 %')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nouvelle dépense' })).toBeTruthy();
    expect(
      screen.getByText('Saisie par Davy · Caissier · Semaine 42 · 12 oct. → 18 oct.'),
    ).toBeTruthy();
    expect(lignes()).toHaveLength(8);
    expect(screen.getByText('8 dépenses · 381 500 FCFA')).toBeTruthy();
  });

  it('signale la catégorie dépassée et celle qui est dans les clous', () => {
    const technique = screen.getByText('Technique', { selector: 'span' }).closest('li')!;
    expect(within(technique).getByText('Dépassé')).toBeTruthy();
    const eau = screen.getByText('Eau', { selector: 'span' }).closest('li')!;
    expect(within(eau).getByText('OK')).toBeTruthy();
  });

  it('rattache par défaut à la production en cours et propose le stock avec ses champs', () => {
    expect(
      screen.getByRole('button', { name: /Production · Nuit du 14 oct\./, pressed: true }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Quantité entrée')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Entrée de stock' }));
    expect(screen.getByLabelText('Quantité entrée')).toBeTruthy();
    saisir(screen.getByLabelText('Matière'), 'glace');
    const fournisseurs = within(screen.getByLabelText('Fournisseur')).getAllByRole('option');
    expect(fournisseurs.map((o) => o.textContent)).toEqual([
      'Achat au marché',
      'Glacière d’Olembé',
    ]);
  });

  it('refuse un libellé vide, puis un montant vide, puis une quantité de stock vide', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    expect(screen.getByRole('alert').textContent).toBe('Indiquez le libellé de la dépense.');
    saisir(screen.getByLabelText('Libellé'), 'Sel');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    expect(screen.getByRole('alert').textContent).toBe('Indiquez un montant en FCFA.');
    saisir(screen.getByLabelText('Montant (FCFA)'), '3000');
    fireEvent.click(screen.getByRole('button', { name: 'Entrée de stock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    expect(screen.getByRole('alert').textContent).toBe('Indiquez la quantité entrée en stock.');
    expect(lignes()).toHaveLength(8);
    expect(envois).toEqual([]);
  });

  it('enregistre une dépense : DEP-0017 en tête, formulaire vidé, budget mis à jour', async () => {
    saisir(screen.getByLabelText('Catégorie'), 'electricite');
    saisir(screen.getByLabelText('Libellé'), 'Ampoules');
    saisir(screen.getByLabelText('Montant (FCFA)'), '20 000');
    // Sur le vrai serveur, le justificatif est une photo : l'appareil ou la galerie fournit le fichier.
    fireEvent.change(screen.getByTestId('justificatif'), {
      // Le File de Node (et non celui de jsdom) traverse le corps multipart du faux serveur.
      target: { files: [new NodeFile(['x'], 'ticket.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    await screen.findByText('DEP-0017 · Ampoules');
    expect(lignes()).toHaveLength(9);
    expect(lignes()[0]!.textContent).toContain('Électricité · Production · Nuit du 14 oct.');
    expect(lignes()[0]!.textContent).toContain(
      'Saisie par Davy · Caissier · 14 oct. · caisse · justificatif joint',
    );
    expect(lignes()[0]!.textContent).toContain('Validée');
    expect((screen.getByLabelText('Libellé') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Montant (FCFA)') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Prendre le justificatif en photo' })).toBeTruthy();
    // 148 500 + 20 000 sur 180 000 : 93 % du budget d'électricité, « à surveiller ».
    const electricite = screen.getByText('Électricité', { selector: 'span' }).closest('li')!;
    expect(within(electricite).getByText('À surveiller')).toBeTruthy();
    expect(envois).toEqual([
      { categorie: 'electricite', libelle: 'Ampoules', montant: '20000', justificatif: true },
    ]);
  });

  it('au-delà du seuil, la dépense attend le gérant de la semaine', async () => {
    saisir(screen.getByLabelText('Libellé'), 'Grosse réparation');
    saisir(screen.getByLabelText('Montant (FCFA)'), '50000');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    await screen.findByText('DEP-0017 · Grosse réparation');
    expect(lignes()[0]!.textContent).toContain('En attente');
    expect(lignes()[0]!.textContent).toContain(
      'DEM-022 · en attente du gérant de la semaine (Willy)',
    );
    expect(lignes()[0]!.textContent).toContain('sans justificatif');
  });

  it('filtre par semaine et par rattachement, et annonce le total', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Semaine 41' }));
    expect(lignes()).toHaveLength(4);
    expect(screen.getByText('4 dépenses · 265 500 FCFA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stock' }));
    expect(screen.getByText('Aucune dépense pour ce filtre.')).toBeTruthy();
    expect(screen.getByText('0 dépenses · 0 FCFA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les semaines' }));
    expect(lignes()).toHaveLength(2);
    expect(screen.getByText(/Stock · Levure \+5\s?000 g/)).toBeTruthy();
    expect(screen.getByText(/Stock · Bois \+1 chargements/)).toBeTruthy();
  });

  it('la ligne du pétrin montre sa demande en attente', () => {
    expect(
      screen.getByRole('button', { name: 'DEM-021 · en attente du propriétaire' }),
    ).toBeTruthy();
  });

  it('expose les filtres comme des groupes et les choix comme des boutons à bascule', () => {
    expect(screen.getByRole('group', { name: 'Filtrer par semaine' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Filtrer par rattachement' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Toutes les semaines' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Caisse' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('range une erreur du serveur dans la zone d’alerte', async () => {
    saisir(screen.getByLabelText('Libellé'), 'Sel');
    saisir(screen.getByLabelText('Montant (FCFA)'), '1000');
    // Le serveur est interrogé : il rejette après la validation locale.
    connecte = 'serge';
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Votre profil ne permet pas d’enregistrer une dépense.',
      ),
    );
  });
});

describe('Comptoir › Dépenses (gérant)', () => {
  beforeEach(() => ouvrir('willy'));

  it('rattache par défaut à la semaine et vient de la direction', () => {
    expect(
      screen.getByRole('button', { name: /Semaine 42 \(frais généraux\)/, pressed: true }),
    ).toBeTruthy();
    expect(
      screen.getByText('Saisie par Willy · Gérant de la semaine · Semaine 42 · 12 oct. → 18 oct.'),
    ).toBeTruthy();
  });
});

describe('Comptoir › Dépenses : annuler une dépense en attente', () => {
  it('le gérant annule la réparation du pétrin avec un motif ; sans motif, la fenêtre refuse', async () => {
    let corps: Record<string, unknown> | undefined;
    serveur.use(
      http.post('*/api/v1/depenses/:id/annuler/', async ({ request }) => {
        corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 14 });
      }),
    );
    await ouvrir('willy');
    expect(screen.getAllByRole('button', { name: /^Annuler la dépense DEP-/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler la dépense DEP-0014' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler la dépense' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/motif est obligatoire/);
    saisir(screen.getByLabelText('Motif de l’annulation'), 'Doublon');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler la dépense' }));
    expect(await screen.findByText('Dépense annulée')).toBeTruthy();
    expect(corps).toEqual({ motif: 'Doublon' });
  });
});

describe('Comptoir › Dépenses (propriétaire)', () => {
  beforeEach(() => ouvrir('fotso'));

  it('consulte le budget et la liste mais n’a pas de formulaire de saisie', () => {
    expect(screen.getByRole('heading', { name: /Budget/ })).toBeTruthy();
    expect(lignes()).toHaveLength(8);
    expect(screen.queryByRole('heading', { name: 'Nouvelle dépense' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enregistrer la dépense' })).toBeNull();
  });
});

describe('Comptoir › Dépenses (anglais)', () => {
  beforeEach(() => ouvrir('davy', 'en'));

  it('traduit le budget, le formulaire et la liste', () => {
    expect(screen.getByRole('heading', { name: 'October budget by category' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'New expense' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeTruthy();
    expect(screen.getByText('8 expenses · 381 500 FCFA')).toBeTruthy();
    expect(screen.getByText(/Stock · Yeast \+5,?000 g/)).toBeTruthy();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });
});

describe('Comptoir › Dépenses (accès refusé)', () => {
  it('affiche l’écran d’erreur quand le serveur répond 403', async () => {
    await ouvrir('serge');
    expect(await screen.findByText('Impossible de charger les dépenses.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer la dépense' })).toBeNull();
  });
});

describe('Comptoir › Dépenses (erreurs de saisie)', () => {
  beforeEach(() => ouvrir());

  it('place le focus sur le premier champ fautif', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Libellé'));
    saisir(screen.getByLabelText('Libellé'), 'Sel');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Montant (FCFA)'));
    saisir(screen.getByLabelText('Montant (FCFA)'), '3000');
    fireEvent.click(screen.getByRole('button', { name: 'Entrée de stock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Quantité entrée'));
  });

  it('efface l’erreur du serveur dès qu’on modifie un champ', async () => {
    saisir(screen.getByLabelText('Libellé'), 'Sel');
    saisir(screen.getByLabelText('Montant (FCFA)'), '1000');
    connecte = 'serge';
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).not.toBe(''));
    saisir(screen.getByLabelText('Libellé'), 'Sel fin');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
