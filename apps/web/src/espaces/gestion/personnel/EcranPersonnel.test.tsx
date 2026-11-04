import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranDemandes from '../../comptoir/demandes/Ecran.tsx';
import EcranPersonnel from './EcranPersonnel.tsx';

// L'écran Demandes ne lit qu'en simulation ; la simulation fait aussi office de serveur ici.
vi.mock('@/simulation', async (original) => ({
  ...(await original<typeof import('@/simulation')>()),
  SIMULATION: true,
}));

let retablir: () => void;

async function ouvrir(
  utilisateur = 'willy',
  langue: 'fr' | 'en' = 'fr',
  avant?: () => Promise<void>,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs: 0 });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte('willy');
  await avant?.();
  memoriserUtilisateurConnecte(utilisateur);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'personnel')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/gestion/personnel']}>
          <EcranPersonnel ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('heading', {
    name: /État de paie · Octobre 2026|Payroll · October 2026/,
  });
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const appel = (chemin: string, methode: string, corps: object = {}) =>
  fetch(`/api/v1/simulation/${chemin}`, { method: methode, body: JSON.stringify(corps) });

/** Le gérant soumet, le propriétaire valide : le paiement est ouvert. */
async function validerLaPaie() {
  await appel('gestion/personnel/soumettre/', 'POST');
  memoriserUtilisateurConnecte('fotso');
  const { demandes } = await (await appel('demandes/', 'GET')).json();
  const demande = demandes.find((d: { type: string }) => d.type === 'paie');
  await appel(`demandes/${demande.id}/decider/`, 'POST', { accord: true });
  memoriserUtilisateurConnecte('willy');
}

const ligne = (prenom: string) => screen.getByRole('button', { name: new RegExp(`^${prenom}`) });

describe('Gestion › Personnel : brouillon', () => {
  it('affiche l’état, les totaux, le tableau, la fiche et le calendrier', async () => {
    await ouvrir();
    expect(
      screen.getAllByText('Brouillon · préparé par le gérant', { selector: 'span' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('470 885 FCFA')).toHaveLength(2);
    expect(screen.getByText('Impayés repris de septembre')).toBeTruthy();
    expect(ligne('Willy').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Calendrier des paies' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Jour de paie de Novembre 2026' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Jour de paie' })).toBeTruthy();
  });

  it('choisir un employé ouvre sa fiche avec le net décomposé', async () => {
    await ouvrir();
    fireEvent.click(ligne('Davy'));
    expect(ligne('Davy').getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'Davy', level: 2 })).toBeTruthy();
    expect(screen.getByText('Absences (1 j × base ÷ 26)')).toBeTruthy();
    expect(screen.getAllByText('52 192 FCFA').length).toBeGreaterThan(0);
    expect(screen.getByText('Prime caisse juste · semaine 41')).toBeTruthy();
    expect(screen.getByText('Gain · 11 oct. · par Patrick')).toBeTruthy();
    expect(
      screen.getByText('Le paiement s’ouvre après validation par le propriétaire.'),
    ).toBeTruthy();
  });

  it('refuse une ligne sans description ou sans montant, et efface l’erreur à la saisie', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la ligne' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Description et montant obligatoires.');
    const description = screen.getByLabelText('Description');
    expect(document.activeElement).toBe(description);
    expect(description.getAttribute('aria-invalid')).toBe('true');
    expect(description.getAttribute('aria-describedby')).toBe(alerte.id);
    fireEvent.change(description, { target: { value: 'Prime' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ajoute une pénalité puis la retire, le focus revient au titre', async () => {
    await ouvrir();
    fireEvent.click(ligne('Rachel'));
    await screen.findByRole('heading', { name: 'Rachel', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Pénalité' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retard' } });
    fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '1500x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la ligne' }));
    expect(await screen.findByText('Retard')).toBeTruthy();
    expect(screen.getAllByText('−1 500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('58 500 FCFA').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la ligne « Retard »' }));
    await waitFor(() => expect(screen.queryByText('Retard')).toBeNull());
    expect(document.activeElement?.textContent).toBe('Gains et pénalités');
    expect(screen.getByText('Aucun gain ni pénalité ce mois-ci.')).toBeTruthy();
  });

  it('le gérant soumet : l’état est verrouillé et la saisie disparaît', async () => {
    await ouvrir();
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre au propriétaire' }));
    expect(
      (await screen.findAllByText('Soumis · en attente du propriétaire', { selector: 'span' }))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Ajouter la ligne' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Soumettre au propriétaire' })).toBeNull();
    expect(
      screen.getByText('Les lignes sont verrouillées une fois l’état de paie soumis.'),
    ).toBeTruthy();
  });

  it('changer le jour de paie met à jour l’état', async () => {
    await ouvrir();
    fireEvent.change(screen.getByRole('combobox', { name: 'Jour de paie' }), {
      target: { value: '2026-10-30' },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole('combobox', { name: 'Jour de paie' }) as HTMLSelectElement).value,
      ).toBe('2026-10-30'),
    );
  });
});

