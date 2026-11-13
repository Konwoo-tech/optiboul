import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
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
import EcranStocks from './EcranStocks.tsx';

let retablir: () => void;
let client: QueryClient;

async function ouvrir(utilisateur = 'willy', langue: 'fr' | 'en' = 'fr', adresse = '') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
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
  await screen.findByRole('tablist');
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
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
        'Valeur du stock : 862 370 FCFA · besoin calculé sur 6 sacs par session',
      ),
    ).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(8);
    const levure = within(ligne('Levure'));
    for (const texte of ['2,7 kg', '1', 'mer. 14 oct. · 8 kg', '13 500', 'À commander']) {
      expect(levure.getAllByText(texte).length).toBeGreaterThan(0);
    }
    expect(within(ligne('Farine')).getByText('Suffisant')).toBeTruthy();
    expect(within(ligne('Huile')).getByText('6,6')).toBeTruthy();
    expect(within(ligne('Sel')).getByText('—')).toBeTruthy();
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
    saisir(screen.getByLabelText('Quantité'), '25');
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
    expect(screen.getByText('Valeur : 862 370 FCFA')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'mer. 14 oct.' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThanOrEqual(7);

    fireEvent.click(screen.getByRole('button', { name: 'dim. 11 oct.' }));
    expect(screen.getByRole('heading', { name: 'Stock au soir du dim. 11 oct.' })).toBeTruthy();
    // Stock compté à l'inventaire du dimanche : farine 21 sacs.
    expect(within(ligne('Farine')).getByText('21 sacs')).toBeTruthy();
    expect(within(ligne('Farine')).getByText('AUD-07 · 11 oct. · 21')).toBeTruthy();
    expect(within(ligne('Sel')).getByText('−0,8')).toBeTruthy();
  });

  it('avant le premier inventaire, aucun comptage n’est affiché', async () => {
    await ouvrir();
    onglet('Stock à date');
    fireEvent.click(screen.getByRole('button', { name: 'mer. 7 oct.' }));
    expect(within(ligne('Farine')).getByText('AUD-06 · 7 oct. · 31')).toBeTruthy();
  });
});

