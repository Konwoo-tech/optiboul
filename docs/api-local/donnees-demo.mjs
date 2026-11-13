// Données de démonstration sur le vrai backend, créées par l'API elle-même (comme le fera le front).
// Rejouable : ce qui existe déjà est conservé. Local uniquement : ne jamais le lancer sur un serveur réel.
//
//   $env:OPTIBOUL_POSTE_COOKIE = "<cookie du poste de confiance affiché par seed_dev.py>"
//   node .\docs\api-local\donnees-demo.mjs
//
// Variables : OPTIBOUL_API_URL (défaut http://127.0.0.1:8001), OPTIBOUL_POSTE_COOKIE (obligatoire).
// Prérequis : l'API tourne (demarrer-api.ps1) et les comptes existent (seed_dev.py).
// Le deuxième facteur n'étant pas envoyé en local, le script lit le code dans la base.
//
// Vague 2 : la semaine en cours ouverte (gérant Willy, production Serge), puis la caisse du
// créneau en cours ouverte par la caissière avec le fonds proposé.
// Vague 3 (Clients et dettes) : onze clients avec leurs tarifs, créés par le propriétaire, puis des
// livraisons à crédit faites par la caissière sur la caisse ouverte : ce sont elles qui posent les
// dettes (le solde d'un client est la somme de ses mouvements, il ne s'écrit pas).
// Vague 4 (Caisses) : la caisse du créneau est fermée avec un manque de 600 FCFA, la suivante ouverte,
// pour que le tableau montre une ligne fermée et une ligne ouverte.
// Vague 5 (Session › Commandes) : trois commandes saisies par la caissière pour la session ouverte.
// Les vagues suivantes ajoutent leurs données ici (stocks, fournisseurs, …), une étape à la fois.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const API = process.env.OPTIBOUL_API_URL ?? "http://127.0.0.1:8001";
const POSTE = process.env.OPTIBOUL_POSTE_COOKIE;
if (!POSTE) {
  console.error(
    "Définir OPTIBOUL_POSTE_COOKIE (voir docs/api-local/seed_dev.py).",
  );
  process.exit(1);
}
const DOSSIER_API = fileURLToPath(new URL("../../apps/api/", import.meta.url));

/** Dernier code de double authentification, lu dans la base locale (pas de SMS sans Celery). */
function dernierCode() {
  const sortie = execFileSync(
    DOSSIER_API + ".venv/Scripts/python.exe",
    [
      "manage.py",
      "shell",
      "-c",
      "from optiboul.notifications.infrastructure.models import MessageSortant as M; print(M.objects.order_by('-pk').first().contenu)",
    ],
    {
      cwd: DOSSIER_API,
      env: {
        ...process.env,
        VIRTUAL_ENV: "",
        DJANGO_SETTINGS_MODULE: "config.settings.local",
        USE_DOCKER: "no",
        DATABASE_URL:
          "postgres://optiboul:optiboul_dev@localhost:5432/optiboul_dev",
        REDIS_URL: "redis://localhost:6379/5",
        DJANGO_EMAIL_BACKEND: "django.core.mail.backends.console.EmailBackend",
      },
      encoding: "utf8",
    },
  );
  return sortie.match(/\b(\d{6})\b/)?.[1];
}

/** Un navigateur minimal : cookies, jeton CSRF relu à chaque requête (il change à la connexion). */
class Client {
  cookies = new Map([["optiboul_poste", POSTE]]);

  /** `cle` : en-tête `Idempotency-Key`, exigé par les opérations d'argent (livraisons, …). */
  async appeler(methode, chemin, corps, cle) {
    const entetes = {
      Accept: "application/json",
      Origin: API,
      Cookie: [...this.cookies]
        .map(([nom, valeur]) => `${nom}=${valeur}`)
        .join("; "),
    };
    if (methode !== "GET") {
      entetes["Content-Type"] = "application/json";
      const csrf = this.cookies.get("csrftoken");
      if (csrf) entetes["X-CSRFToken"] = csrf;
      if (cle) entetes["Idempotency-Key"] = cle;
    }
    const reponse = await fetch(API + chemin, {
      method: methode,
      headers: entetes,
      body: corps ? JSON.stringify(corps) : undefined,
    });
    for (const ligne of reponse.headers.getSetCookie()) {
      const [paire] = ligne.split(";");
      const i = paire.indexOf("=");
      const nom = paire.slice(0, i);
      const valeur = paire.slice(i + 1);
      if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(ligne) || valeur === "")
        this.cookies.delete(nom);
      else this.cookies.set(nom, valeur);
    }
    const texte = await reponse.text();
    let donnees;
    try {
      donnees = texte ? JSON.parse(texte) : undefined;
    } catch {
      donnees = texte;
    }
    return { statut: reponse.status, donnees };
  }
}