describe('Gestion › Personnel : validation par le propriétaire', () => {
  const soumise = () => appel('gestion/personnel/soumettre/', 'POST').then(() => undefined);

  it('le propriétaire voit Valider et Refuser, pas Soumettre', async () => {
    await ouvrir('fotso', 'fr', soumise);
    expect(screen.getByRole('button', { name: 'Valider l’état de paie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Soumettre au propriétaire' })).toBeNull();
  });

  it('le gérant n’a pas de bouton de validation', async () => {
    await ouvrir('willy', 'fr', soumise);
    expect(screen.queryByRole('button', { name: 'Valider l’état de paie' })).toBeNull();
  });

  it('le propriétaire valide : l’état passe à « Validé par M. Fotso · à payer »', async () => {
    await ouvrir('fotso', 'fr', soumise);
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’état de paie' }));
    expect(
      (await screen.findAllByText('Validé par M. Fotso · à payer', { selector: 'span' })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('Le gérant effectue les paiements une fois l’état validé.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Payer/ })).toBeNull();
  });

  it('le refus ramène l’état en brouillon', async () => {
    await ouvrir('fotso', 'fr', soumise);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(
      (await screen.findAllByText('Brouillon · préparé par le gérant', { selector: 'span' }))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe('Gestion › Personnel : paiement', () => {
  it('paye partiellement Davy : dépense créée, reste affiché, bouton lié à sa note', async () => {
    await ouvrir('willy', 'fr', validerLaPaie);
    fireEvent.click(ligne('Davy'));
    const bouton = await screen.findByRole('button', { name: 'Payer Davy' });
    const note = document.getElementById(bouton.getAttribute('aria-describedby')!)!;
    expect(note.textContent).toContain('Un paiement partiel laisse un impayé reporté');
    const montant = screen.getByRole('textbox', { name: 'Paiement' });
    expect((montant as HTMLInputElement).placeholder).toBe('52192');
    fireEvent.change(montant, { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mobile money' }));
    fireEvent.change(screen.getByLabelText(/Référence de la transaction/), {
      target: { value: 'MP240114' },
    });
    fireEvent.click(bouton);
    expect(
      (await screen.findAllByText('30 000 FCFA', { selector: 'span' })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('14 oct. · 30 000 FCFA · Mobile money (réf. MP240114) · par Willy'),
    ).toBeTruthy();
    expect(screen.getByText('22 192 FCFA')).toBeTruthy();
    expect(screen.getAllByText('Paiement en cours', { selector: 'span' }).length).toBeGreaterThan(
      0,
    );
  });

  it('payer tous les restes solde les huit salaires', async () => {
    await ouvrir('willy', 'fr', validerLaPaie);
    fireEvent.click(screen.getByRole('button', { name: /^Payer tous les restes · 470.885 FCFA$/ }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Payer tous les restes/ })).toBeNull(),
    );
    expect(screen.getAllByText('Payée', { selector: 'span' }).length).toBeGreaterThan(1);
  });

  it('un double clic sur Payer n’enregistre qu’un paiement', async () => {
    await ouvrir('willy', 'fr', validerLaPaie);
    fireEvent.click(ligne('Davy'));
    const bouton = await screen.findByRole('button', { name: 'Payer Davy' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('14 oct. · 52 192 FCFA · Espèces · par Willy');
    const { employes } = await (await appel('gestion/personnel/', 'GET')).json();
    expect(employes.find((e: { id: string }) => e.id === 'davy').paiements).toHaveLength(1);
  });
});

describe('Gestion › Personnel : anglais et erreurs', () => {
  it('traduit l’écran en anglais', async () => {
    await ouvrir('willy', 'en');
    expect(
      screen.getAllByText('Draft · prepared by the manager', { selector: 'span' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Arrears from September')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit to the owner' })).toBeTruthy();
    expect(
      screen.getByText('Net = base − absences − advances − penalties + gains + arrears.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Payroll calendar' })).toBeTruthy();
  });

  it('un profil sans droit voit l’erreur de chargement et peut réessayer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await initI18n('fr').changeLanguage('fr');
    configurerApi({ baseUrl: 'http://localhost' });
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    memoriserUtilisateurConnecte('davy');
    const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'personnel')!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <OptiboulProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <EcranPersonnel ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
    expect(await screen.findByRole('button', { name: /Réessayer/ })).toBeTruthy();
    expect(screen.queryByText('470 885 FCFA')).toBeNull();
  });
});

describe('Gestion › Personnel : mobile money, R7', () => {
  it('exige la référence : erreur liée au champ, effacée à la saisie, rien n’est payé', async () => {
    await ouvrir('willy', 'fr', validerLaPaie);
    fireEvent.click(ligne('Davy'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mobile money' }));
    fireEvent.click(screen.getByRole('button', { name: 'Payer Davy' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe(
      'La référence de la transaction est obligatoire en mobile money.',
    );
    const champ = screen.getByLabelText(/Référence de la transaction/);
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    fireEvent.change(champ, { target: { value: 'MP240114' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Payer Davy' }));
    expect(
      await screen.findByText('14 oct. · 52 192 FCFA · Mobile money (réf. MP240114) · par Willy'),
    ).toBeTruthy();
  });

  it('payer tous les restes en mobile money sans référence ne paie personne', async () => {
    await ouvrir('willy', 'fr', validerLaPaie);
    fireEvent.click(screen.getByRole('button', { name: 'Mobile money' }));
    fireEvent.click(screen.getByRole('button', { name: /^Payer tous les restes/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    const { employes } = await (await appel('gestion/personnel/', 'GET')).json();
    expect(employes.every((e: { paiements: unknown[] }) => e.paiements.length === 0)).toBe(true);
  });
});

describe('Gestion › Personnel : décision depuis Demandes', () => {
  async function ouvrirDemandes(utilisateur: string) {
    memoriserUtilisateurConnecte(utilisateur);
    const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'demandes')!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <OptiboulProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/gestion/demandes']}>
            <EcranDemandes ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
  }

  it('le gérant ne peut pas trancher la demande de paie ; le propriétaire valide, Personnel affiche « Validé »', async () => {
    await ouvrir('willy');
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre au propriétaire' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Soumettre au propriétaire' })).toBeNull(),
    );
    cleanup();

    const gerant = await ouvrirDemandes('willy');
    expect(await screen.findByText('État de paie · Octobre 2026')).toBeTruthy();
    const ligneDePaie = screen.getByText('État de paie · Octobre 2026').closest('li')!;
    expect(within(ligneDePaie).getByText(/À valider par : Propriétaire/)).toBeTruthy();
    expect(within(ligneDePaie).getByText('En attente')).toBeTruthy();
    expect(within(ligneDePaie).queryByRole('button', { name: /^Valider DEM-/ })).toBeNull();
    expect(within(ligneDePaie).queryByRole('button', { name: /^Refuser DEM-/ })).toBeNull();
    gerant.unmount();

    await ouvrirDemandes('fotso');
    const titre = await screen.findByText('État de paie · Octobre 2026');
    const demande = titre.closest('li')!;
    fireEvent.click(within(demande).getByRole('button', { name: /^Valider DEM-/ }));
    expect(await screen.findByText(/Accordée par M\. Fotso/)).toBeTruthy();
    cleanup();

    memoriserUtilisateurConnecte('willy');
    const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'personnel')!;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <OptiboulProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/gestion/personnel']}>
            <EcranPersonnel ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
    expect(
      (await screen.findAllByText('Validé par M. Fotso · à payer', { selector: 'span' })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Payer tous les restes/ })).toBeTruthy();
  });

  it('une décision refusée par le serveur (déjà tranchée) relit l’état', async () => {
    await ouvrir('fotso', 'fr', () =>
      appel('gestion/personnel/soumettre/', 'POST').then(() => undefined),
    );
    // Le propriétaire a décidé ailleurs entre-temps : la même demande n'est plus en attente.
    const { demandes } = await (await appel('demandes/', 'GET')).json();
    const demande = demandes.find((d: { type: string }) => d.type === 'paie');
    await appel(`demandes/${demande.id}/decider/`, 'POST', { accord: false });
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’état de paie' }));
    expect(
      (await screen.findAllByText('Brouillon · préparé par le gérant', { selector: 'span' }))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Valider l’état de paie' })).toBeNull();
  });
});
