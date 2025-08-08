import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'leaflet/dist/leaflet.css';
import { Analytics } from '@vercel/analytics/react';
import Head from 'next/head';
import { useEffect } from 'react';
import { UserProvider } from '../contexts/UserContext';

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
        <Component {...pageProps} />
        <Analytics />
      </UserProvider>
    </>
  );
}
