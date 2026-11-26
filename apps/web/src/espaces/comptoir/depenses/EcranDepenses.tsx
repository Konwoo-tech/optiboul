import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { EcranChargement, EcranErreur, useToast, codeOuTexte, messageOuDefaut } from '@/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import {
  useDepenses,
  useAnnulerDepense,
  useEnregistrerDepense,
  useFixerBudget,
  useFixerPreAutorisations,
} from './api.ts';
import { Budget } from './Budget.tsx';
import styles from './Depenses.module.css';
import { Formulaire } from './Formulaire.tsx';
import { FenetreReglages } from './FenetreReglages.tsx';
import { PreAutorisations } from './PreAutorisations.tsx';
import { FenetreAnnulation } from './FenetreAnnulation.tsx';
import { Liste } from './Liste.tsx';
import {
  droitsDepenses,
  numeroDepense,
  type FiltreRattachement,
  type FiltreSemaine,
} from './regles.ts';
import { ACHATS_COURANTS, CATEGORIES, type Depense, type NouvelleDepense } from './types.ts';

/**
 * Comptoir › Dépenses (US-110, US-112, US-113) : budget du mois par catégorie, saisie d'une dépense
 * avec justificatif et rattachement, liste filtrable. La caissière et le gérant saisissent ; le
 * propriétaire consulte (il valide les dépenses du gérant depuis l'écran des demandes).
 */
export default function EcranDepenses({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const [aAnnuler, setAAnnuler] = useState<Depense | null>(null);
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useDepenses(nom);
  const enregistrer = useEnregistrerDepense(nom);
  const annulerDepense = useAnnulerDepense(nom);
  const fixerBudget = useFixerBudget(nom);
  const fixerPlafonds = useFixerPreAutorisations(nom);
  const [reglage, setReglage] = useState<'budget' | 'plafonds' | null>(null);
  // La semaine peut venir de l'adresse : l'écran des semaines y renvoie (« Dépenses · 4 »).
  const [parametres] = useSearchParams();
  const [semaine, setSemaine] = useState<FiltreSemaine>(() =>
    /^S\d+$/.test(parametres.get('semaine') ?? '') ? parametres.get('semaine')! : 'all',
  );
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
      setErreurServeur(
        codeOuTexte(erreur, (c) => i18n.exists(`comptoir.depenses.erreurs.${c}`)) ?? 'defaut',
      );
      return false;
    }
  };

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        {instantane.budget.length > 0 && (
          <Budget
            lignes={instantane.budget}
            mois={instantane.mois}
            onFixer={
              profil === 'proprietaire'
                ? () => {
                    fixerBudget.reset();
                    setReglage('budget');
                  }
                : undefined
            }
          />
        )}
        {instantane.preAutorisations && (
          <PreAutorisations
            lignes={instantane.preAutorisations}
            onFixer={
              profil === 'gerant' || profil === 'proprietaire'
                ? () => {
                    fixerPlafonds.reset();
                    setReglage('plafonds');
                  }
                : undefined
            }
          />
        )}
        <div className={styles.bas}>
          {droits.saisir && (
            <Formulaire
              instantane={instantane}
              profil={profil}
              nom={nom}
              enregistrement={enregistrer.isPending}
              erreurServeur={erreurServeur}
              onEnregistrer={surEnregistrer}
              onModifier={() => setErreurServeur(null)}
            />
          )}
          <Liste
            instantane={instantane}
            semaine={semaine}
            rattachement={rattachement}
            onSemaine={setSemaine}
            onRattachement={setRattachement}
            cheminDemandes={cheminDemandes}
            peutAnnuler={(d) =>
              d.statut === 'en-attente' &&
              (d.par === nom || profil === 'gerant' || profil === 'proprietaire')
            }
            onAnnuler={setAAnnuler}
          />
        </div>
      </div>
      {aAnnuler && (
        <FenetreAnnulation
          depense={`DEP-${String(aAnnuler.numero).padStart(4, '0')} · ${aAnnuler.libelle}`}
          envoiEnCours={annulerDepense.isPending}
          onFermer={() => setAAnnuler(null)}
          onConfirmer={async (motif) => {
            try {
              await annulerDepense.mutateAsync({ id: aAnnuler.id, motif });
              setAAnnuler(null);
              afficher(t('comptoir.depenses.annulation.toast'));
              return null;
            } catch (erreur) {
              return messageOuDefaut(erreur, t('comptoir.depenses.annulation.erreurs.serveur'));
            }
          }}
        />
      )}
      {reglage === 'budget' && (
        <FenetreReglages
          titre={t('comptoir.depenses.budget.fixerTitre', { mois: instantane.mois })}
          explication={t('comptoir.depenses.budget.fixerExplication')}
          champs={CATEGORIES.map((categorie) => ({
            cle: categorie,
            libelle: t(`comptoir.depenses.categories.${categorie}`),
            valeur: instantane.budget.find((l) => l.categorie === categorie)?.budget ?? 0,
          }))}
          erreur={fixerBudget.isError ? t('comptoir.depenses.reglages.echec') : null}
          envoiEnCours={fixerBudget.isPending}
          onFermer={() => setReglage(null)}
          onEnregistrer={(montants) =>
            fixerBudget.mutate(
              { mois: instantane.mois, montants },
              {
                onSuccess: () => {
                  setReglage(null);
                  afficher(t('comptoir.depenses.budget.fixeToast'));
                },
              },
            )
          }
        />
      )}
      {reglage === 'plafonds' && (
        <FenetreReglages
          titre={t('comptoir.depenses.preAutorisations.fixerTitre')}
          explication={t('comptoir.depenses.preAutorisations.fixerExplication')}
          champs={ACHATS_COURANTS.map((achat) => ({
            cle: achat,
            libelle: t(`comptoir.depenses.matieres.${achat}.nom`),
            valeur: instantane.preAutorisations?.find((p) => p.achat === achat)?.plafond ?? 0,
          }))}
          erreur={fixerPlafonds.isError ? t('comptoir.depenses.reglages.echec') : null}
          envoiEnCours={fixerPlafonds.isPending}
          onFermer={() => setReglage(null)}
          onEnregistrer={(plafonds) =>
            fixerPlafonds.mutate(plafonds, {
              onSuccess: () => {
                setReglage(null);
                afficher(t('comptoir.depenses.preAutorisations.fixeToast'));
              },
            })
          }
        />
      )}
    </>
  );
}
