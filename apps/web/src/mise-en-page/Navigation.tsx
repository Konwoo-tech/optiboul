import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { useContexteSimule } from '@/simulation';
import { AvatarUtilisateur, BoutonDeconnexion } from '@/ui';
import { formaterDateCourte } from '@/utils';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';

import { cheminEcran, cleMenu, ecransDe } from '../navigation.ts';
import { espacesDe } from '../profils.ts';
import styles from './MiseEnPage.module.css';

/** Les espaces du profil (s'il en a plusieurs), puis les écrans de l'espace ouvert. */
function Liens({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const { pathname } = useLocation();
  const profil = utilisateur?.profil ?? null;
  const espaces = espacesDe(profil);
  const actif = espaces.find((espace) => pathname.startsWith(`/${espace}`)) ?? espaces[0];
  const plusieursEspaces = espaces.length > 1;

  return (
    <>
      {plusieursEspaces && (
        <nav aria-label={t('navigation.espaces')}>
          <div className={styles.section}>{t('navigation.espaces')}</div>
          <div className={styles.groupe}>
            {espaces.map((espace) => (
              <NavLink
                key={espace}
                to={`/${espace}`}
                className={`${styles.lien} ${styles.lienEspace}`}
                onClick={onNavigate}
              >
                {t(`espaces.${espace}`)}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      {actif && (
        <nav aria-label={t(`espaces.${actif}`)}>
          {plusieursEspaces && <div className={styles.section}>{t(`espaces.${actif}`)}</div>}
          <div className={styles.groupe}>
            {ecransDe(profil, actif).map((ecran) => (
              <NavLink
                key={ecran.cle}
                to={cheminEcran(ecran)}
                className={styles.lien}
                onClick={onNavigate}
              >
                {t(cleMenu(ecran))}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}

function Logo({ telephone = false }: { telephone?: boolean }) {
  return (
    <div className={telephone ? styles.logoTelephone : styles.logo}>
      <span className={styles.logoNom}>OptiBoul</span>
      <span className={styles.logoEtiquette}>ERP</span>
    </div>
  );
}

/** Menu de gauche des grands écrans. */
export function BarreLaterale() {
  const { t, i18n } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const { data: contexte } = useContexteSimule();
  const profil = utilisateur?.profil;

  return (
    <aside className={styles.barre}>
      <Logo />
      {contexte && (
        <div className={styles.semaine}>
          {t('coque.semaine', {
            numero: contexte.semaine.numero,
            du: formaterDateCourte(new Date(contexte.semaine.du), i18n.language),
            au: formaterDateCourte(new Date(contexte.semaine.au), i18n.language),
          })}
          <br />
          {t('coque.equipe', {
            gerant: contexte.gerantDeLaSemaine,
            production: contexte.responsableProduction,
          })}
        </div>
      )}
      <div className={styles.menu}>
        <Liens />
      </div>
      {utilisateur && profil && (
        <div className={styles.utilisateur}>
          <div className={styles.identite}>
            <AvatarUtilisateur nom={utilisateur.name ?? ''} profil={profil} taille={40} />
            <span className={styles.identiteTextes}>
              <span className={styles.identiteNom}>{utilisateur.name}</span>
              <span className={styles.identiteRole}>{t(`profils.${profil}`)}</span>
            </span>
          </div>
          <BoutonDeconnexion
            action="changer"
            libelle={t('commun.changerUtilisateur')}
            className={styles.changer}
          />
        </div>
      )}
    </aside>
  );
}

/** Barre du haut des téléphones, avec le menu déroulant. */
export function BarreTelephone() {
  const { t } = useTranslation();
  const { utilisateur } = useUtilisateurCourant();
  const [ouvert, setOuvert] = useState(false);
  const { pathname } = useLocation();
  const [pathnameOuvert, setPathnameOuvert] = useState(pathname);
  // Une navigation referme le menu.
  if (pathname !== pathnameOuvert) {
    setPathnameOuvert(pathname);
    setOuvert(false);
  }
  const profil = utilisateur?.profil;

  return (
    <>
      <div className={styles.barreTelephone}>
        <Logo telephone />
        <button
          type="button"
          className={styles.boutonMenu}
          aria-expanded={ouvert}
          onClick={() => setOuvert(!ouvert)}
        >
          {ouvert ? t('navigation.fermer') : t('navigation.menu')}
        </button>
      </div>
      {ouvert && (
        <div className={styles.menuTelephone}>
          <Liens onNavigate={() => setOuvert(false)} />
          {utilisateur && profil && (
            <div className={styles.piedTelephone}>
              <span className={styles.piedTelephoneNom}>
                {utilisateur.name} · {t(`profils.${profil}`)}
              </span>
              <BoutonDeconnexion
                action="changer"
                libelle={t('coque.changer')}
                className={styles.changer}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
