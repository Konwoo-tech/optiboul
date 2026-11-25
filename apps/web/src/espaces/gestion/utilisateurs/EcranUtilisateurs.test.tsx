import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranUtilisateurs from './EcranUtilisateurs.tsx';

/*
 * L'écran Utilisateurs sur un faux serveur au format de l'API réelle : comptes (`utilisateurs/`),
 * groupes (`groupes/`), création, changement de groupe, code, activation, avec les droits et les
 * refus du serveur.
 */

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => serveur.close());

type CompteServeur = {
  id: number;
  name: string;
  email: string;
  groupe: number;
  profil: string;
  telephone: string;
  canal: 'sms' | 'whatsapp';
  dernier_acces: string | null;
  is_active: boolean;
  bloque: boolean;
  bloque_jusqua: string | null;
};
type GroupeServeur = {
  id: number;
  nom: string;
  profil: string;
  description: string;
  membres: number;
};

const compte = (
  id: number,
  name: string,
  profil: string,
  groupe: number,
  courriel: string,
  telephone: string,
  acces: string,
): CompteServeur => ({
  id,
  name,
  email: `${courriel}@gmail.com`,
  groupe,
  profil,
  telephone,
  canal: 'whatsapp',
  dernier_acces: acces,
  is_active: true,
  bloque: false,
  bloque_jusqua: null,
});

const COMPTES = (): CompteServeur[] => [
  compte(1, 'Davy', 'caissier', 1, 'davy.boulfaubourg', '+237677412018', '2026-10-14T18:02:00'),
  compte(2, 'Rachel', 'caissier', 2, 'rachel.boulfaubourg', '+237699528703', '2026-10-14T06:01:00'),
  compte(3, 'Willy', 'gerant', 3, 'willy.boulfaubourg', '+237655186490', '2026-10-14T17:40:00'),
  compte(4, 'Serge', 'production', 4, 'serge.boulfaubourg', '+237670332571', '2026-10-14T17:55:00'),
  compte(
    5,
    'M. Fotso',
    'proprietaire',
    5,
    'fotso.boulfaubourg',
    '+237694601145',
    '2026-10-13T22:10:00',
  ),
  compte(
    6,
    'Support OptiBoul',
    'administrateur',
    6,
    'support.optiboul',
    '+237658720936',
    '2026-10-10T09:30:00',
  ),
  compte(7, 'Patrick', 'gerant', 3, 'patrick.boulfaubourg', '+237677901452', '2026-10-11T21:40:00'),
  compte(
    8,
    'Christelle',
    'gerant',
    3,
    'christelle.boulfaubourg',
    '+237699316827',
    '2026-10-04T18:10:00',
  ),
  compte(
    9,
    'Ignace',
    'production',
    4,
    'ignace.boulfaubourg',
    '+237655840319',
    '2026-10-13T19:02:00',
  ),
];

const GROUPES = (): GroupeServeur[] => [
  {
    id: 1,
    nom: 'Caisse – équipe de nuit',
    profil: 'caissier',
    description: 'Livraisons.',
    membres: 0,
  },
  {
    id: 2,
    nom: 'Caisse – équipe de jour',
    profil: 'caissier',
    description: 'Sessions de jour.',
    membres: 0,
  },
  {
    id: 3,
    nom: 'Gérants de la semaine',
    profil: 'gerant',
    description: 'Gérant en rotation.',
    membres: 0,
  },
  {
    id: 4,
    nom: 'Production',
    profil: 'production',
    description: 'Plan de production.',
    membres: 0,
  },
  { id: 5, nom: 'Direction', profil: 'proprietaire', description: 'Vue complète.', membres: 0 },
  {
    id: 6,
    nom: 'Support informatique',
    profil: 'administrateur',
    description: 'Comptes.',
    membres: 0,
  },
];

let comptes: CompteServeur[];
let groupes: GroupeServeur[];
/** La personne connectée (identifiant du compte). */
let moi: number;
let ecritures: string[];
let lectures: number;

const refus = (statut: number, code: string, detail = 'Refusé.') =>
  HttpResponse.json({ detail, code }, { status: statut });
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
const administrateur = () => comptes.find((c) => c.id === moi)?.profil === 'administrateur';
const droitInsuffisant = () => refus(403, 'droit_insuffisant');

