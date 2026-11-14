# Rumah KMB Projek BUPR: Worker `abadiops-kmbbupr`

Rumah: `kmbbupr` · Tahap: staging saja (produksi belum pernah di-deploy) · Saklar: ada di `RUMAH` pintu staging

Worker ini **menjalankan kode GAS BUPR yang asli** di atas cermin Supabase (keputusan Gabriel 14 Nov 2026, `docs/KEPUTUSAN.md`). Logika bisnisnya tidak ditulis ulang: yang diganti hanya "lantainya", dari Google Sheets ke Supabase. Karena kodenya sama, jawabannya 1:1 dengan GAS.

```
PWA / web ──POST {token, action, op_id, data}──▶ abadiops-kmbbupr (Worker)
   ├─ aksi di config/rumah.json kmbbupr.gas.aksi_worker, saklar ≠ gas (atau ?uji=supabase, atau tanpa GAS):
   │     public.cermin_baca('kmbbupr')  ──▶  kode GAS BUPR asli (gas/gas-kamar.js)  ──▶  jawaban JSON GAS
   └─ aksi lain ──▶ web app GAS BUPR (/exec), bila lingkungan ini punya GAS_URL
```

## Mencoba dari HP (staging)

Buka pintu staging (`abadiops-pintu-staging…/`), masukkan token BUPR, lalu pilih **Aplikasi**. Atau langsung buka Worker staging di akarnya. PWA-nya `pwa/kmbbupr`: salinan 1:1 `kawanabadigrup/PWA-Project-KMB2` (`ba4d81d`); hanya alamat API (`app.js` `CONFIG.API_URL`, `sw.js` `API_URL`) yang diganti `./api`. Datanya cermin `kmbbupr` di Gedung 2 (salinan produksi), jadi apa pun yang dilakukan di sini tidak menyentuh spreadsheet produksi. **Web Biasa** masih menampilkan pemberitahuan sampai MAR Web asli dipindah.

Pintu staging mengenali token BUPR lewat GAS tiruan, yang meneruskan `/kmbbupr` ke Worker ini (ikatan `RUMAH_KMBBUPR`). Kamar "GAS asli di Worker" tidak ditanya ke fungsi ping Supabase.

## Isi

| Berkas | Isinya |
|---|---|
| `src/index.js` | Rute API (`./api`), file PWA, `/web` sementara, pilihan jalur (Worker atau GAS), dan penolakan "gagal tertutup" |
| `../../pwa/kmbbupr/` | PWA BUPR (salinan 1:1, hanya alamat API diganti) |
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

Worker tidak pernah mengirim jawaban yang mungkin salah. Aksinya dijawab dengan galat bila kode GAS:

- membaca sheet yang tidak dimuat (`gas.sheet_tidak_dimuat` untuk aksi baca, misalnya `ProcessedOps`) atau tidak dicermin;
- memakai baris sheet jarang yang tidak dimuat (`tidak_aman`);
- menulis pada aksi baca (tulisan hanya disimpan lewat `aksi_tulis_worker`), atau membuat sheet baru;
- melempar galat di luar `doPost`, cermin tidak terbaca, atau penyimpanan gagal karena alasan selain konflik.

## Jalur tulis

Aksi di `gas.aksi_tulis_worker` (buat WO, kirim kerja, approve L1/L2, override, tolak, kembalikan, batal, transfer) juga dijalankan kode GAS asli. Tulisannya (`setValues`, `appendRow`, `deleteRow`, …) dikumpulkan di memori, lalu disimpan ke cermin dalam **satu transaksi** lewat `public.cermin_tulis` (`db/bersama/cermin_tulis.sql`, `../bersama/gas-simpan.js`).

- **Hanya bila Supabase sumber datanya:** saklar `supabase`, atau lingkungan tanpa GAS (staging). `?uji=supabase` tidak berlaku untuk tulis, karena cermin yang masih disinkron dari spreadsheet akan tertimpa.
- **Pengganti LockService: konkurensi optimistis.** Setiap sheet dibaca bersama versinya (`sinkron_at`). Bila sheet yang ditulis sudah diubah penulis lain, tidak ada yang disimpan (`KONFLIK`, HTTP 409); Worker membaca ulang dan menjalankan ulang GAS, paling banyak 3 kali. Sesudah itu PWA mendapat jawaban "Sistem sedang ramai", sama dengan GAS saat kuncinya penuh, dan mengantre ulang.
- **Dedup `op_id` tetap milik GAS** (ProcessedOps). Untuk aksi tulis, ProcessedOps dimuat **jarang** (`gas.sheet_jarang_tulis`): hanya baris milik `op_id` kiriman ini dan jumlah barisnya, karena GAS hanya mencari op_id itu lalu menambah satu baris. Bacaan lain atas baris yang tidak dimuat ditolak.
- Jawaban GAS hanya dikirim bila tulisannya benar-benar tersimpan.

Uji 14 Nov 2026 (staging, dari data awal yang sama dengan GAS lokal sesi):

- skenario 13 langkah: buat WO, kirim kerja, approve L1/L2, WO mandiri (langsung L2, jejak `lewati_mandiri`), kiriman ulang `op_id`, penolakan, dan pembatalan. Jawaban 13 dari 13 identik, dan isi akhir ke-24 sheet identik;
- tabrakan: 2 dan 4 kiriman bersamaan semuanya tersimpan (sebagian pada percobaan ke-2 atau ke-3) atau dijawab "ramai"; kiriman yang sama 3 kali bersamaan dijalankan tepat sekali (1 baris ProcessedOps, 1 audit).

Data staging BUPR dikembalikan ke isi spreadsheet dengan `node tools/cermin/sinkron.mjs --skema=kmbbupr --lewati=` (spreadsheet hanya dibaca).

## Uji kembar

Pembandingnya `tools/kembar/gas-lokal.mjs`: kode GAS yang sama dijalankan di komputer kerja di atas cermin yang sama, dalam mode ketat dan zona mesin UTC seperti Worker. 14 Nov 2026: 66 dari 66 jawaban baca Worker staging identik dengan GAS lokal (11 aksi × 6 orang).

## Belum

- Pemicu terjadwal GAS (pemangkas ProcessedOps dan KirimanWeb pukul 02.00, penjaga pukul 06.00 dan 18.00) belum berjalan di sisi Worker. Butuh cron Worker sebelum saklar produksi.
- `get_vapid_key` dan notifikasi push memakai Script Properties dan `UrlFetchApp`, jadi tetap di GAS. Di jalur tulis Worker, push ke HP approver tidak terkirim.
- `AuditLogs` dimuat utuh untuk aksi tulis (GAS memeriksa `id` kembar di seluruh sheet). BUPR masih 43 baris; rumah dengan AuditLogs besar butuh cara lain.
- `kmbbupr` belum ada di `RUMAH` pintu, sehingga panel saklar belum menampilkannya.
- Cermin `kmbbupr` di Gedung 2 adalah salinan sekali (14 Nov 01.28 WIB), bukan sinkron tiap jam.
