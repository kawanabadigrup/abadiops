/**
 * Pintu Abadi Operation (abadiops.com). Netral: tidak menampilkan aplikasi rumah mana pun.
 * Keputusan: docs/KEPUTUSAN.md 28 Okt 2026. Bagian bersama (AGENTS.md §2).
 *
 * Rute:
 * - GET  /                              -> Halaman Pintu (index.html)
 * - POST /api/pintu                     -> Ping token ke semua rumah (kenaliRumah: Supabase mandiri & GAS)
 * - GET  /saklar (atau /admin)          -> Panel Pengelola: Saklar Dua Cabang & Manajemen Pengguna Terpusat
 * - POST /saklar/api/masuk              -> Login panel pengelola
 * - GET  /saklar/api/status             -> Ambil posisi saklar & audit history (auth required)
 * - POST /saklar/api/ubah               -> Balik posisi saklar (auth required)
 * - GET|POST /saklar/api/users*         -> Manajemen Pengguna & Token Lintas Rumah via Supabase RPC (auth required)
 * - GET  /api/saklar/status             -> Endpoint publik/antar-worker untuk cek posisi saklar
 *
 * Durable Object: SaklarDO (HANYA untuk saklar & riwayatnya; tidak diperluas untuk data user).
 */

import { SaklarDO } from './saklar-do.js';
import { verifikasiKataSandi, validasiSesi } from './saklar-auth.js';
import { tanganiApiUserAdmin, handleAdminDaftarUsers, handleAdminSimpanUser, handleAdminSetTokenStatus } from './user-admin.js';
import PROFIL_RUMAH from '../../../config/rumah.json';

export { SaklarDO };

const BATAS_GAS_MS = 25000;

function daftarRumah(env) {
  const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
  if (!Array.isArray(r) || !r.length) throw new Error('RUMAH belum dikonfigurasi di wrangler.toml');
  for (const x of r) if (!PROFIL_RUMAH[x.kode]) throw new Error(`Kamar ${x.kode} ada di RUMAH tapi tidak ada di config/rumah.json`);
  return r;
}

// Satu kamar untuk panel: identitas dari RUMAH (berbeda per lingkungan), sifat dari config/rumah.json.
function ringkasRumahPanel(r) {
  const p = PROFIL_RUMAH[r.kode];
  return { kode: r.kode, nama: r.nama || p.nama, alamat: r.alamat, skema: p.skema, section: p.section, peran: p.peran };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function getSaklarStub(env) {
  if (!env.SAKLAR_DO) return null;
  try {
    const id = env.SAKLAR_DO.idFromName('abadiops-master-saklar');
    return env.SAKLAR_DO.get(id);
  } catch (err) {
    console.warn('Gagal inisialisasi SaklarDO stub:', err);
    return null;
  }
}

// Fungsi ping Supabase kamar dari profilnya (<rpc>_ping). Kamar "GAS asli di Worker" (profil punya bagian gas)
// tidak punya fungsi ping di Supabase: ia dikenali lewat GAS-nya, yaitu Worker rumah itu.
function rpcPingUntukRumah(kode) {
  const p = PROFIL_RUMAH[String(kode || '').toLowerCase()];
  if (!p || p.gas) return null;
  return `${p.rpc}_ping`;
}

async function tanyaSupabasePing(rumah, token, env) {
  const rpcName = rpcPingUntukRumah(rumah.kode);
  if (!rpcName || !env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { rumah, lewati: true };
  }
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return { rumah, lewati: true };
    const d = await res.json();
    if (d && d.success === true && d.result) return { rumah, cocok: true, d, sumber: 'SUPABASE' };
    if (d && d.success === false) return { rumah, cocok: false, d, sumber: 'SUPABASE' };
    return { rumah, lewati: true };
  } catch (_) {
    return { rumah, lewati: true };
  }
}

