# Catatan Pengembang: Panduan Integrasi KMB V2 & SUM V2 (Untuk Gabriel)

Dokumen ini disusun oleh **Raka** sebagai panduan lengkap bagi **Gabriel** untuk melanjutkan migrasi sistem **KMB V2** dan **SUM V2** ke dalam platform **Abadi Operation** (`abadiops.com`).

---

## 1. Arsitektur Tiga Rumah (`abadiops.com`)

Platform ini menaungi tiga sistem lama yang dipindahkan dari Google Apps Script (GAS) ke **Cloudflare Workers + Supabase (PostgreSQL 17 di Singapura `ap-southeast-1`)**:

| Sistem | Kode Rumah | Pemegang | Frontend Asal (PWA) | Backend Sekarang (GAS) | Skema Supabase |
|---|---|---|---|---|---|
| **KMB V2** | `kmb` | **Gabriel** | `mar-offline` | `AKfycbwlwlQv…` (Spreadsheet `1ehnxDlv…`) | `kmb` |
| **KMB Project** | `kmb-projek` | **Raka** | `mar-projek-offline` | `AKfycbxh4086…` (Spreadsheet `1lnJo74O…`) | `kmb_projek` *(Sudah siap)* |
| **SUM V2** | `sum` | **Gabriel** | `mar-sum-offline` | `AKfycbzB5EUJ…` (Spreadsheet `1qHjfIUT…`) | `sum` |

Setiap rumah memiliki database terisolasi (skema masing-masing) dan frontend PWA masing-masing. Pintu depan bersama (`abadiops.com`) bertugas memeriksa token dan meneruskan permintaan ke rumah yang tepat.

---

## 2. Cara Kerja Login & Penentuan Rumah (Tenant Resolution)

Sistem menggunakan model **Zero-Friction Token** (tidak ada username/password rumit untuk mekanik di lapangan).

### A. Tiga Jenis Peran (Role)
1. **`mechanic`**: Pengguna lapangan utama.
   - Navbar utama disembunyikan.
   - Halaman dikunci langsung ke daftar pekerjaan mekanik (`#mon-subview-mechanic-work`).
   - Filter tab: *Assigned*, *Pending Approval*, dan *Done*.
2. **`supervisor` (L1)**: Pengawas lapangan.
   - Melihat tabel **Mekanik Monitoring (L1 & L2)**, ringkasan 20 mekanik, dan kartu approval L1.
3. **`superintendent` (L2)**: Penanggung jawab site.
   - Melihat monitoring, approval final L2, menu Teknis (Tyre/HM/KM), dan Laporan Payroll.

### B. Alur Autentikasi di Frontend (`patched-app.js`)
1. **Pemeriksaan Awal**:
   Saat halaman dimuat, sistem membaca parameter URL `?token=...` atau dari `localStorage.getItem('kmb_portal_token')`.
   Jika tidak ada token, muncul **Gate Overlay** (layar kunci token).
2. **Resolusi Cepat (Instant UI Paint)**:
   Aplikasi mencari token di memori lokal/cache:
   ```javascript
   const tokenRecord = TOKENS.find(t => (t.token || t.offline_token || '').toLowerCase() === cleanToken.toLowerCase());
   ```
   > ⚠️ **Catatan Penting Bug Tampilan yang Sudah Diperbaiki**:
   > Pastikan `user.role` selalu memiliki fallback aman `'mechanic'`. Jangan biarkan role berisi string kosong `""`, karena fungsi `renderMonitoring()` hanya membuka panel supervisor jika role secara eksplisit adalah `supervisor` atau `superintendent`.
3. **Verifikasi Resmi (`api('ping')`)**:
   Frontend memanggil aksi `ping` ke backend (GAS atau Supabase).
   Backend mengembalikan data resmi:
   ```json
   {
     "success": true,
     "result": {
       "mechanic_id": "VES-012",
       "name": "Gusti Raka Pamungkas",
       "role": "mechanic",
       "email": "ves-012@kmb.local"
     }
   }
   ```
   Data ini langsung memperbarui status profil bar kanan atas (`Gusti Raka Pamungkas [MECHANIC]`).

