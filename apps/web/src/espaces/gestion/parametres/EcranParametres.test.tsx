import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { lireJournal } from '@/simulation/journal.ts';
import { valeurDuParametre } from '@/simulation/parametres.ts';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { formaterNombre, formatFCFA } from '@/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranProduction from '../../atelier/production/EcranProduction.tsx';
import EcranParametres from './EcranParametres.tsx';

vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

let retablir: () => void;

async function ouvrir(
  utilisateur = 'fotso',
  langue: 'fr' | 'en' = 'fr',
  apresInstallation?: () => void,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  apresInstallation?.();
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'parametres')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/gestion/parametres']}>
          <EcranParametres ecran={ecran} />
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

const champ = async (nom: string | RegExp) =>
  (await screen.findByRole('textbox', { name: nom })) as HTMLInputElement;
const tracesDeParametres = () => lireJournal().filter((e) => e.type === 'parametre');

describe('Gestion › Paramètres : seuils et produits', () => {
  it('affiche les trois seuils de la maquette et les sept produits', async () => {
    await ouvrir();
    expect(await screen.findByRole('heading', { name: 'Seuils et règles' })).toBeTruthy();
    expect((await champ('Plafond de dette par client')).value).toBe('2000');
    expect((await champ('Seuil de validation des dépenses')).value).toBe('50000');
    expect((await champ('Écart matière toléré par sac')).value).toBe('2');

    const tableau = await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    expect(within(tableau).getAllByRole('row')).toHaveLength(8);
    const baguette = within(tableau).getByRole('link', { name: 'BAG – Baguette' });
    expect(baguette.getAttribute('href')).toBe('/atelier/production?fiche=bag&depuis=parametres');
    const ligne = baguette.closest('[role="row"]') as HTMLElement;
    expect(
      within(ligne)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['BAG – Baguette', formaterNombre(5000), '20', '315', '100 / 110']);
    expect(within(tableau).getAllByText('Fiche ›')).toHaveLength(7);
    // Pas de prix relevé : un tiret.
    const gc170 = within(tableau).getByRole('link', { name: 'GC 170 – Gros court 170' });
    expect(
      within(gc170.closest('[role="row"]') as HTMLElement).getAllByRole('cell')[4]!.textContent,
    ).toBe('—');
  });

  it('enregistre un seuil en quittant le champ : valeur, toast et une ligne au journal', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect(await screen.findByText('Plafond de dette par client enregistré')).toBeTruthy();
    expect(valeurDuParametre('plafond_dette_client')).toBe(3000);
    expect(tracesDeParametres()).toHaveLength(1);
    expect(tracesDeParametres()[0]).toMatchObject({
      auteur: 'M. Fotso',
      texte: 'Paramètre modifié : Plafond de dette par client',
    });
    await waitFor(async () =>
      expect((await champ('Plafond de dette par client')).value).toBe('3000'),
    );
  });

  it('Entrée enregistre une seule fois, même suivie de la sortie du champ', async () => {
    await ouvrir();
    const seuil = await champ('Seuil de validation des dépenses');
    await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    fireEvent.change(seuil, { target: { value: '70 000' } });
    fireEvent.keyDown(seuil, { key: 'Enter' });
    fireEvent.blur(seuil);
    await waitFor(() => expect(valeurDuParametre('seuil_validation_depenses')).toBe(70000));
    expect(tracesDeParametres()).toHaveLength(1);
  });

  it('ne trace rien quand la valeur ne change pas, et Échap abandonne la saisie', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    fireEvent.change(plafond, { target: { value: '2000' } });
    fireEvent.blur(plafond);
    fireEvent.change(plafond, { target: { value: '9999' } });
    fireEvent.keyDown(plafond, { key: 'Escape' });
    expect(plafond.value).toBe('2000');
    expect(tracesDeParametres()).toHaveLength(0);
    expect(valeurDuParametre('plafond_dette_client')).toBe(2000);
  });

  it('refuse une valeur invalide avec un message relié au champ, effacé à la frappe', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    fireEvent.change(plafond, { target: { value: 'beaucoup' } });
    fireEvent.blur(plafond);
    const message = await screen.findByRole('alert');
    expect(message.textContent).toBe('Saisissez un nombre entier.');
    expect(plafond.getAttribute('aria-invalid')).toBe('true');
    expect(plafond.getAttribute('aria-describedby')).toBe(message.id);
    expect(valeurDuParametre('plafond_dette_client')).toBe(2000);

    fireEvent.change(plafond, { target: { value: 'beaucoup d' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(plafond.getAttribute('aria-invalid')).toBeNull();
    expect(tracesDeParametres()).toHaveLength(0);
  });

  it('refuse une saisie vide', async () => {
    await ouvrir();
    const ecart = await champ('Écart matière toléré par sac');
    await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    fireEvent.change(ecart, { target: { value: '' } });
    fireEvent.blur(ecart);
    expect((await screen.findByRole('alert')).textContent).toBe('Saisissez un nombre entier.');
  });
});

