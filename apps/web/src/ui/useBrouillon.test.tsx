import { configurerApi } from '@/api';
import { creerServeurApi } from '@/test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useBrouillon } from './useBrouillon.ts';

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());
afterEach(() => {
  cleanup();
  serveur.resetHandlers();
});

type Saisie = { texte: string };

function utiliser(initiale: Saisie) {
  return renderHook(() => {
    const [saisie, setSaisie] = useState<Saisie>(initiale);
    useBrouillon<Saisie>('test', saisie, saisie.texte === '', setSaisie);
    return { saisie, setSaisie };
  });
}

describe('useBrouillon', () => {
  it('restaure le brouillon du serveur à l’ouverture', async () => {
    serveur.use(
      http.get('*/api/v1/brouillons/test/', () =>
        HttpResponse.json({ cle: 'test', contenu: { texte: 'repris' }, mis_a_jour: '2026-11-25' }),
      ),
    );
    const { result } = utiliser({ texte: '' });
    await waitFor(() => expect(result.current.saisie.texte).toBe('repris'));
  });

  it('n’appelle pas la suppression quand il n’y a jamais eu de brouillon', async () => {
    const appels: string[] = [];
    serveur.use(
      http.get('*/api/v1/brouillons/test/', () => new HttpResponse(null, { status: 404 })),
      http.delete('*/api/v1/brouillons/test/', () => {
        appels.push('delete');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = utiliser({ texte: '' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    expect(result.current.saisie.texte).toBe('');
    expect(appels).toEqual([]);
  });

  it('envoie la saisie après un court délai, puis supprime le brouillon quand elle est vidée', async () => {
    const appels: string[] = [];
    let contenu: unknown;
    serveur.use(
      http.get('*/api/v1/brouillons/test/', () => new HttpResponse(null, { status: 404 })),
      http.put('*/api/v1/brouillons/test/', async ({ request }) => {
        contenu = ((await request.json()) as { contenu: unknown }).contenu;
        appels.push('put');
        return HttpResponse.json({ cle: 'test', contenu, mis_a_jour: '2026-11-25' });
      }),
      http.delete('*/api/v1/brouillons/test/', () => {
        appels.push('delete');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = utiliser({ texte: '' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    act(() => result.current.setSaisie({ texte: 'en cours' }));
    await waitFor(() => expect(appels).toEqual(['put']), { timeout: 3000 });
    expect(contenu).toEqual({ texte: 'en cours' });
    act(() => result.current.setSaisie({ texte: '' }));
    await waitFor(() => expect(appels).toEqual(['put', 'delete']), { timeout: 3000 });
  });
});
