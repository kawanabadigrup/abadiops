# Rumah KMB Project: Worker `abadiops-porject-kmb`

> Nama Worker di Cloudflare memang `abadiops-porject-kmb` (salah ketik dari `abadiops-kmbprojek`). Nama itu dibiarkan karena domain `kmbprojek.abadiops.com` sudah terpasang padanya. Mengganti nama berarti membuat Worker baru lalu memindahkan domain.

Rumah: `kmbprojek` · Saklar produksi: `gas` · **GAS asli di Worker** (sejak 14 Nov 2026)

Sama dengan BUPR (`workers/kmbbupr/README.md`): Worker menjalankan kode GAS KMB Projek yang **asli** (versi dipatok di
`config/rumah.json` `kmbprojek.gas`, sekarang @49, sudah berisi penjaga `google.script.run`) di atas cermin Supabase.
Logikanya ada di `workers/bersama/gas-rumah.js`, dipakai bersama semua rumah GAS asli; `src/index.js` hanya memasang
bundel GAS rumah ini.

```
HP / laptop ──▶ abadiops-porject-kmb (Worker)
                 ├─ file PWA       ← pwa/kmbprojek/  (salinan 1:1 projek-v13, alamat API ./api)
                 ├─ POST ./api     saklar gas: diteruskan apa adanya ke GAS KMB Project (/exec)
                 │                 saklar supabase / staging: kode GAS asli di Worker, data cermin kmb_projek
                 ├─ GET  /web      saklar gas: diarahkan ke web GAS; selain itu MAR Web asli (doGet + template)
                 └─ POST /web/run  google.script.run, hanya 24 fungsi yang dipanggil halaman
```

- **Produksi** (saklar `gas`): perilakunya sama dengan sebelumnya. API diteruskan apa adanya (status dan isi jawaban GAS
  tidak diubah); GAS tidak terjangkau dijawab `GAS_TIDAK_TERJANGKAU` (502, bukan JSON) supaya kiriman tetap di antrean
  (BUG-DICATAT #20).
- **Staging** (`abadiops-kmbprojek-staging`, tanpa GAS): semua aksi baca/tulis GAS dijawab Worker dari cermin
  `kmb_projek` di Gedung 2. Skema lama Raka (tabel relasional) dicadangkan sebagai `kmb_projek_raka_20261114`
  (keputusan Gabriel 14 Nov); kode backend Raka (`supabase-backend.js`, `web-handler.js`, buku tamu, payroll Excel)
  dibuang dari branch dan tetap ada di riwayat git (terakhir di `e7a3b48`).
- **Batas CPU**: GAS asli butuh ±50–110 ms CPU per permintaan di data KMB Projek, sedangkan paket gratis Cloudflare
  Workers memotong di 10 ms bila dipakai beruntun (galat 1102). Perlu Workers Paid sebelum saklar `supabase` dipakai
  sungguhan (BUG-DICATAT #40).

Uji 14 Nov 2026 (staging, GAS lokal @49 sebagai pembanding, data cermin yang sama): 44/44 jawaban baca identik
(4 peran × 11 aksi, dengan jeda antarpermintaan karena batas CPU); pusat admin 29/29 (token terbitan panel langsung
bisa masuk lewat Worker ini).

## Isi

| File | Isinya |
|---|---|
| `workers/kmbprojek/wrangler.toml` | Nama Worker, akun kawanabadigrup (dikunci), folder PWA, alamat GAS KMB Projek, staging tanpa GAS |
| `workers/kmbprojek/src/index.js` | Memasang bundel GAS rumah ini ke `workers/bersama/gas-rumah.js` |
| `workers/kmbprojek/gas/gas-kamar.js` | Bundel GAS asli (TIDAK di repo): `node tools/kembar/bundel-gas.mjs --kamar=kmbprojek` |
| `pwa/kmbprojek/` | PWA KMB Project projek-v13 apa adanya, dengan resep empat baris dan pembaca serah-terima token (lihat di bawah) |

### Yang diubah dari PWA lama (repo `gabrielrurent/PWA-Project-KMB`, commit `6e8b980` 23 Okt, projek-v13)

Salinan lokal `MAR github/mar-projek-offline` masih projek-v1, jadi **jangan** dipakai sebagai pembanding.

| File | Baris | Lama | Baru |
|---|---|---|---|
| `app.js` | 15 | `API_URL: 'https://script.google.com/…/exec'` | `API_URL: './api'` |
| `app.js` | 21 | `APP_VERSION = 'projek-v13'` | `'projek-v17'` |
| `sw.js` | 1 | `CACHE = 'mar-projek-v13'` | `'mar-projek-v17'` |
| `sw.js` | 41 | `API_URL = 'https://script.google.com/…/exec'` | `'./api'` |

Tambahan serah-terima pintu (keputusan 29 Okt nomor 10), **sama persis dengan `pwa/kmb` dan `pwa/sum`**:
- `app.js`: `ambilTokenSerahan`, `masukDariPintu` dengan penjaga sesi (HP yang sudah masuk dengan token lain **tidak** diganti tokennya, supaya antrean kiriman milik pengguna lama tidak terkirim atas nama token baru), dan satu baris boot yang melepas kelas anti-kedip sesudah layar pertama dipilih.
- `index.html`: dua baris di `<head>` (anti-kedip), supaya layar token tidak tampil sekilas saat datang dari pintu.

`sw.js` **tidak** boleh diubah selain dua baris resep. Kalau GAS tidak terjangkau, Worker menjawab dengan teks yang bukan JSON (`GAS_TIDAK_TERJANGKAU`). `r.json()` di `sw.js` asli lalu melempar galat, sehingga kiriman tetap di antrean dan dikirim ulang otomatis (lihat `teruskanKeGas` di `workers/bersama/gas-rumah.js`). Versi 29 Okt siang sempat mengubah jawaban itu menjadi `success:false`, dan kiriman ditandai gagal tanpa dicoba ulang. Sudah dipulihkan di projek-v17.

File lainnya (`manifest.json`, kedua ikon) identik byte demi byte. Cara cek: unduh file dari repo asli lalu `diff --strip-trailing-cr`. Untuk `sw.js`, hasilnya harus hanya dua baris.

Service worker PWA hanya menangani permintaan GET, sedangkan semua panggilan API memakai POST. Jadi memindahkan API ke alamat yang sama dengan PWA tidak mengubah perilaku service worker.
