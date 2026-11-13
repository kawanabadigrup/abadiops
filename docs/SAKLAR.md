# Saklar "WO baru ke Supabase"

Setiap rumah (`sum`, `kmbtra`, `kmbprojek`) punya satu saklar. Posisi bawaannya **`gas`**, artinya mati.

Tujuan saklar: memindahkan backend tanpa memindahkan WO yang sedang berjalan. WO lama diselesaikan di GAS, WO baru lahir di Supabase.

## Tiga posisi saklar

| Posisi | WO baru dibuat di | Aksi pada WO lama (lahir di GAS) | Aksi pada WO baru (lahir di Supabase) | Daftar, monitoring, payroll dibaca dari |
|---|---|---|---|---|
| `gas` (bawaan) | GAS | GAS | belum ada | GAS, atau cermin kalau aksi baca sudah dipindah |
| `dua_cabang` | **Supabase** | GAS, sampai approved | Supabase | Supabase: WO baru asli + cermin WO lama |
| `supabase` | Supabase | sudah habis | Supabase | Supabase. GAS tidak dipakai lagi |

Urutannya selalu `gas`, lalu `dua_cabang`, lalu `supabase`. Posisi `supabase` baru dipasang setelah semua WO lama habis.

## Satu WO, satu rumah

- Rumah sebuah WO ditentukan saat WO itu lahir, dan tidak pernah berubah.
- Worker mengenali rumah WO dari ID internalnya. WO yang lahir di Supabase memakai awalan ID yang berbeda dari ID buatan GAS.
- WO tidak pernah dipindah dari GAS ke Supabase, atau sebaliknya, di tengah jalan.

## Data hanya mengalir satu arah

Data mengalir dari spreadsheet ke Supabase sebagai cermin, tidak pernah sebaliknya.
- Setiap kali aksi yang diteruskan ke GAS berhasil, Worker langsung menarik WO yang berubah ke cermin.
- Selain itu ada sinkron penuh berkala, ditambah laporan selisih harian. Keduanya jalan di workflow `cermin` (`.github/workflows/cermin.yml`): sinkron tiap jam, dan pemeriksaan selisih penuh sekali sehari mulai 02.00 WIB. Hasilnya di `<skema>.cermin_meta` (`periksa_hasil`, `hari_tanpa_selisih`) dan `<skema>.cermin_log`.
- Halaman web GAS yang dipakai supervisor di laptop menulis langsung ke spreadsheet tanpa lewat Worker. Karena itu sinkron berkala wajib, dan halaman web GAS rumah itu harus ditutup atau dibuat hanya-baca sebelum saklarnya dinyalakan.

## Syarat sebelum saklar sebuah rumah dinyalakan

- [ ] Cermin rumah itu tidak punya selisih dengan spreadsheet selama **7 hari** berturut-turut (`hari_tanpa_selisih` minimal 7 di `<skema>.cermin_meta`).
- [ ] Semua aksi tulis dan halaman web rumah itu sudah dipindah dan **lulus uji rekam-putar** di staging: hasil Worker sama dengan hasil GAS, kolom per kolom.
- [ ] **Buku tamu kiriman** sudah aktif di pintu depan dan disimpan di Cloudflare, bukan di Supabase. Dengan begitu, kiriman yang dikirim ulang tidak tercatat dua kali, ke mesin mana pun.
- [ ] Cermin ikut menyalin `ProcessedOps` dari GAS.
- [ ] Sudah dipastikan **nomor WO tidak bisa kembar** antara GAS dan Supabase: WO Supabase memakai 4 angka (keputusan 29 Okt).
- [ ] Payroll yang dihitung dari Supabase sama dengan payroll GAS untuk bulan-bulan sebelumnya.
- [ ] **Cadangan per jam** (`pg_dump` terenkripsi ke penyimpanan privat gratis) berjalan, dan **uji pulih** ke project staging berhasil. Keputusan 29 Okt: opsi gratis dulu; Pro atau PITR hanya atas keputusan Gabriel.
- [ ] Halaman web GAS rumah itu sudah ditutup atau dibuat hanya-baca.
- [ ] **Latihan saklar balik** sudah dilakukan di staging: nyalakan, matikan, nyalakan lagi, tanpa ada nomor kembar dan tanpa kiriman ganda.
- [ ] **Go-live serentak:** semua syarat ini terpenuhi di **ketiga** rumah sebelum saklar dinyalakan (keputusan 29 Okt).
- [ ] Gabriel menyetujui.

## Saklar balik sebagai lapisan pengaman

Kalau ada masalah, saklar dibalik dari `dua_cabang` kembali ke `gas`.
- Yang dibalik **hanya tempat lahirnya WO baru**. WO yang sudah terlanjur lahir di Supabase tetap tinggal di Supabase.
- **Supabase mati sebentar:** jangan dibalik. Antrean di HP menampung kiriman dan mengirim ulang otomatis.
- **Supabase mati lama (berjam-jam):** balik ke `gas`. Untuk sementara daftar dilayani GAS. WO yang lahir di Supabase menunggu sampai Supabase hidup lagi.
- **Ada bug di jalur Supabase:** balik ke `gas`, perbaiki, lalu nyalakan lagi.
- **Menyalin WO dari Supabase kembali ke spreadsheet hanya jalan terakhir.** Ini prosedur darurat manual yang harus sudah dilatih sebelumnya.
- **GAS harus tetap hidup penuh selama posisi `dua_cabang`.** Fungsi buat WO di GAS tidak dihapus, dan alamat `/exec` tidak berubah.

## Cara saklar disimpan

