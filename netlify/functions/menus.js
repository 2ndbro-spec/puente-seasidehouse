const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  // ?event=1 でイベント専用メニューのみ返す（通常予約ページには出さない）
  const wantEvent = event?.queryStringParameters?.event === '1';

  const { data: menus, error } = await supabase
    .from('menus')
    .select('id, name, description, price, min_people, max_people, open_time, close_time, slot_duration, slot_interval, default_capacity')
    .eq('is_active', true)
    .eq('is_event', wantEvent)
    .order('created_at');

  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  const result = await Promise.all(menus.map(async menu => {
    const { data: addons } = await supabase
      .from('menu_addons')
      .select('id, name, price')
      .eq('menu_id', menu.id)
      .eq('is_active', true);
    return { ...menu, addons: addons || [] };
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify(result)
  };
};
