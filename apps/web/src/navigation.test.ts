import { describe, expect, it } from 'vitest';

import { cheminAccueil, cleMenu, cleTitre, ecransDe } from './navigation.ts';
import { espacesDe, PROFILS, type Profil } from './profils.ts';

const PROFILS_CONNUS = Object.keys(PROFILS) as Profil[];

describe('navigation', () => {
  it('chaque espace visible d’un profil a au moins un écran', () => {
    for (const profil of PROFILS_CONNUS) {
      for (const espace of espacesDe(profil)) {
        expect(ecransDe(profil, espace).length, `${profil} / ${espace}`).toBeGreaterThan(0);
      }
    }
  });

  it('aucun écran n’apparaît dans un espace que le profil ne peut pas ouvrir', () => {
    for (const profil of PROFILS_CONNUS) {
      for (const espace of ['comptoir', 'atelier', 'gestion'] as const) {
        if (!espacesDe(profil).includes(espace)) expect(ecransDe(profil, espace)).toEqual([]);
      }
    }
  });

  it('la caissière trouve clients, dépenses et demandes dans le comptoir', () => {
    const cles = ecransDe('caissier', 'comptoir').map((ecran) => ecran.cle);
    expect(cles).toEqual(['session', 'caisses', 'clients', 'depenses', 'demandes']);
  });

  it('le responsable de production trouve ses semaines dans l’atelier', () => {
    const cles = ecransDe('production', 'atelier').map((ecran) => ecran.cle);
    expect(cles).toEqual(['production', 'stocks', 'semaines']);
  });

  it('l’administrateur ne voit que l’administration, le journal et les paramètres', () => {
    const cles = ecransDe('administrateur', 'gestion').map((ecran) => ecran.cle);
    expect(cles).toEqual(['utilisateurs', 'sauvegardes', 'envois', 'journal', 'parametres']);
  });

  it('le gérant n’a pas « Paramètres » (cahier des charges §3.3), le propriétaire l’a', () => {
    const gerant = ecransDe('gerant', 'gestion').map((ecran) => ecran.cle);
    const proprietaire = ecransDe('proprietaire', 'gestion').map((ecran) => ecran.cle);
    expect(gerant).toEqual([
      'tableau-de-bord',
      'semaines',
      'clients',
      'fournisseurs',
      'depenses',
      'personnel',
      'demandes',
      'rapports',
      'envois',
      'journal',
    ]);
    expect(proprietaire).toEqual([...gerant, 'parametres']);
  });

  it('chaque profil arrive sur un écran qu’il peut ouvrir (O10)', () => {
    expect(cheminAccueil('caissier')).toBe('/comptoir/session');
    expect(cheminAccueil('production')).toBe('/atelier/production');
    expect(cheminAccueil('gerant')).toBe('/gestion/semaines');
    expect(cheminAccueil('proprietaire')).toBe('/gestion/tableau-de-bord');
    expect(cheminAccueil('administrateur')).toBe('/gestion/utilisateurs');
  });

  it('le menu et le titre d’un écran sont deux textes distincts, comme dans la maquette', () => {
    expect(cleMenu({ cle: 'depenses' })).toBe('menu.depenses');
    expect(cleTitre({ cle: 'depenses' })).toBe('titres.depenses');
  });
});
