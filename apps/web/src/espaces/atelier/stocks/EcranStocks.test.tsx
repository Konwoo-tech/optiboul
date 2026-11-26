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
import EcranStocks from './EcranStocks.tsx';
import type { InstantaneStocks, Matiere, Mouvement } from './types.ts';

/*
 * L'écran Stocks rendu depuis un instantané au format de l'écran (quantités dans l'unité du
 * serveur : farine en kg, sel, levure et améliorant en g, glace en sachets, bois en unités, huile en
 * litres) ; la composition de l'instantané à partir des routes du serveur est testée dans
 * reel.test.tsx et reel.inventaires.test.tsx. Les écritures (mouvement manuel, contrôle de stock)
 * appellent un faux serveur au format de l'API réelle. La personne connectée vient de `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lireStocksReels: vi.fn() }));
vi.mock('./reel.ts', () => lecture);

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES: Record<string, { id: number; nom: string; profil: Profil }> = {
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  serge: { id: 4, nom: 'Serge', profil: 'production' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
  davy: { id: 1, nom: 'Davy', profil: 'caissier' },
};

const mouvement = (
  id: string,
  jour: string,
  heure: string,
  type: Mouvement['type'],
  matiere: Matiere,
  quantite: number,
  origine: Mouvement['origine'],
  par = 'Willy',
): Mouvement => ({ id, jour, heure, type, matiere, quantite, origine, par });

const DEPART = (): InstantaneStocks => ({
  aujourdhui: '2026-10-14',
  sacsParSession: 6,
  matieres: [
    { cle: 'farine', stock: 1500, besoin: 300, prix: 390 },
    { cle: 'levure', stock: 2700, besoin: 1500, prix: 9 },
    { cle: 'sel', stock: 14400, besoin: 0, prix: 1 },
    { cle: 'ameliorant', stock: 7200, besoin: 0, prix: 3 },
    { cle: 'glace', stock: 118, besoin: 20, prix: 450 },
    { cle: 'bois', stock: 4, besoin: 1, prix: 5000 },
    { cle: 'huile', stock: 6.6, besoin: 3, prix: 1100 },
  ],
  receptions: [{ matiere: 'levure', jour: '2026-10-14', quantite: 8000 }],
  mouvements: [
    mouvement('m4', '2026-10-14', '19:10', 'entree', 'levure', 5000, {
      genre: 'depense',
      code: 'DEP-0016',
      achat: 'caisse',
    }),
    mouvement('m3', '2026-10-14', '06:40', 'sortie', 'farine', 300, {
      genre: 'production',
      creneau: 'jour',
      date: '2026-10-14',
    }),
    mouvement('m2', '2026-10-13', '10:05', 'entree', 'levure', 6000, {
      genre: 'reception',
      code: 'BC-032',
      fournisseur: 'Mfoundi Levures & Sel',
      partielle: true,
    }),
    mouvement('m1', '2026-10-11', '21:00', 'ajustement', 'sel', -800, {
      genre: 'inventaire',
      code: 'AUD-07',
      date: '2026-10-11',
    }),
  ],
  inventaires: [
    {
      id: '7',
      numero: 7,
      jour: '2026-10-11',
      heure: '21:00',
      par: 'Patrick',
      statut: 'valide',
      validePar: 'M. Fotso',
      lignes: [
        { matiere: 'farine', theorique: 1050, compte: 1050 },
        { matiere: 'sel', theorique: 15200, compte: 14400 },
        { matiere: 'levure', theorique: 3100, compte: 2700 },
      ],
    },
  ],
  controles: [
    {
      semaine: 41,
      jour: '2026-10-07',
      moment: 'mercredi',
      gerant: 'Patrick',
      responsableProduction: 'Serge',
    },
    {
      semaine: 41,
      jour: '2026-10-11',
      moment: 'dimanche',
      gerant: 'Patrick',
      responsableProduction: 'Serge',
    },
    {
      semaine: 42,
      jour: '2026-10-14',
      moment: 'mercredi',
      gerant: 'Willy',
      responsableProduction: 'Serge',
    },
    {
      semaine: 42,
      jour: '2026-10-18',
      moment: 'dimanche',
      gerant: 'Willy',
      responsableProduction: 'Serge',
    },
  ],
  // En semaine, le contrôle ne fait compter que trois matières, à l'aveugle (O13).
  matieresACompter: ['farine', 'levure', 'ameliorant'],
  controleDuJourId: '12',
});

/** L'instantané côté « serveur », la personne connectée, les appels reçus. */
let etat: InstantaneStocks;
let connecte: string;
let ecritures: string[];

