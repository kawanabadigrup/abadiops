/* ============================================================
   MAR Offline — M1 Mekanik + M2 Create + M3 Approval
   Prinsip: CACHE → ANTRE → SINKRON. Server selalu benar.
   ============================================================ */

// ⚠️ SALINAN BACA — URL deployment SENGAJA DIKOSONGKAN.
//
// Ini bukan aplikasi produksi, melainkan salinan untuk dibaca dan dipelajari.
// Kosong DENGAN SENGAJA: kalau diisi URL produksi, salinan ini akan menulis ke
// sistem yang sama dengan yang dipakai puluhan mekanik di lapangan — dan tidak
// akan ada satu pun galat yang memberi tahu bahwa itu sedang terjadi.
//
// Untuk menjalankannya, buat deployment Apps Script Anda SENDIRI lalu isi di
// sini. Isi juga API_URL di sw.js dengan nilai yang sama.
var CONFIG = { API_URL: './api' };
// SATU sumber kebenaran versi: nama CACHE di sw.js. Nilai di bawah hanya
// cadangan bila Cache API tak tersedia — saat boot, versinya DIBACA dari cache
// service worker yang benar-benar aktif (lihat syncVersionFromCache).
// Dengan begitu rilis cukup mengubah CACHE di sw.js; angka di sini tak bisa lagi
// tertinggal diam-diam seperti dulu (APP_VERSION v26 vs CACHE v34).
var APP_VERSION = 'projek-v4'; // cadangan; nilai sebenarnya dibaca dari CACHE sw.js (syncVersionFromCache)

// ── Pembaruan versi otomatis ────────────────────────────────────────────────
// sw.js sudah skipWaiting()+clients.claim(), jadi versi baru mengambil alih
// begitu TERUNDUH. Yang dulu hilang: pemicunya. register() hanya mengecek saat
// halaman dimuat, sedangkan PWA di HP mekanik bisa berhari-hari tidak pernah
// dinavigasi ulang — jadi mereka tertinggal di versi lama tanpa tanda apa pun.
var _swReg = null;
var _swReloaded = false;
var _swPendingReload = false;
var _swLastCheck = 0;
var SW_CHECK_MIN_MS = 10 * 60 * 1000;   // sw.js di GitHub Pages max-age=600

/** Minta browser mengecek sw.js baru. Dibatasi agar tak boros kuota. */
function cekPembaruan(paksa) {
  if (!_swReg || !navigator.onLine) return;
  var now = Date.now();
  if (!paksa && (now - _swLastCheck) < SW_CHECK_MIN_MS) return;
  _swLastCheck = now;
  try { _swReg.update(); } catch (e) {}
}

/** Muat ulang sekali saja — dipanggil saat SW baru mengambil alih. */
function _lakukanReloadSW() {
  if (_swReloaded) return;
  _swReloaded = true;
  window.location.reload();
}

// ── Tombol "⬆️ Versi": lihat versi terpasang vs server, lalu perbarui paksa ──
// Versi server dibaca dari sw.js (var CACHE = 'mar-vNN') dengan pembatal cache,
// jadi tak perlu file versi terpisah yang bisa lupa di-bump.
var _vServer = null;

function bacaVersiServer() {
  var url = './sw.js?cek=' + Date.now();
  return fetch(url, {cache: 'no-store'}).then(function(r){ return r.text(); }).then(function(t) {
    var m = t.match(/var CACHE = '(mar-projek-v\d+)'/);
    return m ? m[1].replace('mar-', '') : null;
  });
}

function bukaCekVersi() {
  document.getElementById('vTerpasang').textContent = APP_VERSION;
  document.getElementById('vServer').textContent = 'mengecek…';
  document.getElementById('vBtnUpdate').style.display = 'none';
  document.getElementById('vCatatan').style.display = 'none';
  _setVStatus('⏳ Mengecek…', '#F3F4F6', '#374151');
  showModal('versiModal');

  if (!navigator.onLine) {
    document.getElementById('vServer').textContent = '-';
    _setVStatus('📴 Tidak ada sinyal — sambungkan dulu untuk cek versi', '#FEF2F2', '#991B1B');
    return;
  }
  bacaVersiServer().then(function(v) {
    _vServer = v;
    document.getElementById('vServer').textContent = v || '?';
    if (!v) { _setVStatus('⚠️ Gagal membaca versi server', '#FEF2F2', '#991B1B'); return; }
    if (v === APP_VERSION) {
      _setVStatus('✅ Sudah versi terbaru', '#ECFDF5', '#065F46');
    } else {
      _setVStatus('⬆️ Versi baru tersedia: ' + v, '#FFFBEB', '#92400E');
      document.getElementById('vBtnUpdate').style.display = 'block';
      document.getElementById('vCatatan').style.display = 'block';
    }
  }).catch(function() {
    document.getElementById('vServer').textContent = '?';
    _setVStatus('⚠️ Gagal menghubungi server', '#FEF2F2', '#991B1B');
  });
}

function _setVStatus(teks, bg, fg) {
  var el = document.getElementById('vStatus');
  el.textContent = teks; el.style.background = bg; el.style.color = fg;
}

/**
 * Perbarui paksa: hapus SELURUH cache aplikasi lalu muat ulang.
 * AMAN untuk antrean — outbox ada di IndexedDB, bukan Cache Storage; yang
 * dihapus hanya berkas aplikasi (html/js/ikon) yang toh diunduh ulang.
 * Karena itu juga wajib online: menghapus cache saat offline akan membuat
 * aplikasi tak bisa dibuka sama sekali.
 */
function perbaruiSekarang() {
  if (!navigator.onLine) { toast('📴 Perlu sinyal untuk memperbarui'); return; }
  var btn = document.getElementById('vBtnUpdate');
  btn.disabled = true; btn.textContent = '⏳ Memperbarui…';
  _setVStatus('⏳ Mengunduh versi baru…', '#FFFBEB', '#92400E');

  var langkah = Promise.resolve();
  if (window.caches && caches.keys) {
    langkah = caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }).catch(function(){});
  }
  // Menghapus Cache Storage TIDAK menyentuh IndexedDB, tempat daftar mekanik &
  // unit disimpan — itu sebabnya dulu naik versi tak membuat orang baru muncul.
  // Cukup lupakan STEMPEL WAKTU-nya supaya refs ditarik ulang saat sync
  // berikutnya. JANGAN hapus store lain: outbox ada di sana, dan antrean kerja
  // yang belum terkirim tidak boleh ikut hilang.
  langkah = langkah.then(function(){ return kvSet('refs_at', null).catch(function(){}); }).catch(function(){});
  langkah.then(function() {
    // Daftarkan ulang SW supaya install() berjalan & mengisi cache versi baru.
    if (_swReg && _swReg.update) { try { return _swReg.update(); } catch (e) {} }
  }).then(function() {
    // Reload tanpa menunggu controllerchange — cache sudah kosong, jadi berkas
    // pasti diambil dari jaringan (fetch handler jatuh ke network saat cache miss).
    _swReloaded = true;
    setTimeout(function(){ window.location.reload(); }, 600);
  }).catch(function() {
    btn.disabled = false; btn.textContent = '⬇️ Perbarui Sekarang';
    _setVStatus('⚠️ Gagal memperbarui — coba lagi', '#FEF2F2', '#991B1B');
  });
}

/** Baca versi dari nama cache SW yang aktif → APP_VERSION selalu jujur. */
function syncVersionFromCache() {
  try {
    if (typeof caches === 'undefined' || !caches.keys) return Promise.resolve();
    return caches.keys().then(function(keys) {
      for (var i = 0; i < keys.length; i++) {
        var m = /^mar-(projek-v\d+)$/.exec(keys[i]);
        if (m) { APP_VERSION = m[1]; break; }
      }
    }).catch(function(){});
  } catch (e) { return Promise.resolve(); }
}
var S = { token:null, me:null, role:null, wos:[], refs:null, refsAt:null, pending:[], active:[], approved:[], transfers:[], monitoring:[], monitoringOverall:{}, outbox:[], lastSync:null, syncing:false, tab:'wos', appSub:'pending', showOutbox:false, crossFunc:false, timerStates:{} };
// PERF: katalog referensi (±1400 job) berat — tarik ulang maks 1x/12 jam.
// Ambang "referensi sudah basi" untuk sync OTOMATIS. Dulu 12 jam: menambah
// mekanik baru di spreadsheet baru muncul di HP keesokan harinya, dan tak ada
// cara mempercepatnya — refs disimpan di IndexedDB, jadi muat ulang halaman
// maupun naik versi (yang hanya menghapus Cache Storage) sama sekali tak
// menyentuhnya. Sync MANUAL kini selalu menarik ulang; angka ini tinggal jaring
// pengaman untuk yang tak pernah menekan Sync.
var REFS_TTL_MS = 30*60*1000;
function refsStale() { return !S.refs || !S.refsAt || (Date.now() - new Date(S.refsAt).getTime() > REFS_TTL_MS); }
var db = null;

/* ══ LIVE TIMER (port 1:1 dari SUM V2) ══════════════════════════════════════
   Beda dari SUM: di sistem ini picker jam TETAP TERLIHAT dan boleh dikoreksi manual.
   Timer hanya mengisinya; angka akhir yang dikirim tetap dari picker. */
var _liveTimerTicker = null;

function getTimerState(woId) {
  if (!S.timerStates) S.timerStates = {};
  if (!S.timerStates[woId]) S.timerStates[woId] = { state:'idle', start_epoch:0, elapsed_ms:0 };
  return S.timerStates[woId];
}
function saveTimerState(woId, state) {
  if (!S.timerStates) S.timerStates = {};
  S.timerStates[woId] = state;
  kvSet('timer_states', S.timerStates);
}

/**
 * Jeda semua WO lain yang masih berjalan.
 * JALUR UANG: tanpa ini dua timer bisa jalan bersamaan → jam dobel-hitung →
 * poin & rupiah salah. Waktu WO yang dijeda tetap tersimpan utuh.
 */
function pauseOtherRunningTimers(currentWoId) {
  var paused = [];
  if (!S.timerStates) return paused;
  for (var id in S.timerStates) {
    if (!S.timerStates.hasOwnProperty(id)) continue;
    if (String(id) === String(currentWoId)) continue;
    var st = S.timerStates[id];
    if (!st || st.state !== 'running') continue;
    st.elapsed_ms = (parseFloat(st.elapsed_ms)||0) + (Date.now() - (parseFloat(st.start_epoch)||Date.now()));
    st.state = 'paused'; st.start_epoch = 0;
    S.timerStates[id] = st; paused.push(id);
  }
  if (paused.length) kvSet('timer_states', S.timerStates);
  return paused;
}

function startLiveTimer(woId) {
  var autoPaused = pauseOtherRunningTimers(woId);   // hanya SATU WO boleh berjalan
  var st = getTimerState(woId);
  st.state = 'running'; st.start_epoch = Date.now();
  saveTimerState(woId, st);
  startTimerTicker(); renderAll();
  if (autoPaused.length) toast('⏸ '+autoPaused.length+' WO lain otomatis dijeda (waktunya tersimpan)');
}
function pauseLiveTimer(woId) {
  var st = getTimerState(woId);
  if (st.state !== 'running') return;
  st.state = 'paused';
  st.elapsed_ms += (Date.now() - st.start_epoch);
  st.start_epoch = 0;
  saveTimerState(woId, st); renderAll();
}
/**
 * Hentikan timer TANPA menghapus waktunya — kalau mekanik menutup form tanpa
 * mengirim, jam kerjanya tidak boleh hilang. Baru dibersihkan setelah masuk
 * antrean kirim (clearTimerAfterSubmit).
 */
function stopLiveTimer(woId) {
  var st = getTimerState(woId);
  var totalMs = (parseFloat(st.elapsed_ms)||0);
  if (st.state === 'running') totalMs += (Date.now() - (parseFloat(st.start_epoch)||Date.now()));
  st.state = 'paused'; st.elapsed_ms = totalMs; st.start_epoch = 0;
  saveTimerState(woId, st); renderAll();
  return totalMs;
}
function clearTimerAfterSubmit(woId) {
  saveTimerState(woId, { state:'idle', start_epoch:0, elapsed_ms:0 });
  renderAll();
}

/**
 * RESET: kembalikan timer WO ini ke 00:00:00.
 *
 * ⚠️ Ini MENGHAPUS jam kerja yang sudah terekam, dan jam itu jalur uang
 * (actual_hours → faktor ketepatan waktu → poin → rupiah). Karena itu:
 *
 * 1. Selalu minta konfirmasi dan SEBUTKAN berapa yang akan hilang. "Yakin
 *    reset?" tidak cukup — mekanik harus tahu nilainya sebelum menekan.
 * 2. Isian Jam Mulai/Selesai di form ikut dikosongkan, begitu juga ringkasan
 *    hijaunya. Tanpa ini muncul bug paling berbahaya dari tombol ini: jam di
 *    layar sudah 00:00:00, tapi form MASIH menyimpan jam lama dan terkirim
 *    apa adanya — mekanik dibayar untuk waktu yang baru saja dia hapus.
 * 3. partial_hours dari sesi yang sudah ditransfer TIDAK tersentuh; itu ada
 *    di server. Disebutkan di dialog supaya tak dikira ikut hilang.
 */
function resetLiveTimer(woId) {
  var st = getTimerState(woId);
  var totalMs = (parseFloat(st.elapsed_ms)||0) +
                (st.state==='running' ? (Date.now()-(parseFloat(st.start_epoch)||Date.now())) : 0);
  if (totalMs > 0) {
    var wo = null;
    for (var i=0;i<S.wos.length;i++) if (String(S.wos[i].id)===String(woId)) wo = S.wos[i];
    var pesan = 'Reset timer ke 00:00:00?\n\n' +
                'Waktu terekam ' + msToJamMenit(totalMs) + ' akan DIHAPUS dan tidak bisa dikembalikan.';
    if (wo && (parseFloat(wo.partial_hours)||0) > 0) {
      pesan += '\n\nJam dari sesi yang sudah ditransfer (' + fmtJamMenit(wo.partial_hours) + ') TIDAK ikut terhapus.';
    }
    if (!confirm(pesan)) return;
  }
  saveTimerState(woId, { state:'idle', start_epoch:0, elapsed_ms:0 });
  // Form isian bisa sedang terbuka untuk WO ini — kosongkan jamnya juga.
  if (activeWo && String(activeWo.id) === String(woId)) {
    dtSet('fStart', ''); dtSet('fEnd', ''); fHitungDurasi();
    showTimerSummary(0);
    updateModalTimerUI();
  }
  renderAll();
  if (totalMs > 0) toast('↺ Timer direset ke 00:00:00');
}
function modalTimerReset() { if (activeWo) resetLiveTimer(activeWo.id); }

function msToJamMenit(ms) {
  var tot = Math.round((parseFloat(ms)||0)/60000);
  var j = Math.floor(tot/60), m = tot%60;
  if (j>0 && m>0) return j+' jam '+m+' menit';
  if (j>0) return j+' jam';
  return m+' menit';
}
function formatMsToHms(ms) {
  if (!ms || ms < 0) return '00:00:00';
  var sec = Math.floor(ms/1000);
  var hr = Math.floor(sec/3600);
  var min = Math.floor((sec-(hr*3600))/60);
  sec = sec-(hr*3600)-(min*60);
  if (hr<10) hr='0'+hr; if (min<10) min='0'+min; if (sec<10) sec='0'+sec;
  return hr+':'+min+':'+sec;
}
function formatToDatetimeLocal(date) {
  var pad = function(n){ return (n<10?'0':'')+n; };
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+
    'T'+pad(date.getHours())+':'+pad(date.getMinutes());
}

/* ═══ PICKER TANGGAL & JAM 24 JAM ═══════════════════════════════════════════
 * KEMBAR dengan DateTime24.html di project GAS — kalau salah satu diubah, ubah
 * keduanya, kalau tidak picker web dan PWA berbeda bentuk.
 *
 * KENAPA tidak <input type="datetime-local">: format 12/24 jam pada picker
 * bawaan ditentukan LOCALE PERANGKAT, bukan HTML. Di ponsel ber-locale Inggris
 * ia memunculkan AM/PM — bentuk yang tidak dipakai di lapangan sini, dan sumber
 * salah isi yang mahal (jam 13.00 terbaca "1" lalu tersimpan 01.00 → meleset 12
 * jam pada actual_hours, dan itu jalur uang). Tidak ada atribut untuk
 * memaksanya, jadi jamnya dibuat sendiri: 00–23 dan 00–59.
 * Bagian TANGGAL tetap <input type="date"> — di sana tak ada urusan AM/PM.
 *
 * Nilainya tetap ditulis ke <input type="hidden"> ber-ID SAMA seperti dulu,
 * format "YYYY-MM-DDTHH:MM". Semua kode yang MEMBACA `.value` tak berubah.
 * Yang MENULIS wajib lewat dtSet(id, nilai).
 */
function dtHtml(id) {
  return '<input type="hidden" id="'+id+'">'+
    '<div class="dt24" data-dt="'+id+'">'+
      '<input type="date" class="inp dtTgl" aria-label="Tanggal">'+
      '<select class="inp dtJam" aria-label="Jam"></select>'+
      '<span class="dtTitik">:</span>'+
      '<select class="inp dtMnt" aria-label="Menit"></select>'+
    '</div>';
}
function _dt2(n){ return (n<10?'0':'')+n; }

/** Isi opsi jam/menit & pasang pendengar. Aman dipanggil berulang. */
function dtPasang(root) {
  var grup = (root||document).querySelectorAll('.dt24');
  for (var i=0;i<grup.length;i++) {
    var g = grup[i];
    if (g.getAttribute('data-siap')==='1') continue;
    g.setAttribute('data-siap','1');
    var oJam='<option value="">--</option>';
    for (var h=0;h<24;h++) oJam+='<option value="'+_dt2(h)+'">'+_dt2(h)+'</option>';
    g.querySelector('.dtJam').innerHTML=oJam;
    var oMnt='<option value="">--</option>';
    for (var m=0;m<60;m++) oMnt+='<option value="'+_dt2(m)+'">'+_dt2(m)+'</option>';
    g.querySelector('.dtMnt').innerHTML=oMnt;
    // 'change' untuk select; 'input' untuk <input type="date"> — sebagian
    // peramban Android baru mengirim 'change' setelah picker ditutup.
    g.addEventListener('change', function(){ dtKumpulkan(this); });
    g.addEventListener('input',  function(){ dtKumpulkan(this); });
  }
}

/**
 * Trio di layar → input hidden, lalu picu 'change' PADA input hidden supaya
 * handler lama (hitung durasi, penjaga override) tetap jalan seperti dulu.
 */
function dtKumpulkan(g) {
  var el = document.getElementById(g.getAttribute('data-dt'));
  if (!el) return;
  var t=g.querySelector('.dtTgl').value, j=g.querySelector('.dtJam').value, m=g.querySelector('.dtMnt').value;
  // Belum lengkap = kosong. Separuh terisi tidak boleh jadi waktu tebakan —
  // lebih baik ditolak validasi daripada tersimpan jam ngawur.
  var baru = (t && j!=='' && m!=='') ? (t+'T'+j+':'+m) : '';
  if (el.value === baru) return;
  el.value = baru;
  el.dispatchEvent(new Event('change', {bubbles:true}));
}

/**
 * Bacaan balik durasi dari picker "Isi Manual".
 *
 * Web sudah punya sejak dulu (durationPreview); PWA belum. Dengan jam & menit
 * kini di dua kolom terpisah, menjumlahkannya di kepala makin sulit — apalagi
 * kalau melewati tengah malam — dan kekeliruannya baru ketahuan setelah
 * terkirim. Ini jalur uang (actual_hours), jadi angka desimalnya ikut
 * ditampilkan supaya cocok dengan yang dilihat approver.
 */
function fHitungDurasi() {
  var box = document.getElementById('fDurBox');
  if (!box) return;
  var sEl = document.getElementById('fStart'), eEl = document.getElementById('fEnd');
  var s = sEl ? sEl.value : '', e = eEl ? eEl.value : '';
  function warna(bg, br, fg) {
    box.style.background = bg; box.style.border = '1px solid ' + br; box.style.color = fg;
  }
  if (!s || !e) { box.style.display = 'none'; box.textContent = ''; return; }
  box.style.display = 'block';
  var ms = new Date(e).getTime() - new Date(s).getTime();
  if (isNaN(ms) || ms <= 0) {
    box.textContent = '⚠️ Jam selesai harus setelah jam mulai';
    warna('#FEF2F2', '#FCA5A5', '#991B1B');
    return;
  }
  box.textContent = '⏱️ Durasi: ' + msToJamMenit(ms) + ' (' + (Math.round((ms / 3600000) * 100) / 100) + ' jam)';
  warna('#FFFBEB', '#FDE68A', '#92400E');
}

/** Satu-satunya cara sah menulis nilai picker. `s` = "YYYY-MM-DDTHH:MM" atau ''. */
function dtSet(id, s) {
  var el = document.getElementById(id);
  if (!el) return;
  s = s ? String(s) : '';
  if (s.length > 16) s = s.substring(0,16);   // buang detik bila terbawa
  el.value = s;
  var g = document.querySelector('.dt24[data-dt="'+id+'"]');
  if (!g) return;
  g.querySelector('.dtTgl').value = s ? s.substring(0,10) : '';
  g.querySelector('.dtJam').value = s ? s.substring(11,13) : '';
  g.querySelector('.dtMnt').value = s ? s.substring(14,16) : '';
}
function showTimerSummary(totalMs, startD, endD) {
  var box = document.getElementById('fTimerSummary');
  if (!box) return;
  if (!totalMs || totalMs <= 0) { box.style.display='none'; box.innerHTML=''; return; }
  box.style.display = 'block';
  box.innerHTML = '✅ Total waktu pengerjaan: <b>'+msToJamMenit(totalMs)+'</b>'+
    '<div style="font-weight:600;font-size:11px;margin-top:3px;opacity:.85">'+
    formatToDatetimeLocal(startD).replace('T',' ')+' → '+formatToDatetimeLocal(endD).replace('T',' ')+'</div>';
}

function startTimerTicker() {
  if (_liveTimerTicker) return;
  _liveTimerTicker = setInterval(function() {
    var hasRunning = false;
    if (S.timerStates) {
      for (var id in S.timerStates) {
        if (S.timerStates[id] && S.timerStates[id].state === 'running') { hasRunning = true; break; }
      }
    }
    if (hasRunning) updateActiveTimerDisplays();
  }, 1000);
}
function updateActiveTimerDisplays() {
  if (!S.timerStates) return;
  for (var woId in S.timerStates) {
    var st = S.timerStates[woId];
    if (!st) continue;
    var curMs = st.elapsed_ms + (st.state==='running' ? (Date.now()-st.start_epoch) : 0);
    var cardDisp = document.getElementById('timer-clock-'+woId);
    if (cardDisp) cardDisp.textContent = formatMsToHms(curMs);
    if (activeWo && String(activeWo.id) === String(woId)) {
      var mDisp = document.getElementById('modalTimerDisplay');
      if (mDisp) mDisp.textContent = formatMsToHms(curMs);
    }
  }
}
function updateModalTimerUI() {
  if (!activeWo) return;
  var st = getTimerState(activeWo.id);
  var disp = document.getElementById('modalTimerDisplay');
  var bStart = document.getElementById('modalBtnStart');
  var bPause = document.getElementById('modalBtnPause');
  var bStop  = document.getElementById('modalBtnStop');
  var bReset = document.getElementById('modalBtnReset');
  if (!disp) return;

  disp.textContent = formatMsToHms(st.elapsed_ms + (st.state==='running' ? (Date.now()-st.start_epoch) : 0));

  // Reset hanya saat ada yang bisa direset — di keadaan idle hanya menambah
  // risiko salah pencet tanpa gunanya.
  if (bReset) bReset.style.display = (st.state === 'idle') ? 'none' : 'inline-block';

  if (st.state === 'idle') {
    bStart.style.display='inline-block'; bStart.textContent='▶ Start';
    bPause.style.display='none'; bStop.style.display='none';
  } else if (st.state === 'running') {
    bStart.style.display='none';
    bPause.style.display='inline-block'; bStop.style.display='inline-block';
  } else {
    bStart.style.display='inline-block'; bStart.textContent='▶ Resume';
    bPause.style.display='none'; bStop.style.display='inline-block';
  }
}
function modalTimerStart() { if (activeWo) { startLiveTimer(activeWo.id); updateModalTimerUI(); } }
function modalTimerPause() { if (activeWo) { pauseLiveTimer(activeWo.id); updateModalTimerUI(); } }
function modalTimerStop() {
  if (!activeWo) return;
  var cur = getTimerState(activeWo.id);
  var preview = (parseFloat(cur.elapsed_ms)||0) + (cur.state==='running' ? (Date.now()-cur.start_epoch) : 0);
  if (preview > 0 && preview < 60000 &&
      !confirm('Durasi kerja baru '+msToJamMenit(preview)+'.\nYakin hentikan timer dan pakai durasi ini?')) return;
  var totalMs = stopLiveTimer(activeWo.id);
  if (totalMs > 0) {
    var now = new Date(), start = new Date(now.getTime()-totalMs);
    dtSet('fStart', formatToDatetimeLocal(start));
    dtSet('fEnd', formatToDatetimeLocal(now));
    fHitungDurasi();
    showTimerSummary(totalMs, start, now);
  }
  updateModalTimerUI();
}
/** Blok kontrol timer di kartu WO (Start / Pause / Finish). */
function _timerControls(wo) {
  var st = getTimerState(wo.id);
  var curMs = st.elapsed_ms + (st.state==='running' ? (Date.now()-st.start_epoch) : 0);
  var id = esc(String(wo.id));
  var isRunning = (st.state==='running'), isPaused = (st.state==='paused');
  return '<div class="timerPill">'+
    '<div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:2px">⏱️ LIVE TIMER</div>'+
    '<div class="timerClock" id="timer-clock-'+id+'">'+formatMsToHms(curMs)+'</div>'+
    '<div class="timerBtns">'+
      (isRunning?'':'<button type="button" class="timerBtn btnStart" onclick="startLiveTimer(\''+id+'\')">▶ '+(isPaused?'Resume':'Start')+'</button>')+
      (isRunning?'<button type="button" class="timerBtn btnPause" onclick="pauseLiveTimer(\''+id+'\')">⏸ Pause</button>':'')+
      (st.state!=='idle'?'<button type="button" class="timerBtn btnStop" onclick="openSubmitWithTimer(\''+id+'\')">⏹ Finish &amp; Isi</button>':'')+
      // Reset hanya muncul kalau ADA yang bisa direset. Di keadaan idle tombol
      // ini tak berguna dan hanya menambah risiko salah pencet.
      (st.state!=='idle'?'<button type="button" class="timerBtn btnReset" onclick="resetLiveTimer(\''+id+'\')">↺ Reset</button>':'')+
    '</div>'+
  '</div>';
}

/** Dipakai tombol "Finish & Isi" di kartu WO: stop timer lalu buka form terisi. */
function openSubmitWithTimer(woId) {
  var totalMs = stopLiveTimer(woId);
  openSubmitForm(woId);
  if (totalMs > 0) {
    var now = new Date(), start = new Date(now.getTime()-totalMs);
    dtSet('fStart', formatToDatetimeLocal(start));
    dtSet('fEnd', formatToDatetimeLocal(now));
    fHitungDurasi();
    showTimerSummary(totalMs, start, now);
  }
}

/* ── IndexedDB ── */
function openDb() {
  return new Promise(function(res,rej) {
    var r = indexedDB.open('mar_projek_v1',1);
    r.onupgradeneeded = function(e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox',{keyPath:'op_id'});
    };
    r.onsuccess = function() { db = r.result; res(); };
    r.onerror = function() { rej(r.error); };
  });
}
function idbReq(store,mode,fn) {
  return new Promise(function(res,rej) {
    var tx = db.transaction(store,mode);
    var rq = fn(tx.objectStore(store));
    rq.onsuccess = function() { res(rq.result); };
    rq.onerror = function() { rej(rq.error); };
  });
}
function kvGet(k) { return idbReq('kv','readonly',function(s){return s.get(k);}); }
function kvSet(k,v) { return idbReq('kv','readwrite',function(s){return s.put(v,k);}); }
function obAll() { return idbReq('outbox','readonly',function(s){return s.getAll();}); }
function obPut(item) { return idbReq('outbox','readwrite',function(s){return s.put(item);}); }
function obDel(opId) { return idbReq('outbox','readwrite',function(s){return s.delete(opId);}); }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : 'op-'+Date.now()+'-'+Math.random().toString(36).slice(2,10); }

// Nomor urut antrean dalam satu sesi — pemecah seri saat created_at sama persis
// (klik beruntun bisa jatuh di milidetik yang sama).
var _enqSeq = 0;

/** Indikator "sedang mengirim ke-n dari m" di baris info outbox. */
function showSendProgress(idx, total, op) {
  var el = document.getElementById('outboxInfo');
  if (!el) return;
  var label = op ? (opLabel(op) || '') : '';
  el.textContent = '📤 Mengirim ' + idx + '/' + total + (label ? ' · ' + label : '') + '…';
  el.style.color = '#5E5E5E';
}

/* ── API ── */
function api(action,data,opId) {
  var body = JSON.stringify({token:S.token, action:action, data:data||{}, op_id:opId||undefined});
  return fetch(CONFIG.API_URL, {method:'POST', headers:{'Content-Type':'text/plain'}, body:body})
    .then(function(r){
      return r.text().then(function(txt) {
        try {
          return JSON.parse(txt);
        } catch(e) {
          return { success: false, error: txt ? txt.slice(0, 150) : ('HTTP ' + r.status) };
        }
      });
    });
}

