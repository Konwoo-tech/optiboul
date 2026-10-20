#!/usr/bin/env python3
"""Synchronise le backlog produit avec les issues GitHub du dépôt.

Source : docs/specifications/OptiBoul_ERP_Backlog_produit_v2.md
Étiquettes, un jalon daté par sprint, une issue par épopée et par récit, chaque récit
rattaché à son épopée (sous-issues). Les issues existantes (même identifiant EPxx /
US-xxx) sont mises à jour ; seules les étiquettes gérées ici sont touchées.

    python3 scripts/github/importer_backlog.py --hors-ligne   # lit le document, sans GitHub
    python3 scripts/github/importer_backlog.py                # écarts avec GitHub, sans rien écrire
    python3 scripts/github/importer_backlog.py --appliquer    # crée et met à jour
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from dataclasses import field
from datetime import date
from datetime import timedelta
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
CHEMIN_BACKLOG = "docs/specifications/OptiBoul_ERP_Backlog_produit_v2.md"
BRANCHE_DOCUMENTATION = "develop"
DUREE_SPRINT = timedelta(days=14)

DEFINITION_TERMINE = [
    "Code relu, tests unitaires du domaine et tests d'API au vert",
    "Parcours Playwright mis à jour si le récit touche le comptoir",
    "Droits vérifiés côté serveur pour chaque profil ; action tracée dans le journal",
    "Textes FR et EN",
    "Fonctionne hors ligne (sauf envois mis en file) ; migration réversible ; OpenAPI à jour",
    "Pull request vers develop validée et fusionnée",
    "Démontré au propriétaire ou au gérant et accepté",
]

ETIQUETTES = {
    "type:épopée": ("5A3220", "Épopée du backlog produit"),
    "type:récit": ("F2B705", "Récit utilisateur"),
    "type:anomalie": ("D73A4A", "Comportement contraire au cahier des charges"),
    "prio:must": ("B60205", "MoSCoW : indispensable au lot"),
    "prio:should": ("FBCA04", "MoSCoW : important, peut glisser au sprint suivant"),
    "prio:could": ("C2E0C6", "MoSCoW : confort"),
    "lot:0": ("EDEDED", "Lot 0 : socle technique"),
    "lot:1": ("BFD4F2", "Lot 1 : ventes, dettes, production de base, fournisseurs, dépenses"),
    "lot:2": ("D4C5F9", "Lot 2 : stocks, consommation réelle, paie, marge"),
}
PREFIXES_GERES = ("type:épopée", "type:récit", "épopée:", "prio:", "lot:", "points:")


@dataclass
class Recit:
    id: str
    texte: str
    criteres: list[str]
    priorite: str
    points: int
    lot: str
    reference: str
    epopee: str
    sprint: str = ""

    @property
    def titre(self) -> str:
        """« US-051 · Trouver un client … » : l'objet du « je veux », sans le « afin de »."""
        m = re.search(r"je veux (.+?)(?: afin d| afin que|$)", self.texte)
        objet = (m.group(1) if m else self.texte).strip().rstrip(" ,;.")
        return f"{self.id} · {objet[0].upper()}{objet[1:]}"


@dataclass
class Epopee:
    id: str
    nom: str
    objectif: str
    lot: str
    recits: list[Recit] = field(default_factory=list)

    @property
    def titre(self) -> str:
        return f"{self.id} · {self.nom}"


@dataclass
class Sprint:
    id: str
    lot: str
    objectif: str
    recits: list[str]
    points: int
    debut: date | None = None

    @property
    def titre(self) -> str:
        return f"Sprint {self.id}"

    @property
    def fin(self) -> date | None:
        return self.debut + DUREE_SPRINT - timedelta(days=1) if self.debut else None


def cellules(ligne: str) -> list[str]:
    return [c.strip() for c in ligne.strip().strip("|").split("|")]