describe('Gestion › Paramètres : autres paramètres et historique', () => {
  it('range les autres paramètres par famille avec leur valeur par défaut', async () => {
    await ouvrir();
    expect(await screen.findByRole('heading', { name: 'Tous les paramètres métier' })).toBeTruthy();
    for (const famille of ['Dettes et relances', 'Production', 'Paie', 'Sécurité et sauvegardes']) {
      expect(screen.getByRole('heading', { name: famille })).toBeTruthy();
    }
    expect(screen.getByText(/Valeur par défaut : 28 jour/)).toBeTruthy();
    expect(
      (screen.getByRole('textbox', { name: 'Jour de paie du mois' }) as HTMLInputElement).value,
    ).toBe('28');
  });

  it('enregistre un choix, un jour et des jours cochés aussitôt', async () => {
    await ouvrir();
    const inactivite = (await screen.findByRole('combobox', {
      name: 'Inactivité avant déconnexion au comptoir',
    })) as HTMLSelectElement;
    fireEvent.change(inactivite, { target: { value: '10' } });
    await waitFor(() => expect(valeurDuParametre('inactivite_comptoir')).toBe(10));

    fireEvent.change(screen.getByRole('combobox', { name: 'Échéance des dettes' }), {
      target: { value: 'vendredi' },
    });
    await waitFor(() => expect(valeurDuParametre('echeance_dettes')).toBe('vendredi'));

    const relances = screen.getByRole('group', { name: 'Jours des relances automatiques' });
    fireEvent.click(within(relances).getByRole('checkbox', { name: 'lundi' }));
    await waitFor(() =>
      expect(valeurDuParametre<string[]>('relances_jours')).toEqual(['lundi', 'jeudi', 'samedi']),
    );
    expect(tracesDeParametres()).toHaveLength(3);
  });

  it('refuse de décocher le dernier jour', async () => {
    await ouvrir();
    const relances = await screen.findByRole('group', { name: 'Jours des relances automatiques' });
    fireEvent.click(within(relances).getByRole('checkbox', { name: 'jeudi' }));
    await waitFor(() => expect(valeurDuParametre<string[]>('relances_jours')).toEqual(['samedi']));
    fireEvent.click(within(relances).getByRole('checkbox', { name: 'samedi' }));
    expect((await screen.findByText('Cochez au moins un jour.')).getAttribute('role')).toBe(
      'alert',
    );
    expect(valeurDuParametre<string[]>('relances_jours')).toEqual(['samedi']);
  });

  it('refuse une valeur hors bornes, avec les bornes dans le message', async () => {
    await ouvrir();
    const paie = await screen.findByRole('textbox', { name: 'Jour de paie du mois' });
    fireEvent.change(paie, { target: { value: '31' } });
    fireEvent.blur(paie);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saisissez une valeur entre 1 et 28.',
    );
  });

  it('contrôle le format d’une heure', async () => {
    await ouvrir();
    const heure = await screen.findByRole('textbox', { name: 'Heure des relances automatiques' });
    fireEvent.change(heure, { target: { value: '25:00' } });
    fireEvent.blur(heure);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saisissez une heure au format HH:MM.',
    );
    fireEvent.change(heure, { target: { value: '09:30' } });
    fireEvent.blur(heure);
    await waitFor(() => expect(valeurDuParametre('relances_heure')).toBe('09:30'));
  });

  it('montre l’historique des valeurs du paramètre choisi', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    await waitFor(() => expect(valeurDuParametre('plafond_dette_client')).toBe(3000));
    const historique = screen.getByRole('region', { name: 'Historique des valeurs' });
    const lignes = await within(historique).findAllByRole('row');
    expect(lignes).toHaveLength(2);
    expect(lignes[1]!.textContent).toContain(formatFCFA(3000));
    expect(lignes[1]!.textContent).toContain('M. Fotso');

    fireEvent.change(within(historique).getByLabelText('Paramètre'), {
      target: { value: 'fonds_caisse' },
    });
    expect(
      await within(historique).findByText(
        'Aucune modification : la valeur par défaut est en vigueur.',
      ),
    ).toBeTruthy();
  });
});

