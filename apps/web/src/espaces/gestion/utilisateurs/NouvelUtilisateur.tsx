/* oxlint-disable jsx-a11y/prefer-tag-over-role -- bouton à rôle « checkbox » : case de la maquette */
import { useTranslation } from '@/i18n';
import { MOT_DE_PASSE_DEMO } from '@/simulation';
import { useId } from 'react';

import { Mot, Pastille } from './Pastille.tsx';
import {
  apercuTelephone,
  ecransAccessibles,
  membresDuGroupe,
  nomDuGroupe,
  saisirTelephone,
} from './regles.ts';
import styles from './Utilisateurs.module.css';
import type {
  Canal,
  ChampUtilisateur,
  ErreursUtilisateur,
  Groupe,
  NouvelUtilisateur as Brouillon,
  Utilisateur,
} from './types.ts';

const CANAUX: readonly Canal[] = ['whatsapp', 'sms'];
const NOM_DU_CANAL: Record<Canal, string> = { sms: 'SMS', whatsapp: 'WhatsApp' };

type Props = {
  brouillon: Brouillon;
  erreurs: ErreursUtilisateur;
  groupes: Groupe[];
  utilisateurs: Utilisateur[];
  /** Compte qui vient d'être créé : la confirmation remplace le formulaire. */
  cree: Utilisateur | null;
  occupe: boolean;
  onChamp: (champ: 'nom' | 'email' | 'telephone', valeur: string) => void;
  onGroupe: (groupe: string) => void;
  onCanal: (canal: Canal) => void;
  onInvitation: () => void;
  onAnnuler: () => void;
  onCreer: () => void;
  onVoirLaListe: () => void;
  onAutre: () => void;
};

