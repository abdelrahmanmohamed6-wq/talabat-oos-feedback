// ==============================================================================
// Talabat OOS · GitHub Pages Frontend (Final Version)
// ==============================================================================

// ⚠️ بعد إعادة نشر Code.gs، استبدل هذا الرابط بالرابط الجديد
var API_URL = 'https://script.google.com/macros/s/AKfycbxjabytSWsUXElsvvHwPyhW8d3m312le2B0XOYzp7Zr5LQYeEUqL0OOMkiMmcJJqmsR/exec';

// ─── حالة التطبيق ──────────────────────────────────────────────────────────────
var S = {
  user: null, userEmail: null, isOwner: false, ownerViewingUser: null,
  all: [], filtered: [], batchSelections: {}, allTeamNames: [],
  currentToken: null, location: null
};

// ─── Session Cache (6 ساعات) ──────────────────────────────────────────────────
var _SKEY = 'oos_sess_v3';
var _STTL = 6 * 60 * 60 * 1000;

function readCache() {
  try {
    var c = JSON.parse(localStorage.getItem(_SKEY));
    return (c && (Date.now() - c.ts) < _STTL) ? c : null;
  } catch (e) { return null; }
}
function writeCache(d) {
  try {
    localStorage.setItem(_SKEY, JSON.stringify({
      name: d.name, email: d.email, isOwner: d.isOwner,
      allNames: d.allNames || [], ts: Date.now()
    }));
  } catch (e) {}
}
function clearCache() { localStorage.removeItem(_SKEY); }

// فك تشفير JWT لاستخراج الإيميل بدون انتظار شبكة
function parseJwt(token) {
  try {
    var base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    var json = decodeURIComponent(
      atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')
    );
    return JSON.parse(json);
  } catch (e) { return null; }
}

// ==============================================================================
// 🌐 محرك الاتصالات (POST للثقيل، JSONP للقراءة)
// ==============================================================================
var POST_ACTIONS = ['recordUserLogin', 'submitBatchFeedback', 'submitBranchSummary'];

function callAPI(action, payload, callback) {
  payload = payload || {};
  if (S.currentToken) payload.id_token = S.currentToken;

  if (POST_ACTIONS.indexOf(action) !== -1) {
    // POST للبيانات الثقيلة (صور + فيدباك كبير)
    fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, payload: payload })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (callback) callback(null, data); })
    .catch(function(err) {
      console.error('POST Error:', err);
      if (callback) callback(err, null);
    });
    return;
  }

  // JSONP GET للقراءة السريعة (بدون CORS)
  var cbName = 'jsonp_' + Math.round(1e6 * Math.random());
  var timer  = setTimeout(function() {
    if (window[cbName]) {
      delete window[cbName];
      if (callback) callback(new Error('Timeout'), null);
      toast('انتهت مهلة الاتصال ⌛', 'err');
    }
  }, 45000);

  window[cbName] = function(data) {
    clearTimeout(timer);
    var el = document.getElementById(cbName);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete window[cbName];
    if (callback) callback(null, data);
  };

  var sc  = document.createElement('script');
  sc.id   = cbName;
  sc.src  = API_URL + '?action=' + action +
            '&payload=' + encodeURIComponent(JSON.stringify(payload)) +
            '&callback=' + cbName;
  sc.onerror = function() {
    clearTimeout(timer);
    if (window[cbName]) delete window[cbName];
    if (callback) callback(new Error('Network Error'), null);
    toast('فشل الاتصال بالخادم 🌐', 'err');
  };
  document.body.appendChild(sc);
}

// ==============================================================================
// 🚀 بدء التشغيل
// ==============================================================================
document.addEventListener('DOMContentLoaded', function() {
  // إخفاء كل المودالات عند التحميل (حماية من أي كاش CSS)
  ['branchSummaryModal', 'adminDashboardModal'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.classList.remove('on'); }
  });

  var cached = readCache();

  if (cached && cached.isOwner) {
    // المدير فقط: يدخل تلقائياً لو الكاش صالح (مفيش موقع/صورة مطلوبة منه)
    S.user = cached.name; S.userEmail = cached.email;
    S.isOwner = true; S.allTeamNames = cached.allNames || [];
    loadData();
  } else {
    // الموظف: دايماً يمر بـ Google + موقع + صورة في كل فتح
    clearCache();           // امسح أي بقايا جلسة سابقة
    hideLoader();
    show('loginScreen');
  }
});

// ==============================================================================
// 🔐 تسجيل الدخول (Google OAuth)
// ==============================================================================
function handleCredentialResponse(response) {
  S.currentToken = response.credential;

  // استخراج الإيميل من JWT فوراً بدون انتظار شبكة
  var tokenData = parseJwt(response.credential);
  if (!tokenData || !tokenData.email) {
    showAuthError('تعذر قراءة بيانات الحساب من Google');
    return;
  }

  showLoader();
  setLoaderText('جاري التحقق من صلاحيات الدخول...');

  callAPI('verifyUserAuth', { email: tokenData.email }, function(err, res) {
    hideLoader();
    if (err || !res) { showAuthError('فشل الاتصال. تحقق من الإنترنت'); return; }
    if (!res.isAuthorized) { showAuthError('🚫 ' + (res.message || 'هذا الحساب غير مصرح له')); return; }

    clearAuthError();
    S.user = res.name; S.userEmail = res.email;
    S.isOwner = res.isOwner; S.allTeamNames = res.allNames || [];
    writeCache(res);

    if (S.isOwner) {
      // المدير يدخل مباشرة بدون صورة
      loadData();
    } else {
      // الموظف: طلب الموقع أولاً ثم الصورة
      requestLocationThenSelfie();
    }
  });
}

