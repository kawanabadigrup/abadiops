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
import { buatLayanan, buatPermintaanPost, dataDariCermin } from '../../workers/bersama/gas-layanan.js';
import { buatHost } from '../../workers/bersama/gas-host.js';

export async function muatCermin(sql, skema, tidakDimuat = []) {
  const [r] = await sql`SELECT public.cermin_baca(${skema}, ${tidakDimuat}::text[]) AS c`;
  return r.c;
}

export function bacaKodeGas(folderGas) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folderGas, 'appsscript.json'), 'utf8'));
  const berkas = fs.readdirSync(folderGas).filter((f) => /\.(js|gs)$/.test(f)).sort((a, b) => a.localeCompare(b))
    .map((nama) => ({ nama, isi: fs.readFileSync(path.join(folderGas, nama), 'utf8') }));
  return { zonaSkrip: manifest.timeZone || 'Etc/UTC', berkas };
}

const PASANG = `Object.assign(globalThis, (${buatLayanan.toString()})(JSON.parse(__D), __host));
globalThis.__buatPermintaanPost = ${buatPermintaanPost.toString()};
globalThis.__panggilApi = function (isiJson) {
  var keluar = doPost(__buatPermintaanPost(isiJson));
  return JSON.stringify({ isi: keluar && typeof keluar.getContent === 'function' ? keluar.getContent() : null, catatan: __CATAT });
};`;

// GAS menjalankan berkas berurutan menurut urutan proyek, dan kode tingkat atas boleh memakai variabel dari
// berkas yang dimuat lebih dulu. Urutan itu tidak ikut di clone (clasp mengurutkan nama), jadi berkas yang
// gagal dengan ReferenceError diulang sesudah berkas lain. Fungsi yang didefinisikan di dua berkas dengan isi
// berbeda harus dicek sendiri bila dipakai aksi yang diuji.
export function siapkanKonteks({ kode, data, ketat = true }) {
  const awalan = ketat ? '"use strict";' : '';
  const skrip = kode.berkas.map((b) => new vm.Script(awalan + b.isi, { filename: b.nama }));
  const pasang = new vm.Script(PASANG, { filename: 'gas-layanan.js' });
  const host = buatHost();
  const dataJson = JSON.stringify(data);
  let urutan = null;
  const konteksBaru = () => {
    const ctx = vm.createContext({ __D: dataJson, __host: host });
    pasang.runInContext(ctx);
    if (urutan) { for (const i of urutan) skrip[i].runInContext(ctx); return ctx; }
    let antre = skrip.map((_, i) => i);
    const jadi = [];
    while (antre.length) {
      const gagal = [];
      for (const i of antre) {
        try { skrip[i].runInContext(ctx); jadi.push(i); } catch (e) {
          if (!(e && e.name === 'ReferenceError')) throw new Error(`${kode.berkas[i].nama} gagal dimuat: ${e && e.message}`);
          gagal.push({ i, pesan: e.message });
        }
      }
      if (gagal.length === antre.length) throw new Error(`berkas tidak bisa dimuat: ${gagal.map((g) => `${kode.berkas[g.i].nama} (${g.pesan})`).join('; ')}`);
      antre = gagal.map((g) => g.i);
    }
    urutan = jadi;
    return ctx;
  };
  return {
    konteksBaru,
    urutan: () => { if (!urutan) konteksBaru(); return urutan.map((i) => kode.berkas[i].nama); },
  };
}

export async function siapkanGasLokal({ folderGas, sql, skema, ketat = true, tidakDimuat = [] }) {
  // Sama dengan Worker: mesin UTC, zona skrip dibawa Date tiruan.
  process.env.TZ = 'UTC';
  const kode = bacaKodeGas(folderGas);
  const cermin = await muatCermin(sql, skema, tidakDimuat);
  const data = dataDariCermin(cermin, kode.zonaSkrip);
  const k = siapkanKonteks({ kode, data, ketat });
  return {
    berkas: kode.berkas.length,
    cermin: { sinkron: data.sinkron, sheet: Object.keys(data.sheets).length, dilewati: data.dilewati },
    api(token, action, isi = {}, opId = undefined) {
      const ctx = k.konteksBaru();
      const mulai = Date.now();
      const hasil = JSON.parse(vm.runInContext('__panggilApi', ctx)(JSON.stringify({ token, action, op_id: opId, data: isi })));
      return { jawaban: hasil.isi === null ? null : JSON.parse(hasil.isi), catatan: hasil.catatan, ms: Date.now() - mulai };
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
