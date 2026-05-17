const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const STAFF_PASSWORD = process.env.STAFF_PASSWORD;

exports.handler = async (event) => {
  // パスワード認証
  const auth = event.headers['x-staff-password'];
  if (!STAFF_PASSWORD || auth !== STAFF_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: '認証に失敗しました' }) };
  }

  // GET: 指定日の在庫一覧
  if (event.httpMethod === 'GET') {
    const date = event.queryStringParameters?.date;
    if (!date) return { statusCode: 400, body: JSON.stringify({ error: '日付が必要です' }) };

    const { data: menus } = await supabase
      .from('menus')
      .select('id, name, default_capacity, slot_duration')
      .eq('is_active', true);

    const { data: inventory } = await supabase
      .from('inventory')
      .select('*')
      .eq('date', date);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menus, inventory }),
    };
  }

  // POST: 在庫を上書き設定
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { date, menu_id, capacity, time_start } = body;
    if (!date || !menu_id || capacity == null) {
      return { statusCode: 400, body: JSON.stringify({ error: 'date・menu_id・capacity は必須です' }) };
    }

    // upsert（既存があれば更新、なければ挿入）
    const { error } = await supabase
      .from('inventory')
      .upsert(
        { date, menu_id, capacity, time_start: time_start || null },
        { onConflict: 'menu_id,date,time_start' }
      );

    if (error) {
      console.error(error);
      return { statusCode: 500, body: JSON.stringify({ error: '在庫設定に失敗しました' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
