/**
 * Worker rumah "GAS asli di Worker" (keputusan Gabriel 14 Nov 2026), dipakai bersama semua rumah yang profilnya punya
 * bagian gas di config/rumah.json. Kode GAS rumah yang ASLI (gas/gas-kamar.js milik Worker rumah, dibungkus
 * tools/kembar/bundel-gas.mjs dari versi yang dipatok) dijalankan di atas cermin Supabase.
 *
 *   POST ./api      kontrak API PWA, sama dengan web app GAS: text/plain berisi {token, action, op_id, data}.
 *                   aksi_worker (baca) dan aksi_tulis_worker (tulis) dijawab di sini; aksi lain diteruskan ke GAS.
 *   GET  /web       MAR Web: doGet GAS beserta template HtmlService-nya (?token=…&page=…).
 *   POST /web/run   google.script.run dari halaman web, hanya untuk fungsi di INFO.fungsiWeb.
 *
 * Tulisan kode GAS disimpan lewat public.cermin_tulis dalam satu transaksi (konkurensi optimistis), dan hanya
 * bila Supabase sumber datanya: saklar `supabase`, atau lingkungan tanpa GAS.
 *
 * Notifikasi push (PushService.gs): kunci VAPID rahasia Worker (VAPID_PRIVATE_PEM, VAPID_PUBLIC_B64URL) menjadi Script
 * Properties GAS. Web push yang diminta kode GAS dicatat shim dan dikirim SESUDAH tulisannya tersimpan (ctx.waitUntil),
 * hanya ke layanan push yang dikenal; jawaban 404/410 mematikan langganan persis seperti GAS (PushSubs kolom
 * is_active). Ruang uji (SKEMA_AWALAN): PushSubs salinan berisi langganan HP sungguhan, jadi tidak ada yang dikirim
 * kecuali ke penerima uji sendiri (PUSH_UJI_AWALAN).
 *
 * Pemakaian di Worker rumah:  import * as bundel from '../gas/gas-kamar.js';
 *                             export default buatWorkerRumah(bundel);
 * Penjelasan lengkap: workers/kmbbupr/README.md.
 */
import PROFIL_RUMAH from './profil-rumah.js';
import { buatLayanan, buatPermintaanPost, buatPermintaanGet, hasilRun, dataDariCermin } from './gas-layanan.js';
import { buatHost } from './gas-host.js';
import { bacaStatusSaklar } from './saklar.js';
import { susunPerubahan } from './gas-simpan.js';
import { skripGoogleScript, sisipkanKeHtml } from './gas-web.js';
// Bundel GAS rumah (gas/gas-kamar.js milik Worker rumah) dipasang lewat buatWorkerRumah.
let gasKamar, INFO_GAS, HTML_GAS;

// Jawaban GAS saat kunci operasi tidak didapat (ApiService.js). PWA menahannya di antrean dan mengirim ulang.
const JAWABAN_RAMAI = { success: false, retry_later: true, error: 'Sistem sedang ramai — operasi ini tetap di antrean dan akan dikirim ulang otomatis.' };
const COBA_TULIS = 3;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function buatWorkerRumah(bundel) {
  ({ gasKamar, INFO: INFO_GAS, HTML: HTML_GAS } = bundel);
  if (typeof gasKamar !== 'function' || !INFO_GAS) throw new Error('bundel GAS rumah tidak lengkap');
  return { fetch: layani, scheduled: terjadwal };
}

async function layani(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/api/sehat')) return sehat(env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  // API: PWA memanggil ./api; POST ke akar juga dilayani, sama dengan web app GAS.
  if (/\/api\/?$/.test(url.pathname) || (url.pathname === '/' && request.method === 'POST')) {
    if (request.method !== 'POST') return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
    return tanganiApi(request, env, url, ctx);
  }
  if (url.pathname === '/api/uji-pemicu' && request.method === 'POST') return tanganiUjiPemicu(request, env, ctx);
  if (url.pathname === '/gas-tiruan' && (PROFIL_RUMAH[env.RUMAH] || {}).latihan) return gasTiruanLatihan(request, env);
  if (url.pathname === '/web/run') return tanganiRun(request, env, url, ctx);
  if (url.pathname === '/web' || url.pathname === '/web/') return tanganiWeb(request, env, url, ctx);

  // Rute frontend modern (Next.js) via Smart Gateway (Opsi A) bila ORIGIN_WEB dikonfigurasi
  const adalahRuteModern = RUTE_FRONTEND_MODERN.some((r) => url.pathname === r || url.pathname.startsWith(r + '/'));
  if (adalahRuteModern && (env.ORIGIN_WEB || env.NEXTJS_ORIGIN || env.WEB_ORIGIN)) {
    const jawabanProxy = await proxyKeOriginWeb(request, env, url);
    if (jawabanProxy) return jawabanProxy;
  }

  // File PWA rumah ([assets] Worker rumah). Akar folder → index.html, disajikan langsung tanpa redirect.
  if (url.pathname.endsWith('/')) return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
  return env.ASSETS.fetch(request);
}

