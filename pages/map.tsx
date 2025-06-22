import dynamic from 'next/dynamic';

const MapPageComponent = dynamic(() => import('../components/MapPageComponent'), { ssr: false });

export default MapPageComponent;
