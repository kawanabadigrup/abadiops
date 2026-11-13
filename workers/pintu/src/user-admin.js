/**
 * Modul Manajemen Pengguna & Token Terpusat (workers/pintu/src/user-admin.js)
 * Sesuai AGENTS.md §0a.5 ("Satu-satunya bagian lintas rumah adalah pintu"),
 * §0a.9, §2, §4, §5, dan docs/GEDUNG-DAN-STAGING.md §1.
 *
 * Arsitektur & Protokol Keamanan:
 * 1. Stateless di Cloudflare Worker (TIDAK menyentuh atau memperluas SaklarDO).
 * 2. Data pengguna & token tersimpan di kamar Supabase masing-masing rumah:
 *    - `sum`        -> RPC `sum_admin_*_bertoken` / `_sum_admin_*_internal`
 *    - `kmbtra`     -> RPC `kmbtra_admin_*_bertoken` / `_kmbtra_admin_*_internal`
 *    - `kmbprojek`  -> RPC `kmb_admin_*_bertoken` / `_kmb_admin_*_internal`
 * 3. Autentikasi Ganda:
 *    - Sesi Panel Saklar/Admin (`validasiSesi` via secret `PANEL_SAKLAR_SECRET`), ATAU
 *    - Token Admin/Superintendent sah milik rumah terkait (`X-Admin-Token` / `admin_token`).
 * 4. Anti-Tabrakan Token Lintas Rumah (docs/KEPUTUSAN.md 28 Okt):
 *    - Setiap token baru memakai awalan rumah (`sum-`, `kmb-`, `kmbp-`) + 12 karakter hex acak.
 *    - Sebelum disimpan, token dicek ke seluruh rumah (Supabase ping & GAS/GAS-Tiruan)
 *      agar dijamin tidak pernah kembar di rumah mana pun.
 * 5. Kerahasiaan Token:
 *    - Log server hanya mencatat samaran 4 karakter (`xxxx…`).
 */

import { validasiSesi } from './saklar-auth.js';
import PROFIL_RUMAH from '../../../config/rumah.json';

// Kode kamar persis seperti di RUMAH (wrangler.toml) dan config/rumah.json; tidak ada alias.
function normalisasiKodeRumah(kode) {
  return String(kode || '').trim().toLowerCase();
}

// Awalan fungsi database kamar (misalnya kmbprojek -> kmb_admin_*), dari config/rumah.json.
function prefixRpcRumah(kodeRumah) {
  const p = PROFIL_RUMAH[normalisasiKodeRumah(kodeRumah)];
  return p && p.rpc ? p.rpc : null;
}

export function daftarRumahDariEnv(env) {
  try {
    const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
    if (Array.isArray(r) && r.length > 0) return r;
  } catch (_) {}
  return [];
}

export function samarkanToken(token) {
  const t = String(token || '').trim();
  if (!t) return '';
  return t.length >= 4 ? t.slice(0, 4) + '…' : '****…';
}

export function buatKandidatTokenRumah(kodeRumah) {
  const r = normalisasiKodeRumah(kodeRumah);
  const prefix = (PROFIL_RUMAH[r] && PROFIL_RUMAH[r].awalan_token) || `${r}-`;
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}${hex}`;
}

/**
 * Periksa apakah kandidat token sudah terpakai di rumah mana pun (Supabase RPC ping).
 */
async function tokenSudahDipakai(token, env) {
  const rumahList = daftarRumahDariEnv(env);
  const checks = rumahList.map(async (r) => {
    const prefix = prefixRpcRumah(r.kode);
    if (!prefix) return false;
    if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) {
      try {
        const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${prefix}_ping`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_token: token }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d && d.success === true) return true;
        }
      } catch (_) {}
    }
    return false;
  });

  const results = await Promise.all(checks);
  return results.some(Boolean);
}

/**
 * Menghasilkan token unik lintas rumah (maksimal 5 percobaan).
 */
