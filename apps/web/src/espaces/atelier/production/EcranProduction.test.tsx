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
import EcranProduction from './EcranProduction.tsx';
import { CLOTURE, COMMANDES, FICHES, PLAN_PROPOSE } from './instantanes.test-donnees.ts';
import { versJustification } from './reel.ts';
import type { InstantaneFiches, InstantaneProduction } from './types.ts';

/*
 * L'écran Production rendu depuis des instantanés au format de l'écran ; la composition de
 * l'instantané à partir des routes du serveur est testée dans reel.test.tsx et fiches.test.tsx. Les
 * actions (proposer, valider, ouvrir, réalisé, consommation, clôture, supplément) appellent un faux
 * serveur au format de l'API réelle, dont les réponses font évoluer l'instantané relu ensuite. La
 * personne connectée vient de `users/me/`.
 */

const lecture = vi.hoisted(() => ({
  lireProductionReelle: vi.fn(),
  lireFichesReelles: vi.fn(),
  modifierFicheSurLeServeur: vi.fn(),
}));
vi.mock('./reel.ts', async (original) => ({
  ...(await original<typeof import('./reel.ts')>()),
  lireProductionReelle: lecture.lireProductionReelle,
}));
vi.mock('./fiches.ts', async (original) => ({
  ...(await original<typeof import('./fiches.ts')>()),
  lireFichesReelles: lecture.lireFichesReelles,
  modifierFicheSurLeServeur: lecture.modifierFicheSurLeServeur,
}));

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES: Record<string, { id: number; nom: string; profil: string }> = {
  serge: { id: 4, nom: 'Serge', profil: 'production' },
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
};

/** L'instantané côté « serveur », les fiches, la personne connectée, les appels reçus. */
let etat: InstantaneProduction;
let fiches: InstantaneFiches;
let connecte: string;
let appels: string[];

const CODE_PRODUIT: Record<string, 'BAG' | 'KO' | 'GC'> = { BAG: 'BAG', KO: 'KO', GC135: 'GC' };

beforeEach(() => {
  etat = structuredClone(CLOTURE);
  fiches = structuredClone(FICHES);
  // Les fiches portent l'identifiant du produit sur le serveur.
  fiches.fiches.forEach((f, rang) => (f.idServeur = rang + 1));
  appels = [];
  lecture.lireProductionReelle.mockReset();
  lecture.lireProductionReelle.mockImplementation(async () => structuredClone(etat));
  lecture.lireFichesReelles.mockReset();
  lecture.lireFichesReelles.mockImplementation(async () => structuredClone(fiches));
  lecture.modifierFicheSurLeServeur.mockReset();
});

function installerServeur() {
  const moi = PERSONNES[connecte]!;
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: moi.id,
        name: moi.nom,
        email: 'x@optiboul.local',
        url: `http://localhost/api/v1/users/${moi.id}/`,
        profil: moi.profil,
      }),
    ),
    http.post('*/api/v1/productions/proposer/', () => {
      appels.push('proposer');
      Object.assign(etat, { etape: 'plan-propose', planPropose: { par: moi.nom, a: '18:02' } });
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/productions/valider/', () => {
      appels.push('valider');
      Object.assign(etat, { etape: 'plan-valide', planValide: { par: moi.nom, a: '18:02' } });
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/productions/ouvrir/', () => {
      appels.push('ouvrir');
      Object.assign(etat, { etape: 'en-cours', ouverte: { par: moi.nom, a: '18:02' } });
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/productions/:id/fournee/', async ({ request }) => {
      const { produit, pains } = (await request.json()) as { produit: string; pains: number };
      appels.push(`fournee ${produit} ${pains}`);
      const cle = CODE_PRODUIT[produit]!;
      etat.realise[cle] = (etat.realise[cle] ?? 0) + pains;
      return HttpResponse.json({});
    }),
    http.put('*/api/v1/productions/:id/consommation/', async ({ request }) => {
      const { quantites, justifications } = (await request.json()) as {
        quantites: Record<string, string>;
        justifications?: Record<string, string>;
      };
      appels.push(`consommation ${JSON.stringify(quantites)}`);
      for (const [matiere, valeur] of Object.entries(quantites)) {
        (etat.consommation as Record<string, number | null>)[matiere] = Number(valeur);
      }
      // Le serveur garde la justification par matière ; l'écran en relit le motif.
      const premiere = Object.values(justifications ?? {})[0];
      if (premiere) etat.justification = versJustification(premiere);
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/productions/:id/cloturer/', () => {
      appels.push('cloturer');
      Object.assign(etat, { etape: 'cloturee', cloturee: { par: moi.nom, a: '18:02' } });
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/productions/supplement/', async ({ request }) => {
      const corps = (await request.json()) as { supplement: Record<string, number> };
      appels.push(`supplement ${JSON.stringify(corps.supplement)}`);
      return HttpResponse.json({ demande: 'DEM-022' }, { status: 201 });
    }),
  );
}

