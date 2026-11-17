/* 管理頁 */
(function () {
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var esc = BM.esc;
  var D = null; // adminData
  var S = { tab: 'events', year: String(new Date().getFullYear()) };
  var REG = ['北', '中', '南'];

  BM.onAuthFail = function () { logout(); };

  function token() { return BM.store('adminToken'); }
  function call(action, data) {
    return BM.run(function () { return BM.api(action, Object.assign({ token: token() }, data || {})); });
  }

  // 只有一個登入入口（報名頁）；沒登入或登出就回報名頁
  function logout() {
    BM.store('adminToken', null);
    BM.store('staffToken', null);
    BM.store('staff', null);
    BM.clearCache();
    location.href = 'index.html';
  }
  async function start() {
    $('#appView').hidden = false;
    $('#logoutBtn').hidden = false;
    await reload();
  }
  // 有暫存就先顯示，再背景更新；操作後直接用伺服器回傳的最新資料
  async function reload(data) {
    if (data) { D = data; BM.cache('adminData', D); render(); return; }
    await BM.swr('adminData', function () { return BM.api('adminData', { token: token() }); }, function (d) { D = d; render(); });
  }
  function render() {
    if (!D) return;
    var pending = D.corrections.filter(function (c) { return c.status === 'pending'; }).length;
    $('#tabs [data-tab=review]').innerHTML = '審核' + (pending ? '<span class="badge warn">' + pending + '</span>' : '');
    if (S.tab === 'events') renderEvents();
    if (S.tab === 'review') renderReview();
    if (S.tab === 'records') renderRecords();
    if (S.tab === 'staff') renderStaff();
    if (S.tab === 'settings') renderSettings();
  }
  function switchTab(t) {
    S.tab = t;
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    ['events', 'review', 'records', 'staff', 'settings'].forEach(function (x) { $('#tab-' + x).hidden = x !== t; });
    render();
    window.scrollTo(0, 0);
  }
  function staffName(id) {
    var s = D.staff.filter(function (x) { return x.id === id; })[0];
    return s ? s.name + ' ' + s.enName : id;
  }

  // ======================= 活動 =======================
  function statusBadge(e) {
    var b = [];
    if (e.status === 'draft') b.push('<span class="badge gray">草稿</span>');
    if (e.status === 'published') b.push('<span class="badge">已公開</span>');
    if (e.status === 'cancelled') b.push('<span class="badge bad">已取消</span>');
    if (e.status !== 'draft' && e.dirty) b.push('<span class="badge warn">★ 待推播</span>');
    else if (e.pushedAt) b.push('<span class="badge gray">已推播</span>');
    return b.join(' ');
  }
  function renderEvents() {
    var today = BM.today();
    var upcoming = D.events.filter(function (e) { return !e.dates.length || e.dates[e.dates.length - 1] >= today; }).reverse();
    var past = D.events.filter(function (e) { return e.dates.length && e.dates[e.dates.length - 1] < today; });
    var card = function (e) {
      return '<div class="card"><div class="list-item"><div class="grow">' +
        '<b>' + esc(e.name) + '</b><div class="small muted">' + esc(BM.fmtRange(e.dates)) + (e.host ? '・' + esc(e.host) : '') +
        '・報名 ' + e.regCount + ' 人' + (e.suggested !== '' ? '／建議 ' + e.suggested : '') + '</div>' +
        '<div style="margin-top:4px">' + statusBadge(e) + '</div></div></div>' +
        '<div class="btn-row">' +
        '<button class="btn small ghost" data-act="edit" data-id="' + e.id + '">編輯</button>' +
        '<button class="btn small ghost" data-act="regs" data-id="' + e.id + '">報名名單</button>' +
        (e.status === 'draft' ? '<button class="btn small" data-act="publish" data-id="' + e.id + '">公開</button>' : '') +
        (e.status === 'published' ? '<button class="btn small ghost" data-act="draft" data-id="' + e.id + '">改回草稿</button>' : '') +
        (e.status === 'published' ? '<button class="btn small danger" data-act="cancel" data-id="' + e.id + '">取消活動</button>' : '') +
        (e.status === 'cancelled' ? '<button class="btn small ghost" data-act="publish" data-id="' + e.id + '">恢復公開</button>' : '') +
        (e.status === 'draft' ? '<button class="btn small danger" data-act="delete" data-id="' + e.id + '">刪除</button>' : '') +
        '</div></div>';
    };
    var box = $('#tab-events');
    box.innerHTML =
      '<div class="btn-row" style="margin-top:0"><button class="btn" id="newEv">＋ 新增活動</button>' +
      '<button class="btn ghost" id="pushBtn">📣 推播活動更新</button></div>' +
      '<div class="small muted" style="margin-top:6px">推播目標：<b>' + (D.settings.pushTarget === 'main' ? '正式群組' : '測試群組') + '</b>（可在「設定」切換）</div>' +
      '<div class="section-title">未結束的活動</div>' + (upcoming.length ? upcoming.map(card).join('') : '<div class="card empty">尚無活動</div>') +
      (past.length ? '<details><summary class="section-title" style="cursor:pointer">已結束的活動（' + past.length + '）</summary>' + past.map(card).join('') + '</details>' : '');
    $('#newEv').onclick = function () { openEditor(null); };
    $('#pushBtn').onclick = openPush;
    $$('[data-act]', box).forEach(function (b) {
      b.onclick = function () { eventAction(b.dataset.act, b.dataset.id); };
    });
  }
  async function eventAction(act, id) {
    var e = D.events.filter(function (x) { return x.id === id; })[0];
    if (act === 'edit') return openEditor(e);
    if (act === 'regs') return openRegs(e);
    if (act === 'publish') { await reload(await call('setEventStatus', { id: id, status: 'published' })); BM.toast('已公開，員工可以報名了'); }
    if (act === 'draft') { await reload(await call('setEventStatus', { id: id, status: 'draft' })); BM.toast('已改回草稿'); }
    if (act === 'cancel') {
      if (!confirm('確定取消「' + e.name + '」？\n取消後此活動的報名不會計入次數，下次推播會標示〔已取消〕。')) return;
      await reload(await call('setEventStatus', { id: id, status: 'cancelled' }));
      BM.toast('已取消活動');
    }
    if (act === 'delete') {
      if (!confirm('確定刪除草稿「' + e.name + '」？')) return;
      await reload(await call('deleteEvent', { id: id }));
    }
  }

  function meetRowHtml(d, m) {
    m = m || { mode: 'all', all: '' };
    var name = 'mt_' + d;
    return '<div class="card" style="padding:10px;margin:6px 0" data-mt="' + d + '">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1">' + BM.fmtDate(d) + '</b>' +
      '<label class="chk' + (m.mode !== 'region' ? ' on' : '') + '"><input type="radio" name="' + name + '" value="all"' + (m.mode !== 'region' ? ' checked' : '') + '>全區相同</label>' +
      '<label class="chk' + (m.mode === 'region' ? ' on' : '') + '"><input type="radio" name="' + name + '" value="region"' + (m.mode === 'region' ? ' checked' : '') + '>北中南不同</label></div>' +
      '<div class="mt-all" ' + (m.mode === 'region' ? 'hidden' : '') + '><label class="f">全區集合時間</label><input class="input" type="time" data-r="all" value="' + esc(m.all || '') + '"></div>' +
      '<div class="mt-reg row3" ' + (m.mode === 'region' ? '' : 'hidden') + '>' + REG.map(function (r) {
        return '<div><label class="f">' + r + '區</label><input class="input" type="time" data-r="' + r + '" value="' + esc(m[r] || '') + '"></div>';
      }).join('') + '</div></div>';
  }

  function openEditor(e) {
    var isNew = !e;
    e = e || { name: '', dates: [], location: '', host: '', suggested: '', dress: '商務', meetPlace: '', meetTimes: {}, notes: '', poster: '', attachments: [] };
    var dates = e.dates.slice();
    var mt = JSON.parse(JSON.stringify(e.meetTimes || {}));

    var m = BM.modal('<h2>' + (isNew ? '新增活動' : '編輯活動') + '</h2>' +
      '<p class="small muted" style="margin:0">所有欄位都可以之後再補，填到一半也可以先「儲存」。</p>' +
      '<label class="f">活動名稱 *</label><input class="input" id="eName" value="' + esc(e.name) + '">' +
      '<label class="f">日期（可多天）</label><div id="dateList"></div>' +
      '<div style="display:flex;gap:8px"><input class="input" type="date" id="dateAdd"><button class="btn ghost" id="dateAddBtn" style="flex:none">加入</button></div>' +
      '<label class="f">地點</label><input class="input" id="eLoc" value="' + esc(e.location) + '">' +
      '<label class="f">主辦</label><input class="input" id="eHost" value="' + esc(e.host) + '" placeholder="例如：高醫">' +
      '<div class="row2"><div><label class="f">建議名額</label><input class="input" id="eSug" type="number" min="0" inputmode="numeric" value="' + esc(e.suggested) + '"></div>' +
      '<div><label class="f">服裝</label><input class="input" id="eDress" value="' + esc(e.dress) + '"></div></div>' +
      '<label class="f">集合地點</label><input class="input" id="eMeetPlace" value="' + esc(e.meetPlace) + '">' +
      '<label class="f">集合時間（每天）</label><div id="mtList"></div>' +
      '<label class="f">其他說明</label><textarea class="input" id="eNotes">' + esc(e.notes) + '</textarea>' +
      '<div id="fileBox"></div>' +
      '<div class="btn-row"><button class="btn block" id="eSave">儲存</button></div>', { wide: true });
    var root = m.el;

    function collectMt() {
      $$('[data-mt]', root).forEach(function (box) {
        var d = box.dataset.mt;
        var mode = $('input[type=radio]:checked', box).value;
        var o = { mode: mode };
        if (mode === 'all') o.all = $('[data-r=all]', box).value;
        else REG.forEach(function (r) { o[r] = $('[data-r="' + r + '"]', box).value; });
        mt[d] = o;
      });
    }
    function drawDates() {
      collectMt();
      dates.sort();
      $('#dateList', root).innerHTML = dates.length ? dates.map(function (d) {
        return '<span class="chk on" style="margin:0 6px 6px 0">' + BM.fmtDate(d) + ' <a href="#" data-del="' + d + '" aria-label="移除">✕</a></span>';
      }).join('') : '<div class="small muted">尚未設定日期</div>';
      $$('[data-del]', root).forEach(function (a) {
        a.onclick = function (ev) { ev.preventDefault(); dates = dates.filter(function (x) { return x !== a.dataset.del; }); drawDates(); };
      });
      $('#mtList', root).innerHTML = dates.length ? dates.map(function (d) { return meetRowHtml(d, mt[d]); }).join('') : '<div class="small muted">設定日期後即可填寫</div>';
      $$('[data-mt]', root).forEach(function (box) {
        $$('input[type=radio]', box).forEach(function (r) {
          r.onchange = function () {
            $$('input[type=radio]', box).forEach(function (x) { x.parentElement.classList.toggle('on', x.checked); });
            $('.mt-all', box).hidden = r.value !== 'all';
            $('.mt-reg', box).hidden = r.value === 'all';
          };
        });
      });
    }
    function drawFiles() {
      var box = $('#fileBox', root);
      if (!e.id) { box.innerHTML = '<div class="notice">儲存一次後，就可以上傳海報與附件（也可以用 LINE 官方帳號的「上傳活動附件」）。</div>'; return; }
      box.innerHTML = '<label class="f">海報</label>' +
        (e.poster ? '<img class="poster" style="max-width:220px" src="' + BM.img(e.poster, 500) + '" alt=""><button class="btn small danger" data-rm="poster">移除海報</button> ' : '') +
        '<label class="btn small ghost">' + (e.poster ? '更換海報' : '上傳海報') + '<input type="file" accept="image/*" id="upPoster" hidden></label>' +
        '<label class="f">附件</label>' +
        (e.attachments.length ? e.attachments.map(function (a) {
          return '<div class="list-item" style="margin-bottom:6px"><div class="grow">📎 <a href="' + BM.fileUrl(a.id) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a></div>' +
            '<button class="btn small danger" data-rm="' + a.id + '">移除</button></div>';
        }).join('') : '<div class="small muted">尚無附件</div>') +
        '<label class="btn small ghost" style="margin-top:6px">上傳附件<input type="file" id="upAtt" hidden></label>';
      $('#upPoster', root).onchange = function () { upload(this.files[0], 'poster'); };
      $('#upAtt', root).onchange = function () { upload(this.files[0], 'attachment'); };
      $$('[data-rm]', root).forEach(function (b) {
        b.onclick = async function () {
          if (!confirm('確定移除？')) return;
          var kind = b.dataset.rm === 'poster' ? 'poster' : 'attachment';
          D = await call('removeFile', { eventId: e.id, kind: kind, fileId: b.dataset.rm });
          refreshFromD();
        };
      });
    }
    function refreshFromD() {
      var fresh = D.events.filter(function (x) { return x.id === e.id; })[0];
      if (fresh) { e.poster = fresh.poster; e.attachments = fresh.attachments; }
      drawFiles();
      render();
    }
    async function upload(file, kind) {
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) return BM.toast('檔案太大（上限 15MB）', true);
      var b64 = await new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(String(r.result).split(',')[1]); };
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      D = await call('uploadFile', { eventId: e.id, kind: kind, name: file.name, mimeType: file.type, base64: b64 });
      BM.toast('已上傳');
      refreshFromD();
    }

    $('#dateAddBtn', root).onclick = function () {
      var v = $('#dateAdd', root).value;
      if (!v) return BM.toast('請先選擇日期', true);
      if (dates.indexOf(v) < 0) dates.push(v);
      $('#dateAdd', root).value = '';
      drawDates();
    };
    $('#eSave', root).onclick = async function () {
      collectMt();
      var payload = {
        id: e.id || '', name: $('#eName', root).value.trim(), dates: dates, location: $('#eLoc', root).value,
        host: $('#eHost', root).value, suggested: $('#eSug', root).value, dress: $('#eDress', root).value,
        meetPlace: $('#eMeetPlace', root).value, meetTimes: mt, notes: $('#eNotes', root).value
      };
      if (!payload.name) return BM.toast('請至少填寫活動名稱', true);
      D = await call('saveEvent', { event: payload });
      BM.toast('已儲存');
      if (!e.id) {
        // 新活動：找出剛建立的那筆，讓使用者可以接著上傳
        var created = D.events.filter(function (x) { return x.name === payload.name; })
          .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); })[0];
        if (created) { e = created; drawFiles(); render(); return; }
      }
      render();
      m.close();
    };
    drawDates();
    drawFiles();
  }

  async function openRegs(e) {
    var regs = await call('eventRegs', { eventId: e.id });
    var active = D.staff.filter(function (s) { return s.active && !s.admin; });
    var locked = D.settings.lockedYears;
    function has(sid, d, s) { return regs.some(function (r) { return r.staffId === sid && r.date === d && r.session === s; }); }
    function draw() {
      var total = {};
      regs.forEach(function (r) { total[r.staffId] = (total[r.staffId] || 0) + 0.5; });
      return '<h2>報名名單：' + esc(e.name) + '</h2>' +
        '<p class="small muted" style="margin:0">勾選或取消就會直接修改（管理員手動修正，立即生效）。</p>' +
        (e.dates.some(function (d) { return locked.indexOf(d.slice(0, 4)) >= 0; }) ? '<div class="notice">此活動所屬年度已鎖定，無法修改。</div>' : '') +
        '<div class="scroll-x"><table class="grid"><thead><tr><th>員工</th>' +
        e.dates.map(function (d) { return '<th colspan="2">' + BM.fmtDate(d, false) + '</th>'; }).join('') + '<th>次數</th></tr><tr><th></th>' +
        e.dates.map(function () { return '<th>上</th><th>下</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        active.map(function (s) {
          return '<tr><td style="white-space:nowrap">' + esc(s.name) + ' <span class="small muted">' + s.region + '</span></td>' +
            e.dates.map(function (d) {
              return ['AM', 'PM'].map(function (x) {
                return '<td><input type="checkbox" style="width:20px;height:20px;accent-color:#1f6f50" data-s="' + s.id + '" data-d="' + d + '" data-x="' + x + '"' + (has(s.id, d, x) ? ' checked' : '') + '></td>';
              }).join('');
            }).join('') + '<td>' + (total[s.id] || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var m = BM.modal(draw(), { wide: true, onClose: reload });
    function bind() {
      $$('input[data-s]', m.el).forEach(function (c) {
        c.onchange = async function () {
          try {
            regs = await call('setReg', { eventId: e.id, staffId: c.dataset.s, date: c.dataset.d, session: c.dataset.x, on: c.checked });
          } catch (err) { c.checked = !c.checked; return; }
          var inner = m.el.querySelector('.modal-x');
          m.el.innerHTML = '';
          m.el.appendChild(inner);
          m.el.insertAdjacentHTML('beforeend', draw());
          bind();
        };
      });
    }
    bind();
  }

  // ---------- 推播 ----------
  async function openPush() {
    var p = await call('previewPush');
    if (!p.items.length) return BM.toast('目前沒有已公開、未結束的活動可以推播', true);
    var stars = p.starIds.slice();
    var targetName = p.target === 'main' ? '正式群組' : '測試群組';
    function text() {
      var lines = ['【活動更新】'];
      p.items.forEach(function (e) {
        lines.push((stars.indexOf(e.id) >= 0 ? '★' : '') + BM.fmtRange(e.dates) + ' ' + e.name + (e.host ? '（' + e.host + '主辦）' : '') + (e.status === 'cancelled' ? '〔已取消〕' : ''));
      });
      lines.push('報名：' + D.settings.siteUrl);
      return lines.join('\n');
    }
    var m = BM.modal('<h2>推播活動更新</h2>' +
      '<p class="small muted" style="margin:0">勾選的活動會加上 ★（預設勾選新增或修改過、尚未推播的活動）。</p>' +
      '<div id="pItems" style="margin:10px 0"></div>' +
      '<label class="f">推播內容預覽</label><div class="preview" id="pText"></div>' +
      '<div id="pMissing"></div>' +
      '<div class="notice' + (p.target === 'main' ? '' : ' ok') + '">將推播到：<b>' + targetName + '</b></div>' +
      '<div class="btn-row"><button class="btn block" id="pSend">推播到' + targetName + '</button></div>');
    function draw() {
      $('#pItems', m.el).innerHTML = p.items.map(function (e) {
        var on = stars.indexOf(e.id) >= 0;
        return '<label class="chk' + (on ? ' on' : '') + '" style="display:flex;margin-bottom:6px;border-radius:10px"><input type="checkbox" data-id="' + e.id + '"' + (on ? ' checked' : '') + '>' +
          '<span>' + esc(BM.fmtRange(e.dates) + ' ' + e.name) + (e.status === 'cancelled' ? ' 〔已取消〕' : '') + '</span></label>';
      }).join('');
      $('#pText', m.el).textContent = text();
      var miss = p.items.filter(function (e) { return stars.indexOf(e.id) >= 0 && e.missing.length; });
      $('#pMissing', m.el).innerHTML = miss.length ? '<div class="notice">⚠️ 以下標 ★ 的活動還有欄位沒填：<br>' + miss.map(function (e) {
        return '・' + esc(e.name) + '：' + esc(e.missing.join('、'));
      }).join('<br>') + '<br>確認是刻意留空再推播；若是遺漏，請先關閉此視窗補上。</div>' : '';
      $$('#pItems input', m.el).forEach(function (c) {
        c.onchange = function () {
          if (c.checked) stars.push(c.dataset.id); else stars = stars.filter(function (x) { return x !== c.dataset.id; });
          draw();
        };
      });
    }
    draw();
    $('#pSend', m.el).onclick = async function () {
      var miss = p.items.filter(function (e) { return stars.indexOf(e.id) >= 0 && e.missing.length; });
      var msg = '確定推播到「' + targetName + '」？';
      if (miss.length) msg = '有 ' + miss.length + ' 個活動還有欄位未填寫。\n' + msg;
      if (!confirm(msg)) return;
      var r = await call('pushUpdate', { starIds: stars });
      BM.toast('已推播到' + r.sentTo);
      m.close();
      reload(r.data);
    };
  }

  // ======================= 審核 =======================
  function renderReview() {
    var pend = D.corrections.filter(function (c) { return c.status === 'pending'; });
    var done = D.corrections.filter(function (c) { return c.status !== 'pending'; }).slice(0, 50);
    var item = function (c, actions) {
      return '<div class="card"><div class="list-item"><div class="grow"><b>' + esc(c.staffName) + '</b>　' + esc(c.eventName) +
        '<div><b>' + esc(c.summary || '') + '</b></div>' +
        (c.reason ? '<div class="small muted">說明：' + esc(c.reason) + '</div>' : '') +
        '<div class="small muted">' + c.createdAt.replace('T', ' ').slice(0, 16) + '</div></div>' +
        (actions ? '' : (c.status === 'approved' ? '<span class="badge">已通過</span>' : '<span class="badge bad">已退回</span>')) + '</div>' +
        (actions ? '<div class="btn-row"><button class="btn small" data-ok="1" data-id="' + c.id + '">通過</button><button class="btn small danger" data-ok="0" data-id="' + c.id + '">退回</button></div>' : '') +
        '</div>';
    };
    var box = $('#tab-review');
    box.innerHTML = '<div class="section-title">待審核（' + pend.length + '）</div>' +
      (pend.length ? pend.map(function (c) { return item(c, true); }).join('') : '<div class="card empty">沒有待審核的申請 🎉</div>') +
      '<div class="section-title">最近處理</div>' + (done.length ? done.map(function (c) { return item(c, false); }).join('') : '<div class="card empty">無</div>');
    $$('[data-ok]', box).forEach(function (b) {
      b.onclick = async function () {
        await reload(await call('reviewCorrection', { id: b.dataset.id, approve: b.dataset.ok === '1' }));
        BM.toast(b.dataset.ok === '1' ? '已通過' : '已退回');
      };
    });
  }

  // ======================= 參加紀錄 =======================
  async function renderRecords() {
    var box = $('#tab-records');
    var y = Number(BM.today().slice(0, 4));
    var opts = '';
    for (var i = y + 1; i >= y - 10; i--) opts += '<option' + (String(i) === S.year ? ' selected' : '') + '>' + i + '</option>';
    box.innerHTML = '<label class="f">年度</label><select class="input" id="ry">' + opts + '</select>' +
      '<p class="small muted">要手動修改某人的次數：到「活動」→ 該活動的「報名名單」勾選/取消。</p><div id="rl"></div>';
    $('#ry').onchange = function () { S.year = this.value; renderRecords(); };
    var year = S.year;
    await BM.swr('rec_' + year, function () { return BM.api('adminRecords', { token: token(), year: year }); }, function (rec) {
      if (S.year !== year || !$('#rl')) return;
      $('#rl').innerHTML = '<p class="small muted">活動結束後隔日計入。' + (rec.updatedAt ? '上次更新：' + esc(rec.updatedAt) : '') + '</p>' +
        (rec.locked ? '<div class="notice">🔒 ' + rec.year + ' 年度已鎖定</div>' : '') +
        '<div class="scroll-x card" style="padding:0"><table class="grid"><thead><tr><th>員工</th><th>參加場次</th><th>次數</th></tr></thead><tbody>' +
        rec.people.map(function (p) {
          return '<tr><td style="white-space:nowrap">' + esc(p.id + ' ' + p.name) + '</td><td>' +
            (p.items.map(function (i) { return esc(i.date.slice(5).replace('-', '/') + ' ' + i.name) + ' <span class="muted">(' + i.sessions.map(BM.sess).join('、') + ')</span>'; }).join('<br>') || '<span class="muted">—</span>') +
            '</td><td><b>' + p.total + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
    });
  }

  // ======================= 員工 =======================
  function renderStaff() {
    var box = $('#tab-staff');
    box.innerHTML = '<div class="btn-row" style="margin-top:0"><button class="btn" id="addStaff">＋ 新增員工</button>' +
      '<a class="btn ghost" href="' + esc(D.settings.staffSheetUrl) + '" target="_blank" rel="noopener">開啟人員主檔</a></div>' +
      '<div class="card scroll-x" style="padding:0;margin-top:12px"><table class="grid"><thead><tr><th>員編</th><th>姓名</th><th>地區</th><th>狀態</th><th></th></tr></thead><tbody>' +
      D.staff.map(function (s) {
        return '<tr><td>' + esc(s.id) + '</td><td>' + esc(s.name + ' ' + s.enName) + '</td><td>' + esc(s.region) + '</td><td>' +
          (s.admin ? '<span class="badge">管理員</span> ' : '') +
          (s.active ? '<span class="badge">在職</span>' : '<span class="badge gray">停用</span>') +
          (s.active && s.mustChange ? ' <span class="badge warn">尚未設定密碼</span>' : '') +
          (s.locked ? ' <span class="badge bad">🔒 鎖定中</span>' : '') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn small ghost" data-edit="' + s.id + '">編輯</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    $('#addStaff').onclick = function () { staffEditor(null); };
    $$('[data-edit]', box).forEach(function (b) {
      b.onclick = function () { staffEditor(D.staff.filter(function (s) { return s.id === b.dataset.edit; })[0]); };
    });
  }
  function staffEditor(s) {
    var isNew = !s;
    s = s || { id: '', name: '', enName: '', region: '北', dept: '業務', birthday: '', active: true, note: '' };
    var m = BM.modal('<h2>' + (isNew ? '新增員工' : '編輯員工') + '</h2>' +
      '<div class="row2"><div><label class="f">員編</label><input class="input" id="sId" value="' + esc(s.id) + '"' + (isNew ? '' : ' disabled') + '></div>' +
      '<div><label class="f">地區</label><select class="input" id="sReg">' + REG.map(function (r) { return '<option' + (s.region === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row2"><div><label class="f">中文名</label><input class="input" id="sName" value="' + esc(s.name) + '"></div>' +
      '<div><label class="f">英文名（登入帳號）</label><input class="input" id="sEn" autocapitalize="off" value="' + esc(s.enName) + '"></div></div>' +
      '<div class="row2"><div><label class="f">部門</label><input class="input" id="sDept" value="' + esc(s.dept) + '"></div>' +
      '<div><label class="f">生日（MMDD）</label><input class="input" id="sBday" inputmode="numeric" maxlength="4" value="' + esc(s.birthday) + '"></div></div>' +
      '<label class="f">備註</label><input class="input" id="sNote" value="' + esc(s.note) + '">' +
      (isNew ? '<p class="small muted">預設密碼為生日 4 碼，第一次登入需重新設定。</p>' :
        s.admin ? '<p class="small muted">這是管理員帳號，不能停用，也不列入報名統計。</p>' :
        '<label class="chk' + (s.active ? ' on' : '') + '" style="margin-top:12px"><input type="checkbox" id="sActive"' + (s.active ? ' checked' : '') + '>在職（取消勾選＝停用，列表不再顯示）</label>') +
      '<div class="btn-row"><button class="btn" id="sSave">儲存</button></div>' +
      (isNew || s.admin ? '' : '<h3 style="margin-top:24px">密碼</h3>' +
        '<p class="small muted" style="margin:0">「恢復為生日」後，員工下次登入需重新設定新密碼，也會同時解除鎖定。</p>' +
        '<div class="btn-row"><button class="btn ghost" id="sReset">恢復為生日（並解鎖）</button>' +
        '<input class="input" id="sPw" placeholder="或直接指定新密碼（6–20 碼英數）" style="flex:1;min-width:160px"><button class="btn ghost" id="sSetPw">設定</button></div>'));
    var r = m.el;
    $('#sSave', r).onclick = async function () {
      var st = { id: $('#sId', r).value.trim(), name: $('#sName', r).value.trim(), enName: $('#sEn', r).value.trim(), region: $('#sReg', r).value,
        dept: $('#sDept', r).value.trim(), birthday: $('#sBday', r).value.trim(), note: $('#sNote', r).value.trim(),
        active: isNew || s.admin ? true : $('#sActive', r).checked };
      D = await call('saveStaff', { staff: st });
      BM.toast('已儲存');
      m.close();
      render();
    };
    if (!isNew && !s.admin) {
      $('#sReset', r).onclick = async function () {
        if (!confirm('把 ' + s.name + ' 的密碼恢復為生日 ' + s.birthday + '？\n對方下次登入需重新設定新密碼。')) return;
        await call('setStaffPassword', { id: s.id, reset: true });
        BM.toast('已恢復並解鎖，對方需重新登入');
        reload();
      };
      $('#sSetPw', r).onclick = async function () {
        var pw = $('#sPw', r).value.trim();
        if (!/^[A-Za-z0-9!@#$%^&*._-]{6,20}$/.test(pw)) return BM.toast('密碼需為 6–20 碼的英文或數字', true);
        await call('setStaffPassword', { id: s.id, password: pw });
        BM.toast('已更新，對方需用新密碼重新登入');
        $('#sPw', r).value = '';
      };
    }
  }

  // ======================= 設定 =======================
  function renderSettings() {
    var st = D.settings;
    var box = $('#tab-settings');
    var y = Number(BM.today().slice(0, 4));
    box.innerHTML =
      '<div class="card"><h3 style="margin-top:0">LINE 推播</h3>' +
      '<div class="small">' + (st.lineTokenSet ? '✅ 已設定 LINE Token' : '❌ 尚未設定 LINE Token') + '　' + (st.adminBound ? '✅ 已綁定管理員 LINE' : '❌ 尚未綁定（在 LINE 私訊官方帳號「綁定 你的登入密碼」）') + '</div>' +
      '<label class="f">推播目標</label><div class="btn-row" style="margin-top:0">' +
      '<label class="chk' + (st.pushTarget !== 'main' ? ' on' : '') + '"><input type="radio" name="pt" value="test"' + (st.pushTarget !== 'main' ? ' checked' : '') + '>測試群組</label>' +
      '<label class="chk' + (st.pushTarget === 'main' ? ' on' : '') + '"><input type="radio" name="pt" value="main"' + (st.pushTarget === 'main' ? ' checked' : '') + '>正式群組</label></div>' +
      '<label class="f">測試群組 ID</label><input class="input" id="tg" value="' + esc(st.testGroupId) + '" placeholder="C 開頭的一串代碼">' +
      '<label class="f">正式群組 ID</label><input class="input" id="mg" value="' + esc(st.mainGroupId) + '" placeholder="C 開頭的一串代碼">' +
      '<p class="small muted">取得群組 ID：綁定後，在群組裡輸入「設為測試群組」或「設為正式群組」即可自動填入。</p>' +
      '<label class="f">年度紀錄備份試算表（網址）</label><input class="input" id="bk" value="' + esc(st.backupSpreadsheetId ? 'https://docs.google.com/spreadsheets/d/' + st.backupSpreadsheetId : '') + '" placeholder="貼上你現有的紀錄試算表網址">' +
      '<div class="btn-row"><button class="btn" id="saveSet">儲存設定</button></div></div>' +

      '<div class="card"><h3 style="margin-top:0">測試與手動執行</h3>' +
      '<p class="small muted">會推播到目前選擇的推播目標。</p>' +
      '<div class="btn-row"><button class="btn small ghost" data-job="half">推播 ' + y + ' 上半年統計</button>' +
      '<button class="btn small ghost" data-job="year">推播 ' + (y - 1) + ' 年度統計</button>' +
      '<button class="btn small ghost" data-job="backup">立即備份 ' + (y - 1) + ' 年</button>' +
      '<button class="btn small ghost" data-job="richmenu">重新建立管理員選單</button></div></div>' +

      '<div class="card"><h3 style="margin-top:0">年度鎖定</h3>' +
      '<div>目前已鎖定：' + (st.lockedYears.length ? st.lockedYears.map(function (x) { return '<span class="badge gray">🔒 ' + x + '</span>'; }).join(' ') : '<span class="muted">無</span>') + '</div>' +
      '<div class="btn-row"><input class="input" id="ly" inputmode="numeric" maxlength="4" placeholder="年份，例如 ' + (y - 1) + '" style="flex:1;min-width:140px">' +
      '<button class="btn ghost" id="lockBtn">鎖定</button><button class="btn danger" id="unlockBtn">解鎖</button></div>' +
      '<p class="small muted">每年 1/11 13:00 會自動鎖定去年（若還有待審核申請，會每小時提醒並延後鎖定）。</p></div>' +

      '<div class="card"><h3 style="margin-top:0">我的密碼</h3>' +
      '<p class="small muted" style="margin:0 0 8px">管理員帳號的新密碼 10–20 碼，需同時包含英文與數字。</p>' +
      '<div class="row2"><input class="input" id="op" type="password" placeholder="目前的密碼" autocomplete="current-password"><input class="input" id="np" type="password" placeholder="新密碼" autocomplete="new-password"></div>' +
      '<div class="btn-row"><button class="btn ghost" id="pwBtn">修改密碼</button></div></div>' +

      '<div class="card small"><a href="' + esc(st.dataSheetUrl) + '" target="_blank" rel="noopener">開啟資料試算表</a>　' +
      '<a href="' + esc(st.staffSheetUrl) + '" target="_blank" rel="noopener">開啟人員主檔</a></div>';

    $$('input[name=pt]', box).forEach(function (r) {
      r.onchange = function () { $$('input[name=pt]', box).forEach(function (x) { x.parentElement.classList.toggle('on', x.checked); }); };
    });
    $('#saveSet').onclick = async function () {
      var pt = $('input[name=pt]:checked', box).value;
      if (pt === 'main' && st.pushTarget !== 'main' && !confirm('切換到「正式群組」後，所有推播都會發到正式群組。確定？')) return;
      await reload(await call('saveSettings', { settings: { pushTarget: pt, testGroupId: $('#tg').value, mainGroupId: $('#mg').value, backupSpreadsheetId: $('#bk').value } }));
      BM.toast('已儲存設定');
    };
    $$('[data-job]', box).forEach(function (b) {
      b.onclick = async function () {
        if (b.dataset.job !== 'richmenu' && b.dataset.job !== 'backup' && !confirm('確定要推播到「' + (st.pushTarget === 'main' ? '正式群組' : '測試群組') + '」？')) return;
        var r = await call('runJobNow', { job: b.dataset.job });
        BM.toast(b.dataset.job === 'backup' ? '已備份到「' + r.sheet + '」分頁' : '完成');
      };
    });
    var lockFn = function (locked) {
      return async function () {
        var yy = $('#ly').value.trim();
        if (!/^\d{4}$/.test(yy)) return BM.toast('請輸入 4 位數年份', true);
        if (!locked && !confirm('解鎖 ' + yy + ' 年後，該年資料可以再被修改。改完記得重新鎖定。確定？')) return;
        await reload(await call('setYearLock', { year: yy, locked: locked }));
        BM.toast(locked ? '已鎖定' : '已解鎖');
      };
    };
    $('#lockBtn').onclick = lockFn(true);
    $('#unlockBtn').onclick = lockFn(false);
    $('#pwBtn').onclick = async function () {
      var n = $('#np').value;
      if (n.length < 10 || n.length > 20 || !/[A-Za-z]/.test(n) || !/\d/.test(n)) return BM.toast('新密碼需 10–20 碼，需同時有英文與數字', true);
      var r = await call('changeMyPassword', { oldPassword: $('#op').value, newPassword: n });
      BM.store('adminToken', r.token);
      BM.store('staffToken', r.token);
      BM.store('staff', r.staff);
      $('#op').value = ''; $('#np').value = '';
      BM.toast('密碼已修改。LINE 綁定也請改用新密碼');
    };
  }

  // ======================= 啟動 =======================
  $$('#tabs button').forEach(function (b) { b.onclick = function () { switchTab(b.dataset.tab); }; });
  $('#logoutBtn').onclick = function () { if (confirm('確定要登出？')) logout(); };
  $('#siteBtn').onclick = function () { location.href = 'index.html'; };
  BM.footer('管理頁', function () { return '管理員'; });
  if (token()) start(); else location.href = 'index.html';
})();
