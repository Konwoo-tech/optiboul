import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReponseCaisses } from '../espaces/comptoir/caisses/types.ts';
import { installerApiSimulee, reinitialiserSimulation } from './routeur.ts';
import { memoriserUtilisateurConnecte } from './session.ts';

const RACINE = 'http://localhost/api/v1/simulation/caisses/';
const lire = (chemin = '') => fetch(`${RACINE}${chemin}`);
const poster = (chemin: string, corps: object) =>
  fetch(`${RACINE}${chemin}`, { method: 'POST', body: JSON.stringify(corps) });
const caisses = async () => (await (await lire()).json()) as ReponseCaisses;
const jusquaLaFermeture = async () => {
  await poster('fermer/', { compte: 22_450 });
};

describe('caisses simulées', () => {
  let retablir: () => void;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('')),
    );
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('davy');
  });
  afterEach(() => {
    retablir();
    vi.unstubAllGlobals();
  });

  describe('qui voit quoi (US-044)', () => {
    it('refuse sans connexion et aux profils sans caisse', async () => {
      memoriserUtilisateurConnecte(null);
      expect((await lire()).status).toBe(403);
      memoriserUtilisateurConnecte('serge');
      expect((await lire()).status).toBe(403);
      memoriserUtilisateurConnecte('admin');
      expect((await lire()).status).toBe(403);
    });

    it('la caissière ne voit que ses caisses', async () => {
      const donnees = await caisses();
      expect(donnees.sessions.map((s) => s.caissiere.id)).toEqual(['davy', 'davy', 'davy']);
      expect(donnees.caissieres).toEqual([{ id: 'davy', nom: 'Davy' }]);
      expect(donnees.sessions.at(-1)).toMatchObject({ enCours: true, attendu: 22_950 });
    });

    it('l’autre caissière ne voit pas la caisse de Davy, mais sait qu’elle est ouverte', async () => {
      memoriserUtilisateurConnecte('rachel');
      const donnees = await caisses();
      expect(donnees.sessions.map((s) => s.caissiere.id)).toEqual(['rachel', 'rachel', 'rachel']);
      expect(donnees.sessions.some((s) => s.enCours)).toBe(false);
      expect(donnees.detail).toBeNull();
      expect(donnees.caisseOuverte?.caissiere.nom).toBe('Davy');
    });

    it.each(['willy', 'fotso'])('%s voit toutes les caisses et les deux caissières', async (id) => {
      memoriserUtilisateurConnecte(id);
      const donnees = await caisses();
      expect(donnees.sessions).toHaveLength(6);
      expect(donnees.caissieres.map((c) => c.id)).toEqual(['davy', 'rachel']);
      expect(donnees.detail).toMatchObject({ attendu: 22_950 });
    });
  });

  describe('ouverture (US-040)', () => {
    it('refuse d’ouvrir quand une caisse est déjà ouverte', async () => {
      const reponse = await poster('ouvrir/', { fonds: 20_000 });
      expect(reponse.status).toBe(409);
      expect(await reponse.json()).toMatchObject({ code: 'caisse_deja_ouverte' });
    });

    it('ouvre le créneau suivant avec le fonds compté', async () => {
      await jusquaLaFermeture();
      const avant = await caisses();
      expect(avant.prochaine).toMatchObject({ type: 'jour', jour: '2026-10-15' });
      expect(avant.prochaine.planifiee).toEqual({ id: 'rachel', nom: 'Rachel' });

      expect((await poster('ouvrir/', { fonds: 25_000 })).status).toBe(204);
      const apres = await caisses();
      expect(apres.sessions.at(-1)).toMatchObject({
        enCours: true,
        type: 'jour',
        jour: '2026-10-15',
        fonds: 25_000,
        attendu: 25_000,
        recette: 0,
        caissiere: { id: 'davy' },
      });
    });

    it('trace l’ouverture hors planning dans le journal', async () => {
      await jusquaLaFermeture();
      await poster('ouvrir/', { fonds: 20_000 });
      const journal = (await (await lire('journal/')).json()) as { action: string }[];
      expect(journal[0]?.action).toContain('(planifiée : Rachel)');
    });

    it('refuse un fonds qui n’est pas un entier', async () => {
      await jusquaLaFermeture();
      expect((await poster('ouvrir/', { fonds: 20_000.5 })).status).toBe(400);
      expect((await poster('ouvrir/', { fonds: -1 })).status).toBe(400);
    });

    it('le propriétaire n’ouvre pas de caisse', async () => {
      await jusquaLaFermeture();
      memoriserUtilisateurConnecte('fotso');
      expect((await poster('ouvrir/', { fonds: 20_000 })).status).toBe(403);
    });
  });

  describe('fermeture (US-042)', () => {
    it('enregistre l’écart : compté − attendu, statut manque', async () => {
      expect((await poster('fermer/', { compte: 22_450 })).status).toBe(204);
      const donnees = await caisses();
      expect(donnees.caisseOuverte).toBeNull();
      expect(donnees.sessions.at(-1)).toMatchObject({
        enCours: false,
        attendu: 22_950,
        compte: 22_450,
        fermeture: { par: 'Davy' },
      });
    });

    it('exige un comptage entier', async () => {
      expect((await poster('fermer/', {})).status).toBe(400);
      expect((await poster('fermer/', { compte: 1.5 })).status).toBe(400);
    });

    it('une caissière ne ferme pas la caisse d’une autre, la direction oui', async () => {
      memoriserUtilisateurConnecte('rachel');
      expect((await poster('fermer/', { compte: 22_950 })).status).toBe(403);
      memoriserUtilisateurConnecte('willy');
      expect((await poster('fermer/', { compte: 22_950 })).status).toBe(204);
    });

    it('refuse de fermer deux fois', async () => {
      await jusquaLaFermeture();
      expect((await poster('fermer/', { compte: 1 })).status).toBe(409);
    });
  });

  describe('réouverture (US-043)', () => {
    it('est réservée au gérant et au propriétaire', async () => {
      await jusquaLaFermeture();
      expect((await poster('rouvrir/', { motif: 'Erreur' })).status).toBe(403);
      memoriserUtilisateurConnecte('willy');
      expect((await caisses()).rouvrable).toBe(true);
    });

    it('exige un motif', async () => {
      await jusquaLaFermeture();
      memoriserUtilisateurConnecte('willy');
      const reponse = await poster('rouvrir/', { motif: '   ' });
      expect(reponse.status).toBe(400);
      expect(await reponse.json()).toMatchObject({ code: 'motif_obligatoire' });
    });

    it('rouvre, garde la ligne fermée et trace le motif avec l’information du propriétaire', async () => {
      await jusquaLaFermeture();
      memoriserUtilisateurConnecte('willy');
      expect((await poster('rouvrir/', { motif: 'Erreur de comptage' })).status).toBe(204);
      const donnees = await caisses();
      // Comme la maquette : la ligne fermée reste, la caisse ouverte s'y ajoute.
      expect(donnees.sessions.map((s) => s.enCours)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        true,
      ]);
      const journal = (await (await lire('journal/')).json()) as { action: string }[];
      expect(journal[0]?.action).toContain('Erreur de comptage');
      expect(journal[0]?.action).toContain('propriétaire informé');
    });

    it('une caisse refermée remplace sa ligne précédente', async () => {
      await jusquaLaFermeture();
      memoriserUtilisateurConnecte('willy');
      await poster('rouvrir/', { motif: 'Erreur' });
      await poster('fermer/', { compte: 22_950 });
      const donnees = await caisses();
      expect(donnees.sessions).toHaveLength(6);
      expect(donnees.sessions.at(-1)).toMatchObject({ compte: 22_950 });
    });

    it('refuse de rouvrir une caisse ouverte', async () => {
      memoriserUtilisateurConnecte('willy');
      expect((await poster('rouvrir/', { motif: 'x' })).status).toBe(409);
    });
  });

  describe('remise au coffre (US-041)', () => {
    const encaisser = (especes: number) => poster('encaissements/', { especes });

    it('retire les espèces remises de l’attendu et trace le receveur et l’heure', async () => {
      await encaisser(80_000);
      const avant = await caisses();
      expect(avant.detail?.attendu).toBe(102_950);
      expect(avant.plafond).toBe(100_000);

      const reponse = await poster('remettre/', { montant: 82_950, receveur: 'willy' });
      expect(reponse.status).toBe(200);
      expect(await reponse.json()).toMatchObject({ attendu: 20_000, receveur: 'Willy' });
      expect((await caisses()).detail).toMatchObject({ remises: 82_950, attendu: 20_000 });
      const journal = (await (await lire('journal/')).json()) as { action: string }[];
      expect(journal[0]?.action).toMatch(
        /Remise au coffre de 82950 FCFA, reçue par Willy à \d\d:\d\d/,
      );
    });

    it('la remise réduit l’espèces attendues à la fermeture', async () => {
      await poster('remettre/', { montant: 10_000, receveur: 'fotso' });
      expect((await caisses()).sessions.at(-1)?.attendu).toBe(12_950);
    });

    it('refuse un montant nul, supérieur aux espèces ou sans receveur valide', async () => {
      expect((await poster('remettre/', { montant: 0, receveur: 'willy' })).status).toBe(400);
      expect((await poster('remettre/', { montant: 99_999, receveur: 'willy' })).status).toBe(400);
      expect((await poster('remettre/', { montant: 1_000, receveur: 'davy' })).status).toBe(400);
    });

    it('seule la caissière de la caisse ou la direction la fait', async () => {
      memoriserUtilisateurConnecte('rachel');
      expect((await poster('remettre/', { montant: 1_000, receveur: 'willy' })).status).toBe(403);
    });

    it('refuse sur une caisse fermée', async () => {
      await jusquaLaFermeture();
      expect((await poster('remettre/', { montant: 100, receveur: 'willy' })).status).toBe(409);
    });
  });

  it('une réinitialisation remet les caisses de la maquette', async () => {
    await jusquaLaFermeture();
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('davy');
    expect((await caisses()).caisseOuverte).not.toBeNull();
  });
});
