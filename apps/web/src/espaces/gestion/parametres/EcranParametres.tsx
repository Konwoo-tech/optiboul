import { ErreurApi } from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { Text } from '@mantine/core';
import { Carte, EcranChargement, EcranErreur, useToast, codeOuTexte } from '@/ui';
import { useRef, useState } from 'react';

import { cheminEcran, ecransDe, type Ecran } from '../../../navigation.ts';
import { EnTeteEcran } from '../../EnTeteEcran.tsx';
import { libelleDe } from './affichage.ts';
import {
  codeErreur,
  phraseDuServeur,
  useModifierParametre,
  useParametres,
  useAjouterLaRecette,
  useCreerProduit,
  useModifierProduit,
  useProduits,
} from './api.ts';
import type { Enregistrer } from './Champs.tsx';
import { AutresParametres, HistoriqueDesValeurs } from './Complements.tsx';
import styles from './Parametres.module.css';
import { ModaleNouveauProduit, type NouveauProduit } from './ModaleNouveauProduit.tsx';
import { ModaleProduit, type SaisieProduit } from './ModaleProduit.tsx';
import { useFiches } from '../../atelier/production/api.ts';
import type { Recette } from '../../atelier/production/types.ts';
import { Produits } from './Produits.tsx';
import { ReglesNotification } from './ReglesNotification.tsx';
import {
  memeValeur,
  peutConsulterParametres,
  peutModifierParametres,
  repartirLesParametres,
  validerValeur,
} from './regles.ts';
import { Seuils } from './Seuils.tsx';

/**
 * Gestion › Paramètres (US-023, cahier des charges §3.3 et §9) : les seuils et règles, les produits
 * avec leurs fiches techniques, puis tous les autres paramètres métier et l'historique de leurs
 * valeurs. Le propriétaire modifie, l'administrateur consulte (les valeurs s'enregistrent en
 * quittant le champ) ; le gérant n'a pas cet écran. L'API vérifie chaque droit.
 */
