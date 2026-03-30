import emailjs from 'emailjs-com';
import regionStructure from '../public/data/region_structure.json';
import { sendNotification } from '../components/notifications';
import { supabase } from './supabaseClient';

const getSettlementCodeByPath = (
  structure: any,
  region: string,
  district: string,
  community: string,
  type: string,
  name: string
): string | null => {
  const regionNode = structure[region];
  if (!regionNode) return null;

  const districtNode = regionNode[district];
  if (!districtNode) return null;

  const communityNode = districtNode[community];
  if (!communityNode || !Array.isArray(communityNode)) return null;

  const settlement = communityNode.find(
    (item: any) => item.name === name && item.type === type
  );

  return settlement?.code || null;
};

const parseIntegerOrNull = (value: any) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
};

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
    const matchQuery: Record<string, any> = {
      current_region: record.current_region,
      current_district: record.current_district,
      current_community: record.current_community,
      current_settlement_type: record.current_settlement_type,
      current_settlement_name: record.current_settlement_name,
      old_settlement_type: record.old_settlement_type,
      old_settlement_name: record.old_settlement_name,
      case_signature: record.case_signature,
    };

    let existing;
    if (record.inventory_year) {
      ({ data: existing } = await supabase
        .from('records')
        .select('id')
        .match({ ...matchQuery, inventory_year: record.inventory_year })
        .maybeSingle());
    } else {
      ({ data: existing } = await supabase
        .from('records')
        .select('id')
        .match(matchQuery)
        .is('inventory_year', null)
        .maybeSingle());
    }

    if (existing) {
      return {
        status: 'duplicate',
        message: 'Такий інвентар уже існує в реєстрі.',
        recordId: record.id,
      };
    }

    const { is_ukrainian_archive, ...recordToInsert } = record;

    const preparedRecord = {
      ...recordToInsert,
      approved: true,
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
      return {
        status: 'error',
        message: `Помилка при додаванні до бази: ${insertError.message}`,
        recordId: record.id,
      };
    }

    const settlementCode = getSettlementCodeByPath(
      regionStructure,
      record.current_region,
      record.current_district,
      record.current_community,
      record.current_settlement_type,
      record.current_settlement_name
    );

    await notifySettlementSubscribers({
      settlement: `${record.current_region}, ${record.current_district}, ${record.current_community}, ${record.current_settlement_type} ${record.current_settlement_name}`,
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