describe('Gestion › Paramètres : droits et langue', () => {
  it('l’administrateur consulte : champs en lecture seule, produits sans lien', async () => {
    await ouvrir('admin');
    const plafond = await screen.findByRole('textbox', { name: 'Plafond de dette par client' });
    expect(plafond.hasAttribute('readonly')).toBe(true);
    expect(await screen.findByText(/Lecture seule : seul le propriétaire/)).toBeTruthy();
    const tableau = await screen.findByRole('table', { name: 'Produits et fiches techniques' });
    expect(within(tableau).queryAllByRole('link')).toHaveLength(0);
    expect(within(tableau).getByText('BAG – Baguette')).toBeTruthy();
    expect(
      (screen.getByRole('combobox', { name: 'Échéance des dettes' }) as HTMLSelectElement).disabled,
    ).toBe(true);
    const relances = screen.getByRole('group', { name: 'Jours des relances automatiques' });
    expect(
      within(relances)
        .getAllByRole('checkbox')
        .every((c) => (c as HTMLInputElement).disabled),
    ).toBe(true);
    fireEvent.change(plafond, { target: { value: '9000' } });
    fireEvent.blur(plafond);
    expect(valeurDuParametre('plafond_dette_client')).toBe(2000);
  });

  it('refuse le gérant avec un message', async () => {
    await ouvrir('willy');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByText('Les paramètres sont réservés au propriétaire et à l’administrateur.'),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('fotso', 'en');
    expect(await screen.findByRole('heading', { name: 'Thresholds & rules' })).toBeTruthy();
    expect((await champ('Debt limit per customer')).value).toBe('2000');
    const tableau = await screen.findByRole('table', { name: 'Products & technical sheets' });
    expect(within(tableau).getByRole('link', { name: 'GC 135 – Short loaf 135' })).toBeTruthy();
    expect(within(tableau).getAllByText('Sheet ›').length).toBe(7);
    expect(screen.getByRole('combobox', { name: 'Debt due day' })).toBeTruthy();
    expect(screen.getByText('Default value: 28 day')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Value history' })).toBeTruthy();
  });

  it('la fiche ouverte depuis les paramètres y ramène', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await initI18n('fr').changeLanguage('fr');
    configurerApi({ baseUrl: 'http://localhost' });
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('fotso');
    const ecran = ECRANS.find((e) => e.espace === 'atelier' && e.cle === 'production')!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <OptiboulProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/atelier/production?fiche=bag&depuis=parametres']}>
            <EcranProduction ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
    const retour = await screen.findByRole('link', { name: '‹ Tous les produits' });
    expect(retour.getAttribute('href')).toBe('/gestion/parametres');
    // Passer à un autre produit garde le retour vers les paramètres.
    fireEvent.click(await screen.findByRole('button', { name: /^KO/ }));
    expect(
      (await screen.findByRole('link', { name: '‹ Tous les produits' })).getAttribute('href'),
    ).toBe('/gestion/parametres');
  });
});

/**
 * Intercepte les appels du faux serveur : `regle` renvoie une réponse pour la remplacer, ou
 * `undefined` pour laisser passer. Chaque test rétablit `fetch` avec la fonction renvoyée.
 */
function intercepter(
  regle: (methode: string, adresse: string) => Response | Promise<Response | undefined> | undefined,
) {
  const reel = globalThis.fetch;
  globalThis.fetch = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const adresse = entree instanceof Request ? entree.url : String(entree);
    const methode = (
      init?.method ?? (entree instanceof Request ? entree.method : 'GET')
    ).toUpperCase();
    return (await regle(methode, adresse)) ?? reel(entree, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = reel;
  };
}

const refus = (statut: number, corps: object) => Response.json(corps, { status: statut });

