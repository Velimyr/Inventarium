import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Toast from '../components/Toast';

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

interface Settlement {
  name: string;
  code: string;
  type: string;
  lat: number | null;
  lon: number | null;
}

interface NestedStructure {
  [region: string]: {
    [district: string]: {
      [community: string]: Settlement[];
    };
  };
}

interface EditableInventoryFormProps {
  data: any;
  onChange: (data: any) => void;
}

export default function EditableInventoryForm({ data, onChange }: EditableInventoryFormProps) {
  const [formData, setFormData] = useState(data);
  const [manualEntry, setManualEntry] = useState(false);
  const [nestedData, setNestedData] = useState<NestedStructure | null>(null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementTypes, setSettlementTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/data/region_structure.json')
      .then((res) => res.json())
      .then((json: NestedStructure) => setNestedData(json))
      .catch((err) => console.error('Failed to load region_structure.json', err));
  }, []);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  useEffect(() => {
    onChange(formData);
  }, [formData, onChange]);

  useEffect(() => {
    if (nestedData && formData.current_region && !manualEntry) {
      const regionData = nestedData[formData.current_region];
      setDistricts(regionData ? Object.keys(regionData) : []);
    }
  }, [formData.current_region, nestedData, manualEntry]);

  useEffect(() => {
    if (nestedData && formData.current_region && formData.current_district && !manualEntry) {
      const communitiesData = nestedData[formData.current_region]?.[formData.current_district];
      setCommunities(communitiesData ? Object.keys(communitiesData) : []);
    }
  }, [formData.current_district, formData.current_region, nestedData, manualEntry]);

  useEffect(() => {
    if (nestedData && formData.current_region && formData.current_district && formData.current_community && !manualEntry) {
      const settlementsData = nestedData[formData.current_region]?.[formData.current_district]?.[formData.current_community];
      setSettlements(settlementsData || []);
      const types = Array.from(new Set((settlementsData || []).map((s) => s.type)));
      setSettlementTypes(types);
    }
  }, [formData.current_community, formData.current_district, formData.current_region, nestedData, manualEntry]);

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

  useEffect(() => {
    if (data) {
      const latFromData = data.latitude ?? '';
      const lonFromData = data.longitude ?? '';

      // Перевіряємо, чи координати в formData відсутні або відрізняються від data
      if (
        (latFromData !== '' && formData.latitude !== latFromData) ||
        (lonFromData !== '' && formData.longitude !== lonFromData)
      ) {
        setFormData((fd: any) => ({
          ...fd,
          latitude: latFromData,
          longitude: lonFromData,
        }));
      }
    }
  }, [data]);



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

      if (
        updated.is_ukrainian_archive === 'Так' &&
        updated.archive &&
        updated.fonds &&
        updated.series &&
        updated.record
      ) {
        updated.case_signature = `${updated.archive} ${updated.fonds}-${updated.series}-${updated.record}`;
      }

      setFormData(updated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDuplicateUrl(null);
    setSuccess(false);
  }

  return (
    <>
      <main className="p-6 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex justify-center">
        <div className="max-w-2xl w-full">
          {duplicateUrl && (
            <p className="text-yellow-600 mb-4">
              Такий інвентар уже існує.{' '}
              <a href={duplicateUrl} className="underline">
                Переглянути
              </a>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Блок 1: Сучасний адміністративний поділ */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Сучасний адміністративний поділ</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Всі поля є обов'язкові</p>

              {!manualEntry ? (
                <>
                  <select
                    name="current_region"
                    value={formData.current_region}
                    onChange={handleChange}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                  >
                    <option value="">Оберіть область</option>
                    {nestedData &&
                      Object.keys(nestedData).map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                  </select>

                  <select
                    name="current_district"
                    value={formData.current_district}
                    onChange={handleChange}
                    disabled={!districts.length}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                  >
                    <option value="">Оберіть район</option>
                    {districts.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>

                  <select
                    name="current_community"
                    value={formData.current_community}
                    onChange={handleChange}
                    disabled={!communities.length}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 mb-2"
                  >
                    <option value="">Оберіть ОТГ</option>
                    {communities.map((comm) => (
                      <option key={comm} value={comm}>
                        {comm}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-4 flex-wrap mb-4">
                    <select
                      name="current_settlement_type"
                      value={formData.current_settlement_type}
                      onChange={handleChange}
                      disabled={!settlementTypes.length}
                      className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    >
                      <option value="">Оберіть тип населеного пункту</option>
                      {settlementTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>

                    <select
                      name="current_settlement_name"
                      value={formData.current_settlement_name}
                      onChange={handleChange}
                      disabled={!formData.current_settlement_type}
                      className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    >
                      <option value="">Оберіть населений пункт</option>
                      {settlements
                        .filter((s) => s.type === formData.current_settlement_type)
                        .map((s) => (
                          <option key={s.code} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>

                </>
              ) : (
                <>
                  {/* Ручний ввід */}
                  <div className="flex flex-col gap-4 mb-4">
                    <input
                      name="current_region"
                      value={formData.current_region}
                      onChange={handleChange}
                      placeholder="Область"
                      className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    />
                    <input
                      name="current_district"
                      value={formData.current_district}
                      onChange={handleChange}
                      placeholder="Район"
                      className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    />
                    <input
                      name="current_community"
                      value={formData.current_community}
                      onChange={handleChange}
                      placeholder="ОТГ"
                      className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    />
                  </div>

                  {/* Тип населеного пункту і назва поруч */}
                  <div className="flex gap-4 flex-wrap mb-4">
                    <select
                      name="current_settlement_type"
                      value={formData.current_settlement_type}
                      onChange={handleChange}
                      className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    >
                      <option value="">Тип населеного пункту</option>
                      <option value="Місто">Місто</option>
                      <option value="Село">Село</option>
                    </select>
                    <input
                      name="current_settlement_name"
                      value={formData.current_settlement_name}
                      onChange={handleChange}
                      placeholder="Назва населеного пункту"
                      className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                    />
                  </div>

                </>
              )}
              <label className="inline-flex items-center space-x-2 mb-2">
                <input
                  type="checkbox"
                  name="manualEntry"
                  checked={manualEntry}
                  onChange={handleChange}
                />
                <span>Населеного пункту нема в списку</span>
              </label>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Оберіть точку на карті, що стосується потрібного населеного пункту (Обов'язково)
              </p>
              {/* <MapSelector
                latitude={formData.latitude}
                longitude={formData.longitude}
                onChange={(lat, lng) =>
                  setFormData((fd: any) => ({
                    ...fd,
                    latitude: lat.toString(),
                    longitude: lng.toString(),
                  }))
                }
              /> */}

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
            </section>

            {/* Блок 2: Адміністративний поділ час складання */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Адміністративний поділ станом на час складання інвентаря</h2>
              <br />
              <p className="text-sm text-gray-500 dark:text-gray-400">Заповнюєте лише ті значення, в яких точно впевнені. Вказуйте повну назву, наприклад "Київське воєводство" замість "Київське"</p>
              <div className="flex flex-col gap-4">
                <input
                  name="old_province"
                  value={formData.old_province}
                  onChange={handleChange}
                  placeholder="Воєводство (Губернія)"
                  className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
                <input
                  name="old_district"
                  value={formData.old_district}
                  onChange={handleChange}
                  placeholder="Повіт"
                  className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
                <input
                  name="old_community"
                  value={formData.old_community}
                  onChange={handleChange}
                  placeholder="Ключ (Староство)"
                  className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
              </div>

              {/* В один рядок */}
              <div className="flex gap-4 flex-wrap">
                <select
                  name="old_settlement_type"
                  value={formData.old_settlement_type}
                  onChange={handleChange}
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                >
                  <option value="">Тип населеного пункту</option>
                  <option value="Місто">Місто</option>
                  <option value="Містечко">Містечко</option>
                  <option value="Село">Село</option>
                </select>
                <input
                  name="old_settlement_name"
                  value={formData.old_settlement_name}
                  onChange={handleChange}
                  placeholder="Назва населеного пункту"
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
              </div>
            </section>

            {/* Блок 3: Архівна справа */}
            <section className="space-y-4">
              <br />
              <h2 className="text-xl font-semibold">Інформація про архівну справу</h2>
              <div>
                <label className="block mb-1">Справа знаходиться в українському архіві?</label>
                <select
                  name="is_ukrainian_archive"
                  value={formData.is_ukrainian_archive}
                  onChange={handleChange}
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                >
                  <option value="Так">Так</option>
                  <option value="Ні">Ні</option>
                </select>
              </div>

              {formData.is_ukrainian_archive === 'Так' ? (
                <div className="flex flex-col gap-4">
                  <input
                    name="archive"
                    value={formData.archive}
                    onChange={handleChange}
                    placeholder="Назва архіву"
                    className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                  />
                  <input
                    name="fonds"
                    value={formData.fonds}
                    onChange={handleChange}
                    placeholder="Номер фонду"
                    className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                  />
                  <input
                    name="series"
                    value={formData.series}
                    onChange={handleChange}
                    placeholder="Опис"
                    className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                  />
                  <input
                    name="record"
                    value={formData.record}
                    onChange={handleChange}
                    placeholder="Справа"
                    className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                  />
                </div>
              ) : (
                <input
                  name="case_signature"
                  value={formData.case_signature}
                  onChange={handleChange}
                  placeholder="Шифр справи"
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
              )}

              <input
                name="case_title"
                value={formData.case_title}
                onChange={handleChange}
                placeholder="Назва справи"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
              <div className="flex gap-4 flex-wrap">
                <input
                  name="case_date"
                  value={formData.case_date}
                  onChange={handleChange}
                  placeholder="Дати справи"
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
                <input
                  name="pages_count"
                  value={formData.pages_count}
                  onChange={handleChange}
                  placeholder="Кількість сторінок справи"
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
              </div>
              <br />
              <p className="text-sm text-gray-500 dark:text-gray-400">Заповнюєте це поле якащо ЦЯ Ж справа знаходиться, ще в одному архіві (бібліотеці) Наприклад основна справа "ЦДІАК 1-2-3" Додаткова справа AGAD 10\20\30\40 </p>
              <input
                name="additional_case_signature"
                value={formData.additional_case_signature}
                onChange={handleChange}
                placeholder="Шифр додаткової справи (якщо є)"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
            </section>

            {/* Блок 4: Інформація про інвентар */}
            <section className="space-y-4">
              <br />
              <h2 className="text-xl font-semibold">Інформація про інвентар</h2>
              <div className="flex gap-4 flex-wrap">
                <input
                  name="inventory_year"
                  value={formData.inventory_year}
                  onChange={handleChange}
                  placeholder="Рік складання інвентаря (напр. 1750)"
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
                <input
                  name="inventory_start_page"
                  value={formData.inventory_start_page}
                  onChange={handleChange}
                  placeholder="Сторінка початку інвентаря"
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
              </div>
              <br />
              <p className="text-sm text-gray-500 dark:text-gray-400">Обирайте "Місце" якщо точно знаєте, що інвентар стосується цього населеного пункту" (Наприклад назва справи "Інвентар села Калинівка" \ Обирайте "Регіон" якщо не впевнені які села зустрічаються в інвентарі. (Наприклад "Назва справи "Інвентар Білопільського ключа"</p>
              <select
                name="mark_type"
                value={formData.mark_type}
                onChange={handleChange}
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              >
                <option value="">Тип позначки</option>
                <option value="1">Місце</option>
                <option value="2">Регіон</option>
              </select>
              <input
                name="scans_url"
                value={formData.scans_url}
                onChange={handleChange}
                placeholder="Посилання на скани справи"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Примітки"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                rows={3}
              />
            </section>

            <input
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email для зв'язку"
              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
            />
          </form>
        </div>
      </main>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