### C. Logika Penentuan Rumah (Routing)
Aplikasi menentukan rumah mana yang dituju melalui urutan prioritas:
1. **Awalan Token (Token Prefix)**:
   - Jika token berawalan `sum-` atau `sum_` (contoh: `sum-mekanik-01`) → arahkan ke rumah **SUM**.
   - Jika token berawalan `kmb-` → arahkan ke rumah **KMB**.
2. **Parameter URL**:
   - `?system=KMB` atau `?system=SUM`.
3. **Pencocokan Database / Sheet**:
   - Token 20 karakter hex legacy (misal `52fd…` atau `97a4…`) dicocokkan dengan tabel `api_tokens` di skema rumah masing-masing.

---

## 3. Langkah Menambahkan KMB V2 (`kmb`)

Pekerjaan ini dilakukan oleh **Gabriel**. Langkah-langkahnya:

### Langkah 1: Buat Skema Cermin di Supabase
Template SQL cermin yang terbukti berhasil di KMB Project ada di `db/kmb_projek/cermin_sheet.sql`.
1. Salin file tersebut ke `db/kmb/cermin_sheet.sql`.
2. Ganti seluruh kata `kmb_projek` menjadi `kmb`.
3. Jalankan migrasi ke Supabase project `sptgqsjgszwbreikxdph` (region Singapura `ap-southeast-1`):
   - Skema: `kmb`
   - 10 tabel: `config_units`, `config_components`, `config_mechanics`, `config_factors`, `config_rates`, `api_tokens`, `work_orders`, `work_orders_archive`, `tyre_records`, `counter_wo`.

### Langkah 2: Sinkronisasi Snapshot Cermin dari Spreadsheet KMB V2
1. Buat script `scripts/sinkron-kmb-cermin.mjs` (contoh dari `scripts/sinkron-kmb-projek-cermin.mjs`).
2. Masukkan URL GAS KMB V2 (`AKfycbwlwlQv…`) dan token supervisor KMB V2.
3. Jalankan script untuk menarik data dari Spreadsheet `1ehnxDlv…` ke tabel skema `kmb`:
   - Unit & Komponen katalog
   - Daftar mekanik & API Tokens
   - Faktor pengali rate jabatan
   - Work order aktif & riwayat arsip

### Langkah 3: Uji Kembar (*Twin Test*)
1. Gunakan script uji kembar seperti di `scratch/uji-kembar-baca.mjs`.
2. Bandingkan respon JSON dari Supabase skema `kmb` dengan respon JSON dari GAS KMB V2 untuk:
   - `ping` (Supervisor & Mekanik)
   - `pull_create_refs`
   - `pull_monitoring`
3. Hasil JSON harus **100% identik, huruf demi huruf**.

---

## 4. Langkah Menambahkan SUM V2 (`sum`)

Pekerjaan ini juga dipegang oleh **Gabriel**.

### Langkah 1: Cek Inventaris Spesifik SUM V2
- Spreadsheet SUM V2: `1qHjfIUT…` (Script `1k_A_KER…` di `MAR-SUM-v2`).
- Web App GAS SUM V2:
  `https://script.google.com/macros/s/AKfycbzB5EUJlpGRaDTFvfr3bl117hd_Oa2k4seCecTYy4Ct8_oYRefu8U9BqG6zu3M-BoFS/exec`
- Catat apakah ada kolom atau logika yang berbeda di SUM V2 (misal: format nomor WO, daftar komponen, rate uang). Catat di `docs/INVENTARIS-SUM.md`.

### Langkah 2: Buat Skema Cermin `sum`
1. Salin template SQL ke `db/sum/cermin_sheet.sql` dengan skema `sum`.
2. Terapkan ke Supabase.

### Langkah 3: Sinkronisasi Snapshot Cermin & Uji Kembar
1. Buat script `scripts/sinkron-sum-cermin.mjs`.
2. Tarik data snapshot cermin dari spreadsheet SUM V2.
3. Jalankan Uji Kembar (*Twin Test*) untuk memastikan respon Supabase skema `sum` sama persis dengan GAS SUM V2.

