var CACHE = 'mar-projek-v4';
var ASSETS = ['./', './index.html', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', function(e) {
  // cache:'reload' — WAJIB. addAll() memakai cache HTTP biasa, jadi app.js bisa
  // terambil versi basi (GitHub Pages max-age=600) sementara nama cache sudah
  // versi baru. Akibatnya label versi mengaku v-baru padahal kode yang jalan
  // v-lama — persis kebohongan versi yang dulu terjadi (APP_VERSION v26 vs v34).
  e.waitUntil(caches.open(CACHE).then(function(c) {
    return Promise.all(ASSETS.map(function(u) {
      return fetch(new Request(u, {cache: 'reload'})).then(function(r) { return c.put(u, r); });
    }));
  }));
  self.skipWaiting();
});
/* Hanya cache MILIK SISTEM INI yang disapu — perhatikan awalan 'mar-projek-v'.
   Aslinya baris ini membuang SEMUA cache yang namanya bukan CACHE saat ini.
   Cache Storage dibagi per-ORIGIN, bukan per-folder, jadi kalau dua PWA MAR
   hidup di akun hosting yang sama, yang satu akan menghapus aplikasi offline
   yang lain begitu ia aktif sekali saja — dan pemakainya kehilangan aplikasi
   tanpa tahu kenapa. Memberi nama cache yang berbeda TIDAK menolong; justru
   nama berbedalah yang membuatnya terhapus. Penyaring awalan inilah yang
   menolong: versi lama Projek tetap dibersihkan, tetangga tidak disentuh. */
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){
      return k !== CACHE && k.indexOf('mar-projek-v') === 0;
    }).map(function(k){return caches.delete(k);}));
  }));
  self.clients.claim();
});
/* ── Background Sync: kirim antrean walau app sudah ditutup ──
   Saat sinyal kembali, Chrome membangunkan SW ini → flush outbox dari
   IndexedDB. Kalau masih gagal (offline), promise reject → Chrome retry
   otomatis dgn backoff. Server dedup via op_id (ProcessedOps) → aman dobel. */
// ⚠️ SALINAN BACA — dikosongkan dengan sengaja. Lihat catatan di app.js.
//
// Service worker tidak bisa membaca variabel dari halaman, jadi nilainya memang
// harus ditulis dua kali. Kalau kelak diisi, isi KEDUANYA — app.js dan berkas
// ini — dengan URL yang sama. Kalau berbeda, halaman dan service worker akan
// bicara ke dua sistem berlainan, dan gejalanya nyaris mustahil dibaca.
var API_URL = './api';
function swDb() {
  return new Promise(function(res, rej) {
    var r = indexedDB.open('mar_projek_v1', 1);
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ rej(r.error); };
  });
}
function swReq(d, store, mode, fn) {
  return new Promise(function(res, rej) {
    var rq = fn(d.transaction(store, mode).objectStore(store));
    rq.onsuccess = function(){ res(rq.result); };
    rq.onerror = function(){ rej(rq.error); };
  });
}
/**
 * @param {string} body isi notifikasi
 * @param {string=} tag  penanda. Notifikasi ber-tag SAMA saling MENIMPA.
 *
 * Dulu tag selalu `'mar-' + body.slice(0,16)`. Enam belas karakter pertama
 * pesan antrean approver ("📋 WO masuk antr…") dan pesan WO baru mekanik
 * ("📝 WO baru: WO-2…") SELALU sama, jadi setiap kabar menimpa kabar
 * sebelumnya: dua WO datang berurutan, yang terlihat hanya yang terakhir.
 * Sekarang tag disebut TERANG-TERANGAN di tiap pemanggil — menimpa kalau
 * memang disengaja, berdiri sendiri kalau isinya beda.
 */
