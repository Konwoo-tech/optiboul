import { describe, expect, it } from 'vitest';

import {
  calculerLivraison,
  type EntreeLivraison,
  clientsSansCommande,
  ecartDeCaisse,
  especesAttendues,
  filtrerClients,
  formaterNombre,
  formaterSigne,
  lireEntier,
  montantEstime,
  niveauDuSolde,
  planDeSacs,
  PLAFOND_PAR_DEFAUT,
  texteHabituel,
  totauxDesLivraisons,
} from './calculs.ts';
import type { Client, Livraison, ModePaiement, Quantites } from './types.ts';

const TARIF_A: Quantites = { BAG: 100, KO: 70, GC: 160 };

const client = (champs: Partial<Client> = {}): Client => ({
  id: 'x',
  nom: 'Alex',
  type: 'Client livreur',
  lieu: 'Emana',
  telephone: '6 99 08 33 41',
  prix: TARIF_A,
  solde: 0,
  ...champs,
});

const entree = (champs: Partial<EntreeLivraison> = {}): EntreeLivraison => ({
  client: client(),
  saisies: { BAG: '', KO: '', GC: '' },
  recu: '',
  mode: 'especes',
  reference: '',
  plafond: PLAFOND_PAR_DEFAUT,
  soldeAutorise: null,
  peutSaisir: true,
  ...champs,
});

const livraison = (
  champs: { id: string; du: number; recu: number; mode: ModePaiement } & Partial<Quantites>,
): Livraison => ({
  id: champs.id,
  numero: 1,
  clientId: 'x',
  nom: 'Alex',
  quantites: { BAG: champs.BAG ?? 0, KO: champs.KO ?? 0, GC: champs.GC ?? 0 },
  prix: TARIF_A,
  du: champs.du,
  recu: champs.recu,
  mode: champs.mode,
  reference: '',
  reste: champs.recu - champs.du,
  soldeAvant: 0,
  soldeApres: champs.recu - champs.du,
  heure: '18:02',
  par: 'Davy',
  autorisePar: '',
});

describe('formats', () => {
  it('sépare les milliers par une espace insécable, comme la maquette', () => {
    expect(formaterNombre(1234567)).toBe('1 234 567');
    expect(formaterNombre(500)).toBe('500');
    expect(formaterNombre(-4200)).toBe('−4 200');
    expect(formaterNombre(0)).toBe('0');
  });

  it('arrondit : jamais de flottant à l’écran', () => {
    expect(formaterNombre(12.6)).toBe('13');
  });

  it('met un + devant un montant positif', () => {
    expect(formaterSigne(1500)).toBe('+1 500');
    expect(formaterSigne(-500)).toBe('−500');
    expect(formaterSigne(0)).toBe('0');
  });

  it('lit un entier dans une saisie et ignore le reste', () => {
    expect(lireEntier('12a3')).toBe(123);
    expect(lireEntier('')).toBe(0);
    expect(lireEntier(undefined)).toBe(0);
    expect(lireEntier('abc')).toBe(0);
  });
});

describe('niveau du solde', () => {
  it('à jour, dette à surveiller, puis plafond dépassé au-delà de 2 000 FCFA', () => {
    expect(PLAFOND_PAR_DEFAUT).toBe(2000);
    expect(niveauDuSolde(0, 2000)).toBe('ok');
    expect(niveauDuSolde(300, 2000)).toBe('ok');
    expect(niveauDuSolde(-1, 2000)).toBe('surveiller');
    expect(niveauDuSolde(-2000, 2000)).toBe('surveiller');
    expect(niveauDuSolde(-2001, 2000)).toBe('bloquant');
  });
});