function showAuthError(msg) {
  var el = document.getElementById('authErrorMsg');
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}
function clearAuthError() {
  var el = document.getElementById('authErrorMsg');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}
function doLogout() { clearCache(); location.reload(); }

// ─── الموقع الجغرافي (إجباري — لا دخول بدونه) ────────────────────────────────
function requestLocationThenSelfie() {
  if (!navigator.geolocation) {
    showLocationBlocker('جهازك لا يدعم تحديد الموقع. استخدم Chrome أو Safari وحاول مجدداً.');
    return;
  }
  showLoader(); setLoaderText('📍 جاري تحديد موقعك الجغرافي...');
  var _locStart = Date.now();

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      hideLoader();
      var elapsed = Date.now() - _locStart;
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      S.location = {
        lat:       lat,
        lng:       lng,
        accuracy:  Math.round(pos.coords.accuracy),
        mapsUrl:   'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng,
        elapsedMs: elapsed,
        areaName:  ''
      };
      fetchAreaName(lat, lng);
      showSelfieModal();
    },
    function(err) {
      hideLoader();
      var msg = (err.code === 1)
        ? '🔒 رفضت مشاركة الموقع.\n\nالموقع الجغرافي إجباري لتسجيل الحضور. اسمح للمتصفح بالوصول للموقع ثم أعد المحاولة.'
        : '📡 تعذر تحديد موقعك. تأكد من تفعيل GPS وأن لديك إشارة جيدة، ثم أعد المحاولة.';
      showLocationBlocker(msg);
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

function showLocationBlocker(msg) {
  var existing = document.getElementById('locationBlocker');
  if (existing) existing.remove();
  var html =
    '<div id="locationBlocker" style="position:fixed;inset:0;background:rgba(15,23,42,0.97);z-index:10001;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;">' +
      '<div style="font-size:60px;margin-bottom:16px;">📍</div>' +
      '<h3 style="color:white;font-size:18px;font-weight:900;margin-bottom:12px;line-height:1.4;">الموقع الجغرافي مطلوب</h3>' +
      '<p style="color:rgba(255,255,255,0.75);font-size:13px;margin-bottom:28px;max-width:300px;line-height:1.7;white-space:pre-line;">' + msg + '</p>' +
      '<button onclick="retryLocation()" style="background:#FF6200;color:white;border:none;padding:14px 32px;border-radius:12px;font-family:\'Cairo\';font-size:15px;font-weight:900;cursor:pointer;margin-bottom:12px;width:100%;max-width:280px;">🔄 إعادة المحاولة</button>' +
      '<button onclick="doLogout()" style="background:transparent;color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.25);padding:10px 20px;border-radius:10px;font-family:\'Cairo\';font-size:13px;cursor:pointer;width:100%;max-width:280px;">← تسجيل خروج</button>' +
    '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function retryLocation() {
  var el = document.getElementById('locationBlocker');
  if (el) el.remove();
  requestLocationThenSelfie();
}

function fetchAreaName(lat, lng) {
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng, {
    headers: { 'Accept-Language': 'ar' }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var a = data.address || {};
    if (S.location) {
      S.location.areaName = a.suburb || a.neighbourhood || a.city_district || a.city || a.town || a.county || '';
    }
  })
  .catch(function() {});
}

// ─── مودال السيلفي ────────────────────────────────────────────────────────────
var _selfieData = '';

