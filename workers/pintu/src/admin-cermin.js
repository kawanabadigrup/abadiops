/**
 * Pusat admin di atas cermin spreadsheet (panel pintu, "Pusat Semua Rumah"): pengguna, token, dan sheet config
 * setiap rumah, disunting seperti menyunting spreadsheet-nya.
 *
 * - Kolom diambil dari judul sheet di cermin (cermin_header), bukan daftar yang ditulis di kode. Setiap rumah
 *   punya kolomnya sendiri (SUM: jabatan_aktual, golongan; keluarga KMB: position, grade, section, …).
 * - Baca lewat public.cermin_baca (p_hanya: hanya sheet yang perlu). Tulis lewat jalur yang sama dengan GAS asli
 *   di Worker: perubahan dikerjakan pada tiruan SpreadsheetApp (workers/bersama/gas-layanan.js), lalu disimpan
 *   dengan public.cermin_tulis dalam satu transaksi berversi. Bentuk sel (angka, boolean, tanggal) jadi sama
 *   dengan tulisan GAS dan alat sinkron.
 * - Versi: setiap ubah/hapus membawa versi sheet saat panel memuatnya. Bila sheet sudah berubah (orang lain,
 *   atau aplikasi), penyimpanan ditolak (409) dan panel memuat ulang, karena nomor baris bisa sudah bergeser.
 * - Uang: kolom di config/rumah.json <rumah>.admin.kolom_uang. Perubahan yang menyentuhnya ditolak (428) sampai
 *   permintaan membawa konfirmasi_uang; ditegakkan di sini, bukan hanya di layar.
 * - Izin tulis: hanya bila saklar rumah itu "supabase" (Supabase sumber data) atau pintu ini staging
 *   (LINGKUNGAN = "staging", tanpa GAS sungguhan). Selama saklar "gas", spreadsheet sumber datanya: panel hanya
 *   melihat, karena perubahan di cermin akan tertimpa sinkron berikutnya.
 * - Token mengikuti TokenAdmin GAS: terbitkan mengembalikan token aktif yang sudah ada; ganti mencabut token aktif
 *   lalu membuat yang baru; cabut mengisi is_active = false. Token baru memakai awalan rumah + 20 hex acak dan dicek
 *   ke token semua rumah (KEPUTUSAN 28 Okt).
 * - Setiap perubahan dicatat di public.cermin_admin_log (bukan AuditLogs GAS); token disamarkan.
 * Hanya sesi panel (kata sandi panel) yang boleh memakai semua rute ini, termasuk melihat.
 */
import PROFIL_RUMAH from '../../../config/rumah.json';
import { buatLayanan, dataDariCermin } from '../../bersama/gas-layanan.js';
import { buatHost } from '../../bersama/gas-host.js';
import { susunPerubahan } from '../../bersama/gas-simpan.js';
import { validasiSesi } from './saklar-auth.js';

const COBA_TULIS = 3;
// Nama kolom yang dipakai logika token/pengguna. Ini kontrak kode GAS keluarga MAR (TokenAdmin, ApiService),
// sama di keempat rumah; bisa ditimpa per rumah lewat <rumah>.admin.kolom.
const KOLOM_BAWAAN = {
  pengguna_kunci: 'mechanic_id', pengguna_email: 'email', pengguna_aktif: 'is_active',
  token: 'token', token_mekanik: 'mechanic_id', token_email: 'email', token_aktif: 'is_active', token_dibuat: 'created_at',
};

class Galat extends Error {
  constructor(pesan, status = 400, tambahan = {}) { super(pesan); this.status = status; this.tambahan = tambahan; }
}

function daftarRumah(env) {
  try {
    const r = typeof env.RUMAH === 'string' ? JSON.parse(env.RUMAH) : env.RUMAH;
    return Array.isArray(r) ? r : [];
  } catch (_) { return []; }
}

function profil(env, kode) {
  const k = String(kode || '').trim().toLowerCase();
  if (!daftarRumah(env).some((r) => String(r.kode).toLowerCase() === k)) throw new Galat(`Rumah "${k}" tidak ada di daftar RUMAH pintu ini.`);
  const p = PROFIL_RUMAH[k];
  if (!p || !p.skema || !p.admin) throw new Galat(`Profil admin rumah ${k} belum ada di config/rumah.json.`);
  return { kode: k, ...p, kolom: { ...KOLOM_BAWAAN, ...(p.admin.kolom || {}) } };
}