describe('livraison', () => {
  // Tarif B : BAG 110, KO 75, GC 165.
  const tarifB = { BAG: 110, KO: 75, GC: 165 };

  it('calcule le montant dû au tarif du client', () => {
    const calcul = calculerLivraison(
      entree({ client: client({ prix: tarifB }), saisies: { BAG: '60', KO: '', GC: '30' } }),
    );
    expect(calcul.lignes.map((l) => l.total)).toEqual([6600, 0, 4950]);
    expect(calcul.du).toBe(11550);
  });

  it('paiement exact : reste nul, solde inchangé', () => {
    const calcul = calculerLivraison(
      entree({
        client: client({ prix: tarifB, solde: -500 }),
        saisies: { BAG: '60', KO: '', GC: '30' },
        recu: '11550',
      }),
    );
    expect(calcul.reste).toBe(0);
    expect(calcul.soldeApres).toBe(-500);
    expect(calcul.valide).toBe(true);
  });

  it('paiement insuffisant : le reste devient une dette', () => {
    const calcul = calculerLivraison(
      entree({
        client: client({ solde: 0 }),
        saisies: { BAG: '50', KO: '', GC: '' },
        recu: '4000',
      }),
    );
    expect(calcul.du).toBe(5000);
    expect(calcul.reste).toBe(-1000);
    expect(calcul.soldeApres).toBe(-1000);
    expect(calcul.depasse).toBe(false);
  });

  it('paiement en trop : rembourse une ancienne dette', () => {
    const calcul = calculerLivraison(
      entree({
        client: client({ solde: -1250 }),
        saisies: { BAG: '10', KO: '', GC: '' },
        recu: '2000',
      }),
    );
    expect(calcul.reste).toBe(1000);
    expect(calcul.soldeApres).toBe(-250);
  });

  it('bloque au-delà du plafond et dit combien encaisser pour repasser dessous', () => {
    const calcul = calculerLivraison(
      entree({
        client: client({ solde: -4200 }),
        saisies: { BAG: '30', KO: '', GC: '' },
        recu: '1000',
      }),
    );
    // dû 3 000, reçu 1 000 : reste −2 000, solde après −6 200.
    expect(calcul.soldeApres).toBe(-6200);
    expect(calcul.depasse).toBe(true);
    expect(calcul.bloquee).toBe(true);
    expect(calcul.manque).toBe(4200);
    expect(calcul.valide).toBe(false);
  });

  it('encaisser le complément ramène pile au plafond', () => {
    const base = entree({
      client: client({ solde: -4200 }),
      saisies: { BAG: '30', KO: '', GC: '' },
      recu: '1000',
    });
    const complement = calculerLivraison(base).manque;
    const apres = calculerLivraison({ ...base, recu: String(1000 + complement) });
    expect(apres.soldeApres).toBe(-2000);
    expect(apres.bloquee).toBe(false);
    expect(apres.valide).toBe(true);
  });

  it('une autorisation du gérant lève le blocage, mais le dépassement reste signalé', () => {
    const calcul = calculerLivraison(
      entree({
        client: client({ solde: -4200 }),
        saisies: { BAG: '30', KO: '', GC: '' },
        recu: '1000',
        soldeAutorise: -6200,
      }),
    );
    expect(calcul.depasse).toBe(true);
    expect(calcul.bloquee).toBe(false);
    expect(calcul.valide).toBe(true);
  });

  it('exactement au plafond, ce n’est pas un dépassement', () => {
    const calcul = calculerLivraison(
      entree({
        client: client({ solde: -1000 }),
        saisies: { BAG: '10', KO: '', GC: '' },
        recu: '0',
      }),
    );
    expect(calcul.soldeApres).toBe(-2000);
    expect(calcul.depasse).toBe(false);
  });

  it('exige une référence pour le mobile money, pas pour les espèces', () => {
    const saisies = { BAG: '10', KO: '', GC: '' };
    const base = entree({ client: client(), saisies, recu: '1000' });
    expect(calculerLivraison({ ...base, mode: 'especes' }).valide).toBe(true);
    const sans = calculerLivraison({ ...base, mode: 'mtn', reference: '  ' });
    expect(sans.referenceManquante).toBe(true);
    expect(sans.valide).toBe(false);
    const avec = calculerLivraison({ ...base, mode: 'orange', reference: 'OM241014.2141.A9' });
    expect(avec.valide).toBe(true);
  });

  it('refuse sans client, sans pain ou sans droit de saisie', () => {
    const saisies = { BAG: '10', KO: '', GC: '' };
    expect(calculerLivraison(entree({ client: undefined, saisies })).valide).toBe(false);
    expect(calculerLivraison(entree({ client: client() })).valide).toBe(false);
    expect(calculerLivraison(entree({ client: client(), saisies, peutSaisir: false })).valide).toBe(
      false,
    );
  });
});

describe('totaux de la session', () => {
  const livraisons = [
    livraison({ id: 'a', du: 7800, recu: 7800, mode: 'orange', BAG: 50, KO: 40 }),
    livraison({ id: 'b', du: 11550, recu: 11550, mode: 'especes', BAG: 60, GC: 30 }),
    livraison({ id: 'c', du: 10700, recu: 10200, mode: 'especes', BAG: 70, KO: 40 }),
    livraison({ id: 'd', du: 16700, recu: 16700, mode: 'mtn', BAG: 100, KO: 50, GC: 20 }),
    livraison({ id: 'e', du: 1000, recu: 3000, mode: 'especes', BAG: 10 }),
  ];

  it('somme dû, reçu, dettes, remboursements, pains et modes de paiement', () => {
    const totaux = totauxDesLivraisons(livraisons);
    expect(totaux.du).toBe(47750);
    expect(totaux.recu).toBe(49250);
    expect(totaux.dette).toBe(-500);
    expect(totaux.remboursements).toBe(2000);
    expect(totaux.pains).toBe(50 + 40 + 60 + 30 + 70 + 40 + 100 + 50 + 20 + 10);
    expect(totaux.especes).toBe(11550 + 10200 + 3000);
    expect(totaux.mtn).toBe(16700);
    expect(totaux.orange).toBe(7800);
  });

  it('est nul sans livraison', () => {
    expect(totauxDesLivraisons([])).toEqual({
      du: 0,
      recu: 0,
      dette: 0,
      remboursements: 0,
      pains: 0,
      especes: 0,
      mtn: 0,
      orange: 0,
    });
  });
});

