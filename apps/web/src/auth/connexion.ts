import {
  connexionAnnulerCreate,
  connexionCodeCreate,
  connexionEmailCreate,
  connexionOtpEnvoyerCreate,
  connexionOtpVerifierCreate,
  connexionUtilisateursList,
  ErreurApi,
  useConnexionUtilisateursList,
  type CodeEnvoye,
} from '@/api';

import { PROFILS, type Profil } from '../profils.ts';

export type Canal = 'sms' | 'whatsapp';
export type Via = 'code' | 'e-mail' | 'Google';

/** Une personne proposée sur le poste de confiance du comptoir (O1) : son nom, son profil. */
export type PersonneDuPoste = { id: string; nom: string; profil: Profil };

/** La personne identifiée, quand la double authentification est demandée. */
export type PersonneConnexion = PersonneDuPoste & { email: string };

export type Identification =
  | { methode: 'code'; utilisateur: string; code: string }
  | { methode: 'email'; email: string; motDePasse: string }
  | { methode: 'google'; email: string };

export type ReponseIdentification =
  | { deuxFacteurs: false }
  | {
      deuxFacteurs: true;
      utilisateur: PersonneConnexion;
      telephoneMasque: string;
      via: Via;
    };

/** Ce que la connexion demande au serveur, réel ou simulé. */
export type ServiceConnexion = {
  /** Première étape : qui êtes-vous ? Ouvre la session, ou attend la double authentification. */
  identifier: (identification: Identification) => Promise<ReponseIdentification>;
  annuler: () => Promise<void>;
  /** Envoie le code à 6 chiffres. Renvoie l'heure d'envoi, « HH:MM ». */
  envoyerCode: (canal: Canal) => Promise<string>;
  /** Deuxième étape. Une erreur `code_incorrect` porte `essaisRestants` dans `details`. */
  verifierCode: (code: string) => Promise<void>;
};

type ReponseDeuxFacteurs = {
  deuxFacteurs: boolean;
  utilisateur?: { id: number; nom: string; profil: Profil; email: string };
  telephoneMasque?: string;
  via?: Via;
};

/**
 * Première étape sur le vrai serveur : `POST /connexion/code/` (nom + code à 4 chiffres, poste de
 * confiance) ou `POST /connexion/email/`. La connexion par Google passe par le jeton de Google
 * Identity Services, pas par une adresse : elle n'est pas branchée ici.
 */
export async function identifierSurLeServeur(
  identification: Extract<Identification, { methode: 'code' | 'email' }>,
): Promise<ReponseIdentification> {
  const reponse =
    identification.methode === 'code'
      ? await connexionCodeCreate({
          utilisateur: Number(identification.utilisateur),
          code: identification.code,
        })
      : await connexionEmailCreate({
          email: identification.email,
          motDePasse: identification.motDePasse,
        });
  const donnees = reponse.data as unknown as ReponseDeuxFacteurs;
  if (!donnees.deuxFacteurs) return { deuxFacteurs: false };
  const { utilisateur } = donnees;
  if (!utilisateur || !donnees.via || donnees.telephoneMasque === undefined) {
    throw new ErreurApi(reponse.status, {
      detail: 'Réponse inattendue du serveur.',
      code: 'reponse_invalide',
    });
  }
  return {
    deuxFacteurs: true,
    utilisateur: { ...utilisateur, id: String(utilisateur.id) },
    telephoneMasque: donnees.telephoneMasque,
    via: donnees.via,
  };
}

/**
 * Un visiteur sans session n'a pas encore de cookie CSRF, et le serveur l'exige pour toute écriture
 * anonyme. Il ne le pose que sur la liste des personnes du poste, même quand il la refuse (403) :
 * on l'appelle donc avant d'écrire depuis une page qui ne la charge pas (lien reçu par e-mail).
 */
export function amorcerLeJetonCsrf(): Promise<unknown> {
  return connexionUtilisateursList().catch(() => undefined);
}

export async function annulerIdentificationSurLeServeur(): Promise<void> {
  await connexionAnnulerCreate();
}

export async function envoyerCodeSurLeServeur(canal: Canal): Promise<string> {
  const reponse = await connexionOtpEnvoyerCreate({ canal });
  return (reponse.data as CodeEnvoye).heure;
}

export async function verifierCodeSurLeServeur(code: string): Promise<void> {
  await connexionOtpVerifierCreate({ code });
}

/** Les trois appels de la double authentification et de l'identification sur le vrai serveur. */
export const serviceConnexionReel: ServiceConnexion = {
  identifier: (identification) => {
    if (identification.methode === 'google') {
      throw new ErreurApi(400, {
        detail: 'La connexion par Google demande un jeton Google Identity Services.',
        code: 'google_non_configure',
      });
    }
    return identifierSurLeServeur(identification);
  },
  annuler: annulerIdentificationSurLeServeur,
  envoyerCode: envoyerCodeSurLeServeur,
  verifierCode: verifierCodeSurLeServeur,
};

/**
 * Les personnes à toucher sur le poste de confiance du comptoir. Le serveur refuse (403
 * `poste_non_reconnu`) hors d'un poste de confiance : on propose alors l'adresse e-mail.
 */
export function usePersonnesDuPoste() {
  const requete = useConnexionUtilisateursList({
    query: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const personnes: PersonneDuPoste[] | undefined = Array.isArray(requete.data?.data)
    ? requete.data.data.flatMap((personne) =>
        personne.profil && Object.hasOwn(PROFILS, personne.profil)
          ? [{ id: String(personne.id), nom: personne.nom, profil: personne.profil as Profil }]
          : [],
      )
    : undefined;
  return {
    personnes,
    chargement: requete.isPending,
    posteNonReconnu:
      requete.error instanceof ErreurApi && requete.error.code === 'poste_non_reconnu',
  };
}
