const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const STAFF_PASSWORD = process.env.STAFF_PASSWORD;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  // パスワード認証
  const auth = event.headers['x-staff-password'];
  if (!STAFF_PASSWORD || auth !== STAFF_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: '認証に失敗しました' }) };
  }

  const date = event.queryStringParameters?.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, body: JSON.stringify({ error: '日付パラメータが不正です（YYYY-MM-DD）' }) };
  }

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('id, reservation_code, status, name, email, notif_channel, line_user_id, num_people, num_male, num_female, time_start, checkin_time, created_at, checked_in_at, menus(name, slot_duration)')
    .eq('date', date)
    .in('status', ['confirmed', 'pending'])
    .order('time_start', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'データ取得に失敗しました' }) };
  }

  // メニュー別にグループ化して集計
  const bbq = reservations.filter(r => r.menus?.slot_duration);
  const ls  = reservations.filter(r => !r.menus?.slot_duration);

  const totalBbq = bbq.reduce((s, r) => s + (r.num_people || 0), 0);
  const totalLs  = ls.reduce((s, r) => s + ((r.num_male || 0) + (r.num_female || 0)), 0);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date,
      summary: { bbq_people: totalBbq, ls_people: totalLs },
      reservations,
    }),
  };
};
