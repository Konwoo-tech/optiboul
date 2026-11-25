import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import type { Profil } from '../../../profils.ts';
import EcranSemaines from './EcranSemaines.tsx';
import { CLOTUREE, DEPART, FERME, OUVERTE43 } from './instantanes.test-donnees.ts';
import type { InstantaneSemaines, Personne } from './types.ts';

/*
 * L'écran Semaines rendu depuis des instantanés au format de l'écran ; la composition de
 * l'instantané à partir des routes du serveur est testée dans reel.test.tsx. Les actions (affecter,
 * planifier, ouvrir, clôturer) appellent un faux serveur au format de l'API réelle, dont les
 * réponses font passer le « serveur » d'un instantané au suivant. La personne connectée vient de
 * `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lireSemainesReelles: vi.fn() }));
vi.mock('./reel.ts', () => lecture);

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES: Record<string, Personne> = {
  willy: { id: '3', nom: 'Willy', profil: 'gerant' },
  fotso: { id: '5', nom: 'M. Fotso', profil: 'proprietaire' },
  serge: { id: '4', nom: 'Serge', profil: 'production' },
};

/** L'instantané en vigueur côté « serveur », et la personne connectée. */
let etat: InstantaneSemaines;
let connecte: keyof typeof PERSONNES;
let appels: string[];

/** Le serveur identifie les semaines par un nombre : S42 → 2, S43 → 3… */
const idDeLaSemaine = (code: string) => Number(code.slice(1)) - 40;
const codeDeLaSemaine = (id: string | readonly string[] | undefined) => `S${Number(id) + 40}`;

const instantane = (): InstantaneSemaines => ({
  ...structuredClone(etat),
  moi: PERSONNES[connecte]!,
  semaines: etat.semaines.map((s) => ({ ...structuredClone(s), idServeur: idDeLaSemaine(s.id) })),
});

beforeEach(() => {
  etat = structuredClone(DEPART);
  appels = [];
  lecture.lireSemainesReelles.mockReset();
  lecture.lireSemainesReelles.mockImplementation(async () => instantane());
});

function installerServeur() {
  serveur.use(
    http.get('*/api/v1/users/me/', () => {
      const p = PERSONNES[connecte]!;
      return HttpResponse.json({
        id: Number(p.id),
        name: p.nom,
        email: 'x@optiboul.local',
        url: `http://localhost/api/v1/users/${p.id}/`,
        profil: p.profil satisfies Profil,
      });
    }),
    http.post('*/api/v1/semaines/:id/affectations/', async ({ params, request }) => {
      appels.push('affectations');
      const corps = (await request.json()) as { gerant: number | null; production: number | null };
      const code = codeDeLaSemaine(params.id);
      const trouver = (liste: Personne[], id: number | null) =>
        liste.find((p) => p.id === String(id)) ?? null;
      const semaine = etat.semaines.find((s) => s.id === code)!;
      semaine.gerant = trouver(etat.gerants, corps.gerant);
      semaine.production = trouver(etat.responsables, corps.production);
      return HttpResponse.json({});
    }),
    http.put('*/api/v1/semaines/:id/planning/', async ({ params, request }) => {
      appels.push('planning');
      const corps = (await request.json()) as {
        jour: string;
        creneau: 'jour' | 'nuit';
        caissiere: number | null;
      };
      const jours = etat.planning[codeDeLaSemaine(params.id)]!;
      jours[corps.jour]![corps.creneau] = corps.caissiere ? String(corps.caissiere) : '';
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/semaines/:id/cloturer/', () => {
      appels.push('cloturer');
      etat = structuredClone(CLOTUREE);
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/semaines/:id/ouvrir/', () => {
      appels.push('ouvrir');
      etat = structuredClone(OUVERTE43);
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/semaines/:id/cloturer-forcee/', async ({ request }) => {
      appels.push(`forcee ${JSON.stringify(await request.json())}`);
      etat = structuredClone(CLOTUREE);
      return HttpResponse.json({});
    }),
  );
}

async function ouvrir(
  utilisateur: keyof typeof PERSONNES = 'willy',
  langue: 'fr' | 'en' = 'fr',
  adresse = '',
  depart: InstantaneSemaines = DEPART,
) {
  connecte = utilisateur;
  etat = structuredClone(depart);
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
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
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
});

const puce = (numero: number) =>
  screen.getByRole('button', { name: new RegExp(`^Semaine ${numero}`) });
const choix = (nom: string | RegExp) =>
  screen.getByRole('combobox', { name: nom }) as HTMLSelectElement;

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
    expect(liste.value).toBe('2');
    fireEvent.change(liste, { target: { value: '1' } });
    await waitFor(() =>
      expect(choix(/Caissière · jeu\. 15 oct\. · Session de jour/).value).toBe('1'),
    );
    expect(appels).toEqual(['planning']);
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
    // Sur le vrai serveur, le rapport de passation se télécharge une fois la semaine clôturée.
    expect(screen.getByRole('button', { name: /Télécharger/ })).toBeTruthy();
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
    fireEvent.change(choix('Gérant de la semaine'), { target: { value: '8' } });
    await waitFor(() => expect(choix('Gérant de la semaine').value).toBe('8'));
    fireEvent.change(choix('Responsable de production'), { target: { value: '9' } });
    await waitFor(() => expect(choix('Responsable de production').value).toBe('9'));
    await waitFor(() =>
      expect(screen.getByText('La semaine 42 doit d’abord être clôturée.')).toBeTruthy(),
    );
  });

  it('le propriétaire force la clôture avec un motif', async () => {
    await ouvrir('fotso');
    fireEvent.click(await screen.findByRole('button', { name: /Forcer la clôture/ }));
    const fenetre = screen.getByRole('dialog');
    fireEvent.change(within(fenetre).getByRole('textbox'), {
      target: { value: 'Caisse bloquée par une panne de courant' },
    });
    fireEvent.click(within(fenetre).getByRole('button', { name: /Forcer la clôture/ }));
    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toContain('"motif":"Caisse bloquée par une panne de courant"');
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
    await ouvrir('willy', 'fr', '', FERME);
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
    expect(appels).toEqual(['cloturer']);
  });

  it('Échap ferme la fenêtre sans clôturer', async () => {
    await ouvrir('willy', 'fr', '', FERME);
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la semaine 42' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clôturer la semaine 42' })).toBeTruthy();
    expect(appels).toEqual([]);
  });

  it('le propriétaire clôture puis ouvre la semaine 43 depuis la fenêtre d’ouverture', async () => {
    await ouvrir('fotso', 'fr', '', FERME);
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
    expect(appels).toEqual(['cloturer', 'ouvrir']);
  });

  it('un refus du serveur est annoncé avec sa phrase et l’écran se remet à jour', async () => {
    await ouvrir('willy', 'fr', '', FERME);
    // Le propriétaire clôture entre-temps : le serveur refuse la clôture du gérant (409).
    serveur.use(
      http.post('*/api/v1/semaines/:id/cloturer/', () => {
        etat = structuredClone(CLOTUREE);
        return HttpResponse.json(
          { detail: 'La semaine 42 est déjà clôturée.', code: 'semaine_deja_cloturee' },
          { status: 409 },
        );
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer la semaine 42' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clôturer et générer la passation',
      }),
    );
    await screen.findByText('La semaine 42 est déjà clôturée.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.queryByText('Contrôles avant clôture')).toBeNull());
  });

  it('l’export PDF du rapport de passation est annoncé', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Exporter en PDF' }));
    expect(await screen.findByText('Rapport de passation exporté en PDF')).toBeTruthy();
  });
});
