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
import EcranSemaines from './EcranSemaines.tsx';

let retablir: () => void;

async function ouvrir(
  utilisateur = 'willy',
  langue: 'fr' | 'en' = 'fr',
  adresse = '',
  avant?: () => Promise<void>,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  // La préparation (clôtures) se fait en gérant ; on change ensuite de personne.
  memoriserUtilisateurConnecte('willy');
  await avant?.();
  memoriserUtilisateurConnecte(utilisateur);
  const espace = utilisateur === 'serge' ? 'atelier' : 'gestion';
  const ecran = ECRANS.find((e) => e.espace === espace && e.cle === 'semaines')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/${espace}/semaines${adresse}`]}>
          <EcranSemaines ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('group', { name: /Semaines de travail|Work weeks/ });
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const puce = (numero: number) =>
  screen.getByRole('button', { name: new RegExp(`^Semaine ${numero}`) });
const choix = (nom: string | RegExp) =>
  screen.getByRole('combobox', { name: nom }) as HTMLSelectElement;

/** Ferme la caisse et la session, ouvre et ferme la suivante, archive la production . */
async function toutFermer() {
  const appel = (chemin: string, methode: string, corps: object = {}) =>
    fetch(chemin, { method: methode, body: JSON.stringify(corps) });
  // Lire les semaines abonne la production à l'ouverture de la session suivante.
  await appel('/api/v1/simulation/gestion/semaines/', 'GET');
  const session = '/api/v1/simulation/comptoir/session/';
  const caisses = '/api/v1/simulation/caisses/';
  for (const tour of [1, 2]) {
    await appel(`${session}comptage/`, 'PUT', { especes: '22450' });
    await appel(`${session}cloturer/`, 'POST');
    await appel(`${caisses}fermer/`, 'POST', { compte: 22450 });
    if (tour === 1) {
      await appel(`${caisses}ouvrir/`, 'POST', { fonds: 20000 });
      await appel(`${session}ouvrir-suivante/`, 'POST');
    }
  }
}

describe('Gestion › Semaines : semaine ouverte', () => {
  it('affiche la semaine 42, ses chiffres, le planning, les contrôles et l’historique', async () => {
    await ouvrir();
    expect(screen.getByRole('heading', { name: 'Semaine 42', level: 2 })).toBeTruthy();
    expect(screen.getByText('1 237 050 FCFA')).toBeTruthy();
    expect(screen.getByText('6 · 41 sacs')).toBeTruthy();
    expect(screen.getByText('14 créneaux affectés sur 14')).toBeTruthy();
    expect(screen.getByText('8 clients doivent encore 14 050 FCFA')).toBeTruthy();
    expect(screen.getByText('DEM-021')).toBeTruthy();
    expect(screen.getByText('Rapport de passation')).toBeTruthy();
    expect(screen.getByText('Destinataire : Patrick, gérant de la semaine 43')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Historique des semaines' })).toBeTruthy();
    expect(puce(42).getAttribute('aria-pressed')).toBe('true');
  });

  it('la clôture est bloquée par la caisse et la production, sans ouvrir de fenêtre', async () => {
    await ouvrir();
    const bouton = screen.getByRole('button', { name: 'Clôturer la semaine 42' });
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    expect(
      screen.getByText(
        'Fermez la caisse et clôturez la production en cours avant de clôturer la semaine.',
      ),
    ).toBeTruthy();
    fireEvent.click(bouton);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('le gérant de la semaine planifie un créneau à venir', async () => {
    await ouvrir();
    const liste = choix(/Caissière · jeu\. 15 oct\. · Session de jour/);
    expect(liste.value).toBe('rachel');
    fireEvent.change(liste, { target: { value: 'davy' } });
    await waitFor(() =>
      expect(choix(/Caissière · jeu\. 15 oct\. · Session de jour/).value).toBe('davy'),
    );
  });

  it('les créneaux passés montrent la caisse réelle, sans liste de choix', async () => {
    await ouvrir();
    expect(screen.queryByRole('combobox', { name: /lun\. 12 oct\. · Session de jour/ })).toBeNull();
    expect(screen.getByText('−500')).toBeTruthy();
    expect(screen.getByText('+500')).toBeTruthy();
    expect(screen.getByText('En cours')).toBeTruthy();
  });

  it('en anglais, les textes et les dates suivent', async () => {
    await ouvrir('willy', 'en');
    expect(screen.getByRole('heading', { name: 'Week 42', level: 2 })).toBeTruthy();
    expect(screen.getByText('Mon Oct 12 → Sun Oct 18')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close week 42' })).toBeTruthy();
    expect(screen.getByText('Handover report')).toBeTruthy();
  });
});

describe('Gestion › Semaines : autres semaines et autres profils', () => {
  it('une semaine clôturée est en lecture seule, ses créneaux sont « Fermée »', async () => {
    await ouvrir();
    fireEvent.click(puce(41));
    expect(screen.getByRole('heading', { name: 'Semaine 41', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText('Contrôles avant clôture')).toBeNull();
    expect(screen.getAllByText('Fermée').length).toBeGreaterThan(0);
  });

  it('un gérant non affecté voit la semaine 43 sans pouvoir l’ouvrir', async () => {
    await ouvrir();
    fireEvent.click(puce(43));
    expect(screen.queryByRole('button', { name: 'Ouvrir la semaine 43' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('La semaine 42 doit d’abord être clôturée.')).toBeTruthy();
  });

  it('le propriétaire affecte le gérant et le responsable d’une semaine planifiée', async () => {
    await ouvrir('fotso', 'fr', '?semaine=S44');
    expect(
      screen.getByText('Affectez le gérant et le responsable de production avant l’ouverture.'),
    ).toBeTruthy();
    fireEvent.change(choix('Gérant de la semaine'), { target: { value: 'christelle' } });
    await waitFor(() => expect(choix('Gérant de la semaine').value).toBe('christelle'));
    fireEvent.change(choix('Responsable de production'), { target: { value: 'ignace' } });
    await waitFor(() => expect(choix('Responsable de production').value).toBe('ignace'));
    await waitFor(() =>
      expect(screen.getByText('La semaine 42 doit d’abord être clôturée.')).toBeTruthy(),
    );
  });

  it('le responsable de production consulte : rien à modifier, liens vers ses seuls écrans', async () => {
    await ouvrir('serge');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ouvrir la semaine/ })).toBeNull();
    const caisses = screen.getByRole('button', { name: /Ouvertures et fermetures de caisse/ });
    expect((caisses as HTMLButtonElement).disabled).toBe(true);
    const production = screen.getByRole('button', { name: /^Productions/ });
    expect((production as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Gestion › Semaines : clôture et ouverture', () => {
  it('clôture la semaine 42 une fois tout fermé : contrôles verts, fenêtre, passation', async () => {
    await ouvrir('willy', 'fr', '', toutFermer);
    expect(screen.getByText('Toutes les caisses de la semaine sont fermées')).toBeTruthy();
    expect(screen.getByText('Productions clôturées')).toBeTruthy();
    expect(screen.getByText('Levure')).toBeTruthy();
    const bouton = screen.getByRole('button', { name: 'Clôturer la semaine 42' });
    expect(bouton.getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(bouton);
    const fenetre = screen.getByRole('dialog');
    expect(within(fenetre).getByText(/gérant de la semaine suivante/)).toBeTruthy();
    expect(within(fenetre).getByText(/sera transmis à Patrick/)).toBeTruthy();
    fireEvent.click(
      within(fenetre).getByRole('button', { name: 'Clôturer et générer la passation' }),
    );
    await screen.findByText('Semaine 42 clôturée · passation envoyée à Patrick');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Contrôles avant clôture')).toBeNull();
    expect(screen.getAllByText('Clôturée').length).toBeGreaterThan(0);
  });

  it('Échap ferme la fenêtre sans clôturer', async () => {
    await ouvrir('willy', 'fr', '', toutFermer);
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la semaine 42' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clôturer la semaine 42' })).toBeTruthy();
  });

  it('le propriétaire clôture puis ouvre la semaine 43 depuis la fenêtre d’ouverture', async () => {
    await ouvrir('fotso', 'fr', '', toutFermer);
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la semaine 42' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clôturer et générer la passation',
      }),
    );
    await screen.findByText('Semaine 42 clôturée · passation envoyée à Patrick');
    fireEvent.click(puce(43));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la semaine 43' }));
    const fenetre = screen.getByRole('dialog');
    expect(within(fenetre).getByText('Ouvrir la semaine 43')).toBeTruthy();
    expect(within(fenetre).getByText('19 oct. → 25 oct.')).toBeTruthy();
    expect(within(fenetre).getByText('13 / 14')).toBeTruthy();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Ouvrir la semaine' }));
    await screen.findByText('Semaine 43 ouverte');
    await waitFor(() => expect(puce(43).textContent).toContain('Ouverte'));
    expect(screen.getByText('Contrôles avant clôture')).toBeTruthy();
  });

  it('un refus du serveur est annoncé et l’écran se remet à jour', async () => {
    await ouvrir('willy', 'fr', '', toutFermer);
    // Le propriétaire clôture entre-temps : le serveur refuse la clôture du gérant (409).
    memoriserUtilisateurConnecte('fotso');
    await fetch('/api/v1/simulation/gestion/semaines/cloturer/', {
      method: 'POST',
      body: JSON.stringify({ semaine: 'S42' }),
    });
    memoriserUtilisateurConnecte('willy');
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la semaine 42' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clôturer et générer la passation',
      }),
    );
    await screen.findByText(/ne peut plus être ouverte ou clôturée/);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('l’export PDF du rapport de passation est annoncé', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter en PDF' }));
    expect(await screen.findByText('Rapport de passation exporté en PDF')).toBeTruthy();
  });
});
