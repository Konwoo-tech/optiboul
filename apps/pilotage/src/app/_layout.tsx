import { configurerApi } from '@optiboul/api-client';
import { initI18n } from '@optiboul/i18n';
import { COULEURS } from '@optiboul/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

initI18n();
// L'API est atteinte par le tunnel : seule l'entrée distante /api est exposée (spécification §7).
configurerApi({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  application: 'pilotage',
  credentials: 'include',
});

const queryClient = new QueryClient();

export default function Layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COULEURS.chocolat },
          headerTintColor: COULEURS.creme,
          contentStyle: { backgroundColor: COULEURS.creme },
        }}
      />
    </QueryClientProvider>
  );
}