const groupesAvecMembres = () =>
  groupes.map((g) => ({ ...g, membres: comptes.filter((c) => c.groupe === g.id).length }));

function installerServeur() {
  comptes = COMPTES();
  groupes = GROUPES();
  moi = 6;
  ecritures = [];
  lectures = 0;
  serveur.use(
    http.get('*/api/v1/users/me/', () => {
      const c = comptes.find((x) => x.id === moi)!;
      return HttpResponse.json({
        id: c.id,
        name: c.name,
        email: c.email,
        url: `http://localhost/api/v1/users/${c.id}/`,
        profil: c.profil,
      });
    }),
    http.get('*/api/v1/utilisateurs/', () => {
      lectures += 1;
      return administrateur() ? HttpResponse.json(page(comptes)) : droitInsuffisant();
    }),
    http.get('*/api/v1/groupes/', () =>
      administrateur() ? HttpResponse.json(page(groupesAvecMembres())) : droitInsuffisant(),
    ),
    http.post('*/api/v1/utilisateurs/', async ({ request }) => {
      ecritures.push('POST');
      if (!administrateur()) return droitInsuffisant();
      const corps = (await request.json()) as {
        nom: string;
        email: string;
        telephone: string;
        groupe: number;
        canal: 'sms' | 'whatsapp';
      };
      if (comptes.some((c) => c.email.toLowerCase() === corps.email.toLowerCase())) {
        return HttpResponse.json(
          { email: ['Cette adresse Gmail a déjà un compte.'] },
          { status: 400 },
        );
      }
      const groupe = groupes.find((g) => g.id === corps.groupe)!;
      const cree = {
        ...compte(
          comptes.length + 1,
          corps.nom,
          groupe.profil,
          groupe.id,
          corps.email.replace('@gmail.com', ''),
          corps.telephone,
          '',
        ),
        canal: corps.canal,
        dernier_acces: null,
      };
      comptes.push(cree);
      return HttpResponse.json(
        { ...cree, codesSecours: ['AAAA-1111', 'BBBB-2222'] },
        { status: 201 },
      );
    }),
    http.post('*/api/v1/utilisateurs/:id/groupe/', async ({ params, request }) => {
      ecritures.push('POST');
      if (!administrateur()) return droitInsuffisant();
      const cible = comptes.find((c) => c.id === Number(params.id));
      if (!cible) return refus(404, 'utilisateur_inconnu');
      if (cible.id === moi) return refus(409, 'compte_propre');
      const { groupe } = (await request.json()) as { groupe: number };
      const g = groupes.find((x) => x.id === groupe)!;
      cible.groupe = g.id;
      cible.profil = g.profil;
      return HttpResponse.json(cible);
    }),
    http.post('*/api/v1/utilisateurs/:id/reinitialiser-code/', ({ params }) => {
      ecritures.push('POST');
      if (!administrateur()) return droitInsuffisant();
      return comptes.some((c) => c.id === Number(params.id))
        ? new HttpResponse(null, { status: 204 })
        : refus(404, 'utilisateur_inconnu');
    }),
    http.post('*/api/v1/utilisateurs/:id/activation/', async ({ params, request }) => {
      ecritures.push('POST');
      if (!administrateur()) return droitInsuffisant();
      const cible = comptes.find((c) => c.id === Number(params.id));
      if (!cible) return refus(404, 'utilisateur_inconnu');
      if (cible.id === moi) return refus(409, 'compte_propre');
      cible.is_active = ((await request.json()) as { actif: boolean }).actif;
      return HttpResponse.json(cible);
    }),
    http.post('*/api/v1/groupes/', async ({ request }) => {
      ecritures.push('POST');
      if (!administrateur()) return droitInsuffisant();
      const corps = (await request.json()) as { nom: string; profil: string; description: string };
      if (groupes.some((g) => g.nom.toLowerCase() === corps.nom.toLowerCase())) {
        return HttpResponse.json({ nom: ['Un groupe porte déjà ce nom.'] }, { status: 400 });
      }
      const cree = { id: groupes.length + 1, ...corps, membres: 0 };
      groupes.push(cree);
      return HttpResponse.json(cree, { status: 201 });
    }),
  );
}

