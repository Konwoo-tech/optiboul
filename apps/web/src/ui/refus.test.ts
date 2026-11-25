import { ErreurApi } from '@/api';
import { describe, expect, it, vi } from 'vitest';

import { afficherRefus, detailDuServeur } from './refus.ts';

const t = ((cle: string) => `texte:${cle}`) as never;

describe('message d’un refus du serveur', () => {
  it('un refus métier (code + 4xx) donne le message du serveur', () => {
    const refus = new ErreurApi(409, {
      code: 'manquant_clos',
      detail: 'Ce manquant est déjà suivi.',
    });
    expect(detailDuServeur(refus)).toBe('Ce manquant est déjà suivi.');
  });

  it('une panne (5xx), une erreur sans code ou une autre erreur n’en donnent pas', () => {
    expect(detailDuServeur(new ErreurApi(500, { code: 'x', detail: 'boum' }))).toBeUndefined();
    expect(detailDuServeur(new ErreurApi(400, { detail: 'invalide' }))).toBeUndefined();
    expect(detailDuServeur(new Error('réseau'))).toBeUndefined();
  });

  it('le message générique de l’écran est remplacé, un message précis est gardé', () => {
    const afficher = vi.fn();
    const refus = new ErreurApi(409, {
      code: 'manquant_clos',
      detail: 'Ce manquant est déjà suivi.',
    });
    afficherRefus(afficher, t, refus, 'gestion.fournisseurs.toasts.erreur');
    afficherRefus(afficher, t, refus, 'gestion.fournisseurs.toasts.impossible');
    afficherRefus(afficher, t, refus, 'gestion.fournisseurs.toasts.dejaFait');
    expect(afficher.mock.calls.map((c) => c[0])).toEqual([
      'Ce manquant est déjà suivi.',
      'Ce manquant est déjà suivi.',
      'texte:gestion.fournisseurs.toasts.dejaFait',
    ]);
  });
});
