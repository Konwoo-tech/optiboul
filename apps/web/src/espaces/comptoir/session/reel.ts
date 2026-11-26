import {
  clientsList,
  commandesHabituelsSansCommandeList,
  commandesList,
  demandesList,
  livraisonsList,
  mouvementsInternesList,
  optiboulFetch,
  produitsList,
  toutesLesPages,
  type Client as ClientServeur,
  type Commande,
  type Demande,
  type Habituel,
  type Livraison as LivraisonServeur,
  type MouvementInterne,
  type Semaine,
} from '@/api';

import { heureDeYaounde, lireCaisses } from '../caisses/api.ts';
import { cleDeCode, CLES_PRODUIT, definirCatalogue, parProduit } from './catalogue.ts';
import type {
  Client,
  CleProduit,
  DemandePlafond,
  InstantaneSession,
  Livraison,
  ModePaiement,
  Mouvement,
  Quantites,
  Saisies,
  SessionCaisse,
  TypeMouvement,
} from './types.ts';

/*
 * Lecture de « Comptoir › Session en cours » sur le vrai serveur. L'écran attend un instantané
 * complet ; le serveur répond par ressource : on compose l'instantané à partir de la caisse
 * (`caisses/`), des clients, des commandes de la session, des livraisons et des mouvements de la
 * caisse. Les demandes d'autorisation de plafond arrivent avec les livraisons (#273).
 */

type Page<T> = { data: { results?: T[]; next?: string | null } };

/** Le produit de l'écran d'un code du serveur (`GC135` devient « GC », voir E17) ; absent du catalogue : rien. */
const produitDeCode = (code: string): CleProduit | undefined => {
  const cle = cleDeCode(code);
  return CLES_PRODUIT.includes(cle) ? cle : undefined;
};

const quantitesVides = (): Quantites => parProduit(0);
const saisiesVides = (): Saisies => parProduit('');

/** Pains par produit de l'écran, depuis « code serveur → quantité ». */
export function versQuantites(lignes: Readonly<Record<string, number>> | undefined): Quantites {
  const quantites = quantitesVides();
  for (const [code, quantite] of Object.entries(lignes ?? {})) {
    const cle = produitDeCode(code);
    if (cle) quantites[cle] = quantite;
  }
  return quantites;
}

/** Champs de saisie : les chiffres de la commande, vide quand le client n'a rien commandé. */
export function versSaisies(lignes: Readonly<Record<string, number>> | undefined): Saisies {
  const quantites = versQuantites(lignes);
  return Object.fromEntries(
    CLES_PRODUIT.map((cle) => [cle, quantites[cle] ? String(quantites[cle]) : '']),
  );
}

export function versClient(client: ClientServeur): Client {
  return {
    id: String(client.id),
    nom: client.nom,
    type: client.type ?? 'livreur',
    lieu: client.lieu ?? '',
    telephone: client.telephone ?? '',
    prix: versQuantites((client.prix ?? {}) as Record<string, number>),
    solde: client.solde,
  };
}

const MODES: readonly ModePaiement[] = ['especes', 'mtn', 'orange'];

export function versLivraison(livraison: LivraisonServeur): Livraison {
  const mode = livraison.paiements[0]?.mode as ModePaiement | undefined;
  const lignes = Object.fromEntries(livraison.lignes.map((l) => [l.code, l.quantite]));
  const prix = Object.fromEntries(livraison.lignes.map((l) => [l.code, l.prix_unitaire]));
  return {
    id: String(livraison.id),
    numero: livraison.numero,
    clientId: String(livraison.client.id),
    nom: livraison.client.nom,
    quantites: versQuantites(lignes),
    prix: versQuantites(prix),
    du: livraison.montant_du,
    recu: livraison.recu,
    mode: mode && MODES.includes(mode) ? mode : 'especes',
    reference: String(livraison.paiements.find((p) => p.reference)?.reference ?? ''),
    reste: livraison.reste,
    soldeAvant: livraison.solde_avant,
    soldeApres: livraison.solde_apres,
    heure: heureDeYaounde(livraison.cree_le),
    par: livraison.cree_par,
    autorisePar: livraison.autorisee_par,
  };
}

