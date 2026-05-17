const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const STAFF_PASSWORD = process.env.STAFF_PASSWORD;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // パスワード認証
  const auth = event.headers['x-staff-password'];
  if (!STAFF_PASSWORD || auth !== STAFF_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: '認証に失敗しました' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { reservation_code } = body;
  if (!reservation_code) {
    return { statusCode: 400, body: JSON.stringify({ error: '予約番号が必要です' }) };
  }

  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id, reservation_code, status, name, date, num_people, num_male, num_female, time_start, checked_in_at, menus(name, slot_duration)')
    .eq('reservation_code', reservation_code.toUpperCase().trim())
    .single();

  if (error || !reservation) {
    return { statusCode: 404, body: JSON.stringify({ error: '予約が見つかりません' }) };
  }

  // ステータスチェック
  if (reservation.status === 'pending') {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: 'この予約はまだ仮予約です。本予約への変更をご案内ください。', reservation })
    };
  }
  if (reservation.status !== 'confirmed') {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: `この予約は ${reservation.status} です。チェックインできません。`, reservation })
    };
  }

  // 日付チェック（当日のみチェックイン可）
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD
  if (reservation.date !== today) {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: `チェックイン日が違います（予約日: ${reservation.date}、本日: ${today}）`,
        reservation
      })
    };
  }

  // 二重チェックイン検出
  if (reservation.checked_in_at) {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: `この予約はすでにチェックイン済みです（${new Date(reservation.checked_in_at).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}）`,
        reservation,
        already_checked_in: true,
      })
    };
  }

  // チェックイン記録
  const { error: updateError } = await supabase
    .from('reservations')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', reservation.id);

  if (updateError) {
    console.error(updateError);
    return { statusCode: 500, body: JSON.stringify({ error: 'チェックイン処理に失敗しました' }) };
  }

  const menu = reservation.menus;
  const isBbq = !!menu?.slot_duration;
  const people = isBbq
    ? `${reservation.num_people}名`
    : `男性 ${reservation.num_male}名 / 女性 ${reservation.num_female}名`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      reservation: {
        reservation_code: reservation.reservation_code,
        name: reservation.name,
        menu_name: menu?.name,
        date: reservation.date,
        time_start: reservation.time_start,
        people,
      }
    })
  };
};
