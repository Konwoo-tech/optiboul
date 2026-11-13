import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Ces tests jouent l'écran sur le faux serveur ; la lecture du vrai serveur est dans reel.test.tsx.
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

import { ECRANS } from '../../../navigation.ts';
import EcranDepenses from './EcranDepenses.tsx';

let retablir: () => void;

async function ouvrir(utilisateur = 'davy', langue: 'fr' | 'en' = 'fr') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
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
  await screen.findByText(/^DEP-0016/);
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
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
  });

  it('enregistre une dépense : DEP-0017 en tête, formulaire vidé, budget mis à jour', async () => {
    saisir(screen.getByLabelText('Catégorie'), 'electricite');
    saisir(screen.getByLabelText('Libellé'), 'Ampoules');
    saisir(screen.getByLabelText('Montant (FCFA)'), '20 000');
    fireEvent.click(screen.getByRole('button', { name: 'Prendre le justificatif en photo' }));
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
    expect(screen.getByText('Stock · Levure +5 kg', { exact: false })).toBeTruthy();
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
    // Le serveur est interrogé : on simule un rejet après la validation locale.
    memoriserUtilisateurConnecte('serge');
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
    expect(screen.getByText('Stock · Yeast +5 kg', { exact: false })).toBeTruthy();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });
});

describe('Comptoir › Dépenses (accès refusé)', () => {
  it('affiche l’écran d’erreur quand le serveur répond 403', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    initI18n('fr');
    configurerApi({ baseUrl: 'http://localhost' });
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('serge');
    const ecran = ECRANS.find((e) => e.espace === 'comptoir' && e.cle === 'depenses')!;
    render(
      <OptiboulProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <EcranDepenses ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
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
    memoriserUtilisateurConnecte('serge');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la dépense' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).not.toBe(''));
    saisir(screen.getByLabelText('Libellé'), 'Sel fin');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
