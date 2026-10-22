import { Button } from '@mantine/core';
import { jetonCsrf } from '@/api';
import { useTranslation } from '@/i18n';

type Props = { libelle?: string; pleineLargeur?: boolean };

/**
 * Fermeture de la session django-allauth : un POST de formulaire avec le jeton CSRF, comme
 * la page de connexion (même origine). Allauth renvoie ensuite vers l'application.
 */
export function BoutonDeconnexion({ libelle, pleineLargeur = false }: Props) {
  const { t } = useTranslation();
  return (
    <form
      method="post"
      action="/accounts/logout/"
      onSubmit={(evenement) => {
        // Lu à l'envoi : le cookie peut avoir changé depuis l'affichage.
        const champ = evenement.currentTarget.elements.namedItem('csrfmiddlewaretoken');
        if (champ instanceof HTMLInputElement) champ.value = jetonCsrf() ?? '';
      }}
    >
      <input type="hidden" name="csrfmiddlewaretoken" defaultValue="" />
      <Button
        type="submit"
        size="compact-sm"
        variant="outline"
        color="gray.0"
        fullWidth={pleineLargeur}
      >
        {libelle ?? t('commun.deconnexion')}
      </Button>
    </form>
  );
}
