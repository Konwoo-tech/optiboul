import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Ces tests jouent l'écran sur le faux serveur ; la lecture du vrai serveur est dans reel.test.tsx.
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

import { ECRANS } from '../../../navigation.ts';
import EcranTableauDeBord from './EcranTableauDeBord.tsx';

let retablir: () => void;

function Adresse() {
  const { pathname, search } = useLocation();
  return <output data-testid="adresse">{`${pathname}${search}`}</output>;
}

async function ouvrir(
  utilisateur: string | null = 'willy',
  langue: 'fr' | 'en' = 'fr',
  /** Gestes joués sur le faux serveur avant l'ouverture de l'écran. */
  avant?: () => Promise<void>,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  await avant?.();
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'tableau-de-bord')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/gestion/tableau-de-bord']}>
          <EcranTableauDeBord ecran={ecran} />
          <Adresse />
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

/** Texte lu, espaces insécables des montants comme espaces simples. */
const lu = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/[  ]/g, ' ');
const etiquette = (element: Element | null | undefined) =>
  (element?.getAttribute('aria-label') ?? '').replace(/[  ]/g, ' ');

const indicateur = (libelle: RegExp | string) =>
  screen.getByText(libelle).closest('li') as HTMLElement;

describe('Gestion › Tableau de bord (gérant)', () => {
  it('affiche les quatre indicateurs de la maquette', async () => {
    await ouvrir();
    const liste = await screen.findByRole('list', { name: 'Indicateurs du mois' });
    const [recette, dettes, fournisseurs, semaine] = within(liste).getAllByRole('listitem');
    expect(lu(recette)).toBe('Recette encaissée · octobre4 231 400 FCFATaux d’encaissement 96,2 %');
    expect(lu(dettes)).toBe('Dettes clients−14 050 FCFA8 clients · 3 au-delà du plafond');
    expect(lu(fournisseurs)).toBe('Dettes fournisseurs2 334 900 FCFA2 factures en retard');
    expect(lu(semaine)).toBe('Semaine 42 · 12 oct. → 18 oct.Willy Production : Serge');
  });

  it('met en rouge les dettes quand des clients dépassent le plafond', async () => {
    await ouvrir();
    await screen.findByRole('list', { name: 'Indicateurs du mois' });
    const valeur = within(indicateur('Dettes clients')).getByText(/14 050/);
    expect(valeur.className).toMatch(/indicateurAlerte/);
    expect(within(indicateur('Dettes fournisseurs')).getByText(/2 334 900/).className).toMatch(
      /indicateurAlerte/,
    );
    expect(
      within(indicateur('Recette encaissée · octobre')).getByText(/4 231 400/).className,
    ).not.toMatch(/indicateurAlerte/);
  });

  it('trace la recette de chaque nuit, la session en cours étant la dernière barre', async () => {
    await ouvrir();
    const graphique = await screen.findByRole('region', {
      name: 'Recette encaissée par nuit · octobre',
    });
    const barres = within(graphique).getAllByRole('listitem');
    expect(barres).toHaveLength(14);
    expect(etiquette(barres[0])).toBe('1 : 312 400 FCFA');
    expect(etiquette(barres[13])).toBe('14 : 58 450 FCFA');
    expect(barres[13]!.getAttribute('title')?.replace(/ /g, ' ')).toBe('58 450 FCFA');
    expect(barres[13]!.querySelector('div')!.className).toMatch(/barreCourante/);
    expect(barres[12]!.querySelector('div')!.className).not.toMatch(/barreCourante/);
    // La plus haute (352 300) remplit la colonne.
    expect((barres[6]!.querySelector('div') as HTMLElement).style.height).toBe('100%');
    expect(
      within(graphique).getByText('Le 14 (jaune) est la session en cours : 58 450 FCFA'),
    ).toBeTruthy();
  });

  it('liste la production du mois par produit', async () => {
    await ouvrir();
    const production = await screen.findByRole('region', {
      name: 'Production par produit · octobre',
    });
    const lignes = within(production).getAllByRole('listitem');
    expect(lignes.map((l) => lu(l))).toEqual([
      'BAG34 120',
      'KO15 400',
      'GC 1354 300',
      'GC 170620',
      'PL1 150',
      'C280',
      'PSL0',
    ]);
  });

  it('range les alertes par urgence, chacune avec son mot', async () => {
    await ouvrir();
    const alertes = await screen.findByRole('region', { name: 'Alertes' });
    const liens = within(alertes).getAllByRole('link');
    expect(liens.map((lien) => lu(lien))).toEqual([
      'UrgentFacture en retard : FAC-41 · 1 405 800 FCFA›',
      'UrgentFacture en retard : FAC-0198 · 40 000 FCFA›',
      'Urgent3 clients au-delà du plafond de 2 000 FCFA›',
      'UrgentTechnique au-dessus du budget›',
      'À voirManquant fournisseur : BC-032 · 4 kg›',
      'À voirManque de caisse 12 oct. nuit · Davy · −500 FCFA›',
      'À voir1 demande en attente›',
    ]);
  });

  it('ouvre l’écran du détail quand on clique une alerte', async () => {
    await ouvrir();
    const alertes = await screen.findByRole('region', { name: 'Alertes' });
    fireEvent.click(within(alertes).getByRole('link', { name: /3 clients au-delà du plafond/ }));
    expect(screen.getByTestId('adresse').textContent).toBe('/gestion/clients?filtre=depasse');
  });

  it('les liens se parcourent au clavier et ne portent pas la couleur seule', async () => {
    await ouvrir();
    const alertes = await screen.findByRole('region', { name: 'Alertes' });
    for (const lien of within(alertes).getAllByRole('link')) {
      expect(lien.getAttribute('href')).toMatch(/^\/(gestion|comptoir|atelier)\//);
      expect(lien.textContent).toMatch(/^(Urgent|À voir)/);
    }
    expect(screen.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeTruthy();
  });

  it('chaque bloc est une région nommée par son titre', async () => {
    await ouvrir();
    await screen.findByRole('list', { name: 'Indicateurs du mois' });
    for (const nom of [
      'Recette encaissée par nuit · octobre',
      'Alertes',
      'Production par produit · octobre',
    ]) {
      expect(screen.getByRole('region', { name: nom })).toBeTruthy();
    }
  });

  it('suit la session : une livraison à crédit change les chiffres', async () => {
    await ouvrir('willy', 'fr', async () => {
      memoriserUtilisateurConnecte('davy');
      await fetch('http://localhost/api/v1/simulation/comptoir/session/livraisons/', {
        method: 'POST',
        body: JSON.stringify({
          clientId: 'alex',
          quantites: { BAG: 50, KO: 0, GC: 0 },
          mode: 'especes',
          recu: 4000,
          reference: '',
        }),
      });
      memoriserUtilisateurConnecte('willy');
    });
    const liste = await screen.findByRole('list', { name: 'Indicateurs du mois' });
    const [recette, dettes] = within(liste).getAllByRole('listitem');
    expect(lu(recette)).toBe('Recette encaissée · octobre4 235 400 FCFATaux d’encaissement 96,2 %');
    expect(lu(dettes)).toBe('Dettes clients−15 050 FCFA9 clients · 3 au-delà du plafond');
    expect(screen.getByText('Le 14 (jaune) est la session en cours : 62 450 FCFA')).toBeTruthy();
  });
});

describe('Gestion › Tableau de bord (propriétaire)', () => {
  it('voit la même chose, sans aucun bouton d’action', async () => {
    await ouvrir('fotso');
    const alertes = await screen.findByRole('region', { name: 'Alertes' });
    expect(within(alertes).getAllByRole('link')).toHaveLength(7);
    // Rien à saisir ni à décider : seuls les liens des alertes agissent.
    for (const zone of screen.getAllByRole('region')) {
      expect(within(zone).queryAllByRole('button')).toHaveLength(0);
    }
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Gestion › Tableau de bord (droits)', () => {
  it.each(['davy', 'serge', 'admin'])('refuse %s sans rien montrer', async (utilisateur) => {
    await ouvrir(utilisateur);
    const alerte = await screen.findByRole('alert');
    expect(lu(alerte)).toBe('Le tableau de bord complet est réservé au gérant et au propriétaire.');
    expect(screen.queryByRole('region', { name: 'Alertes' })).toBeNull();
    expect(screen.queryByText(/FCFA/)).toBeNull();
  });
});

describe('Gestion › Tableau de bord (sans session)', () => {
  it('ne reste pas en chargement quand personne n’est connecté : le message le dit', async () => {
    await ouvrir(null);
    const alerte = await screen.findByRole('alert');
    expect(lu(alerte)).toBe('Le tableau de bord complet est réservé au gérant et au propriétaire.');
    expect(screen.queryByText('Chargement…')).toBeNull();
  });
});

describe('Gestion › Tableau de bord (erreur)', () => {
  it('propose de réessayer quand le serveur ne répond pas, puis affiche les chiffres', async () => {
    await ouvrir('willy', 'fr', async () => {
      const simule = globalThis.fetch;
      let pannes = 1;
      globalThis.fetch = async (entree, init) =>
        String(entree).includes('/tableau-de-bord/') && pannes-- > 0
          ? Response.json({ detail: 'Panne', code: 'panne' }, { status: 500 })
          : simule(entree, init);
    });
    const alerte = await screen.findByRole('alert');
    expect(lu(alerte)).toContain('Impossible de charger le tableau de bord.');
    expect(screen.queryByRole('region', { name: 'Alertes' })).toBeNull();
    fireEvent.click(within(alerte).getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('region', { name: 'Alertes' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Gestion › Tableau de bord (anglais)', () => {
  it('traduit les titres, les indicateurs et les alertes', async () => {
    await ouvrir('willy', 'en');
    const liste = await screen.findByRole('list', { name: 'Key figures of the month' });
    const [recette, dettes, fournisseurs, semaine] = within(liste).getAllByRole('listitem');
    expect(lu(recette)).toBe('Takings · October4 231 400 FCFACollection rate 96.2 %');
    expect(lu(dettes)).toBe('Customer debts−14 050 FCFA8 customers · 3 over the limit');
    expect(lu(fournisseurs)).toBe('Supplier debts2 334 900 FCFA2 overdue invoices');
    expect(lu(semaine)).toBe('Week 42 · Oct 12 → Oct 18Willy Production: Serge');
    expect(screen.getByText('The 14th (yellow) is the current session: 58 450 FCFA')).toBeTruthy();
    const alertes = screen.getByRole('region', { name: 'Alerts' });
    const liens = within(alertes)
      .getAllByRole('link')
      .map((lien) => lu(lien));
    expect(liens[0]).toBe('UrgentOverdue invoice: FAC-41 · 1 405 800 FCFA›');
    expect(liens[3]).toBe('UrgentMaintenance over budget›');
    expect(liens[4]).toBe('CheckSupplier shortfall: BC-032 · 4 kg›');
    expect(liens[6]).toBe('Check1 pending request›');
    expect(screen.getByRole('region', { name: 'Production by product · October' })).toBeTruthy();
  });
});
