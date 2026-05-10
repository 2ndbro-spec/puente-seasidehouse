/* PUENTE — 予約フォームロジック */

(function () {
  const state = {
    menus: [],
    selectedMenu: null,
    date: '',
    timeSlot: null,
    numPeople: 2,
    numMale: 0,
    numFemale: 0,
    checkinTime: '11:00',
    addonIds: [],
    bookingType: 'confirmed',
    notifChannel: 'line',
    name: '',
    email: '',
    availability: null,
  };

  const $ = id => document.getElementById(id);

  async function init() {
    const app = $('reservation-app');
    if (!app) return;

    const res = await fetch('/api/menus');
    if (!res.ok) { app.innerHTML = '<p class="text-muted text-center">メニュー情報を読み込めませんでした。</p>'; return; }
    state.menus = await res.json();

    renderMenuTabs();
    selectMenu(state.menus[0]);
    bindDateInput();
  }

  function renderMenuTabs() {
    const tabs = $('menu-tabs');
    tabs.innerHTML = state.menus.map(m => `
      <button class="menu-tab" data-id="${m.id}">${m.name}</button>
    `).join('');
    tabs.querySelectorAll('.menu-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const menu = state.menus.find(m => m.id === btn.dataset.id);
        selectMenu(menu);
      });
    });
  }

  function selectMenu(menu) {
    state.selectedMenu = menu;
    state.timeSlot = null;
    state.availability = null;

    document.querySelectorAll('.menu-tab').forEach(b => b.classList.toggle('active', b.dataset.id === menu.id));
    $('bbq-fields').classList.toggle('hidden', !!menu.slot_duration === false);
    $('ls-fields').classList.toggle('hidden', !!menu.slot_duration === true);
    $('step-date').classList.remove('hidden');

    if (state.date) fetchAvailability();
    renderAddonOptions();
  }

  function bindDateInput() {
    const input = $('reservation-date');
    const today = new Date().toISOString().slice(0, 10);
    input.min = today;
    input.addEventListener('change', e => {
      state.date = e.target.value;
      fetchAvailability();
    });
  }

  async function fetchAvailability() {
    if (!state.date || !state.selectedMenu) return;

    const loading = $('availability-loading');
    if (loading) loading.classList.remove('hidden');

    const res = await fetch(`/api/availability?menu_id=${state.selectedMenu.id}&date=${state.date}`);
    const data = await res.json();
    state.availability = data;

    if (loading) loading.classList.add('hidden');

    if (data.type === 'timed') renderTimeSlots(data.slots);
    else renderLsAvailability(data);
  }

  function renderTimeSlots(slots) {
    const container = $('time-slots-grid');
    container.innerHTML = '';
    state.timeSlot = null;

    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-slot-btn';
      const isEmpty = slot.remaining <= 0;
      if (isEmpty) btn.classList.add('full');
      btn.disabled = isEmpty;
      btn.dataset.time = slot.time_start;
      btn.innerHTML = `
        <span class="slot-time">${slot.time_start}〜</span>
        <span class="slot-remaining">${isEmpty ? '満席' : `残${slot.remaining}名`}</span>
      `;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.timeSlot = slot.time_start;
        updatePeopleBounds();
      });
      container.appendChild(btn);
    });
  }

  function renderLsAvailability(data) {
    const el = $('ls-remaining');
    if (!el) return;
    el.textContent = `残枠: ${data.remaining}名`;
    el.className = data.remaining <= 5 ? 'ls-remaining text-coral' : 'ls-remaining';

    // 上限を更新
    updateLsPeopleBounds(data.remaining);
  }

  function updateLsPeopleBounds(max) {
    const maxPeople = Math.min(state.selectedMenu?.max_people || 30, max);
    $('num-male').max = maxPeople;
    $('num-female').max = maxPeople;
  }

  function updatePeopleBounds() {
    if (!state.selectedMenu) return;
    const slot = state.availability?.slots?.find(s => s.time_start === state.timeSlot);
    const max = slot ? Math.min(state.selectedMenu.max_people, slot.remaining) : state.selectedMenu.max_people;
    const min = state.selectedMenu.min_people || 1;
    state.numPeople = Math.max(state.numPeople, min);
    $('num-people-display').textContent = state.numPeople;
  }

  function renderAddonOptions() {
    const container = $('addon-options');
    if (!container) return;
    const menu = state.selectedMenu;
    if (!menu?.addons?.length) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    container.innerHTML = menu.addons.map(a => `
      <label class="addon-label">
        <input type="checkbox" class="addon-check" data-id="${a.id}" data-price="${a.price}">
        <span>${a.name} <strong>¥${a.price.toLocaleString()}/人（税込）</strong></span>
      </label>
    `).join('');
    container.querySelectorAll('.addon-check').forEach(cb => {
      cb.addEventListener('change', () => {
        state.addonIds = Array.from(container.querySelectorAll('.addon-check:checked')).map(c => c.dataset.id);
      });
    });
  }

  // 人数 +/− ボタン
  function bindNumberButtons() {
    document.querySelectorAll('.num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const target = btn.dataset.target;
        const display = $(`${target}-display`);
        const menu = state.selectedMenu;
        let val = parseInt(display.textContent);

        if (target === 'num-people') {
          const min = menu?.min_people || 1;
          const slot = state.availability?.slots?.find(s => s.time_start === state.timeSlot);
          const max = slot ? Math.min(menu?.max_people || 100, slot.remaining) : (menu?.max_people || 100);
          val = action === 'plus' ? Math.min(val + 1, max) : Math.max(val - 1, min);
          state.numPeople = val;
        } else if (target === 'num-male') {
          val = action === 'plus' ? val + 1 : Math.max(val - 1, 0);
          state.numMale = val;
        } else if (target === 'num-female') {
          val = action === 'plus' ? val + 1 : Math.max(val - 1, 0);
          state.numFemale = val;
        }
        display.textContent = val;
      });
    });
  }

  function bindBookingType() {
    document.querySelectorAll('input[name="booking-type"]').forEach(r => {
      r.addEventListener('change', e => { state.bookingType = e.target.value; });
    });
  }

  function bindNotifChannel() {
    document.querySelectorAll('input[name="notif-channel"]').forEach(r => {
      r.addEventListener('change', e => {
        state.notifChannel = e.target.value;
        const cta = $('line-cta');
        if (cta) cta.classList.toggle('hidden', e.target.value !== 'line');
      });
    });
  }

  function bindCheckinTime() {
    const sel = $('checkin-time');
    if (!sel) return;
    sel.addEventListener('change', e => { state.checkinTime = e.target.value; });
  }

  function bindConfirmButton() {
    const btn = $('confirm-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!validateForm()) return;
      state.name = $('customer-name').value.trim();
      state.email = $('customer-email').value.trim();
      showConfirmScreen();
    });
  }

  function validateForm() {
    const errors = [];
    if (!state.date) errors.push('日付を選択してください');
    if (state.selectedMenu?.slot_duration && !state.timeSlot) errors.push('時間帯を選択してください');
    if (!state.selectedMenu?.slot_duration && (state.numMale + state.numFemale) < 1) errors.push('人数を入力してください');
    if (!$('customer-name').value.trim()) errors.push('お名前を入力してください');
    if (!$('customer-email').value.trim()) errors.push('メールアドレスを入力してください');

    const errEl = $('form-errors');
    if (errors.length) {
      errEl.innerHTML = errors.map(e => `<p>・${e}</p>`).join('');
      errEl.classList.remove('hidden');
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    errEl.classList.add('hidden');
    return true;
  }

  function showConfirmScreen() {
    $('form-body').classList.add('hidden');
    const screen = $('confirm-screen');
    screen.classList.remove('hidden');

    const menu = state.selectedMenu;
    const isBbq = !!menu.slot_duration;
    const people = isBbq ? state.numPeople : (state.numMale + state.numFemale);
    const addonTotal = state.addonIds.reduce((s, id) => {
      const a = menu.addons?.find(x => x.id === id);
      return s + (a ? a.price * people : 0);
    }, 0);
    const total = menu.price * people + addonTotal;

    screen.querySelector('.confirm-details').innerHTML = `
      <table class="confirm-table">
        <tr><th>メニュー</th><td>${menu.name}</td></tr>
        <tr><th>日付</th><td>${state.date}</td></tr>
        ${isBbq ? `<tr><th>時間帯</th><td>${state.timeSlot}〜（2時間）</td></tr>` : ''}
        ${isBbq ? `<tr><th>人数</th><td>${state.numPeople}名</td></tr>` : `
          <tr><th>人数</th><td>男性 ${state.numMale}名 / 女性 ${state.numFemale}名</td></tr>
          <tr><th>チェックイン予定</th><td>${state.checkinTime}</td></tr>
        `}
        ${state.addonIds.length ? `<tr><th>オプション</th><td>${menu.addons.filter(a => state.addonIds.includes(a.id)).map(a => a.name).join('、')}</td></tr>` : ''}
        <tr><th>料金</th><td>¥${total.toLocaleString()}（税込）</td></tr>
        <tr><th>予約種別</th><td>${state.bookingType === 'confirmed' ? '本予約' : '仮予約'}</td></tr>
        <tr><th>お名前</th><td>${state.name}</td></tr>
        <tr><th>メール</th><td>${state.email}</td></tr>
        <tr><th>通知方法</th><td>${state.notifChannel === 'line' ? 'LINE' : 'メールのみ'}</td></tr>
      </table>
    `;
    screen.scrollIntoView({ behavior: 'smooth' });
  }

  function bindSubmitButton() {
    const btn = $('submit-btn');
    if (!btn) return;
    btn.addEventListener('click', submitReservation);
    $('back-btn').addEventListener('click', () => {
      $('confirm-screen').classList.add('hidden');
      $('form-body').classList.remove('hidden');
      $('form-body').scrollIntoView({ behavior: 'smooth' });
    });
  }

  async function submitReservation() {
    const btn = $('submit-btn');
    btn.disabled = true;
    btn.textContent = '送信中...';

    const menu = state.selectedMenu;
    const isBbq = !!menu.slot_duration;

    const payload = {
      menu_id: menu.id,
      date: state.date,
      status: state.bookingType,
      name: state.name,
      email: state.email,
      notif_channel: state.notifChannel,
      addon_ids: state.addonIds,
      ...(isBbq
        ? { time_start: state.timeSlot, num_people: state.numPeople }
        : { num_male: state.numMale, num_female: state.numFemale, checkin_time: state.checkinTime }
      )
    };

    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '予約に失敗しました');
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
    $('success-status').textContent = reservation.status === 'confirmed' ? '本予約' : '仮予約';

    const linePrompt = $('success-line-prompt');
    if (linePrompt) linePrompt.classList.toggle('hidden', state.notifChannel !== 'line');

    // QRコード生成
    const qrContainer = $('qr-code');
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, {
        text: `PUENTE:${reservation.reservation_code}`,
        width: 200,
        height: 200,
        colorDark: '#2E8CB8',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
    screen.scrollIntoView({ behavior: 'smooth' });
  }

  // 生成する時間選択肢（LS用チェックイン）
  function buildCheckinOptions() {
    const sel = $('checkin-time');
    if (!sel) return;
    for (let h = 9; h <= 18; h++) {
      ['00', '30'].forEach(m => {
        const val = `${String(h).padStart(2, '0')}:${m}`;
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        sel.appendChild(opt);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    bindNumberButtons();
    bindBookingType();
    bindNotifChannel();
    bindCheckinTime();
    buildCheckinOptions();
    bindConfirmButton();
    bindSubmitButton();
  });
})();
