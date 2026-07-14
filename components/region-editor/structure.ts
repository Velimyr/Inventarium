// Логіка редактора регіональної структури: розбір завантаженого JSON,
// збірка назад у вкладений вигляд та перевірка повноти даних.

export interface SettlementPoint {
    name: string;
    code: string;
    type: string;
    lat: number;
    lon: number;
}

// Точка з «розгорнутим» шляхом — саме з таким виглядом працює таблиця
export interface FlatPoint extends SettlementPoint {
    id: string;
    country: string;
    region: string;
    district: string;
    community: string;
}

// Вкладена структура з країною (вихідний формат)
export interface NestedWithCountry {
    [country: string]: {
        [region: string]: {
            [district: string]: {
                [community: string]: SettlementPoint[];
            };
        };
    };
}

export type GroupLevel = 'country' | 'region' | 'district' | 'community';

export const GROUP_LEVELS: GroupLevel[] = ['country', 'region', 'district', 'community'];

export const LEVEL_LABELS: Record<GroupLevel, string> = {
    country: 'Країна',
    region: 'Область',
    district: 'Район',
    community: 'Громада',
};

export interface ParseResult {
    points: FlatPoint[];
    hadCountry: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Скільки рівнів вкладеності до масиву точок: 3 — старий формат, 4 — вже з країною
function detectDepth(node: unknown, depth = 0): number | null {
    if (Array.isArray(node)) return depth;
    if (!isPlainObject(node)) return null;

    for (const key of Object.keys(node)) {
        const found = detectDepth(node[key], depth + 1);
        if (found !== null) return found;
    }
    return null;
}

function asString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
}

function asNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value.replace(',', '.'));
    return NaN;
}

export function parseStructure(raw: unknown): ParseResult {
    if (!isPlainObject(raw)) {
        throw new Error('У корені файлу очікується JSON-обʼєкт.');
    }

    const depth = detectDepth(raw);
    if (depth !== 3 && depth !== 4) {
        throw new Error(
            'Не вдалося розпізнати формат. Очікується «область → район → громада → [точки]» ' +
            'або «країна → область → район → громада → [точки]».',
        );
    }

    const hadCountry = depth === 4;
    const points: FlatPoint[] = [];
    let seq = 0;

    const collect = (
        list: unknown,
        path: { country: string; region: string; district: string; community: string },
    ) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            if (!isPlainObject(item)) continue;
            points.push({
                id: `p${seq++}`,
                name: asString(item.name),
                code: asString(item.code),
                type: asString(item.type),
                lat: asNumber(item.lat),
                lon: asNumber(item.lon),
                ...path,
            });
        }
    };

    // Обходимо дерево, підставляючи порожню країну для старого формату
    const countries = hadCountry ? Object.keys(raw) : [''];
    for (const country of countries) {
        const regionsNode = hadCountry ? raw[country] : raw;
        if (!isPlainObject(regionsNode)) continue;

        for (const region of Object.keys(regionsNode)) {
            const districtsNode = regionsNode[region];
            if (!isPlainObject(districtsNode)) continue;

            for (const district of Object.keys(districtsNode)) {
                const communitiesNode = districtsNode[district];
                if (!isPlainObject(communitiesNode)) continue;

                for (const community of Object.keys(communitiesNode)) {
                    collect(communitiesNode[community], { country, region, district, community });
                }
            }
        }
    }

    if (points.length === 0) {
        throw new Error('У файлі не знайдено жодної точки.');
    }

    return { points, hadCountry };
}

export function buildNested(points: FlatPoint[]): NestedWithCountry {
    const out: NestedWithCountry = {};

    for (const p of points) {
        if (!out[p.country]) out[p.country] = {};
        const regions = out[p.country];

        if (!regions[p.region]) regions[p.region] = {};
        const districts = regions[p.region];

        if (!districts[p.district]) districts[p.district] = {};
        const communities = districts[p.district];

        if (!communities[p.community]) communities[p.community] = [];

        communities[p.community].push({
            name: p.name,
            code: p.code,
            type: p.type,
            lat: p.lat,
            lon: p.lon,
        });
    }

    return out;
}

export type ProblemCode =
    | 'missing_country' | 'missing_region' | 'missing_district' | 'missing_community'
    | 'missing_name' | 'missing_code' | 'missing_type'
    | 'bad_lat' | 'bad_lon';

export const PROBLEM_LABELS: Record<ProblemCode, string> = {
    missing_country: 'не заповнено «Країна»',
    missing_region: 'не заповнено «Область»',
    missing_district: 'не заповнено «Район»',
    missing_community: 'не заповнено «Громада»',
    missing_name: 'не заповнено назву',
    missing_code: 'не заповнено код',
    missing_type: 'не заповнено тип',
    bad_lat: 'некоректна широта',
    bad_lon: 'некоректна довгота',
};