def lire_backlog(chemin: Path) -> tuple[list[Epopee], list[Sprint]]:
    epopees: list[Epopee] = []
    sprints: list[Sprint] = []
    courante: Epopee | None = None
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        if m := re.match(r"^### (EP\d{2}) · (.+)$", ligne):
            courante = Epopee(id=m.group(1), nom=m.group(2).strip(), objectif="", lot="")
            epopees.append(courante)
        elif courante and (m := re.match(r"^\*\*Objectif :\*\* (.+?) \*\*Lot :\*\* (.+?)\.$", ligne)):
            courante.objectif, courante.lot = m.group(1), m.group(2)
        elif ligne.startswith("| US-") and courante:
            id_, texte, criteres, prio, pts, lot, ref = cellules(ligne)
            courante.recits.append(
                Recit(
                    id=id_,
                    texte=texte,
                    criteres=[c.lstrip("• ").strip() for c in criteres.split("<br>") if c.strip("—• ")],
                    priorite=prio,
                    points=int(pts),
                    lot=lot,
                    reference=ref,
                    epopee=courante.id,
                ),
            )
        elif re.match(r"^\| S\d+ \|", ligne):
            id_, lot, objectif, recits, pts = cellules(ligne)
            sprints.append(Sprint(id_, lot, objectif, [r.strip() for r in recits.split(",")], int(pts)))
    par_id = {r.id: r for e in epopees for r in e.recits}
    for sprint in sprints:
        for id_ in sprint.recits:
            par_id[id_].sprint = sprint.id
    return epopees, sprints


def dater_sprints(sprints: list[Sprint], debut_s1: date) -> None:
    for rang, sprint in enumerate(sprints):
        sprint.debut = debut_s1 + rang * DUREE_SPRINT


class GitHub:
    def __init__(self, depot: str) -> None:
        self.depot = depot

    def api(self, chemin: str, methode: str = "GET", donnees: dict | None = None) -> object:
        commande = ["gh", "api", "-X", methode, "-H", "Accept: application/vnd.github+json", chemin]
        if donnees is not None:
            commande += ["--input", "-"]
        if methode == "GET":
            commande.append("--paginate")
        resultat = subprocess.run(  # noqa: S603
            commande,
            input=json.dumps(donnees) if donnees is not None else None,
            capture_output=True,
            text=True,
            check=False,
        )
        if resultat.returncode != 0:
            raise RuntimeError(f"{methode} {chemin} : {resultat.stderr.strip() or resultat.stdout.strip()}")
        sortie = resultat.stdout.strip()
        if methode == "GET" and sortie.startswith("[") and "][" in sortie:
            sortie = sortie.replace("]\n[", ",").replace("][", ",")
        return json.loads(sortie) if sortie else None

    def depot_api(self, chemin: str, methode: str = "GET", donnees: dict | None = None) -> object:
        return self.api(f"repos/{self.depot}/{chemin}", methode, donnees)


def etiquette_epopee(epopee: Epopee) -> str:
    return f"épopée:{epopee.id}"


def lien_backlog(depot: str) -> str:
    # Lien absolu : un lien relatif dans le corps d'une issue ne mène pas au fichier.
    return f"https://github.com/{depot}/blob/{BRANCHE_DOCUMENTATION}/{CHEMIN_BACKLOG}"


def corps_epopee(epopee: Epopee, depot: str, numeros: dict[str, int]) -> str:
    points = sum(r.points for r in epopee.recits)
    lignes = [
        f"**Objectif :** {epopee.objectif}",
        "",
        f"**Lot :** {epopee.lot} · **Récits :** {len(epopee.recits)} · **Points :** {points}",
        "",
        "## Récits",
        "",
    ]
    for r in epopee.recits:
        lien = f"#{numeros[r.id]}" if r.id in numeros else r.id
        lignes.append(f"- [ ] {lien} · {r.priorite} · {r.points} pts · {r.sprint or 'hors plan'}")
    lignes += ["", f"Source : [backlog produit v2]({lien_backlog(depot)})"]
    return "\n".join(lignes)


def corps_recit(recit: Recit, epopee: Epopee, numero_epopee: int | None, depot: str) -> str:
    lien_epopee = f"#{numero_epopee}" if numero_epopee else epopee.id
    criteres = [f"- [ ] {c}" for c in recit.criteres] or [
        "- [ ] À préciser avant l'entrée en sprint (définition de « prêt »)",
    ]
    lignes = [
        f"> {recit.texte}",
        "",
        "| Épopée | Priorité | Points | Lot | Sprint | Référence |",
        "| --- | --- | --- | --- | --- | --- |",
        f"| {lien_epopee} {epopee.nom} | {recit.priorite} | {recit.points} | {recit.lot} "
        f"| {recit.sprint or '—'} | {recit.reference} |",
        "",
        "## Critères d'acceptation",
        "",
        *criteres,
        "",
        "## Définition de « terminé »",
        "",
        *[f"- [ ] {d}" for d in DEFINITION_TERMINE],
        "",
        f"Source : [backlog produit v2]({lien_backlog(depot)})",
    ]
    return "\n".join(lignes)


