const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function generateSlots(openTime, closeTime, slotDuration, slotInterval) {
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const slots = [];
  for (let t = toMin(openTime); t + slotDuration <= toMin(closeTime); t += slotInterval) {
    slots.push(toTime(t));
  }
  return slots;
}

exports.handler = async (event) => {
  const { menu_id, date } = event.queryStringParameters || {};
  if (!menu_id || !date) {
    return { statusCode: 400, body: JSON.stringify({ error: 'menu_id and date are required' }) };
  }

  const { data: menu } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menu_id)
    .eq('is_active', true)
    .single();

  if (!menu) return { statusCode: 404, body: JSON.stringify({ error: 'Menu not found' }) };

  const headers = { 'Content-Type': 'application/json' };

  if (menu.slot_duration) {
    // BBQ: 時間帯ごとの在庫
    const slots = generateSlots(menu.open_time, menu.close_time, menu.slot_duration, menu.slot_interval);

    const { data: invRows } = await supabase
      .from('inventory')
      .select('time_start, capacity')
      .eq('menu_id', menu_id)
      .eq('date', date)
      .not('time_start', 'is', null);

    const invMap = {};
    (invRows || []).forEach(r => { invMap[r.time_start.slice(0, 5)] = r.capacity; });

    const { data: rsvRows } = await supabase
      .from('reservations')
      .select('time_start, num_people')
      .eq('menu_id', menu_id)
      .eq('date', date)
      .in('status', ['confirmed', 'pending']);

    const bookedMap = {};
    (rsvRows || []).forEach(r => {
      const t = r.time_start?.slice(0, 5);
      if (t) bookedMap[t] = (bookedMap[t] || 0) + (r.num_people || 0);
    });

    const result = slots.map(slot => ({
      time_start: slot,
      capacity: invMap[slot] ?? menu.default_capacity,
      remaining: (invMap[slot] ?? menu.default_capacity) - (bookedMap[slot] || 0)
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ type: 'timed', slots: result, menu }) };
  } else {
    // ロッカーシャワー: 1日単位
    const { data: inv } = await supabase
      .from('inventory')
      .select('capacity')
      .eq('menu_id', menu_id)
      .eq('date', date)
      .is('time_start', null)
      .single();

    const capacity = inv?.capacity ?? menu.default_capacity;

    const { data: rsvRows } = await supabase
      .from('reservations')
      .select('num_male, num_female, num_people')
      .eq('menu_id', menu_id)
      .eq('date', date)
      .in('status', ['confirmed', 'pending']);

    const booked = (rsvRows || []).reduce((sum, r) => {
      const n = (r.num_male || 0) + (r.num_female || 0);
      return sum + (n > 0 ? n : (r.num_people || 0));
    }, 0);

    return { statusCode: 200, headers, body: JSON.stringify({ type: 'allday', remaining: capacity - booked, capacity, menu }) };
  }
};