function profil(env) {
  const p = PROFIL_RUMAH[env.RUMAH];
  if (!p || !p.gas) throw new Error(`profil rumah ${env.RUMAH} tanpa bagian gas di config/rumah.json`);
  // Ruang uji (docs/SAKLAR.md): Worker uji memakai SKEMA_AWALAN = "uji_", jadi membaca dan menulis uji_<skema> di
  // Gedung 1. Objek profil bersama tidak diubah; salinan dangkal per panggilan. Tanpa SKEMA_AWALAN: skema asli.
  return env.SKEMA_AWALAN ? { ...p, skema: String(env.SKEMA_AWALAN) + p.skema } : p;
}

const tanpaGas = (env) => !env.GAS_URL || String(env.GAS_URL).trim() === '';
// Tulis hanya bila Supabase memang sumber datanya. ?uji=supabase sengaja tidak berlaku untuk tulis: tulisan ke
// cermin yang masih disinkron dari spreadsheet akan tertimpa, dan kedua sumber berselisih.
const bolehTulis = (saklar, env) => saklar === 'supabase' || tanpaGas(env);

// Posisi peralihan (docs/SAKLAR.md): saat `menutup` (gas → supabase) dan `membuka` (supabase → gas) TIDAK ADA
// penulis. Bacaan tetap dilayani dari cermin; kiriman PWA dijawab dengan protokol yang membuat PWA MENYIMPAN
// kiriman di HP dan mengirim ulang otomatis. Jangan galat biasa: galat biasa membuang kiriman di HP pemiliknya
// (479 approval KMB hilang pada malam 16 Sep 2026; lihat Maintenance.js GAS SUM/KMB V2).
//   gas.peralihan = "maintenance"  → teks "MAINTENANCE|<sampai ISO>|<pesan>" (PWA SUM, KMB V2)
//   gas.peralihan = "retry_later"  → JSON { success:false, retry_later:true } (PWA KMB Projek, BUPR, KMB V2)
const POSISI_PERALIHAN = new Set(['menutup', 'membuka']);
const MENIT_PERALIHAN = 15;
const PESAN_PERALIHAN_WEB = 'Sistem sedang pindah jalur. Tidak ada yang tersimpan; coba lagi beberapa menit lagi.';

function jawabPeralihanApi(env, p) {
  const sampai = new Date(Date.now() + MENIT_PERALIHAN * 60000);
  if (p.gas.peralihan === 'maintenance') {
    const jam = sampai.toLocaleTimeString('id-ID', { timeZone: p.zona_waktu || 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
    const isi = `MAINTENANCE|${sampai.toISOString()}|Sistem sedang pindah jalur sampai sekitar pukul ${jam}. `
      + 'Kiriman Anda tersimpan dan akan terkirim otomatis setelah selesai.';
    return new Response(isi, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Abadi-Rumah': env.RUMAH, 'X-Abadi-Jalur': 'peralihan' },
    });
  }
  return jawab({ success: false, retry_later: true, error: 'Sistem sedang pindah jalur — operasi ini tetap di antrean dan akan dikirim ulang otomatis.' },
    'peralihan', env);
}

function halamanPeralihan(env) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MAR</title>`
    + `<p style="font:16px system-ui;margin:2em">${PESAN_PERALIHAN_WEB}</p>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120', 'X-Abadi-Rumah': env.RUMAH, 'X-Abadi-Jalur': 'peralihan' },
  });
}

// ── GAS tiruan rumah latihan (uji kering di produksi, keputusan Gabriel 15 Nov) ─────
// "GAS" rumah latihan (workers/bersama/profil-rumah.js) adalah titik ini: meniru jawaban tambalan tutup GAS
// (tools/kembar/tambal-tutup-gas.mjs pesanTutupGas_) menurut saklar rumah latihan di pintu. Selama `gas` menjawab
// seperti GAS untuk token yang tidak sah; posisi lain → "sudah pindah ke abadiops", yang ditunggu langkah cek_gas
// prosedur Mulai. Tidak ada kiriman yang diproses: data GAS rumah latihan = salinan spreadsheet, yang hanya ditulis
// lewat sinkron/cermin balik. Hanya aktif bila profil rumah Worker ini `latihan`.
export const PESAN_TUTUP_GAS = 'Sistem MAR rumah ini sudah pindah ke abadiops. Buka https://abadiops.com dan masuk dengan token Anda.';
// Push hanya dicatat (tidak dikirim) di ruang uji (SKEMA_AWALAN) dan di rumah latihan: keduanya memakai salinan
// PushSubs yang berisi langganan HP mekanik sungguhan.
export const pushHanyaDicatat = (env) => Boolean(env.SKEMA_AWALAN) || Boolean((PROFIL_RUMAH[env.RUMAH] || {}).latihan);