async function connecter(client, id, code) {
  await client.appeler("GET", "/api/v1/connexion/utilisateurs/");
  const reponse = await client.appeler("POST", "/api/v1/connexion/code/", {
    utilisateur: id,
    code,
  });
  if (reponse.statut !== 200)
    throw new Error("code refusé : " + JSON.stringify(reponse));
  if (reponse.donnees.deuxFacteurs) {
    await client.appeler("POST", "/api/v1/connexion/otp/envoyer/", {
      canal: "sms",
    });
    const verification = await client.appeler(
      "POST",
      "/api/v1/connexion/otp/verifier/",
      {
        code: dernierCode(),
      },
    );
    if (verification.statut !== 204)
      throw new Error("code SMS refusé : " + JSON.stringify(verification));
  }
  const moi = await client.appeler("GET", "/api/v1/users/me/");
  console.log(`  connecté : ${moi.donnees.name} (${moi.donnees.profil})`);
}

/** Numéro ISO de la semaine contenant aujourd'hui. */
function semaineIso(date = new Date()) {
  const jour = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const numeroJour = jour.getUTCDay() || 7;
  jour.setUTCDate(jour.getUTCDate() + 4 - numeroJour);
  const debutAnnee = new Date(Date.UTC(jour.getUTCFullYear(), 0, 1));
  return {
    annee: jour.getUTCFullYear(),
    numero: Math.ceil(((jour - debutAnnee) / 86_400_000 + 1) / 7),
  };
}

const { annee, numero } = semaineIso();
const comptes = (
  await new Client().appeler("GET", "/api/v1/connexion/utilisateurs/")
).donnees;
const idDe = (profil) => comptes.find((c) => c.profil === profil)?.id;

console.log(`Propriétaire — semaine ${numero} de ${annee}`);
const proprietaire = new Client();
await connecter(proprietaire, idDe("proprietaire"), "2222");
const liste = await proprietaire.appeler("GET", "/api/v1/semaines/");
let semaine = liste.donnees.results.find(
  (s) => s.annee === annee && s.numero === numero,
);
if (!semaine) {
  const creee = await proprietaire.appeler("POST", "/api/v1/semaines/", {
    annee,
    numero,
    gerant: idDe("gerant"),
    production: idDe("production"),
  });
  if (creee.statut !== 201)
    throw new Error("semaine non créée : " + JSON.stringify(creee));
  semaine = creee.donnees.semaine; // la création renvoie une enveloppe {semaine: …}
  console.log("  semaine créée");
}
if (semaine.statut !== "ouverte") {
  const ouverte = await proprietaire.appeler(
    "POST",
    `/api/v1/semaines/${semaine.id}/ouvrir/`,
  );
  if (ouverte.statut !== 200)
    throw new Error("semaine non ouverte : " + JSON.stringify(ouverte));
  console.log("  semaine ouverte");
}

console.log("Caissière — caisse du créneau en cours");
const caissiere = new Client();
await connecter(caissiere, idDe("caissier"), "4444");
const prochaine = (await caissiere.appeler("GET", "/api/v1/caisses/prochaine/"))
  .donnees;
if (prochaine.caisse_en_cours) {
  console.log("  caisse déjà ouverte");
} else {
  const ouverture = await caissiere.appeler("POST", "/api/v1/caisses/ouvrir/", {
    fonds: prochaine.fonds_propose ?? 20000,
  });
  if (ouverture.statut !== 201)
    throw new Error("caisse non ouverte : " + JSON.stringify(ouverture));
  console.log(
    `  caisse ouverte (${prochaine.creneau}, fonds ${prochaine.fonds_propose})`,
  );
}

// ---------------------------------------------------------------------------------------------
// Vague 3 — Clients et dettes
// ---------------------------------------------------------------------------------------------
// Codes de produits de l'API : BAG, KO, GC135, GC170, PL, C2, PSL. Le tarif A est le prix de base
// (rien à poser) ; le tarif B est posé par `PUT /clients/{id}/tarifs/`.
const TARIF_A = { BAG: 100, KO: 70, GC135: 160 };
const TARIF_B = { BAG: 110, KO: 75, GC135: 165 };