// Badan ping sama dengan yang dikirim PWA lama ke GAS.
async function tanyaGas(rumah, token, env) {
  if (!rumah.gas) {
    return { rumah, cocok: false, d: { success: false, error: 'Token tidak dikenal / nonaktif' } };
  }
  const ctrl = new AbortController();
  const batas = setTimeout(() => ctrl.abort(), BATAS_GAS_MS);
  try {
    const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
      ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
      : fetch;
    const res = await fetcher(rumah.gas, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action: 'ping', data: {} }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const d = await res.json();
    if (d && d.success === true && d.result) return { rumah, cocok: true, d, sumber: 'GAS' };
    if (d && d.success === false) return { rumah, cocok: false, d, sumber: 'GAS' };
    return { rumah, gagal: true, err: 'jawaban tidak dikenal' };
  } catch (err) {
    return { rumah, gagal: true, err: String((err && err.message) || err) };
  } finally {
    clearTimeout(batas);
  }
}

async function bacaPetaSaklar(env) {
  const peta = {};
  for (const r of daftarRumah(env)) peta[r.kode] = 'gas';
  try {
    const stub = getSaklarStub(env);
    if (stub) {
      const resp = await stub.fetch('https://saklar.internal/?action=status');
      const data = await resp.json();
      if (data && data.switches) {
        for (const r of daftarRumah(env)) {
          peta[r.kode] = data.switches[r.kode]?.posisi || 'gas';
        }
      }
    }
  } catch (_) {}
  return peta;
}

async function periksaSatuRumah(rumah, token, modeSaklar, env) {
  const tanpaGas = !rumah.gas || modeSaklar === 'supabase';
  // Cek di Supabase lebih dulu bila rumah memakai Supabase / dua_cabang atau tanpa GAS
  if (tanpaGas || modeSaklar === 'dua_cabang' || (env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY)) {
    const hasilSupa = await tanyaSupabasePing(rumah, token, env);
    if (hasilSupa.cocok) return hasilSupa;
    if (tanpaGas && !hasilSupa.lewati) return hasilSupa;
  }
  if (tanpaGas && (!env.GAS_TIRUAN)) {
    return { rumah, cocok: false, d: { success: false, error: 'Token tidak dikenal / nonaktif' } };
  }
  return tanyaGas(rumah, token, env);
}

