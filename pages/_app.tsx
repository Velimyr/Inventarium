// pages/_app.tsx
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import '../styles/marker-cluster.css'; 
import { Analytics } from '@vercel/analytics/react';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect, useState, ReactNode } from 'react';
import { UserProvider, useUser } from '../contexts/UserContext';
import { useRouter } from 'next/router';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { supabase } from '../lib/supabaseClient';
import { isAdminUser } from '../lib/adminUsers';

const maintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';

// Сторінки, доступні під час технічних робіт: сама заглушка,
// вхід (інакше адмін не зможе авторизуватися, щоб отримати доступ)
// і редактор структури регіонів (має працювати навіть під час робіт)
const MAINTENANCE_ALLOWED_PATHS = ['/maintenance', '/auth', '/region_structure_editor'];

// Під час технічних робіт усіх ведемо на /maintenance, окрім адміністраторів
function MaintenanceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!maintenanceMode || loading) return;

    let cancelled = false;
    (async () => {
      const hasAdminAccess = await isAdminUser(supabase, user?.id);
      if (cancelled) return;
      setIsAdmin(hasAdminAccess);
      setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const allowed = MAINTENANCE_ALLOWED_PATHS.includes(router.pathname);
  const blocked = maintenanceMode && checked && !isAdmin && !allowed;

  useEffect(() => {
    if (blocked) {
      router.replace('/maintenance');
    }
  }, [blocked, router]);

  if (!maintenanceMode || allowed) {
    return <>{children}</>;
  }

  // Поки не знаємо роль (або вже редіректимо) — контент не показуємо
  if (!checked || blocked) return null;

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // 🧠 Іконки Leaflet ініціалізуємо тільки на клієнті
    (async () => {
      const L = await import('leaflet');

      delete (L.Icon.Default.prototype as any)._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/marker-icon-2x.png',
        iconUrl: '/marker-icon.png',
        shadowUrl: '/marker-shadow.png',
      });
    })();
  }, []);

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <title>Inventarium</title>
      </Head>
      <UserProvider>
        <MaintenanceGate>
          <Component {...pageProps} />
        </MaintenanceGate>
        <Analytics />
      </UserProvider>
      <SpeedInsights/>
      <Script
        src="https://descriptor-strider-ai.vercel.app/widget.js"
        data-partner-key="blkch_3400f0916fe2a601b8f24fb3e4171f343e78885943a842ff9a213ba07a40072a"
        data-partner-id="inventarium"
        strategy="afterInteractive"
      />
    </>
  );
}