---

## 5. Struktur Folder yang Dituju

Sesuai `AGENTS.md` §6, susunan final yang sedang kita bangun bersama:

```text
workers/
  ├── pintu/          (Bersama: router pintu depan abadiops.com)
  ├── kmb/            (Gabriel: proxy & handler backend KMB V2)
  ├── kmb-projek/     (Raka: proxy & handler backend KMB Project)
  └── sum/            (Gabriel: proxy & handler backend SUM V2)

pwa/
  ├── kmb/            (Salinan 1:1 dari PWA mar-offline)
  ├── kmb-projek/     (Salinan 1:1 dari PWA mar-projek-offline)
  └── sum/            (Salinan 1:1 dari PWA mar-sum-offline)

db/
  ├── kmb/            (Skema & migrasi Supabase kmb)
  ├── kmb_projek/     (Skema & migrasi Supabase kmb_projek - SELESAI)
  └── sum/            (Skema & migrasi Supabase sum)

docs/
  ├── KEPUTUSAN.md    (Keputusan arsitektur yang mengikat)
  ├── PROGRES.md      (Log catatan sesi kerja wajib)
  ├── SAKLAR.md       (Status saklar Supabase per rumah)
  └── BUG-DICATAT.md  (Daftar bug lama GAS yang sengaja ditiru)
```

---

## 6. Protokol Kerja Harian Gabriel (Wajib)

1. **Identitas Git**:
   Setel nama khusus di repo ini:
   ```bash
   git config user.name "Gabriel"
   ```
2. **Sebelum Bekerja**:
   ```bash
   git pull --rebase
   ```
   Pastikan membaca `AGENTS.md` dan `docs/PROGRES.md`.
3. **Pesan Commit**:
   Awali dengan nama rumah yang dikerjakan:
   - `[kmb] ...` untuk pekerjaan KMB V2.
   - `[sum] ...` untuk pekerjaan SUM V2.
   - `[bersama] ...` untuk pekerjaan pintu router atau dokumentasi bersama.
4. **Sebelum Push**:
   - Tambahkan 1 entri di **bagian paling atas** `docs/PROGRES.md` (tanggal, Gabriel, rumah, apa yang berubah, apa yang belum selesai).
   - Jalankan `git pull --rebase` tepat sebelum `git push`.
5. **Garis Merah**:
   - Jangan melakukan `clasp push` ke Google Apps Script produksi.
   - Jangan menyalakan saklar Supabase (`BACKEND_DRIVER=supabase`) sebelum disetujui bersama.
   - Jangan pernah menulis/mengubah spreadsheet dari sistem baru (aliran data hanya 1 arah: Spreadsheet → Supabase).


---

## 7. Kunci Akun Layanan Google (`GOOGLE_SA_KEY_FILE`) untuk Sinkronisasi Cermin Mentah (Langkah 2)

Untuk menyedot data dari ketiga spreadsheet produksi ke Supabase tanpa batasan waktu 6 menit GAS, kita memerlukan **kunci akun layanan Google (JSON)** dengan hak akses Viewer ke 3 spreadsheet.

Panduan langkah demi langkah (±2 menit) sudah disiapkan di [docs/PANDUAN-SERVICE-ACCOUNT-GOOGLE.md](PANDUAN-SERVICE-ACCOUNT-GOOGLE.md):
1. Buat Service Account di [console.cloud.google.com](https://console.cloud.google.com/) (aktifkan Google Sheets API).
2. Download key JSON-nya dan simpan di laptop (misal `D:\sa-key.json`). **JANGAN PERNAH commit file JSON ini ke git**.
3. Bagikan (*Share*) 3 spreadsheet produksi (SUM, KMB TRA, KMB Project) ke email akun layanan tersebut sebagai **Viewer (Pelihat)**.
4. Jalankan pengujian sinkronisasi kering (dry-run):
   ```powershell
   $env:GOOGLE_SA_KEY_FILE = "D:\sa-key.json"
   node tools/cermin/sinkron.mjs --skema=sum --kering
   ```
