// イベントメニュー（is_event=true）の実効残席計算
// 通し券の予約は 1部/2部/3部 すべての席を同時に消費する:
//   部の実効残席   = 部の定員 − 部の予約数 − 通しの予約数
//   通しの実効残席 = min(各部の実効残席, 通し定員 − 通し予約数)
function isPassMenu(menu) {
  return menu.name.includes('通し');
}

async function getEventCapacity(supabase, date) {
  const { data: menus, error: menusError } = await supabase
    .from('menus')
    .select('*')
    .eq('is_event', true)
    .eq('is_active', true)
    .order('created_at');
  if (menusError) throw menusError;

  const all = menus || [];
  const parts = all.filter(m => !isPassMenu(m));
  const pass = all.find(isPassMenu) || null;
  const ids = all.map(m => m.id);
  const info = {};
  if (!ids.length) return { menus: all, parts, pass, info, passBooked: 0 };

  const { data: invRows, error: invError } = await supabase
    .from('inventory')
    .select('menu_id, capacity')
    .eq('date', date)
    .in('menu_id', ids);
  if (invError) throw invError;
  const capByMenu = {};
  (invRows || []).forEach(r => { capByMenu[r.menu_id] = r.capacity; });

  const { data: rsvRows, error: rsvError } = await supabase
    .from('reservations')
    .select('menu_id, num_people')
    .eq('date', date)
    .in('menu_id', ids)
    .in('status', ['confirmed', 'pending']);
  if (rsvError) throw rsvError;
  const bookedByMenu = {};
  (rsvRows || []).forEach(r => {
    bookedByMenu[r.menu_id] = (bookedByMenu[r.menu_id] || 0) + (r.num_people || 0);
  });

  const passBooked = pass ? (bookedByMenu[pass.id] || 0) : 0;

  parts.forEach(m => {
    const capacity = capByMenu[m.id] ?? m.default_capacity;
    const booked = bookedByMenu[m.id] || 0;
    info[m.id] = { capacity, booked, remaining: capacity - booked - passBooked };
  });

  if (pass) {
    const capacity = capByMenu[pass.id] ?? pass.default_capacity;
    const ownRemaining = capacity - passBooked;
    const partRemainings = parts.map(m => info[m.id].remaining);
    info[pass.id] = {
      capacity,
      booked: passBooked,
      remaining: partRemainings.length ? Math.min(ownRemaining, ...partRemainings) : ownRemaining,
    };
  }

  return { menus: all, parts, pass, info, passBooked };
}

module.exports = { getEventCapacity, isPassMenu };
