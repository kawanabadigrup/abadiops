# Profil kamar

`rumah.json` adalah satu-satunya daftar kamar (rumah) beserta sifatnya, dipakai pintu, panel saklar, Worker rumah, dan GAS tiruan. Kode tidak boleh menulis daftar kamar sendiri.

| Kunci | Arti |
|---|---|
| (nama kunci) | Kode kamar. Sama persis dengan `kode` di `RUMAH` pintu dan `RUMAH` Worker rumahnya |
| `nama` | Nama kamar |
| `worker` | Folder Worker rumah di `workers/` bila namanya beda dengan kode kamar (kmbtra → `kmb`). Tanpa kunci ini, foldernya sama dengan kode kamar |
| `skema` | Skema Supabase tempat cermin dan data kamar |
| `rpc` | Awalan fungsi database kamar (fungsi ping lama di pintu). Fungsi admin SQL lama sudah dibuang (BUG-DICATAT #39); pusat admin memakai `admin` di bawah |
| `admin` | Pusat admin di atas cermin (`workers/pintu/src/admin-cermin.js`): `sheet_pengguna`, `sheet_token`, `sheet_config` (pola nama sheet config), `kolom_uang` (`"<sheet>": "*"` atau daftar kolom; perubahannya wajib konfirmasi kedua) |
| `awalan_token` | Awalan token baru yang diterbitkan panel |
| `section` | Daftar `[kode, label]` section, kosong bila kamar tanpa section. Cerminan konstanta GAS kamar itu |
| `peran` | Daftar `[kode, label]` peran. Cerminan konstanta GAS kamar itu |
| `gas.script` | ID script GAS kamar. Dipakai `tools/kembar/bundel-gas.mjs` untuk membungkus kode GAS asli ke Worker kamar |
| `gas.versi` | Versi GAS yang dipatok untuk Worker. Mengganti versi: ubah di sini, bungkus ulang, uji kembar, lalu deploy |
| `gas.aksi_worker` | Aksi API yang dijawab Worker dengan kode GAS asli di atas cermin (bila saklar mengizinkan). Aksi lain diteruskan ke GAS |
| `gas.aksi_tulis_worker` | Aksi API tulis yang dijalankan Worker dengan kode GAS asli lalu disimpan ke cermin (public.cermin_tulis). Hanya bila saklar `supabase` atau lingkungan tanpa GAS; `?uji=supabase` tidak berlaku untuk tulis |
| `gas.sheet_dasar` | Sheet yang selalu dimuat untuk setiap pekerjaan (misalnya ApiTokens, Config_Mechanics untuk memeriksa token). Sheet lain dimuat hanya bila kode GAS ternyata membacanya: Worker mempelajarinya per aksi/halaman/fungsi, mengulang pekerjaan sebelum apa pun disimpan, dan hasilnya selalu sama dengan memuat seluruh cermin (`workers/bersama/gas-rumah.js`, BUG-DICATAT #40) |
| `gas.sheet_tidak_dimuat` | Sheet cermin yang tidak pernah dikirim ke Worker untuk aksi BACA (besar dan tidak dipakai). Aksi baca yang membacanya ditolak |
| `gas.sheet_jarang_tulis` | Untuk pekerjaan yang menulis (aksi tulis, MAR Web), sheet yang dimuat JARANG: `"<sheet>": "<kolom>"` memuat baris yang kolomnya sama dengan `op_id` kiriman (ProcessedOps: GAS mencari op_id itu lalu menambah satu baris); `"<sheet>": { "kolom": …, "nilai": … }` memuat baris dengan nilai tetap itu. Nilai yang tidak pernah ada (AuditLogs) berarti hanya jumlah barisnya yang dimuat, cukup untuk menambah baris. Bila GAS ternyata membaca baris lain, sheet itu dimuat utuh untuk pekerjaan tersebut |

Kamar yang **aktif** di tiap lingkungan diatur `RUMAH` di `workers/pintu/wrangler.toml` (bagian produksi dan `env.staging`). Menambah kamar: tambah profilnya di sini, lalu satu baris `RUMAH` di lingkungan yang dituju.