function swNotify(body, tag) {
  try {
    if (self.Notification && Notification.permission === 'granted') {
      return self.registration.showNotification('MAR BUPR', {
        body: body, icon: './icon-192.png', badge: './icon-192.png',
        // Tanpa tag khusus: seluruh isi jadi penandanya, bukan 16 huruf pertama.
        tag: tag || ('mar-' + body.replace(/\s+/g, ' '))
      });
    }
  } catch (e) {}
  return Promise.resolve();
}
function swFlushOutbox() {
  var sent = 0;
  var adaRamai = false;
  return swDb().then(function(d) {
    return swReq(d, 'kv', 'readonly', function(s){ return s.get('token'); }).then(function(token) {
      if (!token) return;
      return swReq(d, 'outbox', 'readonly', function(s){ return s.getAll(); }).then(function(items) {
        var queue = (items || []).filter(function(it){ return it.status === 'queued' || it.status === 'failed_retry'; });
        var chain = Promise.resolve();
        queue.forEach(function(it) {
          chain = chain.then(function() {
            return fetch(API_URL, {
              method: 'POST', headers: {'Content-Type': 'text/plain'},
              body: JSON.stringify({token: token, action: it.action, data: it.payload || {}, op_id: it.op_id})
            }).then(function(r){
              return r.text().then(function(txt) {
                try { return JSON.parse(txt); }
                catch(e) { return { success: false, error: txt ? txt.slice(0, 150) : ('HTTP ' + r.status) }; }
              });
            }).then(function(r) {
              if (r.success) { it.status = 'done'; it.result = r.result; sent++; }
              // retry_later = server ramai → tetap antre, jangan ditandai gagal.
              else if (r.retry_later) { it.status = 'queued'; it.error = ''; adaRamai = true; }
              else { it.status = 'failed'; it.error = (typeof r.error === 'string') ? r.error : JSON.stringify(r.error); }
              return swReq(d, 'outbox', 'readwrite', function(s){ return s.put(it); });
            });
            // fetch gagal (masih offline) → reject → status tetap 'queued' → Chrome retry
          });
        });
        // Notif "tidak lagi antre" — juga saat kirim sebagian lalu putus (rethrow utk retry)
        return chain
          .then(function(){ if (sent > 0) return swNotify('✅ ' + sent + ' operasi terkirim — tidak lagi antre'); })
          // Server ramai: SENGAJA dilempar supaya peramban menjadwalkan ulang
          // background sync-nya. Tanpa ini event 'sync' dianggap sukses, tak ada
          // percobaan berikutnya, dan op menganggur sampai aplikasi dibuka.
          .then(function(){ if (adaRamai) throw new Error('server ramai — dicoba lagi'); })
          .catch(function(err) {
            var p = sent > 0 ? swNotify('✅ ' + sent + ' operasi terkirim — sisanya menunggu sinyal') : Promise.resolve();
            return p.then(function(){ throw err; });
          });
      });
    });
  });
}
/* Cek pembaruan WO → notif SPESIFIK via diff snapshot status (kv sw_snap):
   - id baru muncul     → mekanik: "📝 WO baru"; approver: "📋 menunggu approval"
   - status → approved  → "✅ disetujui"   (juga bila hilang dari daftar setelah L2 = diarsip)
   - status → rejected  → "❌ ditolak"
   Run pertama (belum ada snapshot) = simpan senyap, tanpa notif (anti-spam).
   @return jumlah pesan yang dinotifkan */
