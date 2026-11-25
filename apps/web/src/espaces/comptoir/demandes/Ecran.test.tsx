import { configurerApi, ErreurApi } from '@/api';
import { i18n, initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';
import EcranDemandes from './Ecran.tsx';
import type { Demande, ReponseDemandes } from './types.ts';

/*
 * L'écran Demandes rendu depuis les demandes au format de l'écran ; la conversion des demandes du
 * serveur est testée dans reel.test.tsx. Accorder et refuser appellent un faux serveur au format de
 * l'API réelle, dont les réponses font évoluer les demandes. La personne connectée vient de
 * `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lireDemandesReelles: vi.fn() }));
vi.mock('./reel.ts', () => lecture);

const serveur = creerServeurApi();

const ecranComptoir = ECRANS.find((e) => e.espace === 'comptoir' && e.cle === 'demandes')!;
const ecranGestion = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'demandes')!;

beforeAll(() => {
  initI18n();
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

const base = { par: 'Serge', parProfil: 'production', jour: '2026-10-14', heure: '09:15' } as const;

const DEPENSE: Demande = {
  id: '21',
  numero: 21,
  type: 'depense',
  titre: 'Dépense : Réparation du pétrin',
  detail: '65 000 FCFA',
  par: 'Willy',
  parProfil: 'gerant',
  jour: '2026-10-13',
  heure: '16:40',
  statut: 'en-attente',
  objet: { genre: 'depense', code: 'DEP-0014', montant: 65000, semaine: 42 },
};

const PLAFOND: Demande = {
  id: '22',
  numero: 22,
  type: 'plafond',
  titre: 'Plafond client : Brice',
  detail: '−7 200 FCFA / 2 000',
  par: 'Davy',
  parProfil: 'caissier',
  jour: '2026-10-14',
  heure: '18:20',
  statut: 'en-attente',
  objet: { genre: 'client', id: '7', nom: 'Brice', solde: -7200 },
};

/** Les demandes côté « serveur », et la personne connectée. */
let demandes: Demande[];
let connecte: string;
let appels: string[];

beforeEach(() => {
  demandes = [structuredClone(DEPENSE)];
  appels = [];
  lecture.lireDemandesReelles.mockReset();
  lecture.lireDemandesReelles.mockImplementation(async (profil?: string, nom?: string) => {
    if (profil === 'production' && connecte === 'serge') {
      throw new ErreurApi(403, { detail: 'Refusé.', code: 'droit_insuffisant' });
    }
    const reponse: ReponseDemandes = {
      gerant: 'Willy',
      // Le serveur ne nomme pas le propriétaire : connu seulement quand c'est la personne connectée.
      proprietaire: profil === 'proprietaire' ? (nom ?? '') : '',
      demandes: structuredClone(demandes),
    };
    return reponse;
  });
});

function decider(id: string | readonly string[] | undefined, accord: boolean, motif?: string) {
  const demande = demandes.find((d) => d.id === String(id));
  if (!demande || demande.statut !== 'en-attente') {
    return HttpResponse.json(
      { detail: 'Cette demande a déjà reçu une réponse.', code: 'deja_decidee' },
      { status: 409 },
    );
  }
  appels.push(`${accord ? 'accorder' : 'refuser'} ${id}${motif ? ` ${motif}` : ''}`);
  Object.assign(demande, {
    statut: accord ? 'acceptee' : 'refusee',
    decidePar: PERSONNES[connecte]!.nom,
    decideA: '17:02',
  });
  return HttpResponse.json({});
}

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
    http.post('*/api/v1/demandes/:id/accorder/', ({ params }) => decider(params.id, true)),
    http.post('*/api/v1/demandes/:id/refuser/', async ({ params, request }) =>
      decider(params.id, false, ((await request.json()) as { motif: string }).motif),
    ),
  );
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await i18n.changeLanguage('fr');
});

