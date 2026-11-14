#!/usr/bin/env node
/**
 * Cek cakupan penjaga google.script.run (tools/kembar/tambal-penjaga.mjs) menurut daftar GAS SENDIRI.
 *
 * Halaman /exec web app GAS memuat konfigurasi "functionNames": daftar resmi fungsi server yang bisa dipanggil
 * google.script.run. Setiap nama di daftar itu harus berupa titik masuk (masukSah_), dijaga (wajibMasukSah_),
 * atau fungsi pustaka JsrsasignVendor.js (matematika/encoding murni, tidak menyentuh data). Selain itu = celah.
 *
 *   curl -sL "https://script.google.com/macros/s/<deploymentId>/exec" -o halaman.html
 *   node tools/kembar/cek-cakupan-penjaga.mjs --halaman=halaman.html --gas=<folder clone versi yang sama>
 *
 * Halaman dan folder harus dari versi yang sama (atau folder = hasil tambal dari versi tayang: tambalan hanya
 * menambah fungsi berakhiran _, yang tidak ikut daftar). Keluar dengan kode 1 bila ada celah.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)]; }));
if (!arg.halaman || !arg.gas) throw new Error('pemakaian: --halaman=<halaman /exec> --gas=<folder kode>');

const teks = fs.readFileSync(arg.halaman, 'utf8').replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const m = /"functionNames":\[([^\]]*)\]/.exec(teks);
if (!m) throw new Error('functionNames tidak ditemukan di halaman (bukan halaman /exec web app GAS?)');
const nama = JSON.parse('[' + m[1] + ']');

const berkas = fs.readdirSync(arg.gas).filter((f) => /\.(js|gs)$/.test(f));
const baca = (f) => fs.readFileSync(path.join(arg.gas, f), 'utf8');
const vendor = berkas.filter((f) => /^Jsrsasign/i.test(f)).map(baca).join('\n');
const lain = berkas.filter((f) => !/^Jsrsasign/i.test(f)).map(baca).join('\n');

// Status setiap deklarasi function di kolom 0: bertanda penjaga apa (sesudah "{" pembuka, lihat tambal-penjaga.mjs).
const status = new Map();
for (const x of (lain + '\n' + vendor).matchAll(/^function ([\w$]+)\s*\([^)]*\)\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*\{( \/\* penjaga-run \*\/ if \(typeof (masukSah_|wajibMasukSah_))?/gm)) {
  if (!status.has(x[1]) || status.get(x[1]) === 'tanpa') status.set(x[1], x[3] === 'masukSah_' ? 'entri' : x[3] === 'wajibMasukSah_' ? 'dijaga' : 'tanpa');
}
const esc = (n) => n.replace(/\$/g, '\\$');
const dideklarasi = (n, isi) => new RegExp(`(function\\s+${esc(n)}\\s*\\(|\\b${esc(n)}\\s*=\\s*function\\b)`).test(isi);

const k = { entri: [], dijaga: [], pustaka: [], celah: [] };
for (const n of nama) {
  const s = status.get(n);
  if (s === 'entri' || s === 'dijaga') k[s].push(n);
  else if (dideklarasi(n, vendor) && !dideklarasi(n, lain)) k.pustaka.push(n);
  else k.celah.push(n);
}
console.log(`${path.basename(path.resolve(arg.gas))}: functionNames GAS ${nama.length} = titik masuk ${k.entri.length} + dijaga ${k.dijaga.length} + pustaka jsrsasign ${k.pustaka.length} + CELAH ${k.celah.length}`);
if (k.celah.length) {
  console.log(`  CELAH: ${k.celah.join(', ')}`);
  process.exitCode = 1;
}
