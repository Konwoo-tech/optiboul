import { createTheme, type MantineColorsTuple } from '@mantine/core';

export { COULEURS } from '@optiboul/utils';

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
  colors: { or, chocolat },
  fontFamily: "'Manrope Variable', system-ui, sans-serif",
  headings: { fontFamily: "'Manrope Variable', system-ui, sans-serif" },
  defaultRadius: 'md',
  // Cibles tactiles >= 44 px (parcours UX §5.1).
  components: {
    Button: { defaultProps: { size: 'md' } },
  },
});
