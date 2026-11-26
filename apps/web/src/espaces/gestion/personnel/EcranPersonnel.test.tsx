import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErreurApi } from '@/api';

import { ECRANS } from '../../../navigation.ts';
import EcranPersonnel from './EcranPersonnel.tsx';
import { DEPART, SOUMIS, VALIDE } from './instantanes.test-donnees.ts';
import { calculerPaie } from './regles.ts';
import type { InstantanePaie, ModePaiement } from './types.ts';

/*
 * L'écran Personnel et paie rendu depuis des instantanés au format de l'écran ; la composition de
 * l'instantané à partir des routes du serveur est testée dans reel.test.tsx. Les actions (lignes,
 * jour, soumission, décision, paiements) appellent un faux serveur au format de l'API réelle, dont
 * les réponses font évoluer l'état. La personne connectée vient de `users/me/`.
 */

const lecture = vi.hoisted(() => ({ lirePersonnelReel: vi.fn() }));
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

/** L'état de paie côté « serveur », et la personne connectée. */
let etat: InstantanePaie;
let connecte: keyof typeof PERSONNES;
let appels: string[];
let ajouts: number;
let depenses: number;
let caisseFermee: boolean;

beforeEach(() => {
  appels = [];
  ajouts = 0;
  depenses = 0;
  caisseFermee = false;
  lecture.lirePersonnelReel.mockReset();
  lecture.lirePersonnelReel.mockImplementation(async () => {
    if (connecte === 'davy') {
      throw new ErreurApi(403, { detail: 'Refusé.', code: 'droit_insuffisant' });
    }
    return structuredClone(etat);
  });
});

const employeDe = (id: string | readonly string[] | undefined) =>
  etat.employes.find((e) => e.id === String(id))!;

/** Le reste d'un employé selon l'écran : ce que le serveur lui fait payer. */
const resteDe = (id: string) => calculerPaie(employeDe(id)).reste;

function payer(id: string, montant: number, mode: ModePaiement, reference?: string) {
  employeDe(id).paiements.push({
    montant,
    mode,
    ...(reference ? { reference } : {}),
    date: '2026-10-14',
    par: PERSONNES[connecte].nom,
  });
  depenses += 1;
  etat.statut = etat.employes.every((e) => calculerPaie(e).reste <= 0) ? 'payee' : 'en-paiement';
}

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
    http.post('*/api/v1/paies/lignes/:id/elements/', async ({ params, request }) => {
      const corps = (await request.json()) as {
        genre: 'gain' | 'penalite';
        description: string;
        montant: number;
      };
      ajouts += 1;
      employeDe(params.id).ajustements.push({
        id: String(900 + ajouts),
        type: corps.genre,
        libelle: corps.description,
        montant: corps.montant,
        date: '2026-10-14',
        par: PERSONNES[connecte].nom,
      });
      return HttpResponse.json({}, { status: 201 });
    }),
    http.delete('*/api/v1/paies/elements/:id/', ({ params }) => {
      for (const e of etat.employes) {
        e.ajustements = e.ajustements.filter((a) => a.id !== String(params.id));
      }
      return new HttpResponse(null, { status: 204 });
    }),
    http.put('*/api/v1/paies/elements/:id/', async ({ params, request }) => {
      const corps = (await request.json()) as { description: string; montant: number };
      for (const e of etat.employes) {
        for (const a of e.ajustements) {
          if (a.id === String(params.id)) {
            a.libelle = corps.description;
            a.montant = corps.montant;
          }
        }
      }
      return HttpResponse.json({});
    }),
    http.put('*/api/v1/paies/:id/jour/', async ({ request }) => {
      etat.jourDePaie = ((await request.json()) as { jour: string }).jour;
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/paies/:id/soumettre/', () => {
      appels.push('soumettre');
      etat.statut = 'soumis';
      etat.soumisPar = PERSONNES[connecte].nom;
      etat.demande = { id: '22', numero: 22 };
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/demandes/:id/accorder/', () => {
      appels.push('accorder');
      if (etat.statut !== 'soumis') {
        return HttpResponse.json(
          { detail: 'Cette demande est déjà décidée.', code: 'demande_deja_decidee' },
          { status: 409 },
        );
      }
      etat.statut = 'valide';
      etat.validePar = PERSONNES[connecte].nom;
      etat.valideA = '17:02';
      etat.demande = null;
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/demandes/:id/refuser/', () => {
      appels.push('refuser');
      etat.statut = 'brouillon';
      etat.demande = null;
      return HttpResponse.json({});
    }),
    http.post('*/api/v1/paies/lignes/:id/payer/', async ({ params, request }) => {
      appels.push('payer');
      const corps = (await request.json()) as {
        montant: number;
        mode: ModePaiement;
        reference?: string;
      };
      if (caisseFermee && corps.mode === 'especes') {
        return HttpResponse.json(
          {
            detail: 'Aucune caisse ouverte : ouvrez la session avant de payer en espèces.',
            code: 'aucune_caisse_ouverte',
          },
          { status: 409 },
        );
      }
      payer(String(params.id), corps.montant, corps.mode, corps.reference);
      return HttpResponse.json({ depense: depenses });
    }),
    http.post('*/api/v1/paies/:id/payer-tout/', async ({ request }) => {
      appels.push('payer-tout');
      const corps = (await request.json()) as { mode: ModePaiement; reference?: string };
      const aPayer = etat.employes.filter((e) => calculerPaie(e).reste > 0);
      for (const e of aPayer) payer(e.id, calculerPaie(e).reste, corps.mode, corps.reference);
      return HttpResponse.json({ payes: aPayer.length });
    }),
  );
}

