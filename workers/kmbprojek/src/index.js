/**
 * Rumah KMB Project: Worker `abadiops-kmbprojek`
 * Rumah: kmbprojek · Pemegang: Raka
 *
 * Arsitektur Mandiri (Zero Third-Party GAS Dependency saat Saklar Supabase Aktif):
 *   1. Menyajikan file PWA 1:1 (`pwa/kmbprojek/`);
 *   2. Melayani SELURUH aksi baca, tulis, manajemen pengguna (`admin_*`), dan web desktop
 *      langsung dari Worker + Supabase skema `kmb_projek` (`./supabase-backend.js`);
 *   3. Hanya meneruskan ke GAS jika saklar bernilai `gas` (mode warisan).
 */

import { handleWebRequest, handleWebBridgeApi } from './web-handler.js';
import {
  SEMUA_AKSI_SUPABASE,
  AKSI_ADMIN_SUPABASE,
  eksekusiAksiSupabaseMandiri,
  eksekusiSupabaseBackendKmbp,
} from './supabase-backend.js';
import { cekBukuTamu, catatBukuTamu } from './buku-tamu.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine',
};

// Seluruh aksi baca & tulis kini didukung penuh oleh mesin mandiri Supabase di repo
const AKSI_SUPABASE_LULUS_KEMBAR = SEMUA_AKSI_SUPABASE;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/api/sehat')) return sehat(env);
    if (url.pathname === '/api/web' || url.pathname === '/api/web/') return handleWebBridgeApi(request, env, url);
    if (url.pathname === '/web' || url.pathname === '/web/' || url.pathname.startsWith('/web/')) return handleWebRequest(request, env, url);
    if (/\/api\/?$/.test(url.pathname)) return tanganiApi(request, env, url);

    // Akar folder → index.html, disajikan langsung tanpa redirect (lihat wrangler.toml).
    if (url.pathname.endsWith('/')) {
      return env.ASSETS.fetch(new Request(new URL(url.pathname + 'index.html', url), request));
    }
    return env.ASSETS.fetch(request);
  },
};

async function tanganiApi(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const bodyText = await request.text();
  let parsed = {};
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {}

  const action = parsed.action || '';
  const token = parsed.token || (parsed.data && parsed.data.token) || '';

  // Buku Tamu Kiriman (Idempotency Store di Cloudflare, docs/SAKLAR.md)
  const opId = parsed.op_id || parsed.kiriman_id || parsed.data?.op_id || parsed.data?.kiriman_id;
  if (opId) {
    const cached = await cekBukuTamu(opId, token, env);
    if (cached && cached.result) {
      return new Response(JSON.stringify(cached.result), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'X-Abadi-Buku-Tamu': 'hit' }
      });
    }
  }

  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  const reqEngine = (
    request.headers.get('x-active-engine') ||
    url.searchParams.get('engine') ||
    parsed.engine ||
    (liveSaklar !== 'gas' || tanpaGas ? 'SUPABASE' : (env.STORAGE_MODE || 'GAS'))
  ).toUpperCase();

  const ujiSupabase = url.searchParams.get('uji') === 'supabase';
  const woSupabase = apakahWoLahirDiSupabase(parsed);
  const woGasLama = apakahWoLamaDariGas(parsed);

  const bolehSupabase = (aksi) => {
    if (ujiSupabase || tanpaGas || liveSaklar === 'supabase') return true;
    // Saklar Balik (docs/SAKLAR.md): WO yang sudah terlanjur lahir di Supabase tetap diselesaikan di Supabase walau saklar = 'gas'
    if (woSupabase) return true;
    // Mode dua_cabang (docs/SAKLAR.md): WO lama yang lahir di GAS (3 digit) tetap diselesaikan di GAS untuk aksi tulis
    if (liveSaklar === 'dua_cabang') {
      const aksiTulisWo = new Set([
        'submit_work', 'submit_job', 'save_override', 'approve_l1', 'approve_l2',
        'reject', 'cancel_wo', 'request_transfer', 'approve_transfer', 'reject_transfer',
        'report_expired', 'reopen_expired',
      ]);
      if (aksiTulisWo.has(aksi) && woGasLama && !tanpaGas) return false;
      return true;
    }
    return (
      (AKSI_ADMIN_SUPABASE.has(aksi) && (reqEngine === 'SUPABASE' || liveSaklar !== 'gas')) ||
      (reqEngine === 'SUPABASE' && AKSI_SUPABASE_LULUS_KEMBAR.has(aksi))
    );
  };

  if (bolehSupabase(action) && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const resSupa = await cobaSupabaseMandiri(action, token, parsed, liveSaklar, tanpaGas, env);
    if (resSupa) {
      if (opId && resSupa.status === 200) {
        try {
          const klon = resSupa.clone();
          const dataResult = await klon.json();
          await catatBukuTamu(opId, token, dataResult, env);
        } catch (_) {}
      }
      return resSupa;
    }
  }

  if (tanpaGas || liveSaklar === 'supabase') {
    return new Response(JSON.stringify({
      success: false,
      source: 'SUPABASE',
      error: `Aksi ${action || '?'} gagal diproses di Supabase mandiri (GAS dinonaktifkan).`,
    }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        'X-Abadi-Jalur': 'supabase',
      },
    });
  }

  const resGas = await teruskanKeGas(bodyText, action, env);
  if (resGas && resGas.status === 200 && opId) {
    try {
      const klon = resGas.clone();
      const dataResult = await klon.json();
      await catatBukuTamu(opId, token, dataResult, env);
    } catch (_) {}
  }
  return resGas;
}

