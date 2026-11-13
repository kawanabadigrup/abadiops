#!/usr/bin/env node
/**
 * Sinkron cermin: spreadsheet satu rumah → Supabase, skema milik rumah itu. Satu alat untuk semua rumah.
 * Menggantikan tools/{sum,kmb,kmb_projek}/sinkron-cermin.mjs (docs/BUG-DICATAT.md #29).
 * Format cermin sama dengan db/sum/cermin_sheet.sql; penjelasan di db/sum/README.md.
 *
 * Alat ini HANYA MEMBACA spreadsheet, memakai akun layanan Google yang diberi hak
 * Viewer. Ia tidak pernah menulis ke spreadsheet, dan tidak menyentuh GAS.
 *
 * Tidak ada daftar sheet yang tertanam. Alat membaca daftar sheet dari spreadsheet, lalu
 * menyalin setiap sheet ke tabel bernama snake_case dari nama sheetnya
 * (WorkOrders_Archive → work_orders_archive, HmKoreksi → hm_koreksi). Tabel yang belum ada
 * dibuat dengan bentuk cermin mentah (baris, nilai, data). Tabel yang sudah ada tapi bentuknya
 * lain tidak disentuh, dan sheet itu dilaporkan GAGAL.
 *
 * Penulisan per baris: sheet yang isinya sama dengan sinkron sebelumnya tidak ditulis ulang.
 * Untuk sheet yang berubah, hanya baris baru atau berubah yang ditulis, dan baris yang hilang
 * dihapus, supaya tabel tidak membengkak walaupun sinkron dijalankan tiap jam.
 *
 * Variabel lingkungan:
 *   GOOGLE_SA_KEY_FILE       path ke file JSON kunci akun layanan (simpan DI LUAR repo)
 *   <SKEMA>_SPREADSHEET_ID   ID spreadsheet rumah. Nama skema = awalannya dalam huruf kecil:
 *                            SUM_ → sum, KMB_ → kmb (KMB TRA), KMB_PROJEK_ → kmb_projek, KMBBUPR_ → kmbbupr
 *   DATABASE_URL             koneksi Postgres Supabase (tidak dipakai dengan --kering)
 *
 * Opsi:
 *   --skema=sum              rumah yang disinkron
 *   --semua                  semua rumah yang punya <SKEMA>_SPREADSHEET_ID di lingkungan, berurutan
 *   --sheet=WorkOrders       hanya menyinkronkan satu sheet
 *   --lewati=AuditLogs       sheet yang tidak disalin, dipisah koma. Bawaannya AuditLogs (keputusan
 *                            Gabriel 13 Nov, demi ukuran Gedung 1). `--lewati=` berarti semua sheet disalin.
 *   --kering                 baca dan hitung saja, tanpa menulis ke database
 *   --ringkas                satu baris per rumah, tanpa judul spreadsheet, ID, atau nama sheet yang lulus.
 *                            Dipakai di GitHub Actions, karena log repo publik bisa dibaca siapa saja.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const LEWATI_BAWAAN = 'AuditLogs';

// Kolom yang biasa dipakai mencari baris. Kalau ada di header sebuah sheet, kolom itu diberi indeks.
const KOLOM_KUNCI = ['id', 'wo_id', 'wo_number', 'mechanic_id', 'token', 'op_id'];

// Catatan cermin_log disimpan sekian hari: cukup untuk syarat "7 hari tanpa selisih" dan perbandingan bulanan.
const SIMPAN_LOG_HARI = 35;

const BARIS_PER_AMBIL = 2000;
const BARIS_PER_INSERT = 1000;

// Nilai galat sel, ditulis sama seperti yang dikembalikan getValues() di GAS.
const GALAT = {
  REF: '#REF!', NA: '#N/A', VALUE: '#VALUE!', DIVIDE_BY_ZERO: '#DIV/0!',
  NAME: '#NAME?', NUM: '#NUM!', NULL_VALUE: '#NULL!', ERROR: '#ERROR!', LOADING: '#LOADING',
};

const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

function wajib(nama) {
  const v = process.env[nama];
  if (!v) throw new Error(`${nama} belum diisi. Lihat kepala berkas tools/cermin/sinkron.mjs.`);
  return v;
}

// Dengan --ringkas, ID spreadsheet disamarkan dari setiap pesan galat.
const idDisamarkan = new Set();
const samarkan = (pesan) => (arg.ringkas ? [...idDisamarkan].reduce((p, id) => p.split(id).join('<id>'), String(pesan)) : String(pesan));

// Nama sheet → nama tabel: Config_BaseSettings → config_base_settings, WorkOrderTeam → work_order_team.
const keTabel = (sheet) => sheet
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toLowerCase();

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

// ── Login akun layanan Google (JWT RS256), cakupan baca-saja ─────────────────
async function aksesToken(keyFile) {
  const k = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const kepala = b64({ alg: 'RS256', typ: 'JWT' });
  const klaim = b64({
    iss: k.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const tanda = crypto.createSign('RSA-SHA256').update(`${kepala}.${klaim}`).sign(k.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${kepala}.${klaim}.${tanda}`,
    }),
  });
  if (!res.ok) throw new Error(`Login akun layanan gagal: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return { token: (await res.json()).access_token, email: k.client_email };
}

// Kuota Sheets API: 60 permintaan baca per menit per akun layanan. Beri jeda antarpermintaan,
// dan kalau tetap kena 429, galat 5xx, atau jaringan putus sesaat, tunggu lalu coba lagi.
const JEDA_MS = 1100;
let terakhirMs = 0;
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function gapi(url, token) {
  for (let coba = 1; ; coba++) {
    await tidur(terakhirMs + JEDA_MS - Date.now());
    terakhirMs = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    } catch (e) {
      if (coba >= 5) throw e;
      console.log(`  jaringan: ${e.message}, mencoba lagi (${coba + 1}/5)`);
      await tidur(5000 * coba);
      continue;
    }
    if (res.ok) return res.json();
    const pesan = `${res.status} ${url.split('?')[0]}: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 300)}`;
    if ((res.status !== 429 && res.status < 500) || coba >= 5) throw new Error(pesan);
    console.log(`  ${res.status}, mencoba lagi (${coba + 1}/5)`);
    await tidur(res.status === 429 ? 61000 : 5000 * coba);
  }
}

// ── Tanggal: nomor seri spreadsheet → ISO UTC, memakai zona waktu spreadsheet ─
function selisihZonaMs(zona, utcMs) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(utcMs / 1000) * 1000;
}
function seriKeIso(seri, zona) {
  const jamDinding = Math.round((seri - 25569) * 86400000);
  let utc = jamDinding - selisihZonaMs(zona, jamDinding);
  utc = jamDinding - selisihZonaMs(zona, utc);
  return new Date(utc).toISOString();
}

// Satu sel API → nilai yang sama dengan yang dibaca getValues() di GAS.
function bacaSel(c, zona) {
  const v = c && c.effectiveValue;
  if (!v) return { nilai: '', tipe: null };
  if ('stringValue' in v) return { nilai: v.stringValue, tipe: 'teks' };
  if ('boolValue' in v) return { nilai: v.boolValue, tipe: 'boolean' };
  if ('errorValue' in v) return { nilai: GALAT[v.errorValue.type] || '#ERROR!', tipe: 'galat' };
  if ('numberValue' in v) {
    const f = c.effectiveFormat && c.effectiveFormat.numberFormat && c.effectiveFormat.numberFormat.type;
    if (f === 'DATE' || f === 'DATE_TIME' || f === 'TIME') return { nilai: seriKeIso(v.numberValue, zona), tipe: 'tanggal' };
    return { nilai: v.numberValue, tipe: 'angka' };
  }
  return { nilai: '', tipe: null };
}

// ── Baca satu sheet utuh, bentuknya sama dengan getDataRange().getValues() ───
async function bacaSheet(id, judul, jumlahBarisGrid, zona, token) {
  const mentah = [];
  for (let mulai = 1; mulai <= jumlahBarisGrid; mulai += BARIS_PER_AMBIL) {
    const akhir = Math.min(mulai + BARIS_PER_AMBIL - 1, jumlahBarisGrid);
    const range = encodeURIComponent(`'${judul.replace(/'/g, "''")}'!${mulai}:${akhir}`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?ranges=${range}&includeGridData=true`
      + '&fields=sheets(data(startRow,rowData(values(effectiveValue,effectiveFormat/numberFormat/type))))';
    const j = await gapi(url, token);
    const data = (j.sheets && j.sheets[0] && j.sheets[0].data && j.sheets[0].data[0]) || {};
    const rd = data.rowData || [];
    for (let i = 0; i < akhir - mulai + 1; i++) mentah.push((rd[i] && rd[i].values) || []);
  }
  // Ubah ke nilai GAS, lalu potong baris dan kolom kosong di ujung seperti getDataRange().
  const baris = mentah.map((sel) => sel.map((c) => bacaSel(c, zona)));
  let barisTerakhir = 0, kolomTerakhir = 0;
  baris.forEach((r, i) => r.forEach((s, j) => {
    if (s.nilai !== '') { barisTerakhir = Math.max(barisTerakhir, i + 1); kolomTerakhir = Math.max(kolomTerakhir, j + 1); }
  }));
  const potong = baris.slice(0, barisTerakhir).map((r) => {
    const out = r.slice(0, kolomTerakhir);
    while (out.length < kolomTerakhir) out.push({ nilai: '', tipe: null });
    return out;
  });
  if (potong.length === 0) return { headers: [], rows: [], tipe: {} };
  const headers = potong[0].map((s) => String(s.nilai));
  const tipeKolom = headers.map(() => new Set());
  const rows = potong.slice(1).map((r, i) => {
    r.forEach((s, j) => { if (s.tipe) tipeKolom[j].add(s.tipe); });
    const nilai = r.map((s) => s.nilai);
    const data = {};
    headers.forEach((h, j) => { data[h] = nilai[j]; });
    return { baris: i + 2, nilai, data };
  });
  const tipe = {};
  headers.forEach((h, j) => {
    const t = [...tipeKolom[j]].sort();
    tipe[h] = t.length === 0 ? 'kosong' : t.length === 1 ? t[0] : `campur:${t.join('+')}`;
  });
  return { headers, rows, tipe };
}

const sidikDari = (headers, rows) => crypto.createHash('sha256')
  .update(JSON.stringify({ headers, rows: rows.map((r) => r.nilai) })).digest('hex');

// ── Bentuk cermin di database, sama dengan db/sum/cermin_sheet.sql ───────────
async function siapkanSkema(sql, skema) {
  await sql`CREATE SCHEMA IF NOT EXISTS ${sql(skema)}`;
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_meta')} (
    kunci     text PRIMARY KEY,
    nilai     text NOT NULL,
    diubah_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_header')} (
    sheet        text PRIMARY KEY,
    tabel        text NOT NULL,
    headers      text[] NOT NULL,
    tipe         jsonb NOT NULL DEFAULT '{}'::jsonb,
    jumlah_baris integer NOT NULL,
    sidik        text NOT NULL,
    sinkron_at   timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS ${sql(skema + '.cermin_log')} (
    id           bigserial PRIMARY KEY,
    sheet        text NOT NULL,
    mulai_at     timestamptz NOT NULL,
    selesai_at   timestamptz NOT NULL DEFAULT now(),
    jumlah_baris integer,
    sidik        text,
    galat        text
  )`;
  // Jumlah baris yang ditulis dan dihapus di setiap putaran, bahan laporan selisih harian.
  await sql`ALTER TABLE ${sql(skema + '.cermin_log')}
              ADD COLUMN IF NOT EXISTS baris_berubah integer,
              ADD COLUMN IF NOT EXISTS baris_dihapus integer`;
  // Cermin hanya dibaca Worker lewat RPC bertoken. Pengguna anonim tidak boleh masuk skema ini.
  await sql`REVOKE ALL ON SCHEMA ${sql(skema)} FROM anon, authenticated`;
}

async function siapkanTabel(tx, skema, tabel, headers) {
  await tx`CREATE TABLE IF NOT EXISTS ${tx(`${skema}.${tabel}`)} (
    baris      integer PRIMARY KEY,
    nilai      jsonb   NOT NULL,
    data       jsonb   NOT NULL,
    sinkron_at timestamptz NOT NULL DEFAULT now()
  )`;
  const kolom = (await tx`SELECT column_name FROM information_schema.columns
                          WHERE table_schema = ${skema} AND table_name = ${tabel}`).map((r) => r.column_name);
  if (!['baris', 'nilai', 'data'].every((k) => kolom.includes(k))) {
    throw new Error(`tabel ${skema}.${tabel} sudah ada dengan bentuk lain (${kolom.join(', ')}), tidak disentuh`);
  }
  const indeks = (await tx`SELECT indexdef FROM pg_indexes WHERE schemaname = ${skema} AND tablename = ${tabel}`).map((r) => r.indexdef);
  for (const k of KOLOM_KUNCI.filter((k) => headers.includes(k) && !indeks.some((d) => d.includes(`'${k}'::text`)))) {
    await tx.unsafe(`CREATE INDEX IF NOT EXISTS ${ident(`${tabel}_${k}_idx`)} ON ${ident(skema)}.${ident(tabel)} ((data->>'${k}'))`);
  }
}

// Tulis satu sheet per baris. Hasilnya { sama } kalau isinya tidak berubah, atau jumlah baris yang ditulis dan dihapus.
async function tulisSheet(tx, skema, tabel, judul, headers, rows, sidik) {
  const nama = `${skema}.${tabel}`;
  await siapkanTabel(tx, skema, tabel, headers);
  const lalu = await tx`SELECT sidik FROM ${tx(skema + '.cermin_header')} WHERE sheet = ${judul}`;
  const ada = (await tx`SELECT count(*)::int AS n FROM ${tx(nama)}`)[0].n;
  if (lalu.length > 0 && lalu[0].sidik === sidik && ada === rows.length) return { sama: true, berubah: 0, dihapus: 0 };

  await tx`CREATE TEMP TABLE cermin_baru (baris integer PRIMARY KEY, nilai jsonb NOT NULL, data jsonb NOT NULL) ON COMMIT DROP`;
  for (let i = 0; i < rows.length; i += BARIS_PER_INSERT) {
    const batch = rows.slice(i, i + BARIS_PER_INSERT)
      .map((r) => ({ baris: r.baris, nilai: tx.json(r.nilai), data: tx.json(r.data) }));
    await tx`INSERT INTO cermin_baru ${tx(batch, 'baris', 'nilai', 'data')}`;
  }
  const hapus = await tx`DELETE FROM ${tx(nama)} AS t WHERE NOT EXISTS (SELECT 1 FROM cermin_baru b WHERE b.baris = t.baris)`;
  const tulis = await tx`
    INSERT INTO ${tx(nama)} AS t (baris, nilai, data) SELECT baris, nilai, data FROM cermin_baru
    ON CONFLICT (baris) DO UPDATE SET nilai = EXCLUDED.nilai, data = EXCLUDED.data, sinkron_at = now()
    WHERE t.nilai IS DISTINCT FROM EXCLUDED.nilai OR t.data IS DISTINCT FROM EXCLUDED.data`;
  return { sama: false, berubah: tulis.count, dihapus: hapus.count };
}

// ── Satu rumah ───────────────────────────────────────────────────────────────
async function sinkronRumah(skema) {
  const kering = Boolean(arg.kering);
  const id = wajib(`${skema.toUpperCase()}_SPREADSHEET_ID`);
  idDisamarkan.add(id);
  const lewati = new Set(String(arg.lewati ?? LEWATI_BAWAAN).split(',').map((s) => s.trim()).filter(Boolean));

  const { token, email } = await aksesToken(wajib('GOOGLE_SA_KEY_FILE'));
  const meta = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}`
    + '?fields=properties(title,timeZone),sheets(properties(title,gridProperties(rowCount)))', token);
  const zona = meta.properties.timeZone;
  if (!arg.ringkas) console.log(`Spreadsheet: "${meta.properties.title}" · skema ${skema} · zona waktu ${zona} · akun layanan ${email}`);
  if (zona !== 'Asia/Jakarta') console.log(`  PERHATIAN: zona waktu spreadsheet ${skema} ${zona}, sedangkan skrip GAS memakai Asia/Jakarta.`);

  const semua = meta.sheets.map((s) => ({
    judul: s.properties.title, grid: s.properties.gridProperties.rowCount, tabel: keTabel(s.properties.title),
  }));
  const target = arg.sheet ? semua.filter((s) => s.judul === arg.sheet) : semua;
  if (arg.sheet && target.length === 0) throw new Error(`sheet "${arg.sheet}" tidak ada di spreadsheet`);
  const kembar = new Set(semua.map((s) => s.tabel).filter((t, i, a) => a.indexOf(t) !== i));

  let sql = null;
  if (!kering) {
    const { default: postgres } = await import('postgres');
    sql = postgres(wajib('DATABASE_URL'), { max: 1, prepare: false, ssl: 'require', connect_timeout: 20, onnotice: () => {} });
    try {
      await siapkanSkema(sql, skema);
    } catch (e) {
      await sql.end({ timeout: 5 }).catch(() => {});
      throw e;
    }
  }

  const hasil = [];
  const jumlah = { sama: 0, berubah: 0, dihapus: 0 };
  for (const { judul, grid, tabel } of target) {
    const mulaiAt = new Date();
    if (lewati.has(judul)) { hasil.push([judul, '-', 'dilewati (--lewati)']); continue; }
    if (!tabel || tabel.startsWith('cermin_') || kembar.has(tabel)) {
      hasil.push([judul, '-', `GAGAL: nama tabel "${tabel}" kosong, bentrok, atau kembar`]);
      continue;
    }
    try {
      const { headers, rows, tipe } = await bacaSheet(id, judul, grid, zona, token);
      const sidik = sidikDari(headers, rows);
      let tulis = null;
      if (!kering) {
        await sql.begin(async (tx) => {
          tulis = await tulisSheet(tx, skema, tabel, judul, headers, rows, sidik);
          await tx`
            INSERT INTO ${tx(skema + '.cermin_header')} (sheet, tabel, headers, tipe, jumlah_baris, sidik, sinkron_at)
            VALUES (${judul}, ${tabel}, ${headers}, ${tx.json(tipe)}, ${rows.length}, ${sidik}, now())
            ON CONFLICT (sheet) DO UPDATE SET tabel = EXCLUDED.tabel, headers = EXCLUDED.headers,
              tipe = EXCLUDED.tipe, jumlah_baris = EXCLUDED.jumlah_baris, sidik = EXCLUDED.sidik,
              sinkron_at = EXCLUDED.sinkron_at`;
          await tx`INSERT INTO ${tx(skema + '.cermin_log')} (sheet, mulai_at, jumlah_baris, sidik, baris_berubah, baris_dihapus)
                   VALUES (${judul}, ${mulaiAt}, ${rows.length}, ${sidik}, ${tulis.berubah}, ${tulis.dihapus})`;
        });
        if (tulis.sama) jumlah.sama++;
        jumlah.berubah += tulis.berubah;
        jumlah.dihapus += tulis.dihapus;
      }
      const campur = Object.entries(tipe).filter(([, t]) => t.startsWith('campur')).map(([h]) => h);
      const tulisan = !tulis ? '' : tulis.sama ? ' · tidak berubah' : ` · ${tulis.berubah} baris ditulis, ${tulis.dihapus} dihapus`;
      hasil.push([judul, String(rows.length), `${tabel} · ${headers.length} kolom · sidik ${sidik.slice(0, 12)}${tulisan}${campur.length ? ` · tipe campur: ${campur.join(', ')}` : ''}`]);
    } catch (e) {
      hasil.push([judul, '-', `GAGAL: ${e.message}`]);
      if (sql) await sql`INSERT INTO ${sql(skema + '.cermin_log')} (sheet, mulai_at, galat) VALUES (${judul}, ${mulaiAt}, ${e.message})`.catch(() => {});
    }
  }

  const gagal = hasil.filter(([, , ket]) => ket.startsWith('GAGAL'));
  if (sql) {
    // `sinkron_terakhir` hanya dicatat kalau putaran penuh dan tidak ada sheet yang gagal.
    const isiMeta = [['spreadsheet_id', id], ['judul', meta.properties.title], ['zona_waktu', zona], ['sheet_dilewati', [...lewati].join(',')]];
    if (!arg.sheet && gagal.length === 0) isiMeta.push(['sinkron_terakhir', new Date().toISOString()]);
    try {
      for (const [k, v] of isiMeta) {
        await sql`INSERT INTO ${sql(skema + '.cermin_meta')} (kunci, nilai, diubah_at) VALUES (${k}, ${v}, now())
                  ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, diubah_at = now()`;
      }
      await sql`DELETE FROM ${sql(skema + '.cermin_log')} WHERE mulai_at < now() - make_interval(days => ${SIMPAN_LOG_HARI})`;
    } catch (e) {
      const baris = ['(cermin_meta)', '-', `GAGAL: ${e.message}`];
      hasil.push(baris);
      gagal.push(baris);
    }
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  if (arg.ringkas) {
    const disalin = hasil.length - gagal.length - hasil.filter(([, , ket]) => ket.startsWith('dilewati')).length;
    const tulisan = kering ? 'kering' : `${jumlah.sama} tidak berubah, ${jumlah.berubah} baris ditulis, ${jumlah.dihapus} dihapus`;
    console.log(`${skema}: ${disalin} sheet lulus, ${gagal.length} gagal · ${tulisan}`);
    for (const [s, , ket] of gagal) console.log(`  GAGAL ${s}: ${samarkan(ket.replace(/^GAGAL: /, ''))}`);
  } else {
    console.log(`\n${kering ? 'MODE KERING, tidak ada yang ditulis ke database' : `Tersimpan ke skema ${skema}`}:`);
    for (const [s, n, ket] of hasil) console.log(`  ${s.padEnd(26)} ${n.padStart(7)}  ${ket}`);
  }
  return gagal.length === 0;
}

// ── Utama ────────────────────────────────────────────────────────────────────
async function utama() {
  const daftar = arg.semua
    ? Object.keys(process.env).map((k) => k.match(/^([A-Z][A-Z0-9_]*)_SPREADSHEET_ID$/)).filter(Boolean).map((m) => m[1].toLowerCase()).sort()
    : [typeof arg.skema === 'string' ? arg.skema : ''];
  if (daftar.length === 0) throw new Error('tidak ada <SKEMA>_SPREADSHEET_ID di lingkungan');
  let lulus = true;
  for (const skema of daftar) {
    if (!/^[a-z][a-z0-9_]*$/.test(skema)) throw new Error('isi --skema, misalnya --skema=sum, atau pakai --semua');
    try {
      if (!(await sinkronRumah(skema))) lulus = false;
    } catch (e) {
      lulus = false;
      console.error(`${skema}: Berhenti: ${samarkan(e.message)}`);
    }
  }
  if (!lulus) process.exitCode = 1;
}

utama().catch((e) => { console.error(`Berhenti: ${samarkan(e.message)}`); process.exit(1); });
