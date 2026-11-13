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
// Vague 2 : la semaine 46 de 2026 ouverte (gérant Willy, production Serge), puis la caisse du
// créneau en cours ouverte par la caissière avec le fonds proposé. Les vagues suivantes ajoutent
// leurs données ici (clients, produits, stocks, fournisseurs, …), une étape à la fois.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API = process.env.OPTIBOUL_API_URL ?? 'http://127.0.0.1:8001';
const POSTE = process.env.OPTIBOUL_POSTE_COOKIE;
if (!POSTE) {
  console.error('Définir OPTIBOUL_POSTE_COOKIE (voir docs/api-local/seed_dev.py).');
  process.exit(1);
}
const DOSSIER_API = fileURLToPath(new URL('../../apps/api/', import.meta.url));

/** Dernier code de double authentification, lu dans la base locale (pas de SMS sans Celery). */
function dernierCode() {
  const sortie = execFileSync(
    DOSSIER_API + '.venv/Scripts/python.exe',
    [
      'manage.py',
      'shell',
      '-c',
      "from optiboul.notifications.infrastructure.models import MessageSortant as M; print(M.objects.order_by('-pk').first().contenu)",
    ],
    {
      cwd: DOSSIER_API,
      env: {
        ...process.env,
        VIRTUAL_ENV: '',
        DJANGO_SETTINGS_MODULE: 'config.settings.local',
        USE_DOCKER: 'no',
        DATABASE_URL: 'postgres://optiboul:optiboul_dev@localhost:5432/optiboul_dev',
        REDIS_URL: 'redis://localhost:6379/5',
        DJANGO_EMAIL_BACKEND: 'django.core.mail.backends.console.EmailBackend',
      },
      encoding: 'utf8',
    },
  );
  return sortie.match(/\b(\d{6})\b/)?.[1];
}

/** Un navigateur minimal : cookies, jeton CSRF relu à chaque requête (il change à la connexion). */
class Client {
  cookies = new Map([['optiboul_poste', POSTE]]);

  async appeler(methode, chemin, corps) {
    const entetes = {
      Accept: 'application/json',
      Origin: API,
      Cookie: [...this.cookies].map(([nom, valeur]) => `${nom}=${valeur}`).join('; '),
    };
    if (methode !== 'GET') {
      entetes['Content-Type'] = 'application/json';
      const csrf = this.cookies.get('csrftoken');
      if (csrf) entetes['X-CSRFToken'] = csrf;
    }
    const reponse = await fetch(API + chemin, {
      method: methode,
      headers: entetes,
      body: corps ? JSON.stringify(corps) : undefined,
    });
    for (const ligne of reponse.headers.getSetCookie()) {
      const [paire] = ligne.split(';');
      const i = paire.indexOf('=');
      const nom = paire.slice(0, i);
      const valeur = paire.slice(i + 1);
      if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(ligne) || valeur === '') this.cookies.delete(nom);
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
  await client.appeler('GET', '/api/v1/connexion/utilisateurs/');
  const reponse = await client.appeler('POST', '/api/v1/connexion/code/', { utilisateur: id, code });
  if (reponse.statut !== 200) throw new Error('code refusé : ' + JSON.stringify(reponse));
  if (reponse.donnees.deuxFacteurs) {
    await client.appeler('POST', '/api/v1/connexion/otp/envoyer/', { canal: 'sms' });
    const verification = await client.appeler('POST', '/api/v1/connexion/otp/verifier/', {
      code: dernierCode(),
    });
    if (verification.statut !== 204) throw new Error('code SMS refusé : ' + JSON.stringify(verification));
  }
  const moi = await client.appeler('GET', '/api/v1/users/me/');
  console.log(`  connecté : ${moi.donnees.name} (${moi.donnees.profil})`);
}

/** Numéro ISO de la semaine contenant aujourd'hui. */
function semaineIso(date = new Date()) {
  const jour = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const numeroJour = jour.getUTCDay() || 7;
  jour.setUTCDate(jour.getUTCDate() + 4 - numeroJour);
  const debutAnnee = new Date(Date.UTC(jour.getUTCFullYear(), 0, 1));
  return { annee: jour.getUTCFullYear(), numero: Math.ceil(((jour - debutAnnee) / 86_400_000 + 1) / 7) };
}

const { annee, numero } = semaineIso();
const comptes = (await new Client().appeler('GET', '/api/v1/connexion/utilisateurs/')).donnees;
const idDe = (profil) => comptes.find((c) => c.profil === profil)?.id;

console.log(`Propriétaire — semaine ${numero} de ${annee}`);
const proprietaire = new Client();
await connecter(proprietaire, idDe('proprietaire'), '2222');
const liste = await proprietaire.appeler('GET', '/api/v1/semaines/');
let semaine = liste.donnees.results.find((s) => s.annee === annee && s.numero === numero);
if (!semaine) {
  const creee = await proprietaire.appeler('POST', '/api/v1/semaines/', {
    annee,
    numero,
    gerant: idDe('gerant'),
    production: idDe('production'),
  });
  if (creee.statut !== 201) throw new Error('semaine non créée : ' + JSON.stringify(creee));
  semaine = creee.donnees.semaine; // la création renvoie une enveloppe {semaine: …}
  console.log('  semaine créée');
}
if (semaine.statut !== 'ouverte') {
  const ouverte = await proprietaire.appeler('POST', `/api/v1/semaines/${semaine.id}/ouvrir/`);
  if (ouverte.statut !== 200) throw new Error('semaine non ouverte : ' + JSON.stringify(ouverte));
  console.log('  semaine ouverte');
}

console.log('Caissière — caisse du créneau en cours');
const caissiere = new Client();
await connecter(caissiere, idDe('caissier'), '4444');
const prochaine = (await caissiere.appeler('GET', '/api/v1/caisses/prochaine/')).donnees;
if (prochaine.caisse_en_cours) {
  console.log('  caisse déjà ouverte');
} else {
  const ouverture = await caissiere.appeler('POST', '/api/v1/caisses/ouvrir/', {
    fonds: prochaine.fonds_propose ?? 20000,
  });
  if (ouverture.statut !== 201) throw new Error('caisse non ouverte : ' + JSON.stringify(ouverture));
  console.log(`  caisse ouverte (${prochaine.creneau}, fonds ${prochaine.fonds_propose})`);
}
console.log('Terminé.');
