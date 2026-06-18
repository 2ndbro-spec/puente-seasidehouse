const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const BBQ_ID = '618e2221-7a17-4d2a-ab14-f8dd2aa695a2';
const LS_ID  = 'c909b014-2b82-4732-be07-ebfe72b1726d';
const BBQ_DEFAULT_CAP = 50;
const LS_DEFAULT_CAP  = 30;
const SEASON_START = '2026-07-03';
const SEASON_END   = '2026-09-06';

function getStatus(remaining, capacity) {
  if (capacity === 0) return 'closed';
  const pct = remaining / capacity;
  if (pct >= 0.7) return 'open';      // ◯
  if (pct >= 0.1) return 'limited';   // △
  return 'full';                       // ✕
}

function dateRange(from, to) {
  const dates = [];
  const cur = new Date(from + 'T00:00:00Z');
  const end = new Date(to   + 'T00:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const params = event.queryStringParameters || {};
    const from = params.from || SEASON_START;
    const to   = params.to   || SEASON_END;

    const dates = dateRange(from, to);

    // 5クエリを並列実行
    const [
      { data: eventsRaw },
      { data: bbqInv },
      { data: bbqRsv },
      { data: lsInv },
      { data: lsRsv },
    ] = await Promise.all([
      supabase.from('events').select('*').gte('date', from).lte('date', to).order('date'),
      supabase.from('inventory').select('date, capacity').eq('menu_id', BBQ_ID).gte('date', from).lte('date', to),
      supabase.from('reservations').select('date, time_start, num_people').eq('menu_id', BBQ_ID).gte('date', from).lte('date', to).in('status', ['confirmed', 'pending']),
      supabase.from('inventory').select('date, capacity').eq('menu_id', LS_ID).gte('date', from).lte('date', to).is('time_start', null),
      supabase.from('reservations').select('date, num_male, num_female, num_people').eq('menu_id', LS_ID).gte('date', from).lte('date', to).in('status', ['confirmed', 'pending']),
    ]);

    // --- イベント ---
    const eventsByDate = {};
    (eventsRaw || []).forEach(e => {
      if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
      eventsByDate[e.date].push({ id: e.id, title: e.title, type: e.type, description: e.description });
    });

    // --- BBQ ---
    const bbqInvByDate = {};
    (bbqInv || []).forEach(r => {
      if (!bbqInvByDate[r.date] || r.capacity < bbqInvByDate[r.date]) {
        bbqInvByDate[r.date] = r.capacity;
      }
    });

    const bbqSlotBooked = {};
    (bbqRsv || []).forEach(r => {
      const t = r.time_start?.slice(0, 5) || 'all';
      if (!bbqSlotBooked[r.date]) bbqSlotBooked[r.date] = {};
      bbqSlotBooked[r.date][t] = (bbqSlotBooked[r.date][t] || 0) + (r.num_people || 0);
    });

    // --- L/S ---
    const lsInvByDate = {};
    (lsInv || []).forEach(r => { lsInvByDate[r.date] = r.capacity; });

    const lsBookedByDate = {};
    (lsRsv || []).forEach(r => {
      const n = (r.num_male || 0) + (r.num_female || 0) || (r.num_people || 0);
      lsBookedByDate[r.date] = (lsBookedByDate[r.date] || 0) + n;
    });

    // --- 日ごとに集計 ---
    const result = dates.map(date => {
      const inSeason = date >= SEASON_START && date <= SEASON_END;

      if (!inSeason) {
        return { date, inSeason: false, events: eventsByDate[date] || [] };
      }

      // BBQ: 最も混んでいるスロットの残枠
      const bbqCap = bbqInvByDate[date] ?? BBQ_DEFAULT_CAP;
      const bbqSlots = bbqSlotBooked[date] || {};
      const maxBooked = Object.values(bbqSlots).reduce((a, b) => Math.max(a, b), 0);
      const bbqRemaining = bbqCap - maxBooked;

      // L/S
      const lsCap = lsInvByDate[date] ?? LS_DEFAULT_CAP;
      const lsBooked = lsBookedByDate[date] || 0;
      const lsRemaining = lsCap - lsBooked;

      return {
        date,
        inSeason: true,
        bbq: {
          remaining: Math.max(0, bbqRemaining),
          capacity: bbqCap,
          status: getStatus(Math.max(0, bbqRemaining), bbqCap),
        },
        ls: {
          remaining: Math.max(0, lsRemaining),
          capacity: lsCap,
          status: getStatus(Math.max(0, lsRemaining), lsCap),
        },
        events: eventsByDate[date] || [],
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify({ days: result }) };

  } catch (err) {
    console.error('calendar error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'server error' }) };
  }
};
