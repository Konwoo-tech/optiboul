import type { Scenario } from '../scenario.ts';

import { scenariosCaisses } from './caisses.ts';
import { scenariosCaissier } from './caissier.ts';
import { scenariosClients } from './clients.ts';
import { scenariosConnexion } from './connexion.ts';
import { scenariosDepenses } from './depenses.ts';
import { scenariosDemandes } from './demandes.ts';
import { scenariosFiche, scenariosProduction } from './production.ts';
import { scenariosSession } from './session.ts';
import { scenariosStocks } from './stocks.ts';

/** Tous les scénarios du banc. Pour en ajouter un : l'exporter depuis un fichier ici et l'ajouter à cette liste. */
export const scenarios: Scenario[] = [
  ...scenariosConnexion,
  ...scenariosCaissier,
  ...scenariosClients,
  ...scenariosCaisses,
  ...scenariosSession,
  ...scenariosDepenses,
  ...scenariosDemandes,
  ...scenariosStocks,
  ...scenariosProduction,
  ...scenariosFiche,
];
