# Cermin SUM V2

Rumah: `sum`. Pemegang: Gabriel.

Cermin adalah salinan mentah ke-19 sheet produksi SUM V2 di Supabase, skema `sum`.
Selama masa peralihan, spreadsheet tetap menjadi buku induk, dan cermin hanya salinannya.
Data hanya mengalir **dari spreadsheet ke Supabase**. Alat di sini tidak pernah menulis ke spreadsheet dan tidak menyentuh GAS.

| File | Isinya |
|---|---|
| `db/sum/cermin_sheet.sql` | Skema `sum`: 19 tabel cermin, plus `cermin_header`, `cermin_log`, dan `cermin_meta` |
| `tools/cermin/sinkron.mjs` | Alat sinkron untuk semua rumah: membaca sheet lewat Google Sheets API, lalu menulis ke skema rumahnya (`--skema=sum`) |
| `docs/INVENTARIS-SUM.md` | Daftar sheet, aksi, peran, dan rumus SUM V2 |

## Kenapa bentuknya berbeda dari cermin KMB Project

Cermin KMB Project (`db/kmb_projek/cermin_sheet.sql`) memakai kolom bertipe tetap, dan datanya ditarik lewat API GAS lalu diubah.
Cermin SUM menyimpan **setiap baris persis seperti yang dibaca GAS**:

- `nilai`: isi baris sebagai array menurut urutan kolom, sama dengan `getValues()`. Kolom inilah sumber kebenarannya.
- `data`: objek `{header: nilai}` untuk memudahkan kueri.
- Sel kosong disimpan sebagai `""`, bukan `null`, karena GAS membacanya begitu.
- Tanggal disimpan sebagai string ISO UTC, dihitung dengan zona waktu spreadsheet. Kolom mana yang bertipe tanggal dicatat di `cermin_header.tipe`.
- Header asli sheet produksi dicatat apa adanya di `cermin_header.headers`, karena header di produksi bisa berbeda dari yang tertulis di kode.

Dengan cara ini tidak ada kolom yang hilang atau berubah. Aturan "salin persis" tetap terjaga, termasuk untuk kolom khas SUM (`jabatan_aktual`, `golongan`, `part_type`, `notify_email`).

## Penyiapan sekali saja (Gabriel)

### 1. Akun layanan Google (baca-saja)

1. Buka console.cloud.google.com dengan akun Google kawanabadigrup.
2. Buat project, misalnya `abadiops`.
3. Buka **APIs & Services → Library**, lalu aktifkan **Google Sheets API**.
4. Buka **IAM & Admin → Service Accounts → Create service account**. Beri nama `cermin-sum`. Tidak perlu memberi peran apa pun.
5. Di akun layanan itu, buka **Keys → Add key → JSON**. File kunci akan terunduh. **Simpan di luar repo**, misalnya `C:\rahasia\abadiops-cermin-sum.json`, dan jangan pernah di-commit.
6. Buka spreadsheet SUM V2 (`1qHjfIUT…`), klik **Share**, lalu tambahkan email akun layanan itu (`cermin-sum@….iam.gserviceaccount.com`) sebagai **Viewer**.

### 2. Skema di Supabase

Buka Supabase project `sptgqsjgszwbreikxdph` → **SQL Editor**. Tempel isi `db/sum/cermin_sheet.sql`, lalu jalankan.
Skrip ini aman dijalankan berulang kali.

## Menjalankan sinkron

Dari folder repo, di PowerShell:

```powershell
npm install                                   # sekali, untuk paket postgres
$env:GOOGLE_SA_KEY_FILE = "C:\rahasia\abadiops-cermin-sum.json"
$env:SUM_SPREADSHEET_ID = "<ID lengkap spreadsheet SUM V2>"
$env:DATABASE_URL       = "<koneksi Supabase, session pooler porta 5432>"

node tools/cermin/sinkron.mjs --skema=sum --kering    # 1) baca saja, tidak menulis apa pun
node tools/cermin/sinkron.mjs --skema=sum             # 2) tulis ke skema sum
node tools/cermin/sinkron.mjs --skema=sum --sheet=WorkOrders   # satu sheet saja
```

Bawaannya sheet `AuditLogs` tidak disalin (keputusan Gabriel 13 Nov, demi ukuran Gedung 1). Tambahkan `--lewati=` untuk menyalin semua sheet.

**Selalu jalankan dengan `--kering` lebih dulu.** Mode ini membaca semua sheet dan mencetak jumlah baris, jumlah kolom, sidik (sha256), dan kolom bertipe campur, tanpa menulis apa pun ke database.

Setelah sinkron, periksa hasilnya di SQL Editor:

```sql
SELECT sheet, jumlah_baris, array_length(headers, 1) AS kolom, sinkron_at FROM sum.cermin_header ORDER BY sheet;
SELECT * FROM sum.cermin_log ORDER BY id DESC LIMIT 20;
```

Jumlah baris setiap tabel harus sama dengan jumlah baris data di sheet-nya, yaitu baris terakhir dikurangi satu baris header.

## Langkah berikutnya (tahap 2: cermin)

1. Sinkron pertama berhasil, dan jumlah baris semua sheet cocok.
2. Sinkron dijadwalkan berkala (Cloudflare Cron Trigger), ditambah laporan selisih harian dari `cermin_log`.
3. Setelah aksi pertama diteruskan lewat Worker: tarik-balik segera, yaitu WO yang baru berubah langsung disalin ke cermin.
4. Syarat lulus tahap 2: selisih nol selama 7 hari berturut-turut (`docs/SAKLAR.md`).
