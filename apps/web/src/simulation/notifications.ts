import type { Profil } from '../profils.ts';
import type { Espace } from '../profils.ts';

export type TexteNotification = { type: string; heure: string; titre: string; detail: string };

export type NotificationSimulee = {
  id: string;
  /** Calculée à l'instant (« En direct ») plutôt que programmée. */
  enDirect: boolean;
  fr: TexteNotification;
  en: TexteNotification;
  /** Écran que « Ouvrir › » atteint ; absent si le profil ne peut pas l'ouvrir. */
  destination: { espace: Espace; cle: string } | null;
};

/**
 * Notifications de la maquette « OptiBoul ERP v2 » au démarrage, par profil (relevées dans le
 * prototype, en français et en anglais). Elles seront produites par les fonctions elles-mêmes :
 * commandes, production, stocks, programmation.
 */
export const NOTIFICATIONS_PAR_PROFIL: Record<Profil, readonly NotificationSimulee[]> = {
  caissier: [
    {
      id: 'caissier-1',
      enDirect: true,
      fr: {
        type: 'Commandes',
        heure: 'En direct',
        titre: '3 clients habituels sans commande',
        detail: 'Brice, Sandrine, Yannick. Relancez-les depuis Session → Commandes.',
      },
      en: {
        type: 'Orders',
        heure: 'Live',
        titre: '3 regular customers have not ordered',
        detail: 'Brice, Sandrine, Yannick. Remind them from Session → Orders.',
      },
      destination: {
        espace: 'comptoir',
        cle: 'session',
      },
    },
    {
      id: 'caissier-2',
      enDirect: true,
      fr: {
        type: 'Production',
        heure: 'En direct',
        titre: 'Reste à produire : 2 013 pains',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · sur 2 013 prévus.',
      },
      en: {
        type: 'Production',
        heure: 'Live',
        titre: 'Left to produce: 2 013 loaves',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · of 2 013 planned.',
      },
      destination: null,
    },
    {
      id: 'caissier-3',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 17:42',
        titre: 'Plan de production validé · nuit du 14 oct.',
        detail: 'Validé par Willy à 17:42. Pétrissage prévu vers 19:00.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 17:42',
        titre: 'Production plan approved · night of Oct 14',
        detail: 'Approved by Willy at 17:42. Kneading planned around 19:00.',
      },
      destination: null,
    },
    {
      id: 'caissier-4',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 16:05',
        titre: 'Programmation de la semaine 43 publiée',
        detail:
          'Du 19 au 25 oct. Gérant : Patrick · production : Serge. Consultez vos créneaux de caisse et de production.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 16:05',
        titre: 'Week 43 schedule published',
        detail:
          'Oct 19–25. Manager: Patrick · production: Serge. Check your cash desk and production slots.',
      },
      destination: null,
    },
  ],
  gerant: [
    {
      id: 'gerant-1',
      enDirect: true,
      fr: {
        type: 'Commandes',
        heure: 'En direct',
        titre: '3 clients habituels sans commande',
        detail: 'Brice, Sandrine, Yannick. Relancez-les depuis Session → Commandes.',
      },
      en: {
        type: 'Orders',
        heure: 'Live',
        titre: '3 regular customers have not ordered',
        detail: 'Brice, Sandrine, Yannick. Remind them from Session → Orders.',
      },
      destination: {
        espace: 'comptoir',
        cle: 'session',
      },
    },
    {
      id: 'gerant-2',
      enDirect: true,
      fr: {
        type: 'Demande',
        heure: 'En direct',
        titre: 'Demande estimée au-dessus du plan · +1 sac(s) suggéré(s)',
        detail: 'BAG +1. Le chef peut augmenter la production depuis Production → Plan.',
      },
      en: {
        type: 'Demand',
        heure: 'Live',
        titre: 'Estimated demand above plan · +1 sack(s) suggested',
        detail: 'BAG +1. The head baker can increase production from Production → Plan.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'gerant-3',
      enDirect: true,
      fr: {
        type: 'Production',
        heure: 'En direct',
        titre: 'Reste à produire : 2 013 pains',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · sur 2 013 prévus.',
      },
      en: {
        type: 'Production',
        heure: 'Live',
        titre: 'Left to produce: 2 013 loaves',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · of 2 013 planned.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'gerant-4',
      enDirect: true,
      fr: {
        type: 'Stock',
        heure: 'En direct',
        titre: 'Contrôle de stock à faire aujourd’hui',
        detail:
          'mer. 14 oct. · Après la production de jour · vers 14:00. Gérant Willy + resp. production Serge.',
      },
      en: {
        type: 'Stock',
        heure: 'Live',
        titre: 'Stock count due today',
        detail:
          'Wed Oct 14 · After the day production · around 14:00. Manager Willy + head baker Serge.',
      },
      destination: {
        espace: 'atelier',
        cle: 'stocks',
      },
    },
    {
      id: 'gerant-5',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 17:42',
        titre: 'Plan de production validé · nuit du 14 oct.',
        detail: 'Validé par Willy à 17:42. Pétrissage prévu vers 19:00.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 17:42',
        titre: 'Production plan approved · night of Oct 14',
        detail: 'Approved by Willy at 17:42. Kneading planned around 19:00.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'gerant-6',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 17:20',
        titre: 'Plan de production proposé par Serge',
        detail: 'Nuit du 14 oct. À valider avant le pétrissage.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 17:20',
        titre: 'Production plan proposed by Serge',
        detail: 'Night of Oct 14. Approve before kneading.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'gerant-7',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 16:05',
        titre: 'Programmation de la semaine 43 publiée',
        detail:
          'Du 19 au 25 oct. Gérant : Patrick · production : Serge. Consultez vos créneaux de caisse et de production.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 16:05',
        titre: 'Week 43 schedule published',
        detail:
          'Oct 19–25. Manager: Patrick · production: Serge. Check your cash desk and production slots.',
      },
      destination: {
        espace: 'gestion',
        cle: 'semaines',
      },
    },
  ],
  production: [
    {
      id: 'production-1',
      enDirect: true,
      fr: {
        type: 'Demande',
        heure: 'En direct',
        titre: 'Demande estimée au-dessus du plan · +1 sac(s) suggéré(s)',
        detail: 'BAG +1. Le chef peut augmenter la production depuis Production → Plan.',
      },
      en: {
        type: 'Demand',
        heure: 'Live',
        titre: 'Estimated demand above plan · +1 sack(s) suggested',
        detail: 'BAG +1. The head baker can increase production from Production → Plan.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'production-2',
      enDirect: true,
      fr: {
        type: 'Production',
        heure: 'En direct',
        titre: 'Reste à produire : 2 013 pains',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · sur 2 013 prévus.',
      },
      en: {
        type: 'Production',
        heure: 'Live',
        titre: 'Left to produce: 2 013 loaves',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · of 2 013 planned.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'production-3',
      enDirect: true,
      fr: {
        type: 'Stock',
        heure: 'En direct',
        titre: 'Contrôle de stock à faire aujourd’hui',
        detail:
          'mer. 14 oct. · Après la production de jour · vers 14:00. Gérant Willy + resp. production Serge.',
      },
      en: {
        type: 'Stock',
        heure: 'Live',
        titre: 'Stock count due today',
        detail:
          'Wed Oct 14 · After the day production · around 14:00. Manager Willy + head baker Serge.',
      },
      destination: {
        espace: 'atelier',
        cle: 'stocks',
      },
    },
    {
      id: 'production-4',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 17:42',
        titre: 'Plan de production validé · nuit du 14 oct.',
        detail: 'Validé par Willy à 17:42. Pétrissage prévu vers 19:00.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 17:42',
        titre: 'Production plan approved · night of Oct 14',
        detail: 'Approved by Willy at 17:42. Kneading planned around 19:00.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'production-5',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 16:05',
        titre: 'Programmation de la semaine 43 publiée',
        detail:
          'Du 19 au 25 oct. Gérant : Patrick · production : Serge. Consultez vos créneaux de caisse et de production.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 16:05',
        titre: 'Week 43 schedule published',
        detail:
          'Oct 19–25. Manager: Patrick · production: Serge. Check your cash desk and production slots.',
      },
      destination: {
        espace: 'atelier',
        cle: 'semaines',
      },
    },
  ],
  proprietaire: [
    {
      id: 'proprietaire-1',
      enDirect: true,
      fr: {
        type: 'Commandes',
        heure: 'En direct',
        titre: '3 clients habituels sans commande',
        detail: 'Brice, Sandrine, Yannick. Relancez-les depuis Session → Commandes.',
      },
      en: {
        type: 'Orders',
        heure: 'Live',
        titre: '3 regular customers have not ordered',
        detail: 'Brice, Sandrine, Yannick. Remind them from Session → Orders.',
      },
      destination: {
        espace: 'comptoir',
        cle: 'session',
      },
    },
    {
      id: 'proprietaire-2',
      enDirect: true,
      fr: {
        type: 'Demande',
        heure: 'En direct',
        titre: 'Demande estimée au-dessus du plan · +1 sac(s) suggéré(s)',
        detail: 'BAG +1. Le chef peut augmenter la production depuis Production → Plan.',
      },
      en: {
        type: 'Demand',
        heure: 'Live',
        titre: 'Estimated demand above plan · +1 sack(s) suggested',
        detail: 'BAG +1. The head baker can increase production from Production → Plan.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'proprietaire-3',
      enDirect: true,
      fr: {
        type: 'Production',
        heure: 'En direct',
        titre: 'Reste à produire : 2 013 pains',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · sur 2 013 prévus.',
      },
      en: {
        type: 'Production',
        heure: 'Live',
        titre: 'Left to produce: 2 013 loaves',
        detail: 'BAG : 945 · KO : 852 · GC 135 : 216 · of 2 013 planned.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'proprietaire-4',
      enDirect: true,
      fr: {
        type: 'Stock',
        heure: 'En direct',
        titre: 'Contrôle de stock à faire aujourd’hui',
        detail:
          'mer. 14 oct. · Après la production de jour · vers 14:00. Gérant Willy + resp. production Serge.',
      },
      en: {
        type: 'Stock',
        heure: 'Live',
        titre: 'Stock count due today',
        detail:
          'Wed Oct 14 · After the day production · around 14:00. Manager Willy + head baker Serge.',
      },
      destination: {
        espace: 'atelier',
        cle: 'stocks',
      },
    },
    {
      id: 'proprietaire-5',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 17:42',
        titre: 'Plan de production validé · nuit du 14 oct.',
        detail: 'Validé par Willy à 17:42. Pétrissage prévu vers 19:00.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 17:42',
        titre: 'Production plan approved · night of Oct 14',
        detail: 'Approved by Willy at 17:42. Kneading planned around 19:00.',
      },
      destination: {
        espace: 'atelier',
        cle: 'production',
      },
    },
    {
      id: 'proprietaire-6',
      enDirect: false,
      fr: {
        type: 'Programmation',
        heure: '14 oct. 16:05',
        titre: 'Programmation de la semaine 43 publiée',
        detail:
          'Du 19 au 25 oct. Gérant : Patrick · production : Serge. Consultez vos créneaux de caisse et de production.',
      },
      en: {
        type: 'Schedule',
        heure: 'Oct 14 16:05',
        titre: 'Week 43 schedule published',
        detail:
          'Oct 19–25. Manager: Patrick · production: Serge. Check your cash desk and production slots.',
      },
      destination: {
        espace: 'gestion',
        cle: 'semaines',
      },
    },
  ],
  administrateur: [],
};