beforeEach(() => {
  etat = DEPART();
  ecritures = [];
  lecture.lireStocksReels.mockReset();
  lecture.lireStocksReels.mockImplementation(async () => {
    if (connecte === 'davy') {
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
    http.post('*/api/v1/mouvements-stock/saisir/', async ({ request }) => {
      const corps = (await request.json()) as {
        matiere: Matiere;
        quantite: string;
        genre: string;
        sens: number;
        motif: string;
      };
      ecritures.push(`saisir ${JSON.stringify(corps)}`);
      const fiche = etat.matieres.find((m) => m.cle === corps.matiere)!;
      const quantite = Number(corps.quantite);
      if (corps.sens < 0 && quantite > fiche.stock) {
        return HttpResponse.json(
          { detail: 'La perte dépasse le stock disponible.', code: 'stock_insuffisant' },
          { status: 409 },
        );
      }
      fiche.stock += corps.sens * quantite;
      etat.mouvements.unshift(
        mouvement(
          `m${etat.mouvements.length + 10}`,
          '2026-10-14',
          '18:02',
          corps.genre === 'perte' ? 'perte' : 'ajustement',
          corps.matiere,
          corps.sens * quantite,
          { genre: 'manuel', motif: corps.motif },
          PERSONNES[connecte]!.nom,
        ),
      );
      return HttpResponse.json({}, { status: 201 });
    }),
    http.post('*/api/v1/controles-stock/:id/commencer/', () => {
      ecritures.push('commencer');
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/controles-stock/:id/valider/', async ({ request }) => {
      const corps = (await request.json()) as { comptes: Record<string, string> };
      ecritures.push(`valider ${JSON.stringify(corps)}`);
      const lignes = Object.entries(corps.comptes).map(([matiere, compte]) => ({
        matiere: matiere as Matiere,
        theorique: etat.matieres.find((m) => m.cle === matiere)!.stock,
        compte: Number(compte),
      }));
      const horsTolerance = lignes.some(
        (l) => Math.abs(l.compte - l.theorique) > l.theorique * 0.05,
      );
      etat.inventaires.push({
        id: '12',
        numero: 8,
        jour: '2026-10-14',
        heure: '18:02',
        par: PERSONNES[connecte]!.nom,
        statut: horsTolerance ? 'a-valider' : 'valide',
        validePar: horsTolerance ? '' : PERSONNES[connecte]!.nom,
        lignes,
        ...(horsTolerance ? { demandeNumero: 24 } : {}),
      });
      delete etat.controleDuJourId;
      return HttpResponse.json({ demande: horsTolerance ? 'DEM-024' : null });
    }),
  );
}

let client: QueryClient;

async function ouvrir(utilisateur = 'willy', langue: 'fr' | 'en' = 'fr', adresse = '') {
  connecte = utilisateur;
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
  const ecran = ECRANS.find((e) => e.espace === 'atelier' && e.cle === 'stocks')!;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/atelier/stocks${adresse}`]}>
          <EcranStocks ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  if (utilisateur === 'davy') return;
  await screen.findByRole('tablist');
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });
const onglet = (nom: string) => fireEvent.click(screen.getByRole('tab', { name: nom }));
const ligne = (matiere: string) =>
  screen.getByRole('rowheader', { name: matiere }).closest('tr') as HTMLElement;

describe('Atelier › Stocks : état du stock', () => {
  it('affiche la valeur du stock, les sept matières et leur statut', async () => {
    await ouvrir();
    expect(
      await screen.findByText(
        /^Valeur du stock : .* FCFA · besoin calculé sur 6 sacs par session$/,
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(8);
    const levure = within(ligne('Levure'));
    expect(levure.getAllByText(/2\s?700 g|2700 g/).length).toBeGreaterThan(0);
    expect(levure.getAllByText('À commander').length).toBeGreaterThan(0);
    expect(within(ligne('Farine')).getByText('Suffisant')).toBeTruthy();
    expect(
      levure.getAllByText(/mer\. 14 oct\. · 8\s?000 g|mer\. 14 oct\. · 8000 g/).length,
    ).toBeGreaterThan(0);
  });

  it('expose quatre onglets dont un seul est sélectionné, et se navigue aux flèches', async () => {
    await ouvrir();
    const onglets = screen.getAllByRole('tab');
    expect(onglets.map((o) => o.textContent)).toEqual([
      'État du stock',
      'Stock à date',
      'Entrées et sorties',
      'Inventaires',
    ]);
    expect(onglets.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    fireEvent.keyDown(onglets[0]!, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Stock à date' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('Origine et Fin sautent au premier et au dernier onglet', async () => {
    await ouvrir();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'État du stock' }), { key: 'End' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Inventaires' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inventaires' }), { key: 'Home' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'État du stock' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });

  it('ouvre l’onglet demandé par l’adresse', async () => {
    await ouvrir('willy', 'fr', '?onglet=inventaires');
    expect(await screen.findByText('Historique des inventaires')).toBeTruthy();
  });

  it('une perte importante fait passer la farine en stock bas', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    saisir(screen.getByLabelText('Quantité'), '1250');
    saisir(screen.getByLabelText('Motif (obligatoire)'), 'Sacs mouillés');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Sacs mouillés', { exact: false });
    onglet('État du stock');
    expect(within(ligne('Farine')).getByText('Stock bas')).toBeTruthy();
  });
});

describe('Atelier › Stocks : stock à date', () => {
  it('commence par aujourd’hui puis recalcule pour un autre jour', async () => {
    await ouvrir();
    onglet('Stock à date');
    expect(screen.getByRole('heading', { name: 'Stock au soir du mer. 14 oct.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'mer. 14 oct.' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThanOrEqual(7);
    fireEvent.click(screen.getByRole('button', { name: 'dim. 11 oct.' }));
    expect(screen.getByRole('heading', { name: 'Stock au soir du dim. 11 oct.' })).toBeTruthy();
    // Stock compté à l'inventaire du dimanche.
    expect(within(ligne('Farine')).getByText(/AUD-07 · 11 oct\. · 1050/)).toBeTruthy();
  });
});

describe('Atelier › Stocks : entrées et sorties', () => {
  it('liste les mouvements puis filtre par type', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    const liste = screen.getByRole('region', { name: 'Mouvements de stock' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(4);
    expect(within(liste).getByText('DEP-0016 · achat en caisse')).toBeTruthy();
    expect(within(liste).getByText('BC-032 · Mfoundi Levures & Sel (partielle)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustements' }));
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pertes' }));
    expect(within(liste).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(liste).getByText('—')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pertes' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('un refus du serveur sans texte prévu à l’écran affiche le message du serveur', async () => {
    await ouvrir();
    serveur.use(
      http.post('*/api/v1/mouvements-stock/saisir/', () =>
        HttpResponse.json(
          { detail: 'Aucune semaine n’est ouverte (R1).', code: 'semaine_non_ouverte' },
          { status: 409 },
        ),
      ),
    );
    onglet('Entrées et sorties');
    saisir(screen.getByLabelText('Quantité'), '200');
    saisir(screen.getByLabelText('Motif (obligatoire)'), 'achat de matière');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Aucune semaine n’est ouverte (R1).',
    );
  });

  it('exige la quantité puis le motif, avec le focus sur le champ fautif', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toBe('Indiquez une quantité.');
    expect(document.activeElement).toBe(screen.getByLabelText('Quantité'));
    expect(screen.getByLabelText('Quantité').getAttribute('aria-invalid')).toBe('true');

    saisir(screen.getByLabelText('Quantité'), '2');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toBe('Motif obligatoire.');
    expect(document.activeElement).toBe(screen.getByLabelText('Motif (obligatoire)'));

    saisir(screen.getByLabelText('Motif (obligatoire)'), 'Casse');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(ecritures).toEqual([]);
  });

  it('enregistre une perte, vide la saisie et ajoute le mouvement en tête', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    saisir(screen.getByLabelText('Quantité'), '2,5');
    saisir(screen.getByLabelText('Motif (obligatoire)'), 'Sacs mouillés');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const liste = screen.getByRole('region', { name: 'Mouvements de stock' });
    await waitFor(() => expect(within(liste).getAllByRole('listitem')).toHaveLength(5));
    const premier = within(liste).getAllByRole('listitem')[0]!;
    expect(within(premier).getByText('Perte')).toBeTruthy();
    expect(within(premier).getByText(/^−2,5 kg$/)).toBeTruthy();
    expect(within(premier).getByText('Manuel · Sacs mouillés')).toBeTruthy();
    expect((screen.getByLabelText('Quantité') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Motif (obligatoire)') as HTMLInputElement).value).toBe('');
    expect(ecritures).toEqual([
      'saisir {"matiere":"farine","quantite":"2.5","genre":"perte","sens":-1,"motif":"Sacs mouillés"}',
    ]);
  });

  it('affiche l’erreur du serveur quand la perte dépasse le stock, et l’efface à la saisie', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    saisir(screen.getByLabelText('Quantité'), '99999');
    saisir(screen.getByLabelText('Motif (obligatoire)'), 'Incendie');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('La perte dépasse le stock disponible.'),
    );
    saisir(screen.getByLabelText('Quantité'), '3');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('les types de saisie sont des boutons à bascule', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    expect(screen.getByRole('button', { name: 'Perte / casse' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Entrée (correction)' }));
    expect(
      screen.getByRole('button', { name: 'Entrée (correction)' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('Atelier › Stocks : inventaires', () => {
  const compter = (valeurs: Record<string, string>) => {
    for (const [matiere, valeur] of Object.entries(valeurs)) {
      saisir(screen.getByLabelText(`Comptage de ${matiere}`), valeur);
    }
  };

  it('affiche les quatre contrôles avec leur statut et le rappel du jour', async () => {
    await ouvrir();
    onglet('Inventaires');
    const controles = screen.getByRole('region', {
      name: 'Contrôles de stock · deux fois par semaine',
    });
    const lignes = within(controles).getAllByRole('listitem');
    expect(lignes).toHaveLength(4);
    expect(within(lignes[1]!).getByText('Fait')).toBeTruthy();
    expect(within(lignes[1]!).getByText(/AUD-07 · \d écart\(s\)/)).toBeTruthy();
    expect(within(lignes[2]!).getByText('À faire aujourd’hui')).toBeTruthy();
    expect(within(lignes[3]!).getByText('Prévu')).toBeTruthy();
    expect(within(lignes[3]!).getByText('Gérant Willy + resp. production Serge')).toBeTruthy();
    expect(screen.getByText('À faire aujourd’hui · mer. 14 oct.')).toBeTruthy();
    expect(screen.getByText('Compté par Patrick · validé par M. Fotso')).toBeTruthy();
  });

  it('fait compter à l’aveugle les seules matières du contrôle du jour', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    expect(
      screen.getByRole('heading', { name: 'Inventaire en cours · compté par Willy' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Comptage de Farine')).toBeTruthy();
    expect(screen.getByLabelText('Comptage de Levure')).toBeTruthy();
    expect(screen.getByLabelText('Comptage de Améliorant')).toBeTruthy();
    expect(screen.queryByLabelText('Comptage de Sel')).toBeNull();
    // Le stock théorique n'est pas montré avant le comptage.
    expect(screen.queryByText(/1500/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Comptage de Farine')).toBeNull();
  });

  it('refuse d’envoyer un comptage incomplet et place le focus sur la première matière vide', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    saisir(screen.getByLabelText('Comptage de Farine'), '1500');
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre l’inventaire' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Comptage de Levure'));
    expect(await screen.findByText('Comptez toutes les matières avant de soumettre')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soumettre l’inventaire' })).toBeTruthy();
    expect(ecritures).toEqual([]);
  });

  it('un écart sous 5 % valide l’inventaire et fait le contrôle du jour', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    compter({ Farine: '1480', Levure: '2700', Améliorant: '7200' });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre l’inventaire' }));
    await screen.findByText('Compté par Willy · validé par Willy');
    expect(screen.getByText('Compté par Willy · validé par Willy')).toBeTruthy();
    expect(screen.queryByText('À faire aujourd’hui · mer. 14 oct.')).toBeNull();
    expect(screen.queryByLabelText('Comptage de Farine')).toBeNull();
    expect(ecritures).toEqual([
      'commencer',
      'valider {"comptes":{"farine":"1480","levure":"2700","ameliorant":"7200"}}',
    ]);
  });

  it('un écart au-delà de 5 % part au propriétaire', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    compter({ Farine: '1200', Levure: '2700', Améliorant: '7200' });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre l’inventaire' }));
    await screen.findByText('Fait · à valider');
    expect(screen.getAllByText('À valider').length).toBeGreaterThan(0);
    expect(screen.getByText('Fait · à valider')).toBeTruthy();
  });
});

describe('Atelier › Stocks : brouillon d’inventaire', () => {
  it('est remis à zéro quand une autre personne se connecte', async () => {
    await ouvrir('willy', 'fr', '?onglet=inventaires');
    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer un inventaire' }));
    saisir(screen.getByLabelText('Comptage de Farine'), '12');
    expect((screen.getByLabelText('Comptage de Farine') as HTMLInputElement).value).toBe('12');

    connecte = 'serge';
    await client.invalidateQueries();
    await screen.findByRole('button', { name: 'Démarrer un inventaire' });
    expect(screen.queryByLabelText('Comptage de Farine')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    expect((screen.getByLabelText('Comptage de Farine') as HTMLInputElement).value).toBe('');
    expect(
      screen.getByRole('heading', { name: 'Inventaire en cours · compté par Serge' }),
    ).toBeTruthy();
  });
});

describe('Atelier › Stocks : droits par profil', () => {
  it('le chef de production saisit comme le gérant', async () => {
    await ouvrir('serge');
    onglet('Entrées et sorties');
    expect(screen.getByRole('heading', { name: 'Mouvement manuel' })).toBeTruthy();
    onglet('Inventaires');
    expect(screen.getByRole('button', { name: 'Démarrer un inventaire' })).toBeTruthy();
  });

  it('le propriétaire consulte : ni mouvement manuel ni démarrage d’inventaire', async () => {
    await ouvrir('fotso');
    await screen.findByText(/Valeur du stock/);
    onglet('Entrées et sorties');
    expect(screen.queryByRole('heading', { name: 'Mouvement manuel' })).toBeNull();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    onglet('Inventaires');
    expect(screen.queryByRole('button', { name: 'Démarrer un inventaire' })).toBeNull();
    expect(screen.getByText('Historique des inventaires')).toBeTruthy();
  });

  it('affiche l’écran d’erreur quand le serveur répond 403 (caissière)', async () => {
    await ouvrir('davy');
    expect(await screen.findByText(/Le stock n’a pas pu être chargé/)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('Atelier › Stocks : anglais', () => {
  it('traduit les onglets, les statuts, les dates et les origines', async () => {
    await ouvrir('willy', 'en');
    expect(screen.getAllByRole('tab').map((o) => o.textContent)).toEqual([
      'Stock status',
      'Stock by date',
      'Ins & outs',
      'Stock counts',
    ]);
    expect(
      await screen.findByText(/^Stock value: .* FCFA · need based on 6 sacks per session$/),
    ).toBeTruthy();
    expect(within(ligne('Yeast')).getByText('Reorder')).toBeTruthy();
    onglet('Ins & outs');
    expect(screen.getByText('DEP-0016 · cash purchase')).toBeTruthy();
    expect(screen.getAllByText('Day production of Oct 14').length).toBeGreaterThan(0);
    expect(screen.getByText('Oct 14 · 19:10')).toBeTruthy();
    onglet('Stock counts');
    expect(screen.getByText('Due today · Wed Oct 14')).toBeTruthy();
    expect(screen.getByText('Counted by Patrick · approved by M. Fotso')).toBeTruthy();
  });
});
