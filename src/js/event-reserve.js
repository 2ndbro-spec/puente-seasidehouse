/* 森沢かな1日店長イベント 専用予約フォーム
   既存予約基盤（/api/menus?event=1 → /api/availability → POST /api/reserve）を利用 */
(function () {
  'use strict';

  const EVENT_DATE = '2026-07-30';
  const $ = id => document.getElementById(id);

  const state = {
    menus: [],            // イベントメニュー（1部/2部/3部/通し）
    availability: {},     // menu_id → { remaining, capacity, time_start }
    selectedMenuId: null,
    numPeople: 1,
    bbq: false,
    notifChannel: 'line',
  };

  async function init() {
    try {
      const res = await fetch('/api/menus?event=1');
      if (!res.ok) throw new Error();
      state.menus = await res.json();
      if (!state.menus.length) throw new Error();
      await fetchAvailability();
      renderPartOptions();
      $('ev-loading').classList.add('hidden');
      $('form-body').classList.remove('hidden');
    } catch {
      $('ev-loading').innerHTML =
        '予約メニューを読み込めませんでした。時間をおいて再度お試しいただくか、<a href="https://lin.ee/7boYnzG" target="_blank" rel="noopener">LINE公式アカウント</a>よりご連絡ください。';
    }
  }

  async function fetchAvailability() {
    await Promise.all(state.menus.map(async menu => {
      try {
        const res = await fetch(`/api/availability?menu_id=${menu.id}&date=${EVENT_DATE}`);
        const data = await res.json();
        const slot = data.slots && data.slots[0];
        if (slot) {
          state.availability[menu.id] = slot;
        }
      } catch { /* 残席不明でも選択自体は可能にする */ }
    }));
  }

  function isPass(menu) { return menu.name.includes('通し'); }

  function partMeta(menu) {
    if (menu.name.includes('1部')) return { num: '1', label: '1部', time: '11:00 - 13:00', cls: 'p1' };
    if (menu.name.includes('2部')) return { num: '2', label: '2部', time: '13:30 - 15:30', cls: 'p2' };
    if (menu.name.includes('3部')) return { num: '3', label: '3部', time: '16:00 - 18:00', cls: 'p3' };
    return { num: '🎟', label: '1日通し', time: '11:00 - 18:00', cls: 'pass' };
  }

  function remainingBadge(menu) {
    const slot = state.availability[menu.id];
    if (!slot) return '';
    if (slot.remaining <= 0) return '<span class="evr-remaining full">満席</span>';
    if (slot.remaining <= 5) return `<span class="evr-remaining few">残り${slot.remaining}席</span>`;
    return '<span class="evr-remaining ok">空きあり</span>';
  }

  function renderPartOptions() {
    const wrap = $('part-options');
    wrap.innerHTML = state.menus.map(menu => {
      const meta = partMeta(menu);
      const slot = state.availability[menu.id];
      const soldOut = slot && slot.remaining <= 0;
      return `
        <label class="evr-part ${meta.cls} ${soldOut ? 'soldout' : ''}">
          <input type="radio" name="ev-part" value="${menu.id}" ${soldOut ? 'disabled' : ''}>
          <span class="evr-part-badge">${meta.num}</span>
          <span class="evr-part-body">
            <span class="evr-part-label">${meta.label}<small>${meta.time}</small></span>
            <span class="evr-part-price">¥${menu.price.toLocaleString()}<small>${isPass(menu) ? 'ブロマイド付き＋通し特典：10秒動画' : 'ブロマイド付き'}</small></span>
          </span>
          ${remainingBadge(menu)}
        </label>`;
    }).join('');

    wrap.querySelectorAll('input[name="ev-part"]').forEach(input => {
      input.addEventListener('change', () => {
        state.selectedMenuId = input.value;
        wrap.querySelectorAll('.evr-part').forEach(el => el.classList.remove('selected'));
        input.closest('.evr-part').classList.add('selected');
        hideError();
      });
    });
  }

  function selectedMenu() {
    return state.menus.find(m => m.id === state.selectedMenuId) || null;
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

  /* --- バリデーション → 確認画面 --- */
  function validate() {
    const errors = [];
    const menu = selectedMenu();
    if (!menu) errors.push('ご希望の部を選択してください');
    if (menu) {
      const slot = state.availability[menu.id];
      if (slot && slot.remaining < state.numPeople) {
        errors.push(`選択された部の残席は${Math.max(slot.remaining, 0)}席です。人数を調整してください`);
      }
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

  function showConfirmScreen() {
    const menu = selectedMenu();
    const meta = partMeta(menu);
    const addon = bbqAddon(menu);
    const admission = menu.price * state.numPeople;

    $('confirm-details').innerHTML = `
      <table class="evr-confirm-table">
        <tr><td>イベント</td><td>森沢かな 1日店長</td></tr>
        <tr><td>日付</td><td>2026年7月30日（木）</td></tr>
        <tr><td>ご参加の部</td><td>${meta.label}（${meta.time}）</td></tr>
        <tr><td>人数</td><td>${state.numPeople}名</td></tr>
        <tr><td>入場料</td><td>¥${menu.price.toLocaleString()} × ${state.numPeople}名 = <strong>¥${admission.toLocaleString()}</strong></td></tr>
        <tr><td>BBQプラン</td><td>${state.bbq && addon ? `あり（¥${addon.price.toLocaleString()}・飲み放題付き）` : 'なし'}</td></tr>
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

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* --- 送信 --- */
  async function submitReservation() {
    const btn = $('submit-btn');
    btn.disabled = true;
    btn.textContent = '送信中…';
    $('submit-error').classList.add('hidden');

    const menu = selectedMenu();
    const addon = bbqAddon(menu);
    const slot = state.availability[menu.id];
    const userNotes = $('customer-notes').value.trim();
    const notes = [
      '【森沢かな1日店長イベント】',
      state.bbq ? 'BBQプラン希望（¥8,500・飲み放題付き）' : null,
      userNotes || null,
    ].filter(Boolean).join('\n');

    const payload = {
      menu_id: menu.id,
      date: EVENT_DATE,
      time_start: (slot && slot.time_start) || menu.open_time.slice(0, 5),
      num_people: state.numPeople,
      status: 'confirmed',
      name: $('customer-name').value.trim(),
      email: $('customer-email').value.trim(),
      notes,
      notif_channel: state.notifChannel,
      addon_ids: state.bbq && addon ? [addon.id] : [],
    };

    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '予約の作成に失敗しました');
      showSuccessScreen(data.reservation);
    } catch (err) {
      $('submit-error').textContent = err.message;
      $('submit-error').classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = '予約を確定する';
    }
  }

  function showSuccessScreen(reservation) {
    $('confirm-screen').classList.add('hidden');
    const screen = $('success-screen');
    screen.classList.remove('hidden');

    $('success-code').textContent = reservation.reservation_code;
    $('success-name').textContent = reservation.name;

    const linePrompt = $('success-line-prompt');
    if (linePrompt) linePrompt.classList.toggle('hidden', state.notifChannel !== 'line');

    const qrContainer = $('qr-code');
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, {
        text: `PUENTE:${reservation.reservation_code}`,
        width: 200,
        height: 200,
        colorDark: '#2E8CB8',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* --- イベント登録 --- */
  document.addEventListener('DOMContentLoaded', () => {
    bindStepper();

    $('bbq-check').addEventListener('change', e => { state.bbq = e.target.checked; });

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
