/**
 * Analisis statis kode GAS sebuah rumah, untuk Worker (daftar izin google.script.run) dan tambalan penjaga GAS.
 *
 *   fungsiPublik(berkasJs)              nama fungsi tingkat atas yang tidak diakhiri _ (bisa dipanggil
 *                                       google.script.run di GAS), dengan berkasnya.
 *   pemanggilGoogleScriptRun(html, f)   fungsi yang benar-benar dipanggil halaman lewat google.script.run:
 *                                       nama di rantai google.script.run…namaFungsi(…), ditambah teks nama fungsi
 *                                       di dalam string HTML (pemanggilan dinamis seperti google.script.run[fn](…)).
 *                                       Nama yang hanya kebetulan muncul (misalnya getMonth dari d.getMonth())
 *                                       tidak ikut.
 */

// Hanya AKHIRAN _ yang membuat fungsi GAS privat. Awalan _ (misalnya _getSupabaseConfig) tetap publik: GAS
// mencantumkannya di daftar functionNames halaman web, dan google.script.run bisa memanggilnya.
export function fungsiPublik(berkasJs) {
  const peta = new Map();
  for (const { nama, isi } of berkasJs) {
    for (const m of isi.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) if (!m[1].endsWith('_')) peta.set(m[1], nama);
  }
  return peta;
}

export function pemanggilGoogleScriptRun(berkasHtml, publik) {
  const hasil = new Set();
  for (const { isi } of berkasHtml) {
    // Rantai google.script.run: lewati withSuccessHandler/withFailureHandler/withUserObject beserta argumennya.
    let i = -1;
    while ((i = isi.indexOf('google.script.run', i + 1)) !== -1) {
      let j = i + 'google.script.run'.length;
      for (;;) {
        while (/\s/.test(isi[j] || '')) j++;
        if (isi[j] === '.') {
          j++; while (/\s/.test(isi[j] || '')) j++;
          const m = /^[A-Za-z_$][\w$]*/.exec(isi.slice(j));
          if (!m) break;
          j += m[0].length;
          if (/^with(SuccessHandler|FailureHandler|UserObject)$/.test(m[0])) {
            while (/\s/.test(isi[j] || '')) j++;
            if (isi[j] !== '(') break;
            let d = 0;
            for (; j < isi.length; j++) { if (isi[j] === '(') d++; else if (isi[j] === ')') { d--; if (d === 0) { j++; break; } } }
            continue;
          }
          if (publik.has(m[0])) hasil.add(m[0]);
          break;
        }
        break; // google.script.run[...] dinamis: namanya dicari dari teks string di bawah
      }
    }
    // Teks string yang persis nama fungsi publik (pemanggilan dinamis lewat nama).
    for (const m of isi.matchAll(/(['"])([A-Za-z_$][\w$]*)\1/g)) if (publik.has(m[2])) hasil.add(m[2]);
  }
  return [...hasil].sort();
}
