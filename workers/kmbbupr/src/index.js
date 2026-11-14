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
import { gasKamar, INFO as INFO_GAS } from '../gas/gas-kamar.js';

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
    if (url.pathname === '/' || /\/api\/?$/.test(url.pathname)) {
      if (request.method !== 'POST') return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
      return tanganiApi(request, env, url);
    }
    return new Response('Tidak ditemukan', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};

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
    if (C.tulis.length) return { ok: false, alasan: 'aksi ini menulis, dan jalur tulis belum dipindah', ...ms };
    return { ok: true, isi: keluar && keluar.getContent ? keluar.getContent() : '', ...ms };
  } catch (e) {
    return { ok: false, alasan: `galat GAS di Worker (${e && e.message})`, msCermin: t1 - t0, msGas: Date.now() - t1 };
  }
}

async function bacaCermin(env, skema, tidakDimuat) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi');
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cermin_baca`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_skema: skema, p_tidak_dimuat: tidakDimuat }),
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
