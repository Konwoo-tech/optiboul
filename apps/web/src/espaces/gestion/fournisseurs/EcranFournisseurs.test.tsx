import { configurerApi, ErreurApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranFournisseurs from './EcranFournisseurs.tsx';
import {
  DEPART,
  PARTIELLE,
  PAYEE,
  PLANIFIE,
  RECUE,
  REPLANIFIE,
} from './instantanes.test-donnees.ts';
import type { InstantaneFournisseurs } from './types.ts';

/*
 * L'écran Fournisseurs rendu depuis des instantanés au format de l'écran ; la composition de
 * l'instantané à partir des routes du serveur est testée dans reel.test.tsx. Les actions (planifier,
 * réceptionner, relancer, replanifier, payer) appellent un faux serveur au format de l'API réelle,
 * dont les réponses font passer le « serveur » d'un instantané au suivant. La personne connectée
 * vient de `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lireFournisseursReels: vi.fn(), numeroDeCommande: vi.fn() }));
vi.mock('./reel.ts', () => lecture);

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'bypass' });
});
afterAll(() => serveur.close());

const PERSONNES = {
  willy: { id: 3, nom: 'Willy', profil: 'gerant' },
  fotso: { id: 5, nom: 'M. Fotso', profil: 'proprietaire' },
  davy: { id: 1, nom: 'Davy', profil: 'caissier' },
} as const;

/** L'instantané côté « serveur » (au format de l'écran), la personne connectée, les appels reçus. */
let etat: InstantaneFournisseurs;
let connecte: keyof typeof PERSONNES;
let appels: string[];
let latence = 0;

const chiffres = (numero: string) => Number(numero.replace(/\D/g, ''));

/** Ce que lit l'écran : l'instantané, avec les identifiants du serveur que `reel.ts` y ajoute. */
function instantane(): InstantaneFournisseurs {
  const copie = structuredClone(etat);
  for (const c of copie.commandes) {
    c.idServeur = chiffres(c.numero);
    if (c.statut === 'partielle' && !c.reliquat) c.manquant = chiffres(c.numero);
  }
  for (const f of copie.factures) {
    f.idServeur = chiffres(f.numero);
    if (f.statut === 'payee') f.paiement = chiffres(f.numero);
  }
  return copie;
}

beforeEach(() => {
  appels = [];
  latence = 0;
  lecture.lireFournisseursReels.mockReset();
  lecture.lireFournisseursReels.mockImplementation(async () => {
    if (connecte === 'davy') {
      throw new ErreurApi(403, { detail: 'Refusé.', code: 'droit_insuffisant' });
    }
    return instantane();
  });
  lecture.numeroDeCommande.mockImplementation((id: number) => `BC-${String(id).padStart(3, '0')}`);
});

const dejaTraitee = (code: string) =>
  HttpResponse.json({ detail: 'Déjà traité.', code }, { status: 409 });

function installerServeur() {
  serveur.use(
    http.get('*/api/v1/users/me/', () => {
      const p = PERSONNES[connecte];
      return HttpResponse.json({
        id: p.id,
        name: p.nom,
        email: 'x@optiboul.local',
        url: `http://localhost/api/v1/users/${p.id}/`,
        profil: p.profil,
      });
    }),
    http.post('*/api/v1/receptions-planifiees/', async () => {
      appels.push('planifier');
      await delay(latence);
      etat = structuredClone(PLANIFIE);
      return HttpResponse.json({ id: 37 }, { status: 201 });
    }),
    http.post('*/api/v1/receptions-planifiees/:id/receptionner/', async ({ params, request }) => {
      const corps = (await request.json()) as { quantite: string };
      appels.push(`receptionner ${params.id} ${JSON.stringify(corps)}`);
      await delay(latence);
      const commande = etat.commandes.find((c) => chiffres(c.numero) === Number(params.id));
      if (commande?.statut !== 'planifiee') return dejaTraitee('commande_deja_recue');
      const partielle = corps.quantite !== '8000';
      etat = structuredClone(partielle ? PARTIELLE : RECUE);
      return HttpResponse.json({ ecart: partielle ? '-3000' : '0' });
    }),
    http.post('*/api/v1/manquants/:id/relancer/', () => {
      appels.push('relancer');
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/manquants/:id/replanifier/', async ({ request }) => {
      appels.push(`replanifier ${JSON.stringify(await request.json())}`);
      etat = structuredClone(REPLANIFIE);
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/factures/:id/payer/', async ({ params, request }) => {
      appels.push(`payer ${params.id} ${JSON.stringify(await request.json())}`);
      await delay(latence);
      const facture = etat.factures.find((f) => chiffres(f.numero) === Number(params.id));
      if (facture?.statut === 'payee') return dejaTraitee('facture_non_payable');
      etat = structuredClone(PAYEE);
      return HttpResponse.json({ depense: 17 });
    }),
  );
}

async function ouvrir(
  utilisateur: keyof typeof PERSONNES = 'willy',
  langue: 'fr' | 'en' = 'fr',
  adresse = '',
  delaiMs = 0,
) {
  connecte = utilisateur;
  latence = delaiMs;
  etat = structuredClone(DEPART);
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'fournisseurs')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/gestion/fournisseurs${adresse}`]}>
          <EcranFournisseurs ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
  if (utilisateur === 'davy') return;
  await screen.findByRole('tablist');
  await screen.findByText(/Dette fournisseurs|Supplier debt/);
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  vi.restoreAllMocks();
  await initI18n('fr').changeLanguage('fr');
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
    expect(within(partielle).getByText(/Manque 4000 g/)).toBeTruthy();
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
    expect([...matiere.options].map((o) => o.text)).toEqual(['Farine (kg)']);
    saisir(fournisseur, '2');
    expect([...matiere.options].map((o) => o.text)).toEqual([
      'Levure (g)',
      'Sel (g)',
      'Améliorant (g)',
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
    expect(appels).toEqual(['planifier']);
  });

  it('verrouille le formulaire pendant l’envoi', async () => {
    await ouvrir('willy', 'fr', '', 80);
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
    expect(appels).toEqual(['planifier']);
  });
});

/** Sur le vrai serveur, le prix unitaire de la livraison est demandé (sauf pour la farine). */
const validerAvecPrix = (fenetre: HTMLElement) => {
  saisir(within(fenetre).getByLabelText(/Prix unitaire/), '2');
  fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
};

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
        /Mfoundi Levures & Sel · Levure · commandé : 8000 g · prévu le mer\. 14 oct\./,
      ),
    ).toBeTruthy();
    expect(
      (within(fenetre).getByLabelText('Quantité réellement livrée') as HTMLInputElement).value,
    ).toBe('8000');
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

  it('exige le prix unitaire pour la levure, pas pour la farine', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
    expect((await within(fenetre).findByRole('alert')).textContent).toMatch(/prix/i);
    expect(appels).toEqual([]);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(bouton('Réceptionner BC-033'));
    const farine = await screen.findByRole('dialog');
    expect(within(farine).queryByLabelText(/Prix unitaire/)).toBeNull();
  });

  it('une réception complète met à jour la ligne et la dette', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    validerAvecPrix(await screen.findByRole('dialog'));
    expect(await screen.findByText('Réception enregistrée · stock mis à jour')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const ligne = ligneDe('BC-034');
    expect(within(ligne).getByText('Reçue')).toBeTruthy();
    expect(within(ligne).getByText(/Réceptionnée par Willy · 14 oct\./)).toBeTruthy();
    expect(carte('Dette fournisseurs')).toContain('2 374 900 FCFA');
    expect(appels).toEqual(['receptionner 34 {"quantite":"8000","prix_unitaire":2}']);
  });

  it('une réception partielle crée un manquant à relancer', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    saisir(within(fenetre).getByLabelText('Quantité réellement livrée'), '5000');
    saisir(within(fenetre).getByLabelText('Observation (facultatif)'), 'Carton abîmé');
    validerAvecPrix(fenetre);
    expect(await screen.findByText('Réception partielle · manquant enregistré')).toBeTruthy();
    const ligne = ligneDe('BC-034');
    expect(within(ligne).getByText('Manquant')).toBeTruthy();
    expect(within(ligne).getByText(/Manque 3000 g · 5000 g/)).toBeTruthy();
    expect(within(ligne).getByRole('button', { name: 'Relancer BC-034' })).toBeTruthy();
    expect(carte('Manquants à livrer')).toContain('2');
    expect(appels[0]).toContain('"observation":"Carton abîmé"');
  });

  it('verrouille les boutons des lignes pendant l’envoi', async () => {
    await ouvrir('willy', 'fr', '', 80);
    fireEvent.click(bouton('Réceptionner BC-034'));
    validerAvecPrix(await screen.findByRole('dialog'));
    await waitFor(() =>
      expect(bouton('Réceptionner BC-033').getAttribute('aria-disabled')).toBe('true'),
    );
    await screen.findByText('Réception enregistrée · stock mis à jour');
    expect(bouton('Réceptionner BC-033').getAttribute('aria-disabled')).toBe('false');
  });

  it('si le bon a été reçu entre-temps, la liste est relue et l’erreur annoncée', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    saisir(within(fenetre).getByLabelText(/Prix unitaire/), '2');
    // Une autre personne a réceptionné le bon entre-temps.
    etat = structuredClone(RECUE);
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
    expect(
      await screen.findByText('Cette ligne a déjà été traitée. La liste est à jour.'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(within(ligneDe('BC-034')).getByText('Reçue')).toBeTruthy());
  });
});

describe('Gestion › Fournisseurs : annuler une réception planifiée', () => {
  it('annule un bon planifié : POST, message, liste relue', async () => {
    serveur.use(
      http.post('*/api/v1/receptions-planifiees/:id/annuler/', ({ params }) => {
        appels.push(`annuler ${params.id}`);
        etat = {
          ...etat,
          commandes: etat.commandes.filter((c) => chiffres(c.numero) !== Number(params.id)),
        };
        return HttpResponse.json({});
      }),
    );
    await ouvrir();
    const bon = etat.commandes.find((c) => c.statut === 'planifiee')!;
    fireEvent.click(bouton(`Annuler ${bon.numero}`));
    expect(await screen.findByText(`Bon ${bon.numero} annulé`)).toBeTruthy();
    expect(appels).toEqual([`annuler ${chiffres(bon.numero)}`]);
    expect(screen.queryByRole('button', { name: `Annuler ${bon.numero}` })).toBeNull();
  });

  it('le propriétaire ne voit pas le bouton Annuler', async () => {
    await ouvrir('fotso');
    expect(screen.queryByRole('button', { name: /^Annuler BC-/ })).toBeNull();
  });
});

describe('Gestion › Fournisseurs : manquant', () => {
  it('relancer annonce la relance au fournisseur', async () => {
    await ouvrir();
    fireEvent.click(bouton('Relancer BC-032'));
    expect(await screen.findByText('Relance envoyée à Mfoundi Levures & Sel')).toBeTruthy();
    expect(appels).toEqual(['relancer']);
  });

  it('replanifier le reliquat crée un bon pour demain et solde le manquant', async () => {
    await ouvrir();
    fireEvent.click(bouton('Replanifier le reliquat BC-032'));
    expect(await screen.findByText('Reliquat replanifié pour le jeu. 15 oct.')).toBeTruthy();
    expect(within(ligneDe('BC-037')).getByText('Planifiée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Relancer/ })).toBeNull();
    expect(carte('Manquants à livrer')).toContain('0');
    expect(appels).toEqual(['replanifier {"prevue_le":"2026-10-15"}']);
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
    expect(within(levure).getByText(/mer\. 14 oct\. · 8000 g/)).toBeTruthy();
    expect(within(levure).getByText(/^4000 g$/)).toBeTruthy();
    const farine = fiches[0]!.closest('li')!;
    expect(within(farine).getByText('2 264 900 FCFA')).toBeTruthy();
    expect(within(farine).getByText(/jeu\. 15 oct\. · 2000 kg/)).toBeTruthy();
  });
});

describe('Gestion › Fournisseurs : créer et modifier une fiche', () => {
  it('le propriétaire et la caissière n’ont pas les boutons', async () => {
    await ouvrir('fotso', 'fr', '?onglet=fournisseurs');
    expect(screen.queryByRole('button', { name: 'Nouveau fournisseur' })).toBeNull();
  });

  it('le gérant crée un fournisseur : nom, matières et conditions sont envoyés', async () => {
    let corps: Record<string, unknown> | undefined;
    serveur.use(
      http.post('*/api/v1/fournisseurs/', async ({ request }) => {
        corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 9 }, { status: 201 });
      }),
    );
    await ouvrir('willy', 'fr', '?onglet=fournisseurs');
    fireEvent.click(bouton('Nouveau fournisseur'));
    fireEvent.click(bouton('Créer le fournisseur'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/nom du fournisseur/);
    saisir(screen.getByLabelText('Nom du fournisseur'), ' Huilerie Test ');
    fireEvent.click(bouton('Créer le fournisseur'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/au moins une matière/);
    fireEvent.click(screen.getByLabelText('Huile'));
    saisir(screen.getByLabelText('Conditions de paiement'), 'sept-jours');
    fireEvent.click(bouton('Créer le fournisseur'));
    expect(await screen.findByText('Fournisseur Huilerie Test créé')).toBeTruthy();
    expect(corps).toMatchObject({
      nom: 'Huilerie Test',
      conditions: 'sept_jours',
      matieres: ['huile'],
      actif: true,
    });
  });

  it('le gérant modifie une fiche : la fenêtre reprend les valeurs et envoie un PATCH', async () => {
    let corps: Record<string, unknown> | undefined;
    serveur.use(
      http.patch('*/api/v1/fournisseurs/:id/', async ({ request }) => {
        corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 1 });
      }),
    );
    await ouvrir('willy', 'fr', '?onglet=fournisseurs');
    fireEvent.click(bouton('Modifier Grands Moulins du Centre'));
    expect((screen.getByLabelText('Nom du fournisseur') as HTMLInputElement).value).toBe(
      'Grands Moulins du Centre',
    );
    saisir(screen.getByLabelText('Téléphone'), '677001201');
    fireEvent.click(bouton('Enregistrer'));
    expect(await screen.findByText('Fournisseur Grands Moulins du Centre modifié')).toBeTruthy();
    expect(corps).toMatchObject({ telephone: '677001201', conditions: 'credit_lundi_mardi' });
  });
});

describe('Gestion › Fournisseurs : factures et dettes', () => {
  it('liste les factures avec leur statut et leur échéance', async () => {
    const ouvert = vi.spyOn(window, 'open').mockReturnValue(null);
    await ouvrir('willy', 'fr', '?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    const ligne = (numero: string) => ligneDe(numero);
    expect(within(ligne('FAC-41')).getByText('En retard')).toBeTruthy();
    expect(within(ligne('FAC-41')).getByText(/Échéance : mar\. 13 oct\./)).toBeTruthy();
    expect(within(ligne('FAC-42')).getByText('En cours')).toBeTruthy();
    expect(within(ligne('FAC-42')).getByText(/44 sacs à ce jour/)).toBeTruthy();
    expect(within(ligne('FAC-42')).queryByRole('button')).toBeNull();
    expect(within(ligne('FAC-0213')).getByText('À payer')).toBeTruthy();
    expect(within(ligne('FAC-0213')).getByText(/6000 g reçus sur 10000/)).toBeTruthy();
    expect(within(ligne('FAC-40')).getByText('Payée')).toBeTruthy();
    expect(within(ligne('FAC-40')).getByText(/Payée le lun\. 5 oct\. · Banque/)).toBeTruthy();
    fireEvent.click(within(ligne('FAC-40')).getByRole('button', { name: 'Reçu PDF FAC-40' }));
    // Sur le vrai serveur, le reçu s'ouvre dans un nouvel onglet.
    expect(ouvert).toHaveBeenCalledWith(expect.stringContaining('/recu/'), '_blank', 'noopener');
  });

  it('paie une facture : mode au choix, dépense créée, facture payée avec son reçu', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    fireEvent.click(bouton('Payer FAC-41'));
    const fenetre = await screen.findByRole('dialog');
    expect(
      within(fenetre).getByText(
        /FAC-41 · Grands Moulins du Centre · Farine · semaine 41 \(72 sacs\) · 1\s405\s800 FCFA/,
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
    expect(await screen.findByText('Paiement enregistré · 17')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const ligne = ligneDe('FAC-41');
    expect(within(ligne).getByText('Payée')).toBeTruthy();
    expect(within(ligne).getByText(/Payée le mer\. 14 oct\. · Mobile money/)).toBeTruthy();
    expect(within(ligne).getByText(/réf\. MP241014\.K3/)).toBeTruthy();
    expect(within(ligne).getByRole('button', { name: 'Reçu PDF FAC-41' })).toBeTruthy();
    expect(carte('Dette fournisseurs')).toContain('929 100 FCFA');
    expect(carte('Factures en retard')).toContain('1');
    expect(appels).toEqual([
      'payer 41 {"montant":1405800,"mode":"mobile","reference":"MP241014.K3"}',
    ]);
  });

  it('verrouille le paiement pendant l’envoi', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes', 80);
    await screen.findByText(/FAC-41 · /);
    fireEvent.click(bouton('Payer FAC-41'));
    fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le paiement' }));
    await waitFor(() =>
      expect(bouton('Payer FAC-0213').getAttribute('aria-disabled')).toBe('true'),
    );
    await screen.findByText('Paiement enregistré · 17');
  });
});

describe('Gestion › Fournisseurs : états', () => {
  it('affiche l’erreur de chargement avec un bouton pour réessayer', async () => {
    // Un caissier n'a pas accès : le serveur répond 403.
    await ouvrir('davy');
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
    expect(within(ligneDe('BC-032')).getByText(/Short 4000 g · 6000 g/)).toBeTruthy();
    onglet('Invoices & debts');
    expect(await screen.findByText(/Flour · week 42 \(44 sacks so far\)/)).toBeTruthy();
    expect(screen.getAllByText(/Due: Tue Oct 13/)).toHaveLength(1);
  });
});

describe('Gestion › Fournisseurs : fenêtres et liste périmée', () => {
  it('une quantité énorme garde la fenêtre ouverte, la saisie et l’erreur sur le champ', async () => {
    await ouvrir();
    fireEvent.click(bouton('Réceptionner BC-034'));
    const fenetre = await screen.findByRole('dialog');
    const champ = within(fenetre).getByLabelText('Quantité réellement livrée') as HTMLInputElement;
    saisir(champ, '9999999');
    saisir(within(fenetre).getByLabelText(/Prix unitaire/), '2');
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Valider la réception' }));
    const alerte = await within(fenetre).findByRole('alert');
    expect(alerte.textContent).toMatch(/^Quantité trop élevée \(maximum 1\s000\s000\)\.$/);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(champ.value).toBe('9999999');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(document.activeElement).toBe(champ);
    saisir(champ, '8000');
    expect(within(fenetre).queryByRole('alert')).toBeNull();
    expect(appels).toEqual([]);
  });

  it('la planification refuse une quantité énorme sans envoyer', async () => {
    await ouvrir();
    saisir(screen.getByLabelText('Quantité commandée'), '2000000');
    fireEvent.click(bouton('Planifier'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Quantité trop élevée \(maximum 1\s000\s000\)\.$/,
    );
    expect(screen.queryByText(/Réception planifiée/)).toBeNull();
    expect(appels).toEqual([]);
  });

  it('le focus revient sur le bouton d’origine quand la fenêtre de paiement se ferme', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    const declencheur = bouton('Payer FAC-41');
    declencheur.focus();
    fireEvent.click(declencheur);
    const fenetre = await screen.findByRole('dialog');
    expect(fenetre.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(fenetre).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(declencheur);
  });

  it('si la facture a été payée entre-temps, la fenêtre se ferme, la liste est relue et l’erreur annoncée', async () => {
    await ouvrir('willy', 'fr', '?onglet=dettes');
    await screen.findByText(/FAC-41 · /);
    fireEvent.click(bouton('Payer FAC-41'));
    const valider = await screen.findByRole('button', { name: 'Enregistrer le paiement' });
    // Une autre personne a payé la facture entre-temps.
    etat = structuredClone(PAYEE);
    fireEvent.click(valider);
    expect(
      await screen.findByText('Cette ligne a déjà été traitée. La liste est à jour.'),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(within(screen.getByText(/^FAC-41 · /).closest('li')!).getByText('Payée')).toBeTruthy(),
    );
  });

  it('le panneau d’un onglet est atteignable au clavier', async () => {
    await ouvrir();
    expect(screen.getByRole('tabpanel').getAttribute('tabindex')).toBe('0');
  });
});