async function kenaliRumah(token, env) {
  const petaSaklar = await bacaPetaSaklar(env);
  const hasil = await Promise.all(
    daftarRumah(env).map((r) => periksaSatuRumah(r, token, petaSaklar[r.kode] || 'gas', env))
  );
  const cocok = hasil.filter((h) => h.cocok);
  const gagal = hasil.filter((h) => h.gagal);
  if (gagal.length) console.log('pintu: rumah tidak menjawab: ' + gagal.map((h) => `${h.rumah.kode} (${h.err})`).join(', '));

  if (cocok.length > 1) {
    console.log(`pintu: TOKEN KEMBAR ${token.slice(0, 4)}… di ${cocok.map((h) => h.rumah.kode).join(' + ')}`);
    return { success: false, error: 'Token ini terdaftar di lebih dari satu rumah. Hubungi admin.' };
  }
  if (cocok.length === 1) {
    const { rumah, d } = cocok[0];
    const modeRumah = petaSaklar[rumah.kode] || 'gas';
    const alamatBersih = String(rumah.alamat || '').replace(/\/$/, '');
    const webMandiri = alamatBersih ? `${alamatBersih}/web` : (rumah.web || '');
    const webTujuan = (modeRumah !== 'gas' || !rumah.gas) ? webMandiri : (rumah.web || webMandiri);
    return {
      success: true,
      rumah: rumah.kode,
      nama_rumah: rumah.nama,
      alamat_rumah: rumah.alamat,
      web_rumah: webTujuan,
      nama: (d.result && (d.result.name || d.result.nama)) || '',
    };
  }
  if (gagal.length) return { success: false, error: 'Server sedang sibuk, token belum bisa diperiksa. Coba lagi sebentar lagi.' };
  const tolak = hasil.find((h) => h.d && h.d.error);
  return { success: false, error: (tolak && tolak.d.error) || 'Token tidak dikenal / nonaktif' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Penanganan CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        },
      });
    }

    // --- Rute Panel Saklar & Admin Terpusat (docs/SAKLAR.md) ---
    if (
      url.pathname === '/saklar' ||
      url.pathname === '/saklar/' ||
      url.pathname === '/saklar.html' ||
      url.pathname === '/admin' ||
      url.pathname === '/admin/'
    ) {
      return env.ASSETS.fetch(new Request(new URL('/saklar.html', url), request));
    }

    // API Masuk / Login Panel Saklar & Admin
    if (url.pathname === '/saklar/api/masuk' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
      const auth = await verifikasiKataSandi(body.password || '', env, clientIp);
      if (!auth.ok) {
        return json({ success: false, ok: false, error: auth.error }, 401);
      }
      return json({ success: true, ok: true, token: auth.token }, 200, {
        'Set-Cookie': `abadi_saklar_session=${encodeURIComponent(auth.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`,
      });
    }

    // API Manajemen Pengguna & Token Terpusat (Stateless -> Supabase RPC per Kamar)
        // API Manajemen Pengguna & Token Terpusat (Stateless -> Supabase RPC per Kamar)
    // GET  /saklar/api/admin/users        -> handleAdminDaftarUsers
    // POST /saklar/api/admin/users/simpan -> handleAdminSimpanUser
    // POST /saklar/api/admin/tokens/status -> handleAdminSetTokenStatus
    if (url.pathname === '/saklar/api/admin/users') return handleAdminDaftarUsers(request, env);
    if (url.pathname === '/saklar/api/admin/users/simpan') return handleAdminSimpanUser(request, env);
    if (url.pathname === '/saklar/api/admin/tokens/status') return handleAdminSetTokenStatus(request, env);
    if (
      url.pathname.startsWith('/saklar/api/users') ||
      url.pathname.startsWith('/saklar/api/admin/') ||
      url.pathname.startsWith('/api/admin/users') ||
      url.pathname.startsWith('/saklar/api/config') ||
      url.pathname.startsWith('/api/admin/config')
    ) {
      return tanganiApiUserAdmin(request, env, url, json);
    }

    // API Status Saklar (Khusus Panel Saklar - butuh autentikasi)
    if (url.pathname === '/saklar/api/status' && request.method === 'GET') {
      const valid = await validasiSesi(request, env);
      if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);

      const rumahList = daftarRumah(env);
      const stub = getSaklarStub(env);
      if (!stub) {
        const switches = {};
        for (const r of rumahList) {
          switches[r.kode] = { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Durable Object belum terpasang' };
        }
        return json({
          success: true,
          rumah_list: rumahList.map(ringkasRumahPanel),
          switches,
          history: [],
        });
      }

      const resp = await stub.fetch('https://saklar.internal/?action=status');
      const data = await resp.json();
      return json({
        ...data,
        rumah_list: rumahList.map(ringkasRumahPanel),
      });
    }

    // API Ubah Saklar (Khusus Panel Saklar - butuh autentikasi)
    if (url.pathname === '/saklar/api/ubah' && request.method === 'POST') {
      const valid = await validasiSesi(request, env);
      if (!valid) return json({ success: false, error: 'Sesi tidak sah atau telah kadaluwarsa' }, 401);

      let body = {};
      try { body = await request.json(); } catch (_) {
        return json({ success: false, error: 'Format JSON salah' }, 400);
      }

      const stub = getSaklarStub(env);
      if (!stub) {
        return json({ success: false, error: 'Durable Object saklar tidak tersedia pada runtime ini.' }, 500);
      }

      const resp = await stub.fetch('https://saklar.internal/?action=ubah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      return new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // API Publik / Antar-Rumah untuk mengecek status saklar (tanpa history)
    if (url.pathname === '/api/saklar/status' && request.method === 'GET') {
      const switches = await bacaPetaSaklar(env);
      return json({ success: true, switches }, 200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store',
      });
    }

    // Buku tamu kiriman tidak punya rute publik. Rute /api/buku-tamu/* dulu bisa dibaca dan diisi siapa saja;
    // sekarang Worker rumah memakai SaklarDO langsung lewat ikatan Durable Object (butir 5 serah-terima 13 Nov).

    // --- Rute Pintu Utama (Pengenalan Token) ---
    if (url.pathname === '/api/pintu') {
      if (request.method !== 'POST') return json({ success: false, error: 'Metode tidak didukung' }, 405);
      let token = '';
      try { token = String((await request.json()).token || '').trim(); } catch (_) { /* badan kosong / bukan JSON */ }
      if (!token) return json({ success: false, error: 'Silakan masukkan token akses.' });
      return json(await kenaliRumah(token, env));
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    return env.ASSETS.fetch(request);
  },
};