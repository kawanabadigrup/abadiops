# AGENTS.md — Abadi Operation

Berlaku untuk **semua orang dan semua AI** yang bekerja di repo ini (Claude, Codex, Gemini, Cursor, dan lainnya).
Kalau alatmu membaca nama file lain, arahkan file itu ke file ini. Contohnya `CLAUDE.md` yang hanya berisi `@AGENTS.md`.

Repo ini memindahkan tiga sistem MAR dari Google Apps Script (GAS) ke **Cloudflare Workers + Supabase**:
**KMB V2**, **KMB Project**, dan **SUM V2**. Nama platformnya **Abadi Operation**, alamatnya `abadiops.com`.

Bacaan wajib sebelum mengubah apa pun, berurutan:
1. File ini.
2. `docs/KEPUTUSAN.md`: semua keputusan yang sudah diambil, dan yang masih menunggu.
3. Lima entri teratas `docs/PROGRES.md`: apa yang terakhir dikerjakan, plus daftar tugas terbuka.
4. `docs/SAKLAR.md`, kalau pekerjaanmu menyentuh alur WO lama atau WO baru.
5. `docs/GEDUNG-DAN-STAGING.md`, kalau pekerjaanmu menyentuh Supabase, staging, panel saklar, atau rumah baru.

---

## 0. Protokol setiap sesi (WAJIB)

Gabriel dan Raka, beserta AI mereka, bekerja di repo ini pada waktu yang sama dengan **akun GitHub yang sama**.
Supaya pekerjaan tidak saling menimpa atau menumpuk:

**Sebelum mulai**
1. Jalankan `git pull --rebase` di `main`. Jangan mulai bekerja di salinan yang belum ditarik.
2. Baca bacaan wajib di atas.
3. Pastikan kamu tahu sedang bekerja di rumah yang mana (§2). Jangan menyentuh rumah lain.

**Selama kerja**
4. Buat commit kecil dan sering. Jalankan `git pull --rebase` lagi tepat sebelum `git push`.
5. Kalau terjadi konflik di file milik orang lain, **berhenti dan tanya pemiliknya**. Jangan memilih versimu sendiri.

**Sesudah kerja (jangan dilewati)**
6. Tambahkan satu entri di **bagian atas** `docs/PROGRES.md`: tanggal, siapa (orang dan AI), rumah, apa yang berubah, dan apa yang belum selesai.
7. Kalau ada keputusan baru atau keputusan yang berubah, perbarui `docs/KEPUTUSAN.md`.
8. Kalau menemukan bug atau perbedaan perilaku, catat di `docs/BUG-DICATAT.md`. Jangan diperbaiki (lihat §1).
9. Commit dan push dokumen-dokumen itu bersama kodenya. **Dokumen yang tidak diperbarui berarti pekerjaannya belum selesai.**

**Penanda siapa.** Akun GitHub, Cloudflare, dan Supabase dipakai bersama, jadi riwayat akun tidak bisa menunjukkan siapa yang mengerjakan apa. Gantinya:
- Setel nama sendiri di laptop masing-masing, khusus untuk repo ini: `git config user.name "Gabriel"` atau `git config user.name "Raka"`.
- Awali pesan commit dengan nama rumahnya: `[kmb] …`, `[kmb-projek] …`, `[sum] …`, atau `[bersama] …`.
- Di `docs/PROGRES.md`, selalu tulis nama orangnya.

## 0a. Koridor cara kerja (wajib untuk semua AI, termasuk AI Raka)

Cara kerja yang terbukti 28–29 Okt 2026. Ikuti seperti aturan, bukan saran.

1. **Fakta, bukan dugaan.** Setiap klaim tentang produksi (isi sheet, domain, deploy, data) dibuktikan dulu lewat ping, fetch, DNS, atau dashboard. Dalam laporan, pisahkan yang terverifikasi dari yang dugaan. Contoh nyata 28 Okt:
   - "Token diterima GAS" belum tentu berarti token ada di sheet yang kita kira.
   - "Deploy berhasil" belum tentu berarti domain itu dilayani Worker tersebut.
2. **Uji sebelum push.**
   - `node --check` dan `npx wrangler deploy --dry-run`.
   - `wrangler dev` di porta yang bebas: cek dulu dengan `netstat -ano`, dan matikan sisa `wrangler dev` lama.
   - Uji kembar terhadap GAS untuk aksi yang menyentuh data, dan PGlite untuk SQL.
