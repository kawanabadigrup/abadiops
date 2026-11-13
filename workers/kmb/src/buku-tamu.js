/**
 * Buku Tamu Kiriman (docs/SAKLAR.md): kiriman yang dikirim ulang dengan op_id yang sama tidak diproses dua kali.
 *
 * Disimpan di SaklarDO milik pintu, lewat ikatan Durable Object langsung (SAKLAR_DO dengan script_name pintu),
 * bukan lewat URL publik. Tanpa ikatan itu buku tamu tidak aktif, dan tidak pernah jatuh ke alamat pintu lain.
 *
 * Catatan dikunci per rumah (env.RUMAH) dan per pemilik token (sidik SHA-256, bukan tokennya). Hasil hanya
 * dikembalikan kepada pemilik token yang sama di rumah yang sama. Hanya kiriman yang berhasil (success: true)
 * yang dicatat, supaya kiriman yang gagal tetap dicoba ulang. Umur catatan diatur SaklarDO (30 hari).
 */

function stubBukuTamu(env) {
  if (!env || !env.SAKLAR_DO || !env.RUMAH) return null;
  try {
    return env.SAKLAR_DO.get(env.SAKLAR_DO.idFromName('abadiops-master-saklar'));
  } catch (err) {
    console.warn('Buku tamu: SaklarDO tidak bisa dibuka:', (err && err.message) || err);
    return null;
  }
}

async function sidikPemilik(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token).trim()));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cekBukuTamu(opId, token, env) {
  const stub = stubBukuTamu(env);
  if (!opId || !token || !stub) return null;
  try {
    const res = await stub.fetch('https://saklar.internal/?action=buku_tamu_cek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rumah: env.RUMAH, op_id: String(opId), pemilik: await sidikPemilik(token) }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.found && data.record) return data.record;
    }
  } catch (err) {
    console.warn('Gagal cek buku tamu:', (err && err.message) || err);
  }
  return null;
}

export async function catatBukuTamu(opId, token, result, env) {
  const stub = stubBukuTamu(env);
  if (!opId || !token || !stub || !result || result.success !== true) return;
  try {
    await stub.fetch('https://saklar.internal/?action=buku_tamu_simpan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rumah: env.RUMAH, op_id: String(opId), pemilik: await sidikPemilik(token), result }),
    });
  } catch (err) {
    console.warn('Gagal catat buku tamu:', (err && err.message) || err);
  }
}
