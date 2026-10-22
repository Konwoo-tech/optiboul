import { CODE_DEMO, CODE_OTP_DEMO, MOT_DE_PASSE_DEMO } from './donnees.ts';

type Cle = 'codeDemo' | 'otpDemo' | 'demoIdentifiants';

/**
 * Textes d'aide de la simulation qui citent les codes et mots de passe de démonstration.
 * Ils ne sont pas dans les fichiers de traduction : ceux-ci sont livrés avec le paquet de
 * production, ce module-ci est retiré avec le reste de la simulation.
 */
const TEXTES: Record<'fr' | 'en', Record<Cle, string>> = {
  fr: {
    codeDemo: `Code de démonstration : ${CODE_DEMO} · le clavier fonctionne aussi`,
    otpDemo: `Code de démonstration : ${CODE_OTP_DEMO}`,
    demoIdentifiants: `Mot de passe de tous les profils : ${MOT_DE_PASSE_DEMO} · code de vérification SMS / WhatsApp : ${CODE_OTP_DEMO}`,
  },
  en: {
    codeDemo: `Demo code: ${CODE_DEMO} · the keyboard works too`,
    otpDemo: `Demo code: ${CODE_OTP_DEMO}`,
    demoIdentifiants: `Password for every profile: ${MOT_DE_PASSE_DEMO} · SMS / WhatsApp verification code: ${CODE_OTP_DEMO}`,
  },
};

export function texteDemo(cle: Cle, langue: string): string {
  return TEXTES[langue === 'en' ? 'en' : 'fr'][cle];
}
