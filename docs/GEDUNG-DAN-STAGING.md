# Gedung, kamar, dan panggung latihan (staging)

Berlaku untuk semua orang dan semua AI di repo ini. Ditulis 30 Okt 2026 atas permintaan Gabriel, karena konsep ini belum dipahami sama. Contohnya: 29 Okt dibuat project Supabase terpisah khusus untuk SUM.

**Baca dokumen ini sebelum menyentuh Supabase, staging, panel saklar, atau rumah baru.**

> **Keadaan terbaru 14 Nov 2026 (keputusan Gabriel; `docs/SAKLAR.md`, `docs/KEPUTUSAN.md`) — mengalahkan uraian Gedung 2 di bawah:**
> - **Gedung 2 tidak dipakai lagi.** Proyek "Stagging" dipindah ke organisasi Supabase gratis terpisah ("kawanabadigrup staging") dan dibiarkan apa adanya.
> - **Uji dilakukan di Gedung 1** (paket Pro, mesin Micro, disk 8 GB; batas 500 MB tidak berlaku lagi) pada **ruang uji**: skema salinan `uji_<skema>` yang disegarkan dengan `SELECT public.cermin_salin_ke_uji('<skema>')` (`db/bersama/ruang_uji.sql`).
> - **Cermin asli terkunci di database:** `cermin_tulis` menolak skema asli (`TERKUNCI`, HTTP 423) sampai tombol mulai migrasi rumah itu membuka izin; `uji_*` selalu boleh ditulis.
> - **Worker `abadiops-*-staging` = Worker uji:** `SUPABASE_URL` Gedung 1, `SKEMA_AWALAN = "uji_"`, dan kunci rahasia khusus `worker_uji` (bisa dicabut tanpa mengganggu produksi).
> - Uraian Gedung 2 di bawah adalah sejarah (30 Okt–14 Nov).

## Versi singkat

- **Gedung** = satu project Supabase.
- **Kamar** = satu skema di dalam gedung.
- **Rumah** (SUM, KMB TRA, KMB Project, nanti KMB BUPR) = **satu kamar, bukan satu gedung.**
- Paket gratis Supabase hanya mengizinkan **2 gedung aktif**, tapi satu gedung boleh berisi kamar sebanyak apa pun.
- Kita memakai tepat dua gedung:
  - 🏢 **Gedung 1, produksi:** semua rumah, masing-masing di kamarnya sendiri.
  - 🏢 **Gedung 2, staging (panggung latihan):** bentuknya sama dengan Gedung 1, dipakai untuk mencoba hal yang berisiko.
- **Semua yang berisiko dicoba dulu di staging. Setelah lulus, baru dipasang di produksi.** Ibaratnya gladi resik: kalau ada yang salah saat latihan, data mekanik sungguhan tidak kena.

## 1. Gedung dan kamar

| | Gedung 1 (produksi) | Gedung 2 (staging) |
|---|---|---|
| Project Supabase | `sptgqsjgszwbreikxdph`, Singapura | `dnnqrslftndcbmnvuveb`, Singapura (sejak 30 Okt; sebelumnya project SUM terpisah) |
| Kamar (skema) | `sum`, `kmb` (KMB TRA), `kmb_projek`, dan rumah baru nanti | sama persis, dibuat dari file SQL yang sama di `db/` |
| Dipakai oleh | Worker produksi: `abadiops-pintu`, `abadiops-sum`, `abadiops-kmb`, `abadiops-porject-kmb` | Worker staging (§2) |
| Isinya | cermin spreadsheet asli, dan nanti WO baru | data uji, atau cadangan produksi yang dipulihkan (§2, "Data di staging") |

