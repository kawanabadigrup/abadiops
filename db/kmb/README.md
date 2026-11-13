# Cermin KMB V2

Rumah: `kmb`. Pemegang: Gabriel.

Cermin adalah salinan mentah sheet produksi KMB V2 di Supabase, skema `kmb`.
Selama masa peralihan, spreadsheet tetap menjadi buku induk, dan cermin hanya salinannya.
Data hanya mengalir **dari spreadsheet ke Supabase**. Alat di sini tidak pernah menulis ke spreadsheet dan tidak menyentuh GAS.

| File | Isinya |
|---|---|
| `db/kmb/cermin_sheet.sql` | Skema `kmb`: tabel cermin mentah, plus `cermin_header`, `cermin_log`, dan `cermin_meta` |
| `tools/cermin/sinkron.mjs` | Alat sinkron untuk semua rumah: membaca sheet lewat Google Sheets API, lalu menulis ke skema rumahnya (`--skema=kmb`) |

## Format Cermin Mentah (JSONB)

Sama seperti SUM V2 (`db/sum/cermin_sheet.sql`, keputusan Gabriel 29 Okt):
- `nilai`: isi baris sebagai array menurut urutan kolom, persis `getValues()`. Sumber kebenaran.
- `data`: objek `{header: nilai}` untuk memudahkan kueri.
- Sel kosong disimpan sebagai `""`, bukan `null`.
- Tanggal disimpan sebagai ISO UTC.
- Header asli sheet produksi dicatat apa adanya di `cermin_header.headers`.

## Penyiapan & Penggunaan

```powershell
$env:GOOGLE_SA_KEY_FILE = "C:\rahasia\abadiops-cermin.json"
$env:KMB_SPREADSHEET_ID = "1ehnxDlv..."
$env:DATABASE_URL       = "<koneksi Supabase, session pooler porta 5432>"

node tools/cermin/sinkron.mjs --skema=kmb --kering    # 1) uji kering baca tanpa tulis
node tools/cermin/sinkron.mjs --skema=kmb             # 2) tulis ke skema kmb
node tools/cermin/sinkron.mjs --skema=kmb --sheet=WorkOrders   # satu sheet saja
```

Daftar sheet dibaca langsung dari spreadsheet, jadi tabel untuk sheet baru dibuat sendiri oleh alat. Bawaannya sheet `AuditLogs` tidak disalin (keputusan Gabriel 13 Nov). Tambahkan `--lewati=` untuk menyalin semua sheet.
