import '../styles/globals.css';
import type { AppProps } from 'next/app';
import 'leaflet/dist/leaflet.css';
import { Analytics } from '@vercel/analytics/react'; 

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics /> 
    </>
  );
}