/** Onglet « Nouvel utilisateur » (US-020) : trois étapes, aperçu des accès, puis confirmation. */
export function NouvelUtilisateur(props: Props) {
  const { t, i18n } = useTranslation();
  const { brouillon, erreurs, groupes, utilisateurs, cree, occupe } = props;
  const prefixe = useId();

  if (cree) {
    const groupe = groupes.find((g) => g.id === cree.groupe);
    return (
      <div className={styles.fait}>
        <Mot niveau="ok" className={styles.faitMot}>
          {t('gestion.utilisateurs.cree.titre')}
        </Mot>
        <div className={styles.faitIdentite}>
          <Pastille nom={cree.nom} profil={cree.profil} className={styles.faitPastille} />
          <div>
            <h2 className={styles.faitNom}>{cree.nom}</h2>
            <div className={styles.faitSous}>
              {`${cree.email} · ${nomDuGroupe(groupe, i18n.language)} · ${t(`profils.${cree.profil}`)}`}
            </div>
          </div>
        </div>
        <div className={styles.faitTexte}>
          {t('gestion.utilisateurs.cree.texte', {
            nom: cree.nom,
            motDePasse: MOT_DE_PASSE_DEMO,
            canal: NOM_DU_CANAL[cree.canal],
            telephone: cree.telephone,
          })}
        </div>
        <div className={styles.faitActions}>
          <button type="button" className={styles.secondaire} onClick={props.onVoirLaListe}>
            {t('gestion.utilisateurs.cree.voirListe')}
          </button>
          <button type="button" className={styles.principal} onClick={props.onAutre}>
            {t('gestion.utilisateurs.cree.autre')}
          </button>
        </div>
      </div>
    );
  }

  const choisi = groupes.find((g) => g.id === brouillon.groupe);
  const nomCanal = NOM_DU_CANAL[brouillon.canal];
  const texteErreur = (champ: ChampUtilisateur) =>
    erreurs[champ] ? t(`gestion.utilisateurs.formulaire.erreurs.${erreurs[champ]}`) : '';
  const id = (champ: string) => `${prefixe}-${champ}`;

  const champ = (
    cle: 'nom' | 'email' | 'telephone',
    libelle: string,
    attributs: { type?: string; placeholder: string; inputMode?: 'tel' },
  ) => (
    <label className={styles.etiquette}>
      <span id={id(`${cle}-libelle`)}>{libelle}</span>
      {cle === 'telephone' ? (
        <span className={styles.telephone}>
          <span className={styles.indicatif}>+237</span>
          <input
            className={`${styles.champ} ${styles.champTelephone}`}
            value={brouillon.telephone}
            inputMode="tel"
            placeholder={attributs.placeholder}
            aria-labelledby={id(`${cle}-libelle`)}
            aria-invalid={erreurs[cle] ? true : undefined}
            aria-describedby={erreurs[cle] ? id(`${cle}-erreur`) : undefined}
            onChange={(e) => props.onChamp(cle, saisirTelephone(e.target.value))}
          />
        </span>
      ) : (
        <input
          className={styles.champ}
          type={attributs.type}
          value={brouillon[cle]}
          placeholder={attributs.placeholder}
          aria-labelledby={id(`${cle}-libelle`)}
          aria-invalid={erreurs[cle] ? true : undefined}
          aria-describedby={erreurs[cle] ? id(`${cle}-erreur`) : undefined}
          onChange={(e) => props.onChamp(cle, e.target.value)}
        />
      )}
      <span
        id={id(`${cle}-erreur`)}
        className={styles.erreur}
        role={erreurs[cle] ? 'alert' : undefined}
      >
        {texteErreur(cle)}
      </span>
    </label>
  );

  return (
    <div className={styles.rangeeFormulaire}>
      <form
        className={styles.formulaire}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          props.onCreer();
        }}
      >
        <h2 className={styles.etapeTitre}>{t('gestion.utilisateurs.formulaire.etape1')}</h2>
        <div className={styles.deuxColonnes}>
          {champ('nom', t('gestion.utilisateurs.formulaire.nom'), {
            placeholder: t('gestion.utilisateurs.formulaire.nomExemple'),
          })}
          {champ('email', t('gestion.utilisateurs.formulaire.email'), {
            type: 'email',
            placeholder: 'nom@gmail.com',
          })}
        </div>
        <div className={`${styles.aide} ${styles.aideRemontee}`}>
          {t('gestion.utilisateurs.formulaire.emailAide')}
        </div>
        {champ('telephone', t('gestion.utilisateurs.formulaire.telephone'), {
          placeholder: t('gestion.utilisateurs.formulaire.telephoneExemple'),
        })}

        <section className={styles.etape} aria-labelledby={id('etape2')}>
          <h2 id={id('etape2')} className={styles.etapeTitre}>
            {t('gestion.utilisateurs.formulaire.etape2')}
          </h2>
          <div className={styles.aideGroupe}>{t('gestion.utilisateurs.formulaire.groupeAide')}</div>
          <fieldset
            className={styles.cartesGroupes}
            aria-label={t('gestion.utilisateurs.formulaire.groupes')}
            aria-describedby={erreurs.groupe ? id('groupe-erreur') : undefined}
          >
            {groupes.map((g) => {
              const actif = brouillon.groupe === g.id;
              const n = membresDuGroupe(utilisateurs, g.id).length;
              return (
                <button
                  type="button"
                  key={g.id}
                  aria-pressed={actif}
                  className={`${styles.carteChoix} ${actif ? styles.carteChoixActive : ''}`}
                  onClick={() => props.onGroupe(g.id)}
                >
                  <span className={styles.carteChoixNom}>{nomDuGroupe(g, i18n.language)}</span>
                  <span className={styles.carteChoixProfil}>{t(`profils.${g.profil}`)}</span>
                  <span className={styles.carteChoixNombre}>
                    {t(
                      n > 1
                        ? 'gestion.utilisateurs.groupes.membres'
                        : 'gestion.utilisateurs.groupes.membre',
                      { nombre: n },
                    )}
                  </span>
                </button>
              );
            })}
          </fieldset>
          <span
            id={id('groupe-erreur')}
            className={styles.erreur}
            role={erreurs.groupe ? 'alert' : undefined}
          >
            {texteErreur('groupe')}
          </span>
        </section>

        <section
          className={`${styles.etape} ${styles.etapeSecurite}`}
          aria-labelledby={id('etape3')}
        >
          <h2 id={id('etape3')} className={styles.etapeTitre}>
            {t('gestion.utilisateurs.formulaire.etape3')}
          </h2>
          <fieldset className={styles.canal} aria-labelledby={id('canal')}>
            <span id={id('canal')} className={styles.canalLegende}>
              {t('gestion.utilisateurs.formulaire.canal')}
            </span>
            <div className={styles.canalPuces}>
              {CANAUX.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={brouillon.canal === c}
                  className={`${styles.puce} ${styles.puceCanal} ${
                    brouillon.canal === c ? styles.puceActive : ''
                  }`}
                  onClick={() => props.onCanal(c)}
                >
                  {NOM_DU_CANAL[c]}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            role="checkbox"
            aria-checked={brouillon.invitation}
            className={styles.invitation}
            onClick={props.onInvitation}
          >
            <span
              aria-hidden
              className={`${styles.case} ${brouillon.invitation ? styles.caseCochee : ''}`}
            >
              {brouillon.invitation ? '✓' : ''}
            </span>
            <span className={styles.invitationTexte}>
              {t('gestion.utilisateurs.formulaire.invitation', { canal: nomCanal })}
            </span>
          </button>
        </section>

        <div className={styles.actionsFormulaire}>
          <button type="button" className={styles.secondaire} onClick={props.onAnnuler}>
            {t('gestion.utilisateurs.formulaire.annuler')}
          </button>
          <button type="submit" className={styles.principal} disabled={occupe}>
            {t('gestion.utilisateurs.formulaire.creer')}
          </button>
        </div>
      </form>

      <aside className={styles.apercu} aria-label={t('gestion.utilisateurs.apercu.titre')}>
        <h2 className={styles.apercuTitre}>{t('gestion.utilisateurs.apercu.titre')}</h2>
        <div className={styles.apercuIdentite}>
          <Pastille
            nom={brouillon.nom.trim()}
            {...(choisi ? { profil: choisi.profil } : {})}
            className={styles.apercuPastille}
          />
          <div style={{ minWidth: 0 }}>
            <div className={styles.apercuNom}>
              {brouillon.nom.trim() || t('gestion.utilisateurs.apercu.nomParDefaut')}
            </div>
            <div className={styles.apercuEmail}>
              {brouillon.email.trim() || t('gestion.utilisateurs.apercu.emailParDefaut')}
            </div>
          </div>
        </div>
        <div className={styles.apercuLigne}>
          <span className={styles.apercuLibelle}>{t('gestion.utilisateurs.apercu.groupe')}</span>
          <span className={styles.apercuValeur}>{nomDuGroupe(choisi, i18n.language)}</span>
        </div>
        <div className={styles.apercuLigne}>
          <span className={styles.apercuLibelle}>{t('gestion.utilisateurs.apercu.profil')}</span>
          <span className={styles.apercuValeur}>
            {choisi ? t(`profils.${choisi.profil}`) : '—'}
          </span>
        </div>
        <h3 className={styles.apercuSection}>{t('gestion.utilisateurs.apercu.acces')}</h3>
        {choisi ? (
          <ul className={styles.acces}>
            {ecransAccessibles(choisi.profil).map((cle) => (
              <li key={cle} className={styles.acc}>
                {t(`menu.${cle}`)}
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.apercuTexte}>{t('gestion.utilisateurs.apercu.choisirGroupe')}</div>
        )}
        <h3 className={styles.apercuSection}>{t('gestion.utilisateurs.apercu.connexion')}</h3>
        <div className={styles.connexion}>
          {t('gestion.utilisateurs.apercu.google', { email: brouillon.email.trim() || '…' })}
        </div>
        <div className={styles.connexion}>
          {t('gestion.utilisateurs.apercu.emailMotDePasse', { motDePasse: MOT_DE_PASSE_DEMO })}
        </div>
        <div className={styles.connexion}>
          {t('gestion.utilisateurs.apercu.doubleAuthentification', {
            canal: nomCanal,
            telephone: apercuTelephone(brouillon.telephone),
          })}
        </div>
      </aside>
    </div>
  );
}
