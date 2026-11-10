import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { journalUtilisateurs } from '@/simulation/utilisateurs.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranUtilisateurs from './EcranUtilisateurs.tsx';

vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

let retablir: () => void;

async function ouvrir(utilisateur = 'admin', langue: 'fr' | 'en' = 'fr', chemin = '') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'utilisateurs')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/gestion/utilisateurs${chemin}`]}>
          <EcranUtilisateurs ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  cleanup();
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const onglet = (nom: RegExp) => screen.getByRole('tab', { name: nom });

describe('Gestion › Utilisateurs : liste', () => {
  it('affiche les onglets, les filtres, les neuf comptes et les droits par profil', async () => {
    await ouvrir();
    expect(await screen.findByRole('tab', { name: 'Utilisateurs · 9' })).toBeTruthy();
    expect(onglet(/Groupes · 6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tous · 9' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(9);
    expect(
      screen.getByText(
        /davy\.boulfaubourg@gmail\.com · \+237 6 77 41 20 18 · dernier accès 14 oct\. 18:02/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Droits par profil' })).toBeTruthy();
  });

  it('filtre par groupe et dit quand un groupe est vide', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Production · 2' }));
    const liste = screen.getByRole('list', { name: 'Utilisateurs' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
  });

  it('verrouille le groupe et la désactivation de son propre compte', async () => {
    await ouvrir();
    const groupe = (await screen.findByLabelText(
      'Groupe de Support OptiBoul',
    )) as HTMLSelectElement;
    expect(groupe.disabled).toBe(true);
    expect(
      screen.queryByRole('button', { name: /Désactiver le compte de Support OptiBoul/ }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: /Désactiver le compte de Davy/ })).toBeTruthy();
  });

  it('change un utilisateur de groupe : toast, profil mis à jour, journal', async () => {
    await ouvrir();
    fireEvent.change(await screen.findByLabelText('Groupe de Davy'), { target: { value: 'g3' } });
    expect(
      await screen.findByText('Davy → Gérants de la semaine · droits « Gérant de la semaine »'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/^Davy ·/).textContent).toContain('Gérant de la semaine'),
    );
    expect(journalUtilisateurs()[0]?.quoi).toContain('Davy → Gérants de la semaine');
  });

  it('réinitialise le code et désactive puis réactive un compte', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText('Code de Rachel réinitialisé')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte de Rachel' }));
    expect(await screen.findByText('Désactivé')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Réactiver le compte de Rachel' }));
    await waitFor(() => expect(screen.getAllByText('Actif')).toHaveLength(9));
  });

  it('dit le refus du serveur quand le profil ne permet pas l’action', async () => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    memoriserUtilisateurConnecte('willy');
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText('Votre profil ne permet pas cette action.')).toBeTruthy();
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('admin', 'en');
    expect(await screen.findByRole('tab', { name: 'Users · 9' })).toBeTruthy();
    expect(screen.getByText(/last access Oct 14 18:02/, { exact: false })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Rights by profile' })).toBeTruthy();
  });
});

/** Les appels qui modifient (pas les lectures) reçoivent cette réponse du « serveur ». */
function repondreAuxEcritures(reponse: () => Response) {
  const reel = globalThis.fetch;
  const ecritures: string[] = [];
  globalThis.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const methode = (init?.method ?? 'GET').toUpperCase();
    if (methode === 'GET') return reel(entree, init);
    ecritures.push(methode);
    return reponse();
  }) as typeof fetch;
  return ecritures;
}

const refus = (status: number, code: string) => () =>
  Response.json({ detail: 'Refusé.', code }, { status });

describe('Gestion › Utilisateurs : refus du serveur', () => {
  const textes: Array<[number, string, string]> = [
    [409, 'compte_propre', 'Vous ne pouvez pas modifier votre propre compte.'],
    [409, 'dernier_administrateur', 'Il doit rester au moins un administrateur actif.'],
    [404, 'utilisateur_inconnu', 'Cet utilisateur n’existe plus. La liste a été relue.'],
    [409, 'autre_conflit', 'Action impossible. La liste a été relue.'],
    [403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.'],
  ];

  it.each(textes)('dit le refus %i %s et relit la liste', async (status, code, texte) => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    const reel = globalThis.fetch;
    let relues = 0;
    const ecritures = repondreAuxEcritures(refus(status, code));
    const enveloppe = globalThis.fetch;
    globalThis.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET').toUpperCase() === 'GET') relues += 1;
      return enveloppe(entree, init);
    }) as typeof fetch;
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText(texte)).toBeTruthy();
    expect(ecritures).toEqual(['POST']);
    await waitFor(() => expect(relues).toBeGreaterThan(0));
    globalThis.fetch = reel;
  });

  it('dit une erreur réseau et relit la liste', async () => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    const reel = globalThis.fetch;
    let relues = 0;
    globalThis.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
        relues += 1;
        return reel(entree, init);
      }
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte de Rachel' }));
    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeTruthy();
    await waitFor(() => expect(relues).toBeGreaterThan(0));
    globalThis.fetch = reel;
  });

  it('ne lance qu’une écriture pour deux clics rapprochés, et garde le focus', async () => {
    await ouvrir();
    const bouton = await screen.findByRole('button', { name: 'Réinitialiser le code de Rachel' });
    const ecritures = repondreAuxEcritures(() => new Response('{}', { status: 500 }));
    bouton.focus();
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Une erreur est survenue. Réessayez.');
    expect(ecritures).toHaveLength(1);
    // aria-disabled et non disabled : le bouton cliqué ne perd jamais le focus.
    expect(bouton.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(bouton);
  });

  it('ne lance qu’un changement de groupe pour deux changements rapprochés', async () => {
    await ouvrir();
    const choix = await screen.findByLabelText('Groupe de Davy');
    const ecritures = repondreAuxEcritures(refus(409, 'compte_propre'));
    fireEvent.change(choix, { target: { value: 'g3' } });
    fireEvent.change(choix, { target: { value: 'g2' } });
    await screen.findByText('Vous ne pouvez pas modifier votre propre compte.');
    expect(ecritures).toHaveLength(1);
  });
});

describe('Gestion › Utilisateurs : chargement', () => {
  it('propose « Réessayer » quand la lecture échoue, puis affiche la liste', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await initI18n('fr').changeLanguage('fr');
    configurerApi({ baseUrl: 'http://localhost' });
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('admin');
    const reel = globalThis.fetch;
    let echecs = 1;
    globalThis.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entree instanceof Request ? entree.url : entree);
      if (echecs > 0 && url.includes('/gestion/utilisateurs/')) {
        echecs -= 1;
        return new Response('{}', { status: 500 });
      }
      return reel(entree, init);
    }) as typeof fetch;
    const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'utilisateurs')!;
    render(
      <OptiboulProvider>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter initialEntries={['/gestion/utilisateurs']}>
            <EcranUtilisateurs ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
    expect(await screen.findByText('Impossible de lire les utilisateurs. Réessayez.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('tab', { name: 'Utilisateurs · 9' })).toBeTruthy();
  });
});

describe('Gestion › Utilisateurs : groupes', () => {
  it('liste les groupes avec leurs membres', async () => {
    await ouvrir('admin', 'fr', '?onglet=groupes');
    expect(await screen.findByRole('heading', { name: 'Gérants de la semaine' })).toBeTruthy();
    const carte = screen.getByRole('region', { name: 'Gérants de la semaine' });
    expect(within(carte).getByText('3 membres')).toBeTruthy();
    expect(within(carte).getByText('Patrick')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Direction' })).getByText('1 membre'),
    ).toBeTruthy();
  });

  it('garde « Ajouter un membre » sans action tant que le formulaire n’est pas livré', async () => {
    await ouvrir('admin', 'fr', '?onglet=groupes');
    const bouton = await screen.findByRole('button', {
      name: 'Ajouter un membre au groupe Direction',
    });
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(bouton);
    expect(onglet(/Groupes/).getAttribute('aria-selected')).toBe('true');
  });

  it('crée un groupe, efface l’erreur à la saisie, refuse un nom vide ou en double', async () => {
    await ouvrir('admin', 'fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toBe('Indiquez le nom du groupe.');
    const champ = screen.getByLabelText('Nom du groupe');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(champ, { target: { value: 'direction' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(screen.getByRole('alert').textContent).toBe('Un groupe porte déjà ce nom.');
    fireEvent.change(champ, { target: { value: 'Livreurs' } });
    fireEvent.change(screen.getByLabelText('Profil de droits'), { target: { value: 'gerant' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByText('Groupe créé')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Livreurs' })).toBeTruthy();
    expect(screen.getByText('Profil de droits : Gérant de la semaine')).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText('Nom du groupe') as HTMLInputElement).value).toBe(''),
    );
    expect(onglet(/Groupes · 7/)).toBeTruthy();
    expect(journalUtilisateurs()[0]?.quoi).toBe(
      'Création du groupe Livreurs (Gérant de la semaine)',
    );
  });

  it('dit le refus du serveur pour un nom en double', async () => {
    await ouvrir('admin', 'fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    repondreAuxEcritures(refus(409, 'groupe_existant'));
    fireEvent.change(screen.getByLabelText('Nom du groupe'), { target: { value: 'Autre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByText('Un groupe porte déjà ce nom.')).toBeTruthy();
    // Le formulaire garde la saisie pour la corriger.
    expect((screen.getByLabelText('Nom du groupe') as HTMLInputElement).value).toBe('Autre');
  });

  it('ne crée qu’un groupe pour deux clics rapprochés', async () => {
    await ouvrir('admin', 'fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    fireEvent.change(screen.getByLabelText('Nom du groupe'), { target: { value: 'Livreurs' } });
    const bouton = screen.getByRole('button', { name: 'Créer le groupe' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Groupe créé');
    expect(
      journalUtilisateurs().filter((j) => j.quoi.startsWith('Création du groupe')),
    ).toHaveLength(1);
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('admin', 'en', '?onglet=groupes');
    expect(await screen.findByRole('heading', { name: 'Managers of the week' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'New group' })).toBeTruthy();
    expect(screen.getAllByText('3 members').length).toBeGreaterThan(0);
  });
});

describe('Gestion › Utilisateurs : accès', () => {
  it('rend non actionnable la vue du lot suivant, sans changer son rendu', async () => {
    await ouvrir();
    await screen.findByRole('tab', { name: /Utilisateurs · 9/ });
    const nouvelUtilisateur = screen.getByRole('tab', { name: 'Nouvel utilisateur' });
    expect(nouvelUtilisateur.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(nouvelUtilisateur);
    expect(onglet(/Utilisateurs · 9/).getAttribute('aria-selected')).toBe('true');
    const bouton = screen.getByRole('button', { name: '+ Nouvel utilisateur' });
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(bouton);
    expect(onglet(/Utilisateurs · 9/).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('tabindex')).toBe('0');
  });

  it('navigue entre les onglets livrés avec les flèches, Début et Fin', async () => {
    await ouvrir();
    const premier = await screen.findByRole('tab', { name: 'Utilisateurs · 9' });
    fireEvent.keyDown(premier, { key: 'ArrowRight' });
    await waitFor(() => expect(onglet(/Groupes/).getAttribute('aria-selected')).toBe('true'));
    expect(premier.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(onglet(/Groupes/), { key: 'Home' });
    await waitFor(() => expect(onglet(/Utilisateurs/).getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(onglet(/Utilisateurs/), { key: 'End' });
    await waitFor(() => expect(onglet(/Groupes/).getAttribute('aria-selected')).toBe('true'));
  });

  it('nomme le groupe de filtres et le tableau des droits', async () => {
    await ouvrir();
    expect(await screen.findByRole('group', { name: 'Filtrer par groupe' })).toBeTruthy();
    const tableau = screen.getByRole('table', { name: 'Droits par profil' });
    expect(within(tableau).queryByRole('heading')).toBeNull();
  });

  it('un profil sans le droit voit une erreur, pas la liste', async () => {
    await ouvrir('willy');
    expect(await screen.findByText('Impossible de lire les utilisateurs. Réessayez.')).toBeTruthy();
  });
});
