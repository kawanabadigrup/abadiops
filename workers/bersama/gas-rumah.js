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
 * Pemakaian di Worker rumah:  import * as bundel from '../gas/gas-kamar.js';
 *                             export default buatWorkerRumah(bundel);
 * Penjelasan lengkap: workers/kmbbupr/README.md.
 */
import PROFIL_RUMAH from '../../config/rumah.json';
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
  return { fetch: layani };
}

async function layani(request, env) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/api/sehat')) return sehat(env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  // API: PWA memanggil ./api; POST ke akar juga dilayani, sama dengan web app GAS.
  if (/\/api\/?$/.test(url.pathname) || (url.pathname === '/' && request.method === 'POST')) {
    if (request.method !== 'POST') return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
    return tanganiApi(request, env, url);
  }
  if (url.pathname === '/web/run') return tanganiRun(request, env, url);
  if (url.pathname === '/web' || url.pathname === '/web/') return tanganiWeb(request, env, url);
  // File PWA rumah ([assets] Worker rumah). Akar folder → index.html, disajikan langsung tanpa redirect.
  if (url.pathname.endsWith('/')) return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
  return env.ASSETS.fetch(request);
}

function profil(env) {
  const p = PROFIL_RUMAH[env.RUMAH];
  if (!p || !p.gas) throw new Error(`profil rumah ${env.RUMAH} tanpa bagian gas di config/rumah.json`);
  return p;
}

const tanpaGas = (env) => !env.GAS_URL || String(env.GAS_URL).trim() === '';
// Tulis hanya bila Supabase memang sumber datanya. ?uji=supabase sengaja tidak berlaku untuk tulis: tulisan ke
// cermin yang masih disinkron dari spreadsheet akan tertimpa, dan kedua sumber berselisih.
const bolehTulis = (saklar, env) => saklar === 'supabase' || tanpaGas(env);

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
async function tanganiApi(request, env, url) {
  const teks = await request.text();
  let isi = {};
  try { isi = JSON.parse(teks); } catch (_) {}
  const aksi = String(isi.action || '');
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  const diWorker = p.gas.aksi_worker.includes(aksi)
    && (saklar !== 'gas' || tanpaGas(env) || url.searchParams.get('uji') === 'supabase');
  const tulisDiWorker = (p.gas.aksi_tulis_worker || []).includes(aksi) && bolehTulis(saklar, env);

  if (tulisDiWorker) {
    // Sheet jarang (gas.sheet_jarang_tulis, misalnya ProcessedOps → op_id): hanya baris milik op_id kiriman ini.
    const opId = String(isi.op_id || '');
    const jarang = Object.fromEntries(Object.entries(p.gas.sheet_jarang_tulis || {}).map(([sheet, kolom]) => [sheet, { kolom, nilai: opId }]));
    const h = await jalankanDanSimpan(env, p, url, { jarang }, (G) => {
      const keluar = G.doPost(buatPermintaanPost(teks));
      return keluar && keluar.getContent ? keluar.getContent() : '';
    });
    const info = { 'X-Abadi-Gas-Versi': String(INFO_GAS.versi), 'X-Abadi-Tulis': h.ringkas || '-', 'X-Abadi-Coba': String(h.coba || 0) };
    if (h.ok) return jawab(h.nilai, 'gas-worker-tulis', env, info);
    if (h.ramai) return jawab(JAWABAN_RAMAI, 'gas-worker-ramai', env, info);
    return jawab({ success: false, error: `Aksi ${aksi} tidak bisa disimpan ke Supabase: ${h.alasan}` }, 'gas-worker-ditolak', env, info);
  }
  if (diWorker) {
    const h = await jalankanBaca(env, p, url, (G) => {
      const keluar = G.doPost(buatPermintaanPost(teks));
      return keluar && keluar.getContent ? keluar.getContent() : '';
    });
    const info = { 'X-Abadi-Gas-Versi': String(INFO_GAS.versi), 'X-Abadi-Ms': `cermin=${h.msCermin};gas=${h.msGas}` };
    if (h.ok) return jawab(h.nilai, 'gas-worker', env, info);
    // Gagal tertutup: jawaban yang mungkin salah tidak pernah dikirim.
    return jawab({ success: false, error: `Aksi ${aksi} tidak bisa dijawab dari Supabase: ${h.alasan}` }, 'gas-worker-ditolak', env, info);
  }
  if (!tanpaGas(env)) return teruskanKeGas(teks, env);
  return jawab({ success: false, error: `Aksi ${aksi || '?'} belum berjalan di Worker, dan lingkungan ini tidak punya GAS.` }, 'tidak-ada', env);
}

