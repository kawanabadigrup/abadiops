# Uji kembar dan GAS asli di Worker

Alat untuk menjalankan kode GAS ASLI sebuah rumah di luar Google, di atas cermin Supabase (keputusan Gabriel 14 Nov 2026).

| Alat | Gunanya |
|---|---|
| `gas-lokal.mjs` | Menjalankan kode GAS rumah di komputer kerja sebagai pembanding uji kembar. Tidak memanggil `/exec`, tidak memakai token di Google, dan tidak menulis ke spreadsheet. Kondisinya sama dengan Worker: mode ketat dan zona mesin UTC |
| `templat-gas.mjs` | Mengompilasi template HtmlService (`<? ?>`, `<?= ?>`, `<?!= ?>`) menjadi fungsi JS biasa tanpa `eval`/`with`, dengan escaping `<?= ?>` menurut konteks. Dipakai bundel Worker dan GAS lokal (`web()`, `jalankan()`) |
| `bundel-gas.mjs` | Membungkus kode GAS versi yang dipatok di `config/rumah.json` menjadi `workers/<kamar>/gas/gas-kamar.js` untuk Worker rumah. Hasilnya tidak di-commit |
| `analisis-gas.mjs` | `fungsiPublik` (fungsi global GAS yang bisa dipanggil `google.script.run`: semua yang tidak **diakhiri** `_`, termasuk yang **diawali** `_`) dan `pemanggilGoogleScriptRun` (fungsi yang benar-benar dipanggil halaman). Dipakai daftar izin MAR Web Worker dan alat tambal |
| `tambal-penjaga.mjs` | Memasang penjaga `google.script.run` di salinan kode GAS (BUG-DICATAT #37): titik masuk sah ditandai, fungsi publik lain menolak panggilan langsung. Hanya mengubah folder salinan; push ke Google dikerjakan terpisah |
| `cek-cakupan-penjaga.mjs` | Mencocokkan kode tertambal dengan daftar `functionNames` yang dicantumkan GAS sendiri di halaman `/exec`. Harus 0 celah sebelum dan sesudah deploy |

Semuanya memakai layanan Google tiruan yang sama dengan Worker (`workers/bersama/gas-layanan.js`) dan data yang sama (`public.cermin_baca`, `db/bersama/cermin_baca.sql`).

## Mengambil kode GAS

Kode GAS diambil dengan `clasp clone <scriptId> [versi]` ke folder **di luar repo**, karena repo ini publik. Alat di sini tidak pernah menjalankan `clasp push` atau `clasp deploy`.

## Penjaga `google.script.run` (sejak 14 Nov 2026)

Keempat GAS produksi memakai penjaga (`_PenjagaRun.js`). **Fungsi publik baru tidak otomatis dijaga.** Setiap kali kode GAS berubah:

1. `clasp pull` (atau clone) dulu. Salinan lokal lama belum berisi penjaga, dan push dari situ menghapusnya.
2. Sunting, lalu jalankan `node tools/kembar/tambal-penjaga.mjs --gas=<folder>`. Alatnya idempoten: fungsi yang sudah bertanda dilewati. Fungsi yang dipanggil saat script dimuat dikecualikan otomatis dan disebut di keluarannya; periksa bahwa itu memang bukan fungsi data.
3. Fungsi baru yang dipanggil halaman lewat `google.script.run` otomatis menjadi titik masuk, asalkan namanya muncul di HTML (`google.script.run.namaFungsi(…)` atau teks `'namaFungsi'`).
4. Sesudah deploy, unduh halaman `/exec` dan jalankan `cek-cakupan-penjaga.mjs`; hasilnya harus `CELAH 0`.

Jangan `clasp deploy`. Deploy lewat editor (Manage deployments → pensil → New version) sebagai akun yang sama dengan "Execute as" sekarang.

## Yang perlu diketahui saat menambah rumah

- **Urutan muat.** GAS menjalankan berkas menurut urutan proyek, yang tidak ikut di clone. Alat ini mengulang berkas yang gagal dengan `ReferenceError` sampai semuanya termuat. Fungsi yang didefinisikan di dua berkas dengan isi berbeda harus dicek sendiri (BUPR: `formatNumber`, `truncate`, `isTerminalStatus`, dan tidak satu pun dipakai jalur API).
- **Mode ketat.** Worker selalu ketat; GAS longgar. Uji `--ketat` dengan membandingkan jawaban kedua mode (BUPR: 66 dari 66 sama).
- **Zona waktu.** `Date` tiruan membawa zona skrip (`appsscript.json` `timeZone`), karena Worker selalu UTC. Diuji terhadap `Date` Node berzona Asia/Jakarta: 52.754 pembandingan, 0 beda.
- **Aksi baca yang menulis atau membaca sheet besar** tercatat di `catatan.tulis` dan `catatan.baca_dilewati`; Worker menolak menjawabnya.
- **Mode sesi** (`siapkanGasLokal({ sesi: true })`): tulisan setiap panggilan diterapkan ke data di memori (tidak pernah ke database), jadi urutan aksi seperti buat WO → kirim kerja → approve bisa dijalankan dan isi akhirnya dibandingkan dengan Supabase sesudah Worker menulis.
- **Properti objek sheet** harus diisi di konstruktor `Lembar`: Proxy pencatat metode menjawab properti yang belum ada dengan fungsi, bukan `undefined`.
- **op_id uji harus unik per jalankan.** op_id yang sama dengan jalankan sebelumnya dijawab dari ProcessedOps tanpa menulis (dedup GAS bekerja).
