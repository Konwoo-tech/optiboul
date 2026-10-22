/**
 * Accès HTTP à l'API : même origine, cookie de session et en-tête CSRF (ADR-06, ADR-11).
 * `baseUrl` ne sert qu'aux tests et outils hors navigateur.
 */
export type ConfigurationApi = {
  baseUrl: string;
  application?: string;
  credentials: RequestCredentials;
  /** Délai maximal d'une requête, en millisecondes. */
  delaiMs: number;
  enTetes?: () => Record<string, string> | Promise<Record<string, string>>;
};

let configuration: ConfigurationApi = {
  baseUrl: '',
  credentials: 'same-origin',
  delaiMs: 15_000,
};

export function configurerApi(partielle: Partial<ConfigurationApi>) {
  configuration = { ...configuration, ...partielle };
}

/** Erreur de l'API au format RFC 9457 (Problem Details) avec un code métier. */
export class ErreurApi extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, details: unknown) {
    const probleme = (details ?? {}) as { detail?: string; code?: string };
    super(probleme.detail ?? `Erreur HTTP ${status}`);
    this.status = status;
    this.code = probleme.code;
    this.details = details;
  }
}

const METHODES_SURES = new Set(['GET', 'HEAD', 'OPTIONS']);

/** En production Django préfixe le cookie (`__Secure-`, CSRF_COOKIE_NAME) ; en local non. */
const COOKIES_CSRF = ['__Secure-csrftoken', 'csrftoken'];

function lireCookie(nom: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const debut = `${nom}=`;
  const cookie = document.cookie.split('; ').find((c) => c.startsWith(debut));
  if (!cookie) return undefined;
  const valeur = cookie.slice(debut.length);
  try {
    return decodeURIComponent(valeur);
  } catch {
    // Cookie mal encodé : on envoie la valeur brute plutôt que de bloquer toute écriture.
    return valeur;
  }
}

/** Jeton CSRF courant, pour les formulaires envoyés par le navigateur (hors `fetch`). */
export function jetonCsrf(): string | undefined {
  return COOKIES_CSRF.map(lireCookie).find(Boolean);
}

function lireJson(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return undefined;
  }
}

/**
 * Envoie la requête et lit le corps, en l'abandonnant au-delà du délai maximal ou si
 * l'appelant l'annule (react-query annule les requêtes devenues inutiles).
 */
async function envoyer(url: string, init: RequestInit, annulation?: AbortSignal | null) {
  const controleur = new AbortController();
  const minuteur = setTimeout(
    () => controleur.abort(new DOMException('Délai dépassé', 'TimeoutError')),
    configuration.delaiMs,
  );
  const annuler = () => controleur.abort(annulation?.reason);
  if (annulation?.aborted) annuler();
  annulation?.addEventListener('abort', annuler, { once: true });
  try {
    const reponse = await fetch(url, { ...init, signal: controleur.signal });
    const texte = [204, 205, 304].includes(reponse.status) ? '' : await reponse.text();
    return { reponse, texte };
  } finally {
    clearTimeout(minuteur);
    annulation?.removeEventListener('abort', annuler);
  }
}

/** Le serveur répond, mais la session est absente ou expirée (DRF renvoie 403 sans session). */
export function estSansSession(erreur: unknown): boolean {
  return erreur instanceof ErreurApi && (erreur.status === 401 || erreur.status === 403);
}

/**
 * Pas de nouvelle tentative sur une erreur 4xx (réponse définitive du serveur) ;
 * réseau coupé, délai dépassé et 5xx sont réessayés deux fois.
 */
export function reessayer(tentatives: number, erreur: unknown): boolean {
  if (erreur instanceof ErreurApi && erreur.status >= 400 && erreur.status < 500) return false;
  return tentatives < 2;
}

export async function optiboulFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const enTetes = new Headers(options.headers);
  enTetes.set('Accept', 'application/json');
  if (configuration.application) enTetes.set('X-OptiBoul-App', configuration.application);
  if (!METHODES_SURES.has((options.method ?? 'GET').toUpperCase())) {
    const csrf = jetonCsrf();
    if (csrf) enTetes.set('X-CSRFToken', csrf);
  }
  for (const [nom, valeur] of Object.entries((await configuration.enTetes?.()) ?? {})) {
    enTetes.set(nom, valeur);
  }

  const { reponse, texte } = await envoyer(
    `${configuration.baseUrl}${url}`,
    { ...options, headers: enTetes, credentials: configuration.credentials },
    options.signal,
  );
  // Une page d'erreur HTML d'un proxy (502, 504) n'est pas du JSON : elle reste une ErreurApi.
  const data = texte ? lireJson(texte) : undefined;
  if (!reponse.ok) throw new ErreurApi(reponse.status, data);
  if (texte && data === undefined) {
    throw new ErreurApi(reponse.status, {
      detail: 'Réponse inattendue du serveur.',
      code: 'reponse_invalide',
    });
  }
  return { data, status: reponse.status, headers: reponse.headers } as T;
}