async function ouvrir(
  langue: 'fr' | 'en' = 'fr',
  chemin = '',
  surcharges: Parameters<typeof serveur.use> = [],
  connecte = 6,
) {
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
  moi = connecte;
  serveur.use(...surcharges);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'utilisateurs')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/gestion/utilisateurs${chemin}`]}>
          <EcranUtilisateurs ecran={ecran} />
        </MemoryRouter>
      </QueryClientProvider>
    </OptiboulProvider>,
  );
}

afterEach(async () => {
  cleanup();
  serveur.resetHandlers();
  await initI18n('fr').changeLanguage('fr');
});

const onglet = (nom: RegExp) => screen.getByRole('tab', { name: nom });

describe('Gestion › Utilisateurs : liste', () => {
  it('affiche les onglets, les filtres, les neuf comptes et les droits par profil', async () => {
    await ouvrir();
    expect(await screen.findByRole('tab', { name: 'Utilisateurs · 9' })).toBeTruthy();
    expect(onglet(/Groupes · 6/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tous · 9' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(9);
    expect(
      screen.getByText(
        /davy\.boulfaubourg@gmail\.com · \+237 6 77 41 20 18 · dernier accès 14 oct\. 18:02/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Droits par profil' })).toBeTruthy();
  });

  it('filtre par groupe', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Production · 2' }));
    const liste = screen.getByRole('list', { name: 'Utilisateurs' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
  });

  it('verrouille le groupe et la désactivation de son propre compte', async () => {
    await ouvrir();
    const groupe = (await screen.findByLabelText(
      'Groupe de Support OptiBoul',
    )) as HTMLSelectElement;
    expect(groupe.disabled).toBe(true);
    expect(
      screen.queryByRole('button', { name: /Désactiver le compte de Support OptiBoul/ }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: /Désactiver le compte de Davy/ })).toBeTruthy();
  });

  it('change un utilisateur de groupe : toast et profil mis à jour', async () => {
    await ouvrir();
    fireEvent.change(await screen.findByLabelText('Groupe de Davy'), { target: { value: '3' } });
    expect(
      await screen.findByText('Davy → Gérants de la semaine · droits « Gérant de la semaine »'),
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/^Davy ·/).textContent).toContain('Gérant de la semaine'),
    );
    expect(comptes.find((c) => c.name === 'Davy')?.groupe).toBe(3);
  });

  it('réinitialise le code et désactive puis réactive un compte', async () => {
    await ouvrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText('Code de Rachel réinitialisé')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte de Rachel' }));
    expect(await screen.findByText('Désactivé')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Réactiver le compte de Rachel' }));
    await waitFor(() => expect(screen.getAllByText('Actif')).toHaveLength(9));
  });

  it('dit le refus du serveur quand le profil ne permet pas l’action', async () => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    moi = 3;
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText('Votre profil ne permet pas cette action.')).toBeTruthy();
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('en');
    expect(await screen.findByRole('tab', { name: 'Users · 9' })).toBeTruthy();
    expect(screen.getByText(/last access Oct 14 18:02/, { exact: false })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Rights by profile' })).toBeTruthy();
  });
});

describe('Gestion › Utilisateurs : refus du serveur', () => {
  const textes: Array<[number, string, string]> = [
    [409, 'compte_propre', 'Vous ne pouvez pas modifier votre propre compte.'],
    [409, 'dernier_administrateur', 'Il doit rester au moins un administrateur actif.'],
    [404, 'utilisateur_inconnu', 'Cet utilisateur n’existe plus. La liste a été relue.'],
    // Un refus métier sans message propre à l'écran : la phrase du serveur.
    [409, 'autre_conflit', 'Refusé.'],
    [403, 'droit_insuffisant', 'Votre profil ne permet pas cette action.'],
  ];

  it.each(textes)('dit le refus %i %s et relit la liste', async (statut, code, texte) => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    const avant = lectures;
    serveur.use(
      http.post('*/api/v1/utilisateurs/:id/reinitialiser-code/', () => {
        ecritures.push('POST');
        return refus(statut, code);
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le code de Rachel' }));
    expect(await screen.findByText(texte)).toBeTruthy();
    expect(ecritures).toEqual(['POST']);
    await waitFor(() => expect(lectures).toBeGreaterThan(avant));
  });

  it('dit une erreur réseau et relit la liste', async () => {
    await ouvrir();
    await screen.findByLabelText('Groupe de Davy');
    const avant = lectures;
    serveur.use(http.post('*/api/v1/utilisateurs/:id/activation/', () => HttpResponse.error()));
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver le compte de Rachel' }));
    expect(await screen.findByText('Une erreur est survenue. Réessayez.')).toBeTruthy();
    await waitFor(() => expect(lectures).toBeGreaterThan(avant));
  });

  it('ne lance qu’une écriture pour deux clics rapprochés, et garde le focus', async () => {
    await ouvrir();
    const bouton = await screen.findByRole('button', { name: 'Réinitialiser le code de Rachel' });
    serveur.use(
      http.post('*/api/v1/utilisateurs/:id/reinitialiser-code/', () => {
        ecritures.push('POST');
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    bouton.focus();
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Une erreur est survenue. Réessayez.');
    expect(ecritures).toHaveLength(1);
    // aria-disabled et non disabled : le bouton cliqué ne perd jamais le focus.
    expect(bouton.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(bouton);
  });

  it('ne lance qu’un changement de groupe pour deux changements rapprochés', async () => {
    await ouvrir();
    const choix = await screen.findByLabelText('Groupe de Davy');
    serveur.use(
      http.post('*/api/v1/utilisateurs/:id/groupe/', () => {
        ecritures.push('POST');
        return refus(409, 'compte_propre');
      }),
    );
    fireEvent.change(choix, { target: { value: '3' } });
    fireEvent.change(choix, { target: { value: '2' } });
    await screen.findByText('Vous ne pouvez pas modifier votre propre compte.');
    expect(ecritures).toHaveLength(1);
  });
});

describe('Gestion › Utilisateurs : chargement', () => {
  it('propose « Réessayer » quand la lecture échoue, puis affiche la liste', async () => {
    await ouvrir('fr', '', [
      http.get('*/api/v1/utilisateurs/', () => HttpResponse.json({}, { status: 500 }), {
        once: true,
      }),
    ]);
    expect(await screen.findByText('Impossible de lire les utilisateurs. Réessayez.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('tab', { name: 'Utilisateurs · 9' })).toBeTruthy();
  });
});

describe('Gestion › Utilisateurs : groupes', () => {
  it('liste les groupes avec leurs membres', async () => {
    await ouvrir('fr', '?onglet=groupes');
    expect(await screen.findByRole('heading', { name: 'Gérants de la semaine' })).toBeTruthy();
    const carte = screen.getByRole('region', { name: 'Gérants de la semaine' });
    expect(within(carte).getByText('3 membres')).toBeTruthy();
    expect(within(carte).getByText('Patrick')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Direction' })).getByText('1 membre'),
    ).toBeTruthy();
  });

  it('« Ajouter un membre » ouvre le formulaire avec le groupe choisi', async () => {
    await ouvrir('fr', '?onglet=groupes');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ajouter un membre au groupe Direction' }),
    );
    expect(await screen.findByText('1. Identité')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Direction/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('crée un groupe, efface l’erreur à la saisie, refuse un nom vide ou en double', async () => {
    await ouvrir('fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toBe('Indiquez le nom du groupe.');
    const champ = screen.getByLabelText('Nom du groupe');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(champ, { target: { value: 'direction' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(screen.getByRole('alert').textContent).toBe('Un groupe porte déjà ce nom.');
    fireEvent.change(champ, { target: { value: 'Livreurs' } });
    fireEvent.change(screen.getByLabelText('Profil de droits'), { target: { value: 'gerant' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByText('Groupe créé')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Livreurs' })).toBeTruthy();
    expect(screen.getByText('Profil de droits : Gérant de la semaine')).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText('Nom du groupe') as HTMLInputElement).value).toBe(''),
    );
    expect(onglet(/Groupes · 7/)).toBeTruthy();
    expect(groupes.at(-1)).toMatchObject({ nom: 'Livreurs', profil: 'gerant' });
  });

  it('dit le refus du serveur pour un nom en double', async () => {
    await ouvrir('fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    serveur.use(http.post('*/api/v1/groupes/', () => refus(409, 'groupe_existant')));
    fireEvent.change(screen.getByLabelText('Nom du groupe'), { target: { value: 'Autre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Un groupe porte déjà ce nom.');
    const champ = screen.getByLabelText('Nom du groupe');
    expect(champ.getAttribute('aria-invalid')).toBe('true');
    expect(champ.getAttribute('aria-describedby')).toBe(alerte.id);
    expect(document.activeElement).toBe(champ);
    // Le formulaire garde la saisie pour la corriger.
    expect((screen.getByLabelText('Nom du groupe') as HTMLInputElement).value).toBe('Autre');
  });

  it('rogne le nom, borne les longueurs et met le focus sur le nom après une erreur', async () => {
    await ouvrir('fr', '?onglet=groupes');
    const champ = (await screen.findByLabelText('Nom du groupe')) as HTMLInputElement;
    expect(champ.maxLength).toBe(60);
    expect((screen.getByLabelText('Description') as HTMLInputElement).maxLength).toBe(200);
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(document.activeElement).toBe(champ);
    fireEvent.change(champ, { target: { value: '  Livreurs  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(await screen.findByRole('heading', { name: 'Livreurs' })).toBeTruthy();
    expect(groupes.at(-1)).toMatchObject({ nom: 'Livreurs', profil: 'caissier' });
  });

  it('lit sous le champ le refus 400 d’un nom trop long', async () => {
    await ouvrir('fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    serveur.use(
      http.post('*/api/v1/groupes/', () =>
        HttpResponse.json(
          { nom: ['Assurez-vous que ce champ ne contient pas plus de 60 caractères.'] },
          { status: 400 },
        ),
      ),
    );
    fireEvent.change(screen.getByLabelText('Nom du groupe'), { target: { value: 'Autre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le nom du groupe ne dépasse pas 60 caractères.',
    );
  });

  it('ne crée qu’un groupe pour deux clics rapprochés', async () => {
    await ouvrir('fr', '?onglet=groupes');
    await screen.findByRole('heading', { name: 'Nouveau groupe' });
    fireEvent.change(screen.getByLabelText('Nom du groupe'), { target: { value: 'Livreurs' } });
    const bouton = screen.getByRole('button', { name: 'Créer le groupe' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Groupe créé');
    expect(ecritures).toEqual(['POST']);
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('en', '?onglet=groupes');
    expect(await screen.findByRole('heading', { name: 'New group' })).toBeTruthy();
    expect(screen.getAllByText('3 members').length).toBeGreaterThan(0);
  });
});

const saisir = (nom: RegExp | string, valeur: string) =>
  fireEvent.change(screen.getByLabelText(nom), { target: { value: valeur } });

async function remplir() {
  await ouvrir('fr', '?onglet=nouveau');
  await screen.findByText('1. Identité');
  saisir('Nom complet', 'Ada Lovelace');
  saisir('Adresse Gmail', 'ada@gmail.com');
  saisir(/Téléphone/, '677412018');
  fireEvent.click(screen.getByRole('button', { name: /Caisse – équipe de jour/ }));
}

describe('Gestion › Utilisateurs : nouvel utilisateur', () => {
  it('montre l’aperçu qui suit la saisie et les accès du groupe', async () => {
    await ouvrir('fr', '?onglet=nouveau');
    expect(await screen.findByText('Choisissez un groupe pour voir les accès.')).toBeTruthy();
    saisir('Nom complet', 'Ada Lovelace');
    saisir(/Téléphone/, '677412018');
    fireEvent.click(screen.getByRole('button', { name: /Direction/ }));
    const apercu = screen.getByRole('complementary', { name: 'Aperçu du compte' });
    expect(within(apercu).getByText('Ada Lovelace')).toBeTruthy();
    expect(within(apercu).getByText('Paramètres')).toBeTruthy();
    expect(
      within(apercu).getByText('Double authentification par WhatsApp au +237 6 77 41 20 18'),
    ).toBeTruthy();
  });

  it('montre l’aperçu en anglais', async () => {
    await ouvrir('en', '?onglet=nouveau');
    expect(await screen.findByText('Choose a group to see the access.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Caisse – équipe de jour/ }));
    const apercu = screen.getByRole('complementary', { name: 'Account preview' });
    expect(within(apercu).getByText('Current session')).toBeTruthy();
    expect(within(apercu).getByText('Cashier')).toBeTruthy();
  });

  it('affiche les erreurs, les rattache aux champs et les efface à la saisie', async () => {
    await ouvrir('fr', '?onglet=nouveau');
    await screen.findByText('1. Identité');
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    const nom = screen.getByLabelText('Nom complet');
    expect(nom.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Indiquez le nom complet.').id).toBe(
      nom.getAttribute('aria-describedby'),
    );
    expect(screen.getByText('Adresse e-mail invalide.')).toBeTruthy();
    expect(screen.getByText('9 chiffres commençant par 6.')).toBeTruthy();
    expect(screen.getByText('Choisissez un groupe d’utilisateurs.')).toBeTruthy();
    saisir('Nom complet', 'A');
    expect(screen.queryByText('Indiquez le nom complet.')).toBeNull();
    expect(nom.getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Direction/ }));
    expect(screen.queryByText('Choisissez un groupe d’utilisateurs.')).toBeNull();
  });

  it('refuse une adresse déjà utilisée', async () => {
    await remplir();
    saisir('Adresse Gmail', 'DAVY.boulfaubourg@gmail.com');
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(await screen.findByText('Cette adresse est déjà utilisée.')).toBeTruthy();
  });

  it('crée le compte, confirme, puis revient à la liste filtrée sur son groupe', async () => {
    await remplir();
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(await screen.findByText('Compte créé')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace peut maintenant se connecter')).toBeTruthy();
    expect(screen.getByText('AAAA-1111 · BBBB-2222')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir dans la liste' }));
    expect(await screen.findByRole('tab', { name: 'Utilisateurs · 10' })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Caisse – équipe de jour · 2' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByLabelText('Groupe de Ada Lovelace')).toBeTruthy();
  });

  it('rogne le nom avant de l’envoyer', async () => {
    await remplir();
    saisir('Nom complet', '   Ada Lovelace  ');
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeTruthy();
    expect(comptes.at(-1)).toMatchObject({ name: 'Ada Lovelace', telephone: '+237677412018' });
  });

  it('propose d’en créer un autre en gardant le groupe', async () => {
    await remplir();
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer un autre utilisateur' }));
    expect(((await screen.findByLabelText('Nom complet')) as HTMLInputElement).value).toBe('');
    expect(
      screen.getByRole('button', { name: /Caisse – équipe de jour/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('ne crée qu’un compte pour deux clics rapprochés', async () => {
    await remplir();
    const bouton = screen.getByRole('button', { name: 'Créer l’utilisateur' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await screen.findByText('Compte créé');
    expect(ecritures).toEqual(['POST']);
    expect(comptes).toHaveLength(10);
  });

  it('dit le refus du serveur sur un champ, sinon par un message', async () => {
    await remplir();
    serveur.use(
      http.post('*/api/v1/utilisateurs/', () =>
        HttpResponse.json({ email: ['Cette adresse Gmail a déjà un compte.'] }, { status: 400 }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(await screen.findByText('Cette adresse est déjà utilisée.')).toBeTruthy();
    serveur.use(http.post('*/api/v1/utilisateurs/', () => droitInsuffisant()));
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(await screen.findByText('Votre profil ne permet pas cette action.')).toBeTruthy();
  });

  it('borne le nom (60) et l’adresse (120) dans les champs', async () => {
    await ouvrir('fr', '?onglet=nouveau');
    expect(((await screen.findByLabelText('Nom complet')) as HTMLInputElement).maxLength).toBe(60);
    expect((screen.getByLabelText('Adresse Gmail') as HTMLInputElement).maxLength).toBe(120);
  });

  it('met le focus sur le premier champ en erreur, sans le déplacer à la saisie', async () => {
    await ouvrir('fr', '?onglet=nouveau');
    await screen.findByText('1. Identité');
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Nom complet'));
    saisir('Nom complet', 'Ada');
    screen.getByLabelText('Adresse Gmail').focus();
    saisir('Adresse Gmail', 'a');
    expect(document.activeElement).toBe(screen.getByLabelText('Adresse Gmail'));
    // Seul le groupe manque : le focus va aux groupes.
    saisir('Adresse Gmail', 'ada@gmail.com');
    saisir(/Téléphone/, '677412018');
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(document.activeElement).toBe(
      screen.getByRole('group', { name: 'Groupe d’utilisateurs' }).querySelector('button'),
    );
  });

  it('se parcourt au clavier dans l’ordre des étapes et se valide par Entrée', async () => {
    await remplir();
    const formulaire = screen.getByRole('button', { name: 'Créer l’utilisateur' }).closest('form')!;
    const ordre = [...formulaire.querySelectorAll<HTMLElement>('input, button')].map(
      (e) => e.getAttribute('aria-labelledby') ?? e.textContent,
    );
    const rang = (motif: RegExp) => ordre.findIndex((x) => x && motif.test(x));
    expect(rang(/nom-libelle/)).toBeLessThan(rang(/email-libelle/));
    expect(rang(/email-libelle/)).toBeLessThan(rang(/telephone-libelle/));
    expect(rang(/telephone-libelle/)).toBeLessThan(rang(/Direction/));
    expect(rang(/Direction/)).toBeLessThan(rang(/^WhatsApp$/));
    expect(rang(/^SMS$/)).toBeLessThan(rang(/Envoyer l’invitation/));
    expect(rang(/Envoyer l’invitation/)).toBeLessThan(rang(/^Annuler$/));
    expect(rang(/^Annuler$/)).toBeLessThan(rang(/Créer l’utilisateur/));
    // Entrée dans un champ valide le formulaire.
    fireEvent.submit(formulaire);
    expect(await screen.findByText('Compte créé')).toBeTruthy();
  });

  it('un non-administrateur reçoit 403 à la création et aucun compte n’est créé', async () => {
    await remplir();
    moi = 3;
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’utilisateur' }));
    expect(await screen.findByText('Votre profil ne permet pas cette action.')).toBeTruthy();
    expect(comptes).toHaveLength(9);
  });

  it('annule et décoche l’invitation', async () => {
    await ouvrir('fr', '?onglet=nouveau');
    const invitation = await screen.findByRole('checkbox', {
      name: /Envoyer l’invitation par WhatsApp/,
    });
    expect(invitation.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(invitation);
    expect(invitation.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'SMS' }));
    expect(screen.getByRole('checkbox', { name: /par SMS/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(
      await screen.findByRole('tab', { name: 'Utilisateurs · 9', selected: true }),
    ).toBeTruthy();
  });
});

describe('Gestion › Utilisateurs : accès', () => {
  it('navigue entre les onglets livrés avec les flèches, Début et Fin', async () => {
    await ouvrir();
    const premier = await screen.findByRole('tab', { name: 'Utilisateurs · 9' });
    fireEvent.keyDown(premier, { key: 'ArrowRight' });
    await waitFor(() => expect(onglet(/Groupes/).getAttribute('aria-selected')).toBe('true'));
    expect(premier.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(onglet(/Groupes/), { key: 'Home' });
    await waitFor(() => expect(onglet(/Utilisateurs/).getAttribute('aria-selected')).toBe('true'));
    fireEvent.keyDown(onglet(/Utilisateurs/), { key: 'End' });
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'Nouvel utilisateur' }).getAttribute('aria-selected'),
      ).toBe('true'),
    );
  });

  it('nomme le groupe de filtres et le tableau des droits', async () => {
    await ouvrir();
    expect(await screen.findByRole('group', { name: 'Filtrer par groupe' })).toBeTruthy();
    const tableau = screen.getByRole('table', { name: 'Droits par profil' });
    expect(within(tableau).queryByRole('heading')).toBeNull();
  });

  it('un profil sans le droit voit une erreur, pas la liste', async () => {
    await ouvrir('fr', '', [], 3);
    expect(await screen.findByText('Impossible de lire les utilisateurs. Réessayez.')).toBeTruthy();
  });
});
