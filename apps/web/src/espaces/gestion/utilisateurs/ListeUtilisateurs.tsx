import { useTranslation } from '@/i18n';

import { DroitsParProfil } from './DroitsParProfil.tsx';
import { Mot, Pastille } from './Pastille.tsx';
import { formaterAcces, nomDuGroupe, membresDuGroupe } from './regles.ts';
import styles from './Utilisateurs.module.css';
import type { Groupe, Utilisateur } from './types.ts';

type Props = {
  utilisateurs: Utilisateur[];
  groupes: Groupe[];
  moi: string;
  /** « all » ou l'identifiant d'un groupe. */
  filtre: string;
  occupe: boolean;
  onFiltre: (filtre: string) => void;
  onGroupe: (utilisateur: Utilisateur, groupe: string) => void;
  onReinitialiser: (utilisateur: Utilisateur) => void;
  onActiver: (utilisateur: Utilisateur) => void;
};

/** Onglet « Utilisateurs » : filtres par groupe, une ligne par compte, puis les droits par profil. */
export function ListeUtilisateurs({
  utilisateurs,
  groupes,
  moi,
  filtre,
  occupe,
  onFiltre,
  onGroupe,
  onReinitialiser,
  onActiver,
}: Props) {
  const { t, i18n } = useTranslation();
  const visibles = utilisateurs.filter((u) => filtre === 'all' || u.groupe === filtre);
  const filtres = [
    { id: 'all', libelle: t('gestion.utilisateurs.filtres.tous', { nombre: utilisateurs.length }) },
    ...groupes.map((g) => ({
      id: g.id,
      libelle: t('gestion.utilisateurs.filtres.groupe', {
        nom: nomDuGroupe(g, i18n.language),
        nombre: membresDuGroupe(utilisateurs, g.id).length,
      }),
    })),
  ];

  return (
    <>
      <fieldset className={styles.filtres} aria-label={t('gestion.utilisateurs.filtres.etiquette')}>
        {filtres.map((f) => (
          <button
            type="button"
            key={f.id}
            aria-pressed={filtre === f.id}
            className={`${styles.puce} ${filtre === f.id ? styles.puceActive : ''}`}
            onClick={() => onFiltre(f.id)}
          >
            {f.libelle}
          </button>
        ))}
      </fieldset>

      <div className={styles.carte}>
        <ul className={styles.liste} aria-label={t('gestion.utilisateurs.liste.etiquette')}>
          {visibles.map((u) => {
            const lui = u.id === moi;
            return (
              <li key={u.id} className={styles.ligne}>
                <Pastille nom={u.nom} profil={u.profil} />
                <div className={styles.identite}>
                  <div className={styles.nom}>
                    {u.nom} · <span className={styles.profil}>{t(`profils.${u.profil}`)}</span>
                  </div>
                  <div className={styles.sous}>
                    {t('gestion.utilisateurs.liste.sousLigne', {
                      email: u.email,
                      telephone: u.telephone,
                      acces: formaterAcces(u.dernierAcces, i18n.language),
                    })}
                  </div>
                </div>
                <select
                  className={styles.choix}
                  value={u.groupe}
                  disabled={lui || occupe}
                  aria-label={t('gestion.utilisateurs.liste.groupeDe', { nom: u.nom })}
                  onChange={(e) => onGroupe(u, e.target.value)}
                >
                  {groupes.map((g) => (
                    <option key={g.id} value={g.id}>
                      {nomDuGroupe(g, i18n.language)}
                    </option>
                  ))}
                </select>
                <Mot niveau={u.actif ? 'ok' : 'neutre'}>
                  {t(
                    u.actif
                      ? 'gestion.utilisateurs.liste.actif'
                      : 'gestion.utilisateurs.liste.desactive',
                  )}
                </Mot>
                <button
                  type="button"
                  className={styles.petit}
                  disabled={occupe}
                  aria-label={t('gestion.utilisateurs.liste.reinitialiserDe', { nom: u.nom })}
                  onClick={() => onReinitialiser(u)}
                >
                  {t('gestion.utilisateurs.liste.reinitialiser')}
                </button>
                {!lui && (
                  <button
                    type="button"
                    className={styles.petitDiscret}
                    disabled={occupe}
                    aria-label={t(
                      u.actif
                        ? 'gestion.utilisateurs.liste.desactiverDe'
                        : 'gestion.utilisateurs.liste.reactiverDe',
                      { nom: u.nom },
                    )}
                    onClick={() => onActiver(u)}
                  >
                    {t(
                      u.actif
                        ? 'gestion.utilisateurs.liste.desactiver'
                        : 'gestion.utilisateurs.liste.reactiver',
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {visibles.length === 0 && (
          <div className={styles.vide}>{t('gestion.utilisateurs.liste.aucunMembre')}</div>
        )}
      </div>

      <DroitsParProfil />
    </>
  );
}