// Dette voulue = ce que le client doit après la livraison à crédit ; `livraison` = pains livrés,
// `paye` = espèces reçues sur le moment (0 : tout à crédit). Aucun montant n'est écrit en base :
// l'API calcule le dû avec le tarif du client.
const CLIENTS = [
  {
    nom: "Alain",
    type: "livreur",
    lieu: "Marché Etoudi",
    telephone: "677211045",
    tarifs: TARIF_B,
    livraison: { BAG: 10, KO: 2 },
    paye: 0,
  }, // doit 1 250
  {
    nom: "Alex",
    type: "livreur",
    lieu: "Carrefour Emana",
    telephone: "699083341",
    tarifs: TARIF_A,
  },
  {
    nom: "Ebène",
    type: "livreur",
    lieu: "Lycée d’Etoudi",
    telephone: "655721908",
    tarifs: TARIF_A,
    livraison: { BAG: 20 },
    paye: 0,
  }, // doit 2 000 (le plafond)
  {
    nom: "White",
    type: "livreur",
    lieu: "Olembé",
    telephone: "678401266",
    tarifs: TARIF_B,
    livraison: { BAG: 10 },
    paye: 600,
  }, // doit 500
  {
    nom: "Mama Ngono",
    type: "livreur",
    lieu: "Marché Etoudi",
    telephone: "694157022",
    tarifs: TARIF_A,
  },
  {
    nom: "Junior",
    type: "livreur",
    lieu: "Messassi",
    telephone: "670660193",
    tarifs: TARIF_A,
    livraison: { BAG: 12, KO: 10 },
    paye: 0,
  }, // doit 1 900
  {
    nom: "Brice",
    type: "livreur",
    lieu: "Nkolondom",
    telephone: "677338821",
    tarifs: TARIF_B,
  },
  {
    nom: "Restaurant Le Palmier",
    type: "restaurant",
    lieu: "Bastos",
    telephone: "699120455",
    tarifs: TARIF_B,
    livraison: { BAG: 8, GC135: 2 },
    paye: 1000,
  }, // doit 210
  {
    nom: "Hôtel Mont Fébé",
    type: "hotel",
    lieu: "Mont Fébé",
    telephone: "677001145",
    tarifs: TARIF_B,
  },
  {
    nom: "Mme Atangana",
    type: "particulier",
    lieu: "Etoudi",
    telephone: "677550123",
    tarifs: TARIF_A,
  },
  {
    nom: "Chez Bertrand",
    type: "restaurant",
    lieu: "Essos",
    telephone: "655009812",
    tarifs: TARIF_A,
  },
];

console.log("Clients et dettes — propriétaire");
const existants = (await proprietaire.appeler("GET", "/api/v1/clients/"))
  .donnees.results;
for (const client of CLIENTS) {
  if (existants.some((e) => e.nom === client.nom)) continue;
  const creation = await proprietaire.appeler("POST", "/api/v1/clients/", {
    nom: client.nom,
    type: client.type,
    lieu: client.lieu,
    telephone: client.telephone,
    tarifs: client.tarifs,
  });
  if (creation.statut !== 201)
    throw new Error(
      `client ${client.nom} non créé : ` + JSON.stringify(creation),
    );
  console.log("  client créé :", client.nom);
}
let clients = (await proprietaire.appeler("GET", "/api/v1/clients/")).donnees
  .results;
for (const voulu of CLIENTS.filter((c) => c.tarifs === TARIF_B)) {
  const client = clients.find((c) => c.nom === voulu.nom);
  if (!client || Object.keys(client.tarifs).length > 0) continue;
  const pose = await proprietaire.appeler(
    "PUT",
    `/api/v1/clients/${client.id}/tarifs/`,
    {
      tarifs: TARIF_B,
    },
  );
  if (pose.statut !== 200)
    throw new Error(`tarifs de ${voulu.nom} refusés : ` + JSON.stringify(pose));
  console.log("  tarifs posés :", voulu.nom);
}
clients = (await proprietaire.appeler("GET", "/api/v1/clients/")).donnees
  .results;

