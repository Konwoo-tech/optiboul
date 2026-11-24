import {
  notificationsList,
  notificationsMarquerLueCreate,
  notificationsNonLuesRetrieve,
  notificationsToutMarquerLuCreate,
  type Notification,
} from '@/api';
import { useUtilisateurCourant } from '@/auth';
import { useTranslation } from '@/i18n';
import { SIMULATION, marquerNotificationsLues, useNotificationsSimulees } from '@/simulation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { cheminEcran, ecransDe } from '../navigation.ts';
import type { Espace, Profil } from '../profils.ts';

const FUSEAU = 'Africa/Douala';
/** Compteur de l'en-tête : rafraîchi toutes les 15 s au plus (ADR-21). */
const ACTUALISATION_MS = 15_000;

/** Une notification, telle que le tiroir l'affiche. */
export type NotificationAffichee = {
  id: string;
  lue: boolean;
  /** Calculée à l'instant (« En direct ») plutôt que programmée. */
  enDirect: boolean;
  type: string;
  heure: string;
  titre: string;
  detail: string;
  /** Chemin de l'écran que « Ouvrir › » atteint ; absent si le profil ne peut pas l'ouvrir. */
  chemin: string | null;
};

/** Paramètres de lien que l'API peut joindre au chemin d'un écran (#298) : rien d'autre n'est repris. */
const PARAMETRES_DE_LIEN = ['onglet', 'passation'];

/**
 * Le lien d'une notification (« /atelier/stocks?onglet=inventaires ») devient le chemin d'un écran
 * que ce profil peut ouvrir ; sinon `null` (la notification s'affiche sans bouton « Ouvrir »).
 * L'API émet `/{espace}/{écran}` avec, au besoin, `?onglet=` ou `?passation=`.
 */
export function cheminDuLien(lien: string, profil: Profil | null | undefined): string | null {
  const [chemin = '', recherche = ''] = lien.split('?');
  const [espace, cle] = chemin.replace(/^\/+|\/+$/g, '').split('/');
  if (!espace || !cle) return null;
  const ecran = ecransDe(profil, espace as Espace).find((candidat) => candidat.cle === cle);
  if (!ecran) return null;
  const parametres = new URLSearchParams();
  for (const [nom, valeur] of new URLSearchParams(recherche)) {
    if (PARAMETRES_DE_LIEN.includes(nom)) parametres.set(nom, valeur);
  }
  const suite = parametres.toString();
  return suite ? `${cheminEcran(ecran)}?${suite}` : cheminEcran(ecran);
}

/** « 18:02 » aujourd'hui, « 12 nov. 18:02 » un autre jour (heure de Yaoundé). */
export function heureDeNotification(instant: string, langue: string, maintenant = new Date()) {
  const date = new Date(instant);
  const jour = (d: Date) => new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU }).format(d); // AAAA-MM-JJ
  const heure = new Intl.DateTimeFormat(langue === 'en' ? 'en-GB' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSEAU,
  }).format(date);
  if (jour(date) === jour(maintenant)) return heure;
  const dateCourte = new Intl.DateTimeFormat(langue === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: FUSEAU,
  }).format(date);
  return `${dateCourte} ${heure}`;
}

/** Texte du type d'une notification : le libellé du serveur (#297), sinon le genre rendu lisible. */
export function typeDuGenre(genre: string, libelle?: string): string {
  if (libelle) return libelle;
  const texte = genre.replace(/[._]/g, ' ').trim();
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

type PageDeNotifications = { data: { results?: Notification[] } };

/**
 * Notifications de la personne connectée, pour le tiroir. Sur le vrai serveur : `GET
 * /notifications/` ; en simulation : le faux serveur. Lire ou marquer comme lue renvoie le
 * compteur de l'en-tête à jour.
 */
export function useNotifications(actif: boolean) {
  const client = useQueryClient();
  const { utilisateur } = useUtilisateurCourant();
  const { i18n } = useTranslation();
  const langue = i18n.language === 'en' ? 'en' : 'fr';
  const profil = utilisateur?.profil as Profil | undefined;

  const simulees = useNotificationsSimulees(utilisateur?.name);
  const reelles = useQuery({
    queryKey: ['coque', 'notifications', utilisateur?.url],
    queryFn: () => notificationsList() as Promise<PageDeNotifications>,
    enabled: !SIMULATION && actif && Boolean(utilisateur),
    refetchInterval: ACTUALISATION_MS,
  });

  const notifications: NotificationAffichee[] = SIMULATION
    ? (simulees.data ?? []).map((notification) => ({
        id: notification.id,
        lue: notification.lue,
        enDirect: notification.enDirect,
        type: notification[langue].type,
        heure: notification[langue].heure,
        titre: notification[langue].titre,
        detail: notification[langue].detail,
        chemin: notification.destination ? cheminEcran(notification.destination) : null,
      }))
    : (reelles.data?.data.results ?? []).map((notification) => ({
        id: String(notification.id),
        lue: notification.lue,
        enDirect: false,
        type: typeDuGenre(notification.genre, notification.genre_libelle),
        heure: heureDeNotification(notification.cree_le, langue),
        titre: notification.titre,
        detail: notification.message,
        chemin: notification.lien ? cheminDuLien(notification.lien, profil) : null,
      }));

  const actualiser = async () => {
    await client.invalidateQueries({ queryKey: ['simulation', 'notifications'] });
    await client.invalidateQueries({ queryKey: ['coque', 'notifications'] });
  };
  const marquerLues = async (ids: string[]) => {
    if (SIMULATION) await marquerNotificationsLues(ids);
    else await Promise.all(ids.map((id) => notificationsMarquerLueCreate(Number(id))));
    await actualiser();
  };
  const toutMarquerLu = async () => {
    if (SIMULATION) await marquerNotificationsLues(notifications.map((n) => n.id));
    else await notificationsToutMarquerLuCreate();
    await actualiser();
  };
  return { notifications, marquerLues, toutMarquerLu };
}

/** Nombre de notifications non lues, pour la pastille de l'en-tête. */
export function useNombreNonLues(): number {
  const { utilisateur } = useUtilisateurCourant();
  const simulees = useNotificationsSimulees(utilisateur?.name);
  const reel = useQuery({
    queryKey: ['coque', 'notifications', 'non-lues', utilisateur?.url],
    queryFn: async () => {
      const reponse = await notificationsNonLuesRetrieve();
      return (reponse.data as { non_lues?: number }).non_lues ?? 0;
    },
    enabled: !SIMULATION && Boolean(utilisateur),
    refetchInterval: ACTUALISATION_MS,
  });
  if (SIMULATION) return (simulees.data ?? []).filter((notification) => !notification.lue).length;
  return reel.data ?? 0;
}
