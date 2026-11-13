# Panduan Pembuatan Kunci Akun Layanan Google (`GOOGLE_SA_KEY_FILE`)

Dokumen ini adalah panduan praktis bagi **Gabriel** dan **Raka** untuk menyiapkan kredensial Google Service Account yang dibutuhkan pada **Langkah 2 (Sinkronisasi Cermin Mentah Spreadsheet ke Supabase)**.

---

## 1. Mengapa File Ini Dibutuhkan?

Untuk menyalin ribuan baris data dari spreadsheet ke tabel cermin Supabase skema `sum`, `kmb`, dan `kmb_projek`, kita menggunakan skrip sinkronisasi otomatis:
- `tools/cermin/sinkron.mjs`, satu alat untuk semua rumah (`--skema=sum`, `--skema=kmb`, `--skema=kmb_projek`, `--skema=kmbbupr`)

Skrip ini membaca spreadsheet langsung lewat **Google Sheets API v4 resmi** (berkecepatan tinggi tanpa batas waktu 6 menit GAS). Agar skrip ini diizinkan membaca isi sheet, Google mewajibkan sebuah **akun layanan robot (Service Account)** dengan izin baca-saja (*Viewer*).

---

## 2. Cara Membuat Kunci JSON (Gratis & ±2 Menit)

Dapat dibuat oleh siapa saja yang memiliki akses Google Cloud Console (bisa menggunakan akun Google `kawanabadigrup`):

### Langkah 1: Buat Kunci di Google Cloud Console
1. Buka [console.cloud.google.com](https://console.cloud.google.com/).
2. Di baris atas, pilih atau buat proyek baru (misalnya bernama `Abadi Ops`).
3. **Aktifkan Google Sheets API**:
   - Buka menu kiri ➔ **APIs & Services** ➔ **Library** (atau buka [Google Sheets API Library](https://console.cloud.google.com/apis/library/sheets.googleapis.com)).
   - Klik tombol biru **Enable** (Aktifkan).
4. **Buat Akun Layanan (Service Account)**:
   - Buka menu kiri ➔ **IAM & Admin** ➔ **Service Accounts** ([buka langsung](https://console.cloud.google.com/iam-admin/serviceaccounts)).
   - Klik **+ CREATE SERVICE ACCOUNT** di bilah atas.
   - Isi nama akun, contoh: `cermin-spreadsheet`.
   - Klik **Create and Continue**, lalu klik **Done** (tidak perlu memilih role GCP apa pun).
5. **Download Kunci JSON**:
   - Klik akun layanan yang baru saja muncul di daftar.
   - Masuk ke tab **Keys** (Kunci) di bilah atas.
   - Klik **Add Key** ➔ **Create new key**.
   - Pilih opsi format **JSON**, lalu klik **Create**.
   - File JSON akan otomatis terunduh ke laptop (contoh nama file: `abadi-ops-12345-abcdef.json`).
   - **Simpan file ini di luar direktori repositori git** (misalnya di `D:\sa-key.json`).

> ⚠️ **PERINGATAN KEAMANAN**: File JSON ini berisi private key Google Cloud. **JANGAN PERNAH** memindahkan file ini ke dalam folder repo `MARProject` atau melakukan `git add` terhadapnya.

---

## 3. Beri Izin Akses Baca ke 3 Spreadsheet (Wajib)

Agar akun robot tersebut dapat membaca data:
1. Buka file `.json` yang telah diunduh, salin nilai `"client_email"` (formatnya seperti `cermin-spreadsheet@abadi-ops-xxx.iam.gserviceaccount.com`).
2. Buka ketiga Google Spreadsheet produksi:
   - **Spreadsheet KMB Project**: `1lnJo74O…`
   - **Spreadsheet SUM V2**: `1qHjfIUT…`
   - **Spreadsheet KMB TRA**: `1ehnxDlv…`
3. Pada masing-masing spreadsheet, klik tombol **Share (Bagikan)** di pojok kanan atas.
4. Tempelkan email service account tadi, pilih hak akses sebagai **Viewer (Pelihat)**, dan klik **Send / Kirim**.

---

## 4. Cara Menjalankan Uji Sinkronisasi (Besok)

Setelah file JSON tersimpan di laptop (misal di `D:\sa-key.json`) dan email sudah dibagikan sebagai Viewer:

### Uji Kering (Dry-run: hitung baris tanpa menulis database)
Buka terminal PowerShell di folder repo:
```powershell
$env:GOOGLE_SA_KEY_FILE = "D:\sa-key.json"
node tools/cermin/sinkron.mjs --skema=sum --kering
```

### Eksekusi Sinkronisasi Penuh ke Supabase
```powershell
$env:GOOGLE_SA_KEY_FILE = "D:\sa-key.json"
node tools/cermin/sinkron.mjs --skema=sum
```
Alat menyalin setiap sheet ke tabel cermin mentah skema `sum` di Supabase, kecuali `AuditLogs` (keputusan Gabriel 13 Nov).