/* ── Install PWA: tombol 1-tap via beforeinstallprompt ── */
var IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
var IS_STANDALONE = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
var _installPrompt = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _installPrompt = e;
  var b = document.getElementById('installBtn'); if (b) b.style.display = '';
});
window.addEventListener('appinstalled', function() {
  _installPrompt = null;
  var b = document.getElementById('installBtn'); if (b) b.style.display = 'none';
  toast('✅ Terinstal! Buka dari ikon MAR di layar utama.');
});
function doInstall() {
  if (IS_IOS) { showModal('iosModal'); return; } // iOS: tak ada prompt otomatis → panduan
  if (!_installPrompt) { toast('Buka menu Chrome ⋮ → "Instal aplikasi" / "Tambahkan ke layar utama"'); return; }
  _installPrompt.prompt();
  _installPrompt.userChoice.then(function(){ _installPrompt = null; });
}

/* ── Notifikasi ── */
function requestNotifPermission() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
}
function notifyLocal(body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(function(reg){ return reg.showNotification('MAR BUPR', {body: body, icon: './icon-192.png', badge: './icon-192.png', tag: 'mar-info'}); }).catch(function(){});
    }
  } catch (e) {}
}
/* Periodic Background Sync (PWA ter-instal): Chrome bangunkan SW berkala →
   flush antrean + cek WO pending → push notif. Interval diatur Chrome (≥ jam-jaman). */
function requestPeriodicSync() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(function(reg) {
        if ('periodicSync' in reg) return reg.periodicSync.register('mar-check', {minInterval: 60 * 60 * 1000});
      }).catch(function(){});
    }
  } catch (e) {}
}

/* ── Web Push: daftarkan "alamat pos" HP ini ke server (idempotent) ── */
function _urlB64ToUint8(b64) {
  var pad = new Array((4 - (b64.length % 4)) % 4 + 1).join('=');
  var base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function subscribePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!S.token) return;
    navigator.serviceWorker.ready.then(function(reg) {
      return reg.pushManager.getSubscription().then(function(sub) {
        if (sub) return sub;
        return api('get_vapid_key').then(function(r) {
          if (!r.success || !r.result || !r.result.key) return null;
          return reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: _urlB64ToUint8(r.result.key)});
        });
      });
    }).then(function(sub) {
      if (!sub) return;
      var j = sub.toJSON();
      // guard: kirim ulang hanya bila endpoint berubah / belum tercatat (server upsert)
      return kvGet('push_saved').then(function(saved) {
        if (saved === j.endpoint) return;
        return api('save_push_sub', {endpoint: j.endpoint, p256dh: (j.keys && j.keys.p256dh) || '', auth: (j.keys && j.keys.auth) || ''})
          .then(function(r2) { if (r2.success) return kvSet('push_saved', j.endpoint); });
      });
    }).catch(function(){});
  } catch (e) {}
}

/* ── Background Sync: minta Chrome kirim antrean nanti walau app ditutup ── */
function requestBgSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(reg){ return reg.sync.register('mar-outbox'); }).catch(function(){});
    }
  } catch (e) {}
}

/* ── Sync ── */
var _syncAgain = false;   // ada permintaan sync yang datang saat sync sedang jalan
// Ada op yang dijawab retry_later (server ramai). Tanpa penjadwalan ulang, op
// itu menganggur di antrean sampai ada pemicu sync lain — bisa berjam-jam.
// Dibatasi supaya tidak berputar tanpa henti saat server benar-benar sibuk.
var _adaRetryLater = false;
var _percobaanRamai = 0;
var MAX_PERCOBAAN_RAMAI = 3;
function syncNow(manual) {
  // JANGAN buang permintaan ini. Dulu (dan masih terjadi di SUM sebelum diperbaiki):
  // approve beruntun → klik ke-2 & ke-3 datang saat sync pertama masih jalan, lalu
  // dibuang begitu saja. Snapshot antrean sudah diambil sebelum keduanya masuk, jadi
  // hanya WO PERTAMA yang terkirim; sisanya menggantung sampai user menekan Refresh
  // manual. Tandai, lalu jalankan ulang otomatis setelah sync ini selesai.
  if (S.syncing) { _syncAgain = true; return Promise.resolve(); }
  if (manual) requestNotifPermission();
  if (!navigator.onLine) { requestBgSync(); if (manual) toast('📴 Offline — data aman di antrean, terkirim otomatis saat ada sinyal'); renderAll(); return Promise.resolve(); }
  S.syncing = true; renderAll();
  return flushOutbox()
    .then(function(sent) {
      if (sent > 0) {
        toast('✅ '+sent+' operasi terkirim — tidak lagi antre');
        if (document.hidden) notifyLocal('✅ '+sent+' operasi terkirim — tidak lagi antre');
      }
      // PERF/R2: mekanik tarik WO-nya; approver TIDAK perlu pull_my_wos (tab
      // WO Saya disembunyikan) — hemat 1 panggilan API per sync.
      // Sync MANUAL selalu menarik referensi (daftar mekanik, unit, katalog job),
      // mengabaikan TTL. Menekan tombol Sync artinya "saya mau data terbaru
      // SEKARANG" — biasanya justru sesudah menambah orang baru di spreadsheet.
      // Sync otomatis tetap patuh TTL supaya tidak boros kuota.
      var perluRefs = manual || refsStale();
      var tasks = [];
      if (S.role === 'mechanic') { tasks.push(pullWos()); if (timHanyaSaya() && perluRefs) tasks.push(pullRefs()); }
      else {
        tasks.push(pullPending()); tasks.push(pullActive()); tasks.push(pullTransfers()); tasks.push(pullMonitoring());
        // Daftar approved ikut disegarkan saat Refresh DITEKAN — kalau tidak,
        // WO yang dibatalkan di tempat lain tetap tampil "approved" dan tak ada
        // cara membetulkannya dari layar. Sync otomatis tidak ikut, supaya
        // panggilan latar tidak bertambah tanpa perlu.
        if (manual && S.approved.length) tasks.push(pullApproved());
        if (manual && (S.rejected||[]).length) tasks.push(pullRejected());
        if (perluRefs) tasks.push(pullRefs());
      }
      return Promise.all(tasks);
    })
    // Data sudah segar → baru di sinilah kegagalan boleh dinilai. Menilai lebih
    // awal berarti menghakimi memakai salinan lama.
    .then(function() { return _rekonsiliasiGagal(); })
    .then(function() { S.lastSync = new Date().toISOString(); subscribePush(); return kvSet('last_sync',S.lastSync); })
    .catch(function(e) { requestBgSync(); toast('⚠️ Sync gagal: '+e.message); })
    .then(function() { S.syncing = false; return refreshOutbox(); })
    .then(function() {
      renderAll();
      if (_syncAgain) { _syncAgain = false; _percobaanRamai = 0; return syncNow(false); }   // kirim sisa antrean
      // Server ramai → coba lagi sebentar. Tanpa ini op-nya menganggur tanpa
      // batas waktu, dan pengguna tak punya cara tahu selain menekan Refresh.
      if (_adaRetryLater) {
        _adaRetryLater = false;
        if (_percobaanRamai < MAX_PERCOBAAN_RAMAI) {
          _percobaanRamai++;
          setTimeout(function(){ syncNow(false); }, 4000 * _percobaanRamai);
        } else {
          _percobaanRamai = 0;
          requestBgSync();   // serahkan ke peramban; ia akan membangunkan SW nanti
          toast('⏳ Server sedang ramai — kiriman tetap di antrean, dicoba lagi otomatis');
        }
      } else { _percobaanRamai = 0; }
    });
}
/* ═══ REKONSILIASI KEGAGALAN ════════════════════════════════════════════════
 * Kartu merah hanya untuk yang BENAR-BENAR masih menunggu tindakan.
 *
 * Sebagian besar "gagal" sebenarnya berarti pekerjaannya SUDAH masuk — server
 * menolak kiriman kembar. Menampilkannya merah membuat orang takut membuang,
 * lalu kartu menumpuk, lalu merah kehilangan artinya dan yang sungguhan ikut
 * terabaikan.
 *
 * ATURAN BESI: hilangkan hanya atas BUKTI POSITIF bahwa pekerjaannya mendarat.
 * "Tidak ketemu di daftar" BUKAN bukti — WO yang tak dikenali tetap ditampilkan.
 * Diam yang keliru jauh lebih mahal daripada merah yang keliru.
 */

/** Cari WO di seluruh salinan lokal. null = tidak bisa dipastikan. */
function _cariWo(woId) {
  var lists = ['wos','pending','active','approved','rejected','transfers'];
  for (var i = 0; i < lists.length; i++) {
    var arr = S[lists[i]] || [];
    for (var j = 0; j < arr.length; j++) {
      var w = arr[j];
      // Antrean transfer memakai `wo_id`, bukan `id` — perlu dicocokkan keduanya.
      if (String(w.id || w.wo_id) !== String(woId)) continue;
      // TAPI entri transfer tidak membawa `status`, dan seluruh penilaian
      // "sudah mendarat / sudah tamat" bersandar pada status. Mengembalikannya
      // berarti menilai memakai keterangan yang tak ada — lebih baik dianggap
      // tidak bisa dipastikan, dan kartunya tetap ditampilkan.
      if (!w.status) continue;
      return w;
    }
  }
  return null;
}

/**
 * Apakah maksud op ini sudah tercapai di server?
 *
 * Daftarnya SENGAJA disebut satu per satu, bukan "pokoknya bukan status lama".
 * Versi pertama saya menulis `s !== 'pending_mechanic_work'` untuk submit_work —
 * dan status 'rejected' pun memenuhi syarat itu, sehingga kiriman pada WO yang
 * DITOLAK ikut dianggap berhasil lalu dihapus diam-diam. Justru kebalikan dari
 * yang dijanjikan: yang tamat harus diberitahu, bukan dibungkam.
 */
function _sudahMendarat(op, wo) {
  var s = String(wo.status || '');
  var lanjutApproval = (s === 'pending_supervisor' || s === 'pending_superintendent' || s === 'approved');
  switch (op.action) {
    case 'submit_work':   return lanjutApproval;
    case 'approve_l1':    return s === 'pending_superintendent' || s === 'approved';
    case 'approve_l2':    return s === 'approved';
    case 'reject':        return s === 'rejected';
    case 'request_transfer':
    case 'approve_transfer':  return !!wo.transfer_status || s === 'pending_transfer';
    default: return false;
  }
}

/**
 * Op yang tak mungkin lagi berhasil karena WO-nya sudah tamat lewat jalan lain
 * (ditolak/dibatalkan). Bukan kegagalan orangnya — cukup diberitahu sekali,
 * jangan ditinggalkan sebagai kartu merah yang tak bisa diapa-apakan.
 *
 * DIPERIKSA LEBIH DULU daripada _sudahMendarat: status tamat lebih spesifik,
 * dan kalau urutannya terbalik ia tak akan pernah terjangkau.
 */
function _sudahTamat(op, wo) {
  var s = String(wo.status || '');
  if (s !== 'rejected' && s !== 'cancelled') return false;
  // 'reject' ikut: menolak WO yang sudah dibatalkan sama saja — tak ada lagi
  // yang bisa dikerjakan, jadi jangan tinggalkan kartu merah abadi.
  return ['approve_l1','approve_l2','submit_work','request_transfer',
          'approve_transfer','reject_transfer','reject'].indexOf(op.action) !== -1;
}

function _rekonsiliasiGagal() {
  return obAll().then(function(items) {
    var gagal = items.filter(function(it) { return it.status === 'failed'; });
    if (!gagal.length) return;

    var hapus = [], kabar = [];
    gagal.forEach(function(op) {
      var wo = _cariWo(op.wo_id);
      if (!wo) return;                       // tak bisa dipastikan → BIARKAN tampil
      // TAMAT diperiksa DULU — status tamat lebih spesifik daripada "sudah maju".
      if (_sudahTamat(op, wo)) {
        hapus.push(op.op_id);
        kabar.push((op.wo_number || 'WO') + ' sudah ' +
                   (String(wo.status) === 'cancelled' ? 'dibatalkan' : 'ditolak') + ' — tindakan Anda tidak diberlakukan');
        return;
      }
      if (_sudahMendarat(op, wo)) { hapus.push(op.op_id); return; }
    });
    if (!hapus.length) return;

    return Promise.all(hapus.map(function(id) { return obDel(id); })).then(function() {
      // Yang mendarat tak perlu diumumkan — bagi pengguna itu memang berhasil.
      // Yang sudah tamat WAJIB diberitahu, sekali, supaya tak ada yang mengira
      // keputusannya berlaku padahal tidak.
      if (kabar.length) toast('ℹ️ ' + kabar[0] + (kabar.length > 1 ? ' (+' + (kabar.length - 1) + ' lagi)' : ''));
      return refreshOutbox();
    });
  }).catch(function(){});
}

/**
 * Selaraskan status WO di salinan lokal begitu operasinya BERHASIL, tanpa
 * menunggu tarikan data berikutnya.
 *
 * Kenapa perlu: badgeFor() sengaja tidak memakai op 'done' supaya badge bisa
 * berkembang L1 → L2 → Approved. Tapi kalau wo.status lokal belum diperbarui,
 * badge sempat mundur ke "Perlu diisi" di sela antara operasi selesai dan
 * data baru tiba. Mekanik membaca itu sebagai gagal, lalu menekan Kirim lagi.
 */
function _perbaruiStatusLokal(op) {
  var baru = null;
  if (op.action === 'submit_work') baru = 'pending_supervisor';
  else if (op.action === 'approve_l1') baru = 'pending_superintendent';
  else if (op.action === 'approve_l2') baru = 'approved';
  else if (op.action === 'reject') baru = 'rejected';
  else if (op.action === 'request_transfer') baru = 'pending_transfer';
  if (!baru || !op.wo_id) return;
  // Server bisa memberi tahu status sebenarnya (mis. kiriman ulang yang sudah
  // lewat tahap) — pakai itu bila ada, jangan tebak.
  if (op.result && op.result.status) baru = String(op.result.status);
  ['wos','pending','active'].forEach(function(k) {
    (S[k] || []).forEach(function(w) { if (String(w.id) === String(op.wo_id)) w.status = baru; });
  });
}

function flushOutbox() {
  var sent = 0;
  _adaRetryLater = false;   // dinilai ulang tiap pengosongan; jangan bawa sisa lama
  return obAll().then(function(items) {
    var queue = items.filter(function(it){return it.status==='queued'||it.status==='failed_retry';});
    // FIFO: getAll IndexedDB terurut op_id (uuid acak) — urutannya praktis acak.
    // Sortir manual supaya operasi dikirim sesuai urutan dibuat; kalau tidak,
    // aksi yang seharusnya mendahului (mis. override sebelum approve WO yang sama)
    // bisa tiba belakangan dan approver menilai angka yang sudah basi.
    queue.sort(function(a,b){
      var ca=String(a.created_at||''), cb=String(b.created_at||'');
      if (ca<cb) return -1; if (ca>cb) return 1;
      return (a.seq||0)-(b.seq||0);
    });
    var _total = queue.length, _idx = 0;
    var chain = Promise.resolve();
    queue.forEach(function(it) {
      chain = chain.then(function() {
        _idx++;
        showSendProgress(_idx, _total, it);   // "📤 Mengirim 2/5 · L1 WO-xxx"
        return api(it.action, it.payload, it.op_id).then(function(r) {
          if (r.success) {
            it.status='done'; it.result=r.result; sent++;
            // Perbarui salinan lokal SEKARANG, jangan menunggu pullWos().
            // Tanpa ini badge berkedip "Dikirim → Perlu diisi → L1": begitu op
            // selesai, badgeFor() jatuh ke wo.status yang MASIH status lama,
            // sampai tarikan data berikutnya tiba. Kedipan itulah yang membuat
            // mekanik mengira kiriman gagal lalu menekan Kirim lagi.
            _perbaruiStatusLokal(it);
            // Kiriman ulang yang ditolak dengan halus oleh server: beri tahu
            // apa adanya, jangan diam — mekanik perlu tahu kerjanya sudah masuk.
            if (it.result && it.result.already_submitted) {
              toast('✅ ' + (it.wo_number || 'WO') + ' memang sudah terkirim sebelumnya');
            }
          }
          // retry_later = server sedang ramai, BUKAN pekerjaan ini salah.
          // Biarkan tetap mengantre; jangan munculkan kartu merah untuk sesuatu
          // yang akan terkirim sendiri sebentar lagi.
          else if (r.retry_later) { it.status='queued'; it.error=''; _adaRetryLater = true; }
          else { it.status='failed'; it.error=(typeof r.error==='string')?r.error:JSON.stringify(r.error); }
          // Perbarui tampilan tiap item selesai — antrean panjang tidak terlihat macet.
          return obPut(it).then(function(){ return refreshOutbox(); }).then(function(){ renderAll(); });
        }).catch(function() { return obPut(it).then(function(){throw new Error('koneksi terputus');}); });
      });
    });
    return chain.then(function(){ return sent; });
  });
}
function pullWos() {
  return api('pull_my_wos').then(function(r) {
    if (!r.success) return;
    S.wos = (r.result && r.result.wos) || [];
    return kvSet('wos', S.wos);
  });
}
function pullRefs() {
  return api('pull_create_refs').then(function(r) {
    if (!r.success) return;
    S.refs = r.result.refs;
    S.refsAt = new Date().toISOString();
    return kvSet('refs', S.refs).then(function(){ return kvSet('refs_at', S.refsAt); });
  });
}
/** MONITORING: ringkasan per mekanik untuk approver (difilter scope di server). */
function pullMonitoring() {
  return api('pull_monitoring').then(function(r) {
    if (!r.success) return;
    S.monitoring = (r.result && r.result.mechanics) || [];
    S.monitoringOverall = (r.result && r.result.overall) || {};
    return kvSet('monitoring', S.monitoring).then(function(){ return kvSet('monitoring_overall', S.monitoringOverall); });
  });
}

/** TRANSFER WO: daftar permintaan menunggu keputusan L1 (sudah difilter scope server). */
function pullTransfers() {
  return api('pull_transfers').then(function(r) {
    if (!r.success) return;
    S.transfers = (r.result && r.result.transfers) || [];
    return kvSet('transfers', S.transfers);
  });
}
function pullPending() {
  return api('pull_pending').then(function(r) {
    if (!r.success) return;
    S.pending = (r.result && r.result.pending) || [];
    return kvSet('pending', S.pending);
  });
}
function pullActive() {
  return api('pull_active').then(function(r) {
    if (!r.success) return;
    S.active = (r.result && r.result.active) || [];
    return kvSet('active', S.active);
  });
}
function pullRejected() {
  return api('pull_rejected').then(function(r) {
    if (!r.success) return;
    S.rejected = r.result.rejected || [];
    return kvSet('rejected', S.rejected);
  });
}
function pullApproved() {
  return api('pull_approved').then(function(r) {
    if (!r.success) return;
    S.approved = (r.result && r.result.approved) || [];
    return kvSet('approved', S.approved);
  });
}
function refreshOutbox() { return obAll().then(function(o){S.outbox=o||[];}); }

/* ── Login ── */
/** Kunci tombol & tampilkan indikator selama token diperiksa ke server. */
function setLoginLoading(on) {
  var b = document.getElementById('btnLogin'), l = document.getElementById('loginLoading');
  if (b) { b.disabled = !!on; b.textContent = on ? 'Memeriksa…' : 'Masuk'; }
  if (l) l.style.display = on ? 'block' : 'none';
}

function doLogin() {
  var t = document.getElementById('tokenInput').value.trim();
  if (!t) { toast('Isi token dulu'); return; }
  requestNotifPermission(); requestPeriodicSync();
  S.token = t;
  setLoginLoading(true);
  if (navigator.onLine) {
    api('ping').then(function(r) {
      if (r.success) {
        S.me = r.result;
        // Role ASLI dari backend (bukan tebakan). Mekanik = hanya WO Saya.
        S.role = (r.result && r.result.role) ? r.result.role : 'mechanic';
        return kvSet('token',t).then(function() { return kvSet('me',S.me); })
          .then(function() { return kvSet('role',S.role); })
          .then(function() {
            // Hanya yang boleh Buat WO (approver, mekanik WO mandiri) yang perlu refs.
            if (bolehBuatWoSaya()) return pullRefs().catch(function(){});
          })
          .then(function() { showScreen('main'); syncNow(false); });
      } else { setLoginLoading(false); toast('❌ '+(r.error||'Token ditolak')); S.token=null; }
    }).catch(function() { setLoginLoading(false); saveTokenOffline(t); });
  } else { setLoginLoading(false); saveTokenOffline(t); }
}
function saveTokenOffline(t) {
  kvSet('token',t).then(function() { toast('📴 Token disimpan — verifikasi saat ada sinyal'); showScreen('main'); renderAll(); });
}
function doLogout() {
  // AUDIT K2: antrean belum terkirim = laporan kerja/approval yang BELUM masuk server.
  // Logout menghapusnya permanen → wajib peringatan eksplisit.
  var pend = S.outbox.filter(function(o){return o.status==='queued'||o.status==='failed_retry';}).length;
  var msg = pend > 0
    ? '⚠️ PERHATIAN: masih ada '+pend+' operasi BELUM TERKIRIM di antrean.\nLogout akan MENGHAPUS antrean itu PERMANEN (laporan/approval hilang).\n\nSaran: batal, cari sinyal, tekan 🔄 Refresh sampai antrean kosong, baru logout.\n\nTetap logout dan hapus antrean?'
    : 'Logout? Data lokal akan dihapus.';
  if (!confirm(msg)) return;
  var tx = db.transaction(['kv','outbox'],'readwrite');
  tx.objectStore('kv').clear();
  tx.objectStore('outbox').clear();
  tx.oncomplete = function() {
    // AUDIT K3: reset HARUS bentuk state lengkap — field hilang = crash setelah re-login
    S = { token:null, me:null, role:null, wos:[], refs:null, refsAt:null, pending:[], active:[], approved:[], transfers:[], monitoring:[], monitoringOverall:{}, outbox:[], lastSync:null, syncing:false, tab:'wos', appSub:'pending', showOutbox:false, crossFunc:false, timerStates:{} };
    showScreen('login');
  };
}

/* ── Tab ── */
function switchTab(tab) {
  if (tab === 'create' && !bolehBuatWoSaya()) return;
  S.tab = tab;
  renderAll();
}

/* ── M1: Submit form ── */
var activeWo = null;
function openSubmitForm(woId) {
  activeWo = null;
  for (var i=0;i<S.wos.length;i++) if (String(S.wos[i].id)===String(woId)) activeWo=S.wos[i];
  if (!activeWo) return;
  document.getElementById('fTitle').textContent = activeWo.wo_number;
  document.getElementById('fDesc').innerHTML = '<b>'+esc(activeWo.component_name||'')+'</b>'+(activeWo.unit_name?' · '+esc(activeWo.unit_name):'')+
    '<br>📍 '+esc(locLabel(activeWo.location))+' · Kondisi: '+esc(wcLabel(activeWo.work_condition))+
    (activeWo.target_hours?' · Target: '+fmtJamMenit(activeWo.target_hours):'');
  document.getElementById('fKet').textContent = activeWo.keterangan ? '📝 '+activeWo.keterangan : '';
  document.getElementById('fKet').style.display = activeWo.keterangan ? 'block' : 'none';
  dtSet('fStart',''); dtSet('fEnd',''); fHitungDurasi();
  document.getElementById('fHm').value=''; document.getElementById('fKm').value='';
  document.getElementById('fPart').value='';
  // Tyreman: sembunyikan pilihan spare part (nilainya sudah dikosongkan di atas)
  // HM, KM, dan Spare Part disembunyikan di SEMUA section (1 Agu 2026)
  var _pw = document.getElementById('partWrap'); if (_pw) _pw.style.display='none';
  var _hkw = document.getElementById('hmKmWrap'); if (_hkw) _hkw.style.display='none';
  var tn = document.getElementById('fTransferNote'); if (tn) tn.value='';
  var tsum = document.getElementById('fTimerSummary');
  if (tsum) { tsum.style.display='none'; tsum.innerHTML=''; }
  updateModalTimerUI();
  showModal('submitModal');
}

/**
 * TRANSFER WO — oper pekerjaan ke shift berikutnya (antre offline).
 * Jam mulai diambil dari picker Jam Mulai yang sama dengan submit; jam berhenti
 * ditetapkan server saat permintaan benar-benar diterima. Jam sesi ini baru
 * dihitung kalau Planner/PIC Lapangan menyetujui — kalau ditolak, hangus.
 */
function queueTransfer() {
  if (!activeWo) return;
  var st = document.getElementById('fStart').value;
  if (!st) { toast('Isi Jam Mulai dulu — dipakai menghitung sesi kerja Anda'); return; }
  if (new Date(st).getTime() > Date.now()) { toast('Jam mulai tidak boleh melewati sekarang'); return; }
  var note = (document.getElementById('fTransferNote') || {value:''}).value;

  var op = { op_id:uuid(), seq:(_enqSeq++), action:'request_transfer', wo_id:activeWo.id, wo_number:activeWo.wo_number,
    payload:{wo_id:activeWo.id, transfer_note:note, session_start_time:new Date(st).toISOString()},
    status:'queued', created_at:new Date().toISOString() };

  obPut(op).then(refreshOutbox).then(function() {
    closeModal('submitModal'); renderAll();
    toast(navigator.onLine?'📮 Mengirim permintaan transfer...':'📮 Tersimpan! Terkirim saat ada sinyal');
    syncNow(false);
  });
}
/**
 * Masukkan laporan kerja ke antrean kirim. SATU jalur untuk form "Isi Manual"
 * DAN tombol "Kirim" langsung — kalau dipisah, keduanya bisa berbeda aturan
 * validasi dan salah satunya lolos mengirim jam yang tak masuk akal.
 */
function _antreSubmit(wo, startISO, endISO, hm, km, part) {
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'submit_work', wo_id:wo.id, wo_number:wo.wo_number,
    payload:{wo_id:wo.id, start_time:startISO, end_time:endISO, hour_meter:hm||'', kilometers:km||'', part_category:part||''},
    status:'queued', created_at:new Date().toISOString() };
  return obPut(op).then(refreshOutbox).then(function() {
    clearTimerAfterSubmit(op.wo_id);   // timer baru dibersihkan setelah masuk antrean
    closeModal('submitModal'); renderAll();
    toast(navigator.onLine?'📮 Mengirim...':'📮 Tersimpan! Terkirim saat ada sinyal');
    syncNow(false);
  });
}

function queueSubmit() {
  var st=document.getElementById('fStart').value, en=document.getElementById('fEnd').value;
  // HM & KM opsional sejak 1 Agu 2026 (input disembunyikan) — kirim apa adanya
  var hm=document.getElementById('fHm').value, km=document.getElementById('fKm').value;
  var part=document.getElementById('fPart').value;
  if (!st||!en) { toast('Jam mulai & selesai wajib'); return; }
  if (new Date(en)<=new Date(st)) { toast('Jam selesai harus setelah mulai'); return; }
  _antreSubmit(activeWo, new Date(st).toISOString(), new Date(en).toISOString(), hm, km, part);
}

/**
 * KIRIM LANGSUNG dari kartu WO — tanpa membuka form.
 *
 * Jamnya diambil dari timer. Karena tidak ada form untuk ditinjau lebih dulu,
 * konfirmasinya WAJIB menyebut durasi yang akan terkirim: sekali masuk antrean,
 * WO berpindah ke meja approver dan mekanik tak bisa lagi mengubahnya sendiri.
 * Timer kosong → arahkan ke Isi Manual, jangan diam-diam mengirim 0 jam.
 */
// WO yang kirimannya sedang diproses — penjaga tekan-dua-kali. obPut() ke
// IndexedDB butuh waktu; sebelum selesai, kartu belum berubah dan tombol masih
// bisa ditekan lagi, menghasilkan operasi kedua yang pasti ditolak server.
var _sedangKirim = {};

function kirimLangsung(woId) {
  if (_sedangKirim[woId]) { toast('⏳ Sedang diproses…'); return; }
  var wo = null;
  for (var i=0;i<S.wos.length;i++) if (String(S.wos[i].id)===String(woId)) wo = S.wos[i];
  if (!wo) return;
  var st = getTimerState(woId);
  var totalMs = (parseFloat(st.elapsed_ms)||0) +
                (st.state==='running' ? (Date.now()-(parseFloat(st.start_epoch)||Date.now())) : 0);
  if (totalMs <= 0) {
    toast('⏱️ Timer masih 00:00:00 — tekan ▶ Start dulu, atau pakai ✍️ Isi Manual');
    return;
  }
  var now = new Date(), start = new Date(now.getTime()-totalMs);
  if (!confirm('Kirim laporan kerja ' + wo.wo_number + '?\n\n' +
               'Durasi: ' + msToJamMenit(totalMs) + '\n' +
               start.toLocaleString('id-ID') + ' → ' + now.toLocaleString('id-ID') + '\n\n' +
               'Setelah terkirim, WO masuk ke meja approver dan tidak bisa Anda ubah lagi.\n' +
               'Perlu mengoreksi jam atau menambah keterangan? Pakai ✍️ Isi Manual.')) return;
  _sedangKirim[woId] = true;
  stopLiveTimer(woId);
  // Kunci dilepas setelah operasi benar-benar masuk antrean — saat itu kartunya
  // sudah berbadge "Dikirim" dan tombolnya tak lagi dirender.
  _antreSubmit(wo, start.toISOString(), now.toISOString(), '', '', '')
    .then(function(){ delete _sedangKirim[woId]; })
    .catch(function(){ delete _sedangKirim[woId]; });
}

