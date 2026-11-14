#!/usr/bin/env node
/**
 * Tambal penjaga google.script.run pada salinan kode GAS sebuah rumah (folder clasp clone, DI LUAR repo).
 *
 * Di GAS, google.script.run bisa memanggil semua fungsi global yang namanya tidak diakhiri "_", dari halaman web
 * mana pun, atas nama deployer. Fungsi inti yang memercayai parameternya (karena biasanya dipanggil sesudah token
 * diperiksa) jadi bisa dipanggil langsung. Alat ini menyisipkan satu pernyataan di awal setiap fungsi publik,
 * di baris yang sama dengan "{" pembukanya supaya nomor baris pesan galat GAS tidak bergeser:
 *   titik masuk sah (doGet, doPost, onOpen/onEdit/…, dan fungsi yang dipanggil halaman lewat google.script.run,
 *   lihat analisis-gas.mjs) → masukSah_()
 *   fungsi publik lain → wajibMasukSah_(arguments[0])
 * dan menambahkan berkas _PenjagaRun.js berisi kedua fungsi itu. Aturannya ada di kepala berkas itu.
 * Bisa dijalankan ulang (idempoten): fungsi yang sudah bertanda tidak disisipi lagi.
 *
 *   node tools/kembar/tambal-penjaga.mjs --gas=<folder> [--kering]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bacaKodeGas, siapkanKonteks } from './gas-lokal.mjs';
import { fungsiPublik, pemanggilGoogleScriptRun } from './analisis-gas.mjs';

export const PENANDA = '/* penjaga-run */';
const KHUSUS = ['doGet', 'doPost', 'onOpen', 'onEdit', 'onInstall', 'onFormSubmit', 'onChange', 'onSelectionChange'];

export const BERKAS_PENJAGA = `/**
 * _PenjagaRun.gs — penjaga google.script.run (tambalan 14 Nov 2026, tools/kembar/tambal-penjaga.mjs).
 *
 * MASALAHNYA. google.script.run bisa memanggil SEMUA fungsi global yang namanya tidak diakhiri "_", dari halaman
 * web mana pun (termasuk halaman "perlu token" yang terbuka untuk siapa saja), dan fungsinya berjalan atas nama
 * deployer. Fungsi inti seperti supervisorApprove(woId, emailApprover) memercayai parameternya karena biasanya
 * dipanggil SESUDAH token diperiksa; dipanggil langsung, pemeriksaan itu terlewati.
 *
 * PENJAGANYA. Setiap fungsi publik diawali satu pernyataan (bertanda komentar "penjaga-run"):
 *   - titik masuk sah (doGet, doPost, onOpen, dan fungsi yang memang dipanggil halaman lewat google.script.run)
 *     menandai eksekusinya sah dengan masukSah_();
 *   - fungsi lain memanggil wajibMasukSah_(arguments[0]), yang meloloskan eksekusi yang dimulai dari titik masuk
 *     sah, yang dijalankan dari editor atau menu spreadsheet (ada email pengguna aktif), atau pemicu terjadwal
 *     sungguhan (triggerUid event cocok dengan pemicu proyek ini). Selain itu ditolak.
 * Jalannya PWA, web, jadwal, menu, dan editor tidak berubah.
 *
 * MENAMBAH FUNGSI BARU yang dipanggil halaman lewat google.script.run: jalankan ulang alat tambalnya, atau
 * awali fungsinya dengan masukSah_(). Fungsi lain cukup diawali wajibMasukSah_(arguments[0]).
 */
var MASUK_SAH_ = false;

function masukSah_() {
  MASUK_SAH_ = true;
}

function wajibMasukSah_(e) {
  if (MASUK_SAH_) return;
  var aktif = '';
  try { aktif = Session.getActiveUser().getEmail(); } catch (x) {}
  if (aktif) return;
  if (e && typeof e === 'object' && e.triggerUid) {
    try {
      var uid = String(e.triggerUid), pemicu = ScriptApp.getProjectTriggers();
      for (var i = 0; i < pemicu.length; i++) {
        if (String(pemicu[i].getUniqueId()) === uid) { MASUK_SAH_ = true; return; }
      }
    } catch (x) {}
  }
  throw new Error('Akses ditolak.');
}
`;

// Posisi sesudah "{" pembuka fungsi yang deklarasinya dimulai di indeks i ("function nama(").
function sesudahKurawal(t, i) {
  let j = t.indexOf('(', i), d = 0;
  for (; j < t.length; j++) {
    const c = t[j];
    if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < t.length && t[j] !== q) { if (t[j] === '\\') j++; j++; } continue; }
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) break; }
  }
  j++;
  for (;;) {
    while (/\s/.test(t[j] || '')) j++;
    if (t.startsWith('/*', j)) { j = t.indexOf('*/', j) + 2; continue; }
    if (t.startsWith('//', j)) { j = t.indexOf('\n', j); continue; }
    break;
  }
  if (t[j] !== '{') throw new Error(`tidak menemukan "{" fungsi di indeks ${i}`);
  return j + 1;
}

