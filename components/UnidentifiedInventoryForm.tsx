import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Toast from './Toast';
import SignatureListInput from './SignatureListInput';
import SignatureHelp from './SignatureHelp';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  ARCHIVE_PART_FIELDS,
  buildCaseSignature,
  hasAllArchiveParts,
  isArchivePartField,
} from '../lib/caseSignature';
import { INVENTORY_TYPES, suggestInventoryType } from '../lib/inventoryType';
import InventoryTypeWarning from './InventoryTypeWarning';

const MapSelector = dynamic(() => import('./MapSelector'), { ssr: false });

const hasInventoryType = (record: any) =>
  String(record?.inventory_type ?? '').trim() !== '';

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

export default function UnidentifiedInventoryForm({
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

  // Замок автопідстановки типу документа — див. EditableInventoryForm.
  const [typeLocked, setTypeLocked] = useState(() => hasInventoryType(data));

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
      setTypeLocked(hasInventoryType(data));
    }
  }, [data?.id]);

  useEffect(() => {
    if (typeLocked) return;
    const suggested = suggestInventoryType(formData);
    if (formData.inventory_type !== suggested) {
      setFormData((fd: any) => ({ ...fd, inventory_type: suggested }));
    }
  }, [typeLocked, formData.inventory_type, formData.archive, formData.fonds, formData.case_title]);

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

      if (name === 'inventory_type') setTypeLocked(true);

      // Перемикач чистить протилежну гілку — див. EditableInventoryForm.
      if (name === 'is_ukrainian_archive') {
        if (value === 'Ні') {
          for (const field of ARCHIVE_PART_FIELDS) updated[field] = '';
        } else {
          updated.case_signature = '';
        }
      }

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
      {duplicateUrl && (
        <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
          <p className="text-yellow-600 dark:text-yellow-400 text-[14px] lg:text-[16px]">
            Такий інвентар уже існує.{' '}
            <a href={duplicateUrl} className="underline hover:opacity-80">
              Переглянути
            </a>
          </p>
        </section>
      )}

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

        {/* Additional Signatures */}
        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80 mb-[15px]">
          Якщо ця ж справа є ще в одному архіві (бібліотеці) — вкажіть її шифр. Для кількох архівів додайте окремий рядок для кожного
        </p>
        <SignatureListInput
          value={formData.additional_case_signature}
          onChange={(list) =>
            setFormData((fd: any) => ({ ...fd, additional_case_signature: list }))
          }
          placeholder="Шифр додаткової справи (якщо є)"
        />
      </section>

      {/* Inventory Information Section */}
      <section className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#111827] mb-[20px]">
        <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold mb-[15px]">
          Інформація про інвентар
        </h2>

        {/* Row 1: Document Type, Year */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px] mb-[15px]">
          <FormSelect
            name="inventory_type"
            value={formData.inventory_type ?? ''}
            onChange={handleChange}
            placeholder="Оберіть тип документа"
          >
            {INVENTORY_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </FormSelect>
          <FormInput
            name="inventory_year"
            value={formData.inventory_year}
            onChange={handleChange}
            placeholder="Рік складання інвентарю, наприклад 1750"
          />
        </div>

        {/* Попередження під рядком, а не в комірках: інакше вони розсовують
            колонки і контроли перестають бути на одній лінії. */}
        {duplicateWarning && (
          <p className="text-red-600 text-[13px] mb-[15px]">{duplicateWarning}</p>
        )}

        <div className="empty:hidden mb-[15px]">
          <InventoryTypeWarning record={formData} />
        </div>

        {/* Scans Link - full width */}
        <div className="mb-[15px]">
          <FormInput
            name="scans_url"
            value={formData.scans_url}
            onChange={handleChange}
            placeholder="Посилання на скани справи"
          />
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