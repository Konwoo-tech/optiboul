import { Paginee } from '@/ui';
import { useTranslation } from '@/i18n';
import { useId } from 'react';

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
  /** Le serveur n'a pas de désactivation de compte : le bouton est alors masqué. */
  peutActiver?: boolean;
  /** Vrai serveur : lève le blocage d'un compte. */
  onDebloquer?: (utilisateur: Utilisateur) => void;
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
  peutActiver = true,
  onDebloquer,
}: Props) {
  const { t, i18n } = useTranslation();
  const idFiltres = useId();
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
      <fieldset className={styles.filtres} aria-labelledby={idFiltres}>
        <span id={idFiltres} className={styles.invisible}>
          {t('gestion.utilisateurs.filtres.etiquette')}
        </span>
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
        <Paginee elements={visibles} cle={String(filtre)}>
          {(page) => (
            <ul className={styles.liste} aria-label={t('gestion.utilisateurs.liste.etiquette')}>
              {page.map((u) => {
                const lui = u.id === moi;
                return (
                  <li key={u.id} className={styles.ligne}>
                    <Pastille nom={u.nom} profil={u.profil} />
                    <div className={styles.identite}>
                      <div className={styles.nom}>
                        {u.nom} · <span className={styles.profil}>{t(`profils.${u.profil}`)}</span>
                      </div>
                      <div className={styles.sous}>
                        {t(
                          u.telephone
                            ? 'gestion.utilisateurs.liste.sousLigne'
                            : 'gestion.utilisateurs.liste.sousLigneSansTelephone',
                          {
                            email: u.email,
                            telephone: u.telephone,
                            acces: formaterAcces(u.dernierAcces, i18n.language),
                          },
                        )}
                      </div>
                    </div>
                    <select
                      className={styles.choix}
                      value={u.groupe}
                      disabled={lui}
                      aria-disabled={occupe || undefined}
                      aria-label={t('gestion.utilisateurs.liste.groupeDe', { nom: u.nom })}
                      onChange={(e) => onGroupe(u, e.target.value)}
                    >
                      {groupes.map((g) => (
                        <option key={g.id} value={g.id}>
                          {nomDuGroupe(g, i18n.language)}
                        </option>
                      ))}
                    </select>
                    <Mot niveau={u.bloque ? 'surveiller' : u.actif ? 'ok' : 'neutre'}>
                      {t(
                        u.bloque
                          ? 'gestion.utilisateurs.liste.bloque'
                          : u.actif
                            ? 'gestion.utilisateurs.liste.actif'
                            : 'gestion.utilisateurs.liste.desactive',
                      )}
                    </Mot>
                    <button
                      type="button"
                      className={styles.petit}
                      aria-disabled={occupe || undefined}
                      aria-label={t('gestion.utilisateurs.liste.reinitialiserDe', { nom: u.nom })}
                      onClick={() => onReinitialiser(u)}
                    >
                      {t('gestion.utilisateurs.liste.reinitialiser')}
                    </button>
                    {u.bloque && onDebloquer && (
                      <button
                        type="button"
                        className={styles.petit}
                        aria-disabled={occupe || undefined}
                        aria-label={t('gestion.utilisateurs.liste.debloquerDe', { nom: u.nom })}
                        onClick={() => onDebloquer(u)}
                      >
                        {t('gestion.utilisateurs.liste.debloquer')}
                      </button>
                    )}
                    {!lui && peutActiver && (
                      <button
                        type="button"
                        className={styles.petitDiscret}
                        aria-disabled={occupe || undefined}
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
          )}
        </Paginee>
        {visibles.length === 0 && (
          <div className={styles.vide}>{t('gestion.utilisateurs.liste.aucunMembre')}</div>
        )}
      </div>

      <DroitsParProfil />
    </>
  );
}
