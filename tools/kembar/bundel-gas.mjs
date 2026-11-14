#!/usr/bin/env node
/**
 * Bungkus kode GAS asli sebuah rumah menjadi satu modul untuk Worker rumah itu (keputusan Gabriel 14 Nov 2026,
 * "GAS asli di Worker"). Script dan versinya dari config/rumah.json (<kamar>.gas.script, .gas.versi), jadi yang
 * jalan di Worker selalu versi GAS yang dipatok, bukan HEAD yang sedang disunting.
 *
 * Hasilnya TIDAK di-commit (repo ini publik; .gitignore: workers/*\/gas/). Buat ulang sebelum setiap deploy:
 *   node tools/kembar/bundel-gas.mjs --kamar=kmbbupr
 * Opsi:
 *   --gas=<folder>     pakai clone yang sudah ada, bukan clone baru (harus versi yang sama dengan rumah.json)
 *   --keluar=<berkas>  bawaan workers/<kamar>/gas/gas-kamar.js
 *
 * Isi modul:
 *   INFO      kamar, script, versi, jumlah berkas, sidik, zona skrip, dan fungsiWeb.
 *   HTML      isi mentah setiap berkas .html (createHtmlOutputFromFile, include).
 *   gasKamar(L)  memasang layanan tiruan L (workers/bersama/gas-layanan.js) sebagai nama global kode GAS,
 *             menjalankan semua berkas menurut urutan muat, memasang template web yang sudah dikompilasi
 *             (tools/kembar/templat-gas.mjs), lalu mengembalikan { doPost, doGet, fungsiWeb }.
 * fungsiWeb adalah DAFTAR IZIN google.script.run: hanya fungsi publik yang disebut di berkas HTML (dipanggil
 * langsung atau lewat namanya). Di GAS semua fungsi tanpa akhiran _ bisa dipanggil google.script.run, termasuk
 * alat perawatan yang tidak pernah dipakai halaman; Worker tidak meniru celah itu.
 * Kode berjalan dalam mode ketat (modul ES); uji kembar (tools/kembar/gas-lokal.mjs) memakai mode yang sama.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bacaKodeGas, siapkanKonteks } from './gas-lokal.mjs';
import { NAMA_LAYANAN } from '../../workers/bersama/gas-layanan.js';
import { kompilasiFolder, kodePasangTemplat } from './templat-gas.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const i = a.indexOf('=');
  return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)];
}));
if (!arg.kamar) throw new Error('--kamar wajib. Lihat kepala berkas tools/kembar/bundel-gas.mjs.');
const profil = JSON.parse(fs.readFileSync(path.join(AKAR, 'config/rumah.json'), 'utf8'))[arg.kamar];
if (!profil || !profil.gas || !profil.gas.script || !profil.gas.versi) throw new Error(`config/rumah.json ${arg.kamar}.gas.script dan .gas.versi belum diisi`);

let folder = arg.gas;
if (!folder) {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), `abadiops-gas-${arg.kamar}-${profil.gas.versi}-`));
  const r = spawnSync('clasp', ['clone', profil.gas.script, String(profil.gas.versi)], { cwd: folder, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`clasp clone gagal (${r.status}): ${(r.stderr || r.stdout || '').slice(-300)}`);
}
const clasp = JSON.parse(fs.readFileSync(path.join(folder, '.clasp.json'), 'utf8'));
if (clasp.scriptId !== profil.gas.script) throw new Error(`folder ${folder} berisi script lain, bukan ${arg.kamar}`);

const kode = bacaKodeGas(folder);
const urutan = siapkanKonteks({ kode, data: { zonaSkrip: kode.zonaSkrip, sheets: {}, dilewati: [] } }).urutan();
const isi = new Map(kode.berkas.map((b) => [b.nama, b.isi]));
const sidik = crypto.createHash('sha256');
for (const nama of urutan) sidik.update(nama + '\n' + isi.get(nama) + '\n');

// Template web dan daftar izin google.script.run (fungsi publik yang disebut di HTML).
const web = kompilasiFolder(kode.html);
for (const b of kode.html) sidik.update(b.nama + '\n' + b.isi + '\n');
const fungsiPublik = new Set();
for (const b of kode.berkas) for (const m of b.isi.matchAll(/^function ([A-Za-z$][\w$]*)\s*\(/gm)) if (!m[1].endsWith('_')) fungsiPublik.add(m[1]);
const kataHtml = new Set(kode.html.flatMap((b) => b.isi.match(/[A-Za-z_$][\w$]*/g) || []));
const fungsiWeb = [...fungsiPublik].filter((n) => kataHtml.has(n)).sort();

const INFO = {
  kamar: arg.kamar, script: profil.gas.script, versi: profil.gas.versi, berkas: urutan.length,
  sidik: sidik.digest('hex'), zonaSkrip: kode.zonaSkrip, dibuat: new Date().toISOString(),
  html: kode.html.length, templat: Object.keys(web.templat).length, fungsiWeb,
};
const keluar = arg.keluar || path.join(AKAR, 'workers', arg.kamar, 'gas', 'gas-kamar.js');
fs.mkdirSync(path.dirname(keluar), { recursive: true });
const bagian = [
  '// DIBUAT OTOMATIS oleh tools/kembar/bundel-gas.mjs. Jangan disunting, dan jangan di-commit (repo publik).',
  `// Kamar ${INFO.kamar}, script ${INFO.script.slice(0, 8)}…, versi ${INFO.versi}, ${INFO.berkas} berkas.`,
  `export const INFO = ${JSON.stringify(INFO)};`,
  `export const HTML = ${JSON.stringify(web.html)};`,
  'export function gasKamar(L) {',
  `  const { ${NAMA_LAYANAN.join(', ')} } = L;`,
  '  return (function () {',
  ...urutan.map((nama) => `// ═══════ ${nama} ═══════\n${isi.get(nama)}\n`),
  '// ═══════ template web (tools/kembar/templat-gas.mjs) ═══════',
  kodePasangTemplat(web, 'L.__pasangTemplat'),
  "    return { doPost: typeof doPost === 'function' ? doPost : undefined, doGet: typeof doGet === 'function' ? doGet : undefined,",
  `      fungsiWeb: { ${fungsiWeb.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ')} } };`,
  '  })();',
  '}',
  '',
];
fs.writeFileSync(keluar, bagian.join('\n'));
console.log(`${path.relative(AKAR, keluar)}: ${INFO.kamar} versi ${INFO.versi}, ${INFO.berkas} berkas, ${INFO.templat}/${INFO.html} template web, ${fungsiWeb.length} fungsi google.script.run, ${Math.round(fs.statSync(keluar).size / 1024)} KB, sidik ${INFO.sidik.slice(0, 12)}`);
