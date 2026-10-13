/* Booking widget (front-end demo).
   Nothing is sent anywhere: availability below is fake and "confirm" only shows the
   success screen. Replace SLOTS / isTaken() / confirm() with real API calls later. */
(function () {
  'use strict';

  var TYPES = {
    private: 'جلسه خصوصی',
    semi: 'نیمه‌خصوصی',
    clinic: 'کلاس گروهی'
  };
  var SLOTS = ['07:00', '08:30', '10:00', '12:00', '16:00', '17:30', '19:00', '20:30'];
  var WEEKDAY_FALLBACK = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

  var state = { type: 'private', day: 0, time: null };

  var $ = function (id) { return document.getElementById(id); };
  var form = $('booking-form'), done = $('booking-done');
  var typesEl = $('types'), daysEl = $('days'), timesEl = $('times');
  var sumType = $('sum-type'), sumDay = $('sum-day'), sumTime = $('sum-time');
  var confirmBtn = $('confirm'), doneTitle = $('done-title'), doneText = $('done-text');
  if (!form || !typesEl || !daysEl || !timesEl) return;

  function fa(x) {
    return String(x).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function fmt(date, options, fallback) {
    try { return new Intl.DateTimeFormat('fa-IR', options).format(date); }
    catch (e) { return fallback; }
  }

  // Next 7 days, starting today.
  var now = new Date();
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    var wd = fmt(d, { weekday: 'long' }, WEEKDAY_FALLBACK[d.getDay()]);
    var num = fmt(d, { day: 'numeric' }, fa(d.getDate()));
    var month = fmt(d, { month: 'long' }, '');
    days.push({ label: i === 0 ? 'امروز' : wd, num: num, month: month, full: wd + ' ' + num + ' ' + month });
  }

  function isTaken(slotIndex) {
    return (slotIndex * 3 + state.day * 2) % 5 === 0; // demo data
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ----- days (built once) -----
  days.forEach(function (day, idx) {
    var b = el('button', 'opt opt--day');
    b.type = 'button';
    b.dataset.day = idx;
    b.appendChild(el('span', 'day__label', day.label));
    b.appendChild(el('span', 'day__num display', day.num));
    b.appendChild(el('span', 'day__month', day.month));
    daysEl.appendChild(b);
  });

  // ----- times (rebuilt when the day changes) -----
  function buildTimes() {
    timesEl.textContent = '';
    SLOTS.forEach(function (slot, idx) {
      var taken = isTaken(idx);
      var b = el('button', 'opt opt--time', fa(slot));
      b.type = 'button';
      b.dataset.time = slot;
      b.disabled = taken;
      b.setAttribute('aria-label', taken ? fa(slot) + '، رزرو شده' : fa(slot));
      timesEl.appendChild(b);
    });
  }

  function markSelected(container, attr, value) {
    Array.prototype.forEach.call(container.querySelectorAll('.opt'), function (b) {
      var on = String(b.dataset[attr]) === String(value);
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function update() {
    markSelected(typesEl, 'type', state.type);
    markSelected(daysEl, 'day', state.day);
    markSelected(timesEl, 'time', state.time);

    sumType.textContent = TYPES[state.type];
    sumDay.textContent = days[state.day].full;
    sumTime.textContent = state.time ? fa(state.time) : 'انتخاب نشده';

    var cant = !state.time;
    confirmBtn.disabled = cant;
    confirmBtn.textContent = cant ? 'برای ادامه یک ساعت انتخاب کنید' : 'تأیید رزرو';
  }

  typesEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-type]');
    if (!b) return;
    state.type = b.dataset.type;
    update();
  });

  daysEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-day]');
    if (!b) return;
    state.day = +b.dataset.day;
    state.time = null;
    buildTimes();
    update();
  });

  timesEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-time]');
    if (!b || b.disabled) return;
    state.time = b.dataset.time;
    update();
  });

  confirmBtn.addEventListener('click', function () {
    if (!state.time) return;
    doneText.textContent = TYPES[state.type] + '، ' + days[state.day].full + '، ساعت ' + fa(state.time) +
      '. ایمیل تأیید در راه است. در زمین می‌بینیمتان.';
    form.hidden = true;
    done.hidden = false;
    doneTitle.focus({ preventScroll: true });
  });

  $('reset').addEventListener('click', function () {
    state.time = null;
    done.hidden = true;
    form.hidden = false;
    update();
    var first = typesEl.querySelector('.opt');
    if (first) first.focus({ preventScroll: true });
  });

  buildTimes();
  update();
})();
