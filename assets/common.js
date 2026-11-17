/* 共用工具：API、登入狀態、格式化（未來其他系統也可共用） */
var BM = (function () {
  var KEY = 'bellamed.';

  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(KEY + k) || 'null');
      if (v === null) localStorage.removeItem(KEY + k);
      else localStorage.setItem(KEY + k, JSON.stringify(v));
    } catch (e) { return null; }
  }

  async function api(action, data) {
    var url = window.BELLAMED_CONFIG && window.BELLAMED_CONFIG.apiUrl;
    if (!url || url.indexOf('http') !== 0) throw new Error('尚未設定系統網址（assets/config.js）');
    var body = Object.assign({ action: action }, data || {});
    var res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error('連線失敗，請檢查網路後再試一次');
    }
    var j = await res.json();
    if (!j.ok) {
      var msg = j.error === 'AUTH' ? '登入已失效，請重新登入' : j.error === 'PWCHANGE' ? '請先修改管理密碼' : j.error;
      var err = new Error(msg);
      err.auth = j.error === 'AUTH';
      err.pwchange = j.error === 'PWCHANGE';
      throw err;
    }
    return j.data;
  }

  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  function parse(d) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(d, withYear) {
    if (!d) return '';
    var x = parse(d);
    var s = (withYear === false ? '' : d.slice(0, 4) + '/') + d.slice(5, 7) + '/' + d.slice(8, 10);
    return s + '（' + WD[x.getDay()] + '）';
  }
  function fmtRange(dates) {
    if (!dates || !dates.length) return '日期待定';
    var a = dates[0], b = dates[dates.length - 1];
    if (a === b) return a.replace(/-/g, '/');
    if (a.slice(0, 4) === b.slice(0, 4)) return a.replace(/-/g, '/') + '～' + b.slice(5).replace('-', '/');
    return a.replace(/-/g, '/') + '～' + b.replace(/-/g, '/');
  }
  function today() {
    var d = new Date();
    var t = new Date(d.getTime() + (d.getTimezoneOffset() + 480) * 60000); // 台北時間
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sess(s) { return s === 'AM' ? '上午' : '下午'; }
  function img(id, w) { return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + (w || 1000); }
  function fileUrl(id) { return 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view'; }
  function linkify(s) {
    return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  }

  function toast(msg, bad) {
    var t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2800);
  }
  var busyCount = 0;
  function busy(on) {
    busyCount += on ? 1 : -1;
    var el = document.getElementById('busy');
    if (el) el.hidden = busyCount <= 0;
  }
  async function run(fn) {
    busy(true);
    try { return await fn(); }
    catch (e) {
      if (e.pwchange && BM.onPwChange) BM.onPwChange();
      else toast(e.message, true);
      if (e.auth && BM.onAuthFail) BM.onAuthFail();
      throw e;
    }
    finally { busy(false); }
  }

  function modal(html, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      (opts.locked ? '' : '<button class="modal-x" aria-label="關閉">×</button>') + html + '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('noscroll');
    var close = function () { wrap.remove(); if (!document.querySelector('.modal-wrap')) document.body.classList.remove('noscroll'); if (opts.onClose) opts.onClose(); };
    if (!opts.locked) {
      wrap.querySelector('.modal-x').onclick = close;
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    }
    return { el: wrap.querySelector('.modal'), close: close };
  }

  function meetTimesHtml(ev, myRegion) {
    var dates = ev.dates || [];
    if (!dates.length) return '';
    var rows = dates.map(function (d) {
      var m = (ev.meetTimes || {})[d];
      var label = dates.length > 1 ? '<span class="mt-date">' + fmtDate(d, false) + '</span>' : '';
      if (!m) return '<div class="mt-row">' + label + '<span class="muted">待補</span></div>';
      if (m.mode === 'all') return '<div class="mt-row">' + label + '<span class="mt-chip mine">全區 ' + esc(m.all || '待補') + '</span></div>';
      return '<div class="mt-row">' + label + ['北', '中', '南'].map(function (r) {
        return '<span class="mt-chip' + (r === myRegion ? ' mine' : '') + '">' + r + '區 ' + esc(m[r] || '待補') + '</span>';
      }).join('') + '</div>';
    });
    return rows.join('');
  }

  // ---- 版本與問題回報 ----
  var VERSION = '1.4.0';
  var UPDATED = '2026/11/17';

  function footer(pageName, whoFn) {
    var f = document.createElement('footer');
    f.className = 'site-foot';
    f.innerHTML = '<span>版本 v' + VERSION + '・更新日期 ' + UPDATED + '</span>' +
      '<button type="button" class="link-btn">回報問題</button>';
    document.body.appendChild(f);
    f.querySelector('button').onclick = function () {
      var who = (whoFn && whoFn()) || '';
      var m = modal('<h2>回報問題</h2>' +
        '<label class="f" for="rpWho">姓名</label><input class="input" id="rpWho" value="' + esc(who) + '" maxlength="40">' +
        '<label class="f" for="rpMsg">問題描述</label><textarea class="input" id="rpMsg" maxlength="1000" placeholder="例如：按「儲存報名」後一直轉圈"></textarea>' +
        '<div class="btn-row"><button class="btn block" id="rpSend">送出</button></div>');
      m.el.querySelector('#rpSend').onclick = async function () {
        var msg = m.el.querySelector('#rpMsg').value.trim();
        if (!msg) return toast('請描述遇到的問題', true);
        await run(function () {
          return api('reportIssue', { who: m.el.querySelector('#rpWho').value.trim(), page: pageName, message: msg,
            version: VERSION, userAgent: navigator.userAgent });
        });
        toast('已送出，謝謝你的回報');
        m.close();
      };
    };
  }

  return {
    VERSION: VERSION, UPDATED: UPDATED, footer: footer,
    store: store, api: api, fmtDate: fmtDate, fmtRange: fmtRange, today: today, esc: esc, sess: sess,
    img: img, fileUrl: fileUrl, linkify: linkify, toast: toast, busy: busy, run: run, modal: modal,
    meetTimesHtml: meetTimesHtml, onAuthFail: null, onPwChange: null
  };
})();