function swCheckPending() {
  return swDb().then(function(d) {
    return Promise.all([
      swReq(d, 'kv', 'readonly', function(s){ return s.get('token'); }),
      swReq(d, 'kv', 'readonly', function(s){ return s.get('role'); })
    ]).then(function(v) {
      var token = v[0], role = v[1] || 'mechanic';
      if (!token) return 0;
      var isApprover = (role !== 'mechanic');
      var action = isApprover ? 'pull_pending' : 'pull_my_wos';
      return fetch(API_URL, {method: 'POST', headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({token: token, action: action, data: {}})})
        .then(function(r){ return r.json(); })
        .then(function(r) {
          if (!r.success || !r.result) return 0;
          var list = isApprover ? (r.result.pending || []) : (r.result.wos || []);
          if (isApprover) {
            // hanya stage milik peran ini (L1: pending_supervisor, L2: pending_superintendent)
            var want = (role === 'superintendent') ? 'pending_superintendent' : 'pending_supervisor';
            list = list.filter(function(w){ return String(w.status) === want; });
          }
          var cur = {};
          for (var li = 0; li < list.length; li++) {
            var w = list[li];
            cur[String(w.id)] = {s: String(w.status), n: String(w.wo_number || w.id), d: !!w.dibuat_sendiri};
          }
          return swReq(d, 'kv', 'readonly', function(s){ return s.get('sw_snap'); }).then(function(prev) {
            var save = function(){ return swReq(d, 'kv', 'readwrite', function(s){ return s.put(cur, 'sw_snap'); }); };
            if (prev === undefined || prev === null) return save().then(function(){ return 0; });
            var msgs = [];
            var stageLbl = (role === 'superintendent') ? '(L2)' : '(L1)';
            for (var id in cur) {
              if (!prev[id]) {
                // "masuk antrean", bukan "perlu di-approve". Antreannya dipegang
                // bersama — kalimat perintah membuat approver merasa ditugasi
                // secara pribadi, lalu merasa gagal saat rekannya lebih dulu.
                if (isApprover) msgs.push('📋 WO masuk antrean ' + stageLbl + ': ' + cur[id].n);
                // WO mandiri yang baru dibuat sendiri bukan kabar baru bagi pembuatnya.
                else if (cur[id].s === 'pending_mechanic_work' && !cur[id].d) msgs.push('📝 WO baru: ' + cur[id].n);
              } else if (prev[id].s !== cur[id].s) {
                if (cur[id].s === 'approved') msgs.push('✅ ' + cur[id].n + ' disetujui');
                else if (cur[id].s === 'rejected') msgs.push('❌ ' + cur[id].n + ' ditolak');
              }
            }
            if (!isApprover) {
              // hilang dari daftar setelah menunggu L2 = disetujui & diarsip
              for (var pid in prev) {
                if (!cur[pid] && prev[pid].s === 'pending_superintendent') msgs.push('✅ ' + prev[pid].n + ' disetujui');
              }
            }
            var p = Promise.resolve();
            if (msgs.length) {
              var body = msgs.slice(0, 3).join('\n') + (msgs.length > 3 ? '\n+' + (msgs.length - 3) + ' lainnya' : '');
              // Antrean approver: SATU kabar yang berdiri dan selalu mutakhir —
              // sengaja saling menimpa supaya tidak menumpuk. Kabar lain
              // (WO baru, disetujui, ditolak) berdiri sendiri-sendiri.
              p = swNotify(body, isApprover ? 'mar-antrean' : undefined);
            }

            // ── Tutup notifikasi approver yang sudah basi ─────────────────────
            // Antrean approval dipegang beberapa orang. Semua dapat kabar
            // bersamaan; begitu satu menanganinya, kabar di HP yang lain jadi
            // basi — dan orang itu membuka aplikasi, tak menemukan apa pun,
            // lalu merasa lalai atas pekerjaan yang sebenarnya sudah beres.
            //
            // Notifikasinya kabar, bukan tugas. Kalau WO yang disebut sudah
            // tidak ada di antreannya, notifikasinya ditarik kembali.
            //
            // HANYA approver: notifikasi mekanik ("✅ disetujui") justru harus
            // bertahan — WO-nya memang sudah keluar dari daftar, dan itulah
            // kabar baik yang ingin dia lihat.
            if (isApprover) {
              var nomorAktif = {};
              for (var ck in cur) nomorAktif[cur[ck].n] = true;
              p = p.then(function() {
                return self.registration.getNotifications().then(function(daftar) {
                  for (var ni = 0; ni < daftar.length; ni++) {
                    var teks = String(daftar[ni].body || '');
                    var nomor = teks.match(/WO-[0-9A-Za-z\-]+/g);
                    if (!nomor || !nomor.length) continue;   // bukan kabar ber-WO → biarkan
                    var masihAda = false;
                    for (var nj = 0; nj < nomor.length; nj++) if (nomorAktif[nomor[nj]]) masihAda = true;
                    if (!masihAda) daftar[ni].close();
                  }
                }).catch(function(){});
              });
            }

            return p.then(save).then(function(){ return msgs.length; });
          });
        });
    });
  }).catch(function(){ return 0; });
}

/* ── WEB PUSH: server ping payload-less → tarik data → notif spesifik.
   userVisibleOnly=true mewajibkan SELALU tampil notif → fallback generik. ── */
self.addEventListener('push', function(e) {
  e.waitUntil(
    swFlushOutbox().catch(function(){})
      .then(function(){ return swCheckPending(); })
      .then(function(n){ if (!n) return swNotify('🔄 Data MAR diperbarui'); })
  );
});
self.addEventListener('sync', function(e) {
  if (e.tag === 'mar-outbox') e.waitUntil(swFlushOutbox().then(swCheckPending));
});
self.addEventListener('periodicsync', function(e) {
  if (e.tag === 'mar-check') e.waitUntil(swFlushOutbox().then(swCheckPending));
});
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Permintaan ber-query (mis. cek versi './sw.js?cek=<timestamp>') SELALU unik,
  // jadi kalau ikut disimpan, cache menggelembung tanpa batas — satu entri baru
  // tiap kali tombol Versi ditekan. Lewatkan saja ke jaringan.
  if (url.search) return;
  e.respondWith(
    caches.match(e.request).then(function(hit) {
      if (hit) return hit;
      return fetch(e.request).then(function(resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function(c){c.put(e.request,copy);});
        return resp;
      }).catch(function(){return caches.match('./index.html');});
    })
  );
});