async function ouvrir(
  utilisateur: keyof typeof PERSONNES = 'willy',
  langue: 'fr' | 'en' = 'fr',
  depart: InstantanePaie = DEPART,
) {
  connecte = utilisateur;
  etat = structuredClone(depart);
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
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
  if (utilisateur === 'davy') return;
  await screen.findByRole('heading', {
    name: /État de paie · Octobre 2026|Payroll · October 2026/,
  });
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
});

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

  it('corrige le libellé et le montant d’une ligne', async () => {
    await ouvrir();
    fireEvent.click(ligne('Rachel'));
    await screen.findByRole('heading', { name: 'Rachel', level: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Pénalité' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retard' } });
    fireEvent.change(screen.getByLabelText('Montant (FCFA)'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la ligne' }));
    await screen.findByText('Retard');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la ligne « Retard »' }));
    const fenetre = within(screen.getByRole('dialog'));
    fireEvent.change(fenetre.getByLabelText('Montant (FCFA)'), { target: { value: '0' } });
    fireEvent.click(fenetre.getByRole('button', { name: 'Enregistrer' }));
    expect(
      await fenetre.findByText('Indiquez un libellé et un montant entier supérieur à 0.'),
    ).toBeTruthy();
    fireEvent.change(fenetre.getByLabelText('Libellé'), { target: { value: 'Grand retard' } });
    fireEvent.change(fenetre.getByLabelText('Montant (FCFA)'), { target: { value: '2000' } });
    fireEvent.click(fenetre.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Grand retard')).toBeTruthy();
    expect(screen.getAllByText('−2 000').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('sur le vrai serveur, le gérant saisit absences et avances et télécharge le bulletin', async () => {
    await ouvrir();
    fireEvent.click(ligne('Davy'));
    expect(await screen.findByText('Jours d’absence (0,5 possible)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bulletin de paie (PDF)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ajouter un employé/ })).toBeTruthy();
  });
});

describe('Gestion › Personnel : modifier la fiche d’un employé', () => {
  const AVEC_IDS: InstantanePaie = {
    ...DEPART,
    employes: DEPART.employes.map((e, i) => ({ ...e, employeId: 40 + i })),
  };

  it('le gérant lit la fiche sur le serveur, la modifie, et le serveur reçoit un PATCH', async () => {
    let corps: Record<string, unknown> | undefined;
    serveur.use(
      http.get('*/api/v1/employes/:id/', ({ params }) =>
        HttpResponse.json({
          id: Number(params.id),
          nom: 'Davy',
          poste: 'Caissière',
          telephone: '677000001',
          salaire_base: 90000,
          actif: true,
        }),
      ),
      http.patch('*/api/v1/employes/:id/', async ({ request }) => {
        corps = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    await ouvrir('willy', 'fr', AVEC_IDS);
    fireEvent.click(ligne('Davy'));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la fiche de Davy' }));
    const base = await screen.findByLabelText(/^Salaire de base/);
    expect((base as HTMLInputElement).value).toBe('90000');
    fireEvent.change(base, { target: { value: '95000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Fiche de Davy modifiée')).toBeTruthy();
    expect(corps).toMatchObject({ nom: 'Davy', salaire_base: 95000, actif: true });
  });

  it('le propriétaire ne voit pas le bouton', async () => {
    await ouvrir('fotso', 'fr', AVEC_IDS);
    fireEvent.click(ligne('Davy'));
    await screen.findByText('Jours d’absence (0,5 possible)').catch(() => undefined);
    expect(screen.queryByRole('button', { name: /^Modifier la fiche de/ })).toBeNull();
  });
});

describe('Gestion › Personnel : absences proposées', () => {
  it('propose les jours de caisse non ouverts et les reprend comme absences', async () => {
    serveur.use(
      http.get('*/api/v1/paies/:id/absences-proposees/', () =>
        HttpResponse.json([
          { ligne: 11, employe: 'Davy', jours: ['2026-10-05', '2026-10-07'], saisies: '0.0' },
        ]),
      ),
    );
    await ouvrir('willy', 'fr', {
      ...DEPART,
      etat: 7,
      employes: DEPART.employes.map((e) =>
        e.nom === 'Davy' ? { ...e, id: '11', absences: 0 } : e,
      ),
    });
    fireEvent.click(ligne('Davy'));
    expect(await screen.findByText(/2 jours de caisse prévus et non ouverts/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect((screen.getByLabelText(/^Jours d’absence/) as HTMLInputElement).value).toBe('2');
    expect(screen.queryByText(/jours de caisse prévus/)).toBeNull();
  });
});

describe('Gestion › Personnel : validation par le propriétaire', () => {
  it('le propriétaire voit Valider et Refuser, pas Soumettre', async () => {
    await ouvrir('fotso', 'fr', SOUMIS);
    expect(screen.getByRole('button', { name: 'Valider l’état de paie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Soumettre au propriétaire' })).toBeNull();
  });

  it('le gérant n’a pas de bouton de validation', async () => {
    await ouvrir('willy', 'fr', SOUMIS);
    expect(screen.queryByRole('button', { name: 'Valider l’état de paie' })).toBeNull();
  });

  it('le propriétaire valide : l’état passe à « Validé par M. Fotso · à payer »', async () => {
    await ouvrir('fotso', 'fr', SOUMIS);
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’état de paie' }));
    expect(
      (await screen.findAllByText('Validé par M. Fotso · à payer', { selector: 'span' })).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('Le gérant effectue les paiements une fois l’état validé.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Payer/ })).toBeNull();
    expect(appels).toEqual(['accorder']);
  });

  it('le refus ramène l’état en brouillon', async () => {
    await ouvrir('fotso', 'fr', SOUMIS);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(
      (await screen.findAllByText('Brouillon · préparé par le gérant', { selector: 'span' }))
        .length,
    ).toBeGreaterThan(0);
    expect(appels).toEqual(['refuser']);
  });

  it('une décision refusée par le serveur (déjà tranchée) relit l’état', async () => {
    await ouvrir('fotso', 'fr', SOUMIS);
    // Le propriétaire a décidé ailleurs entre-temps : la même demande n'est plus en attente.
    etat = structuredClone(DEPART);
    fireEvent.click(screen.getByRole('button', { name: 'Valider l’état de paie' }));
    expect(
      (await screen.findAllByText('Brouillon · préparé par le gérant', { selector: 'span' }))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Valider l’état de paie' })).toBeNull();
  });
});

describe('Gestion › Personnel : paiement', () => {
  it('paye partiellement Davy : dépense créée, reste affiché, bouton lié à sa note', async () => {
    await ouvrir('willy', 'fr', VALIDE);
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

  it('un salaire en espèces sans caisse ouverte est refusé avec le message du serveur', async () => {
    caisseFermee = true;
    await ouvrir('willy', 'fr', VALIDE);
    fireEvent.click(ligne('Davy'));
    fireEvent.click(await screen.findByRole('button', { name: 'Payer Davy' }));
    expect(
      await screen.findByText(
        'Aucune caisse ouverte : ouvrez la session avant de payer en espèces.',
      ),
    ).toBeTruthy();
    expect(depenses).toBe(0);
  });

  it('payer tous les restes solde les huit salaires', async () => {
    await ouvrir('willy', 'fr', VALIDE);
    fireEvent.click(screen.getByRole('button', { name: /^Payer tous les restes · 470.885 FCFA$/ }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Payer tous les restes/ })).toBeNull(),
    );
    expect(screen.getAllByText('Payée', { selector: 'span' }).length).toBeGreaterThan(1);
    expect(etat.employes.map((e) => resteDe(e.id))).toEqual(Array(8).fill(0));
  });

  it('un double clic sur Payer n’enregistre qu’un paiement', async () => {
    await ouvrir('willy', 'fr', VALIDE);
    fireEvent.click(ligne('Davy'));
    const bouton = await screen.findByRole('button', { name: 'Payer Davy' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('14 oct. · 52 192 FCFA · Espèces · par Willy');
    expect(appels.filter((a) => a === 'payer')).toHaveLength(1);
    expect(employeDe('12').paiements).toHaveLength(1);
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
    await ouvrir('davy');
    expect(await screen.findByRole('button', { name: /Réessayer/ })).toBeTruthy();
    expect(screen.queryByText('470 885 FCFA')).toBeNull();
  });
});

describe('Gestion › Personnel : mobile money, R7', () => {
  it('exige la référence : erreur liée au champ, effacée à la saisie, rien n’est payé', async () => {
    await ouvrir('willy', 'fr', VALIDE);
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
    expect(appels).toEqual([]);
    fireEvent.change(champ, { target: { value: 'MP240114' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Payer Davy' }));
    expect(
      await screen.findByText('14 oct. · 52 192 FCFA · Mobile money (réf. MP240114) · par Willy'),
    ).toBeTruthy();
  });

  it('payer tous les restes en mobile money sans référence ne paie personne', async () => {
    await ouvrir('willy', 'fr', VALIDE);
    fireEvent.click(screen.getByRole('button', { name: 'Mobile money' }));
    fireEvent.click(screen.getByRole('button', { name: /^Payer tous les restes/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(appels).toEqual([]);
    expect(etat.employes.every((e) => e.paiements.length === 0)).toBe(true);
  });
});