export default function EcranParametres({ ecran }: { ecran: Ecran }) {
  const { t } = useTranslation();
  const afficher = useToast();
  const { utilisateur, chargement, injoignable, reessayer } = useUtilisateurCourant();
  const nom = utilisateur?.name;
  const profil = utilisateur?.profil;
  const parametres = useParametres(nom);
  const produits = useProduits(nom);
  const modifier = useModifierParametre(nom);
  const modifierProduit = useModifierProduit(nom);
  const creerProduit = useCreerProduit(nom);
  const ajouterRecette = useAjouterLaRecette(nom);
  const fiches = useFiches(nom);
  const [nouveauProduit, setNouveauProduit] = useState(false);
  // Le produit créé dont la recette a échoué : on ne le recrée pas en réessayant.
  const [produitSansRecette, setProduitSansRecette] = useState<number | null>(null);
  const [produitOuvert, setProduitOuvert] = useState<string | null>(null);
  // Garde synchrone : deux enregistrements du même paramètre ne partent pas ensemble.
  const enCours = useRef(new Set<string>());

  const liste = parametres.data;
  if (!liste || !profil || !nom) {
    const interdit =
      (!chargement && !injoignable && !utilisateur) ||
      (Boolean(profil) &&
        (!peutConsulterParametres(profil) || codeErreur(parametres.error) === 'droit_insuffisant'));
    let contenu;
    if (interdit) {
      contenu = (
        <Carte role="alert">
          <Text>{t('gestion.parametres.interdit')}</Text>
        </Carte>
      );
    } else if (parametres.isError || injoignable) {
      contenu = (
        <EcranErreur
          titre={t('erreur.titre')}
          message={t('gestion.parametres.erreurChargement')}
          libelleAction={t('erreur.reessayer')}
          onAction={() => (injoignable ? reessayer() : void parametres.refetch())}
        />
      );
    } else {
      contenu = <EcranChargement />;
    }
    return (
      <>
        <EnTeteEcran ecran={ecran} />
        {contenu}
      </>
    );
  }

  const lecture = !peutModifierParametres(profil);
  const { seuils, groupes } = repartirLesParametres(liste);
  // Seuls les profils qui ont la production ouvrent les fiches techniques.
  const production = ecransDe(profil, 'atelier').find((e) => e.cle === 'production');
  const cheminFiche = production
    ? (id: string) => `${cheminEcran(production)}?fiche=${id}&depuis=parametres`
    : undefined;

  const produitAModifier = produits.data?.find((p) => p.id === produitOuvert);
  const enregistrerProduit = async (saisie: SaisieProduit): Promise<string | null> => {
    if (!produitAModifier?.idServeur) return 'defaut';
    try {
      await modifierProduit.mutateAsync({ id: produitAModifier.idServeur, saisie });
      setProduitOuvert(null);
      afficher(t('gestion.parametres.produits.toast', { nom: saisie.nom }));
      return null;
    } catch (erreur) {
      return codeErreur(erreur) === 'droit_insuffisant'
        ? 'droit'
        : (codeOuTexte(erreur, () => false) ?? 'defaut');
    }
  };

  const creerLeProduit = async (
    produit: NouveauProduit,
    recette: Recette,
  ): Promise<string | null> => {
    let id = produitSansRecette;
    if (id === null) {
      try {
        id = await creerProduit.mutateAsync(produit);
        setProduitSansRecette(id);
      } catch (erreur) {
        const champs =
          erreur instanceof ErreurApi && erreur.status === 400
            ? Object.keys((erreur.details ?? {}) as object)
            : [];
        if (champs.includes('code')) return 'codeExiste';
        return codeOuTexte(erreur, () => false) ?? 'defaut';
      }
    }
    try {
      await ajouterRecette.mutateAsync({ id, recette });
    } catch (erreur) {
      return codeOuTexte(erreur, () => false) ?? 'recetteEchec';
    }
    setProduitSansRecette(null);
    setNouveauProduit(false);
    afficher(t('gestion.parametres.produits.nouveau.toast', { nom: produit.nom }));
    return null;
  };

  const enregistrer: Enregistrer = async (parametre, valeur) => {
    if (lecture) return 'droit';
    const verdict = validerValeur(parametre, valeur);
    if (!verdict.ok) return verdict.erreur;
    if (memeValeur(verdict.valeur, parametre.valeur)) return null;
    if (enCours.current.has(parametre.cle)) return null;
    enCours.current.add(parametre.cle);
    try {
      await modifier.mutateAsync({ cle: parametre.cle, valeur: verdict.valeur });
      afficher(t('gestion.parametres.enregistre', { libelle: libelleDe(t, parametre) }));
      return null;
    } catch (erreur) {
      if (codeErreur(erreur) === 'droit_insuffisant') return 'droit';
      const phrase = phraseDuServeur(erreur);
      return phrase ? { code: 'message', texte: phrase } : 'serveur';
    } finally {
      enCours.current.delete(parametre.cle);
    }
  };

  return (
    <>
      <EnTeteEcran ecran={ecran} />
      <div className={styles.page}>
        <Seuils parametres={seuils} lecture={lecture} enregistrer={enregistrer} />
        {produits.data ? (
          <Produits
            produits={produits.data}
            cheminFiche={cheminFiche}
            onModifier={lecture ? undefined : (p) => setProduitOuvert(p.id)}
            onNouveau={lecture ? undefined : () => setNouveauProduit(true)}
          />
        ) : produits.isError ? (
          <Carte role="alert">
            <Text>{t('gestion.parametres.produits.erreurChargement')}</Text>
          </Carte>
        ) : null}
        <div className={styles.complements} data-hors-maquette="">
          {lecture ? <p className={styles.note}>{t('gestion.parametres.lectureSeule')}</p> : null}
          <AutresParametres groupes={groupes} lecture={lecture} enregistrer={enregistrer} />
          <HistoriqueDesValeurs parametres={liste} utilisateur={nom} />
          <ReglesNotification lecture={lecture} />
        </div>
      </div>
      {nouveauProduit && (
        <ModaleNouveauProduit
          prix={
            fiches.data?.prix ?? {
              farine: 0,
              sel: 0,
              levure: 0,
              ameliorant: 0,
              glace: 0,
              bois: 0,
              huile: 0,
            }
          }
          envoiEnCours={creerProduit.isPending || ajouterRecette.isPending}
          produitCree={produitSansRecette !== null}
          onFermer={() => setNouveauProduit(false)}
          onConfirmer={creerLeProduit}
        />
      )}
      {produitAModifier && (
        <ModaleProduit
          produit={produitAModifier}
          envoiEnCours={modifierProduit.isPending}
          onFermer={() => setProduitOuvert(null)}
          onConfirmer={enregistrerProduit}
        />
      )}
    </>
  );
}
