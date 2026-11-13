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

Kamar yang **aktif** di tiap lingkungan diatur `RUMAH` di `workers/pintu/wrangler.toml` (bagian produksi dan `env.staging`). Menambah kamar: tambah profilnya di sini, lalu satu baris `RUMAH` di lingkungan yang dituju.
