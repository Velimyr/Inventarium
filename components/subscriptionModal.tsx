import { Dialog } from '@headlessui/react';
import { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useUser } from '../contexts/UserContext';
import emailjs from 'emailjs-com';
import Toast from './Toast';
import { ChevronDown } from 'lucide-react';
import {
  listCountries, listRegions, listDistricts, listCommunities, listSettlements,
  type NestedStructure, type Settlement,
} from './keys/regionData';

interface AddSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  regionStructure: NestedStructure | null | undefined;
  onSuccess?: () => void;
}

function AddSubscriptionModal({ isOpen, onClose, regionStructure, onSuccess }: AddSubscriptionModalProps) {
  const { user } = useUser();

  const [country, setCountry] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [district, setDistrict] = useState<string>('');
  const [community, setCommunity] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [regions, setRegions] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([]);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [email, setEmail] = useState<string>(user?.email || '');

  // Кожен рівень наповнює свій список і чистить усе, що під ним
  const clearBelowDistrict = () => {
    setSettlements([]); setTypes([]); setType(''); setNames([]); setName('');
  };

  // Оновлення областей при зміні країни
  useEffect(() => {
    setRegions(listRegions(regionStructure ?? null, country));
    setRegion(''); setDistricts([]); setDistrict(''); setCommunities([]); setCommunity('');
    clearBelowDistrict();
  }, [country, regionStructure]);

  // Оновлення районів при зміні області
  useEffect(() => {
    setDistricts(listDistricts(regionStructure ?? null, country, region));
    setDistrict(''); setCommunities([]); setCommunity('');
    clearBelowDistrict();
  }, [region, country, regionStructure]);

  // Оновлення громад при зміні району
  useEffect(() => {
    setCommunities(listCommunities(regionStructure ?? null, country, region, district));
    setCommunity('');
    clearBelowDistrict();
  }, [district, region, country, regionStructure]);

  // Оновлення населених пунктів та типів при зміні громади
  useEffect(() => {
    const list = listSettlements(regionStructure ?? null, country, region, district, community);
    setSettlements(list);
    setTypes(Array.from(new Set(list.map((s) => s.type))));
    setType(''); setNames([]); setName('');
  }, [community, district, region, country, regionStructure]);

  // Оновлення назв населених пунктів при зміні типу
  useEffect(() => {
    if (type) {
      setNames(settlements.filter((s) => s.type === type).map((s) => s.name));
      setName('');
    } else {
      setNames([]);
      setName('');
    }
  }, [type, settlements]);

  const findSettlementCode = (): Settlement | undefined => {
    return settlements.find(
      (s) => s.name === name && s.type === type
    );
  };

  // Перевірка на заповнення обов'язкових полів + email
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFormValid =
    !!country &&
    !!region &&
    !!district &&
    !!community &&
    !!type &&
    !!name &&
    !!file &&
    !!user &&
    isValidEmail;

  // Перевірка файлу перед завантаженням
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (!selectedFile) {
      setFile(null);
      return;
    }
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (!allowedTypes.includes(selectedFile.type)) {
      alert('Дозволені лише PDF, DOC, DOCX, PNG або JPG файли.');
      setFile(null);
      return;
    }
    if (selectedFile.size > maxSize) {
      alert('Файл має бути не більше 5 МБ.');
      setFile(null);
      return;
    }
    setFile(selectedFile);
  };

  const uploadToSupabase = async (file: File): Promise<string> => {
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${Date.now()}-${sanitizedFileName}`;
    console.log('Uploading file:', file.name, file.size, file.type);
    const { error } = await supabase.storage
      .from('email-attachments')
      .upload(filePath, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('email-attachments').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;

    const settlement = findSettlementCode();
    if (!settlement) {
      setToast({ message: 'Населений пункт не знайдено.', type: 'error' });
      return;
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const start_date = new Date(tomorrow);
    const expire_date = new Date(tomorrow);
    expire_date.setFullYear(expire_date.getFullYear() + 1);

    setSubmitting(true);

    try {
      // Завантаження файлу
      if (!file) throw new Error('Файл не вибрано');
      const attachmentUrl = await uploadToSupabase(file);

      const { error } = await supabase.from('settlement_subscription').insert({
        user_id: user.id,
        settlement_code: settlement.code,
        start_date: start_date.toISOString(),
        expire_date: expire_date.toISOString(),
        status: 'new',
        screenshot_url: attachmentUrl,
        email,
      });

      if (error) {
        throw error;
      }

      await emailjs.send(
        'service_1grk7wf',
        'template_i40ctem',
        {
          user_email: user.email,
          user_name: user.user_metadata?.full_name || user.email,
          user_id: user.id,
          country,
          region,
          district,
          community,
          type,
          name,
          attachment_url: attachmentUrl,
        },
        '0vIrWtLaUXsgLH570'
      );

      setToast({ message: 'Підписка створена та підтвердження надіслано.', type: 'success' });
      if (onSuccess) onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error('Помилка:', error);
      if (error instanceof Error) {
        console.error('Повідомлення помилки:', error.message);
        console.error('Стек помилки:', error.stack);
      }
      setToast({ message: 'Не вдалося створити підписку або надіслати підтвердження.', type: 'error' });
    }

    setSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className="fixed inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1F2937] p-[20px] lg:p-[30px] rounded-lg shadow-md max-w-lg w-full z-50 border border-gray-300 dark:border-[#374151]">
          <Dialog.Title className="text-gray-900 dark:text-[#F3F4F6] text-[20px] lg:text-[22px] font-semibold mb-[20px]">
            Додати підписку
          </Dialog.Title>

          <div className="space-y-[15px] mb-[20px]">
            {/* Country Select */}
            <FormSelect
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Оберіть країну"
            >
              {listCountries(regionStructure ?? null).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FormSelect>

            {/* Region Select */}
            <FormSelect
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Оберіть область"
              disabled={!country || regions.length === 0}
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </FormSelect>

            {/* District Select */}
            <FormSelect
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Оберіть район"
              disabled={!region || districts.length === 0}
            >
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </FormSelect>

            {/* Community Select */}
            <FormSelect
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              placeholder="Оберіть громаду"
              disabled={!district || communities.length === 0}
            >
              {communities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FormSelect>

            {/* Type Select */}
            <FormSelect
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Оберіть тип"
              disabled={!community || types.length === 0}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FormSelect>

            {/* Settlement Select */}
            <FormSelect
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Оберіть населений пункт"
              disabled={!type || names.length === 0}
            >
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </FormSelect>

            {/* Help Text */}
            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">
              Оберіть файл з скріншотом вашого донату (дата донату має бути сьогоднішньою, сума більше 200 грн.)
            </p>

            {/* File Input */}
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full p-[10px] border border-gray-300 dark:border-[#374151] rounded bg-white dark:bg-[#111827] text-gray-900 dark:text-white text-[13px] lg:text-[14px] file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-100 dark:file:bg-[#374151] file:text-gray-900 dark:file:text-white hover:file:bg-gray-200 dark:hover:file:bg-[#4B5563]"
            />

            {/* Email Input */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email на який будуть приходити сповіщення про інвентарі"
              className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors"
              required
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-[10px]">
            <button
              onClick={onClose}
              className="px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors text-[14px] lg:text-[16px] font-medium disabled:opacity-50"
              disabled={submitting}
            >
              Скасувати
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !isFormValid}
              className="px-[15px] h-[40px] rounded bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors text-[14px] lg:text-[16px] font-medium disabled:opacity-50"
            >
              {submitting ? 'Надсилання...' : 'Додати підписку'}
            </button>
          </div>
        </div>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </Dialog>
  );
}

// Reusable Select Component
function FormSelect({ 
  value, 
  onChange, 
  placeholder, 
  disabled, 
  children 
}: { 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; 
  placeholder: string; 
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full px-[10px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-white dark:bg-[#111827] text-gray-900 dark:text-white text-[13px] lg:text-[14px] outline-none focus:border-[#2563EB] transition-colors appearance-none pr-[35px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown className="absolute right-[10px] top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 dark:text-[#F3F4F6] pointer-events-none" strokeWidth={2} />
    </div>
  );
}

export default AddSubscriptionModal;