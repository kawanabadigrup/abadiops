# Saklar migrasi per rumah

Setiap rumah (`kmbbupr`, `kmbprojek`, `kmbtra`, `sum`) punya satu saklar. Posisi bawaannya **`gas`**.

> **Rancangan 14 Nov 2026 (keputusan Gabriel)** menggantikan rancangan `dua_cabang` 29 Okt, yang menyelesaikan WO lama di GAS sambil melahirkan WO baru di Supabase. Alasannya ada di `docs/KEPUTUSAN.md` (14 Nov). Singkatnya, jalur Supabase menjalankan kode GAS asli di atas data yang sama, jadi WO yang sedang berjalan bisa langsung dilanjutkan tanpa GAS. Sebaliknya, dua penulis pada sheet yang sama merusak cermin per baris.

## Dua tonggak

1. **Tonggak 1, mulai mirroring** (berjalan sejak 13 Nov):
   - GAS satu-satunya penulis.
   - Spreadsheet disalin ke Supabase Gedung 1 tiap jam.
   - Selisih diperiksa penuh tiap malam (`.github/workflows/cermin.yml`; hasilnya di `<skema>.cermin_meta` dan `<skema>.cermin_log`).
2. **Tonggak 2, mulai migrasi** (tombol per rumah di panel):
   - GAS rumah itu ditutup penuh, dan Supabase menjadi satu-satunya penulis.
   - Semua WO, termasuk yang masih pending mekanik/L1/L2, dilanjutkan di abadiops dari status terakhirnya, dengan aturan dan rumus yang sama.

## Posisi saklar

| Posisi | Penulis | GAS web dan API | PWA dan web abadiops | Arah cermin |
|---|---|---|---|---|
| `gas` (bawaan) | GAS | normal | diteruskan ke GAS | spreadsheet → Supabase |
| `menutup` (beberapa menit) | tidak ada | ditutup | menunggu; HP mengantre kiriman | sinkron terakhir, lalu periksa selisih |
| `supabase` | Supabase | ditutup, mengarahkan ke abadiops | kode GAS asli di Worker | Supabase → spreadsheet (cermin balik) |
| `membuka` (beberapa menit) | tidak ada | ditutup | menunggu; HP mengantre kiriman | cermin balik terakhir, lalu periksa selisih |

- `menutup` dan `membuka` adalah posisi peralihan yang dipasang tombol, bukan pilihan manual.
- GAS atau Worker yang gagal membaca saklar **tidak menulis apa pun**, dan meminta pengguna mencoba lagi sebentar lagi. Menolak sebentar lebih aman daripada dua penulis.
- "GAS ditutup" berarti semua aksi ditolak dengan pesan dan link ke abadiops (login dengan token). Ini termasuk buat WO, approve, override, unduh payroll, dan laporan. Setelah jam mulai, data GAS sudah tidak lengkap, jadi laporan dari GAS akan salah.

## Mulai migrasi (`gas` → `supabase`)

Tombol mulai hanya aktif kalau **kesehatan cermin** rumah itu hijau:
- tidak ada selisih selama 7 hari berturut-turut (`hari_tanpa_selisih` ≥ 7);
- sinkron terakhir berhasil, kurang dari 2 jam lalu;
- semua syarat di bawah sudah tercentang.

Yang dikerjakan tombol secara otomatis:
1. Mencatat jam mulai dalam waktu setempat rumah itu (SUM WITA, lainnya WIB) dan menyimpannya sebagai waktu mutlak.
2. Saklar → `menutup`. GAS dan Worker menolak tulis, dan HP mengantre kiriman.
3. Mengambil cadangan database, lalu menjalankan sinkron terakhir dan pemeriksaan selisih penuh.
4. Hasilnya menentukan langkah berikut:
   - **Selisih 0:** saklar → `supabase`. Pemicu terjadwal GAS berhenti dan dijalankan Worker, cermin balik mulai, dan antrean HP terkirim ke Supabase.
   - **Selisih bukan 0:** saklar kembali ke `gas`. Tidak ada yang hilang, karena belum ada yang ditulis di Supabase. Panel menampilkan sheet yang berbeda.

