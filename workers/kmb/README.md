# Rumah KMB V2: Worker `abadiops-kmb`

Rumah: `kmbtra` · Saklar produksi: `gas` · **GAS asli di Worker** (sejak 14 Nov 2026, langkah (d))

Sama dengan BUPR dan KMB Projek: Worker menjalankan kode GAS KMB V2 yang **asli** (versi dipatok di
`config/rumah.json` `kmbtra.gas`, sekarang @299, sudah berisi penjaga `google.script.run`) di atas cermin Supabase
(skema `kmb`). Logikanya di `workers/bersama/gas-rumah.js`; `src/index.js` hanya memasang bundel GAS rumah ini.

```
HP / laptop ──▶ abadiops-kmb (Worker, kmbtra.abadiops.com)
                 ├─ file PWA       ← pwa/kmb/  (salinan 1:1 mar-offline v91, alamat API ./api)
                 ├─ POST ./api     saklar gas: diteruskan apa adanya ke GAS KMB V2 (/exec)
                 │                 saklar supabase / staging: kode GAS asli di Worker, data cermin kmb
                 ├─ GET  /web      saklar gas: diarahkan ke web GAS; selain itu MAR Web asli
                 └─ POST /web/run  google.script.run, hanya fungsi yang dipanggil halaman
```

- **Produksi** (saklar `gas`): perilakunya sama dengan sebelumnya (diteruskan apa adanya; `GAS_TIDAK_TERJANGKAU` 502).
  Saklar dibaca dari pintu lewat ikatan `PINTU`, cadangannya var `SAKLAR = "gas"`.
- **Staging** (`abadiops-kmb-staging`, tanpa GAS): aksi baca/tulis GAS dijawab Worker dari cermin `kmb` Gedung 2.
  Kode backend Raka (`supabase-backend.js`, `web-handler.js`, buku tamu, payroll Excel) dibuang dari branch; ada di
  riwayat git (terakhir di `e7a3b48`).
- **Belum siap untuk saklar `supabase` produksi**: data KMB V2 besar (rata-rata 6,75 MB per aksi baca sesudah
  pemuatan sesuai kebutuhan, BUG-DICATAT #41) dan paket gratis Workers memotong CPU di 10 ms (BUG-DICATAT #40).

## Isi

| File | Isinya |
|---|---|
| `workers/kmb/wrangler.toml` | Nama Worker, domain, akun kawanabadigrup (dikunci), folder PWA, alamat GAS KMB V2, staging tanpa GAS |
| `workers/kmb/src/index.js` | Memasang bundel GAS rumah ini ke `workers/bersama/gas-rumah.js` |
| `workers/kmb/gas/gas-kamar.js` | Bundel GAS asli (TIDAK di repo): `node tools/kembar/bundel-gas.mjs --kamar=kmbtra` |
| `pwa/kmb/` | PWA KMB V2 v91 apa adanya. Hanya empat baris yang diubah (lihat di bawah) |

### Yang diubah dari PWA lama (`mar-offline`, repo `mar-kmb-v2-offline`)

| File | Baris | Lama | Baru |
|---|---|---|---|
| `app.js` | 6 | `API_URL: 'https://script.google.com/…/exec'` | `API_URL: './api'` |
| `app.js` | 12 | `APP_VERSION = 'v91'` | `'v92'` |
| `sw.js` | 1 | `CACHE = 'mar-v91'` | `'mar-v92'` |
| `sw.js` | 25 | `API_URL = 'https://script.google.com/…/exec'` | `'./api'` |

File lainnya (`index.html`, `manifest.json`, kedua ikon) identik byte demi byte.
Service worker PWA hanya menangani permintaan GET, sedangkan semua panggilan API memakai POST. Jadi memindahkan API ke alamat yang sama dengan PWA tidak mengubah perilaku service worker.

## Sudah diuji di laptop (`wrangler dev`, 28 Okt 2026)

- **Semua file PWA** tersaji 200 tanpa redirect.
- **Uji kembar jalur API** dengan token palsu, dikirim langsung ke GAS KMB V2 dan lewat Worker:
  - `ping`, `pull_my_wos`, dan `create_wo`: identik byte demi byte.
  - Token kosong dan body bukan JSON: identik, kecuali jam pencatatan.

  GAS hanya menolak token palsu itu. Tidak ada data yang dibaca atau ditulis.
- **Perilaku saat GAS tidak terjangkau** sama dengan rumah SUM (kodenya sama): Worker menjawab `GAS_TIDAK_TERJANGKAU` (502, teks biasa), sehingga PWA tetap menahan kiriman di antrean.

**Versi tayang** (`https://abadiops-kmb.kawanabadigrup.workers.dev`, di-deploy 28 Okt 2026): uji kembar yang sama lulus, dan semua file PWA tersaji 200 tanpa redirect.

Belum diuji: aksi dengan token sungguhan (perlu Gabriel).

## Deploy ke alamat uji (Gabriel)

Memakai API token kawanabadigrup yang sama dengan rumah SUM (`abadiops-sum laptop Gabriel`). Token itu berlaku untuk semua Worker di akun kawanabadigrup.

```powershell
cd C:\dev\abadiops
git pull --rebase
cd workers\kmb
$env:CLOUDFLARE_API_TOKEN = "<token kawanabadigrup>"
npx wrangler deploy        # alamatnya: https://abadiops-kmb.kawanabadigrup.workers.dev
```

Cek sehatnya di `https://abadiops-kmb.kawanabadigrup.workers.dev/api/sehat`. Jawabannya harus `{"ok":true,"rumah":"kmb","saklar":"gas","jalur":"gas"}`.

## Uji dengan token sungguhan

1. Buka alamat uji, lalu masuk dengan token KMB V2 Anda. Token diketik manual.
2. Bandingkan berdampingan dengan PWA lama: profil, My Work, antrean approval, Monitoring, dan cakupan section (tyreman, field, workshop).
3. Uji aksi tulis dengan pekerjaan sungguhan yang memang perlu diproses. **Ini menulis ke GAS produksi**, persis sama seperti PWA lama. Hindari membuat WO palsu sampai approve L2.
4. Coba ketiga peran KMB V2: mechanic, supervisor, dan superintendent.

## Sebelum mekanik dipindah

- [ ] Uji dengan token sungguhan lulus untuk ketiga peran.
- [ ] Rumah KMB V2 tersambung ke pintu `abadiops.com` (dikerjakan bersama Raka).
- [ ] Tombol serah-terima token di PWA lama dan pembaca `#token=` di PWA baru sudah ada.
- [ ] Gabriel menyetujui hari pindah.
