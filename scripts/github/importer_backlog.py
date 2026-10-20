#!/usr/bin/env python3
"""Importe le backlog produit dans les issues GitHub du dépôt.

Source : docs/specifications/OptiBoul_ERP_Backlog_produit.md
Crée les étiquettes, un jalon par sprint (S1–S12), une issue par épopée et une issue
par récit, puis rattache chaque récit à son épopée (sous-issues GitHub).
Relançable : ce qui existe déjà (même identifiant EPxx / US-xxx) est conservé.

    python3 scripts/github/importer_backlog.py --dry-run
    python3 scripts/github/importer_backlog.py --repo Konwoo-tech/optiboul
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
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
BACKLOG = RACINE / "docs/specifications/OptiBoul_ERP_Backlog_produit.md"
LIEN_BACKLOG = "docs/specifications/OptiBoul_ERP_Backlog_produit.md"

DEFINITION_TERMINE = [
    "Code relu, tests unitaires du domaine et tests d'API au vert",
    "Parcours Playwright mis à jour si le récit touche le comptoir",
    "Droits vérifiés côté serveur pour chaque profil ; action tracée dans le journal",
    "Textes FR et EN",
    "Fonctionne hors ligne (sauf envois mis en file) ; migration réversible ; OpenAPI à jour",
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
        objet = (m.group(1) if m else self.texte).strip().rstrip(".")
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

    @property
    def titre(self) -> str:
        return f"Sprint {self.id}"


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


def corps_epopee(epopee: Epopee, numeros: dict[str, int] | None = None) -> str:
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
        lien = f"#{numeros[r.id]}" if numeros and r.id in numeros else r.id
        lignes.append(f"- [ ] {lien} · {r.priorite} · {r.points} pts · {r.sprint or 'hors plan'}")
    lignes += ["", f"Source : [backlog produit]({LIEN_BACKLOG})"]
    return "\n".join(lignes)


def corps_recit(recit: Recit, epopee: Epopee, numero_epopee: int | None) -> str:
    lien_epopee = f"#{numero_epopee}" if numero_epopee else epopee.id
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
        *([f"- [ ] {c}" for c in recit.criteres] or ["- [ ] À préciser avant l'entrée en sprint (définition de « prêt »)"]),
        "",
        "## Définition de « terminé »",
        "",
        *[f"- [ ] {d}" for d in DEFINITION_TERMINE],
        "",
        f"Source : [backlog produit]({LIEN_BACKLOG})",
    ]
    return "\n".join(lignes)


def importer(gh: GitHub, epopees: list[Epopee], sprints: list[Sprint]) -> None:
    print("Étiquettes…")
    etiquettes = dict(ETIQUETTES)
    for e in epopees:
        etiquettes[etiquette_epopee(e)] = ("8B5E3C", e.nom[:100])
    for pts in sorted({r.points for e in epopees for r in e.recits}):
        etiquettes[f"points:{pts}"] = ("FFF4DC", "Complexité relative")
    existantes = {e["name"] for e in gh.depot_api("labels?per_page=100")}  # type: ignore[union-attr]
    for nom, (couleur, description) in etiquettes.items():
        if nom not in existantes:
            gh.depot_api("labels", "POST", {"name": nom, "color": couleur, "description": description})

    print("Jalons (sprints)…")
    jalons = {m["title"]: m["number"] for m in gh.depot_api("milestones?state=all&per_page=100")}  # type: ignore[union-attr]
    for s in sprints:
        if s.titre not in jalons:
            description = f"Lot {s.lot} · {s.points} points · {s.objectif}"
            jalons[s.titre] = gh.depot_api("milestones", "POST", {"title": s.titre, "description": description})["number"]  # type: ignore[index]

    issues = gh.depot_api("issues?state=all&per_page=100")
    par_cle: dict[str, dict] = {}
    for issue in issues:  # type: ignore[union-attr]
        if "pull_request" not in issue and (m := re.match(r"^(EP\d{2}|US-\d{3}) · ", issue["title"])):
            par_cle[m.group(1)] = issue

    def creer(cle: str, donnees: dict) -> dict:
        if cle in par_cle:
            print(f"  = {cle} existe (#{par_cle[cle]['number']})")
            return par_cle[cle]
        issue = gh.depot_api("issues", "POST", donnees)
        par_cle[cle] = issue  # type: ignore[assignment]
        print(f"  + {cle} → #{issue['number']}")  # type: ignore[index]
        time.sleep(1)  # limite secondaire de GitHub sur la création de contenu
        return issue  # type: ignore[return-value]

    print("Épopées…")
    for e in epopees:
        creer(e.id, {"title": e.titre, "body": corps_epopee(e), "labels": ["type:épopée", etiquette_epopee(e), f"lot:{e.lot.split(' ')[0]}"]})

    print("Récits…")
    for e in epopees:
        numero_epopee = par_cle[e.id]["number"]
        for r in e.recits:
            donnees = {
                "title": r.titre,
                "body": corps_recit(r, e, numero_epopee),
                "labels": ["type:récit", etiquette_epopee(e), f"prio:{r.priorite.lower()}", f"lot:{r.lot}", f"points:{r.points}"],
            }
            if r.sprint:
                donnees["milestone"] = jalons[f"Sprint {r.sprint}"]
            creer(r.id, donnees)

    print("Rattachement des récits aux épopées…")
    for e in epopees:
        epopee = par_cle[e.id]
        deja = {i["id"] for i in gh.depot_api(f"issues/{epopee['number']}/sub_issues?per_page=100")}  # type: ignore[union-attr]
        for r in e.recits:
            if par_cle[r.id]["id"] not in deja:
                gh.depot_api(f"issues/{epopee['number']}/sub_issues", "POST", {"sub_issue_id": par_cle[r.id]["id"]})
        numeros = {r.id: par_cle[r.id]["number"] for r in e.recits}
        gh.depot_api(f"issues/{epopee['number']}", "PATCH", {"body": corps_epopee(e, numeros)})
        print(f"  {e.id} : {len(e.recits)} récits")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", default="Konwoo-tech/optiboul")
    parser.add_argument("--dry-run", action="store_true", help="analyse le backlog sans rien créer")
    args = parser.parse_args()

    epopees, sprints = lire_backlog(BACKLOG)
    recits = [r for e in epopees for r in e.recits]
    print(
        f"{len(epopees)} épopées, {len(recits)} récits, {sum(r.points for r in recits)} points, "
        f"{len(sprints)} sprints ({sum(1 for r in recits if r.sprint)} récits planifiés)",
    )
    if args.dry_run:
        for e in epopees:
            print(f"\n{e.titre} (lot {e.lot})")
            for r in e.recits:
                print(f"  {r.titre}  [{r.priorite}, {r.points} pts, {r.sprint or '—'}]")
        return 0
    importer(GitHub(args.repo), epopees, sprints)
    return 0


if __name__ == "__main__":
    sys.exit(main())
