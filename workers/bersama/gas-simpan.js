// Susun tulisan kode GAS (__ekspor() dari gas-layanan.js) menjadi p_perubahan untuk public.cermin_tulis
// (db/bersama/cermin_tulis.sql): hanya baris yang baru atau berubah, ditambah versi sheet yang dibaca untuk
// pemeriksaan konflik. Sidiknya sama dengan alat cermin (tools/cermin/sinkron.mjs), supaya sinkron dari
// spreadsheet dan tulisan Worker bisa dibandingkan.
import { createHash } from 'node:crypto';

export function susunPerubahan(cermin, ekspor) {
  const out = {};
  for (const [nama, baru] of Object.entries(ekspor)) {
    const lama = cermin.sheets[nama];
    if (!lama || lama.tidak_dimuat || baru.baru) throw new Error(`sheet ${nama} tidak bisa ditulis dari Worker (tidak dimuat atau sheet baru)`);
    if (baru.jarang) {
      // Sheet jarang: isi utuhnya tidak terlihat, jadi sidiknya ditandai; sinkron berikutnya dari spreadsheet
      // (bila ada) melihat sidik berbeda dan memuat ulang sheet itu utuh.
      const tulis = baru.baris_berubah.map(({ baris, nilai }) => {
        const data = {};
        baru.headers.forEach((h, j) => { data[h] = nilai[j]; });
        return { baris, nilai, data };
      });
      out[nama] = {
        sinkron_at: lama.sinkron_at, headers: baru.headers, tipe: baru.tipe, jumlah_baris: baru.jumlah_baris,
        sidik: 'jarang:' + createHash('sha256').update(JSON.stringify(tulis)).digest('hex'), tulis,
      };
      continue;
    }
    const headerSama = JSON.stringify(lama.headers) === JSON.stringify(baru.headers);
    const tulis = [];
    baru.rows.forEach((r, i) => {
      if (headerSama && i < lama.rows.length && JSON.stringify(lama.rows[i]) === JSON.stringify(r)) return;
      const data = {};
      baru.headers.forEach((h, j) => { data[h] = r[j]; });
      tulis.push({ baris: i + 2, nilai: r, data });
    });
    out[nama] = {
      sinkron_at: lama.sinkron_at,
      headers: baru.headers,
      tipe: baru.tipe,
      jumlah_baris: baru.rows.length,
      sidik: createHash('sha256').update(JSON.stringify({ headers: baru.headers, rows: baru.rows })).digest('hex'),
      tulis,
    };
  }
  return out;
}
