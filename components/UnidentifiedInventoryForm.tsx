import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Toast from './Toast';
import Link from 'next/link';

const MapSelector = dynamic(() => import('./MapSelector'), { ssr: false });

interface ArchiveItem {
  short_name: string;
  full_name_ukr: string;
  country: string;
}

interface UnidentifiedInventoryFormProps {
  data: any;
  onChange: (data: any) => void;
  onSubmit?: (data: any) => Promise<void>;
  duplicateWarning?: string | null;
}

export default function UnidentifiedInventoryFormForm({
  data,
  onChange,
  onSubmit,
  duplicateWarning,
}: UnidentifiedInventoryFormProps) {
  const [formData, setFormData] = useState(data);
  const [manualEntry, setManualEntry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
    if (data && Object.keys(data).length > 0) {
      const cleaned = {
        ...data,
        inventory_year: data.inventory_year ?? '',
        pages_count: data.pages_count ?? '',        
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const { name } = target;

    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      const checked = target.checked;
      if (name === 'manualEntry') {
        setManualEntry(checked);
      } else {
        setFormData((fd) => ({ ...fd, [name]: checked }));
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

    if (onSubmit) {
      await onSubmit(formData);
    }
  };

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

            {/* Блок 1: Архівна справа */}
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
                  <select
                    value={formData.archive}
                    onChange={(e) =>
                      setFormData((fd) => ({ ...fd, archive: e.target.value }))
                    }
                    className="p-2 border rounded dark:bg-gray-800 dark:border-gray-600 w-full"
                  >
                    <option value="">Оберіть архів</option>
                    {archives.map(({ short_name, full_name_ukr }) => (
                      <option key={short_name} value={short_name}>
                        {short_name} - {full_name_ukr}
                      </option>
                    ))}
                  </select>
                  <input
                    name="fonds"
                    value={formData.fonds}
                    onChange={handleChange}
                    placeholder="Фонд"
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
                <>
                  <div className="mb-2">
                    <a
                      href="/archives"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800"
                    >
                      Список назв архівів та їх скорочень
                    </a>
                  </div>
                  <input
                    name="case_signature"
                    value={formData.case_signature}
                    onChange={handleChange}
                    placeholder="Шифр справи"
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                  />
                </>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Вказуйте назву справи українською мовою, навіть якщо в оригіналі вона вказана іншою мовою
              </p>
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
              <input
                name="additional_case_signature"
                value={formData.additional_case_signature}
                onChange={handleChange}
                placeholder="Шифр додаткової справи (якщо є)"
                className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
              />
            </section>

            {/* Блок 2: Інформація про інвентар */}
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Інформація про інвентар</h2>
              <div className="flex gap-4 flex-wrap">
                <input
                  name="inventory_year"
                  value={formData.inventory_year}
                  onChange={handleChange}
                  placeholder="Рік складання інвентарю (напр. 1750)"
                  className="flex-1 min-w-[150px] p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                />
                {duplicateWarning && (
                  <p className="text-red-600 text-sm mt-1">{duplicateWarning}</p>
                )}               
              </div>
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