// Порожній рівень групування зробив би у файлі ключ "" — такі помилки не прощаються ніколи
const ALWAYS_BLOCKING: ProblemCode[] = [
    'missing_country', 'missing_region', 'missing_district', 'missing_community',
];

export function isAlwaysBlocking(code: ProblemCode): boolean {
    return ALWAYS_BLOCKING.includes(code);
}

export interface PointIssue {
    id: string;
    name: string;
    codes: ProblemCode[];
}

export interface ValidationReport {
    issues: PointIssue[];
    duplicateCodes: string[];          // лише попередження
}

export function describeIssue(issue: PointIssue): string {
    return issue.codes.map(code => PROBLEM_LABELS[code]).join(', ');
}

export function validatePoints(points: FlatPoint[]): ValidationReport {
    const issues: PointIssue[] = [];
    const codeCounts = new Map<string, number>();

    for (const p of points) {
        const codes: ProblemCode[] = [];

        if (!p.country.trim()) codes.push('missing_country');
        if (!p.region.trim()) codes.push('missing_region');
        if (!p.district.trim()) codes.push('missing_district');
        if (!p.community.trim()) codes.push('missing_community');

        if (!p.name.trim()) codes.push('missing_name');
        if (!p.code.trim()) codes.push('missing_code');
        if (!p.type.trim()) codes.push('missing_type');

        if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) codes.push('bad_lat');
        if (!Number.isFinite(p.lon) || p.lon < -180 || p.lon > 180) codes.push('bad_lon');

        if (codes.length) {
            issues.push({ id: p.id, name: p.name || '(без назви)', codes });
        }

        const code = p.code.trim();
        if (code) codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }

    const duplicateCodes: string[] = [];
    codeCounts.forEach((count, code) => {
        if (count > 1) duplicateCodes.push(code);
    });

    return { issues, duplicateCodes };
}

// Знімок дефектів, які вже були у завантаженому файлі. Потрібен, щоб відрізнити
// «це зіпсував редактор» (блокуємо завжди) від «так уже було в джерелі»
// (можна свідомо пропустити). Рівні групування сюди не потрапляють — див. ALWAYS_BLOCKING.
export function problemSnapshot(points: FlatPoint[]): Map<string, Set<ProblemCode>> {
    const snapshot = new Map<string, Set<ProblemCode>>();

    for (const issue of validatePoints(points).issues) {
        const inheritable = issue.codes.filter(code => !isAlwaysBlocking(code));
        if (inheritable.length) snapshot.set(issue.id, new Set(inheritable));
    }

    return snapshot;
}

export interface SplitIssues {
    blocking: PointIssue[];    // країна/рівні групування або нові помилки редактора
    inherited: PointIssue[];   // прогалини, що вже були у вихідному файлі
}

export function splitIssues(
    issues: PointIssue[],
    snapshot: Map<string, Set<ProblemCode>>,
): SplitIssues {
    const blocking: PointIssue[] = [];
    const inherited: PointIssue[] = [];

    for (const issue of issues) {
        const known = snapshot.get(issue.id);
        const blockingCodes = issue.codes.filter(
            code => isAlwaysBlocking(code) || !known?.has(code),
        );
        const inheritedCodes = issue.codes.filter(
            code => !isAlwaysBlocking(code) && known?.has(code),
        );

        if (blockingCodes.length) blocking.push({ ...issue, codes: blockingCodes });
        if (inheritedCodes.length) inherited.push({ ...issue, codes: inheritedCodes });
    }

    return { blocking, inherited };
}

// Обмеження на батьківський рівень: одне значення (форми редагування)
// або кілька (фільтри з множинним вибором). Порожнє — «будь-яке».
export type LevelFilter = string | string[] | undefined;

function matchesFilter(value: string, filter: LevelFilter): boolean {
    if (!filter) return true;
    if (Array.isArray(filter)) return filter.length === 0 || filter.includes(value);
    return value === filter;
}

// Унікальні значення рівня серед точок, що відповідають уже вибраним «батькам»
export function levelOptions(
    points: FlatPoint[],
    level: GroupLevel,
    parents: Partial<Record<GroupLevel, LevelFilter>> = {},
): string[] {
    const parentLevels = GROUP_LEVELS.slice(0, GROUP_LEVELS.indexOf(level));
    const values = new Set<string>();

    for (const p of points) {
        const matches = parentLevels.every(parent => matchesFilter(p[parent], parents[parent]));
        if (matches && p[level]) values.add(p[level]);
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b, 'uk'));
}