function monter(utilisateur: string, ecran = ecranGestion) {
  connecte = utilisateur;
  installerServeur();
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
    monter('serge');
    expect((await screen.findByRole('alert')).textContent).toContain('n’ont pas pu être chargées');
  });

  it('passe de l’attente au contenu sans casser l’ordre des hooks', async () => {
    monter('willy');
    expect(screen.getByText('Chargement des demandes…')).toBeTruthy();
    await attendreListe();
    expect(screen.queryByText('Chargement des demandes…')).toBeNull();
  });

  describe('la caissière', () => {
    it('voit « Mes demandes en attente » vide, sans bouton de décision', async () => {
      demandes = [];
      monter('davy', ecranComptoir);
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
      monter('willy');
      await attendreListe();
      const ligne = screen.getByText('DEM-021').closest('li')!;
      expect(within(ligne).getByText('Dépense : Réparation du pétrin')).toBeTruthy();
      expect(
        within(ligne).getByText('Émise par Willy · Gérant de la semaine · 13 oct. 16:40'),
      ).toBeTruthy();
      // Le serveur ne nomme pas le propriétaire à un autre profil : pas de parenthèses vides.
      expect(within(ligne).getByText('À valider par : Propriétaire')).toBeTruthy();
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
      monter('fotso');
      await attendreListe();
      expect(screen.getByText('À valider par : Propriétaire (M. Fotso)')).toBeTruthy();
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
      expect(appels).toEqual(['accorder 21']);
    });

    it('refuse : le motif est obligatoire, puis « Refusée par … »', async () => {
      monter('fotso');
      await attendreListe();
      fireEvent.click(screen.getByRole('button', { name: 'Refuser DEM-021' }));
      const fenetre = await screen.findByRole('dialog');
      fireEvent.click(within(fenetre).getByRole('button', { name: /Refuser/ }));
      expect(await within(fenetre).findByRole('alert')).toBeTruthy();
      expect(appels).toEqual([]);
      fireEvent.change(within(fenetre).getByLabelText('Motif du refus'), {
        target: { value: 'Trop cher' },
      });
      fireEvent.click(within(fenetre).getByRole('button', { name: /Refuser/ }));
      await screen.findByText(/^Refusée par M\. Fotso/);
      expect(screen.getByText('Refusée')).toBeTruthy();
      expect(appels).toEqual(['refuser 21 Trop cher']);
    });
  });

  describe('une demande de plafond venue de la session', () => {
    it('le gérant l’autorise, avec un lien vers le client', async () => {
      demandes = [structuredClone(PLAFOND)];
      monter('willy');
      await attendreListe();
      const ligne = (await screen.findByText('DEM-022')).closest('li')!;
      expect(within(ligne).getByText('Plafond client')).toBeTruthy();
      expect(within(ligne).getByText('−7 200 FCFA / 2 000')).toBeTruthy();
      expect(within(ligne).getByRole('link').getAttribute('href')).toBe(
        '/gestion/clients?client=7',
      );
      fireEvent.click(within(ligne).getByRole('button', { name: 'Autoriser DEM-022' }));
      await screen.findByText(/^Accordée par Willy/);
    });

    it('la caissière suit sa demande, sans la trancher, et le lien reste dans le comptoir', async () => {
      demandes = [structuredClone(PLAFOND)];
      monter('davy', ecranComptoir);
      const ligne = (await screen.findByText('DEM-022')).closest('li')!;
      expect(within(ligne).getByText('En attente')).toBeTruthy();
      expect(within(ligne).getByRole('link').getAttribute('href')).toBe(
        '/comptoir/clients?client=7',
      );
    });
  });

  describe('tous les types de demande', () => {
    const toutes: Demande[] = [
      {
        ...base,
        id: '24',
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
        id: '23',
        numero: 23,
        type: 'inventaire',
        titre: 'Inventaire AUD-03 : écarts au-delà de 5 %',
        detail: 'Farine −12',
        statut: 'en-attente',
        objet: { genre: 'inventaire', code: 'AUD-03' },
      },
      {
        ...base,
        id: '22',
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

    it('le propriétaire peut trancher les trois, chacune avec son lien', async () => {
      demandes = structuredClone(toutes);
      monter('fotso');
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
      demandes = structuredClone(toutes);
      monter('willy');
      await attendreListe();
      expect(screen.getByRole('button', { name: 'Valider DEM-024' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /DEM-023/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /DEM-022/ })).toBeNull();
      expect(screen.getAllByText('En attente')).toHaveLength(2);
    });
  });

  it('prévient quand la demande a déjà reçu une réponse (écran périmé)', async () => {
    monter('fotso');
    await attendreListe();
    // Une autre personne a déjà tranché pendant que l'écran restait ouvert.
    demandes[0] = { ...demandes[0]!, statut: 'refusee', decidePar: 'Willy', decideA: '17:00' };
    fireEvent.click(screen.getByRole('button', { name: 'Valider DEM-021' }));
    expect(await screen.findByText('Cette demande a déjà reçu une réponse.')).toBeTruthy();
  });

  it('montre la décision prise dans la session, avec son auteur', async () => {
    demandes = [
      {
        ...structuredClone(PLAFOND),
        statut: 'acceptee',
        decidePar: 'Willy',
        decideA: '18:25',
      },
    ];
    monter('davy', ecranComptoir);
    expect(await screen.findByText(/^Accordée par Willy · \d{2}:\d{2}$/)).toBeTruthy();
    expect(screen.getByText('Accordée')).toBeTruthy();
  });

  it('se traduit en anglais', async () => {
    await i18n.changeLanguage('en');
    monter('fotso');
    await screen.findByRole('heading', { name: 'Recent decisions' });
    expect(screen.getByText('Dépense : Réparation du pétrin')).toBeTruthy();
    expect(screen.getByText('Raised by Willy · Manager of the week · Oct 13 16:40')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve DEM-021' })).toBeTruthy();
    expect(screen.getByText('No decisions yet.')).toBeTruthy();
  });
});