console.log("Clients et dettes — livraisons à crédit par la caissière");
for (const voulu of CLIENTS.filter((c) => c.livraison)) {
  const client = clients.find((c) => c.nom === voulu.nom);
  if (!client) throw new Error("client introuvable : " + voulu.nom);
  if (client.solde !== 0) {
    console.log(`  ${voulu.nom} : déjà ${client.solde} FCFA, rien à livrer`);
    continue;
  }
  const livraison = await caissiere.appeler(
    "POST",
    "/api/v1/livraisons/",
    {
      client: client.id,
      lignes: voulu.livraison,
      ...(voulu.paye
        ? { paiement: { mode: "especes", montant: voulu.paye } }
        : {}),
    },
    `demo-livraison-${client.id}`,
  );
  if (![201, 202].includes(livraison.statut)) {
    throw new Error(
      `livraison à ${voulu.nom} refusée : ` + JSON.stringify(livraison),
    );
  }
  console.log(
    `  livraison à ${voulu.nom} : dû ${livraison.donnees.montant_du}, reçu ${livraison.donnees.recu}, solde ${livraison.donnees.solde_apres}`,
  );
}
const dettes = (await proprietaire.appeler("GET", "/api/v1/clients/dettes/"))
  .donnees;
console.log(
  `  dettes : ${dettes.nombre} client(s), ${dettes.total} FCFA au total`,
);
// ---------------------------------------------------------------------------------------------
// Vague 4 — Caisses : une caisse fermée avec un manque de 600 FCFA, puis la suivante ouverte.
console.log("Caisses — historique");
const listeCaisses = (await caissiere.appeler("GET", "/api/v1/caisses/"))
  .donnees;
if (listeCaisses.count >= 2) {
  console.log(`  ${listeCaisses.count} caisses déjà enregistrées`);
} else {
  const enCours = listeCaisses.results.find((c) => c.en_cours);
  if (enCours) {
    const especes = (
      await caissiere.appeler("GET", `/api/v1/caisses/${enCours.id}/especes/`)
    ).donnees;
    const fermeture = await caissiere.appeler(
      "POST",
      `/api/v1/caisses/${enCours.id}/fermer/`,
      {
        compte: especes.attendu - 600,
      },
    );
    if (fermeture.statut !== 200)
      throw new Error("caisse non fermée : " + JSON.stringify(fermeture));
    console.log(
      `  caisse ${enCours.id} fermée : attendu ${especes.attendu}, compté ${especes.attendu - 600}`,
    );
  }
  const suivante = (
    await caissiere.appeler("GET", "/api/v1/caisses/prochaine/")
  ).donnees;
  const ouverture = await caissiere.appeler("POST", "/api/v1/caisses/ouvrir/", {
    fonds: suivante.fonds_propose ?? 20000,
  });
  if (ouverture.statut !== 201)
    throw new Error("caisse non ouverte : " + JSON.stringify(ouverture));
  console.log(`  caisse ouverte (${suivante.creneau} du ${suivante.jour})`);
}

// ---------------------------------------------------------------------------------------------
// Vague 5 — Session › Commandes : trois commandes pour la session de la caisse ouverte.
console.log("Session — commandes");
const caisseOuverte = (
  await caissiere.appeler("GET", "/api/v1/caisses/prochaine/")
).donnees.caisse_en_cours;
if (!caisseOuverte) {
  console.log("  aucune caisse ouverte : commandes ignorées");
} else {
  const requete = `jour=${caisseOuverte.jour}&creneau=${caisseOuverte.creneau}`;
  const deja = (await caissiere.appeler("GET", `/api/v1/commandes/?${requete}`))
    .donnees;
  if (deja.length > 0) {
    console.log(`  ${deja.length} commande(s) déjà saisie(s)`);
  } else {
    const tous = (await caissiere.appeler("GET", "/api/v1/clients/?actif=true"))
      .donnees.results;
    const voulues = [
      ["Ebène", { BAG: 40, KO: 10 }],
      ["Junior", { BAG: 25, GC135: 8 }],
      ["Restaurant Le Palmier", { BAG: 60 }],
    ];
    for (const [nom, lignes] of voulues) {
      const client = tous.find((c) => c.nom === nom);
      if (!client) throw new Error("client introuvable : " + nom);
      const commande = await caissiere.appeler("POST", "/api/v1/commandes/", {
        client: client.id,
        jour: caisseOuverte.jour,
        creneau: caisseOuverte.creneau,
        lignes,
      });
      if (![200, 201].includes(commande.statut)) {
        throw new Error(
          `commande de ${nom} refusée : ` + JSON.stringify(commande),
        );
      }
      console.log(`  commande de ${nom} : ${JSON.stringify(lignes)}`);
    }
  }
}

console.log("Terminé.");
