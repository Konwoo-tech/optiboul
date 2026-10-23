import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast } from '@/ui';
import { useState } from 'react';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { codeErreur, useDepenses, useEnregistrerDepense } from './api.ts';
import { Budget } from './Budget.tsx';
import styles from './Depenses.module.css';
import { Formulaire } from './Formulaire.tsx';
import { Liste } from './Liste.tsx';
import {
  droitsDepenses,
  numeroDepense,
  type FiltreRattachement,
  type FiltreSemaine,
} from './regles.ts';
import type { NouvelleDepense } from './types.ts';

/**
 * Comptoir › Dépenses (US-110, US-112, US-113) : budget du mois par catégorie, saisie d'une dépense
 * avec justificatif et rattachement, liste filtrable. La caissière et le gérant saisissent ; le
 * propriétaire consulte (il valide les dépenses du gérant depuis l'écran des demandes).
 */
export default function EcranDepenses({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useDepenses(nom);
  const enregistrer = useEnregistrerDepense(nom);
  const [semaine, setSemaine] = useState<FiltreSemaine>('all');
  const [rattachement, setRattachement] = useState<FiltreRattachement>('all');
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  const instantane = requete.data;
  if (!instantane || !profil || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('comptoir.depenses.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const droits = droitsDepenses(profil);
  const cheminDemandes = `/${ecran.espace}/demandes`;

  const surEnregistrer = async (depense: NouvelleDepense): Promise<boolean> => {
    setErreurServeur(null);
    try {
      const reponse = await enregistrer.mutateAsync(depense);
      afficher(
        t(
          reponse.demande
            ? 'comptoir.depenses.toasts.enregistreeAvecDemande'
            : 'comptoir.depenses.toasts.enregistree',
          { numero: numeroDepense(reponse.depense.numero) },
        ),
      );
      return true;
    } catch (erreur) {
      setErreurServeur(codeErreur(erreur) ?? 'defaut');
      return false;
    }
  };

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <Budget lignes={instantane.budget} mois={instantane.mois} />
        <div className={styles.bas}>
          {droits.saisir && (
            <Formulaire
              instantane={instantane}
              profil={profil}
              nom={nom}
              enregistrement={enregistrer.isPending}
              erreurServeur={erreurServeur}
              onEnregistrer={surEnregistrer}
            />
          )}
          <Liste
            instantane={instantane}
            semaine={semaine}
            rattachement={rattachement}
            onSemaine={setSemaine}
            onRattachement={setRattachement}
            cheminDemandes={cheminDemandes}
          />
        </div>
      </div>
    </>
  );
}
