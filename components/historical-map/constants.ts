import L from 'leaflet';
import 'leaflet.pattern';
import type { TimePeriodConfig, FlagIcon } from './types';

export const TIME_PERIODS: Record<string, TimePeriodConfig> = {
  PERIOD_1640: {
    id: '1640',
    label: '1640',
    areasFile: 'areas-1640',
    bordersFile: 'borders-1640',
    pointsFile: 'points-1640',
  },
  PERIOD_1760: {
    id: '1760',
    label: '1760',
    areasFile: 'areas-1760',
    bordersFile: 'borders-1760',
    pointsFile: 'points-1760',
  },
};

export const KINGDOM_NAME_MAP: Record<string, string> = {
  Poland: 'Річ Посполита',
  Moldavia: 'Молдавське князівство',
  Hungary: 'Угорське королівство (Габсбурзька монархія)',
  Transylvania: 'Трансильванське князівство',
  Russia: 'московська імперія',
  Turkey: 'Османська імперія',
};

export const COUNTIES_NAME_MAP: Record<string, string> = {
  Rus: 'Руське воєводство',
  Belz: 'Белзьке воєводство',
  Brest: 'Берестейське воєводство',
  Volyn: 'Волинське воєводство',
  Podil: 'Подільське воєводство',
  Bratslav: 'Брацлавське воєводство',
  Kyiv: 'Київське воєводство',
  Chernihiv: 'Чернігівське воєводство',
  Hetmanate: 'Гетьманщина',
  Zvenyhorodka: 'Київське/Брацлавське воєводство',
  Lubech: 'Київське/Смоленське воєводство',
  Slobozhanshchyna: 'Слобідські козацькі полки',
  Zaporizhzhia: 'Військо Запорозьке Низове',
  Spis: 'Краківське воєводство',
};

export const FLAG_ICONS: FlagIcon[] = [
  { name: KINGDOM_NAME_MAP.Poland, lang: 'польською', iconUrl: '/icons/historical/poland.png' },
  { name: KINGDOM_NAME_MAP.Hungary, lang: 'угорською', iconUrl: '/icons/historical/habsburg.png' },
  { name: KINGDOM_NAME_MAP.Moldavia, lang: 'румунською', iconUrl: '/icons/historical/moldavia.png' },
  { name: KINGDOM_NAME_MAP.Transylvania, lang: 'угорською', iconUrl: '/icons/historical/transylvania.png' },
  { name: KINGDOM_NAME_MAP.Turkey, lang: 'османською', iconUrl: '/icons/historical/turkey.png' },
  { name: KINGDOM_NAME_MAP.Russia, lang: 'російською', iconUrl: '/icons/historical/russia.png' },
];

export const STYLES = {
  BaseBorderStyle: { weight: 3, opacity: 0.5, color: '#000' },
  DarkBorderStyle: { weight: 3, opacity: 0.5, color: '#aaa' },
  BaseFeatureStyle: { weight: 1.5, opacity: 0.5, color: '#000', dashArray: '4, 4', fillOpacity: 0.1 },
  DarkFeatureStyle: { weight: 1.5, opacity: 0.5, color: '#aaa', dashArray: '4, 4', fillOpacity: 0.15 },
  HoverFeatureStyle: { weight: 5, color: '#000', opacity: 0.8, fillOpacity: 0.3 },
  DarkHoverFeatureStyle: { weight: 5, color: '#aaa', opacity: 0.8, fillOpacity: 0.4 },
  BaseMarkerStyle: { radius: 8, fillColor: '#fff', color: '#000', weight: 1, opacity: 1, fillOpacity: 1 },
  FeatureFillColors: {
    Purple: '#8A2BE2',
    DarkPurple: '#663399',
    Brown: '#A52A2A',
    Crimson: '#DC143C',
    Cyan: '#008B8B',
    Pink: '#FF1493',
    Green: '#006400',
    Olive: '#808000',
    Blue: '#1E90FF',
    Gold: '#FFD700',
    Orange: '#FFA500',
    OrangeRed: '#FF4500',
    Default: '#666',
  },
  MarkerFillColors: {
    LEVEL1: '#ea580c',
    LEVEL2: '#ea580c',
    LEVEL3: '#fdba74',
  },
} as const;

let _stripePattern: any | null = null;
export function getStripePattern(): any {
  if (_stripePattern) return _stripePattern;
  // @ts-ignore
  _stripePattern = new L.StripePattern({
    color: STYLES.FeatureFillColors.Cyan,
    spaceColor: STYLES.FeatureFillColors.Pink,
    opacity: 1.0,
    spaceOpacity: 1.0,
    weight: 4,
    spaceWeight: 4,
    angle: 315,
  });
  return _stripePattern;
}

export function getDivisionColorMap(): Record<string, string | any> {
  const stripe = getStripePattern();
  return {
    [COUNTIES_NAME_MAP.Kyiv]: STYLES.FeatureFillColors.Cyan,
    [COUNTIES_NAME_MAP.Zvenyhorodka]: stripe,
    [COUNTIES_NAME_MAP.Lubech]: stripe,
    [COUNTIES_NAME_MAP.Rus]: STYLES.FeatureFillColors.Blue,
    [COUNTIES_NAME_MAP.Volyn]: STYLES.FeatureFillColors.Purple,
    [COUNTIES_NAME_MAP.Chernihiv]: STYLES.FeatureFillColors.DarkPurple,
    [COUNTIES_NAME_MAP.Belz]: STYLES.FeatureFillColors.Crimson,
    [COUNTIES_NAME_MAP.Podil]: STYLES.FeatureFillColors.Olive,
    [COUNTIES_NAME_MAP.Bratslav]: STYLES.FeatureFillColors.Pink,
    [COUNTIES_NAME_MAP.Brest]: STYLES.FeatureFillColors.Gold,
    [KINGDOM_NAME_MAP.Moldavia]: STYLES.FeatureFillColors.OrangeRed,
    [KINGDOM_NAME_MAP.Hungary]: STYLES.FeatureFillColors.Green,
    [KINGDOM_NAME_MAP.Transylvania]: STYLES.FeatureFillColors.Gold,
    [KINGDOM_NAME_MAP.Turkey]: STYLES.FeatureFillColors.DarkPurple,
    [COUNTIES_NAME_MAP.Hetmanate]: STYLES.FeatureFillColors.DarkPurple,
    [COUNTIES_NAME_MAP.Zaporizhzhia]: STYLES.FeatureFillColors.Gold,
    [COUNTIES_NAME_MAP.Slobozhanshchyna]: STYLES.FeatureFillColors.Blue,
    [COUNTIES_NAME_MAP.Spis]: stripe,
  };
}