3. **Push ke `main` = deploy produksi** (`project-mar` → `kmbprojek.abadiops.com`).
   - Sesudah push, pantau sampai versi baru tayang, lalu verifikasi.
   - Perubahan yang bergantung pada sesuatu di luar kode (domain, DNS, SQL, isi sheet) **baru di-push setelah hal itu terbukti ada**. Insiden 28 Okt terjadi karena aturan ini dilanggar.
4. **Urutan tanpa putus.** Untuk perubahan yang dirasakan pengguna, siapkan tujuan dulu, baru alihkan. Alamat lama dipertahankan sampai tidak ada lagi yang merujuk ke sana. Rencanakan urutannya dan beri tahu Gabriel sebelum langkah yang menyentuh pengguna.
5. **Isolasi rumah.** Worker rumah hanya bicara dengan GAS dan skema rumahnya sendiri. Satu-satunya bagian lintas rumah adalah pintu (`workers/pintu/`, bagian bersama).
6. **HARAM hardcode** (§5).
   - Data hidup tidak ditulis di kode, dan konfigurasi disimpan di satu tempat.
   - Token hanya lewat environment. Di keluaran, token disamarkan (4 karakter + "…").
   - Token tidak pernah masuk repo, dokumen, maupun pesan commit.
7. **Kecil dan bisa dibalik.** Satu commit untuk satu maksud, dengan pesan `[rumah] ringkasan` (ditambah baris Co-Authored-By kalau dikerjakan AI). Jangan menulis ulang seluruh file orang lain. Generator yang menimpa file, misalnya `scripts/update-worker-engine.mjs`, tidak dipakai.
8. **Perkakas di Windows.**
   - Jangan memakai `sed -i` di Git Bash untuk file repo, karena seluruh akhiran baris file ikut berubah.
   - `node -e` memotong backslash, jadi skrip dengan regex ditulis sebagai file.
   - `worker.js` dirakit dengan `scripts/pack-final-worker.mjs`. Literal `style.css` dikembalikan kalau isinya tidak berubah, dan kedua `worker.js` harus identik.
9. **SQL.**
   - File disimpan di `db/<skema>/`, aman dijalankan ulang, dan mencocokkan setepat mungkin (token lewat md5, bukan nilai mentah).
   - Diuji di PGlite, lalu dijalankan Gabriel di SQL Editor dan diverifikasi dari luar.
10. **Keputusan milik Gabriel.** Nama, alamat, arsitektur, uang, dan apa pun yang mengubah perilaku pengguna: tanya dulu, lalu catat di `docs/KEPUTUSAN.md`. Jangan membatalkan keputusan yang sudah ada.
11. **Jujur dan tercatat.**
    - Laporkan yang gagal apa adanya. Kalau ternyata salah, koreksi secara terbuka di `docs/PROGRES.md`.
    - Sebelum push, setiap sesi wajib menulis entri di `docs/PROGRES.md`. Temuan dicatat di `docs/BUG-DICATAT.md`, keputusan di `docs/KEPUTUSAN.md`.
12. **Jalan terus, kecuali di titik henti** (keputusan Gabriel 29 Okt). Semua keputusan rencana sudah diambil (`docs/KEPUTUSAN.md`). Kerjakan rencana tanpa bertanya. Keputusan teknis kecil diambil sendiri dengan pilihan yang paling aman dan paling bisa dibalik, lalu dicatat di `docs/PROGRES.md`. **Berhenti dan tanya Gabriel hanya untuk:**
    - pembayaran;
    - **menyalakan** saklar di produksi;
    - rumus poin atau rupiah;
    - menghapus data produksi.
13. **PWA rumah adalah salinan 1:1** (keputusan frontend 29 Okt).
    - Yang boleh berbeda dari PWA lama hanya resep empat baris dan pembaca serah-terima token: `ambilTokenSerahan`, `masukDariPintu` dengan penjaga sesi, dan dua baris anti-kedip di `index.html`.
    - Strategi `sw.js`, cara antrean membaca jawaban server, dan alur boot **tidak** diubah tanpa keputusan Gabriel.
    - Sebelum deploy PWA: `node scripts/uji-serahan-token.mjs` harus lulus 24/24. Lalu bandingkan `sw.js` dengan aslinya (`diff --strip-trailing-cr`); bedanya hanya boleh di baris resep.
    - Pelajaran 29 Okt: bug #19–#21.