describe('caisse', () => {
  it('espèces attendues = fonds + espèces encaissées − dépenses payées en caisse', () => {
    expect(especesAttendues(20000, 33950, 31000)).toBe(22950);
  });

  it('écart : rien compté, juste, manque, excédent', () => {
    expect(ecartDeCaisse('', 22950)).toEqual({ compte: false, ecart: -22950, niveau: 'neutre' });
    expect(ecartDeCaisse('22950', 22950)).toEqual({ compte: true, ecart: 0, niveau: 'ok' });
    expect(ecartDeCaisse('22500', 22950)).toEqual({
      compte: true,
      ecart: -450,
      niveau: 'bloquant',
    });
    expect(ecartDeCaisse('23000', 22950)).toEqual({
      compte: true,
      ecart: 50,
      niveau: 'surveiller',
    });
  });

  it('« 0 » compté est bien un comptage', () => {
    expect(ecartDeCaisse('0', 100).compte).toBe(true);
  });
});

describe('commandes et plan de sacs', () => {
  const clients: Client[] = [client({ id: 'a' }), client({ id: 'b', nom: 'Bob' })];
  const commandes = {
    a: { BAG: '120', KO: '80', GC: '20' },
    b: { BAG: '200', KO: '', GC: '' },
  };

  it('arrondit chaque produit au sac supérieur', () => {
    const plan = planDeSacs(clients, commandes);
    expect(plan.BAG).toEqual({ pains: 320, sacs: 2 }); // 320 / 315 → 2 sacs
    expect(plan.KO).toEqual({ pains: 80, sacs: 1 });
    expect(plan.GC).toEqual({ pains: 20, sacs: 1 });
  });

  it('pile un sac : pas de sac en plus', () => {
    const plan = planDeSacs([client({ id: 'a' })], { a: { BAG: '315', KO: '', GC: '' } });
    expect(plan.BAG.sacs).toBe(1);
    expect(plan.KO.sacs).toBe(0);
  });

  it('estime le montant d’un client à son tarif', () => {
    expect(montantEstime(client(), commandes.a)).toBe(120 * 100 + 80 * 70 + 20 * 160);
    expect(montantEstime(client(), undefined)).toBe(0);
  });

  it('repère les habituels sans commande', () => {
    const habituelles = {
      a: { BAG: 10, KO: 0, GC: 0 },
      b: { BAG: 10, KO: 0, GC: 0 },
      c: { BAG: 0, KO: 0, GC: 0 },
    };
    const trois = [...clients, client({ id: 'c', nom: 'Cora' })];
    const manquants = clientsSansCommande(
      trois,
      { ...commandes, a: { BAG: '', KO: '', GC: '' }, c: { BAG: '', KO: '', GC: '' } },
      habituelles,
    );
    // a n'a rien commandé et commande d'habitude ; b a commandé ; c ne commande jamais.
    expect(manquants.map((c) => c.id)).toEqual(['a']);
  });

  it('écrit la commande habituelle', () => {
    expect(texteHabituel({ BAG: 60, KO: 40, GC: 0 })).toBe('60 BAG · 40 KO');
    expect(texteHabituel({ BAG: 1200, KO: 0, GC: 30 })).toBe('1 200 BAG · 30 GC 135');
    expect(texteHabituel(undefined)).toBe('');
  });
});

describe('recherche de client', () => {
  const liste = [
    client({ id: '1', nom: 'Mama Ngono' }),
    client({ id: '2', nom: 'Ebène' }),
    client({ id: '3', nom: 'Hervé' }),
  ];

  it('commence par les premières lettres de n’importe quel mot du nom', () => {
    expect(filtrerClients(liste, 'ng').map((c) => c.id)).toEqual(['1']);
    expect(filtrerClients(liste, 'ma').map((c) => c.id)).toEqual(['1']);
  });

  it('ignore les accents et la casse', () => {
    expect(filtrerClients(liste, 'EBE').map((c) => c.id)).toEqual(['2']);
    expect(filtrerClients(liste, 'herve').map((c) => c.id)).toEqual(['3']);
  });

  it('ne cherche pas au milieu d’un mot', () => {
    expect(filtrerClients(liste, 'gono')).toEqual([]);
  });

  it('une recherche vide garde tout le monde', () => {
    expect(filtrerClients(liste, '  ')).toHaveLength(3);
  });
});