async function gasTiruanLatihan(request, env) {
  const tertutup = (await bacaStatusSaklar(env)) !== 'gas';
  const headers = { ...CORS, 'Cache-Control': 'no-store', 'X-Abadi-Rumah': env.RUMAH, 'X-Abadi-Jalur': 'gas-tiruan-latihan' };
  if (request.method === 'GET') {
    const isi = tertutup ? PESAN_TUTUP_GAS : 'GAS tiruan rumah latihan (uji kering prosedur migrasi). Tidak melayani pengguna.';
    return new Response(`<!doctype html><meta charset="utf-8"><title>MAR latihan</title><p style="font:16px system-ui;margin:2em">${isi}</p>`,
      { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const isi = tertutup ? { success: false, error: PESAN_TUTUP_GAS } : { success: false, error: 'Token tidak dikenal / nonaktif' };
  return new Response(JSON.stringify(isi), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}

// ── Pemicu terjadwal (cron Worker) ──────────────────────────────────────────
// Setelah migrasi, pemicu terjadwal GAS ikut tertutup (tools/kembar/tambal-tutup-gas.mjs). Worker menjalankan fungsi
// GAS yang SAMA (config/rumah.json gas.pemicu; jam dalam zona skrip, seperti atHour GAS) lewat cron, hanya bila saklar
// rumah ini `supabase`. Sebelum migrasi pemicu GAS yang berjalan, jadi tidak pernah dobel. Penjaga GAS menerima
// e.triggerUid yang cocok dengan pemicu terpasang tiruan. Cron: [triggers] di wrangler.toml rumah (staging kosong;
// di ruang uji dijalankan lewat POST /api/uji-pemicu).
const SELISIH_ZONA = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9, 'Etc/UTC': 0, UTC: 0 };
const MENIT_PEMICU = 7;

export function cronPemicu(jam, zona) {
  const s = SELISIH_ZONA[zona];
  if (s === undefined) throw new Error(`zona skrip ${zona} belum dikenal untuk pemicu`);
  return `${MENIT_PEMICU} ${(((Number(jam) - s) % 24) + 24) % 24} * * *`;
}

async function jalankanPemicu(env, fn) {
  const p = profil(env);
  const uid = `worker-${env.RUMAH}-${fn}`;
  return jalankanDanSimpan(env, p, new URL('https://pemicu.internal/'), `pemicu:${fn}`, { jarang: sheetJarang(p, ''), pemicu: [{ uid, fungsi: fn }] }, (G) => {
    const f = G.fungsiPemicu && G.fungsiPemicu[fn];
    if (typeof f !== 'function') throw new Error(`fungsi pemicu ${fn} tidak ada di bundel GAS`);
    return hasilRun(f({ triggerUid: uid, authMode: 'FULL' }));
  });
}

async function terjadwal(event, env, ctx) {
  const p = profil(env);
  const daftar = (p.gas.pemicu || []).filter((x) => cronPemicu(x.jam, INFO_GAS.zonaSkrip) === event.cron);
  if (!daftar.length) return;
  const saklar = await bacaStatusSaklar(env);
  if (saklar !== 'supabase') {
    console.log(JSON.stringify({ pemicu: event.cron, rumah: env.RUMAH, dilewati: `saklar ${saklar}: pemicu GAS yang berjalan` }));
    return;
  }
  for (const x of daftar) {
    const h = await jalankanPemicu(env, x.fungsi);
    console.log(JSON.stringify({ pemicu: x.fungsi, rumah: env.RUMAH, ok: h.ok, tulis: h.ringkas || '-', alasan: h.alasan || null, galat: (h.nilai && h.nilai.galat) || null }));
    if (h.ok) kirimPushSesudah(env, p, new URL('https://pemicu.internal/'), h.keluar, ctx);
  }
}

// Ruang uji saja (Worker uji: tanpa GAS dan ber-SKEMA_AWALAN): jalankan satu fungsi pemicu sekarang, untuk uji kembar.
async function tanganiUjiPemicu(request, env, ctx) {
  if (!tanpaGas(env) || !env.SKEMA_AWALAN) return new Response('Tidak ditemukan', { status: 404 });
  let isi = {};
  try { isi = JSON.parse(await request.text()); } catch (_) {}
  const fn = String(isi.fungsi || '');
  if (!(profil(env).gas.pemicu || []).some((x) => x.fungsi === fn)) return jawab({ ok: false, error: `bukan fungsi pemicu rumah ini: ${fn}` }, 'uji-pemicu', env);
  const h = await jalankanPemicu(env, fn);
  if (h.ok) kirimPushSesudah(env, profil(env), new URL('https://pemicu.internal/'), h.keluar, ctx);
  return jawab({ ok: h.ok, hasil: h.ok ? h.nilai : null, alasan: h.alasan || null, tulis: h.ringkas || '-', coba: h.coba || 0, push: (h.keluar || []).length }, 'uji-pemicu', env);
}

function jawab(isi, jalur, env, tambahan = {}) {
  return new Response(typeof isi === 'string' ? isi : JSON.stringify(isi), {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Abadi-Rumah': env.RUMAH,
      'X-Abadi-Jalur': jalur,
      ...tambahan,
    },
  });
}

// ── API PWA ────────────────────────────────────────────────────────────────
async function tanganiApi(request, env, url, ctx) {
  const teks = await request.text();
  let isi = {};
  try { isi = JSON.parse(teks); } catch (_) {}
  const aksi = String(isi.action || '');
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  // Peralihan: selain aksi baca (dilayani dari cermin di bawah), semua kiriman ditahan di HP.
  if (POSISI_PERALIHAN.has(saklar) && !p.gas.aksi_worker.includes(aksi)) return jawabPeralihanApi(env, p);
  const diWorker = p.gas.aksi_worker.includes(aksi)
    && (saklar !== 'gas' || tanpaGas(env) || url.searchParams.get('uji') === 'supabase');
  const tulisDiWorker = (p.gas.aksi_tulis_worker || []).includes(aksi) && bolehTulis(saklar, env);

  if (tulisDiWorker) {
    const h = await jalankanDanSimpan(env, p, url, `tulis:${aksi}`, { jarang: sheetJarang(p, String(isi.op_id || '')) }, (G) => {
      const keluar = G.doPost(buatPermintaanPost(teks));
      return keluar && keluar.getContent ? keluar.getContent() : '';
    });
    const info = { 'X-Abadi-Gas-Versi': String(INFO_GAS.versi), 'X-Abadi-Tulis': h.ringkas || '-', 'X-Abadi-Coba': String(h.coba || 0), 'X-Abadi-Muat': h.muat || '-', 'X-Abadi-Push': String((h.keluar || []).length) };
    if (h.ok) {
      kirimPushSesudah(env, p, url, h.keluar, ctx);
      return jawab(h.nilai, 'gas-worker-tulis', env, info);
    }
    if (h.ramai) return jawab(JAWABAN_RAMAI, 'gas-worker-ramai', env, info);
    return jawab({ success: false, error: `Aksi ${aksi} tidak bisa disimpan ke Supabase: ${h.alasan}` }, 'gas-worker-ditolak', env, info);
  }
  if (diWorker) {
    const h = await jalankanBaca(env, p, url, `api:${aksi}`, (G) => {
      const keluar = G.doPost(buatPermintaanPost(teks));
      return keluar && keluar.getContent ? keluar.getContent() : '';
    });
    const info = { 'X-Abadi-Gas-Versi': String(INFO_GAS.versi), 'X-Abadi-Ms': `cermin=${h.msCermin};gas=${h.msGas}`, 'X-Abadi-Muat': h.muat || '-' };
    if (h.ok) return jawab(h.nilai, 'gas-worker', env, info);
    // Gagal tertutup: jawaban yang mungkin salah tidak pernah dikirim.
    return jawab({ success: false, error: `Aksi ${aksi} tidak bisa dijawab dari Supabase: ${h.alasan}` }, 'gas-worker-ditolak', env, info);
  }
  if (!tanpaGas(env)) return teruskanKeGas(teks, env);
  return jawab({ success: false, error: `Aksi ${aksi || '?'} belum berjalan di Worker, dan lingkungan ini tidak punya GAS.` }, 'tidak-ada', env);
}

// ── Opsi A: Smart Gateway / Reverse Proxy ke Origin Frontend Modern (Next.js) ──
const RUTE_FRONTEND_MODERN = [
  '/_next',
  '/monitoring',
  '/approval',
  '/performa',
  '/lapangan',
  '/wo',
  '/antrean',
  '/admin',
  '/masuk',
];

async function proxyKeOriginWeb(request, env, url, jalurKustom) {
  const origin = env.ORIGIN_WEB || env.NEXTJS_ORIGIN || env.WEB_ORIGIN;
  if (!origin) return null;
  try {
    const targetUrl = new URL(jalurKustom || (url.pathname + url.search), origin);
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    headers.set('X-Abadi-Rumah', env.RUMAH || '');
    headers.set('X-Abadi-Jalur', 'nextjs-proxy');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      init.duplex = 'half';
    }

    const res = await fetch(targetUrl.toString(), init);
    const resHeaders = new Headers(res.headers);
    resHeaders.set('X-Abadi-Rumah', env.RUMAH || '');
    resHeaders.set('X-Abadi-Jalur', 'nextjs-proxy');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    console.error('proxyKeOriginWeb gagal:', err);
    return null;
  }
}

// ── MAR Web ────────────────────────────────────────────────────────────────
// Halaman web GAS asli: doGet beserta templatenya. Disajikan di sini hanya bila Supabase sumber datanya
// (halaman web juga menulis, misalnya kolom yang ditambahkan doGet); selain itu diarahkan ke web app GAS.
async function tanganiWeb(request, env, url, ctx) {
  if (request.method !== 'GET') return new Response('Hanya GET', { status: 405 });
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  if (POSISI_PERALIHAN.has(saklar)) return halamanPeralihan(env);
  if (!bolehTulis(saklar, env)) return Response.redirect(String(env.GAS_URL) + url.search, 302);

  // Opsi A (Smart Gateway): Jika saklar Supabase dan origin Next.js tersedia, sajikan UI modern
  if (env.ORIGIN_WEB || env.NEXTJS_ORIGIN || env.WEB_ORIGIN) {
    const token = url.searchParams.get('token');
    const jalurNext = token ? `/masuk?token=${encodeURIComponent(token)}` : `/monitoring${url.search}`;
    const jawabanProxy = await proxyKeOriginWeb(request, env, url, jalurNext);
    if (jawabanProxy) return jawabanProxy;
  }
  const h = await jalankanDanSimpan(env, p, url, `web:${url.searchParams.get('page') || ''}`, { jarang: sheetJarang(p, '') }, (G) => {
    const k = G.doGet(buatPermintaanGet(url.search));
    if (!k || typeof k.getContent !== 'function') throw new Error('doGet tidak mengembalikan halaman');
    return { isi: k.getContent(), judul: k.getTitle(), meta: k.getMetaTags(), favicon: k.getFaviconUrl() };
  });
  if (!h.ok) {
    const pesan = h.ramai ? 'Sistem sedang ramai. Muat ulang halaman sebentar lagi.' : `Halaman tidak bisa dibuka: ${h.alasan}`;
    return new Response(`<!doctype html><meta charset="utf-8"><title>MAR</title><p>${pesan.replace(/</g, '&lt;')}</p>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  kirimPushSesudah(env, p, url, h.keluar, ctx);
  const v = h.nilai.galat ? null : h.nilai.nilai;
  if (!v) {
    return new Response(`<!doctype html><meta charset="utf-8"><title>MAR</title><p>${String(h.nilai.galat).replace(/</g, '&lt;')}</p>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const html = sisipkanKeHtml(v.isi, { judul: v.judul, meta: v.meta, favicon: v.favicon, skrip: skripGoogleScript(`${url.origin}/web/run`) });
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Halaman memuat token pengguna: jangan disimpan cache, jangan bocor lewat Referer.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Abadi-Rumah': env.RUMAH,
      'X-Abadi-Gas-Versi': String(INFO_GAS.versi),
      'X-Abadi-Tulis': h.ringkas || '-',
    },
  });
}