describe('Gestion › Paramètres : échecs et envois', () => {
  it('affiche la phrase du serveur pour un 400 sans code', async () => {
    await ouvrir();
    const defaire = intercepter((m) =>
      m === 'PUT' ? refus(400, { valeur: 'Valeur trop haute pour la caisse.' }) : undefined,
    );
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Valeur trop haute pour la caisse.',
    );
    expect(plafond.getAttribute('aria-invalid')).toBe('true');
    expect(plafond.value).toBe('3000');
    defaire();
  });

  it('affiche le message générique pour un 500, et garde la saisie', async () => {
    await ouvrir();
    const defaire = intercepter((m) => (m === 'PUT' ? refus(500, { detail: 'Boum' }) : undefined));
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le paramètre n’a pas pu être enregistré. Réessayez.',
    );
    expect(plafond.value).toBe('3000');
    expect(valeurDuParametre('plafond_dette_client')).toBe(2000);
    defaire();
  });

  it('dit que seul le propriétaire modifie quand le serveur répond 403 pendant l’enregistrement', async () => {
    await ouvrir();
    const defaire = intercepter((m) =>
      m === 'PUT' ? refus(403, { detail: 'Interdit', code: 'droit_insuffisant' }) : undefined,
    );
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Seul le propriétaire modifie les paramètres.',
    );
    defaire();
  });

  it('ne part qu’une fois quand le champ est quitté deux fois pendant l’envoi', async () => {
    await ouvrir();
    let envois = 0;
    let liberer!: () => void;
    const attente = new Promise<void>((r) => (liberer = r));
    const reel = globalThis.fetch;
    const defaire = intercepter(async (m, adresse) => {
      if (m !== 'PUT') return undefined;
      envois += 1;
      await attente;
      return reel(adresse, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valeur: 3000 }),
      });
    });
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    fireEvent.blur(plafond);
    fireEvent.keyDown(plafond, { key: 'Enter' });
    liberer();
    await waitFor(() => expect(valeurDuParametre('plafond_dette_client')).toBe(3000));
    expect(envois).toBe(1);
    expect(tracesDeParametres()).toHaveLength(1);
    defaire();
  });

  it('n’écrase pas une saisie retapée pendant l’envoi', async () => {
    await ouvrir();
    let liberer!: () => void;
    const attente = new Promise<void>((r) => (liberer = r));
    const reel = globalThis.fetch;
    const defaire = intercepter(async (m, adresse) => {
      if (m !== 'PUT') return undefined;
      await attente;
      return reel(adresse, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valeur: 3000 }),
      });
    });
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    fireEvent.change(plafond, { target: { value: '3500' } });
    liberer();
    await waitFor(() => expect(valeurDuParametre('plafond_dette_client')).toBe(3000));
    expect(plafond.value).toBe('3500');
    defaire();
    // La nouvelle saisie s'enregistre à la sortie suivante.
    fireEvent.blur(plafond);
    await waitFor(() => expect(valeurDuParametre('plafond_dette_client')).toBe(3500));
  });

  it('garde les seuils quand les produits ne se chargent pas', async () => {
    let defaire = () => {};
    await ouvrir('fotso', 'fr', () => {
      defaire = intercepter((m, adresse) =>
        m === 'GET' && adresse.includes('/parametres/produits/')
          ? refus(500, { detail: 'Boum' })
          : undefined,
      );
    });
    expect((await champ('Plafond de dette par client')).value).toBe('2000');
    expect(await screen.findByText('Impossible de charger les produits.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Produits et fiches techniques' })).toBeNull();
    defaire();
  });

  it('dit quand l’historique ne se charge pas', async () => {
    let defaire = () => {};
    await ouvrir('fotso', 'fr', () => {
      defaire = intercepter((m, adresse) =>
        m === 'GET' && adresse.includes('/historique/')
          ? refus(500, { detail: 'Boum' })
          : undefined,
      );
    });
    expect(await screen.findByText('Impossible de charger l’historique.')).toBeTruthy();
    defaire();
  });
});

describe('Gestion › Paramètres : effets sur les autres écrans', () => {
  const lireSimule = async (chemin: string) =>
    (await (await fetch(`http://localhost/api/v1/simulation/${chemin}`)).json()) as any;

  it('un plafond de dette modifié ici se voit au comptoir, chez les clients et au tableau de bord', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '4000' } });
    fireEvent.blur(plafond);
    await waitFor(() => expect(valeurDuParametre('plafond_dette_client')).toBe(4000));
    memoriserUtilisateurConnecte('davy');
    expect((await lireSimule('comptoir/session/')).plafond).toBe(4000);
    expect((await lireSimule('clients/')).plafond).toBe(4000);
    memoriserUtilisateurConnecte('willy');
    expect(JSON.stringify(await lireSimule('gestion/tableau-de-bord/'))).toContain(
      '"plafond":4000',
    );
  });

  it('un seuil de validation modifié ici change le seuil des dépenses', async () => {
    await ouvrir();
    const seuil = await champ('Seuil de validation des dépenses');
    fireEvent.change(seuil, { target: { value: '80000' } });
    fireEvent.blur(seuil);
    await waitFor(() => expect(valeurDuParametre('seuil_validation_depenses')).toBe(80000));
    memoriserUtilisateurConnecte('davy');
    expect((await lireSimule('comptoir/depenses/')).seuil).toBe(80000);
  });
});
