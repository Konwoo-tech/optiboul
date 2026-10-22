import { jetonCsrf } from '@/api';
import { useTranslation } from '@/i18n';
import { deconnecterSimulation, SIMULATION } from '@/simulation';
import { useQueryClient } from '@tanstack/react-query';

type Props = { libelle?: string; className?: string };

/**
 * Fermeture de la session django-allauth : un POST de formulaire avec le jeton CSRF, comme
 * la page de connexion (même origine). Allauth renvoie ensuite vers l'application.
 * En simulation, il n'y a pas de backend : on referme la session simulée sur place.
 * Le formulaire n'a pas de boîte propre (`display: contents`) : le bouton se place directement
 * dans la mise en page du parent.
 */
export function BoutonDeconnexion({ libelle, className }: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  return (
    <form
      method="post"
      action="/accounts/logout/"
      style={{ display: 'contents' }}
      onSubmit={(evenement) => {
        if (SIMULATION) {
          evenement.preventDefault();
          void deconnecterSimulation().then(() => client.invalidateQueries());
          return;
        }
        // Lu à l'envoi : le cookie peut avoir changé depuis l'affichage.
        const champ = evenement.currentTarget.elements.namedItem('csrfmiddlewaretoken');
        if (champ instanceof HTMLInputElement) champ.value = jetonCsrf() ?? '';
      }}
    >
      <input type="hidden" name="csrfmiddlewaretoken" defaultValue="" />
      <button type="submit" className={className}>
        {libelle ?? t('commun.deconnexion')}
      </button>
    </form>
  );
}
