#!/usr/bin/env node
/**
 * GAS lokal: jalankan kode Google Apps Script ASLI sebuah rumah di komputer ini, di atas data cermin Supabase.
 * Ini pembanding uji kembar yang tidak menyentuh produksi: tidak ada panggilan ke /exec, tidak ada token orang
 * yang dikirim ke Google, dan tidak ada tulisan ke spreadsheet. Kode GAS dan Worker rumah membaca data yang
 * sama (public.cermin_baca), jadi selisih jawaban berarti selisih logika atau lingkungan, bukan selisih data.
 *
 * Layanan Google tiruannya workers/bersama/gas-layanan.js, berkas yang sama dengan yang dipakai Worker rumah.
 * Kondisinya dibuat seperti di Worker: mode ketat (modul ES selalu ketat) dan zona mesin UTC; zona skrip
 * (appsscript.json timeZone) dibawa oleh Date tiruan, bukan oleh mesin.
 *
 * Kode GAS diambil dengan `clasp clone <scriptId> [versi]` ke folder DI LUAR repo (repo ini publik), lalu
 * foldernya diberikan lewat --gas. Semua berkas .js/.gs dimuat ke satu konteks vm, seperti GAS memuat semua
 * berkas ke satu ruang nama global. Setiap panggilan memakai konteks baru, sama dengan satu eksekusi GAS.
 *
 * Variabel lingkungan:
 *   DATABASE_URL   gedung tempat cermin dibaca (butuh public.cermin_baca, db/bersama/cermin_baca.sql)
 *
 * Pemakaian sebagai modul:
 *   const gas = await siapkanGasLokal({ folderGas, sql, skema });
 *   const { jawaban, catatan } = gas.api(token, 'pull_my_wos', {});
 *
 * Pemakaian dari baris perintah. Token dicari dari ApiTokens cermin dan tidak pernah dicetak; setiap nilai
 * berkunci "token" di jawaban disamarkan:
 *   node tools/kembar/gas-lokal.mjs --gas=<folder clone> --skema=kmbbupr --aksi=ping --mekanik=<mechanic_id>
 *   opsi: --data='{"wo_id":"..."}'
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { buatLayanan, buatPermintaanPost, buatPermintaanGet, hasilRun, dataDariCermin } from '../../workers/bersama/gas-layanan.js';
import { kompilasiFolder, kodePasangTemplat } from './templat-gas.mjs';
import { buatHost } from '../../workers/bersama/gas-host.js';

export async function muatCermin(sql, skema, tidakDimuat = []) {
  const [r] = await sql`SELECT public.cermin_baca(${skema}, ${tidakDimuat}::text[]) AS c`;
  return r.c;
}

export function bacaKodeGas(folderGas) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folderGas, 'appsscript.json'), 'utf8'));
  const baca = (re) => fs.readdirSync(folderGas).filter((f) => re.test(f)).sort((a, b) => a.localeCompare(b))
    .map((nama) => ({ nama, isi: fs.readFileSync(path.join(folderGas, nama), 'utf8') }));
  return { zonaSkrip: manifest.timeZone || 'Etc/UTC', berkas: baca(/\.(js|gs)$/), html: baca(/\.html$/) };
}

const PASANG = `Object.assign(globalThis, (${buatLayanan.toString()})(JSON.parse(__D), __host));
globalThis.__buatPermintaanPost = ${buatPermintaanPost.toString()};
globalThis.__panggilApi = function (isiJson) {
  var keluar = doPost(__buatPermintaanPost(isiJson));
  return JSON.stringify({ isi: keluar && typeof keluar.getContent === 'function' ? keluar.getContent() : null, catatan: __CATAT, ekspor: __ekspor() });
};
globalThis.__buatPermintaanGet = ${buatPermintaanGet.toString()};
globalThis.__hasilRun = ${hasilRun.toString()};
// Satu halaman web: doGet dengan query string, seperti membuka /exec?token=…&page=….
globalThis.__panggilWeb = function (qs) {
  var keluar = doGet(__buatPermintaanGet(qs));
  var h = keluar && typeof keluar.getContent === 'function' ? keluar : null;
  return JSON.stringify({ isi: h ? h.getContent() : null, judul: h ? h.getTitle() : '', meta: h ? h.getMetaTags() : [], catatan: __CATAT, ekspor: __ekspor() });
};
// Satu panggilan google.script.run: fungsi global dengan argumen JSON; galat diteruskan sebagai pesan.
globalThis.__panggilFungsi = function (nama, argsJson) {
  var hasil, galat = null;
  try { hasil = __hasilRun(globalThis[nama].apply(null, JSON.parse(argsJson))); } catch (e) { galat = String(e && e.message || e); }
  return JSON.stringify({ hasil: hasil === undefined ? null : hasil, galat: galat, catatan: __CATAT, ekspor: __ekspor() });
};`;

// Terapkan hasil __ekspor() ke data cermin, seperti yang dilakukan penyimpanan Worker (public.cermin_tulis):
// panggilan berikutnya membaca isi yang baru.
export function terapkanEkspor(data, ekspor) {
  for (const [nama, s] of Object.entries(ekspor)) {
    data.sheets[nama] = { headers: s.headers, rows: s.rows, tanggal: s.headers.map((h) => String(s.tipe[h] || '').includes('tanggal')) };
  }
  return data;
}

// GAS menjalankan berkas berurutan menurut urutan proyek, dan kode tingkat atas boleh memakai variabel dari
// berkas yang dimuat lebih dulu. Urutan itu tidak ikut di clone (clasp mengurutkan nama), jadi berkas yang
// gagal dengan ReferenceError diulang sesudah berkas lain. Fungsi yang didefinisikan di dua berkas dengan isi
// berbeda harus dicek sendiri bila dipakai aksi yang diuji.
export function siapkanKonteks({ kode, data, ketat = true }) {
  const awalan = ketat ? '"use strict";' : '';
  const skrip = kode.berkas.map((b) => new vm.Script(awalan + b.isi, { filename: b.nama }));
  const pasang = new vm.Script(PASANG, { filename: 'gas-layanan.js' });
  // Template web dikompilasi sekali dengan pengompilasi yang sama dengan bundel Worker.
  const web = kompilasiFolder(kode.html || []);
  if (!data.html) data.html = web.html;
  const pasangTemplat = new vm.Script((ketat ? '"use strict";' : '') + kodePasangTemplat(web, '__pasangTemplat'), { filename: 'templat-gas.js' });
  const host = buatHost();
  let dataJson = JSON.stringify(data);
  let urutan = null;
  const konteksBaru = () => {
    const ctx = vm.createContext({ __D: dataJson, __host: host });
    pasang.runInContext(ctx);
    if (urutan) { for (const i of urutan) skrip[i].runInContext(ctx); pasangTemplat.runInContext(ctx); return ctx; }
    let antre = skrip.map((_, i) => i);
    const jadi = [];
    while (antre.length) {
      const gagal = [];
      for (const i of antre) {
        try { skrip[i].runInContext(ctx); jadi.push(i); } catch (e) {
          if (!(e && e.name === 'ReferenceError')) { const g = new Error(`${kode.berkas[i].nama} gagal dimuat: ${e && e.message}`); g.cause = e; throw g; }
          gagal.push({ i, pesan: e.message });
        }
      }
      if (gagal.length === antre.length) throw new Error(`berkas tidak bisa dimuat: ${gagal.map((g) => `${kode.berkas[g.i].nama} (${g.pesan})`).join('; ')}`);
      antre = gagal.map((g) => g.i);
    }
    urutan = jadi;
    pasangTemplat.runInContext(ctx);
    return ctx;
  };
  return {
    konteksBaru,
    urutan: () => { if (!urutan) konteksBaru(); return urutan.map((i) => kode.berkas[i].nama); },
    gantiData: (baru) => { dataJson = JSON.stringify(baru); },
  };
}

// sesi: perubahan setiap panggilan diterapkan ke data di memori (tidak pernah ke database), jadi urutan aksi
// seperti buat WO → kirim kerja → approve bisa dijalankan berurutan.
// penggunaAktif dan pemicu hanya untuk uji: meniru eksekusi dari editor (email pengguna aktif) dan pemicu terpasang.
// cermin: isi cermin yang sudah dimuat (misalnya untuk membandingkan dua versi kode di atas data yang sama).
export async function siapkanGasLokal({ folderGas, sql, skema, ketat = true, tidakDimuat = [], sesi = false, urlWeb = '', penggunaAktif = '', pemicu = [], cermin = null }) {
  // Sama dengan Worker: mesin UTC, zona skrip dibawa Date tiruan.
  process.env.TZ = 'UTC';
  const kode = bacaKodeGas(folderGas);
  const data = dataDariCermin(cermin || await muatCermin(sql, skema, tidakDimuat), kode.zonaSkrip);
  if (urlWeb) data.urlWeb = urlWeb;
  if (penggunaAktif) data.penggunaAktif = penggunaAktif;
  if (pemicu.length) data.pemicu = pemicu;
  const k = siapkanKonteks({ kode, data, ketat });
  return {
    berkas: kode.berkas.length,
    cermin: { sinkron: data.sinkron, sheet: Object.keys(data.sheets).length, dilewati: data.dilewati },
    data: () => data,
    api(token, action, isi = {}, opId = undefined) {
      const ctx = k.konteksBaru();
      const mulai = Date.now();
      const hasil = JSON.parse(vm.runInContext('__panggilApi', ctx)(JSON.stringify({ token, action, op_id: opId, data: isi })));
      if (sesi && Object.keys(hasil.ekspor).length) k.gantiData(terapkanEkspor(data, hasil.ekspor));
      return { jawaban: hasil.isi === null ? null : JSON.parse(hasil.isi), catatan: hasil.catatan, ekspor: hasil.ekspor, ms: Date.now() - mulai };
    },
    // Halaman web: query string seperti 'token=…&page=approvals'.
    web(qs) {
      const ctx = k.konteksBaru();
      const hasil = JSON.parse(vm.runInContext('__panggilWeb', ctx)(String(qs || '')));
      if (sesi && Object.keys(hasil.ekspor).length) k.gantiData(terapkanEkspor(data, hasil.ekspor));
      return hasil;
    },
    // google.script.run.<nama>(...args)
    jalankan(nama, args = []) {
      const ctx = k.konteksBaru();
      const hasil = JSON.parse(vm.runInContext('__panggilFungsi', ctx)(nama, JSON.stringify(args)));
      if (sesi && Object.keys(hasil.ekspor).length) k.gantiData(terapkanEkspor(data, hasil.ekspor));
      return hasil;
    },
  };
}

// Token dan nilai berkunci token tidak pernah dicetak utuh.
export function samarkanToken(x) {
  if (Array.isArray(x)) return x.map(samarkanToken);
  if (x && typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, /token/i.test(k) && typeof v === 'string' && v.length > 6 ? v.slice(0, 4) + '…' : samarkanToken(v)]));
  }
  return x;
}

export async function tokenMekanik(sql, skema, mechanicId) {
  const r = await sql`SELECT data->>'token' AS t FROM ${sql(skema + '.api_tokens')}
                      WHERE data->>'mechanic_id' = ${mechanicId} AND lower(coalesce(data->>'is_active', '')) <> 'false'
                        AND coalesce(data->>'token', '') <> '' ORDER BY baris DESC LIMIT 1`;
  return r[0] ? r[0].t : null;
}

// ── Baris perintah ────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
  }));
  for (const k of ['gas', 'skema', 'aksi', 'mekanik']) if (!arg[k]) throw new Error(`--${k} wajib. Lihat kepala berkas tools/kembar/gas-lokal.mjs.`);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi.');
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', connect_timeout: 20, onnotice: () => {} });
  try {
    const gas = await siapkanGasLokal({ folderGas: arg.gas, sql, skema: arg.skema });
    const token = await tokenMekanik(sql, arg.skema, arg.mekanik);
    if (!token) throw new Error(`token aktif untuk ${arg.mekanik} tidak ada di ${arg.skema}.api_tokens`);
    const { jawaban, catatan, ms } = gas.api(token, arg.aksi, arg.data ? JSON.parse(arg.data) : {});
    console.log(JSON.stringify(samarkanToken(jawaban), null, 2));
    console.error(`\n${gas.berkas} berkas GAS, cermin ${arg.skema} (${gas.cermin.sheet} sheet, sinkron ${gas.cermin.sinkron}), ${ms} ms`);
    console.error(`dibaca: ${catatan.dibaca.join(', ')}`);
    console.error(`tulis: ${catatan.tulis.length}${catatan.tulis.length ? ' ' + JSON.stringify(catatan.tulis.slice(0, 5)) : ''}`);
    for (const k of ['baca_dilewati', 'layanan', 'tak_dikenal']) if (catatan[k].length) console.error(`${k}: ${catatan[k].join(', ')}`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}
