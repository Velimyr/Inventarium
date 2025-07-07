import { Dialog } from '@headlessui/react';
import { useState, Fragment, useEffect, ChangeEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useUser } from '../contexts/UserContext';
import emailjs from 'emailjs-com';
import Toast from './Toast';

// Тип для населеного пункту
type Settlement = {
  code: string;
  name: string;
  type: string;
};

type RegionStructure = Record<string, Record<string, Record<string, Settlement[]>>>;

interface AddSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  regionStructure: RegionStructure | undefined;
  onSuccess?: () => void;
}

function AddSubscriptionModal({ isOpen, onClose, regionStructure, onSuccess }: AddSubscriptionModalProps) {
  const { user } = useUser();

  const [region, setRegion] = useState<string>('');
  const [district, setDistrict] = useState<string>('');
  const [community, setCommunity] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [districts, setDistricts] = useState<string[]>([]);
  const [communities, setCommunities] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([]);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Додаємо стан для email
  const [email, setEmail] = useState<string>(user?.email || '');

  // Оновлення районів при зміні області
  useEffect(() => {
    if (region && regionStructure && regionStructure[region]) {
      setDistricts(Object.keys(regionStructure[region]));
      setDistrict('');
      setCommunity('');
      setSettlements([]);
      setTypes([]);
      setNames([]);
      setType('');
      setName('');
    } else {
      setDistricts([]);
      setCommunities([]);
      setSettlements([]);
      setTypes([]);
      setNames([]);
      setDistrict('');
      setCommunity('');
      setType('');
      setName('');
    }
  }, [region, regionStructure]);

  // Оновлення громад при зміні району
  useEffect(() => {
    if (region && district && regionStructure && regionStructure[region]?.[district]) {
      setCommunities(Object.keys(regionStructure[region][district]));
      setCommunity('');
      setSettlements([]);
      setTypes([]);
      setNames([]);
      setType('');
      setName('');
    } else {
      setCommunities([]);
      setSettlements([]);
      setTypes([]);
      setNames([]);
      setCommunity('');
      setType('');
      setName('');
    }
  }, [district, region, regionStructure]);

  // Оновлення населених пунктів та типів при зміні громади
  useEffect(() => {
    if (region && district && community && regionStructure && regionStructure[region]?.[district]?.[community]) {
      const list = regionStructure[region][district][community];
      setSettlements(list);
      const uniqueTypes = Array.from(new Set(list.map((s) => s.type)));
      setTypes(uniqueTypes);
      setNames([]);
      setType('');
      setName('');
    } else {
      setSettlements([]);
      setTypes([]);
      setNames([]);
      setType('');
      setName('');
    }
  }, [community, region, district, regionStructure]);

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
    <Dialog open={isOpen} onClose={onClose} as="div">
      <div className="fixed inset-0 bg-black bg-opacity-30 z-40 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-md max-w-lg w-full z-50">
          <Dialog.Title className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
            Додати підписку
          </Dialog.Title>

          <div className="grid gap-3 mb-4">
           
            <select
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">Оберіть область</option>
              {regionStructure &&
                Object.keys(regionStructure).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
            </select>

            <select
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              disabled={!region || districts.length === 0}
            >
              <option value="">Оберіть район</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={community}
              onChange={(e) => setCommunity(e.target.value)}
              disabled={!district || communities.length === 0}
            >
              <option value="">Оберіть громаду</option>
              {communities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={!community || types.length === 0}
            >
              <option value="">Оберіть тип</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!type || names.length === 0}
            >
              <option value="">Оберіть населений пункт</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="mb-6 text-center text-gray-700 dark:text-gray-300"> Оберіть файл з скріншотом вашого донату (дата донату має бути сьогоднішньою)</p>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
             <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email на який будуть приходити сповіщення про інвентарі"
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500"
              disabled={submitting}
            >
              Скасувати
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !isFormValid}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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

export default AddSubscriptionModal;