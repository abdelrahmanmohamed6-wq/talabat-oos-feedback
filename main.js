// 🔗 استبدل هذا الرابط برابط الـ Deployment الخاص بك في Google Apps Script
var API_URL = "https://script.google.com/a/macros/talabat.com/s/AKfycbxV42hm_FmARXHFT_rlWY9lN8iC3xgu7pAVt5-qrPuJbhXeVanmHbNwq5VlD_oi0N58Rw/exec";

var OWNER_EMAIL = 'abdelrahman.mohamed.6@talabat.com';
var S = { user: null, userEmail: null, isOwner: false, ownerViewingUser: null, all: [], filtered: [], batchSelections: {}, allTeamNames: [] };

function callAPI(action, payload, callback) {
  fetch(API_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: action, payload: payload })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) { if (callback) callback(null, data); })
  .catch(function(err) { if (callback) callback(err, null); });
}

function renderImageTag(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') return '<div style="font-size:36px; opacity:0.3;">📦</div>';
  var url = rawUrl.trim();
  if (url.indexOf('http') !== 0) return '<div style="font-size:36px; opacity:0.3;">📦</div>';
  
  var proxy1 = 'https://images.weserv.nl/?url=' + encodeURIComponent(url);
  var proxy2 = 'https://wsrv.nl/?url=' + encodeURIComponent(url);

  return '<img src="' + esc(url) + '" class="center-product-img" referrerpolicy="no-referrer" crossorigin="anonymous" ' +
    'onerror="this.onerror=null; this.src=\'' + esc(proxy1) + '\'; this.onerror=function(){ this.onerror=null; this.src=\'' + esc(proxy2) + '\'; this.onerror=function(){ this.parentElement.innerHTML=\'<div style=\\&quot;font-size:36px; opacity:0.3;\\&quot;>📦</div>\'; }; };">';
}

document.addEventListener("DOMContentLoaded", function() {
  initApp();
});

function initApp() {
  callAPI("getTeamMembers", {}, function(err, res) {
    if (err || !res) {
      S.allTeamNames = ['khalaf', 'mahdy', 'ehab', 'abdelrahman'];
      populateDropdowns();
      hideLoader(); show('loginScreen');
      return;
    }
    S.allTeamNames = res.names || [];
    populateDropdowns();
    hideLoader(); show('loginScreen');
  });
}

function populateDropdowns() {
  var sel = document.getElementById('nameDropdownSelect');
  if (sel) {
    sel.innerHTML = '<option value="">— اختر اسمك من القائمة —</option>';
    S.allTeamNames.forEach(function(n) {
      var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
    });
  }

  var adminSel = document.getElementById('adminUserSelect');
  if (adminSel) {
    adminSel.innerHTML = '<option value="__ALL__">— كل أعضاء الفريق —</option>';
    S.allTeamNames.forEach(function(n) {
      var o = document.createElement('option'); o.value = n; o.textContent = n; adminSel.appendChild(o);
    });
  }
}

function doManualLogin() {
  var val = document.getElementById('nameDropdownSelect').value;
  if (!val) { toast('اختر اسمك أولاً', 'err'); return; }
  S.user = val;
  S.isOwner = (val.toLowerCase() === 'abdelrahman');
  loadData();
}

function adminLoadSelected() {
  var sel = document.getElementById('adminUserSelect');
  S.ownerViewingUser = (sel.value === '__ALL__') ? null : sel.value;
  loadData();
}

function openAdminDashboardModal() {
  document.getElementById('adminDashboardModal').classList.add('on');
  callAPI("getAdminAnalytics", { email: S.userEmail }, function(err, data) {
    if (err || !data) return;
    document.getElementById('dashKpiTotal').textContent     = data.kpis.total;
    document.getElementById('dashKpiPending').textContent   = data.kpis.pending;
    document.getElementById('dashKpiCompleted').textContent = data.kpis.completed;
    document.getElementById('dashKpiRate').textContent      = data.kpis.completionRate + "%";

    var teamBody = document.getElementById('dashTeamBody'); teamBody.innerHTML = '';
    for (var champ in data.teamStats) {
      var st = data.teamStats[champ]; var tot = st.pending + st.completed;
      var rate = tot > 0 ? Math.round((st.completed / tot) * 100) : 0;
      teamBody.innerHTML += `<tr><td><b>${champ}</b></td><td>${st.pending}</td><td>${st.completed}</td><td><b>${rate}%</b></td></tr>`;
    }

    var auditBody = document.getElementById('dashAuditBody'); auditBody.innerHTML = '';
    data.recentAuditLogs.forEach(function(log) {
      auditBody.innerHTML += `<tr><td>${log.feedbackDate}</td><td><b>${log.champ}</b></td><td>#${log.orderId}</td><td>${log.actionType}</td></tr>`;
    });
  });
}