function showSelfieModal() {
  var loc = S.location || {};
  var locBadge = loc.lat
    ? '<div style="background:#ECFDF5;border:1.5px solid #10B981;border-radius:8px;padding:8px 14px;margin-bottom:16px;font-size:11px;font-weight:800;color:#065F46;display:flex;align-items:center;gap:6px;justify-content:center;">' +
      '✅ الموقع محدد · دقة ±' + (loc.accuracy || '—') + 'm' +
      (loc.areaName ? ' · ' + esc(loc.areaName) : '') +
      '</div>'
    : '<div style="background:#FEF2F2;border:1.5px solid #EF4444;border-radius:8px;padding:8px 14px;margin-bottom:16px;font-size:11px;font-weight:800;color:#991B1B;">⚠️ الموقع غير محدد</div>';

  var html =
    '<div id="selfieModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">' +
    '<div style="background:white;border-radius:20px;padding:28px;max-width:380px;width:100%;text-align:center;">' +
    '<div style="font-size:44px;margin-bottom:8px;">📸</div>' +
    '<h3 style="font-size:16px;font-weight:900;margin-bottom:4px;">إثبات الحضور بالصورة</h3>' +
    '<p style="font-size:12px;color:var(--text-2);margin-bottom:14px;">مرحباً <strong>' + esc(S.user) + '</strong> — التقط سيلفي لتأكيد الحضور.</p>' +
    locBadge +
    '<input type="file" accept="image/*" capture="user" id="selfieFileInput" style="margin-bottom:14px;font-size:12px;width:100%;" onchange="handleSelfieSelect(this)">' +
    '<div id="selfiePreview" style="margin-bottom:14px;min-height:10px;"></div>' +
    '<button id="btnConfirmLogin" onclick="confirmLoginWithPhoto()" disabled ' +
    'style="width:100%;padding:13px;background:var(--primary);color:white;border:none;border-radius:var(--r-sm);font-family:\'Cairo\';font-weight:900;font-size:14px;cursor:pointer;opacity:0.5;transition:opacity 0.2s;">' +
    '✅ تأكيد الحضور وبدء العمل' +
    '</button>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

// ضغط صورة السيلفي قبل الإرسال (max 400px)
function handleSelfieSelect(input) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var MAX = 400;
      var ratio = img.width > MAX ? MAX / img.width : 1;
      var canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      _selfieData = canvas.toDataURL('image/jpeg', 0.7);

      var prev = document.getElementById('selfiePreview');
      if (prev) {
        prev.innerHTML = '<img src="' + _selfieData + '" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);">';
      }
      var btn = document.getElementById('btnConfirmLogin');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// إرسال بيانات الحضور (POST)
function confirmLoginWithPhoto() {
  var btn = document.getElementById('btnConfirmLogin');
  if (btn) { if (btn._busy) return; btn._busy = true; btn.disabled = true; }

  showLoader(); setLoaderText('جاري تسجيل الحضور...');
  var loc = S.location || {};

  var _loginPayload = {
    name:       S.user,
    email:      S.userEmail,
    loginTime:  new Date().toISOString(),
    lat:        loc.lat        || '',
    lng:        loc.lng        || '',
    accuracy:   loc.accuracy   || '',
    mapsUrl:    loc.mapsUrl    || '',
    areaName:   loc.areaName   || '',
    locationMs: loc.elapsedMs  || '',
    photo:      _selfieData
  };

  function _doLoginRecord(attempt) {
    callAPI('recordUserLogin', _loginPayload, function(err, res) {
      if (!err && res && res.status === 'success') {
        _selfieData = '';
        var modal = document.getElementById('selfieModal');
        if (modal) modal.remove();
        toast('تم تسجيل الحضور بنجاح ✅', 'ok');
        loadData();
      } else if (attempt < 3) {
        // إعادة المحاولة تلقائياً حتى 3 مرات
        setTimeout(function() { _doLoginRecord(attempt + 1); }, 2000);
      } else {
        _selfieData = '';
        var modal2 = document.getElementById('selfieModal');
        if (modal2) modal2.remove();
        toast('دخلت بنجاح — الحضور قد لا يكون سُجِّل ⚠️', 'inf');
        loadData();
      }
    });
  }
  _doLoginRecord(1);
}

// ==============================================================================
// 📊 تحميل البيانات
// ==============================================================================
function loadData() {
  showLoader(); setLoaderText('جاري تحميل بيانات النواقص...');
  var action  = S.isOwner ? 'getOwnerData' : 'getUserData';
  var payload = S.isOwner
    ? { filterName: S.ownerViewingUser || null }
    : { user: S.user };

  callAPI(action, payload, function(err, res) {
    hideLoader();
    if (err || !res) {
      document.getElementById('itemsList').innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--error);">فشل تحميل البيانات. تحقق من الإنترنت.</div>';
      hide('loginScreen');
      document.getElementById('appScreen').classList.add('on');
      return;
    }

    S.all = res.issues || [];
    var f = res.filters || { chainNames: [], chainMap: {}, allVendors: [], allBranchIds: [] };
    S._chainMap    = f.chainMap || {};
    S.allTeamNames = res.allNames || S.allTeamNames;

    // بناء الـ 4 فلاتر
    rebuildSelect('fChainName', 'كل Chain Name',  f.chainNames);
    rebuildSelect('fChainId',   'كل Chain ID',    collectUniq(S.all, 'chainId'));
    rebuildSelect('fVendor',    'كل الفروع',      f.allVendors);
    rebuildSelect('fBranch',    'كل Vendor IDs',  f.allBranchIds);

    S.batchSelections = {};
    applyFilters();

    // إظهار الواجهة
    hide('loginScreen');
    document.getElementById('appScreen').classList.add('on');
    setTxt('headerName', S.user || '');

    if (S.isOwner) {
      document.getElementById('adminFilterBar').classList.add('show');
      document.getElementById('btnDashTrigger').style.display   = 'inline-block';
      document.getElementById('btnSummaryTrigger').style.display = 'none';
      // ملء dropdown الفريق
      var sel = document.getElementById('adminUserSelect');
      sel.innerHTML = '<option value="__ALL__">— كل أعضاء الفريق —</option>';
      S.allTeamNames.forEach(function(n) {
        var o = document.createElement('option'); o.value = n; o.textContent = n;
        sel.appendChild(o);
      });
      if (S.ownerViewingUser) sel.value = S.ownerViewingUser;
    } else {
      document.getElementById('adminFilterBar').classList.remove('show');
      document.getElementById('btnDashTrigger').style.display   = 'none';
      document.getElementById('btnSummaryTrigger').style.display = 'inline-block';
    }

    toast(S.all.length ? 'تم تحميل ' + S.all.length + ' عنصر 📋' : 'لا توجد نواقص 🎉', 'inf');
  });
}