14. **Satu gedung, banyak kamar; yang berisiko dilatih di staging** (`docs/GEDUNG-DAN-STAGING.md`).
    - Satu project Supabase (gedung) memuat semua rumah, masing-masing satu skema (kamar). Rumah baru = skema baru, **bukan** project baru.
    - Project kedua adalah staging. Project ketiga berarti pembayaran (titik henti).
    - Hal berisiko (saklar, aksi tulis Supabase, pemulihan cadangan, migrasi yang mengubah atau menghapus, antrean kiriman) dilatih di staging dulu.
    - Staging **tidak pernah** menyentuh GAS produksi; ia memakai GAS tiruan.
15. **"Selesai" butuh bukti fungsi, bukan bukti tayang.**
    - HTTP 200, HTML valid, label di `/api/sehat`, atau "deploy berhasil" belum membuktikan apa pun.
    - Halaman web: isi dan tombolnya dibandingkan dengan GAS memakai token yang sama.
    - Saklar: jalur API benar-benar berpindah.
    - Salinan 1:1: dicek byte demi byte dengan sumber yang benar (`clasp clone` rumah itu sendiri).
    - Jangan mengarahkan pengguna produksi ke fitur baru sebelum bukti itu ada.
    - Pelajaran 30 Okt: bug #24–#27.
16. **Kerja Raka sudah diserahkan ke Gabriel (+ Claude)** (keputusan Gabriel, 13 Nov). Izin staging 2 Nov tidak berlaku lagi.
    - Branch `staging` dan tag `raka-akhir-2026-11-11` adalah arsip kerja Raka sampai 11 Nov (`3e55ca8`). Jangan di-merge ke `main` apa adanya.
    - Pindahkan bagian yang benar satu per satu ke `main`, masing-masing dengan bukti fungsi (butir 15). Daftar isi dan yang wajib diperbaiki: `docs/PROGRES.md`, entri 13 Nov.
    - Jangan ikut menyalin:
      - berkas `docs/panduan_deploy_staging_kamis*.md`;
      - data rekaan di `workers/pintu/src/user-admin.js`;
      - tarif dan faktor yang tertulis mati;
      - pemilih jalur dari klien (`?uji=supabase`, header `X-Active-Engine`, `engine` di body).

---

## 1. Aturan utama: PINDAHKAN DULU, PERBAIKI NANTI

Perilaku tiap sistem dipindah **persis seperti di GAS-nya sendiri, termasuk bug-nya**.
Tidak ada perbaikan. Tidak ada penyeragaman antar-rumah. Tidak ada "yang ini lebih bagus, kita pakai juga di sana".
Bug baru dikerjakan setelah ketiga rumah selesai pindah, satu rumah per kali.

Sebelum mengubah perilaku apa pun, jawab pertanyaan ini:

> **Apakah GAS rumah ini melakukan hal yang sama?**
> - **Ya** → salin persis.
> - **Tidak, dan perubahanmu akan membuat sistem baru berbeda dari GAS** → jangan dikerjakan. Catat di `docs/BUG-DICATAT.md`.
> - **Sistem baru sudah terlanjur berbeda dari GAS** → memperbaikinya supaya kembali sama dengan GAS **boleh dan wajib**.

Satu pengecualian: **kebocoran keamanan yang lahir dari kode baru** (§4) wajib diperbaiki segera.

"Sama persis" mencakup semua yang terlihat pengguna dan semua yang menyentuh uang:
- input yang diterima atau ditolak;
- **pesan error, huruf demi huruf**, karena PWA mengenalinya lewat pola teks;
- nama dan bentuk setiap field JSON;
- angka poin dan rupiah;
- status WO;
- baris dan kolom yang ditulis.

Kelambatan GAS, batas waktu 6 menit, dan antrean kunci (lock) **tidak** perlu ditiru.