// google.script.run.<fn>(...args). Hanya fungsi yang disebut halaman web (INFO.fungsiWeb); di GAS semua fungsi
// publik bisa dipanggil, termasuk alat perawatan, dan Worker tidak meniru celah itu. Identitas tetap dari token
// yang dibawa argumen (fungsi GAS memeriksanya sendiri, misalnya applyTokenString(data.token)).
async function tanganiRun(request, env, url, ctx) {
  if (request.method !== 'POST') return new Response('Hanya POST', { status: 405 });
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  let isi = {};
  try { isi = JSON.parse(await request.text()); } catch (_) {}
  const fn = String(isi.fn || '');
  const args = Array.isArray(isi.args) ? isi.args : [];
  const kirim = (o, tulis) => jawab(o, 'gas-worker-web', env, { 'X-Abadi-Tulis': tulis || '-' });
  if (!INFO_GAS.fungsiWeb.includes(fn)) return kirim({ ok: false, error: `Script function not found: ${fn}` });
  if (POSISI_PERALIHAN.has(saklar)) return kirim({ ok: false, error: PESAN_PERALIHAN_WEB });
  if (!bolehTulis(saklar, env)) return kirim({ ok: false, error: 'MAR Web rumah ini masih dilayani GAS.' });
  const h = await jalankanDanSimpan(env, p, url, `run:${fn}`, { jarang: sheetJarang(p, '') }, (G) => {
    const f = G.fungsiWeb[fn];
    if (typeof f !== 'function') throw new Error(`Script function not found: ${fn}`);
    return hasilRun(f.apply(null, args));
  });
  if (!h.ok) return kirim({ ok: false, error: h.ramai ? 'Sistem sedang ramai, coba lagi sebentar.' : h.alasan }, h.ringkas);
  // Tulisan sebelum galat GAS tetap tersimpan (seperti GAS), jadi push yang diminta sebelumnya juga dikirim.
  kirimPushSesudah(env, p, url, h.keluar, ctx);
  if (h.nilai.galat) return kirim({ ok: false, error: h.nilai.galat }, h.ringkas);
  return kirim({ ok: true, hasil: h.nilai.nilai === undefined ? null : h.nilai.nilai }, h.ringkas);
}