function adminLoadSelected() {
  var val = document.getElementById('adminUserSelect').value;
  S.ownerViewingUser = (val === '__ALL__') ? null : val;
  loadData();
}

function collectUniq(arr, key) {
  var map = {};
  arr.forEach(function(i) { if (i[key]) map[i[key]] = true; });
  return Object.keys(map).sort();
}

// ==============================================================================
// 🔍 الفلاتر المترابطة (Cascading Filters)
// ==============================================================================
function rebuildSelect(id, placeholder, opts) {
  var sel = document.getElementById(id); if (!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">' + placeholder + '</option>';
  (opts || []).forEach(function(v) {
    var o = document.createElement('option'); o.value = v; o.textContent = v;
    if (String(v) === String(cur)) o.selected = true;
    sel.appendChild(o);
  });
}

function applyFilters() {
  var cn = document.getElementById('fChainName').value;
  var ci = document.getElementById('fChainId').value;
  var vn = document.getElementById('fVendor').value;
  var br = document.getElementById('fBranch').value;

  S.filtered = S.all.filter(function(i) {
    if (cn && i.chainName  !== cn)               return false;
    if (ci && String(i.chainId)  !== String(ci)) return false;
    if (vn && i.vendorName !== vn)               return false;
    if (br && String(i.branchId) !== String(br)) return false;
    return true;
  });

  // إعادة بناء الفلاتر بناءً على ما هو متاح في النتائج الحالية
  var pool = S.filtered.length ? S.filtered : S.all;
  rebuildSelect('fChainName', 'كل Chain Name', collectUniq(pool, 'chainName'));
  rebuildSelect('fChainId',   'كل Chain ID',   collectUniq(pool, 'chainId'));
  rebuildSelect('fVendor',    'كل الفروع',     collectUniq(pool, 'vendorName'));
  rebuildSelect('fBranch',    'كل Vendor IDs', collectUniq(pool, 'branchId'));

  // إعادة تطبيق القيم المختارة
  if (cn) document.getElementById('fChainName').value = cn;
  if (ci) document.getElementById('fChainId').value   = ci;
  if (vn) document.getElementById('fVendor').value    = vn;
  if (br) document.getElementById('fBranch').value    = br;

  renderItems();
}

function clearFilters() {
  ['fChainName', 'fChainId', 'fVendor', 'fBranch'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  // إعادة بناء بكل البيانات
  rebuildSelect('fChainName', 'كل Chain Name', collectUniq(S.all, 'chainName'));
  rebuildSelect('fChainId',   'كل Chain ID',   collectUniq(S.all, 'chainId'));
  rebuildSelect('fVendor',    'كل الفروع',     collectUniq(S.all, 'vendorName'));
  rebuildSelect('fBranch',    'كل Vendor IDs', collectUniq(S.all, 'branchId'));
  S.filtered = S.all.slice();
  renderItems();
}

// ==============================================================================
// 🃏 رسم كروت النواقص
// ==============================================================================
function renderItems() {
  var list  = document.getElementById('itemsList');
  var empty = document.getElementById('emptyState');
  list.innerHTML = '';

  if (!S.filtered.length) { empty.style.display = 'block'; updateBatchBarState(); return; }
  empty.style.display = 'none';
  S.filtered.forEach(function(iss) { list.appendChild(buildCard(iss)); });
  updateBatchBarState();
}

function buildCard(iss) {
  var k   = cKey(iss);
  var div = document.createElement('div');
  div.className = 'icard'; div.id = 'icard_' + k;

  var ps  = (iss.pelicanStatus || '').toString().toLowerCase();
  var cls = (ps.indexOf('not') !== -1) ? 'p-not-found' : 'p-active';

  div.innerHTML =
    '<div class="ch">' +
      '<span class="ch-date">📅 ' + esc(iss.orderDate || '—') + '</span>' +
      '<span class="ch-badge ' + cls + '">' + esc(iss.pelicanStatus || 'N/A') + '</span>' +
    '</div>' +
    '<div class="cb">' +
      '<div class="cb-info">' +
        '<div class="cb-chain-badge">🔗 ' + esc(iss.chainName || '—') + ' · ' + esc(iss.chainId || '—') + '</div>' +
        '<div class="cb-item-name">' + esc(iss.itemName || '—') + '</div>' +
        '<div class="cb-sku">SKU: ' + esc(iss.itemSku || '—') + '</div>' +
        '<div style="font-size:11px;font-weight:800;margin-bottom:2px;">🏪 ' + esc(iss.vendorName || '—') + '</div>' +
        '<div style="font-size:10px;color:var(--text-2);">' +
          '🔖 فرع: <strong>' + esc(iss.branchId || '—') + '</strong>' +
          ' · 📦 #' + esc(iss.orderId || '—') +
        '</div>' +
      '</div>' +
      '<div class="cb-img-col">' + renderImg(iss.imageUrl) + '</div>' +
      '<div class="cb-actions">' +
        mkBtn('✅', 'رصيد السيستم = الفعلي', k, 'SYSTEM_EQUAL') +
        mkBtn('⚠️', 'رصيد الفعلي ≠ السيستم',  k, 'SYSTEM_DIFF') +
        mkBtn('✏️', 'تعديل اسم المنتج',        k, 'EDIT_NAME') +
        mkBtn('🔢', 'تعديل الباركود',           k, 'EDIT_BARCODE') +
        mkBtn('🔑', 'تعديل الـ SKU',             k, 'EDIT_SKU') +
        mkBtn('📷', 'صورة',                      k, 'IMAGE_ISSUE') +
        mkBtn('📝', 'ملاحظة',                    k, 'OTHER') +
      '</div>' +
    '</div>' +
    '<div class="aip" id="aip_' + k + '"></div>';

  return div;
}

function mkBtn(icon, label, k, type) {
  return '<button class="abt" id="abt_' + k + '_' + type + '" onclick="toggleAction(\'' + k + '\',\'' + type + '\')">' +
    '<span>' + icon + ' ' + label + '</span>' +
    '<span id="chk_' + k + '_' + type + '" style="font-weight:900;color:var(--success);"></span>' +
    '</button>';
}

function renderImg(url) {
  if (!url || typeof url !== 'string' || url.indexOf('http') !== 0) {
    return '<div style="font-size:36px;opacity:0.3;">📦</div>';
  }
  var p1 = 'https://images.weserv.nl/?url=' + encodeURIComponent(url);
  return '<img src="' + esc(url) + '" class="center-product-img" referrerpolicy="no-referrer" ' +
    'onerror="this.onerror=null;this.src=\'' + esc(p1) + '\';" >';
}

// ==============================================================================
// ✅ إجراءات الكروت (Toggle + Inputs)
// ==============================================================================
function toggleAction(k, type) {
  var iss = S.all.find(function(i) { return cKey(i) === k; });
  if (!iss) return;

  if (!S.batchSelections[k]) S.batchSelections[k] = { issueData: iss, actions: {} };
  var acts = S.batchSelections[k].actions;
  var btn  = document.getElementById('abt_' + k + '_' + type);
  var chk  = document.getElementById('chk_' + k + '_' + type);

  if (acts[type]) {
    delete acts[type];
    if (btn) btn.classList.remove('sel');
    if (chk) chk.textContent = '';
  } else {
    acts[type] = { value: '' };
    if (btn) btn.classList.add('sel');
    if (chk) chk.textContent = '✓';
  }

  var card = document.getElementById('icard_' + k);
  if (Object.keys(acts).length === 0) {
    delete S.batchSelections[k];
    if (card) card.style.borderColor = 'transparent';
  } else {
    if (card) card.style.borderColor = 'var(--success)';
  }

  renderCardInputs(k);
  updateBatchBarState();
}

function renderCardInputs(k) {
  var panel = document.getElementById('aip_' + k); if (!panel) return;
  var sel   = S.batchSelections[k];
  if (!sel || !Object.keys(sel.actions).length) {
    panel.innerHTML = ''; panel.classList.remove('show'); return;
  }

  var html = '';
  Object.keys(sel.actions).forEach(function(type) {
    if (type === 'SYSTEM_EQUAL') {
      // لا يحتاج إدخال — مجرد التحديد كافٍ
      html += '<div style="font-size:11px;color:var(--success);font-weight:800;padding:4px 0;">✅ تم التأكيد: الرصيد مطابق</div>';
    } else if (type === 'SYSTEM_DIFF' || type === 'IMAGE_ISSUE') {
      html +=
        '<div style="margin-bottom:6px;">' +
        '<div style="font-size:11px;font-weight:800;margin-bottom:4px;color:var(--primary);">📷 صورة الكاميرا (إجباري):</div>' +
        '<input type="file" accept="image/*" capture="environment" style="font-size:11px;" ' +
        'onchange="onCameraCapture(this,\'' + k + '\',\'' + type + '\')">' +
        '</div>';
    } else {
      var ph = { EDIT_NAME: 'الاسم الصحيح...', EDIT_BARCODE: 'الباركود الصحيح...', EDIT_SKU: 'SKU الصحيح...', OTHER: 'الملاحظة...' };
      html += '<input type="text" class="input-text-cap" placeholder="' + (ph[type] || 'القيمة...') + '" ' +
        'oninput="onInputValue(\'' + k + '\',\'' + type + '\',this.value)">';
    }
  });

  panel.innerHTML = html;
  panel.classList.add('show');
}

// ضغط صورة الكاميرا (max 600px)
function onCameraCapture(input, k, type) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var MAX = 600;
      var ratio = img.width > MAX ? MAX / img.width : 1;
      var canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var compressed = canvas.toDataURL('image/jpeg', 0.75);
      if (S.batchSelections[k] && S.batchSelections[k].actions[type]) {
        S.batchSelections[k].actions[type].value = compressed;
        updateBatchBarState();
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function onInputValue(k, type, val) {
  if (S.batchSelections[k] && S.batchSelections[k].actions[type]) {
    S.batchSelections[k].actions[type].value = val.trim();
    updateBatchBarState();
  }
}

// ==============================================================================
// 📊 شريط الحالة السفلي
// ==============================================================================
function updateBatchBarState() {
  var total     = S.filtered.length;
  var completed = 0;

  S.filtered.forEach(function(iss) {
    var k   = cKey(iss);
    var sel = S.batchSelections[k];
    if (!sel || !Object.keys(sel.actions).length) return;

    var valid = true;
    Object.keys(sel.actions).forEach(function(type) {
      if ((type === 'SYSTEM_DIFF' || type === 'IMAGE_ISSUE') && !sel.actions[type].value) {
        valid = false;
      }
    });
    if (valid) completed++;
  });

  var remaining = total - completed;
  setTxt('summaryTotalCount',    total);
  setTxt('summaryUpdatedCount',  completed);
  setTxt('summaryRemainingCount', remaining);
  setTxt('batchTotalCount',      total);
  setTxt('batchCompletedCount',  completed);

  var tag = document.getElementById('branchStatusTag');
  if (tag) {
    if (total > 0 && completed === total) { tag.textContent = 'DONE ✅'; tag.classList.add('is-done'); }
    else { tag.textContent = 'PENDING ⏳'; tag.classList.remove('is-done'); }
  }

  var btn = document.getElementById('btnBatchSubmit');
  if (btn) btn.disabled = (completed === 0);
}

// ==============================================================================
// 🚀 إرسال الفيدباك المجمع (POST)
// ==============================================================================
function submitBatchTasks() {
  var payload     = [];
  var missingPhoto = false;

  S.filtered.forEach(function(iss) {
    var k   = cKey(iss);
    var sel = S.batchSelections[k];
    if (!sel) return;

    Object.keys(sel.actions).forEach(function(type) {
      var val = sel.actions[type].value;
      if ((type === 'SYSTEM_DIFF' || type === 'IMAGE_ISSUE') && !val) {
        missingPhoto = true;
      }
      payload.push({ issueData: iss, actionType: type, actionValue: val || '' });
    });
  });

  if (missingPhoto) { toast('⚠️ يلزم التقاط صورة لخيارات الرصيد والصورة', 'err'); return; }
  if (!payload.length) { toast('لم يتم تحديد أي إجراء', 'err'); return; }

  var btn = document.getElementById('btnBatchSubmit');
  if (btn) btn.disabled = true;
  showLoader(); setLoaderText('جاري إرسال ' + payload.length + ' إجراء...');

  callAPI('submitBatchFeedback', { items: payload }, function(err, res) {
    hideLoader();
    if (btn) btn.disabled = false;

    if (!err && res && res.status === 'success') {
      toast('🎉 تم إرسال جميع الفيدباك بنجاح!', 'ok');
      showFeedbackSummary(payload.length);
      S.batchSelections = {};
      setTimeout(function() { loadData(); }, 1800);
    } else {
      toast('حدث خطأ أثناء الإرسال ⚠️', 'err');
    }
  });
}

// ملخص مرئي بعد الإرسال
function showFeedbackSummary(count) {
  var html =
    '<div id="summaryModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;">' +
    '<div style="background:white;border-radius:20px;padding:32px 24px;max-width:340px;width:100%;text-align:center;">' +
    '<div style="font-size:56px;margin-bottom:8px;">🎉</div>' +
    '<h3 style="font-size:18px;font-weight:900;margin-bottom:6px;">تم إرسال الفيدباك!</h3>' +
    '<p style="font-size:13px;color:var(--text-2);margin-bottom:20px;">تم تسجيل <strong>' + count + '</strong> إجراء وترحيله للشيت بنجاح.</p>' +
    '<button onclick="document.getElementById(\'summaryModal\').remove()" ' +
    'style="width:100%;padding:12px;background:var(--primary);color:white;border:none;border-radius:var(--r-sm);font-family:\'Cairo\';font-weight:900;font-size:14px;cursor:pointer;">' +
    '← العودة للعمل' +
    '</button>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function() { var m = document.getElementById('summaryModal'); if (m) m.remove(); }, 6000);
}

// ==============================================================================
// 👑 لوحة تحليلات المدير
// ==============================================================================
function openAdminDashboardModal() {
  document.getElementById('adminDashboardModal').classList.add('on');
  showLoader(); setLoaderText('جاري تحميل التحليلات...');

  // auto-refresh الحضور كل 30 ثانية طول ما الداشبورد مفتوح
  if (_dashRefreshTimer) clearInterval(_dashRefreshTimer);
  _dashRefreshTimer = setInterval(function() {
    if (document.getElementById('adminDashboardModal').classList.contains('on')) {
      refreshLoginLogs();
    }
  }, 30000);

  callAPI('getAdminAnalytics', { email: S.userEmail }, function(err, data) {
    hideLoader();
    if (err || !data || data.status === 'unauthorized') {
      toast('غير مصرح بعرض التحليلات', 'err'); return;
    }

    setTxt('dashKpiTotal',     data.kpis.total);
    setTxt('dashKpiPending',   data.kpis.pending);
    setTxt('dashKpiCompleted', data.kpis.completed);
    setTxt('dashKpiRate',      (data.kpis.completionRate || 0) + '%');

    // إحصائيات الفريق
    var teamBody = document.getElementById('dashTeamBody');
    if (teamBody) {
      teamBody.innerHTML = '';
      var stats = data.teamStats || {};
      Object.keys(stats).forEach(function(champ) {
        var st  = stats[champ];
        var tot = (st.pending || 0) + (st.completed || 0);
        var rt  = tot > 0 ? Math.round((st.completed / tot) * 100) : 0;
        teamBody.innerHTML +=
          '<tr style="border-top:1px solid var(--border);">' +
          '<td style="padding:5px 8px;"><strong>' + esc(champ) + '</strong></td>' +
          '<td style="color:var(--warning);">' + (st.pending || 0) + '</td>' +
          '<td style="color:var(--success);">' + (st.completed || 0) + '</td>' +
          '<td><strong>' + rt + '%</strong></td></tr>';
      });
    }

    // آخر الإجراءات
    var auditBody = document.getElementById('dashAuditBody');
    if (auditBody) {
      auditBody.innerHTML = '';
      (data.recentAuditLogs || []).forEach(function(log) {
        var actionIcons = {
          SYSTEM_EQUAL: '✅ رصيد مطابق', SYSTEM_DIFF: '⚠️ رصيد مختلف',
          EDIT_NAME: '✏️ تعديل اسم', EDIT_BARCODE: '🔢 باركود',
          EDIT_SKU: '🔑 SKU', IMAGE_ISSUE: '📷 صورة', OTHER: '📝 ملاحظة'
        };
        var actLabel = actionIcons[log.actionType] || log.actionType || '';
        auditBody.innerHTML +=
          '<tr style="border-top:1px solid var(--border);">' +
          '<td style="padding:4px 8px;white-space:nowrap;font-size:10px;">' + esc(log.feedbackDate || '') + '</td>' +
          '<td><strong>' + esc(log.champ || '') + '</strong></td>' +
          '<td style="font-size:10px;color:var(--text-2);">' + esc(log.itemName || ('#' + (log.orderId || ''))) + '</td>' +
          '<td>' + actLabel + (log.actionValue ? '<br><span style="font-size:9px;color:var(--text-2);">' + esc(log.actionValue) + '</span>' : '') + '</td></tr>';
      });
    }

    // سجل الحضور
    var loginBody = document.getElementById('dashLoginBody');
    if (loginBody) {
      loginBody.innerHTML = '';
      (data.loginLogs || []).forEach(function(l) {
        var imgHtml = (l.photo && l.photo.indexOf('data:image') === 0)
          ? '<img src="' + l.photo + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);">'
          : '<span style="font-size:18px;opacity:0.35;">👤</span>';

        // كشف الفيك لوكيشن: أقل من 1.5 ثانية مشبوه جداً
        var isSuspect = (l.locationMs !== null && l.locationMs !== undefined && l.locationMs < 1500);
        var suspectBadge = isSuspect
          ? ' <span style="background:var(--error);color:white;font-size:9px;padding:1px 5px;border-radius:var(--r-full);font-weight:900;" title="GPS جاء في ' + l.locationMs + 'ms — مشبوه">⚠️ فيك؟</span>'
          : '';

        var locText = '';
        if (l.mapsUrl && l.mapsUrl.indexOf('http') === 0) {
          locText = '<a href="' + esc(l.mapsUrl) + '" target="_blank" style="color:var(--info);font-size:11px;font-weight:800;text-decoration:none;">📍 خريطة</a>';
          if (l.areaName) locText += '<br><span style="font-size:10px;color:var(--text-2);">' + esc(l.areaName) + '</span>';
        } else {
          locText = '—';
        }

        loginBody.innerHTML +=
          '<tr style="border-top:1px solid var(--border);">' +
          '<td style="padding:4px 8px;white-space:nowrap;">' + esc(l.timestamp || '') + suspectBadge + '</td>' +
          '<td><strong>' + esc(l.name || '') + '</strong><br><span style="font-size:10px;color:var(--text-2);">دقة: ' + esc(l.accuracy || '—') + 'm</span></td>' +
          '<td style="text-align:center;">' + imgHtml + '</td>' +
          '<td>' + locText + '</td></tr>';
      });
    }
  });
}

var _dashRefreshTimer = null;

function closeAdminDashboardModal() {
  document.getElementById('adminDashboardModal').classList.remove('on');
  if (_dashRefreshTimer) { clearInterval(_dashRefreshTimer); _dashRefreshTimer = null; }
}

// تحديث جدول الحضور فقط بدون إغلاق الداشبورد
function refreshLoginLogs() {
  var btn = document.getElementById('btnRefreshLogins');
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }

  callAPI('getAdminAnalytics', { email: S.userEmail }, function(err, data) {
    if (btn) { btn.textContent = '🔄 تحديث'; btn.disabled = false; }
    if (err || !data || data.status === 'unauthorized') return;

    var loginBody = document.getElementById('dashLoginBody');
    if (!loginBody) return;
    loginBody.innerHTML = '';

    (data.loginLogs || []).forEach(function(l) {
      var imgHtml = (l.photo && l.photo.indexOf('data:image') === 0)
        ? '<img src="' + l.photo + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--primary);">'
        : '<span style="font-size:18px;opacity:0.35;">👤</span>';

      var isSuspect = (l.locationMs !== null && l.locationMs !== undefined && l.locationMs < 1500);
      var suspectBadge = isSuspect
        ? ' <span style="background:var(--error);color:white;font-size:9px;padding:1px 5px;border-radius:var(--r-full);font-weight:900;">⚠️ فيك؟</span>'
        : '';

      var locText = '';
      if (l.mapsUrl && l.mapsUrl.indexOf('http') === 0) {
        locText = '<a href="' + esc(l.mapsUrl) + '" target="_blank" style="color:var(--info);font-size:11px;font-weight:800;text-decoration:none;">📍 خريطة</a>';
        if (l.areaName) locText += '<br><span style="font-size:10px;color:var(--text-2);">' + esc(l.areaName) + '</span>';
      } else { locText = '—'; }

      loginBody.innerHTML +=
        '<tr style="border-top:1px solid var(--border);">' +
        '<td style="padding:4px 8px;white-space:nowrap;font-size:10px;">' + esc(l.timestamp || '') + suspectBadge + '</td>' +
        '<td><strong>' + esc(l.name || '') + '</strong><br><span style="font-size:10px;color:var(--text-2);">دقة: ' + esc(l.accuracy || '—') + 'm</span></td>' +
        '<td style="text-align:center;">' + imgHtml + '</td>' +
        '<td>' + locText + '</td></tr>';
    });

    // تحديث KPIs أيضاً
    if (data.kpis) {
      setTxt('dashKpiTotal',     data.kpis.total);
      setTxt('dashKpiPending',   data.kpis.pending);
      setTxt('dashKpiCompleted', data.kpis.completed);
      setTxt('dashKpiRate',      (data.kpis.completionRate || 0) + '%');
    }
  });
}