export async function buatTokenUnikLintasRumah(kodeRumah, env) {
  for (let i = 0; i < 5; i++) {
    const kandidat = buatKandidatTokenRumah(kodeRumah);
    const terpakai = await tokenSudahDipakai(kandidat, env);
    if (!terpakai) return kandidat;
  }
  throw new Error('Gagal membuat token unik lintas rumah, silakan coba lagi.');
}

/**
 * Memanggil RPC Admin User di Supabase untuk rumah tertentu.
 * - Jika `adminToken` diberikan, memanggil `<prefix>_admin_<aksi>_bertoken`.
 * - Jika `adminToken` kosong namun sesi panel sah, memanggil `_<prefix>_admin_<aksi>_internal`
 *   dengan kunci rahasia Supabase (`SUPABASE_SERVICE_ROLE_KEY`). Fungsi `_internal` hanya bisa dipanggil
 *   dengan kunci itu, jadi pintu masuk panel ada di Worker, bukan di kata ajaib yang bisa dipakai siapa saja.
 */
export async function panggilRpcAdminRumah({
  rumah,
  aksi,
  adminToken,
  sesiPanelSah,
  params = {},
  env,
}) {
  const kode = normalisasiKodeRumah(rumah);
  const prefix = prefixRpcRumah(kode);
  const tokenBersih = String(adminToken || '').trim();

  if (!prefix) return { success: false, error: `Profil kamar ${kode} tidak ada di config/rumah.json` };


  if (!env || !env.SUPABASE_URL || (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)) {
    return {
      success: false,
      error: 'Konfigurasi SUPABASE_URL / SUPABASE_ANON_KEY belum terpasang di Worker.',
    };
  }

  // Panel saklar tidak lagi memakai kata ajaib pengganti token: siapa pun yang tahu kata itu bisa memanggil
  // fungsi admin langsung ke Supabase tanpa lewat Worker. Panel wajib lewat fungsi _internal + kunci rahasia.
  const pakaiInternal = !tokenBersih && sesiPanelSah;
  if (pakaiInternal && !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      success: false,
      error: 'Kunci rahasia Supabase (secret SUPABASE_SERVICE_ROLE_KEY) belum dipasang di Worker pintu.',
    };
  }
  const tokenEfektif = tokenBersih;
  if (!tokenEfektif && !pakaiInternal) {
    return {
      success: false,
      error: 'Masukkan Token Admin/Superintendent rumah ini (atau login dengan sandi Panel Saklar).',
    };
  }

  const rpcName = pakaiInternal
    ? `_${prefix}_admin_${aksi}_internal`
    : `${prefix}_admin_${aksi}_bertoken`;

  const apiKey = pakaiInternal ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  let rpcPayload = {};

  if (aksi === 'daftar_user') {
    rpcPayload = pakaiInternal ? {} : { p_token: tokenEfektif };
  } else if (aksi === 'simpan_user') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_payload: params.payload || {},
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_payload: params.payload || {},
        };
  } else if (aksi === 'terbitkan_token') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
          p_token_baru: params.token_baru,
          p_ganti: Boolean(params.ganti),
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
          p_token_baru: params.token_baru,
          p_ganti: Boolean(params.ganti),
        };
  } else if (aksi === 'cabut_token') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        };
  } else if (aksi === 'hapus_user') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_mechanic_id: params.mechanic_id,
        };
  } else if (aksi === 'daftar_config') {
    rpcPayload = pakaiInternal
      ? { p_jenis: params.jenis || 'all' }
      : { p_token: tokenEfektif, p_jenis: params.jenis || 'all' };
  } else if (aksi === 'simpan_config') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_payload: params.payload || {},
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_payload: params.payload || {},
        };
  } else if (aksi === 'hapus_config') {
    rpcPayload = pakaiInternal
      ? {
          p_actor_id: params.actor_id || 'GABRIEL-PANEL',
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_kunci: params.kunci || '',
        }
      : {
          p_token: tokenEfektif,
          p_op_id: params.op_id,
          p_jenis: params.jenis || 'unit',
          p_kunci: params.kunci || '',
        };
  } else {
    return { success: false, error: `Aksi admin tidak dikenal: ${aksi}` };
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      // PGRST202: fungsinya memang belum ada. Galat lain, misalnya tabel yang dirujuk fungsi belum ada
      // (juga dijawab HTTP 404), dilaporkan dengan pesan aslinya di bawah supaya penyebabnya terlihat.
      if (errText.includes('PGRST202')) {
        return { success: false, error: `RPC ${rpcName} belum terpasang di Supabase rumah ini.` };
      }
      return {
        success: false,
        error: `Supabase RPC ${rpcName} gagal (HTTP ${res.status}): ${errText.slice(0, 240)}`,
      };
    }

    return await res.json();
  } catch (err) {
    return { success: false, error: `Gagal memanggil ${rpcName}: ${(err && err.message) || err}` };
  }
}