// ── Menjalankan GAS ────────────────────────────────────────────────────────
// Sheet jarang untuk pekerjaan yang menulis (gas.sheet_jarang_tulis): "<sheet>": "<kolom>" memuat baris yang kolomnya
// sama dengan op_id kiriman ini (ProcessedOps); "<sheet>": { kolom, nilai } memuat baris dengan nilai tetap itu,
// misalnya nilai yang tidak pernah ada untuk AuditLogs: hanya jumlah barisnya yang dimuat, cukup untuk menambah baris.
function sheetJarang(p, opId) {
  return Object.fromEntries(Object.entries(p.gas.sheet_jarang_tulis || {})
    .map(([sheet, k]) => [sheet, typeof k === 'string' ? { kolom: k, nilai: opId } : { kolom: k.kolom, nilai: k.nilai }]));
}

function siapkanGas(cermin, url, pemicu, env) {
  const D = dataDariCermin(cermin, INFO_GAS.zonaSkrip);
  D.html = HTML_GAS;
  D.urlWeb = `${url.origin}/web`;
  // Pemicu terpasang tiruan ([{ uid, fungsi }]): penjaga GAS menerima e.triggerUid yang cocok (ScriptApp.getProjectTriggers).
  if (pemicu && pemicu.length) D.pemicu = pemicu;
  D.properti = propertiGas(env);
  const L = buatLayanan(D, buatHost());
  return { L, G: gasKamar(L) };
}

// ── Memuat sheet sesuai kebutuhan ──────────────────────────────────────────
// Worker tidak memuat seluruh cermin (KMB V2 ±18 MB, SUM ±20 MB per permintaan: CPU Worker dan egress Supabase,
// BUG-DICATAT #40). Untuk setiap jenis pekerjaan (kunci: aksi API, halaman web, fungsi google.script.run) disimpan
// daftar sheet yang ternyata dibaca kode GAS, mulai dari gas.sheet_dasar. Sheet lain dikirim sebagai "tidak_dimuat":
// tetap dikenal kode GAS, tetapi membacanya tercatat (CATAT.baca_dilewati) dan hasilnya dibuang. Sheet itu lalu
// ditambahkan ke daftar dan pekerjaan diulang, sebelum apa pun disimpan. Hasil akhirnya selalu sama dengan memuat
// seluruh cermin; sesudah pekerjaan pertama di sebuah isolate, biasanya cukup sekali baca.
// Sheet jarang (gas.sheet_jarang_tulis) yang ternyata dibaca di luar baris yang dimuat (CATAT.tidak_aman) dipelajari
// juga: untuk kunci itu dimuat utuh.
const ULANG_MUAT = 10;
const PERLU = new Map();   // kunci → Set sheet yang dimuat utuh
const PENUH = new Map();   // kunci → Set sheet jarang yang harus dimuat utuh
let DAFTAR_SHEET = { skema: '', daftar: null, sampai: 0 };

