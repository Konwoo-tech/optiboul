import type { LigneJournal } from '@/api';
import en from '@/i18n/locales/en.json';
import fr from '@/i18n/locales/fr.json';
import { describe, expect, it } from 'vitest';

import { depuisLigneApi, texteDeValeur, typeDeLaLigne, versParametresApi } from './mapping.ts';
import { SANS_FILTRE, TYPES_ACTION } from './types.ts';

const ligne = (surcharge: Partial<LigneJournal> = {}): LigneJournal => ({
  id: 12,
  horodatage: '2026-10-14T17:02:00Z',
  acteur: 3,
  acteur_nom: 'Willy',
  profil: 'gerant',
  poste_id: null,
  poste_nom: '',
  entree: 'comptoir',
  action: 'caisse.fermeture',
  objet_type: 'caisse',
  objet_id: '7',
  avant: null,
  apres: null,
  ...surcharge,
});

describe('valeur avant / après', () => {
  it('« — » pour une valeur vide ou absente, le texte sinon', () => {
    expect(texteDeValeur(undefined)).toBe('—');
    expect(texteDeValeur(null)).toBe('—');
    expect(texteDeValeur('')).toBe('—');
    expect(texteDeValeur('2026-10-29')).toBe('2026-10-29');
    expect(texteDeValeur(0)).toBe('0');
    expect(texteDeValeur(false)).toBe('false');
    expect(texteDeValeur({ plafond: 5000 })).toBe('{"plafond":5000}');
  });
});

describe('mapping de l’API réelle vers le modèle de l’écran', () => {
  it('convertit une ligne : identifiant, jour et heure de Yaoundé, auteur, profil, type', () => {
    expect(depuisLigneApi(ligne())).toMatchObject({
      id: '12',
      quand: '2026-10-14T17:02:00.000Z',
      jour: '2026-10-14',
      heure: '18:02',
      auteur: 'Willy',
      profil: 'gerant',
      type: 'caisse',
    });
  });

  it('une action après minuit UTC tombe le bon jour à Yaoundé', () => {
    expect(depuisLigneApi(ligne({ horodatage: '2026-10-14T23:30:00Z' }))).toMatchObject({
      jour: '2026-10-15',
      heure: '00:30',
    });
  });

  it('un profil inconnu ou absent devient « sans profil »', () => {
    expect(depuisLigneApi(ligne({ profil: '' })).profil).toBeNull();
    expect(depuisLigneApi(ligne({ profil: 'roi' })).profil).toBeNull();
  });

  it('garde avant / après (unknown) en texte, et rien quand les deux manquent', () => {
    expect(depuisLigneApi(ligne())).not.toHaveProperty('avant');
    expect(depuisLigneApi(ligne({ avant: { v: 3 }, apres: { v: 4 } }))).toMatchObject({
      avant: '{"v":3}',
      apres: '{"v":4}',
    });
  });

  it('range une ligne dans la famille de son type d’objet ou de son action, sinon « demande »', () => {
    expect(typeDeLaLigne({ objet_type: 'depense', action: 'creer' })).toBe('depense');
    expect(typeDeLaLigne({ objet_type: '', action: 'connexion.reussie' })).toBe('connexion');
    expect(typeDeLaLigne({ objet_type: 'inconnu', action: 'autre' })).toBe('demande');
  });

  it('traduit les filtres en paramètres de l’API (auteur numérique)', () => {
    const ids = new Map([['Willy', 3]]);
    expect(versParametresApi(SANS_FILTRE, ids)).toEqual({});
    expect(
      versParametresApi(
        { auteur: 'Willy', type: 'caisse', du: '2026-10-01', au: '2026-10-14' },
        ids,
      ),
    ).toEqual({ auteur: 3, type: 'caisse', du: '2026-10-01', au: '2026-10-14' });
    // Un auteur sans identifiant connu n'est pas envoyé.
    expect(versParametresApi({ ...SANS_FILTRE, auteur: 'Inconnu' }, ids)).toEqual({});
  });
});

describe('libellés des types d’action', () => {
  it('chaque type a un libellé FR et un libellé EN, et aucun libellé en trop', () => {
    const types = (langue: typeof fr) => Object.keys(langue.gestion.journal.types).sort();
    expect(types(fr)).toEqual([...TYPES_ACTION].sort());
    expect(types(en as unknown as typeof fr)).toEqual([...TYPES_ACTION].sort());
  });
});
