const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

function buildConfirmedEmail({ reservation, menu }) {
  const isBbq = !!menu.slot_duration;
  const people = isBbq
    ? `${reservation.num_people}名`
    : `男性 ${reservation.num_male}名 / 女性 ${reservation.num_female}名`;
  const timeRow = isBbq
    ? `<tr><td style="padding:8px 0;color:#8896A6;width:120px">時間帯</td><td style="padding:8px 0">${reservation.time_start?.slice(0,5)}〜（2時間）</td></tr>`
    : `<tr><td style="padding:8px 0;color:#8896A6">チェックイン</td><td style="padding:8px 0">${reservation.checkin_time || '—'}</td></tr>`;

  return {
    subject: `【PUENTE seaside house】本予約が確定しました — ${reservation.reservation_code}`,
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
      <div style="margin-bottom:24px;padding:16px;background:#e8f8f0;border:1px solid #b7e8c8;border-radius:8px;text-align:center">
        <p style="margin:0;font-size:18px;font-weight:700;color:#36B5A0">✅ 本予約が確定しました</p>
      </div>
      <p style="font-size:16px;margin:0 0 24px">${reservation.name} 様、本予約への変更が完了しました。</p>

      <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#8896A6;width:120px">予約種別</td><td style="padding:8px 0"><strong style="color:#36B5A0">本予約</strong></td></tr>
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

  const { reservation_code, email } = body;

  if (!reservation_code || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: '予約番号とメールアドレスを入力してください' }) };
  }

  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('*, menus(id,name,slot_duration,min_people,max_people)')
    .eq('reservation_code', reservation_code.toUpperCase().trim())
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !reservation) {
    return { statusCode: 404, body: JSON.stringify({ error: '予約が見つかりません。予約番号またはメールアドレスをご確認ください。' }) };
  }

  if (reservation.status === 'confirmed') {
    return { statusCode: 409, body: JSON.stringify({ error: 'この予約はすでに本予約済みです。' }) };
  }

  if (reservation.status === 'expired') {
    return { statusCode: 410, body: JSON.stringify({ error: 'この仮予約は期限切れです。お手数ですが、再度ご予約ください。' }) };
  }

  if (reservation.status === 'cancelled') {
    return { statusCode: 410, body: JSON.stringify({ error: 'この予約はキャンセルされています。' }) };
  }

  if (reservation.status !== 'pending') {
    return { statusCode: 400, body: JSON.stringify({ error: '予約状態が不正です。' }) };
  }

  const { error: updateError } = await supabase
    .from('reservations')
    .update({ status: 'confirmed', provisional_expires_at: null })
    .eq('id', reservation.id);

  if (updateError) {
    console.error(updateError);
    return { statusCode: 500, body: JSON.stringify({ error: '本予約への変更に失敗しました' }) };
  }

  const confirmedReservation = { ...reservation, status: 'confirmed', provisional_expires_at: null };
  const menu = reservation.menus;

  if (process.env.RESEND_API_KEY) {
    try {
      const { subject, html } = buildConfirmedEmail({ reservation: confirmedReservation, menu });
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
    body: JSON.stringify({
      success: true,
      reservation: {
        reservation_code: confirmedReservation.reservation_code,
        name: confirmedReservation.name,
        date: confirmedReservation.date,
        menu_name: menu.name,
      }
    })
  };
};
