import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  cheminDuLien,
  heureDeNotification,
  typeDuGenre,
  useNombreNonLues,
  useNotifications,
} from './notifications.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  initI18n();
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => serveur.resetHandlers());
afterAll(() => serveur.close());

// Formes de réponse du vrai serveur (apps/api, schema.yml).
const NOTIFICATION = {
  id: 12,
  genre: 'caisse.hors_planning',
  genre_libelle: 'Caisse hors planning',
  titre: 'Caisse de nuit ouverte par Davy Caisse',
  message: 'Elle n’était pas prévue au planning.',
  lien: '/comptoir/caisses',
  cree_le: new Date().toISOString(),
  lue_le: null,
  lue: false,
};

function connecte(profil: string) {
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({ url: 'http://localhost/api/v1/users/3/', name: 'Willy', profil }),
    ),
  );
}

function Compteur() {
  return <div data-testid="compteur">{useNombreNonLues()}</div>;
}

function Tiroir({ actif = true }: { actif?: boolean }) {
  const { notifications, marquerLues, toutMarquerLu } = useNotifications(actif);
  return (
    <div>
      <pre data-testid="liste">{JSON.stringify(notifications)}</pre>
      <button type="button" onClick={() => void marquerLues(['12', '13'])}>
        lire
      </button>
      <button type="button" onClick={() => void toutMarquerLu()}>
        tout
      </button>
    </div>
  );
}

function ouvrir(contenu: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{contenu}</QueryClientProvider>);
}

const liste = () => JSON.parse(screen.getByTestId('liste').textContent ?? '[]');

describe('compteur de l’en-tête sur le vrai serveur', () => {
  it('affiche le nombre de notifications non lues', async () => {
    connecte('gerant');
    serveur.use(
      http.get('*/api/v1/notifications/non-lues/', () => HttpResponse.json({ non_lues: 3 })),
    );
    ouvrir(<Compteur />);
    await waitFor(() => expect(screen.getByTestId('compteur').textContent).toBe('3'));
  });

  it('affiche 0 avant la connexion, sans rien demander au serveur', async () => {
    serveur.use(http.get('*/api/v1/users/me/', () => new HttpResponse(null, { status: 403 })));
    let demandes = 0;
    serveur.events.on('request:start', ({ request }) => {
      if (request.url.includes('/notifications/')) demandes += 1;
    });
    ouvrir(<Compteur />);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(demandes).toBe(0);
    expect(screen.getByTestId('compteur').textContent).toBe('0');
  });
});

describe('tiroir des notifications sur le vrai serveur', () => {
  function servirListe() {
    serveur.use(
      http.get('*/api/v1/notifications/', () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: [NOTIFICATION] }),
      ),
    );
  }

  it('affiche titre, détail, type lisible, heure et écran à ouvrir', async () => {
    connecte('gerant');
    servirListe();
    ouvrir(<Tiroir />);
    await waitFor(() => expect(liste()).toHaveLength(1));
    expect(liste()[0]).toMatchObject({
      id: '12',
      lue: false,
      enDirect: false,
      type: 'Caisse hors planning',
      titre: 'Caisse de nuit ouverte par Davy Caisse',
      detail: 'Elle n’était pas prévue au planning.',
      chemin: '/comptoir/caisses',
    });
    expect(liste()[0].heure).toMatch(/^\d\d:\d\d$/);
  });

  it('ne lit pas la liste tant que le tiroir est fermé', async () => {
    connecte('gerant');
    let demandes = 0;
    serveur.use(
      http.get('*/api/v1/notifications/', () => {
        demandes += 1;
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] });
      }),
    );
    ouvrir(<Tiroir actif={false} />);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(demandes).toBe(0);
  });

  it('marque chaque notification comme lue puis relit', async () => {
    connecte('gerant');
    servirListe();
    const lues: string[] = [];
    serveur.use(
      http.post('*/api/v1/notifications/:id/marquer-lue/', ({ params }) => {
        lues.push(String(params.id));
        return HttpResponse.json({ ...NOTIFICATION, lue: true });
      }),
    );
    ouvrir(<Tiroir />);
    await waitFor(() => expect(liste()).toHaveLength(1));
    screen.getByRole('button', { name: 'lire' }).click();
    await waitFor(() => expect([...lues].sort()).toEqual(['12', '13']));
  });

  it('« tout marquer comme lu » appelle une seule route', async () => {
    connecte('gerant');
    servirListe();
    let appels = 0;
    serveur.use(
      http.post('*/api/v1/notifications/tout-marquer-lu/', () => {
        appels += 1;
        return HttpResponse.json({ marquees: 1 });
      }),
    );
    ouvrir(<Tiroir />);
    await waitFor(() => expect(liste()).toHaveLength(1));
    screen.getByRole('button', { name: 'tout' }).click();
    await waitFor(() => expect(appels).toBe(1));
  });
});

describe('écran atteint par « Ouvrir »', () => {
  it('suit le lien de l’API quand le profil peut ouvrir l’écran', () => {
    expect(cheminDuLien('/atelier/production', 'production')).toBe('/atelier/production');
    expect(cheminDuLien('/comptoir/caisses', 'gerant')).toBe('/comptoir/caisses');
  });

  it('garde l’onglet ou la passation du lien, et rien d’autre (#298)', () => {
    expect(cheminDuLien('/gestion/personnel', 'proprietaire')).toBe('/gestion/personnel');
    expect(cheminDuLien('/atelier/stocks?onglet=inventaires', 'gerant')).toBe(
      '/atelier/stocks?onglet=inventaires',
    );
    expect(cheminDuLien('/gestion/semaines?passation=7', 'proprietaire')).toBe(
      '/gestion/semaines?passation=7',
    );
    expect(cheminDuLien('/gestion/semaines?passation=7&x=1', 'proprietaire')).toBe(
      '/gestion/semaines?passation=7',
    );
  });

  it('le libellé du type vient du serveur ; sans lui, le genre rendu lisible', async () => {
    expect(typeDuGenre('caisse.hors_planning', 'Caisse hors planning')).toBe(
      'Caisse hors planning',
    );
    expect(typeDuGenre('plan.propose')).toBe('Plan propose');
  });

  it('n’en propose aucun si le profil ne peut pas ouvrir l’écran ou si le lien est inconnu', () => {
    expect(cheminDuLien('/gestion/parametres', 'caissier')).toBeNull();
    expect(cheminDuLien('/nulle/part', 'gerant')).toBeNull();
    expect(cheminDuLien('/comptoir', 'gerant')).toBeNull();
    expect(cheminDuLien('/comptoir/caisses', undefined)).toBeNull();
  });
});

describe('heure d’une notification', () => {
  const maintenant = new Date('2026-11-13T12:00:00+01:00');

  it('aujourd’hui : l’heure de Yaoundé', () => {
    expect(heureDeNotification('2026-11-13T02:06:00+01:00', 'fr', maintenant)).toBe('02:06');
  });

  it('un autre jour : la date courte puis l’heure', () => {
    expect(heureDeNotification('2026-11-12T17:02:00+01:00', 'fr', maintenant)).toBe(
      '12 nov. 17:02',
    );
    expect(heureDeNotification('2026-11-12T17:02:00+01:00', 'en', maintenant)).toBe('12 Nov 17:02');
  });

  it('compte la journée à l’heure de Yaoundé, pas en UTC', () => {
    // 23:30 UTC le 12 = 00:30 à Yaoundé le 13 : « aujourd’hui » pour un lecteur du 13.
    expect(heureDeNotification('2026-11-12T23:30:00Z', 'fr', maintenant)).toBe('00:30');
  });
});
