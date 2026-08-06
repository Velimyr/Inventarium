import emailjs from 'emailjs-com';
import regionStructure from '../public/data/region_structure.json';
import { getSettlementCodeByPath, type NestedStructure } from '../components/keys/regionData';
import { sendNotification } from '../components/notifications';
import { supabase } from './supabaseClient';
import {
  fromSignatureList,
  normalizeSignatureFields,
  resolveIsUkrainianArchive,
  validateCaseSignature,
} from './caseSignature';
import { findRecordWithAdditionalSignature } from './duplicateCheck';

const parseIntegerOrNull = (value: any) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
};

// Ключові текстові поля, за якими БД визначає унікальність справи
// (обмеження unique_inventory_verified_record на таблиці records).
//
// current_country свідомо НЕ входить: його немає в обмеженні БД, а назви
// областей у довіднику унікальні між країнами, тож current_region уже
// однозначно визначає країну. Додати його сюди означало б зробити
// JS-перевірку суворішою за саме обмеження і ловити 23505 замість дубля.
export const KEY_TEXT_FIELDS = [
  'current_region',
  'current_district',
  'current_community',
  'current_settlement_type',
  'current_settlement_name',
  'old_settlement_type',
  'old_settlement_name',
  'case_signature',
] as const;

// Порожній рядок / undefined приводимо до null, щоб значення збігалося з тим,
// як дані реально лежать у БД (там порожні значення зберігаються як NULL).
export const emptyToNull = (value: any) => (value === '' || value === undefined ? null : value);

// Нормалізує ключові текстові поля запису ('' → null) перед вставкою в records,
// щоб JS-перевірка й БД-обмеження працювали з однаковими значеннями.
//
// Шифр додатково чиститься від зайвих пробілів: без цього пошук дубліката
// шукав би «AGAD  ML 1/10/0/6/19» серед уже згорнутих значень і не знаходив би
// двійника — вставка падала б на unique_inventory_verified_record.
export function normalizeKeyFields<T extends Record<string, any>>(record: T): T {
  const out: Record<string, any> = normalizeSignatureFields(record);
  for (const field of [...KEY_TEXT_FIELDS, 'current_country']) {
    out[field] = emptyToNull(out[field]);
  }
  return out as T;
}

/**
 * Шукає в `records` уже наявний verified-запис із таким самим набором ключових полів.
 *
 * На відміну від .match(), для NULL-полів тут використовується .is(col, null):
 * PostgREST-фільтр `col=eq.null` НЕ знаходить рядки, де колонка справді NULL,
 * тому .match() пропускав дублікати з порожніми полями, і вставка падала на
 * обмеженні unique_inventory_verified_record (код 23505).
 */
export async function findDuplicateVerifiedRecord(record: any): Promise<{ id: string } | null> {
  let query = supabase.from('records').select('id');

  for (const field of KEY_TEXT_FIELDS) {
    const value = emptyToNull(record[field]);
    query = value === null ? query.is(field, null) : query.eq(field, value);
  }

  const year = parseIntegerOrNull(record.inventory_year);
  query = year === null ? query.is('inventory_year', null) : query.eq('inventory_year', year);

  const { data, error } = await query.limit(1);
  if (error) throw error;

  return data && data.length > 0 ? { id: data[0].id } : null;
}

const parseFloatOrNull = (value: any) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseFloat(value);
  return Number.isNaN(num) ? null : num;
};

export async function notifySettlementSubscribers({
  settlement,
  settlementCode,
  link,
  userId,
}: {
  settlement: string;
  settlementCode: string | null;
  link: string;
  userId: string;
}) {
  if (!settlement || !settlementCode || !userId) return;

  try {
    const { data: subscriptions, error: subsError } = await supabase
      .from('settlement_subscription')
      .select('user_id, email')
      .eq('settlement_code', settlementCode);

    if (subsError || !subscriptions?.length) {
      if (subsError) {
        console.error('Помилка отримання підписок:', subsError);
      }
      return;
    }

    for (const sub of subscriptions) {
      const email = sub.email;
      if (!email) continue;

      try {
        await emailjs.send(
          'service_1grk7wf',
          'template_0uhaxka',
          {
            email,
            settlement,
            link,
            user_id: userId,
          },
          '0vIrWtLaUXsgLH570'
        );
      } catch (err) {
        console.error(`❌ Помилка при надсиланні на ${email}:`, err);
      }
    }
  } catch (err) {
    console.error('Помилка під час надсилання листа:', err);
  }
}