Jebakan yang membuat hasil diam-diam berbeda:
- **Zona waktu.** GAS memakai `Asia/Jakarta`, sedangkan Worker berjalan dalam UTC. Hitung semua tanggal secara eksplisit dalam WIB: periode payroll, kadaluwarsa 24 jam, dan nomor WO yang memuat tanggal.
- **Hitungan uang tetap di JavaScript**, dengan urutan operasi yang sama seperti di GAS. Jangan dipindah ke SQL, karena tipe `numeric` membulatkan secara berbeda.
- **Cara GAS membaca sel.** Sel kosong dibaca sebagai `''`, angka bisa tersimpan sebagai teks, dan `'false'` dibandingkan sebagai teks. Tiru cara GAS mengubahnya.
- **Fungsi kembar di GAS.** `formatNumber`, `getStatusLabel`, `isTerminalStatus`, dan `truncate` masing-masing didefinisikan dua kali, dan hanya satu yang aktif. Salin versi yang aktif. Tanyakan langsung ke GAS-nya, jangan menebak.

---

## 2. Tiga rumah

Satu pintu (`abadiops.com`), tiga rumah di belakangnya. Token menentukan rumah mana yang dituju.
Tiap rumah punya frontend dan backend sendiri.

| | Rumah KMB V2 | Rumah KMB Project | Rumah SUM V2 |
|---|---|---|---|
| Kode rumah | `kmb` | `kmb-projek` (skema `kmb_projek`) | `sum` |
| Pemegang | Gabriel | **Raka** | Gabriel |
| Frontend asal (PWA) | `mar-offline` | `mar-projek-offline` | `mar-sum-offline` |
| Backend sekarang (GAS `/exec`) | `AKfycbwlwlQv…` | `AKfycbxh4086…` | `AKfycbzB5EUJ…` |
| Spreadsheet | `1ehnxDlv…` | `1lnJo74O…` | `1qHjfIUT…` (terkonfirmasi: script `1k_A_KER…` di `MAR-SUM-v2`) |
| Backend yang disiapkan | Supabase skema `kmb` | skema `kmb_projek` | skema `sum` |
| Alamat aplikasi | `kmbtra.abadiops.com` | `kmbprojek.abadiops.com` (Worker `project-mar`, deploy otomatis dari GitHub `main`) | `sum.abadiops.com` |

**Pintu**: Worker `abadiops-pintu` (`workers/pintu/`), halaman netral di `abadiops.com` (keputusan 28 Okt). Token dicek ke GAS semua rumah sekaligus. Cocok di satu rumah: pengguna memilih **Aplikasi** (`<rumah>.abadiops.com#token=`) atau **Web** (alamat GAS rumah itu + `?token=`). Sesudahnya tidak ada lagi layar token di rumah mana pun (keputusan 29 Okt nomor 10). Cocok di lebih dari satu rumah: ditolak, tidak ditebak. Daftar rumah ada di `workers/pintu/wrangler.toml`. Rumah berikutnya: `kmbbupr` (PT KMB di site BUPR), sesudah migrasi. **Live sejak 28 Okt malam.** Aplikasi rumah hanya mengenal tokennya sendiri (1:1 dengan PWA lama); mengenali rumah adalah tugas pintu.

Aturan rumah:
1. **Frontend adalah salinan 1:1 dari PWA lama rumah itu.** Cara paling aman: pakai file PWA lama apa adanya, dan ubah hanya alamat API serta tombol serah-terima token. Kalau frontend dibangun ulang, hasilnya wajib identik dengan PWA lama (layar, alur, field, dan pesan) dan dibandingkan berdampingan. Ukuran "identik" ada di PWA lama, bukan di rumah lain.
2. **Backend sekarang tetap GAS.** Worker milik rumah meneruskan permintaan ke GAS rumah itu sendiri.
3. **Backend Supabase disiapkan di skema rumah itu sendiri.** Mulai dari cermin sheet yang persis. Setelah itu aksi dipindah satu per satu, masing-masing setelah lulus **uji kembar**: untuk permintaan yang sama, JSON dari Worker harus sama dengan JSON dari GAS.
4. **Jangan menyentuh folder, skema, atau GAS milik rumah lain.** Perubahan yang menyentuh lebih dari satu rumah wajib ditulis di `docs/PROGRES.md` dan diketahui pemilik rumah tersebut. **Pengecualian (keputusan 29 Okt):** untuk menjalankan rencana di `docs/SERAH-TERIMA-2026-10-29.md` §5, Raka dan AI-nya boleh mengerjakan semua rumah dan pintu.
5. **Bagian bersama** dikerjakan berdua, dan yang lain diberi tahu sebelum diubah: pintu depan, buku tamu kiriman, saklar, CI, dan file ini.

---

## 3. Saklar "WO baru ke Supabase"

