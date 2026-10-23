import { configurerApi } from '@/api';
import { i18n, initI18n } from '@/i18n';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import { installerApiSimulee, reinitialiserSimulation } from '../../../simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '../../../simulation/session.ts';
import EcranDemandes from './Ecran.tsx';
import type { Demande } from './types.ts';

// Les demandes ne sont lues qu'en simulation ; la simulation fait aussi office de serveur ici.
vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

const ecranComptoir = ECRANS.find((e) => e.espace === 'comptoir' && e.cle === 'demandes')!;
const ecranGestion = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'demandes')!;

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: '' });
});

let retablir: () => void;
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('')),
  );
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
});
afterEach(async () => {
  retablir();
  vi.unstubAllGlobals();
  await i18n.changeLanguage('fr');
});

async function monter(utilisateur: string | null, ecran = ecranGestion) {
  memoriserUtilisateurConnecte(utilisateur);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EcranDemandes ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

const attendreListe = () => screen.findByRole('heading', { name: 'Décisions récentes' });

describe('Comptoir › Demandes', () => {
  it('affiche une erreur si le serveur refuse le profil', async () => {
    await monter('serge');
    expect((await screen.findByRole('alert')).textContent).toContain('n’ont pas pu être chargées');
  });

  it('passe de l’attente au contenu sans casser l’ordre des hooks', async () => {
    await monter('willy');
    expect(screen.getByText('Chargement des demandes…')).toBeTruthy();
    await attendreListe();
    expect(screen.queryByText('Chargement des demandes…')).toBeNull();
  });

  describe('la caissière', () => {
    it('voit « Mes demandes en attente » vide, sans bouton de décision', async () => {
      await monter('davy', ecranComptoir);
      await attendreListe();
      expect(screen.getByRole('heading', { name: 'Mes demandes en attente' })).toBeTruthy();
      expect(screen.getByText('Aucune demande en attente.')).toBeTruthy();
      expect(screen.getByText('Aucune décision pour l’instant.')).toBeTruthy();
      expect(screen.queryByText(/DEM-021/)).toBeNull();
      expect(screen.queryByRole('button', { name: /DEM-/ })).toBeNull();
    });
  });

  describe('le gérant', () => {
    it('voit la dépense de Willy, à valider par le propriétaire, sans pouvoir décider', async () => {
      await monter('willy');
      await attendreListe();
      const ligne = screen.getByText('DEM-021').closest('li')!;
      expect(within(ligne).getByText('Dépense : Réparation du pétrin')).toBeTruthy();
      expect(
        within(ligne).getByText('Émise par Willy · Gérant de la semaine · 13 oct. 16:40'),
      ).toBeTruthy();
      expect(within(ligne).getByText('À valider par : Propriétaire (M. Fotso)')).toBeTruthy();
      expect(within(ligne).getByText('En attente')).toBeTruthy();
      expect(within(ligne).queryByRole('button')).toBeNull();
      expect(
        within(ligne)
          .getByRole('link', { name: /Dépense DEP-0014/ })
          .getAttribute('href'),
      ).toBe('/gestion/depenses');
    });
  });

  describe('le propriétaire', () => {
    it('accorde : la demande passe aux décisions, le focus reste dans la page', async () => {
      await monter('fotso');
      await attendreListe();
      fireEvent.click(screen.getByRole('button', { name: 'Valider DEM-021' }));
      await screen.findByText(/^Accordée par M\. Fotso · \d{2}:\d{2}$/);
      expect(screen.getByText('Aucune demande en attente.')).toBeTruthy();
      expect(screen.getByText('Accordée')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /DEM-021/ })).toBeNull();
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('heading', { name: 'En attente de décision' }),
        ),
      );
    });

    it('l’accord se retrouve dans les Dépenses : la dépense est validée', async () => {
      await monter('fotso');
      await attendreListe();
      fireEvent.click(screen.getByRole('button', { name: 'Valider DEM-021' }));
      await screen.findByText(/^Accordée par M\. Fotso/);
      const reponse = await fetch('http://localhost/api/v1/simulation/comptoir/depenses/');
      const { depenses, demandes } = await reponse.json();
      expect(depenses.find((d: { id: string }) => d.id === 'e3').statut).toBe('validee');
      expect(demandes[0].statut).toBe('acceptee');
    });

    it('refuse : « Refusée par … »', async () => {
      await monter('fotso');
      await attendreListe();
      fireEvent.click(screen.getByRole('button', { name: 'Refuser DEM-021' }));
      await screen.findByText(/^Refusée par M\. Fotso/);
      expect(screen.getByText('Refusée')).toBeTruthy();
    });
  });

  describe('une demande de plafond venue de la session', () => {
    async function demander() {
      memoriserUtilisateurConnecte('davy');
      await fetch('http://localhost/api/v1/simulation/comptoir/session/autorisations/', {
        method: 'POST',
        body: JSON.stringify({ clientId: 'brice', soldeApres: -7200 }),
      });
    }

    it('le gérant l’autorise, avec un lien vers le client', async () => {
      await demander();
      await monter('willy');
      await attendreListe();
      const ligne = (await screen.findByText('DEM-022')).closest('li')!;
      expect(within(ligne).getByText('Plafond client')).toBeTruthy();
      expect(within(ligne).getByText('−7 200 FCFA / 2 000')).toBeTruthy();
      expect(within(ligne).getByRole('link').getAttribute('href')).toBe(
        '/gestion/clients?client=brice',
      );
      fireEvent.click(within(ligne).getByRole('button', { name: 'Autoriser DEM-022' }));
      await screen.findByText(/^Accordée par Willy/);
    });

    it('la caissière suit sa demande, sans la trancher, et le lien reste dans le comptoir', async () => {
      await demander();
      await monter('davy', ecranComptoir);
      const ligne = (await screen.findByText('DEM-022')).closest('li')!;
      expect(within(ligne).getByText('En attente')).toBeTruthy();
      expect(within(ligne).getByRole('link').getAttribute('href')).toBe(
        '/comptoir/clients?client=brice',
      );
    });
  });

  describe('tous les types de demande', () => {
    const base = {
      par: 'Serge',
      parProfil: 'production',
      jour: '2026-10-14',
      heure: '09:15',
    } as const;
    const demandes: Demande[] = [
      {
        ...base,
        id: 'p3',
        numero: 24,
        type: 'production',
        titre: 'Augmentation de production : +2 sac(s)',
        titreEn: 'Production increase: +2 sack(s)',
        detail: 'BAG +2',
        statut: 'en-attente',
        objet: { genre: 'production' },
      },
      {
        ...base,
        id: 'p2',
        numero: 23,
        type: 'inventaire',
        titre: 'Inventaire AUD-03 : écarts au-delà de 5 %',
        detail: 'Farine −12',
        statut: 'en-attente',
        objet: { genre: 'inventaire', code: 'AUD-03' },
      },
      {
        ...base,
        id: 'p1',
        numero: 22,
        type: 'paie',
        par: 'Willy',
        parProfil: 'gerant',
        titre: 'État de paie · Octobre 2026',
        detail: '1 250 000 FCFA net',
        statut: 'en-attente',
        objet: { genre: 'paie', mois: '2026-10' },
      },
    ];

    function servir() {
      const suivant = globalThis.fetch;
      vi.stubGlobal('fetch', async (entree: RequestInfo | URL, init?: RequestInit) => {
        if (String(entree).endsWith('/api/v1/simulation/demandes/')) {
          return Response.json({ gerant: 'Willy', proprietaire: 'M. Fotso', demandes });
        }
        return suivant(entree, init);
      });
    }

    it('le propriétaire peut trancher les trois, chacune avec son lien', async () => {
      servir();
      await monter('fotso');
      await attendreListe();
      for (const code of ['DEM-024', 'DEM-023', 'DEM-022']) {
        expect(screen.getByRole('button', { name: 'Valider ' + code })).toBeTruthy();
      }
      const lien = (code: string) =>
        within(screen.getByText(code).closest('li')!).getByRole('link');
      expect(lien('DEM-024').textContent).toBe('Plan de production ›');
      expect(lien('DEM-024').getAttribute('href')).toBe('/atelier/production');
      expect(lien('DEM-023').textContent).toBe('Inventaire AUD-03 ›');
      expect(lien('DEM-023').getAttribute('href')).toBe('/atelier/stocks');
      expect(lien('DEM-022').textContent).toBe('État de paie · Octobre 2026 ›');
      expect(lien('DEM-022').getAttribute('href')).toBe('/gestion/personnel');
      expect(screen.getAllByText('À valider par : Propriétaire (M. Fotso)')).toHaveLength(2);
      expect(
        screen.getByText('À valider par : Gérant de la semaine (Willy) ou propriétaire'),
      ).toBeTruthy();
    });

    it('le gérant ne tranche que la production : paie et inventaire attendent le propriétaire', async () => {
      servir();
      await monter('willy');
      await attendreListe();
      expect(screen.getByRole('button', { name: 'Valider DEM-024' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /DEM-023/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /DEM-022/ })).toBeNull();
      expect(screen.getAllByText('En attente')).toHaveLength(2);
    });
  });

  it('prévient quand la demande a déjà reçu une réponse (écran périmé)', async () => {
    await monter('fotso');
    await attendreListe();
    // Une autre personne a déjà tranché pendant que l'écran restait ouvert.
    await fetch('http://localhost/api/v1/simulation/demandes/q1/decider/', {
      method: 'POST',
      body: JSON.stringify({ accord: false }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Valider DEM-021' }));
    expect(await screen.findByText('Cette demande a déjà reçu une réponse.')).toBeTruthy();
  });

  it('montre la décision prise dans la session, avec son auteur', async () => {
    memoriserUtilisateurConnecte('davy');
    const racine = 'http://localhost/api/v1/simulation/comptoir/session/';
    const demande = await (
      await fetch(racine + 'autorisations/', {
        method: 'POST',
        body: JSON.stringify({ clientId: 'brice', soldeApres: -7200 }),
      })
    ).json();
    await fetch(racine + 'autorisations/decider/', {
      method: 'POST',
      body: JSON.stringify({ demandeId: demande.demande.id, code: '1234', accord: true }),
    });
    await monter('davy', ecranComptoir);
    expect(await screen.findByText(/^Accordée par Willy · \d{2}:\d{2}$/)).toBeTruthy();
    expect(screen.getByText('Accordée')).toBeTruthy();
  });

  it('se traduit en anglais', async () => {
    await i18n.changeLanguage('en');
    await monter('fotso');
    await screen.findByRole('heading', { name: 'Recent decisions' });
    expect(screen.getByText('Dépense : Réparation du pétrin')).toBeTruthy();
    expect(screen.getByText('Raised by Willy · Manager of the week · Oct 13 16:40')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve DEM-021' })).toBeTruthy();
    expect(screen.getByText('No decisions yet.')).toBeTruthy();
  });
});
