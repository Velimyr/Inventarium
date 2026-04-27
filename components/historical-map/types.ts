export interface AreaFeatureProperties {
  name: string;
  nameOriginal?: string;
  nameLatin?: string;
  higherDivision: string;
  country: string;
  center?: string;
  years?: string;
  description?: string;
}

export interface PointFeatureProperties {
  name: string;
  adminLevel: number;
}

export interface TimePeriodConfig {
  id: string;
  label: string;
  areasFile: string;
  bordersFile: string;
  pointsFile: string;
}

export interface FlagIcon {
  name: string;
  lang: string;
  iconUrl: string;
}

export interface PeriodData {
  areas: GeoJSON.FeatureCollection;
  borders: GeoJSON.FeatureCollection;
  points: GeoJSON.FeatureCollection;
}
