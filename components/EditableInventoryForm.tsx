import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';
import SignatureListInput from '../components/SignatureListInput';
import SignatureHelp from '../components/SignatureHelp';
import HelpTooltip from '../components/HelpTooltip';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  fetchRegionStructure, findCountryByRegion, listCountries, listRegions,
  listDistricts, listCommunities, listSettlements, type NestedStructure,
} from './keys/regionData';
import {
  ARCHIVE_PART_FIELDS,
  buildCaseSignature,
  hasAllArchiveParts,
  hasAnyArchivePart,
  isArchivePartField,
} from '../lib/caseSignature';

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

interface Settlement {
  name: string;
  code: string;
  type: string;
  lat: number | null;
  lon: number | null;
}

interface EditableInventoryFormProps {
  data: any;
  onChange: (data: any) => void;
  onSubmit?: (data: any) => Promise<void>;
  duplicateWarning?: string | null;
}

export default function EditableInventoryForm({ data, onChange, onSubmit, duplicateWarning }: EditableInventoryFormProps) {
  const [formData, setFormData] = useState(data);
  const [manualEntry, setManualEntry] = useState(false);
  const [nestedData, setNestedData] = useState<NestedStructure | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementTypes, setSettlementTypes] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  type ArchiveItem = {
    short_name: string;
    full_name_ukr: string;
    country: string;
  };

  const [archives, setArchives] = useState<ArchiveItem[]>([]);

  useEffect(() => {
    fetch('/data/archives.json')
      .then((res) => res.json())
      .then((data: ArchiveItem[]) => {
        const ukrainianArchives = data.filter(item => item.country === 'Україна');
        setArchives(ukrainianArchives);
      })
      .catch((err) => console.error('Не вдалося завантажити архіви:', err));
  }, []);

  useEffect(() => {
    fetchRegionStructure()
      .then((json) => setNestedData(json))
      .catch((err) => console.error('Failed to load region_structure.json', err));
  }, []);

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      const cleaned = {
        ...data,
        inventory_year: data.inventory_year ?? '',
        pages_count: data.pages_count ?? '',
        inventory_start_page: data.inventory_start_page ?? '',
      };
      setFormData(cleaned);
    }
  }, [data?.id]);

  useEffect(() => {
    if (data?.email && (!formData.email || formData.email === '')) {
      setFormData((prev) => ({ ...prev, email: data.email }));
    }
  }, [data?.email]);

  useEffect(() => {
    onChange(formData);
  }, [formData, onChange]);

  // Записи, збережені до появи рівня країни, мають область без країни —
  // визначаємо її з довідника, бо назви областей унікальні між країнами
  useEffect(() => {
    if (nestedData && !manualEntry && !formData.current_country && formData.current_region) {
      const country = findCountryByRegion(nestedData, formData.current_region);
      if (country) setFormData((fd: any) => ({ ...fd, current_country: country }));
    }
  }, [formData.current_country, formData.current_region, nestedData, manualEntry]);

  useEffect(() => {
    if (!manualEntry) setRegions(listRegions(nestedData, formData.current_country));
  }, [formData.current_country, nestedData, manualEntry]);

  useEffect(() => {
    if (!manualEntry) {
      setDistricts(listDistricts(nestedData, formData.current_country, formData.current_region));
    }
  }, [formData.current_country, formData.current_region, nestedData, manualEntry]);

  useEffect(() => {
    if (!manualEntry) {
      setCommunities(listCommunities(
        nestedData, formData.current_country, formData.current_region, formData.current_district,
      ));
    }
  }, [formData.current_country, formData.current_district, formData.current_region, nestedData, manualEntry]);

  useEffect(() => {
    if (!manualEntry) {
      const settlementsData = listSettlements(
        nestedData, formData.current_country, formData.current_region,
        formData.current_district, formData.current_community,
      );
      setSettlements(settlementsData);
      setSettlementTypes(Array.from(new Set(settlementsData.map((s) => s.type))));
    }
  }, [formData.current_country, formData.current_community, formData.current_district,
      formData.current_region, nestedData, manualEntry]);

  useEffect(() => {
    if (!manualEntry && formData.current_settlement_type && formData.current_settlement_name) {
      const settlement = settlements.find(
        (s) => s.type === formData.current_settlement_type && s.name === formData.current_settlement_name
      );
      if (settlement) {
        setFormData((fd: any) => ({
          ...fd,
          latitude: settlement.lat !== null ? settlement.lat.toString() : '',
          longitude: settlement.lon !== null ? settlement.lon.toString() : '',
        }));
      }
    }
  }, [formData.current_settlement_name, formData.current_settlement_type, settlements, manualEntry]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const { name } = target;

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      const checked = target.checked;
      if (name === 'manualEntry') {
        setManualEntry(checked);
        if (checked) {
          setFormData((fd: any) => ({
            ...fd,
            current_country: '',
            current_region: '',
            current_district: '',
            current_community: '',
            current_settlement_type: '',
            current_settlement_name: '',
            latitude: '',
            longitude: '',
          }));
        } else {
          setFormData((fd: any) => ({ ...fd, latitude: '', longitude: '' }));
        }
      } else {
        setFormData((fd: any) => ({ ...fd, [name]: checked }));
      }
    } else {
      const value = target.value;
      const updated = { ...formData, [name]: value };

      // Зміна рівня адмінподілу скидає все, що під ним: інакше в записі
      // лишається район від попередньої області
      const RESETS_BELOW: Record<string, string[]> = {
        current_country: ['current_region', 'current_district', 'current_community',
                          'current_settlement_type', 'current_settlement_name'],
        current_region: ['current_district', 'current_community',
                         'current_settlement_type', 'current_settlement_name'],
        current_district: ['current_community', 'current_settlement_type', 'current_settlement_name'],
        current_community: ['current_settlement_type', 'current_settlement_name'],
      };
      if (!manualEntry && RESETS_BELOW[name]) {
        for (const field of RESETS_BELOW[name]) updated[field] = '';
        updated.latitude = '';
        updated.longitude = '';
      }

      // Перемикач чистить протилежну гілку. Інакше приховані архів/фонд/опис/
      // справа лишаються від попередньо збереженого запису і їдуть у базу разом
      // із вручну введеним іноземним шифром.
      if (name === 'is_ukrainian_archive') {
        if (value === 'Ні') {
          for (const field of ARCHIVE_PART_FIELDS) updated[field] = '';
        } else {
          updated.case_signature = '';
        }
      }

      // Перегенеровуємо шифр лише коли змінили саме його складові, а не будь-яке
      // поле форми: інакше правка населеного пункту мовчки затирає шифр.
      if (
        updated.is_ukrainian_archive === 'Так' &&
        (name === 'is_ukrainian_archive' || isArchivePartField(name)) &&
        hasAllArchiveParts(updated)
      ) {
        updated.case_signature = buildCaseSignature(updated);
      }

      setFormData(updated);
    }
  };

  return (
    <>
      {/* Current Administrative Division Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Сучасний адміністративний поділ
        </h2>

        {!manualEntry ? (
          <>
            {/* Row 1: Country, Region, District, Community */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[15px] mb-[15px]">
              <FormSelect
                name="current_country"
                value={formData.current_country ?? ''}
                onChange={handleChange}
                placeholder="Оберіть країну"
              >
                {listCountries(nestedData).map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </FormSelect>

              <FormSelect
                name="current_region"
                value={formData.current_region}
                onChange={handleChange}
                placeholder="Оберіть область"
                disabled={!regions.length}
              >
                {regions.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </FormSelect>

              <FormSelect
                name="current_district"
                value={formData.current_district}
                onChange={handleChange}
                placeholder="Оберіть район"
                disabled={!districts.length}
              >
                {districts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </FormSelect>

              <FormSelect
                name="current_community"
                value={formData.current_community}
                onChange={handleChange}
                placeholder="Оберіть громаду"
                disabled={!communities.length}
              >
                {communities.map((comm) => (
                  <option key={comm} value={comm}>{comm}</option>
                ))}
              </FormSelect>
            </div>

            {/* Row 2: Settlement Type, Settlement */}
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-[15px] mb-[15px]">
              <FormSelect
                name="current_settlement_type"
                value={formData.current_settlement_type}
                onChange={handleChange}
                placeholder="Оберіть тип населеного пункту"
                disabled={!settlementTypes.length}
              >
                {settlementTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </FormSelect>

              <FormSelect
                name="current_settlement_name"
                value={formData.current_settlement_name}
                onChange={handleChange}
                placeholder="Оберіть населений пункт"
                disabled={!formData.current_settlement_type}
              >
                {settlements
                  .filter((s) => s.type === formData.current_settlement_type)
                  .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
                  .map((s) => (
                    <option key={s.code} value={s.name}>{s.name}</option>
                  ))}
              </FormSelect>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[15px] mb-[15px]">
              <FormInput
                name="current_country"
                value={formData.current_country ?? ''}
                onChange={handleChange}
                placeholder="Країна"
              />
              <FormInput
                name="current_region"
                value={formData.current_region}
                onChange={handleChange}
                placeholder="Область"
              />
              <FormInput
                name="current_district"
                value={formData.current_district}
                onChange={handleChange}
                placeholder="Район"
              />
              <FormInput
                name="current_community"
                value={formData.current_community}
                onChange={handleChange}
                placeholder="ОТГ"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-[15px] mb-[15px]">
              <FormSelect
                name="current_settlement_type"
                value={formData.current_settlement_type}
                onChange={handleChange}
                placeholder="Тип населеного пункту"
              >
                <option value="Місто">Місто</option>
                <option value="Село">Село</option>
              </FormSelect>

              <FormInput
                name="current_settlement_name"
                value={formData.current_settlement_name}
                onChange={handleChange}
                placeholder="Назва населеного пункту"
              />
            </div>
          </>
        )}

        {/* Help Text */}
        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Якщо потрібного вам населеного пункту немає, то ви можете{' '}
          <Link href="/add_settlement" className="underline hover:opacity-100">
            надіслати запит на його додавання
          </Link>
        </p>
      </section>

      {/* Map Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Карта
        </h2>

        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Оберіть точку на карті, що стосується потрібного населеного пункту
        </p>

        {/* Map */}
        <div className="mb-[15px]">
          <MapSelector
            latitude={formData.latitude ? formData.latitude.toString() : ''}
            longitude={formData.longitude ? formData.longitude.toString() : ''}
            onPositionChange={(lat, lng) => {
              setFormData(fd => ({
                ...fd,
                latitude: lat.toString(),
                longitude: lng.toString(),
              }));
            }}
          />
        </div>

        {/* Marker Type */}
        <div className="flex items-center gap-[8px] mb-[8px]">
          <span className="text-gray-900 dark:text-[#F3F4F6] text-[14px] lg:text-[16px] font-medium">
            Тип позначки
          </span>
          <HelpTooltip label="Що означають Місце і Регіон" width={320}>
            <span className="block">
              <b>Місце</b> — запис стосується конкретного населеного пункту, вказаного у формі.
              Обираємо, коли знаємо, що саме цей населений пункт зустрічається в інвентарі.
            </span>
            <span className="block">
              <b>Регіон</b> — запис стосується певного регіону навколо населеного пункту,
              вказаного у формі. Обираємо, коли в інвентарі вказано лише назву ключа або повіту й
              немає сканів, щоб перевірити, які саме населені пункти входять у документ.
            </span>
          </HelpTooltip>
        </div>
        <FormSelect
          name="mark_type"
          value={formData.mark_type}
          onChange={handleChange}
          placeholder="Тип позначки"
        >
          <option value="1">Місце</option>
          <option value="0">Регіон</option>
        </FormSelect>

        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mt-[10px]">
          Обирайте "Місце" якщо точно знаєте, що інвентар стосується цього населеного пункту. Обирайте "Регіон" якщо не впевнені які села зустрічаються в інвентарі.
        </p>
      </section>

      {/* Historical Administrative Division Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Адміністративний поділ станом на час складання інвентарю
        </h2>

        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Заповнюйте лише ті поля, в яких точно впевнені. Вказуйте повну назву, наприклад "Київське воєводство" замість "Київське"
        </p>

        {/* Row 1: Voivodeship, County, Key */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[15px] mb-[15px]">
          <FormInput
            name="old_province"
            value={formData.old_province}
            onChange={handleChange}
            placeholder="Воєводство (Губернія)"
          />
          <FormInput
            name="old_district"
            value={formData.old_district}
            onChange={handleChange}
            placeholder="Повіт"
          />
          <FormInput
            name="old_community"
            value={formData.old_community}
            onChange={handleChange}
            placeholder="Ключ (Староство)"
          />
        </div>

        {/* Row 2: Settlement Type, Settlement Name */}
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-[15px]">
          <FormSelect
            name="old_settlement_type"
            value={formData.old_settlement_type}
            onChange={handleChange}
            placeholder="Оберіть тип населеного пункту"
          >
            <option value="Місто">Місто</option>
            <option value="Містечко">Містечко</option>
            <option value="Село">Село</option>
          </FormSelect>
          <FormInput
            name="old_settlement_name"
            value={formData.old_settlement_name}
            onChange={handleChange}
            placeholder="Назва населеного пункту"
          />
        </div>
      </section>

      {/* Archive Case Information Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="flex items-center gap-[8px] text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Інформація про архівну справу
          <SignatureHelp />
        </h2>

        {/* Ukrainian Archive Selector */}
        <div className="mb-[15px]">
          <FormSelect
            name="is_ukrainian_archive"
            value={formData.is_ukrainian_archive}
            onChange={handleChange}
            placeholder="Справа знаходиться в українському архіві?"
          >
            <option value="Так">Так</option>
            <option value="Ні">Ні</option>
          </FormSelect>
        </div>

        {formData.is_ukrainian_archive === 'Так' ? (
          <>
            {/* Row 1: Archive, Fund, Description, Case */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-[15px] mb-[15px]">
              <FormSelect
                name="archive"
                value={formData.archive}
                onChange={handleChange}
                placeholder="Оберіть архів"
              >
                {archives.map(({ short_name, full_name_ukr }) => (
                  <option key={short_name} value={short_name}>
                    {short_name} - {full_name_ukr}
                  </option>
                ))}
              </FormSelect>
              <FormInput
                name="fonds"
                value={formData.fonds}
                onChange={handleChange}
                placeholder="Фонд"
              />
              <FormInput
                name="series"
                value={formData.series}
                onChange={handleChange}
                placeholder="Опис"
              />
              <FormInput
                name="record"
                value={formData.record}
                onChange={handleChange}
                placeholder="Справа"
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
              <a
                href="/archives"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-100"
              >
                Список назв архівів та їх скорочень
              </a>
            </p>
            <div className="mb-[15px]">
              <FormInput
                name="case_signature"
                value={formData.case_signature}
                onChange={handleChange}
                placeholder="Шифр справи"
              />
            </div>

            {/* Записи, додані до виправлення форми, могли зберегти архівні поля
                від попередньої справи. Показуємо їх явно — інакше приховані
                значення неможливо прибрати. */}
            {hasAnyArchivePart(formData) && (
              <div className="p-[10px] rounded bg-[#FEF3C7] dark:bg-[#EAB308] mb-[15px]">
                <p className="text-[#92400E] dark:text-[#451A03] text-[13px] lg:text-[14px] mb-[10px]">
                  У записі лишилися поля українського архіву:{' '}
                  <span className="font-semibold">
                    {[formData.archive, formData.fonds, formData.series, formData.record]
                      .filter(Boolean)
                      .join(' / ')}
                  </span>
                  . Найімовірніше вони належать іншій справі. Для справи в іноземному архіві
                  вони мають бути порожні — якщо ця ж справа є і в українському архіві,
                  вкажіть її нижче, у полі «Сигнатура додаткової справи».
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((fd: any) => ({ ...fd, archive: '', fonds: '', series: '', record: '' }))
                  }
                  className="px-[12px] h-[32px] rounded bg-[#92400E] hover:bg-[#78350F] transition-colors text-white text-[13px] font-medium"
                >
                  Очистити поля архіву
                </button>
              </div>
            )}
          </>
        )}

        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Вказуйте назву справи українською мовою, навіть якщо в оригіналі вона вказана іншою мовою
        </p>

        {/* Case Name - full width */}
        <div className="mb-[15px]">
          <FormInput
            name="case_title"
            value={formData.case_title}
            onChange={handleChange}
            placeholder="Назва справи"
          />
        </div>

        {/* Row: Case Dates, Pages Count */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
          <FormInput
            name="case_date"
            value={formData.case_date}
            onChange={handleChange}
            placeholder="Дати справи"
          />
          <FormInput
            name="pages_count"
            value={formData.pages_count}
            onChange={handleChange}
            placeholder="Кількість сторінок справи"
          />
        </div>

        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Заповнюєте це поле якщо ЦЯ Ж справа знаходиться, ще в одному архіві (бібліотеці). Наприклад основна справа "ЦДІАК 1-2-3", а додаткова справа "AGAD 10/20/30/40". Якщо справа є в кількох архівах — додайте окремий рядок для кожного
        </p>

        {/* Additional Signatures */}
        <SignatureListInput
          value={formData.additional_case_signature}
          onChange={(list) =>
            setFormData((fd: any) => ({ ...fd, additional_case_signature: list }))
          }
          placeholder="Сигнатура додаткової справи"
        />
      </section>

      {/* Inventory Information Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Інформація про інвентар
        </h2>

        {/* Row 1: Year, Start Page */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
          <div>
            <FormInput
              name="inventory_year"
              value={formData.inventory_year}
              onChange={handleChange}
              placeholder="Рік складання інвентарю, наприклад 1750"
            />
            {duplicateWarning && (
              <p className="text-red-600 text-[13px] mt-1">{duplicateWarning}</p>
            )}
          </div>
          <FormInput
            name="inventory_start_page"
            value={formData.inventory_start_page}
            onChange={handleChange}
            placeholder="Сторінка початку інвентарю"
          />
        </div>

        {/* Scans Link - full width */}
        <div className="mb-[15px]">
          <FormInput
            name="scans_url"
            value={formData.scans_url}
            onChange={handleChange}
            placeholder="Посилання на скани справи"
          />
           <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Заповнюйте поле Посилання ТІЛЬКИ якщо за цим посиланням є скани справи. Не потрібно давати посилання на архівний Опис
        </p>
        </div>

        {/* Notes Textarea */}
        <FormTextarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Примітки"
        />
      </section>

      {/* Contact Information Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Контактні дані
        </h2>

        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Ця інформація не буде опублікована на сайті, вона потрібна лише для адміністратора у випадку необхідності уточнення інформації про інвентар
        </p>

        <FormInput
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="roman.test@gmail.com"
        />
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}

// Reusable Form Components
function FormSelect({ 
  name, 
  value, 
  onChange, 
  placeholder, 
  disabled, 
  children 
}: { 
  name: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
  placeholder: string; 
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
    </div>
  );
}

function FormInput({ 
  name, 
  value, 
  onChange, 
  placeholder 
}: { 
  name: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  placeholder: string; 
}) {
  return (
    <input
      type="text"
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
    />
  );
}

function FormTextarea({ 
  name, 
  value, 
  onChange, 
  placeholder 
}: { 
  name: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; 
  placeholder: string; 
}) {
  return (
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={4}
      className="w-full p-[10px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#1F2937] text-gray-900 dark:text-[#F3F4F6] placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors resize-none"
    />
  );
}