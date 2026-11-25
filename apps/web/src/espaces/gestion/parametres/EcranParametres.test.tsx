import { configurerApi } from '@/api';
import { initI18n } from '@/i18n';
import { creerServeurApi } from '@/test';
import { OptiboulProvider } from '@/ui';
import { formaterNombre, formatFCFA } from '@/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ECRANS } from '../../../navigation.ts';
import EcranParametres from './EcranParametres.tsx';
import { messageDeLErreur, validerValeur } from './regles.ts';
import type { Genre, Parametre, ValeurParametre, ValeurPassee } from './types.ts';

/*
 * L'écran Paramètres sur un faux serveur au format de l'API réelle : catalogue (`parametres/`),
 * historique, modification (`PUT parametres/{clé}/`, droits et contrôles du serveur) et produits.
 */

const serveur = creerServeurApi();

beforeAll(() => {
  configurerApi({ baseUrl: 'http://localhost' });
  serveur.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => serveur.close());

type Definition = Omit<Parametre, 'valeur' | 'modifie_le' | 'modifie_par'>;

const def = (
  cle: string,
  libelle: string,
  genre: Genre,
  defaut: ValeurParametre,
  autres: Partial<Definition> = {},
): Definition => ({
  cle,
  libelle,
  genre,
  unite: '',
  usage: '',
  defaut,
  choix: [],
  minimum: null,
  maximum: null,
  ...autres,
});

const montant = (cle: string, libelle: string, defaut: number) =>
  def(cle, libelle, 'montant', defaut, { unite: 'FCFA' });

const CATALOGUE: Definition[] = [
  montant('plafond_dette_client', 'Plafond de dette par client', 2_000),
  def('echeance_dettes', 'Échéance des dettes', 'jour', 'dimanche'),
  def('relances_jours', 'Jours des relances automatiques', 'jours', ['jeudi', 'samedi']),
  def('relances_heure', 'Heure des relances automatiques', 'heure', '10:00'),
  montant('fonds_caisse', 'Fonds de caisse', 20_000),
  montant('seuil_validation_depenses', 'Seuil de validation des dépenses', 50_000),
  def('ecart_matiere_kg_par_sac', 'Écart matière toléré par sac', 'entier', 2, { unite: 'kg' }),
  def('inactivite_comptoir', 'Inactivité avant déconnexion au comptoir', 'choix', 5, {
    unite: 'minutes',
    choix: [1, 5, 10, 15],
  }),
  def('jour_de_paie', 'Jour de paie du mois', 'entier', 28, {
    unite: 'jour',
    minimum: 1,
    maximum: 28,
  }),
  def('heure_petrissage_nuit', 'Heure du pétrissage (nuit)', 'heure', '19:00'),
  def('sauvegarde_locale', 'Intervalle de la sauvegarde locale', 'entier', 4, {
    unite: 'heures',
    minimum: 1,
    maximum: 24,
  }),
];

const PRODUITS = [
  { code: 'BAG', nom: 'Baguette', nom_en: 'Baguette', boule: 5000, pb: 20, sac: 315, prix: 100 },
  { code: 'KO', nom: 'Kirikou', nom_en: 'Kirikou', boule: 4000, pb: 20, sac: 300, prix: 50 },
  {
    code: 'GC135',
    nom: 'Gros court 135',
    nom_en: 'Short loaf 135',
    boule: 4800,
    pb: 19,
    sac: 280,
    prix: 150,
  },
  { code: 'GC170', nom: 'Gros court 170', nom_en: '', boule: 5000, pb: 15, sac: 240, prix: 0 },
  { code: 'PL', nom: 'Pain long', nom_en: '', boule: 4500, pb: 18, sac: 270, prix: 200 },
  { code: 'C2', nom: 'Croissant 2', nom_en: '', boule: 3000, pb: 10, sac: 150, prix: 250 },
  { code: 'PSL', nom: 'Pain sandwich long', nom_en: '', boule: 4000, pb: 12, sac: 190, prix: 300 },
].map((p, i) => ({
  id: i + 1,
  code: p.code,
  nom: p.nom,
  nom_en: p.nom_en,
  prix: p.prix,
  fiche: { poids_boule: p.boule, pains_par_boule: p.pb, pains_par_sac: p.sac },
}));

const PROFILS = {
  fotso: { nom: 'M. Fotso', profil: 'proprietaire' },
  admin: { nom: 'Admin Dev', profil: 'administrateur' },
  willy: { nom: 'Willy Gérant', profil: 'gerant' },
} as const;

type Personne = keyof typeof PROFILS;

/** Les valeurs enregistrées, de la plus récente à la plus ancienne (comme le serveur). */
let valeurs: Map<string, ValeurPassee[]>;
let personne: Personne;

const valeurDe = (cle: string) => {
  const d = CATALOGUE.find((c) => c.cle === cle)!;
  const copie = valeurs.get(cle)?.[0]?.valeur ?? d.defaut;
  return Array.isArray(copie) ? [...copie] : copie;
};
const projeter = (d: Definition): Parametre => {
  const derniere = valeurs.get(d.cle)?.[0];
  return {
    ...d,
    valeur: valeurDe(d.cle),
    modifie_le: derniere?.le ?? null,
    modifie_par: derniere?.auteur ?? '',
  };
};

/** L'enregistrement du serveur : droits, contrôles, historique (une valeur inchangée n'en crée pas). */
function appliquer(cle: string, valeur: unknown) {
  const d = CATALOGUE.find((c) => c.cle === cle)!;
  if (PROFILS[personne].profil !== 'proprietaire') {
    return HttpResponse.json(
      { detail: 'Seul le propriétaire modifie les paramètres.', code: 'droit_insuffisant' },
      { status: 403 },
    );
  }
  const verdict = validerValeur(projeter(d), valeur);
  if (!verdict.ok) {
    const message = messageDeLErreur(verdict.erreur);
    return HttpResponse.json(
      { detail: message, code: 'valeur_invalide', valeur: message },
      { status: 400 },
    );
  }
  if (JSON.stringify(verdict.valeur) !== JSON.stringify(valeurDe(cle))) {
    valeurs.set(cle, [
      {
        valeur: verdict.valeur,
        auteur: PROFILS[personne].nom,
        le: '2026-10-14T17:02:00Z',
      },
      ...(valeurs.get(cle) ?? []),
    ]);
  }
  return HttpResponse.json(projeter(d));
}

function installerServeur() {
  valeurs = new Map();
  serveur.use(
    http.get('*/api/v1/users/me/', () =>
      HttpResponse.json({
        id: 1,
        name: PROFILS[personne].nom,
        email: 'x@optiboul.local',
        url: 'http://localhost/api/v1/users/1/',
        profil: PROFILS[personne].profil,
      }),
    ),
    http.get('*/api/v1/parametres/', () =>
      PROFILS[personne].profil === 'gerant'
        ? HttpResponse.json(
            { detail: 'Votre profil ne consulte pas les paramètres.', code: 'droit_insuffisant' },
            { status: 403 },
          )
        : HttpResponse.json(CATALOGUE.map(projeter)),
    ),
    http.get('*/api/v1/parametres/:cle/historique/', ({ params }) =>
      HttpResponse.json(valeurs.get(String(params.cle)) ?? []),
    ),
    http.put('*/api/v1/parametres/:cle/', async ({ params, request }) =>
      appliquer(String(params.cle), ((await request.json()) as { valeur: unknown }).valeur),
    ),
    http.get('*/api/v1/produits/', () =>
      HttpResponse.json({ count: PRODUITS.length, next: null, previous: null, results: PRODUITS }),
    ),
  );
}

const refus = (statut: number, corps: object) => HttpResponse.json(corps, { status: statut });

async function ouvrir(
  utilisateur: Personne = 'fotso',
  langue: 'fr' | 'en' = 'fr',
  surcharges: Parameters<typeof serveur.use> = [],
) {
  personne = utilisateur;
  await initI18n('fr').changeLanguage(langue);
  installerServeur();
  serveur.use(...surcharges);
  const ecran = ECRANS.find((e) => e.espace === 'gestion' && e.cle === 'parametres')!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <OptiboulProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/gestion/parametres']}>
          <EcranParametres ecran={ecran} />
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

const champ = async (nom: string | RegExp) =>
  (await screen.findByRole('textbox', { name: nom })) as HTMLInputElement;
const attendreTableau = () => screen.findByRole('table', { name: 'Produits et fiches techniques' });
const enregistrees = (cle: string) => valeurs.get(cle) ?? [];

describe('Gestion › Paramètres : seuils et produits', () => {
  it('affiche les trois seuils de la maquette et les sept produits', async () => {
    await ouvrir();
    expect(await screen.findByRole('heading', { name: 'Seuils et règles' })).toBeTruthy();
    expect((await champ('Plafond de dette par client')).value).toBe('2000');
    expect((await champ('Seuil de validation des dépenses')).value).toBe('50000');
    expect((await champ('Écart matière toléré par sac')).value).toBe('2');

    const tableau = await attendreTableau();
    expect(within(tableau).getAllByRole('row')).toHaveLength(8);
    const baguette = within(tableau).getByRole('link', { name: 'BAG – Baguette' });
    expect(baguette.getAttribute('href')).toBe('/atelier/production?fiche=bag&depuis=parametres');
    const ligne = baguette.closest('[role="row"]') as HTMLElement;
    expect(
      within(ligne)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['BAG – BaguetteModifier', formaterNombre(5000), '20', '315', '100']);
    expect(within(tableau).getAllByText('Fiche ›')).toHaveLength(7);
    // Pas de prix relevé : un tiret.
    const gc170 = within(tableau).getByRole('link', { name: 'GC 170 – Gros court 170' });
    expect(
      within(gc170.closest('[role="row"]') as HTMLElement).getAllByRole('cell')[4]!.textContent,
    ).toBe('—');
  });

  it('enregistre un seuil en quittant le champ : valeur, toast et historique', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await attendreTableau();
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect(await screen.findByText('Plafond de dette par client enregistré')).toBeTruthy();
    expect(valeurDe('plafond_dette_client')).toBe(3000);
    expect(enregistrees('plafond_dette_client')).toHaveLength(1);
    expect(enregistrees('plafond_dette_client')[0]).toMatchObject({ auteur: 'M. Fotso' });
    await waitFor(async () =>
      expect((await champ('Plafond de dette par client')).value).toBe('3000'),
    );
  });

  it('Entrée enregistre une seule fois, même suivie de la sortie du champ', async () => {
    await ouvrir();
    const seuil = await champ('Seuil de validation des dépenses');
    await attendreTableau();
    fireEvent.change(seuil, { target: { value: '70 000' } });
    fireEvent.keyDown(seuil, { key: 'Enter' });
    fireEvent.blur(seuil);
    await waitFor(() => expect(valeurDe('seuil_validation_depenses')).toBe(70000));
    expect(enregistrees('seuil_validation_depenses')).toHaveLength(1);
  });

  it('n’enregistre rien quand la valeur ne change pas, et Échap abandonne la saisie', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await attendreTableau();
    fireEvent.change(plafond, { target: { value: '2000' } });
    fireEvent.blur(plafond);
    fireEvent.change(plafond, { target: { value: '9999' } });
    fireEvent.keyDown(plafond, { key: 'Escape' });
    expect(plafond.value).toBe('2000');
    expect(enregistrees('plafond_dette_client')).toHaveLength(0);
    expect(valeurDe('plafond_dette_client')).toBe(2000);
  });

  it('refuse une valeur invalide avec un message relié au champ, effacé à la frappe', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await attendreTableau();
    fireEvent.change(plafond, { target: { value: 'beaucoup' } });
    fireEvent.blur(plafond);
    const message = await screen.findByRole('alert');
    expect(message.textContent).toBe('Saisissez un nombre entier.');
    expect(plafond.getAttribute('aria-invalid')).toBe('true');
    expect(plafond.getAttribute('aria-describedby')).toBe(message.id);
    expect(valeurDe('plafond_dette_client')).toBe(2000);

    fireEvent.change(plafond, { target: { value: 'beaucoup d' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(plafond.getAttribute('aria-invalid')).toBeNull();
    expect(enregistrees('plafond_dette_client')).toHaveLength(0);
  });

  it('refuse une saisie vide', async () => {
    await ouvrir();
    const ecart = await champ('Écart matière toléré par sac');
    await attendreTableau();
    fireEvent.change(ecart, { target: { value: '' } });
    fireEvent.blur(ecart);
    expect((await screen.findByRole('alert')).textContent).toBe('Saisissez un nombre entier.');
  });
});

describe('Gestion › Paramètres : modifier un produit', () => {
  it('le propriétaire modifie le prix de base de la baguette : PATCH puis message', async () => {
    let corps: Record<string, unknown> | undefined;
    await ouvrir('fotso', 'fr', [
      http.patch('*/api/v1/produits/:id/', async ({ params, request }) => {
        corps = { id: params.id, ...((await request.json()) as object) };
        return HttpResponse.json({ id: 1 });
      }),
    ]);
    await attendreTableau();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier BAG – Baguette' }));
    const prix = await screen.findByLabelText(/^Prix de vente de base/);
    fireEvent.change(prix, { target: { value: '110' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Produit Baguette modifié')).toBeTruthy();
    expect(corps).toMatchObject({ id: '1', nom: 'Baguette', prix: 110, actif: true });
  });

  it('un nom vide est refusé avant l’envoi', async () => {
    await ouvrir('fotso');
    await attendreTableau();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier KO – Kirikou' }));
    fireEvent.change(await screen.findByLabelText('Nom'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/nom du produit/);
  });

  it('l’administrateur consulte : aucun bouton Modifier', async () => {
    await ouvrir('admin');
    await attendreTableau();
    expect(screen.queryByRole('button', { name: /^Modifier BAG/ })).toBeNull();
  });
});

describe('Gestion › Paramètres : autres paramètres et historique', () => {
  it('range les autres paramètres par famille avec leur valeur par défaut', async () => {
    await ouvrir();
    expect(await screen.findByRole('heading', { name: 'Tous les paramètres métier' })).toBeTruthy();
    for (const famille of ['Dettes et relances', 'Production', 'Paie', 'Sécurité et sauvegardes']) {
      expect(screen.getByRole('heading', { name: famille })).toBeTruthy();
    }
    expect(screen.getByText(/Valeur par défaut : 28 jour/)).toBeTruthy();
    expect(
      (screen.getByRole('textbox', { name: 'Jour de paie du mois' }) as HTMLInputElement).value,
    ).toBe('28');
  });

  it('enregistre un choix, un jour et des jours cochés aussitôt', async () => {
    await ouvrir();
    const inactivite = (await screen.findByRole('combobox', {
      name: 'Inactivité avant déconnexion au comptoir',
    })) as HTMLSelectElement;
    fireEvent.change(inactivite, { target: { value: '10' } });
    await waitFor(() => expect(valeurDe('inactivite_comptoir')).toBe(10));

    fireEvent.change(screen.getByRole('combobox', { name: 'Échéance des dettes' }), {
      target: { value: 'vendredi' },
    });
    await waitFor(() => expect(valeurDe('echeance_dettes')).toBe('vendredi'));

    const relances = screen.getByRole('group', { name: 'Jours des relances automatiques' });
    fireEvent.click(within(relances).getByRole('checkbox', { name: 'lundi' }));
    await waitFor(() => expect(valeurDe('relances_jours')).toEqual(['lundi', 'jeudi', 'samedi']));
  });

  it('refuse de décocher le dernier jour', async () => {
    await ouvrir();
    const relances = await screen.findByRole('group', { name: 'Jours des relances automatiques' });
    fireEvent.click(within(relances).getByRole('checkbox', { name: 'jeudi' }));
    await waitFor(() => expect(valeurDe('relances_jours')).toEqual(['samedi']));
    fireEvent.click(within(relances).getByRole('checkbox', { name: 'samedi' }));
    expect((await screen.findByText('Cochez au moins un jour.')).getAttribute('role')).toBe(
      'alert',
    );
    expect(valeurDe('relances_jours')).toEqual(['samedi']);
  });

  it('refuse une valeur hors bornes, avec les bornes dans le message', async () => {
    await ouvrir();
    const paie = await screen.findByRole('textbox', { name: 'Jour de paie du mois' });
    fireEvent.change(paie, { target: { value: '31' } });
    fireEvent.blur(paie);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saisissez une valeur entre 1 et 28.',
    );
  });

  it('contrôle le format d’une heure', async () => {
    await ouvrir();
    const heure = await screen.findByRole('textbox', { name: 'Heure des relances automatiques' });
    fireEvent.change(heure, { target: { value: '25:00' } });
    fireEvent.blur(heure);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Saisissez une heure au format HH:MM.',
    );
    fireEvent.change(heure, { target: { value: '09:30' } });
    fireEvent.blur(heure);
    await waitFor(() => expect(valeurDe('relances_heure')).toBe('09:30'));
  });

  it('montre l’historique des valeurs du paramètre choisi', async () => {
    await ouvrir();
    const plafond = await champ('Plafond de dette par client');
    await attendreTableau();
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    await waitFor(() => expect(valeurDe('plafond_dette_client')).toBe(3000));
    const historique = screen.getByRole('region', { name: 'Historique des valeurs' });
    const lignes = await within(historique).findAllByRole('row');
    expect(lignes).toHaveLength(2);
    expect(lignes[1]!.textContent).toContain(formatFCFA(3000));
    expect(lignes[1]!.textContent).toContain('M. Fotso');

    fireEvent.change(within(historique).getByLabelText('Paramètre'), {
      target: { value: 'fonds_caisse' },
    });
    expect(
      await within(historique).findByText(
        'Aucune modification : la valeur par défaut est en vigueur.',
      ),
    ).toBeTruthy();
  });
});

describe('Gestion › Paramètres : droits et langue', () => {
  it('l’administrateur consulte : champs en lecture seule, produits sans lien', async () => {
    await ouvrir('admin');
    const plafond = await screen.findByRole('textbox', { name: 'Plafond de dette par client' });
    expect(plafond.hasAttribute('readonly')).toBe(true);
    expect(await screen.findByText(/Lecture seule : seul le propriétaire/)).toBeTruthy();
    const tableau = await attendreTableau();
    expect(within(tableau).queryAllByRole('link')).toHaveLength(0);
    expect(within(tableau).getByText('BAG – Baguette')).toBeTruthy();
    expect(
      (screen.getByRole('combobox', { name: 'Échéance des dettes' }) as HTMLSelectElement).disabled,
    ).toBe(true);
    const relances = screen.getByRole('group', { name: 'Jours des relances automatiques' });
    expect(
      within(relances)
        .getAllByRole('checkbox')
        .every((c) => (c as HTMLInputElement).disabled),
    ).toBe(true);
    fireEvent.change(plafond, { target: { value: '9000' } });
    fireEvent.blur(plafond);
    expect(valeurDe('plafond_dette_client')).toBe(2000);
  });

  it('refuse le gérant avec un message', async () => {
    await ouvrir('willy');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(
      screen.getByText('Les paramètres sont réservés au propriétaire et à l’administrateur.'),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('s’affiche en anglais', async () => {
    await ouvrir('fotso', 'en');
    expect(await screen.findByRole('heading', { name: 'Thresholds & rules' })).toBeTruthy();
    expect((await champ('Debt limit per customer')).value).toBe('2000');
    const tableau = await screen.findByRole('table', { name: 'Products & technical sheets' });
    expect(within(tableau).getByRole('link', { name: 'GC 135 – Short loaf 135' })).toBeTruthy();
    expect(within(tableau).getAllByText('Sheet ›').length).toBe(7);
    expect(screen.getByRole('combobox', { name: 'Debt due day' })).toBeTruthy();
    expect(screen.getByText('Default value: 28 day')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Value history' })).toBeTruthy();
  });
});

describe('Gestion › Paramètres : échecs et envois', () => {
  it('affiche la phrase du serveur pour un 400 sans code', async () => {
    await ouvrir();
    serveur.use(
      http.put('*/api/v1/parametres/:cle/', () =>
        refus(400, { valeur: 'Valeur trop haute pour la caisse.' }),
      ),
    );
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Valeur trop haute pour la caisse.',
    );
    expect(plafond.getAttribute('aria-invalid')).toBe('true');
    expect(plafond.value).toBe('3000');
  });

  it('affiche le message générique pour un 500, et garde la saisie', async () => {
    await ouvrir();
    serveur.use(http.put('*/api/v1/parametres/:cle/', () => refus(500, { detail: 'Boum' })));
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Le paramètre n’a pas pu être enregistré. Réessayez.',
    );
    expect(plafond.value).toBe('3000');
    expect(valeurDe('plafond_dette_client')).toBe(2000);
  });

  it('dit que seul le propriétaire modifie quand le serveur répond 403 pendant l’enregistrement', async () => {
    await ouvrir();
    serveur.use(
      http.put('*/api/v1/parametres/:cle/', () =>
        refus(403, { detail: 'Interdit', code: 'droit_insuffisant' }),
      ),
    );
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Seul le propriétaire modifie les paramètres.',
    );
  });

  it('ne part qu’une fois quand le champ est quitté deux fois pendant l’envoi', async () => {
    await ouvrir();
    let envois = 0;
    let liberer!: () => void;
    const attente = new Promise<void>((r) => (liberer = r));
    serveur.use(
      http.put('*/api/v1/parametres/:cle/', async ({ params }) => {
        envois += 1;
        await attente;
        return appliquer(String(params.cle), 3000);
      }),
    );
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    fireEvent.blur(plafond);
    fireEvent.keyDown(plafond, { key: 'Enter' });
    liberer();
    await waitFor(() => expect(valeurDe('plafond_dette_client')).toBe(3000));
    expect(envois).toBe(1);
    expect(enregistrees('plafond_dette_client')).toHaveLength(1);
  });

  it('n’écrase pas une saisie retapée pendant l’envoi', async () => {
    await ouvrir();
    let liberer!: () => void;
    const attente = new Promise<void>((r) => (liberer = r));
    serveur.use(
      http.put(
        '*/api/v1/parametres/:cle/',
        async ({ params }) => {
          await attente;
          return appliquer(String(params.cle), 3000);
        },
        { once: true },
      ),
    );
    const plafond = await champ('Plafond de dette par client');
    fireEvent.change(plafond, { target: { value: '3000' } });
    fireEvent.blur(plafond);
    fireEvent.change(plafond, { target: { value: '3500' } });
    liberer();
    await waitFor(() => expect(valeurDe('plafond_dette_client')).toBe(3000));
    expect(plafond.value).toBe('3500');
    // La nouvelle saisie s'enregistre à la sortie suivante.
    fireEvent.blur(plafond);
    await waitFor(() => expect(valeurDe('plafond_dette_client')).toBe(3500));
  });

  it('garde les seuils quand les produits ne se chargent pas', async () => {
    await ouvrir('fotso', 'fr', [
      http.get('*/api/v1/produits/', () => refus(500, { detail: 'Boum' })),
    ]);
    expect((await champ('Plafond de dette par client')).value).toBe('2000');
    expect(await screen.findByText('Impossible de charger les produits.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Produits et fiches techniques' })).toBeNull();
  });

  it('dit quand l’historique ne se charge pas', async () => {
    await ouvrir('fotso', 'fr', [
      http.get('*/api/v1/parametres/:cle/historique/', () => refus(500, { detail: 'Boum' })),
    ]);
    expect(await screen.findByText('Impossible de charger l’historique.')).toBeTruthy();
  });
});
