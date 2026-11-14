# Profil kamar

`rumah.json` adalah satu-satunya daftar kamar (rumah) beserta sifatnya, dipakai pintu, panel saklar, Worker rumah, dan GAS tiruan. Kode tidak boleh menulis daftar kamar sendiri.

| Kunci | Arti |
|---|---|
| (nama kunci) | Kode kamar. Sama persis dengan `kode` di `RUMAH` pintu dan `RUMAH` Worker rumahnya |
| `nama` | Nama kamar |
| `skema` | Skema Supabase tempat cermin dan data kamar |
| `rpc` | Awalan fungsi database kamar, misalnya `kmb` untuk `kmb_admin_daftar_user_bertoken` |
| `awalan_token` | Awalan token baru yang diterbitkan panel |
| `section` | Daftar `[kode, label]` section, kosong bila kamar tanpa section. Cerminan konstanta GAS kamar itu |
| `peran` | Daftar `[kode, label]` peran. Cerminan konstanta GAS kamar itu |
| `gas.script` | ID script GAS kamar. Dipakai `tools/kembar/bundel-gas.mjs` untuk membungkus kode GAS asli ke Worker kamar |
| `gas.versi` | Versi GAS yang dipatok untuk Worker. Mengganti versi: ubah di sini, bungkus ulang, uji kembar, lalu deploy |
| `gas.aksi_worker` | Aksi API yang dijawab Worker dengan kode GAS asli di atas cermin (bila saklar mengizinkan). Aksi lain diteruskan ke GAS |
| `gas.aksi_tulis_worker` | Aksi API tulis yang dijalankan Worker dengan kode GAS asli lalu disimpan ke cermin (public.cermin_tulis). Hanya bila saklar `supabase` atau lingkungan tanpa GAS; `?uji=supabase` tidak berlaku untuk tulis |
| `gas.sheet_tidak_dimuat` | Sheet cermin yang tidak dikirim ke Worker untuk aksi BACA (besar dan tidak dipakai). Aksi baca yang membacanya ditolak. Aksi tulis selalu memuat semua sheet |
| `gas.sheet_jarang_tulis` | Untuk aksi tulis, sheet yang dimuat JARANG: `{ "<sheet>": "<kolom>" }`, hanya baris yang kolomnya sama dengan `op_id` kiriman. Untuk ProcessedOps: GAS hanya mencari op_id itu lalu menambah satu baris. Bacaan lain atas baris yang tidak dimuat ditolak |

Kamar yang **aktif** di tiap lingkungan diatur `RUMAH` di `workers/pintu/wrangler.toml` (bagian produksi dan `env.staging`). Menambah kamar: tambah profilnya di sini, lalu satu baris `RUMAH` di lingkungan yang dituju.
