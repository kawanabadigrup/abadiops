# Rumah KMB Projek BUPR: Worker `abadiops-kmbbupr`

Rumah: `kmbbupr` · Tahap: staging saja (produksi belum pernah di-deploy) · Saklar: belum ada di `RUMAH` pintu

Worker ini **menjalankan kode GAS BUPR yang asli** di atas cermin Supabase (keputusan Gabriel 14 Nov 2026, `docs/KEPUTUSAN.md`). Logika bisnisnya tidak ditulis ulang: yang diganti hanya "lantainya", dari Google Sheets ke Supabase. Karena kodenya sama, jawabannya 1:1 dengan GAS.

```
PWA / web ──POST {token, action, op_id, data}──▶ abadiops-kmbbupr (Worker)
   ├─ aksi di config/rumah.json kmbbupr.gas.aksi_worker, saklar ≠ gas (atau ?uji=supabase, atau tanpa GAS):
   │     public.cermin_baca('kmbbupr')  ──▶  kode GAS BUPR asli (gas/gas-kamar.js)  ──▶  jawaban JSON GAS
   └─ aksi lain ──▶ web app GAS BUPR (/exec), bila lingkungan ini punya GAS_URL
```

## Isi

| Berkas | Isinya |
|---|---|
| `src/index.js` | Rute API, pilihan jalur (Worker atau GAS), dan penolakan "gagal tertutup" |
| `gas/gas-kamar.js` | Kode GAS BUPR yang dibungkus. **Tidak ada di repo** (repo publik); dibuat ulang sebelum deploy |
| `../bersama/gas-layanan.js` | Layanan Google tiruan (`SpreadsheetApp`, `Date` berzona skrip, `Utilities`, …), dipakai juga `tools/kembar` |
| `../bersama/gas-host.js` | Hash, UUID, dan base64 sinkron untuk `Utilities` (butuh `nodejs_compat`) |
| `../bersama/saklar.js` | Posisi saklar dari SaklarDO pintu lewat ikatan `PINTU` |
| `../../db/bersama/cermin_baca.sql` | RPC isi cermin per sheet; hanya `service_role` yang boleh memanggil |

## Deploy staging

```
node tools/kembar/bundel-gas.mjs --kamar=kmbbupr     # clone versi yang dipatok di config/rumah.json, lalu bungkus
wrangler deploy --env staging                        # dari workers/kmbbupr
```

Rahasia `SUPABASE_SERVICE_ROLE_KEY` (kunci rahasia Supabase Gedung 2) dipasang dengan `wrangler secret put --env staging`.

Mengganti versi GAS: ubah `kmbbupr.gas.versi` di `config/rumah.json`, buat ulang bundel, jalankan uji kembar, lalu deploy.

## Gagal tertutup

Worker tidak pernah mengirim jawaban yang mungkin salah. Aksi di `aksi_worker` dijawab dengan galat bila kode GAS:

- membaca sheet yang tidak dimuat (`gas.sheet_tidak_dimuat`, misalnya `ProcessedOps`) atau tidak dicermin (`AuditLogs`);
- mencoba menulis (jalur tulis belum dipindah);
- melempar galat di luar `doPost`, atau cermin tidak terbaca.

## Uji kembar

Pembandingnya `tools/kembar/gas-lokal.mjs`: kode GAS yang sama dijalankan di komputer kerja di atas cermin yang sama, dalam mode ketat dan zona mesin UTC seperti Worker. 14 Nov 2026: 66 dari 66 jawaban Worker staging identik dengan GAS lokal (11 aksi × 6 orang).

## Belum

- Jalur tulis (buat WO, kirim kerja, approve, transfer). Kode GAS-nya sudah ikut di bundel; yang belum adalah `SpreadsheetApp` yang menulis ke Supabase dengan kunci dan dedup `op_id`.
- `get_vapid_key` dan notifikasi push memakai Script Properties dan `UrlFetchApp`, jadi tetap di GAS.
- `kmbbupr` belum ada di `RUMAH` pintu, sehingga panel saklar belum menampilkannya.
- Cermin `kmbbupr` di Gedung 2 adalah salinan sekali (14 Nov 01.28 WIB), bukan sinkron tiap jam.