/* ── M2: Create WO form ── */
function openCreateForm() {
  if (!bolehBuatWoSaya()) {
    toast('⚠️ Mekanik tidak memiliki akses untuk membuat WO');
    return;
  }
  if (!S.refs) {
    if (navigator.onLine) {
      toast('⏳ Memuat data referensi...');
      pullRefs().then(function(){ if (S.refs) openCreateForm(); else toast('❌ Gagal memuat referensi'); })
        .catch(function(){ toast('❌ Gagal memuat referensi'); });
    } else { toast('📴 Sync dulu saat ada sinyal untuk memuat referensi'); }
    return;
  }
  // Refs basi / tanpa work_conditions → refresh senyap (sembuhkan cache lama)
  if (navigator.onLine && (refsStale() || !(S.refs.work_conditions && S.refs.work_conditions.length))) { pullRefs().catch(function(){}); }
  // reset form
  var secs = S.refs.sections || [];
  var secHtml = '';
  for (var si=0;si<secs.length;si++) {
    secHtml += '<label class="secOpt"><input type="radio" name="cSec" value="'+secs[si]+'"'+(si===0?' checked':'')+'>'+
               '<span class="secCard">'+(LABEL_SECTION[secs[si]] || secs[si])+'</span></label>';
  }
  document.getElementById('cSecPicker').innerHTML = secHtml;
  document.getElementById('cWc').innerHTML = '';
  // Fallback bawaan bila refs basi/kosong → dropdown SELALU terisi (key stabil).
  // Factor uang TETAP dihitung server dari Config_Factors, bukan dari sini.
  var wcs = (S.refs && S.refs.work_conditions && S.refs.work_conditions.length)
    ? S.refs.work_conditions
    : [{key:'normal',label:'Shift 1'},{key:'difficult',label:'Shift 2'},{key:'extreme',label:'Kondisi Ekstrim'}];
  for (var wi=0;wi<wcs.length;wi++) {
    document.getElementById('cWc').innerHTML += '<option value="'+esc(wcs[wi].key||wcs[wi].value||wcs[wi])+'">'+esc(wcs[wi].label||wcs[wi])+'</option>';
  }
  document.getElementById('cKet').value='';
  var _mE=document.getElementById('cMeter'); if(_mE) _mE.value='';
  ['cOthersDesc','cOthersBp','cOthersTh','cOthersUf'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('cTeamList').innerHTML='';
  S.crossFunc=false; var _cf=document.getElementById('cCrossFunc'); if(_cf) _cf.checked=false;
  addTeamMember();
  onCreateSectionChange();
  // WO mandiri: tim terkunci pada dirinya sendiri, jadi tambah & lintas fungsi disembunyikan.
  var _sendiri = timHanyaSaya();
  ['cTeamAdd','cCrossFuncRow'].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display=_sendiri?'none':''; });
  var _th=document.getElementById('cTeamHint'); if(_th) _th.style.display=_sendiri?'block':'none';
  // listeners
  var radios = document.querySelectorAll('input[name="cSec"]');
  for (var ri=0;ri<radios.length;ri++) radios[ri].onchange = onCreateSectionChange;
  // Mode grup selalu dimulai dari "1 WO saja" — keranjang sisa sesi sebelumnya
  // tak boleh terbawa dan diam-diam ikut terkirim.
  var mr = document.querySelector('input[name="cmode"][value=""]');
  if (mr) mr.checked = true;
  onGrupModeChange();
  showModal('createModal');
}
function onCompChange() {
  var isOthers = document.getElementById('cComp').value === 'COM-OTHERS';
  document.getElementById('cOthersWrap').style.display = isOthers ? 'block' : 'none';
  document.getElementById('cTyreUnit').parentNode.style.display = isOthers ? 'none' : 'block';
  updateCreatePreview();
}
/** Poin & target jam saat membuat WO: hanya L2. 1:1 dgn web (BOLEH_LIHAT_POIN). */
function bolehLihatPoin(){ return S.role === 'superintendent'; }
/** Boleh Buat WO: approver, atau mekanik berpenanda WO mandiri (dibaca dari ping server). */
function bolehBuatWoSaya(){ return S.role !== 'mechanic' || !!(S.me && S.me.wo_mandiri); }
/** Mekanik WO mandiri: timnya hanya dirinya sendiri. Server menegakkannya di createWorkOrder. */
function timHanyaSaya(){ return S.role === 'mechanic' && !!(S.me && S.me.wo_mandiri); }

function updateCreatePreview(){
  var box=document.getElementById('cPreview'); if(!box) return;
  if(!bolehLihatPoin()){ box.style.display='none'; return; }
  var sec=getCreateSection();
  var ocEl=document.getElementById('cOthersCheck');
  var isOthers = ocEl && ocEl.checked;
  var bp=null, ph=null, uf=1.0, name='';
  if (isOthers) {
    bp=parseFloat(document.getElementById('cOthersBp').value)||0;
    ph=parseFloat(document.getElementById('cOthersTh').value)||0;
    uf=parseFloat(document.getElementById('cOthersUf').value)||0;
    name=document.getElementById('cOthersDesc').value||'Others';
  } else {
    var js=document.getElementById('cCasJob'); var opt=js.options[js.selectedIndex];
    if(opt&&opt.value){ bp=parseFloat(opt.getAttribute('data-bp'))||0; ph=parseFloat(opt.getAttribute('data-ph'))||0; name=opt.textContent; }
    if(sec==='maintenance'||sec==='vessel'){ var uv=document.getElementById('cUnit').value; var units=(S.refs&&S.refs.units)||[]; for(var u=0;u<units.length;u++){ if(String(units[u].unit_id)===uv){ uf=parseFloat(units[u].unit_factor)||1.0; break; } } }
    else uf=1.0; // workshop placeholder
  }
  if (bp===null && ph===null) { box.style.display='none'; return; }
  var wcSel=document.getElementById('cWc'); var wcOpt=wcSel.options[wcSel.selectedIndex];
  document.getElementById('cPreviewBody').innerHTML =
    '<b>'+esc(name||'-')+'</b><br>Base Points: '+(bp||0)+' · Target: '+(ph||0)+' jam<br>Unit Factor: '+(uf||1)+' 🔒 · Kondisi: '+esc(wcOpt?wcOpt.textContent:'-');
  box.style.display='block';
}
function onPwaOthersToggle() {
  var checked = document.getElementById('cOthersCheck').checked;
  document.getElementById('cOthersWrap').style.display = checked ? 'block' : 'none';
  if (checked) {
    // Job manual: sembunyikan SEMUA picker katalog (tyreman & cascade), pakai deskripsi
    document.getElementById('cTyreGroup').style.display = 'none';
    document.getElementById('cCascadeGroup').style.display = 'none';
  } else {
    onCreateSectionChange(); // kembalikan picker sesuai section
  }
  updateCreatePreview();
}
function onCreateSectionChange() {
  var sec = getCreateSection();
  /* Jalur tyreman lama - satu dropdown datar berisi seluruh komponen - sudah
     pensiun. Rekondisi kini memakai cascade yang sama dengan Maintenance,
     1:1 dengan WorkOrder.html: di sana populateCascadeRoot dipanggil untuk
     maintenance DAN vessel, dan grupBolehUntuk() berbunyi
     'vessel || maintenance'.

     Elemen cTyreGroup sengaja DIBIARKAN di DOM, hanya tidak pernah
     ditampilkan lagi. Membuangnya membuat perubahan ini jauh lebih besar dan
     lebih sulit dibalik kalau ternyata ada yang terlewat. */
  var isTyre = false;
  var isWs = (sec === 'workshop');
  // reset Others state
  document.getElementById('cOthersWrap').style.display = 'none';
  // Others via centang di SEMUA section — TAPI hanya untuk approver. Di WO Others
  // pembuatnya mengetik base_points & target_hours sendiri, dan itu jalur uang.
  // Ini sekadar menyembunyikan; penegakannya di createWorkOrder (server).
  var bolehOthers = (S.role !== 'mechanic');
  var othersCheckRow = document.getElementById('cOthersCheckRow');
  if (othersCheckRow) othersCheckRow.style.display = bolehOthers ? 'block' : 'none';
  var othersCheck = document.getElementById('cOthersCheck');
  if (othersCheck) othersCheck.checked = false;
  document.getElementById('cTyreGroup').style.display = isTyre ? 'block' : 'none';
  document.getElementById('cCascadeGroup').style.display = isTyre ? 'none' : 'block';
  document.getElementById('cUnitGroup').style.display = (isTyre || isWs) ? 'none' : 'block';
  // Kolom acuan bisa sedang DIPINDAH keluar dari cTyreGroup/cCascadeGroup ke
  // slot di bawah Work Condition. Kalau begitu, menyembunyikan induknya tidak
  // lagi menyembunyikan mereka — jadi diatur eksplisit di sini.
  var _tj = document.getElementById('cTyreJobWrap');  if (_tj) _tj.style.display = isTyre ? 'block' : 'none';
  var _tu = document.getElementById('cTyreUnitWrap'); if (_tu) _tu.style.display = isTyre ? 'block' : 'none';
  var _jw = document.getElementById('cJobWrap');      if (_jw) _jw.style.display = isTyre ? 'none' : 'block';
  document.getElementById('cModelGroup').style.display = isWs ? 'block' : 'none';
  if (isTyre) {
    var cSel = document.getElementById('cComp');
    cSel.innerHTML = '<option value="">-- Pilih --</option>';
    var comps = S.refs.components || [];
    for (var ci=0;ci<comps.length;ci++) {
      if (String(comps[ci].component_no) === 'COM-OTHERS') continue; // Others lewat centang, bukan dropdown
      cSel.innerHTML += '<option value="'+esc(comps[ci].component_no)+'">'+esc(comps[ci].component_name)+'</option>';
    }
    populateTyreUnits();
  } else {
    populateCascadeRoot(sec);
  }
  refreshCreateMechanics();
  setelMeterCreate();
  updateCreatePreview();
}

/**
 * Meter mana yang berlaku untuk section yang sedang dipilih.
 *
 * Tyreman memakai KILOMETER; field & workshop tetap jam mesin. Bukan sekadar
 * label: angkanya masuk ke KOLOM yang berbeda di server dan menopang
 * perhitungan yang berbeda pula — umur pakai tyre di satu sisi, WH/MTBF unit
 * di sisi lain. Mencampurnya berarti dua satuan dijumlahkan jadi satu angka.
 */
function meterCreate() {
  if (getCreateSection() === 'vessel') {
    return {jenis:'km', label:'KM', kunci:'kilometers', contoh:'cth: 84200'};
  }
  return {jenis:'hm', label:'HM', kunci:'hour_meter', contoh:'cth: 12450'};
}

/**
 * MEDAN "HM/KM UNIT" DI LAYAR BUAT WO — disembunyikan (keputusan Gabriel,
 * 11 Sep 2026). 1:1 dengan TAMPILKAN_METER_BUAT_WO di Constants.gs; kalau
 * dinyalakan lagi di sana, nyalakan juga di sini.
 *
 * Yang disembunyikan HANYA yang di layar BUAT WO. Isian meter milik MEKANIK
 * saat mengirim pekerjaannya TIDAK tersentuh — itu sumber data Koreksi HM/KM.
 */
var TAMPIL_METER_BUAT_WO = false;

/** Label, contoh isian, dan catatan kaki meter — semuanya dari satu tempat. */
function setelMeterCreate() {
  // DIBUANG DARI DOM, bukan disembunyikan dengan CSS.
  //
  // Bekas luka: `kilometers` pernah terhapus pada SETIAP kiriman karena
  // medannya disembunyikan secara tampilan sementara kodenya tetap membaca
  // lalu menuliskan nilai kosongnya. Medan yang tidak ada tidak bisa salah
  // dibaca — getElementById mengembalikan null, dan semua pembacanya di
  // berkas ini sudah berjaga terhadap null.
  if (!TAMPIL_METER_BUAT_WO) {
    var _w = document.getElementById('cMeterWrap');
    if (_w && _w.parentNode) _w.parentNode.removeChild(_w);
    return;
  }
  var M = meterCreate();
  var n = document.getElementById('cMeterNama');
  if (n) n.textContent = M.label;
  var i = document.getElementById('cMeter');
  if (i) i.setAttribute('placeholder', M.contoh);
  var k = document.getElementById('cMeterKaki');
  if (k) {
    k.textContent = (M.jenis === 'km')
      ? 'Kilometer unit saat pekerjaan ini dimulai.'
      : 'Hour meter unit saat pekerjaan ini dimulai. Dipakai menghitung MTBF unit.';
  }
}

/* Ikon + label section — 1:1 dengan sectionRadiosHtml() di WorkOrder.html.
   Dulu PWA menampilkan kunci mentah ("vessel") dengan ikon yang berbeda pula,
   jadi satu cluster punya dua nama dan dua rupa tergantung layar mana yang
   dibuka. Kalau daftar ini berubah di GAS, ubah di sini juga. */
var LABEL_SECTION = {
  vessel:      '🚛 Rekondisi',
  maintenance: '🚜 Maintenance',
  workshop:    '🏭 Workshop',
  field:       '🚜 Maintenance',
  tyreman:     '🚛 Rekondisi',
  tyre:        '🚛 Rekondisi'
};

/* Nama cluster tenant ini: vessel, maintenance, workshop. Nama lama
   (tyreman/tyre, field) dinormalkan DI SINI supaya cabang di bawah cukup
   mengenal satu set nama - 1:1 dengan WorkOrder.html baris 460-461 dan
   normalisasi di Auth.gs, ConfigService.gs, JobCatalogService.gs.

   Ini satu-satunya pintu nilai section di layar Buat WO. Kalau GAS menambah
   atau mengganti cluster lagi, ubah di sini juga - PWA tidak bisa membaca
   Constants.gs, jadi kesejajarannya dijaga dengan tangan. */
function secBaku(s) {
  s = String(s || '').toLowerCase().replace(/^\s+|\s+$/g, '');
  if (s === 'field') return 'maintenance';
  if (s === 'tyreman' || s === 'tyre') return 'vessel';
  return s;
}

function getCreateSection() {
  var r = document.querySelector('input[name="cSec"]:checked');
  return secBaku(r ? r.value : 'vessel');
}
/**
 * Isi sebuah dropdown unit dengan URUTAN yang masuk akal di lapangan.
 *
 * Config_Units memuat 87 unit — seluruh armada yang pernah tersentuh, termasuk
 * milik rental lain. Menampilkannya sebagai satu daftar panjang membuat pembuat
 * WO harus mengais setiap kali, padahal 90% pekerjaan ada di segelintir unit.
 *
 * Urutan kelompok:
 *   1. Model utama section ini (tyreman → hauler) — pekerjaan hariannya
 *   2. Model lain milik kita
 *   3. Rental / luar (is_on_hand = FALSE)
 * TIDAK ada yang disembunyikan — sesekali kita memang membantu unit luar.
 *
 * @param {HTMLSelectElement} sel
 * @param {Array} units       daftar unit yang sudah lolos saringan lain
 * @param {string} modelUtama model yang didahulukan ('' = tak ada)
 * @param {string} cari       teks pencarian (kosong = semua)
 * @param {boolean} pakaiModelAttr sertakan data-model (dipakai cascade field)
 */
// Pembuat WO menekan "tampilkan semua unit" → unit ber-scope 'global' ikut muncul.
var _tampilSemuaUnit = false;
function toggleSemuaUnit() {
  _tampilSemuaUnit = !_tampilSemuaUnit;
  var b = document.getElementById('cBtnSemuaUnit');
  if (b) b.textContent = _tampilSemuaUnit ? '🔽 Sembunyikan unit global' : '🌐 Tampilkan semua unit';
  onCreateSectionChange();   // isi ulang dropdown section yang sedang aktif
}

function _scopeArr(u) { return (u && u.unit_scope) ? u.unit_scope : []; }

function isiDropdownUnit(sel, units, sectionAktif, cari, pakaiModelAttr) {
  if (!sel) return;
  var q = _nm(cari);
  var utama = [], lain = [], global = [], others = [];

  (units || []).forEach(function(u) {
    if (q) {
      var teks = _nm(u.unit_name) + ' ' + _nm(u.unit_type) + ' ' + _nm(u.unit_model);
      if (teks.indexOf(q) === -1) return;
    }
    var sc = _scopeArr(u);
    if (sc.indexOf('others') !== -1) { others.push(u); return; }
    if (sc.indexOf('global') !== -1) { global.push(u); return; }
    // KOSONG = milik semua section (perilaku lama, sheet yang belum diisi)
    if (!sc.length || sc.indexOf(sectionAktif) !== -1) utama.push(u);
    else lain.push(u);
  });

  function opsi(u) {
    return '<option value="'+esc(u.unit_id)+'"' +
           (pakaiModelAttr ? ' data-model="'+esc(_nm(u.unit_model))+'"' : '') + '>' +
           esc(u.unit_name)+' ('+esc(u.unit_type)+')</option>';
  }
  function grup(judul, arr) {
    if (!arr.length) return '';
    return '<optgroup label="'+esc(judul)+' ('+arr.length+')">' + arr.map(opsi).join('') + '</optgroup>';
  }

  var html = '<option value="">-- Pilih Unit --</option>';
  html += grup('★ Unit ' + (sectionAktif || 'kita'), utama);
  html += grup('Unit section lain', lain);
  // 'global' = bukan pegangan harian kita. Disembunyikan sampai diminta, TAPI
  // tetap bisa dipilih — kita memang sesekali membantu unit rental.
  if (_tampilSemuaUnit) html += grup('🌐 Global — bukan pegangan harian', global);
  // Bukan unit sungguhan: memilihnya mengalihkan form ke WO Others.
  if (others.length) html += grup('📝 Job manual', others);
  sel.innerHTML = html;

  var tampil = utama.length + lain.length + (_tampilSemuaUnit ? global.length : 0) + others.length;
  if (q && tampil === 0) {
    sel.innerHTML = '<option value="">(tidak ada unit cocok "'+esc(cari)+'"' +
      (global.length && !_tampilSemuaUnit ? ' — coba "tampilkan semua unit"' : '') + ')</option>';
  }
  // Beri tahu bahwa masih ada yang tersembunyi; tanpa ini orang mengira unitnya hilang.
  var info = (sel.id === 'cTyreUnit') ? document.getElementById('cInfoUnitTyre')
                                      : document.getElementById('cInfoUnitField');
  if (info) {
    var sisa = _tampilSemuaUnit ? 0 : global.length;
    info.style.display = sisa ? 'block' : 'none';
    info.textContent = sisa ? ('🌐 ' + sisa + ' unit global disembunyikan — tekan "Tampilkan semua unit" bila perlu.') : '';
  }
}

/**
 * Unit ber-scope 'others' bukan unit sungguhan — memilihnya mengalihkan form
 * ke pembuatan WO Others, lalu pilihan unitnya dikosongkan lagi.
 */
function cekUnitOthers(sel) {
  if (!sel || !sel.value) return false;
  var units = (S.refs && S.refs.units) || [];
  for (var i = 0; i < units.length; i++) {
    if (String(units[i].unit_id) !== String(sel.value)) continue;
    if (_scopeArr(units[i]).indexOf('others') === -1) return false;
    sel.value = '';
    var oc = document.getElementById('cOthersCheck');
    if (!oc || oc.disabled) { toast('📝 Job manual (Others) hanya untuk L1/L2'); return true; }
    oc.checked = true;
    onPwaOthersToggle();
    toast('📝 Beralih ke job manual (Others)');
    return true;
  }
  return false;
}

function populateTyreUnits() {
  isiDropdownUnit(document.getElementById('cTyreUnit'), S.refs.units || [], 'vessel', '', false);
}

/** Dipanggil saat unit tyreman dipilih — tangkap unit ber-scope 'others'. */
function onPilihUnitTyre() { cekUnitOthers(document.getElementById('cTyreUnit')); updateCreatePreview(); }
/**
 * Samakan bentuk unit_model sebelum dibandingkan.
 * pull_create_refs mengirim units.unit_model SUDAH huruf kecil + trim, tapi
 * katalog job (getJobCatalog) mengirim unit_model APA ADANYA dari sheet. Kalau
 * sheet menulis 'Hauler' sementara unit 'hauler', tidak ada yang cocok dan
 * dropdown Unit/Component kosong — versi web tidak kena karena menormalkan
 * kedua sisi.
 */
function _nm(v) { return String(v == null ? '' : v).toLowerCase().trim(); }

function populateCascadeRoot(sec) {
  var jobs = (sec==='workshop') ? (S.refs.jobs_workshop||[])
           : (sec==='vessel')   ? (S.refs.jobs_vessel||[])
           :                      (S.refs.jobs_field||[]);
  if (sec === 'maintenance' || sec === 'vessel') {
    var validModels = {};
    for (var j=0;j<jobs.length;j++) validModels[_nm(jobs[j].unit_model)] = true;
    // Hanya unit yang modelnya punya job di katalog — saringan lama, tetap.
    // KECUALI unit ber-scope 'others': itu bukan unit sungguhan dan memang tak
    // punya model, jadi saringan ini membuangnya. Akibatnya jalan pintas ke job
    // manual tak pernah terjangkau dari field — section terbesar kita.
    var layak = (S.refs.units||[]).filter(function(u) {
      if (_scopeArr(u).indexOf('others') !== -1) return true;
      var um = _nm(u.unit_model);
      return um && validModels[um];
    });
    isiDropdownUnit(document.getElementById('cUnit'), layak, sec, '', true);
  } else {
    var models = {}; for (var mj=0;mj<jobs.length;mj++) models[_nm(jobs[mj].unit_model)]=true;
    var mSel = document.getElementById('cModel');
    mSel.innerHTML = '<option value="">-- Pilih Model --</option>';
    for (var mk in models) mSel.innerHTML += '<option value="'+esc(mk)+'">'+esc(mk)+'</option>';
  }
  document.getElementById('cCasComp').innerHTML = '<option value="">-- Component --</option>';
  document.getElementById('cCasSub').innerHTML = '<option value="">-- Sub Component --</option>';
  document.getElementById('cCasJob').innerHTML = '<option value="">-- Job --</option>';
}
function onCasUnitOrModel() {
  // Unit ber-scope 'others' bukan unit sungguhan — tangkap sebelum cascade
  // dibangun, kalau tidak cascade akan mencari model dari unit yang tak punya.
  if (cekUnitOthers(document.getElementById('cUnit'))) return;
  var sec = getCreateSection();
  var jobs = (sec==='workshop') ? (S.refs.jobs_workshop||[])
           : (sec==='vessel')   ? (S.refs.jobs_vessel||[])
           :                      (S.refs.jobs_field||[]);
  var model = '';
  if (sec==='workshop') { model = document.getElementById('cModel').value; }
  else { var opt = document.getElementById('cUnit').options[document.getElementById('cUnit').selectedIndex]; model = opt ? (opt.getAttribute('data-model')||'') : ''; }
  var comps = {};
  model = _nm(model);
  for (var i=0;i<jobs.length;i++) { if (_nm(jobs[i].unit_model)===model) comps[jobs[i].component]=true; }
  var sel = document.getElementById('cCasComp');
  sel.innerHTML = '<option value="">-- Component --</option>';
  for (var c in comps) sel.innerHTML += '<option value="'+esc(c)+'">'+esc(c)+'</option>';
  document.getElementById('cCasSub').innerHTML = '<option value="">-- Sub Component --</option>';
  document.getElementById('cCasJob').innerHTML = '<option value="">-- Job --</option>';
  // Mode 'job': job-nya terkunci, tapi ganti unit baru saja membangun ulang
  // seluruh cascade dan mengosongkan pilihannya. Pulihkan — kalau job itu tak
  // tersedia untuk model unit baru, tolak unitnya, jangan diam-diam kosong.
  if (_grupMode === 'job' && _acuanTerkunci && _grupBaris.length) _pulihkanJobTerkunci();
}

/**
 * Pilih ulang component → sub → job sesuai acuan yang dikunci, setelah cascade
 * dibangun ulang karena unit berganti (mode 'job').
 * Job tak ada untuk model unit itu = unit memang tak cocok → beri tahu jelas.
 */
function _pulihkanJobTerkunci() {
  var selC = document.getElementById('cCasComp');
  var selS = document.getElementById('cCasSub');
  var selJ = document.getElementById('cCasJob');
  if (!selC || !selS || !selJ) return;

  selC.value = _acuanTerkunci.comp || '';
  if (selC.value !== (_acuanTerkunci.comp || '')) return _jobTakCocok();
  onCasComp();
  selS.value = _acuanTerkunci.sub || '';
  if (selS.value !== (_acuanTerkunci.sub || '')) return _jobTakCocok();
  onCasSub();
  selJ.value = _acuanTerkunci.job_id || '';
  if (selJ.value !== (_acuanTerkunci.job_id || '')) return _jobTakCocok();
  _kunciAcuanGrup();   // rebuild menghapus disabled — pasang lagi
  updateCreatePreview();
}
function _jobTakCocok() {
  toast('⚠️ Job yang dikunci tidak tersedia untuk model unit ini — pilih unit lain');
  var u = document.getElementById('cUnit'); if (u) u.value = '';
  _kunciAcuanGrup();
}

function onCasComp() {
  var sec = getCreateSection();
  var jobs = (sec==='workshop') ? (S.refs.jobs_workshop||[])
           : (sec==='vessel')   ? (S.refs.jobs_vessel||[])
           :                      (S.refs.jobs_field||[]);
  var model = sec==='workshop' ? document.getElementById('cModel').value : (document.getElementById('cUnit').options[document.getElementById('cUnit').selectedIndex]||{}).getAttribute('data-model')||'';
  var comp = document.getElementById('cCasComp').value;
  var subs = {};
  model = _nm(model);
  for (var i=0;i<jobs.length;i++) { if (_nm(jobs[i].unit_model)===model && jobs[i].component===comp) subs[jobs[i].sub_component]=true; }
  var sel = document.getElementById('cCasSub');
  sel.innerHTML = '<option value="">-- Sub Component --</option>';
  for (var s in subs) sel.innerHTML += '<option value="'+esc(s)+'">'+esc(s)+'</option>';
  document.getElementById('cCasJob').innerHTML = '<option value="">-- Job --</option>';
}
function onCasSub() {
  var sec = getCreateSection();
  var jobs = (sec==='workshop') ? (S.refs.jobs_workshop||[])
           : (sec==='vessel')   ? (S.refs.jobs_vessel||[])
           :                      (S.refs.jobs_field||[]);
  var model = sec==='workshop' ? document.getElementById('cModel').value : (document.getElementById('cUnit').options[document.getElementById('cUnit').selectedIndex]||{}).getAttribute('data-model')||'';
  var comp = document.getElementById('cCasComp').value;
  var sub = document.getElementById('cCasSub').value;
  var sel = document.getElementById('cCasJob');
  sel.innerHTML = '<option value="">-- Job --</option>';
  for (var i=0;i<jobs.length;i++) {
    var j = jobs[i];
    if (_nm(j.unit_model)===_nm(model) && j.component===comp && j.sub_component===sub) {
      // Angka jam & poin hanya untuk L2 — mekanik dan L1 memilih pekerjaan
      // berdasarkan APA yang dikerjakan, bukan berapa nilainya. data-bp/data-ph
      // tetap dikirim (dipakai saat submit); yang disembunyikan hanya labelnya.
      sel.innerHTML += '<option value="'+esc(j.job_id)+'" data-bp="'+j.base_point+'" data-ph="'+j.plan_hours+'">'+esc(j.job_description)+(bolehLihatPoin()?' ('+j.plan_hours+'jam · '+j.base_point+'pts)':'')+'</option>';
    }
  }
}
function onCrossFuncToggle(){ var cf=document.getElementById('cCrossFunc'); S.crossFunc = !!(cf && cf.checked); refreshCreateMechanics(); }
function refreshCreateMechanics() {
  var sec = getCreateSection();
  var mechs = S.refs ? (S.refs.mechanics||[]) : [];
  var showAll = !!S.crossFunc;
  var rows = document.querySelectorAll('.cTeamSel');
  for (var r=0;r<rows.length;r++) {
    var cur = rows[r].value;
    rows[r].innerHTML = '<option value="">-- Pilih Mekanik --</option>';
    for (var m=0;m<mechs.length;m++) {
      var ms = String(mechs[m].section||'').toLowerCase();
      // Kolom section BOLEH berisi daftar dipisah koma ("tyreman,field"). Dulu
      // dibandingkan sebagai satu string utuh → mekanik ber-section ganda tak
      // pernah cocok dan dropdown kosong. Mekanik TANPA section juga ikut
      // tersaring; sekarang selalu tampil, sama seperti versi web.
      var msList = [];
      if (ms) {
        var parts = ms.split(',');
        for (var pi=0; pi<parts.length; pi++) {
          var v = parts[pi].replace(/^\s+|\s+$/g,'');
          if (v) msList.push(v);
        }
      }
      var cocok = (msList.length === 0) || (msList.indexOf(sec) !== -1);
      // Default: hanya mekanik section terpilih. Lintas fungsi → tampilkan semua (dgn tag section).
      if (timHanyaSaya() && String(mechs[m].mechanic_id) !== String(S.me.mechanic_id)) continue;
      if (!showAll && !timHanyaSaya() && sec && !cocok) continue;
      var tag = (!cocok && ms) ? ' ['+ms+']' : '';
      rows[r].innerHTML += '<option value="'+esc(mechs[m].mechanic_id)+'">'+esc(mechs[m].mechanic_name)+esc(tag)+'</option>';
    }
    rows[r].value = (timHanyaSaya() && !cur) ? String(S.me.mechanic_id) : cur;
  }
}
function addTeamMember() {
  // WO mandiri: satu baris saja, berisi dirinya sendiri, tanpa tombol hapus.
  if (timHanyaSaya() && document.querySelectorAll('.cTeamSel').length) return;
  var div = document.createElement('div'); div.className = 'teamRow';
  div.innerHTML = '<select class="cTeamSel inp"></select><button type="button" class="mini gray" onclick="this.parentNode.remove()">✕</button>';
  if (timHanyaSaya()) div.querySelector('button').style.display = 'none';
  document.getElementById('cTeamList').appendChild(div);
  refreshCreateMechanics();
}
// ═══ WO GROUP di PWA ════════════════════════════════════════════════════════
// Satu borongan = beberapa baris; TIAP BARIS tetap satu WO utuh di server, jadi
// timer, transfer, dan approval-nya bekerja per baris tanpa perubahan apa pun.
// Dikirim SATU operasi per baris dengan wo_group_id yang sama: kalau sinyal
// putus di tengah, baris yang sudah sampai tetap sah dan sisanya tetap mengantre.
var _grupMode = '';      // '' | 'unit' | 'job'
var _grupBaris = [];     // [{payload, label}]
var _acuanTerkunci = null;  // {unit_id, job_id, comp, sub} dari baris pertama

// Posisi asal tiap kolom yang dipindah, supaya bisa dikembalikan persis.
var _acuanDipindah = [];