**Urutan rumah** belum diputuskan. Keputusan 29 Okt: serentak. Usulan 14 Nov: bertahap, BUPR → KMB Projek → KMB V2 → SUM, masing-masing dengan jam mulai sendiri. Menunggu keputusan Gabriel.

## Jaring pengaman: kembali ke GAS (`supabase` → `gas`)

Tujuannya: GAS dan PWA kembali beroperasi persis seperti sebelum migrasi, lengkap dengan semua yang sudah dikerjakan di abadiops.
- **Cermin balik.** Setelah jam mulai, cermin balik menyalin perubahan Supabase ke spreadsheet tiap beberapa menit. Bentuk datanya sama (baris dan kolom sheet) dan hanya ada satu penulis, jadi spreadsheet selalu hampir sama dengan Supabase.
- **Tombol "Kembali ke GAS".** Cukup satu konfirmasi, tanpa daftar syarat. Urutannya:
  1. saklar → `membuka`;
  2. cermin balik terakhir, lalu periksa selisih;
  3. saklar → `gas`.

  Setelah itu GAS terbuka lagi, pemicunya hidup lagi, PWA kembali diteruskan ke GAS, dan cermin kembali ke arah spreadsheet → Supabase.
- **Lapisan cadangan lain:** cadangan harian Supabase Pro (7 hari), cadangan database sesaat sebelum mulai, dan riwayat versi Google Sheets.
- **Spreadsheet hanya ditulis setelah jam mulai**, dan hanya oleh cermin balik atau tombol kembali (izin Gabriel 14 Nov). Sebelum itu spreadsheet tetap tidak ditulis.
- **Dilatih lebih dulu.** Tombol mulai dan tombol kembali dilatih di salinan spreadsheet sebelum jam mulai rumah mana pun.
- **Kapan dipakai:**
  - Supabase mati sebentar: jangan kembali dulu. Antrean di HP menampung kiriman dan mengirim ulang otomatis.
  - Supabase mati lama atau ada bug di jalur Supabase: kembali ke GAS, perbaiki, lalu mulai lagi dari tombol mulai.

## Ruang uji (keputusan Gabriel 14 Nov)

- Pengujian dilakukan di Gedung 1 (produksi, paket Pro), di skema salinan `uji_<skema>` yang disegarkan dari cermin dengan SQL. Ukuran, mesin, dan isinya sama dengan produksi.
- Skema cermin asli **tidak pernah ditulis sebelum jam mulai** rumah itu. Itu dijaga di database: penulisan ke skema asli ditolak kecuali saklar rumah itu `supabase`.
- Worker `abadiops-*-staging` menjadi Worker uji yang membaca dan menulis skema `uji_*`.
- Gedung 2 (proyek "Stagging") tidak dipakai lagi.

## Syarat sebelum tombol mulai aktif

