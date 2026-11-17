/* 員工報名頁 */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var S = { me: null, events: [], tab: 'events', year: String(new Date().getFullYear()), corrections: null };
  var esc = BM.esc;

  BM.onAuthFail = function () { logout(); };

  function token() { return BM.store('staffToken'); }

  function logout() {
    BM.store('adminToken', null);
    BM.store('staffToken', null);
    BM.store('staff', null);
    S.me = null;
    showLogin();
  }

  function showLogin() {
    $('#appView').hidden = true;
    $('#pwView').hidden = true;
    $('#loginView').hidden = false;
    $('#logoutBtn').hidden = true;
    $('#adminBtn').hidden = true;
    $('#who').textContent = '';
  }

  async function doLogin() {
    var acct = $('#loginAcct').value.trim(), pw = $('#loginPw').value.trim();
    if (!acct) return BM.toast('請輸入帳號', true);
    if (!pw) return BM.toast('請輸入密碼', true);
    var r = await BM.run(function () { return BM.api('login', { account: acct, password: pw }); });
    $('#loginPw').value = '';
    afterAuth(r);
  }

  function afterAuth(r) {
    if (r.role === 'pwchange') return showPwChange(r);
    BM.store('staffToken', r.token);
    BM.store('staff', r.staff);
    BM.store('adminToken', r.role === 'admin' ? r.token : null); // 管理員：管理頁免再登入
    startApp(r.staff);
  }

  // ---------- 首次登入改密碼 ----------
  var pwTicket = null, pwAdmin = false;
  function showPwChange(r) {
    pwTicket = r.token;
    pwAdmin = !!r.staff.admin;
    $('#loginView').hidden = true;
    $('#pwView').hidden = false;
    $('#pwHello').textContent = r.staff.name + '，你好';
    $('#pwRules').innerHTML = pwAdmin
      ? '<li>管理員帳號：至少 10 碼，需同時包含英文與數字</li><li>不能包含生日</li>'
      : '<li>6–20 碼，英文或數字</li><li>不能包含生日</li>';
    $('#newPw').value = '';
    $('#newPw2').value = '';
    $('#newPw').focus();
  }
  async function doPwChange() {
    var a = $('#newPw').value, b = $('#newPw2').value;
    if (!/^[A-Za-z0-9!@#$%^&*._-]{6,20}$/.test(a)) return BM.toast('密碼需為 6–20 碼的英文或數字', true);
    if (pwAdmin && (a.length < 10 || !/[A-Za-z]/.test(a) || !/\d/.test(a))) return BM.toast('管理員密碼至少 10 碼，需同時有英文與數字', true);
    if (a !== b) return BM.toast('兩次輸入的密碼不一樣', true);
    var r;
    try {
      r = await BM.run(function () { return BM.api('changeMyPassword', { token: pwTicket, newPassword: a }); });
    } catch (e) {
      if (e.auth) showLogin();
      return;
    }
    pwTicket = null;
    $('#pwView').hidden = true;
    BM.toast('密碼已更新');
    afterAuth(r);
  }

  // ---------- 忘記密碼 ----------
  function openForgot() {
    var m = BM.modal('<h2>忘記密碼</h2>' +
      '<p class="small muted" style="margin:0">送出後請等待 1–2 日內管理員通知。</p>' +
      '<label class="f" for="fgAcct">帳號</label><input class="input" id="fgAcct" autocapitalize="off" value="' + esc($('#loginAcct').value.trim()) + '">' +
      '<div class="btn-row"><button class="btn block" id="fgSend">送出申請</button></div>');
    m.el.querySelector('#fgSend').onclick = async function () {
      var acct = m.el.querySelector('#fgAcct').value.trim();
      if (!acct) return BM.toast('請輸入帳號', true);
      var r = await BM.run(function () { return BM.api('forgotPassword', { account: acct }); });
      m.close();
      BM.modal('<h2>已送出</h2><p>' + esc(r.message) + '</p>');
    };
  }

  function startApp(me) {
    S.me = me;
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#logoutBtn').hidden = false;
    $('#adminBtn').hidden = !me.admin;
    $('#who').textContent = me.admin ? '管理員' : me.name.split(' ')[0];
    $('#tabs [data-tab=corrections]').hidden = !!me.admin; // 管理員不需要修正申請
    if (me.admin && S.tab === 'corrections') switchTab('events');
    loadEvents();
  }

  function switchTab(t) {
    S.tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    ['events', 'records', 'corrections'].forEach(function (x) { $('#tab-' + x).hidden = x !== t; });
    if (t === 'records') loadRecords();
    if (t === 'corrections') loadCorrections();
    window.scrollTo(0, 0);
  }

  // ---------------- 活動 ----------------
  async function loadEvents() {
    S.events = await BM.run(function () { return BM.api('events', { token: token() }); });
    renderEvents();
  }

  function evCard(e) {
    var today = BM.today();
    var mine = e.mine.length;
    var badges = [];
    if (e.status === 'cancelled') badges.push('<span class="badge bad">已取消</span>');
    if (mine) badges.push('<span class="badge">我已報名</span>');
    var end = e.dates[e.dates.length - 1];
    if (e.status !== 'cancelled' && e.dates[0] <= today && end >= today) badges.push('<span class="badge warn">進行中</span>');
    var count = '已報名 ' + e.peopleCount + ' 人' + (e.suggested !== '' ? '／建議 ' + e.suggested + ' 人' : '');
    return '<div class="card ev-card" data-id="' + e.id + '">' +
      '<div class="ev-body"><p class="ev-name">' + esc(e.name) + '</p><div class="ev-meta">' +
      '<div>日期：' + esc(e.dates.map(function (d, i) { return BM.fmtDate(d, i === 0 || d.slice(0, 4) !== e.dates[0].slice(0, 4)); }).join('、')) + '</div>' +
      (e.host ? '<div>主辦：' + esc(e.host) + '</div>' : '') +
      (e.location ? '<div>地點：' + esc(e.location) + '</div>' : '') +
      '</div><div class="ev-foot"><span class="small muted">' + count + '</span>' + badges.join('') + '</div></div></div>';
  }

  function renderEvents() {
    var today = BM.today();
    var thisYear = today.slice(0, 4);
    var upcoming = S.events.filter(function (e) { return e.dates[e.dates.length - 1] >= today; });
    var past = S.events.filter(function (e) {
      return e.dates[e.dates.length - 1] < today && e.dates[0].slice(0, 4) === thisYear && e.status !== 'cancelled';
    }).reverse();
    var html = '<div class="section-title">即將舉行</div>';
    html += upcoming.length ? upcoming.map(evCard).join('') : '<div class="card empty">目前沒有開放報名的活動</div>';
    if (past.length) {
      html += '<details><summary class="section-title" style="cursor:pointer">今年已結束的活動（' + past.length + '）</summary>' +
        past.map(evCard).join('') + '</details>';
    }
    var box = $('#tab-events');
    box.innerHTML = html;
    box.querySelectorAll('.ev-card').forEach(function (c) { c.onclick = function () { openEvent(c.dataset.id); }; });
  }

  function regsHtml(e) {
    if (!e.registrants.length) return '<p class="muted small">目前還沒有人報名</p>';
    return e.dates.map(function (d) {
      var parts = ['AM', 'PM'].map(function (s) {
        var names = e.registrants.filter(function (r) { return r.date === d && r.session === s; })
          .map(function (r) { return r.name; });
        return names.length ? '<div><span class="r-s">' + BM.sess(s) + '（' + names.length + '）：</span>' + esc(names.join('、')) + '</div>' : '';
      }).join('');
      return parts ? '<div class="r-day"><b>' + BM.fmtDate(d) + '</b>' + parts + '</div>' : '';
    }).join('');
  }

  function openEvent(id) {
    var e = S.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var today = BM.today();
    var cancelled = e.status === 'cancelled';
    var mine = {};
    e.mine.forEach(function (k) { mine[k] = true; });

    var info = '';
    var row = function (k, v) { return v ? '<dt>' + k + '</dt><dd>' + v + '</dd>' : ''; };
    info += row('日期', e.dates.map(function (d) { return BM.fmtDate(d); }).join('<br>'));
    info += row('主辦', esc(e.host));
    info += row('地點', esc(e.location));
    info += row('服裝', esc(e.dress));
    info += row('集合地點', esc(e.meetPlace));
    info += row('集合時間', BM.meetTimesHtml(e, S.me.region));
    info += row('建議名額', e.suggested !== '' ? esc(e.suggested) + ' 人' : '');
    info += row('其他說明', e.notes ? BM.linkify(e.notes) : '');
    if (e.attachments && e.attachments.length) {
      info += row('附件', e.attachments.map(function (a) {
        return '📎 <a href="' + BM.fileUrl(a.id) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a>';
      }).join('<br>'));
    }

    var sess = '';
    if (S.me.admin) {
      sess = '<div class="notice ok">管理員檢視模式：可以查看員工看到的畫面，但不能報名。要修改報名請到管理頁的「報名名單」。</div>';
    } else if (!cancelled) {
      sess = '<h3 style="margin:18px 0 4px">我要報名</h3><p class="muted small" style="margin:0">上午、下午各算 0.5 次，可以只報其中一場。</p><div class="sess-grid">' +
        e.dates.map(function (d) {
          var past = d < today;
          return '<div class="sess-day"><span class="d">' + BM.fmtDate(d) + (past ? ' <span class="badge gray">已過</span>' : '') + '</span>' +
            ['AM', 'PM'].map(function (s) {
              var k = d + '|' + s, on = !!mine[k];
              return '<label class="chk' + (on ? ' on' : '') + (past ? ' dis' : '') + '"><input type="checkbox" data-k="' + k + '"' +
                (on ? ' checked' : '') + (past ? ' disabled' : '') + '>' + BM.sess(s) + '</label>';
            }).join('') + '</div>';
        }).join('') + '</div>' +
        '<div class="btn-row"><button class="btn block" id="saveReg">儲存報名</button></div>' +
        (e.dates.some(function (d) { return d < today; }) ? '<p class="muted small">已過的場次如需更正，請到「修正申請」。</p>' : '');
    }

    var m = BM.modal(
      '<h2>' + esc(e.name) + '</h2>' +
      (cancelled ? '<div class="notice">此活動已取消</div>' : '') +
      (e.poster ? '<a href="' + BM.fileUrl(e.poster) + '" target="_blank" rel="noopener"><img class="poster" src="' + BM.img(e.poster) + '" alt="活動海報"></a>' : '') +
      '<dl class="info">' + info + '</dl>' + sess +
      '<h3 style="margin:20px 0 4px">報名名單 <span class="small muted">已報名 ' + e.peopleCount + ' 人' + (e.suggested !== '' ? '／建議 ' + e.suggested + ' 人' : '') + '</span></h3>' +
      '<div class="regs">' + regsHtml(e) + '</div>'
    );
    m.el.querySelectorAll('.chk input').forEach(function (i) {
      i.onchange = function () { i.parentElement.classList.toggle('on', i.checked); };
    });
    var save = m.el.querySelector('#saveReg');
    if (save) save.onclick = async function () {
      var sessions = [];
      m.el.querySelectorAll('.chk input:checked').forEach(function (i) {
        var p = i.dataset.k.split('|');
        sessions.push({ date: p[0], session: p[1] });
      });
      S.events = await BM.run(function () { return BM.api('register', { token: token(), eventId: e.id, sessions: sessions }); });
      BM.toast('已儲存報名');
      m.close();
      renderEvents();
    };
  }

  // ---------------- 參加紀錄 ----------------
  async function loadRecords() {
    var box = $('#tab-records');
    var y = Number(BM.today().slice(0, 4));
    var opts = '';
    for (var i = y + 1; i >= y - 5; i--) opts += '<option' + (String(i) === S.year ? ' selected' : '') + '>' + i + '</option>';
    box.innerHTML = '<div class="row2" style="align-items:end"><div><label class="f" for="yearSel">年度</label>' +
      '<select class="input" id="yearSel">' + opts + '</select></div><div id="lockInfo"></div></div><div id="recList"></div>';
    $('#yearSel').onchange = function () { S.year = this.value; loadRecords(); };
    var rec = await BM.run(function () { return BM.api('records', { token: token(), year: S.year }); });
    $('#lockInfo').innerHTML = (rec.updatedAt ? '<div class="small muted">上次更新：' + esc(rec.updatedAt) + '</div>' : '') +
      (rec.locked ? '<span class="badge gray">🔒 已結算鎖定</span>' : '');
    $('#recList').innerHTML = renderRecords(rec);
  }

  function renderRecords(rec) {
    return '<div class="section-title">' + rec.year + ' 年每人參加場次（活動結束後隔日更新）</div>' + rec.people.map(function (p) {
      return '<div class="card rec-person"><div class="rec-head"><b>' + esc(p.name) + ' <span class="small muted">' + esc(p.region) + '區</span></b>' +
        '<span class="rec-total">' + p.total + ' 次</span></div>' +
        (p.items.length ? '<ul class="rec-items">' + p.items.map(function (i) {
          return '<li><span>' + i.date.slice(5).replace('-', '/') + '</span><span>' + esc(i.name) + '</span><span class="c">' +
            i.sessions.map(BM.sess).join('、') + '</span></li>';
        }).join('') + '</ul>' : '<div class="small muted">尚無紀錄</div>') + '</div>';
    }).join('');
  }

  // ---------------- 修正申請 ----------------
  async function loadCorrections() {
    var box = $('#tab-corrections');
    var today = BM.today();
    var list = await BM.run(function () { return BM.api('myCorrections', { token: token() }); });
    var evs = S.events.filter(function (e) { return e.status !== 'cancelled' && e.dates.some(function (d) { return d <= today; }); }).slice().reverse();

    var statusBadge = function (s) {
      return s === 'pending' ? '<span class="badge warn">待審核</span>' : s === 'approved' ? '<span class="badge">已通過</span>' : '<span class="badge bad">已退回</span>';
    };
    var TYPES = [['add', '申請補登', '有去但沒報名'], ['remove', '申請移除', '有報名但沒去'], ['swap', '申請修正', '報錯場次，同時補登一場、移除一場']];
    box.innerHTML =
      '<div class="card"><h3 style="margin:0">提出申請</h3>' +
      '<p class="muted small" style="margin:4px 0 0">管理員審核通過後才會計入。</p>' +
      '<label class="f" for="cEv">活動</label><select class="input" id="cEv"><option value="">請選擇活動…</option>' +
      evs.map(function (e) { return '<option value="' + e.id + '">' + esc(BM.fmtRange(e.dates) + ' ' + e.name) + '</option>'; }).join('') + '</select>' +
      '<label class="f">申請類型</label><div class="sess-grid" id="cTypes">' + TYPES.map(function (t, i) {
        return '<label class="chk' + (i === 0 ? ' on' : '') + '" style="border-radius:10px"><input type="radio" name="ctype" value="' + t[0] + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<span><b>' + t[1] + '</b> <span class="small muted">' + t[2] + '</span></span></label>';
      }).join('') + '</div>' +
      '<div id="cAddBox"><label class="f" for="cAdd">補登場次</label><select class="input" id="cAdd"></select></div>' +
      '<div id="cRmBox" hidden><label class="f" for="cRm">移除場次</label><select class="input" id="cRm"></select></div>' +
      '<label class="f" for="cReason">說明（選填）</label><textarea class="input" id="cReason" maxlength="200" placeholder="例如：當天臨時參加"></textarea>' +
      '<div class="btn-row"><button class="btn block" id="cSubmit">送出申請</button></div></div>' +
      '<div class="section-title">我的申請紀錄</div>' +
      (list.length ? list.map(function (c) {
        return '<div class="card list-item"><div class="grow"><b>' + esc(c.eventName) + '</b><div>' + esc(c.summary || '') + '</div>' +
          (c.reason ? '<div class="small muted">' + esc(c.reason) + '</div>' : '') +
          '<div class="small muted">' + c.createdAt.slice(0, 10).replace(/-/g, '/') + ' 送出</div></div>' + statusBadge(c.status) + '</div>';
      }).join('') : '<div class="card empty">尚無申請紀錄</div>');

    var ev = function () { return S.events.filter(function (e) { return e.id === $('#cEv').value; })[0]; };
    var type = function () { return $('input[name=ctype]:checked').value; };
    var fill = function () {
      var e = ev();
      var t = type();
      $('#cAddBox').hidden = t === 'remove';
      $('#cRmBox').hidden = t === 'add';
      if (!e) { $('#cAdd').innerHTML = ''; $('#cRm').innerHTML = ''; return; }
      var all = [];
      e.dates.filter(function (d) { return d <= today; }).forEach(function (d) {
        ['AM', 'PM'].forEach(function (s) { all.push(d + '|' + s); });
      });
      var opt = function (k) { var p = k.split('|'); return '<option value="' + k + '">' + BM.fmtDate(p[0]) + ' ' + BM.sess(p[1]) + '</option>'; };
      var notMine = all.filter(function (k) { return e.mine.indexOf(k) < 0; });
      var mine = all.filter(function (k) { return e.mine.indexOf(k) >= 0; });
      $('#cAdd').innerHTML = notMine.length ? notMine.map(opt).join('') : '<option value="">（沒有可補登的場次）</option>';
      $('#cRm').innerHTML = mine.length ? mine.map(opt).join('') : '<option value="">（你在這個活動沒有報名紀錄）</option>';
    };
    $('#cEv').onchange = fill;
    $$('input[name=ctype]').forEach(function (r) {
      r.onchange = function () {
        $$('input[name=ctype]').forEach(function (x) { x.parentElement.classList.toggle('on', x.checked); });
        fill();
      };
    });
    fill();
    $('#cSubmit').onclick = async function () {
      var e = ev();
      var t = type();
      if (!e) return BM.toast('請選擇活動', true);
      var add = $('#cAdd').value, rm = $('#cRm').value;
      if (t !== 'remove' && !add) return BM.toast('請選擇補登場次', true);
      if (t !== 'add' && !rm) return BM.toast('請選擇移除場次', true);
      var p = { token: token(), eventId: e.id, type: t, reason: $('#cReason').value };
      if (t !== 'remove') { p.date = add.split('|')[0]; p.session = add.split('|')[1]; }
      if (t !== 'add') { p.rmDate = rm.split('|')[0]; p.rmSession = rm.split('|')[1]; }
      await BM.run(function () { return BM.api('submitCorrection', p); });
      BM.toast('已送出，等待管理員審核');
      loadCorrections();
    };
  }

  // ---------------- 啟動 ----------------
  document.querySelectorAll('#tabs button').forEach(function (b) { b.onclick = function () { switchTab(b.dataset.tab); }; });
  $('#loginBtn').onclick = doLogin;
  $('#loginPw').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  $('#loginAcct').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#loginPw').focus(); });
  $('#logoutBtn').onclick = function () { if (confirm('確定要登出？')) logout(); };
  $('#adminBtn').onclick = function () { location.href = 'admin.html'; };
  $('#forgotBtn').onclick = openForgot;
  $('#newPwBtn').onclick = doPwChange;
  $('#newPw2').addEventListener('keydown', function (e) { if (e.key === 'Enter') doPwChange(); });
  $('#pwCancel').onclick = function () { pwTicket = null; showLogin(); };

  BM.footer('報名頁', function () { return S.me ? S.me.name : ''; });
  var saved = BM.store('staff');
  if (token() && saved) startApp(saved); else showLogin();
})();
