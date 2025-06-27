import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'leaflet/dist/leaflet.css';
import { Analytics } from '@vercel/analytics/react';
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        {/* Можна також додати PNG-версію:
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" /> */}
        <title>Inventarium</title> {/* Опціонально */}
      </Head>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}