async function rpc(env, nama, body) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Galat('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY pintu belum diisi.', 500);
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nama}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const teks = await r.text();
  if (!r.ok) {
    const e = new Galat(`${nama}: HTTP ${r.status} ${teks.slice(0, 200)}`, 502);
    e.konflik = /KONFLIK/.test(teks);
    e.bukanCermin = /bukan cermin/.test(teks);
    throw e;
  }
  return teks ? JSON.parse(teks) : null;
}

async function baca(env, p, hanya) {
  try {
    return await rpc(env, 'cermin_baca', { p_skema: p.skema, p_hanya: hanya });
  } catch (e) {
    if (e.bukanCermin) throw new Galat(`${p.nama}: belum ada cermin (skema ${p.skema}) di gedung ini.`, 409);
    throw e;
  }
}

function sheetDari(cermin, nama) {
  const s = cermin.sheets && cermin.sheets[nama];
  if (!s || s.tidak_dimuat) throw new Galat(`Sheet ${nama} tidak ada di cermin.`, 404);
  return s;
}

function zonaDari(cermin) { return (cermin.meta && cermin.meta.zona_waktu) || 'UTC'; }

async function izinTulis(env, p, bacaPetaSaklar) {
  if (String(env.LINGKUNGAN || '').toLowerCase() === 'staging') return { boleh: true };
  let pos = 'gas';
  try { pos = ((await bacaPetaSaklar(env))[p.kode] || {}).posisi || 'gas'; } catch (_) { /* tetap gas */ }
  if (pos === 'supabase') return { boleh: true };
  return {
    boleh: false,
    alasan: `Saklar ${p.nama} masih "${pos}": spreadsheet adalah sumber data, jadi ubah di spreadsheet. Perubahan di sini akan tertimpa sinkron berikutnya.`,
  };
}

// ── Tampilan dan tipe sel ─────────────────────────────────────────────────────

function tanggalDiZona(iso, zona) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const b = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const t = `${b.year}-${b.month}-${b.day}`, j = `${b.hour}:${b.minute}:${b.second}`;
  return j === '00:00:00' ? t : `${t} ${j}`;
}

function tampilSel(v, tanggal, zona) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (tanggal && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return tanggalDiZona(v, zona);
  return String(v);
}

// Jenis kolom dari isinya, seperti yang dilihat orang di spreadsheet: tanggal (cermin), angka, boolean, atau teks.
function jenisKolom(s, j) {
  if (s.tanggal && s.tanggal[j]) return 'tanggal';
  const set = new Set();
  for (const r of s.rows) {
    const v = r[j];
    if (v === '' || v === null || v === undefined) continue;
    set.add(typeof v);
    if (set.size > 1) return 'teks';
  }
  const t = [...set][0];
  return t === 'number' ? 'angka' : t === 'boolean' ? 'boolean' : 'teks';
}