// Nama semua sheet cermin rumah ini (dari cermin_baca semua_sheet), disimpan 5 menit per isolate. null bila
// gedungnya belum punya cermin_baca dengan p_hanya: Worker lalu memuat seluruh cermin seperti dulu.
async function semuaSheet(env, skema) {
  const t = Date.now();
  if (DAFTAR_SHEET.skema === skema && DAFTAR_SHEET.sampai > t) return DAFTAR_SHEET.daftar;
  const c = await bacaCermin(env, skema, { hanya: [] });
  DAFTAR_SHEET = { skema, daftar: Array.isArray(c.semua_sheet) ? c.semua_sheet : null, sampai: t + 5 * 60 * 1000 };
  return DAFTAR_SHEET.daftar;
}

function himpunan(peta, kunci, awal = []) {
  if (!peta.has(kunci)) peta.set(kunci, new Set(awal));
  return peta.get(kunci);
}

// Sheet yang namanya disebut pesan CATAT.tidak_aman ("<sheet>.<cara> mengenai…", "<sheet> dibaca di…").
function sheetTidakAman(pesan) {
  return [...new Set(pesan.map((m) => String(m).split(/[ .]/)[0]).filter(Boolean))];
}

// Satu putaran: muat cermin sesuai daftar, siapkan GAS, jalankan kerja. Kembalikan { L, cermin, nilai } atau
// { belajar: true } bila sheet baru harus dimuat dulu.
async function putaran(env, p, url, kunci, { jarang = {}, tanpaMuat = [], pemicu = null }, kerja) {
  const semua = await semuaSheet(env, p.skema);
  const perlu = himpunan(PERLU, kunci, p.gas.sheet_dasar || []);
  const penuh = himpunan(PENUH, kunci);
  const jarangKini = Object.fromEntries(Object.entries(jarang).filter(([s]) => !penuh.has(s)));
  const tidakDimuat = semua
    ? semua.filter((n) => tanpaMuat.includes(n) || (!perlu.has(n) && !penuh.has(n) && !(n in jarangKini)))
    : tanpaMuat.slice();
  const t0 = Date.now();
  const cermin = await bacaCermin(env, p.skema, { tidakDimuat, jarang: jarangKini });
  const t1 = Date.now();
  const { L, G } = siapkanGas(cermin, url, pemicu, env);
  let nilai;
  try { nilai = { nilai: kerja(G, L) }; } catch (e) { nilai = { galat: String((e && e.message) || e) }; }
  const C = L.__CATAT;
  const baru = C.baca_dilewati.filter((n) => !tanpaMuat.includes(n) && !perlu.has(n));
  if (baru.length && semua) { baru.forEach((n) => perlu.add(n)); return { belajar: true }; }
  const jarangTerbaca = sheetTidakAman(C.tidak_aman).filter((n) => n in jarangKini);
  if (jarangTerbaca.length) { jarangTerbaca.forEach((n) => penuh.add(n)); return { belajar: true }; }
  const muat = `sheet=${semua ? semua.length - tidakDimuat.length : 'semua'}`;
  return { L, cermin, nilai, C, muat, msCermin: t1 - t0, msGas: Date.now() - t1 };
}

// Aksi baca: tanpa penyimpanan. Gagal tertutup bila GAS membaca sheet yang tidak boleh dimuat
// (gas.sheet_tidak_dimuat) atau menulis.
async function jalankanBaca(env, p, url, kunci, kerja) {
  for (let ulang = 1; ulang <= ULANG_MUAT; ulang++) {
    let h;
    try {
      h = await putaran(env, p, url, kunci, { tanpaMuat: p.gas.sheet_tidak_dimuat || [] }, kerja);
    } catch (e) {
      return { ok: false, alasan: `cermin tidak terbaca atau GAS gagal disiapkan (${e && e.message})`, msCermin: 0, msGas: 0 };
    }
    if (h.belajar) continue;
    const ms = { msCermin: h.msCermin, msGas: h.msGas, muat: `${h.muat};ulang=${ulang}` };
    if (h.C.baca_dilewati.length) return { ok: false, alasan: `membaca sheet yang tidak dimuat (${h.C.baca_dilewati.join(', ')})`, ...ms };
    if (h.C.tidak_aman.length) return { ok: false, alasan: `memakai baris yang tidak dimuat (${h.C.tidak_aman.join('; ')})`, ...ms };
    if (h.C.tulis.length) return { ok: false, alasan: 'aksi baca ini menulis; tulisan hanya disimpan lewat aksi_tulis_worker', ...ms };
    if (h.nilai.galat !== undefined) return { ok: false, alasan: `galat GAS di Worker (${h.nilai.galat})`, ...ms };
    return { ok: true, nilai: h.nilai.nilai, ...ms };
  }
  return { ok: false, alasan: 'terlalu banyak sheet yang harus dipelajari untuk aksi ini', msCermin: 0, msGas: 0 };
}