**Aturan**
1. **Rumah baru = kamar baru, bukan gedung baru.** Untuk rumah baru, buat folder `db/<rumah>/`, lalu jalankan SQL-nya di Gedung 1 dan Gedung 2. Jangan membuat project Supabase baru untuk rumah mana pun.
2. **Kamar tidak saling mengintip.**
   - RPC sebuah rumah hanya membaca skema rumahnya sendiri.
   - Token dicek ke `api_tokens` milik rumah itu sendiri.
   - Tidak ada RPC yang bisa dipanggil tanpa token (bug #13, #22). Skema tidak dibuka langsung ke `anon`; satu-satunya pintu masuk adalah RPC bertoken.
3. **Isi Gedung 1 dan Gedung 2 tidak pernah bercampur.**
   - Setiap gedung punya kuncinya sendiri: alamat, *publishable key*, *secret key*, dan kata sandi database.
   - Kunci publik ada di `wrangler.toml`. Kunci rahasia hanya di *secret*.
   - Worker produksi tidak pernah memakai kunci staging, dan sebaliknya.
4. **Gedung ketiga berarti pembayaran**, jadi itu titik henti: tanya Gabriel dulu. Sebagai gambaran, paket Pro sekitar $25/bulan dan setiap project tambahan sekitar +$10/bulan. Alasan yang sah untuk Pro adalah ukuran database atau cadangan, **bukan** jumlah rumah (`docs/KEPUTUSAN.md`, baris "Biaya").
5. **Awasi ukuran database.** Paket gratis memberi 500 MB per gedung, dan jatah itu dipakai bersama oleh semua rumah. Kalau mendekati 400 MB, lapor ke Gabriel (keputusan Biaya 29 Okt).
6. **Gedung tidak boleh menganggur 7 hari.** Paket gratis menjeda gedung yang 7 hari tanpa aktivitas. Gedung 1 sempat dijeda karena itu (ketahuan 13 Nov 2026), sebab selama saklar `gas` tidak ada yang memanggilnya.
   - Worker `abadiops-penjaga` (`workers/penjaga/`) mengetuk kedua gedung tiap 6 jam. Untuk cek manual: `https://abadiops-penjaga.kawanabadigrup.workers.dev/cek`.
   - Penjaga satu-satunya Worker yang memegang alamat kedua gedung sekaligus. Ia hanya memanggil `sum_ping` dengan token palsu, jadi aturan 3 tidak dilanggar.
   - Gedung baru: tambahkan ke `GEDUNG` di `workers/penjaga/wrangler.toml`.
   - Penjaga tidak bisa membangunkan gedung yang sudah dijeda. Gedung seperti itu dipulihkan dari dasbor Supabase (Restore project).

**Selesai ditangani (30 Okt 2026):** Project `dnnqrslftndcbmnvuveb` telah resmi dialihfungsikan menjadi **Gedung 2 (Staging)** lengkap dengan 3 skema (`sum`, `kmb`, `kmb_projek`) dan Worker GAS Tiruan (`workers/gas-tiruan/`). Skema SUM produksi telah disatukan di Gedung 1 bersama `kmb` dan `kmb_projek`. Jatah 2 gedung gratis tetap terjaga (0 rupiah).

## 2. Staging (panggung latihan)

**Apa itu staging:** salinan sistem lengkap, yaitu pintu, ketiga rumah, dan panel saklar.
- Kode dan bentuknya sama dengan produksi.
- Alamat, database (Gedung 2), saklar, dan GAS-nya milik sendiri (GAS tiruan, di bawah).
- Mekanik tidak pernah memakainya.

### Alamat

| | Produksi | Staging |
|---|---|---|
| Pintu + panel saklar | `abadiops.com` | `staging.abadiops.com` |
| SUM | `sum.abadiops.com` | `staging-sum.abadiops.com` |
| KMB TRA | `kmbtra.abadiops.com` | `staging-kmbtra.abadiops.com` |
| KMB Project | `kmbprojek.abadiops.com` | `staging-kmbprojek.abadiops.com` |

**Keadaan 30 Okt sore:** alamat staging di atas belum dipasang. Staging sementara hanya ada di `abadiops-<…>-staging.kawanabadigrup.workers.dev`, dan pintu staging masih mengarah ke alamat yang belum ada (bug #28).

### Cara membuat Worker staging

Kodenya sama dengan produksi; yang berbeda hanya konfigurasi. Tambahkan blok `[env.staging]` di `wrangler.toml` setiap Worker, berisi:
- nama Worker sendiri;
- domain staging;
- `SUPABASE_URL` dan kunci Gedung 2;
- `GAS_URL` = GAS tiruan;
- untuk pintu: daftar `RUMAH` yang menunjuk ke alamat staging.

Deploy dengan `npx wrangler deploy --env staging`. Saklar staging disimpan di Durable Object milik pintu staging, terpisah dari saklar produksi.

### GAS di staging: GAS tiruan, bukan GAS produksi

- **Staging tidak boleh meneruskan aksi apa pun ke GAS produksi.**
  - Kalau aksi tulis dari staging sampai ke GAS produksi, itu sama dengan menulis ke spreadsheet asli (garis merah, `AGENTS.md` §5).
  - Akibatnya bisa muncul WO, approval, atau poin palsu di payroll mekanik sungguhan.
  - Aturan ini turunan dari garis merah, bukan keputusan baru.
- **Gantinya: GAS tiruan.** Ini Worker kecil khusus staging (`workers/gas-tiruan/`) yang menjawab dengan bentuk yang sama seperti GAS.
  - **Aksi baca:** dijawab dari cermin di Gedung 2, atau dari rekaman jawaban GAS produksi. Rekaman diambil dengan token uji, hanya untuk aksi baca.
  - **Aksi tulis:** diterima dan disimpan di penyimpanan GAS tiruan sendiri (30 Okt: belum disimpan, nomor WO masih acak; bug #28). ID dan nomor WO-nya memakai format GAS, supaya latihan saklar bisa membuktikan nomor WO dari GAS tidak pernah kembar dengan nomor WO Supabase (4 angka).
- Ada cara yang lebih mirip aslinya, yaitu salinan spreadsheet ditambah salinan script GAS yang di-deploy khusus staging. Tapi itu deployment GAS baru (garis merah), jadi hanya boleh kalau Gabriel mengizinkan.

### Data di staging

- **Sumber isi kamar staging:**
  - data uji buatan;
  - cadangan produksi yang dipulihkan (uji pulih, §5 langkah 3);
  - sinkron cermin dari spreadsheet produksi ke Gedung 2. Sinkron ini hanya membaca spreadsheet, lewat akun layanan dengan hak Viewer.
- Kalau staging berisi data asli (nama, email, token mekanik), jaga sama rahasianya dengan produksi:
  - kuncinya disimpan di *secret*;
  - alamatnya tidak dibagikan ke mekanik;
  - log tidak memuat data.
- **Login dan kiriman di staging hanya memakai token uji.** Jangan pernah masuk ke staging dengan token mekanik asli.
- Staging tidak mengirim notifikasi (email, push, WA) ke orang sungguhan.
- **Data hanya mengalir dari produksi ke staging, tidak pernah sebaliknya.**

### Yang wajib dilatih di staging sebelum sampai ke produksi

| Latihan | Acuan | Lulus kalau |
|---|---|---|
| Masuk lewat pintu sampai dashboard tiap rumah | SERAH-TERIMA §5 langkah 4 | ketiga rumah tampil tanpa layar token |
| Uji pulih cadangan | langkah 3 | jumlah baris setiap tabel sama dengan sumbernya |
| Jalur tulis WO baru, dengan **uji rekam-putar** | langkah 7 | hasil jalur Supabase sama dengan hasil GAS, kolom per kolom |
| Panel saklar: peringatan, kata sandi, mundur cepat | langkah 8, `docs/SAKLAR.md` | semua fungsi panel jalan di staging |
| **Latihan saklar balik**: nyala → mati → nyala | `docs/SAKLAR.md` | tanpa nomor WO kembar, tanpa kiriman ganda, tanpa data rusak atau hilang |

**Uji rekam-putar** dilakukan dalam tiga langkah:
1. Rekam kiriman nyata yang diteruskan ke GAS produksi, beserta hasilnya di cermin.
2. Putar ulang kiriman yang sama di staging lewat jalur Supabase.
3. Bandingkan hasilnya kolom per kolom.

Token di rekaman diganti token uji, dan rekaman tidak pernah masuk repo.

## 3. Urutan untuk perubahan yang berisiko

Perubahan berisiko adalah perubahan yang menyentuh saklar, aksi tulis, cadangan, skema database yang mengubah atau menghapus, atau antrean kiriman. Urutannya:

1. Kerjakan di repo, lalu uji lokal (`wrangler dev`, skrip uji seperti `scripts/uji-serahan-token.mjs`).
2. Deploy ke staging (`--env staging`), latih, lalu catat hasilnya di `docs/PROGRES.md`.
3. Baru deploy ke produksi, lalu pantau.

**Selama staging belum ada:** perubahan ke produksi hanya boleh yang lulus uji lokal **dan** tidak menyentuh hal-hal berisiko di atas. Yang berisiko menunggu staging.

## 4. Jangan

- Jangan mencoba hal berisiko langsung di produksi: saklar, aksi tulis Supabase, pemulihan cadangan, atau migrasi skema yang mengubah atau menghapus.
- Jangan membuat project Supabase (gedung) baru tanpa Gabriel.
- Jangan menyambungkan Worker staging ke GAS produksi, atau Worker produksi ke Gedung 2.
- Jangan memulihkan cadangan ke Gedung 1 kecuali dalam keadaan darurat yang diputuskan Gabriel. Pemulihan menimpa data produksi (titik henti: menghapus data produksi).
- Jangan memindahkan data dari staging ke produksi.