// Teks dari panel → nilai sel. Seperti mengetik di Sheets: angka dan TRUE/FALSE menjadi angka dan boolean bila
// kolomnya memang berisi angka/boolean; tanggal dibaca di zona spreadsheet.
function ketik(teks, jenis, L) {
  if (teks === null || teks === undefined) return '';
  if (typeof teks === 'boolean' || typeof teks === 'number') return teks;
  const t = String(teks).trim();
  if (t === '') return '';
  if (jenis === 'angka' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (jenis === 'boolean' && /^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  if (jenis === 'tanggal') {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
    if (m) return new L.Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    throw new Galat(`"${t}" bukan tanggal (pakai YYYY-MM-DD atau YYYY-MM-DD JJ:MM).`);
  }
  return String(teks);
}

function kolomUang(p, sheet, headers) {
  const u = (p.admin.kolom_uang || {})[sheet];
  if (!u) return headers.map(() => false);
  if (u === '*') return headers.map(() => true);
  return headers.map((h) => u.includes(String(h).trim()));
}

function samaran(tok) { const t = String(tok || ''); return t ? t.slice(0, 4) + '…' : ''; }

function ringkasSheet(p, nama, s, zona) {
  const jenis = s.headers.map((_, j) => jenisKolom(s, j));
  return {
    sheet: nama,
    versi: s.sinkron_at,
    kolom: s.headers,
    jenis,
    uang: kolomUang(p, nama, s.headers),
    baris: s.rows.map((r, i) => ({ baris: i + 2, tampil: s.headers.map((_, j) => tampilSel(r[j], s.tanggal && s.tanggal[j], zona)) })),
  };
}

function indeksKolom(headers, nama, sheet) {
  const j = headers.findIndex((h) => String(h).trim() === nama);
  if (j < 0) throw new Galat(`Sheet ${sheet} tidak punya kolom ${nama}.`, 500);
  return j;
}

// ── Menulis: ubah di tiruan SpreadsheetApp, simpan lewat cermin_tulis ───────────

// kerja(L, cermin) mengubah sheet lewat L.SpreadsheetApp dan mengembalikan { info, log: [...] }.
async function ubahCermin(env, p, sheets, kerja) {
  for (let coba = 1; coba <= COBA_TULIS; coba++) {
    const cermin = await baca(env, p, sheets);
    const L = buatLayanan(dataDariCermin(cermin, zonaDari(cermin)), buatHost());
    const hasil = kerja(L, cermin);
    const ekspor = L.__ekspor();
    if (!Object.keys(ekspor).length) return { ...hasil, tersimpan: false };
    const perubahan = susunPerubahan(cermin, ekspor);
    try {
      await rpc(env, 'cermin_tulis', { p_skema: p.skema, p_perubahan: perubahan });
      return { ...hasil, tersimpan: true };
    } catch (e) {
      if (!e.konflik || coba === COBA_TULIS) throw e.konflik ? new Galat('Sheet sedang diubah pihak lain. Coba lagi.', 409) : e;
    }
  }
  throw new Galat('Sheet sedang diubah pihak lain. Coba lagi.', 409);
}

async function catatLog(env, request, p, body, entri) {
  if (!entri || !entri.length) return null;
  const oleh = String(body.oleh || '').trim().slice(0, 60) || 'panel';
  const ip = request.headers.get('cf-connecting-ip') || '';
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/cermin_admin_log`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(entri.map((x) => ({ skema: p.skema, oleh, ip, uang: false, ...x }))),
  });
  return r.ok ? null : `log admin tidak tersimpan (HTTP ${r.status})`;
}

function cekVersi(s, versi, sheet) {
  if (String(versi || '') !== String(s.sinkron_at || '')) {
    throw new Galat(`Sheet ${sheet} sudah berubah sejak panel dimuat (oleh orang lain atau aplikasi). Data dimuat ulang; ulangi perubahan Anda.`, 409, { konflik: true });
  }
}

function cekBaris(s, baris, sheet) {
  const b = Number(baris);
  if (!Number.isInteger(b) || b < 2 || b > s.rows.length + 1) throw new Galat(`Baris ${baris} tidak ada di ${sheet}.`, 404);
  return b;
}

function objekBaris(headers, nilai) {
  const o = {};
  headers.forEach((h, j) => { o[h === '' ? `(kolom ${j + 1})` : h] = nilai[j]; });
  return o;
}

// Ubah satu baris (baris ada) atau tambah baris (baris null) dari {judul kolom: teks}.
function terapkanBaris(p, L, cermin, sheet, body, opsi = {}) {
  const s = sheetDari(cermin, sheet);
  const sh = L.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheet);
  const uang = kolomUang(p, sheet, s.headers);
  const nilai = body.nilai && typeof body.nilai === 'object' ? body.nilai : {};
  const jenis = s.headers.map((_, j) => jenisKolom(s, j));
  const idx = (h) => {
    const j = s.headers.findIndex((x) => x === h);
    if (j < 0) throw new Galat(`Kolom "${h}" tidak ada di ${sheet}.`);
    return j;
  };
  const kunciJ = 0;
  let uangDisentuh = [];
  if (body.baris === null || body.baris === undefined || body.baris === '') {
    const baru = s.headers.map(() => '');
    for (const [h, t] of Object.entries(nilai)) { const j = idx(h); baru[j] = ketik(t, jenis[j], L); }
    const kunci = String(baru[kunciJ] ?? '').trim();
    if (!kunci) throw new Galat(`Kolom pertama (${s.headers[kunciJ] || 'kunci'}) wajib diisi.`);
    if (opsi.kunciUnik && s.rows.some((r) => String(r[kunciJ]).trim() === kunci)) throw new Galat(`${s.headers[kunciJ]} "${kunci}" sudah ada di ${sheet}.`, 409);
    uangDisentuh = s.headers.filter((_, j) => uang[j] && baru[j] !== '');
    if (uangDisentuh.length && !body.konfirmasi_uang) throw new Galat('Perubahan menyentuh kolom uang.', 428, { perlu_konfirmasi_uang: true, kolom_uang: uangDisentuh });
    sh.appendRow(baru);
    return { info: { baris: s.rows.length + 2, kunci }, log: [{ sheet, aksi: 'tambah', baris: s.rows.length + 2, kunci, uang: uangDisentuh.length > 0, sesudah: objekBaris(s.headers, baru) }] };
  }
  cekVersi(s, body.versi, sheet);
  const b = cekBaris(s, body.baris, sheet);
  const lama = s.rows[b - 2];
  if (body.kunci !== undefined && String(lama[kunciJ]).trim() !== String(body.kunci).trim()) throw new Galat(`Baris ${b} bukan lagi ${body.kunci}. Data dimuat ulang.`, 409, { konflik: true });
  const sebelum = {}, sesudah = {};
  for (const [h, t] of Object.entries(nilai)) {
    const j = idx(h);
    const v = ketik(t, jenis[j], L);
    const asli = lama[j];
    const vJson = v instanceof Date ? v.toISOString() : v;
    if (JSON.stringify(vJson) === JSON.stringify(asli === null || asli === undefined ? '' : asli)) continue;
    if (j === kunciJ && opsi.kunciUnik && s.rows.some((r, i) => i !== b - 2 && String(r[kunciJ]).trim() === String(v).trim())) throw new Galat(`${s.headers[kunciJ]} "${v}" sudah ada di ${sheet}.`, 409);
    if (uang[j]) uangDisentuh.push(h);
    sebelum[h] = asli; sesudah[h] = vJson;
    sh.getRange(b, j + 1).setValue(v);
  }
  if (uangDisentuh.length && !body.konfirmasi_uang) throw new Galat('Perubahan menyentuh kolom uang.', 428, { perlu_konfirmasi_uang: true, kolom_uang: uangDisentuh });
  if (!Object.keys(sesudah).length) return { info: { baris: b, kunci: lama[kunciJ], tanpa_perubahan: true }, log: [] };
  return { info: { baris: b, kunci: lama[kunciJ] }, log: [{ sheet, aksi: 'ubah', baris: b, kunci: String(lama[kunciJ]), uang: uangDisentuh.length > 0, sebelum, sesudah }] };
}

function hapusBaris(p, L, cermin, sheet, body) {
  const s = sheetDari(cermin, sheet);
  cekVersi(s, body.versi, sheet);
  const b = cekBaris(s, body.baris, sheet);
  const lama = s.rows[b - 2];
  if (body.kunci !== undefined && String(lama[0]).trim() !== String(body.kunci).trim()) throw new Galat(`Baris ${b} bukan lagi ${body.kunci}. Data dimuat ulang.`, 409, { konflik: true });
  const uang = kolomUang(p, sheet, s.headers);
  const uangIsi = s.headers.filter((_, j) => uang[j] && lama[j] !== '' && lama[j] !== null && lama[j] !== undefined);
  if (uangIsi.length && !body.konfirmasi_uang) throw new Galat('Menghapus baris ini menyentuh kolom uang.', 428, { perlu_konfirmasi_uang: true, kolom_uang: uangIsi });
  L.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheet).deleteRow(b);
  return { info: { baris: b, kunci: lama[0] }, log: [{ sheet, aksi: 'hapus', baris: b, kunci: String(lama[0]), uang: uangIsi.length > 0, sebelum: objekBaris(s.headers, lama) }] };
}

// ── Token ───────────────────────────────────────────────────────────────────

function tokenAktif(v) { return String(v).trim().toLowerCase() !== 'false'; }

function acakHex(n) {
  const b = new Uint8Array(Math.ceil(n / 2));
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').slice(0, n);
}

// Token yang dipakai di rumah mana pun yang punya cermin di gedung ini.
async function semuaToken(env) {
  const ada = new Set();
  for (const r of daftarRumah(env)) {
    const p = PROFIL_RUMAH[String(r.kode).toLowerCase()];
    if (!p || !p.skema || !p.admin) continue;
    let c;
    try { c = await rpc(env, 'cermin_baca', { p_skema: p.skema, p_hanya: [p.admin.sheet_token] }); } catch (_) { continue; }
    const s = c.sheets && c.sheets[p.admin.sheet_token];
    if (!s || !s.headers) continue;
    const j = s.headers.findIndex((h) => String(h).trim() === ((p.admin.kolom || {}).token || KOLOM_BAWAAN.token));
    if (j >= 0) s.rows.forEach((x) => ada.add(String(x[j]).trim()));
  }
  return ada;
}

async function tokenBaru(env, p) {
  const ada = await semuaToken(env);
  for (let i = 0; i < 5; i++) {
    const t = `${p.awalan_token || p.kode + '-'}${acakHex(20)}`;
    if (!ada.has(t)) return t;
  }
  throw new Galat('Gagal membuat token unik lintas rumah. Coba lagi.', 500);
}

// ── Rute ────────────────────────────────────────────────────────────────────

async function daftarPengguna(env, p, izin) {
  const a = p.admin, k = p.kolom;
  const cermin = await baca(env, p, [a.sheet_pengguna, a.sheet_token]);
  const zona = zonaDari(cermin);
  const sp = sheetDari(cermin, a.sheet_pengguna), st = sheetDari(cermin, a.sheet_token);
  const jT = indeksKolom(st.headers, k.token, a.sheet_token), jM = indeksKolom(st.headers, k.token_mekanik, a.sheet_token);
  const jA = indeksKolom(st.headers, k.token_aktif, a.sheet_token);
  const jD = st.headers.findIndex((h) => String(h).trim() === k.token_dibuat);
  const perMekanik = {};
  st.rows.forEach((r, i) => {
    const id = String(r[jM]).trim();
    if (!id) return;
    (perMekanik[id] = perMekanik[id] || []).push({
      baris: i + 2, token: String(r[jT]), aktif: tokenAktif(r[jA]),
      dibuat: jD >= 0 ? tampilSel(r[jD], st.tanggal && st.tanggal[jD], zona) : '',
    });
  });
  return {
    success: true, rumah: p.kode, nama: p.nama, zona, bisa_ubah: izin.boleh, alasan_baca_saja: izin.alasan || '',
    peran: p.peran || [], section: p.section || [],
    pengguna: ringkasSheet(p, a.sheet_pengguna, sp, zona),
    token: { sheet: a.sheet_token, versi: st.sinkron_at, per_mekanik: perMekanik },
  };
}

async function daftarConfig(env, p, izin) {
  const a = p.admin;
  const pola = new RegExp(a.sheet_config || '^Config_');
  const awal = await baca(env, p, []);
  const nama = (awal.semua_sheet || []).filter((n) => pola.test(n) && n !== a.sheet_pengguna);
  const cermin = nama.length ? await baca(env, p, nama) : { sheets: {}, meta: awal.meta };
  const zona = zonaDari(cermin);
  return {
    success: true, rumah: p.kode, nama: p.nama, zona, bisa_ubah: izin.boleh, alasan_baca_saja: izin.alasan || '',
    sheets: nama.filter((n) => cermin.sheets[n]).map((n) => ringkasSheet(p, n, cermin.sheets[n], zona)),
  };
}

function sheetConfigSah(p, sheet) {
  const pola = new RegExp(p.admin.sheet_config || '^Config_');
  if (!sheet || !pola.test(sheet) || sheet === p.admin.sheet_pengguna) throw new Galat(`Sheet ${sheet || '(kosong)'} bukan sheet config yang boleh disunting di sini.`);
}

async function terbitkanToken(env, p, body) {
  const a = p.admin, k = p.kolom;
  const id = String(body.mechanic_id || '').trim();
  if (!id) throw new Galat('mechanic_id wajib.');
  const ganti = body.ganti === true;
  const token = await tokenBaru(env, p);
  return ubahCermin(env, p, [a.sheet_pengguna, a.sheet_token], (L, cermin) => {
    const sp = sheetDari(cermin, a.sheet_pengguna), st = sheetDari(cermin, a.sheet_token);
    const jK = indeksKolom(sp.headers, k.pengguna_kunci, a.sheet_pengguna), jE = indeksKolom(sp.headers, k.pengguna_email, a.sheet_pengguna);
    const mek = sp.rows.find((r) => String(r[jK]).trim() === id);
    if (!mek) throw new Galat(`${id} tidak ada di ${a.sheet_pengguna}.`, 404);
    const jT = indeksKolom(st.headers, k.token, a.sheet_token), jM = indeksKolom(st.headers, k.token_mekanik, a.sheet_token);
    const jA = indeksKolom(st.headers, k.token_aktif, a.sheet_token), jEm = indeksKolom(st.headers, k.token_email, a.sheet_token);
    const jD = indeksKolom(st.headers, k.token_dibuat, a.sheet_token);
    const aktif = st.rows.map((r, i) => ({ r, b: i + 2 })).filter((x) => String(x.r[jM]).trim() === id && tokenAktif(x.r[jA]));
    // createTokenForUser: token aktif yang sudah ada dikembalikan, tidak dibuat baru.
    if (aktif.length && !ganti) return { info: { token: String(aktif[0].r[jT]), sudah_ada: true }, log: [] };
    const sh = L.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(a.sheet_token);
    const log = [];
    // resetTokenForUser mencabut token aktif lama; di sini semua token aktif orang itu, supaya "ganti" benar-benar
    // menutup token lama.
    for (const x of aktif) {
      sh.getRange(x.b, jA + 1).setValue(false);
      log.push({ sheet: a.sheet_token, aksi: 'token_cabut', baris: x.b, kunci: id, sebelum: { [st.headers[jT]]: samaran(x.r[jT]), [st.headers[jA]]: x.r[jA] }, sesudah: { [st.headers[jA]]: false } });
    }
    const email = String(mek[jE] || '').trim() || `${id.toLowerCase()}@mar.local`;
    const baru = st.headers.map(() => '');
    baru[jT] = token; baru[jM] = id; baru[jEm] = email; baru[jA] = true; baru[jD] = new L.Date();
    sh.appendRow(baru);
    log.push({ sheet: a.sheet_token, aksi: 'token_terbit', baris: st.rows.length + 2, kunci: id, sesudah: { [st.headers[jT]]: samaran(token), [st.headers[jM]]: id, [st.headers[jEm]]: email } });
    return { info: { token, sudah_ada: false, dicabut: aktif.length }, log };
  });
}

async function cabutToken(env, p, body) {
  const a = p.admin, k = p.kolom;
  const id = String(body.mechanic_id || '').trim();
  if (!id) throw new Galat('mechanic_id wajib.');
  return ubahCermin(env, p, [a.sheet_token], (L, cermin) => {
    const st = sheetDari(cermin, a.sheet_token);
    const jT = indeksKolom(st.headers, k.token, a.sheet_token), jM = indeksKolom(st.headers, k.token_mekanik, a.sheet_token);
    const jA = indeksKolom(st.headers, k.token_aktif, a.sheet_token);
    const sh = L.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(a.sheet_token);
    const log = [];
    st.rows.forEach((r, i) => {
      if (String(r[jM]).trim() !== id || !tokenAktif(r[jA])) return;
      sh.getRange(i + 2, jA + 1).setValue(false);
      log.push({ sheet: a.sheet_token, aksi: 'token_cabut', baris: i + 2, kunci: id, sebelum: { [st.headers[jT]]: samaran(r[jT]), [st.headers[jA]]: r[jA] }, sesudah: { [st.headers[jA]]: false } });
    });
    if (!log.length) throw new Galat(`${id} tidak punya token aktif.`, 404);
    return { info: { dicabut: log.length }, log };
  });
}

async function hapusPengguna(env, p, body) {
  const a = p.admin, k = p.kolom;
  return ubahCermin(env, p, [a.sheet_pengguna, a.sheet_token], (L, cermin) => {
    const h = hapusBaris(p, L, cermin, a.sheet_pengguna, body);
    const id = String(h.info.kunci).trim();
    const st = sheetDari(cermin, a.sheet_token);
    const jT = indeksKolom(st.headers, k.token, a.sheet_token), jM = indeksKolom(st.headers, k.token_mekanik, a.sheet_token);
    const jA = indeksKolom(st.headers, k.token_aktif, a.sheet_token);
    const sh = L.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(a.sheet_token);
    st.rows.forEach((r, i) => {
      if (String(r[jM]).trim() !== id || !tokenAktif(r[jA])) return;
      sh.getRange(i + 2, jA + 1).setValue(false);
      h.log.push({ sheet: a.sheet_token, aksi: 'token_cabut', baris: i + 2, kunci: id, sebelum: { [st.headers[jT]]: samaran(r[jT]) }, sesudah: { [st.headers[jA]]: false } });
    });
    return h;
  });
}

async function daftarLog(env, p) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/cermin_admin_log?skema=eq.${encodeURIComponent(p.skema)}&order=waktu.desc&limit=100`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Galat(`log admin tidak terbaca (HTTP ${r.status})`, 502);
  return { success: true, rumah: p.kode, log: await r.json() };
}

/**
 * POST /saklar/api/admin/<aksi>, badan JSON berisi { rumah, … }. Aksi:
 *   pengguna, pengguna/simpan, pengguna/hapus, token/terbit, token/cabut,
 *   config, config/simpan, config/hapus, log
 */
export async function tanganiAdminCermin(request, env, url, json, bacaPetaSaklar) {
  if (request.method !== 'POST') return json({ success: false, error: 'Metode tidak didukung' }, 405);
  if (!(await validasiSesi(request, env))) return json({ success: false, error: 'Sesi panel tidak sah atau sudah kedaluwarsa. Masuk ulang.' }, 401);
  let body = {};
  try { body = await request.json(); } catch (_) { return json({ success: false, error: 'Format JSON salah' }, 400); }
  const aksi = url.pathname.replace(/^\/saklar\/api\/admin\//, '').replace(/\/+$/, '');
  try {
    const p = profil(env, body.rumah);
    if (aksi === 'log') return json(await daftarLog(env, p));
    const izin = await izinTulis(env, p, bacaPetaSaklar);
    if (aksi === 'pengguna') return json(await daftarPengguna(env, p, izin));
    if (aksi === 'config') return json(await daftarConfig(env, p, izin));
    if (!izin.boleh) throw new Galat(izin.alasan, 403);
    let h;
    if (aksi === 'pengguna/simpan') h = await ubahCermin(env, p, [p.admin.sheet_pengguna], (L, c) => terapkanBaris(p, L, c, p.admin.sheet_pengguna, body, { kunciUnik: true }));
    else if (aksi === 'pengguna/hapus') h = await hapusPengguna(env, p, body);
    else if (aksi === 'token/terbit') h = await terbitkanToken(env, p, body);
    else if (aksi === 'token/cabut') h = await cabutToken(env, p, body);
    else if (aksi === 'config/simpan') { sheetConfigSah(p, body.sheet); h = await ubahCermin(env, p, [body.sheet], (L, c) => terapkanBaris(p, L, c, body.sheet, body)); }
    else if (aksi === 'config/hapus') { sheetConfigSah(p, body.sheet); h = await ubahCermin(env, p, [body.sheet], (L, c) => hapusBaris(p, L, c, body.sheet, body)); }
    else return json({ success: false, error: `Aksi admin "${aksi}" tidak dikenal.` }, 404);
    const peringatan = h.tersimpan ? await catatLog(env, request, p, body, h.log) : null;
    return json({ success: true, tersimpan: h.tersimpan, ...h.info, ...(peringatan ? { peringatan } : {}) });
  } catch (e) {
    const status = e instanceof Galat ? e.status : 500;
    return json({ success: false, error: e.message || String(e), ...(e.tambahan || {}) }, status);
  }
}