function closeAdminDashboardModal() { document.getElementById('adminDashboardModal').classList.remove('on'); }

function loadData() {
  showLoader();
  var action = S.isOwner ? "getOwnerData" : "getUserData";
  var payload = S.isOwner ? { filterName: S.ownerViewingUser } : { user: S.user };

  callAPI(action, payload, function(err, res) {
    if (err || !res) { hideLoader(); toast('فشل التحميل', 'err'); return; }
    S.all = res.issues || []; S.batchSelections = {};
    setupFilters(res.filters || {});
    applyFilters();
    hide('loginScreen');
    document.getElementById('appScreen').classList.add('on');

    var headerLabel = S.user;
    if (S.isOwner && S.ownerViewingUser) headerLabel = '👁️ ' + S.ownerViewingUser;
    if (S.isOwner && !S.ownerViewingUser) headerLabel = 'كل الفريق';
    document.getElementById('headerName').textContent = headerLabel;

    if (S.isOwner) {
      document.getElementById('adminFilterBar').classList.add('show');
      document.getElementById('btnDashTrigger').style.display = 'inline-block';
      document.getElementById('adminUserSelect').value = S.ownerViewingUser || '__ALL__';
    } else {
      document.getElementById('adminFilterBar').classList.remove('show');
      document.getElementById('btnDashTrigger').style.display = 'none';
    }

    hideLoader();
    toast(S.all.length ? 'تم تحميل ' + S.all.length + ' عنصر 📋' : 'لا توجد عناصر معلقة 🎉', 'inf');
  });
}

function refreshData() { loadData(); }

function setupFilters(f) {
  var vs = document.getElementById('fVendor'); vs.innerHTML = '<option value="">كل الفروع</option>'; (f.vendors || []).forEach(function(v) { vs.appendChild(makeOption(v, v)); });
  var bs = document.getElementById('fBranch'); bs.innerHTML = '<option value="">كل Vendor ID</option>'; (f.branchIds || []).forEach(function(b) { bs.appendChild(makeOption(b, b)); });
  var cn = document.getElementById('fChainName'); cn.innerHTML = '<option value="">كل Chain Name</option>'; (f.chainNames || []).forEach(function(c) { cn.appendChild(makeOption(c, c)); });
  var ci = document.getElementById('fChainId'); ci.innerHTML = '<option value="">كل Chain ID</option>'; (f.chainIds || []).forEach(function(c) { ci.appendChild(makeOption(c, c)); });
}
function makeOption(val, label) { var o = document.createElement('option'); o.value = val; o.textContent = label; return o; }

function applyFilters() {
  var vendor    = document.getElementById('fVendor').value;
  var branch    = document.getElementById('fBranch').value;
  var chainName = document.getElementById('fChainName').value;
  var chainId   = document.getElementById('fChainId').value;

  S.filtered = S.all.filter(function(i) {
    if (vendor    && i.vendorName !== vendor)               return false;
    if (branch    && String(i.branchId) !== String(branch)) return false;
    if (chainName && i.chainName  !== chainName)            return false;
    if (chainId   && String(i.chainId) !== String(chainId)) return false;
    return true;
  });
  renderItems(); updateBatchBarState();
}

function clearFilters() {
  document.getElementById('fVendor').value = ''; document.getElementById('fBranch').value = '';
  document.getElementById('fChainName').value = ''; document.getElementById('fChainId').value = '';
  applyFilters();
}