/** Une demande d'accord de plafond en attente ; `undefined` pour les autres types de demande. */
export function versDemandePlafond(demande: Demande): DemandePlafond | undefined {
  if (demande.type !== 'plafond') return undefined;
  const details = (demande.details ?? {}) as Record<string, unknown>;
  const emetteur = (demande.emetteur ?? {}) as { nom?: string };
  return {
    id: String(demande.id),
    numero: demande.numero,
    clientId: String(details.client ?? ''),
    clientNom: String(details.client_nom ?? ''),
    soldeApres: Number(details.solde_apres ?? 0),
    plafond: Number(details.plafond ?? 0),
    par: emetteur.nom ?? '',
    jour: new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Douala' }).format(
      new Date(demande.cree_le),
    ),
    heure: heureDeYaounde(demande.cree_le),
    statut: 'en-attente',
  };
}

const TYPE_DE_MOUVEMENT: Record<string, TypeMouvement> = {
  vente_guichet: 'vente-guichet',
  retours: 'retours',
  reste_en_salle: 'reste-en-salle',
  ration: 'ration',
};

/** Un mouvement du serveur ; `undefined` pour un produit que l'écran ne saisit pas (absent du catalogue). */
export function versMouvement(mouvement: MouvementInterne): Mouvement | undefined {
  const produit = produitDeCode(mouvement.produit);
  const type = TYPE_DE_MOUVEMENT[mouvement.genre];
  if (!produit || !type) return undefined;
  return {
    id: String(mouvement.id),
    type,
    produit,
    quantite: mouvement.quantite,
    motif: mouvement.motif,
    par: mouvement.cree_par,
    heure: heureDeYaounde(mouvement.cree_le),
  };
}

/** Commandes de la session par client, et commande habituelle / dernière relance des habitués sans commande. */
export function rangerCommandes(
  clients: readonly Client[],
  commandes: readonly Commande[],
  habituels: readonly Habituel[],
) {
  const saisies: Record<string, Saisies> = {};
  const idsCommandes: Record<string, string> = {};
  for (const client of clients) saisies[client.id] = saisiesVides();
  for (const commande of commandes) {
    saisies[String(commande.client.id)] = versSaisies(commande.lignes);
    idsCommandes[String(commande.client.id)] = String(commande.id);
  }
  const habituelles: Record<string, Quantites> = {};
  const relances: Record<string, string> = {};
  for (const habituel of habituels) {
    const id = String(habituel.client.id);
    habituelles[id] = versQuantites(habituel.commande);
    if (habituel.rappel) relances[id] = heureDeYaounde(habituel.rappel.cree_le);
  }
  return { commandes: saisies, idsCommandes, habituelles, relances };
}

/** La session telle que l'écran la lit : la dernière caisse, ouverte ou fermée. */
export function versSessionDeCaisse(
  caisse: Awaited<ReturnType<typeof lireCaisses>>['sessions'][number],
): SessionCaisse {
  return {
    caisseId: caisse.id,
    type: caisse.type,
    date: caisse.jour,
    statut: caisse.enCours ? 'ouverte' : 'cloturee',
    ouverteA: caisse.ouverture.heure,
    ouvertePar: caisse.ouverture.par,
    clotureeA: caisse.fermeture?.heure ?? '',
    cloturePar: caisse.fermeture?.par ?? '',
    // Espèces comptées à la fermeture ; vide tant que la caisse est ouverte.
    especesComptees: caisse.compte === null ? '' : String(caisse.compte),
    fonds: caisse.fonds,
    rouvertePar: '',
    rouverteA: '',
  };
}