// Kode tingkat atas yang berjalan saat script dimuat (sebelum titik masuk mana pun) tidak boleh memanggil fungsi
// yang dijaga: penjaganya menolak, dan seluruh script gagal dimuat. Fungsi seperti itu dicari dengan mencoba
// memuat hasil tambalan (GAS lokal), dikecualikan dari penjagaan, lalu dicoba lagi.
// _PenjagaRun.js dimuat PALING DULU: urutan berkas GAS ditentukan proyek, dan kalau penjaga sudah ada saat berkas
// lain dimuat, setiap panggilan saat muat ke fungsi yang dijaga ditolak. Kalau dimuat belakangan, typeof-nya masih
// 'undefined' dan panggilannya lolos; jadi urutan ini kasus terketat.
function cariPanggilanSaatMuat(kode, isiBaru) {
  const lain = kode.berkas.filter((b) => b.nama !== '_PenjagaRun.js').map((b) => ({ nama: b.nama, isi: isiBaru.get(b.nama) ?? b.isi }));
  const k = { ...kode, berkas: [{ nama: '_PenjagaRun.js', isi: BERKAS_PENJAGA }, ...lain] };
  try {
    siapkanKonteks({ kode: k, data: { zonaSkrip: kode.zonaSkrip, sheets: {}, dilewati: [] } }).konteksBaru();
    return null;
  } catch (e) {
    const tumpukan = String((e.cause && e.cause.stack) || '');
    if (!/Akses ditolak/.test(tumpukan)) throw e;
    const baris = tumpukan.split('\n');
    const i = baris.findIndex((x) => /wajibMasukSah_/.test(x));
    const m = /at (?:new |Object\.)?([A-Za-z_$][\w$]*) \(/.exec(baris[i + 1] || '');
    if (!m) throw new Error(`fungsi yang dipanggil saat muat tidak terbaca dari jejak: ${baris.slice(i, i + 3).join(' | ')}`);
    return m[1];
  }
}

export function tambalFolder(folder, { kering = false } = {}) {
  const kode = bacaKodeGas(folder);
  const publik = fungsiPublik(kode.berkas);
  const entri = new Set(pemanggilGoogleScriptRun(kode.html, publik));
  for (const k of KHUSUS) if (publik.has(k)) entri.add(k);
  const dikecualikan = new Set();
  for (let putaran = 0; putaran < 100; putaran++) {
    const h = tambalSekali(kode, publik, entri, dikecualikan);
    const nama = cariPanggilanSaatMuat(kode, new Map(h.isiBaru));
    if (nama && !dikecualikan.has(nama)) { dikecualikan.add(nama); continue; }
    if (nama) throw new Error(`${nama} masih ditolak saat muat walaupun sudah dikecualikan`);
    if (!kering) {
      for (const [n, isi] of h.isiBaru) fs.writeFileSync(path.join(folder, n), isi);
      fs.writeFileSync(path.join(folder, '_PenjagaRun.js'), BERKAS_PENJAGA);
    }
    return { ...h.hitung, publik: publik.size, daftarEntri: [...entri].sort(), fungsiVar: h.fungsiVar, dikecualikan: [...dikecualikan].sort() };
  }
  throw new Error('terlalu banyak fungsi yang dipanggil saat muat');
}

function tambalSekali(kode, publik, entri, dikecualikan) {
  const hitung = { entri: 0, dijaga: 0, sudah: 0, berkas: 0 };
  const fungsiVar = [], isiBaru = [];
  for (const b of kode.berkas) {
    if (b.nama === '_PenjagaRun.js') continue;
    let t = b.isi;
    const sisip = [];
    for (const m of t.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
      if (!publik.has(m[1]) || dikecualikan.has(m[1])) continue;
      const p = sesudahKurawal(t, m.index);
      if (t.slice(p, p + PENANDA.length + 2).includes(PENANDA)) { hitung.sudah++; continue; }
      sisip.push({ p, teks: entri.has(m[1])
        ? ` ${PENANDA} if (typeof masukSah_ === 'function') masukSah_();`
        : ` ${PENANDA} if (typeof wajibMasukSah_ === 'function') wajibMasukSah_(arguments[0]);` });
      if (entri.has(m[1])) hitung.entri++; else hitung.dijaga++;
    }
    // Fungsi global yang ditulis sebagai var x = function … juga bisa dipanggil google.script.run.
    for (const m of t.matchAll(/^var ([A-Za-z_$][\w$]*)\s*=\s*function\b/gm)) if (!m[1].endsWith('_')) fungsiVar.push(`${b.nama}:${m[1]}`);
    if (!sisip.length) continue;
    for (const s of sisip.sort((a, c) => c.p - a.p)) t = t.slice(0, s.p) + s.teks + t.slice(s.p);
    hitung.berkas++;
    isiBaru.push([b.nama, t]);
  }
  return { hitung, fungsiVar, isiBaru };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)]; }));
  if (!arg.gas) throw new Error('--gas wajib');
  const h = tambalFolder(arg.gas, { kering: !!arg.kering });
  console.log(`${arg.kering ? 'KERING ' : ''}${path.basename(arg.gas)}: ${h.publik} fungsi publik; ${h.entri} titik masuk (masukSah_), ${h.dijaga} dijaga (wajibMasukSah_), ${h.sudah} sudah bertanda; ${h.berkas} berkas diubah`);
  console.log(`  titik masuk: ${h.daftarEntri.join(', ')}`);
  if (h.fungsiVar.length) console.log(`  PERHATIAN fungsi global var x = function (tidak disisipi): ${h.fungsiVar.join(', ')}`);
  if (h.dikecualikan.length) console.log(`  PERIKSA dikecualikan karena dipanggil saat script dimuat: ${h.dikecualikan.join(', ')}`);
}
