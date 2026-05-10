const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

function verifySignature(rawBody, signature) {
  const hash = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

async function replyMessage(replyToken, messages) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

async function handleTextMessage(lineUserId, replyToken, text) {
  // 8文字英数字の予約番号を抽出（スペース・ハイフン・大文字変換して検索）
  const code = text.trim().toUpperCase().replace(/[-\s]/g, '').slice(0, 8);

  if (code.length < 6) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: '予約番号をそのままメッセージで送信してください。\n予約確認メールまたはQRコード画面に記載の英数字8桁です。\n例：A1B2C3D4',
    }]);
    return;
  }

  const { data: reservation } = await supabase
    .from('reservations')
    .select('*, menus(name, slot_duration)')
    .eq('reservation_code', code)
    .in('status', ['confirmed', 'pending'])
    .single();

  if (!reservation) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: `「${code}」の予約が見つかりませんでした。\n予約番号をご確認の上、もう一度お送りください。`,
    }]);
    return;
  }

  // LINE user IDを予約に紐付け
  await supabase
    .from('reservations')
    .update({ line_user_id: lineUserId })
    .eq('id', reservation.id);

  const isBbq = !!reservation.menus?.slot_duration;
  const people = isBbq
    ? `${reservation.num_people}名`
    : `男性${reservation.num_male}名 / 女性${reservation.num_female}名`;
  const timeText = isBbq
    ? `⏰ 時間：${reservation.time_start?.slice(0, 5)}〜（2時間）\n`
    : `⏰ チェックイン予定：${reservation.checkin_time || '当日受付'}\n`;
  const statusLabel = reservation.status === 'confirmed' ? '✅ 本予約' : '⚠️ 仮予約';
  const pendingNote = reservation.status === 'pending'
    ? `\n⚠️ 仮予約は ${new Date(reservation.provisional_expires_at).toLocaleDateString('ja-JP')} までに本予約へご変更ください。`
    : '';

  await replyMessage(replyToken, [{
    type: 'text',
    text: `予約番号を確認しました！\n\n📋 予約内容\n━━━━━━━━━━\n${statusLabel}\n📅 日付：${reservation.date}\n${timeText}👥 人数：${people}\n🎫 予約番号：${reservation.reservation_code}\n━━━━━━━━━━\n\n当日は予約番号またはQRコードをスタッフにご提示ください 🌊${pendingNote}\n\n前日にリマインダーをお送りします。`,
  }]);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signature = event.headers['x-line-signature'];
  if (!signature || !verifySignature(event.body, signature)) {
    return { statusCode: 401, body: 'Invalid signature' };
  }

  const { events } = JSON.parse(event.body);

  await Promise.all(
    events.map(async (ev) => {
      if (ev.type === 'message' && ev.message.type === 'text') {
        await handleTextMessage(ev.source.userId, ev.replyToken, ev.message.text);
      }
    })
  );

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
