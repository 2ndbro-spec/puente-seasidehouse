const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

function buildConfirmationEmail({ reservation, menu, notif_channel }) {
  const isBbq = !!menu.slot_duration;
  const statusLabel = reservation.status === 'confirmed' ? '本予約' : '仮予約';
  const people = isBbq
    ? `${reservation.num_people}名`
    : `男性 ${reservation.num_male}名 / 女性 ${reservation.num_female}名`;
  const timeRow = isBbq
    ? `<tr><td style="padding:8px 0;color:#8896A6;width:120px">時間帯</td><td style="padding:8px 0">${reservation.time_start?.slice(0,5)}〜（2時間）</td></tr>`
    : `<tr><td style="padding:8px 0;color:#8896A6">チェックイン</td><td style="padding:8px 0">${reservation.checkin_time || '—'}</td></tr>`;

  const lineSection = notif_channel === 'line' ? `
    <div style="margin-top:24px;padding:16px;background:#f0faf4;border:1px solid #b7e8c8;border-radius:8px;text-align:center">
      <p style="margin:0 0 12px;font-size:14px;color:#2D3748">LINE通知を受け取るには、友だち追加後にこの予約番号をLINEで送ってください。</p>
      <a href="https://lin.ee/7boYnzG" style="display:inline-block;padding:10px 24px;background:#06C755;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">LINE 友だち追加 →</a>
    </div>` : '';

  const pendingNote = reservation.status === 'pending' ? `
    <div style="margin-top:16px;padding:12px;background:#fff8e1;border-left:4px solid #FFD96A;border-radius:4px">
      <p style="margin:0;font-size:13px;color:#2D3748">⚠️ 仮予約は <strong>${new Date(reservation.provisional_expires_at).toLocaleDateString('ja-JP')}</strong> までに本予約へ変更してください。</p>
    </div>` : '';

  return {
    subject: `【PUENTE seaside house】ご予約${statusLabel}確認 — ${reservation.reservation_code}`,
    html: `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Arial,sans-serif;color:#2D3748">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#2E8CB8,#36B5A0);padding:32px;text-align:center">
      <p style="margin:0;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:2px;text-transform:uppercase">Seaside House</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:700;letter-spacing:1px">PUENTE</h1>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;margin:0 0 24px">${reservation.name} 様、ご予約ありがとうございます。</p>

      <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#8896A6;width:120px">予約種別</td><td style="padding:8px 0"><strong style="color:${reservation.status === 'confirmed' ? '#36B5A0' : '#F08870'}">${statusLabel}</strong></td></tr>
          <tr><td style="padding:8px 0;color:#8896A6">メニュー</td><td style="padding:8px 0">${menu.name}</td></tr>
          <tr><td style="padding:8px 0;color:#8896A6">日付</td><td style="padding:8px 0">${reservation.date}</td></tr>
          ${timeRow}
          <tr><td style="padding:8px 0;color:#8896A6">人数</td><td style="padding:8px 0">${people}</td></tr>
        </table>
      </div>

      <div style="text-align:center;padding:20px;background:#e8f6fa;border-radius:8px;margin-bottom:20px">
        <p style="margin:0 0 8px;font-size:12px;color:#8896A6;letter-spacing:1px">予約番号</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#2E8CB8;letter-spacing:4px">${reservation.reservation_code}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#8896A6">当日スタッフにご提示ください</p>
      </div>

      ${pendingNote}
      ${lineSection}

      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:13px;color:#8896A6;margin:0">ご不明な点は<a href="https://lin.ee/7boYnzG" style="color:#2E8CB8">LINE公式アカウント</a>よりお問い合わせください。</p>
      <p style="font-size:12px;color:#aaa;margin:16px 0 0">PUENTE seaside house | 逗子海岸<br>
      <a href="https://puente-seasidehouse.com" style="color:#aaa">puente-seasidehouse.com</a></p>
    </div>
  </div>
</body>
</html>`
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { menu_id, date, time_start, num_people, num_male, num_female,
          checkin_time, status, name, email, notif_channel, addon_ids, provisional_days } = body;

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
    notif_channel: notif_channel || 'email',
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

  // 確認メール送信（失敗しても予約は成功扱い）
  if (process.env.RESEND_API_KEY) {
    try {
      const { subject, html } = buildConfirmationEmail({ reservation, menu, notif_channel });
      await resend.emails.send({
        from: 'PUENTE seaside house <noreply@puente-seasidehouse.com>',
        to: [reservation.email],
        subject,
        html,
      });
    } catch (mailErr) {
      console.error('メール送信エラー:', mailErr);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, reservation: { ...reservation, menu_name: menu.name } })
  };
};