/** Kembalikan kolom acuan ke tempat asalnya di dalam form. */
function _kembalikanAcuanKeAsal() {
  for (var i = _acuanDipindah.length - 1; i >= 0; i--) {
    var o = _acuanDipindah[i];
    try { o.parent.insertBefore(o.el, o.next); } catch (e) {}
  }
  _acuanDipindah = [];
}

/**
 * Pindahkan kolom ACUAN ke tepat di bawah Work Condition.
 * Yang dipilih SEKALI harus terbaca lebih dulu; yang berulang di bawahnya.
 * Elemen dipindah utuh beserta labelnya, dan display-nya tetap diatur
 * onCreateSectionChange seperti biasa.
 */
function _pindahAcuanKeAtas() {
  _kembalikanAcuanKeAsal();
  var slot = document.getElementById('cAnchorSlot');
  if (!slot) return;
  var ids = (_grupMode === 'unit') ? ['cUnitGroup', 'cTyreUnitWrap']
          : (_grupMode === 'job')  ? ['cJobWrap', 'cTyreJobWrap']
          : [];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    _acuanDipindah.push({el: el, parent: el.parentNode, next: el.nextSibling});
    slot.appendChild(el);
  });
}

function onGrupModeChange() {
  var r = document.querySelector('input[name="cmode"]:checked');
  _grupMode = r ? r.value : '';
  _grupBaris = [];
  _acuanTerkunci = null;
  _pindahAcuanKeAtas();
  var hint = document.getElementById('cModeHint');
  if (_grupMode === 'unit') {
    hint.style.display = 'block';
    hint.innerHTML = 'Unit &amp; kondisi dikunci; <b>job boleh ditambah berkali-kali</b>. Job yang sama ditolak.';
  } else if (_grupMode === 'job') {
    hint.style.display = 'block';
    hint.innerHTML = 'Job &amp; kondisi dikunci; <b>unit boleh ditambah berkali-kali</b>. Unit yang sama ditolak.';
  } else { hint.style.display = 'none'; hint.innerHTML = ''; }
  renderGrupBaris();
}

/** Kunci pembanding kembar, mengikuti mode. */
function _kunciBaris(p) {
  return (_grupMode === 'unit')
    ? String(p.job_id || p.component_id || '')
    : String(p.unit_id || '');
}

function tambahBarisGrup() {
  var d = _bacaBarisCreate();
  if (d.err) { toast(d.err); return; }
  var kunci = _kunciBaris(d.payload);
  if (!kunci) { toast(_grupMode === 'unit' ? 'Pilih job dulu' : 'Pilih unit dulu'); return; }
  for (var i = 0; i < _grupBaris.length; i++) {
    if (_kunciBaris(_grupBaris[i].payload) === kunci) {
      toast(_grupMode === 'unit' ? '⚠️ Job ini sudah ada di daftar' : '⚠️ Unit ini sudah ada di daftar');
      return;
    }
  }
  // Rekam acuan dari baris PERTAMA — dipakai memulihkan cascade job saat unit
  // berganti di mode 'job' (ganti unit membangun ulang daftar job).
  if (!_grupBaris.length) {
    _acuanTerkunci = {
      unit_id: d.payload.unit_id || '',
      job_id: d.payload.job_id || '',
      comp: document.getElementById('cCasComp') ? document.getElementById('cCasComp').value : '',
      sub:  document.getElementById('cCasSub') ? document.getElementById('cCasSub').value : ''
    };
  }
  // Jumlah mekanik DIREKAM per baris, bukan dibaca ulang dari form saat render:
  // tim boleh berbeda antar baris (regu satu job bisa tak sama dengan job lain),
  // jadi angka yang benar adalah yang tersimpan bersama barisnya.
  _grupBaris.push({payload: d.payload, label: d.label, orang: (d.payload.team || []).length});
  renderGrupBaris();
  // Kosongkan HANYA yang berulang; yang dikunci (unit/job) sengaja dipertahankan
  // supaya mekanik tak perlu memilihnya ulang tiap baris.
  if (_grupMode === 'unit') { var j = document.getElementById('cCasJob'); if (j) j.value = ''; }
  else { ['cUnit','cTyreUnit'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; }); }
  updateCreatePreview();
  toast('✅ Ditambahkan — total ' + _grupBaris.length + ' baris');
}

function hapusBarisGrup(i) { _grupBaris.splice(i, 1); renderGrupBaris(); }

/**
 * Kunci kolom ACUAN begitu baris pertama masuk daftar.
 *
 * Tanpa ini nilainya cuma "dipertahankan", bukan dikunci — mekanik masih bisa
 * mengganti unit di tengah jalan dan grup berakhir dengan unit campur, padahal
 * yang dijanjikan "satu unit, banyak job". Terbukti terjadi 4 Agu 2026.
 *
 * Yang dikunci:
 *   selalu      → section & work condition (dipakai bersama seluruh grup)
 *   mode 'unit' → pemilih unit
 *   mode 'job'  → cascade component/sub/job (atau joblist tyreman)
 *
 * Terbuka lagi saat daftar KOSONG. Jadi kalau baru satu baris dan ternyata
 * salah pilih, cukup silang baris nomor 1 — persis alur yang diminta.
 */
// SEMUA kolom yang pernah bisa terkunci. Dipakai untuk MEMBUKA seluruhnya lebih
// dulu — kalau hanya kolom mode saat ini yang dibuka, kolom mode SEBELUMNYA
// tetap terkunci selamanya. Itu bug nyata: kunci mode 'unit' tak pernah lepas
// setelah pindah ke mode 'job'.
var ID_BISA_TERKUNCI = ['cUnit', 'cTyreUnit', 'cCasComp', 'cCasSub', 'cCasJob', 'cComp', 'cWc', 'cModel'];

function _kunciAcuanGrup() {
  var kunci = (_grupMode === 'unit' || _grupMode === 'job') && _grupBaris.length > 0;

  // 1) Buka SEMUA dulu — tanpa ini sisa kunci dari mode sebelumnya menempel.
  ID_BISA_TERKUNCI.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.disabled = false;
    el.classList.remove('terkunci');
    el.style.opacity = ''; el.style.cursor = '';
  });
  var rsAll = document.querySelectorAll('input[name="cSec"]');
  for (var a = 0; a < rsAll.length; a++) rsAll[a].disabled = false;
  // Tandai KOTAKnya, bukan cuma select di dalamnya — di layar terang, bingkai
  // merah selebar kotak jauh lebih cepat terbaca daripada garis tipis.
  ['cSecBox','cWcBox','cUnitGroup','cTyreUnitWrap','cJobWrap','cTyreJobWrap'].forEach(function(id){
    var b = document.getElementById(id); if (b) b.classList.remove('terkunciBox');
  });
  var ocAll = document.getElementById('cOthersCheck');
  if (ocAll) ocAll.disabled = false;

  if (!kunci) { _notaKunci(false); return; }

  // 2) Kunci yang perlu saja
  var idAcuan = (_grupMode === 'unit')
    ? ['cUnit', 'cTyreUnit']                       // unit yang dikunci
    : ['cCasComp', 'cCasSub', 'cCasJob', 'cComp']; // job yang dikunci
  var idBersama = ['cWc', 'cModel'];               // dipakai seluruh grup

  idAcuan.concat(idBersama).forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.disabled = true;
    el.classList.add('terkunci');
  });
  var rs = document.querySelectorAll('input[name="cSec"]');
  for (var i = 0; i < rs.length; i++) rs[i].disabled = true;
  var kotakKunci = ['cSecBox', 'cWcBox'].concat(
    (_grupMode === 'unit') ? ['cUnitGroup', 'cTyreUnitWrap'] : ['cJobWrap', 'cTyreJobWrap']);
  kotakKunci.forEach(function(id){
    var b = document.getElementById(id); if (b) b.classList.add('terkunciBox');
  });
  var oc = document.getElementById('cOthersCheck');
  if (oc) oc.disabled = true;
  _notaKunci(true);
}

function _notaKunci(kunci) {

  var nota = document.getElementById('cLockNote');
  if (nota) {
    nota.style.display = kunci ? 'block' : 'none';
    nota.innerHTML = kunci
      ? '🔒 ' + (_grupMode === 'unit' ? 'Unit' : 'Job') + ', section &amp; kondisi terkunci untuk grup ini. ' +
        'Mau ganti? Silang dulu semua baris di daftar.'
      : '';
  }
}

function renderGrupBaris() {
  var box = document.getElementById('cGrupBox');
  var pakaiGrup = (_grupMode === 'unit' || _grupMode === 'job');
  box.style.display = pakaiGrup ? 'block' : 'none';
  document.getElementById('cBtnSatu').style.display = pakaiGrup ? 'none' : 'block';
  document.getElementById('cBtnSelesai').style.display = pakaiGrup ? 'none' : 'block';
  document.getElementById('cBtnGrup').style.display = pakaiGrup ? 'block' : 'none';
  document.getElementById('cGrupCount').textContent = _grupBaris.length;
  document.getElementById('cGrupCount2').textContent = _grupBaris.length;
  var html = _grupBaris.length ? '' : '<div class="sub" style="margin:0">Belum ada baris. Pilih lalu tekan “Tambahkan ke daftar”.</div>';
  var totalOrang = 0, samaSemua = true, acuan = null;
  _grupBaris.forEach(function(b, i) {
    var orang = (typeof b.orang === 'number') ? b.orang
              : ((b.payload && b.payload.team) ? b.payload.team.length : 0);
    totalOrang += orang;
    if (acuan === null) acuan = orang; else if (acuan !== orang) samaSemua = false;
    html += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px">' +
      '<span style="flex:1;min-width:0;font-size:13px;color:var(--text)">' + (i+1) + '. ' + esc(b.label) +
        '<span class="sub" style="display:block;margin:1px 0 0">👷 ' + orang + ' mekanik</span></span>' +
      '<button type="button" class="mini gray" onclick="hapusBarisGrup(' + i + ')">✕</button></div>';
  });
  // Ringkasan tenaga kerja seluruh borongan — dijumlah dari tiap baris, BUKAN
  // dari pilihan form saat ini, karena tim boleh berbeda antar baris.
  var rk = document.getElementById('cGrupRingkas');
  if (rk) {
    rk.style.display = _grupBaris.length ? 'block' : 'none';
    rk.innerHTML = _grupBaris.length
      ? ('👷 Manpower: ' + (samaSemua ? ('<b>' + acuan + ' mekanik</b> di tiap baris')
                                      : '<b>berbeda-beda</b> antar baris') +
         ' · total <b>' + totalOrang + ' penugasan</b>')
      : '';
  }
  document.getElementById('cGrupList').innerHTML = html;
  _kunciAcuanGrup();
}

/**
 * Antre seluruh baris grup. Satu operasi per baris, wo_group_id sama.
 * Kegagalan dilaporkan PER BARIS lengkap dengan job/unit-nya — mekanik harus
 * tahu mana yang gagal supaya bisa membuat ulang sisanya, bukan sekadar
 * "1 baris gagal".
 */
function simpanGrup() {
  if (!bolehBuatWoSaya()) {
    toast('⚠️ Mekanik tidak memiliki akses untuk membuat WO');
    return;
  }
  if (!_grupBaris.length) { toast('Belum ada baris di daftar'); return; }
  var gid = 'GRP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  var tugas = _grupBaris.map(function(b) {
    b.payload.wo_group_id = gid;
    b.payload.wo_group_mode = _grupMode;
    return obPut({ op_id:uuid(), seq:(_enqSeq++), action:'create_wo', payload:b.payload,
      status:'queued', created_at:new Date().toISOString(),
      // label ikut menyebut isinya → kalau gagal, daftar outbox langsung
      // menunjukkan job/unit MANA yang perlu dibuat ulang.
      label:'Buat WO · ' + b.label });
  });
  var n = _grupBaris.length;
  Promise.all(tugas).then(refreshOutbox).then(function() {
    _grupBaris = []; _acuanTerkunci = null; renderGrupBaris();
    closeModal('createModal'); renderAll();
    toast(navigator.onLine ? ('📮 Mengirim ' + n + ' baris...') : ('📮 ' + n + ' baris tersimpan — terkirim saat ada sinyal'));
    syncNow(false);
  });
}

/**
 * Baca satu baris dari form create. SATU pembaca untuk WO tunggal DAN baris
 * grup — kalau dipisah, keduanya bisa berbeda aturan validasi.
 * @return {{payload:Object|null, label:string, err:string}}
 */
function _bacaBarisCreate() {
  var sec = getCreateSection();
  var wc = document.getElementById('cWc').value;
  if (!wc) return {payload:null, label:'', err:'Pilih work condition'};
  var payload = { section:sec, work_condition:wc, keterangan:document.getElementById('cKet').value.trim(), location: sec==='workshop'?'workshop':'field' };
  var label = '';
  var _oc = document.getElementById('cOthersCheck');
  var pwaOthers = !!(_oc && _oc.checked); // Others via centang, seragam semua section
  if (pwaOthers) {
    var odesc = document.getElementById('cOthersDesc').value.trim();
    var obp = parseFloat(document.getElementById('cOthersBp').value);
    var oth = parseFloat(document.getElementById('cOthersTh').value);
    var ouf = parseFloat(document.getElementById('cOthersUf').value);
    if (!odesc) return {payload:null, label:'', err:'Deskripsi job Others wajib diisi'};
    if (isNaN(obp) || obp <= 0) return {payload:null, label:'', err:'Base points Others wajib > 0'};
    if (isNaN(oth) || oth <= 0) return {payload:null, label:'', err:'Target hours Others wajib > 0'};
    if (isNaN(ouf) || ouf <= 0) return {payload:null, label:'', err:'Unit factor Others wajib > 0'};
    payload.component_id = 'COM-OTHERS';
    payload.others_description = odesc;
    payload.others_base_points = obp;
    payload.others_target_hours = oth;
    payload.others_unit_factor = ouf;
    label = 'Others — ' + odesc;
  } else {
    var jobSel = document.getElementById('cCasJob');
    if (!jobSel.value) return {payload:null, label:'', err:'Pilih job dari katalog'};
    payload.job_id = jobSel.value;
    label = _teksOpsi(jobSel);
    if (sec === 'maintenance' || sec === 'vessel') {
      var fUnitSel = document.getElementById('cUnit');
      if (!fUnitSel.value) return {payload:null, label:'', err:'Pilih unit'};
      payload.unit_id = fUnitSel.value;
      label += ' @ ' + _teksOpsi(fUnitSel);
    } else { label += ' @ Workshop'; }
  }
  // team
  var sels = document.querySelectorAll('.cTeamSel');
  var team=[],seen={};
  for (var i=0;i<sels.length;i++) {
    var mid = sels[i].value;
    if (!mid) continue;
    if (seen[mid]) return {payload:null, label:'', err:'Mekanik duplikat'};
    seen[mid]=true; team.push({mechanic_id:mid});
  }
  if (!team.length) return {payload:null, label:'', err:'Tambah minimal 1 mekanik'};
  payload.team = team;

  // Meter unit. Kolom tujuannya mengikuti section — tyreman ke kilometers,
  // sisanya ke hour_meter. Satu kotak isian di layar, dua kolom di server.
  // Kosong dibiarkan kosong: server menolak angka yang mundur, tapi tidak
  // menuntut angka ada. Mekanik yang tak sempat melihat panelnya tetap bisa
  // membuat WO — start & finish yang tak boleh hilang, bukan ini.
  var mEl = document.getElementById('cMeter');
  var mVal = mEl ? String(mEl.value || '').trim() : '';
  if (mVal !== '') payload[meterCreate().kunci] = mVal;

  return {payload: payload, label: label, err: ''};
}

/** Teks opsi terpilih sebuah <select>, dipotong agar label baris tetap ringkas. */
function _teksOpsi(sel) {
  if (!sel || sel.selectedIndex < 0) return '';
  var t = String(sel.options[sel.selectedIndex].textContent || '').trim();
  return t.length > 46 ? t.slice(0, 45) + '…' : t;
}

function queueCreate(keepOpen) {
  if (!bolehBuatWoSaya()) {
    toast('⚠️ Mekanik tidak memiliki akses untuk membuat WO');
    return;
  }
  var d = _bacaBarisCreate();
  if (d.err) { toast(d.err); return; }
  var payload = d.payload;
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'create_wo', payload:payload, status:'queued', created_at:new Date().toISOString(), label:'Buat WO · '+d.label };
  obPut(op).then(refreshOutbox).then(function() {
    renderAll();
    if (keepOpen) {
      resetCreateFieldsForNext();
      toast('📮 WO diantre — isi WO berikutnya (section & kondisi dipertahankan)');
    } else {
      closeModal('createModal');
      toast(navigator.onLine?'📮 Mengirim...':'📮 Tersimpan! Terkirim saat ada sinyal');
    }
    syncNow(false);
  });
}
function resetCreateFieldsForNext(){
  document.getElementById('cKet').value='';
  var _mE=document.getElementById('cMeter'); if(_mE) _mE.value='';
  ['cOthersDesc','cOthersBp','cOthersTh','cOthersUf'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  var oc=document.getElementById('cOthersCheck'); if(oc) oc.checked=false;
  document.getElementById('cTeamList').innerHTML='';
  addTeamMember();
  onCreateSectionChange(); // reset picker utk section aktif (section & kondisi dipertahankan)
}

/* ── M3: Approval ── */
var activeApproval = null;
var cancelWoId = null;
function openCancelForm(woId, woNumber){
  cancelWoId = woId;
  document.getElementById('cxDesc').textContent = woNumber || woId;
  document.getElementById('cxReason').value = '';
  showModal('cancelModal');
}
function queueCancel(){
  var reason = document.getElementById('cxReason').value.trim();
  if (!reason) { toast('Isi alasan pembatalan'); return; }
  var woNum = document.getElementById('cxDesc').textContent;
  // Konfirmasi ULANG — membatalkan WO tak bisa dibalik lewat aplikasi, dan
  // untuk WO yang sudah approved poinnya ikut dinolkan. Mengisi alasan saja
  // bukan tanda persetujuan; orang mengetik lalu menekan tombol berikutnya
  // tanpa membaca. Sebut nomor WO-nya supaya tak salah kartu.
  if (!confirm('Batalkan ' + woNum + '?\n\nAlasan: ' + reason +
               '\n\nWO yang dibatalkan TIDAK bisa dikembalikan lewat aplikasi.\n' +
               'Bila WO ini sudah disetujui, poinnya ikut dinolkan.\n\nLanjutkan?')) return;
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'cancel_wo', wo_id:cancelWoId, wo_number:woNum,
    payload:{ wo_id:cancelWoId, reason:reason }, status:'queued', created_at:new Date().toISOString(), label:'Batal '+woNum };
  obPut(op).then(refreshOutbox).then(function(){
    closeModal('cancelModal'); closeModal('approveModal'); renderAll();
    toast(navigator.onLine?'📮 Mengirim...':'📮 Tersimpan!');
    syncNow(false);
  });
}
function openApproveForm(woId) {
  activeApproval = null;
  for (var i=0;i<S.pending.length;i++) if (String(S.pending[i].id)===String(woId)) activeApproval=S.pending[i];
  if (!activeApproval) return;
  var a = activeApproval;
  document.getElementById('aTitle').textContent = a.wo_number;
  var atl = a.timeliness;
  // Label–nilai sejajar, tanpa ikon per baris. Dulu hanya unit & lokasi yang
  // berikon sehingga dua baris itu menjorok sendiri dan sisanya terlihat tak
  // sejajar. Yang utama isinya terbaca sekali lihat, bukan hiasannya.
  document.getElementById('aDesc').innerHTML =
    ketBar(a, a.status === 'pending_superintendent')+ awBar(a) +
    '<div style="margin-top:9px"><b>'+esc(a.component_name||'-')+'</b></div>'+
    '<div class="woInfo">'+
      (a.unit_name ? '<span class="k">Unit</span><span class="v">'+esc(a.unit_name)+'</span>' : '')+
      // Tanggal DIBUAT berikut jamnya. Approver perlu tahu WO ini sudah berapa
      // lama menunggu, dan dua WO di hari yang sama tapi beda shift akan tampak
      // identik kalau jamnya dibuang. Teksnya sudah diformat SERVER
      // (fmtTanggalJam) — sama persis dengan yang muncul di layar web, supaya
      // yang membandingkan HP dengan laptop tidak mengira datanya berbeda.
      (a.created_at_str ? '<span class="k">Dibuat</span><span class="v">'+esc(a.created_at_str)+'</span>' : '')+
      (a.submitted_at_str ? '<span class="k">Dikirim</span><span class="v">'+esc(a.submitted_at_str)+'</span>' : '')+
      '<span class="k">Lokasi</span><span class="v">'+esc(locLabel(a.location))+'</span>'+
      '<span class="k">Kondisi</span><span class="v">'+esc(wcLabel(a.work_condition))+'</span>'+
      '<span class="k">Waktu kerja</span><span class="v"><b>'+fmtJamMenit(a.actual_hours)+'</b> dari target '+fmtJamMenit(a.target_hours)+
        // Status tepat-waktu sudah jadi satu iris di bilah keterangan di atas;
        // di sini cukup faktor pengalinya, supaya tak terbaca dua kali.
        (atl ? ' <span class="sub" style="display:inline;margin:0">(faktor ×'+atl.factor+')</span>' : '')+'</span>'+
      '<span class="k">Base points</span><span class="v">'+(a.base_points||0)+' pts</span>'+
      '<span class="k">Unit factor</span><span class="v">'+(a.unit_factor||1)+' <span class="sub" style="display:inline;margin:0">(tetap)</span></span>'+
      ((a.created_by_name || a.created_by) ? '<span class="k">Pembuat</span><span class="v">'+esc(a.created_by_name || a.created_by)+'</span>' : '')+
      '<span class="k">Tim</span><span class="v">'+(a.team||[]).map(function(t){return esc(t.name);}).join(', ')+'</span>'+
      (a.keterangan ? '<span class="k">Keterangan</span><span class="v">'+esc(a.keterangan)+'</span>' : '')+
    '</div>';
  // Tim & status sudah masuk daftar di atas — elemen lama dikosongkan supaya
  // tidak tampil dua kali.
  document.getElementById('aTeam').textContent = '';
  document.getElementById('aStatus').textContent = '';
  var isL2 = (a.status === 'pending_superintendent');
  document.getElementById('aBtnL1').style.display = isL2 ? 'none' : 'block';
  document.getElementById('aBtnL2').style.display = isL2 ? 'block' : 'none';
  document.getElementById('aSafety').checked = false;
  document.getElementById('aMtbf').value = 'first_time';
  // ── Override (1:1 dgn modal "Edit Override" web) ──
  document.getElementById('aOvBp').value = '';
  var _th = parseFloat(a.target_hours) || 0;
  document.getElementById('aOvTgtJam').value = _th ? Math.floor(_th) : '';
  document.getElementById('aOvTgtMenit').value = _th ? Math.round((_th - Math.floor(_th)) * 60) : '';
  dtSet('aOvStart', toDtLocal(a.start_time));
  dtSet('aOvEnd', toDtLocal(a.end_time));
  // Nilai SISTEM ditulis terang di tiap kotak override — tanpa itu approver
  // tak tahu angka apa yang sedang dia timpa, dan itu jalur uang.
  var _actNow = document.getElementById('aOvActualNow');
  if (_actNow) _actNow.textContent = a.actual_hours ? fmtJamMenit(a.actual_hours) : '-';
  var _bpSis = document.getElementById('aOvBpSis');
  if (_bpSis) _bpSis.textContent = (a.base_points || 0) + ' poin';
  var _tgSis = document.getElementById('aOvTgtSis');
  if (_tgSis) _tgSis.textContent = a.target_hours ? fmtJamMenit(a.target_hours) : '-';
  // Dropdown pindah unit — SELURUH unit, tanpa saringan section/model/global
  // (keputusan Gabriel). Approver sedang mengoreksi, jadi tak boleh dibatasi
  // oleh aturan yang berlaku saat WO dibuat.
  var _uSel = document.getElementById('aOvUnit');
  if (_uSel) {
    var _units = (S.refs && S.refs.units) || [];
    var _now = String(a.unit_id || '');
    var _h = '<option value="">— tidak diubah —</option>';
    _units.forEach(function(u) {
      // Unit ber-scope 'others' BUKAN unit — ia cuma jalan pintas ke job manual
      // di form pembuatan. Menyetelnya lewat override berarti menulis unit_id
      // palsu ke jalur uang (unit_id → unit_factor → poin). Tidak disaring oleh
      // aturan section/model — memang tidak boleh ada di daftar ini sama sekali.
      if (_scopeArr(u).indexOf('others') !== -1) return;
      _h += '<option value="'+esc(u.unit_id)+'"'+(String(u.unit_id)===_now?' selected':'')+'>'+
            esc(u.unit_name)+' ('+esc(u.unit_type)+')</option>';
    });
    _uSel.innerHTML = _h;
    if (!_units.length) _uSel.innerHTML = '<option value="">(tekan 🔄 Refresh untuk memuat daftar unit)</option>';
    var _wSel = document.getElementById('aOvWc');
    if (_wSel) {
      // Kosong = 'tidak diubah'. Nilai saat ini ditampilkan terpisah, BUKAN
      // dipilih otomatis — memilihnya otomatis membuat tiap simpan override
      // mengirim work_condition walau approver tak menyentuhnya sama sekali.
      _wSel.value = '';
      var _wSis = document.getElementById('aOvWcSis');
      if (_wSis) _wSis.textContent = wcLabel(a.work_condition);
    }
    var _uSis = document.getElementById('aOvUnitSis');
    if (_uSis) _uSis.textContent = a.unit_name || _now || '-';
  }
  // WO yang pernah ditransfer: picker hanya mengoreksi sesi TERAKHIR — jam sesi
  // sebelumnya (partial_hours) tetap ditambahkan server-side, jangan bikin kaget.
  var _ph = parseFloat(a.partial_hours) || 0;
  var _phHint = document.getElementById('aOvPartialHint');
  if (_ph > 0) {
    _phHint.style.display = 'block';
    _phHint.innerHTML = '⚠️ WO ini pernah <b>ditransfer</b>. Picker hanya mengoreksi sesi <b>terakhir</b>; ' +
      fmtJamMenit(_ph) + ' dari sesi sebelumnya tetap ditambahkan otomatis.';
  } else { _phHint.style.display = 'none'; _phHint.innerHTML = ''; }
  aOvHitungDurasi();
  // Judgment BERJENJANG: tulisan L1 diwarisi L2; L2 boleh ubah atau kosongkan.
  var _jd = a.judgment || '';
  document.getElementById('aOvJudgment').value = _jd;
  var _jdSrc = document.getElementById('aOvJdSource');
  if (_jd && isL2 && !(a.judgment_superintendent || '')) {
    _jdSrc.style.display = 'block';
    _jdSrc.innerHTML = '↩️ Catatan ini ditulis <b>L1</b>. Boleh diubah, atau <b>kosongkan</b> untuk menghapus.';
  } else { _jdSrc.style.display = 'none'; _jdSrc.innerHTML = ''; }
  var _ovB = document.getElementById('ovBody'); if (_ovB) _ovB.style.display = 'none';
  var _ovA = document.getElementById('ovArrow'); if (_ovA) _ovA.textContent = '▸';
  renderOverrideLog(a);
  // TIM EFEKTIF, bukan tim asli. Kalau L1 sudah mengubah susunan tim, editor
  // L2 harus membukanya dengan susunan HASIL L1 — bukan susunan sebelum L1
  // menyentuhnya. Dulu memakai a.team, dan akibatnya: ringkasan di kartu
  // menyebut "Tim Mekanik berubah" (ia dibaca dari kolom override) sementara
  // editornya menampilkan tim lama. L2 menyimpan, dan pekerjaan L1 terhapus
  // tanpa seorang pun berniat menghapusnya.
  aOvRenderTeam(a.effective_team || a.team || []);
  document.getElementById('aReason').value='';
  document.getElementById('aRejectSection').style.display='none';
  // Setelah SEMUA isian di-prefill — kalau dijalankan lebih awal, panel terbaca
  // "berubah" hanya karena sebagian field belum sempat diisi.
  perbaruiPenjagaOverride();
  showModal('approveModal');
}
function toggleRejectSection() {
  var el = document.getElementById('aRejectSection');
  el.style.display = el.style.display==='none' ? 'block' : 'none';
}

// ═══ OVERRIDE L1/L2 (2 Agu 2026) ════════════════════════════════════════════
// Wajib ada di PWA: approver juga bekerja di kondisi sinyal sulit. Antrean
// override memakai seq yang sama dengan approve → outbox FIFO menjamin override
// tersimpan DULU, approve lalu membaca nilai efektif yang baru.

/** Buka/tutup panel Override (default tertutup supaya layar approval rapi). */
function toggleOverride() {
  var b = document.getElementById('ovBody'), a = document.getElementById('ovArrow');
  if (!b) return;
  var open = b.style.display !== 'none';
  b.style.display = open ? 'none' : 'block';
  if (a) a.textContent = open ? '▸' : '▾';
}

/** ISO → "YYYY-MM-DDTHH:MM" waktu lokal (dipakai dtSet). */
function toDtLocal(v) {
  if (!v) return '';
  var d = new Date(v);
  if (isNaN(d.getTime())) return '';
  function p(n){ return (n<10?'0':'')+n; }
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
}

/** Hitung & tampilkan durasi dari picker override waktu kerja. */
function aOvHitungDurasi() {
  var s = document.getElementById('aOvStart').value, e = document.getElementById('aOvEnd').value;
  var box = document.getElementById('aOvDurBox'), txt = document.getElementById('aOvDurText');
  if (!txt) return;
  function warna(bg, br, fg){ box.style.background=bg; box.style.borderColor=br; box.style.color=fg; }
  if (!s || !e) { txt.textContent = '-'; warna('#FFFBEB','#FDE68A','#92400E'); return; }
  var ms = new Date(e).getTime() - new Date(s).getTime();
  if (isNaN(ms) || ms <= 0) {
    txt.textContent = '⚠️ Waktu selesai harus setelah waktu mulai';
    warna('#FEF2F2','#FCA5A5','#991B1B');
    return;
  }
  txt.textContent = msToJamMenit(ms) + ' (' + (Math.round((ms/3600000)*100)/100) + ' jam)';
  warna('#FFFBEB','#FDE68A','#92400E');
}

