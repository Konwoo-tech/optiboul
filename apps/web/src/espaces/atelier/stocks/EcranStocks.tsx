import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { afficherRefus, EcranChargement, EcranErreur, useToast, codeOuTexte } from '@/ui';
import { useCallback, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';

import type { Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { codeErreur, useEnregistrerInventaire, useEnregistrerMouvement, useStocks } from './api.ts';
import { EtatDuStock } from './EtatDuStock.tsx';
import { Inventaires, type BrouillonInventaire } from './Inventaires.tsx';
import { Mouvements } from './Mouvements.tsx';
import { droitsStocks } from './regles.ts';
import { StockADate } from './StockADate.tsx';
import styles from './Stocks.module.css';
import type { NouveauMouvement, NouvelInventaire } from './types.ts';

const ONGLETS = ['etat', 'date', 'mouvements', 'inventaires'] as const;
type Onglet = (typeof ONGLETS)[number];
const ONGLET_PAR_DEFAUT: Onglet = 'etat';

/**
 * Atelier › Stocks (US-090 à US-094) : état du stock, stock à date, entrées et sorties,
 * inventaires. Le gérant et le chef de production saisissent ; le propriétaire consulte (il valide
 * les inventaires avec écart depuis l'écran des demandes).
 */
export default function EcranStocks({ ecran }: { ecran: Ecran }) {
  const { t, i18n } = useTranslation();
  const afficher = useToast();
  const { utilisateur } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const requete = useStocks(nom);
  const mouvement = useEnregistrerMouvement(nom);
  const inventaire = useEnregistrerInventaire(nom);
  // Le brouillon appartient à la personne qui compte : changer d'utilisateur le remet à zéro.
  const [saisie, setSaisie] = useState<{ nom?: string; brouillon: BrouillonInventaire }>({
    brouillon: null,
  });
  const brouillon = saisie.nom === nom ? saisie.brouillon : null;
  const setBrouillon = (suivant: BrouillonInventaire) => setSaisie({ nom, brouillon: suivant });

  const [parametres, setParametres] = useSearchParams();
  const parametre = parametres.get('onglet');
  const onglet: Onglet = ONGLETS.find((o) => o === parametre) ?? ONGLET_PAR_DEFAUT;
  const choisirOnglet = useCallback(
    (suivant: Onglet) =>
      setParametres(suivant === ONGLET_PAR_DEFAUT ? {} : { onglet: suivant }, { replace: true }),
    [setParametres],
  );

  const instantane = requete.data;
  if (!instantane || !profil || !nom) {
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {requete.isError ? (
          <EcranErreur
            titre={t('erreur.titre')}
            message={t('atelier.stocks.erreurChargement')}
            libelleAction={t('erreur.reessayer')}
            onAction={() => void requete.refetch()}
          />
        ) : (
          <EcranChargement />
        )}
      </>
    );
  }

  const droits = droitsStocks(profil);

  const naviguerEntreOnglets = (evenement: KeyboardEvent<HTMLButtonElement>) => {
    const decalage = evenement.key === 'ArrowRight' ? 1 : evenement.key === 'ArrowLeft' ? -1 : 0;
    const rang = ONGLETS.indexOf(onglet);
    const suivant =
      evenement.key === 'Home'
        ? ONGLETS[0]
        : evenement.key === 'End'
          ? ONGLETS[ONGLETS.length - 1]
          : decalage
            ? ONGLETS[(rang + decalage + ONGLETS.length) % ONGLETS.length]
            : undefined;
    if (!suivant) return;
    evenement.preventDefault();
    choisirOnglet(suivant);
    requestAnimationFrame(() => document.getElementById(`onglet-stocks-${suivant}`)?.focus());
  };

  /** Renvoie le code d'erreur du serveur, ou `null` quand le mouvement est enregistré. */
  const enregistrerMouvement = async (saisie: NouveauMouvement): Promise<string | null> => {
    try {
      await mouvement.mutateAsync(saisie);
      afficher(t('atelier.stocks.mouvements.manuel.toast'));
      return null;
    } catch (erreur) {
      return (
        codeOuTexte(erreur, (c) => i18n.exists(`atelier.stocks.mouvements.erreurs.${c}`)) ??
        'defaut'
      );
    }
  };

  const enregistrerInventaire = async (saisie: NouvelInventaire) => {
    try {
      const reponse = await inventaire.mutateAsync(saisie);
      setBrouillon(null);
      afficher(
        t(
          reponse.demande
            ? 'atelier.stocks.inventaires.toasts.envoye'
            : 'atelier.stocks.inventaires.toasts.valide',
        ),
      );
    } catch (erreur) {
      afficherRefus(
        afficher,
        t,
        erreur,
        codeErreur(erreur) === 'inventaire_en_attente'
          ? 'atelier.stocks.inventaires.toasts.enAttente'
          : 'atelier.stocks.inventaires.toasts.erreur',
      );
    }
  };

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <div className={styles.onglets} role="tablist" aria-label={t('atelier.stocks.sections')}>
          {ONGLETS.map((cle) => (
            <button
              type="button"
              key={cle}
              id={`onglet-stocks-${cle}`}
              role="tab"
              aria-selected={onglet === cle}
              aria-controls="panneau-stocks"
              tabIndex={onglet === cle ? 0 : -1}
              className={`${styles.onglet} ${onglet === cle ? styles.ongletActif : ''}`}
              onClick={() => choisirOnglet(cle)}
              onKeyDown={naviguerEntreOnglets}
            >
              {t(`atelier.stocks.onglets.${cle}`)}
            </button>
          ))}
        </div>

        <div
          className={styles.panneau}
          id="panneau-stocks"
          role="tabpanel"
          aria-labelledby={`onglet-stocks-${onglet}`}
        >
          {onglet === 'etat' && <EtatDuStock instantane={instantane} />}
          {onglet === 'date' && <StockADate instantane={instantane} />}
          {onglet === 'mouvements' && (
            <Mouvements
              instantane={instantane}
              peutSaisir={droits.modifier}
              onEnregistrer={enregistrerMouvement}
            />
          )}
          {onglet === 'inventaires' && (
            <Inventaires
              instantane={instantane}
              peutSaisir={droits.modifier}
              nom={nom}
              brouillon={brouillon}
              enregistrement={inventaire.isPending}
              onBrouillon={setBrouillon}
              onSoumettre={(saisie) => void enregistrerInventaire(saisie)}
              onIncomplet={() => afficher(t('atelier.stocks.inventaires.incomplet'))}
            />
          )}
        </div>
      </div>
    </>
  );
}
