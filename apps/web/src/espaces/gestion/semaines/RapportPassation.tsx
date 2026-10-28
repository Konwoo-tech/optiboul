import { useTranslation } from '@/i18n';
import { formaterNombre, formaterNombreSigne } from '@/utils';

import { nomMatiere } from '../../atelier/stocks/affichage.ts';
import { numeroDemande } from '../../comptoir/depenses/regles.ts';
import { dateCourte } from '../../comptoir/session/affichage.ts';
import { jourSemaine } from './affichage.ts';
import styles from './Semaines.module.css';
import type { Incident, Passation } from './types.ts';

type Props = { passation: Passation; onExporter: () => void };

type Rubrique = { titre: string; lignes: { libelle: string; valeur: string }[] };

/** Rapport de passation : ce que le gérant suivant reprend (cahier des charges §5.1, US-034). */
export function RapportPassation({ passation, onExporter }: Props) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { caisses, dettes, destinataire, numeroSuivante } = passation;

  const incident = (i: Incident): { libelle: string; valeur: string } => {
    switch (i.genre) {
      case 'ecart-matiere':
        return {
          libelle: t('gestion.semaines.passation.incident.ecartMatiere', { par: i.par }),
          valeur: i.motif,
        };
      case 'production':
        return {
          libelle: t('gestion.semaines.passation.incident.production', {
            jour: dateCourte(i.jour, langue),
            creneau: t(`gestion.semaines.passation.creneaux.${i.creneau}`),
          }),
          valeur: i.note,
        };
      case 'demande':
        return {
          libelle: t('gestion.semaines.passation.incident.demande', {
            code: numeroDemande(i.numero),
            titre: langue === 'en' && i.titreEn ? i.titreEn : i.titre,
          }),
          valeur: t('gestion.semaines.passation.incident.enAttente'),
        };
      case 'reouverture':
        return {
          libelle: t('gestion.semaines.passation.incident.reouverture', { par: i.par }),
          valeur: i.heure,
        };
    }
  };

  const rubriques: Rubrique[] = [
    {
      titre: t('gestion.semaines.passation.caisses'),
      lignes: [
        {
          libelle: t('gestion.semaines.passation.derniereCaisse'),
          valeur: caisses.derniere
            ? t('gestion.semaines.passation.derniereValeur', {
                jour: jourSemaine(caisses.derniere.jour, langue),
                par: caisses.derniere.par,
                montant: formaterNombre(caisses.derniere.compte),
              })
            : '—',
        },
        {
          libelle: t('gestion.semaines.passation.ecartCumule'),
          valeur: `${formaterNombreSigne(caisses.ecartCumule)} FCFA`,
        },
      ],
    },
    {
      titre: t('gestion.semaines.passation.dettes'),
      lignes: [
        {
          libelle: t('gestion.semaines.passation.clients'),
          valeur: `${formaterNombre(dettes.clients)} FCFA`,
        },
        {
          libelle: t('gestion.semaines.passation.fournisseurs'),
          valeur: `${formaterNombre(dettes.fournisseurs)} FCFA`,
        },
      ],
    },
    {
      titre: t('gestion.semaines.passation.stock'),
      lignes: passation.stockBas.length
        ? passation.stockBas.map((matiere) => ({
            libelle: nomMatiere(t, matiere),
            valeur: t('gestion.semaines.passation.stockBas'),
          }))
        : [{ libelle: t('gestion.semaines.passation.aucunStockBas'), valeur: '' }],
    },
    {
      titre: t('gestion.semaines.passation.incidents'),
      lignes: passation.incidents.length
        ? passation.incidents.map(incident)
        : [{ libelle: t('gestion.semaines.passation.aucunIncident'), valeur: '' }],
    },
  ];

  return (
    <section className={`${styles.carte} ${styles.cartePassation}`}>
      <div className={styles.entetePassation}>
        <div>
          <h2 className={styles.titreSection}>{t('gestion.semaines.passation.titre')}</h2>
          <div className={styles.passationSous}>
            {numeroSuivante
              ? t('gestion.semaines.passation.destinataire', {
                  nom: destinataire?.nom ?? '—',
                  numero: numeroSuivante,
                })
              : ''}
          </div>
        </div>
        <button type="button" className={styles.pdf} onClick={onExporter}>
          {t('gestion.semaines.passation.pdf')}
        </button>
      </div>
      {rubriques.map((rubrique) => (
        <div className={styles.rubrique} key={rubrique.titre}>
          <h3 className={styles.rubriqueTitre}>{rubrique.titre}</h3>
          {rubrique.lignes.map((ligne, rang) => (
            <div className={styles.rubriqueLigne} key={`${ligne.libelle}-${rang}`}>
              <span>{ligne.libelle}</span>
              <span className={styles.rubriqueValeur}>{ligne.valeur}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
