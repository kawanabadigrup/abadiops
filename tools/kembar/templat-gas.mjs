/**
 * Kompilasi template HtmlService GAS (<? kode ?>, <?= cetak ?>, <?!= cetak mentah ?>) menjadi fungsi JS biasa,
 * untuk dijalankan di Worker (tanpa eval, new Function, maupun `with`; modul ES selalu ketat) dan di GAS lokal.
 *
 * Di GAS, properti template (template.user = …) terbaca di scriptlet sebagai variabel bebas, dan nama yang bukan
 * properti jatuh ke ruang nama global script. Di sini setiap nama bebas di kode scriptlet dideklarasikan di awal
 * fungsi: properti template bila ada, selain itu nilai global lewat __g(nama). Nama yang dideklarasikan sendiri
 * oleh scriptlet (function f, let, const, class) tidak disentuh.
 *
 * <?= ?> di-escape menurut konteks letaknya di template, seperti escaping kontekstual HtmlService: teks HTML,
 * nilai atribut, awal atau tengah URL di href/src/action, string JS di atribut event dan di <script>, kode JS,
 * dan komentar JS. Konteks dihitung dari teks statis template, bukan dari keluaran saat dijalankan.
 *
 * Hasil: sumber `function (__t, __g, __c) { … return __o.join(''); }`. __t objek template, __g pencari nama
 * global, __c pencetak per konteks (workers/bersama/gas-layanan.js).
 */

const KATA_KUNCI = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof new return super switch this throw try typeof var void while with yield let static enum await implements package protected interface private public null true false undefined NaN Infinity arguments eval of get set async').split(' '));

// Pengenal yang dipakai kode (bukan akses properti setelah titik), dan nama yang dideklarasikan lokal.
function telusuriKode(kode) {
  const pakai = new Set(), lokal = new Set();
  let i = 0, sebelum = '';
  const n = kode.length;
  const bolehRegex = () => !sebelum || /[(,=:[!&|?{};+\-*%<>~^]$/.test(sebelum) || /^(return|typeof|case|do|else|in|of|new|delete|void|throw)$/.test(sebelum);
  while (i < n) {
    const c = kode[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && kode[i + 1] === '/') { while (i < n && kode[i] !== '\n') i++; continue; }
    if (c === '/' && kode[i + 1] === '*') { const j = kode.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === "'" || c === '"') { i++; while (i < n && kode[i] !== c) { if (kode[i] === '\\') i++; i++; } i++; sebelum = 'str'; continue; }
    if (c === '`') {
      i++;
      while (i < n && kode[i] !== '`') {
        if (kode[i] === '\\') { i += 2; continue; }
        if (kode[i] === '$' && kode[i + 1] === '{') {
          let d = 1, j = i + 2;
          while (j < n && d) { if (kode[j] === '{') d++; else if (kode[j] === '}') d--; j++; }
          const dalam = telusuriKode(kode.slice(i + 2, j - 1));
          dalam.pakai.forEach((x) => pakai.add(x)); dalam.lokal.forEach((x) => lokal.add(x));
          i = j; continue;
        }
        i++;
      }
      i++; sebelum = 'str'; continue;
    }
    if (c === '/' && bolehRegex()) {
      i++; let kelas = false;
      while (i < n && (kelas || kode[i] !== '/')) { if (kode[i] === '\\') i++; else if (kode[i] === '[') kelas = true; else if (kode[i] === ']') kelas = false; i++; }
      i++; while (i < n && /[a-z]/i.test(kode[i])) i++;
      sebelum = 'regex'; continue;
    }
    if (/[0-9]/.test(c)) { while (i < n && /[0-9a-fA-FxXoObBn._eE]/.test(kode[i])) i++; sebelum = 'angka'; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[\w$]/.test(kode[j])) j++;
      const kata = kode.slice(i, j);
      const titik = sebelum === '.';
      if (!titik && /^(function|let|const|class)$/.test(sebelum) && !KATA_KUNCI.has(kata)) lokal.add(kata);
      if (!titik && !KATA_KUNCI.has(kata)) pakai.add(kata);
      sebelum = kata; i = j; continue;
    }
    sebelum = c; i++;
  }
  return { pakai, lokal };
}

// Bagi template menjadi teks statis dan scriptlet, lalu tentukan konteks setiap <?= ?> dari teks statis.
function bagiTemplat(html) {
  const bagian = [];
  const re = /<\?(!=|=)?([\s\S]*?)\?>/g;
  let akhir = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > akhir) bagian.push({ jenis: 'teks', isi: html.slice(akhir, m.index) });
    bagian.push({ jenis: m[1] === '=' ? 'cetak' : m[1] === '!=' ? 'mentah' : 'kode', isi: m[2] });
    akhir = re.lastIndex;
  }
  if (akhir < html.length) bagian.push({ jenis: 'teks', isi: html.slice(akhir) });

  let mode = 'html', tag = null, kutipAttr = null, namaAttr = '', isiAttr = '', kutipJs = null, komentarJs = null;
  for (const b of bagian) {
    if (b.jenis === 'cetak') {
      if (mode === 'script') b.konteks = komentarJs ? 'komentar' : (kutipJs ? 'js' : 'jskode');
      else if (mode === 'style') b.konteks = 'css';
      else if (tag) {
        if (!kutipAttr) b.konteks = 'attr';
        else if (/^(href|src|action|formaction|poster|background)$/i.test(namaAttr)) b.konteks = isiAttr === '' ? 'url-awal' : 'url-tengah';
        else if (/^on/i.test(namaAttr)) b.konteks = 'onevent';
        else b.konteks = 'attr';
      } else b.konteks = 'html';
      if (tag && kutipAttr) isiAttr += 'x';
      continue;
    }
    if (b.jenis !== 'teks') continue;
    const t = b.isi;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (mode === 'script') {
        if (komentarJs === '//') { if (c === '\n') komentarJs = null; continue; }
        if (komentarJs === '/*') { if (t.startsWith('*/', i)) { komentarJs = null; i++; } continue; }
        if (kutipJs) { if (c === '\\') { i++; continue; } if (c === kutipJs) kutipJs = null; continue; }
        if (t.slice(i, i + 8).toLowerCase() === '</script') { mode = 'html'; i += 7; continue; }
        if (t.startsWith('//', i)) { komentarJs = '//'; i++; continue; }
        if (t.startsWith('/*', i)) { komentarJs = '/*'; i++; continue; }
        if (c === "'" || c === '"' || c === '`') kutipJs = c;
        continue;
      }
      if (mode === 'style') { if (t.slice(i, i + 7).toLowerCase() === '</style') { mode = 'html'; i += 6; } continue; }
      if (!tag) {
        if (t.startsWith('<!--', i)) { const j = t.indexOf('-->', i + 4); i = j < 0 ? t.length : j + 2; continue; }
        if (c === '<' && /[a-z]/i.test(t[i + 1] || '')) { tag = (t.slice(i + 1).match(/^[a-z0-9]+/i) || [''])[0].toLowerCase(); kutipAttr = null; }
        continue;
      }
      if (kutipAttr) { if (c === kutipAttr) { kutipAttr = null; } else isiAttr += c; continue; }
      if (c === '=') { namaAttr = (t.slice(0, i).match(/([a-z\-:]+)\s*$/i) || ['', namaAttr])[1]; continue; }
      if (c === '"' || c === "'") { kutipAttr = c; isiAttr = ''; continue; }
      if (c === '>') { if (tag === 'script') mode = 'script'; else if (tag === 'style') mode = 'style'; tag = null; }
    }
  }
  return bagian;
}

