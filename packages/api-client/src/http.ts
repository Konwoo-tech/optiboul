/**
 * Accès HTTP à l'API : même origine, cookie de session et en-tête CSRF (ADR-06, ADR-11).
 * `baseUrl` ne sert qu'aux tests et outils hors navigateur.
 */
export type ConfigurationApi = {
  baseUrl: string;
  application?: string;
  credentials: RequestCredentials;
  enTetes?: () => Record<string, string> | Promise<Record<string, string>>;
};

let configuration: ConfigurationApi = { baseUrl: '', credentials: 'same-origin' };

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

function lireCookie(nom: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${nom}=`))
    ?.split('=')[1];
}

export async function optiboulFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const enTetes = new Headers(options.headers);
  enTetes.set('Accept', 'application/json');
  if (configuration.application) enTetes.set('X-OptiBoul-App', configuration.application);
  if (!METHODES_SURES.has((options.method ?? 'GET').toUpperCase())) {
    const csrf = lireCookie('csrftoken');
    if (csrf) enTetes.set('X-CSRFToken', csrf);
  }
  for (const [nom, valeur] of Object.entries((await configuration.enTetes?.()) ?? {})) {
    enTetes.set(nom, valeur);
  }

  const reponse = await fetch(`${configuration.baseUrl}${url}`, {
    ...options,
    headers: enTetes,
    credentials: configuration.credentials,
  });
  const texte = [204, 205, 304].includes(reponse.status) ? '' : await reponse.text();
  const data: unknown = texte ? JSON.parse(texte) : undefined;
  if (!reponse.ok) throw new ErreurApi(reponse.status, data);
  return { data, status: reponse.status, headers: reponse.headers } as T;
}