export async function approveUnverifiedRecord({
  record,
  adminUserId,
  origin,
}: {
  record: any;
  adminUserId: string;
  origin: string;
}): Promise<{
  status: 'approved' | 'duplicate' | 'error';
  message: string;
  recordId: string;
}> {
  try {
    // Для чернеток, доданих до появи колонки, прапорець доводиться відновлювати
    const recordWithFlag = { ...record, is_ukrainian_archive: resolveIsUkrainianArchive(record) };

    const signatureError = validateCaseSignature(recordWithFlag);
    if (signatureError) {
      return { status: 'error', message: signatureError, recordId: record.id };
    }

    const existing = await findDuplicateVerifiedRecord(record);

    if (existing) {
      return {
        status: 'duplicate',
        message: 'Такий інвентар уже існує в реєстрі.',
        recordId: record.id,
      };
    }

    // Той самий шифр уже вказано як додатковий шифр справи в іншому записі
    // цього населеного пункту.
    const crossMatch = await findRecordWithAdditionalSignature(record.case_signature, record);
    if (crossMatch) {
      return {
        status: 'duplicate',
        message: `Шифр справи «${record.case_signature}» вже вказано як додатковий шифр справи в іншому записі цього населеного пункту.`,
        recordId: record.id,
      };
    }

    // is_ukrainian_archive зберігаємо разом із записом: виводити його потім із
    // даних не можна — для записів з іноземним шифром і заповненими архівними
    // полями таке виведення дає «Так» і форма редагування затирає шифр.
    const recordToInsert = recordWithFlag;

    const preparedRecord = {
      ...normalizeKeyFields(recordToInsert),
      approved: true,
      additional_case_signature: fromSignatureList(record.additional_case_signature),
      latitude: parseFloatOrNull(record.latitude),
      longitude: parseFloatOrNull(record.longitude),
      pages_count: parseIntegerOrNull(record.pages_count),
      inventory_year: parseIntegerOrNull(record.inventory_year),
      inventory_start_page: parseIntegerOrNull(record.inventory_start_page),
      created_by: record.created_by ? record.created_by : adminUserId,
    };

    const { error: insertError } = await supabase
      .from('records')
      .insert([preparedRecord]);

    if (insertError) {
      console.error(insertError);
      // 23505 — унікальне обмеження БД (unique_inventory_verified_record):
      // запис уже є в реєстрі, навіть якщо попередня перевірка його не побачила.
      if (insertError.code === '23505') {
        return {
          status: 'duplicate',
          message: 'Такий інвентар уже існує в реєстрі.',
          recordId: record.id,
        };
      }
      return {
        status: 'error',
        message: `Помилка при додаванні до бази: ${insertError.message}`,
        recordId: record.id,
      };
    }

    const settlementCode = getSettlementCodeByPath(regionStructure as NestedStructure, {
      country: record.current_country,
      region: record.current_region,
      district: record.current_district,
      community: record.current_community,
      type: record.current_settlement_type,
      name: record.current_settlement_name,
    });

    await notifySettlementSubscribers({
      settlement: [
        record.current_country, record.current_region, record.current_district,
        record.current_community,
        `${record.current_settlement_type} ${record.current_settlement_name}`,
      ].filter(Boolean).join(', '),
      settlementCode,
      link: `${origin}/record/${record.id}`,
      userId: adminUserId,
    });

    const { error: deleteError } = await supabase
      .from('records_unverified')
      .delete()
      .eq('id', record.id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return {
        status: 'error',
        message: `Помилка видалення з черги перевірки: ${deleteError.message}`,
        recordId: record.id,
      };
    }

    if (record.created_by) {
      const messageText =
        `Ваш інвентар успішно підтверджено адміністратором.\n\n` +
        `[Переглянути інвентар можна тут](${origin}/record/${record.id})`;

      await sendNotification({
        fromUserId: adminUserId,
        toUserId: record.created_by,
        messageType: 'approved',
        messageText,
      });
    }

    return {
      status: 'approved',
      message: 'Інвентар підтверджено і збережено.',
      recordId: record.id,
    };
  } catch (err: any) {
    console.error(err);
    return {
      status: 'error',
      message: `Невідома помилка при збереженні: ${err?.message || 'unknown error'}`,
      recordId: record.id,
    };
  }
}