def etiquettes_recit(recit: Recit, epopee: Epopee) -> list[str]:
    return [
        "type:récit",
        etiquette_epopee(epopee),
        f"prio:{recit.priorite.lower()}",
        f"lot:{recit.lot}",
        f"points:{recit.points}",
    ]


def etiquettes_epopee(epopee: Epopee) -> list[str]:
    return ["type:épopée", etiquette_epopee(epopee), f"lot:{epopee.lot.split(' ')[0]}"]


class Synchronisation:
    def __init__(self, gh: GitHub, *, appliquer: bool) -> None:
        self.gh = gh
        self.appliquer = appliquer
        self.bilan: dict[str, list[str]] = {"créées": [], "mises à jour": [], "inchangées": []}

    def ecrire(self, chemin: str, methode: str, donnees: dict) -> object:
        if not self.appliquer:
            return None
        resultat = self.gh.depot_api(chemin, methode, donnees)
        time.sleep(0.7)  # limite secondaire de GitHub sur l'écriture de contenu
        return resultat

    def etiquettes(self, epopees: list[Epopee]) -> None:
        voulues = dict(ETIQUETTES)
        for e in epopees:
            voulues[etiquette_epopee(e)] = ("8B5E3C", e.nom[:100])
        for pts in sorted({r.points for e in epopees for r in e.recits}):
            voulues[f"points:{pts}"] = ("FFF4DC", "Complexité relative")
        existantes = {e["name"] for e in self.gh.depot_api("labels?per_page=100")}  # type: ignore[union-attr]
        for nom, (couleur, description) in voulues.items():
            if nom not in existantes:
                print(f"  + étiquette {nom}")
                self.ecrire("labels", "POST", {"name": nom, "color": couleur, "description": description})

    def jalons(self, sprints: list[Sprint]) -> dict[str, int]:
        existants = {m["title"]: m for m in self.gh.depot_api("milestones?state=all&per_page=100")}  # type: ignore[union-attr]
        numeros: dict[str, int] = {}
        for s in sprints:
            voulu = {"title": s.titre, "description": f"Lot {s.lot} · {s.points} points · {s.objectif}"}
            if s.debut and s.fin:
                voulu["description"] = f"{s.debut:%d/%m/%Y} → {s.fin:%d/%m/%Y} · " + voulu["description"]
                voulu["due_on"] = f"{s.fin.isoformat()}T23:59:59Z"
            actuel = existants.get(s.titre)
            if actuel is None:
                print(f"  + jalon {s.titre}")
                cree = self.ecrire("milestones", "POST", voulu)
                numeros[s.titre] = cree["number"] if cree else 0  # type: ignore[index]
                continue
            numeros[s.titre] = actuel["number"]
            ecarts = []
            if actuel.get("description") != voulu["description"]:
                ecarts.append("description")
            if (actuel.get("due_on") or "")[:10] != voulu.get("due_on", "")[:10]:
                ecarts.append("échéance")
            if ecarts:
                print(f"  ~ jalon {s.titre} : {', '.join(ecarts)}")
                self.ecrire(f"milestones/{actuel['number']}", "PATCH", voulu)
        return numeros

    def issue(self, cle: str, voulue: dict, existante: dict | None) -> dict | None:
        if existante is None:
            print(f"  + {voulue['title']}")
            self.bilan["créées"].append(cle)
            return self.ecrire("issues", "POST", voulue)  # type: ignore[return-value]
        actuelles = [e["name"] for e in existante["labels"]]
        hors_gestion = [e for e in actuelles if not e.startswith(PREFIXES_GERES)]
        etiquettes = sorted(set(voulue["labels"]) | set(hors_gestion))
        ecarts = []
        if existante["title"] != voulue["title"]:
            ecarts.append("titre")
        if (existante["body"] or "").strip() != voulue["body"].strip():
            ecarts.append("description")
        if sorted(actuelles) != etiquettes:
            ecarts.append("étiquettes")
        jalon_actuel = existante["milestone"]["number"] if existante.get("milestone") else None
        if jalon_actuel != voulue.get("milestone"):
            ecarts.append("sprint")
        if not ecarts:
            self.bilan["inchangées"].append(cle)
            return existante
        print(f"  ~ #{existante['number']} {cle} : {', '.join(ecarts)}")
        self.bilan["mises à jour"].append(cle)
        self.ecrire(f"issues/{existante['number']}", "PATCH", {**voulue, "labels": etiquettes})
        return existante

    def executer(self, epopees: list[Epopee], sprints: list[Sprint]) -> None:
        depot = self.gh.depot
        print("Étiquettes…")
        self.etiquettes(epopees)
        print("Jalons (sprints)…")
        jalons = self.jalons(sprints)

        par_cle: dict[str, dict] = {}
        for issue in self.gh.depot_api("issues?state=all&per_page=100"):  # type: ignore[union-attr]
            if "pull_request" not in issue and (m := re.match(r"^(EP\d{2}|US-\d{3}) · ", issue["title"])):
                par_cle[m.group(1)] = issue
        prevues = {e.id for e in epopees} | {r.id for e in epopees for r in e.recits}
        for cle in sorted(set(par_cle) - prevues):
            print(f"  ! {cle} existe sur GitHub mais plus dans le backlog (#{par_cle[cle]['number']})")

        numeros = {cle: issue["number"] for cle, issue in par_cle.items()}
        print("Épopées…")
        for e in epopees:
            voulue = {"title": e.titre, "body": corps_epopee(e, depot, numeros), "labels": etiquettes_epopee(e)}
            if (issue := self.issue(e.id, voulue, par_cle.get(e.id))) and e.id not in par_cle:
                par_cle[e.id] = issue
                numeros[e.id] = issue["number"]

        print("Récits…")
        for e in epopees:
            for r in e.recits:
                voulue = {
                    "title": r.titre,
                    "body": corps_recit(r, e, numeros.get(e.id), depot),
                    "labels": etiquettes_recit(r, e),
                    "milestone": jalons.get(f"Sprint {r.sprint}") if r.sprint else None,
                }
                if (issue := self.issue(r.id, voulue, par_cle.get(r.id))) and r.id not in par_cle:
                    par_cle[r.id] = issue
                    numeros[r.id] = issue["number"]

        print("Rattachement aux épopées et listes de récits…")
        for e in epopees:
            if e.id not in par_cle or not self.appliquer:
                continue
            epopee = par_cle[e.id]
            deja = {i["id"] for i in self.gh.depot_api(f"issues/{epopee['number']}/sub_issues?per_page=100")}  # type: ignore[union-attr]
            for r in e.recits:
                if par_cle[r.id]["id"] not in deja:
                    self.ecrire(f"issues/{epopee['number']}/sub_issues", "POST", {"sub_issue_id": par_cle[r.id]["id"]})
            corps = corps_epopee(e, depot, numeros)
            if (epopee.get("body") or "").strip() != corps:
                self.ecrire(f"issues/{epopee['number']}", "PATCH", {"body": corps})

        print("\nBilan" + ("" if self.appliquer else " (simulation : rien n'a été écrit, relancer avec --appliquer)"))
        for nature, cles in self.bilan.items():
            print(f"  {nature} : {len(cles)}" + (f" ({', '.join(cles)})" if cles and nature != "inchangées" and len(cles) <= 20 else ""))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default="Konwoo-tech/optiboul")
    parser.add_argument("--debut-s1", type=date.fromisoformat, default=date(2026, 10, 26), help="lundi de début du sprint S1")
    parser.add_argument("--hors-ligne", action="store_true", help="analyse le document sans interroger GitHub")
    parser.add_argument("--appliquer", action="store_true", help="écrit les changements sur GitHub")
    args = parser.parse_args()

    epopees, sprints = lire_backlog(RACINE / CHEMIN_BACKLOG)
    dater_sprints(sprints, args.debut_s1)
    recits = [r for e in epopees for r in e.recits]
    print(
        f"{len(epopees)} épopées, {len(recits)} récits, {sum(r.points for r in recits)} points, "
        f"{len(sprints)} sprints ({sum(1 for r in recits if r.sprint)} récits planifiés)",
    )
    if args.hors_ligne:
        for s in sprints:
            print(f"  {s.titre} : {s.debut:%d/%m/%Y} → {s.fin:%d/%m/%Y} · {s.points} pts · {', '.join(s.recits)}")
        return 0
    Synchronisation(GitHub(args.repo), appliquer=args.appliquer).executer(epopees, sprints)
    return 0


if __name__ == "__main__":
    sys.exit(main())