- [ ] Kesehatan cermin hijau (lihat di atas).
- [ ] Semua aksi baca, aksi tulis, dan halaman web rumah itu lulus uji kembar di ruang uji: hasil Worker sama dengan GAS, kolom per kolom.
- [ ] Fitur yang memakai layanan Google sudah punya pengganti dan lulus uji: unduh payroll (`DriveApp`), pemicu terjadwal, email (`MailApp`), dan panggilan keluar (`UrlFetchApp`).
- [ ] Payroll dari Supabase sama dengan payroll GAS untuk bulan-bulan sebelumnya.
- [ ] `AuditLogs` dan `ProcessedOps` ikut tercermin.
- [ ] Tambalan "tutup GAS" terpasang di GAS rumah itu. Tambalan ini tidur selama saklar `gas`.
- [ ] Worker produksi sudah memakai kode GAS asli dan di-deploy ulang setelah upgrade Workers Paid. Worker yang di-deploy saat paket gratis tetap memakai batas CPU lama sampai di-deploy ulang (BUG-DICATAT #40).
- [ ] Latihan mulai dan kembali sudah dilakukan di salinan spreadsheet, tanpa data hilang dan tanpa kiriman ganda.
- [ ] Gabriel sudah menguji sendiri satu siklus WO penuh di ruang uji.
- [ ] Gabriel menyetujui.

## Panel saklar di `abadiops.com` (keputusan Gabriel, 29 Okt 2026)

Saklar dioperasikan dari **satu panel visual di domain pintu**. Daftar kamar dan profilnya ada di `config/rumah.json`, dan kamar yang aktif per lingkungan diatur `RUMAH` di `workers/pintu/wrangler.toml`. Panel membangun tab, pilihan, section, dan peran dari daftar itu. Kode lama: `kmbtra` dulu `kmb`, `kmbprojek` dulu `kmb-projek`.

**Letak dan akses**
- Panel ada di alamat `abadiops.com` yang **tidak ditautkan dari mana pun**. Tujuannya sedikit tersembunyi, bukan untuk keamanan.
- Panel **dilindungi kata sandi**.
  - Kata sandi disimpan sebagai *secret* Worker pintu (`wrangler secret put`), dalam bentuk hash, dan **tidak pernah** masuk repo.
  - Percobaan gagal dibatasi, dan sesi masuk berumur pendek.
- Panel **harus selalu bisa dibuka**, karena ia juga alat penyelamat. Panel dan penyimpanan saklar **hanya bergantung pada Cloudflare**, tidak pada Supabase maupun GAS. Saat Supabase atau GAS bermasalah, panel tetap hidup.

**Tampilan**
- Satu kartu per rumah. Posisi sekarang terlihat jelas lewat warna dan tulisan, beserta waktu dan pelaku perubahan terakhir, jam mulai migrasi (waktu setempat), dan **kesehatan cermin**:
  - sinkron terakhir;
  - hasil pemeriksaan selisih terakhir;
  - hari tanpa selisih;
  - sheet yang berbeda;
  - tombol "Periksa sekarang".
- Setelah jam mulai, kartu juga menampilkan kesehatan cermin balik: perubahan terakhir yang sudah tersalin ke spreadsheet.
- Di bawahnya tampil riwayat perubahan saklar (siapa, kapan, dari → ke, alasan).

**Mulai migrasi selalu dengan peringatan**
- Sebelum mulai, panel menampilkan **peringatan/caution**: apa yang akan berubah, siapa yang terdampak, dan cara kembali.
- Panel menampilkan daftar syarat di atas. Semua syarat harus tercentang.
- Pelaku wajib mengetik nama rumah dan alasannya sebagai konfirmasi.

**Kembali ke GAS = penyelamat**
- Selalu tersedia dan cepat. Cukup satu konfirmasi, tanpa daftar syarat.
- Kembali ke GAS **tidak boleh merusak atau menghilangkan data**. Itu dijamin oleh dua hal: hanya ada satu penulis pada satu waktu, dan cermin balik terakhir harus berselisih 0 sebelum GAS dibuka.

**Teknis**
- Nilai saklar disimpan di **Durable Object SQLite-backed** Cloudflare (`workers/pintu/src/saklar-do.js`). Nilainya berlaku seketika (strongly consistent) di semua lokasi edge Cloudflare.
- Panel visual aktif di rute `/saklar` pada Worker Pintu (`abadiops.com/saklar` dan `abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar`).
- Pintu menulis lewat antarmuka panel. Worker rumah membaca saklar dinamis lewat *service binding* `PINTU`, dengan cache memori 5 detik. Perubahan saklar tidak memerlukan deploy.
  - Kode Worker GAS asli di branch `staging` sudah mengikuti saklar.
  - Worker produksi menyusul saat merge (BUG-DICATAT #27).
- GAS membaca saklar rumahnya sendiri dari pintu, dengan cache singkat. Ini bagian dari tambalan "tutup GAS".
- Setiap perubahan dicatat otomatis, hingga 50 riwayat terakhir, di Durable Object (siapa, kapan, dari → ke, alasan). Saat terjadi pembalikan produksi, catatan itu disalin ke tabel di bawah.

## Catatan pembalikan saklar

| Tanggal dan jam (waktu setempat) | Rumah | Dari → ke | Alasan | Oleh |
|---|---|---|---|---|
| — | — | — | belum pernah dibalik | — |
