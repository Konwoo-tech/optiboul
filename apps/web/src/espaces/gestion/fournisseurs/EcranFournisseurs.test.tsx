import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { installerApiSimulee } from '@/simulation';
import { reinitialiserSimulation, repondre } from '@/simulation/routeur.ts';
import { memoriserUtilisateurConnecte } from '@/simulation/session.ts';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Ces tests jouent l'écran sur le faux serveur ; la lecture du vrai serveur est dans reel.test.tsx.
vi.hoisted(() => vi.stubEnv('MODE', 'simulation'));

import { ECRANS } from '../../../navigation.ts';
import EcranFournisseurs from './EcranFournisseurs.tsx';

let retablir: () => void;
let client: QueryClient;

async function ouvrir(
  utilisateur = 'willy',
  langue: 'fr' | 'en' = 'fr',
  adresse = '',
  latenceMs = 0,
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T17:02:00Z'));
  await initI18n('fr').changeLanguage(langue);
  configurerApi({ baseUrl: 'http://localhost' });
  retablir = installerApiSimulee({ latenceMs });
  reinitialiserSimulation();
  memoriserUtilisateurConnecte(utilisateur);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'fournisseurs')!;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/gestion/fournisseurs${adresse}`]}>
          <EcranFournisseurs ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  await screen.findByRole('tablist');
  await screen.findByText(/Dette fournisseurs|Supplier debt/);
}

afterEach(async () => {
  await initI18n('fr').changeLanguage('fr');
  retablir();
  vi.useRealTimers();
});

const saisir = (champ: HTMLElement, valeur: string) =>
  fireEvent.change(champ, { target: { value: valeur } });
const onglet = (nom: string) => fireEvent.click(screen.getByRole('tab', { name: nom }));
const bouton = (nom: string | RegExp) => screen.getByRole('button', { name: nom });
/** Texte d'un indicateur, espaces insécables normalisés. */
const carte = (libelle: string) =>
  screen.getByText(libelle).parentElement!.textContent!.replace(/[  ]/g, ' ');
const ligneDe = (texte: string) =>
  screen.getByText(new RegExp(`^${texte}`)).closest('li') as HTMLElement;

describe('Gestion › Fournisseurs : réceptions', () => {
  it('affiche les quatre indicateurs, les trois onglets et les bons, les planifiés d’abord', async () => {
    await ouvrir();
    for (const [libelle, valeur] of [
      ['Dette fournisseurs', '2 334 900 FCFA'],
      ['Factures en retard', '2'],
      ['Manquants à livrer', '1'],
      ['Réceptions planifiées', '4'],
    ]) {
      const carte = screen.getByText(libelle!).parentElement!;
      expect(within(carte).getByText(valeur!)).toBeTruthy();
    }
    expect(screen.getAllByRole('tab').map((o) => o.textContent)).toEqual([
      'Réceptions',
      'Fournisseurs',
      'Factures et dettes',
    ]);
    const titres = screen.getAllByText(/^BC-0\d\d · /).map((e) => e.textContent!.slice(0, 6));
    expect(titres).toEqual(['BC-034', 'BC-033', 'BC-035', 'BC-036', 'BC-030', 'BC-031', 'BC-032']);
    const partielle = ligneDe('BC-032');
    expect(within(partielle).getByText('Manquant')).toBeTruthy();
    expect(within(partielle).getByText(/Manque 4 kg/)).toBeTruthy();
    expect(within(partielle).getByRole('button', { name: 'Relancer BC-032' })).toBeTruthy();
    expect(
      within(ligneDe('BC-031')).getByText(/Réceptionnée par Willy · 12 oct\. · 08:10/),
    ).toBeTruthy();
  });

  it('le propriétaire consulte : ni formulaire ni bouton d’action', async () => {
    await ouvrir('fotso');
    expect(screen.queryByText('Planifier une réception')).toBeNull();
    expect(screen.queryByRole('button', { name: /Réceptionner|Relancer|Replanifier/ })).toBeNull();
    onglet('Factures et dettes');
    expect(await screen.findByText(/FAC-41 · /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Payer/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Reçu PDF/ })).toHaveLength(1);
  });

  it('lit l’onglet demandé par l’adresse (alertes du tableau de bord)', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes');
    expect(await screen.findByText(/FAC-0198 · /)).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Factures et dettes' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('un onglet inconnu ouvre les réceptions', async () => {
    await ouvrir('willy', 'fr', '?onglet=autre');
    expect(screen.getByRole('tab', { name: 'Réceptions' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('se navigue aux flèches, Début et Fin ; un seul onglet est sélectionné', async () => {
    await ouvrir();
    const onglets = screen.getAllByRole('tab');
    expect(onglets.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toBeTruthy();
    fireEvent.keyDown(onglets[0]!, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Fournisseurs' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Fournisseurs' }), { key: 'End' });
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Factures et dettes' }).getAttribute('aria-selected'),
      ).toBe('true'),
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Factures et dettes' }), { key: 'Home' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Réceptions' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
  });
});

describe('Gestion › Fournisseurs : planifier', () => {
  it('annonce l’erreur, remet le focus sur la quantité et l’efface à la saisie', async () => {
    await ouvrir();
    fireEvent.click(bouton('Planifier'));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Indiquez une quantité.');
    const champ = screen.getByLabelText('Quantité commandée');
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(document.activeElement).toBe(champ);
    saisir(champ, '12');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(champ.getAttribute('aria-invalid')).toBe('false');
  });

  it('ne garde que les chiffres, la virgule et le point', async () => {
    await ouvrir();
    const champ = screen.getByLabelText('Quantité commandée') as HTMLInputElement;
    saisir(champ, '1a2,5x');
    expect(champ.value).toBe('12,5');
  });

  it('propose les matières du fournisseur choisi', async () => {
    await ouvrir();
    const fournisseur = screen.getByLabelText('Fournisseur') as HTMLSelectElement;
    const matiere = screen.getByLabelText('Matière') as HTMLSelectElement;
    expect([...matiere.options].map((o) => o.text)).toEqual(['Farine (sacs)']);
    saisir(fournisseur, 'f2');
    expect([...matiere.options].map((o) => o.text)).toEqual([
      'Levure (kg)',
      'Sel (kg)',
      'Améliorant (kg)',
    ]);
    expect(matiere.value).toBe('levure');
    const jours = screen.getByLabelText('Date de réception prévue') as HTMLSelectElement;
    expect(jours.options).toHaveLength(8);
    expect(jours.selectedOptions[0]!.text).toBe('jeu. 15 oct.');
  });

  it('planifie une réception : nouvelle ligne, quantité vidée, message', async () => {
    await ouvrir();
    saisir(screen.getByLabelText('Quantité commandée'), '12');
    fireEvent.click(bouton('Planifier'));
    expect(await screen.findByText('Réception planifiée · BC-037')).toBeTruthy();
    expect(within(ligneDe('BC-037')).getByText('Planifiée')).toBeTruthy();
    expect((screen.getByLabelText('Quantité commandée') as HTMLInputElement).value).toBe('');
    expect(carte('Réceptions planifiées')).toContain('5');
  });

  it('verrouille le formulaire pendant l’envoi', async () => {
    await ouvrir('willy', 'fr', '', 40);
    saisir(screen.getByLabelText('Quantité commandée'), '12');
    fireEvent.click(bouton('Planifier'));
    await waitFor(() => expect(bouton('Planifier').getAttribute('aria-disabled')).toBe('true'));
    // Lecture seule et non désactivé : le focus reste dans le formulaire pendant l'envoi.
    expect((screen.getByLabelText('Quantité commandée') as HTMLInputElement).readOnly).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Planifier' }).closest('form')!.getAttribute('aria-busy'),
    ).toBe('true');
    // Un second clic pendant l'envoi ne crée pas un second bon.
    fireEvent.click(bouton('Planifier'));
    await screen.findByText('Réception planifiée · BC-037');
    expect(bouton('Planifier').getAttribute('aria-disabled')).toBe('false');
    expect(screen.queryByText(/BC-038/)).toBeNull();
  });
});

describe('Gestion › Fournisseurs : réceptionner', () => {
  it('ouvre la fenêtre avec le focus dedans et la quantité commandée ; Échap la ferme', async () => {
    await ouvrir();
    const declencheur = bouton('Réceptionner BC-034');
    declencheur.focus();
    fireEvent.click(declencheur);
    const fenetre = await screen.findByRole('dialog');
    expect(within(fenetre).getByRole('heading', { name: 'Réception BC-034' })).toBeTruthy();
    expect(
      within(fenetre).getByText(
        'Mfoundi Levures & Sel · Levure · commandé : 8 kg · prévu le mer. 14 oct.',
      ),
    ).toBeTruthy();
    expect(
      (within(fenetre).getByLabelText('Quantité réellement livrée') as HTMLInputElement).value,
    ).toBe('8');
    expect(fenetre.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(declencheur);
  });

  it('une quantité nulle est refusée : message, champ invalide, focus, fenêtre ouverte', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    const champ = within(fenetre).getByLabelText('Quantité réellement livrée');
    saisir(champ, '0');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
    expect(await screen.findByText('Indiquez la quantité reçue')).toBeTruthy();
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(champ);
    saisir(champ, '3');
    expect(champ.getAttribute('aria-invalid')).toBe('false');
  });

  it('une réception complète met à jour la ligne, la dette et le stock', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    fireEvent.click(await screen.findByRole('button', { name: 'Valider la réception' }));
    expect(await screen.findByText('Réception enregistrée · stock mis à jour')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const ligne = ligneDe('BC-034');
    expect(within(ligne).getByText('Reçue')).toBeTruthy();
    expect(within(ligne).getByText(/Réceptionnée par Willy · 14 oct\./)).toBeTruthy();
    expect(carte('Dette fournisseurs')).toContain('2 374 900 FCFA');
    const reponse = repondre(new URL('http://x/api/v1/simulation/atelier/stocks/'), 'GET', {});
    const stock = (await reponse.json()) as { matieres: Array<{ cle: string; stock: number }> };
    expect(stock.matieres.find((m) => m.cle === 'levure')!.stock).toBe(10.7);
  });

  it('une réception partielle crée un manquant à relancer', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    saisir(within(fenetre).getByLabelText('Quantité réellement livrée'), '5');
    saisir(within(fenetre).getByLabelText('Observation (facultatif)'), 'Carton abîmé');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
    expect(await screen.findByText('Réception partielle · manquant enregistré')).toBeTruthy();
    const ligne = ligneDe('BC-034');
    expect(within(ligne).getByText('Manquant')).toBeTruthy();
    expect(within(ligne).getByText(/Manque 3 kg · 5 kg/)).toBeTruthy();
    expect(within(ligne).getByRole('button', { name: 'Relancer BC-034' })).toBeTruthy();
    expect(carte('Manquants à livrer')).toContain('2');
  });

  it('verrouille les boutons des lignes pendant l’envoi', async () => {
    await ouvrir('willy', 'fr', '', 40);
    fireEvent.click(bouton('Réceptionner BC-034'));
    fireEvent.click(await screen.findByRole('button', { name: 'Valider la réception' }));
    await waitFor(() =>
      expect(bouton('Réceptionner BC-033').getAttribute('aria-disabled')).toBe('true'),
    );
    await screen.findByText('Réception enregistrée · stock mis à jour');
    expect(bouton('Réceptionner BC-033').getAttribute('aria-disabled')).toBe('false');
  });

  it('si le bon a été reçu entre-temps, la liste est relue et l’erreur annoncée', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const bouton2 = await screen.findByRole('button', { name: 'Valider la réception' });
    await act(async () => {
      const r = repondre(
        new URL('http://x/api/v1/simulation/gestion/fournisseurs/receptions/'),
        'POST',
        {
          commande: 'BC-034',
          quantite: 8,
        },
      );
      await r.json();
    });
    fireEvent.click(bouton2);
    expect(
      await screen.findByText('Cette ligne a déjà été traitée. La liste est à jour.'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(within(ligneDe('BC-034')).getByText('Reçue')).toBeTruthy());
  });
});

describe('Gestion › Fournisseurs : manquant', () => {
  it('relancer annonce la relance au fournisseur', async () => {
    await ouvrir();
    fireEvent.click(bouton('Relancer BC-032'));
    expect(await screen.findByText('Relance envoyée à Mfoundi Levures & Sel')).toBeTruthy();
  });

  it('replanifier le reliquat crée un bon pour demain et solde le manquant', async () => {
    await ouvrir();
    fireEvent.click(bouton('Replanifier le reliquat BC-032'));
    expect(await screen.findByText('Reliquat replanifié pour le jeu. 15 oct.')).toBeTruthy();
    expect(within(ligneDe('BC-037')).getByText('Planifiée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Relancer/ })).toBeNull();
    expect(carte('Manquants à livrer')).toContain('0');
  });
});

describe('Gestion › Fournisseurs : fiches', () => {
  it('montre les cinq fournisseurs avec conditions, dette, prochaine réception et manquant', async () => {
    await ouvrir();
    onglet('Fournisseurs');
    const fiches = await screen.findAllByRole('heading', { level: 2 });
    expect(fiches.map((f) => f.textContent)).toEqual([
      'Grands Moulins du Centre',
      'Mfoundi Levures & Sel',
      'Glacière d’Olembé',
      'Bois Nkolondom',
      'Huilerie Mvog-Mbi',
    ]);
    const levure = fiches[1]!.closest('li')!;
    expect(within(levure).getByText('Levure, Sel, Améliorant · +237 6 77 45 12 09')).toBeTruthy();
    expect(within(levure).getByText('Paiement à 7 jours')).toBeTruthy();
    expect(within(levure).getByText('30 000 FCFA')).toBeTruthy();
    expect(within(levure).getByText('mer. 14 oct. · 8 kg')).toBeTruthy();
    expect(within(levure).getByText('4 kg')).toBeTruthy();
    const farine = fiches[0]!.closest('li')!;
    expect(within(farine).getByText('2 264 900 FCFA')).toBeTruthy();
    expect(within(farine).getByText('jeu. 15 oct. · 40 sacs')).toBeTruthy();
  });
});

describe('Gestion › Fournisseurs : factures et dettes', () => {
  it('liste les factures avec leur statut et leur échéance', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    const ligne = (numero: string) => ligneDe(numero);
    expect(within(ligne('FAC-41')).getByText('En retard')).toBeTruthy();
    expect(within(ligne('FAC-41')).getByText(/Échéance : mar\. 13 oct\./)).toBeTruthy();
    expect(within(ligne('FAC-42')).getByText('En cours')).toBeTruthy();
    expect(within(ligne('FAC-42')).getByText(/44 sacs à ce jour/)).toBeTruthy();
    expect(within(ligne('FAC-42')).queryByRole('button')).toBeNull();
    expect(within(ligne('FAC-0213')).getByText('À payer')).toBeTruthy();
    expect(within(ligne('FAC-0213')).getByText(/6 kg reçus sur 10/)).toBeTruthy();
    expect(within(ligne('FAC-40')).getByText('Payée')).toBeTruthy();
    expect(within(ligne('FAC-40')).getByText(/Payée le lun\. 5 oct\. · Banque/)).toBeTruthy();
    fireEvent.click(within(ligne('FAC-40')).getByRole('button', { name: 'Reçu PDF FAC-40' }));
    expect(screen.getByText('Reçu PDF prêt')).toBeTruthy();
  });

  it('paie une facture : mode au choix, dépense créée, facture payée avec son reçu', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    fireEvent.click(bouton('Payer FAC-41'));
    const fenetre = await screen.findByRole('dialog');
    expect(
      within(fenetre).getByText(
        'FAC-41 · Grands Moulins du Centre · Farine · semaine 41 (72 sacs) · 1 405 800 FCFA',
      ),
    ).toBeTruthy();
    const especes = within(fenetre).getByRole('button', { name: 'Espèces' });
    expect(especes.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Mobile money' }));
    expect(especes.getAttribute('aria-pressed')).toBe('false');
    // R7 : le mobile money exige la référence ; l'erreur est sur le champ et s'efface à la saisie.
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Enregistrer le paiement' }));
    const champ = within(fenetre).getByLabelText(/Référence de la transaction/);
    const alerte = within(fenetre).getByRole('alert');
    expect(alerte.textContent).toBe('Indiquez la référence de la transaction mobile money.');
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(document.activeElement).toBe(champ);
    saisir(champ, 'MP241014.K3');
    expect(within(fenetre).queryByRole('alert')).toBeNull();
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Enregistrer le paiement' }));
    expect(await screen.findByText('Paiement enregistré · DEP-0017')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const ligne = ligneDe('FAC-41');
    expect(within(ligne).getByText('Payée')).toBeTruthy();
    expect(within(ligne).getByText(/Payée le mer\. 14 oct\. · Mobile money/)).toBeTruthy();
    expect(within(ligne).getByText(/réf\. MP241014\.K3/)).toBeTruthy();
    expect(within(ligne).getByRole('button', { name: 'Reçu PDF FAC-41' })).toBeTruthy();
    expect(carte('Dette fournisseurs')).toContain('929 100 FCFA');
    expect(carte('Factures en retard')).toContain('1');
  });

  it('verrouille le paiement pendant l’envoi', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes', 40);
    await screen.findByText(/FAC-41 · /);
    fireEvent.click(bouton('Payer FAC-41'));
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() =>
      expect(bouton('Payer FAC-0213').getAttribute('aria-disabled')).toBe('true'),
    );
    await screen.findByText('Paiement enregistré · DEP-0017');
  });
});

describe('Gestion › Fournisseurs : états', () => {
  it('affiche l’erreur de chargement avec un bouton pour réessayer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await initI18n('fr').changeLanguage('fr');
    configurerApi({ baseUrl: 'http://localhost' });
    retablir = installerApiSimulee({ latenceMs: 0 });
    reinitialiserSimulation();
    // Un caissier n'a pas accès : le faux serveur répond 403.
    memoriserUtilisateurConnecte('davy');
    const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'fournisseurs')!;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <OptiboulProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/gestion/fournisseurs']}>
            <EcranFournisseurs ecran={ecran} />
          </MemoryRouter>
        </QueryClientProvider>
      </OptiboulProvider>,
    );
    expect(await screen.findByText(/Les fournisseurs n’ont pas pu être chargés/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeTruthy();
  });

  it('se lit en anglais', async () => {
    await ouvrir('willy', 'en');
    expect(screen.getByText('Supplier debt')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((o) => o.textContent)).toEqual([
      'Deliveries',
      'Suppliers',
      'Invoices & debts',
    ]);
    expect(within(ligneDe('BC-034')).getByText('Planned')).toBeTruthy();
    expect(screen.getAllByText(/Planned by Willy/)).toHaveLength(4);
    expect(within(ligneDe('BC-032')).getByText(/Short 4 kg · 6 kg/)).toBeTruthy();
    onglet('Invoices & debts');
    expect(await screen.findByText(/Flour · week 42 \(44 sacks so far\)/)).toBeTruthy();
    expect(screen.getAllByText(/Due: Tue Oct 13/)).toHaveLength(1);
  });
});