// Editor tim override: prefilled tim saat ini; bisa tambah/kurang mekanik.
function _aOvRow(selId, selName) {
  var div = document.createElement('div'); div.className = 'teamRow';
  var mechs = (S.refs && S.refs.mechanics) || [];
  var found = false;
  var opts = '<option value="">-- Pilih Mekanik --</option>';
  for (var m=0;m<mechs.length;m++) {
    var sel = (String(mechs[m].mechanic_id)===String(selId)) ? ' selected' : '';
    if (sel) found = true;
    opts += '<option value="'+esc(mechs[m].mechanic_id)+'"'+sel+'>'+esc(mechs[m].mechanic_name)+'</option>';
  }
  // fallback: anggota tim yg tak ada di daftar refs tetap terjaga (jangan hilang senyap)
  if (selId && !found) opts = '<option value="'+esc(selId)+'" selected>'+esc(selName||selId)+'</option>' + opts;
  div.innerHTML = '<select class="aOvSel inp" onchange="perbaruiPenjagaOverride()">'+opts+'</select>' +
                  '<button type="button" class="mini gray" onclick="this.parentNode.remove();perbaruiPenjagaOverride()">✕</button>';
  return div;
}
function aOvRenderTeam(team) {
  var box = document.getElementById('aOvTeam'); if (!box) return;
  box.innerHTML='';
  (team||[]).forEach(function(t){ box.appendChild(_aOvRow(t.mechanic_id, t.name)); });
}
function aOvAddMember() {
  document.getElementById('aOvTeam').appendChild(_aOvRow('', ''));
  perbaruiPenjagaOverride();
}

/** Riwayat override (siapa mengubah apa) di modal approval. */
function renderOverrideLog(wo) {
  var box = document.getElementById('aOvLog');
  if (!box) return;
  var list = (wo && wo.override_summary) || [];
  if (!list.length) { box.style.display='none'; box.innerHTML=''; return; }
  var html = '<div class="ovLogTitle">✏️ Riwayat Override</div>';
  for (var i=0;i<list.length;i++) {
    var ov = list[i];
    html += '<div class="ovLogItem"><span class="ovTag '+(ov.level==='spv'?'l1':'l2')+'">'+(ov.level==='spv'?'L1':'L2')+'</span>' +
      '<span class="ovLogWho">'+esc(ov.by_name||ov.by||'-')+'</span>' +
      (ov.at?'<span class="ovLogTime">'+esc(fmtDateTime(ov.at))+'</span>':'') + '<ul class="ovLogList">';
    for (var c=0;c<(ov.changes||[]).length;c++) {
      var ch = ov.changes[c];
      html += '<li><b>'+esc(ch.label)+'</b>: ' + (ch.from?'<span style="text-decoration:line-through;color:#9CA3AF">'+esc(ch.from)+'</span> → ':'') +
              '<span style="color:#B45309;font-weight:700">'+esc(ch.to)+'</span></li>';
    }
    html += '</ul>';
    if (ov.judgment) html += '<div class="ovJd">🗒️ '+esc(ov.judgment)+'</div>';
    html += '</div>';
  }
  box.innerHTML = html;
  box.style.display = 'block';
}

/**
 * Bandingkan isi panel override dengan nilai WO saat ini.
 *
 * SATU sumber kebenaran untuk DUA hal: tombol "Simpan Override" dan penjagaan
 * tombol Approve. Kalau perhitungannya dipisah, keduanya bisa berbeda pendapat —
 * Approve terkunci karena menganggap ada perubahan, sementara Simpan menjawab
 * "tidak ada perubahan". Approver terjebak tanpa jalan keluar.
 *
 * @return {{payload:Object|null, ubah:boolean, salah:string}}
 *   salah = pesan validasi (isi panel belum sah); ubah = beda dari nilai WO.
 */
function _bacaPerubahanOverride() {
  var kosong = {payload:null, ubah:false, salah:''};
  if (!activeApproval) return kosong;
  var elBp = document.getElementById('aOvBp');
  if (!elBp) return kosong;

  var bp = elBp.value.trim();
  var ovS = document.getElementById('aOvStart').value;
  var ovE = document.getElementById('aOvEnd').value;
  if ((ovS && !ovE) || (!ovS && ovE)) return {payload:null, ubah:true, salah:'Isi waktu Mulai DAN Selesai'};
  if (ovS && ovE && new Date(ovE).getTime() <= new Date(ovS).getTime()) return {payload:null, ubah:true, salah:'Waktu selesai harus setelah mulai'};

  var timeChanged = false;
  if (ovS && ovE) {
    timeChanged = (ovS !== toDtLocal(activeApproval.start_time)) || (ovE !== toDtLocal(activeApproval.end_time));
  }
  var tJam = parseInt(document.getElementById('aOvTgtJam').value, 10) || 0;
  var tMnt = parseInt(document.getElementById('aOvTgtMenit').value, 10) || 0;
  if (tMnt > 59) return {payload:null, ubah:true, salah:'Menit target maksimal 59'};
  var tgtBaru = Math.round((tJam + tMnt/60) * 100) / 100;
  var tgtLama = Math.round((parseFloat(activeApproval.target_hours) || 0) * 100) / 100;
  var tgtChanged = (tgtBaru > 0 && tgtBaru !== tgtLama);

  var sels = document.querySelectorAll('.aOvSel');
  var team=[], seen={};
  for (var i=0;i<sels.length;i++) {
    var mid = sels[i].value;
    if (!mid) continue;
    if (seen[mid]) return {payload:null, ubah:true, salah:'Mekanik duplikat di tim override'};
    seen[mid]=true; team.push({mechanic_id:mid, percentage:100}); // full-point
  }
  // Dibandingkan terhadap tim EFEKTIF, sejalan dengan yang ditampilkan editor.
  // Kalau pembandingnya tim asli, L2 yang membuka lalu menutup tanpa mengubah
  // apa pun akan terbaca "berubah" — dan override L1 ikut tertulis ulang atas
  // nama L2.
  var _timAcuan = activeApproval.effective_team || activeApproval.team || [];
  var origIds = _timAcuan.map(function(t){return String(t.mechanic_id);}).sort().join(',');
  var newIds = team.map(function(t){return String(t.mechanic_id);}).sort().join(',');
  var teamChanged = (newIds !== origIds);
  if (teamChanged && team.length===0) return {payload:null, ubah:true, salah:'Tim override minimal 1 mekanik'};

  // judgment: dibanding nilai EFEKTIF supaya pengosongan warisan L1 oleh L2
  // terkirim sebagai penghapusan, bukan dianggap "tidak berubah"
  var jdBaru = document.getElementById('aOvJudgment').value.trim();
  var jdLama = String(activeApproval.judgment || '').trim();
  var jdChanged = (jdBaru !== jdLama);

  // Pindah unit — dropdown kosong berarti "tidak diubah", bukan "kosongkan".
  var uSel = document.getElementById('aOvUnit');
  var uBaru = uSel ? String(uSel.value || '') : '';
  var uLama = String(activeApproval.unit_id || '');
  var unitChanged = (uBaru !== '' && uBaru !== uLama);

  // Kondisi kerja — jalur uang (faktor kondisi). Kosong = tidak diubah.
  var wSel = document.getElementById('aOvWc');
  var wBaru = wSel ? String(wSel.value || '') : '';
  var wLama = String(activeApproval.work_condition || '');
  var wcChanged = (wBaru !== '' && wBaru !== wLama);

  var bpChanged = (bp !== '');
  if (!bpChanged && !timeChanged && !teamChanged && !tgtChanged && !jdChanged &&
      !unitChanged && !wcChanged) return kosong;

  var payload = { wo_id:activeApproval.id };
  if (bpChanged) payload.base_points = parseFloat(bp);
  if (tgtChanged) payload.target_hours = tgtBaru;
  if (timeChanged) {
    payload.start_time = new Date(ovS).toISOString();
    payload.end_time = new Date(ovE).toISOString();
  }
  if (teamChanged) payload.team = team;
  if (jdChanged) payload.judgment = jdBaru;
  if (unitChanged) payload.unit_id = uBaru;
  if (wcChanged) payload.work_condition = wBaru;
  return {payload: payload, ubah: true, salah: ''};
}

/**
 * PENJAGAAN: selama masih ada perubahan override yang BELUM disimpan, tombol
 * Approve dimatikan. Terlalu sering terjadi approver mengetik override/judgment
 * lalu langsung menekan Approve — WO lolos dengan angka lama dan perubahannya
 * hilang tanpa jejak. Ini jalur uang, jadi tak boleh dibiarkan senyap.
 *
 * Reject sengaja TIDAK dikunci: menolak WO membuat override tak relevan, dan
 * mengunci Reject hanya akan menjebak approver.
 */
function perbaruiPenjagaOverride() {
  var d = _bacaPerubahanOverride();
  var perluSimpan = d.ubah;
  _sedangPutus = false;   // modal dinilai ulang → keputusan baru boleh dibuat
  var b1 = document.getElementById('aBtnL1'), b2 = document.getElementById('aBtnL2');
  var wr = document.getElementById('aOvWarn');
  [b1, b2].forEach(function(b) {
    if (!b) return;
    b.disabled = perluSimpan;
    b.style.opacity = perluSimpan ? '.45' : '';
    b.style.cursor = perluSimpan ? 'not-allowed' : '';
  });
  if (wr) {
    if (perluSimpan) {
      wr.style.display = 'block';
      wr.innerHTML = d.salah
        ? '⚠️ ' + esc(d.salah)
        : '⚠️ Ada perubahan override yang <b>belum disimpan</b>. Tekan <b>💾 Simpan Override</b> dulu, baru Approve.';
      // buka panelnya — tombol yang dicari harus terlihat, bukan tersembunyi di balik lipatan
      var body = document.getElementById('ovBody');
      if (body && body.style.display === 'none') {
        body.style.display = 'block';
        var ar = document.getElementById('ovArrow'); if (ar) ar.textContent = '▾';
      }
    } else {
      wr.style.display = 'none';
      wr.innerHTML = '';
    }
  }
}

function queueOverride() {
  var d = _bacaPerubahanOverride();
  if (d.salah) { toast(d.salah); return; }
  if (!d.ubah) { toast('Tidak ada perubahan override'); return; }
  var payload = d.payload;
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'save_override', wo_id:activeApproval.id, wo_number:activeApproval.wo_number,
    payload:payload, status:'queued', created_at:new Date().toISOString(), label:'Override '+activeApproval.wo_number };
  obPut(op).then(refreshOutbox).then(function() {
    // Selaraskan salinan lokal dgn yang BARU SAJA diantre. Tanpa ini panel tetap
    // dianggap "belum disimpan" (isian ≠ nilai WO lama) dan Approve terkunci
    // selamanya walau override sudah masuk antrean.
    if (payload.base_points !== undefined) activeApproval.base_points = payload.base_points;
    if (payload.target_hours !== undefined) activeApproval.target_hours = payload.target_hours;
    if (payload.start_time) { activeApproval.start_time = payload.start_time; activeApproval.end_time = payload.end_time; }
    if (payload.judgment !== undefined) activeApproval.judgment = payload.judgment;
    if (payload.work_condition) activeApproval.work_condition = payload.work_condition;
    if (payload.unit_id) {
      activeApproval.unit_id = payload.unit_id;
      var _uu = ((S.refs && S.refs.units) || []).filter(function(u){ return String(u.unit_id) === String(payload.unit_id); })[0];
      if (_uu) activeApproval.unit_name = _uu.unit_name + ' (' + _uu.unit_type + ')';
    }
    if (payload.team) {
      var mechs = (S.refs && S.refs.mechanics) || [];
      var _timBaru = payload.team.map(function(t) {
        var nm = t.mechanic_id;
        for (var m=0;m<mechs.length;m++) if (String(mechs[m].mechanic_id)===String(t.mechanic_id)) { nm = mechs[m].mechanic_name; break; }
        return {mechanic_id: t.mechanic_id, name: nm};
      });
      // effective_team IKUT diperbarui, bukan cuma team. Editor membaca
      // effective_team; kalau hanya team yang disegarkan, membuka kembali
      // panel override tanpa menarik ulang data akan memperlihatkan susunan
      // SEBELUM simpan barusan — dan menyimpan lagi akan mengembalikannya.
      activeApproval.team = _timBaru;
      activeApproval.effective_team = _timBaru;
      activeApproval.effective_team_source = 'superintendent';
      document.getElementById('aTeam').textContent = 'Tim: '+_timBaru.map(function(t){return t.name;}).join(', ');
    }
    document.getElementById('aOvBp').value = '';   // sudah masuk base_points di atas
    perbaruiPenjagaOverride();
    renderAll();
    toast(navigator.onLine?'📮 Override dikirim — lanjut Approve':'📮 Override tersimpan (terkirim sebelum approve)');
    syncNow(false);
  });
}
/**
 * Lepaskan WO dari antrean approver SEKARANG, tanpa menunggu server.
 *
 * Kenapa: approver menekan Approve, modal tertutup, tapi kartunya masih
 * terpampang sampai tarikan data berikutnya. Selama beberapa detik itu ia
 * tampak seolah belum tersetujui — di situlah orang menekan lagi, lalu
 * bertanya-tanya kenapa muncul peringatan.
 *
 * AMAN: ini hanya salinan di layar. Kebenaran tetap milik server — pullPending()
 * berikutnya akan MENGEMBALIKAN kartunya kalau ternyata memang masih menunggu
 * tindakan. Jadi menghilangkan terlalu cepat tidak bisa membuat pekerjaan luput.
 */
function _lepasDariAntrean(woId) {
  if (!woId) return;
  // Entri antrean transfer memakai `wo_id`, BUKAN `id` — tak ada medan `id`
  // sama sekali di sana. Mencocokkan `w.id` saja membuat penghapusan diam-diam
  // gagal untuk transfer: kartunya tetap terpampang setelah diputuskan.
  var buang = function(arr) {
    return (arr || []).filter(function(w) {
      return String(w.id || w.wo_id) !== String(woId);
    });
  };
  S.pending   = buang(S.pending);
  S.transfers = buang(S.transfers);
  kvSet('pending', S.pending).catch(function(){});
  kvSet('transfers', S.transfers).catch(function(){});
}

/**
 * Kunci tombol keputusan saat satu keputusan sedang dibuat.
 *
 * Mekanik sudah punya penjaga serupa (_sedangKirim); approver belum. Tanpa ini
 * satu ketukan ganda melahirkan DUA operasi ber-op_id berbeda: server aman
 * (idempoten + kunci hulu), tapi antrean menampilkan "2 sedang dikirim" untuk
 * satu keputusan — persis kebingungan yang sedang kita hilangkan.
 *
 * Dibuka kembali saat modal approval dibuka untuk WO berikutnya, lewat
 * perbaruiPenjagaOverride().
 */
var _sedangPutus = false;
function _kunciTombolPutus() {
  _sedangPutus = true;
  ['aBtnL1','aBtnL2'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) { b.disabled = true; b.style.opacity = '.45'; b.style.cursor = 'not-allowed'; }
  });
}

function queueApprove(level) {
  if (_sedangPutus) { toast('⏳ Keputusan sedang diproses…'); return; }
  // Tombol yang ditekan harus cocok dengan tahap WO ini. Penyaring daftar
  // (tahapSaya) sudah menutup jalurnya, tapi ini jalur uang dan status lokal
  // bisa hanyut sesaat sesudah keputusan sebelumnya terkirim — tanpa penjaga
  // ini yang dikirim adalah aksi tahap yang salah, dan jawabannya kartu merah.
  var _perlu = (level === 1) ? 'pending_supervisor' : 'pending_superintendent';
  if (String(activeApproval.status) !== _perlu) {
    closeModal('approveModal'); renderAll();
    toast('WO ini sudah bukan di tahap itu — menarik data terbaru');
    syncNow(false); return;
  }
  // Lapis kedua penjagaan. Tombolnya sudah di-disable, tapi ini jalur uang —
  // satu klik yang lolos berarti WO disetujui dengan angka lama dan override
  // yang sudah diketik hilang tanpa jejak.
  var _g = _bacaPerubahanOverride();
  if (_g.ubah) { perbaruiPenjagaOverride(); toast(_g.salah || '⚠️ Simpan Override dulu sebelum Approve'); return; }
  _kunciTombolPutus();
  var action = level===1 ? 'approve_l1' : 'approve_l2';
  var op = { op_id:uuid(), seq:(_enqSeq++), action:action, wo_id:activeApproval.id, wo_number:activeApproval.wo_number,
    // notes tidak lagi diketik approver (kotak Catatan dihapus). Server yang
    // mengisinya dari judgment efektif, supaya AuditLogs tetap punya konteks
    // tanpa approver mengetik hal yang sama dua kali.
    payload:{ wo_id:activeApproval.id, safety_incident:document.getElementById('aSafety').checked, mtbf_status:document.getElementById('aMtbf').value },
    status:'queued', created_at:new Date().toISOString(), label:(level===1?'L1':'L2')+' '+activeApproval.wo_number };
  var _no = activeApproval.wo_number;
  obPut(op).then(refreshOutbox).then(function() {
    _lepasDariAntrean(op.wo_id);
    closeModal('approveModal'); renderAll();
    // Sebut APA yang barusan dia putuskan, bukan apa yang sedang dikerjakan
    // aplikasi. "Mengirim..." memaksa approver menunggui prosesnya; yang dia
    // butuhkan cuma kepastian bahwa keputusannya sudah tercatat.
    toast(navigator.onLine ? ('✅ ' + _no + ' disetujui')
                           : ('✅ ' + _no + ' disetujui — terkirim saat ada sinyal'));
    syncNow(false);
  });
}
function queueReject() {
  if (_sedangPutus) { toast('⏳ Keputusan sedang diproses…'); return; }
  var reason = document.getElementById('aReason').value.trim();
  if (!reason) { toast('Isi alasan reject'); return; }
  // Sama alasannya dengan queueApprove: `stage` di bawah dibaca dari status
  // lokal, jadi status yang hanyut mengirim penolakan ke tahap yang salah.
  var _tahapKini = tahapSaya();
  if (_tahapKini && String(activeApproval.status) !== _tahapKini) {
    closeModal('approveModal'); renderAll();
    toast('WO ini sudah bukan di tahap itu — menarik data terbaru');
    syncNow(false); return;
  }
  _kunciTombolPutus();
  var stage = activeApproval.status==='pending_superintendent' ? 'superintendent' : 'supervisor';
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'reject', wo_id:activeApproval.id, wo_number:activeApproval.wo_number,
    payload:{ wo_id:activeApproval.id, stage:stage, reason:reason },
    status:'queued', created_at:new Date().toISOString(), label:'Reject '+activeApproval.wo_number };
  var _noR = activeApproval.wo_number;
  obPut(op).then(refreshOutbox).then(function() {
    _lepasDariAntrean(op.wo_id);
    closeModal('approveModal'); renderAll();
    toast(navigator.onLine ? ('❌ ' + _noR + ' ditolak')
                           : ('❌ ' + _noR + ' ditolak — terkirim saat ada sinyal'));
    syncNow(false);
  });
}

/* ── Outbox management ── */
function retryOp(opId) {
  obAll().then(function(items) {
    for (var i=0;i<items.length;i++) { if (items[i].op_id===opId) { items[i].status='failed_retry'; return obPut(items[i]); } }
  }).then(function() { syncNow(true); });
}
/**
 * Terjemahkan kesalahan server jadi kalimat yang bisa ditindaklanjuti.
 * Teks aslinya ditulis untuk pengembang ("WO must be in pending_supervisor
 * status") — bagi orang di lapangan itu cuma menakutkan tanpa memberi arah.
 */
function _pesanGagal(op) {
  var e = String(op.error || '');
  if (/must be in pending_supervisor/i.test(e))      return 'WO ini belum sampai di tahap L1. Tekan 🔄 Refresh, lalu lihat lagi.';
  if (/must be in pending_superintendent/i.test(e))  return 'WO ini belum sampai di tahap L2. Tekan 🔄 Refresh, lalu lihat lagi.';
  if (/not found/i.test(e))                          return 'WO ini sudah tidak ada di sistem. Buang saja kiriman ini.';
  if (/scope|permission|Permission/i.test(e))        return 'WO ini di luar cluster Anda — approver lain yang menanganinya. Buang saja.';
  if (/sibuk|busy|Lock/i.test(e))                    return 'Sistem sedang sibuk saat itu. Tekan "Coba lagi".';
  if (/koneksi|network|timeout/i.test(e))            return 'Sambungan terputus saat mengirim. Tekan "Coba lagi".';
  return e ? ('Belum terkirim: ' + e) : 'Belum terkirim.';
}

function discardOp(opId) {
  var op = null;
  for (var i = 0; i < (S.outbox || []).length; i++) if (S.outbox[i].op_id === opId) op = S.outbox[i];
  var no = (op && op.wo_number) ? op.wo_number : 'WO';
  // Sebut akibatnya. Selama ini pertanyaannya cuma "Buang kiriman ini?" — dan
  // orang tidak tahu apakah WO-nya ikut hilang, jadi mereka memilih tidak
  // menyentuh apa pun dan kartunya menumpuk.
  var pesan = 'Buang kiriman ini?\n\n' +
    '• ' + no + ' TIDAK akan terhapus dari sistem.\n' +
    '• Yang dibuang hanya percobaan kirim yang gagal.\n' +
    '• Kalau pekerjaannya memang belum masuk, Anda perlu mengisinya lagi.';
  if (!confirm(pesan)) return;
  obDel(opId).then(refreshOutbox).then(renderAll);
}

/* ── Modal ── */
function showModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) {
  document.getElementById(id).style.display='none';
  // Pembaruan versi yang ditahan karena modal terbuka → jalankan sekarang.
  if (_swPendingReload && !adaModalTerbuka()) _lakukanReloadSW();
}
/** Ada modal yang sedang terbuka? Dipakai agar reload tak menghapus isian setengah jalan. */
function adaModalTerbuka() {
  var ms = document.querySelectorAll('.modal');
  for (var i = 0; i < ms.length; i++) if (ms[i].style.display === 'flex') return true;
  return false;
}

