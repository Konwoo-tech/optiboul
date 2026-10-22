import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';
import { PALETTE, STATUTS, type NiveauStatut, type SchemaCouleur } from '@/utils';

export { COULEURS } from '@/utils';

const or: MantineColorsTuple = [
  '#fff9e0',
  '#fff0c2',
  '#fde28a',
  '#fbd34d',
  '#f8c621',
  '#F2B705',
  '#d9a300',
  '#b98a00',
  '#977100',
  '#755700',
];

const chocolat: MantineColorsTuple = [
  '#f8efe9',
  '#ead8cc',
  '#d9b9a4',
  '#c6977a',
  '#b07a58',
  '#946143',
  '#784c33',
  '#5A3220',
  '#472719',
  '#331b10',
];

export const themeOptiboul = createTheme({
  primaryColor: 'or',
  primaryShade: 5,
  // Texte sombre sur les boutons or, pas blanc (contraste).
  autoContrast: true,
  luminanceThreshold: 0.4,
  colors: { or, chocolat },
  fontFamily: "'Manrope Variable', system-ui, sans-serif",
  headings: { fontFamily: "'Manrope Variable', system-ui, sans-serif", fontWeight: '800' },
  // Maquette : champs et boutons 12, cartes 16, fenêtres 18.
  radius: { xs: '8px', sm: '10px', md: '12px', lg: '16px', xl: '18px' },
  defaultRadius: 'md',
  components: {
    // Cibles tactiles >= 44 px (parcours UX §5.1) : voir aussi optiboul.css.
    Button: { defaultProps: { size: 'md', fw: 800 } },
    Paper: { defaultProps: { radius: 'lg' } },
    Card: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'xl', padding: 'lg' } },
    Drawer: { defaultProps: { padding: 'lg' } },
  },
});

const NIVEAUX: NiveauStatut[] = ['ok', 'surveiller', 'bloquant', 'neutre'];

function variablesDe(schema: SchemaCouleur) {
  const p = PALETTE[schema];
  const variables: Record<string, string> = {
    // Variables de Mantine : tout composant, y compris le corps de page, suit la palette.
    '--mantine-color-body': p.fond,
    '--mantine-color-text': p.encre,
    '--mantine-color-dimmed': p.discret,
    '--mantine-color-default': p.surface,
    '--mantine-color-default-hover': p.doux,
    '--mantine-color-default-border': p.ligne,
    // Variables propres à OptiBoul, pour les composants qui ne sont pas des composants Mantine.
    '--ob-fond': p.fond,
    '--ob-surface': p.surface,
    '--ob-ligne': p.ligne,
    '--ob-ligne-champ': p.ligneChamp,
    '--ob-discret': p.discret,
    '--ob-doux': p.doux,
    '--ob-hors-cadre': p.horsCadre,
    '--ob-champ': p.champ,
    '--ob-marque': p.marque,
    '--ob-encre': p.encre,
    '--ob-barre': p.barre,
  };
  for (const niveau of NIVEAUX) {
    variables[`--ob-${niveau}-fond`] = STATUTS[schema][niveau].fond;
    variables[`--ob-${niveau}-texte`] = STATUTS[schema][niveau].texte;
  }
  return variables;
}

/** Publie la palette claire et sombre en variables CSS (utilisées par `var(--ob-…)`). */
export const resolveurVariablesOptiboul: CSSVariablesResolver = () => ({
  variables: {},
  light: variablesDe('clair'),
  dark: variablesDe('sombre'),
});