// Jalankan kode GAS, lalu simpan tulisannya dalam satu transaksi (public.cermin_tulis). Konkurensi optimistis:
// bila sheet yang ditulis berubah sejak dibaca, baca ulang dan jalankan ulang, paling banyak COBA_TULIS kali.
// Seperti di GAS (Sheets tidak transaksional), tulisan tetap disimpan walaupun fungsi kemudian melempar galat;
// galatnya dikembalikan di nilai.galat. Hasil hanya dikirim bila tulisannya benar-benar tersimpan.
async function jalankanDanSimpan(env, p, url, kunci, { jarang = {}, pemicu = null }, kerja) {
  let konflik = 0;
  for (let ulang = 1; ulang <= ULANG_MUAT + COBA_TULIS; ulang++) {
    let h;
    try {
      h = await putaran(env, p, url, kunci, { jarang, pemicu }, kerja);
    } catch (e) {
      return { ok: false, alasan: `cermin tidak terbaca atau GAS gagal disiapkan (${e && e.message})`, coba: ulang };
    }
    if (h.belajar) continue;
    const C = h.C;
    if (C.baca_dilewati.length) return { ok: false, alasan: `membaca sheet yang tidak dimuat (${C.baca_dilewati.join(', ')})`, coba: ulang };
    if (C.tidak_aman.length) return { ok: false, alasan: `memakai baris yang tidak dimuat (${C.tidak_aman.join('; ')})`, coba: ulang };
    const ekspor = h.L.__ekspor();
    // keluar: web push dari putaran INI (yang tersimpan); putaran yang kalah konflik dibuang beserta push-nya.
    if (!Object.keys(ekspor).length) return { ok: true, nilai: perlu(h.nilai), ringkas: 'tanpa-tulisan', coba: ulang, muat: h.muat, keluar: C.keluar || [] };
    let perubahan;
    try {
      perubahan = susunPerubahan(h.cermin, ekspor);
    } catch (e) {
      return { ok: false, alasan: e.message, coba: ulang };
    }
    const ringkas = Object.entries(perubahan).map(([s, x]) => `${s}:${x.tulis.length}`).join(',');
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cermin_tulis`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_skema: p.skema, p_perubahan: perubahan }),
    });
    if (r.ok) return { ok: true, nilai: perlu(h.nilai), ringkas, coba: ulang, muat: h.muat, keluar: C.keluar || [] };
    const galat = await r.text();
    if (!/KONFLIK/.test(galat)) return { ok: false, alasan: `penyimpanan gagal (HTTP ${r.status}: ${galat.slice(0, 160)})`, ringkas, coba: ulang };
    if (++konflik >= COBA_TULIS) return { ok: false, ramai: true, coba: ulang };
  }
  return { ok: false, alasan: 'terlalu banyak sheet yang harus dipelajari untuk pekerjaan ini', coba: ULANG_MUAT + COBA_TULIS };
}
// Jalur API mengembalikan teks jawaban GAS apa adanya; jalur web mengembalikan {nilai} atau {galat}.
function perlu(n) { return n && Object.prototype.hasOwnProperty.call(n, 'nilai') && typeof n.nilai === 'string' ? n.nilai : n; }

async function bacaCermin(env, skema, { tidakDimuat = [], jarang = {}, hanya } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cermin_baca`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_skema: skema, p_tidak_dimuat: tidakDimuat, p_jarang: jarang, ...(hanya ? { p_hanya: hanya } : {}) }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

// Diteruskan apa adanya: status dan jenis isi jawaban GAS tidak diubah. Bila GAS tidak terjangkau, jawabannya
// teks GAS_TIDAK_TERJANGKAU (502, bukan JSON): sw.js PWA gagal membaca JSON-nya, sehingga kiriman tetap di antrean
// dan dikirim ulang otomatis (BUG-DICATAT #20).
// ── Notifikasi push ───────────────────────────────────────────────────────
// Layanan push web tempat endpoint langganan PushSubs berada (Chrome/Android FCM, Firefox, Safari/Apple, Edge/WNS).
// Endpoint lain tidak pernah dikirimi dari produksi.
export const LAYANAN_PUSH = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)\//i;

// PEM yang tersimpan di rahasia Worker mungkin satu baris (disalin dari tabel Script Properties): susun ulang
// menjadi PEM baku (baris 64 karakter) seperti yang dibuat setupPushNotif GAS.
export function rapikanPem(x) {
  const s = String(x || '').replace(/\\n/g, '\n').trim();
  const m = s.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) return s;
  const isi = m[2].replace(/\s+/g, '');
  return `-----BEGIN ${m[1]}-----\r\n${isi.match(/.{1,64}/g).join('\r\n')}\r\n-----END ${m[1]}-----\r\n`;
}

// Script Properties GAS yang disediakan Worker: hanya kunci VAPID notifikasi push (rahasia Worker rumah itu).
function propertiGas(env) {
  if (!env || !env.VAPID_PRIVATE_PEM || !env.VAPID_PUBLIC_B64URL) return {};
  return { VAPID_PRIVATE_PEM: rapikanPem(env.VAPID_PRIVATE_PEM), VAPID_PUBLIC_B64URL: String(env.VAPID_PUBLIC_B64URL).trim() };
}