async function ouvrir(
  utilisateur = 'serge',
  options: {
    depart?: InstantaneProduction;
    langue?: 'fr' | 'en';
    chemin?: string;
  } = {},
) {
  connecte = utilisateur;
  etat = structuredClone(options.depart ?? CLOTURE);
  await initI18n('fr').changeLanguage(options.langue ?? 'fr');
  installerServeur();
  const ecran = ECRANS.find((e) => e.espace === 'atelier' && e.cle === 'production')!;
  render(
    <OptiboulProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[options.chemin ?? '/atelier/production']}>
          <EcranProduction ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  if (options.chemin?.includes('fiche='))
    await screen.findByText('Procédé de fabrication').catch(() => undefined);
  else await screen.findAllByRole('tab');
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });
const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom });

describe('Atelier › Production (responsable de production)', () => {
  it('montre le cycle en cours, le reste à produire et le plan de la maquette', async () => {
    await ouvrir();
    expect(
      screen.getByRole('heading', { name: /^Cycle de production · session de nuit 14 oct\./ }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clôturer la production' })).toBeTruthy();
    const etapes = screen.getByRole('list', { name: 'Étapes du cycle' });
    expect(within(etapes).getAllByRole('listitem')).toHaveLength(5);
    expect(within(etapes).getByText('à 17:42 · Willy')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reste à produire' })).toBeTruthy();
    expect(screen.getByText('Total de la session')).toBeTruthy();
    expect(screen.getAllByText('2 013').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Plan', selected: true })).toBeTruthy();
  });

  it('garde les hooks stables quand on change d’onglet au clavier', async () => {
    await ouvrir();
    const plan = screen.getByRole('tab', { name: 'Plan' });
    fireEvent.keyDown(plan, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: 'Production réalisée' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Réalisé', selected: true })).toBeTruthy();
  });

  it('écart du réalisé : conforme, à surveiller, hors seuil', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Réalisé' }));
    saisir(screen.getByLabelText('Réalisé BAG'), '940');
    saisir(screen.getByLabelText('Réalisé KO'), '760');
    saisir(screen.getByLabelText('Réalisé GC 135'), '100');
    expect(screen.getByText('−5 · -0,5 %')).toBeTruthy();
    expect(screen.getByText('Conforme')).toBeTruthy();
    expect(screen.getByText('À surveiller')).toBeTruthy();
    expect(screen.getByText('Hors seuil')).toBeTruthy();
    // Le reste à produire suit la saisie.
    expect(screen.getByText('116')).toBeTruthy();
  });

  it('clôture impossible sans réalisé : message, onglet qui manque, focus sur le champ vide', async () => {
    await ouvrir();
    fireEvent.click(bouton('Clôturer la production'));
    expect(
      await screen.findByText(
        'Saisissez la production réalisée et la consommation réelle avant de clôturer',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Réalisé BAG')));
    expect(appels).toEqual([]);
  });

  it('consommation en écart : alerte, motif obligatoire (focus), puis justification envoyée', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Consommation' }));
    const valeurs = ['320', '3600', '2700', '1800', '30', '1', '3'];
    const champs = screen.getAllByPlaceholderText('0');
    valeurs.forEach((v, i) => saisir(champs[i]!, v));
    expect(screen.getByRole('alert').textContent).toContain('Écart de 20,0 kg');
    fireEvent.click(bouton('Envoyer au gérant'));
    expect(await screen.findByText('Choisissez un motif')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('justification-motif-perte'));
    fireEvent.click(bouton('Brûlé'));
    expect(bouton('Brûlé').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(bouton('Envoyer au gérant'));
    expect(await screen.findByText('Justification envoyée au gérant : Brûlé')).toBeTruthy();
    expect(appels.some((a) => a.startsWith('consommation'))).toBe(true);
  });

  it('clôture complète : fenêtre avec les sorties de stock, puis production clôturée', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Réalisé' }));
    saisir(screen.getByLabelText('Réalisé BAG'), '940');
    saisir(screen.getByLabelText('Réalisé KO'), '760');
    saisir(screen.getByLabelText('Réalisé GC 135'), '100');
    fireEvent.click(screen.getByRole('tab', { name: 'Consommation' }));
    const valeurs = ['300', '3600', '2700', '1800', '30', '1', '3'];
    const champs = screen.getAllByPlaceholderText('0');
    valeurs.forEach((v, i) => saisir(champs[i]!, v));
    fireEvent.click(bouton('Clôturer la production'));
    const fenetre = await screen.findByRole('dialog');
    expect(within(fenetre).getByText('Réalisé : 1 800 pains sur 2 013 prévus')).toBeTruthy();
    const sorties = within(fenetre)
      .getAllByRole('listitem')
      .map((l) => l.textContent);
    expect(sorties).toContain('Farine−300 kg · reste 1200');
    expect(sorties).toContain('Levure−2700 g · reste 0');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Clôturer et enregistrer' }));
    expect(await screen.findByText(/Production clôturée par Serge/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Reste à produire' })).toBeNull();
    expect(screen.getAllByText('Clôturée').length).toBeGreaterThan(0);
    expect(appels).toContain('cloturer');
  });

  it('écart au-delà du seuil : clôture refusée tant qu’il n’est pas justifié, puis stock insuffisant signalé', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Réalisé' }));
    saisir(screen.getByLabelText('Réalisé BAG'), '940');
    saisir(screen.getByLabelText('Réalisé KO'), '760');
    saisir(screen.getByLabelText('Réalisé GC 135'), '100');
    fireEvent.click(screen.getByRole('tab', { name: 'Consommation' }));
    const valeurs = ['300', '20000', '2700', '1800', '30', '1', '3'];
    const champs = screen.getAllByPlaceholderText('0');
    valeurs.forEach((v, i) => saisir(champs[i]!, v));
    fireEvent.click(bouton('Clôturer la production'));
    expect(await screen.findByText('Justifiez l’écart de matières avant de clôturer')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('justification-motif-perte')),
    );
    fireEvent.click(bouton('Perte'));
    fireEvent.click(bouton('Envoyer au gérant'));
    await screen.findByText('Justification envoyée au gérant : Perte');
    fireEvent.click(bouton('Clôturer la production'));
    const fenetre = await screen.findByRole('dialog');
    expect(within(fenetre).getByText(/stock insuffisant/)).toBeTruthy();
  });

  it('supplément après validation : demande au gérant, motif obligatoire', async () => {
    await ouvrir();
    fireEvent.click(bouton('Reprendre la suggestion'));
    expect(bouton('Demander +1 sac(s) au gérant')).toBeTruthy();
    fireEvent.click(bouton('Demander +1 sac(s) au gérant'));
    await waitFor(() => expect(appels.some((a) => a.startsWith('supplement'))).toBe(true));
  });

  it('supplément sans sac ni motif : message et focus sur le champ fautif', async () => {
    await ouvrir('serge', { depart: COMMANDES });
    fireEvent.click(bouton('Ajouter au plan · +0 sac(s)'));
    expect(await screen.findByText('Ajoutez au moins un sac')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('supplement-plus-BAG'));
    fireEvent.click(bouton('Ajouter un sac de BAG'));
    fireEvent.click(bouton('Ajouter au plan · +1 sac(s)'));
    expect(await screen.findByText('Choisissez un motif')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('supplement-motif-habituels'));
    expect(appels).toEqual([]);
  });

  it('propose le plan quand les commandes sont closes', async () => {
    await ouvrir('serge', { depart: COMMANDES });
    fireEvent.click(bouton('Proposer le plan · 6 sacs'));
    expect(await screen.findByText('En attente de la validation de Willy')).toBeTruthy();
    expect(appels).toEqual(['proposer']);
  });
});

describe('Atelier › Production (gérant, propriétaire)', () => {
  it('le gérant de la semaine valide le plan proposé', async () => {
    await ouvrir('willy', { depart: PLAN_PROPOSE });
    fireEvent.click(bouton('Valider le plan'));
    expect(await screen.findByText('Ouverture par Serge')).toBeTruthy();
    expect(appels).toEqual(['valider']);
  });

  it('hors de son tour le gérant attend, et il ne saisit pas', async () => {
    await ouvrir('willy', { depart: COMMANDES });
    expect(screen.getByText('En attente du plan de Serge')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Reprendre la suggestion|Ajouter au plan/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Réalisé' }));
    expect((screen.getByLabelText('Réalisé BAG') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Lecture seule/)).toBeTruthy();
  });

  it('le propriétaire consulte : champs désactivés, aucune action', async () => {
    await ouvrir('fotso');
    expect(screen.queryByRole('button', { name: 'Clôturer la production' })).toBeNull();
    expect(screen.getByText('Clôture par Serge')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Réalisé' }));
    expect(screen.getByText('Lecture seule pour le propriétaire.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer la production' })).toBeNull();
  });

  it('historique : la production en cours puis les cinq clôturées', async () => {
    await ouvrir('willy');
    const table = screen.getByRole('table', { name: 'Productions rattachées aux semaines' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 1 + 5);
    expect(within(table).getByText('Brûlés (four 2), justifié par Serge')).toBeTruthy();
    expect(within(table).getByText('21.4 kg')).toBeTruthy();
  });
});

describe('Atelier › Production en anglais', () => {
  it('traduit le cycle et les onglets', async () => {
    await ouvrir('serge', { langue: 'en' });
    expect(screen.getByRole('button', { name: 'Close production' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Material use' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Left to produce' })).toBeTruthy();
  });
});

describe('Atelier › Production : fiche technique', () => {
  it('le chef lit la fiche : coût, marge, procédé, sans bouton de modification', async () => {
    await ouvrir('serge', { chemin: '/atelier/production?fiche=bag' });
    expect(await screen.findByRole('heading', { name: 'Baguette' })).toBeTruthy();
    expect(screen.getAllByText('99,1 FCFA').length).toBeGreaterThan(0);
    expect(screen.getByText('315')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Modifier la fiche' })).toBeNull();
    expect(screen.getByText(/servent de référence au pétrissage/)).toBeTruthy();
  });

  it('la fiche ouverte depuis les paramètres y ramène', async () => {
    await ouvrir('fotso', { chemin: '/atelier/production?fiche=bag&depuis=parametres' });
    const retour = await screen.findByRole('link', { name: '‹ Tous les produits' });
    expect(retour.getAttribute('href')).toBe('/gestion/parametres');
    // Passer à un autre produit garde le retour vers les paramètres.
    fireEvent.click(await screen.findByRole('button', { name: /^KO/ }));
    expect(
      (await screen.findByRole('link', { name: '‹ Tous les produits' })).getAttribute('href'),
    ).toBe('/gestion/parametres');
  });
});

describe('Atelier › Production : modification d’une fiche (propriétaire)', () => {
  it('refuse une quantité nulle (erreur, focus), efface l’erreur à la saisie, puis crée la version 4', async () => {
    lecture.modifierFicheSurLeServeur.mockImplementation(async () => {
      const apres = structuredClone(fiches);
      const bag = apres.fiches.find((f) => f.id === 'bag')!;
      Object.assign(bag, {
        version: 4,
        modifieLe: '2026-10-14',
        modifieA: '18:02',
        modifiePar: 'M. Fotso',
      });
      fiches = apres;
      return structuredClone(apres);
    });
    await ouvrir('fotso', { chemin: '/atelier/production?fiche=bag' });
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la fiche' }));
    const sel = screen.getByLabelText('Sel (kg)');
    saisir(sel, '0');
    fireEvent.click(bouton('Enregistrer · version 4'));
    expect((await screen.findByRole('alert')).textContent).toContain('supérieures à zéro');
    expect(document.activeElement).toBe(sel);
    saisir(sel, '0,7');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(bouton('Enregistrer · version 4'));
    expect(await screen.findByText('Fiche BAG enregistrée · version 4')).toBeTruthy();
    expect(screen.getByText(/Version 4 · modifiée le 14 oct\. · /)).toBeTruthy();
  });
});

// Le serveur refuse l'écriture d'un profil sans droit : l'écran dit le refus du serveur.
describe('Atelier › Production : refus du serveur', () => {
  it('affiche la phrase du serveur quand la proposition du plan est refusée', async () => {
    await ouvrir('serge', { depart: COMMANDES });
    serveur.use(
      http.post('*/api/v1/productions/proposer/', () =>
        HttpResponse.json(
          { detail: 'Les commandes ne sont pas closes.', code: 'commandes_ouvertes' },
          { status: 409 },
        ),
      ),
    );
    fireEvent.click(bouton('Proposer le plan · 6 sacs'));
    expect(await screen.findByText('Les commandes ne sont pas closes.')).toBeTruthy();
  });

  it('refuse l’écran à un profil sans droit', async () => {
    lecture.lireProductionReelle.mockRejectedValue(
      new ErreurApi(403, { detail: 'Refusé.', code: 'droit_insuffisant' }),
    );
    await ouvrir('willy').catch(() => undefined);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
