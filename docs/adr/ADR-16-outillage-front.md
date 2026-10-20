# ADR-16 · Outillage des applications web

**Statut :** acceptée · 20 octobre 2026

| Sujet      | Spécification v2 | Retenu                                   | Raison                                                                                                                                 |
| ---------- | ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Linter     | ESLint           | **oxlint**                               | Gabarit Vite par défaut, bien plus rapide ; la règle `no-restricted-imports` (une application n'importe pas une autre) y est appliquée |
| TypeScript | 5.x              | **7.0**                                  | Versions des gabarits officiels                                                                                                        |
| Node.js    | 22 LTS           | **24 LTS**                               | Node 22 passe en maintenance ; 24 est la LTS active                                                                                    |
| React      | —                | **19.3.0**                               | Version fixée dans `apps/web/package.json`                                                                                             |
| Police     | Manrope          | `@fontsource-variable/manrope` embarquée | Fonctionne hors ligne (R20)                                                                                                            |
