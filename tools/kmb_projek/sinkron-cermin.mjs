#!/usr/bin/env node
/**
 * Sinkron cermin KMB Project: spreadsheet → Supabase skema `kmb_projek`.
 * Rumah: kmb-projek · Pemegang: Raka · Sesuai docs/SERAH-TERIMA-2026-10-29.md §5 Langkah 2
 *
 * Alat ini HANYA MEMBACA spreadsheet, memakai akun layanan Google yang diberi hak
 * Viewer. Ia tidak pernah menulis ke spreadsheet, dan tidak menyentuh GAS.
 *
 * Variabel lingkungan:
 *   GOOGLE_SA_KEY_FILE          path ke file JSON kunci akun layanan (simpan DI LUAR repo)
 *   KMB_PROJEK_SPREADSHEET_ID   ID spreadsheet KMB Project (1lnJo74O…)
 *   DATABASE_URL                koneksi Postgres Supabase (session pooler, porta 5432)
 *
 * Opsi:
 *   --sheet=WorkOrders          hanya menyinkronkan satu sheet
 *   --kering                    baca dan hitung saja, tanpa menulis ke database
 *
 * Status: JANGAN menulis ke database dulu. Uji kering 13 Nov 2026: daftar sheet di bawah
 * tidak cocok dengan spreadsheet aslinya (docs/BUG-DICATAT.md #29).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const SHEET_KE_TABEL = {
  Config_Components: 'config_components',
  Config_Units: 'config_units',
  Config_Mechanics: 'config_mechanics',
  Config_Factors: 'config_factors',
  Config_BaseSettings: 'config_base_settings',
  ApiTokens: 'api_tokens',
  WorkOrders: 'work_orders',
  WorkOrders_Archive: 'work_orders_archive',
  JobCatalog: 'job_catalog',
  CatalogJobs: 'catalog_jobs',
  MeterPanelChanges: 'meter_panel_changes',
  ProcessedOps: 'processed_ops',
  AuditLogs: 'audit_logs',
  WebKiriman: 'web_kiriman',
  ScoringSnapshots: 'scoring_snapshots',
  NotificationQueue: 'notification_queue',
  PushSubs: 'push_subs',
};

const BARIS_PER_AMBIL = 2000;
const BARIS_PER_INSERT = 1000;

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
  if (!v) throw new Error(`${nama} belum diisi. Setel di environment.`);
  return v;
}

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
// dan kalau tetap kena 429 atau galat 5xx, tunggu lalu coba lagi.
const JEDA_MS = 1100;
let terakhirMs = 0;
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function gapi(url, token) {
  for (let coba = 1; ; coba++) {
    await tidur(terakhirMs + JEDA_MS - Date.now());
    terakhirMs = Date.now();
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.ok) return res.json();
    const pesan = `${res.status} ${url.split('?')[0]}: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 300)}`;
    if ((res.status !== 429 && res.status < 500) || coba >= 5) throw new Error(pesan);
    console.log(`  ${res.status}, mencoba lagi (${coba + 1}/5)`);
    await tidur(res.status === 429 ? 61000 : 5000 * coba);
  }
}

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

// ── Utama ────────────────────────────────────────────────────────────────────
async function utama() {
  const kering = Boolean(arg.kering);
  const id = wajib('KMB_PROJEK_SPREADSHEET_ID');
  const { token, email } = await aksesToken(wajib('GOOGLE_SA_KEY_FILE'));
  const meta = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${id}`
    + '?fields=properties(title,timeZone),sheets(properties(title,gridProperties(rowCount)))', token);
  const zona = meta.properties.timeZone;
  console.log(`Spreadsheet: "${meta.properties.title}" · zona waktu ${zona} · akun layanan ${email}`);
  if (zona !== 'Asia/Jakarta') console.log(`  PERHATIAN: zona waktu spreadsheet ${zona}, sedangkan skrip GAS memakai Asia/Jakarta.`);

  const ada = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.gridProperties.rowCount]));
  const target = arg.sheet ? [arg.sheet] : Object.keys(SHEET_KE_TABEL);

  let sql = null;
  if (!kering) {
    const { default: postgres } = await import('postgres');
    sql = postgres(wajib('DATABASE_URL'), { max: 1, prepare: false, ssl: 'require', connect_timeout: 20 });
  }

  const ringkas = [];
  for (const judul of target) {
    const tabel = SHEET_KE_TABEL[judul];
    const mulaiAt = new Date();
    if (!tabel) { ringkas.push([judul, '-', 'BUKAN SHEET CERMIN']); continue; }
    if (!ada.has(judul)) { ringkas.push([judul, '-', 'TIDAK ADA DI SPREADSHEET']); continue; }
    try {
      const { headers, rows, tipe } = await bacaSheet(id, judul, ada.get(judul), zona, token);
      const sidik = sidikDari(headers, rows);
      if (!kering) {
        await sql.begin(async (tx) => {
          await tx`DELETE FROM ${tx('kmb_projek.' + tabel)}`;
          for (let i = 0; i < rows.length; i += BARIS_PER_INSERT) {
            const batch = rows.slice(i, i + BARIS_PER_INSERT)
              .map((r) => ({ baris: r.baris, nilai: tx.json(r.nilai), data: tx.json(r.data) }));
            await tx`INSERT INTO ${tx('kmb_projek.' + tabel)} ${tx(batch, 'baris', 'nilai', 'data')}`;
          }
          await tx`
            INSERT INTO kmb_projek.cermin_header (sheet, tabel, headers, tipe, jumlah_baris, sidik, sinkron_at)
            VALUES (${judul}, ${tabel}, ${headers}, ${tx.json(tipe)}, ${rows.length}, ${sidik}, now())
            ON CONFLICT (sheet) DO UPDATE SET tabel = EXCLUDED.tabel, headers = EXCLUDED.headers,
              tipe = EXCLUDED.tipe, jumlah_baris = EXCLUDED.jumlah_baris, sidik = EXCLUDED.sidik,
              sinkron_at = EXCLUDED.sinkron_at`;
          await tx`INSERT INTO kmb_projek.cermin_log (sheet, mulai_at, jumlah_baris, sidik)
                   VALUES (${judul}, ${mulaiAt}, ${rows.length}, ${sidik})`;
        });
      }
      const campur = Object.entries(tipe).filter(([, t]) => t.startsWith('campur')).map(([h]) => h);
      ringkas.push([judul, String(rows.length), `${headers.length} kolom · sidik ${sidik.slice(0, 12)}${campur.length ? ` · tipe campur: ${campur.join(', ')}` : ''}`]);
    } catch (e) {
      ringkas.push([judul, '-', `GAGAL: ${e.message}`]);
      if (sql) await sql`INSERT INTO kmb_projek.cermin_log (sheet, mulai_at, galat) VALUES (${judul}, ${mulaiAt}, ${e.message})`.catch(() => {});
    }
  }

  if (sql) {
    for (const [k, v] of [['spreadsheet_id', id], ['judul', meta.properties.title], ['zona_waktu', zona], ['sinkron_terakhir', new Date().toISOString()]]) {
      await sql`INSERT INTO kmb_projek.cermin_meta (kunci, nilai, diubah_at) VALUES (${k}, ${v}, now())
                ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, diubah_at = now()`;
    }
    await sql.end();
  }

  console.log(`\n${kering ? 'MODE KERING, tidak ada yang ditulis ke database' : 'Tersimpan ke skema kmb_projek'}:`);
  for (const [s, n, ket] of ringkas) console.log(`  ${s.padEnd(22)} ${n.padStart(7)}  ${ket}`);
  if (ringkas.some(([, , ket]) => ket.startsWith('GAGAL') || ket.startsWith('TIDAK ADA'))) process.exitCode = 1;
}

utama().catch((e) => { console.error(`Berhenti: ${e.message}`); process.exit(1); });
