// pages/_app.tsx
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import { Analytics } from '@vercel/analytics/react';
import Head from 'next/head';
import { useEffect } from 'react';
import { UserProvider } from '../contexts/UserContext';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const maintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';

  useEffect(() => {
    // Перенаправлення на сторінку maintenance
    if (maintenanceMode && router.pathname !== '/maintenance') {
      router.replace('/maintenance');
    }
  }, [maintenanceMode, router]);

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
        <Component {...pageProps} />
        <Analytics />
      </UserProvider>
    </>
  );
}