/* ── Render ── */
function showScreen(nm) {
  // Versi ditampilkan di layar login — supaya saat ada keluhan, versi yang
  // dipakai bisa langsung dibaca tanpa harus masuk dulu.
  var lv = document.getElementById('loginVersion');
  if (lv) {
    lv.textContent = APP_VERSION;
    // Ketuk label versi = buka layar Cek Versi. Mekanik yang belum login pun
    // bisa memperbarui sendiri tanpa dipandu hapus cache lewat telepon.
    lv.style.cursor = 'pointer';
    lv.title = 'Ketuk untuk cek versi';
    lv.onclick = bukaCekVersi;
  }
  if (nm !== 'login') setLoginLoading(false);
  // 'flex' (bukan 'block') — layar login memakai flexbox agar isinya benar-benar
  // di tengah dan tetap bisa di-scroll saat keyboard HP terbuka.
  document.getElementById('screen-login').style.display = nm==='login'?'flex':'none';
  document.getElementById('screen-main').style.display = nm==='main'?'block':'none';
}
function esc(s) { return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function toast(msg) {
  var t=document.getElementById('toast'); t.textContent=msg; t.style.display='block';
  clearTimeout(t._h); t._h=setTimeout(function(){t.style.display='none';},3500);
}
function toggleOutboxDetail(){ S.showOutbox = !S.showOutbox; renderAll(); }
function opLabel(o){
  var names = {submit_work:'Submit', create_wo:'Buat WO', approve_l1:'L1', approve_l2:'L2', reject:'Reject',
               cancel_wo:'Batal WO', request_transfer:'Transfer WO', save_override:'Override',
               approve_transfer:'Setujui Transfer', reject_transfer:'Tolak Transfer'};
  var base = o.label || names[o.action] || o.action;
  if (o.wo_number && String(base).indexOf(o.wo_number)===-1) base += ' '+o.wo_number;
  return base;
}
function fmtDateTime(iso){
  if(!iso) return '-';
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function badgeFor(wo,pendingOp) {
  if (pendingOp) {
    if (pendingOp.status==='queued') return ['📮 Dikirim','#b45309'];
    // "Ditolak" berarti APPROVER MENOLAK WO ini — pernyataan yang keliru untuk
    // kiriman yang sekadar tidak sampai, dan itulah yang selama ini membuat
    // orang panik lalu takut menyentuh apa pun.
    if (pendingOp.status==='failed') return ['⚠️ Belum terkirim','#b45309'];
    // 'done' TIDAK menimpa: pakai status asli WO agar berubah (Terkirim→L1→L2→Approved) setelah sync
  }
  var s=String(wo.status||'');
  if (s==='pending_mechanic_work') return ['📝 Perlu diisi','#5E5E5E'];
  if (s==='pending_supervisor') return ['⏳ L1','#7c3aed'];
  if (s==='pending_superintendent') return ['⏳ L2','#7c3aed'];
  if (s==='approved') return ['✅ Approved','#15803d'];
  return [s||'-','#475569'];
}
function renderAll() {
  var on=navigator.onLine;
  document.getElementById('netDot').style.background=on?'#22c55e':'#ef4444';
  document.getElementById('netText').textContent=on?'Online':'Offline';
  document.getElementById('syncBtn').innerHTML = S.syncing ? '<span class="spin"></span>Refresh…' : '🔄 Refresh';
  document.getElementById('lastSync').textContent=(S.lastSync?'Sync: '+new Date(S.lastSync).toLocaleString('id-ID'):'Belum sync')+' · '+APP_VERSION;
  document.getElementById('meName').textContent=S.me?(S.me.name||S.me.mechanic_id):'';
  // tabs
  var isApprover = S.role!=='mechanic';
  var bolehBuat = bolehBuatWoSaya();
  // L1/L2 (approver): sembunyikan tab "WO Saya" — hanya Buat WO + Approval + Monitoring
  if (isApprover && S.tab==='wos') S.tab='approval';
  // Mekanik: hanya WO Saya, ditambah Buat WO kalau ia mekanik WO mandiri
  if (!isApprover && (S.tab==='approval' || S.tab==='monitor' || (S.tab==='create' && !bolehBuat))) S.tab='wos';
  document.getElementById('tabBar').style.display = (isApprover || bolehBuat) ? 'flex' : 'none';
  document.getElementById('tabWos').style.display = isApprover ? 'none' : '';
  document.getElementById('tabWos').className = 'tab'+(S.tab==='wos'?' active':'');
  document.getElementById('tabCreate').style.display = bolehBuat ? '' : 'none';
  document.getElementById('tabCreate').className = 'tab'+(S.tab==='create'?' active':'');
  document.getElementById('tabApproval').style.display = isApprover ? '' : 'none';
  document.getElementById('tabApproval').className = 'tab'+(S.tab==='approval'?' active':'');
  document.getElementById('tabMonitor').style.display = isApprover ? '' : 'none';
  document.getElementById('tabMonitor').className = 'tab'+(S.tab==='monitor'?' active':'');
  // outbox info — bisa diklik utk lihat WO mana yg mengantre + waktu masuk antrean
  var queued = S.outbox.filter(function(o){return o.status==='queued'||o.status==='failed_retry';});
  var oi = document.getElementById('outboxInfo');
  // "menunggu sinyal" hanya benar saat offline. Sejak ada retry_later, op juga
  // bisa mengantre karena server ramai — dan saat itu sinyalnya baik-baik saja.
  oi.textContent = queued.length
    ? ('📮 '+queued.length+(navigator.onLine ? ' sedang dikirim ' : ' menunggu sinyal ')+(S.showOutbox?'▲':'▼'))
    : '';
  var od = document.getElementById('outboxDetail');
  if (queued.length && S.showOutbox) {
    od.style.display='block';
    od.innerHTML = queued.map(function(o){
      return '<div class="card" style="padding:10px;margin-bottom:6px">'+
        '<b>'+esc(opLabel(o))+'</b>'+
        '<div class="sub" style="margin:2px 0 0">🕒 Masuk antrean: '+esc(fmtDateTime(o.created_at))+'</div>'+
        '</div>';
    }).join('');
  } else { od.style.display='none'; od.innerHTML=''; }
  // failed outbox
  var failHtml = '';
  S.outbox.filter(function(o){return o.status==='failed';}).forEach(function(o) {
    // Yang sampai ke sini SUDAH lolos rekonsiliasi: pekerjaannya benar-benar
    // belum masuk dan masih menunggu tindakan. Jadi kalimatnya boleh tegas —
    // dan "Coba lagi" disebut aman, karena server memang menolak kiriman kembar.
    failHtml += '<div class="card err"><b>'+esc(opLabel(o))+'</b>'+
      '<div style="margin:4px 0 8px">'+esc(_pesanGagal(o))+'</div>'+
      '<button class="mini" onclick="retryOp(\''+o.op_id+'\')">🔁 Coba lagi (aman, tidak akan dobel)</button> '+
      '<button class="mini gray" onclick="discardOp(\''+o.op_id+'\')">🗑 Buang</button></div>';
  });
  document.getElementById('failedOps').innerHTML = failHtml;
  // content
  var content = document.getElementById('content');
  if (S.tab==='create') { renderCreateTab(content); }
  else if (S.tab==='approval') { renderApprovalTab(content); }
  else if (S.tab==='monitor') { renderMonitorTab(content); }
  else { renderWos(content); }   // 'wos' + jaring pengaman bila S.tab tak dikenal
  if (typeof updateBulkBarUI === 'function') updateBulkBarUI();
}

/* ── MONITORING (approver) — cermin halaman Monitoring di web ──
   Menampilkan TOKEN mekanik, bukan URL, sama seperti web sejak 1 Agu 2026. */
function renderMonitorTab(el) {
  var mons = S.monitoring || [];
  if (!mons.length) {
    el.innerHTML = '<div class="empty">Belum ada data monitoring. Tekan 🔄 Refresh saat ada sinyal.</div>';
    return;
  }
  var ov = S.monitoringOverall || {};
  // Periode WAJIB disebut. Angka Approved kini hanya bulan berjalan — tanpa
  // keterangan ini orang melihat angkanya turun dan mengira datanya hilang.
  var html = '<div class="card" style="padding:12px">'+
    '<b>Ringkasan scope Anda</b>'+
    (ov.periode ? '<span class="badge" style="background:#5E5E5E;margin-left:6px">'+esc(ov.periode)+'</span>' : '')+
    '<div class="sub" style="margin-top:4px">'+
      '📝 Perlu diisi: <b>'+(ov.pending_mechanic_work||0)+'</b> · '+
      '⏳ L1: <b>'+(ov.pending_l1||0)+'</b> · '+
      '⏳ L2: <b>'+(ov.pending_l2||0)+'</b> · '+
      '✅ Approved: <b>'+(ov.approved||0)+'</b>'+
    '</div></div>';

  html += '<div class="sub">'+mons.length+' mekanik</div>';
  mons.forEach(function(m){
    html += '<div class="card">'+
      '<div class="cardTop"><b>'+esc(m.name||m.id)+'</b>'+
        (m.section?'<span class="badge" style="background:#334155">'+esc(m.section)+'</span>':'')+
      '</div>'+
      '<div class="cardBody">'+esc(m.id)+'<br>'+
        '📝 '+(m.pending_mechanic_work||0)+' · ⏳ L1 '+(m.pending_l1||0)+
        ' · ⏳ L2 '+(m.pending_l2||0)+' · ✅ '+(m.approved||0)+
      '</div>';
    if (m.has_token && m.token) {
      html += '<div style="display:flex;gap:6px;align-items:center;margin-top:8px">'+
        '<input class="inp" style="flex:1;font-family:monospace;font-size:13px" readonly value="'+esc(m.token)+'" onclick="this.select()">'+
        '<button class="mini" onclick="salinToken(\''+esc(m.token)+'\',this)">📋 Copy</button>'+
      '</div>';
    } else {
      html += '<div class="sub" style="color:#b45309;margin-top:6px">⚠️ Belum ada token — jalankan generateMissingTokens di editor GAS.</div>';
    }
    html += '</div>';
  });
  el.innerHTML = html;
}

function salinToken(tok, btn) {
  var semula = btn.textContent;
  var sukses = function(){ btn.textContent='✅'; setTimeout(function(){ btn.textContent=semula; },1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tok).then(sukses).catch(function(){ toast('Salin manual: '+tok); });
  } else { toast('Salin manual: '+tok); }
}
/**
 * Menu "WO Saya" — satu kotak per keadaan, urut dari yang paling menuntut
 * tindakan. Dipilih satu, baru daftarnya muncul.
 *
 * Sebelumnya semua keadaan bertumpuk dalam satu layar gulir panjang. Di
 * lapangan, satu layar = satu hal yang perlu diputuskan jauh lebih mudah
 * dipakai daripada gulir panjang yang menuntut mekanik memilah sendiri.
 */
var BAGIAN_WO = [
  {id:'aktif',    judul:'Perlu Dikerjakan', ikon:'🔧', warna:'#5E5E5E',
   sub:'belum diisi / sedang dikerjakan', st:['pending_mechanic_work','in_progress']},
  {id:'transfer', judul:'Menunggu Transfer', ikon:'🔁', warna:'#c2410c',
   sub:'menunggu keputusan L1', st:['pending_transfer']},
  {id:'pending',  judul:'Menunggu Approval', ikon:'⏳', warna:'#7c3aed',
   sub:'sudah dikirim, di meja approver', st:['pending_supervisor','pending_superintendent']},
  {id:'approved', judul:'Disetujui',         ikon:'✅', warna:'#15803d',
   sub:'poin sudah masuk', st:['approved']},
  // 'cancelled' WAJIB ikut di sini. Dulu ia tak masuk kategori mana pun, jadi
  // WO yang dibatalkan LENYAP dari menu mekanik tanpa jejak — mekanik kehilangan
  // riwayatnya justru saat ia paling perlu tahu kenapa kerjanya tidak dibayar.
  {id:'ditolak',  judul:'Ditolak / Dibatalkan', ikon:'❌', warna:'#b91c1c',
   sub:'perlu Anda periksa', st:['rejected','cancelled']},
  // Penampung status yang belum terdaftar — lihat isiBagian(). Hanya tampil
  // bila memang ada isinya, jadi normalnya tak terlihat sama sekali.
  {id:'lain',     judul:'Status Lain',       ikon:'❔', warna:'#6b7280',
   sub:'status di luar daftar — laporkan bila muncul', st:[]}
];

/** Semua status yang sudah punya kategori — dasar jaring pengaman di bawah. */
function _statusTerdaftar() {
  var out = [];
  BAGIAN_WO.forEach(function(b){ b.st.forEach(function(s){ out.push(s); }); });
  return out;
}

function bukaBagianWo(id) { S.woView = id; renderAll(); window.scrollTo(0, 0); }
function kembaliMenuWo()  { S.woView = null; renderAll(); window.scrollTo(0, 0); }

function renderWos(el) {
  var opByWo={};
  S.outbox.forEach(function(o){if(o.wo_id&&(!opByWo[o.wo_id]||o.created_at>opByWo[o.wo_id].created_at))opByWo[o.wo_id]=o;});

  // Kemajuan tiap borongan dihitung dari SELURUH anggotanya, bukan hanya yang
  // kebetulan ada di bagian ini — kalau tidak, borongan yang terbelah antar
  // bagian akan menampilkan angka yang menyesatkan.
  var totalGrup = {}, kirimGrup = {};
  S.wos.forEach(function(w) {
    var g = String(w.wo_group_id || ''); if (!g) return;
    totalGrup[g] = (totalGrup[g]||0) + 1;
    if (String(w.status) !== 'pending_mechanic_work') kirimGrup[g] = (kirimGrup[g]||0) + 1;
  });
  function isiBagian(B) {
    // Jaring pengaman: kategori 'lain' menampung status yang belum terdaftar.
    // Tanpa ini, status baru (atau yang terlewat seperti 'cancelled' dulu)
    // menghilang dari layar TANPA JEJAK — mekanik cuma melihat jumlahnya tak
    // pernah cocok, dan tak ada cara menemukan WO-nya lagi.
    if (B.id === 'lain') {
      var dikenal = _statusTerdaftar();
      return S.wos.filter(function(w){ return dikenal.indexOf(String(w.status)) === -1; });
    }
    return S.wos.filter(function(w){ return B.st.indexOf(String(w.status)) !== -1; });
  }

  // ── Daftar satu bagian ──
  if (S.woView) {
    var B = null;
    for (var i=0;i<BAGIAN_WO.length;i++) if (BAGIAN_WO[i].id === S.woView) B = BAGIAN_WO[i];
    if (!B) { S.woView = null; return renderWos(el); }
    var isi = isiBagian(B);
    el.innerHTML =
      '<button class="btnKembali" onclick="kembaliMenuWo()">← Semua kategori</button>'+
      '<div class="secHead" style="border-left-color:'+B.warna+';cursor:default;margin-top:0">'+
        '<span class="secJudul">'+B.ikon+' '+esc(B.judul)+'</span>'+
        '<span class="secJml" style="background:'+B.warna+'">'+isi.length+'</span>'+
      '</div>'+
      (isi.length ? _kartuWo(isi, opByWo, totalGrup, kirimGrup)
                  : '<div class="empty">Tidak ada WO di kategori ini.</div>');
    return;
  }

  // ── Menu ──
  var out = '';
  BAGIAN_WO.forEach(function(B) {
    var n = isiBagian(B).length;
    // Transfer jarang dipakai, dan "Status Lain" normalnya kosong — keduanya
    // hanya tampil bila memang ada isinya, supaya menu tidak penuh kategori nol.
    if (!n && (B.id === 'transfer' || B.id === 'lain')) return;
    out += '<button class="menuBox" style="border-left-color:'+B.warna+'" onclick="bukaBagianWo(\''+B.id+'\')">'+
             '<span class="menuIkon">'+B.ikon+'</span>'+
             '<span class="menuTeks"><span class="menuJudul">'+esc(B.judul)+'</span>'+
               '<span class="menuSub">'+esc(B.sub)+'</span></span>'+
             '<span class="menuJml" style="background:'+(n?B.warna:'#9CA3AF')+'">'+n+'</span>'+
             '<span class="menuPanah">›</span>'+
           '</button>';
  });
  if (!S.wos.length) {
    out += '<div class="empty" style="padding:24px 10px 10px;font-size:12px;color:var(--text-disabled)">' +
           'Belum ada kartu WO.<br>Tekan 🔄 Refresh saat ada sinyal.' +
           '</div>';
  }
  el.innerHTML = out;
}

/** Render kartu (dengan pengelompokan borongan) untuk satu bagian. */
function _kartuWo(daftar, opByWo, totalGrup, kirimGrup) {
  // Kelompokkan per WO Group. Baris tanpa grup jadi kelompok sendiri-sendiri,
  // jadi tampilan WO tunggal tidak berubah sama sekali.
  var grup = [], indeks = {};
  daftar.forEach(function(wo) {
    var g = String(wo.wo_group_id || '');
    var kunci = g || ('__solo__' + wo.id);
    // `=== undefined`, BUKAN `!indeks[kunci]` — indeks grup pertama adalah 0,
    // dan `!0` bernilai true sehingga anggota berikutnya akan dipecah jadi
    // grup baru. Persis jenis bug yang bikin satu borongan tampil terbelah.
    if (indeks[kunci] === undefined) { indeks[kunci] = grup.length; grup.push({id: g, mode: wo.wo_group_mode || '', baris: []}); }
    grup[indeks[kunci]].baris.push(wo);
  });

  var html = '';
  grup.forEach(function(G) {
    var banyak = G.baris.length > 1 || !!G.id;
    // Baris yang MASIH bisa diisi — dasar tombol "Kirim Semua"
    var bisaKirim = G.baris.filter(function(wo) {
      var op = opByWo[wo.id];
      return String(wo.status)==='pending_mechanic_work' && (!op || op.status==='failed');
    });
    html += '<div class="card">';

    if (banyak) {
      var w0 = G.baris[0];
      // Judul grup menyebut APA yang dikunci, supaya mekanik langsung paham
      // borongan ini bentuknya seperti apa.
      var judul = (G.mode === 'job')
        ? esc(w0.component_name || '-') + ' · ' + G.baris.length + ' unit'
        : esc(w0.unit_name || 'Workshop') + ' · ' + G.baris.length + ' job';
      // Dihitung dari SELURUH anggota borongan, bukan hanya yang ada di bagian
      // ini — kalau tidak, angkanya menyesatkan saat borongan terbelah bagian.
      var gid = String(w0.wo_group_id || '');
      var sudah = gid ? (kirimGrup[gid] || 0) : G.baris.filter(function(w){ return String(w.status) !== 'pending_mechanic_work'; }).length;
      var totalG = gid ? (totalGrup[gid] || G.baris.length) : G.baris.length;
      html += '<div class="grupHead">'+
        '<div class="cardTop" style="margin-bottom:4px"><b>📦 '+judul+'</b>'+
        '<span class="badge" style="background:#5E5E5E">'+(G.mode==='job'?'1 JOB · BANYAK UNIT':'1 UNIT · BANYAK JOB')+'</span></div>'+
        '<div class="cardBody">📍 '+esc(locLabel(w0.location))+' · Kondisi: '+esc(wcLabel(w0.work_condition))+
        timKerjaStr(w0.team)+
        // Kemajuan borongan: mekanik perlu tahu tinggal berapa lagi, bukan
        // menghitung sendiri dari kartu yang panjang.
        '<br>✅ Terkirim '+sudah+' dari '+totalG+' baris</div>'+
      '</div>';
    }

    G.baris.forEach(function(wo, idx) {
      var op=opByWo[wo.id]; var b=badgeFor(wo,op);
      var canFill=String(wo.status)==='pending_mechanic_work'&&(!op||op.status==='failed');
      // Di dalam borongan tiap baris DIKOTAKKAN sendiri + diberi nomor urut.
      // Tanpa sekat tegas, timer & tombol milik baris berbeda terlihat menyatu
      // dan mekanik kehilangan jejak sedang mengerjakan yang mana.
      html += banyak ? '<div class="woLine">' : '';
      html += '<div class="cardTop">'+
        '<b>'+(banyak ? '<span class="woLineNo">'+(idx+1)+'</span>' : '')+esc(wo.wo_number)+'</b>'+
        '<span class="badge" style="background:'+b[1]+'">'+b[0]+'</span>'+
        (wo.is_others?'<span class="badge" style="background:'+WARNA.others+'">Others</span>':'')+'</div>'+
        '<div class="cardBody"><b>'+esc(wo.component_name||'-')+'</b>'+(wo.unit_name?' · '+esc(wo.unit_name):'')+(wo.target_hours?' · Target: '+fmtJamMenit(wo.target_hours):'')+
        (banyak ? '' : '<br>📍 '+esc(locLabel(wo.location))+' · Kondisi: '+esc(wcLabel(wo.work_condition))+timKerjaStr(wo.team))+'</div>'+
        (wo.keterangan?'<div class="ket">📝 '+esc(wo.keterangan)+'</div>':'')+
        // Kapan dikirim & kapan disahkan L2. Muncul hanya bila ada isinya, jadi
        // WO yang belum dikirim tak dipenuhi baris kosong — dan kartu "Disetujui"
        // akhirnya bisa menjawab "kapan?", pertanyaan yang selalu muncul saat
        // gaji terasa telat.
        //
        // Teksnya datang JADI dari server (submitted_at_str / disahkan_at_str).
        // Sengaja tidak diformat di sini: HP yang zona waktunya berbeda akan
        // menampilkan jam lain untuk WO yang sama, dan mekanik akan yakin salah
        // satu layar berbohong. 1:1 dengan kartu di web.
        ((wo.submitted_at_str || wo.disahkan_at_str)
          ? '<div class="ket">'+
              (wo.submitted_at_str ? '📮 Dikirim: '+esc(wo.submitted_at_str) : '')+
              (wo.submitted_at_str && wo.disahkan_at_str ? '<br>' : '')+
              (wo.disahkan_at_str ? '✅ Disahkan: '+esc(wo.disahkan_at_str) : '')+
            '</div>'
          : '')+
        // Tiap baris punya timer, Isi Manual, Kirim, dan Transfer sendiri —
        // karena tiap baris memang WO utuh di server.
        (canFill?_timerControls(wo):'')+
        (canFill?'<div style="display:flex;gap:6px;margin-top:10px">'+
          '<button class="big secondary" style="flex:1;margin-top:0" onclick="openSubmitWithTimer(\''+esc(String(wo.id))+'\')">✍️ Isi Manual</button>'+
          '<button class="big" style="flex:1;margin-top:0" onclick="kirimLangsung(\''+esc(String(wo.id))+'\')">📮 Kirim</button>'+
        '</div>':'')+
        // Hapus WO — hanya muncul bila SERVER menyatakan boleh (WO buatannya
        // sendiri & belum dikerjakan). Bergaya garis luar merah: merusak, jadi
        // tak boleh terlihat semenarik Kirim.
        (wo.boleh_batal ? '<button class="big secondary" style="margin-top:6px;color:var(--error);border-color:#FCA5A5" '+
          'onclick="openCancelForm(\''+esc(String(wo.id))+'\',\''+esc(String(wo.wo_number))+'\')">🗑 Hapus WO ini</button>' : '');
      html += banyak ? '</div>' : '';
    });

    // Satu tombol Kirim untuk seluruh grup — mengirim baris yang timernya
    // sudah jalan saja; yang masih 00:00:00 dibiarkan terbuka (keputusan Gabriel).
    if (banyak && bisaKirim.length > 1) {
      html += '<button class="big" style="background:#15803d" onclick="kirimSeluruhGrup(\''+esc(G.id)+'\')">📮 Kirim Semua ('+bisaKirim.length+' baris)</button>';
    }
    html += '</div>';
  });
  return html;
}

/**
 * Kirim seluruh baris dalam satu grup sekaligus.
 * Baris yang timernya masih 00:00:00 DILEWATI, bukan dikirim 0 jam — 0 jam
 * masuk perhitungan ketepatan waktu dan merusak poin. Yang dilewati tetap
 * terbuka supaya bisa dikerjakan menyusul, dan jumlahnya disebut di ringkasan.
 */
function kirimSeluruhGrup(groupId) {
  var siap = [], kosong = [];
  S.wos.forEach(function(wo) {
    if (String(wo.wo_group_id||'') !== String(groupId)) return;
    if (String(wo.status) !== 'pending_mechanic_work') return;
    var st = getTimerState(wo.id);
    var ms = (parseFloat(st.elapsed_ms)||0) + (st.state==='running' ? (Date.now()-(parseFloat(st.start_epoch)||Date.now())) : 0);
    if (ms > 0) siap.push({wo: wo, ms: ms}); else kosong.push(wo);
  });
  if (!siap.length) { toast('⏱️ Belum ada baris yang timernya jalan'); return; }

  var rinci = siap.map(function(x){ return '• ' + (x.wo.component_name||x.wo.wo_number) + ' — ' + msToJamMenit(x.ms); }).join('\n');
  var pesan = 'Kirim ' + siap.length + ' baris?\n\n' + rinci;
  if (kosong.length) pesan += '\n\n' + kosong.length + ' baris masih 00:00:00 dan TIDAK dikirim — tetap terbuka untuk dikerjakan nanti.';
  pesan += '\n\nSetelah terkirim, baris itu masuk ke meja approver dan tidak bisa Anda ubah lagi.';
  if (!confirm(pesan)) return;

  var now = new Date();
  var tugas = siap.map(function(x) {
    stopLiveTimer(x.wo.id);
    var mulai = new Date(now.getTime() - x.ms);
    return obPut({ op_id:uuid(), seq:(_enqSeq++), action:'submit_work', wo_id:x.wo.id, wo_number:x.wo.wo_number,
      payload:{wo_id:x.wo.id, start_time:mulai.toISOString(), end_time:now.toISOString(), hour_meter:'', kilometers:'', part_category:''},
      status:'queued', created_at:new Date().toISOString(), label:'Submit · '+(x.wo.component_name||x.wo.wo_number) });
  });
  Promise.all(tugas).then(function(){
    siap.forEach(function(x){ clearTimerAfterSubmit(x.wo.id); });
    return refreshOutbox();
  }).then(function() {
    renderAll();
    toast(navigator.onLine ? ('📮 Mengirim '+siap.length+' baris...') : ('📮 '+siap.length+' baris tersimpan — terkirim saat ada sinyal'));
    syncNow(false);
  });
}
/**
 * Susunan tim di kartu WO mekanik. Dirinya sendiri ditandai "(Anda)" dan
 * ditebalkan — di WO beranggota banyak, mekanik harus bisa menemukan dirinya
 * sekali lihat tanpa mengeja daftar nama.
 * Namanya tetap ditampilkan, bukan diganti "Anda" saja: saat WO dibicarakan
 * berdua di lapangan, nama itu yang dipakai menyebut satu sama lain.
 */
function timKerjaStr(team) {
  if (!team || !team.length) return '';
  var bagian = team.map(function(t) {
    return t.is_me
      ? '<b style="color:var(--primary)">'+esc(t.name)+' (Anda)</b>'
      : esc(t.name);
  });
  // Diri sendiri didahulukan supaya selalu terbaca lebih dulu
  var urut = team.map(function(t,i){ return {s:bagian[i], me:t.is_me}; })
                 .sort(function(a,b){ return (b.me?1:0)-(a.me?1:0); })
                 .map(function(x){ return x.s; });
  return '<br>👥 '+(team.length===1 ? 'Dikerjakan: ' : 'Tim ('+team.length+'): ')+urut.join(', ');
}

function renderCreateTab(el) {
  if (!bolehBuatWoSaya()) {
    el.innerHTML = '<div class="empty">Mekanik tidak memiliki akses untuk membuat WO.</div>';
    return;
  }
  if (!S.refs) { el.innerHTML='<div class="empty">Tekan 🔄 Refresh untuk memuat data referensi.</div>'; return; }
  el.innerHTML='<button class="big" onclick="openCreateForm()" style="margin-bottom:12px">➕ Buat Work Order Baru</button>'+
    '<div class="sub">Data referensi: '+(S.refs.jobs_field||[]).length+' job field, '+(S.refs.jobs_workshop||[]).length+' job WS, '+(S.refs.components||[]).length+' komponen rekondisi</div>';
}
function wcLabel(wc){ return wc==='normal'?'Shift 1':wc==='difficult'?'Shift 2':wc==='extreme'?'Kondisi Ekstrim':(wc||'-'); }
function partLabel(p){ return p==='baru'?'🆕 Sparepart Baru':p==='repair'?'🔧 Repair':p==='kanibal'?'♻️ Kanibal':(p||'Tanpa Part'); }
function locLabel(l){ return l==='field'?'Lapangan':l==='workshop'?'Bengkel':(l||'-'); }
function fmtJamMenit(h){
  h=parseFloat(h)||0;
  if(h<=0) return '-';
  var j=Math.floor(h), m=Math.round((h-j)*60);
  if(m===60){ j++; m=0; }
  if(j>0&&m>0) return j+' jam '+m+' menit';
  if(j>0) return j+' jam';
  return m+' menit';
}
function renderApprovalTab(el) {
  var subs = [['pending','✅ Pending',S.pending.length],['active','⏳ Aktif',S.active.length],
              ['transfer','🔁 Transfer',S.transfers.length],['approved','🏆 Approved',S.approved.length],
              // Riwayat ditolak/dibatalkan: dulu tak punya layar sama sekali —
              // begitu WO ditolak, ia lenyap dan hanya bisa dilacak lewat
              // spreadsheet. Padahal justru itu yang ditengok saat ada
              // pertanyaan "kenapa WO saya tidak dibayar".
              ['rejected','❌ Ditolak',(S.rejected||[]).length]];
  var bar = '<div class="tabBar" style="display:flex;margin-bottom:12px;flex-wrap:wrap">'+subs.map(function(s){
    return '<button class="tab'+(S.appSub===s[0]?' active':'')+'" onclick="switchAppSub(\''+s[0]+'\')">'+s[1]+' ('+s[2]+')</button>';
  }).join('')+'</div>';
  var body = S.appSub==='active' ? renderActiveList()
           : S.appSub==='transfer' ? renderTransferList()
           : S.appSub==='approved' ? renderApprovedList()
           : S.appSub==='rejected' ? renderRejectedList()
           : renderPendingList();
  el.innerHTML = bar + body;
}

/** Riwayat WO ditolak / dibatalkan — TANPA angka poin (sudah nol, dan
    menampilkannya hanya memancing salah paham "kok dapat poin?"). */
function renderRejectedList(){
  var l = S.rejected || [];
  if (!l.length) return '<div class="empty">Belum ada WO ditolak/dibatalkan.<br>Tekan 🔄 Refresh saat online.</div>';
  var html='<div class="sub">'+l.length+' WO ditolak/dibatalkan (maks 100 terbaru)</div>';
  l.forEach(function(wo){
    var batal = String(wo.status) === 'cancelled';
    html+='<div class="card"><div class="cardTop"><b>'+esc(wo.wo_number)+'</b>'+
      '<span class="badge" style="background:'+(batal?'#6b7280':'#b91c1c')+'">'+(batal?'🗑 Dibatalkan':'❌ Ditolak')+'</span>'+
      (wo.section?'<span class="badge" style="background:#334155">'+esc(wo.section)+'</span>':'')+
      (wo.is_others?'<span class="badge" style="background:'+WARNA.others+'">Others</span>':'')+'</div>'+
      '<div class="cardBody"><b>'+esc(wo.component_name||'-')+'</b>'+
      '<div class="woInfo">'+
        '<span class="k">Unit</span><span class="v">'+esc(wo.unit_name||'-')+'</span>'+
        '<span class="k">Lokasi</span><span class="v">'+esc(locLabel(wo.location))+'</span>'+
        ((wo.created_by_name||wo.created_by)?'<span class="k">Pembuat</span><span class="v">'+esc(wo.created_by_name||wo.created_by)+'</span>':'')+
        '<span class="k">Tim</span><span class="v">'+(wo.team_names||[]).map(function(n){return esc(n);}).join(', ')+'</span>'+
        // Siapa & kapan. Baris lama (sebelum 8 Agu 2026) kolomnya memang kosong
        // — barisnya sengaja tidak ditampilkan, jangan dikarang.
        (wo.rejected_by_name?'<span class="k">Oleh</span><span class="v">'+esc(wo.rejected_by_name)+
          (wo.rejected_at?' · '+esc(fmtDateTime(wo.rejected_at)):'')+'</span>':'')+
      '</div></div>'+
      // Alasannya ditaruh MENONJOL, bukan diselipkan di antara data lain —
      // inilah yang dicari orang saat membuka layar ini.
      (wo.rejection_reason
        ? '<div class="ket" style="background:#fef2f2;border-color:#fca5a5;color:#991b1b">'+
          (batal?'🗑 Alasan dibatalkan: ':'❌ Alasan ditolak: ')+esc(wo.rejection_reason)+'</div>'
        : '')+
      (wo.keterangan?'<div class="ket">📝 '+esc(wo.keterangan)+'</div>':'')+
      '</div>';
  });
  return html;
}
function switchAppSub(sub){
  S.appSub = sub;
  // Tarik ulang SETIAP kali tab dibuka, bukan hanya saat daftarnya kosong.
  // Dulu `!S.approved.length` membuat daftar approved dimuat sekali lalu tak
  // pernah disegarkan lagi — WO yang sudah dibatalkan di tempat lain tetap
  // tampil "approved" sampai aplikasi dimuat ulang.
  if (sub==='approved' && navigator.onLine) {
    if (!S.approved.length) toast('⏳ Memuat approved...');
    pullApproved().then(renderAll).catch(function(){});
  }
  if (sub==='rejected' && navigator.onLine) {
    if (!(S.rejected||[]).length) toast('⏳ Memuat riwayat ditolak...');
    pullRejected().then(renderAll).catch(function(){});
  }
  renderAll();
}
function fmtIdr(n){ n=parseFloat(n)||0; return n.toLocaleString('id-ID'); }
/* AUDIT T1: guard dobel-aksi — op yang masih antre utk WO ini? */
function queuedOpFor(woId){
  for (var i=0;i<S.outbox.length;i++){
    var o=S.outbox[i];
    if (String(o.wo_id)===String(woId) && (o.status==='queued'||o.status==='failed_retry')) return o;
  }
  return null;
}
function queuedNote(qop){ return '<div class="obinfo">📮 '+esc(opLabel(qop))+' — menunggu sinyal (tombol dikunci)</div>'; }
// Nama saja — email dihilangkan dari kartu approval (1:1 dgn web). Approver
// mengenali orang dari namanya; alamat email hanya memenuhi layar HP.
function teamStr(team){ return (team||[]).map(function(t){ return esc(t.name); }).join(', '); }
/** Huruf besar di awal tiap kata: "tyreman" → "Tyreman", "ON TIME" → "On Time". */
function _kapital(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/(^|[\s\-\/])(\S)/g, function(m, a, b) {
    return a + b.toUpperCase();
  });
}

/**
 * BAHASA WARNA — tetap, tidak boleh berubah-ubah antar layar.
 * Tujuannya supaya approver hafal: lihat warnanya, sudah tahu isinya apa.
 * Kalau menambah keterangan baru, tambahkan warnanya DI SINI, jangan menulis
 * kode warna langsung di tempat pemakaian.
 */
var WARNA = {
  // Keterangan netral — "WO ini apa"
  l1:        '#7c3aed',   // ungu   — menunggu L1
  l2:        '#b45309',   // amber  — menunggu L2
  section:   '#334155',   // abu    — tyreman/field/workshop
  onTime:    '#15803d',   // hijau  — tepat waktu
  late:      '#c2410c',   // oranye — terlambat
  wayLate:   '#b91c1c',   // merah  — sangat terlambat
  grup:      '#5E5E5E',   // abu tema — bagian borongan
  // Perhatian — "hal yang wajib disadari sebelum memutuskan"
  mekanik:   '#be185d',   // magenta — dibuat mekanik sendiri
  override:  '#4338ca',   // indigo  — angka sudah diubah approver
  others:    '#0284c7'    // biru    — poin diketik manual saat WO dibuat
};

/**
 * Pita PERHATIAN — hal yang wajib disadari approver sebelum memutuskan.
 *
 * Dipisah dari bilah keterangan karena disamaratakan jadi iris sama besar
 * justru MENGHILANGKAN bobotnya: "Dibuat Mekanik" terbaca seperti label biasa,
 * padahal itu tanda supaya WO-nya ditelaah lebih teliti. Warnanya tetap,
 * tidak ikut berubah mengikuti isi lain.
 */
function awBar(wo) {
  var chip = [];
  if (wo.created_by_is_mechanic) {
    chip.push({c: WARNA.mekanik, t: '👷 DIBUAT MEKANIK', n: 'periksa job, unit &amp; susunan tim lebih teliti'});
  }
  if (wo.is_others) {
    chip.push({c: WARNA.others, t: '📝 JOB MANUAL (OTHERS)', n: 'base points diketik manual saat WO dibuat'});
  }
  if (wo.has_override_spv || wo.has_override_supt) {
    var siapa = (wo.has_override_spv && wo.has_override_supt) ? 'L1 & L2'
              : (wo.has_override_spv ? 'L1' : 'L2');
    chip.push({c: WARNA.override, t: '✏️ SUDAH DI-OVERRIDE ' + siapa, n: 'angka sudah diubah dari nilai sistem'});
  }
  if (!chip.length) return '';
  return '<div class="awBar">' + chip.map(function(k) {
    return '<div class="awChip" style="background:'+k.c+'"><span>'+k.t+'</span>'+
           '<span class="awNote">· '+k.n+'</span></div>';
  }).join('') + '</div>';
}

/**
 * Bilah KETERANGAN netral — satu kotak menyambung, terbagi RATA sebanyak isinya.
 * Hanya memuat "WO ini apa": tahap, section, ketepatan waktu, borongan.
 * Yang bersifat peringatan sudah naik ke awBar di atasnya.
 */
function ketBar(wo, isL2) {
  var seg = [];
  seg.push({t: isL2 ? 'L2' : 'L1', c: isL2 ? WARNA.l2 : WARNA.l1});
  if (wo.section) seg.push({t: _kapital(wo.section), c: WARNA.section});
  var tl = wo.timeliness;
  if (tl) {
    // Tanpa "×1" — faktornya sudah tercermin di poin, dan di sini yang perlu
    // dibaca approver hanya tepat waktu atau tidak.
    seg.push({t: _kapital(tl.label),
              c: tl.status === 'on_time' ? WARNA.onTime : (tl.status === 'late' ? WARNA.late : WARNA.wayLate)});
  }
  if (wo.wo_group_id) seg.push({t: String(wo.wo_group_mode) === 'job' ? '1 Job · Banyak Unit' : '1 Unit · Banyak Job', c: WARNA.grup});

  return '<div class="ketBar">' + seg.map(function(s) {
    return '<span class="ketSeg" style="background:'+s.c+'">'+esc(s.t)+'</span>';
  }).join('') + '</div>';
}

function cancelBtn(wo){ return '<button class="big secondary" onclick="event.stopPropagation(); openCancelForm(\''+esc(String(wo.id))+'\',\''+esc(String(wo.wo_number))+'\')">🗑 Batalkan WO</button>'; }
/* ── TRANSFER WO: keputusan L1 (offline-capable) ── */
function renderTransferList(){
  if (!S.transfers.length) return '<div class="empty">Tidak ada permintaan transfer dalam scope Anda.</div>';
  var mechs = (S.refs && S.refs.mechanics) || [];
  var html = '<div class="sub">'+S.transfers.length+' permintaan menunggu keputusan</div>';

  S.transfers.forEach(function(tr){
    var qop = queuedOpFor(tr.wo_id);
    var opts = mechs.map(function(m){
      return '<option value="'+esc(m.mechanic_id)+'">'+esc(m.mechanic_name)+' ('+esc(m.mechanic_id)+')</option>';
    }).join('');
    var tim = (tr.team||[]).map(function(t){ return esc(t.mechanic_name); }).join(', ');

    html += '<div class="card"><div class="cardTop"><b>'+esc(tr.wo_number)+'</b>'+
      '<span class="badge" style="background:#dd6b20">🔁 TRANSFER</span>'+
      (tr.section?'<span class="badge" style="background:#334155">'+esc(tr.section)+'</span>':'')+'</div>'+
      '<div class="cardBody">'+
        'Diminta oleh <b>'+esc(tr.requested_by_name)+'</b><br>'+
        (tr.keterangan ? '📝 '+esc(tr.keterangan)+'<br>' : '')+
        (tr.transfer_note ? '💬 Catatan mekanik: <i>'+esc(tr.transfer_note)+'</i><br>' : '')+
        (tim ? 'Tim sekarang: '+tim+'<br>' : '')+
        // Dampak jam ditampilkan SEBELUM tombol — keputusan ini menambah jam
        // kerja yang dibayar, jadi angkanya tidak disembunyikan.
        '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:8px;margin-top:8px">'+
          '<b style="color:#0369a1;font-size:12px">DAMPAK JAM KERJA</b><br>'+
          'Sesi ini <b>'+fmtJamMenit(tr.session_hours)+'</b> · tercatat <b>'+fmtJamMenit(tr.partial_hours_now)+'</b> → '+
          '<b style="color:#b45309">'+fmtJamMenit(tr.partial_hours_after)+'</b> bila disetujui<br>'+
          '<span style="font-size:12px;color:#0369a1">Bila ditolak, sesi tersebut hangus.</span>'+
        '</div>'+
      '</div>';

    if (qop) {
      html += queuedNote(qop);
    } else {
      html += '<label style="margin-top:8px">Mekanik penerima *</label>'+
        '<select multiple size="4" class="inp" id="trSel_'+esc(tr.wo_id)+'">'+opts+'</select>'+
        '<div style="font-size:12px;color:#64748b;margin:4px 0 8px">Bisa pilih lebih dari satu. Semua penerima dapat poin penuh.</div>'+
        '<div style="display:flex;gap:8px">'+
          '<button class="big" style="flex:1" onclick="queueApproveTransfer(\''+esc(tr.wo_id)+'\',\''+esc(tr.wo_number)+'\')">✓ Setujui</button>'+
          '<button class="big secondary" style="flex:1;background:#dc2626;color:#fff" onclick="queueRejectTransfer(\''+esc(tr.wo_id)+'\',\''+esc(tr.wo_number)+'\')">✗ Tolak</button>'+
        '</div>';
    }
    html += '</div>';
  });
  return html;
}

function _trSelected(woId){
  var sel = document.getElementById('trSel_'+woId);
  if (!sel) return [];
  var out=[];
  for (var i=0;i<sel.options.length;i++) if (sel.options[i].selected) out.push(sel.options[i].value);
  return out;
}

function queueApproveTransfer(woId, woNumber){
  var targets = _trSelected(woId);
  if (!targets.length) { toast('Pilih minimal satu mekanik penerima'); return; }
  if (!confirm('Setujui transfer '+woNumber+' ke '+targets.length+' mekanik?\n\nJam sesi mekanik sebelumnya akan DIHITUNG, dan semua penerima dapat poin penuh.')) return;
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'approve_transfer', wo_id:woId, wo_number:woNumber,
    payload:{wo_id:woId, target_mechanic_ids:targets},
    status:'queued', created_at:new Date().toISOString() };
  obPut(op).then(refreshOutbox).then(function(){
    _lepasDariAntrean(woId);
    renderAll();
    toast(navigator.onLine ? ('✅ Transfer '+(woNumber||'WO')+' disetujui')
                           : ('✅ Transfer '+(woNumber||'WO')+' disetujui — terkirim saat ada sinyal'));
    syncNow(false);
  });
}