- Saklar harus bisa dibalik **dalam hitungan detik, tanpa deploy**. Simpan di tempat yang dibaca Worker pada setiap permintaan, misalnya Cloudflare KV, bukan di kode atau di `wrangler.toml`.
- Saklar lama (`BACKEND_DRIVER` di `src/lib/backendConfig.ts`, `STORAGE_MODE` di `wrangler.toml` akar) berlaku untuk seluruh sistem sekaligus dan tidak mendukung `dua_cabang`. Keduanya akan diganti saklar per rumah ini. Sampai saat itu, aksi baca KMB Project tetap ke GAS lewat gerbang `AKSI_SUPABASE_LULUS_KEMBAR`, berapa pun nilai `STORAGE_MODE`.

## Panel saklar di `abadiops.com` (keputusan Gabriel, 29 Okt 2026)

Saklar dioperasikan dari **satu panel visual di domain pintu**. Kode rumah sekarang adalah `sum`, `kmbtra` (dulu `kmb`), dan `kmbprojek` (dulu `kmb-projek`).

**Letak dan akses**
- Panel ada di alamat `abadiops.com` yang **tidak ditautkan dari mana pun**. Tujuannya sedikit tersembunyi, bukan untuk keamanan.
- Panel **dilindungi kata sandi**.
  - Kata sandi disimpan sebagai *secret* Worker pintu (`wrangler secret put`), dalam bentuk hash, dan **tidak pernah** masuk repo.
  - Percobaan gagal dibatasi, dan sesi masuk berumur pendek.
- Panel **harus selalu bisa dibuka**, karena ia juga alat penyelamat. Panel dan penyimpanan saklar **hanya bergantung pada Cloudflare**, tidak pada Supabase maupun GAS. Saat Supabase atau GAS bermasalah, panel tetap hidup.

**Tampilan**
- Satu kartu per rumah, dengan tiga posisi (`gas` → `dua_cabang` → `supabase`). Posisi sekarang terlihat jelas lewat warna dan tulisan, beserta waktu dan pelaku perubahan terakhir.
- Di bawahnya tampil riwayat perubahan saklar (siapa, kapan, dari → ke, alasan).

**Menyalakan (maju) selalu dengan peringatan**
- Sebelum maju, panel menampilkan **peringatan/caution**: apa yang akan berubah, siapa yang terdampak, dan cara membaliknya.
- Panel juga menampilkan daftar "Syarat sebelum saklar sebuah rumah dinyalakan" di atas. Semua syarat harus dicentang.
- Pelaku wajib mengetik nama rumah dan alasannya sebagai konfirmasi.
- Posisi `supabase` hanya bisa dipilih kalau WO lama rumah itu sudah habis.

**Mematikan (mundur) = penyelamat**
- Mundur dari `dua_cabang` ke `gas` selalu tersedia dan cepat. Cukup satu konfirmasi, tanpa daftar syarat, karena ini tombol darurat.
- Mematikan saklar **tidak boleh merusak atau menghilangkan data**. Itu dijamin rancangan di atas:
  - yang dibalik hanya tempat lahirnya WO baru;
  - WO yang sudah lahir di Supabase tetap di Supabase dan bisa diselesaikan di sana;
  - WO lama tetap di GAS;
  - cermin terus berjalan searah;
  - buku tamu kiriman mencegah kiriman ulang tercatat dua kali.
- Worker rumah yang **gagal membaca** saklar memakai posisi `gas`. Itu posisi yang paling aman.

**Teknis**
- Nilai saklar disimpan di **Durable Object SQLite-backed** Cloudflare (`workers/pintu/src/saklar-do.js`): berlaku seketika (strongly consistent, zero latency) di semua lokasi edge Cloudflare dan didukung di paket gratis Cloudflare Workers.
- Panel visual aktif di rute `/saklar` pada Worker Pintu (`abadiops.com/saklar` dan `abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar`).
- Pintu menulis lewat antarmuka panel, Worker rumah membaca secara dinamis via `/api/saklar/status` (dengan in-memory cache 5 detik dan fallback aman ke `gas`). Perubahan saklar tidak memerlukan deploy worker sama sekali.
- Setiap perubahan dicatat otomatis hingga 50 riwayat terakhir di Durable Object (siapa, kapan WIB, dari → ke, alasan), lalu disalin ke tabel "Catatan pembalikan" di bawah saat terjadi pembalikan produksi.
- **Keadaan 30 Okt sore (audit):** Worker rumah baru membaca saklar di `/api/sehat`. Jalur API belum mengikutinya, jadi membalik saklar belum memindahkan apa pun (bug #27). Tanpa secret, panel tertutup (bug #26).

## Target selesai migrasi (keputusan Gabriel, 29 Okt 2026)

Migrasi sebuah rumah dianggap **siap** kalau:
1. **Rencananya matang** dan setiap langkahnya sudah **diuji langsung**: staging, uji kembar, uji rekam-putar, dan latihan saklar balik.
2. **Aman, dengan rencana cadangan dan jaring pengaman:**
   - cadangan Supabase (paket Pro, ditambah keputusan PITR atau cadangan per jam);
   - spreadsheet tetap hidup sebagai sumber dan arsip;
   - cermin berjalan terus;
   - buku tamu kiriman dan antrean di HP mengirim ulang otomatis;
   - GAS tetap hidup penuh selama `dua_cabang`;
   - saklar balik di panel sebagai tombol penyelamat.
3. **Tinggal menyalakan saklar.** Semua syarat di atas tercentang di panel.

**Momen go-live:** saklar rumah itu dinyalakan dari panel, lalu operasi ditunggu dan dipantau. Kalau ada masalah, saklar dimatikan dari panel tanpa ada data yang rusak atau hilang.

## Catatan pembalikan saklar

| Tanggal dan jam (WIB) | Rumah | Dari → ke | Alasan | Oleh |
|---|---|---|---|---|
| — | — | — | belum pernah dibalik | — |