export function kompilasiTemplat(html) {
  const bagian = bagiTemplat(html);
  const kode = bagian.filter((b) => b.jenis !== 'teks').map((b) => b.isi).join('\n;\n');
  const { pakai, lokal } = telusuriKode(kode);
  const bebas = [...pakai].filter((x) => !lokal.has(x) && !x.startsWith('__')).sort();
  const baris = ['function (__t, __g, __c) {'];
  for (const x of bebas) baris.push(`var ${x} = Object.prototype.hasOwnProperty.call(__t, ${JSON.stringify(x)}) ? __t[${JSON.stringify(x)}] : __g(${JSON.stringify(x)});`);
  baris.push('var __o = [];');
  for (const b of bagian) {
    if (b.jenis === 'teks') baris.push(`__o.push(${JSON.stringify(b.isi)});`);
    else if (b.jenis === 'kode') baris.push(b.isi);
    else if (b.jenis === 'cetak') baris.push(`__o.push(__c[${JSON.stringify(b.konteks)}]((${b.isi})));`);
    else baris.push(`__o.push(__c.mentah((${b.isi})));`);
  }
  baris.push("return __o.join('');", '}');
  return { sumber: baris.join('\n'), bebas, konteks: bagian.filter((b) => b.jenis === 'cetak').map((b) => b.konteks) };
}

// Template dan HTML mentah sebuah folder GAS: { templat: { nama: sumber }, html: { nama: isi }, bebas: [nama] }.
export function kompilasiFolder(berkasHtml) {
  const templat = {}, html = {}, bebas = new Set();
  for (const { nama, isi } of berkasHtml) {
    const n = nama.replace(/\.html$/, '');
    html[n] = isi;
    if (/<\?/.test(isi)) {
      const k = kompilasiTemplat(isi);
      templat[n] = k.sumber;
      k.bebas.forEach((x) => bebas.add(x));
    }
  }
  return { templat, html, bebas: [...bebas].sort() };
}

// Kode JS yang memasang template di ruang nama GAS (di bundel Worker atau di konteks vm GAS lokal):
// __g mencari nama global script tanpa ReferenceError.
export function kodePasangTemplat(hasil, pemasang) {
  const kasus = hasil.bebas.map((x) => `case ${JSON.stringify(x)}: return typeof ${x} === 'undefined' ? undefined : ${x};`).join('\n');
  const peta = Object.entries(hasil.templat).map(([n, s]) => `${JSON.stringify(n)}: ${s}`).join(',\n');
  return `(function () {\nfunction __g(n) { switch (n) {\n${kasus}\ndefault: return undefined; } }\n${pemasang}({\n${peta}\n}, __g);\n})();`;
}