const asalUrl = (u) => { try { return new URL(u).host; } catch (_) { return '?'; } };

function kirimPushSesudah(env, p, url, keluar, ctx) {
  if (!keluar || !keluar.length) return;
  const kerja = kirimPush(env, p, url, keluar).catch((e) => console.log(JSON.stringify({ rumah: env.RUMAH, push_galat: String((e && e.message) || e) })));
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(kerja);
}

// Kirim web push yang dicatat kode GAS. Jawaban 404/410 = langganan mati: PushSubs is_active → false, seperti
// sendPushToEmails GAS. Endpoint langganan tidak pernah dicatat utuh (hanya host-nya).
export async function kirimPush(env, p, url, keluar, { ambil = fetch, matikan = null } = {}) {
  // Ruang uji dan rumah latihan: PushSubs-nya salinan berisi langganan HP sungguhan → hanya dicatat.
  const uji = pushHanyaDicatat(env);
  const hasil = [];
  const mati = [];
  for (const k of keluar) {
    const keUji = Boolean(env.PUSH_UJI_AWALAN) && k.url.startsWith(String(env.PUSH_UJI_AWALAN));
    if (uji ? !keUji : !LAYANAN_PUSH.test(k.url)) {
      hasil.push({ tujuan: asalUrl(k.url), dilewati: uji ? 'ruang uji: hanya dicatat' : 'bukan layanan push' });
      continue;
    }
    try {
      const r = await ambil(k.url, { method: 'POST', headers: k.headers, body: k.payload || '' });
      hasil.push({ tujuan: asalUrl(k.url), status: r.status });
      if (r.status === 404 || r.status === 410) mati.push(k.url);
    } catch (e) {
      hasil.push({ tujuan: asalUrl(k.url), galat: String((e && e.message) || e).slice(0, 80) });
    }
  }
  let matikanHasil = null;
  if (mati.length) {
    const jalan = matikan || ((daftar) => jalankanDanSimpan(env, p, url, 'push:langganan-mati', {}, (G, L) => matikanLangganan(L, daftar)));
    const h = await jalan(mati);
    matikanHasil = { ok: h.ok, tulis: h.ringkas || '-', alasan: h.alasan || null };
  }
  console.log(JSON.stringify({ rumah: env.RUMAH, push: hasil, langganan_mati: mati.length, matikan: matikanHasil }));
  return { hasil, mati, matikan: matikanHasil };
}

// Sama dengan sendPushToEmails GAS untuk jawaban 404/410: PushSubs kolom 9 (is_active) baris endpoint itu → false.
export function matikanLangganan(L, mati) {
  const sh = L.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PushSubs');
  if (!sh) return 0;
  const d = sh.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < d.length; i++) {
    if (mati.includes(String(d[i][3]))) { sh.getRange(i + 1, 9).setValue(false); n++; }
  }
  return n;
}

async function teruskanKeGas(teks, env) {
  // Rumah latihan: "GAS"-nya titik /gas-tiruan di Worker ini sendiri. Cloudflare tidak mengizinkan Worker memanggil
  // domainnya sendiri (522), jadi dijawab langsung, sama seperti bila dipanggil dari luar.
  if ((PROFIL_RUMAH[env.RUMAH] || {}).latihan) {
    return gasTiruanLatihan(new Request('https://latihan.internal/gas-tiruan', { method: 'POST', body: teks }), env);
  }
  const mulai = Date.now();
  let aksi = '';
  try { aksi = String(JSON.parse(teks).action || ''); } catch (_) {}
  try {
    const r = await fetch(env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: teks,
      redirect: 'follow',
    });
    const isi = await r.text();
    console.log(JSON.stringify({ rumah: env.RUMAH, aksi, status: r.status, ms: Date.now() - mulai, jalur: 'gas' }));
    return new Response(isi, {
      status: r.status,
      headers: {
        ...CORS,
        'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH,
        'X-Abadi-Jalur': 'gas',
      },
    });
  } catch (e) {
    console.log(JSON.stringify({ rumah: env.RUMAH, aksi, galat: String((e && e.message) || e), ms: Date.now() - mulai, jalur: 'gas' }));
    return new Response('GAS_TIDAK_TERJANGKAU', {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

async function sehat(env) {
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  return new Response(JSON.stringify({
    ok: true,
    rumah: env.RUMAH,
    saklar,
    gas_tersedia: !tanpaGas(env),
    gas_di_worker: {
      versi: INFO_GAS.versi, berkas: INFO_GAS.berkas, sidik: INFO_GAS.sidik.slice(0, 12), aksi: p.gas.aksi_worker,
      aksi_tulis: p.gas.aksi_tulis_worker || [], templat_web: INFO_GAS.templat, fungsi_web: INFO_GAS.fungsiWeb.length,
    },
    supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
    // Hanya ada/tidaknya kunci, tidak pernah nilainya.
    push: { kunci_vapid: !!(env.VAPID_PRIVATE_PEM && env.VAPID_PUBLIC_B64URL), kirim: pushHanyaDicatat(env) ? (env.PUSH_UJI_AWALAN ? 'ruang uji: hanya ke penerima uji' : 'ruang uji: hanya dicatat') : 'ke layanan push' },
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
