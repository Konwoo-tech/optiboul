import { afterEach, describe, expect, it, vi } from 'vitest';

import { creerClientRequetes } from './clientRequetes.ts';
import { getUsersMeRetrieveQueryKey } from './generated/endpoints/users/users.ts';
import { ErreurApi } from './http.ts';

const echec = (status: number) => () => Promise.reject(new ErreurApi(status, undefined));

describe('client de requêtes', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([401, 403])('un %i sur un appel revérifie la session', async (status) => {
    const client = creerClientRequetes();
    const espion = vi.spyOn(client, 'invalidateQueries');
    await client.fetchQuery({ queryKey: ['clients'], queryFn: echec(status) }).catch(() => {});
    expect(espion).toHaveBeenCalledWith({ queryKey: getUsersMeRetrieveQueryKey() });
  });

  it('une panne du serveur ne revérifie pas la session', async () => {
    const client = creerClientRequetes();
    const espion = vi.spyOn(client, 'invalidateQueries');
    await client.fetchQuery({ queryKey: ['clients'], queryFn: echec(503) }).catch(() => {});
    expect(espion).not.toHaveBeenCalled();
  });

  it('la requête de session ne se revérifie pas elle-même (pas de boucle)', async () => {
    const client = creerClientRequetes();
    const espion = vi.spyOn(client, 'invalidateQueries');
    await client
      .fetchQuery({ queryKey: getUsersMeRetrieveQueryKey(), queryFn: echec(403) })
      .catch(() => {});
    expect(espion).not.toHaveBeenCalled();
  });

  it('une écriture refusée (401) revérifie aussi la session', async () => {
    const client = creerClientRequetes();
    const espion = vi.spyOn(client, 'invalidateQueries');
    await client
      .getMutationCache()
      .build(client, { mutationFn: echec(401) })
      .execute(undefined)
      .catch(() => {});
    expect(espion).toHaveBeenCalledWith({ queryKey: getUsersMeRetrieveQueryKey() });
  });
});
