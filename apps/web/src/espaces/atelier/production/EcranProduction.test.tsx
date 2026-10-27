import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { placerLeCycle } from '@/simulation/production.ts';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranProduction from './EcranProduction.tsx';
import type { Etape } from './types.ts';

// L'écran ne lit qu'en simulation ; la simulation fait aussi office de serveur ici.
vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

let retablir: () => void;

async function ouvrir(
  utilisateur = 'serge',
  options: { etape?: Etape; langue?: 'fr' | 'en'; chemin?: string } = {},
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(options.langue ?? 'fr');
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  if (options.etape) placerLeCycle(options.etape);
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
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
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
    expect(within(fenetre).getByText(/−6 sacs/)).toBeTruthy();
    expect(within(fenetre).getByText(/reste 24/)).toBeTruthy();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Clôturer et enregistrer' }));
    expect(await screen.findByText(/Production clôturée par Serge/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Reste à produire' })).toBeNull();
    expect(screen.getAllByText('Clôturée').length).toBeGreaterThan(0);
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
    expect(within(fenetre).getByText(/−20 kg/)).toBeTruthy();
    expect(within(fenetre).getAllByText(/reste 0/).length).toBeGreaterThan(0);
  });

  it('supplément après validation : demande au gérant, motif obligatoire', async () => {
    await ouvrir();
    fireEvent.click(bouton('Reprendre la suggestion'));
    expect(bouton('Demander +1 sac(s) au gérant')).toBeTruthy();
    fireEvent.click(bouton('Demander +1 sac(s) au gérant'));
    expect(
      await screen.findByText(/Demande en attente : Augmentation de production : \+1 sac\(s\)/),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reprendre la suggestion' })).toBeNull();
  });

  it('supplément sans sac ni motif : message et focus sur le champ fautif', async () => {
    await ouvrir('serge', { etape: 'commandes' });
    fireEvent.click(bouton('Ajouter au plan · +0 sac(s)'));
    expect(await screen.findByText('Ajoutez au moins un sac')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('supplement-plus-BAG'));
    fireEvent.click(bouton('Ajouter un sac de BAG'));
    fireEvent.click(bouton('Ajouter au plan · +1 sac(s)'));
    expect(await screen.findByText('Choisissez un motif')).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('supplement-motif-habituels'));
  });

  it('avant la validation, le supplément s’ajoute au plan', async () => {
    await ouvrir('serge', { etape: 'commandes' });
    fireEvent.click(bouton('Ajouter un sac de BAG'));
    fireEvent.click(bouton('Clients habituels sans commande'));
    fireEvent.click(bouton('Ajouter au plan · +1 sac(s)'));
    expect(await screen.findByText('Supplément ajouté au plan')).toBeTruthy();
    expect(screen.getByText('dont supplément')).toBeTruthy();
  });

  it('propose le plan quand les commandes sont closes', async () => {
    await ouvrir('serge', { etape: 'commandes' });
    fireEvent.click(bouton('Proposer le plan · 6 sacs'));
    expect(await screen.findByText('En attente de la validation de Willy')).toBeTruthy();
  });
});

describe('Atelier › Production (gérant, propriétaire)', () => {
  it('le gérant de la semaine valide le plan proposé', async () => {
    await ouvrir('willy', { etape: 'plan-propose' });
    fireEvent.click(bouton('Valider le plan'));
    expect(await screen.findByText('Ouverture par Serge')).toBeTruthy();
  });

  it('hors de son tour le gérant attend, et il ne saisit pas', async () => {
    await ouvrir('willy', { etape: 'commandes' });
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
});

describe('Atelier › Production : modification d’une fiche (propriétaire)', () => {
  it('refuse une quantité nulle (erreur, focus), efface l’erreur à la saisie, puis crée la version 4', async () => {
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
