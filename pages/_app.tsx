import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'leaflet/dist/leaflet.css';
import { Analytics } from '@vercel/analytics/react';
import Head from 'next/head';
import { UserProvider } from '../contexts/UserContext';

export default function App({ Component, pageProps }: AppProps) {
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