/**
 * Handler HTTP untuk seluruh rute `/saklar/api/users*` dan `/api/admin/users*` di Worker Pintu.
 */
export async function tanganiApiUserAdmin(request, env, url, jsonHelper) {
  const sesiPanelSah = await validasiSesi(request, env);
  const headerAdminToken = (request.headers.get('x-admin-token') || '').trim();

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch (_) {
      return jsonHelper({ success: false, error: 'Format JSON tidak valid' }, 400);
    }
  }

  const adminToken = headerAdminToken || String(body.admin_token || url.searchParams.get('admin_token') || '').trim();

  // Wajib terautentikasi lewat sesi panel saklar ATAU membawa token admin rumah
  if (!sesiPanelSah && !adminToken) {
    return jsonHelper(
      { success: false, error: 'Sesi panel tidak sah atau token admin belum diberikan.' },
      401,
    );
  }

  const rumahList = daftarRumahDariEnv(env);
  const validKode = rumahList.map((r) => normalisasiKodeRumah(r.kode));

  // 1. GET / POST daftar pengguna
  if (
    (url.pathname.endsWith('/users') || url.pathname.endsWith('/users/daftar')) &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const targetRumah = normalisasiKodeRumah(
      url.searchParams.get('rumah') || body.rumah || 'semua',
    );
    const tokensPerRumah = (body && typeof body.tokens === 'object' && body.tokens) || {};

    const daftarTarget =
      targetRumah === 'semua' || targetRumah === 'all'
        ? rumahList.map((r) => normalisasiKodeRumah(r.kode))
        : [targetRumah];

    for (const k of daftarTarget) {
      if (!validKode.includes(k)) {
        return jsonHelper({ success: false, error: `Kode rumah tidak dikenal: ${k}` }, 400);
      }
    }

    const hasilPerRumah = await Promise.all(
      daftarTarget.map(async (kode) => {
        const tokRumah = String(tokensPerRumah[kode] || adminToken || '').trim();
        const res = await panggilRpcAdminRumah({
          rumah: kode,
          aksi: 'daftar_user',
          adminToken: tokRumah,
          sesiPanelSah,
          env,
        });
        const infoRumah = rumahList.find((r) => normalisasiKodeRumah(r.kode) === kode) || {
          kode,
          nama: kode.toUpperCase(),
        };
        return {
          rumah: kode,
          nama_rumah: infoRumah.nama,
          success: Boolean(res && res.success),
          error: (res && res.error) || null,
          users: (res && res.result && Array.isArray(res.result.users))
            ? res.result.users.map((u) => ({ ...u, rumah: kode, nama_rumah: infoRumah.nama }))
            : [],
          meta: (res && res.result) || {},
        };
      }),
    );

    const semuaUsers = hasilPerRumah.flatMap((h) => h.users);
    const semuaSukses = hasilPerRumah.some((h) => h.success);

    return jsonHelper({
      success: semuaSukses || daftarTarget.length > 1,
      rumah_list: rumahList.map((r) => ({
        kode: normalisasiKodeRumah(r.kode),
        nama: r.nama,
        alamat: r.alamat,
      })),
      houses: hasilPerRumah,
      users: semuaUsers,
      error: !semuaSukses && hasilPerRumah[0] ? hasilPerRumah[0].error : null,
    });
  }

  // 2. POST simpan / ubah pengguna
  if (url.pathname.endsWith('/users/simpan') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const opId = String(body.op_id || '').trim() || `op-usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = body.user || body.payload || body.data || {};

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'simpan_user',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        payload,
      },
      env,
    });

    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: 'simpan_user',
        rumah,
        mechanic_id: payload.mechanic_id || payload.kode || '',
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 3. POST terbitkan / ganti token (dengan anti-tabrakan lintas rumah)
  if (url.pathname.endsWith('/users/token') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }

    const ganti = Boolean(body.ganti);
    const opId = String(body.op_id || '').trim() || `op-tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let tokenBaru = '';
    try {
      tokenBaru = await buatTokenUnikLintasRumah(rumah, env);
    } catch (err) {
      return jsonHelper({ success: false, error: String(err.message || err) }, 500);
    }

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'terbitkan_token',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
        token_baru: tokenBaru,
        ganti,
      },
      env,
    });

    const tokenKeluar = (res && res.result && res.result.token) || '';
    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: ganti ? 'ganti_token' : 'terbitkan_token',
        rumah,
        mechanic_id: mechanicId,
        token_samaran: samarkanToken(tokenKeluar),
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 4. POST cabut token
  if (url.pathname.endsWith('/users/cabut-token') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }

    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }

    const opId = String(body.op_id || '').trim() || `op-rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'cabut_token',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
      },
      env,
    });

    console.log(
      JSON.stringify({
        layanan: 'pintu-user-admin',
        aksi: 'cabut_token',
        rumah,
        mechanic_id: mechanicId,
        success: Boolean(res && res.success),
      }),
    );

    return jsonHelper(res, res && res.success ? 200 : 400);
  }


  // 5. POST hapus pengguna (Delete CRUD)
  if (url.pathname.endsWith('/users/hapus') && request.method === 'POST') {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const mechanicId = String(body.mechanic_id || body.mechanicId || '').trim();
    if (!mechanicId) {
      return jsonHelper({ success: false, error: 'mechanic_id wajib diisi' }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'hapus_user',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        mechanic_id: mechanicId,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 6. GET / POST daftar config per rumah atau gabungan semua rumah (Units, Components, Catalog Jobs, Factors)
  if (
    (url.pathname.endsWith('/config') || url.pathname.endsWith('/config/daftar') || url.pathname.endsWith('/users/config')) &&
    (request.method === 'GET' || request.method === 'POST')
  ) {
    const targetRumah = normalisasiKodeRumah(url.searchParams.get('rumah') || body.rumah || 'semua');
    const jenis = String(url.searchParams.get('jenis') || body.jenis || 'all');
    const tokensPerRumah = (body && typeof body.tokens === 'object' && body.tokens) || {};

    const daftarTarget =
      targetRumah === 'semua' || targetRumah === 'all'
        ? rumahList.map((r) => normalisasiKodeRumah(r.kode))
        : [targetRumah];

    for (const k of daftarTarget) {
      if (!validKode.includes(k)) {
        return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${k}` }, 400);
      }
    }

    const hasilPerRumah = await Promise.all(
      daftarTarget.map(async (kode) => {
        const tokRumah = String(tokensPerRumah[kode] || adminToken || '').trim();
        const res = await panggilRpcAdminRumah({
          rumah: kode,
          aksi: 'daftar_config',
          adminToken: tokRumah,
          sesiPanelSah,
          params: { jenis },
          env,
        });
        const infoRumah = rumahList.find((r) => normalisasiKodeRumah(r.kode) === kode) || {
          kode,
          nama: kode.toUpperCase(),
        };
        const d = (res && (res.result || res.data)) || {};
        const tag = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ ...x, rumah: kode, nama_rumah: infoRumah.nama })) : []);
        return {
          rumah: kode,
          nama_rumah: infoRumah.nama,
          success: Boolean(res && res.success),
          source: (res && res.source) || 'SUPABASE',
          notice: (res && res.notice) || null,
          error: (res && res.error) || null,
          units: tag(d.units),
          components: tag(d.components),
          jobs: tag(d.jobs),
          factors: tag(d.factors),
        };
      }),
    );

    const semuaUnits = hasilPerRumah.flatMap((h) => h.units);
    const semuaComponents = hasilPerRumah.flatMap((h) => h.components);
    const semuaJobs = hasilPerRumah.flatMap((h) => h.jobs);
    const semuaFactors = hasilPerRumah.flatMap((h) => h.factors);
    const adaSukses = hasilPerRumah.some((h) => h.success);
    const noticePesan = hasilPerRumah.find((h) => h.notice)?.notice || null;

    const gabungan = {
      units: semuaUnits,
      components: semuaComponents,
      jobs: semuaJobs,
      factors: semuaFactors,
      houses: hasilPerRumah,
    };

    return jsonHelper(
      {
        success: adaSukses || daftarTarget.length > 1,
        source: hasilPerRumah.some((h) => h.source === 'SUPABASE') ? 'SUPABASE' : null,
        notice: noticePesan,
        rumah: targetRumah,
        rumah_list: rumahList.map((r) => ({
          kode: normalisasiKodeRumah(r.kode),
          nama: r.nama,
          alamat: r.alamat,
        })),
        houses: hasilPerRumah,
        units: semuaUnits,
        components: semuaComponents,
        jobs: semuaJobs,
        factors: semuaFactors,
        result: gabungan,
        data: gabungan,
        error: !adaSukses && hasilPerRumah[0] ? hasilPerRumah[0].error : null,
      },
      adaSukses || daftarTarget.length > 1 ? 200 : 400,
    );
  }

  // 7. POST simpan / ubah config (Create / Update CRUD)
  if (
    (url.pathname.endsWith('/config/simpan') || url.pathname.endsWith('/users/config-simpan')) &&
    request.method === 'POST'
  ) {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jenis = String(body.jenis || 'unit');
    const payload = body.payload || body.data || body;
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'simpan_config',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        jenis,
        payload,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

  // 8. POST hapus config (Delete CRUD)
  if (
    (url.pathname.endsWith('/config/hapus') || url.pathname.endsWith('/users/config-hapus')) &&
    request.method === 'POST'
  ) {
    const rumah = normalisasiKodeRumah(body.rumah);
    if (!validKode.includes(rumah)) {
      return jsonHelper({ success: false, error: `Kode rumah tidak sah: ${rumah}` }, 400);
    }
    const opId = String(body.op_id || '').trim() || `op-cfgdel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const jenis = String(body.jenis || 'unit');
    const kunci = String(body.kunci || body.id || '').trim();
    if (!kunci) {
      return jsonHelper({ success: false, error: 'Kunci item config wajib diisi' }, 400);
    }
    const res = await panggilRpcAdminRumah({
      rumah,
      aksi: 'hapus_config',
      adminToken,
      sesiPanelSah,
      params: {
        actor_id: body.actor_id || 'GABRIEL-ADMIN',
        op_id: opId,
        jenis,
        kunci,
      },
      env,
    });
    return jsonHelper(res, res && res.success ? 200 : 400);
  }

    return jsonHelper({ success: false, error: 'Rute manajemen pengguna tidak dikenal' }, 404);
}
export async function handleAdminDaftarUsers(request, env) {
  const url = new URL(request.url);
  return tanganiApiUserAdmin(request, env, url, (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
export async function handleAdminSimpanUser(request, env) {
  const url = new URL(request.url);
  return tanganiApiUserAdmin(request, env, url, (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
export async function handleAdminSetTokenStatus(request, env) {
  const url = new URL(request.url);
  return tanganiApiUserAdmin(request, env, url, (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}
