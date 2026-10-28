import { useTranslation } from '@/i18n';
import { formaterNombre } from '@/utils';
import { useNavigate } from 'react-router';

import type { Profil } from '../../../profils.ts';
import { numeroDemande } from '../../comptoir/depenses/regles.ts';
import { dateCourte } from '../../comptoir/session/affichage.ts';
import { lienVers } from './liens.ts';
import { Mot } from './Mot.tsx';
import styles from './Semaines.module.css';
import type { Controle, NiveauControle } from './types.ts';

type Ligne = {
  niveau: NiveauControle;
  libelle: string;
  detail: string;
  action?: { libelle: string; chemin: string | null };
};

type Props = { controles: readonly Controle[]; profil: Profil };

/** Contrôles avant clôture : deux bloquants (caisse, production), trois « à voir » (maquette : `weekChecks2`). */
export function Controles({ controles, profil }: Props) {
  const { t, i18n } = useTranslation();
  const naviguer = useNavigate();
  const langue = i18n.language;

  const ligne = (controle: Controle): Ligne => {
    switch (controle.cle) {
      case 'caisse': {
        if (!controle.session) {
          return { niveau: 'ok', libelle: t('gestion.semaines.controles.caisse.ok'), detail: '' };
        }
        const { type, jour, par, heure } = controle.session;
        return {
          niveau: 'bloquant',
          libelle: t('gestion.semaines.controles.caisse.bloquant', {
            session: t(`creneau.${type}`).toLowerCase(),
            jour: dateCourte(jour, langue),
          }),
          detail: t('gestion.semaines.controles.caisse.detail', { par, heure }),
          action: {
            libelle: t('gestion.semaines.controles.caisse.action'),
            chemin: lienVers(profil, 'session', { onglet: 'cloture' }),
          },
        };
      }
      case 'production':
        return controle.niveau === 'ok'
          ? { niveau: 'ok', libelle: t('gestion.semaines.controles.production.ok'), detail: '' }
          : {
              niveau: 'bloquant',
              libelle: t('gestion.semaines.controles.production.bloquant'),
              detail: t('gestion.semaines.controles.production.detail', {
                nom: controle.responsable,
              }),
              action: {
                libelle: t('gestion.semaines.controles.production.action'),
                chemin: lienVers(profil, 'production'),
              },
            };
      case 'dettes':
        return controle.clients === 0
          ? { niveau: 'ok', libelle: t('gestion.semaines.controles.dettes.ok'), detail: '' }
          : {
              niveau: 'surveiller',
              libelle: t('gestion.semaines.controles.dettes.surveiller', {
                count: controle.clients,
                montant: formaterNombre(controle.montant),
              }),
              detail: t('gestion.semaines.controles.dettes.detail'),
              action: {
                libelle: t('gestion.semaines.controles.dettes.action'),
                chemin: lienVers(profil, 'clients', { filtre: 'dette' }),
              },
            };
      case 'factures':
        return controle.factures.length === 0
          ? { niveau: 'ok', libelle: t('gestion.semaines.controles.factures.ok'), detail: '' }
          : {
              niveau: 'surveiller',
              libelle: t('gestion.semaines.controles.factures.surveiller', {
                count: controle.factures.length,
              }),
              detail: controle.factures.map((f) => `${f.numero} · ${f.libelle}`).join(' · '),
              action: {
                libelle: t('gestion.semaines.controles.factures.action'),
                chemin: lienVers(profil, 'fournisseurs', { onglet: 'dettes' }),
              },
            };
      case 'demandes':
        return controle.numeros.length === 0
          ? { niveau: 'ok', libelle: t('gestion.semaines.controles.demandes.ok'), detail: '' }
          : {
              niveau: 'surveiller',
              libelle: t('gestion.semaines.controles.demandes.surveiller', {
                count: controle.numeros.length,
              }),
              detail: controle.numeros.map(numeroDemande).join(' · '),
              action: {
                libelle: t('gestion.semaines.controles.demandes.action'),
                chemin: lienVers(profil, 'demandes'),
              },
            };
    }
  };

  return (
    <section className={`${styles.carte} ${styles.carteControles}`}>
      <h2 className={styles.titreControles}>{t('gestion.semaines.controles.titre')}</h2>
      {controles.map((controle) => {
        const l = ligne(controle);
        return (
          <div className={styles.controle} key={controle.cle}>
            <Mot niveau={l.niveau} className={styles.controleMot}>
              {t(`gestion.semaines.controles.mots.${l.niveau}`)}
            </Mot>
            <div className={styles.controleTexte}>
              <div className={styles.controleLibelle}>{l.libelle}</div>
              <div className={styles.controleDetail}>{l.detail}</div>
            </div>
            {l.action && (
              <button
                type="button"
                className={styles.action}
                disabled={!l.action.chemin}
                onClick={() => l.action?.chemin && naviguer(l.action.chemin)}
              >
                {l.action.libelle}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
