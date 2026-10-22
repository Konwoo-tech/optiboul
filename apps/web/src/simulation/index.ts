export { SIMULATION } from './actif.ts';
export {
  annulerIdentification,
  deconnecterSimulation,
  envoyerCodeOtp,
  identifier,
  marquerNotificationsLues,
  useContexteSimule,
  useNotificationsSimulees,
  useUtilisateursSimules,
  verifierCodeOtp,
  type Identification,
  type NotificationVue,
  type ReponseIdentification,
} from './api.ts';
export { configurationSimulee, type ModeConnexion } from './configuration.ts';
export {
  CODE_DEMO,
  CODE_OTP_DEMO,
  MOT_DE_PASSE_DEMO,
  type ContexteSimule,
  type UtilisateurSimule,
} from './donnees.ts';
export { ESSAIS_MAX, installerApiSimulee, type Canal, type Via } from './routeur.ts';