function renderItems() {
  var list = document.getElementById('itemsList'); var empty = document.getElementById('emptyState');
  list.innerHTML = '';
  if (S.filtered.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  S.filtered.forEach(function(issue) { list.appendChild(buildCard(issue)); });
}

function buildCard(iss) {
  var k = cKey(iss);
  var div = document.createElement('div'); div.className = 'icard'; div.id = 'icard_' + k;
  var pelicanClass = iss.pelicanStatus ? (iss.pelicanStatus.toLowerCase().includes('not_found') ? 'p-not-found' : 'p-active') : '';

  var imgHtml = renderImageTag(iss.imageUrl);

  div.innerHTML =
    '<div class="ch">' +
      '<span class="ch-date">📅 ' + (iss.orderDate || '—') + '</span>' +
      '<span class="ch-badge ' + pelicanClass + '">' + (iss.pelicanStatus || 'N/A') + '</span>' +
    '</div>' +
    '<div class="cb">' +
      '<div class="cb-info">' +
        '<div class="cb-item-name">🏷️ ' + esc(iss.itemName || '—') + '</div>' +
        '<div class="cb-sku">SKU: ' + esc(iss.itemSku || '—') + '</div>' +
        '<div style="font-size:11px; font-weight:800; margin-bottom:4px;">🏪 ' + esc(iss.vendorName || '—') + '</div>' +
        '<div style="font-size:10px; color:var(--text-2); display:flex; flex-direction:column; gap:2px;">' +
          '<div>🔖 فرع: <strong>' + esc(iss.branchId || '—') + '</strong></div>' +
          '<div>📦 طلب: <strong>#' + esc(iss.orderId || '—') + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="cb-img-col">' + imgHtml + '</div>' +
      '<div class="cb-actions">' +
        abt('t-oos',     '✅', 'رصيد السيستم = الرصيد الفعلي', k, 'SYSTEM_EQUAL') +
        abt('t-sub',     '⚠️', 'رصيد الفعلي ≠ السيستم',        k, 'SYSTEM_DIFF') +
        abt('t-del',     '✏️', 'تعديل اسم المنتج',              k, 'EDIT_NAME') +
        abt('t-barcode', '🔢', 'تعديل الباركود',                k, 'EDIT_BARCODE') +
        abt('t-sku',     '🔑', 'تعديل الـ SKU',                  k, 'EDIT_SKU') +
        abt('t-img',     '📷', 'صورة',                          k, 'IMAGE_ISSUE') +
        abt('t-note',    '📝', 'ملاحظة',                        k, 'OTHER') +
      '</div>' +
    '</div>' +
    '<div class="aip" id="aip_' + k + '"></div>';

  return div;
}

function abt(cls, icon, label, k, type) {
  return '<button class="abt ' + cls + '" id="abt_' + k + '_' + type + '" ' +
    'onclick="toggleAction(\'' + k + '\',\'' + type + '\')">' +
    '<span><span style="font-size:13px; margin-left:4px;">' + icon + '</span>' + label + '</span>' +
    '<span id="chk_' + k + '_' + type + '" style="font-weight:900;"></span></button>';
}

function toggleAction(k, type) {
  if (!S.batchSelections[k]) {
    S.batchSelections[k] = { issueData: S.filtered.find(function(i){ return cKey(i)===k; }), actions: {} };
  }

  var currentActions = S.batchSelections[k].actions;
  var btn = document.getElementById('abt_' + k + '_' + type);
  var chk = document.getElementById('chk_' + k + '_' + type);

  if (currentActions[type]) {
    delete currentActions[type];
    if (btn) btn.classList.remove('sel');
    if (chk) chk.textContent = '';
  } else {
    currentActions[type] = { value: "" };
    if (btn) btn.classList.add('sel');
    if (chk) chk.textContent = '✓';
  }

  renderCardInputs(k);
  
  if (Object.keys(currentActions).length === 0) {
    delete S.batchSelections[k];
    var card = document.getElementById('icard_' + k);
    if (card) card.style.borderColor = 'transparent';
  } else {
    var card = document.getElementById('icard_' + k);
    if (card) card.style.borderColor = 'var(--success)';
  }

  updateBatchBarState();
}

function renderCardInputs(k) {
  var panel = document.getElementById('aip_' + k);
  if (!panel || !S.batchSelections[k]) {
    if (panel) { panel.innerHTML = ''; panel.classList.remove('show'); }
    return;
  }

  var actions = S.batchSelections[k].actions;
  var keys = Object.keys(actions);
  if (keys.length === 0) {
    panel.innerHTML = ''; panel.classList.remove('show');
    return;
  }

  var html = '';
  keys.forEach(function(type) {
    if (type === 'SYSTEM_EQUAL' || type === 'SYSTEM_DIFF' || type === 'IMAGE_ISSUE') {
      html += '<div style="margin-bottom:8px; background:white; padding:8px; border-radius:6px; border:1px solid var(--border);">' +
        '<div style="font-size:11px; font-weight:800; margin-bottom:4px; color:var(--primary);">📷 التقاط صورة الكاميرا (إجباري):</div>' +
        '<input type="file" accept="image/*" capture="environment" style="font-size:11px;" onchange="onCameraCapture(this,\'' + k + '\',\'' + type + '\')">' +
        '</div>';
    } else if (type === 'EDIT_NAME') {
      html += '<input type="text" style="width:100%; padding:6px; margin-bottom:6px; border:1px solid var(--border); border-radius:4px; font-size:11px;" placeholder="أدخل الاسم الصحيح..." oninput="onInputValue(\'' + k + '\',\'' + type + '\', this.value)">';
    } else if (type === 'EDIT_BARCODE') {
      html += '<input type="text" style="width:100%; padding:6px; margin-bottom:6px; border:1px solid var(--border); border-radius:4px; font-size:11px;" placeholder="أدخل الباركود الصحيح..." oninput="onInputValue(\'' + k + '\',\'' + type + '\', this.value)">';
    } else if (type === 'EDIT_SKU') {
      html += '<input type="text" style="width:100%; padding:6px; margin-bottom:6px; border:1px solid var(--border); border-radius:4px; font-size:11px;" placeholder="أدخل SKU الصحيح..." oninput="onInputValue(\'' + k + '\',\'' + type + '\', this.value)">';
    } else if (type === 'OTHER') {
      html += '<input type="text" style="width:100%; padding:6px; margin-bottom:6px; border:1px solid var(--border); border-radius:4px; font-size:11px;" placeholder="أدخل الملاحظة..." oninput="onInputValue(\'' + k + '\',\'' + type + '\', this.value)">';
    }
  });

  panel.innerHTML = html;
  panel.classList.add('show');
}

function onCameraCapture(input, k, type) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    if (S.batchSelections[k] && S.batchSelections[k].actions[type]) {
      S.batchSelections[k].actions[type].value = e.target.result;
      updateBatchBarState();
    }
  };
  reader.readAsDataURL(file);
}