Ringkasnya (detail lengkap ada di `docs/SAKLAR.md`):
- Tiap rumah punya satu saklar. **Bawaannya MATI.**
- **Saklar mati:** semua tetap lewat GAS, seperti sekarang.
- **Saklar menyala:** WO **baru** lahir dan selesai di Supabase. WO **lama** (yang lahir di GAS) tetap diteruskan ke GAS sampai approved.
- Setiap WO punya **satu rumah seumur hidupnya**, dan tidak pernah dipindah di tengah jalan.
- Data hanya mengalir **satu arah, dari spreadsheet ke Supabase**. Sistem baru tidak pernah menulis ke spreadsheet.
- Yang boleh membalik saklar hanya **Gabriel**. Setiap pembalikan dicatat di `docs/SAKLAR.md`.

---

## 4. Keamanan: larangan keras

- **Jangan pernah** menaruh token, password, kunci API, atau string koneksi database di repo, di dokumen, maupun di bundle frontend.
- **Jangan pernah** menaruh data produksi di repo atau di bundle: daftar mekanik, nama, email, isi sheet `ApiTokens`, atau tarif. Data contoh dan data uji harus **palsu**.
- **Token hanya diperiksa di server** (GAS atau Worker). Frontend tidak boleh membawa daftar token milik siapa pun.
- Rahasia disimpan di **Cloudflare secrets** (`wrangler secret put`) atau **GitHub Actions secrets**. File `.env` tidak pernah di-commit.
- Sebelum commit, periksa diff-mu. Pastikan tidak ada token, email orang, atau alamat database lengkap di dalamnya.
- Token lama milik pengguna dipertahankan apa adanya.
- **Keputusan Gabriel, 27 Okt 2026:** repo boleh tetap publik, dan token serta data yang sudah ada di repo boleh tetap di tempatnya. Jangan mengganti token atau menghapus data itu atas inisiatif sendiri. Larangan di bagian ini berlaku untuk penambahan baru. Pengecualian: untuk kode, aturan **haram hardcode** (§5) juga berlaku pada yang sudah ada, dan dibuang bertahap oleh pemilik rumahnya (bug #16).

---

## 5. Garis merah

- **HARAM hardcode** (keputusan Gabriel, 28 Okt 2026). Data yang hidup di spreadsheet atau database **tidak boleh ditulis sebagai nilai tetap** di kode, skrip, uji, bundle, maupun dokumen. Itu mencakup token, daftar token, peran, ID, nama, dan email mekanik, unit, katalog, dan tarif. Data itu bertambah dan berubah, jadi salinannya di kode pasti basi, dan bisa membuka pintu yang seharusnya tertutup. Kejadian 28 Okt: token uji yang ditulis di bundel dan kode KMB Project berujung pada 4 token kembar dan peran yang dikunci ke token.
  - Baca dari sumbernya: GAS rumah itu, Supabase, atau environment.
  - Rumah sebuah token ditentukan pintu (ping ke ketiga GAS), **bukan** daftar token di kode.
  - Uji memakai token palsu (`uji-palsu-…`) atau environment (`KMBP_UJI_SPV_TOKEN`, `SUM_UJI_TOKEN`).
  - Token baru dibuat dan dicek dengan `scripts/buat-token-tiga-rumah.mjs`, yang bertanya langsung ke ketiga rumah. Token yang dicetaknya tidak boleh di-commit.
  - Alamat GAS dan alamat aplikasi rumah adalah konfigurasi, bukan data. Simpan di satu tempat (`wrangler.toml`, `GAS_URLS` di `worker.js`), jangan disebar.
  - Hardcode di portal KMB Project sudah dibuang 29 Okt (bug #16). Rumus poin dan rupiah di `services/scoring.js` (1:1 dengan `ScoringService.gs`) adalah rumus, bukan data hidup, dan tidak boleh diubah tanpa Gabriel (lihat garis merah di bawah).
- **Jangan `clasp push` ke GAS produksi**, dan **jangan membuat deployment GAS baru**. Alamat `/exec` setiap GAS harus tetap sama selama masa peralihan.
- **Jangan menulis ke spreadsheet** dari sistem baru.
- **Jangan mengubah rumus poin atau rupiah**, dan jangan "membetulkan" angka apa pun. Keputusan bisnis dan angka uang ada di tangan **Gabriel**.
- **Jangan menyalakan saklar** (§3), dan jangan mengganti `BACKEND_DRIVER` menjadi `supabase`, tanpa persetujuan Gabriel.
- **Kalau uji milik rumah lain gagal, jangan ubah angka harapannya.** Berhenti dan laporkan.
- **Jangan memindahkan, menghapus, atau menulis ulang kode orang lain seorang diri.**

---

## 6. Keadaan repo (diperbarui 29 Okt 2026)

Repo ini sedang menuju susunan tiga rumah. Yang sudah berbentuk rumah: `workers/pintu/` (pintu `abadiops.com`), `workers/sum/` + `pwa/sum/` (`sum.abadiops.com`), dan `workers/kmb/` + `pwa/kmb/` (`kmbtra.abadiops.com`). KMB Project masih berada di akar (`worker.js`, `scripts/`) dengan salinan di `workers/kmb-projek/`, dan tayang di `kmbprojek.abadiops.com`. Serah terima terbaru: `docs/SERAH-TERIMA-2026-10-29.md`. Selain itu:
- Kode **MARProject** (Next.js) di `src/`, `db/`, `tests/`, dan `scripts/`. Awalnya dibuat untuk KMB V2, sekarang dipakai sebagai dasar kerja KMB Project.
- **`worker.js`**: hasil build untuk Worker `project-kmb` (lihat `wrangler.toml`), yang bekerja dengan GAS **KMB Project**. Isinya juga memuat pintu ketiga rumah.
  - ⚠️ **PUSH KE `main` = DEPLOY PRODUKSI.** Worker **`project-mar`** (portal lama; sejak 29 Okt tanpa domain produksi yang diketahui, karena `kmbprojek.abadiops.com` dipindah ke Worker `abadiops-porject-kmb`) terhubung ke GitHub `kawanabadigrup/Project-KMB` (Workers Builds): setiap push ke `main` di-build dan tayang dalam beberapa menit. Terbukti 28 Okt malam, dan sempat menimbulkan insiden (lihat `docs/PROGRES.md`). `npx wrangler deploy` dari akar repo justru masuk ke Worker `project-kmb`, yang tidak punya domain dan tidak dipakai. Pintu (`abadiops-pintu`) dan rumah lain di-deploy manual dari foldernya. Jadi uji dulu dengan `wrangler dev`, dan push perubahan yang bergantung pada hal di luar kode (domain, DNS, SQL) hanya **sesudah** hal itu terbukti ada.
  - Bagian kodenya disunting langsung. `app.js` di dalamnya dirakit dari `scripts/patched-app.js` dengan `scripts/pack-final-worker.mjs`. Perakitan ini mengubah akhiran baris literal `style.css`, jadi kembalikan literal itu kalau isinya tidak berubah.
  - Salin hasilnya ke `workers/kmb-projek/worker.js`; kedua file harus identik.
  - **Jangan jalankan `scripts/update-worker-engine.mjs`** (dipensiunkan 28 Okt): skrip itu menimpa seluruh blok `/api/gas`.
  - Aksi baca hanya dilayani Supabase kalau nama aksinya ada di `AKSI_SUPABASE_LULUS_KEMBAR`, setelah lulus `scripts/uji-kembar-kmb-projek.mjs`.
- `src/lib/backendConfig.ts`: saklar global `BACKEND_DRIVER` dengan pilihan `appscript` atau `supabase`. Konstanta `APPSCRIPT_URL_KMB` di file itu sebenarnya menunjuk ke GAS **KMB Project**, bukan KMB V2.
- `src/lib/tenantRouter.ts`: memakai kode tenant `KMB`, `MAR`, dan `SUM`. Kode ini belum sama dengan kode rumah di §2.
- `docs/MULTI-TENANT-SETUP.md` dan `docs/SPEK-LAYAR/`: dokumen kerja dari Raka. Kalau ada yang bertentangan dengan file ini, **file ini yang berlaku** sampai diselaraskan.

Susunan yang dituju. Pemindahannya dilakukan bersama, tidak oleh satu orang:

```
workers/pintu/        bersama
workers/kmb/          Gabriel
workers/kmb-projek/   Raka
workers/sum/          Gabriel
pwa/kmb/  pwa/kmb-projek/  pwa/sum/     salinan PWA lama
db/kmb/   db/kmb_projek/   db/sum/       migrasi skema per rumah
tools/    docs/
```

Kode MARProject akan disimpan di cabang arsip sebelum `main` diubah ke susunan ini.