// ==============================================================================
// 🛠️ دوال مساعدة
// ==============================================================================
function cKey(iss) {
  return (String(iss.orderId || '') + '_' + String(iss.itemSku || '')).replace(/[^a-zA-Z0-9]/g, '_');
}
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function setTxt(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
function show(id) { var el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }
function showLoader() { var el = document.getElementById('globalLoader'); if (el) el.style.display = 'flex'; }
function hideLoader() { var el = document.getElementById('globalLoader'); if (el) el.style.display = 'none'; }
function setLoaderText(t) { var el = document.getElementById('loaderText'); if (el) el.textContent = t; }

function toast(msg, type) {
  var wrap = document.getElementById('toastWrap'); if (!wrap) return;
  var t = document.createElement('div');
  t.className = 'toast ' + (type || 'inf'); t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(function() { if (t.parentNode) t.remove(); }, 3200);
}

// ==============================================================================
// 📋 ملخص الزيارة (Branch Summary)
// ==============================================================================
function showBranchSummaryModal() {
  var el = document.getElementById('branchSummaryModal');
  if (el) el.style.display = 'flex';
}
function closeBranchSummaryModal() {
  var el = document.getElementById('branchSummaryModal');
  if (el) el.style.display = 'none';
}

function doSubmitBranchSummary() {
  var btn = document.getElementById('btnSubmitSummary');
  if (btn && btn._busy) return;
  if (btn) btn._busy = true;

  var payload = {
    name:           S.user        || '',
    email:          S.userEmail   || '',
    visitObjective: document.getElementById('sumVisitObjective').value,
    menuManagement: document.getElementById('sumMenuManagement').value,
    empPerShift:    document.getElementById('sumEmpPerShift').value,
    riderPerShift:  document.getElementById('sumRiderPerShift').value,
    orderId:        document.getElementById('sumOrderId').value,
    actionsplan:    document.getElementById('sumActionsplan').value,
    vendorIssue:    document.getElementById('sumVendorIssue').value
  };

  showLoader(); setLoaderText('جاري إرسال ملخص الزيارة...');

  callAPI('submitBranchSummary', payload, function(err, res) {
    hideLoader();
    if (btn) btn._busy = false;

    if (!err && res && res.status === 'success') {
      toast('تم إرسال ملخص الزيارة ✅', 'ok');
      closeBranchSummaryModal();
      // إعادة تعيين الحقول
      ['sumVisitObjective','sumMenuManagement','sumEmpPerShift','sumRiderPerShift',
       'sumOrderId','sumActionsplan','sumVendorIssue'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
    } else {
      toast('فشل إرسال الملخص ⚠️', 'err');
    }
  });
}