function plafondCourant(clients: readonly ClientServeur[]): number {
  const nombres = new Map<number, number>();
  for (const client of clients) {
    const plafond = client.plafond_effectif;
    nombres.set(plafond, (nombres.get(plafond) ?? 0) + 1);
  }
  return [...nombres].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2000;
}

/** Compose l'instantané de la session à partir des routes du serveur. */
export async function lireSessionReelle(): Promise<InstantaneSession> {
  const caisses = await lireCaisses('');
  const derniere = caisses.sessions.at(-1);
  if (!derniere) throw new Error('Aucune caisse enregistrée');
  const idCaisse = Number(derniere.id);
  // Le catalogue d'abord : les clients, les commandes et les mouvements s'écrivent à ses produits.
  const produits = await toutesLesPages<{ code: string }>(
    (page) => produitsList({ page }) as Promise<Page<{ code: string }>>,
  ).catch(() => null);
  if (produits) definirCatalogue(produits);
  const [clients, commandes, habituels, livraisons, mouvements, semaines, enAttente] =
    await Promise.all([
      toutesLesPages<ClientServeur>(
        (page) => clientsList({ actif: true, page }) as Promise<Page<ClientServeur>>,
      ),
      commandesList({ jour: derniere.jour, creneau: derniere.type }),
      commandesHabituelsSansCommandeList({ jour: derniere.jour, creneau: derniere.type }).catch(
        () => null,
      ),
      toutesLesPages<LivraisonServeur>(
        (page) => livraisonsList({ caisse: idCaisse, page }) as Promise<Page<LivraisonServeur>>,
      ),
      toutesLesPages<MouvementInterne>(
        (page) =>
          mouvementsInternesList({ caisse: idCaisse, page }) as Promise<Page<MouvementInterne>>,
      ),
      optiboulFetch<{ data: { results?: Semaine[] } }>('/api/v1/semaines/?statut=ouverte').catch(
        () => null,
      ),
      // `demandes/en-attente/` ne renvoie pas à l'émetteur ses propres demandes : on lit la liste (E28).
      toutesLesPages<Demande>(
        (page) =>
          demandesList({ statut: 'en_attente', type: 'plafond', page }) as Promise<Page<Demande>>,
      ).catch(() => null),
    ]);
  const lus = clients.map(versClient);
  const rangees = rangerCommandes(
    lus,
    commandes.data as readonly Commande[],
    (habituels?.data ?? []) as readonly Habituel[],
  );
  const livrees = livraisons
    .filter((l) => l.statut === 'livree')
    .map(versLivraison)
    .sort((a, b) => b.numero - a.numero);
  return {
    session: versSessionDeCaisse(derniere),
    plafond: plafondCourant(clients),
    clients: lus,
    ...rangees,
    livraisons: livrees,
    mouvements: mouvements
      .map(versMouvement)
      .filter((m): m is Mouvement => m !== undefined)
      .sort((a, b) => Number(b.id) - Number(a.id)),
    // Après un accord, la livraison part d'elle-même : il n'y a plus d'autorisation à rejouer.
    autorisations: {},
    demandes: (enAttente ?? [])
      .map(versDemandePlafond)
      .filter((d): d is DemandePlafond => d !== undefined),
    depensesCaisse: caisses.detail?.depenses ?? 0,
    dernierBon: livrees[0]?.id ?? null,
    // Le serveur ne donne pas le numéro du prochain bon : le suivant du plus grand connu.
    numeroProchainBon: (livrees[0]?.numero ?? 0) + 1,
    // Les dettes se règlent avant la fin de la semaine ouverte.
    echeanceDettes: semaines?.data.results?.[0]?.au ?? '',
    // Les espèces attendues du serveur comptent aussi les paiements sans livraison et les remises.
    especesAttendues: derniere.enCours ? caisses.detail?.attendu : (derniere.attendu ?? undefined),
    prochaine: { jour: caisses.prochaine.jour, type: caisses.prochaine.type },
  };
}