function onInputValue(k, type, val) {
  if (S.batchSelections[k] && S.batchSelections[k].actions[type]) {
    S.batchSelections[k].actions[type].value = val.trim();
    updateBatchBarState();
  }
}

function updateBatchBarState() {
  var total = S.filtered.length;
  var completed = 0;

  S.filtered.forEach(function(iss) {
    var k = cKey(iss);
    var itemSel = S.batchSelections[k];
    if (itemSel && Object.keys(itemSel.actions).length > 0) {
      var allValid = true;
      for (var act in itemSel.actions) {
        if ((act === 'SYSTEM_EQUAL' || act === 'SYSTEM_DIFF' || act === 'IMAGE_ISSUE') && !itemSel.actions[act].value) {
          allValid = false;
        }
      }
      if (allValid) completed++;
    }
  });

  var remaining = total - completed;

  document.getElementById('summaryTotalCount').textContent = total;
  document.getElementById('summaryUpdatedCount').textContent = completed;
  document.getElementById('summaryRemainingCount').textContent = remaining;

  var statusTag = document.getElementById('branchStatusTag');
  if (total > 0 && completed === total) {
    statusTag.textContent = 'DONE ✅';
    statusTag.classList.add('is-done');
  } else {
    statusTag.textContent = 'PENDING ⏳';
    statusTag.classList.remove('is-done');
  }

  document.getElementById('batchTotalCount').textContent = total;
  document.getElementById('batchCompletedCount').textContent = completed;

  var submitBtn = document.getElementById('btnBatchSubmit');
  submitBtn.disabled = (completed < total || total === 0);
}

function submitBatchTasks() {
  var payload = [];
  var missingCamera = false;

  S.filtered.forEach(function(iss) {
    var k = cKey(iss);
    var itemSel = S.batchSelections[k];
    if (itemSel) {
      for (var actType in itemSel.actions) {
        var actObj = itemSel.actions[actType];
        if ((actType === 'SYSTEM_EQUAL' || actType === 'SYSTEM_DIFF' || actType === 'IMAGE_ISSUE') && !actObj.value) {
          missingCamera = true;
        }
        payload.push({
          issueData: iss,
          actionType: actType,
          actionValue: actObj.value || ""
        });
      }
    }
  });

  if (missingCamera) {
    toast('عفواً! يلزم التقاط صورة بالكاميرا لخيارات الرصيد والصورة', 'err');
    return;
  }

  if (payload.length < S.filtered.length) {
    toast('عفواً! يجب تحديد الفيدباك لكل الكروت المعروضة أولاً', 'err');
    return;
  }

  showLoader();

  callAPI("submitBatchFeedback", { items: payload }, function(err, res) {
    hideLoader();
    if (res && res.status === 'success') {
      toast('🎉 تم إرسال وترحيل جميع الفيدباك بنجاح!', 'ok');
      loadData();
    } else {
      toast('حدث خطأ أثناء الإرسال', 'err');
    }
  });
}

function doLogout() { location.reload(); }
function cKey(iss) { return (iss.orderId + '_' + iss.itemSku).replace(/[^a-zA-Z0-9_]/g, '_'); }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg, type) {
  var wrap = document.getElementById('toastWrap'); var t = document.createElement('div');
  t.className = 'toast ' + (type || 'inf'); t.textContent = msg; wrap.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}
function show(id) { document.getElementById(id).style.display = 'flex'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function showLoader() { document.getElementById('globalLoader').style.display = 'flex'; }
function hideLoader() { document.getElementById('globalLoader').style.display = 'none'; }
function setLoaderText(t) { document.getElementById('loaderText').textContent = t; }
