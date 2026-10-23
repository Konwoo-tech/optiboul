#!/usr/bin/env python3
"""Crée et tient à jour le tableau GitHub Projects « OptiBoul ERP · Product backlog ».

Le projet regroupe toutes les issues (épopées, récits) et pull requests du dépôt :
- colonnes Status : Backlog → Prêt → En cours → En revue → Terminé ;
- champs Nature, Épopée, Sprint (itérations de 2 semaines), Priorité, Points, Lot,
  déduits des étiquettes et jalons posés par importer_backlog.py ;
- vues Kanban, Sprint en cours, Product backlog, Feuille de route, Épopées, Pull requests.

Relançable : un statut posé à la main (au-delà de « Backlog ») n'est jamais écrasé.

    python3 scripts/github/projet_backlog.py              # simulation
    python3 scripts/github/projet_backlog.py --appliquer
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from importer_backlog import CHEMIN_BACKLOG  # noqa: E402
from importer_backlog import RACINE  # noqa: E402
from importer_backlog import dater_sprints  # noqa: E402
from importer_backlog import lire_backlog  # noqa: E402

TITRE = "OptiBoul ERP · Product backlog"
DESCRIPTION = "Backlog produit v2 : 16 épopées, 86 récits, sprints S1–S13, pull requests à valider vers develop."

# Les trois premiers statuts reprennent les identifiants des options par défaut de GitHub
# (Todo, In Progress, Done) : les automatisations « issue fermée / PR fusionnée → Terminé »
# continuent de fonctionner.
STATUTS = [
    ("Backlog", "GRAY", "Planifié dans un sprint, pas encore prêt", "Todo"),
    ("Prêt", "BLUE", "Définition de « prêt » remplie : peut démarrer", None),
    ("En cours", "YELLOW", "Branche ouverte depuis develop", "In Progress"),
    ("En revue", "ORANGE", "Pull request vers develop à valider", None),
    ("Terminé", "GREEN", "Pull request fusionnée, récit accepté", "Done"),
]
NATURES = [("Épopée", "PURPLE"), ("Récit", "YELLOW"), ("Pull request", "BLUE")]
PRIORITES = [("Must", "RED"), ("Should", "YELLOW"), ("Could", "GREEN")]
LOTS = [("Lot 0", "GRAY"), ("Lot 1", "BLUE"), ("Lot 2", "PURPLE")]

VUES = [
    # (nom, disposition, filtre)
    ("Kanban", "BOARD_LAYOUT", "-nature:Épopée"),
    ("Sprint en cours", "BOARD_LAYOUT", "sprint:@current"),
    ("Product backlog", "TABLE_LAYOUT", "nature:Récit"),
    ("Feuille de route", "ROADMAP_LAYOUT", "nature:Récit"),
    ("Épopées", "TABLE_LAYOUT", "nature:Épopée"),
    ("Pull requests", "TABLE_LAYOUT", "nature:\"Pull request\""),
]
CHAMPS_VISIBLES = ["Title", "Status", "Nature", "Épopée", "Sprint", "Priorité", "Points", "Lot", "Linked pull requests"]

FRAGMENT_CHAMPS = """
fields(first: 50) {
  nodes {
    ... on ProjectV2FieldCommon { id name dataType }
    ... on ProjectV2SingleSelectField { options { id name } }
    ... on ProjectV2IterationField { configuration { iterations { id title startDate } } }
  }
}
"""


def graphql(requete: str, **variables: object) -> dict:
    """Appel GraphQL ; réessaie sur les erreurs passagères de GitHub (délai croissant)."""
    for tentative in range(4):
        resultat = subprocess.run(
            ["gh", "api", "graphql", "--input", "-"],  # noqa: S607
            input=json.dumps({"query": requete, "variables": variables}),
            capture_output=True,
            text=True,
            check=False,
        )
        try:
            reponse = json.loads(resultat.stdout)
        except json.JSONDecodeError:
            reponse = {"errors": [resultat.stderr.strip() or resultat.stdout[:200]]}
        if resultat.returncode == 0 and not reponse.get("errors"):
            return reponse["data"]
        if tentative < 3:  # noqa: PLR2004
            time.sleep(2 * (tentative + 1))
    raise RuntimeError(json.dumps(reponse.get("errors"), ensure_ascii=False))


def rest(chemin: str) -> list[dict]:
    resultat = subprocess.run(
        ["gh", "api", "--paginate", chemin],  # noqa: S607
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(resultat.stdout.replace("]\n[", ",").replace("][", ","))


class Projet:
    def __init__(self, organisation: str, depot: str, *, appliquer: bool) -> None:
        self.organisation = organisation
        self.depot = depot
        self.appliquer = appliquer
        self.id = ""
        self.numero = 0
        self.champs: dict[str, dict] = {}
        self.mutations: list[str] = []

    # ---------- écriture groupée ----------
    def mutation(self, corps: str) -> None:
        self.mutations.append(corps)
        if len(self.mutations) >= 10:  # noqa: PLR2004
            self.envoyer()

    def envoyer(self) -> dict:
        """Envoie les mutations en attente et renvoie leurs résultats par alias."""
        resultat: dict = {}
        if self.mutations and self.appliquer:
            alias = "\n".join(f"m{i}: {m}" for i, m in enumerate(self.mutations))
            resultat = graphql(f"mutation {{\n{alias}\n}}")
        self.mutations.clear()
        return resultat

    # ---------- projet ----------
    def trouver_ou_creer(self) -> None:
        donnees = graphql(
            """query($org: String!, $depot: String!) {
              organization(login: $org) {
                id
                projectsV2(first: 50, query: "OptiBoul") { nodes { id number title } }
              }
              repository(owner: $org, name: $depot) { id }
            }""",
            org=self.organisation,
            depot=self.depot,
        )
        existant = next((p for p in donnees["organization"]["projectsV2"]["nodes"] if p["title"] == TITRE), None)
        if existant:
            self.id, self.numero = existant["id"], existant["number"]
            print(f"Projet existant #{self.numero}")
        elif not self.appliquer:
            print(f"+ projet « {TITRE} » (simulation : la suite suppose qu'il existe)")
            return
        else:
            cree = graphql(
                """mutation($org: ID!, $depot: ID!, $titre: String!) {
                  createProjectV2(input: {ownerId: $org, repositoryId: $depot, title: $titre}) {
                    projectV2 { id number }
                  }
                }""",
                org=donnees["organization"]["id"],
                depot=donnees["repository"]["id"],
                titre=TITRE,
            )["createProjectV2"]["projectV2"]
            self.id, self.numero = cree["id"], cree["number"]
            print(f"+ projet #{self.numero}")
        if self.appliquer:
            readme = (
                "## OptiBoul ERP · Product backlog\n\n"
                "- **Kanban** : récits et pull requests par statut (Backlog → Prêt → En cours → En revue → Terminé).\n"
                "- **Sprint en cours** : le sprint de deux semaines en cours.\n"
                "- **Product backlog** / **Feuille de route** : planification des 86 récits sur S1–S13.\n"
                "- **Pull requests** : ce qui attend une validation puis une fusion dans `develop`.\n\n"
                "Règle : chaque récit est développé sur une branche issue de `develop` et livré par une "
                "pull request vers `develop` (`Closes #n`). Le récit passe à « Terminé » à la fusion.\n\n"
                f"Synchronisé par `scripts/github/importer_backlog.py` puis `projet_backlog.py` depuis `{CHEMIN_BACKLOG}`."
            )
            graphql(
                """mutation($id: ID!, $description: String!, $readme: String!) {
                  updateProjectV2(input: {projectId: $id, shortDescription: $description, readme: $readme, public: false}) {
                    projectV2 { id }
                  }
                }""",
                id=self.id,
                description=DESCRIPTION,
                readme=readme,
            )

    def charger_champs(self) -> None:
        if not self.id:
            return
        noeuds = graphql(f"query($id: ID!) {{ node(id: $id) {{ ... on ProjectV2 {{ {FRAGMENT_CHAMPS} }} }} }}", id=self.id)
        self.champs = {c["name"]: c for c in noeuds["node"]["fields"]["nodes"] if c}

    # ---------- champs ----------
    def options_select(self, nom: str, options: list[tuple[str, str, str, str | None]]) -> None:
        """Crée ou ajuste un champ à choix unique ; garde les identifiants des options connues."""
        actuel = self.champs.get(nom)
        connues = {o["name"]: o["id"] for o in (actuel or {}).get("options", [])}
        voulues = []
        for libelle, couleur, description, ancien_nom in options:
            option = {"name": libelle, "color": couleur, "description": description}
            identifiant = connues.get(libelle) or (connues.get(ancien_nom) if ancien_nom else None)
            if identifiant:
                option["id"] = identifiant
            voulues.append(option)
        if actuel and [o["name"] for o in actuel["options"]] == [o["name"] for o in voulues]:
            return
        print(f"{'~' if actuel else '+'} champ {nom} : {', '.join(o['name'] for o in voulues)}")
        if not self.appliquer:
            return
        if actuel:
            graphql(
                """mutation($id: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
                  updateProjectV2Field(input: {fieldId: $id, singleSelectOptions: $options}) { clientMutationId }
                }""",
                id=actuel["id"],
                options=voulues,
            )
        else:
            graphql(
                """mutation($projet: ID!, $nom: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]) {
                  createProjectV2Field(input: {projectId: $projet, dataType: SINGLE_SELECT, name: $nom, singleSelectOptions: $options}) {
                    clientMutationId
                  }
                }""",
                projet=self.id,
                nom=nom,
                options=voulues,
            )

    def champ_nombre(self, nom: str) -> None:
        if nom in self.champs:
            return
        print(f"+ champ {nom} (nombre)")
        if self.appliquer:
            graphql(
                """mutation($projet: ID!, $nom: String!) {
                  createProjectV2Field(input: {projectId: $projet, dataType: NUMBER, name: $nom}) { clientMutationId }
                }""",
                projet=self.id,
                nom=nom,
            )

    def champ_sprints(self, sprints: list) -> None:
        voulues = [{"title": s.id, "startDate": s.debut.isoformat(), "duration": 14} for s in sprints]
        actuel = self.champs.get("Sprint")
        if actuel:
            existantes = [(i["title"], i["startDate"]) for i in actuel["configuration"]["iterations"]]
            if existantes == [(v["title"], v["startDate"]) for v in voulues]:
                return
        print(f"{'~' if actuel else '+'} champ Sprint : {voulues[0]['title']}–{voulues[-1]['title']} à partir du {voulues[0]['startDate']}")
        if not self.appliquer:
            return
        configuration = {"startDate": voulues[0]["startDate"], "duration": 14, "iterations": voulues}
        if actuel:
            graphql(
                """mutation($id: ID!, $conf: ProjectV2IterationFieldConfigurationInput!) {
                  updateProjectV2Field(input: {fieldId: $id, iterationConfiguration: $conf}) { clientMutationId }
                }""",
                id=actuel["id"],
                conf=configuration,
            )
        else:
            graphql(
                """mutation($projet: ID!, $conf: ProjectV2IterationFieldConfigurationInput!) {
                  createProjectV2Field(input: {projectId: $projet, dataType: ITERATION, name: "Sprint", iterationConfiguration: $conf}) {
                    clientMutationId
                  }
                }""",
                projet=self.id,
                conf=configuration,
            )

    # ---------- éléments ----------
    def elements(self) -> dict[str, dict]:
        """Éléments du projet indexés par identifiant de contenu (issue ou PR)."""
        resultat: dict[str, dict] = {}
        apres = None
        while self.id:
            page = graphql(
                """query($id: ID!, $apres: String) {
                  node(id: $id) { ... on ProjectV2 {
                    items(first: 100, after: $apres) {
                      pageInfo { hasNextPage endCursor }
                      nodes {
                        id
                        content { ... on Issue { id } ... on PullRequest { id } }
                        fieldValues(first: 20) { nodes {
                          ... on ProjectV2ItemFieldSingleSelectValue { optionId field { ... on ProjectV2FieldCommon { name } } }
                          ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
                          ... on ProjectV2ItemFieldIterationValue { iterationId field { ... on ProjectV2FieldCommon { name } } }
                        } }
                      }
                    }
                  } }
                }""",
                id=self.id,
                apres=apres,
            )["node"]["items"]
            for noeud in page["nodes"]:
                if noeud["content"]:
                    valeurs = {}
                    for v in noeud["fieldValues"]["nodes"]:
                        if v and v.get("field"):
                            valeurs[v["field"]["name"]] = v.get("optionId") or v.get("iterationId") or v.get("number")
                    resultat[noeud["content"]["id"]] = {"id": noeud["id"], "valeurs": valeurs}
            if not page["pageInfo"]["hasNextPage"]:
                break
            apres = page["pageInfo"]["endCursor"]
        return resultat

    def option(self, champ: str, libelle: str | None) -> str | None:
        if not libelle:
            return None
        return next((o["id"] for o in self.champs[champ]["options"] if o["name"] == libelle), None)

    def valeurs_voulues(self, contenu: dict, est_pr: bool) -> dict[str, object]:  # noqa: FBT001
        etiquettes = [e["name"] for e in contenu.get("labels", [])]

        def etiquette(prefixe: str) -> str | None:
            return next((e.removeprefix(prefixe) for e in etiquettes if e.startswith(prefixe)), None)

        epopee = etiquette("épopée:")
        nom_epopee = next((o["name"] for o in self.champs["Épopée"]["options"] if epopee and o["name"].startswith(epopee)), None)
        jalon = (contenu.get("milestone") or {}).get("title", "")
        sprint = jalon.removeprefix("Sprint ") if jalon.startswith("Sprint ") else None
        iteration = next((i["id"] for i in self.champs["Sprint"]["configuration"]["iterations"] if i["title"] == sprint), None)
        priorite = etiquette("prio:")
        lot = etiquette("lot:")
        points = etiquette("points:")
        if est_pr:
            nature = "Pull request"
        elif "type:épopée" in etiquettes:
            nature = "Épopée"
        elif "type:récit" in etiquettes:
            nature = "Récit"
        else:
            nature = None
        return {
            "Nature": self.option("Nature", nature),
            "Épopée": self.option("Épopée", nom_epopee),
            "Sprint": iteration,
            "Priorité": self.option("Priorité", priorite.capitalize() if priorite else None),
            "Lot": self.option("Lot", f"Lot {lot}" if lot else None),
            "Points": float(points) if points else None,
        }

    def statut_initial(self, contenu: dict, est_pr: bool) -> str:  # noqa: FBT001
        if est_pr:
            return "Terminé" if contenu.get("merged_at") else ("En revue" if contenu["state"] == "open" else "Terminé")
        return "Terminé" if contenu["state"] == "closed" else "Backlog"

    def remplir(self) -> None:
        issues = rest(f"repos/{self.organisation}/{self.depot}/issues?state=all&per_page=100")
        prs = {p["node_id"]: p for p in rest(f"repos/{self.organisation}/{self.depot}/pulls?state=all&per_page=100")}
        contenus = [(i["node_id"], i, "pull_request" in i) for i in issues]
        presents = self.elements()
        nouveaux = [(n, c, pr) for n, c, pr in contenus if n not in presents]
        print(f"Éléments : {len(presents)} dans le projet, {len(nouveaux)} à ajouter")
        if not self.appliquer:
            return
        # L'identifiant d'élément renvoyé par l'ajout est utilisé directement : la liste
        # des éléments du projet met quelques instants à référencer un ajout récent, et
        # une relecture immédiate ferait croire que rien n'a été ajouté.
        for debut in range(0, len(nouveaux), 10):
            lot = nouveaux[debut : debut + 10]
            # File alimentée directement : `mutation()` viderait le lot au 10ᵉ ajout
            # et la réponse, qui porte les identifiants d'éléments, serait perdue.
            self.mutations.extend(
                f'addProjectV2ItemById(input: {{projectId: "{self.id}", contentId: "{noeud}"}}) {{ item {{ id }} }}'
                for noeud, _, _ in lot
            )
            reponse = self.envoyer()
            for rang, (noeud, _, _) in enumerate(lot):
                ajoute = (reponse.get(f"m{rang}") or {}).get("item")
                if ajoute:
                    presents[noeud] = {"id": ajoute["id"], "valeurs": {}}

        modifications = 0
        absents = []
        for noeud, contenu, est_pr in contenus:
            if est_pr:
                contenu = {**contenu, **prs.get(noeud, {})}  # noqa: PLW2901
            # GitHub peut refuser un contenu (élément archivé, dépôt d'origine
            # inaccessible) : on le signale au lieu d'interrompre la synchronisation.
            element = presents.get(noeud)
            if element is None:
                absents.append(contenu.get("number"))
                continue
            voulues = self.valeurs_voulues(contenu, est_pr)
            # GitHub range tout nouvel élément dans « Backlog » : ce statut compte comme non posé.
            # Un statut choisi à la main (Prêt, En cours…) n'est jamais écrasé.
            if element["valeurs"].get("Status") in (None, self.option("Status", "Backlog")):
                voulues["Status"] = self.option("Status", self.statut_initial(contenu, est_pr))
            for champ, valeur in voulues.items():
                if valeur is None or element["valeurs"].get(champ) == valeur:
                    continue
                if champ == "Points":
                    contenu_valeur = f"number: {valeur}"
                elif champ == "Sprint":
                    contenu_valeur = f'iterationId: "{valeur}"'
                else:
                    contenu_valeur = f'singleSelectOptionId: "{valeur}"'
                self.mutation(
                    f'updateProjectV2ItemFieldValue(input: {{projectId: "{self.id}", itemId: "{element["id"]}", '
                    f'fieldId: "{self.champs[champ]["id"]}", value: {{{contenu_valeur}}}}}) {{ clientMutationId }}',
                )
                modifications += 1
        self.envoyer()
        print(f"Valeurs de champs écrites : {modifications}")
        if absents:
            print(f"  ! non ajoutés au tableau : {', '.join(f'#{n}' for n in absents if n)}")

    # ---------- vues ----------
    def vues(self) -> None:
        if not self.id:
            print(f"+ vues : {', '.join(v[0] for v in VUES)}")
            return
        existantes = graphql(
            "query($id: ID!) { node(id: $id) { ... on ProjectV2 { views(first: 30) { nodes { id name layout } } } } }",
            id=self.id,
        )["node"]["views"]["nodes"]
        visibles = [self.champs[n]["id"] for n in CHAMPS_VISIBLES if n in self.champs]
        par_nom = {v["name"]: v for v in existantes}
        # La vue créée par défaut avec le projet devient « Product backlog ».
        defaut = next((v for v in existantes if re.fullmatch(r"View \d+", v["name"])), None)
        for nom, disposition, filtre in VUES:
            vue = par_nom.get(nom)
            if vue is None and defaut and disposition == "TABLE_LAYOUT" and nom == "Product backlog":
                vue = defaut
            configuration = {"visibleFieldIds": visibles} if disposition == "TABLE_LAYOUT" else None
            if vue is None:
                print(f"+ vue {nom}")
                if self.appliquer:
                    graphql(
                        """mutation($projet: ID!, $nom: String!, $disposition: ProjectV2ViewLayout!, $conf: ProjectV2ViewConfigurationInput) {
                          createProjectV2View(input: {projectId: $projet, name: $nom, layout: $disposition, configuration: $conf}) {
                            projectV2View { id }
                          }
                        }""",
                        projet=self.id,
                        nom=nom,
                        disposition=disposition,
                        conf=configuration,
                    )
                    vue = {"id": next(
                        v["id"] for v in graphql(
                            "query($id: ID!) { node(id: $id) { ... on ProjectV2 { views(first: 30) { nodes { id name } } } } }",
                            id=self.id,
                        )["node"]["views"]["nodes"] if v["name"] == nom
                    )}
            if vue and self.appliquer:
                graphql(
                    """mutation($id: ID!, $nom: String!, $disposition: ProjectV2ViewLayout!, $filtre: String!, $conf: ProjectV2ViewConfigurationInput) {
                      updateProjectV2View(input: {viewId: $id, name: $nom, layout: $disposition, filter: $filtre, configuration: $conf}) {
                        clientMutationId
                      }
                    }""",
                    id=vue["id"],
                    nom=nom,
                    disposition=disposition,
                    filtre=filtre,
                    conf=configuration,
                )

    # ---------- déroulé ----------
    def executer(self, epopees: list, sprints: list) -> None:
        self.trouver_ou_creer()
        self.charger_champs()
        if not self.id and not self.appliquer:
            print("Simulation arrêtée : relancer avec --appliquer pour créer le projet et le remplir.")
            return
        self.options_select("Status", STATUTS)
        self.options_select("Nature", [(n, c, "", None) for n, c in NATURES])
        self.options_select("Épopée", [(e.titre, "PURPLE" if e.id == "EP00" else "GRAY", e.objectif[:100], None) for e in epopees])
        self.options_select("Priorité", [(p, c, "", None) for p, c in PRIORITES])
        self.options_select("Lot", [(lot, c, "", None) for lot, c in LOTS])
        self.champ_nombre("Points")
        self.champ_sprints(sprints)
        self.charger_champs()
        if self.appliquer:
            self.remplir()
        self.vues()
        if self.numero:
            print(f"\nhttps://github.com/orgs/{self.organisation}/projects/{self.numero}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--organisation", default="Konwoo-tech")
    parser.add_argument("--depot", default="optiboul")
    parser.add_argument("--debut-s1", type=date.fromisoformat, default=date(2026, 10, 26))
    parser.add_argument("--appliquer", action="store_true")
    args = parser.parse_args()

    epopees, sprints = lire_backlog(RACINE / CHEMIN_BACKLOG)
    dater_sprints(sprints, args.debut_s1)
    Projet(args.organisation, args.depot, appliquer=args.appliquer).executer(epopees, sprints)
    return 0


if __name__ == "__main__":
    sys.exit(main())
