const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { menu_id, date, time_start, num_people, num_male, num_female,
          checkin_time, status, name, email, line_user_id, addon_ids, provisional_days } = body;

  if (!menu_id || !date || !name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: '必須項目が不足しています' }) };
  }

  const { data: menu } = await supabase
    .from('menus').select('*').eq('id', menu_id).eq('is_active', true).single();
  if (!menu) return { statusCode: 404, body: JSON.stringify({ error: 'メニューが見つかりません' }) };

  if (menu.slot_duration && !time_start) {
    return { statusCode: 400, body: JSON.stringify({ error: '時間帯を選択してください' }) };
  }

  const totalPeople = menu.slot_duration
    ? (num_people || 0)
    : ((num_male || 0) + (num_female || 0));

  if (totalPeople < menu.min_people) {
    return { statusCode: 400, body: JSON.stringify({ error: `最小人数は${menu.min_people}名です` }) };
  }
  if (totalPeople > menu.max_people) {
    return { statusCode: 400, body: JSON.stringify({ error: `最大人数は${menu.max_people}名です` }) };
  }

  // 在庫チェック
  if (menu.slot_duration) {
    const { data: inv } = await supabase
      .from('inventory').select('capacity')
      .eq('menu_id', menu_id).eq('date', date).eq('time_start', time_start).single();
    const capacity = inv?.capacity ?? menu.default_capacity;

    const { data: booked } = await supabase
      .from('reservations').select('num_people')
      .eq('menu_id', menu_id).eq('date', date).eq('time_start', time_start)
      .in('status', ['confirmed', 'pending']);
    const bookedCount = (booked || []).reduce((s, r) => s + r.num_people, 0);

    if (bookedCount + totalPeople > capacity) {
      return { statusCode: 409, body: JSON.stringify({ error: 'この時間帯は満席です。別の時間をお選びください。' }) };
    }
  } else {
    const { data: inv } = await supabase
      .from('inventory').select('capacity')
      .eq('menu_id', menu_id).eq('date', date).is('time_start', null).single();
    const capacity = inv?.capacity ?? menu.default_capacity;

    const { data: booked } = await supabase
      .from('reservations').select('num_male, num_female, num_people')
      .eq('menu_id', menu_id).eq('date', date).in('status', ['confirmed', 'pending']);
    const bookedCount = (booked || []).reduce((s, r) => {
      const n = (r.num_male || 0) + (r.num_female || 0);
      return s + (n > 0 ? n : (r.num_people || 0));
    }, 0);

    if (bookedCount + totalPeople > capacity) {
      return { statusCode: 409, body: JSON.stringify({ error: 'この日は満員です。別の日をお選びください。' }) };
    }
  }

  // 仮予約の期限
  let provisional_expires_at = null;
  if (status === 'pending') {
    const d = new Date();
    d.setDate(d.getDate() + (provisional_days || 3));
    provisional_expires_at = d.toISOString();
  }

  const insertData = {
    menu_id, date, name, email,
    status: status || 'confirmed',
    line_user_id: line_user_id || null,
    provisional_expires_at,
    ...(menu.slot_duration
      ? { time_start, num_people: totalPeople }
      : { num_male: num_male || 0, num_female: num_female || 0, num_people: totalPeople, checkin_time: checkin_time || null }
    )
  };

  const { data: reservation, error } = await supabase
    .from('reservations').insert(insertData)
    .select('id, reservation_code, status, date, time_start, num_people, num_male, num_female, checkin_time, name, email, provisional_expires_at')
    .single();

  if (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: '予約の作成に失敗しました' }) };
  }

  if (addon_ids?.length) {
    await supabase.from('reservation_addons').insert(
      addon_ids.map(addon_id => ({ reservation_id: reservation.id, addon_id }))
    );
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, reservation: { ...reservation, menu_name: menu.name } })
  };
};
