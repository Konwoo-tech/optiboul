import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErreurApi, estSansSession, optiboulFetch, reessayer } from './http.ts';

const reponseJson = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

function enTetesEnvoyes(fetchEspion: ReturnType<typeof vi.fn>): Headers {
  const options = fetchEspion.mock.calls[0]?.[1] as RequestInit;
  return new Headers(options.headers);
}

/** jsdom refuse d'écrire un cookie `__Secure-` en http : on simule la lecture du navigateur. */
function cookiesDuNavigateur(valeur: string) {
  vi.spyOn(document, 'cookie', 'get').mockReturnValue(valeur);
}

describe('optiboulFetch', () => {
  const fetchEspion = vi.fn();

  beforeEach(() => {
    fetchEspion.mockReset();
    vi.stubGlobal('fetch', fetchEspion);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envoie le jeton CSRF du cookie de production (__Secure-csrftoken)', async () => {
    cookiesDuNavigateur('autre=1; __Secure-csrftoken=jeton-prod; __Secure-sessionid=s');
    fetchEspion.mockResolvedValue(reponseJson({}));
    await optiboulFetch('/api/v1/x/', { method: 'POST' });
    expect(enTetesEnvoyes(fetchEspion).get('X-CSRFToken')).toBe('jeton-prod');
  });

  it('envoie le jeton CSRF du cookie local (csrftoken)', async () => {
    cookiesDuNavigateur('csrftoken=jeton-local');
    fetchEspion.mockResolvedValue(reponseJson({}));
    await optiboulFetch('/api/v1/x/', { method: 'PATCH' });
    expect(enTetesEnvoyes(fetchEspion).get('X-CSRFToken')).toBe('jeton-local');
  });

  it("n'envoie pas de jeton CSRF sur une lecture", async () => {
    cookiesDuNavigateur('csrftoken=jeton-local');
    fetchEspion.mockResolvedValue(reponseJson({}));
    await optiboulFetch('/api/v1/x/');
    expect(enTetesEnvoyes(fetchEspion).has('X-CSRFToken')).toBe(false);
  });

  it('transforme une page HTML 502 en ErreurApi, pas en SyntaxError', async () => {
    fetchEspion.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const erreur = await optiboulFetch('/api/v1/x/').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurApi);
    expect((erreur as ErreurApi).status).toBe(502);
  });

  it('refuse une réponse 200 qui n’est pas du JSON', async () => {
    fetchEspion.mockResolvedValue(new Response('<html>portail</html>', { status: 200 }));
    const erreur = await optiboulFetch('/api/v1/x/').catch((e: unknown) => e);
    expect((erreur as ErreurApi).code).toBe('reponse_invalide');
  });

  it("garde le détail et le code d'une erreur RFC 9457", async () => {
    const probleme = { detail: 'Caisse fermée', code: 'caisse_fermee' };
    fetchEspion.mockResolvedValue(reponseJson(probleme, 409));
    const erreur = (await optiboulFetch('/api/v1/x/').catch((e: unknown) => e)) as ErreurApi;
    expect([erreur.message, erreur.code, erreur.status]).toEqual([
      'Caisse fermée',
      'caisse_fermee',
      409,
    ]);
  });
});

describe('politique de nouvelles tentatives', () => {
  it('ne réessaie pas une réponse 4xx', () => {
    expect(reessayer(0, new ErreurApi(403, undefined))).toBe(false);
  });
  it('réessaie deux fois une coupure réseau ou un 5xx', () => {
    expect(reessayer(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(reessayer(1, new ErreurApi(503, undefined))).toBe(true);
    expect(reessayer(2, new ErreurApi(503, undefined))).toBe(false);
  });
  it('distingue « sans session » de « serveur injoignable »', () => {
    expect(estSansSession(new ErreurApi(401, undefined))).toBe(true);
    expect(estSansSession(new ErreurApi(403, undefined))).toBe(true);
    expect(estSansSession(new ErreurApi(503, undefined))).toBe(false);
    expect(estSansSession(new TypeError('Failed to fetch'))).toBe(false);
  });
});
