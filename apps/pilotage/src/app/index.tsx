import { useTranslation } from '@optiboul/i18n';
import { COULEURS, creneauDe } from '@optiboul/utils';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/** Écrans prévus, reliés aux récits du backlog produit (parcours P11). */
const SECTIONS = [
  { libelle: 'Demandes à valider', recit: 'US-071' },
  { libelle: 'Demandes escaladées', recit: 'US-072' },
  { libelle: 'Alertes', recit: 'US-132' },
  { libelle: 'Indicateurs du jour et du mois', recit: 'US-131' },
  { libelle: 'Notifications regroupées', recit: 'US-073' },
] as const;

export default function Accueil() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: `OptiBoul · ${t('applications.pilotage')}` }} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.titre}>{t('accueil.tableauDeBord')}</Text>
        <Text style={styles.creneau}>{t(`creneau.${creneauDe(new Date())}`)}</Text>
        {SECTIONS.map((section) => (
          <View key={section.recit} style={styles.carte}>
            <Text style={styles.libelle}>{section.libelle}</Text>
            <Text style={styles.recit}>
              {section.recit} · {t('commun.bientot')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  titre: { fontSize: 24, fontWeight: '700', color: COULEURS.chocolat },
  creneau: { color: COULEURS.chocolat, opacity: 0.7 },
  carte: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: COULEURS.or,
    padding: 16,
    minHeight: 44,
  },
  libelle: { fontSize: 16, fontWeight: '600', color: COULEURS.chocolat },
  recit: { marginTop: 4, color: COULEURS.chocolat, opacity: 0.7 },
});