function queueRejectTransfer(woId, woNumber){
  var reason = prompt('Alasan menolak transfer:');
  if (!reason || !reason.trim()) { toast('Alasan wajib diisi'); return; }
  if (!confirm('Tolak transfer '+woNumber+'?\n\nSesi kerja mekanik yang mengajukan akan HANGUS.')) return;
  var op = { op_id:uuid(), seq:(_enqSeq++), action:'reject_transfer', wo_id:woId, wo_number:woNumber,
    payload:{wo_id:woId, reason:reason.trim()},
    status:'queued', created_at:new Date().toISOString() };
  obPut(op).then(refreshOutbox).then(function(){
    _lepasDariAntrean(woId);
    renderAll();
    toast(navigator.onLine ? ('❌ Transfer '+(woNumber||'WO')+' ditolak')
                           : ('❌ Transfer '+(woNumber||'WO')+' ditolak — terkirim saat ada sinyal'));
    syncNow(false);
  });
}

/**
 * Tahap approval yang menjadi urusan role ini — cerminan `_tahapMilikRole`
 * di ApiService.gs. Null = bukan approver.
 *
 * KENAPA PERLU DI KLIEN JUGA. Server hanya mengirim WO tahap ini, jadi daftar
 * yang baru ditarik selalu benar. Yang tidak benar adalah SESUDAH sebuah
 * keputusan berhasil terkirim: _perbaruiStatusLokal() memajukan status salinan
 * lokal (approve_l1 → pending_superintendent), op-nya berubah 'done' sehingga
 * tak lagi menyembunyikan kartu, dan renderAll() jalan SEBELUM pullPending()
 * selesai. Di sela itu kartu yang baru saja di-approve L1 muncul kembali di
 * layar L1 — kali ini sebagai kartu L2, lengkap dengan tombol Approve L2.
 * Menekannya dijawab server "Superintendent role required": kartu merah untuk
 * pekerjaan yang justru BERHASIL. Kebalikannya juga terjadi di layar L2.
 *
 * Uang tidak pernah ikut bocor — supervisorApprove/superintendentApprove
 * memeriksa peran DAN status di server. Yang bocor tampilannya.
 */
function tahapSaya() {
  if (S.role === 'superintendent') return 'pending_superintendent';
  if (S.role === 'supervisor')     return 'pending_supervisor';
  return null;
}

/* ── BULK APPROVAL (L1/L2) & COMPACT VIEW ── */
var MAX_BULK_SELECT = 50;
var selectedWoMap = {};
var expandedWoMap = {};
var bulkRunning = false;
var bulkCancelled = false;

function onWoSelectChange(woId, isChecked) {
  var sid = String(woId);
  var prevCount = Object.keys(selectedWoMap).length;
  if (isChecked) {
    if (prevCount >= MAX_BULK_SELECT && !selectedWoMap[sid]) {
      _syncCardSelectionUI(sid, false);
      toast('Batas Maksimum 50 WO: Maksimal 50 Work Order yang dapat dipilih sekaligus untuk menjaga kestabilan sistem.');
      return;
    }
    var found = null;
    for (var i = 0; i < (S.pending || []).length; i++) {
      if (String(S.pending[i].id) === sid) { found = S.pending[i]; break; }
    }
    if (found) {
      selectedWoMap[sid] = Object.assign({}, found, {
        safety_incident: (found.safety_incident === true || String(found.safety_incident).toLowerCase() === 'true'),
        mtbf_redo_status: (found.mtbf_redo_status === 'redo') ? 'redo' : 'first_time'
      });
      if (prevCount === 0) {
        toast('Mode Multi-Pilih aktif: 1 WO dipilih');
      }
    }
  } else {
    delete selectedWoMap[sid];
  }
  _syncCardSelectionUI(sid, isChecked);
  updateBulkBarUI();
}

function _syncCardSelectionUI(woId, isChecked) {
  var card = document.getElementById('wo_card_' + woId);
  if (card) {
    if (isChecked) card.classList.add('selected-wo-card');
    else card.classList.remove('selected-wo-card');
    var chk = card.querySelector('.wo-select-chk');
    if (chk) chk.checked = isChecked;
  }
}

function onCardClick(e, woId) {
  if (e.target.closest('button, select, input, textarea, a, .wo-chk-wrap, .compact-detail-pane')) return;
  var isCurrentlySelected = !!selectedWoMap[String(woId)];
  onWoSelectChange(woId, !isCurrentlySelected);
}

function toggleSelectAllPending() {
  var _tahap = tahapSaya();
  var OP_KEPUTUSAN = ['approve_l1','approve_l2','reject','approve_transfer','reject_transfer'];
  var opMenunggu = {};
  (S.outbox || []).forEach(function(o) {
    if ((o.status === 'queued' || o.status === 'failed_retry') &&
        o.wo_id && OP_KEPUTUSAN.indexOf(o.action) !== -1) opMenunggu[String(o.wo_id)] = true;
  });
  var milikSaya = _tahap ? S.pending.filter(function(wo){ return String(wo.status) === _tahap; }) : S.pending;
  var daftar = milikSaya.filter(function(wo){ return !opMenunggu[String(wo.id)]; });
  if (!daftar.length) return;

  var curSel = 0;
  daftar.forEach(function(w){ if (selectedWoMap[String(w.id)]) curSel++; });

  if (daftar.length > MAX_BULK_SELECT) {
    if (curSel >= MAX_BULK_SELECT) {
      selectedWoMap = {};
      toast('Semua pilihan WO dibatalkan');
    } else {
      selectedWoMap = {};
      for (var i = 0; i < MAX_BULK_SELECT; i++) {
        var w = daftar[i];
        selectedWoMap[String(w.id)] = Object.assign({}, w, {
          safety_incident: (w.safety_incident === true || String(w.safety_incident).toLowerCase() === 'true'),
          mtbf_redo_status: (w.mtbf_redo_status === 'redo') ? 'redo' : 'first_time'
        });
      }
      toast('Batas kuota 50 WO telah tercapai (50 WO pertama dipilih)');
    }
  } else {
    var allChecked = daftar.every(function(w){ return !!selectedWoMap[String(w.id)]; });
    if (allChecked) {
      selectedWoMap = {};
      toast('Semua pilihan WO dibatalkan');
    } else {
      daftar.forEach(function(w){
        selectedWoMap[String(w.id)] = Object.assign({}, w, {
          safety_incident: (w.safety_incident === true || String(w.safety_incident).toLowerCase() === 'true'),
          mtbf_redo_status: (w.mtbf_redo_status === 'redo') ? 'redo' : 'first_time'
        });
      });
      toast(daftar.length + ' WO berhasil dipilih');
    }
  }
  renderAll();
}

function clearSelectedWos() {
  selectedWoMap = {};
  updateBulkBarUI();
  toast('Semua pilihan WO dibatalkan');
  renderAll();
}

function updateBulkBarUI() {
  var keys = Object.keys(selectedWoMap);
  var count = keys.length;
  var bar = document.getElementById('bulkFloatingBar');
  var badge = document.getElementById('bulkSelectedBadge');
  var countText = document.getElementById('bulkApproveCountText');
  if (badge) badge.textContent = '[ ' + count + ' / ' + MAX_BULK_SELECT + ' ] WO Dipilih';
  if (countText) countText.textContent = count;
  if (bar) {
    if (count > 0 && S.tab === 'approval' && (S.appSub === 'pending' || !S.appSub)) {
      bar.classList.add('show');
      bar.style.display = 'flex';
    } else {
      bar.classList.remove('show');
      setTimeout(function() { if (!bar.classList.contains('show')) bar.style.display = 'none'; }, 280);
    }
  }
  var btnSelAll = document.getElementById('btnSelectAllWo');
  if (btnSelAll) {
    var _tahap = tahapSaya();
    var OP_KEPUTUSAN = ['approve_l1','approve_l2','reject','approve_transfer','reject_transfer'];
    var opMenunggu = {};
    (S.outbox || []).forEach(function(o) {
      if ((o.status === 'queued' || o.status === 'failed_retry') &&
          o.wo_id && OP_KEPUTUSAN.indexOf(o.action) !== -1) opMenunggu[String(o.wo_id)] = true;
    });
    var milikSaya = _tahap ? S.pending.filter(function(wo){ return String(wo.status) === _tahap; }) : S.pending;
    var daftar = milikSaya.filter(function(wo){ return !opMenunggu[String(wo.id)]; });
    if (daftar.length > MAX_BULK_SELECT) {
      var is50Selected = count >= MAX_BULK_SELECT;
      btnSelAll.textContent = is50Selected ? '✖️ Batal Pilih (50 WO)' : '☑️ Pilih 50 WO Pertama';
      btnSelAll.className = 'mini ' + (is50Selected ? '' : 'gray');
    } else {
      var allChecked = daftar.length > 0 && count >= daftar.length && daftar.every(function(w){ return !!selectedWoMap[String(w.id)]; });
      btnSelAll.textContent = allChecked ? '✖️ Batalkan Semua' : '☑️ Pilih Semua di Halaman Ini';
      btnSelAll.className = 'mini ' + (allChecked ? '' : 'gray');
    }
  }
}

/* ── DETAIL EXPAND & QUICK ACTIONS ── */
function toggleWoDetail(woId) {
  var sid = String(woId);
  var detailEl = document.getElementById('wo_detail_' + sid);
  var btnEl = document.getElementById('btn_detail_toggle_' + sid);
  if (!detailEl) return;
  var isExpanded = detailEl.style.display !== 'none';
  if (isExpanded) {
    detailEl.style.display = 'none';
    delete expandedWoMap[sid];
    if (btnEl) btnEl.innerHTML = '👁️ Lihat Detail';
  } else {
    detailEl.style.display = 'block';
    expandedWoMap[sid] = true;
    if (btnEl) btnEl.innerHTML = '🔼 Tutup Detail';
  }
  updateToggleAllBtnUI();
}

function toggleAllWoDetails() {
  var btn = document.getElementById('btnToggleAllDetails');
  var allPanes = document.querySelectorAll('.compact-detail-pane');
  if (!allPanes.length) return;
  
  var anyClosed = false;
  allPanes.forEach(function(pane) {
    if (pane.style.display === 'none') anyClosed = true;
  });

  allPanes.forEach(function(pane) {
    var id = pane.getAttribute('data-wo-id');
    var btnToggle = document.getElementById('btn_detail_toggle_' + id);
    if (anyClosed) {
      pane.style.display = 'block';
      expandedWoMap[id] = true;
      if (btnToggle) btnToggle.innerHTML = '🔼 Tutup Detail';
    } else {
      pane.style.display = 'none';
      delete expandedWoMap[id];
      if (btnToggle) btnToggle.innerHTML = '👁️ Lihat Detail';
    }
  });

  if (btn) btn.innerHTML = anyClosed ? '📁 Tutup Semua Detail' : '📂 Buka Semua Detail';
}

function updateToggleAllBtnUI() {
  var btn = document.getElementById('btnToggleAllDetails');
  if (!btn) return;
  var allPanes = document.querySelectorAll('.compact-detail-pane');
  if (!allPanes.length) return;
  var allOpen = true;
  allPanes.forEach(function(p) {
    if (p.style.display === 'none') allOpen = false;
  });
  btn.innerHTML = allOpen ? '📁 Tutup Semua Detail' : '📂 Buka Semua Detail';
}

function quickEditWo(woId) {
  openApproveForm(woId);
  var ovBody = document.getElementById('ovBody');
  if (ovBody && ovBody.style.display === 'none') {
    toggleOverride();
  }
}

function quickReturnWo(woId, woNumber) {
  var reason = prompt('Kembalikan ' + (woNumber || 'WO') + ' ke mekanik untuk revisi.\n\nTuliskan instruksi / alasan revisi:');
  if (!reason || !reason.trim()) return;
  var wo = null;
  for (var i = 0; i < (S.pending || []).length; i++) {
    if (String(S.pending[i].id) === String(woId)) { wo = S.pending[i]; break; }
  }
  if (!wo) return;
  var stage = (wo.status === 'pending_superintendent') ? 'superintendent' : 'supervisor';
  var op = {
    op_id: uuid(),
    seq: (_enqSeq++),
    action: 'reject',
    wo_id: wo.id,
    wo_number: wo.wo_number || wo.id,
    payload: { wo_id: wo.id, stage: stage, reason: 'Revisi: ' + reason.trim() },
    status: 'queued',
    created_at: new Date().toISOString(),
    label: 'Kembalikan ' + (wo.wo_number || wo.id)
  };
  obPut(op).then(refreshOutbox).then(function() {
    _lepasDariAntrean(wo.id);
    renderAll();
    toast('↩ ' + (wo.wo_number || 'WO') + ' dikembalikan ke mekanik untuk revisi');
    syncNow(false);
  });
}

function quickRejectWo(woId, woNumber) {
  openApproveForm(woId);
  var sec = document.getElementById('aRejectSection');
  if (sec) sec.style.display = 'block';
  var rInp = document.getElementById('aReason');
  if (rInp) {
    setTimeout(function() {
      rInp.scrollIntoView({ behavior: 'smooth' });
      rInp.focus();
    }, 150);
  }
}

function openBulkApproveModal() {
  var keys = Object.keys(selectedWoMap);
  if (keys.length === 0) {
    toast('Pilih minimal 1 WO untuk diapprove');
    return;
  }
  var count = keys.length;
  var tEl = document.getElementById('bulkConfirmTitle');
  if (tEl) tEl.textContent = '✓ Konfirmasi Bulk Approval (' + count + ' WO)';
  var dEl = document.getElementById('bulkConfirmDescCount');
  if (dEl) dEl.textContent = count;
  var cBtn = document.getElementById('bulkConfirmCountBtn');
  if (cBtn) cBtn.textContent = count;
  var sumEl = document.getElementById('bulkConfirmFooterSummary');
  if (sumEl) sumEl.textContent = count + ' WO Terpilih';
  var notesInput = document.getElementById('bulkGlobalNotes');
  if (notesInput) notesInput.value = '';

  var tbody = document.getElementById('bulkTableBody');
  if (tbody) {
    var rowsHtml = '';
    keys.forEach(function(id) {
      var w = selectedWoMap[id];
      var isL2 = w.status === 'pending_superintendent';
      var isSafety = !!w.safety_incident;
      var isRedo = (w.mtbf_redo_status === 'redo');
      var rowClasses = [];
      if (isSafety) rowClasses.push('has-safety');
      if (isRedo) rowClasses.push('has-redo');

      rowsHtml += '<tr id="bulk_row_' + esc(w.id) + '" class="' + rowClasses.join(' ') + '">' +
        '<td>' +
          '<div style="font-weight:700;color:var(--text)">' + esc(w.wo_number || w.id) + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary)">' + esc(w.component_name || '-') + (w.unit_name ? ' · ' + esc(w.unit_name) : '') + '</div>' +
        '</td>' +
        '<td style="text-align:center">' +
          '<span class="badge" style="background:' + (isL2 ? WARNA.l2 : WARNA.l1) + '">' + (isL2 ? 'L2' : 'L1') + '</span>' +
        '</td>' +
        '<td style="text-align:center">' +
          '<label style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:2px" title="Menandai adanya insiden K3 (pada Level 2 akan memicu pinalti nilai poin = 0)">' +
            '<input type="checkbox" style="width:18px;height:18px;accent-color:var(--error);cursor:pointer" ' + (isSafety ? 'checked' : '') + ' onchange="onBulkToggleSafety(\'' + esc(w.id) + '\', this.checked)">' +
          '</label>' +
        '</td>' +
        '<td style="text-align:center">' +
          '<label style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:2px" title="Menandai pekerjaan berulang / komplain garansi (menerapkan faktor pinalti MTBF)">' +
            '<input type="checkbox" style="width:18px;height:18px;accent-color:var(--warning);cursor:pointer" ' + (isRedo ? 'checked' : '') + ' onchange="onBulkToggleRedo(\'' + esc(w.id) + '\', this.checked)">' +
          '</label>' +
        '</td>' +
      '</tr>';
    });
    tbody.innerHTML = rowsHtml;
  }
  updateBulkRiskBanner();
  showModal('bulkConfirmModal');
}

function onBulkToggleSafety(woId, checked) {
  if (selectedWoMap[woId]) selectedWoMap[woId].safety_incident = checked;
  var row = document.getElementById('bulk_row_' + woId);
  if (row) {
    if (checked) row.classList.add('has-safety');
    else row.classList.remove('has-safety');
  }
  updateBulkRiskBanner();
}

function onBulkToggleRedo(woId, checked) {
  if (selectedWoMap[woId]) selectedWoMap[woId].mtbf_redo_status = checked ? 'redo' : 'first_time';
  var row = document.getElementById('bulk_row_' + woId);
  if (row) {
    if (checked) row.classList.add('has-redo');
    else row.classList.remove('has-redo');
  }
  updateBulkRiskBanner();
}

function updateBulkRiskBanner() {
  var banner = document.getElementById('bulkRiskBanner');
  if (!banner) return;
  var hasSafety = 0;
  var hasRedo = 0;
  for (var k in selectedWoMap) {
    if (selectedWoMap[k].safety_incident) hasSafety++;
    if (selectedWoMap[k].mtbf_redo_status === 'redo') hasRedo++;
  }
  if (hasSafety === 0 && hasRedo === 0) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  var msgs = [];
  if (hasSafety > 0) {
    msgs.push('⚠️ <b>Perhatian:</b> Terdapat <b>' + hasSafety + ' WO</b> yang ditandai mengalami Safety Incident. Poin teknisi akan dinolkan pada approval akhir.');
  }
  if (hasRedo > 0) {
    msgs.push('🔧 Terdapat <b>' + hasRedo + ' WO</b> yang ditandai REDO. Faktor pengurang MTBF akan diterapkan.');
  }

  banner.style.display = 'block';
  if (hasSafety > 0) {
    banner.style.background = '#FEF2F2';
    banner.style.border = '1px solid #FCA5A5';
    banner.style.color = '#991B1B';
  } else {
    banner.style.background = '#FFFBEB';
    banner.style.border = '1px solid #FDE68A';
    banner.style.color = '#92400E';
  }
  banner.innerHTML = msgs.join('<br style="margin-bottom:4px">');
}

var bulkActiveOps = [];

