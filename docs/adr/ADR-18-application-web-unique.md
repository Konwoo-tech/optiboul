# ADR-18 · Une seule application web, des espaces selon le profil

**Statut :** acceptée · 20 octobre 2026 · remplace ADR-10 (cinq applications) pour la partie web

## Contexte

La spécification v2 découpait le web en quatre applications (portail, comptoir, atelier, gestion). Le porteur du projet veut **une seule application web**, dans laquelle chaque utilisateur ne voit que ce que son profil autorise.

## Décision

- `apps/web` est l'unique application web. La connexion, le comptoir, l'atelier et la gestion y deviennent des **espaces** (routes `/connexion`, `/comptoir`, `/atelier`, `/gestion`).
- **Le profil vient de l'API** : l'utilisateur appartient à un groupe, le groupe porte un profil de droits (CdC §3.2, modèle `ProfilGroupe`). L'administrateur configure les groupes. `GET /api/v1/users/me/` renvoie le `profil`. Les 6 groupes de départ du cahier des charges sont créés par migration.
- **`apps/web/src/profils.ts`** associe à chaque profil les espaces visibles et l'écran d'arrivée (O10) : la caissière arrive sur le comptoir, le responsable de production sur l'atelier, le gérant sur « Ma semaine », le propriétaire sur le tableau de bord.
- Cette table ne fait que l'affichage. **Chaque droit reste vérifié côté serveur** (CdC §7, spécification §4.3).
- Chaque espace est chargé à la demande (`React.lazy`) : le comptoir ne télécharge pas le code de la gestion.

## Conséquences

- Une seule image web, une seule URL, un seul build à tester.
- À distance, c'est la même application qui est ouverte au propriétaire et au gérant (ADR-19) : la protection repose sur la double authentification et les droits de l'API.
- Le comptoir partage la même session que les autres espaces. Le changement d'utilisateur rapide (US-014) se fait dans l'application.
