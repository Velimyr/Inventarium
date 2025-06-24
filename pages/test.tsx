import { useState } from 'react';
import Header from '../components/header';
import dynamic from 'next/dynamic';

const MapSelector = dynamic(() => import('../components/MapSelector'), { ssr: false });

export default function AddInventoryPage() {
  const [formData, setFormData] = useState<any>({
    current_region: '',
    current_district: '',
    current_community: '',
    current_settlement_type: '',
    current_settlement_name: '',
    latitude: '',
    longitude: '',
    old_province: '',
    old_district: '',
    old_community: '',
    old_settlement_type: '',
    old_settlement_name: '',
    is_ukrainian_archive: 'Так',
    archive: '',
    fonds: '',
    series: '',
    record: '',
    case_signature: '',
    additional_case_signature: '',
    case_title: '',
    case_date: '',
    pages_count: '',
    inventory_year: '',
    inventory_start_page: '',
    mark_type: '',
    scans_url: '',
    notes: '',
    email: '',
  });

  const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Логіка сабміту тут
    alert('Форма надіслана (логіку додай сам)');
  };

  return (
    <>
      <Header />
      <main className="p-6 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen flex justify-center">
        <div className="max-w-2xl w-full">
          <h1 className="text-2xl font-bold mb-6">Додати інвентар</h1>

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
              <div className="flex flex-col gap-4">
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

              {/* Ось цей блок в один рядок */}
              <div className="flex gap-4 flex-wrap">
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

              <MapSelector
                latitude={formData.latitude}
                longitude={formData.longitude}
                onChange={(lat, lng) => setFormData({ ...formData, latitude: lat, longitude: lng })}
              />
            </section>

            {/* Блок 2: Адміністративний поділ час складання */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Адміністративний поділ станом на час складання інвентаря</h2>
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
                  <option value="">Обрати тип</option>
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
                name="additional_case_signature"
                value={formData.additional_case_signature}
                onChange={handleChange}
                placeholder="Шифр додаткової справи (якщо є)"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
              <input
                name="case_title"
                value={formData.case_title}
                onChange={handleChange}
                placeholder="Назва справи"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
              <input
                name="case_date"
                value={formData.case_date}
                onChange={handleChange}
                placeholder="Дати справи"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
              <input
                name="pages_count"
                value={formData.pages_count}
                onChange={handleChange}
                placeholder="Кількість сторінок справи"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
            </section>

            {/* Блок 4: Інформація про інвентар */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Інформація про інвентар</h2>
              <input
                name="inventory_year"
                value={formData.inventory_year}
                onChange={handleChange}
                placeholder="Рік складання інвентаря (напр. 1750)"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
              <input
                name="inventory_start_page"
                value={formData.inventory_start_page}
                onChange={handleChange}
                placeholder="Сторінка початку інвентаря"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
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
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded"
            >
              Зберегти
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
