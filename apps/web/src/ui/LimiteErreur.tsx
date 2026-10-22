import { useTranslation } from '@/i18n';
import { Component, type ReactNode } from 'react';

import { EcranErreur } from './EcranErreur.tsx';

type Props = {
  children: ReactNode;
  /** Quand cette valeur change (ex. la page), la limite se réarme. */
  reinitialiser?: unknown;
};

type Etat = { erreur: Error | null; reinitialiser: unknown };

function ErreurAffichage() {
  const { t } = useTranslation();
  return (
    <EcranErreur
      titre={t('erreur.titre')}
      message={t('erreur.message')}
      libelleAction={t('erreur.recharger')}
      // Recharger récupère aussi les fichiers d'une nouvelle version après un déploiement.
      onAction={() => window.location.reload()}
    />
  );
}

/** Évite l'écran blanc : une erreur de rendu ou un fichier introuvable affiche un message. */
export class LimiteErreur extends Component<Props, Etat> {
  state: Etat = { erreur: null, reinitialiser: this.props.reinitialiser };

  static getDerivedStateFromError(erreur: Error): Partial<Etat> {
    return { erreur };
  }

  static getDerivedStateFromProps(props: Props, etat: Etat): Partial<Etat> | null {
    // Nouvelle page : on repart d'un état sans erreur.
    if (props.reinitialiser === etat.reinitialiser) return null;
    return { erreur: null, reinitialiser: props.reinitialiser };
  }

  render() {
    return this.state.erreur ? <ErreurAffichage /> : this.props.children;
  }
}
