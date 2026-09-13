// Канонічні посилання на сторінки сайту — щоб агент міг послатися на джерело.
//
// Формати ті самі, що будує сам сайт: /settlement — як у pages/record/[id].tsx
// і pages/key/[id].tsx, /case — як у pages/record/[id].tsx.

export const SITE_URL = (process.env.SITE_URL || 'https://inventarium.org.ua').replace(/\/+$/, '');

// Кодуємо лише те, що ламає URL чи markdown-посилання. Кирилицю лишаємо як є:
// браузер закодує її сам, а в percent-кодуванні кожна літера — шість символів,
// і посилання на населений пункт виходило б на пів тисячі символів у відповіді агента.
const param = (value: string) => value.replace(/[%&=#+?\s()[\]<>"]/g, (c) => encodeURIComponent(c));

const query = (params: [string, string | null | undefined][]) =>
  params
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${param(value as string)}`)
    .join('&');

export const recordUrl = (id: string) => `${SITE_URL}/record/${id}`;

export const caseUrl = (signature: string) => `${SITE_URL}/case?${query([['case_signature', signature]])}`;

export const keyUrl = (id: string) => `${SITE_URL}/key/${id}`;

export const unidentifiedUrl = (id: string) => `${SITE_URL}/unidentified/${id}`;

export const searchUrl = (text: string) => `${SITE_URL}/search?${query([['q', text]])}`;

export const cobookProjectUrl = (link: string) => `https://cobook.today/${link}`;

/** Сторінка населеного пункту; без повного шляху вона нічого не покаже — тоді null. */
export function settlementUrl(place: {
  country?: string | null;
  region?: string | null;
  district?: string | null;
  community?: string | null;
  name?: string | null;
}): string | null {
  if (!place.name || !place.region || !place.district || !place.community) return null;
  return `${SITE_URL}/settlement?${query([
    ['current_country', place.country],
    ['current_region', place.region],
    ['current_district', place.district],
    ['current_community', place.community],
    ['current_settlement_name', place.name],
  ])}`;
}