function startBulkApprovalQueue() {
  closeModal('bulkConfirmModal');
  var keys = Object.keys(selectedWoMap);
  if (keys.length === 0) return;

  var globalNotes = (document.getElementById('bulkGlobalNotes') || {}).value || '';
  globalNotes = globalNotes.trim();

  // 1. Buat seluruh OP keputusan dan simpan seketika ke Outbox IndexedDB PWA
  var ops = [];
  keys.forEach(function(id) {
    var item = selectedWoMap[id];
    var level = (item.status === 'pending_superintendent') ? 2 : 1;
    var action = (level === 2) ? 'approve_l2' : 'approve_l1';
    var op = {
      op_id: uuid(),
      seq: (_enqSeq++),
      action: action,
      wo_id: item.id,
      wo_number: item.wo_number || item.id,
      payload: {
        wo_id: item.id,
        safety_incident: !!item.safety_incident,
        mtbf_status: (item.mtbf_redo_status === 'redo') ? 'redo' : 'first_time',
        notes: globalNotes || 'Bulk approval antrean'
      },
      status: 'queued',
      created_at: new Date().toISOString(),
      label: (level === 1 ? 'L1' : 'L2') + ' ' + (item.wo_number || item.id)
    };
    ops.push(op);
  });

  bulkActiveOps = ops;
  bulkRunning = true;
  bulkCancelled = false;

  // 2. Simpan semua op ke IndexedDB Outbox secara persisten
  var chainSave = Promise.resolve();
  ops.forEach(function(op) {
    chainSave = chainSave.then(function() { return obPut(op); });
  });

  chainSave.then(refreshOutbox).then(function() {
    // 3. Lepaskan SEMUA kartu dari tampilan antrean seketika
    ops.forEach(function(op) {
      _lepasDariAntrean(op.wo_id);
    });
    clearSelectedWos();
    renderAll();

    // 4. Daftarkan Background Sync peramban (Chrome / Edge / Android SW)
    requestBgSync();

    // 5. Buka Modal Progress Real-Time
    var progressFill = document.getElementById('bulkProgressFill');
    var statusText = document.getElementById('bulkProgressStatusText');
    var logBox = document.getElementById('bulkLogBox');
    var btnLeaveBg = document.getElementById('btnBulkLeaveBackground');
    var btnStop = document.getElementById('btnBulkStopQueue');
    var btnDone = document.getElementById('btnBulkDoneClose');

    if (progressFill) progressFill.style.width = '0%';
    if (statusText) statusText.textContent = 'Memulai proses outbox... (0/' + ops.length + ')';
    if (logBox) logBox.innerHTML = '';
    if (btnLeaveBg) btnLeaveBg.style.display = 'block';
    if (btnStop) { btnStop.style.display = 'block'; btnStop.disabled = false; btnStop.textContent = '⏹ Batalkan Sisa'; }
    if (btnDone) btnDone.style.display = 'none';

    // Inisialisasi item log di modal
    if (logBox) {
      ops.forEach(function(op) {
        var logItem = document.createElement('div');
        logItem.className = 'bulk-log-item';
        logItem.id = 'bulk_log_' + op.wo_id;
        logItem.innerHTML = '<span>⏳ ' + esc(op.wo_number) + '</span><span>Menunggu giliran…</span>';
        logBox.appendChild(logItem);
      });
    }

    showModal('bulkProgressModal');

    // 6. Jalankan eksekusi sekuensial
    var okCount = 0;
    var failCount = 0;

    function step(index) {
      if (bulkCancelled) {
        bulkRunning = false;
        var unprocOps = ops.slice(index);
        // Hapus sisa yang belum terkirim dari Outbox agar tidak terkirim di background
        var pDel = Promise.resolve();
        unprocOps.forEach(function(uOp) {
          pDel = pDel.then(function() { return obDel(uOp.op_id); });
        });
        pDel.then(refreshOutbox).then(function() {
          if (statusText) statusText.textContent = 'Antrean dibatalkan: ' + okCount + ' berhasil, ' + unprocOps.length + ' dibatalkan';
          if (logBox) {
            var stopNotice = document.createElement('div');
            stopNotice.className = 'bulk-log-item fail';
            stopNotice.innerHTML = '<span>⚠️ Antrean dibatalkan</span><span>Sisa ' + unprocOps.length + ' WO dikembalikan</span>';
            logBox.appendChild(stopNotice);
            logBox.scrollTop = logBox.scrollHeight;
          }
          if (btnLeaveBg) btnLeaveBg.style.display = 'none';
          if (btnStop) btnStop.style.display = 'none';
          if (btnDone) btnDone.style.display = 'block';
          renderAll();
        });
        return;
      }

      if (index >= ops.length) {
        bulkRunning = false;
        if (progressFill) progressFill.style.width = '100%';
        if (statusText) statusText.textContent = 'Selesai: ' + okCount + ' berhasil, ' + failCount + ' gagal';
        if (btnLeaveBg) btnLeaveBg.style.display = 'none';
        if (btnStop) btnStop.style.display = 'none';
        if (btnDone) btnDone.style.display = 'block';
        toast('✅ Batch approval selesai!');
        if (document.hidden) notifyLocal('✅ Bulk approval (' + okCount + '/' + ops.length + ') selesai disetujui');
        refreshOutbox().then(renderAll);
        return;
      }

      var op = ops[index];
      var pct = Math.round((index / ops.length) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (statusText) statusText.textContent = 'Memproses WO (' + (index + 1) + ' dari ' + ops.length + '): ' + op.wo_number + '…';

      var logItem = document.getElementById('bulk_log_' + op.wo_id);
      if (logItem) {
        logItem.className = 'bulk-log-item running';
        logItem.innerHTML = '<span>⏳ ' + esc(op.wo_number) + '</span><span>Memproses ke server…</span>';
        if (logBox) logBox.scrollTop = logItem.offsetTop - logBox.offsetTop;
      }

      api(op.action, op.payload, op.op_id).then(function(res) {
        if (res && res.success) {
          okCount++;
          op.status = 'done';
          op.result = res.result;
          _perbaruiStatusLokal(op);
          if (logItem) {
            logItem.className = 'bulk-log-item success';
            logItem.innerHTML = '<span>✅ ' + esc(op.wo_number) + '</span><span>Berhasil disetujui ✓</span>';
          }
        } else {
          failCount++;
          var err = (res && res.error) ? (typeof res.error === 'string' ? res.error : (res.error.message || JSON.stringify(res.error))) : 'Gagal';
          op.status = 'failed';
          op.error = err;
          if (logItem) {
            logItem.className = 'bulk-log-item fail';
            logItem.innerHTML = '<span>❌ ' + esc(op.wo_number) + '</span><span title="' + esc(err) + '">Gagal: ' + esc(err.substring(0, 35)) + '</span>';
          }
        }
        obPut(op).then(refreshOutbox);
        if (progressFill) progressFill.style.width = Math.round(((index + 1) / ops.length) * 100) + '%';
        setTimeout(function() { step(index + 1); }, 350);
      }).catch(function(err) {
        // JANGAN tandai gagal permanen! Status tetap queued di Outbox PWA.
        // Chrome Background Sync / Service Worker akan otomatis melanjutkannya saat sinyal pulih.
        op.status = 'queued';
        obPut(op).then(refreshOutbox);
        requestBgSync();
        if (logItem) {
          logItem.className = 'bulk-log-item running';
          logItem.innerHTML = '<span>⏳ ' + esc(op.wo_number) + '</span><span style="color:#d97706">Sinyal terputus — aman di Outbox PWA</span>';
        }
        if (progressFill) progressFill.style.width = Math.round(((index + 1) / ops.length) * 100) + '%';
        setTimeout(function() { step(index + 1); }, 500);
      });
    }

    step(0);
  });
}

function leaveBulkToBackground() {
  closeModal('bulkProgressModal');
  toast('📲 Berjalan di background. Anda bisa menutup aplikasi atau mengunci HP — PWA akan menyelesaikan antrean otomatis.');
  syncNow(false);
}

function stopBulkQueue() {
  bulkCancelled = true;
  var btnStop = document.getElementById('btnBulkStopQueue');
  if (btnStop) {
    btnStop.disabled = true;
    btnStop.textContent = '⏳ Membatalkan…';
  }
}

function finishBulkApproval() {
  closeModal('bulkProgressModal');
  clearSelectedWos();
  renderAll();
  syncNow(true);
}

function renderPendingList(){
  var OP_KEPUTUSAN = ['approve_l1','approve_l2','reject','approve_transfer','reject_transfer'];
  var opMenunggu = {};
  (S.outbox || []).forEach(function(o) {
    if ((o.status === 'queued' || o.status === 'failed_retry') &&
        o.wo_id && OP_KEPUTUSAN.indexOf(o.action) !== -1) opMenunggu[String(o.wo_id)] = true;
  });
  var _tahap = tahapSaya();
  var milikSaya = _tahap
    ? S.pending.filter(function(wo){ return String(wo.status) === _tahap; })
    : S.pending;
  var daftar = milikSaya.filter(function(wo){ return !opMenunggu[String(wo.id)]; });
  var tertahan = milikSaya.length - daftar.length;

  if (!daftar.length) {
    return '<div class="empty">Tidak ada WO pending dalam scope Anda.' +
           (tertahan ? '<br><span class="sub">' + tertahan + ' keputusan sedang dikirim.</span>' : '') + '</div>';
  }

  var selCount = 0;
  daftar.forEach(function(w){ if (selectedWoMap[String(w.id)]) selCount++; });
  var is50Limit = daftar.length > MAX_BULK_SELECT;
  var allSelected = is50Limit ? (selCount >= MAX_BULK_SELECT) : (daftar.length > 0 && selCount === daftar.length);

  var anyExpanded = false;
  daftar.forEach(function(w){ if (expandedWoMap[String(w.id)]) anyExpanded = true; });

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">' +
    '<div>' +
      '<div class="sub" style="margin:0;font-weight:700;color:var(--text);font-size:13px">' + daftar.length + ' WO Menunggu Approval' +
        (tertahan ? ' · <span style="color:#B45309">' + tertahan + ' antre kirim</span>' : '') + '</div>' +
      (is50Limit ? '<div style="font-size:11px;color:#d97706;margin-top:2px">Maksimal ' + MAX_BULK_SELECT + ' WO per sesi bulk approval</div>' : '') +
    '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button type="button" class="mini ' + (allSelected ? '' : 'gray') + '" id="btnSelectAllWo" onclick="toggleSelectAllPending()">' +
        (is50Limit ? (allSelected ? '✖️ Batal Pilih (50 WO)' : '☑️ Pilih 50 WO Pertama')
                   : (allSelected ? '✖️ Batalkan Semua' : '☑️ Pilih Semua di Halaman Ini')) +
      '</button>' +
      '<button type="button" class="mini gray" id="btnToggleAllDetails" onclick="toggleAllWoDetails()">' +
        (anyExpanded ? '📁 Tutup Semua Detail' : '📂 Buka Semua Detail') +
      '</button>' +
    '</div>' +
  '</div>';

  daftar.forEach(function(wo){
    var wid = String(wo.id);
    var isL2 = (wo.status === 'pending_superintendent');
    var isSelected = !!selectedWoMap[wid];
    var isExpanded = !!expandedWoMap[wid];

    // Kolom 1 (Identitas & Badges Peringatan)
    var warningBadges = [];
    if (wo.duplicate_warning || wo.twin_warning || wo.is_duplicate) {
      warningBadges.push('<span class="c-badge-pill c-badge-warn" title="Peringatan WO Kembar / Mirip">⚠️ Mirip/Kembar</span>');
    }
    var revCount = wo.resubmission_count || wo.revision_count || wo.revisi_ke;
    if (revCount && revCount > 1) {
      warningBadges.push('<span class="c-badge-pill c-badge-rev">↩ Kiriman Ulang Putaran ke-' + esc(String(revCount)) + '</span>');
    }
    if (wo.created_by_is_mechanic) {
      warningBadges.push('<span class="c-badge-pill c-badge-mech">👷 Dibuat Mekanik</span>');
    }
    if (wo.wo_group_id) {
      warningBadges.push('<span class="c-badge-pill c-badge-grp">📦 Borongan</span>');
    }
    if (wo.has_override_spv || wo.has_override_supt) {
      var sWho = (wo.has_override_spv && wo.has_override_supt) ? 'L1 & L2' : (wo.has_override_spv ? 'L1' : 'L2');
      warningBadges.push('<span class="c-badge-pill" style="background:#EEF2FF;color:#4338CA;border:1px solid #C7D2FE">✏️ Override ' + sWho + '</span>');
    }

    var levelBadge = '<span class="badge" style="background:' + (isL2 ? WARNA.l2 : WARNA.l1) + ';font-size:10px;padding:2px 7px">' + (isL2 ? 'Level 2' : 'Level 1') + '</span>';

    // Kolom 2 (Unit & Lokasi)
    var locBadge = (wo.location === 'field')
      ? '<span class="badge" style="background:#0284C7;font-size:10px;padding:2px 6px">🚜 Lapangan</span>'
      : '<span class="badge" style="background:#475569;font-size:10px;padding:2px 6px">🏭 Bengkel</span>';

    // Kolom 3 (Pekerjaan)
    var compName = esc(wo.component_name || wo.job_name || '-');
    var partNum = esc(wo.component_id || wo.part_number || '-');
    var secName = esc(_kapital(wo.section || 'General'));

    // Kolom 4 (Durasi & Tim)
    var durText = '⏱️ <b>' + fmtJamMenit(wo.actual_hours) + '</b> / tgt ' + fmtJamMenit(wo.target_hours);
    var atl = wo.timeliness;
    var tlBadge = '';
    if (atl) {
      var tlBg = (atl.status === 'on_time') ? WARNA.onTime : (atl.status === 'late' ? WARNA.late : WARNA.wayLate);
      var tlLbl = _kapital(atl.label || atl.status || 'On Time');
      tlBadge = '<span class="badge" style="background:' + tlBg + ';font-size:10px;padding:2px 6px">' + esc(tlLbl) + '</span>';
    }
    var teamSummary = (wo.team_names && wo.team_names.length)
      ? wo.team_names.map(function(n){ return esc(n); }).join(', ')
      : (teamStr(wo.team) || '-');

    // Kolom 5 (Aksi Cepat)
    var btnDetailText = isExpanded ? '🔼 Tutup Detail' : '👁️ Lihat Detail';

    html += '<div class="compact-wo-item' + (isSelected ? ' selected-wo-card' : '') + '" id="wo_card_' + esc(wid) + '" onclick="onCardClick(event, \'' + esc(wid) + '\')">' +
      // Header Bar: Checkbox + WO Info + Badges (Kiri), Semua Aksi (Kanan)
      '<div class="compact-card-header">' +
        '<div class="compact-header-left">' +
          '<label class="wo-chk-wrap" onclick="event.stopPropagation()" title="Pilih untuk Bulk Approve">' +
            '<input type="checkbox" class="wo-select-chk" data-wo-id="' + esc(wid) + '" ' + (isSelected ? 'checked' : '') + ' onchange="onWoSelectChange(\'' + esc(wid) + '\', this.checked)">' +
          '</label>' +
          '<div>' +
            '<span class="c-wo-num">' + esc(wo.wo_number || wid) + '</span>' +
            '<span class="c-wo-time" style="margin-left:6px">' + esc(wo.created_at_str || '-') + '</span>' +
          '</div>' +
          '<div class="c-badges-wrap" style="margin-left:4px">' +
            levelBadge +
            warningBadges.join('') +
          '</div>' +
        '</div>' +

        '<div class="compact-header-actions">' +
          '<button type="button" class="btn-detail-toggle" id="btn_detail_toggle_' + esc(wid) + '" onclick="event.stopPropagation(); toggleWoDetail(\'' + esc(wid) + '\')">' + btnDetailText + '</button>' +
          '<button type="button" class="btn-act-approve" onclick="event.stopPropagation(); openApproveForm(\'' + esc(wid) + '\')">✓ Approve</button>' +
          '<button type="button" class="btn-act-icon" title="Edit Override" onclick="event.stopPropagation(); quickEditWo(\'' + esc(wid) + '\')">✏️ Edit</button>' +
          '<button type="button" class="btn-act-icon" title="Kembalikan (Minta Revisi)" onclick="event.stopPropagation(); quickReturnWo(\'' + esc(wid) + '\', \'' + esc(wo.wo_number) + '\')">↩ Kembalikan</button>' +
          '<button type="button" class="btn-act-icon danger" title="Batalkan WO" onclick="event.stopPropagation(); openCancelForm(\'' + esc(wid) + '\', \'' + esc(wo.wo_number) + '\')">🚫 Batal</button>' +
          '<button type="button" class="btn-act-icon danger" title="Tolak WO" onclick="event.stopPropagation(); quickRejectWo(\'' + esc(wid) + '\', \'' + esc(wo.wo_number) + '\')">✗ Tolak</button>' +
        '</div>' +
      '</div>' +

      // Body Grid: 4 Kolom Informasi Tertata
      '<div class="compact-card-body">' +
        // Kolom 1: Unit & Lokasi
        '<div class="c-col">' +
          '<div class="c-cell-k">🚜 UNIT & LOKASI</div>' +
          '<div class="c-unit-title">' + esc(wo.unit_name || wo.unit_id || '-') + '</div>' +
          (wo.unit_name && wo.unit_id ? '<div class="c-sub-info">ID: ' + esc(wo.unit_id) + '</div>' : '') +
          '<div style="margin-top:2px">' + locBadge + '</div>' +
        '</div>' +

        // Kolom 2: Pekerjaan
        '<div class="c-col">' +
          '<div class="c-cell-k">📁 PEKERJAAN</div>' +
          '<div class="c-job-name" title="' + compName + '">' + compName + '</div>' +
          '<div class="c-sub-info">Part: ' + partNum + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);font-weight:600">' + secName + '</div>' +
        '</div>' +

        // Kolom 3: Durasi & Timeliness
        '<div class="c-col">' +
          '<div class="c-cell-k">⏱️ DURASI & TARGET</div>' +
          '<div class="c-duration-text">' + durText + '</div>' +
          '<div style="display:flex;align-items:center;gap:4px;margin-top:2px">' + tlBadge + '</div>' +
        '</div>' +

        // Kolom 4: Tim Mekanik
        '<div class="c-col">' +
          '<div class="c-cell-k">👥 TIM MEKANIK</div>' +
          '<div class="c-team-summary" title="' + teamSummary + '">' + teamSummary + '</div>' +
        '</div>' +
      '</div>' +

      // Expandable Detail Accordion Pane
      renderWoDetailPane(wo, isL2, wid) +
    '</div>';
  });

  return html;
}

function renderWoDetailPane(wo, isL2, wid) {
  var isExpanded = !!expandedWoMap[wid];
  var html = '<div class="compact-detail-pane" id="wo_detail_' + esc(wid) + '" data-wo-id="' + esc(wid) + '" style="' + (isExpanded ? 'display:block' : 'display:none') + '">';

  // 1. Peringatan WO Kembar
  var twinInfo = wo.duplicate_warning || wo.twin_warning || wo.twin_info;
  if (twinInfo) {
    var twinText = (typeof twinInfo === 'string') ? twinInfo : JSON.stringify(twinInfo);
    html += '<div class="detail-section-box warn">' +
      '⚠️ <b>Peringatan WO Kembar / Mirip:</b> ' + esc(twinText) +
      '<div style="font-size:11px;margin-top:4px">Periksa selisih jam pengerjaan, nama mekanik pembuat, dan status pembayaran sebelum mengesahkan.</div>' +
    '</div>';
  } else {
    html += '<div class="detail-section-box ok">' +
      '✅ <b>Verifikasi Duplikasi:</b> Tidak terdeteksi WO kembar/duplikat dalam periode ini.' +
    '</div>';
  }

  // 2. Riwayat Pengembalian / Revisi
  var revInfo = wo.revision_history || wo.return_reason || wo.return_note || wo.revision_notes;
  if (revInfo) {
    var revText = (typeof revInfo === 'string') ? revInfo : JSON.stringify(revInfo);
    html += '<div class="detail-section-box info">' +
      '↩️ <b>Riwayat Pengembalian / Revisi Sebelumnya:</b><br>' + esc(revText) +
    '</div>';
  }

  // 3. Rincian Ban / Tyre (khusus rekondisi / tyreman)
  var isTyre = (wo.section === 'vessel' || wo.section === 'tyreman' || !!wo.tyre_data || !!wo.tyre_position);
  if (isTyre) {
    var tPos = wo.tyre_position || wo.posisi_ban || '-';
    var tPresB = wo.tyre_pressure_before || '-';
    var tPresA = wo.tyre_pressure_after || '-';
    var tRtd = wo.tyre_rtd || '-';
    var tTemp = wo.tyre_temp || '-';
    var tAct = wo.tyre_action || wo.tyre_status || 'Lepas / Pasang / Repair';
    html += '<div class="detail-section-box" style="background:#F0FDF4;border:1px solid #BBF7D0;color:#166534">' +
      '<b style="text-transform:uppercase;font-size:11px">🛞 Rincian Pemeriksaan Ban (Tyre):</b>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:6px">' +
        '<div>Posisi: <b>' + esc(String(tPos)) + '</b></div>' +
        '<div>Tekanan: <b>' + esc(String(tPresB)) + ' → ' + esc(String(tPresA)) + ' PSI</b></div>' +
        '<div>RTD: <b>' + esc(String(tRtd)) + ' mm</b></div>' +
        '<div>Suhu: <b>' + esc(String(tTemp)) + ' °C</b></div>' +
        '<div>Tindakan: <b>' + esc(String(tAct)) + '</b></div>' +
      '</div>' +
    '</div>';
  }

  // 4. Grid Spesifikasi
  var effPoints = (wo.base_points || 0) * (wo.unit_factor || 1) * (wo.timeliness ? (wo.timeliness.factor || 1) : 1);
  html += '<div class="detail-grid-specs">' +
    '<div class="spec-item"><span class="spec-k">Komponen / Job</span><span class="spec-v">' + esc(wo.component_name || '-') + '</span></div>' +
    '<div class="spec-item"><span class="spec-k">Nomor Part / ID</span><span class="spec-v">' + esc(wo.component_id || wo.part_number || '-') + '</span></div>' +
    '<div class="spec-item"><span class="spec-k">Unit &amp; Tipe</span><span class="spec-v">' + esc(wo.unit_name || '-') + ' (' + esc(wo.unit_id || '-') + ')</span></div>' +
    '<div class="spec-item"><span class="spec-k">Unit Factor</span><span class="spec-v">' + (wo.unit_factor || 1) + ' <small style="color:var(--text-secondary)">(tetap)</small></span></div>' +
    '<div class="spec-item"><span class="spec-k">Kondisi Kerja</span><span class="spec-v">' + esc(wcLabel(wo.work_condition)) + '</span></div>' +
    '<div class="spec-item"><span class="spec-k">Lokasi Kerja</span><span class="spec-v">' + esc(locLabel(wo.location)) + '</span></div>' +
    '<div class="spec-item"><span class="spec-k">Base Points</span><span class="spec-v">' + (wo.base_points || 0) + ' pts</span></div>' +
    '<div class="spec-item"><span class="spec-k">Estimasi Poin Akhir</span><span class="spec-v" style="color:var(--primary)">' + Math.round(effPoints * 10) / 10 + ' pts</span></div>' +
    '<div class="spec-item"><span class="spec-k">Waktu Pengerjaan</span><span class="spec-v">' + fmtJamMenit(wo.actual_hours) + ' (Target: ' + fmtJamMenit(wo.target_hours) + ')</span></div>' +
    '<div class="spec-item"><span class="spec-k">Pembuat WO</span><span class="spec-v">' + esc(wo.created_by_name || wo.created_by || '-') + '</span></div>' +
  '</div>';

  // Overrides & Judgment jika ada
  if (wo.has_override_spv || wo.has_override_supt || wo.judgment) {
    html += '<div class="detail-section-box" style="background:#EEF2FF;border:1px solid #C7D2FE;color:#3730A3">' +
      '<b>✏️ Overrides &amp; Catatan Judgment Approver:</b><br>' +
      (wo.judgment ? '<div style="margin-top:4px">💬 Judgment: <i>' + esc(wo.judgment) + '</i></div>' : '') +
      '<div style="font-size:11px;margin-top:4px;color:#4338CA">' +
        (wo.has_override_spv ? '• Override disimpan oleh L1 (Supervisor)<br>' : '') +
        (wo.has_override_supt ? '• Override disimpan oleh L2 (Superintendent)<br>' : '') +
      '</div>' +
    '</div>';
  }

  // Teks Keterangan Lengkap
  if (wo.keterangan) {
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">' +
      '<div style="font-weight:700;font-size:11px;color:var(--text-secondary);text-transform:uppercase;margin-bottom:4px">📝 Keterangan Pengerjaan:</div>' +
      '<div style="color:var(--text);font-size:12.5px;line-height:1.4">' + esc(wo.keterangan) + '</div>' +
    '</div>';
  }

  // 5. Daftar Anggota Tim Mekanik & Kontribusi
  var team = wo.team || [];
  html += '<div class="detail-team-box">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<b style="font-size:11px;text-transform:uppercase;color:var(--text-secondary)">👥 Tim Mekanik &amp; Persentase Kontribusi:</b>' +
      '<span style="font-size:11px;color:var(--primary);font-weight:700">' + team.length + ' Mekanik</span>' +
    '</div>';

  if (team.length > 0) {
    var sharePerMech = Math.round(100 / team.length);
    html += '<table class="team-table">' +
      '<thead>' +
        '<tr>' +
          '<th>Nama Mekanik</th>' +
          '<th>ID / NIK</th>' +
          '<th style="text-align:right">Kontribusi</th>' +
          '<th style="text-align:right">Poin</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>';
    team.forEach(function(m) {
      var mName = (typeof m === 'string') ? m : esc(m.mechanic_name || m.name || '-');
      var mId = (typeof m === 'string') ? '-' : esc(m.mechanic_id || m.id || '-');
      var mPct = (typeof m === 'object' && (m.share_pct || m.contribution_pct)) ? (m.share_pct || m.contribution_pct) : sharePerMech;
      html += '<tr>' +
        '<td><b>' + mName + '</b></td>' +
        '<td style="color:var(--text-secondary)">' + mId + '</td>' +
        '<td style="text-align:right;font-weight:700;color:var(--primary)">' + mPct + '%</td>' +
        '<td style="text-align:right;font-weight:700">' + (wo.base_points || 0) + ' pts</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  } else {
    var tNames = (wo.team_names || []).join(', ') || '-';
    html += '<div style="margin-top:6px;color:var(--text)">' + esc(tNames) + ' <span class="sub" style="display:inline">(Kontribusi penuh 100%)</span></div>';
  }
  html += '</div>';

  // Bottom action shortcut inside expanded detail
  html += '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">' +
    '<button type="button" class="mini" style="background:#10B981;color:#fff" onclick="event.stopPropagation(); openApproveForm(\'' + esc(wid) + '\')">✓ Approve WO Ini</button>' +
    '<button type="button" class="mini secondary" onclick="event.stopPropagation(); toggleWoDetail(\'' + esc(wid) + '\')">🔼 Tutup Detail</button>' +
  '</div>';

  html += '</div>';
  return html;
}
function renderActiveList(){
  if (!S.active.length) return '<div class="empty">Tidak ada WO aktif (belum di-submit mekanik).</div>';
  var html='<div class="sub">'+S.active.length+' WO aktif — belum di-submit mekanik</div>';
  S.active.forEach(function(wo){
    var othersBadge = wo.is_others ? '<span class="badge" style="background:'+WARNA.others+'">Others</span>' : '';
    html+='<div class="card"><div class="cardTop"><b>'+esc(wo.wo_number)+'</b><span class="badge" style="background:#5E5E5E">📝 Belum diisi</span>'+
      (wo.section?'<span class="badge" style="background:#334155">'+esc(wo.section)+'</span>':'')+othersBadge+'</div>'+
      // Label–nilai sejajar, sama seperti kartu approval. Unit WAJIB ada:
      // tanpa itu approver tahu pekerjaannya apa tapi tidak tahu di alat mana.
      '<div class="cardBody"><b>'+esc(wo.component_name||'-')+'</b>'+
      '<div class="woInfo">'+
        '<span class="k">Unit</span><span class="v">'+esc(wo.unit_name||'-')+'</span>'+
        '<span class="k">Lokasi</span><span class="v">'+esc(locLabel(wo.location))+'</span>'+
        '<span class="k">Kondisi</span><span class="v">'+esc(wcLabel(wo.work_condition))+'</span>'+
        ((wo.created_by_name||wo.created_by)?'<span class="k">Pembuat</span><span class="v">'+esc(wo.created_by_name||wo.created_by)+'</span>':'')+
        '<span class="k">Tim</span><span class="v">'+(wo.team_names||[]).map(function(n){return esc(n);}).join(', ')+'</span>'+
      '</div></div>'+
      (wo.keterangan?'<div class="ket">📝 '+esc(wo.keterangan)+'</div>':'')+
      (function(){ var q=queuedOpFor(wo.id); return q ? queuedNote(q) : cancelBtn(wo); })()+'</div>';
  });
  return html;
}
function renderApprovedList(){
  if (!S.approved.length) return '<div class="empty">Belum ada WO disetujui bulan ini.<br>Bulan sebelumnya diambil lewat Export Payroll.</div>';
  // Sebut batasnya terang-terangan: daftar ini BULAN BERJALAN, bukan seluruh
  // riwayat. Tanpa kalimat ini orang mencari WO bulan lalu lalu mengira hilang.
  var html='<div class="sub">'+S.approved.length+' WO disetujui bulan ini (maks 100 terbaru) · bulan sebelumnya lewat Export Payroll</div>';
  S.approved.forEach(function(wo){
    var othersBadge = wo.is_others ? '<span class="badge" style="background:'+WARNA.others+'">Others</span>' : '';
    var safety = wo.safety_incident ? '<span class="badge" style="background:#b91c1c">SAFETY</span>' : '';
    html+='<div class="card"><div class="cardTop"><b>'+esc(wo.wo_number)+'</b><span class="badge" style="background:#15803d">✅ Approved</span>'+
      (wo.section?'<span class="badge" style="background:#334155">'+esc(wo.section)+'</span>':'')+othersBadge+safety+'</div>'+
      '<div class="cardBody"><b>'+esc(wo.component_name||'-')+'</b>'+
      // Unit disebut di kartu approved. Sebelumnya tidak dikirim server sama
      // sekali, jadi saat menengok pekerjaan yang sudah selesai tak ada
      // keterangan unitnya — padahal itu yang dipakai mencocokkan.
      (wo.unit_name?' · '+esc(wo.unit_name):'')+'<br>'+
      '📍 Lokasi: '+esc(locLabel(wo.location))+'<br>'+
      'Poin: '+(wo.final_points||0)+' · Rp '+fmtIdr(wo.final_idr||0)+'<br>'+
      'Aktual: '+fmtJamMenit(wo.actual_hours)+
      (wo.created_at_str?' · '+esc(wo.created_at_str):'')+'<br>'+
      '👥 Tim: '+(wo.team_names||[]).map(function(n){return esc(n);}).join(', ')+'</div>'+
      (wo.keterangan?'<div class="ket">📝 '+esc(wo.keterangan)+'</div>':'')+
      (function(){ var q=queuedOpFor(wo.id); return q ? queuedNote(q) : cancelBtn(wo); })()+'</div>';
  });
  return html;
}

/* ── Init ── */
window.addEventListener('online',function(){renderAll(); syncNow(false);});
window.addEventListener('offline',renderAll);
/* Picker 24 jam dibangun SINKRON, sebelum apa pun memanggil dtSet. app.js
 * dimuat di akhir <body>, jadi slot-slotnya sudah ada di DOM saat baris ini
 * jalan — tidak boleh menunggu openDb() yang asinkron. */
(function() {
  var slot = {slotFStart:'fStart', slotFEnd:'fEnd', slotAOvStart:'aOvStart', slotAOvEnd:'aOvEnd'};
  for (var k in slot) {
    var el = document.getElementById(k);
    if (el) el.innerHTML = dtHtml(slot[k]);
  }
  dtPasang();
  // Dulu kedua handler ini inline di atribut onchange input override. Sekarang
  // dipasang pada input HIDDEN — di situlah dtKumpulkan() memicu 'change'
  // setelah tanggal/jam/menit di layar berubah.
  ['aOvStart','aOvEnd'].forEach(function(id) {
    var h = document.getElementById(id);
    if (h) h.addEventListener('change', function(){ aOvHitungDurasi(); perbaruiPenjagaOverride(); });
  });
  ['fStart','fEnd'].forEach(function(id) {
    var h = document.getElementById(id);
    if (h) h.addEventListener('change', fHitungDurasi);
  });
})();

openDb().then(function() {
  return Promise.all([kvGet('token'),kvGet('me'),kvGet('wos'),kvGet('refs'),kvGet('pending'),kvGet('last_sync'),kvGet('role'),kvGet('refs_at'),kvGet('active'),kvGet('approved'),kvGet('transfers'),kvGet('timer_states'),kvGet('monitoring'),kvGet('monitoring_overall'),kvGet('rejected')]);
}).then(function(v) {
  S.token=v[0]||null; S.me=v[1]||null; S.wos=v[2]||[]; S.refs=v[3]||null; S.pending=v[4]||[]; S.lastSync=v[5]||null; S.role=v[6]||'mechanic'; S.refsAt=v[7]||null; S.active=v[8]||[]; S.approved=v[9]||[]; S.transfers=v[10]||[]; S.timerStates=v[11]||{}; S.monitoring=v[12]||[]; S.monitoringOverall=v[13]||{}; S.rejected=v[14]||[];
  return refreshOutbox();
}).then(function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      _swReg = reg;
      cekPembaruan();                        // cek sekali saat app dibuka
    }).catch(function(){});
    // Auto-reload SEKALI saat SW baru mengambil alih → update otomatis, user TIDAK perlu hapus cache.
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (_swReloaded) return;
      // Jangan buang isian yang sedang diketik: tahan sampai modal ditutup.
      if (adaModalTerbuka()) { _swPendingReload = true; toast('⬆️ Versi baru siap — dimuat setelah jendela ini ditutup'); return; }
      _lakukanReloadSW();
    });
    // PWA sering dibiarkan terbuka berhari-hari tanpa navigasi — tanpa pemicu ini
    // pengecekan versi tak pernah jalan dan HP tetap di versi lama diam-diam.
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') cekPembaruan();
    });
    window.addEventListener('online', cekPembaruan);
  }
  // Medan meter dibuang SAAT MUAT, bukan menunggu handler section. Kalau
  // hanya dibuang di sana, layar Buat WO yang terbuka lebih dulu sempat
  // memperlihatkannya — berkedip sebentar lalu hilang, yang terbaca sebagai
  // aplikasi rusak, bukan sebagai medan yang memang ditiadakan.
  setelMeterCreate();
  syncVersionFromCache().then(function(){ showScreen(S.token?'main':'login'); renderAll(); });
  showScreen(S.token?'main':'login');
  // Timer bisa masih berjalan dari sesi sebelumnya (state tersimpan di IndexedDB)
  startTimerTicker();
  if (S.token) requestPeriodicSync();
  // iOS: beforeinstallprompt tak pernah ada → tampilkan tombol Instal manual (panduan)
  if (IS_IOS && !IS_STANDALONE) { var _ib = document.getElementById('installBtn'); if (_ib) _ib.style.display = ''; }
  renderAll();
  if (S.token && navigator.onLine) {
    // Refresh role dari server tiap buka (self-heal role lama yg salah — tanpa perlu logout/login).
    api('ping').then(function(r){
      if (r.success && r.result && r.result.role && r.result.role !== S.role) {
        S.role = r.result.role; kvSet('role', S.role); renderAll();
      }
      // Penanda WO mandiri bisa dinyalakan atau dicabut kapan saja di spreadsheet.
      // Ikut disegarkan, supaya tab Buat WO muncul/hilang tanpa logout.
      if (r.success && r.result && (!S.me || !!S.me.wo_mandiri !== !!r.result.wo_mandiri)) {
        if (!S.me) S.me = r.result; else S.me.wo_mandiri = !!r.result.wo_mandiri;
        kvSet('me', S.me); renderAll();
      }
    }).catch(function(){});
    syncNow(false);
  }
});
