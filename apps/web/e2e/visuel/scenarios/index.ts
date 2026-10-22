import type { Scenario } from '../scenario.ts';

import { scenariosCaissier } from './caissier.ts';
import { scenariosClients } from './clients.ts';
import { scenariosConnexion } from './connexion.ts';

/** Tous les scénarios du banc. Pour en ajouter un : l'exporter depuis un fichier ici et l'ajouter à cette liste. */
export const scenarios: Scenario[] = [
  ...scenariosConnexion,
  ...scenariosCaissier,
  ...scenariosClients,
];
