/* 森沢かな1日店長イベント 専用予約フォーム
   既存予約基盤（/api/menus?event=1 → /api/availability → POST /api/reserve）を利用
   - 各部は複数選択可。1〜3部すべて選択で「1日通し券」に自動アップグレード
   - 物販の希望・BBQ希望は notes としてスタッフ画面・確認メールに反映 */
(function () {
  'use strict';

  const EVENT_DATE = '2026-07-30';
  const EVENT_CALLOUT = '※当日は受付で「森沢かなイベントの予約」とお伝えください';
  const $ = id => document.getElementById(id);

  const state = {
    parts: [],            // 1部/2部/3部 のメニュー（created_at順）
    passMenu: null,       // 1日通しメニュー
    availability: {},     // menu_id → { remaining, capacity, time_start }
    selected: new Set(),  // 選択中の部 menu_id
    numPeople: 1,
    bbq: false,
    notifChannel: 'line',
  };

  function isPass(menu) { return menu.name.includes('通し'); }

  function partMeta(menu) {
    if (menu.name.includes('1部')) return { num: '1', label: '1部', time: '11:00 - 13:00', cls: 'p1' };
    if (menu.name.includes('2部')) return { num: '2', label: '2部', time: '13:30 - 15:30', cls: 'p2' };
    if (menu.name.includes('3部')) return { num: '3', label: '3部', time: '16:00 - 18:00', cls: 'p3' };
    return { num: '🎟', label: '1日通し', time: '11:00 - 18:00', cls: 'pass' };
  }

  async function init() {
    try {
      const res = await fetch('/api/menus?event=1');
      if (!res.ok) throw new Error();
      const menus = await res.json();
      if (!menus.length) throw new Error();
      state.parts = menus.filter(m => !isPass(m));
      state.passMenu = menus.find(isPass) || null;
      await fetchAvailability(menus);
      renderPartOptions();
      $('ev-loading').classList.add('hidden');
      $('form-body').classList.remove('hidden');
    } catch {
      $('ev-loading').innerHTML =
        '予約メニューを読み込めませんでした。時間をおいて再度お試しいただくか、<a href="https://lin.ee/7boYnzG" target="_blank" rel="noopener">LINE公式アカウント</a>よりご連絡ください。';
    }
  }

  async function fetchAvailability(menus) {
    await Promise.all(menus.map(async menu => {
      try {
        const res = await fetch(`/api/availability?menu_id=${menu.id}&date=${EVENT_DATE}`);
        const data = await res.json();
        const slot = data.slots && data.slots[0];
        if (slot) state.availability[menu.id] = slot;
      } catch { /* 残席不明でも選択自体は可能にする */ }
    }));
  }

  function remainingBadge(menu) {
    const slot = state.availability[menu.id];
    if (!slot) return '<span class="evr-remaining ok">受付中</span>';
    if (slot.remaining <= 0) return '<span class="evr-remaining full">満席</span>';
    if (slot.remaining <= 5) return `<span class="evr-remaining few">残り${slot.remaining}席</span>`;
    return '<span class="evr-remaining ok">空きあり</span>';
  }

  function renderPartOptions() {
    const wrap = $('part-options');
    wrap.innerHTML = state.parts.map(menu => {
      const meta = partMeta(menu);
      const slot = state.availability[menu.id];
      const soldOut = slot && slot.remaining <= 0;
      return `
        <label class="evr-part ${meta.cls} ${soldOut ? 'soldout' : ''}">
          <span class="evr-part-head">
            <input type="checkbox" name="ev-part" value="${menu.id}" ${soldOut ? 'disabled' : ''}>
            <span class="evr-part-badge">${meta.num}</span>
            <span class="evr-part-title">${meta.label}</span>
            ${remainingBadge(menu)}
          </span>
          <span class="evr-part-time">🕐 ${meta.time}</span>
          <span class="evr-part-perk">
            <span class="evr-part-price">¥${menu.price.toLocaleString()}</span>
            <span class="evr-perk-tag">🎁 ブロマイド付き</span>
          </span>
        </label>`;
    }).join('');

    wrap.querySelectorAll('input[name="ev-part"]').forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) state.selected.add(input.value);
        else state.selected.delete(input.value);
        input.closest('.evr-part').classList.toggle('selected', input.checked);
        updatePassUpsell();
        hideError();
      });
    });
  }

  function passApplied() {
    return !!state.passMenu &&
      state.parts.length === 3 &&
      state.parts.every(m => state.selected.has(m.id));
  }

  function updatePassUpsell() {
    const box = $('pass-upsell');
    if (!box) return;
    if (passApplied()) {
      box.classList.add('active');
      box.innerHTML = '✨ <strong>1日通し券 ¥7,500 が適用されました！</strong><br>' +
        '<span class="evr-perk-tag">🎬 通し特典：10秒動画つき</span> <span class="evr-perk-tag">💰 ¥1,500おトク</span>';
    } else {
      box.classList.remove('active');
      box.innerHTML = '💡 <strong>3部すべて選ぶと「1日通し券 ¥7,500」に自動でおトク切替！</strong><br>' +
        '<span class="evr-perk-tag">🎬 通し特典：10秒動画つき</span> <span class="evr-perk-tag">💰 ¥1,500おトク</span>';
    }
  }

  function selectedPartMenus() {
    return state.parts.filter(m => state.selected.has(m.id));
  }

  function selectedGoods() {
    return [...document.querySelectorAll('.goods-check:checked')].map(c => c.value);
  }

  function bbqAddon(menu) {
    return (menu.addons || [])[0] || null;
  }

  /* --- 人数ステッパー --- */
  function bindStepper() {
    document.querySelectorAll('.num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = btn.dataset.action === 'plus' ? 1 : -1;
        setPeople(state.numPeople + delta);
      });
    });
    $('num-people-display').addEventListener('change', e => {
      setPeople(parseInt(e.target.value, 10) || 1);
    });
  }

  function setPeople(n) {
    state.numPeople = Math.min(10, Math.max(1, n));
    $('num-people-display').value = state.numPeople;
  }

  /* --- バリデーション --- */
  function validate() {
    const errors = [];
    const parts = selectedPartMenus();
    if (!parts.length) errors.push('ご希望の部を1つ以上選択してください');

    if (passApplied()) {
      const slot = state.availability[state.passMenu.id];
      if (slot && slot.remaining < state.numPeople) {
        errors.push(`1日通し券の残席は${Math.max(slot.remaining, 0)}席です。人数を調整してください`);
      }
    } else {
      parts.forEach(menu => {
        const slot = state.availability[menu.id];
        if (slot && slot.remaining < state.numPeople) {
          errors.push(`${partMeta(menu).label}の残席は${Math.max(slot.remaining, 0)}席です。人数を調整してください`);
        }
      });
    }

    if (!$('customer-name').value.trim()) errors.push('お名前を入力してください');
    const email = $('customer-email').value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('メールアドレスを正しく入力してください');
    return errors;
  }

  function showError(messages) {
    const box = $('form-errors');
    box.innerHTML = messages.map(m => `<p>⚠️ ${m}</p>`).join('');
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    $('form-errors').classList.add('hidden');
  }

  /* --- 確認画面 --- */
  function admissionSummary() {
    const parts = selectedPartMenus();
    if (passApplied()) {
      const total = state.passMenu.price * state.numPeople;
      return {
        partsLabel: '1日通し（11:00 - 18:00）<br><span class="evr-perk-tag">✨ 3部選択のため通し券を適用</span>',
        priceLabel: `1日通し券 ¥${state.passMenu.price.toLocaleString()} × ${state.numPeople}名 = <strong>¥${total.toLocaleString()}</strong><br>` +
          `<span class="evr-perk-tag">🎬 特典:10秒動画つき</span> <span class="evr-perk-tag">💰 ¥${(1500 * state.numPeople).toLocaleString()}おトク</span>`,
      };
    }
    const unit = parts.reduce((s, m) => s + m.price, 0);
    const total = unit * state.numPeople;
    return {
      partsLabel: parts.map(m => `${partMeta(m).label}（${partMeta(m).time}）`).join('・'),
      priceLabel: `¥3,000 × ${parts.length}部 × ${state.numPeople}名 = <strong>¥${total.toLocaleString()}</strong><br><span class="evr-perk-tag">🎁 各部ブロマイド付き</span>`,
    };
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function showConfirmScreen() {
    const goods = selectedGoods();
    const sum = admissionSummary();
    const anyMenu = passApplied() ? state.passMenu : selectedPartMenus()[0];
    const addon = bbqAddon(anyMenu);

    $('confirm-details').innerHTML = `
      <table class="evr-confirm-table">
        <tr><td>イベント</td><td>森沢かな 1日店長</td></tr>
        <tr><td>日付</td><td>2026年7月30日（木）</td></tr>
        <tr><td>ご参加の部</td><td>${sum.partsLabel}</td></tr>
        <tr><td>人数</td><td>${state.numPeople}名</td></tr>
        <tr><td>入場料</td><td>${sum.priceLabel}</td></tr>
        <tr><td>BBQプラン</td><td>${state.bbq && addon ? `あり（¥${addon.price.toLocaleString()}・飲み放題付き・店長のお手伝い付き）` : 'なし'}</td></tr>
        <tr><td>物販の希望</td><td>${goods.length ? goods.map(escapeHtml).join('、') : 'なし'}</td></tr>
        <tr><td>お名前</td><td>${escapeHtml($('customer-name').value.trim())}</td></tr>
        <tr><td>メール</td><td>${escapeHtml($('customer-email').value.trim())}</td></tr>
        <tr><td>通知方法</td><td>${state.notifChannel === 'line' ? 'LINE' : 'メールのみ'}</td></tr>
        ${$('customer-notes').value.trim() ? `<tr><td>備考</td><td>${escapeHtml($('customer-notes').value.trim())}</td></tr>` : ''}
      </table>
      <p class="rsv-note" style="margin-top:0.75rem;">💴 お支払いはすべて当日・現地にてお願いします（事前決済はありません）</p>`;

    $('form-body').classList.add('hidden');
    $('confirm-screen').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --- 送信（部ごとに予約作成。通し適用時は通しメニュー1件） --- */
  function buildNotes(partLabel) {
    const goods = selectedGoods();
    const userNotes = $('customer-notes').value.trim();
    return [
      `【森沢かな1日店長イベント】${partLabel}`,
      state.bbq ? 'BBQプラン希望（¥8,500・飲み放題付き）' : null,
      goods.length ? `物販希望: ${goods.join('、')}` : null,
      EVENT_CALLOUT,
      userNotes || null,
    ].filter(Boolean).join('\n');
  }

  function buildPayload(menu, partLabel, withAddon) {
    const slot = state.availability[menu.id];
    const addon = bbqAddon(menu);
    return {
      menu_id: menu.id,
      date: EVENT_DATE,
      time_start: (slot && slot.time_start) || menu.open_time.slice(0, 5),
      num_people: state.numPeople,
      status: 'confirmed',
      name: $('customer-name').value.trim(),
      email: $('customer-email').value.trim(),
      notes: buildNotes(partLabel),
      notif_channel: state.notifChannel,
      addon_ids: withAddon && state.bbq && addon ? [addon.id] : [],
    };
  }

  async function postReserve(payload) {
    const res = await fetch('/api/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '予約の作成に失敗しました');
    return data.reservation;
  }

  async function submitReservation() {
    const btn = $('submit-btn');
    btn.disabled = true;
    btn.textContent = '送信中…';
    $('submit-error').classList.add('hidden');

    const tickets = []; // { partLabel, time, reservation }
    try {
      if (passApplied()) {
        const meta = partMeta(state.passMenu);
        const r = await postReserve(buildPayload(state.passMenu, '1日通し', true));
        tickets.push({ partLabel: `${meta.label} ${meta.time}`, reservation: r });
      } else {
        const parts = selectedPartMenus();
        for (let i = 0; i < parts.length; i++) {
          const meta = partMeta(parts[i]);
          // BBQアドオンは最初の1件にのみ付与（BBQは日単位のため）
          const r = await postReserve(buildPayload(parts[i], meta.label, i === 0));
          tickets.push({ partLabel: `${meta.label} ${meta.time}`, reservation: r });
        }
      }
      showSuccessScreen(tickets);
    } catch (err) {
      let msg = err.message;
      if (tickets.length) {
        msg += `（※先に完了した予約: ${tickets.map(t => `${t.partLabel.split(' ')[0]}=${t.reservation.reservation_code}`).join(' / ')}。この分は有効です）`;
      }
      $('submit-error').textContent = msg;
      $('submit-error').classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = '予約を確定する';
    }
  }

  function showSuccessScreen(tickets) {
    $('confirm-screen').classList.add('hidden');
    const screen = $('success-screen');
    screen.classList.remove('hidden');

    $('success-name').textContent = tickets[0].reservation.name;

    const linePrompt = $('success-line-prompt');
    if (linePrompt) linePrompt.classList.toggle('hidden', state.notifChannel !== 'line');

    const wrap = $('success-tickets');
    wrap.innerHTML = tickets.map((t, i) => `
      <div class="evr-ticket">
        <p class="evr-ticket-part">${escapeHtml(t.partLabel)}</p>
        <div class="rsv-code-box">
          <p class="rsv-note">予約番号</p>
          <p class="rsv-code">${escapeHtml(t.reservation.reservation_code)}</p>
        </div>
        <div class="qr-wrapper" id="qr-code-${i}"></div>
      </div>`).join('');

    if (typeof QRCode !== 'undefined') {
      tickets.forEach((t, i) => {
        new QRCode(document.getElementById(`qr-code-${i}`), {
          text: `PUENTE:${t.reservation.reservation_code}`,
          width: 180,
          height: 180,
          colorDark: '#2E8CB8',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --- イベント登録 --- */
  document.addEventListener('DOMContentLoaded', () => {
    bindStepper();

    $('bbq-check').addEventListener('change', e => {
      state.bbq = e.target.checked;
      $('bbq-label').classList.toggle('selected', state.bbq);
    });

    document.querySelectorAll('.goods-check').forEach(input => {
      input.addEventListener('change', () => {
        input.closest('.evr-goods-opt').classList.toggle('selected', input.checked);
      });
    });

    document.querySelectorAll('input[name="notif-channel"]').forEach(input => {
      input.addEventListener('change', () => {
        state.notifChannel = input.value;
        $('line-cta').classList.toggle('hidden', state.notifChannel !== 'line');
      });
    });

    $('confirm-btn').addEventListener('click', () => {
      const errors = validate();
      if (errors.length) { showError(errors); return; }
      hideError();
      showConfirmScreen();
    });

    $('back-btn').addEventListener('click', () => {
      $('confirm-screen').classList.add('hidden');
      $('form-body').classList.remove('hidden');
    });

    $('submit-btn').addEventListener('click', submitReservation);

    init();
  });
})();