describe('Atelier › Stocks : entrées et sorties', () => {
  it('liste les seize mouvements puis filtre par type', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    const liste = screen.getByRole('region', { name: 'Mouvements de stock' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(16);
    expect(within(liste).getByText('DEP-0016 · achat en caisse')).toBeTruthy();
    expect(within(liste).getByText('BC-032 · Mfoundi Levures & Sel (partielle)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustements' }));
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Pertes' }));
    expect(within(liste).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(liste).getByText('—')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pertes' }).getAttribute('aria-pressed')).toBe(
      'true',
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
  });

  it('enregistre une perte, vide la saisie et ajoute le mouvement en tête', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    saisir(screen.getByLabelText('Quantité'), '2,5');
    saisir(screen.getByLabelText('Motif (obligatoire)'), 'Sacs mouillés');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const liste = screen.getByRole('region', { name: 'Mouvements de stock' });
    await waitFor(() => expect(within(liste).getAllByRole('listitem')).toHaveLength(17));
    const premier = within(liste).getAllByRole('listitem')[0]!;
    expect(within(premier).getByText('Perte')).toBeTruthy();
    expect(within(premier).getByText('−2,5 sacs')).toBeTruthy();
    expect(within(premier).getByText('Manuel · Sacs mouillés')).toBeTruthy();
    expect((screen.getByLabelText('Quantité') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Motif (obligatoire)') as HTMLInputElement).value).toBe('');
  });

  it('affiche l’erreur du serveur quand la perte dépasse le stock, et l’efface à la saisie', async () => {
    await ouvrir();
    onglet('Entrées et sorties');
    saisir(screen.getByLabelText('Quantité'), '99');
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
  const comptages = ['30', '14,4', '2,7', '7,2', '118', '4', '20'];
  const compter = (valeurs: string[]) =>
    valeurs.forEach((valeur, rang) =>
      saisir(screen.getAllByPlaceholderText('0')[rang] as HTMLElement, valeur),
    );

  it('affiche les quatre contrôles avec leur statut et le rappel du jour', async () => {
    await ouvrir();
    onglet('Inventaires');
    const controles = screen.getByRole('region', {
      name: 'Contrôles de stock · deux fois par semaine',
    });
    const lignes = within(controles).getAllByRole('listitem');
    expect(lignes).toHaveLength(4);
    expect(within(lignes[0]!).getByText('Fait')).toBeTruthy();
    expect(within(lignes[0]!).getByText('AUD-06 · 2 écart(s)')).toBeTruthy();
    expect(within(lignes[2]!).getByText('À faire aujourd’hui')).toBeTruthy();
    expect(within(lignes[3]!).getByText('Prévu')).toBeTruthy();
    expect(within(lignes[3]!).getByText('Gérant Willy + resp. production Serge')).toBeTruthy();
    expect(screen.getByText('À faire aujourd’hui · mer. 14 oct.')).toBeTruthy();
    expect(screen.getByText('AUD-07 · dim. 11 oct. · 21:00')).toBeTruthy();
    expect(screen.getByText('Compté par Patrick · validé par M. Fotso')).toBeTruthy();
    expect(
      screen.getByText('3 écart(s) : Sel −0,8 kg · Levure −0,4 kg · Glace −2 sachets'),
    ).toBeTruthy();
  });

  it('guide le comptage : théorique, écart et pourcentage en direct', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    expect(
      screen.getByRole('heading', { name: 'Inventaire en cours · compté par Willy' }),
    ).toBeTruthy();
    saisir(screen.getByLabelText('Comptage de Farine'), '28,5');
    expect(screen.getByText('−1,5 sacs · -5,0 %')).toBeTruthy();
    saisir(screen.getByLabelText('Comptage de Sel'), '14,4');
    expect(screen.getByText('0 kg · 0,0 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Comptage de Farine')).toBeNull();
  });

  it('refuse d’envoyer un comptage incomplet et place le focus sur la première matière vide', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    saisir(screen.getByLabelText('Comptage de Farine'), '30');
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre l’inventaire' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Comptage de Sel'));
    expect(await screen.findByText('Comptez toutes les matières avant de soumettre')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soumettre l’inventaire' })).toBeTruthy();
  });

  it('un écart sous 5 % valide l’inventaire, ajuste le stock et fait le contrôle du jour', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    compter(comptages);
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre l’inventaire' }));
    await screen.findByText('AUD-08 · mer. 14 oct. · 18:02');
    expect(screen.getByText('Compté par Willy · validé par Willy')).toBeTruthy();
    expect(screen.getByText('1 écart(s) : Glace −2 sachets')).toBeTruthy();
    expect(screen.queryByText('À faire aujourd’hui · mer. 14 oct.')).toBeNull();
    expect(screen.queryByLabelText('Comptage de Farine')).toBeNull();
    onglet('État du stock');
    expect(within(ligne('Glace')).getByText('118 sachets')).toBeTruthy();
  });

  it('un écart au-delà de 5 % part au propriétaire sans toucher au stock', async () => {
    await ouvrir();
    onglet('Inventaires');
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer un inventaire' }));
    compter(['27', ...comptages.slice(1)]);
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre l’inventaire' }));
    await screen.findByText('AUD-08 · mer. 14 oct. · 18:02');
    expect(screen.getAllByText('À valider').length).toBeGreaterThan(0);
    expect(screen.getByText('Fait · à valider')).toBeTruthy();
    onglet('État du stock');
    expect(within(ligne('Farine')).getByText('30 sacs')).toBeTruthy();
  });
});

describe('Atelier › Stocks : brouillon d’inventaire', () => {
  it('est remis à zéro quand une autre personne se connecte', async () => {
    await ouvrir('willy', 'fr', '?onglet=inventaires');
    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer un inventaire' }));
    saisir(screen.getByLabelText('Comptage de Farine'), '12');
    expect((screen.getByLabelText('Comptage de Farine') as HTMLInputElement).value).toBe('12');

    memoriserUtilisateurConnecte('serge');
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
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(16);
    onglet('Inventaires');
    expect(screen.queryByRole('button', { name: 'Démarrer un inventaire' })).toBeNull();
    expect(screen.getByText('Historique des inventaires')).toBeTruthy();
  });

  it('affiche l’écran d’erreur quand le serveur répond 403 (caissière)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    retablir = () => {};
    vi.useRealTimers();
    await initI18n('fr').changeLanguage('fr');
    configurerApi({ baseUrl: 'http://localhost' });
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('davy');
    const ecran = ECRANS.find((e) => e.espace === 'atelier' && e.cle === 'stocks')!;
    render(
      <OptiboulProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <EcranStocks ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
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
      await screen.findByText('Stock value: 862 370 FCFA · need based on 6 sacks per session'),
    ).toBeTruthy();
    expect(within(ligne('Yeast')).getByText('Reorder')).toBeTruthy();
    expect(within(ligne('Yeast')).getByText('Wed Oct 14 · 8 kg')).toBeTruthy();
    onglet('Ins & outs');
    expect(screen.getByText('DEP-0016 · cash purchase')).toBeTruthy();
    expect(screen.getAllByText('Day production of Oct 14').length).toBeGreaterThan(0);
    expect(screen.getByText('Oct 14 · 19:10')).toBeTruthy();
    onglet('Stock counts');
    expect(screen.getByText('Due today · Wed Oct 14')).toBeTruthy();
    expect(screen.getByText('AUD-06 · 2 gap(s)')).toBeTruthy();
    expect(screen.getByText('Counted by Patrick · approved by M. Fotso')).toBeTruthy();
  });
});