// ── MAR Web ────────────────────────────────────────────────────────────────
// Halaman web GAS asli: doGet beserta templatenya. Disajikan di sini hanya bila Supabase sumber datanya
// (halaman web juga menulis, misalnya kolom yang ditambahkan doGet); selain itu diarahkan ke web app GAS.
async function tanganiWeb(request, env, url) {
  if (request.method !== 'GET') return new Response('Hanya GET', { status: 405 });
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  if (!bolehTulis(saklar, env)) return Response.redirect(String(env.GAS_URL) + url.search, 302);
  const h = await jalankanDanSimpan(env, p, url, {}, (G) => {
    const k = G.doGet(buatPermintaanGet(url.search));
    if (!k || typeof k.getContent !== 'function') throw new Error('doGet tidak mengembalikan halaman');
    return { isi: k.getContent(), judul: k.getTitle(), meta: k.getMetaTags(), favicon: k.getFaviconUrl() };
  });
  if (!h.ok) {
    const pesan = h.ramai ? 'Sistem sedang ramai. Muat ulang halaman sebentar lagi.' : `Halaman tidak bisa dibuka: ${h.alasan}`;
    return new Response(`<!doctype html><meta charset="utf-8"><title>MAR</title><p>${pesan.replace(/</g, '&lt;')}</p>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
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
async function tanganiRun(request, env, url) {
  if (request.method !== 'POST') return new Response('Hanya POST', { status: 405 });
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  let isi = {};
  try { isi = JSON.parse(await request.text()); } catch (_) {}
  const fn = String(isi.fn || '');
  const args = Array.isArray(isi.args) ? isi.args : [];
  const kirim = (o, tulis) => jawab(o, 'gas-worker-web', env, { 'X-Abadi-Tulis': tulis || '-' });
  if (!INFO_GAS.fungsiWeb.includes(fn)) return kirim({ ok: false, error: `Script function not found: ${fn}` });
  if (!bolehTulis(saklar, env)) return kirim({ ok: false, error: 'MAR Web rumah ini masih dilayani GAS.' });
  const h = await jalankanDanSimpan(env, p, url, {}, (G) => {
    const f = G.fungsiWeb[fn];
    if (typeof f !== 'function') throw new Error(`Script function not found: ${fn}`);
    return hasilRun(f.apply(null, args));
  });
  if (!h.ok) return kirim({ ok: false, error: h.ramai ? 'Sistem sedang ramai, coba lagi sebentar.' : h.alasan }, h.ringkas);
  if (h.nilai.galat) return kirim({ ok: false, error: h.nilai.galat }, h.ringkas);
  return kirim({ ok: true, hasil: h.nilai.nilai === undefined ? null : h.nilai.nilai }, h.ringkas);
}

// ── Menjalankan GAS ────────────────────────────────────────────────────────
function siapkanGas(cermin, url) {
  const D = dataDariCermin(cermin, INFO_GAS.zonaSkrip);
  D.html = HTML_GAS;
  D.urlWeb = `${url.origin}/web`;
  const L = buatLayanan(D, buatHost());
  return { L, G: gasKamar(L) };
}

// Aksi baca: tanpa penyimpanan. Gagal tertutup bila GAS membaca sheet yang tidak dimuat atau menulis.
async function jalankanBaca(env, p, url, kerja) {
  const t0 = Date.now();
  let cermin;
  try {
    cermin = await bacaCermin(env, p.skema, p.gas.sheet_tidak_dimuat || []);
  } catch (e) {
    return { ok: false, alasan: `cermin tidak terbaca (${e.message})`, msCermin: Date.now() - t0, msGas: 0 };
  }
  const t1 = Date.now();
  try {
    const { L, G } = siapkanGas(cermin, url);
    const nilai = kerja(G, L);
    const C = L.__CATAT;
    const ms = { msCermin: t1 - t0, msGas: Date.now() - t1 };
    if (C.baca_dilewati.length) return { ok: false, alasan: `membaca sheet yang tidak dimuat (${C.baca_dilewati.join(', ')})`, ...ms };
    if (C.tidak_aman.length) return { ok: false, alasan: `memakai baris yang tidak dimuat (${C.tidak_aman.join('; ')})`, ...ms };
    if (C.tulis.length) return { ok: false, alasan: 'aksi baca ini menulis; tulisan hanya disimpan lewat aksi_tulis_worker', ...ms };
    return { ok: true, nilai, ...ms };
  } catch (e) {
    return { ok: false, alasan: `galat GAS di Worker (${e && e.message})`, msCermin: t1 - t0, msGas: Date.now() - t1 };
  }
}

// Jalankan kode GAS, lalu simpan tulisannya dalam satu transaksi (public.cermin_tulis). Konkurensi optimistis:
// bila sheet yang ditulis berubah sejak dibaca, baca ulang dan jalankan ulang, paling banyak COBA_TULIS kali.
// Seperti di GAS (Sheets tidak transaksional), tulisan tetap disimpan walaupun fungsi kemudian melempar galat;
// galatnya dikembalikan di nilai.galat. Hasil hanya dikirim bila tulisannya benar-benar tersimpan.
async function jalankanDanSimpan(env, p, url, { jarang = {} }, kerja) {
  for (let coba = 1; coba <= COBA_TULIS; coba++) {
    let cermin;
    try {
      cermin = await bacaCermin(env, p.skema, [], jarang);
    } catch (e) {
      return { ok: false, alasan: `cermin tidak terbaca (${e.message})`, coba };
    }
    let L, G, nilai;
    try {
      ({ L, G } = siapkanGas(cermin, url));
    } catch (e) {
      return { ok: false, alasan: `galat GAS di Worker (${e && e.message})`, coba };
    }
    try { nilai = { nilai: kerja(G, L) }; } catch (e) { nilai = { galat: String((e && e.message) || e) }; }
    const C = L.__CATAT;
    if (C.baca_dilewati.length) return { ok: false, alasan: `membaca sheet yang tidak dimuat (${C.baca_dilewati.join(', ')})`, coba };
    if (C.tidak_aman.length) return { ok: false, alasan: `memakai baris yang tidak dimuat (${C.tidak_aman.join('; ')})`, coba };
    const ekspor = L.__ekspor();
    if (!Object.keys(ekspor).length) return { ok: true, nilai: perlu(nilai), ringkas: 'tanpa-tulisan', coba };
    let perubahan;
    try {
      perubahan = susunPerubahan(cermin, ekspor);
    } catch (e) {
      return { ok: false, alasan: e.message, coba };
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
    if (r.ok) return { ok: true, nilai: perlu(nilai), ringkas, coba };
    const galat = await r.text();
    if (!/KONFLIK/.test(galat)) return { ok: false, alasan: `penyimpanan gagal (HTTP ${r.status}: ${galat.slice(0, 160)})`, ringkas, coba };
  }
  return { ok: false, ramai: true, coba: COBA_TULIS };
}
// Jalur API mengembalikan teks jawaban GAS apa adanya; jalur web mengembalikan {nilai} atau {galat}.
function perlu(n) { return n && Object.prototype.hasOwnProperty.call(n, 'nilai') && typeof n.nilai === 'string' ? n.nilai : n; }

async function bacaCermin(env, skema, tidakDimuat, jarang = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cermin_baca`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_skema: skema, p_tidak_dimuat: tidakDimuat, p_jarang: jarang }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

// Diteruskan apa adanya: status dan jenis isi jawaban GAS tidak diubah. Bila GAS tidak terjangkau, jawabannya
// teks GAS_TIDAK_TERJANGKAU (502, bukan JSON): sw.js PWA gagal membaca JSON-nya, sehingga kiriman tetap di antrean
// dan dikirim ulang otomatis (BUG-DICATAT #20).
async function teruskanKeGas(teks, env) {
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
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
