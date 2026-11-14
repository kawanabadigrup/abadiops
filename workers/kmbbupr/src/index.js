/**
 * Rumah KMB Projek BUPR: Worker `abadiops-kmbbupr`. Rumah: kmbbupr.
 *
 * GAS asli di Worker (keputusan Gabriel 14 Nov 2026): aksi di config/rumah.json kmbbupr.gas.aksi_worker
 * dijawab oleh kode GAS BUPR yang ASLI (gas/gas-kamar.js, dibungkus tools/kembar/bundel-gas.mjs dari versi
 * yang dipatok) di atas cermin Supabase (public.cermin_baca). Jawabannya 1:1 dengan GAS karena kodenya sama.
 * Aksi lain diteruskan ke GAS. Penjelasan: workers/kmbbupr/README.md.
 *
 * Kontrak API sama dengan web app GAS: POST text/plain berisi {token, action, op_id, data}.
 */
import PROFIL_RUMAH from '../../../config/rumah.json';
import { buatLayanan, buatPermintaanPost, dataDariCermin } from '../../bersama/gas-layanan.js';
import { buatHost } from '../../bersama/gas-host.js';
import { bacaStatusSaklar } from '../../bersama/saklar.js';
import { susunPerubahan } from '../../bersama/gas-simpan.js';
import { gasKamar, INFO as INFO_GAS } from '../gas/gas-kamar.js';

// Jawaban GAS saat kunci operasi tidak didapat (ApiService.js). PWA menahannya di antrean dan mengirim ulang.
const JAWABAN_RAMAI = { success: false, retry_later: true, error: 'Sistem sedang ramai — operasi ini tetap di antrean dan akan dikirim ulang otomatis.' };
const COBA_TULIS = 3;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/api/sehat')) return sehat(env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    // API: PWA memanggil ./api; POST ke akar juga dilayani, sama dengan web app GAS.
    if (/\/api\/?$/.test(url.pathname) || (url.pathname === '/' && request.method === 'POST')) {
      if (request.method !== 'POST') return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
      return tanganiApi(request, env, url);
    }
    if (url.pathname === '/web' || url.pathname.startsWith('/web/')) return webBelumAda();
    // File PWA BUPR (pwa/kmbbupr). Akar folder → index.html, disajikan langsung tanpa redirect.
    if (url.pathname.endsWith('/')) return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
    return env.ASSETS.fetch(request);
  },
};

