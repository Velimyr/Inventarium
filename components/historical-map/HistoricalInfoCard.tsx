import { FLAG_ICONS } from './constants';
import type { AreaFeatureProperties } from './types';

interface Props {
  region: AreaFeatureProperties | null;
}

export default function HistoricalInfoCard({ region }: Props) {
  if (!region) return null;

  const countryInfo = FLAG_ICONS.find((i) => i.name === region.country);
  const showDivision =
    region.higherDivision !== region.name && region.higherDivision !== region.country;

  return (
    <div className="fixed left-2 bottom-2 md:left-4 md:bottom-4 z-[1000] max-w-[calc(100vw-1rem)] md:max-w-sm bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 md:p-4 pointer-events-none">
      <h2 className="m-0 text-base md:text-lg text-slate-900 dark:text-slate-100 font-bold">
        {region.name}
      </h2>
      {showDivision && (
        <h3 className="font-normal text-xs md:text-sm mt-1 mb-1 text-slate-600 dark:text-slate-400">
          {region.higherDivision}
        </h3>
      )}
      {region.country && (
        <h4 className="font-normal mt-1 mb-2 text-slate-600 dark:text-slate-400 flex items-center gap-2 text-xs md:text-sm">
          {countryInfo && (
            <img
              src={countryInfo.iconUrl}
              className="h-2.5 object-contain shrink-0"
              alt={countryInfo.name}
              loading="lazy"
            />
          )}
          {region.country}
        </h4>
      )}
      <dl className="grid grid-cols-[fit-content(140px)_1fr] gap-x-2 gap-y-0.5 text-xs md:text-sm">
        {region.nameOriginal && countryInfo && (
          <Row label={`Назва ${countryInfo.lang}`} value={region.nameOriginal} />
        )}
        {region.nameLatin && <Row label="Назва латиною" value={region.nameLatin} />}
        {region.center && <Row label="Центр" value={region.center} />}
        {region.years && <Row label="Роки існування" value={region.years} />}
        {region.description && <Row label="Додатково" value={region.description} />}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-900 dark:text-slate-200 font-semibold">{label}:</dt>
      <dd className="text-slate-700 dark:text-slate-400">{value}</dd>
    </>
  );
}