async function cobaSupabaseMandiri(action, token, parsed, liveSaklar, tanpaGas, env) {
  try {
    if (!SEMUA_AKSI_SUPABASE.has(action)) return null;
    const data = await eksekusiAksiSupabaseMandiri(action, token, parsed, env);
    if (
      data &&
      (data.success ||
       AKSI_ADMIN_SUPABASE.has(action) ||
       liveSaklar === 'supabase' ||
       liveSaklar === 'dua_cabang' ||
       tanpaGas)
    ) {
      catat(env, { aksi: action, jalur: 'supabase', status: 200 });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
          'X-Abadi-Jalur': 'supabase',
          'X-Active-Engine': 'SUPABASE',
        },
      });
    }
  } catch (err) {
    catat(env, { aksi: action, galat_supabase: String((err && err.message) || err) });
  }
  return null;
}

async function teruskanKeGas(body, aksi, env) {
  const mulai = Date.now();
  try {
    const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
      ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
      : fetch;
    const res = await fetcher(env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });
    const teks = await res.text();
    catat(env, { aksi, status: res.status, ms: Date.now() - mulai, jalur: 'gas' });
    return new Response(teks, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'kmbprojek',
        'X-Abadi-Jalur': 'gas',
      },
    });
  } catch (e) {
    catat(env, { aksi, galat: String((e && e.message) || e), ms: Date.now() - mulai });
    return new Response('GAS_TIDAK_TERJANGKAU', {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

function catat(env, isi) {
  console.log(JSON.stringify({ rumah: (env && env.RUMAH) || 'kmbprojek', ...isi }));
}

let cacheSaklar = { nilai: null, waktu: 0 };

export async function bacaStatusSaklar(env) {
  if (env && (env.STORAGE_MODE === 'SUPABASE' || env.SAKLAR === 'supabase')) {
    return 'supabase';
  }
  const sekarang = Date.now();
  // Jika PINTU service binding tersedia, panggil langsung (0ms internal RPC) agar pembalikan saklar berlaku seketika tanpa jeda cache
  if (!(env && env.PINTU) && cacheSaklar.nilai && cacheSaklar.waktu > sekarang) {
    return cacheSaklar.nilai;
  }
  let hasil = (env && env.SAKLAR) || 'gas';
  try {
    let r = null;
    if (env && env.PINTU && typeof env.PINTU.fetch === 'function') {
      r = await env.PINTU.fetch('https://pintu.internal/api/saklar/status');
    } else {
      const isStaging = (env?.GAS_URL && env.GAS_URL.includes('gas-tiruan')) || (env?.RUMAH && env.RUMAH.includes('staging'));
      const url = env?.PINTU_STATUS_URL || (isStaging
        ? 'https://abadiops-pintu-staging.kawanabadigrup.workers.dev/api/saklar/status'
        : 'https://abadiops.com/api/saklar/status');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
    }
    if (r && r.ok) {
      const data = await r.json();
      const sw = data?.switches || {};
      const val = sw[env?.RUMAH] || sw['kmbprojek'] || sw['kmbprojek'];
      if (val) {
        hasil = val;
        cacheSaklar = { nilai: hasil, waktu: sekarang + 5000 };
      }
    }
  } catch (_) {}
  return hasil;
}

async function sehat(env) {
  const liveSaklar = await bacaStatusSaklar(env);
  const tanpaGas = !env.GAS_URL || String(env.GAS_URL).trim() === '';
  return new Response(JSON.stringify({
    ok: true,
    rumah: env.RUMAH || 'kmbprojek',
    saklar: liveSaklar,
    jalur: (liveSaklar === 'supabase' || tanpaGas)
      ? 'supabase'
      : (liveSaklar === 'dua_cabang' ? 'dua_cabang' : 'gas'),
    backend_mandiri: true,
    supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}


// Deteksi apakah sebuah WO lahir di Supabase (ID berawalan WO-SB- / WO-KMBP- atau nomor 4 digit WO-YYYYMMDD-XXXX).
// Sesuai docs/SAKLAR.md ("Satu WO, satu rumah" & "Saklar balik"): WO yang sudah lahir di Supabase
// tetap tinggal dan diselesaikan di Supabase walaupun saklar dibalik kembali ke `gas`.
export function apakahWoLahirDiSupabase(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const d = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  const kandidat = [
    parsed.wo_id, parsed.id, parsed.wo_number,
    d.wo_id, d.id, d.wo_number,
  ].map((x) => String(x || '').trim()).filter(Boolean);

  for (const k of kandidat) {
    if (/^(WO-SB-|WO-KMBP-|sb_)/i.test(k)) return true;
    if (/^WO-\d{8}-\d{4}$/i.test(k)) return true;
  }
  return false;
}

export function apakahWoLamaDariGas(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const d = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  const kandidat = [
    parsed.wo_id, parsed.id, parsed.wo_number,
    d.wo_id, d.id, d.wo_number,
  ].map((x) => String(x || '').trim()).filter(Boolean);

  if (kandidat.length === 0) return false;
  if (apakahWoLahirDiSupabase(parsed)) return false;
  for (const k of kandidat) {
    if (/^WO-\d{13}-\d+$/i.test(k)) return true;
    if (/^WO-\d{8}-\d{3}(?:-[A-Z0-9]+)?$/i.test(k)) return true;
  }
  return false;
}
// Menangani aksi admin kamar kmb_admin_daftar_user_bertoken via Supabase RPC mandiri
