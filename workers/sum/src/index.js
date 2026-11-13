/**
 * Rumah SUM V2: Worker `abadiops-sum`
 * Rumah: sum · Pemegang: Gabriel · Penjelasan: workers/sum/README.md
 *
 * Tahap 4 (Dual-Engine):
 *   1. menyajikan file PWA SUM (pwa/sum/, salinan 1:1 dari mar-sum-offline v45);
 *   2. melayani aksi baca dari Supabase skema `sum` jika diaktifkan atau lulus kembar;
 *   3. meneruskan panggilan tulis dan fallback aksi baca ke GAS SUM.
 * Saklar rumah ini: `gas` (docs/SAKLAR.md).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine',
};

import { handleWebRequest, handleWebBridgeApi } from './web-handler.js';
import {
  eksekusiSupabaseBackendSum,
  bacaStatusSaklar,
  ekstrakWoId,
  apakahWoLahirDiSupabase,
  apakahWoLamaDariGas
} from './supabase-backend.js';
import { cekBukuTamu, catatBukuTamu } from './buku-tamu.js';

// Gerbang uji kembar (bug #12). Kosong sampai aksi lulus uji kembar rumah ini.
// Saklar (docs/SAKLAR.md) yang memilih jalur, bukan set ini.
const AKSI_SUPABASE_LULUS_KEMBAR = new Set([]);

// Aksi tulis pada satu WO. Saat saklar dua_cabang, WO lama (GAS) tetap ke GAS.
const AKSI_TULIS_WO = new Set([
  'submit_work',
  'submit_job',
  'save_override',
  'approve_l1',
  'approve_l2',
  'reject',
  'cancel_wo',
  'request_transfer',
  'approve_transfer',
  'reject_transfer',
  'report_expired',
  'reopen_expired',
]);

export default {
  async fetch(request, env) {
    try {
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
    } catch (err) {
      console.error('Unhandled worker exception di sum:', err);
      return new Response('Terjadi kesalahan internal pada worker SUM: ' + ((err && err.message) || err), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  },
};

async function tanganiApi(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') {
    return new Response('Hanya POST', { status: 405, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const liveSaklar = await bacaStatusSaklar(env);
  const bodyText = await request.text();
  let parsed = {};
  try {
    parsed = JSON.parse(bodyText);
  } catch (_) {}

  const action = parsed.action || '';
  const token = parsed.token || '';
  const ujiSupabase = url.searchParams.get('uji') === 'supabase';
  const targetWoId = ekstrakWoId(parsed);
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);
  const woGas = apakahWoLamaDariGas(targetWoId);

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

  // docs/SAKLAR.md — tiga posisi, satu WO satu rumah.
  // gas: semua ke GAS, kecuali WO yang sudah lahir di Supabase, atau aksi yang lulus uji kembar.
  // dua_cabang: WO baru + daftar/monitoring ke Supabase; aksi tulis WO lama tetap GAS.
  // supabase: semua ke Supabase, tanpa fallback GAS.
  const aksiTulisWoLama = liveSaklar === 'dua_cabang' && AKSI_TULIS_WO.has(action) && woGas && !woSupabase;
  const harusKeSupabase = !aksiTulisWoLama && (
    woSupabase ||
    liveSaklar === 'supabase' ||
    liveSaklar === 'dua_cabang' ||
    ujiSupabase ||
    (liveSaklar === 'gas' && AKSI_SUPABASE_LULUS_KEMBAR.has(action))
  );

  if (harusKeSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const resSupa = await eksekusiSupabaseBackendSum(action, token, parsed, env);
    if (resSupa && resSupa.status === 200) {
      catat(env, { aksi: action, jalur: 'supabase', status: 200, wo: targetWoId });
      if (opId) {
        try {
          const klon = resSupa.clone();
          const dataResult = await klon.json();
          await catatBukuTamu(opId, token, dataResult, env);
        } catch (_) {}
      }
      return resSupa;
    }
    // Jika saklar 'supabase' murni atau WO lahir di Supabase, jangan fallback ke GAS
    if (liveSaklar === 'supabase' || woSupabase) {
      return resSupa || new Response(JSON.stringify({ success: false, error: 'Supabase backend gagal', source: 'SUPABASE' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
    // Fallback lama cobaSupabaseSum jika ada rpc spesifik
    const fallbackSupa = await cobaSupabaseSum(action, token, parsed, env);
    if (fallbackSupa) {
      if (opId && fallbackSupa.status === 200) {
        try {
          const klon = fallbackSupa.clone();
          const dataResult = await klon.json();
          await catatBukuTamu(opId, token, dataResult, env);
        } catch (_) {}
      }
      return fallbackSupa;
    }
  }

  // Fallback ke GAS
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

async function cobaSupabaseSum(action, token, parsed, env) {
  const supaHeaders = {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  try {
    let rpcName = '';
    let payload = {};

    if (action === 'ping' && token) {
      rpcName = 'sum_ping';
      payload = { p_token: token };
    } else if (action === 'pull_monitoring' && token) {
      rpcName = 'sum_eksekusi_aksi_bertoken';
      payload = { p_token: token, p_aksi: 'pull_monitoring', p_payload: {} };
    } else if (action === 'pull_monitoring_daftar' && token) {
      rpcName = 'sum_eksekusi_aksi_bertoken';
      payload = { p_token: token, p_aksi: 'pull_monitoring_daftar', p_payload: {} };
    } else if (action === 'handleGetWoDetailForMechanic' && token) {
      rpcName = 'sum_eksekusi_aksi_bertoken';
      payload = { p_token: token, p_aksi: 'pull_wo_detail', p_payload: { wo_id: (parsed.wo_id || parsed.id || '').toString() } };
    } else if (action === 'pull_my_wos' && token) {
      rpcName = 'sum_eksekusi_aksi_bertoken';
      payload = { p_token: token, p_aksi: 'pull_my_wos', p_payload: {} };
    } else if (action === 'admin_daftar_user' && token) {
      rpcName = 'sum_admin_daftar_user_bertoken';
      payload = { p_token: token };
    } else if (action === 'admin_simpan_user' && token) {
      rpcName = 'sum_admin_simpan_user_bertoken';
      payload = { p_token: token, p_user: parsed.user || parsed.data || {} };
    } else if (action === 'admin_set_token_status' && token) {
      rpcName = 'sum_admin_set_token_status_bertoken';
      payload = { p_token: token, p_target_token: parsed.target_token || parsed.token_target || '', p_status: parsed.status || 'ACTIVE' };
    }

    if (!rpcName) return null;

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        catat(env, { aksi: action, jalur: 'supabase', status: 200 });
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Abadi-Rumah': env.RUMAH,
            'X-Abadi-Jalur': 'supabase',
          },
        });
      }
    }
  } catch (err) {
    catat(env, { aksi: action, galat_supabase: String((err && err.message) || err) });
  }

  return null; // Fallback ke GAS
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
        'X-Abadi-Rumah': env.RUMAH,
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
  console.log(JSON.stringify({ rumah: env.RUMAH, ...isi }));
}


async function sehat(env) {
  const liveSaklar = await bacaStatusSaklar(env);
  return new Response(JSON.stringify({
    ok: true,
    rumah: env.RUMAH,
    saklar: liveSaklar,
    jalur: liveSaklar === 'gas' ? 'gas' : liveSaklar,
    supabase_configured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