// MAR Web BUPR (halaman web GAS yang asli, dijalankan di Worker) belum dipindah.
function webBelumAda() {
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAR BUPR</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#222}</style></head>
<body><h1>MAR Web BUPR belum tersedia</h1><p>Halaman web sedang dipindahkan. Untuk sementara pakai <a href="./">Aplikasi (PWA)</a>.</p></body></html>`,
  { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function profil(env) {
  const p = PROFIL_RUMAH[env.RUMAH];
  if (!p || !p.gas) throw new Error(`profil rumah ${env.RUMAH} tanpa bagian gas di config/rumah.json`);
  return p;
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

async function tanganiApi(request, env, url) {
  const teks = await request.text();
  let isi = {};
  try { isi = JSON.parse(teks); } catch (_) {}
  const aksi = String(isi.action || '');
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  const diWorker = p.gas.aksi_worker.includes(aksi)
    && (saklar !== 'gas' || tanpaGas || url.searchParams.get('uji') === 'supabase');
  // Tulis hanya bila Supabase memang sumber datanya. ?uji=supabase sengaja tidak berlaku: tulisan ke cermin yang
  // masih disinkron dari spreadsheet akan tertimpa, dan kedua sumber berselisih.
  const tulisDiWorker = (p.gas.aksi_tulis_worker || []).includes(aksi) && (saklar === 'supabase' || tanpaGas);

  if (tulisDiWorker) {
    const h = await jalankanTulisDiWorker(teks, env, p);
    const info = { 'X-Abadi-Gas-Versi': String(INFO_GAS.versi), 'X-Abadi-Tulis': h.ringkas || '-', 'X-Abadi-Coba': String(h.coba || 0) };
    if (h.ok) return jawab(h.isi, 'gas-worker-tulis', env, info);
    if (h.ramai) return jawab(JAWABAN_RAMAI, 'gas-worker-ramai', env, info);
    return jawab({ success: false, error: `Aksi ${aksi} tidak bisa disimpan ke Supabase: ${h.alasan}` }, 'gas-worker-ditolak', env, info);
  }
  if (diWorker) {
    const h = await jalankanGasDiWorker(teks, env, p);
    const info = { 'X-Abadi-Gas-Versi': String(INFO_GAS.versi), 'X-Abadi-Ms': `cermin=${h.msCermin};gas=${h.msGas}` };
    if (h.ok) return jawab(h.isi, 'gas-worker', env, info);
    // Gagal tertutup: jawaban yang mungkin salah tidak pernah dikirim.
    return jawab({ success: false, error: `Aksi ${aksi} tidak bisa dijawab dari Supabase: ${h.alasan}` }, 'gas-worker-ditolak', env, info);
  }
  if (!tanpaGas) return teruskanKeGas(teks, env);
  return jawab({ success: false, error: `Aksi ${aksi || '?'} belum berjalan di Worker, dan lingkungan ini tidak punya GAS.` }, 'tidak-ada', env);
}

async function jalankanGasDiWorker(teks, env, p) {
  const t0 = Date.now();
  let cermin;
  try {
    cermin = await bacaCermin(env, p.skema, p.gas.sheet_tidak_dimuat || []);
  } catch (e) {
    return { ok: false, alasan: `cermin tidak terbaca (${e.message})`, msCermin: Date.now() - t0, msGas: 0 };
  }
  const t1 = Date.now();
  try {
    const L = buatLayanan(dataDariCermin(cermin, INFO_GAS.zonaSkrip), buatHost());
    const keluar = gasKamar(L).doPost(buatPermintaanPost(teks));
    const C = L.__CATAT;
    const ms = { msCermin: t1 - t0, msGas: Date.now() - t1 };
    if (C.baca_dilewati.length) return { ok: false, alasan: `membaca sheet yang tidak dimuat (${C.baca_dilewati.join(', ')})`, ...ms };
    if (C.tidak_aman.length) return { ok: false, alasan: `memakai baris yang tidak dimuat (${C.tidak_aman.join('; ')})`, ...ms };
    if (C.tulis.length) return { ok: false, alasan: 'aksi baca ini menulis; tulisan hanya disimpan lewat aksi_tulis_worker', ...ms };
    return { ok: true, isi: keluar && keluar.getContent ? keluar.getContent() : '', ...ms };
  } catch (e) {
    return { ok: false, alasan: `galat GAS di Worker (${e && e.message})`, msCermin: t1 - t0, msGas: Date.now() - t1 };
  }
}

// Jalankan aksi tulis dengan kode GAS, lalu simpan tulisannya dalam satu transaksi (public.cermin_tulis).
// Konkurensi optimistis: bila sheet yang ditulis berubah sejak dibaca, baca ulang dan jalankan ulang GAS.
// Jawaban GAS hanya dikirim bila tulisannya benar-benar tersimpan.
async function jalankanTulisDiWorker(teks, env, p) {
  // Sheet jarang (gas.sheet_jarang_tulis, misalnya ProcessedOps → op_id): hanya baris milik op_id kiriman ini.
  let opId = '';
  try { opId = String(JSON.parse(teks).op_id || ''); } catch (_) {}
  const jarang = Object.fromEntries(Object.entries(p.gas.sheet_jarang_tulis || {}).map(([sheet, kolom]) => [sheet, { kolom, nilai: opId }]));
  for (let coba = 1; coba <= COBA_TULIS; coba++) {
    let cermin;
    try {
      cermin = await bacaCermin(env, p.skema, [], jarang);
    } catch (e) {
      return { ok: false, alasan: `cermin tidak terbaca (${e.message})`, coba };
    }
    let keluar, L;
    try {
      L = buatLayanan(dataDariCermin(cermin, INFO_GAS.zonaSkrip), buatHost());
      keluar = gasKamar(L).doPost(buatPermintaanPost(teks));
    } catch (e) {
      return { ok: false, alasan: `galat GAS di Worker (${e && e.message})`, coba };
    }
    const C = L.__CATAT;
    if (C.baca_dilewati.length) return { ok: false, alasan: `membaca sheet yang tidak dimuat (${C.baca_dilewati.join(', ')})`, coba };
    if (C.tidak_aman.length) return { ok: false, alasan: `memakai baris yang tidak dimuat (${C.tidak_aman.join('; ')})`, coba };
    const isi = keluar && keluar.getContent ? keluar.getContent() : '';
    const ekspor = L.__ekspor();
    if (!Object.keys(ekspor).length) return { ok: true, isi, ringkas: 'tanpa-tulisan', coba };
    let perubahan;
    try {
      perubahan = susunPerubahan(cermin, ekspor);
    } catch (e) {
      return { ok: false, alasan: e.message, coba };
    }
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cermin_tulis`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_skema: p.skema, p_perubahan: perubahan }),
    });
    const ringkas = Object.entries(perubahan).map(([s, x]) => `${s}:${x.tulis.length}`).join(',');
    if (r.ok) return { ok: true, isi, ringkas, coba };
    const galat = await r.text();
    if (!/KONFLIK/.test(galat)) return { ok: false, alasan: `penyimpanan gagal (HTTP ${r.status}: ${galat.slice(0, 160)})`, ringkas, coba };
  }
  return { ok: false, ramai: true, coba: COBA_TULIS };
}

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

async function teruskanKeGas(teks, env) {
  const r = await fetch(env.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: teks,
    redirect: 'follow',
  });
  return jawab(await r.text(), 'gas', env);
}

async function sehat(env) {
  const p = profil(env);
  const saklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  return new Response(JSON.stringify({
    ok: true,
    rumah: env.RUMAH,
    saklar,
    gas_tersedia: !tanpaGas,
    gas_di_worker: { versi: INFO_GAS.versi, berkas: INFO_GAS.berkas, sidik: INFO_GAS.sidik.slice(0, 12), aksi: p.gas.aksi_worker },
    supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
