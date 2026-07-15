const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const EVENT_DATE = '2026-07-30';
const EVENT_NAME = '森沢かな1日店長';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = event.queryStringParameters?.token;
  const expectedToken = process.env.EVENT_STATUS_TOKEN;

  if (!expectedToken || !token || token !== expectedToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  try {
    // 1. イベント対象メニュー
    const { data: menus, error: menusError } = await supabase
      .from('menus')
      .select('id, name, price, default_capacity, open_time')
      .eq('is_event', true)
      .eq('is_active', true)
      .order('created_at');

    if (menusError) throw menusError;

    const menuIds = (menus || []).map(m => m.id);

    if (menuIds.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          event: EVENT_NAME,
          date: EVENT_DATE,
          total_reserved: 0,
          parts: [],
          bbq: { people: 0, groups: 0 },
          generated_at: new Date().toISOString()
        })
      };
    }

    // 2. 在庫（capacity上書き）
    const { data: invRows, error: invError } = await supabase
      .from('inventory')
      .select('menu_id, time_start, capacity')
      .eq('date', EVENT_DATE)
      .in('menu_id', menuIds);

    if (invError) throw invError;

    const capacityByMenu = {};
    (invRows || []).forEach(row => {
      capacityByMenu[row.menu_id] = row.capacity;
    });

    // 3. 予約（reservation_addonsをネストで取得。失敗したら別クエリでフォールバック）
    let reservations = [];
    {
      const { data: rsvRows, error: rsvError } = await supabase
        .from('reservations')
        .select('id, menu_id, num_people, reservation_addons(id)')
        .in('menu_id', menuIds)
        .eq('date', EVENT_DATE)
        .in('status', ['confirmed', 'pending']);

      if (rsvError) {
        // ネスト埋め込みが失敗した場合、reservation_addonsを別クエリで取得
        const { data: rsvRowsFlat, error: rsvFlatError } = await supabase
          .from('reservations')
          .select('id, menu_id, num_people')
          .in('menu_id', menuIds)
          .eq('date', EVENT_DATE)
          .in('status', ['confirmed', 'pending']);

        if (rsvFlatError) throw rsvFlatError;

        const reservationIds = (rsvRowsFlat || []).map(r => r.id);
        let addonsByReservation = {};

        if (reservationIds.length > 0) {
          const { data: addonRows, error: addonError } = await supabase
            .from('reservation_addons')
            .select('id, reservation_id')
            .in('reservation_id', reservationIds);

          if (addonError) throw addonError;

          (addonRows || []).forEach(a => {
            if (!addonsByReservation[a.reservation_id]) addonsByReservation[a.reservation_id] = [];
            addonsByReservation[a.reservation_id].push({ id: a.id });
          });
        }

        reservations = (rsvRowsFlat || []).map(r => ({
          ...r,
          reservation_addons: addonsByReservation[r.id] || []
        }));
      } else {
        reservations = rsvRows || [];
      }
    }

    // 4. メニューごとに集計
    const parts = (menus || []).map(menu => {
      const menuReservations = reservations.filter(r => r.menu_id === menu.id);
      const reserved = menuReservations.reduce((sum, r) => sum + (r.num_people || 0), 0);
      const groups = menuReservations.length;
      const capacity = capacityByMenu[menu.id] ?? menu.default_capacity;
      const remaining = capacity - reserved;

      return {
        menu_id: menu.id,
        name: menu.name,
        reserved,
        capacity,
        remaining,
        groups
      };
    });

    // 通し券は全部の席を消費するため、実効残席に反映
    const passPart = parts.find(p => p.name.includes('通し'));
    const passBooked = passPart ? passPart.reserved : 0;
    parts.forEach(p => {
      if (p !== passPart) p.remaining = p.capacity - p.reserved - passBooked;
    });
    if (passPart) {
      const partRemainings = parts.filter(p => p !== passPart).map(p => p.remaining);
      const ownRemaining = passPart.capacity - passBooked;
      passPart.remaining = partRemainings.length ? Math.min(ownRemaining, ...partRemainings) : ownRemaining;
    }

    const total_reserved = parts.reduce((sum, p) => sum + p.reserved, 0);

    // 5. BBQ集計（reservation_addonsが1件以上ある予約）
    const bbqReservations = reservations.filter(r => (r.reservation_addons || []).length > 0);
    const bbq = {
      people: bbqReservations.reduce((sum, r) => sum + (r.num_people || 0), 0),
      groups: bbqReservations.length
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        event: EVENT_NAME,
        date: EVENT_DATE,
        total_reserved,
        parts,
        bbq,
        generated_at: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
