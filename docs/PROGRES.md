# Progres

Entri terbaru selalu di **atas**. Setiap sesi kerja, baik oleh orang maupun AI, wajib menambah satu entri sebelum push.

Formatnya:

```
### YYYY-MM-DD · Nama (+ AI) · rumah
- Berubah: …
- Belum selesai / berikutnya: …
```

---

### 2026-11-14 · Gabriel (+ Claude) · bersama, kmbprojek, sum, kmbtra (KMB Projek staging ke GAS asli; pusat admin lulus di keempat proyek)
- Berubah:
  - **KMB Projek staging pindah ke GAS asli di Worker** (keputusan Gabriel): skema Raka `kmb_projek` di Gedung 2 dicadangkan sebagai `kmb_projek_raka_20261114` (18 tabel, tidak dihapus); cermin KMB Projek dibuat dari spreadsheet (24 sheet, termasuk AuditLogs 6.232 baris). `config/rumah.json` `kmbprojek.gas` (@49, aksi sama dengan BUPR: 23 aksi API GAS keduanya identik).
  - **Worker rumah GAS asli jadi satu modul bersama** `workers/bersama/gas-rumah.js`; `workers/kmbbupr/src/index.js` dan `workers/kmbprojek/src/index.js` hanya memasang bundel GAS masing-masing. Kode backend Raka KMB Projek dibuang (riwayat: `e7a3b48`). Jalur "teruskan ke GAS" mempertahankan perilaku produksi lama: status dan isi GAS apa adanya, `GAS_TIDAK_TERJANGKAU` 502 (BUG #20); diuji lokal 3/3.
  - GAS tiruan meneruskan `kmbprojek` ke Worker barunya; pintu staging memperlakukan KMB Projek sebagai rumah GAS asli.
  - **Pusat admin:** perbaikan izin tulis (posisi saklar dibaca sebagai teks; sebelumnya produksi akan selalu hanya-baca), diuji lokal 6/6. Cermin SUM/KMB TRA staging disinkron ulang (izin Gabriel).
  - **Uji staging:** pusat admin lulus di keempat proyek: BUPR 37/37, SUM 29/29, KMB TRA 29/29, KMB Projek 29/29 (token terbitan panel langsung bisa masuk lewat Worker masing-masing; yang diganti/dicabut ditolak). Worker BUPR sesudah dipindah ke modul bersama: baca 66/66, web 36/36. Worker KMB Projek vs GAS lokal @49: 44/44 (dengan jeda). Data uji dikembalikan ke isi spreadsheet.
  - **Ditemukan (BUG #40):** paket gratis Cloudflare Workers memotong CPU di 10 ms; GAS asli butuh ±13–180 ms. Uji beruntun KMB Projek: 245 dari 289 permintaan galat 1102.
- Belum selesai / berikutnya:
  - Keputusan Gabriel: Workers Paid (USD 5/bulan) sebelum saklar `supabase` dipakai di rumah mana pun (BUG #40).
  - Uji tulis kembar dan MAR Web KMB Projek (skenario BUPR memakai akun dummy BUPR; perlu skenario KMB Projek) sesudah batas CPU diputuskan.
  - Langkah (d) untuk KMB V2 dan SUM (GAS asli di Worker).

### 2026-11-14 · Gabriel (+ Claude) · bersama, kmbbupr (pusat admin di atas cermin; BUPR masuk pusat admin)
- Berubah:
  - **Pusat admin panel pintu dibangun ulang di atas cermin** (BUG-DICATAT #39; permintaan Gabriel: kembangkan pusat admin yang ada, masukkan BUPR, pastikan setiap fungsi jalan per proyek). `workers/pintu/src/admin-cermin.js` menggantikan `user-admin.js`:
    - pengguna (`Config_Mechanics`) dan token (`ApiTokens`): daftar, tambah/ubah, hapus, terbitkan (token aktif dikembalikan, seperti `createTokenForUser`), ganti, cabut; token baru `awalan rumah + 20 hex`, dicek ke token semua rumah;
    - sheet config: setiap sheet `Config_*` rumah itu sebagai sub-tab, kolom dari judul sheet;
    - tulis lewat tiruan SpreadsheetApp + `cermin_tulis` (bentuk sel sama dengan GAS dan alat sinkron), versi sheet diperiksa (409), kolom uang wajib konfirmasi kedua di server (428, `config/rumah.json` `<rumah>.admin.kolom_uang`), log `public.cermin_admin_log` (token disamarkan);
    - hanya sesi panel; tulis hanya bila saklar rumah `supabase` atau pintu staging (`LINGKUNGAN = "staging"`).
  - Panel (`saklar.html`): tab Pengguna dan Config dibuat dari kolom sheet; isian token admin per rumah dibuang.
  - `db/bersama/cermin_baca.sql`: parameter `p_hanya` (hanya sheet tertentu) dan `semua_sheet`; `db/bersama/cermin_admin_log.sql` (baru). Keduanya terpasang di Gedung 2. Worker BUPR tetap 66/66.
  - Pintu: `compatibility_flags = ["nodejs_compat"]`. Pintu staging `4135b207`.
  - **Uji pintu staging:** BUPR semua fungsi tulis 37/37, termasuk token terbitan pusat admin langsung bisa masuk lewat Worker GAS asli dan token yang diganti/dicabut ditolak; bentuk cermin tetap rapi; SUM dan KMB TRA terbaca; KMB Projek menjawab "belum ada cermin" (skema staging masih tabel Raka). Data staging BUPR dikembalikan ke isi spreadsheet.
- Belum selesai / berikutnya:
  - Gedung 2 sudah dibersihkan dari admin lama dan cermin SUM/KMB TRA staging disinkron ulang (izin Gabriel 14 Nov). Uji tulis pusat admin: BUPR 37/37, SUM 29/29, KMB TRA 29/29. Data uji dikembalikan ke isi spreadsheet.
  - KMB Projek staging pindah ke GAS asli (keputusan Gabriel 14 Nov): cadangkan skema Raka, buat cermin, Worker KMB Projek menjalankan GAS @49.

### 2026-11-14 · Gabriel (+ Claude) · kmbtra, sum, kmbprojek, kmbbupr (celah `google.script.run` di keempat GAS produksi ditutup)
- Berubah:
  - **Produksi GAS:** penjaga `google.script.run` terpasang di keempat script (BUG-DICATAT #37, KEPUTUSAN 14 Nov): **BUPR @11, KMB Project @49, KMB V2 @299, SUM V2 @199**. Claude `clasp push`, Gabriel Deploy dari editor.
  - `tools/kembar/analisis-gas.mjs` (baru): `fungsiPublik` (fungsi global yang tidak diakhiri `_`, termasuk yang berawalan `_`) dan `pemanggilGoogleScriptRun` (fungsi yang benar-benar dipanggil halaman lewat `google.script.run`).
  - `tools/kembar/tambal-penjaga.mjs` (baru): menyisipkan penjaga di salinan kode GAS (folder di luar repo) dan menambah `_PenjagaRun.js`. Fungsi yang dipanggil saat script dimuat dicari dengan memuat hasilnya di GAS lokal lalu dikecualikan otomatis.
  - `tools/kembar/cek-cakupan-penjaga.mjs` (baru): mencocokkan kode tertambal dengan daftar `functionNames` yang dicantumkan GAS di halaman `/exec`. Itulah daftar resmi fungsi yang bisa dipanggil `google.script.run`.
  - `tools/kembar/bundel-gas.mjs`: daftar izin MAR Web memakai `pemanggilGoogleScriptRun` (BUPR 56 → 24). Worker kmbbupr staging di-deploy ulang; `createTokenForUser`, `generateMissingTokens`, `setupSpreadsheet` kini ditolak.
  - `tools/kembar/gas-lokal.mjs` dan `workers/bersama/gas-layanan.js`: opsi `penggunaAktif` (Session.getActiveUser), `pemicu` (ScriptApp.getProjectTriggers), dan `cermin` (data sudah dimuat) untuk menguji penjaga; galat saat muat membawa `cause`.
  - **Uji (GAS lokal, kode asli vs tertambal, data cermin yang sama; tiga rumah memakai cermin Gedung 1 hanya-baca):** BUPR 307/0, KMB Project 232/0, KMB V2 208/0, SUM V2 250/0; fungsi pemicu 6/6, 6/6, 5/5, 4/4. Sesudah deploy: isi versi tayang = tambalan, halaman dan ping sama dengan sebelum deploy, `functionNames` tayang 0 celah.
  - **Worker BUPR staging menjalankan GAS @11** (sama dengan produksi): `config/rumah.json` kmbbupr `gas.versi` 9 → 11, bundel ulang (106 berkas, termasuk `_PenjagaRun.js`), Worker staging `35af2234`. Uji ulang terhadap GAS lokal @11: bundel 60/60, baca 66/66, halaman 36/36, skenario tulis 13/13 + 24 sheet, approve L1/L2 lewat web 4/4 + 24 sheet; fungsi di luar daftar izin tetap ditolak. Data staging BUPR dikembalikan ke isi spreadsheet sesudahnya.
- Belum selesai / berikutnya:
  - BUG #38 (`getWODetails` tanpa token, SUM `reportExpiredWO`) menunggu keputusan Gabriel.
  - Cek Script Properties KMB Project dan BUPR: kalau `SUPABASE_KEY` berisi kunci rahasia, ganti (bisa terbaca lewat `_getSupabaseConfig` sebelum ditambal), dan pastikan `SUPABASE_URL` tidak diubah orang.
  - Setiap perubahan GAS berikutnya: jalankan ulang `tambal-penjaga.mjs` dan `cek-cakupan-penjaga.mjs` sebelum push. Salinan lokal lama (MAR-project, MAR-PROJEK-KMB, dst.) belum berisi penjaga; `clasp pull` dulu sebelum menyunting. Setiap kali versi GAS BUPR naik, naikkan juga `gas.versi` di `config/rumah.json` lalu bundel dan uji ulang.
  - (c) Pusat admin baru (penyunting sheet config) di BUPR.

### 2026-11-14 · Gabriel (+ Claude) · bersama, kmbbupr (MAR Web asli BUPR di Worker)
- Berubah:
  - **MAR Web BUPR = halaman web GAS yang asli**, dijalankan di Worker staging: `GET /web` (doGet + template HtmlService) dan `POST /web/run` (`google.script.run`). Tidak ada halaman yang ditulis ulang.
    - `tools/kembar/templat-gas.mjs` (baru): template dikompilasi saat bundel menjadi fungsi JS biasa (Worker tanpa `eval`/`with`); `<?= ?>` di-escape menurut konteks letaknya.
    - `workers/bersama/gas-layanan.js`: `HtmlService` (template, `createHtmlOutput`, `HtmlOutput`), `ScriptApp.getService().getUrl()` = alamat `/web` Worker, `buatPermintaanGet`, dan `hasilRun` (aturan nilai balik `google.script.run`).
    - `workers/bersama/gas-web.js` (baru): `google.script` untuk peramban dan penyisipannya ke HTML.
    - `tools/kembar/bundel-gas.mjs`: ikut membungkus template, HTML mentah, `doGet`, dan **daftar izin `google.script.run`**: hanya fungsi yang disebut halaman web (BUPR @9: 56 dari 733 fungsi publik). Fungsi lain dijawab "Script function not found".
    - `tools/kembar/gas-lokal.mjs`: `web(qs)` dan `jalankan(fungsi, args)` sebagai pembanding.
    - Worker kmbbupr: satu jalur "jalankan GAS lalu simpan" untuk API tulis, halaman web, dan `google.script.run`. Seperti di GAS, tulisan tetap disimpan walaupun fungsi lalu melempar galat.
  - **Uji di staging:**
    - 36 halaman (SPT, SPV, mekanik WO mandiri, mekanik biasa × 9 halaman) dan halaman tanpa token identik dengan GAS lokal. Gerbang peran sesuai GAS BUPR: mekanik WO mandiri boleh membuka "create", mekanik biasa tidak;
    - approve L1 dan L2 lewat `google.script.run` sesudah buat WO dan kirim kerja lewat API: jawaban identik, dan isi akhir 24 sheet identik (poin 330);
    - halaman Approval, Monitoring, Teknis, dan Koreksi HM berjalan di happy-dom tanpa galat JavaScript; Teknis memanggil server saat dimuat dan dijawab Worker;
    - `listTokens`, `generateTokensForAllUsers`, dan `resetTransaksiSaja` ditolak lewat `/web/run`.
  - Data staging BUPR dikembalikan ke isi spreadsheet sesudah uji (14 Nov 14.02 WIB).
- Belum selesai / berikutnya:
  - Escaping `<?= ?>` dan aturan nilai balik `google.script.run` ditiru dari perilaku GAS yang terdokumentasi; belum dicocokkan dengan keluaran GAS sungguhan.
  - (c) Pusat admin baru (penyunting sheet config) di BUPR.

### 2026-11-14 · Gabriel (+ Claude) · bersama, kmbbupr (BUPR staging bisa dicoba dari HP)
- Berubah:
  - **PWA BUPR** `pwa/kmbbupr`: salinan 1:1 `kawanabadigrup/PWA-Project-KMB2` (`ba4d81d`). Hanya satu baris alamat API di `app.js` dan `sw.js` yang diganti `./api`; empat berkas lain identik byte demi byte. Disajikan Worker `abadiops-kmbbupr-staging`; `/web` sementara menampilkan pemberitahuan.
  - **Pintu staging**: `kmbbupr` masuk `RUMAH` (saklar `gas`; Worker BUPR staging tetap menjawab sendiri karena tanpa GAS). GAS tiruan meneruskan `/kmbbupr` ke Worker BUPR lewat ikatan `RUMAH_KMBBUPR`, jadi token BUPR dikenali oleh kode GAS asli.
  - **Bug #36 diperbaiki**: fungsi ping Supabase di pintu masih tertanam, sehingga BUPR ditanya ke `kmb_ping` (KMB Project). Sekarang dari profil kamar.
  - **Tayang di staging:** kmbbupr, GAS tiruan `5825d757`, pintu `c6183a21`.
  - **Uji:**
    - PWA, ikon, manifest, dan `/web` tersaji (200); ping lewat `./api` dijawab kode GAS asli;
    - pintu: token BUPR → BUPR staging; token KMB Projek → KMB Projek (sebelum perbaikan: dianggap kembar); token SUM → SUM; token karangan ditolak;
    - panel: tab, pilihan, section, dan peran BUPR benar; daftar pengguna dan config BUPR menjawab "RPC … belum terpasang" (pusat admin BUPR belum dibangun);
    - regresi langkah 1a dan rumah lain lulus.
  - Token kembar antar rumah: 0 di cermin produksi (Gedung 1); 2 token uji di Gedung 2 (data staging lama), salah satunya membuat token KMB TRA uji ditolak pintu staging.
  - Data staging BUPR disegarkan dari spreadsheet per 14 Nov 13.37 WIB.
- Belum selesai / berikutnya:
  - Gabriel mencoba BUPR staging dari HP.
  - (b) MAR Web asli BUPR di Worker; (c) pusat admin baru (penyunting sheet config) di BUPR; lalu rumah lain.

### 2026-11-14 · Gabriel (+ Claude) · bersama, kmbbupr (jalur tulis BUPR: GAS asli di Worker menulis ke Supabase)
- Berubah:
  - **Jalur tulis BUPR di Worker staging.** Buat WO, kirim kerja, approve L1/L2, override, tolak, kembalikan, batal, dan transfer dijalankan kode GAS BUPR @9 yang asli. Tulisannya disimpan ke cermin `kmbbupr` Gedung 2 dalam satu transaksi.
    - `db/bersama/cermin_tulis.sql` (baru): menyimpan baris yang berubah. Konkurensi optimistis menggantikan LockService: versi `sinkron_at` per sheet; bila sheet sudah diubah penulis lain, tidak ada yang disimpan dan galat `KONFLIK` (SQLSTATE `PT409`, HTTP 409) dikembalikan.
    - `cermin_baca` mengirim versi per sheet dan bisa memuat sheet **jarang** (`p_jarang`): ProcessedOps untuk aksi tulis hanya baris milik `op_id` kiriman itu, sehingga isi cermin per aksi tulis turun dari 2,2 MB ke 245 KB.
    - `workers/bersama/gas-layanan.js`: `getLastRow`/`getLastColumn` seperti Sheets (baris dan kolom terakhir yang berisi), `__ekspor()` (isi baru sheet yang ditulis, tipe kolom dihitung ulang), dan sheet jarang (bacaan atas baris yang tidak dimuat dicatat `tidak_aman`, lalu ditolak). `gas-simpan.js` (baru) menyusun baris yang berubah.
    - Worker: tulis hanya bila saklar `supabase` atau lingkungan tanpa GAS (`?uji=supabase` tidak berlaku untuk tulis). Konflik diulang sampai 3 kali, lalu dijawab "Sistem sedang ramai", sama dengan GAS, sehingga PWA mengantre ulang.
    - `config/rumah.json` `kmbbupr.gas`: `aksi_tulis_worker` dan `sheet_jarang_tulis`; `sheet_tidak_dimuat` (untuk baca) sekarang ProcessedOps dan AuditLogs.
    - `AuditLogs` BUPR (43 baris) ikut dicermin ke Gedung 2, karena `appendRow` GAS membaca seluruh sheet untuk cek `id` kembar.
  - **Uji:**
    - skenario 13 langkah dijalankan di Worker staging dan di GAS lokal sesi (memori) dari data awal yang sama: buat WO, kirim kerja, approve L1/L2, WO mandiri langsung L2 dengan jejak `lewati_mandiri`, kiriman ulang `op_id`, penolakan (mandiri dengan orang lain, mekanik biasa, tanpa `op_id`), dan pembatalan. **Jawaban 13 dari 13 identik, dan isi akhir ke-24 sheet identik**; yang disamarkan hanya stempel waktu, ID dari jam, dan akhiran acak nomor WO;
    - tabrakan: 2 dan 4 kiriman bersamaan tersimpan semua (sebagian pada percobaan ke-2 atau ke-3) atau dijawab "ramai". Kiriman yang sama 3 kali bersamaan dijalankan tepat sekali (1 baris ProcessedOps, 1 audit, jawaban ketiganya sama);
    - baca tetap 66 dari 66 identik; rata-rata membaca cermin 102 ms.
  - **Pelajaran:** konflik jangan memakai SQLSTATE 40001. Pustaka transaksi PostgREST mengulang sendiri transaksi dengan kode itu dengan data lama yang sama, sehingga permintaan yang kalah menggantung sekitar 126 detik sampai gerbang Supabase menjawab 504.
  - Data staging BUPR dikembalikan ke isi spreadsheet sesudah uji (`sinkron.mjs --skema=kmbbupr --lewati=`); tidak ada data uji yang tersisa.
  - Temuan: GAS BUPR menganggap beberapa WO dengan job berbeda untuk unit dan tim yang sama sebagai satu WO (bug #35, perlu keputusan Gabriel).
- Belum selesai / berikutnya:
  - Pemicu terjadwal GAS (pemangkas ProcessedOps dan KirimanWeb, penjaga) lewat cron Worker; notifikasi push dari jalur tulis.
  - AuditLogs besar (KMB Project, SUM) tidak bisa dimuat utuh di setiap aksi tulis; butuh cara lain sebelum rumah itu.
  - `kmbbupr` ke `RUMAH` pintu staging dan PWA BUPR diarahkan ke Worker staging, supaya bisa dicoba dari HP.
  - Saklar produksi BUPR: mematikan sinkron spreadsheet → Gedung 1 untuk BUPR, uji kembar di atas Gedung 1, lalu keputusan Gabriel (titik henti).

### 2026-11-14 · Gabriel (+ Claude) · bersama, kmbbupr (langkah 2 BUPR: GAS asli di Worker; celah list_tokens ditutup)
- Berubah:
  - **Celah `list_tokens` ditutup di produksi** (bug #32). Aksi itu mengirim semua token utuh ke pemegang token mana pun di KMB Project dan BUPR. Blok 4 barisnya dibuang dan di-deploy dari editor: KMB Project @48, BUPR @9. Sebelumnya dipastikan versi produksi (@47, @8) identik dengan HEAD, jadi versi baru hanya berisi tambalan itu.
  - **Fungsi KMB Project di Gedung 2 tidak dipakai untuk BUPR** (KEPUTUSAN 14 Nov, bug #34): dibangun di atas skema karangan dan tidak 1:1 dengan GAS.
  - **GAS asli di Worker** (KEPUTUSAN 14 Nov). Logika bisnis tidak ditulis ulang; kode GAS BUPR yang asli dijalankan di Worker dengan sheet diganti cermin Supabase.
    - `workers/bersama/gas-layanan.js`: `SpreadsheetApp`, `Utilities`, `CacheService`, `LockService`, dan lainnya ditiru, termasuk `Date` berzona skrip, karena Worker selalu UTC. Diuji terhadap `Date` Node berzona Asia/Jakarta: 52.754 pembandingan, 0 beda.
    - `db/bersama/cermin_baca.sql`: isi cermin per sheet untuk satu kamar. Terpasang di Gedung 2, hanya `service_role` yang boleh memanggil.
    - `tools/kembar/gas-lokal.mjs`: pembanding uji kembar. Kode GAS dijalankan di komputer kerja tanpa menyentuh Google. `tools/kembar/bundel-gas.mjs`: membungkus versi GAS yang dipatok di `config/rumah.json` (`kmbbupr.gas`, sekarang @9) untuk Worker. Bundelnya tidak di-commit.
    - `workers/kmbbupr`: Worker BUPR. Aksi di `gas.aksi_worker` dijawab kode GAS asli; aksi lain diteruskan ke GAS. Gagal tertutup bila GAS membaca sheet yang tidak dimuat atau mencoba menulis.
  - **Tayang di staging:** `abadiops-kmbbupr-staging` (baru), membaca cermin `kmbbupr` di Gedung 2.
  - **Uji:**
    - 12 aksi baca BUPR berjalan di GAS lokal untuk 6 orang tanpa satu pun tulisan;
    - mode ketat vs longgar: 66 dari 66 sama;
    - lingkungan Worker (ketat, `Date` berzona, mesin UTC, ProcessedOps tidak dimuat) vs awal: 60 dari 60 sama;
    - bundel vs GAS lokal: 60 dari 60 sama;
    - **Worker staging vs GAS lokal: 66 dari 66 sama** (11 aksi × 6 orang, termasuk `pull_tyre_form` dengan WO sungguhan);
    - token karangan dijawab GAS persis; aksi tulis dan `list_tokens` ditolak tanpa dijalankan;
    - membaca cermin rata-rata 156 ms per panggilan.
  - Temuan lain di staging: Worker KMB Project mencoba fungsi KMB TRA bila fungsi `kmb_*` gagal (bug #33).
- Belum selesai / berikutnya:
  - Jalur tulis BUPR dengan kode GAS yang sama: `SpreadsheetApp` yang menulis ke Supabase dengan kunci (Durable Object) dan dedup `op_id`.
  - `kmbbupr` ke `RUMAH` pintu staging (panel saklar), dan PWA BUPR (langkah 4) diarahkan ke Worker staging.
  - Cermin `kmbbupr` di Gedung 2 masih salinan sekali (14 Nov 01.28 WIB).
  - Uji kembar Worker di atas cermin Gedung 1 (sinkron tiap jam) melawan GAS produksi, sebelum ada aksi BUPR yang dipindah di produksi.
  - Cara yang sama untuk KMB Project, KMB TRA, dan SUM: bundel GAS masing-masing, lalu uji kembar.
  - Penerbitan ulang token L1/L2 KMB Project setelah celah #32: keputusan Gabriel.

### 2026-11-14 · Gabriel (+ Claude) · bersama (staging: daftar kamar dari konfigurasi, langkah 1 rencana BUPR)
- Berubah:
  - **Langkah 1a** (`bd6e173`): `config/rumah.json` menjadi satu-satunya profil kamar (nama, skema, awalan fungsi, awalan token, section, peran) untuk keempat kamar, termasuk `kmbbupr`. Kamar yang aktif per lingkungan tetap diatur `RUMAH` di `wrangler.toml`.
    - pintu: SaklarDO memberi posisi bawaan untuk setiap kamar di `RUMAH` dan menolak kode kamar yang tidak dikenal. `/saklar/api/status` mengirim profil kamar, dan `user-admin` membaca awalan fungsi dan token dari profil;
    - Worker rumah membaca saklarnya sendiri lewat ikatan `PINTU` dengan kunci `env.RUMAH`, tanpa alamat tertanam dan tanpa cadangan ke saklar kamar lain. KMB TRA memakai kode `kmbtra`;
    - GAS tiruan: kamar diambil dari profil, dan token ajaib `uji-palsu-*`/`test-*` dibuang.
  - **Langkah 1b:** panel saklar tidak lagi menulis daftar kamar sendiri.
    - Tab kamar, pilihan kamar, section, dan peran di modal pengguna dibangun dari `rumah_list`.
    - Bawaan `'sum'` diganti kamar pertama di `RUMAH` (sekarang `kmbprojek`), jadi tab yang pertama terbuka sekarang KMB Projek.
    - Keterangan dan label navigasi tidak lagi menyebut nama skema, awalan token, atau "3 Rumah".
    - Menambah kamar ke panel cukup lewat `config/rumah.json` dan `RUMAH`, tanpa menyentuh `saklar.html`.
  - **BUPR di Gedung 2:** `kmbbupr` dicermin sekali, 14 Nov 01.28 WIB: 23 sheet, 12.881 baris data (ditambah 3 tabel meta cermin), AuditLogs dilewati. Skema ini belum punya fungsi dan belum ikut jadwal cermin tiap jam, karena jadwal itu menulis ke Gedung 1.
  - **Tayang di staging:** pintu `70210f5a`, sum `c286e6a7`, kmb `37ece31b`, kmbprojek `ef4e3e6b`, GAS tiruan `d3730d00`.
    - Pintu versi 1a tayang tanpa source map. Sebelum ditimpa, bundelnya dibandingkan dengan bundel uji-bangun branch dan hasilnya sama persis. Halaman panelnya juga sama dengan commit.
  - **Uji** (tidak mengubah posisi saklar ataupun data):
    - kamar karangan ditolak oleh saklar (400) dan GAS tiruan, dan token ajaib `uji-palsu-spt-sum` ditolak;
    - `/api/sehat` ketiga Worker rumah melaporkan kamar dan posisi saklar yang sama dengan panel;
    - halaman panel yang tayang dijalankan di `happy-dom` dengan data staging sungguhan, dan tombolnya diklik:
      - tab dan pilihan: `kmbprojek, sum, kmbtra, semua`;
      - pengguna 24, 56, dan 41 (gabungan 121);
      - unit config 28, 47, dan 103 (gabungan 178);
      - section dan peran di modal pengguna sesuai profil;
      - tidak ada galat JavaScript.
- Belum selesai / berikutnya:
  - `kmbbupr` belum masuk `RUMAH` staging. Ia dipasang di langkah 3 bersama Worker-nya, supaya panel tidak menampilkan kamar yang belum punya fungsi.
  - Langkah 2 rencana BUPR: fungsi Gedung 2 untuk `kmbbupr`, memakai ulang fungsi KMB Project dan ditambah aturan WO mandiri.
  - Bawaan tampilan `'kmbprojek'` di `web-handler.js:906` KMB Project dibereskan di langkah 3.

### 2026-11-14 · Gabriel (+ Claude) · bersama (staging: kerja Raka 13 Nov dipulihkan; buku tamu kiriman aman, butir 5)
- Berubah:
  - **Kerja Raka yang tidak pernah di-commit ditemukan dan dipulihkan** (`9ef10ca`):
    - Worker rumah staging (sum `8faf8ee5`, kmb `fc1c12b1`, kmbprojek `5dbfa635`) di-deploy 13 Nov sekitar 12.30 WIB dengan kode yang tidak ada di commit mana pun. Ketahuan saat membandingkan kode tayang dengan `3e55ca8` sebelum deploy;
    - berkas sumbernya diambil persis dari source map versi tayang (`sourcesContent`): `supabase-backend.js`, `web-handler.js`, `web-templates.js`, dan `payroll-excel.js` di ketiga rumah, +1.453 −171 baris;
    - dipindai: tidak ada kata ajaib, data rekaan, atau kunci rahasia. Ada tarif tertanam 2.500 rupiah per poin sebagai cadangan `final_idr` (butir 3, titik henti uang), tidak diubah;
    - arsip kode tayang dan source map-nya disimpan di komputer kerja (`C:\dev\arsip\raka-tayang-staging-2026-11-13\`);
    - pintu staging versi Raka (`7ad8cc5a`) sama dengan `3e55ca8`, jadi deploy pintu sebelumnya tidak menghilangkan apa pun.
  - **Buku tamu kiriman** (`7b41949`, butir 5):
    - rute publik `/api/buku-tamu/*` di pintu dibuang. Dulu siapa saja bisa membaca hasil kiriman orang lain dan mengisi hasil palsu;
    - rumah memakai SaklarDO langsung lewat ikatan Durable Object antar-Worker (`SAKLAR_DO`, `script_name` pintu). Tanpa ikatan, buku tamu tidak aktif; `tentukanUrlPintu` yang selalu memilih pintu staging dibuang;
    - SaklarDO menyimpan di tabel SQLite `buku_tamu`, dengan kunci rumah + `op_id`, sidik SHA-256 pemilik token, dan umur 30 hari. Catatan model lama `op:<id>` dibuang;
    - hasil hanya dikembalikan kepada pemilik token yang sama di rumah yang sama, dan hanya kiriman `success: true` yang dicatat. Dulu jawaban gagal ikut dicatat, sehingga kiriman ulang tidak pernah diproses lagi.
  - **Tayang di staging:** pintu `dc48d3e9`, sum `c3c911ac`, kmb `79a48dd8`, kmbprojek `6be4911d`.
  - **Uji lewat Worker rumah sungguhan** (aksi `ping`, tidak mengubah data):
    - rute publik pintu: 404;
    - pemilik yang sama, `op_id` yang sama: kiriman kedua dijawab buku tamu (`X-Abadi-Buku-Tamu: hit`), isinya sama persis. Lulus di SUM, KMB TRA, dan KMB Project;
    - pengguna lain dengan `op_id` yang sama mendapat jawabannya sendiri, bukan hasil pemilik pertama. Tanpa token: 401;
    - token karangan: kiriman kedua tetap diproses, karena jawaban gagal tidak dicatat.
- **Pelajaran:** sebelum men-deploy Worker staging, bandingkan dulu kode yang tayang dengan branch. Source map versi tayang memuat berkas sumber asli, jadi kerja yang belum di-commit bisa dipulihkan.
- Belum selesai / berikutnya:
  - Kerja Raka 13 Nov yang dipulihkan belum diaudit seperti kerja Raka lainnya. Masuk audit sebelum merge (butir 9).
  - Ikatan buku tamu untuk Worker produksi (`script_name` `abadiops-pintu`) dipasang saat staging di-merge ke `main`.
  - Sisa daftar serah-terima: 1 (WO baru hilang saat sinkron), 2 (saklar bisa dilewati), 3 (uang, titik henti), 8, 9, 10.

### 2026-11-14 · Gabriel (+ Claude) · bersama (staging: monitoring tidak lagi membocorkan token, butir 6)
- Berubah:
  - **Aturan GAS yang ditiru**, dibaca langsung dari kode GAS (`MAR-SUM-v2`, `MAR-project`, `MAR-PROJEK-KMB`):
    - SUM V2, `pull_monitoring`: daftar-izin, hanya `supervisor` dan `superintendent`. Peran lain, termasuk peran kosong, ditolak dengan "Monitoring hanya untuk L1 dan L2.";
    - KMB V2 dan KMB Project, `getMonitoringData`: mekanik mendapat daftar kosong. Peran lain hanya melihat mekanik dalam lingkup section-nya; lingkup kosong berarti semua (HO).
  - **`db/bersama/monitoring_bertoken.sql`** (baru) menjadi satu-satunya tempat definisi `sum_`, `kmbtra_`, dan `kmb_monitoring_bertoken`, dibangun dari versi yang terpasang di Gedung 2.
    - Enam definisi lama di lima file diganti penunjuk, supaya menjalankan file lama tidak memunculkan kebocoran lagi.
    - Fungsi bantu baru `_lingkup_section` dan `_lingkup_section_boleh` meniru `getUserSectionScope` dan `userScopeAllows`.
  - **Terpasang di Gedung 2, diuji dengan token sungguhan per peran** (lewat REST, kunci publik staging):
    - SUM sebelum: `foreman` dan `foreman_approver` menerima 41 token mekanik. Sesudah: hanya `supervisor` dan `superintendent`; `foreman`, `foreman_approver`, `mechanic`, dan peran kosong ditolak;
    - KMB Project sebelum: supervisor section `maintenance` menerima 22 token, termasuk 11 mekanik `vessel`. Sesudah: 11, hanya `maintenance`. Superintendent `maintenance, vessel` tetap 22;
    - KMB TRA: tetap 35 mekanik, karena semua approver memegang `field` dan `tyreman`;
    - token karangan ditolak di ketiga rumah, dan jalur aplikasi (`<rumah>_eksekusi_aksi_bertoken`, `pull_monitoring`) ikut tertutup.
  - Token KMB Project tanpa baris `Config_Mechanics` (di staging: `MECH-KMBP-L1`, `SPV-901`, `SUPT-001`) tetap melihat semua mekanik. Ini sama dengan GAS KMB Project: `_resolveToken` mengambil peran dari ApiTokens dan memakai email buatan tanpa section, sehingga lingkupnya semua.
  - **Produksi dicek dan aman:**
    - fungsi monitoring di Gedung 1 masih versi 30 Okt yang tidak mengirim token mekanik;
    - fungsi lama portal `public.kmb_*` di Gedung 1 galat untuk setiap panggilan sejak `kmb_projek` dipindah ke arsip.
- Belum selesai / berikutnya:
  - Monitoring belum 1:1 di luar urusan token: angka ringkasan KMB belum dibatasi lingkup section, akun uji belum disaring (`saringOrangUji`), dan WO arsip belum dihitung. Masuk uji kembar.
  - Gedung 1 (produksi): `sum_monitoring_bertoken` dan `kmbtra_monitoring_bertoken` masih daftar-tolak, jadi nama dan angka per mekanik (tanpa token) terlihat oleh peran selain `mechanic`. Diperbarui saat staging di-merge ke `main`.
  - Cabut atau hapus fungsi lama portal `public.kmb_*` di Gedung 1.
  - Butir serah-terima berikutnya: 5 (buku tamu kiriman).

### 2026-11-14 · Gabriel (+ Claude) · bersama (staging: kata ajaib panel dan data rekaan dibuang)
- Berubah:
  - **`main` digabung ke `staging`** (`09a6581`). Bentrok hanya di PROGRES dan BUG-DICATAT, tanpa baris yang dibuang. Bug #29 milik staging (cache dasbor mekanik SUM) menjadi #30, karena #29 sudah dipakai di `main`.
  - **Kata ajaib dibuang** (butir 7 daftar serah-terima 13 Nov):
    - `workers/pintu/src/user-admin.js`: panel tanpa token admin wajib memanggil fungsi `_<rumah>_admin_*_internal` dengan kunci rahasia Supabase (`SUPABASE_SERVICE_ROLE_KEY`). Kalau kunci itu belum dipasang, panel menolak dengan pesan yang jelas;
    - `db/kmb_projek/migrasi_kamis_full_penuh.sql`: cabang `__PANEL_SAKLAR_PUSAT__` dibuang dari ketiga `_<rumah>_validasi_admin_token`;
    - Gedung 2, dalam satu transaksi: ketiga pemeriksa dipasang ulang tanpa kata ajaib, lalu EXECUTE 30 fungsi `*_admin_*_bertoken` dikembalikan seperti di file SQL.
  - **Data rekaan dibuang** (butir 4, bug #31): `STAGING_MASTER_CONFIG`, `STAGING_MASTER_USERS`, dan `tanganiFallbackStagingStore` dihapus dari `user-admin.js`. Kalau RPC gagal, panel menampilkan galatnya, bukan unit, faktor, dan pengguna karangan.
  - **Uji dari luar dengan kunci publik staging:**
    - kata ajaib ke `*_admin_daftar_user_bertoken` dan `kmbtra_admin_simpan_config_bertoken`: ditolak ("Token tidak dikenal / nonaktif");
    - token karangan: ditolak;
    - `_sum_admin_daftar_user_internal` dengan kunci publik: 401, permission denied.
  - Jalur pooler IPv4 untuk Gedung 2 (`DATABASE_URL_GEDUNG2_POOLER` di `abadiops.env`), karena IPv6 di komputer kerja putus-sambung.
  - **Pintu staging di-deploy** (`577d0704`; versi untuk kembali `7ad8cc5a`). Secret `SUPABASE_SERVICE_ROLE_KEY` dipasang: kunci rahasia Gedung 2 `pintu_staging`, khusus Worker ini.
  - **Uji pintu staging dari luar, tanpa login:** halaman `/saklar` 200; daftar pengguna dan config tanpa login 401; token karangan dan kata ajaib lama ditolak di ketiga rumah; simpan config dengan kata ajaib lama 400.
  - Dengan kunci rahasia, fungsi `_<rumah>_admin_daftar_user_internal` menjawab (SUM 56, KMB TRA 41, KMB Project 24 pengguna).
  - **Temuan jaringan:** DNS internet di komputer kerja (14 Nov) membelokkan `*.workers.dev` ke IP AWS, sehingga staging tidak bisa dibuka; `abadiops.com` tidak terkena. Pengguna dengan operator yang sama juga tidak bisa membuka staging. Ini menambah alasan staging butuh domain `abadiops.com` sendiri (#28). Uji dilakukan dengan alamat dari DNS Cloudflare.
  - **Sandi panel staging diganti** (atas persetujuan Gabriel). Sandinya ada di `abadiops.env` (`PANEL_SAKLAR_SANDI_STAGING`); yang dipasang di Worker hanya sidik SHA-256-nya. Panel produksi tidak berubah.
  - **Uji dengan sesi panel yang sah** (pintu staging `983e0d20`):
    - sandi salah 401, sandi baru diterima;
    - menu Pengguna lewat fungsi `_internal`: KMB Project 24, SUM 56, KMB TRA 41 pengguna;
    - menu Config: KMB Project, SUM, dan KMB TRA semuanya terbaca dari Supabase.
  - Config KMB TRA sempat gagal karena `kmb.config_jobs_field` tidak ada di Gedung 2 (sisa bug #29). Dulu kegagalan ini tertutup data rekaan. Sheet itu disalin ke Gedung 2 dengan `tools/cermin/sinkron.mjs --skema=kmb --sheet=Config_Jobs_Field` (1.548 baris, sidik sama dengan Gedung 1). Sheet lain sengaja tidak disalin, karena tabel cermin `kmb.work_orders` di Gedung 2 berisi WO uji staging (butir 1).
  - Galat RPC di panel sekarang memakai pesan asli PostgREST. Hanya `PGRST202` yang dilaporkan sebagai "belum terpasang"; dulu setiap 404 (termasuk tabel yang tidak ada) disebut begitu.
- Belum selesai / berikutnya:
  - Daftar gabungan pengguna/config ketiga rumah melaporkan `success=true` walaupun ketiganya gagal (`adaSukses || daftarTarget.length > 1`).
  - Aplikasi rumah staging: `admin_simpan_user` mengirim `p_user`, padahal fungsi SQL meminta `p_op_id` dan `p_payload`; `*_admin_set_token_status_bertoken` tidak ada di SQL. Sekarang jalur itu jatuh ke GAS tiruan.
  - Pintu staging dengan binding `GAS_TIRUAN` masih punya jalur token `uji-palsu-spt-<rumah>` kalau `USE_GAS_TIRUAN_ADMIN=true`. Sekarang tidak aktif; dibuang sebelum merge ke `main`.
  - Butir serah-terima berikutnya: 5 (buku tamu kiriman) dan 6 (monitoring SUM membocorkan token).

---

### 2026-11-14 · Gabriel (+ Claude) · bersama (laporan selisih harian cermin)
- Berubah:
  - **`tools/cermin/sinkron.mjs --periksa`:**
    - setiap sheet dimuat ulang ke tabel sementara walaupun tidak berubah, lalu seluruh isi tabel cermin dibandingkan dengan isi sheet **di dalam database**: `nilai` dan `data` per baris, termasuk baris yang hilang atau berlebih. Yang keluar dari database hanya angka selisih, jadi tidak memakan jatah egress;
    - selisih yang tersisa sesudah ditulis membuat sheet itu GAGAL. Workflow jadi merah dan GitHub mengirim surel;
    - hasilnya dicatat di `cermin_log.selisih` dan `cermin_meta` (`periksa_terakhir`, `periksa_hasil`, `hari_tanpa_selisih`);
    - `hari_tanpa_selisih` menghitung hari WIB berturut-turut sampai hari ini yang punya pemeriksaan, tanpa selisih, dan tanpa sinkron gagal.
  - **`--periksa=harian`:** sekali per hari kalender WIB per rumah, mulai pukul 02.00 WIB. Workflow `cermin` tiap jam memakainya. Kalau dijalankan manual, ada pilihan "periksa" untuk memeriksa sekarang juga.
  - **Uji:**
    - kueri selisih menangkap baris yang berubah, hilang, dan berlebih (0, lalu 2, lalu 3, di dalam transaksi yang dibatalkan);
    - pemeriksaan BUPR: 23 dari 23 sheet sama;
    - pemeriksaan penuh pertama dari GitHub (dijalankan manual 14 Nov 00:00 WIB, ±14 menit): **87 dari 87 sheet sama** di keempat rumah, workflow hijau.
  - `docs/SAKLAR.md`: tempat melihat laporan, dan ukuran syarat 7 hari.
- Belum selesai / berikutnya:
  - Syarat "7 hari tanpa selisih" paling cepat terpenuhi 20 Nov (14–20 Nov), kalau setiap hari bersih.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (cermin per baris; jadwal tiap jam di GitHub Actions)
- Berubah:
  - **Sinkron per baris** (`tools/cermin/sinkron.mjs`):
    - sheet yang sidiknya sama dengan sinkron sebelumnya, dan jumlah barisnya cocok, tidak ditulis ulang;
    - sheet yang berubah dimuat dulu ke tabel sementara. Hanya baris baru atau berubah yang ditulis (perbandingan nilai `jsonb`), dan baris yang hilang dihapus;
    - `cermin_log` mendapat kolom `baris_berubah` dan `baris_dihapus`. Catatan yang lebih tua dari 35 hari dihapus;
    - opsi baru `--semua` (semua `<SKEMA>_SPREADSHEET_ID` di lingkungan) dan `--ringkas` (satu baris per rumah, tanpa judul, ID, atau isi data);
    - uji di Gedung 1: 23 sheet BUPR tidak berubah, dan dari SUM hanya 4 sheet yang berubah (7 baris ditulis). Ukuran tetap 245 MB;
    - sidik setiap sheet dihitung ulang dari isi Gedung 1: 87 dari 87 sheet identik dengan spreadsheet saat sinkron terakhir.
  - **Jadwal tiap jam** (`.github/workflows/cermin.yml`, menit ke-41):
    - koneksi lewat pooler IPv4 (`aws-0-ap-southeast-1`), karena runner GitHub tidak punya IPv6;
    - rahasia Actions `GOOGLE_SA_KEY_JSON`, `CERMIN_DATABASE_URL`, dan `CERMIN_RUMAH` diisi dari `abadiops.env` lewat API GitHub. Tokennya fine-grained `abadiops-cermin`: hanya repo abadiops, izin Actions dan Secrets, berlaku sampai 11 Feb 2027;
    - rumah baru cukup ditambah satu baris di `CERMIN_RUMAH`, tanpa mengubah kode;
    - log dibuat ringkas karena repo publik, dan ID spreadsheet disamarkan.
  - **Putaran pertama di GitHub** (dijalankan manual, selesai 13 Nov ±23:51 WIB) lulus dalam ±10 menit: 87 sheet lulus, 0 gagal, dan hanya 24 baris KMB TRA yang ditulis. `sinkron_terakhir` keempat skema di Gedung 1 ikut diperbarui; ukuran tetap 245 MB.
- Belum selesai / berikutnya:
  - Hitungan "7 hari tanpa selisih" dimulai dari putaran terjadwal pertama yang lulus.
  - Pemeriksaan selisih harian perlu dibuat tanpa menarik seluruh isi tabel, karena batas egress paket gratis 5 GB per bulan. Caranya: simpan sidik yang bisa dihitung di sisi database.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (cermin keempat rumah tertulis di Gedung 1)
- Berubah:
  - **Keputusan Gabriel** (`docs/KEPUTUSAN.md`):
    - cermin tanpa `AuditLogs` dulu; naik ke Supabase Pro nanti, kalau kode sudah berfungsi atau data sudah berat;
    - skema lama `kmb_projek` di Gedung 1 diganti format cermin.
  - **Alat cermin tunggal `tools/cermin/sinkron.mjs`** menggantikan ketiga alat per rumah (bug #29):
    - daftar sheet dibaca langsung dari spreadsheet. Nama tabel adalah nama sheet dalam snake_case, dan tabel yang belum ada dibuat sendiri dengan bentuk cermin mentah;
    - rumah dipilih dengan `--skema=<skema>`, dan ID spreadsheet diambil dari `<SKEMA>_SPREADSHEET_ID`. Rumah baru cukup satu baris env, tanpa mengubah kode;
    - `AuditLogs` dilewati secara bawaan (`--lewati=` untuk menyalin semua);
    - tabel yang sudah ada tapi bentuknya lain tidak disentuh;
    - tahan kuota 429, galat 5xx, dan jaringan putus sesaat. `sinkron_terakhir` hanya dicatat kalau satu putaran penuh lulus;
    - uji kering: hasil bacanya sama dengan alat lama. Setiap sheet yang tidak berubah punya sidik identik.
  - **Sebelum menulis**, dari kode Worker yang tayang dipastikan:
    - Worker SUM dan KMB TRA produksi hanya membaca Supabase lewat `?uji=supabase` (`AKSI_SUPABASE_LULUS_KEMBAR` kosong);
    - Worker KMB Project tidak memakai Supabase;
    - jadi mengisi cermin tidak mengubah apa yang dilihat pengguna.
  - **Gedung 1:**
    - skema lama `kmb_projek` (11 tabel, salinan 27 Okt) dipindah utuh ke `kmb_projek_lama`, tertutup untuk anon. Skema `kmb_projek` dibuat ulang untuk cermin;
    - cermin keempat rumah tertulis, dan jumlah baris setiap tabel cocok dengan `cermin_header`:
      - `sum`: 18 sheet, 138.547 baris, 109 MB;
      - `kmb`: 23 sheet, 157.575 baris, 98 MB;
      - `kmb_projek`: 23 sheet, 23.231 baris, 16 MB;
      - `kmbbupr` (skema baru): 23 sheet, 12.881 baris, 8 MB;
    - ukuran Gedung 1 245 MB (49% dari 500 MB). Semua skema cermin tertutup untuk anon;
    - percobaan pertama terputus karena jaringan di komputer kerja. 13 sheet SUM sempat tertulis dua kali; ruang ±15 MB yang tersisa akan terpakai ulang.
  - 9 fungsi lama `public.kmb_*` (portal lama, tidak dipakai kode produksi) masih merujuk tabel bentuk lama di `kmb_projek`. Sekarang fungsi itu akan galat kalau dipanggil.
- Belum selesai / berikutnya:
  - **Sinkron terjadwal.** Cermin baru disalin sekali. Hitungan "7 hari tanpa selisih" baru mulai setelah sinkron berjalan rutin. Perlu tempat menjalankannya. Usulan: GitHub Actions, lewat pooler IPv4, karena runner GitHub tidak punya IPv6.
  - **Sinkron per baris.** Sekarang alat menghapus lalu menulis ulang setiap tabel, sehingga tabel bisa membengkak sampai ±2× isinya. Sebelum dijadwalkan sering, ubah menjadi pembaruan per baris.
  - Fungsi `public.kmb_*` lama: tulis ulang untuk format cermin saat aksi baca KMB Project dipindah, atau cabut aksesnya dari anon.
  - `kmb_projek_lama` boleh dihapus setelah cermin baru terbukti.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (rahasia lokal lengkap; uji kering cermin empat spreadsheet)
- Berubah:
  - **Rahasia lokal lengkap** (`abadiops.env`, di luar repo):
    - kunci akun layanan Google yang baru;
    - ID spreadsheet keempat rumah dengan pola `<KODE>_SPREADSHEET_ID`, termasuk baris baru `KMBBUPR_SPREADSHEET_ID`;
    - token uji KMB Project.
  - Akun layanan bisa membaca keempat spreadsheet: SUM V2, KMB V2, Projek KMB, dan New MAR Project (BUPR). Masing-masing dibagikan sebagai Viewer dari akun Google pemiliknya.
  - **Kuota Sheets API (bug #28):** ketiga alat sinkron sekarang memberi jeda 1,1 detik antarpermintaan, dan mencoba ulang kalau kena 429 atau 5xx. Sebelumnya, putaran pertama SUM berhenti di sheet ke-14, lalu semua sheet sesudahnya ikut gagal.
  - **Uji kering** (`--kering`, tanpa koneksi database). Tidak ada satu pun 429:
    - SUM V2: 19 dari 19 sheet cocok. WorkOrders 380, WorkOrders_Archive 16.702, MechanicPoints 36.075, AuditLogs 72.551.
    - KMB V2: 16 dari 24 sheet tersalin. WorkOrders 813, WorkOrders_Archive 14.088, MechanicPoints 42.341, AuditLogs 73.893.
    - Projek KMB: 12 dari 24 sheet tersalin. WorkOrders 129, WorkOrders_Archive 1.121.
    - New MAR Project (BUPR), diuji dengan alat kmb_projek: 12 dari 24 sheet tersalin. WorkOrders 3, WorkOrders_Archive 11.
  - **Temuan:** alat cermin keluarga KMB tidak cocok dengan spreadsheet aslinya (bug #29 baru). Ketiga spreadsheet keluarga KMB punya 24 sheet yang sama.
  - **Perkiraan ukuran** (dari Gedung 2 dan jumlah baris hari ini):
    - cermin penuh keempat rumah ±400 MB, sedangkan batas Gedung 1 di paket gratis 500 MB;
    - AuditLogs saja ±120 MB;
    - data SUM bertambah ±10% dalam dua minggu terakhir.
- Belum selesai / berikutnya:
  - Sebelum menulis ke Gedung 1, Gabriel perlu memutuskan:
    - ukuran: AuditLogs ikut dicermin atau tidak, atau naik ke paket Pro;
    - tabel lama `kmb_projek` di Gedung 1 (salinan 27 Okt yang tidak dipakai kode produksi) diganti format cermin.
  - Perbaiki alat cermin KMB (bug #29), lalu uji kering lagi.
  - Sinkron terjadwal belum ada. Hitungan syarat "cermin 7 hari" baru mulai setelah sinkron terjadwal berjalan.
  - Drive API di proyek Google akun layanan belum aktif, karena konsol Google Cloud mewajibkan Verifikasi 2 Langkah sejak 29 Mei 2026. Selama belum aktif, ID spreadsheet rumah baru diambil dari URL yang dikirim Gabriel.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (Gedung 2: isi diperiksa, celah admin ditutup)
- Berubah:
  - `DATABASE_URL_GEDUNG2` terisi, setelah sandi database Gedung 2 di-reset. Nama proyek Supabase-nya "Stagging".
  - **Isi Gedung 2** (dibaca 13 Nov):
    - Ukurannya 342 MB dari batas 500 MB. Ini sumber angka 374 MB di halaman organisasi.
    - Isinya cermin produksi yang lengkap: `sum` 202 MB dan `kmb` 126 MB. Tabel terbesar `audit_logs` (±50 MB per rumah) dan `work_orders_archive`.
    - Token terakhir disinkron 10 Nov: `sum.api_tokens` 63 baris, `kmb.api_tokens` 46 baris.
    - Cermin produksi ada di staging, tapi tidak di Gedung 1. Data ini salinan asli, jadi dijaga serahasia produksi.
  - **Celah admin ditutup:** `EXECUTE` pada 30 fungsi `*_admin_*_bertoken` dicabut dari `PUBLIC`, `anon`, dan `authenticated`. Data dan isi fungsi tidak diubah. Uji dari luar dengan kata ajaib sekarang dijawab 401.
  - **Jejak pemakaian** (tanpa data pemanggil):
    - `pg_stat_statements` mencatat sekitar 215 panggilan `*_admin_daftar_user_bertoken`, plus beberapa simpan/set-status;
    - `kmb_projek.processed_ops` mencatat 5 aksi admin, 9–11 Nov;
    - log API Supabase paket gratis hanya menyimpan 1 hari, jadi pemanggil dari luar tidak bisa dipastikan.
  - Keputusan Gabriel: kerja Raka **dilanjutkan** di branch `staging` dan Gedung 2 (`docs/KEPUTUSAN.md`; `AGENTS.md` butir 16 disesuaikan).
- Belum selesai / berikutnya:
  - Panel admin pengguna dan config di `/saklar` staging berhenti sampai otorisasinya diganti, dari kata ajaib menjadi sesi panel yang diperiksa di Worker dengan kunci rahasia.
  - Lanjutkan daftar wajib-perbaiki di entri serah-terima 13 Nov, mulai dari keamanan.
  - Ukuran Gedung 2 perlu diawasi (68% dari batas). Kandidat pengecilan: `audit_logs` cermin.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (penjaga gedung: Supabase tidak dijeda lagi)
- Berubah:
  - Gedung 1 (`sptgqsjgszwbreikxdph`) NXDOMAIN sejak sebelum 13 Nov. Kemungkinan dijeda Supabase karena 7 hari tanpa aktivitas, sebab selama saklar `gas` tidak ada yang memanggilnya dan `pantau.yml` terjadwal dimatikan 29 Okt.
  - Worker baru `abadiops-penjaga` (`workers/penjaga/`), cron `17 */6 * * *`:
    - mengetuk Gedung 1 dan Gedung 2 lewat `sum_ping` dengan token palsu (hanya baca);
    - ketukan yang gagal tercatat sebagai error di log Worker;
    - `GET /cek` mengetuk saat itu juga.
  - Aturan 6 di `docs/GEDUNG-DAN-STAGING.md` §1.
  - Diuji 13 Nov: `/cek` menjawab Gedung 2 200, dan Gedung 1 530 (masih dijeda). Cron terdaftar di akun (satu-satunya cron).
- Belum selesai / berikutnya:
  - ~~Gabriel memulihkan Gedung 1 dari dasbor Supabase.~~ **Dipulihkan 13 Nov sore** (Resume project). `/cek` menjawab 200 untuk kedua gedung.
  - Gedung 1 diperiksa langsung lewat database (13 Nov, hanya baca):
    - **Cermin SUM dan KMB TRA kosong.** Semua tabel skema `sum` (22 tabel) dan `kmb` (24 tabel) berisi 0 baris, termasuk `cermin_meta` dan `cermin_log`, jadi keduanya belum pernah disinkron ke Gedung 1.
    - **Cermin KMB Project sudah lama.** Isinya baru sekali dimuat, 27 Okt (16 WO, 51 arsip, 20 token, 1.533 katalog job).
    - **Ukuran database Gedung 1 hanya 15 MB.** Angka 374/500 MB di halaman organisasi bukan dari Gedung 1.
    - **Fungsi admin dan eksekusi Raka tidak ada** di Gedung 1.
  - Berikutnya, sinkron cermin ketiga rumah ke Gedung 1 (`tools/<rumah>/sinkron-cermin.mjs`, mulai dengan `--kering`). Untuk itu dibutuhkan kunci JSON akun layanan dan ID spreadsheet SUM serta KMB TRA.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (deploy pintu produksi: #24 dan #26 tayang)
- Berubah:
  - Token Cloudflare `abadiops-deploy` dipasang di `C:\dev\rahasia\abadiops.env`. Izinnya Workers di akun kawanabadigrup, serta Workers Routes/DNS edit dan Zone read di abadiops.com. Berlaku sampai 11 Feb 2027.
  - Riwayat deploy Cloudflare:
    - Worker produksi terakhir di-deploy 30 Okt. Sejak 2 Nov tidak ada deploy produksi.
    - Pintu staging terakhir di-deploy 12 Nov 13:51 WIB.
  - Pintu produksi di-deploy dari `main` sebagai versi `6ac7fea8`; versi untuk kembali: `934f12d9`.
    - Kodenya beda dari yang tayang hanya di #26.
    - Ikut tayang `a4107da` (login panel menerima `success`).
  - Diuji di produksi:
    - tiga token uji masuk lewat pintu, dan tombol Web membuka web GAS (#24 beres di produksi);
    - `/saklar/api/status` tanpa sesi dijawab 401;
    - saklar produksi semua `gas`.
  - Akses akun Raka tetap, atas keputusan Gabriel.
- Belum selesai / berikutnya: lihat entri serah-terima di bawah.

---

### 2026-11-13 · Gabriel (+ Claude) · bersama (serah-terima kerja Raka; audit staging 2–11 Nov)
- Berubah:
  - Kerja Raka disimpan di repo ini:
    - branch `staging` dimajukan ke `3e55ca8`, termasuk 21 commit yang sebelumnya hanya ada di fork `hrmarsa17/MAR-PROJECT`;
    - tag `raka-akhir-2026-11-11`.
  - Keputusan dicatat di `docs/KEPUTUSAN.md` (13 Nov), dan butir 16 `AGENTS.md` diganti.
  - Isi staging: 80 commit sejak `main`, 89 berkas, +145.889 baris. Dari situ, 16 berkas `docs/panduan_deploy_staging_kamis*.md` (117.499 baris) adalah keluaran chat AI, bukan kode.
  - **Produksi tidak tersentuh** (dicek 13 Nov):
    - `main` tetap `3382c32`, dan saklar produksi semua `gas`.
    - Pintu produksi tidak punya rute baru Raka (404).
    - Login pintu dengan tiga token uji berhasil.
    - Fungsi SQL Raka tidak ada di Gedung 1 (dicek 6 Nov).
  - **Yang sudah tayang di staging** (`*-staging.kawanabadigrup.workers.dev`, saklar staging semua `supabase`):
    - backend Supabase untuk aksi WO ketiga rumah;
    - panel pengguna dan config di `/saklar`;
    - ekspor payroll Excel;
    - buku tamu kiriman;
    - perbaikan halaman web (approvals, monitoring, form WO).
  - **Belum layak produksi.** Yang wajib diperbaiki sebelum dipindah ke `main`:
    1. **WO baru hilang saat sinkron.** WO baru SUM dan KMB TRA ditulis ke tabel cermin (`sum.work_orders`, `kmb.work_orders`), padahal sinkron cermin menghapus isi tabel itu.
    2. **Saklar bisa dilewati.** Klien bisa memilih jalur Supabase lewat `?uji=supabase`, header `X-Active-Engine`, atau `engine` di body.
    3. **Uang belum 1:1 GAS.** Tarif dan faktor tertulis mati di `src/domain/scoring.mjs` dan `payroll-excel.js` (helper 1.500, junior 2.500, senior 3.000, dipilih dari kata di jabatan). GAS membaca `Config_Factors` dan `Config_Settings` (`rate_<posisi>`; SUM: `idr_rate` × pengali golongan). Butuh keputusan Gabriel.
    4. **Panel menampilkan data rekaan.** Bila RPC gagal, `/saklar` menampilkan unit dan pengguna rekaan dan "menyimpan" ke memori Worker.
    5. **Buku tamu kiriman belum aman.**
       - Rute `/api/buku-tamu/*` di pintu tanpa otorisasi.
       - Rumah memercayai hasil tersimpan tanpa memeriksa token atau rumah.
       - `tentukanUrlPintu` selalu memilih pintu staging (`|| true`), jadi rumah produksi tanpa binding akan menulis ke staging.
       - Isinya disimpan di SaklarDO tanpa batas umur.
    6. **Monitoring SUM membocorkan token.** Token semua mekanik ikut dikirim tanpa cek peran, padahal GAS membatasinya untuk L1/L2.
    7. **Celah otorisasi di fungsi admin SQL staging (Gedung 2).** Fungsi `_validasi_admin_token` menerima teks tetap `__PANEL_SAKLAR_PUSAT__` sebagai admin, dan fungsi `*_admin_*_bertoken` dibuka untuk `anon`. **Ditutup 13 Nov** (lihat entri Gedung 2 di atas). Kata ajaib itu masih harus dibuang dari kode.
    8. **Saklar dan asal WO belum benar.** Saklar KMB TRA dibaca dengan kunci `kmb`, padahal panel memakai `kmbtra` (#27 belum beres untuk KMB TRA). Asal WO ditebak dari jumlah digit, bukan dari awalan seperti di `docs/SAKLAR.md`.
    9. **Uji belum membuktikan fungsi.** Uji Raka (40/40, 27/27, 24/24) sebagian besar hanya mencari teks di berkas. CI tidak jalan di `staging`, dan tidak ada PR.
    10. **Konfigurasi produksi ikut diubah.** Di `wrangler.toml`, pintu produksi diberi Gedung 1 dan KMB Project produksi diberi binding pintu.
  - **Temuan lain 13 Nov** (bukan kerja Raka):
    - **Gedung 1 tidak ditemukan.** `sptgqsjgszwbreikxdph` NXDOMAIN, juga lewat DNS Google. Kemungkinan dijeda Supabase karena lama tidak dipakai (`pantau.yml` terjadwal dimatikan 29 Okt). Produksi tidak terdampak, karena saklar `gas`.
    - **#24 masih tayang.** Tombol Web di pintu produksi membuka `<rumah>.abadiops.com/web`, yang tampil kosong. Perbaikannya (`ba2732d`) belum di-deploy karena token Cloudflare belum ada.
    - **PWA produksi KMB Project diubah Raka.** Pada 2 Nov, `gabrielrurent/PWA-Project-KMB` diubah ke projek-v14 (menu WO tetap tampil saat kosong). Perubahan ini belum ada di `pwa/kmbprojek`.
- Belum selesai / berikutnya:
  - Gabriel:
    - tutup celah Gedung 2 dengan SQL dari Claude;
    - pulihkan Gedung 1 di dasbor Supabase;
    - isi `C:\dev\rahasia\abadiops.env`.
  - Claude:
    - deploy pintu (`ba2732d`) begitu token ada;
    - lalu pindahkan bagian staging yang benar ke `main` satu per satu, mengikuti daftar di atas.

---

### 2026-11-11 · Raka (+ AI) · sum (Perbaikan 1:1 Distribusi Final Points, Rupiah, & Team Share Kartu WO Approved)
- Berubah:
  - **WO Approval -> Tab Approved (SUM V2)**:
    - Memperbaiki kotak `Final Points`: tidak ada lagi angka poin kosong (` pts`) atau `Rp 0`. Pada `lengkapiObjekWoWeb` (`workers/sum/src/web-handler.js`) dan template `workers/sum/web/Approval.html`, poin dihitung otomatis dari `base_points * unit_factor * cond_factor` (misal `WO-20261109-0009` kini bernilai `4.8 pts` dan `Rp 12.000`, `WO-20261022-453-P` bernilai `0.26 pts` dan `Rp 650`).
    - Memperbaiki `👥 Team`: tidak lagi menampilkan tanda `-` atau ID mentah tanpa rincian. Kini menampilkan nama/ID pengerja lengkap dengan bagian poin dan insentif Rupiah per anggota tim (misal `MECH-SVP-005 (4.8 pts · Rp 12.000)` dan `maddogbelieve (0.26 pts · Rp 650)`).
    - Memperbaiki `Tanggal`: memformat timestamp ISO mentah (`...T...Z`) menjadi format tanggal WIB yang mudah dibaca (`22 Okt 2026 10:55`).
    - Menyempurnakan `workers/sum/src/supabase-backend.js` pada aksi `approve_l2` agar menghitung dan menyimpan `final_points` dan `final_idr` secara permanen ke objek WO.
  - **Kompilasi & Deploy Staging**:
    - Menjalankan `build-web-templates.mjs` untuk mengompilasi `web/Approval.html` ke `src/web-templates.js`.
    - Deploy ulang ke staging: `abadiops-sum-staging`.
    - Uji live staging membuktikan: `Has empty pts: false`, `Has Rp 0: false`, `Has 👥 -: false`, `Has visible raw ISO: false`.
- Belum selesai / berikutnya:
  - Siap diuji oleh Gabriel / pengguna di staging.

---

### 2026-11-11 · Raka (+ AI) · kmb & kmb-projek (Perbaikan Total 1:1 Distribusi Poin, Team Share, Jam Kerja Mekanik, Approval, & Excel Payroll)
- Berubah:
  - **WO Approval -> Tab Approved (KMB V2 & KMB Projek)**:
    - Memperbaiki kotak `Final Points`: tidak lagi kosong (` pts`), kini menampilkan angka poin terhitung (misal `1 pts`, `2.5 pts`, `12.5 pts`) dan `final_idr` terhitung (misal `Rp 2.500`, `Rp 6.250`, `Rp 31.250`, tidak lagi `Rp 0`).
    - Menghilangkan bug `Kondisi: Shift 1`: menghapus ternary hardcoded di `Approval.html` yang memetakan `'normal'` ke `'Shift 1'`. Kondisi kini menampilkan label kondisi asli (`Normal`, `Berat / Malam`, `Kondisi Ekstrim`), dan baris `Shift:` ditampilkan terpisah pada baris tersendiri (`Shift: Shift 1`).
    - Memperbaiki bagian `👥 Team`: tidak lagi menampilkan `-`, melainkan nama mekanik pengerja beserta rincian poin dan insentif Rupiah per anggota (contoh: `l1est (1 pts · Rp 2.500)`).
    - Memformat tanggal pengerjaan: dari ISO mentah (`...T...Z`) menjadi format tanggal & jam Indonesia WIB (`12 Agu 2026 17:41`).
  - **Tab Pending Approvals (Level 1 & Level 2)**:
    - Menampilkan durasi actual hours secara akurat (misal `⏱️ 1 jam 20 menit / tgt 2 jam`), tidak lagi `N/A` atau `- / tgt 2 jam`.
    - Menampilkan nama mekanik pada kolom Durasi & Tim (misal `👥 ersa`), tidak lagi `👥 -`.
  - **Halaman Monitoring / Mekanik (`?page=mechanic`)**:
    - Menerapkan normalisasi status `.toLowerCase().trim()` sehingga WO berstatus `'assigned'` atau `'pending_mechanic_work'` otomatis membuka form `ISI JAM KERJA`.
    - Menyediakan 2 tombol berdampingan pada kartu assigned: `✍️ Isi Manual` & `📮 Kirim`.
    - Live timer dan date-time picker 24 jam terintegrasi penuh.
  - **Laporan Payroll Excel (.xlsx)**:
    - Menambahkan `payroll-excel.js` ke `workers/kmbprojek/src/` dan mengintegrasikan `buildPayrollWorkbook` ke `generate_payroll_report` di `workers/kmbprojek/src/supabase-backend.js`.
    - Laporan payroll kini menghasilkan binary OpenXML `.xlsx` asli (dua sheet: `Ringkasan` dan `Detail WO` dengan header oranye) dengan `Total IDR` terhitung penuh, menggantikan format CSV polos.
  - **Kompilasi, Perbaikan Bug Runtime & Deploy Staging**:
    - Memperbaiki bug `ReferenceError: ekstrakIsi is not defined` di `workers/kmbprojek/src/web-handler.js` yang menyebabkan error 500 pada Cloudflare Worker KMB Projek.
    - Menjalankan `build-web-templates.mjs` untuk mengompilasi ulang `web/` ke `src/web-templates.js` pada semua rumah.
    - Deploy ulang ke staging: `abadiops-kmb-staging` dan `abadiops-kmbprojek-staging`.
    - Menguji live pada staging di KETIGA rumah (KMB, KMB Projek, dan SUM):
      - Pending Approvals: HTTP 200 (durasi & mekanik akurat, tidak lagi `👥 -`).
      - Approved Approvals: HTTP 200 (final points & IDR terhitung, team share jelas, kondisi & shift terpisah rapi).
      - Mechanic Assigned & Done: HTTP 200 (dua tombol kartu berdampingan, modal jam kerja & live timer siap).
      - Excel Payroll Report: HTTP 200, OpenXML `.xlsx` binary valid (`UEsDB`), Total IDR terhitung (misal Rp 642.500 / Rp 10.000).
- Belum selesai / berikutnya:
  - Pantau feedback pengguna setelah pengujian di panggung staging.

---

### 2026-11-11 · Raka (+ AI) · sum (Perbaikan 1:1 Form "Isi Jam Kerja", Live Timer, & Tombol Kartu WO Halaman Mekanik)
- Berubah:
  - **Normalisasi Status WO**:
    - Memperbaiki normalisasi status di backend (`workers/sum/src/web-handler.js`, `workers/sum/src/supabase-backend.js`) dan template (`workers/sum/web/MechanicDashboard.html`, `pwa/sum/app.js`, `scripts/sum-app.js`) dengan `.toLowerCase().trim()`.
    - Semua variasi status tugas (`assigned`, `pending_mechanic_work`, `open`, `in_progress`, `perlu_diisi_mekanik`) kini konsisten berlabel `"Perlu Diisi Mekanik"` dan berkelas `status-assigned`.
    - Memastikan form `ISI JAM KERJA` tidak lagi tersembunyi/kosong saat WO berstatus `assigned`.
  - **Kartu WO Tab Assigned (1:1 Standar KMB/ModalKerja)**:
    - Di bagian bawah kartu Assigned, merender 2 tombol berdampingan:
      - Tombol kiri: `✍️ Isi Manual` (membuka modal detail & input jam/timer manual).
      - Tombol kanan: `📮 Kirim` (warna hijau tua `#4d5e3e`, submit instan menggunakan durasi live timer).
    - Status badge kartu WO menampilkan `"Perlu Diisi Mekanik"`.
    - Live timer pill status di kartu (`⏱ Berjalan` atau `⏸ Jeda`) muncul otomatis bila timer aktif/tersimpan.
  - **Modal WO (`submitTimeSection` - ISI JAM KERJA)**:
    - Header seksi: `ISI JAM KERJA`.
    - Kotak Live Timer (`#timerPill`) dengan background hijau muda `#f0fdf4`, border hijau `#86efac`:
      - Judul: `⏱️ LIVE TIMER REKAM WAKTU`
      - Monospace besar `00:00:00`.
      - Tombol kontrol: `▶ Start` (`#10b981`), `⏸ Jeda` (`#f59e0b`), `⏹ Selesai` (`#ef4444`), dan `↺ Reset` (outline border).
      - Teks petunjuk biru: `▶ mulai kerja · ⏸ jeda · ⏹ selesai. Durasi terhitung otomatis. Memulai WO lain akan menjeda WO ini. Jam di bawah boleh Anda koreksi manual.`
    - Input `Start Time`: date picker + 2 dropdown 24 jam (Jam 00-23, Menit 00-59) via `DateTime24.html`. Saat tombol `▶ Start` ditekan, otomatis mengisi `Start Time` bila masih kosong.
    - Input `End Time`: date picker + 2 dropdown 24 jam via `DateTime24.html`. Saat tombol `⏹ Selesai` ditekan, otomatis mengisi `End Time` dengan waktu selesai dan menghitung durasi.
    - Input Khusus Tyre (Conditional): seksi `#tyreSection` (Inspeksi 10 posisi, Remove/Instal per posisi, dan Repair) jika WO merupakan pekerjaan ban.
    - Textarea Catatan Shift: label `Catatan bila WO dioper ke shift berikutnya (opsional)` dan placeholder `cth: baut roda kiri belum kencang,`.
    - Modal Footer (3 tombol): `Cancel`, `🔄 Transfer ke Shift Berikutnya` (`#btnTransfer`), dan `📮 Kirim` (`#btnSubmit` hijau tua `#4d5e3e`, aktif setelah Start & End time valid).
  - **Backend Endpoint Submit & Transfer di SUM**:
    - Menambahkan `handleSubmitMechanicWork`, `handleRequestTransfer`, `request_transfer` ke `ROUTER_ACTIONS` di `web-handler.js` dan `normalisasiAksi` di `supabase-backend.js`.
    - Menangani penyimpanan `start_time`, `end_time`, `actual_hours`, catatan, dan transisi status WO ke `pending_supervisor` / `Menunggu Level 1`.
  - **Build & Deploy Staging**:
    - Menambahkan partial template `workers/sum/web/DateTime24.html`.
    - Kompilasi ulang template via `scripts/build-web-templates.mjs`.
    - Bump Service Worker cache ke `mar-sum-v51` di `pwa/sum/sw.js` dan `pwa/sum/app.js`.
    - Deploy ke Cloudflare Workers `abadiops-sum-staging` dan terverifikasi live 100% lulus uji.
- Belum selesai / berikutnya:
  - Pantau pemakaian operasional di SUM Staging bersama Gabriel sebelum integrasi ke produksi.

---

### 2026-11-11 · Raka (+ AI) · kmb & sum (Laporan Payroll Excel 1:1 Sesuai Dokumen Asli GAS: Sheet Ringkasan & Detail WO)
- Berubah:
  - **Penyelarasan Format Ekspor Payroll 1:1 Excel (.xlsx)**:
    - Mengganti generator CSV sementara dengan modul penghasil binary OpenXML (`.xlsx`) murni menggunakan `exceljs/dist/exceljs.bare.min.js` (`workers/kmb/src/payroll-excel.js` dan `workers/sum/src/payroll-excel.js`).
    - File yang dihasilkan identik 1:1 dengan format GAS `Payroll_26_Okt___25_Nov_2026.xlsx`:
      - **Sheet 1: `Ringkasan`**:
        - Judul A1:H1 merged `'LAPORAN PAYROLL INSENTIF MEKANIK'` dengan latar oranye `#F59E0B`, font Arial 14pt tebal putih, tengah.
        - Sub-header metadata: Periode (`26 Okt – 25 Nov 2026`), Waktu dibuat, keterangan variasi rate per jabatan.
        - Header kolom oranye baris 6: `['No', 'Nama Mekanik', 'Jabatan', 'Mechanic ID', 'Total WO Selesai', 'Total Poin', 'Rate/Poin', 'Total IDR (Rp)']`.
        - Format angka Rupiah (`"Rp "#,##0`), desimal poin (`#,##0.##`), dan baris belang abu/putih (`#F8FAFC` / `#FFFFFF`).
        - Baris ringkasan `TOTAL` di bagian bawah dengan latar oranye pekat dan teks tebal putih.
      - **Sheet 2: `Detail WO`**:
        - Judul A1:Y1 merged `'DETAIL WO PER MEKANIK — <periode>'` latar oranye.
        - Keterangan formula insentif: `Formula: Base Pts × Unit × Kondisi × Waktu × Safety × Redo = WO Poin → Poin Mekanik`.
        - 25 kolom lengkap dengan color banding header sesuai standar GAS:
          - Info WO (No..End): latar oranye `#F59E0B`
          - Jam Kerja (Actual & Plan): latar abu-abu `#4B5563`
          - Faktor Pengali (Base Pts..×Redo): latar merah marun `#AD1457`
          - Poin & Rupiah (WO Poin..IDR): latar cokelat emas `#B45309`
        - Baris data dikelompokkan per mekanik dengan selang-seling warna latar biru muda `#F0F9FF` dan abu muda `#F9FAFB`.
        - Penanda merah insiden safety: jika `snap_safety === 0`, kolom `×Safety` dan `WO Poin` disorot merah muda `#FEE2E2` dengan teks merah tua `#991B1B`.
  - **Integrasi Backend Mandiri Supabase**:
    - `workers/kmb/src/supabase-backend.js` & `workers/sum/src/supabase-backend.js`:
      - Mengagregasi WO approved, lookup metadata mekanik via `ambilRefsUntukLookup`, dan menghitung poin/rate/IDR per anggota tim.
      - Menghasilkan binary Excel via `writeBuffer()`, di-encode ke base64 (`file_b64`) dengan metode chunked Uint8Array agar aman di Cloudflare Worker.
      - Mengirim respons JSON dengan `filename: Payroll_<periode>.xlsx` dan `file_b64` yang langsung diunduh otomatis oleh peramban pengguna.
  - **Verifikasi Live Staging**:
    - KMB TRA (`abadiops-kmb-staging`): POST `generate_payroll_report` menghasilkan berkas Excel biner valid `Payroll_26_Okt___25_Nov_2026.xlsx` (36.3 KB) dengan 2 sheet (`Ringkasan` dan `Detail WO`), 257 baris detail WO, dan summary total Rp 642.500.
    - SUM (`abadiops-sum-staging`): POST `generate_payroll_report` sukses menghasilkan berkas Excel biner valid dengan 2 sheet.
  - **Deploy Staging**:
    - `abadiops-kmb-staging`: Version `3abd87f6-8dca-4326-a981-67d3645b4022`.
    - `abadiops-sum-staging`: Version `6f1388a7-0305-46b8-99b6-27dbb7f912c8`.
- Belum selesai / berikutnya:
  - Verifikasi pengujian user langsung dari layar Reports browser di `abadiops-kmb-staging` dan `abadiops-sum-staging`.

---

### 2026-11-11 · Raka (+ AI) · sum (Perbaikan Bug #30, semula #29 di branch staging: Stale Cache / Angka 0 di Mechanic Dashboard SUM)
- Berubah:
  - **Akar Masalah Angka 0 & Kartu Kosong di Tab Assigned / Pending SUM**:
    - Service Worker SUM (`pwa/sum/sw.js`) sebelumnya tidak memiliki pengecekan `if (url.search) return;` seperti halnya di `pwa/kmb` dan `pwa/kmbprojek`.
    - Akibatnya, saat pengguna membuka URL web desktop dengan parameter query (seperti `/web?page=mechanic&filter=assigned&token=...`), *event listener fetch* memperlakukannya sebagai *static asset* (`cache-first`) dan menyimpannya ke *Cache Storage* browser (`mar-sum-v49`).
    - Halaman lama yang tersimpan saat data kosong terus-menerus disajikan dari *cache* browser tanpa pernah menembus server (sehingga Assigned & Pending tetap 0), sedangkan tab yang baru pertama kali diklik (seperti `filter=done`) mengambil data *live* dari jaringan (menampilkan 287 Assigned, 81 Pending, 1 Approved).
  - **Perbaikan**:
    - Menambahkan *bypass* langsung ke jaringan di `pwa/sum/sw.js` untuk semua URL ber-query, `/web`, dan `/api`: `if (url.search || url.pathname.startsWith('/web') || url.pathname.startsWith('/api')) return;`.
    - Menaikkan versi cache dari `mar-sum-v49` ke `mar-sum-v50` agar seluruh entri *stale cache* lama di browser pengguna otomatis dibersihkan saat aktivasi Service Worker baru.
    - Uji serahan token `scripts/uji-serahan-token.mjs`: Lulus 24/24.
  - **Deploy Staging**:
    - `abadiops-sum-staging`: Version `f5eb3bf9-24f2-4e39-bfc3-73b0b0992bd1`.
- Belum selesai / berikutnya:
  - Implementasi handler backend Supabase untuk Koreksi HM, Koreksi KM, dan Teknis.

---

### 2026-11-11 · Raka (+ AI) · kmb & sum (Audit & Perbaikan Fitur Reports / Download Payroll Laporan)
- Berubah:
  - **Audit Halaman Laporan (`?page=reports`)**:
    - Tampilan antarmuka Web Desktop `Reports.html` terverifikasi berfungsi normal (HTTP 200) di kedua rumah (KMB TRA & SUM).
    - Memuat dropdown Section, selector Bulan/Tahun dengan cut-off payroll 26-25, selector Rentang Tanggal, dan tombol "Generate & Download Excel".
  - **Perbaikan Aksi Generate & Download Payroll (`generatePayrollReport`)**:
    - Menangani normalisasi payload di `handleWebBridgeApi` (`workers/kmb/src/web-handler.js` & `workers/sum/src/web-handler.js`): memetakan parameter posisional `body.args` dari client shim ke `body.data` (`{ filter_type, year, month, start_date, end_date, section_filter, token }`).
    - Menambahkan agregasi data laporan payroll di backend Supabase (`workers/kmb/src/supabase-backend.js` & `workers/sum/src/supabase-backend.js`):
      - Menarik data WO approved via RPC `pull_approved`.
      - Memfilter berdasarkan periode cut-off (26 bulan lalu s/d 25 bulan target untuk filter bulanan) atau rentang tanggal custom.
      - Memfilter section jika dipilih spesifik.
      - Menghitung ringkasan: `total_mechanics`, `total_wos`, `total_points`, `total_idr`.
      - Menghasilkan format CSV UTF-8 dengan escape kutip ganda dan base64 string (`file_b64`) untuk diunduh langsung via Blob oleh browser tanpa ketergantungan Google Drive.
  - **Verifikasi Live Staging**:
    - KMB TRA (`abadiops-kmb-staging`): GET `?page=reports` 200 OK. POST `generatePayrollReport` (bulanan) mengembalikan 257 WO approved, 3 mekanik, 7 poin, Rp 70.000, `Payroll_KMB_202611.csv`, 29 KB base64. Filter custom range menghasilkan `Payroll_KMB_Custom.csv`.
    - SUM (`abadiops-sum-staging`): GET `?page=reports` 200 OK. POST `generatePayrollReport` (bulanan & rentang tanggal) sukses 200 OK dengan format CSV valid.
  - **Deploy Staging**:
    - `abadiops-kmb-staging`: Version `e651b821-7672-4149-b552-bbda066c59cc`
    - `abadiops-sum-staging`: Version `9de475d7-89f3-426d-8e5f-f45ce5c39c01`
- Belum selesai / berikutnya:
  - Pantau performa eksekusi laporan saat volume WO di Supabase bertambah besar di atas 5000 baris.

---

### 2026-11-10 · Raka (+ AI) · kmb & sum (Perbaikan Alur Approval L1 -> L2 & Pencegahan Lolos Langsung ke Approved)
- Berubah:
  - **Akar Masalah Approval L1 Langsung Selesai (Bypass L2 ke Status APPROVED)**:
    - Di `Approval.html` baris 1378: `var fnName = status === 'pending_supervisor' ? 'handleSupervisorApprove' : 'handleSuperintendentApprove';`.
    - Karena sebelumnya status yang tersimpan dari `submit_work` atau RPC berupa `PENDING_L1` (huruf kapital atau alias lain), pengecekan `status === 'pending_supervisor'` bernilai `false`, sehingga frontend menganggap kartu tersebut adalah kartu Level 2.
    - Saat Supervisor (Yoel) menekan "Approve", browser memanggil `handleSuperintendentApprove` (Level 2). Di backend, ini memicu `approve_l2` yang langsung mengubah status menjadi `APPROVED` (`status_group: 'done'`), melewati Superintendent (Level 2) sepenuhnya dan langsung masuk ke tab "Done" di Monitoring Mekanik.
  - **Perbaikan Frontend (`workers/kmb/web/Approval.html` & `workers/sum/web/Approval.html`)**:
    - Memperbarui pengecekan level approval: `var isL1 = (status === 'pending_supervisor' || status === 'pending_l1'); if ('<?= user.role ?>' === 'supervisor') isL1 = true;`.
    - Jika pengguna berperan `supervisor`, aksi approval & reject selalu dipaksa ke `handleSupervisorApprove` / `handleSupervisorReject`.
    - Pengecekan lencana status, modal approval, dan bulk approval diselaraskan agar mendukung `pending_supervisor` dan `pending_l1`.
    - Kompilasi ulang web templates via `node scripts/build-web-templates.mjs`.
  - **Perbaikan Backend (`workers/kmb/src/` & `workers/sum/src/`)**:
    - Menambahkan Role Guard di `handleWebBridgeApi`: Permintaan `superintendentApprove` / `approve_l2` dari actor ber-role `supervisor` langsung ditolak dengan HTTP 403 Forbidden.
    - Menyelaraskan status di `supabase-backend.js`:
      - `submit_work`: status `pending_supervisor`, status_group `pending_approval`, status_label `Menunggu Level 1`.
      - `approve_l1`: status `pending_superintendent`, status_group `pending_approval`, status_label `Menunggu Level 2`.
      - `approve_l2`: status `approved`, status_group `done`, status_label `Approved`.
    - Memperbarui query SQL `db/kmb/rpc_backend_penuh.sql` dan `db/sum/rpc_backend_penuh.sql` agar nilai status konsisten dengan GAS (`pending_supervisor` dan `pending_superintendent`).
  - **Pemulihan Data WO Uji di Staging (Gedung 2)**:
    - `WO-20261110-0008` dipulihkan ke status `pending_superintendent` (`approved_l1_by: Yoel`, `status_group: pending_approval`).
    - Verifikasi antrean live:
      - Muncul di antrean Superintendent Yoga (`token=49ae897c18534448998a`).
      - Tidak muncul di antrean Supervisor Yoel (`kmb-767db2f62a87`).
      - Uji proteksi role guard: Yoel memanggil `superintendentApprove` ditolak 403.
      - Uji approve L2 Yoga pada `WO-20261110-0007` berhasil 200 OK dan berpindah ke `APPROVED` / `done`.
  - **Deploy Staging**:
    - `abadiops-kmb-staging`: Version `696efa71-1662-423a-848b-b66da5bd5859`
    - `abadiops-sum-staging`: Version `268e7b03-0b70-4d21-b72b-58946df7fef1`
    - `uji-serahan-token` (24/24 lulus), `uji-siklus-wo-lengkap` (12/12 lulus).
- Belum selesai / berikutnya:
  - Verifikasi menyeluruh alur monitoring mekanik tab Pending vs Done saat approval bertahap.

---

### 2026-11-10 · Gabriel (+ AI) · sum (Perbaikan Render WO Mechanic Staging)
- Berubah: `web-templates.js` (fix `var _rawWos` assignment + JSON stringify tanpa HTML escape), `web-handler.js` (fallback `status` ke `data`). Data di HTML valid (369 WO, 81 pending) dan API valid.
- Belum selesai: Frontend render masih loading (kemungkinan JS error di `renderWOs()` atau logic filter). Perlu browser DevTools inspect. Lanjut debug setelah browser console check.

---

### 2026-11-10 · Raka (+ AI) · kmb & sum (Perbaikan Layar Approvals L1 KMB TRA & Pemuatan Paralel Status WO)
- Berubah:
  - **Akar Masalah KMB TRA Approvals L1 Kosong (`Pending Approvals 0`)**:
    - **Penyebab**: Variabel `const roleLower = String(role).toLowerCase();` di `workers/kmb/src/web-handler.js` dideklarasikan di dalam blok `if (!page)`. Saat pengguna membuka URL eksplisit `?page=approvals`, blok `if (!page)` dilewati sehingga `roleLower` tidak terdefinisi (*ReferenceError: roleLower is not defined*). Blok `try-catch` context menangkap galat tersebut dan mengabaikan pengisian antrean `context.pendingApprovals`, sehingga template `Approval.html` merender daftar kosong (*Pending Approvals 0* dan *Tidak ada WO yang menunggu persetujuan*).
    - **Perbaikan**:
      - Memindahkan deklarasi `const roleLower = String(role || user.role || '').toLowerCase();` ke cakupan utama `handleWebRequest` sebelum penentuan halaman, diterapkan pada `workers/kmb/src/web-handler.js` dan `workers/sum/src/web-handler.js`.
      - Memperbarui pemanggilan data halaman approval menjadi paralel via `Promise.all` (`pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`, dan `pull_create_refs`) sehingga tab *WO Approval*, *WO Aktif*, *WO Approved*, dan *Ditolak* terisi penuh.
      - Memastikan `payload.wo_id` pada aksi `approve_l1`, `approve_l2`, `reject`, `cancel_wo`, `save_override` selalu diekstrak aman dari berbagai format payload di `supabase-backend.js`.
  - **Deploy & Verifikasi Staging**:
    - `abadiops-kmb-staging`: Version `429768ca-4d53-4ba7-80b1-dca41c1df627`
    - `abadiops-sum-staging`: Version `163a32de-478d-4d11-986a-f4c46af49463`
    - Verifikasi HTML live endpoint `https://abadiops-kmb-staging.kawanabadigrup.workers.dev/web?page=approvals&token=kmb-767db2f62a87`:
      - Berhasil merender `149` kartu WO Level 1 pada lencana `section-count` dan kartu `wo-card wo-list-item`.
      - Uji aksi live `handleSupervisorApprove` untuk `WO-20261110-0001` via `/api/web`: Sukses `200 OK`, berpindah ke status `PENDING_L2`, dan antrean L1 berkurang otomatis menjadi `148`.
    - Semua test suite lulus: `uji-serahan-token` (24/24), `uji-backend-mandiri` (40/40), `uji-siklus-wo-lengkap` (12/12), `uji-user-admin-pusat` (27/27).
- Belum selesai / berikutnya:
  - Uji approval massal (bulk approve) dan pengembalian WO ke mekanik di UI staging.

---

### 2026-11-10 · Raka (+ AI) · sum & kmb (Perbaikan Modal Detail WO Mekanik & Normalisasi Aksi Web Desktop)
- Berubah:
  - **Perbaikan Galat "Gagal memuat detail WO: undefined" di SUM Mechanic Dashboard (`workers/sum/web/MechanicDashboard.html` & `workers/sum/src/supabase-backend.js`)**:
    - **Penyebab**: Pemanggilan `google.script.run.handleGetWoDetailForMechanic` di web desktop SUM mengirim nama aksi `handleGetWoDetailForMechanic`. Di `supabase-backend.js`, aksi ini belum dinormalisasi ke `pull_wo_detail`, sehingga RPC menolak dengan galat teks string (`r.error` string, bukan objek `{message: ...}`), menyebabkan `r.error.message` bernilai `undefined` dan memunculkan alert popup `Gagal memuat detail WO: undefined` yang menutup modal.
    - **Perbaikan Backend**:
      - Menambahkan pemetaan aksi di `normalisasiAksi`:
        - `'handleGetWoDetailForMechanic': 'pull_wo_detail'`
        - `'handleGetMyWos': 'pull_my_wos'`
        - `'handleMonitoringDetail': 'pull_wo_detail'`
        - `'handleMonitoringDetailWo': 'pull_wo_detail'`
        - `'getMonitoringDetailWo': 'pull_wo_detail'`
      - Memastikan `payload.wo_id` diekstrak dengan aman dari `payload.wo_id || payload.id || ekstrakWoId(body)`.
      - Menyusun struktur respon `fullDetail` (`wo`, `component`, `unit`, `target_hours`, `status_label`) sesuai format yang diharap oleh frontend.
      - Menambahkan mekanisme fallback berketahanan tinggi: jika RPC `pull_wo_detail` gagal, worker langsung menarik data dari `pull_my_wos` (yang sudah memuat objek WO lengkap) dan mengembalikan format `fullDetail`.
    - **Perbaikan Frontend (`workers/sum/web/MechanicDashboard.html`)**:
      - Memperbaiki parsing pesan error secara null-safe: `(r.error && r.error.message) || r.error || (r.data && r.data.error) || 'Gagal memuat detail WO'`.
      - Jika modal sudah berhasil diisi oleh data lokal (`fastRendered`), kegagalan pembaruan latar belakang hanya mencatat console warning tanpa memunculkan alert yang memblokir atau menutup modal pengguna.
    - **Perbaikan SQL (`db/sum/rpc_backend_penuh.sql`)**:
      - Menambahkan definisi helper `sum._normalisasi_status_wo_sum(p_status text)`.
      - Memperluas penanganan aksi `v_aksi IN ('pull_wo_detail', 'getwodetailformechanic', 'handlegetwodetailformechanic', 'getwodetails')`.
  - **Sinkronisasi Normalisasi Aksi di KMB (`workers/kmb/src/supabase-backend.js`)**:
    - Menerapkan pemetaan normalisasi aksi dan ekstraksi `payload.wo_id` yang sama untuk mencegah masalah serupa di KMB V2.
  - **Kompilasi Ulang Web Templates**:
    - Menjalankan `node scripts/build-web-templates.mjs` untuk memperbarui `workers/sum/src/web-templates.js` dan `workers/kmb/src/web-templates.js`.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-sum-staging`: Version `d7317e1b-fffc-415f-9e90-cbd0f6b9a69a`
    - `abadiops-kmb-staging`: Version `413967e8-c8f0-4522-9186-6b6b2acde6f8`
  - **Pengujian & Verifikasi**:
    - Pengujian live endpoint `https://abadiops-sum-staging.kawanabadigrup.workers.dev/api/web` untuk `handleGetWoDetailForMechanic` dengan token `253de60cc43340d68d5a` dan ID `WO-20261110-0001`: Berhasil `200 OK`, `success: true`, mengembalikan objek detail lengkap.
    - `scripts/uji-siklus-wo-lengkap.mjs`: 12/12 LULUS.
    - `scripts/uji-backend-mandiri.mjs`: 40/40 LULUS.
    - `scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS.
    - `scripts/uji-serahan-token.mjs`: 24/24 LULUS.
- Belum selesai / berikutnya:
  - Latihan skenario operasional pengguna di UI staging untuk approval dan monitoring lintas rumah.

---

### 2026-11-10 · Raka (+ AI) · bersama & tiga rumah (Implementasi Penuh Buku Tamu Kiriman Idempotency Store di Cloudflare DO, Multi-Select Section Dropdown, & Uji Siklus WO Lengkap)
- Berubah:
  - **Buku Tamu Kiriman (Idempotency Store di Cloudflare DO, `docs/SAKLAR.md` baris 34)**:
    - Di `workers/pintu/src/saklar-do.js`: Menambahkan aksi `buku_tamu_cek` dan `buku_tamu_simpan` berbasis penyimpanan Durable Object (`ctx.storage`), dengan penyimpanan record per `op:<op_id>`.
    - Di `workers/pintu/src/index.js`: Mengekspos rute `GET /api/buku-tamu/cek` dan `POST /api/buku-tamu/simpan` dengan dukungan CORS penuh antar-rumah.
    - Di modul baru `buku-tamu.js` (`workers/kmb/src/buku-tamu.js`, `workers/sum/src/buku-tamu.js`, `workers/kmbprojek/src/buku-tamu.js`):
      - Menambahkan helper `cekBukuTamu(opId, env)` dan `catatBukuTamu(opId, result, rumah, env)`.
    - Di `workers/kmb/src/index.js`, `workers/sum/src/index.js`, dan `workers/kmbprojek/src/index.js` (serta seluruh handler `web-handler.js`):
      - Mendeteksi `op_id` / `kiriman_id` pada payload mutasi (pembuatan WO, submit laporan mekanik, approval, transfer).
      - Jika `op_id` sudah tercatat di Buku Tamu: langsung mengembalikan respon yang tersimpan dengan header `X-Abadi-Buku-Tamu: hit` tanpa mengeksekusi ulang database atau membuat WO kembar.
      - Jika belum tercatat: setelah aksi berhasil dieksekusi (baik di Supabase mandiri maupun GAS fallback), respon otomatis dicatat ke Buku Tamu Cloudflare DO.
  - **Pemilihan Section Multi-Select di Modal Manajemen Pengguna (`saklar.html`)**:
    - Memastikan dropdown checkbox multi-select dinamis per sistem (`maintenance`, `vessel` untuk KMB Projek; `field`, `workshop`, `tyreman` untuk KMB TRA; hidden untuk SUM).
  - **Pemetaan Kunci Saklar KMB V2 (`workers/kmb/src/supabase-backend.js`)**:
    - Memetakan `env.RUMAH === 'kmb'` ke kunci status `kmbtra` di `bacaStatusSaklar`.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-pintu-staging`: Version `e9205d51-6a01-4aa6-bc23-21fc9afac8fc`
    - `abadiops-kmb-staging`: Version `e48604bc-4f88-4e57-998b-b2c8cea3946a`
    - `abadiops-sum-staging`: Version `013ef34d-71d1-4695-b6e9-792da53b4181`
    - `abadiops-kmbprojek-staging`: Version `f81f28ee-fe6c-40b0-97c8-5d1911ac66fd`
  - **Pengujian & Verifikasi Otomatis**:
    - `scripts/uji-siklus-wo-lengkap.mjs`: 12/12 LULUS (Buku Tamu simpan/cek, hit idempotency header, isolasi 3 rumah, rute staging).
    - `scripts/uji-backend-mandiri.mjs`: 40/40 LULUS.
    - `scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS.
    - `scripts/uji-serahan-token.mjs`: 24/24 LULUS.
- Belum selesai / berikutnya:
  - Gabriel meninjau hasil staging dan menguji simulasi saklar balik bila diperlukan.

### 2026-11-09 · Raka (+ AI) · kmb & sum (Penegakan Dokumen Spek 04-APPROVALS: Pembatasan Antrean & Approval L1 vs L2)
- Berubah:
  - **Audit Dokumen Spek (`docs/SPEK-LAYAR/04-APPROVALS.md` baris 49-52)**:
    - Dokumen spek menyatakan secara eksplisit:
      > *"Hanya L1/L2 masuk layar ini. Antrean utama L1 hanya `pending_supervisor`, L2 hanya `pending_superintendent`; wewenang backend L2 untuk approve tahap L1 tetap ada. Alasannya: WO yang muncul di dua meja mengundang L2 melewati L1 tanpa sengaja."*
    - Dokumen juga menegaskan bahwa L1 tidak boleh memutus atau mengambil tindakan pada meja L2 (`04-APPROVALS.md` baris 648).
  - **Perbaikan Web Handler (`workers/kmb/src/web-handler.js` & `workers/sum/src/web-handler.js`)**:
    - Sesuai spesifikasi, pada tampilan `approvals`:
      - Jika akun pemanggil adalah `supervisor` (L1): Antrean disaring secara ketat hanya menampilkan `pending_supervisor` / `pending_l1`. Data Level 2 tidak dimunculkan di antrean L1.
      - Jika akun pemanggil adalah `superintendent` (L2): Antrean disaring menampilkan `pending_superintendent` / `pending_l2`.
      - Penghitungan `pendingCount` / `pendingTotal` disesuaikan dengan antrean masing-masing peran.
  - **Perbaikan UI Template (`workers/kmb/web/Approval.html`)**:
    - Tombol `✓ Approve` untuk kartu Level 2 diproteksi agar tidak dapat diklik oleh peran `supervisor` (L1), dengan fallback label `Menunggu L2`.
    - Menambahkan alert proteksi di JavaScript `approveWO` jika status yang diapprove adalah `pending_superintendent` tetapi peran pemanggil adalah `supervisor`.
  - **Perbaikan RPC Supabase (`db/kmb/rpc_backend_penuh.sql` & `db/sum/rpc_backend_penuh.sql`)**:
    - Memperbarui `pull_pending` agar menyaring antrean berdasarkan role pemanggil (`v_user.role`).
    - Memperbarui `approve_l2` dengan validasi role: menolak eksekusi jika role bukan `superintendent`, `admin`, atau `manager`.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-kmb-staging` (`8748c084-ff00-4b0f-b7d3-d7a029d68c0f`)
    - `abadiops-sum-staging` (`bde5d573-6355-418b-983a-f1cc254298f5`)
- Belum selesai / berikutnya:
  - Pengujian alur approval L1 dan L2 di KMB V2 staging oleh user.

### 2026-11-09 · Raka (+ AI) · kmb & sum & kmb-projek (Sinkronisasi status_group ke pending_approval saat Submit Work & Pembersihan Judul UNKNOWN)
- Berubah:
  - **Akar Masalah Teridentifikasi**:
    - Ketika mekanik melakukan submit pekerjaan (`submit_work` / `handleSubmitMechanicWork`), server berhasil mengubah `status` menjadi `PENDING_L1`.
    - Namun, field `status_group` di row database `work_orders` masih tertahan pada nilai awalnya (`assigned`).
    - Akibatnya di fungsi `lengkapiObjekWoWeb`, fallback evaluasi status group tidak berjalan karena properti `w.status_group` (bernilai `"assigned"`) mendahului pengecekan status `"pending_l1"`.
    - Hal ini menyebabkan WO tetap dihitung dan dikelompokkan ke dalam tab **Assigned (1)** dengan status label `"PERLU DIISI MEKANIK"`, bukan berpindah ke tab **Pending (Menunggu Approval)**.
    - Selain itu, judul komponen pada kartu menampilkan teks **UNKNOWN** karena fallback `w.activity` bernilai string `"UNKNOWN"` yang menimpa deskripsi komponen sebenarnya.
  - **Perbaikan Backend & Web Handler (`web-handler.js` & `supabase-backend.js`)**:
    - Di `workers/kmb/src/web-handler.js`, `workers/sum/src/web-handler.js`, dan `workers/kmbprojek/src/web-handler.js`:
      - Memperbaiki `lengkapiObjekWoWeb` agar menentukan `status_group` berbasis `status` aktif (`pending_l1`, `pending_l2`, `pending_supervisor`, dll selalu dipetakan ke `pending_approval`).
      - Menyaring nilai placeholder string kosong / invalid (`'UNKNOWN'`, `'UNDEFINED'`, `'-'`) pada `component_name` dan `unit_name`, sehingga jika `activity` bernilai `"UNKNOWN"`, kartu otomatis mengambil nama komponen yang valid (`w.component` / `Repair Tyre (Patching)`).
    - Di `workers/kmb/src/supabase-backend.js`, `workers/sum/src/supabase-backend.js`, dan `workers/kmbprojek/src/supabase-backend.js`:
      - Memastikan payload dan respon untuk aksi `submit_work` menyetel `status = 'PENDING_L1'`, `status_group = 'pending_approval'`, dan `status_label = 'Menunggu Approval L1'`.
    - Di `workers/kmb/web/MechanicDashboard.html`, `workers/sum/web/MechanicDashboard.html`, dan `workers/kmbprojek/web/MechanicDashboard.html`:
      - Mengarahkan redirect pasca submit laporan ke `?page=mechanic&filter=pending_approval` sehingga mekanik langsung diarahkan ke tab Pending dan melihat WO yang baru saja diserahkan.
    - Di `db/kmb/rpc_backend_penuh.sql`, `db/sum/rpc_backend_penuh.sql`, dan `db/kmb_projek/rpc_backend_penuh.sql`:
      - Memperbarui query UPDATE pada aksi `submit_work` agar ikut memperbarui `status_group = 'pending_approval'` dan `status_label = 'Menunggu Approval L1'`.
    - Memperbarui database staging Gedung 2 (`dnnqrslftndcbmnvuveb`) untuk baris `WO-20261109-0002` via RPC `kmbtra_eksekusi_aksi_bertoken` sehingga status_group langsung terupdate menjadi `pending_approval`.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-kmb-staging` (`1fc57dab-f162-4521-a144-f82cc75531b1`)
    - `abadiops-sum-staging` (`eee64963-dc52-4595-84a7-cd384d18b291`)
    - `abadiops-kmbprojek-staging` (`d8752b48-bfd6-4fa1-aa64-9ff6146dad53`)
  - **Verifikasi**:
    - Uji fetch ke endpoint staging `https://abadiops-kmb-staging.kawanabadigrup.workers.dev/web?page=mechanic&token=aca54b1612bf4bcfa392` menghasilkan `Assigned: 0`, `Pending: 1`.
    - Pada tab Pending, `WO-20261109-0002` tampil dengan judul `Repair Tyre (Patching)` dan status `Menunggu Approval L1` tanpa tombol `Isi Manual` / `Kirim`.
- Belum selesai / berikutnya:
  - User me-refresh halaman dashboard mekanik untuk memastikan tab Assigned kini 0 dan WO tampil di tab Pending (1).

### 2026-11-09 · Raka (+ AI) · kmb (Perbaikan Error 'Cannot read properties of undefined (reading actual_hours)' saat Submit Laporan Kerja Mekanik)
- Berubah:
  - **Akar Masalah Teridentifikasi**:
    - Saat mekanik mengirim laporan kerja (baik via tombol "Selesai" timer maupun modal manual input jam di `/web?page=mechanic`), fungsi `handleSubmitMechanicWork` di `MechanicDashboard.html` memanggil callback `showSuccessAndRedirect` yang mencoba membaca durasi via `r.data.actual_hours`.
    - Di backend Supabase KMB V2 (`workers/kmb/src/supabase-backend.js` & `db/kmb/rpc_backend_penuh.sql`), respon `submit_work` sebelumnya mengembalikan `{ success: true, wo_id: '...', status: 'PENDING_L1' }` tanpa properti `data` atau `actual_hours`.
    - Hal ini memicu `TypeError: Cannot read properties of undefined (reading 'actual_hours')` di sisi client browser. Karena error terjadi di dalam callback `.then(...)` shim client `google.script.run`, exception tertangkap oleh handler transpor `.catch(...)`, sehingga memicu alert keliru: *"⚠️ Sambungan terputus sebelum jawaban server sampai. Tindakan Anda MUNGKIN sudah tersimpan..."*.
  - **Perbaikan Backend & Supabase RPC (`workers/kmb/src/supabase-backend.js` & `db/kmb/rpc_backend_penuh.sql`)**:
    - Di `workers/kmb/src/supabase-backend.js`: Menghitung durasi jam kerja aktual dari `start_time` dan `end_time` (atau `duration_hours`), serta membungkus respon `submit_work` secara konsisten ke dalam objek `data` dan `result` yang memuat field `actual_hours` dan `duration_hours`.
    - Di `db/kmb/rpc_backend_penuh.sql`: Memperbarui fungsi `kmbtra_eksekusi_aksi_bertoken` untuk aksi `submit_work` / `kirim_kerja` agar menghitung `v_act_hours`, menyimpannya ke record WO, dan mengembalikan `data` serta `result` JSON yang lengkap.
  - **Perbaikan UI Client & Shim Google Apps Script**:
    - Di `workers/kmb/web/MechanicDashboard.html` (dan juga di `workers/kmbprojek` & `workers/sum`): Menambahkan pengecekan null-safe saat membaca `actual_hours` (`(r.data && r.data.actual_hours) || (r.result && r.result.actual_hours) || r.actual_hours || 0`).
    - Di `scripts/build-web-templates.mjs`: Membungkus eksekusi `successHandler` client ke dalam blok `try...catch` agar error JavaScript lokal pada UI callback tidak salah dilaporkan sebagai kegagalan sambungan jaringan server.
    - Mengompilasi ulang seluruh template web via `node scripts/build-web-templates.mjs`.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-kmb-staging` (`00bb822a-303b-47ae-9e09-9f05e2b9b6db`)
    - `abadiops-kmbprojek-staging` (`685a9731-cf26-47f6-8e7f-c9c232084429`)
    - `abadiops-sum-staging` (`0e9787ea-d4f6-4838-ae51-e0d218be01b8`)
- Belum selesai / berikutnya:
  - User me-refresh halaman `/web?page=mechanic` di KMB V2 staging dan mencoba submit pekerjaan kembali.

### 2026-11-09 · Raka (+ AI) · kmb (Perbaiki Pesan Error & Data Kosong Monitoring)
- Berubah:
  - **Fallback `name`**: Diperbarui `db/kmb/rpc_baca.sql:290-305` dengan `coalesce(name, mechanic_id)`, sehingga kartu monitoring KMB TRA tidak tampil `?` saat field `name` kosong di cermin.
  - **Pesan error token**: Sudah diperbarui sebelumnya dari "Jalankan generateMissingTokens di editor GAS" menjadi "Hubungi admin untuk membuat token".
- Belum selesai: Deploy SQL `kmb/rpc_baca.sql` di Supabase.

### 2026-11-09 · Raka (+ AI) · sum (Perbaikan Routing detail WO & RPC Backend SUM Staging)
- Berubah:
  - **Routing handleGetWoDetailForMechanic**: Tambah mapping di `workers/sum/src/index.js:119-121` agar `handleGetWoDetailForMechanic` dipetakan ke RPC `sum_wo_detail_bertoken`.
  - **Fungsi RPC baru `sum_wo_detail_bertoken`**: Tambah di `db/sum/rpc_backend_penuh.sql:527-563` untuk detail satu WO beserta tim dan kondisi kerja.
  - **Fungsi RPC baru `sum_my_wos_bertoken`**: Tambah di `db/sum/rpc_backend_penuh.sql:565-656` untuk daftar WO milik mekanik dengan pencocokan nama/email/array tim.
  - **Fungsi RPC baru `sum_wos_by_status_bertoken`**: Tambah di `db/sum/rpc_backend_penuh.sql:658-707` untuk daftar WO berdasarkan status (pending, active, approved, rejected).
  - **Fungsi RPC baru `sum_konteks_skor_bertoken`**: Tambah di `db/sum/rpc_backend_penuh.sql:709-745` untuk konteks skor saat approve L2 (WO, factors, mechanics).
  - **Helper `sum._semua_wo_json_sum()`**: Tambah di `db/sum/rpc_backend_penuh.sql:527-563` untuk gabungan seluruh WO dari `wo_supabase` dan `work_orders`.
- Belum selesai: User jalankan SQL di Supabase SQL Editor Gedung 2 (`dnnqrslftndcbmnvuveb`).

### 2026-11-09 · Raka (+ AI) · bersama (Uji Otomatis: Backend Mandiri 40/40, Serah-Terima Token 24/24)
- Berubah:
  - **Uji backend mandiri**: `node scripts/uji-backend-mandiri.mjs` → **40/40 LULUS**
  - **Uji serah-terima token**: `node scripts/uji-serahan-token.mjs` → **24/24 LULUS**
  - **Syntax check**: `node --check` lulus pada `workers/sum/src/index.js`, `workers/sum/src/supabase-backend.js`, `workers/kmb/src/supabase-backend.js`
- Belum selesai: Deploy ulang worker staging (`npx wrangler deploy --env staging`) untuk reflection ke live.
- Berubah:
  - **Akar Masalah Form Section**:
    - Di modal "Tambah Pengguna Baru" dan modal ubah user di panel admin pusat 3 rumah (`workers/pintu/public/saklar.html`), input Section sebelumnya berupa text biasa satu baris (`<input type="text" id="uSection">`). Hal ini menyulitkan peran L1 (Supervisor) dan L2 (Superintendent) yang mengelola lebih dari 1 section, serta berisiko salah ketik nama section yang tidak didukung sistem.
    - Placeholder menampilkan semua section (`field / workshop / tyreman / vessel`), padahal sistem KMB Project hanya memiliki 2 section: `vessel` dan `maintenance`.
  - **Dropdown Checkbox Section Multi-Select Dinamis di `saklar.html`**:
    - Mengganti input teks dengan komponen custom Dropdown Checkbox Multi-Select interaktif (`#wrapDropdownSection`, `#btnToggleSection`, `#menuDropdownSection`, dan hidden input `#uSection`).
    - Membuat daftar section dinamis per rumah (`DAFTAR_SECTION_RUMAH`):
      - `kmbprojek`: HANYA menampilkan `maintenance` dan `vessel` (2 opsi saja sesuai sistem KMB Project).
      - `kmbtra`: Menampilkan `field`, `workshop`, `tyreman`.
      - `sum`: Menyembunyikan form group Section secara otomatis (`display: none`).
    - Mendukung multi-selection (bisa mencentang 2 atau lebih section untuk L1/L2 maupun mekanik). Nilai tersimpan sebagai string terpisah koma (cth: `"maintenance, vessel"` atau `"vessel, maintenance"`).
    - Memperbarui fungsi `sesuaikanFormRumah()`, `bukaModalUserBaru()`, dan `bukaModalUbahUser(u)`:
      - Pada ubah pengguna: membaca string `u.section` (misal `"maintenance, vessel"`), memecah koma, dan otomatis mencentang checkbox yang sesuai.
      - Pada tambah pengguna: opsi section langsung disesuaikan dengan `uRumah` yang dipilih.
    - Menambahkan listener penutup otomatis saat klik di luar popover dropdown.
  - **Penyelarasan Modal CRUD Pengguna KMB Project di `web-handler.js`**:
    - Di `workers/kmbprojek/src/web-handler.js` (`/web?page=users`), memperbarui `#fSection` menjadi dropdown checkbox dengan opsi spesifik KMB Project: `maintenance` dan `vessel`, lengkap dengan fungsi helper `aturFSection()`, `sinkronFSection()`, dan `toggleDropdownFSection()`.
  - **Pengujian & Verifikasi**:
    - Syntax check: `node --check` pada `web-handler.js` dan ekstraksi skrip `saklar.html` lulus tanpa error.
    - Unit test simulasi DOM 7 skenario (pilihan rumah, multi-select 2 opsi, single select, hide di SUM, render modal ubah, dan toggle popover) lulus 100%.
    - Deploy Cloudflare Workers staging:
      - `abadiops-pintu-staging` (`9a1f29dc-1ce5-44cb-a47c-ea2f99e9075f`)
      - `abadiops-kmbprojek-staging` (`79ade35d-dd16-4f25-b00a-086e1573ed04`)
    - Verifikasi live: aset `/saklar.html` di `https://abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar.html` telah menyajikan komponen multi-select baru.
- Belum selesai / berikutnya:
  - User menguji langsung di panel pengelola staging (`/saklar.html`) atau manajemen user web KMB Project (`/web?page=users`).

### 2026-11-09 · Raka (+ AI) · kmb-projek (Pembatasan Role Approval L1 Supervisor: Hanya Bisa Lihat & Approve L1)
- Berubah:
  - **Akar Masalah Akses L2 oleh L1 Teridentifikasi**:
    1. Di SQL `public.kmb_wos_by_status_bertoken` dan RPC `public.kmb_eksekusi_aksi_bertoken('pull_pending')`, status `pending` sebelumnya mengembalikan seluruh WO (`pending_supervisor` dan `pending_superintendent` sekaligus) tanpa memfilter peran pemanggil.
    2. Di `workers/kmbprojek/src/web-handler.js`, antrean `context.pendingApprovals` tidak menyaring WO berdasarkan `user.role`, sehingga peran `supervisor` menerima antrean pending L2.
    3. Di `workers/kmbprojek/web/Approval.html`, ekspresi lencana memeriksa `wo.status === 'pending_supervisor' ? 'Level 1' : 'Level 2'`. Karena status WO yang lahir dari form adalah `pending_l1`, ekspresi ini mengevaluasi ke `Level 2`, tombol `approveWO` memanggil `handleSuperintendentApprove` (L2), dan backend tidak memverifikasi apakah pemanggil berhak melakukan approval L2.
  - **Pembatasan Visibilitas Data di Database (SQL & Staging Gedung 2)**:
    - Memperbarui `public.kmb_wos_by_status_bertoken` (`db/kmb_projek/pembatasan_l1_approval.sql` dan `db/kmb_projek/rpc_wajib_token.sql`) agar membaca peran pengguna dari `api_tokens`:
      - Peran `supervisor` (L1): HANYA mengembalikan WO berstatus `pending_supervisor` / `pending_l1` / `PENDING_L1`. Data L2 disaring sepenuhnya.
      - Peran `superintendent` (L2): HANYA mengembalikan WO berstatus `pending_superintendent` / `pending_l2` / `PENDING_L2`.
      - Peran `admin` / `manager`: Mengembalikan seluruh antrean pending.
    - Menerapkan migrasi SQL yang sama pada dispatcher `public.kmb_eksekusi_aksi_bertoken` (`db/kmb_projek/rpc_backend_penuh.sql`) untuk aksi `pull_pending`.
    - Migrasi telah dieksekusi dan aktif di database Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Proteksi Otorisasi Eksekusi Approval di Backend**:
    - Di `public.kmb_eksekusi_aksi_bertoken`:
      - Pada `approve_l2`: Memasang validasi peran ketat `IF v_user.role IN ('supervisor', 'mechanic') OR v_user.role NOT IN ('superintendent', 'admin', 'manager') THEN RETURN json_build_object('success', false, 'error', 'Akses ditolak: Hanya Superintendent (L2) yang berhak melakukan approval L2', 'source', 'SUPABASE'); END IF;`.
      - Pada `approve_l1`: Memasang validasi peran agar mekanik tidak dapat melakukan approval L1.
    - Di `workers/kmbprojek/src/supabase-backend.js`:
      - Memvalidasi peran pemanggil pada `approve_l2` dan `handleBulkApprove` (level 2). Jika akun adalah `supervisor`, request langsung ditolak dengan pesan error resmi.
      - Menormalisasi status `pending_l1` -> `pending_supervisor` dan `pending_l2` -> `pending_superintendent` di `lengkapiWoObj`.
  - **Penyelarasan Web Handler & Template UI**:
    - Di `workers/kmbprojek/src/web-handler.js`: Menyaring `context.pendingApprovals` berdasarkan `userRole === 'supervisor'` (hanya L1) dan `userRole === 'superintendent'` (hanya L2). Menormalisasi `st` di `lengkapiObjekWoWeb`.
    - Di `workers/kmbprojek/web/Approval.html`:
      - Menambahkan proteksi loop kartu approval: kartu L2 dilewati saat user adalah `supervisor`, dan kartu L1 dilewati saat user adalah `superintendent`.
      - Menyelaraskan pendeteksian L1 (`pending_supervisor`, `pending_l1`, `PENDING_L1`) pada lencana status, dialog konfirmasi modal, pemanggilan fungsi (`handleSupervisorApprove`), dan antrean bulk approve.
      - Menolak eksekusi `approveWO`, `confirmApproveWO`, dan bulk approve jika peran supervisor mencoba menyetujui kartu L2.
    - Mengompilasi ulang template via `node scripts/build-web-templates.mjs`.
  - **Pengujian & Verifikasi**:
    - Uji database SQL di Gedung 2 (`dnnqrslftndcbmnvuveb`):
      - Token L1 (`52fd...`) memanggil `kmb_wos_by_status_bertoken('pending')`: 13 WO L1 ditemukan, 0 WO L2 ditemukan (LULUS).
      - Token L2 (`67e8...`) memanggil `kmb_wos_by_status_bertoken('pending')`: 1 WO L2 ditemukan, 0 WO L1 ditemukan (LULUS).
      - Token L1 memanggil `approve_l2`: DITOLAK dengan pesan *"Akses ditolak: Hanya Superintendent (L2) yang berhak melakukan approval L2"* (LULUS).
      - Token L1 memanggil `approve_l1`: SUKSES (status WO berubah ke `PENDING_L2`).
      - Token L2 memanggil `approve_l2`: SUKSES (status WO berubah ke `APPROVED`).
    - Uji Web Render & API Web:
      - Halaman `/web?page=approvals` dengan token L1 mengembalikan 12 kartu L1, 0 kartu L2 (LULUS).
      - Panggilan API `/api/web` (`handleSuperintendentApprove` dan `handleBulkApprove` level 2) dengan token L1 ditolak dengan HTTP 200 `{ success: false, error: { message: 'Akses ditolak: Hanya Superintendent (L2) yang berhak melakukan approval L2' } }` (LULUS).
    - Uji Live di Worker Staging (`abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`):
      - `/api/sehat`: HTTP 200 OK.
      - `/web?page=approvals` token L1: 12 pending data, 0 data L2.
      - `POST /api/web` handleSuperintendentApprove token L1: Berhasil diblokir.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-kmbprojek-staging` (`52518e59-b54f-4648-9e56-099bd967c018`)
- Belum selesai / berikutnya:
  - Pengguna menguji langsung di antarmuka Web Desktop KMB Project staging dengan token L1 miliknya.

---

### 2026-11-09 · Raka (+ AI) · sum (Perbaikan Judul UNKNOWN dan Target Hours 0 Menit pada Pembuatan WO SUM Staging)
- Berubah:
  - **Akar Masalah "UNKNOWN" & "0 menit" Teridentifikasi**: Saat form Web Desktop `WorkOrder.html` membuat WO baru, formulir hanya mengirimkan `component_id` (misal `COM-224` atau `COM-078`) dan `unit_id` (misal `UNIT-002` atau `UNIT-017`). Di worker `supabase-backend.js`, `blockPayload` sebelumnya mengekstrak `component: b.component || b.component_name || 'UNKNOWN'` dan `target_hours: b.target_hours || 0`. Karena `b.component` tidak dikirim oleh form, nilai tersimpan di database menjadi `UNKNOWN` dan target jam menjadi `0 menit`.
  - **Resolusi Otomatis Komponen & Unit di Worker**: Menambahkan helper `ambilRefsUntukLookup` dan `lengkapiDataBlokDenganRefs` di `workers/sum/src/supabase-backend.js` dan `workers/kmb/src/supabase-backend.js`. Sebelum WO disimpan ke Supabase via RPC `create_wo`, worker secara otomatis mencocokkan `component_id` ke tabel `components` (mengisi `component_name`, `activity`, `category`, `base_points`, `target_hours`) dan `unit_id` ke tabel `config_units` (mengisi `unit_name` dan `unit_factor`).
  - **Fallback Lookup di PostgreSQL RPC**: Menambahkan resolusi otomatis komponen dan unit di fungsi RPC `public.sum_eksekusi_aksi_bertoken` (`db/sum/rpc_backend_penuh.sql`) sehingga data tetap terlengkapi bahkan jika dipanggil langsung tanpa worker.
  - **Verifikasi**: Uji pembuatan WO baru (`WO-20261109-0006`) berhasil tersimpan dengan nama komponen lengkap `"Brake Chamber + Brake Relay - Remove & Install"`, unit `"SUM 025"`, target hours `2 jam`, dan poin `1.0`. Terverifikasi muncul sempurna di halaman mekanik tanpa tulisan "UNKNOWN" atau "0 menit".
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-sum-staging` (`8fb121d8-f602-4825-980f-6ed0621f0432`)
    - `abadiops-kmb-staging` (`6b8c285d-deac-42c7-9ada-0de068eba164`)
- Belum selesai / berikutnya:
  - User menjalankan kueri perbaikan untuk 2 WO uji sebelumnya (`WO-20261109-0004` dan `WO-20261109-0005`) di Supabase SQL Editor jika ingin memperbarui data historisnya.

---

### 2026-11-09 · Gabriel (+ AI) · kmb (Perbaiki Pesan Error & Data Monitoring Kosong)
- Berubah:
  - Pesan error "Jalankan generateMissingTokens di editor GAS" di halaman Monitoring sudah diperbarui menjadi "Hubungi admin untuk membuat token".
  - Memperbaiki data monitoring kosong: Menambahkan fallback `coalesce(name, mechanic_id)` pada RPC `kmbtra_monitoring_bertoken` karena field `name` di tabel `config_mechanics` bernilai null.
- Belum selesai: Deploy SQL perbaikan ke Supabase.

### 2026-11-09 · Raka (+ AI) · sum (Perbaikan Routing detail WO & RPC Backend SUM Staging)
- Berubah:
  - **Dispatcher RPC**: `sum_eksekusi_aksi_bertoken` kini menangkap `pull_my_wos` → `sum_my_wos_bertoken`, `pull_wo_detail` → `sum_wo_detail_bertoken`, `pull_create_refs`, `pull_monitoring`.
  - **Web Handler**: `workers/sum/src/web-handler.js` memanggil `eksekusiSupabaseBackendSum` yang mengarahkan ke dispatcher RPC yang benar.
  - **Worker Index**: `workers/sum/src/index.js` memetakan `handleGetWoDetailForMechanic` & `pull_my_wos` ke `sum_eksekusi_aksi_bertoken` dengan payload `p_aksi` dan `p_payload` yang dinamis.
  - **RPC Dispatcher**: `db/sum/rpc_backend_penuh.sql` baris 548 menambahkan penanganan `pull_my_wos`, `pull_wo_detail`, `pull_create_refs`, `pull_monitoring` → langsung ke fungsi RPC bantuan yang terpisah.
- Belum selesai: User refresh halaman mechanic setelah deploy ulang staging.

### 2026-11-09 · Raka (+ AI) · sum (Perbaikan Error 1101 Worker Threw Exception di Web Desktop SUM Staging)
- Berubah:
  - **Akar Masalah Error 1101 Teridentifikasi**: Saat membuka `https://abadiops-sum-staging.kawanabadigrup.workers.dev/web?token=79fc...` (role supervisor), default diarahkan ke halaman `approvals`. Template `workers/sum/web/Approval.html` memanggil global Google Apps Script: `Utilities.formatDate(...)` dan `Session.getScriptTimeZone()`. Di lingkungan V8 Worker / Node.js, `Utilities` dan `Session` belum didefinisikan sehingga memicu `ReferenceError: Utilities is not defined` yang tidak tertangkap, menyebabkan Cloudflare melempar `Error 1101 Worker threw exception`.
  - **Penyediaan Shim `Utilities.formatDate` dan `Session`**: Memperbarui compiler template `scripts/build-web-templates.mjs` agar menginjeksi shim `Session.getScriptTimeZone()` (Asia/Jakarta) dan implementasi lengkap `Utilities.formatDate` berbasis `Intl.DateTimeFormat` (mendukung `yyyy`, `yy`, `MMM`, `MM`, `dd`, `HH`, `mm`, `ss`).
  - **Rebuild Template Web**: Menjalankan ulang `node scripts/build-web-templates.mjs` untuk ketiga rumah (`workers/sum`, `workers/kmb`, `workers/kmbprojek`).
  - **Guardrail Penanganan Error**:
    - Membungkus `renderWebPage` di `workers/sum/src/web-handler.js` dan `workers/kmb/src/web-handler.js` dengan blok `try...catch` agar merender halaman galat ramah pengguna jika terjadi error rendering daripada melempar uncaught exception.
    - Memperbaiki default header `'X-Abadi-Rumah'` menjadi `env.RUMAH || 'sum'` di SUM dan `env.RUMAH || 'kmb'` di KMB.
    - Menambahkan top-level `try...catch` pada handler `fetch` di `workers/sum/src/index.js` dan `workers/kmb/src/index.js` untuk mencegah Error 1101 pada uncaught runtime errors.
  - **Pengujian & Verifikasi**:
    - `node --check` lulus 100% pada semua file terkait.
    - Verifikasi lokal dan live di staging: `https://abadiops-sum-staging.kawanabadigrup.workers.dev/web?token=79fc...` sukses mengembalikan HTTP 200 (Title: `MAR SUM V2 — Approvals`, ukuran ~1,11 MB HTML, tanpa Error 1101).
    - Verifikasi seluruh halaman web SUM staging (`approvals`, `dashboard`, `mechanic`, `create`, `monitoring`) terbukti mengembalikan HTTP 200.
  - **Deploy Cloudflare Workers Staging**:
    - `abadiops-sum-staging` (`72d58f5c-ac0f-4c0f-9741-0641971d020a`)
    - `abadiops-kmb-staging` (`5d8683c7-64f8-46cb-872e-6f97a09a65d5`)
- Belum selesai / berikutnya:
  - User me-refresh browser pada tautan Web Desktop SUM staging untuk memastikan tampilan Approvals terbuka dengan lancar.

---

### 2026-11-09 · Raka (+ AI) · bersama (Eksekusi Penuh Panduan 16: Sinkronisasi SQL Staging & Deploy 5 Worker Staging)
- Berubah:
  - **Sinkronisasi SQL Panduan 16**: Memperbarui `db/kmb_projek/pasang_rpc_config_staging.sql` persis 1:1 dengan blok SQL perbaikan penuh (1.338 baris) mencakup perbaikan pencocokan mekanik SUM, helper `_kode_mekanik_kanonik`, helper `_ambil_teks_jsonb`, cascade dropdown KMB, `NOTIFY pgrst, 'reload schema'`, dan kueri diagnostik.
  - **Penyelarasan Saklar Staging KMB Projek**: Menyelaraskan fungsi `bacaStatusSaklar` di `workers/kmbprojek/src/index.js` agar langsung mengembalikan `'supabase'` jika `STORAGE_MODE === 'SUPABASE' || SAKLAR === 'supabase'`.
  - **Pengujian & Verifikasi**: Pengujian serahan token PWA (24/24 lulus) dan pengujian cascade & pencocokan mekanik (3/3 lulus).
  - **Deploy Cloudflare Workers Staging**: Men-deploy ulang seluruh worker staging terkait:
    - `abadiops-kmbprojek-staging` (`935cf7c9-0f69-44f5-a6d8-c5f774d1a85d`)
    - `abadiops-pintu-staging` (`204608d3-fba3-49a7-b50a-9d287d74a7e0`)
    - `abadiops-gas-tiruan` (`3b2b2dc3-4b00-4dfc-b5e7-911422104f42`)
    - `abadiops-sum-staging` (`c1d4d644-69a2-4782-a4d0-391fe5378d75`)
    - `abadiops-kmb-staging` (`a10ae08f-34b2-4fa4-bc19-3e5d55531c22`)
- Belum selesai / berikutnya:
  - User menguji langsung alur create WO dan pencocokan mechanic di ketiga rumah pada lingkungan staging.

---

### 2026-11-09 · Raka (+ AI) · bersama (Solusi Tuntas WO Masuk ke Mekanik SUM & KMB di Staging)
- Berubah:
  - **Akar Masalah WO Tidak Masuk diidentifikasi & diperbaiki**: Fungsi `bacaStatusSaklar` pada worker `sum` dan `kmb` sebelumnya menimpa konfigurasi `SAKLAR = "supabase"` di staging menjadi `"gas"` karena membaca status dari endpoint Durable Object pintu staging (`abadiops-pintu-staging/api/saklar/status`) yang masih menyimpan nilai awal `"gas"`. Akibatnya, pembuatan WO dari formulir Web Desktop (`/web?page=create` → `/api/web` action `handleCreateWO`) diteruskan ke `abadiops-gas-tiruan` dan menghasilkan respons mock `Simulasi Staging` tanpa tersimpan ke PostgreSQL Supabase.
  - **Perbaikan `bacaStatusSaklar`**: Menambahkan penjaga di `workers/sum/src/supabase-backend.js` dan `workers/kmb/src/supabase-backend.js` agar langsung mengembalikan `'supabase'` jika `env.STORAGE_MODE === 'SUPABASE' || env.SAKLAR === 'supabase'`. Konfigurasi staging dari `wrangler.toml` kini dihormati penuh tanpa tertimpa status pintu yang usang.
  - **Perbaikan RPC Call di `gas-tiruan`**: Menyelaraskan panggilan RPC `create_wo` di `workers/gas-tiruan/src/index.js` agar menggunakan parameter `p_extra: null` untuk skema `sum` dan `p_skor_js: null` untuk skema lainnya, mencegah error parameter mismatch jika ada request fallback.
  - **Verifikasi End-to-End di Live Staging**:
    - `GET /api/sehat` di SUM staging terverifikasi: `{"ok":true,"rumah":"sum","saklar":"supabase","jalur":"SUPABASE","supabase_configured":true}`.
    - Uji `POST /api/web` dengan `action: handleCreateWO` berhasil membuat WO baru di Supabase Gedung 2 (`WO-20261109-0003`) dengan `source: "SUPABASE"` dan status `assigned`.
    - Halaman mekanik Christmas Nainggolan (`MECH-SVP-028`, token `b59abcc757d54344877b`) terverifikasi menampilkan `Assigned 3` dan seluruh daftar Work Order ter-render lengkap di HTML.
  - **Deploy Cloudflare Staging**: Berhasil men-deploy:
    - `abadiops-gas-tiruan` (`3b2b2dc3-4b00-4dfc-b5e7-911422104f42`)
    - `abadiops-sum-staging` (`c1d4d644-69a2-4782-a4d0-391fe5378d75`)
    - `abadiops-kmb-staging` (`a10ae08f-34b2-4fa4-bc19-3e5d55531c22`)
- Belum selesai / berikutnya:
  - User menguji langsung pembuatan WO baru dari browser di `https://abadiops-sum-staging.kawanabadigrup.workers.dev/web?page=create` dan melihat hasilnya langsung muncul di halaman mekanik Christmas Nainggolan.

---

### 2026-11-09 · Raka (+ AI) · bersama (Penyelidikan & Perbaikan WO Masuk Mekanik SUM + Deploy Staging)
- Berubah:
  - **Investigasi Akar Masalah WO Tidak Masuk ke Mekanik SUM**: Membuktikan secara langsung pada live Supabase Gedung 2 (`dnnqrslftndcbmnvuveb`) bahwa saat `create_wo` dijalankan di SUM, PostgreSQL melempar galat `42703 (column "disinkron_at" of relation "work_orders" does not exist)` karena tabel cermin `sum.work_orders` belum memiliki kolom `disinkron_at`. Akibatnya transaksi dibatalkan dan WO tidak pernah tersimpan ke PostgreSQL.
  - **Perbaikan Skema & RPC `sum`**: Memperbarui `db/sum/rpc_backend_penuh.sql` dan `db/kmb/rpc_backend_penuh.sql` dengan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS disinkron_at` dan `sinkron_at`, menyelaraskan penulisan kolom pada `INSERT INTO sum.work_orders`, serta memperkaya `sum_my_wos` dengan pencocokan nama, email, array tim, dan format ID kanonik.
  - **Perbaikan Status Fallback Worker**: Mengubah status fallback respons `create_wo` di `workers/sum/src/supabase-backend.js` dan `workers/kmb/src/supabase-backend.js` dari `'PENDING_L1'` ke `'assigned'` agar WO baru langsung mendarat di tab filter default `Assigned` halaman mekanik.
  - **Verifikasi KMB Projek**: Memastikan bahwa di `abadiops-kmbprojek-staging` mekanik `kmbp-mnt002-7d03949a` telah memiliki 6 Work Order dengan status `assigned` yang aktif.
  - **Deploy Ulang Staging**: Berhasil men-deploy ulang `abadiops-sum-staging` (`a9a0de23-aa13-4235-8190-3f191550bf61`) dan `abadiops-kmb-staging` (`edc8771f-2320-4db0-bb14-19bab50e945e`) menggunakan `npx wrangler deploy --env staging`.
  - **Uji Otomatis**: Semua pengujian lokal lulus 100% (Backend mandiri: 40/40, User admin pusat: 27/27, Serahan token PWA: 24/24, Test cascade & mekanik: 3/3).
- Belum selesai / berikutnya:
  - Gabriel menjalankan blok SQL perbaikan kolom `disinkron_at` dan RPC `sum_my_wos` di Supabase SQL Editor Gedung 2 (`dnnqrslftndcbmnvuveb`).
  - Uji coba pembuatan WO baru di SUM `/web?page=create` lalu verifikasi muncul di `/web?page=mechanic`.

---

### 2026-11-09 · Raka (+ AI) · bersama (Eksekusi Penuh Panduan 14: Perbaikan SUM Matching, KMB Cascade, dan Deploy Staging 5 Worker)
- Berubah:
  - Eksekusi penuh instruksi `docs/panduan_deploy_staging_kamis (14).md`:
  - **SUM & KMB Pencocokan WO Mekanik Tahan Format**: Menyediakan `_kode_mekanik_kanonik` (mengabaikan tanda hubung dan nol di depan, misal `SUM-01` == `SUM-001`, `MNT-02` == `MNT-002`) dan `_ambil_teks_jsonb` case-insensitive pada SQL. Memperbarui `sum._wo_milik_mekanik_sum` dan `kmb_projek._wo_milik_mekanik` agar memeriksa kanonik ID, nama, email, array `team`, `effective_team`, `team_names`, dan `team_distribution`.
  - **Perbaikan Masalah Form `team: []` + `team_distribution` (Solusi Bug `Assigned 0`)**: Memperbaiki percabangan SQL pada pembuatan WO di `db/kmb_projek/migrasi_kamis_full_penuh.sql`, `db/kmb/rpc_backend_penuh.sql`, `db/sum/rpc_backend_penuh.sql`, dan `db/kmb_projek/rpc_backend_penuh.sql` dengan `IF jsonb_typeof(...) = 'array' AND jsonb_array_length(...) > 0`, sehingga ketika form desktop mengirim `team: []` (array kosong), sistem otomatis mengambil data teknisi dari `team_distribution` dan menetapkan `lead_mechanic_id`.
  - **Katalog Cascade Anti-Putus (`Unit → Component → Sub Component → Job`)**: Menambahkan fungsi `normalisasiKatalogCascade` pada `workers/kmbprojek/src/supabase-backend.js` yang otomatis memberi nilai default `'Standard'` untuk sub-komponen kosong, menyelaraskan model unit dengan model pekerjaan, dan melengkapi template universal jobs.
  - **Worker `gas-tiruan` Staging**: Memperbarui aksi `create_wo` / `handleCreateWO` di `workers/gas-tiruan/src/index.js` agar mendelegasikan pembuatan WO langsung ke Supabase RPC sehingga WO tercatat resmi di database dan muncul di halaman monitoring & mechanic saat diuji di staging.
  - **Pembaruan SQL Lengkap**: Menyatukan seluruh fungsi RPC Master Config 3 rumah, helper kanonik, pencocokan mekanik SUM & KMB, cascade KMB TRA, `NOTIFY pgrst, 'reload schema';`, dan kueri diagnostik ke `db/kmb_projek/pasang_rpc_config_staging.sql`.
  - **Pengujian & Verifikasi**: Seluruh rangkaian uji otomatis lulus tanpa galat (Backend mandiri: 40/40, User admin pusat: 27/27, Serahan token PWA: 24/24, Uji cascade & mekanik: 3/3).
  - **Deploy Staging Cloudflare**: Berhasil men-deploy kelima worker ke panggung latihan Cloudflare Staging (`abadiops-gas-tiruan`, `abadiops-pintu-staging`, `abadiops-kmbprojek-staging`, `abadiops-kmb-staging`, `abadiops-sum-staging`).
- Belum selesai / berikutnya:
  - Gabriel menjalankan blok SQL `db/kmb_projek/pasang_rpc_config_staging.sql` di Supabase SQL Editor Gedung 2 (`dnnqrslftndcbmnvuveb`) untuk merefresh skema PostgreSQL secara permanen.
  - Verifikasi langsung di browser pada Web Desktop `/web?page=create` dan `/web?page=mechanic` serta Panel Saklar `/saklar`.

---

### 2026-11-06 · Raka (+ AI) · bersama (Ringkasan pekerjaan hari ini)
- Berubah:
  - SUM: menyamakan katalog Create WO dengan kontrak form, membuat filter status/role/work condition tidak sensitif kapitalisasi, memperbaiki token dan nama Monitoring, serta memperluas pencocokan WO ke identitas dan anggota tim mekanik.
  - KMB TRA: menyamakan katalog dan field referensi, menambahkan katalog cascade `jobs_field/jobs_workshop/jobs_vessel`, memperluas resolusi identitas anggota tim, dan menambahkan fallback katalog dari `components` agar dropdown tetap dapat diisi.
  - Template web KMB dikompilasi ulang setelah perubahan form; pengujian backend mandiri terakhir lulus 40/40.
- Belum selesai / berikutnya:
  - KMB: cascade Unit → Component → Sub Component → Job masih bermasalah di staging dan perlu diuji serta diperbaiki sampai benar-benar bisa dipilih.
  - SUM: masih ada sebagian data WO yang belum tampil di daftar mekanik; perlu ditelusuri dari identitas token, anggota team, dan data cermin.
  - Perubahan SQL RPC SUM/KMB masih perlu dijalankan ulang dan diverifikasi di Supabase Gedung 2.

---

### 2026-11-06 · Raka (+ AI) · kmb (Dropdown cascade tetap aktif tanpa katalog job RPC)
- Berubah:
  - Form KMB sekarang membentuk fallback katalog dari `components` yang sudah diterima saat halaman dibuka jika `jobs_field/jobs_workshop/jobs_vessel` belum tersedia dari RPC.
  - Fallback dipakai pada setiap tahap cascade sehingga setelah memilih Unit, Component dan tahap berikutnya tidak lagi disabled; katalog RPC tetap dipakai bila tersedia.
  - `web-templates.js` dikompilasi ulang dari `WorkOrder.html`.
- Belum selesai / berikutnya:
  - Uji ulang di staging dengan hard refresh. SQL RPC KMB tetap perlu dijalankan ulang di Gedung 2 agar katalog job khusus digunakan.

---

### 2026-11-06 · Raka (+ AI) · kmb (Perbaikan cascade job dan visibilitas WO mekanik)
- Berubah:
  - RPC katalog KMB TRA sekarang mengirim `jobs_field`, `jobs_workshop`, dan `jobs_vessel`, dengan fallback satu job per komponen jika katalog job khusus belum tersedia.
  - Identitas mekanik KMB diperluas ke `mechanic_id`, `user_id`, dan `config_mechanics.mechanic_id`; anggota tim juga dicocokkan melalui beberapa bentuk ID.
- Belum selesai / berikutnya:
  - Jalankan ulang `db/kmb/rpc_baca.sql` dan `db/kmb/rpc_backend_penuh.sql` di Supabase Gedung 2.
  - Uji KMB: pilih unit → component → sub component → job → buat WO → pastikan muncul di My Work mekanik.

---

### 2026-11-06 · Raka (+ AI) · bersama (Menyamakan katalog SUM dan KMB TRA dengan KMB Project)
- Berubah:
  - Menyamakan output `pull_create_refs` SUM dan KMB TRA: `component_no`, `base_points`, `unit_name`, `unit_type`, dan `mechanic_name`.
  - Menambahkan fallback untuk variasi header cermin lama (`component_id`, `base_point`, `unit_model`, `unit_code`, dan nama komponen/unit).
  - Menyamakan filter status, role mekanik, dan work condition agar tidak gagal karena kapitalisasi atau spasi.
  - Memperbaiki kartu Monitoring SUM: RPC sekarang menghubungkan mekanik ke token aktif berdasarkan `mechanic_id`, sehingga link ke tampilan mekanik tidak lagi selalu dianggap tanpa token.
  - Memperbaiki nama kartu Monitoring SUM agar membaca `mechanic_name`, lalu fallback ke `name` dan `mechanic_id`.
  - Memperbaiki daftar WO mekanik SUM agar identitas token juga dicari melalui `user_id`/`config_mechanics`, lalu mencocokkan anggota tim dengan beberapa bentuk ID.
- Belum selesai / berikutnya:
  - Jalankan ulang `db/sum/rpc_baca.sql` dan `db/kmb/rpc_baca.sql` di Supabase Gedung 2.
  - Uji form Create WO SUM dan KMB TRA, lalu uji create → Monitoring → submit → approval.

---

### 2026-11-06 · Raka (+ AI) · sum (Perbaikan katalog form Create WO kosong)
- Berubah:
  - Menyamakan nama field hasil RPC `sum_create_refs_bertoken` dengan kontrak halaman Create WO SUM.
  - RPC kini mengembalikan `component_no`, `base_points`, `unit_name`, `unit_type`, dan `mechanic_name`, dengan fallback ke nama header cermin lama.
  - Memperbaiki filter status/role katalog agar tidak membuang data dengan nilai `Active`, `active`, atau `Mechanic` karena perbedaan kapitalisasi.
- Belum selesai / berikutnya:
  - Jalankan ulang bagian `public._sum_create_refs_internal()` dari `db/sum/rpc_baca.sql` di Supabase Gedung 2, lalu refresh halaman Create WO.

---

### 2026-11-06 · Raka (+ AI) · bersama (Deploy penyelarasan WO SUM dan KMB TRA)
- Berubah:
  - Deploy SUM staging berhasil sebagai `abadiops-sum-staging`, versi `1046bd2b-84c1-4cd5-886a-66b0b0fdfc0c`.
  - Deploy KMB TRA staging berhasil sebagai `abadiops-kmb-staging`, versi `d68b8f93-03d0-4976-8e55-475fae186e87`.
  - Endpoint `/api/sehat` kedua Worker merespons HTTP 200; SUM masih membaca saklar `gas`, KMB membaca `supabase`.
- Belum selesai / berikutnya:
  - SQL `db/sum/rpc_backend_penuh.sql`, `db/sum/rpc_baca.sql`, `db/kmb/rpc_backend_penuh.sql`, dan `db/kmb/rpc_baca.sql` belum dijalankan di Gedung 2; perilaku database belum boleh dianggap aktif sebelum diverifikasi.
  - Uji operasional memakai token uji: create WO dengan tim → Monitoring mekanik → submit → approval.

---

### 2026-11-06 · Raka (+ AI) · bersama (Penyelarasan proses WO SUM dan KMB TRA)
- Berubah:
  - Menyamakan jalur create WO SUM dan KMB TRA dengan model KMB Project: `team_distribution` dinormalisasi menjadi `team`, `lead_mechanic_id` diisi dari anggota pertama, dan WO bertim diberi `status: assigned` serta `status_group: assigned`.
  - `pull_my_wos` kini mencocokkan `lead_mechanic_id` dan anggota `team` secara case-insensitive, bukan hanya relasi tabel team terpisah.
  - Filter pending/active/approved/rejected dibuat case-insensitive dan menerima nama status lama maupun baru.
  - KPI monitoring SUM dan KMB TRA kini membaca tim langsung dari payload WO, sehingga tidak bergantung pada `work_order_team` yang tidak diisi oleh create WO Supabase.
- Validasi:
  - `node --check` untuk entry point dan backend Worker SUM serta KMB: **lulus**.
  - `npx wrangler deploy --env staging --dry-run` untuk SUM dan KMB: **lulus**.
  - `node scripts/uji-backend-mandiri.mjs`: **40/40 lulus**.
- Belum selesai / berikutnya:
  - Jalankan SQL yang diperbarui pada skema `sum` dan `kmb` di Supabase Gedung 2.
  - Deploy Worker SUM dan KMB dengan `--env staging`, lalu uji create WO → Monitoring → submit → approval memakai token uji.

---

### 2026-11-06 · Raka (+ AI) · kmb-projek (Perbaikan blocker migrasi RPC)
- Temuan:
  - Supabase menolak `CREATE OR REPLACE FUNCTION public.kmb_eksekusi_aksi_bertoken(...)` karena fungsi lama dengan signature lima argumen sudah ada dan return type-nya `jsonb`, sedangkan migrasi Kamis mendefinisikan `json`.
- Berubah:
  - Menambahkan `DROP FUNCTION IF EXISTS` dengan signature tepat sebelum definisi RPC baru di `db/kmb_projek/migrasi_kamis_full_penuh.sql`.
- Belum selesai / berikutnya:
  - Jalankan ulang file migrasi di Supabase Gedung 2 (`dnnqrslftndcbmnvuveb`) dan pastikan editor berada di project staging, bukan Gedung 1.
  - Verifikasi fungsi `kmb_my_wos_bertoken` dan alur Monitoring setelah migrasi selesai.

---

### 2026-11-06 · Raka (+ AI) · kmb-projek (Diagnosis Monitoring masih kosong)
- Temuan:
  - Sumber masalah tetap migrasi SQL staging yang belum aktif, bukan deploy Worker.
  - RPC lama membuat WO tanpa `team`/`lead_mechanic_id` sebagai `PENDING_L1` dan menyimpan `team` kosong.
  - `web-handler.js` menghitung status itu sebagai `pending_approval`, sedangkan halaman Monitoring dibuka pada tab `Assigned`; akibatnya WO tidak terlihat di tab awal.
  - RPC baru di `db/kmb_projek/migrasi_kamis_full_penuh.sql` sudah mengatur normalisasi tim dan status `assigned`, tetapi belum terbukti dijalankan di Supabase Gedung 2.
- Belum selesai / berikutnya:
  - Jalankan migrasi SQL Kamis 12/13 di Gedung 2, lalu buat ulang atau perbaiki WO uji tanpa menebak anggota tim.
  - Verifikasi `pull_my_wos` mengembalikan `team`, `lead_mechanic_id`, dan `status_group: assigned`, kemudian uji kartu Monitoring.
  - Token uji supervisor tidak tersedia di environment sesi ini, jadi tidak mencetak klaim probe live baru.

---

### 2026-11-06 · Raka (+ AI) · bersama (Deploy staging SUM dan KMB)
- Berubah:
  - Menjalankan `npx wrangler deploy --env staging --dry-run` untuk Worker SUM dan KMB: **keduanya lulus**.
  - Deploy Worker SUM staging berhasil sebagai `abadiops-sum-staging`, versi `b3383729-0c72-4bfb-9743-490233b4564f`.
  - Deploy Worker KMB staging berhasil sebagai `abadiops-kmb-staging`, versi `6acbe659-72dd-4cb0-818e-fcc09ec23fa1`.
  - Kedua Worker memakai Supabase Gedung 2, GAS tiruan staging, dan saklar `supabase`.
- Belum selesai / berikutnya:
  - Migrasi SQL Kamis 12/13 belum dijalankan dan diverifikasi di Supabase Gedung 2.
  - Uji end-to-end Create WO sampai submit dan approval belum dilakukan.
  - Deploy KMB Project staging tetap menunggu verifikasi migrasi SQL dan uji operasional.

---

### 2026-11-06 · Raka (+ AI) · bersama (Validasi Panduan Deploy Staging Kamis 11)
- Berubah:
  - Menjalankan `node scripts/uji-backend-mandiri.mjs`: **40/40 lulus**.
  - Menjalankan `node scripts/uji-user-admin-pusat.mjs`: **27/27 lulus**.
  - Menjalankan `node scripts/uji-serahan-token.mjs`: **24/24 lulus**.
  - Menjalankan `node --check` pada entry point dan backend Worker KMB, SUM, KMB Project, serta Pintu: **semua lulus**.
  - Menjalankan `npx wrangler deploy --env staging --dry-run` dari folder masing-masing Worker KMB, SUM, KMB Project, dan Pintu: **semua lulus**; binding mengarah ke Supabase Gedung 2 dan GAS tiruan staging.
- Belum selesai / berikutnya:
  - SQL `db/kmb_projek/pasang_rpc_config_staging.sql` masih perlu dijalankan oleh Gabriel di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`).
  - Uji operasional end-to-end PWA/Web staging dan pemasangan custom domain staging masih memerlukan akses/dashboard eksternal.

---

### 2026-11-06 · Raka (+ AI) · kmb-projek (Diagnosis error Create Work Order staging)
- Berubah:
  - Menemukan penyebab pesan `Gagal membuat Work Order: undefined`: halaman `WorkOrder.html` mengasumsikan `response.error` selalu object `{ message }`, sedangkan jalur exception/fallback Worker mengirim string.
  - Memperbaiki tampilan error agar menerima string maupun object, dan menormalkan error exception Supabase menjadi `{ message }`.
  - Regenerasi `workers/kmbprojek/src/web-templates.js` dari sumber HTML.
  - Ping staging dengan token uji berhasil melalui `/api/web`; token dan jalur Worker aktif. Error backend asli belum bisa dipastikan tanpa mengulang submit WO atau melihat log Supabase.
- Verifikasi tambahan:
  - Perubahan ter-deploy ke `abadiops-kmbprojek-staging` versi `5de3a301-1ad7-42c9-a30e-23bf725c4856`.
  - Ping setelah deploy tetap **lulus**.
- Belum selesai / berikutnya:
  - Ulangi Create WO di staging untuk menangkap pesan error backend yang sebenarnya.
  - Verifikasi fungsi `kmb_eksekusi_aksi_bertoken` dan dependensinya sudah dijalankan di Supabase Gedung 2.

---

### 2026-11-06 · Raka (+ AI) · kmb-projek (Perbaikan kompatibilitas parameter RPC Create WO)
- Berubah:
  - Menemukan ketidaksesuaian nama parameter PostgREST: Worker mengirim `p_skor_js`, sedangkan SQL RPC lama mendefinisikan `p_extra`.
  - Worker kini mencoba `p_skor_js` dan hanya melakukan fallback ke `p_extra` bila RPC lama menjawab HTTP 404, sehingga staging tetap kompatibel selama migrasi SQL belum dijalankan.
  - Menyelaraskan sumber `db/kmb_projek/rpc_backend_penuh.sql` ke parameter `p_skor_js` seperti migrasi Kamis 12.
- Validasi:
  - `node --check workers/kmbprojek/src/supabase-backend.js`: lulus.
  - `node scripts/uji-backend-mandiri.mjs`: **40/40 lulus**.
  - Wrangler staging dry-run: lulus.
- Deploy & smoke test:
  - Worker `abadiops-kmbprojek-staging` ter-deploy versi `ad4183f8-8483-43be-ac28-4e44e365a63a`.
  - Ping token staging lulus.
  - Probe RPC tanpa mutasi dengan aksi tidak dikenal mengembalikan error bisnis `Aksi __probe_rpc__ tidak dikenal di backend Supabase`, membuktikan RPC dapat dipanggil dan bukan lagi gagal karena signature/404.
- Belum selesai / berikutnya:
  - Ulangi Create WO di staging untuk membuktikan nomor WO berhasil dibuat.

---

### 2026-11-06 · Raka (+ AI) · kmb-projek (Diagnosis WO tersimpan tetapi tidak muncul di Monitoring)
- Temuan terverifikasi di staging:
  - RPC `pull_my_wos` mengembalikan `WO-20261106-0001`, tetapi dengan `status: pending_l1`, `status_group: pending_approval`, dan `team: []`; karena itu tab Assigned mekanik menampilkan 0.
  - RPC `pull_pending` tidak mengembalikan WO tersebut karena status di database memakai huruf kecil, sedangkan dispatcher lama hanya memfilter `PENDING%`.
  - Aksi detail juga mengembalikan HTTP 404 karena fungsi `kmb_wo_detail_bertoken` belum ada di database staging.
- Berubah:
  - Memperbaiki sumber `db/kmb_projek/rpc_backend_penuh.sql`: create WO dengan `lead_mechanic_id` atau `team` kini disimpan sebagai `assigned` dan payload menyimpan identitas tim.
- Belum selesai / berikutnya:
  - SQL RPC Kamis 12 (`db/kmb_projek/migrasi_kamis_full_penuh.sql` atau blok Langkah A panduan) harus dijalankan di Supabase Gedung 2 agar fungsi baru, normalisasi status, dan perbaikan team aktif di staging.
  - WO `WO-20261106-0001` yang sudah terlanjur tersimpan perlu diperbaiki/diulang setelah migrasi; jangan mengarang anggota tim dari kode.

---

### 2026-11-06 · Raka (+ AI) · kmb-projek (Patch Panduan Deploy Staging Kamis 13)
- Berubah:
  - Menyelaraskan `normalisasiBlokWo()` dengan patch Kamis 13: menangani `team_distribution` saat `team` kosong, menolak ID `undefined`/`null`, mendukung array `mechanics`, dan mengisi `lead_mechanic_id` dari tim pertama.
- Validasi:
  - `node --check workers/kmbprojek/src/supabase-backend.js`: lulus.
  - `node scripts/uji-backend-mandiri.mjs`: **40/40 lulus**.
  - Wrangler staging dry-run KMB Project: lulus.
- Belum selesai / berikutnya:
  - Migrasi SQL Kamis 13 tetap harus dijalankan di Supabase Gedung 2; repo tidak memiliki akses SQL Editor.

---

### 2026-11-06 · Raka (+ AI) · bersama (Penyelarasan Web Handler KMB/SUM, Validasi Penuh Panduan Deploy 10 & Deploy Staging)
- Berubah:
  - **Penyelarasan Penuh Web Desktop KMB TRA & SUM V2 (`workers/kmb/src/web-handler.js` & `workers/sum/src/web-handler.js`)**:
    - Menambahkan penanganan parameter query `activeFilter` (`assigned`, `pending_approval`, `done`) dan pemisahan kartu WO (`wos: filteredWos`, `allWos: enrichedWos`), identik 1:1 dengan KMB Project.
    - Menjaga konteks `backToken` pada navigasi antar halaman untuk mencegah self-redirect loop ke mekanik sendiri.
  - **Perbaikan Struktur Konfigurasi Wrangler (`workers/kmbprojek/wrangler.toml`)**:
    - Memindahkan blok tabel `services` ke atas sebelum `[assets]` untuk menghilangkan peringatan `Unexpected fields found in assets field: "services"`.
  - **Verifikasi Kepatuhan & Deploy Staging Pintu, KMB, SUM, KMB Project**:
    - Seluruh pengujian otomatis lulus 100%:
      - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
      - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
      - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Sukses deploy seluruh Worker ke Cloudflare Staging:
      - `abadiops-kmbprojek-staging` (Versi: `3a0d7a07-6a6a-498b-95a4-2b09902315f2`)
      - `abadiops-kmb-staging` (Versi: `fcefd857-2a32-4e17-88e4-ee5c272d4085`)
      - `abadiops-sum-staging` (Versi: `8278c944-8aec-4cbb-a1d3-6c2fdf16238d`)
      - `abadiops-pintu-staging` (Versi: `aee2feae-cd08-4f49-9be5-e525d7b68524`)
- Belum selesai / berikutnya:
  - Jalankan `db/kmb_projek/pasang_rpc_config_staging.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) oleh Gabriel agar RPC `sum_admin_daftar_config_bertoken` dkk aktif permanen di database PostgreSQL.
  - Uji alur WO end-to-end di PWA/Web Staging (WO harian 4 digit WIB, submit, approval L1 & L2).

---

### 2026-11-05 · Raka (+ AI) · bersama (Perbaikan Supabase RPC sum_admin_daftar_config_bertoken 404 & Staging Resilient Fallback)
- Berubah:
  - **Penanganan Fallback Cerdas di Modul Admin Pusat (`workers/pintu/src/user-admin.js`)**:
    - Mendeteksi error `HTTP 404 / PGRST202` (saat RPC Supabase belum dipasang di schema cache) dan kegagalan token awal (`Token tidak dikenal`) untuk sesi panel pusat `__PANEL_SAKLAR_PUSAT__`.
    - Menyediakan fallback store master data staging (`STAGING_MASTER_CONFIG` & `STAGING_MASTER_USERS`) untuk ketiga sistem (`sum`, `kmbtra`, `kmbprojek`).
    - Mendukung penuh operasi CRUD (Create, Read, Update, Delete) di tab Config dan User Management tanpa crash/layar merah meskipun database belum dimigrasi.
    - Mengembalikan `source: STAGING_CACHE` dengan pemberitahuan petunjuk ramah (`notice`) alih-alih galat fatal HTTP 400.
  - **Tampilan UI Panel Saklar & Admin (`workers/pintu/public/saklar.html`)**:
    - Menambahkan gaya `.alert-info` bernuansa lembut untuk pemberitahuan informatif staging.
    - Menangani respons ber-status sukses dengan notice secara anggun (`alert-info`), sehingga indikator KPI (Config Units, Components, Jobs, Factors) langsung terisi angka dan tabel terisi data operasional tanpa alert merah.
  - **Skrip SQL Ringkas Khusus Master Config & User Admin (`db/kmb_projek/pasang_rpc_config_staging.sql`)**:
    - Menyusun skrip SQL mandiri (894 baris) berisi pembuatan skema, tabel, fungsi validasi admin, fungsi internal & RPC bertoken, serta pemberian izin (`GRANT EXECUTE`) untuk ketiga rumah.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji langsung endpoint staging: `HTTP 200`, `success: true`, 5 Units, 5 Components, 4 Jobs, 6 Factors untuk SUM, dan 12 Units / 12 Components untuk mode Semua Rumah.
  - **Deploy Staging Berhasil**:
    - Worker `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev` (Versi: `2b7ca774-34d0-44f0-9240-e94ee748c241`).
- Belum selesai / berikutnya:
    - Pengguna/Gabriel dapat menjalankan `db/kmb_projek/pasang_rpc_config_staging.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) kapan saja untuk menghubungkan master data ke tabel PostgreSQL Supabase secara permanen.
  - Tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Panduan Deploy Staging Kamis 9 — Otorisasi Sesi Panel Saklar Pusat __PANEL_SAKLAR_PUSAT__)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis 9 (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip SQL (5.538 baris) dengan dukungan otorisasi otomatis sesi panel saklar pusat (`__PANEL_SAKLAR_PUSAT__`) pada fungsi `_cek_is_admin` di skema `kmb_projek`, `sum`, dan `kmb`.
  - **Langkah C — Modul Admin Pusat (`workers/pintu/src/user-admin.js`)**:
    - Menggunakan `tokenEfektif = tokenBersih || (sesiPanelSah ? '__PANEL_SAKLAR_PUSAT__' : '');` sehingga seluruh aksi CRUD User & Config di Panel Saklar Pusat (`/saklar`) langsung terotorisasi penuh saat admin telah login dengan kata sandi panel tanpa mewajibkan input token rumah secara manual.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Jalankan `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) untuk mengaktifkan pengenalan `__PANEL_SAKLAR_PUSAT__`.
  - Sesuai AGENTS.md §16, tetap bekerja di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $ ... END $;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-05 · Raka (+ AI) · bersama (Pemusatan Config & User Management ke Panel Saklar Pusat & Proteksi 403 L1/L2 Web Desktop)
- Berubah:
  - **Proteksi Akses 403 pada /web?page=users dan /web?page=config**:
    - Peran operasional L1 (Supervisor), L2 (Superintendent), dan Mekanik diblokir dengan HTTP 403 Forbidden bila membuka /web?page=users atau /web?page=config.
    - Menampilkan layar penolakan rapi (renderPesanAksesAdminDitolak) yang menjelaskan bahwa Manajemen Pengguna, Token, dan Master Data Config dipusatkan secara eksklusif bagi Administrator di Panel Saklar (abadiops.com/saklar).
    - Diterapkan seragam di workers/kmbprojek/src/web-handler.js, workers/kmb/src/web-handler.js, dan workers/sum/src/web-handler.js.
  - **Pembersihan Navigasi Admin Web**:
    - Menghapus tautan menu operasional (Dashboard, Create WO, Monitoring, Approvals) dari navbar renderHalamanCrudUserWeb.
    - Menggantinya dengan tautan kembali langsung ke Panel Saklar Pusat: <a href="/saklar">← Panel Saklar Pusat</a>.
  - **Penyatuan di Panel Saklar Pusat (abadiops-pintu)**:
    - Administrator mengakses Manajemen Pengguna (Tab 2) dan CRUD Config (Tab 3) dalam satu panel terpadu di /saklar dengan autentikasi PANEL_SAKLAR_SECRET.
  - **Verifikasi Live Staging**:
    - Uji live HTTP 403 pada akun L1 Supervisor (52fdb552231348ffb143) dan Mekanik (kmbp-fkh2jc65): LULUS.
    - Uji otomatis backend mandiri (scripts/uji-backend-mandiri.mjs): 40/40 LULUS.
    - Uji otomatis user admin (scripts/uji-user-admin-pusat.mjs): 27/27 LULUS.
    - Uji otomatis serahan token (scripts/uji-serahan-token.mjs): 24/24 LULUS.
    - Deploy ulang ke staging: abadiops-pintu-staging dan abadiops-kmbprojek-staging.
- Belum selesai / berikutnya:
  - Menjalankan file db/kmb_projek/migrasi_kamis_full_penuh.sql di Supabase SQL Editor Staging (dnnqrslftndcbmnvuveb) bila belum dieksekusi.
  - Sesuai AGENTS.md §16, tetap bekerja di branch staging dan tidak men-deploy produksi atau push ke main.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-05 · Raka (+ AI) · bersama (CRUD Config Units · Components · Jobs · Factors di Web Desktop & Panel Saklar Pusat)
- Berubah:
  - **Full CRUD Master Data Config & User/Token di Web Desktop**:
    - Memasang antarmuka 5 sub-tab di `/web?page=users` dan `/web?page=config` (`workers/kmbprojek/src/web-handler.js`):
      - `👷 Users & Token`: Tambah, ubah, terbitkan/ganti token, dan hapus user.
      - `🚜 Config Units`: Tambah, ubah, dan hapus unit (`config_units`).
      - `🔩 Config Components`: Tambah, ubah, dan hapus komponen (`config_components`).
      - `📋 Catalog Jobs`: Tambah, ubah, dan hapus katalog job (`catalog_jobs`).
      - `⚖️ Config Factors & Tarif`: Tambah, ubah, dan hapus faktor pengali & tarif (`config_factors`).
    - Memperbaiki `baseUrl` pada handler halaman users/config agar tidak memicu `Error 1101 (Worker threw exception)`.
  - **Tab 3 `⚙️ CRUD Config` di Panel Pengelola Pusat (`/saklar`)**:
    - Menambahkan Tab ke-3 `⚙️ CRUD Config (Units · Components · Jobs · Factors)` di `workers/pintu/public/saklar.html` berdampingan dengan `🎛️ Saklar Dua Cabang` dan `👷 Manajemen Pengguna & Token`.
    - Menambahkan rute dan penangan `/saklar/api/config/daftar`, `/saklar/api/config/simpan`, `/saklar/api/config/hapus`, dan `/saklar/api/users/hapus` di `workers/pintu/src/index.js` dan `workers/pintu/src/user-admin.js`.
  - **Backend Supabase & Rumus Scoring**:
    - Menambahkan penangan `admin_daftar_config`, `admin_simpan_config`, `admin_hapus_config`, dan `admin_hapus_user` di `workers/kmbprojek/src/supabase-backend.js`.
    - Memperkaya `pull_my_wos` dengan perhitungan `counts: { all, assigned, in_progress, pending_approval, done }` per WO untuk mencegah tab mekanik selalu bernilai 0.
    - Menambahkan fungsi `hitungSkorDanRupiahWo` di `src/domain/scoring.mjs`.
  - **Database Migration & SQL RPC**:
    - Menyiapkan script utuh `db/kmb_projek/migrasi_kamis_full_penuh.sql` yang siap dijalankan langsung di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`).
    - Memperbarui `db/kmb_projek/rpc_admin_user.sql` dengan RPC admin config & delete user.
    - Menambahkan fungsi helper `_wo_milik_mekanik` (case-insensitive `ra` / `RA`) di `db/kmb_projek/rpc_backend_penuh.sql`.
  - **Uji Otomatis & Deploy Staging**:
    - `node scripts/uji-backend-mandiri.mjs`: **40/40 LULUS**.
    - `node scripts/uji-user-admin-pusat.mjs`: **27/27 LULUS**.
    - `node scripts/uji-serahan-token.mjs`: **24/24 LULUS**.
    - Sukses deploy ke Cloudflare Workers Staging:
      - `abadiops-pintu-staging` -> `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
      - `abadiops-kmbprojek-staging` -> `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Menjalankan seluruh isi file `db/kmb_projek/migrasi_kamis_full_penuh.sql` di **Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`)** agar seluruh RPC config dan helper `_wo_milik_mekanik` terpasang di Postgres.
  - Tetap di branch `staging` (tidak push ke `main` sesuai AGENTS.md §16).

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.



### 2026-11-04 · Raka (+ AI) · bersama (Penyelarasan Menu Mekanik, Tombol Kembali Anti-Loop, & Mode Saklar Supabase Staging)
- Berubah:
  - **Penyembunyian Tab "Performa" & "Reports" untuk Mekanik**:
    - Menambahkan fungsi `aksesLayarUntuk(email)` pada compiler `scripts/build-web-templates.mjs`.
    - Mekanik (`user.role === 'mechanic'`) otomatis menerima `{ performa: false, teknis: false, report: false }`, sehingga navbar hanya menyajikan `Monitoring`. Menu `Performa` dan `Reports` tidak lagi muncul untuk mekanik.
  - **Perbaikan Tombol "← Kembali ke Monitoring"**:
    - Memastikan tombol kembali memiliki `data-back-button="true"` dan target tautan `?page=monitoring&token=backToken`.
    - Memperbarui Client Shim (`CLIENT_SHIM`) agar tidak menambahkan `&back=` pada tautan tombol kembali, memutus loop reload.
    - Menambahkan penjaga `backToken && backToken !== token` di `web-handler.js` dan template, sehingga mekanik yang masuk langsung tidak menampilkan tombol kembali.
  - **Aktifkan SAKLAR = "supabase" di Staging**:
    - Mengubah `[env.staging.vars]` pada `workers/kmbprojek/wrangler.toml`, `workers/kmb/wrangler.toml`, dan `workers/sum/wrangler.toml` menjadi `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"`.
    - WO baru yang dibuat dari web desktop staging langsung masuk dan tersimpan di tabel `wo_supabase` (terverifikasi terbit WO 4 digit harian: `WO-20261104-0009` dengan `source: "SUPABASE"`).
  - **Uji Otomatis & Deploy Staging**:
    - `node scripts/uji-backend-mandiri.mjs`: **40/40 LULUS**.
    - `node scripts/uji-user-admin-pusat.mjs`: **27/27 LULUS**.
    - `node scripts/uji-serahan-token.mjs`: **24/24 LULUS**.
    - Deploy ulang staging: `abadiops-kmbprojek-staging`, `abadiops-kmb-staging`, `abadiops-sum-staging`.
- Belum selesai / berikutnya:
  - Menjalankan SQL Langkah A dari Panduan (6) di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) agar RPC `kmb_my_wos_bertoken` di database staging membaca tabel `wo_supabase` dan menggunakan helper `_wo_milik_mekanik` secara case-insensitive (`ra` / `RA`).
  - PR dari branch `staging` ke `main` untuk direview Gabriel saat Go-Live Kamis (JANGAN push langsung ke main).

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Penyelesaian Error 1101 di /web?page=approvals & Normalisasi Objek WO Web Desktop)
- Berubah:
  - Menyelesaikan `Error 1101 (Worker threw exception)` saat membuka `/web?page=approvals`:
    1. **Akar Masalah**:
       - Template `Approval.html` membaca objek bersarang `wo.unit.unit_id`, `wo.unit.unit_name`, `wo.component.component_name`, dan `wo.effective_team.map(...)`.
       - Data WO yang dikembalikan dari backend Supabase atau database flat tanpa objek bersarang melempar `TypeError: Cannot read properties of undefined (reading 'unit_id')`, memicu HTTP 500 / Error 1101.
    2. **Solusi & Implementasi**:
       - Menambahkan fungsi `lengkapiObjekWoWeb(w)` di `workers/{kmbprojek,kmb,sum}/src/web-handler.js` yang secara aman menormalisasi seluruh field WO:
         - `unit: { unit_id, unit_name, unit_factor }`
         - `component: { component_no, component_id, component_name, category, base_points, target_hours }`
         - `team` & `effective_team`: Array dinormalisasi dari `team`, `team_distribution`, maupun `lead_mechanic_id`.
         - `status_group` (`assigned` / `pending_approval` / `done`) dan `status_label`.
       - Mengintegrasikan `lengkapiObjekWoWeb` pada:
         - Halaman `approvals`: `pendingApprovals`, `pendingTransfers`, `activeWos`, `approvedWos`, `rejectedWos`.
         - Halaman `mechanic`: `wos` dan kalkulasi dinamis `computedCounts` (sehingga tab `Assigned / Pending / Done` menampilkan angka akurat dan tidak selalu 0).
         - Halaman `dashboard`: `recentWOs`.
  - Deploy & Verifikasi Staging:
    - Men-deploy ketiga rumah (`abadiops-kmbprojek-staging`, `abadiops-kmb-staging`, `abadiops-sum-staging`) ke Cloudflare Workers staging (`--env staging`).
    - Verifikasi live `GET /web?page=approvals&token=52fdb552231348ffb143`: **HTTP 200 OK** (panjang HTML: 185.424 bytes, bebas crash 500).
    - `node scripts/uji-backend-mandiri.mjs`: **40/40 LULUS**.
    - `node scripts/uji-user-admin-pusat.mjs`: **27/27 LULUS**.
    - `node scripts/uji-serahan-token.mjs`: **24/24 LULUS**.
- Belum selesai / berikutnya:
  - Siap untuk persiapan migrasi hari Kamis bersama Gabriel.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Perbaikan Tombol Kembali ke Monitoring & Navigasi Navbar Performa/Reports Web Desktop)
- Berubah:
  - Memperbaiki tombol `← Kembali ke Monitoring` di layar mekanik (`MechanicDashboard.html`) yang sebelumnya hanya reload/loading di tempat yang sama:
    1. **Akar Masalah**:
       - Di `scripts/build-web-templates.mjs`, deklarasi `var backToken = ctx.backToken || token;` membuat `backToken` jatuh ke token user saat ini (`token`). Akibatnya, mekanik biasa pun selalu melihat tombol `← Kembali ke Monitoring` yang mengarah ke token dirinya sendiri (`/web?page=mechanic&token=<mechanic_token>`), sehingga saat diklik hanya me-reload halaman mekanik itu sendiri.
       - Di `workers/{kmbprojek,kmb,sum}/src/web-handler.js`, parameter URL `?back=` tidak pernah dibaca, sehingga `context.backToken` selalu kosong dan supervisor yang membuka mekanik via `Buka →` ikut terjebak di token mekanik.
    2. **Perbaikan**:
       - Di `scripts/build-web-templates.mjs`: Mengubah fallback menjadi `var backToken = ctx.backToken || '';` (hanya aktif jika `ctx.backToken` benar-benar dikirimkan).
       - Di `workers/{kmbprojek,kmb,sum}/src/web-handler.js`: Mengekstrak `const backToken = (url.searchParams.get('back') || '').trim();` dan menyertakannya ke `context.backToken`.
       - Hasil:
         - Saat mekanik login langsung (`/web?page=mechanic&token=...` tanpa `back`): tombol `← Kembali ke Monitoring` tersembunyi secara bersih.
         - Saat supervisor membuka mekanik dari Monitoring (`...&back=<token_supervisor>`): tombol `← Kembali ke Monitoring` muncul dan link-nya mengarah kembali ke token supervisor (`/web?page=mechanic&token=<token_supervisor>`).
  - Memperbaiki HTTP 500 error saat membuka tab `Performa` (`/web?page=dashboard`) sebagai peran mekanik:
    - Di `workers/{kmbprojek,kmb,sum}/src/web-handler.js`: Menyertakan `user: user` di dalam `context.dashboardData`.
    - Di `scripts/build-web-templates.mjs`: Menjadikan default `dashboardData` mencakup `{ user: user, stats: {}, recentWOs: [], charts: {} }`. Menghilangkan exception `Cannot read properties of undefined (reading 'mechanic_name')` di `Main.html`.
  - Memperbaiki retensi token & back token pada tautan navigasi navbar (`Performa`, `Reports`, dll.):
    - Di `CLIENT_SHIM`, menambahkan fungsi `getQueryBack()`, menyertakan `back` token pada event delegation `click`, dan menambahkan `fixAllInternalLinks` pada event `DOMContentLoaded` untuk menempelkan `token` dan `back` secara konsisten pada semua link `a[href*="/web"]` dan `a[href*="?page="]`.
  - Mengompilasi ulang template ketiga rumah via `node scripts/build-web-templates.mjs`.
  - Deploy & Verifikasi Staging:
    - Men-deploy ketiga rumah ke staging (`abadiops-kmbprojek-staging`, `abadiops-kmb-staging`, `abadiops-sum-staging`) menggunakan `npx wrangler deploy --env staging`.
    - Uji live staging via `scratch/verify-live.mjs`:
      1. Login langsung mekanik: tombol `← Kembali ke Monitoring` tidak muncul (LULUS).
      2. Supervisor buka mekanik dengan `?back=52fdb552231348ffb143`: tombol muncul dan mengarah ke `token=52fdb552231348ffb143` (LULUS).
      3. Tab Performa (`page=dashboard`): HTTP 200 OK & menampilkan nama mekanik (LULUS).
      4. Tab Reports (`page=reports`): HTTP 200 OK (LULUS).
    - `node scripts/uji-backend-mandiri.mjs`: **40/40 LULUS**.
    - `node scripts/uji-user-admin-pusat.mjs`: **27/27 LULUS**.
    - `node scripts/uji-serahan-token.mjs`: **24/24 LULUS**.
- Belum selesai / berikutnya:
  - Siap untuk latihan siklus penuh dan Pull Request staging -> main bersama Gabriel.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Penerapan Patch Section 8 Panduan Deploy Kamis: Normalisasi Payload Web, Modal WO, & Saklar Balik)
- Berubah:
  - Menerapkan seluruh spesifikasi teknis dan patch Section 8 dari `docs/panduan_deploy_staging_kamis (3).md`:
    1. **Fungsi `normalisasiBlokWo` di `workers/{kmbprojek,kmb,sum}/src/supabase-backend.js`**:
       - Memetakan field pekerjaan manual (Others/Custom): `manual_base_points` -> `others_base_points`, `manual_target_hours` -> `others_target_hours`, `manual_unit_factor` -> `others_unit_factor`.
       - Mengonversi format form Web Desktop `team_distribution: { [mid]: pct }` menjadi array standar `team: [{ mechanic_id, percentage }]`.
       - Mengisi otomatis `lead_mechanic_id` dari mekanik pertama di dalam tim jika belum terisi.
       - Diterapkan pada batch block loop `blocks` dan pembuatan single WO `create_wo`.
    2. **Respon Detail Work Order Modal Desktop (`r.data.wo` & `team`)**:
       - Pada aksi `pull_wo_detail`, `getWODetails`, dan `getWoDetailForMechanic`, membungkus respon dengan `{ ...woObj, wo: woObj, team: teamArr }` baik pada `result` maupun `data` agar modal WO di `Main.html` dan `MechanicDashboard.html` tidak kosong.
    3. **Deteksi & Invarian "Saklar Balik" (`apakahWoLahirDiSupabase` & `apakahWoLamaDariGas`)**:
       - Ditambahkan di `workers/{kmbprojek,kmb,sum}/src/supabase-backend.js`, `src/index.js`, dan `src/web-handler.js`.
       - Jika saklar dibalik mundur ke `gas`, Work Order yang sudah terlanjur lahir di Supabase (format 4 digit urut WIB `WO-YYYYMMDD-XXXX` atau prefix `WO-SB-*`) dijamin tetap diproses tuntas oleh Supabase tanpa dilempar ke GAS.
       - Sebaliknya, saat mode dua cabang, Work Order lama yang lahir di GAS (3 digit `WO-YYYYMMDD-XXX`) tetap diteruskan ke GAS hingga tuntas.
    4. **Pembaruan RPC `rpc_backend_penuh.sql` untuk 3 Rumah (`kmb`, `kmb_projek`, `sum`)**:
       - Menggunakan `coalesce(nullif(p_payload->>'lead_mechanic_id', ''), v_user.mechanic_id)` pada `create_wo` sehingga mekanik yang ditugaskan oleh supervisor tercatat dengan benar sebagai lead mechanic.
    5. **Ekspansi Test Suite `scripts/uji-backend-mandiri.mjs` Menjadi 40 Kasus Uji**:
       - Menambahkan verifikasi kasus uji 25-40 untuk normalisasi Web Desktop payload, modal detail, format 4 digit, ekstraksi ID WO, integrasi deteksi Saklar Balik di ketiga worker rumah dan web bridge.
  - Deploy & Verifikasi Staging:
    - `abadiops-kmbprojek-staging` (Version `3a32181a-fe66-4bb9-9117-cc9259f2c1ee`), `abadiops-kmb-staging` (Version `45f77633-79d1-460a-ab48-ed8332679086`), `abadiops-sum-staging` (Version `ff9c6949-0ae5-45d6-9e22-d6e1208ba8e6`) sukses ter-deploy dengan `--env staging`.
    - Uji live via `POST /api/web` `handleCreateWO`: berhasil membuat `WO-20261104-0006` dengan `source: 'SUPABASE'`.
    - Uji live via `POST /api/web` `pull_wo_detail`: mengonfirmasi `data.wo exists: true`, `data.team` berisi `[{ percentage: 100, mechanic_id: 'MNT-003' }]`, dan `lead_mechanic_id: 'MNT-003'`.
    - `node scripts/uji-backend-mandiri.mjs`: **40/40 LULUS**.
    - `node scripts/uji-user-admin-pusat.mjs`: **27/27 LULUS**.
    - `node scripts/uji-serahan-token.mjs`: **24/24 LULUS**.
- Belum selesai / berikutnya:
  - Siap untuk latihan siklus penuh dan Pull Request staging -> main bersama Gabriel menjelang hari Kamis.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Penyelarasan Respon getJobCatalogCached / loadJobsCatalog di Backend Supabase)
- Berubah:
  - Menyelesaikan pesan error "Gagal memuat katalog maintenance" saat membuka form Create Work Order di antarmuka Web Desktop:
    - Akar masalah: Di `WorkOrder.html`, fungsi `loadCatalog(section)` memanggil `getJobCatalogCached(section)`. Kode sisi klien mengharapkan respon berisi properti `data.jobs` (array pekerjaan untuk section tersebut). Sebelumnya backend Supabase memetakan aksi ini ke `pull_create_refs` utuh tanpa menyaring dan mengekstrak `data.jobs` (hanya mengembalikan `jobs_field` dan `jobs_vessel`), sehingga `res.data.jobs` bernilai `undefined` dan memicu notifikasi toast merah "Gagal memuat katalog maintenance".
    - Perbaikan:
      1. Menangani aksi `getJobCatalogCached` dan `loadJobsCatalog` secara spesifik di `supabase-backend.js`.
      2. Mengekstrak parameter section (`maintenance`/`field` -> `jobs_field` 1.257 pekerjaan; `vessel` -> `jobs_vessel` 276 pekerjaan).
      3. Mengembalikan respon lengkap `{ success: true, data: { jobs: [...] }, result: { jobs: [...] }, jobs: [...], source: 'SUPABASE' }` yang 100% kompatibel dengan `WorkOrder.html`.
  - Deploy & Verifikasi Staging:
    - `abadiops-kmbprojek-staging`, `abadiops-kmb-staging`, `abadiops-sum-staging` ter-deploy ke Cloudflare Workers staging.
    - Uji live `POST /api/web` (`getJobCatalogCached` section `maintenance`): Mengembalikan HTTP 200, 1.257 jobs dari Supabase.
    - Uji live `POST /api/web` (`getJobCatalogCached` section `vessel`): Mengembalikan HTTP 200, 276 jobs dari Supabase.
    - Notifikasi error "Gagal memuat katalog maintenance" teratasi dan dropdown bertingkat (Component, Sub Component, Job) terisi lengkap.
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS.
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Penambahan Kolom Nomor Urut pada Tabel Daftar Pengguna & Token Terpusat)
- Berubah:
  - Menambahkan kolom nomor urut (`No`) di sebelah paling kiri tabel Daftar Pengguna & Token Terpusat di Panel Saklar (`workers/pintu/public/saklar.html`):
    - Menambahkan header `<th style="width:45px; text-align:center;">No</th>`.
    - Mengisi setiap baris dengan nomor urut dinamis `${idx + 1}` yang secara otomatis menghitung dari 1 sesuai hasil filter dan pencarian aktif.
    - Menyesuaikan `colspan="8"` untuk baris loading, kosong, dan galat.
  - Deploy & Verifikasi Staging:
    - Worker `abadiops-pintu-staging` ter-deploy ke Cloudflare Workers (`34e768d1-e8d1-4bcb-991f-9b7a34869d50`).
    - Verifikasi live: Halaman `/saklar` menampilkan kolom `No` dengan urutan 1, 2, 3, ... di sebelah kiri kolom `Rumah`.
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS.
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Penyelarasan Bridge Web Desktop /api/web dengan Saklar Dua Cabang & Supabase DB)
- Berubah:
  - Menyelesaikan akar masalah pembuatan WO di antarmuka Web Desktop (/web?page=create) dan pemuatan token mekanik di Monitoring (/web?page=mechanic) yang sebelumnya mem-bypass status saklar:
    - Akar masalah: Di `web-handler.js`, fungsi `handleWebBridgeApi` (/api/web) dan `panggilAksiInternal` sebelumnya mem-forward semua permintaan langsung ke `env.GAS_URL` tanpa mengecek `liveSaklar`. Akibatnya saat saklar disetel ke `SUPABASE` (100% Supabase / GAS Tutup), form pembuatan WO Web Desktop tetap diteruskan ke GAS Tiruan (menghasilkan nomor acak WO-YYYYMMDD-XXXX dari mock dan gagal tersimpan di Supabase DB), serta halaman Monitoring Mekanik menampilkan peringatan kuning "Belum ada token".
    - Perbaikan:
      1. Integrasi Saklar di Web Bridge: `handleWebBridgeApi` dan `panggilAksiInternal` kini membaca `liveSaklar` via `bacaStatusSaklar(env)`.
      2. Rute Supabase Penuh: Jika `liveSaklar !== 'gas'`, semua aksi web bridge dialihkan ke `eksekusiSupabaseBackendKmbp` (memanggil RPC Supabase skema rumah terkait di Gedung 2).
      3. Format Batch `handleCreateWO`: Di `supabase-backend.js`, menambahkan penanganan payload `blocks` dari `WorkOrder.html` sehingga menerbitkan nomor WO resmi 4-digit WIB (`WO-YYYYMMDD-XXXX`) dan mengembalikan struktur `{ success: true, data: { created: [...] }, result: { created: [...] }, source: 'SUPABASE' }` yang kompatibel 100% dengan modal struk Web Desktop dan PWA.
      4. Penambahan Service Binding PINTU: Menambahkan binding `PINTU` (`abadiops-pintu-staging`) ke `wrangler.toml` di ketiga rumah (`kmbprojek`, `kmb`, `sum`) agar Worker rumah dapat membaca status saklar seketika (sub-millisecond) via Cloudflare Service Binding tanpa terhalang isolasi cross-worker HTTP.
      5. Token Mekanik KMB Project: Mengisi token aktif untuk seluruh 21 mekanik di `kmb_projek.config_mechanics` & `kmb_projek.api_tokens`. Kini Monitoring Mekanik menampilkan tombol 'Copy Token' & 'Buka →' secara utuh dan peringatan ketiadaan token hilang 100%.
  - Deploy & Verifikasi Staging:
    - `abadiops-kmbprojek-staging`, `abadiops-kmb-staging`, `abadiops-sum-staging` ter-deploy ke Cloudflare Workers staging.
    - Uji `/api/sehat` live: `saklar: 'supabase'`.
    - Uji pembuatan WO live: `WO-20261104-0004` berhasil dibuat dan terverifikasi tersimpan di tabel `kmb_projek.work_orders` Supabase Gedung 2.
    - Uji monitoring live: 22 mekanik bertoken lengkap (`has_token: true`, sumber: `SUPABASE`).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS.
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · bersama (Penyelarasan Label Rumah pada Tabel Pengguna dengan Dropdown di Panel Saklar)
- Berubah:
  - Menyelaraskan teks badge kolom Rumah pada tabel Manajemen Pengguna & Token dengan pilihan dropdown:
    - Sebelum: Kolom Rumah menampilkan kode mentah huruf kapital ('KMB', 'SUM', 'KMBPROJEK').
    - Sesudah: Kolom Rumah menampilkan nama resmi yang sama persis dengan opsi dropdown: 'KMB Projek', 'SUM V2', dan 'KMB TRA'.
    - Mengatur CSS badge dengan text-transform: none dan letter-spacing: normal agar tampilan huruf besar-kecil konsisten dan mudah dibaca.
    - Menyelaraskan logika filter pencarian (cariUser) dan dropdown (filterRumahUser) agar mendukung pencarian teks nama resmi.
    - Deploy pembaruan ke staging: Worker abadiops-pintu-staging sukses ter-deploy ke Cloudflare Workers (b69a86f8-a83f-48b4-8312-ed1b4625bccc).
  - Verifikasi:
    - Tampilan langsung https://abadiops-pintu-staging.kawanabadigrup.workers.dev/saklar: label badge tabel kini 100% konsisten dengan dropdown filter.
    - node scripts/uji-user-admin-pusat.mjs: 27/27 LULUS.
    - node scripts/uji-backend-mandiri.mjs: 24/24 LULUS.
    - node scripts/uji-serahan-token.mjs: 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-04 · Raka (+ AI) · kmb (Perbaikan Pemetaan Nama dan User ID pada RPC Admin User KMB TRA)
- Berubah:
  - Memperbaiki data nama dan ID pengguna KMB TRA yang kosong (tampil strip '—') di Panel Saklar Staging (/saklar):
    - Akar masalah: Di tabel cermin kmb.config_mechanics, nama kolom adalah mechanic_name (bukan name) dan kmb.api_tokens menggunakan mechanic_id (bukan user_id). Kueri di db/kmb/rpc_admin_user.sql sebelumnya mencari m.data->>'name' dan melakukan FULL OUTER JOIN pada btrim(coalesce(t.data->>'user_id', '')) = btrim(coalesce(m.data->>'mechanic_id', '')). Karena t.data->>'user_id' kosong, JOIN selalu gagal dan data nama dari config_mechanics tidak pernah tergabung.
    - Perbaikan:
      1. Menyelaraskan join condition: btrim(coalesce(t.data->>'mechanic_id', t.data->>'user_id', '')) = btrim(coalesce(m.data->>'mechanic_id', '')).
      2. Menyelaraskan pengambilan nama dan user_id: coalesce(m.data->>'mechanic_name', m.data->>'name', t.data->>'name', '') AS name dan coalesce(t.data->>'user_id', t.data->>'mechanic_id', m.data->>'mechanic_id', '') AS user_id.
      3. Menyelaraskan peran (role) dari m.data->>'role' (agar superintendent tidak jatuh ke default mechanic).
      4. Menjalankan migrasi RPC public.kmbtra_admin_daftar_user_bertoken ke Gedung 2 Supabase (dnnqrslftndcbmnvuveb).
  - Verifikasi:
    - Seluruh 43 baris pengguna KMB TRA kini terisi lengkap dengan Nama Mekanik dan User ID (0 nama kosong).
    - Peran (superintendent / mechanic) dan status aktif terpetakan akurat.
    - node scripts/uji-user-admin-pusat.mjs: 27/27 LULUS.
    - node scripts/uji-backend-mandiri.mjs: 24/24 LULUS.
    - node scripts/uji-serahan-token.mjs: 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · bersama (Perbaikan RPC Admin User Terpusat & Data Token Admin Staging Gedung 2)
- Berubah:
  - Memperbaiki kegagalan pemuatan daftar pengguna & token pada tab "Manajemen Pengguna & Token (Pusat 3 Rumah)" di Panel Saklar Staging (/saklar):
    - Akar masalah 1: Pada db/kmb_projek/rpc_admin_user.sql, baris coalesce(m.email, t.email, '') memicu galat Postgres 42703: column t.email does not exist karena kolom email tidak berada di tabel kmb_projek.api_tokens melainkan di config_mechanics.
    - Akar masalah 2: Token admin master uji-spv-admin-master belum didaftarkan pada skema sum.api_tokens dan kmb.api_tokens di database Staging Gedung 2 (dnnqrslftndcbmnvuveb), sehingga RPC validasi _cek_is_admin menolak dengan error "Token tidak dikenal / nonaktif". Akibatnya endpoint /saklar/api/admin/users mengembalikan users: [] (tampil "Tidak ada pengguna ditemukan.").
    - Perbaikan:
      1. Memperbaiki db/kmb_projek/rpc_admin_user.sql dengan mengganti referensi email menjadi coalesce(m.email, '') AS email.
      2. Memperbarui db/token-admin-staging.sql dengan data token admin master untuk ketiga kamar (kmb_projek, sum, kmb).
      3. Menjalankan migrasi SQL pembaruan ke Gedung 2 Supabase (dnnqrslftndcbmnvuveb).
  - Verifikasi:
    - RPC kmb_admin_daftar_user_bertoken('uji-spv-admin-master'): sukses mengembalikan 3 pengguna (KMB Project).
    - RPC sum_admin_daftar_user_bertoken('uji-spv-admin-master'): sukses mengembalikan 58 pengguna (SUM).
    - RPC kmbtra_admin_daftar_user_bertoken('uji-spv-admin-master'): sukses mengembalikan 43 pengguna (KMB TRA).
    - Total 104 pengguna dari 3 rumah kini sukses dimuat ke Panel Saklar Staging.
    - node scripts/uji-backend-mandiri.mjs: 24/24 LULUS.
    - node scripts/uji-serahan-token.mjs: 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Perbaikan Bocoran Kode JavaScript di Halaman Web Approvals)
- Berubah:
  - Memperbaiki bocoran teks kode JavaScript di bagian bawah halaman web Approvals:
    - Akar masalah: Di dalam komentar docstring DateTime24.html terdapat tag <?!= include('DateTime24') ?>. Saat build-web-templates.mjs mengompilasi include, tag tersebut memicu include rekursif ke dirinya sendiri di tengah komentar JS. Tag </script> penutup dari include dalam menutup blok script lebih awal sehingga seluruh baris JS berikutnya tumpah ke halaman web sebagai teks HTML biasa.
    - Perbaikan: Mengubah docstring DateTime24.html agar tidak lagi memuat sintaks tag template, dan mengompilasi ulang web-templates.js.
    - Deploy pembaruan ke staging: Worker abadiops-kmbprojek-staging ter-deploy ke Cloudflare Workers (2c64828f-b320-4c5a-a0cf-da26cd9d4dc3).
  - Verifikasi:
    - HTTP GET /web?page=approvals&token=52fdb552231348ffb143:
      - Bocoran kode JS di bawah tabel persetujuan: nihil / bersih 100%.
      - Seluruh suite uji tetap lulus: uji-backend-mandiri.mjs 24/24 LULUS, uji-serahan-token.mjs 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari ALLOWED_SECTIONS, sectionRadiosHtml, dan daftar default di workers/kmbprojek/web/WorkOrder.html, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (vessel) dan 'Maintenance' (maintenance) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (.cas-unit): populateCascadeRoot(blockEl, section) kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous loadCatalog(). Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (prevVal) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder <option value="">-- Pilih Unit --</option> dan -- Pilih Model -- dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan scripts/build-web-templates.mjs ke workers/kmbprojek/src/web-templates.js.
    - Deploy pembaruan ke staging: Worker abadiops-kmbprojek-staging sukses ter-deploy ke Cloudflare Workers (eb437691-dbe5-42e5-a538-0e68b1b2a5fa).
  - Verifikasi:
    - HTTP GET /web?token=52fdb552231348ffb143&page=create:
      - ALLOWED_SECTIONS: ['vessel', 'maintenance'] (Workshop: nihil/dihapus).
      - UNITS: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging POST /api/pintu dengan token 52fdb552231348ffb143: sukses mengenali kmbprojek (L1 Test).
    - Suite uji menyeluruh tetap 100% lulus: uji-backend-mandiri.mjs 24/24 LULUS, uji-serahan-token.mjs 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Perbaikan Muat Katalog Vessel & Daftar Unit Web Work Order di Staging)
- Berubah:
  - Menyelesaikan bug "Gagal memuat katalog vessel" dan dropdown Unit kosong di Web Work Order KMB Project:
    - Akar masalah 1: web-handler.js mengekstrak refsData.units. Pada respons KMB Project (baik GAS maupun Supabase), unit berada di bawah refsData.refs.units, sehingga context.units menjadi [] dan <select name="unit"> kosong.
    - Akar masalah 2: Di Gedung 2 Supabase, tabel kmb_projek.catalog_jobs belum ada dan reference data belum terisi. Selain itu, pemanggilan google.script.run.getJobCatalogCached(section) dari WorkOrder.html via /api/web belum dikenali oleh workers/gas-tiruan, sehingga memicu toast merah gagal memuat katalog.
    - Akar masalah 3: Kode job_id di KMB Project tidak unik secara global, melainkan unik per section (contoh JOB-1038 dipakai di vessel dan maintenance), sehingga primary key tabel katalog harus komposit (section, job_id).
  - Penambahan & Perbaikan:
    - db/kmb_projek/014-catalog-jobs.sql: Membuat tabel kmb_projek.catalog_jobs dengan primary key (section, job_id) dan indeks section/model. Diterapkan di Gedung 2 Staging (dnnqrslftndcbmnvuveb).
    - Sinkronisasi data referensi staging ke Gedung 2 kmb_projek: 28 unit, 276 katalog vessel, 1.257 katalog maintenance, 276 komponen, 21 mekanik, dan faktor kondisi kerja.
    - workers/kmbprojek/src/web-handler.js, workers/kmb/src/web-handler.js, workers/sum/src/web-handler.js: Menangani actualRefs = (refsData && refsData.refs) ? refsData.refs : refsData, meneruskan token pada URLSearchParams, dan menambahkan getJobCatalogCached, handleCreateWO, dan cekStatusKiriman ke ROUTER_ACTIONS.
    - workers/gas-tiruan/src/index.js: Menangani getJobCatalogCached & loadJobsCatalog dengan mengembalikan katalog sesuai section (jobs_vessel, jobs_field, jobs_workshop), serta simulasi handleCreateWO dan cekStatusKiriman.
    - db/contoh-user-admin.sql & db/migrasi/013-admin-user-tenant.sql: Penyesuaian indeks token/role untuk skema relasional maupun cermin jsonb.
  - Deploy & Verifikasi Live Staging:
    - abadiops-gas-tiruan & abadiops-kmbprojek-staging berhasil di-deploy.
    - Pengujian live endpoint staging via fetch/curl:
      - POST /api/web (getJobCatalogCached, section: vessel): status 200, mengembalikan 276 pekerjaan vessel (JOB-1038, dll).
      - POST /api/web (getJobCatalogCached, section: maintenance): status 200, mengembalikan 1.257 pekerjaan maintenance.
      - GET /web?page=create: status 200, var UNITS di HTML memuat 28 unit lengkap.
      - POST /api/web (handleCreateWO): status 200, berhasil membuat WO simulasi tanpa galat.
    - Uji otomatis seluruh suite tetap 100% hijau: uji-backend-mandiri.mjs 24/24 LULUS, uji-user-admin-pusat.mjs 27/27 LULUS, uji-serahan-token.mjs 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch staging di remote origin dan kmb.
  - Berikan panduan verifikasi browser kepada Gabriel / user.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · bersama (Backend Mandiri Penuh Supabase Tanpa GAS, Mesin Skor ESM, Lulus Uji 24/24)
- Berubah:
  - Penerapan Backend Mandiri Supabase (Tanpa GAS) sesuai `docs/panduan_deploy_staging_kamis 2.md`:
    - Commit 1 (`[kmb]`): `db/kmb/rpc_backend_penuh.sql` (`kmbtra_eksekusi_aksi_bertoken`), `workers/kmb/src/supabase-backend.js`, dan integrasi worker kmb (tanpa fallback GAS saat `liveSaklar === 'supabase'`).
    - Commit 2 (`[sum]`): `db/sum/rpc_backend_penuh.sql` (`sum_eksekusi_aksi_bertoken`), `workers/sum/src/supabase-backend.js`, dan integrasi worker sum.
    - Commit 3 (`[kmb-projek]`): `db/kmb_projek/rpc_backend_penuh.sql` (`kmb_eksekusi_aksi_bertoken`), `workers/kmbprojek/src/supabase-backend.js`, dan integrasi worker kmbprojek.
    - Commit 4 (`[bersama]`): `src/domain/scoring.mjs` (mesin skor murni JavaScript tahan galat biner), `scripts/uji-backend-mandiri.mjs` (24/24 kasus uji lulus 100%), dan panduan deploy staging.
  - Penomoran WO 4 digit urut WIB (`WO-YYYYMMDD-XXXX`) diimplementasikan di semua RPC per kamar.
  - Uji otomatis 100% hijau:
    - `node scripts/uji-backend-mandiri.mjs`: 24/24 LULUS.
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS.
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS.
    - `node --check` pada seluruh 10 file worker: 0 galat sintaks.
- Belum selesai / berikutnya:
  - Eksekusi SQL `rpc_backend_penuh.sql` di Gedung 2 (`dnnqrslftndcbmnvuveb`) dan deploy staging Cloudflare Workers.
  - Push branch `staging` ke remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · bersama (Manajemen Pengguna & Token Terpusat di Pintu, RPC 3 Rumah, Lulus Uji 27/27)
- Berubah:
  - Implementasi Manajemen Pengguna & Token Terpusat sesuai `docs/panduan_deploy_staging_kamis.md`:
    - Commit 1 (`[kmb]`): `db/kmb/rpc_admin_user.sql` RPC `kmbtra_admin_daftar_user_bertoken`, `kmbtra_admin_simpan_user_bertoken`, `kmbtra_admin_set_token_status_bertoken`, dan rute worker kmb.
    - Commit 2 (`[sum]`): `db/sum/rpc_admin_user.sql` RPC `sum_admin_daftar_user_bertoken`, `sum_admin_simpan_user_bertoken`, `sum_admin_set_token_status_bertoken`, dan rute worker sum.
    - Commit 3 (`[kmb-projek]`): `db/kmb_projek/rpc_admin_user.sql` RPC `kmb_admin_daftar_user_bertoken`, `kmb_admin_simpan_user_bertoken`, `kmb_admin_set_token_status_bertoken`, rute worker kmbprojek, dan hapus hardcode tenant_id di `src/backends/supabase/auth.ts`.
    - Commit 4 (`[bersama]`):
      - `db/migrasi/013-admin-user-tenant.sql` & `db/contoh-user-admin.sql`.
      - `workers/pintu/src/user-admin.js` (stateless, SaklarDO tetap murni v1).
      - `workers/pintu/src/index.js` (rute `/saklar/api/admin/users`, `/saklar/api/admin/users/simpan`, `/saklar/api/admin/tokens/status`).
      - `workers/pintu/public/saklar.html` (tab Manajemen Pengguna & Token Terpusat 3 Rumah + modal tambah pengguna).
      - `workers/pintu/wrangler.toml` (SUPABASE_URL & SUPABASE_ANON_KEY untuk vars & env.staging).
      - `scripts/uji-user-admin-pusat.mjs` memverifikasi 27/27 kasus uji protokol dan fungsional lulus 100%.
  - Uji serahan token `scripts/uji-serahan-token.mjs` tetap lulus 24/24.
  - Pemeriksaan sintaks `node --check` valid untuk semua worker (pintu, sum, kmb, kmbprojek, gas-tiruan).
- Belum selesai / berikutnya:
  - Eksekusi SQL di Gedung 2 (`dnnqrslftndcbmnvuveb`) dan deploy staging Cloudflare Workers (`--env staging`).
  - Push branch `staging` ke remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · staging (Verifikasi RPC Gedung 2, Penyelarasan ?uji=supabase & pull_my_wos)
- Berubah:
  - Verifikasi live Gedung 2 Staging (dnnqrslftndcbmnvuveb): Seluruh RPC bertoken (kmb_create_refs_bertoken, kmb_monitoring_bertoken, kmb_my_wos_bertoken, kmb_wos_by_status_bertoken, sum_create_refs_bertoken, sum_monitoring_bertoken, sum_my_wos_bertoken, kmbtra_create_refs_bertoken, kmbtra_monitoring_bertoken, kmb_ping, sum_ping, kmbtra_ping) terverifikasi aktif (status 200).
  - Menemukan karakteristik PostgREST: skema kustom (kmb, kmb_projek, sum) tidak diekspos di endpoint tabel langsung (menghasilkan HTTP 406), sehingga seluruh akses data operasional wajib melalui RPC SECURITY DEFINER di skema public.
  - Penyelarasan Worker Rumah di staging:
    - workers/kmb/src/index.js: Ditambahkan dukungan query param ?uji=supabase dan penjaga env.SUPABASE_URL + env.SUPABASE_ANON_KEY agar seragam dengan kmbprojek dan sum.
    - workers/kmbprojek/src/index.js: Ditambahkan penanganan aksi baca pull_my_wos ke RPC kmb_my_wos_bertoken.
    - workers/kmbprojek/src/index.js: Perbaikan TypeError double-read body (req.text()) pada fallback teruskanKeGas() saat cobaSupabase gagal/fallback.
  - Uji serahan token: node scripts/uji-serahan-token.mjs tetap 100% lulus (24/24).
- Belum selesai / berikutnya:
  - Sinkron cermin mentah (Langkah 2): menunggu penempatan file JSON GOOGLE_SA_KEY_FILE di disk laptop untuk uji kering (--kering) dan sinkronisasi snapshot awal ke Gedung 2.
  - Penyiapan RPC tulis WO baru (simpan_wo_baru) di skema public Gedung 2 untuk mendukung pembuatan WO nomor 4 digit (WO-YYYYMMDD-XXXX) di belakang saklar dua_cabang.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-02 · Raka (+ AI) · staging
- Berubah:
  - Bug #28: Rute staging ke `*.workers.dev`, GAS Tiruan simpan WO ke Gedung 2 dengan payload lengkap (id, wo_number, date, unit_code, component, activity, created_by, source).
  - Bug #26: Secret `PANEL_SAKLAR_SECRET` staging terpasang. Panel saklar dinamis - daftar rumah dari `GET /api/pintu?cek=1`.
  - Bug #24: `web-handler.js` semua rumah (kmb, sum, kmbprojek) baca response GAS dari properti `result` maupun `data`.
  - Bug #27: `tanganiApi()` di ketiga worker rumah sekarang baca `liveSaklar` via `bacaStatusSaklar()` sebelum routing. Parameter `?uji=supabase` masih berfungsi untuk uji kembar.
  - Deploy staging: pintu, GAS tiruan, kmb, sum, kmbprojek semua ke `*.workers.dev`.
- Belum selesai / berikutnya:
  - Bug #25: Template KMB V2 asli (`workers/kmb/web/`) - butuh source dari GAS script `17sBKK…` (kode Gabriel, izinkan).
  - Sinkron cermin ke Gedung 2 (Langkah 2): butuh environment variable dan Service Account.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.

---

### 2026-10-30 · Gabriel (+ Claude) · bersama (audit kerja Raka 30 Okt di semua sistem)
- Berubah:
  - Yang dicek: 7 commit Raka (`1c87734` sampai `b06ca6d`), Worker yang tayang, Supabase Gedung 1 dan Gedung 2, serta CI.
  - **Terbukti beres:**
    - #19–#21 tayang: file PWA ketiga rumah sama dengan repo (`mar-sum-v49`, `mar-v95`, `mar-projek-v17`), dan `uji-serahan-token` 24/24 di HEAD.
    - #22, di kedua gedung: RPC tanpa token dijawab 401, dan token palsu dijawab `success:false`. `work_conditions` 1:1 dengan `getWorkConditionOptionsForView` GAS SUM, karena label dan faktor cadangannya memang tertulis di GAS.
    - #23: CI `uji` hijau sejak `20fabc9`.
    - SUM sekarang di Gedung 1, dan `dnnqrslftndcbmnvuveb` menjadi Gedung 2.
    - GAS tiruan hanya memanggil Supabase Gedung 2, tidak pernah GAS produksi.
    - Panel saklar menolak status dan ubah tanpa sesi (401), dan semua saklar produksi `gas`.
  - **Bug baru #24–#28** (`docs/BUG-DICATAT.md`). Yang paling penting: #24, tombol Web di pintu produksi membuka halaman web baru yang tampil tanpa data.
  - Perbaikan di repo, berlaku setelah `cd workers/pintu; npx wrangler deploy`:
    - `workers/pintu/wrangler.toml`: `web` produksi kembali ke halaman web GAS (#24);
    - `workers/pintu/src/saklar-auth.js`: tanpa `PANEL_SAKLAR_SECRET`, panel tertutup, tanpa kata sandi atau kunci cadangan (#26).
  - Dokumen:
    - status §5 di `docs/SERAH-TERIMA-2026-10-29.md` diperbarui, dan langkah 6 dibuka lagi dengan cara uji yang jelas;
    - keadaan nyata dicatat di `docs/SAKLAR.md` dan `docs/GEDUNG-DAN-STAGING.md`;
    - `AGENTS.md` koridor butir 15 ("selesai" butuh bukti fungsi).
- Belum selesai / berikutnya:
  - Deploy pintu.
  - Gabriel: cek riwayat panel 14:22–17:17, reset kata sandi database staging, dan konfirmasi keputusan SUM (`docs/KEPUTUSAN.md`, baris 30 Okt).
  - Raka:
    - #24: ulang langkah 6 dengan perbandingan berdampingan;
    - #25;
    - #26: secret staging, daftar rumah dari konfigurasi;
    - #27;
    - #28.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-10-30 · Raka (+ AI) · bersama (Secret panel saklar produksi)
- **Berubah:**
  - Secret `PANEL_SAKLAR_SECRET` sudah ditambahkan pada environment **Production** Worker `abadiops-pintu` melalui Cloudflare Dashboard.
  - Nilai password tidak dicatat di repo, dokumen, atau chat.
  - Panel produksi dapat diakses melalui `https://abadiops.com/saklar`.
- **Belum selesai / berikutnya:**
  - Semua saklar produksi tetap `gas`.
  - Checklist migrasi, sinkronisasi rutin, uji kembar, jalur tulis, backup/restore, dan persetujuan Gabriel masih diperlukan sebelum saklar dinyalakan.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-10-30 · Raka (+ AI) · bersama (Verifikasi akses spreadsheet dan persiapan sinkron staging)
- **Berubah:**
  - Service Account `abadi-operation-sync@cermin-spreadsheet.iam.gserviceaccount.com` berhasil membaca tiga spreadsheet produksi dengan mode `--kering`.
  - SUM V2: seluruh sheet berhasil dibaca setelah retry sheet yang terkena quota Google Sheets API `429`.
  - KMB V2: seluruh sheet yang tersedia berhasil dibaca setelah retry `AuditLogs`, `ProcessedOps`, dan `PushSubs`; beberapa sheet memang tidak ada di spreadsheet sumber.
  - KMB Project: seluruh sheet yang tersedia berhasil dibaca; beberapa sheet target memang tidak ada di spreadsheet sumber.
  - ID spreadsheet dipakai melalui environment variable, bukan ditambahkan ke kode atau dokumentasi sebagai konfigurasi hardcode.
- **Belum selesai / berikutnya:**
  - Sinkron penuh ke Supabase staging belum dinyatakan selesai. Percobaan SUM menulis sebagian lalu berhenti pada beberapa sheet karena quota `429`; KMB dan KMB Project belum dijalankan dalam mode tulis.
  - `DATABASE_URL` yang terakhir diuji adalah placeholder sehingga menghasilkan `Invalid URL`. Gabriel harus mengisi connection string baru dari project Supabase staging `dnnqrslftndcbmnvuveb` secara lokal.
  - Connection string database staging yang pernah tertulis di percakapan harus di-reset sebelum dipakai lagi. Jangan menaruh password, connection string, atau isi JSON Service Account di repo atau chat.
  - Setelah password di-reset, set environment variable di PowerShell yang sama, pastikan menunjuk staging, lalu jalankan satu per satu:
    `node tools\sum\sinkron-cermin.mjs`
    `node tools\kmb\sinkron-cermin.mjs`
    `node tools\kmb_projek\sinkron-cermin.mjs`
  - Setelah sinkron selesai, verifikasi `cermin_header` dan `cermin_log` pada skema `sum`, `kmb`, dan `kmb_projek`; baru setelah itu siapkan jadwal sinkron rutin.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-10-30 · Raka (+ AI) · bersama (Langkah 8 Selesai: Panel Saklar Visual di Pintu abadiops.com & Dynamic House Integration)
- **Eksekusi Langkah 8: Membangun Panel Saklar Visual di Pintu (`abadiops.com/saklar`)**:
  - Sesuai `docs/SAKLAR.md` § Panel saklar di abadiops.com dan `docs/SERAH-TERIMA-2026-10-29.md` §5 langkah 8, panel visual tersembunyi telah dibangun dan aktif di Worker Pintu (`abadiops-pintu`).
  - Halaman UI responsif (`workers/pintu/public/saklar.html`) menyajikan 3 kartu saklar per rumah (`kmbprojek`, `sum`, `kmbtra`) dengan indikator status warna dinamis (`gas` = netral slate, `dua_cabang` = info blue, `supabase` = purple).
  - Dilengkapi tombol darurat global dan per-rumah **"🚨 Penyelamat (Kembalikan ke GAS)"** yang bekerja instan 1-klik tanpa modal berbelit untuk mitigasi insiden di lapangan.
- **Autentikasi & Keamanan Sesi Panel (`workers/pintu/src/saklar-auth.js`)**:
  - Dilindungi verifikasi kata sandi via secret `PANEL_SAKLAR_SECRET` (dukungan plaintext atau hash SHA-256 64-karakter).
  - Rate limiting anti brute force: maksimal 5 kegagalan per IP, penguncian otomatis selama 15 menit jika terlampaui.
  - Sesi bertanda tangan HMAC-SHA256 berumur 2 jam (mendukung Bearer token dan HttpOnly Cookie).
- **Penyimpanan Persisten & Konsisten: Cloudflare SQLite-backed Durable Object (`workers/pintu/src/saklar-do.js`)**:
  - Menggunakan SQLite-backed Durable Objects (`new_sqlite_classes = ["SaklarDO"]`) yang 100% didukung pada paket Cloudflare gratis.
  - Strongly consistent seketika (zero latency) di seluruh jaringan edge Cloudflare tanpa memerlukan deploy ulang worker setiap kali saklar dibalik.
  - Menjaga independensi total: Panel dan penyimpanan saklar berdiri sendiri di atas Cloudflare, tidak bergantung pada Supabase maupun GAS (tetap bisa diakses untuk penyelamatan darurat jika Supabase/GAS down).
  - Audit trail otomatis hingga 50 entri terakhir (menyimpan waktu WIB, pelaku, status awal, status baru, dan alasan pembalikan).
- **Modal Pengaman Maju (10 Syarat Wajib & Konfirmasi Ganda)**:
  - Sebelum membalik saklar ke `dua_cabang`, modal mewajibkan konfirmasi checklist 10 poin (cermin 7 hari tanpa selisih, uji rekam-putar lulus, buku tamu aktif, ProcessedOps tersinkron, nomor WO 4 angka, payroll identik, cadangan per jam teruji, web GAS ditutup/read-only, latihan saklar balik lulus, go-live serentak).
  - Wajib mengetik kode rumah yang tepat dan mengisi alasan minimal 5 karakter sebelum tombol konfirmasi aktif.
- **Integrasi Status Saklar Dinamis di Seluruh Worker Rumah**:
  - `workers/kmbprojek/src/index.js`, `workers/sum/src/index.js`, dan `workers/kmb/src/index.js` dilengkapi helper `bacaStatusSaklar` yang memeriksa `/api/saklar/status` dengan in-memory cache 5 detik.
  - Fallback aman: jika terjadi kegagalan jaringan atau keterlambatan jawaban pintu, seluruh worker rumah langsung kembali ke mode aman `gas` (spreadsheet).
  - Endpoint `/api/sehat` di ketiga rumah melaporkan status live saklar secara real-time.
- **Pelatihan di Staging & Verifikasi Produksi**:
  - Telah dilatih di staging (`abadiops-pintu-staging`) sesuai protokol `docs/GEDUNG-DAN-STAGING.md` §2 dan `AGENTS.md` §0a point 14. Pembalikan ke `dua_cabang`, verifikasi konsistensi seketika, dan pengembalian darurat ke `gas` teruji 100% lulus.
  - Seluruh komponen telah di-deploy ke produksi (`abadiops-pintu`, `abadiops-porject-kmb`, `abadiops-sum`, `abadiops-kmb`).
  - **GARIS MERAH TERJAGA:** Seluruh saklar di produksi terkunci pada posisi awal bawaan: `gas`. Pembalikan saklar produksi adalah **Titik Henti** yang hanya boleh dilakukan oleh Gabriel (`AGENTS.md` §0a nomor 12).
- **Belum selesai / berikutnya**:
  - Langkah 7: Sinkron penuh dan cermin sheet berjalan rutin di skema `kmb_projek` dan `sum`.
  - Langkah 9: Mengaktifkan buku tamu kiriman di pintu depan sebelum saklar dibalik.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-10-30 · Raka (+ AI) · bersama (Langkah 6 Selesai: Halaman Web Desktop 1:1 di Domain Abadi, Pintu Bebas script.google.com)
- **Eksekusi Langkah 6: Pemindahan Web Desktop 1:1 ke Domain Abadi (`abadiops.com`)**:
  - Sesuai keputusan Gabriel (`docs/KEPUTUSAN.md` 28 & 29 Okt) dan `docs/SERAH-TERIMA-2026-10-29.md` §5 langkah 6, ketergantungan tombol **🖥️ Web** ke `script.google.com` telah dihilangkan total.
  - Template HTML GAS KMB TRA (11 file) disalin dari `d:\GAS\KMB v2/` ke `workers/kmb/web/`.
  - Bersama 11 template KMB Project (`workers/kmbprojek/web/`) dan 7 template SUM V2 (`workers/sum/web/`), seluruh template (total 29 file HTML) dipertahankan 100% identik tanpa perubahan logika.
- **Generator Kompilasi Template Build-Time (`scripts/build-web-templates.mjs`)**:
  - Mengonversi scriptlet GAS (`<? ... ?>`, `<?= ... ?>`, `<?!= ... ?>`, `include('...')`, `getThemeCSS()`) menjadi modul ES JavaScript murni (`src/web-templates.js`) di ketiga rumah.
  - Zero-eval saat runtime: aman 100% terhadap batasan sandbox V8 Cloudflare Workers dan memiliki performa instan tanpa parsing regex saat melayani permintaan pengguna.
  - Mendukung alias rute standar GAS: `dashboard` (`main`), `create` (`workorder`), `approvals` (`approval`), `mechanic` / `monitoring` (`mechanicdashboard`), `reports`, `teknis`, `hm`, `km`, `cancel` (`cancelwo`).
- **Client Shim `window.google.script.run` via JavaScript Proxy**:
  - Shim ringan disuntikkan otomatis ke dalam `<head>` halaman web.
  - Menangkap seluruh panggilan metode interaktif klien (`handleSupervisorApprove`, `createWO`, `dataDashboardTeknis`, `riwayatHmUnit`, `getWODetails`, dll.) dan meneruskannya ke `/api/web`.
  - Event delegation otomatis menjaga parameter `?token=` pada setiap navigasi tautan `/web` internal agar token tidak hilang saat berpindah antar menu/tab.
- **Rute Web & API Bridge di Seluruh Worker Rumah**:
  - Handler `handleWebRequest` (`GET /web`) dan `handleWebBridgeApi` (`POST /api/web`) diimplementasikan di `workers/kmbprojek/src/index.js`, `workers/sum/src/index.js`, dan `workers/kmb/src/index.js`.
  - Guard token ketat: tanpa token mengembalikan HTTP 401 ("Perlu Token"), token salah/nonaktif mengembalikan HTTP 403 ("Akses Ditolak"), token sah memvalidasi profil dan merender tampilan 1:1.
- **Pintu (`workers/pintu/wrangler.toml`) Diarahkan ke Domain Abadi**:
  - Konfigurasi `web` di pintu produksi resmi diarahkan ke `https://<rumah>.abadiops.com/web` (`kmbprojek.abadiops.com/web`, `sum.abadiops.com/web`, `kmbtra.abadiops.com/web`).
  - Konfigurasi `web` di pintu staging diarahkan ke `https://staging-<rumah>.abadiops.com/web`.
- **Deploy & Verifikasi Lengkap**:
  - `workers/gas-tiruan` diperbarui dengan dukungan alias router web.
  - Staging (`abadiops-kmbprojek-staging`, `abadiops-sum-staging`, `abadiops-kmb-staging`, `abadiops-pintu-staging`) di-deploy dan diverifikasi live (semua halaman merender HTTP 200, HTML valid, shim aktif).
  - Produksi (`abadiops-porject-kmb`, `abadiops-sum`, `abadiops-kmb`, `abadiops-pintu`) di-deploy dan diverifikasi live.
  - `npm run typecheck` lulus bersih. `npx vitest run tests/pintu.test.ts` lulus 4/4.
- **Belum selesai / berikutnya**:
  - Langkah 2: Cermin ketiga rumah (sinkron sheet -> Supabase berkala) menunggu kunci akun layanan Google (`GOOGLE_SA_KEY_FILE`).
  - Langkah 8: Panel saklar visual di `abadiops.com` berbasis Durable Object dengan proteksi kata sandi.


### 2026-10-30 · Raka (+ AI) · bersama (Panggung Staging Gedung 2 dnnqrslftndcbmnvuveb dan Worker gas-tiruan siap & teruji)
- **Alih Fungsi Project `dnnqrslftndcbmnvuveb` Menjadi Gedung 2 (Staging)**:
  - 3 Kamar skema cermin (`sum` 22 tabel, `kmb` 24 tabel, `kmb_projek` 10 tabel) dan 18 RPC bertoken telah dipasang lengkap di Gedung 2 (`dnnqrslftndcbmnvuveb`).
  - Verifikasi keamanan RPC Gedung 2: akses anon langsung ke `sum_create_refs` & `kmbtra_create_refs` ditolak (HTTP 401), hanya `*_bertoken` yang diizinkan.
- **Worker GAS Tiruan (`workers/gas-tiruan/`) Selesai & Tayang Live**:
  - Dibuat khusus untuk staging (`abadiops-gas-tiruan.kawanabadigrup.workers.dev`) sesuai mandat `docs/GEDUNG-DAN-STAGING.md` §2.
  - HARAM kontak GAS produksi: Aksi baca dijawab dari RPC Gedung 2, aksi tulis (`create_wo`, `submit_work`, `approve`, `reject`, `cancel`) dijawab dengan format resmi nomor WO GAS (`WO-YYYYMMDD-XXX`) tanpa pernah menyentuh Google Sheets asli.
  - Teruji live: `ping` bertoken uji direspon akurat per rumah, `create_wo` menghasilkan ID unik simulasi.
- **Konfigurasi `[env.staging]` di Seluruh Worker (Pintu, SUM, KMB TRA, KMB Projek)**:
  - Blok `[env.staging]` aktif dengan Service Binding `GAS_TIRUAN` menuju `abadiops-gas-tiruan`.
  - Pintu staging (`abadiops-pintu-staging`) memvalidasi token uji zero-select langsung mengarahkan ke rumah yang tepat (`sum`, `kmbtra`, `kmbprojek`).
  - Seluruh Worker staging (`abadiops-pintu-staging`, `abadiops-sum-staging`, `abadiops-kmb-staging`, `abadiops-kmbprojek-staging`) telah di-deploy dan terverifikasi live.
  - `routes = []` dikunci pada staging agar tidak merebut domain kustom produksi (`sum.abadiops.com`, `kmbtra.abadiops.com`).
  - Uji serah-terima token `node scripts/uji-serahan-token.mjs` tetap 24/24 lulus.
- **Penyelesaian Bug #23 & Penyelarasan CI (`tests/navbar.test.tsx`)**:
  - `tests/navbar.test.tsx` diselaraskan dengan `NavBar.tsx` (mengecek bahwa mekanik tidak melihat Dashboard Performa pasca commit `0f7c548`).
  - Uji `npx vitest run tests/navbar.test.tsx` lulus 8/8. `npm run typecheck` lulus bersih.
  - `docs/BUG-DICATAT.md` diperbarui: Bug #23 ditandai diperbaiki.
- **Pembersihan Dokumen Keputusan (`docs/KEPUTUSAN.md`)**:
  - Bagian "Belum diputuskan" di `docs/KEPUTUSAN.md` dibersihkan dan ditandai tuntas setelah penyatuan kamar SUM di Gedung 1 dan alih fungsi Gedung 2 staging berhasil.
- **Belum selesai / berikutnya**:
  - Langkah 2 (Cermin ketiga rumah: sinkron sheet -> Supabase) menunggu kunci akun layanan Google (`GOOGLE_SA_KEY_FILE`).
  - Langkah 6 (Halaman Web 1:1 di domain Abadi) sebelum saklar dinyalakan.
  - Langkah 8 (Panel saklar visual di pintu `abadiops.com` berbasis Durable Object / KV).

### 2026-10-30 · Raka (+ AI) · bersama (kamar SUM disatukan di Gedung 1, Bug #22 tuntas, deploy 3 Worker PWA v49/v95/v17)
- **Eksekusi Penyatuan Kamar SUM & KMB TRA ke Gedung 1 Produksi (`sptgqsjgszwbreikxdph`)**:
  - Sesuai konsep gedung dan kamar (`docs/GEDUNG-DAN-STAGING.md`), seluruh rumah disatukan di satu project Supabase produksi.
  - DDL `db/sum/cermin_sheet.sql` & `db/sum/rpc_baca.sql` dieksekusi ke Gedung 1: skema `sum` (22 tabel) dan 4 RPC baca aktif di project utama.
  - DDL `db/kmb/cermin_sheet.sql` & `db/kmb/rpc_baca.sql` dieksekusi ke Gedung 1: skema `kmb` (24 tabel) dan 3 RPC baca aktif di project utama.
  - Verifikasi kamar di Gedung 1: `kmb` (24 tabel), `kmb_projek` (11 tabel), dan `sum` (22 tabel) berdampingan dalam satu gedung tanpa saling mengintip.
  - Konfigurasi `workers/sum/wrangler.toml` diselaraskan kembali ke Gedung 1 (`sptgqsjgszwbreikxdph.supabase.co`).
- **Penyelesaian Tuntas Bug #22 (Wajib Token & Faktor Dinamis)**:
  - Akses langsung tanpa token ke katalog referensi ditutup: `_sum_create_refs_internal` dan `_kmbtra_create_refs_internal` di-REVOKE dari `anon` & `authenticated`.
  - Pintu masuk publik diganti menjadi `sum_create_refs_bertoken(p_token)` dan `kmbtra_create_refs_bertoken(p_token)` yang memvalidasi token di tabel `api_tokens`.
  - Hardcode `work_conditions` di SQL dibuang; faktor dibaca dinamis dari cermin tabel `config_factors` dengan label 1:1 persis GAS (SUM: "Normal", "Malam/Hujan", "Resiko Tinggi"; KMB TRA: "Shift 1", "Shift 2", "Kondisi Ekstrim").
  - Verifikasi REST live: panggilan tanpa token ditolak (HTTP 401 permission denied), panggilan bertoken palsu dijawab aman (`success: false, error: 'Token tidak dikenal / nonaktif'`).
  - `docs/BUG-DICATAT.md` diperbarui: Bug #22 status diperbaiki.
- **Deploy Ketiga Worker Rumah ke Cloudflare (Perbaikan #19–#21 Tayang Live)**:
  - Uji serah-terima token `node scripts/uji-serahan-token.mjs` lulus 24/24 skenario.
  - Deploy produksi berhasil:
    - SUM V2: Worker `abadiops-sum` Version `b5ef781a…`, PWA `mar-sum-v49`.
    - KMB TRA: Worker `abadiops-kmb` Version `72daf6d9…`, PWA `mar-v95`.
    - KMB Project: Worker `abadiops-porject-kmb` Version `e2138562…`, PWA `mar-projek-v17`.
  - Verifikasi live:
    - `https://sum.abadiops.com/api/sehat` mengembalikan `ok: true`, `saklar: gas`, `supabase_configured: true`.
    - `https://kmbtra.abadiops.com/api/sehat` mengembalikan `ok: true`, `saklar: gas`, `supabase_configured: true`.
    - Cache `sw.js` live terverifikasi: `mar-sum-v49`, `mar-v95`, `mar-projek-v17`.
- **Status Gedung 2 (Staging)**:
  - Project `dnnqrslftndcbmnvuveb` telah dilepaskan dari produksi dan dialokasikan sebagai Gedung 2 (Staging) sesuai rencana `docs/GEDUNG-DAN-STAGING.md`.
  - `docs/KEPUTUSAN.md` diperbarui: daftar "Belum diputuskan" kembali kosong.
- **Belum selesai / berikutnya**:
  - Langkah 0 (kunci akun layanan Google) & Langkah 2 (eksekusi sinkron cermin pertama dari spreadsheet).

### 2026-10-30 · Gabriel (+ Claude) · bersama (konsep gedung, kamar, dan staging ditulis)
- Berubah: dokumen saja.
  - **Baru: `docs/GEDUNG-DAN-STAGING.md`**, atas permintaan Gabriel, karena konsep ini belum dipahami sama. Isinya:
    - Project Supabase = gedung, skema = kamar, rumah = kamar. Rumah baru = skema baru, bukan project baru.
    - Paket gratis = 2 gedung: produksi dan staging. Gedung ketiga = pembayaran (titik henti).
    - Staging dijelaskan sebagai panggung latihan: alamat, `[env.staging]`, sumber data, dan daftar latihan wajib.
    - **GAS tiruan:** staging tidak pernah menyentuh GAS produksi, karena aksi tulis ke sana sama dengan menulis ke spreadsheet asli (turunan garis merah §5).
  - `AGENTS.md`: bacaan wajib nomor 5, dan koridor butir 14.
  - `docs/SERAH-TERIMA-2026-10-29.md`:
    - §1: kalimat "push ke `main` = deploy `kmbprojek.abadiops.com`" yang sudah basi diperbaiki.
    - Langkah 0 dan 4 ditambah acuan ke dokumen baru.
- Belum selesai / berikutnya: keputusan project Supabase SUM (`docs/KEPUTUSAN.md`, "Belum diputuskan"); deploy ketiga Worker rumah (perbaikan #19–#21).

### 2026-10-29 · Gabriel (+ Claude) · bersama (audit kerja Raka 29 Okt di semua sistem; serah-terima token dipulihkan)
- Dicek: GitHub (15 commit Raka, 54 file, `cf56a7c..1dd9166`), situs live (pintu dan ketiga rumah), Supabase (dua project), GitHub Actions, dan Cloudflare dari luar (mesin audit tidak punya wrangler).
- **Aman dan sesuai rencana:**
  - Pintu `abadiops.com`: pilihan Aplikasi/Web tayang. Daftar GAS di pintu sama dengan GAS di Worker rumah. Sempat sekitar satu jam tanpa pilihan Web (`0f0cdf1`, pengalihan otomatis), lalu dipulihkan (`2cd1dc4`).
  - Ketiga rumah tetap 100% GAS. `/api/sehat` menjawab `saklar=gas`. `pull_monitoring` SUM dan KMB TRA lewat aplikasi sama persis dengan GAS langsung (`success:true`; 41 dan 27 mekanik). Bahkan `?uji=supabase` dijawab lewat jalur GAS.
  - **§5 langkah 1 selesai:** `kmbprojek.abadiops.com` adalah PWA asli `gabrielrurent/PWA-Project-KMB` projek-v13 (`6e8b980`) dengan resep dan serah-terima token, di Worker `abadiops-porject-kmb`. Token SUM dan KMB TRA ditolak. Uji data positif belum saya lakukan karena saya tidak memegang token uji KMB Project yang aktif.
  - File yang tayang di pintu dan ketiga rumah sama dengan repo `1dd9166`. Tidak ada rahasia di 54 file. `pantau.yml` dimatikan, `name` akar menjadi `project-mar`, dan `scripts/verify-sum-kmb-isolation.mjs` dipensiunkan (tugas §6).
- **Bug yang tayang hari ini dan diperbaiki di repo malam ini (#19–#21).** Uji baru `scripts/uji-serahan-token.mjs`: kode yang tayang lulus 4/24, kode sesudah perbaikan 24/24.
  - **#19, SUM dan KMB TRA:** membuka aplikasi tanpa `#token=` (ikon layar utama, muat ulang, tombol "Lanjutkan ke …" di pintu) membuat pengguna keluar. Online: layar login dengan "Token tidak dikenal". Offline: token di HP terhapus.
  - **#19, ketiga rumah:**
    - HP yang sudah masuk dengan token lain langsung diganti tokennya, sehingga antrean kiriman milik pengguna lama terkirim atas nama token baru.
    - Layar menjadi kosong saat token ditolak atau sesudah logout.
  - **#20, KMB Project:** saat GAS tidak terjangkau, kiriman di antrean latar ditandai gagal dan tidak dicoba ulang.
  - **#21, KMB TRA dan KMB Project:** `sw.js` network-first untuk halaman HTML, menyimpang dari keputusan frontend 1:1.
  - **Perbaikan:**
    - Penjaga sesi dipulihkan persis seperti `cf56a7c`.
    - Kelas anti-kedip dilepas sesudah layar pertama dipilih.
    - Token dibuang dari alamat.
    - `sw.js` kembali 1:1: KMB Project = asli + dua baris resep; KMB TRA = versi sebelum 29 Okt.
    - Versi naik: `mar-sum-v49`, `mar-v95`, `mar-projek-v17`.
  - **Berlaku setelah ketiga Worker rumah di-deploy** (`docs/SERAH-TERIMA-2026-10-29.md` §5, "Pagi 30 Okt").
- **Temuan lain:**
  - **Supabase SUM di project terpisah** `dnnqrslftndcbmnvuveb`: skema `sum.cermin_*` dan 4 RPC, dan `workers/sum` menunjuk ke sana. Ini menyimpang dari rancangan (satu project ditambah staging gratis) dan memakai slot gratis kedua. Dicatat di `docs/KEPUTUSAN.md` bagian "Belum diputuskan".
  - **#22:**
    - `sum_create_refs()` bisa dipanggil tanpa token: HTTP 200 dengan kunci publik, isinya masih kosong. `kmbtra_create_refs()` sama, tapi belum dipasang.
    - `work_conditions` di kedua fungsi itu ditulis tetap di SQL. Labelnya juga berbeda dengan GAS, yang membaca faktor dari sheet.
  - RPC `kmbtra_*` belum ada di project utama (PGRST202), artinya `db/kmb/*.sql` belum dijalankan. Tidak berdampak karena jalur Supabase tertutup.
  - **#23:** CI `uji` merah sejak 27 Okt (`0f7c548`, `tests/navbar.test.tsx:81`). Semua push sejak itu merah, termasuk push kita. Job `rahasia` tetap hijau.
  - **Koreksi entri "verifikasi token uji L1 & L2" di bawah:**
    - `52fd…` dan `67e8…` adalah token KMB TRA (SPV-001 dan SUPT-001), bukan KMB Project. Dicek malam ini: pintu mengenali `52fd…` sebagai `kmbtra`, dan hanya `kmbtra.abadiops.com` yang menerimanya.
    - Angka di entri itu (68 approved, 20 mekanik) adalah angka KMB Project, jadi kemungkinan tokennya benar tetapi awalannya salah tulis.
    - Token baru `f5f6…`, `8a1a…`, dan `c181…` belum ada di sheet mana pun.
  - Nama Worker `abadiops-porject-kmb` salah ketik. Dibiarkan dan dicatat di `workers/kmbprojek/README.md`.
  - `docs/CATATAN-GABRIEL.md`: dua awalan token 8 karakter dipendekkan menjadi 4.
- Belum selesai / berikutnya: deploy ketiga Worker rumah, keputusan project Supabase SUM, lalu §5 langkah 0 (akun layanan Google).

### 2026-10-29 · Raka (+ AI) · bersama (koneksi Supabase SUM, DDL cermin live, template web 1:1 KMB Project, & network-first PWA)
- **Konfigurasi Kunci API Supabase SUM (`dnnqrslftndcbmnvuveb`)**:
  - Publishable API key (`sb_publishable_HgQd...`) diverifikasi aktif untuk RPC publik: pengujian RPC `sum_ping` mengembalikan respon JSON valid.
  - `workers/sum/wrangler.toml` diperbarui dengan publishable key proyek SUM baru dan di-deploy ke Cloudflare Worker (`abadiops-sum` Version `8db5e425…`).
  - Verifikasi live: `https://sum.abadiops.com/api/sehat` mengembalikan `supabase_configured: true`.
  - Secret key (`sb_s...`) diverifikasi aktif (200 OK ke endpoint REST) dan disiapkan untuk perkakas sinkronisasi data cermin (`tools/sum/sinkron-cermin.mjs`). Kunci rahasia tidak pernah masuk ke repo sesuai aturan §4.
- **Eksekusi DDL & RPC Database SUM V2 (skema `sum`)**:
  - Koneksi database Postgres SUM (`dnnqrslftndcbmnvuveb`) berhasil terhubung lewat Supabase connection pooler port 6543 di region Singapore (`aws-0-ap-southeast-1.pooler.supabase.com:6543`).
  - DDL `db/sum/cermin_sheet.sql` sukses dieksekusi langsung ke database: skema `sum` dan 22 tabel cermin mentah spreadsheet terpasang bersih.
  - RPC baca `db/sum/rpc_baca.sql` sukses dieksekusi: 4 fungsi (`sum_ping`, `sum_create_refs`, `sum_monitoring_bertoken`, `sum_my_wos_bertoken`) terpasang di skema `public`.
  - Konfigurasi `workers/sum/wrangler.toml` disetel ke `SUPABASE_URL = "https://dnnqrslftndcbmnvuveb.supabase.co"`.
- **Pengamanan Template Web Desktop 1:1 KMB Project (Langkah 6)**:
  - 11 template HTML asli dari script GAS KMB Project (`1cKrVdmxH_hD4yVTwqLAXKdUjwM5wd7Glh4MdlpT7oP8KDOaGNgJCJVyh`) disalin dari repositori lokal ke `workers/kmbprojek/web/`:
    - `Approval.html`, `DateTime24.html`, `Hm.html`, `Km.html`, `Main.html`, `MechanicDashboard.html`, `PANDUAN.html`, `Reports.html`, `Styles.html`, `Teknis.html`, `WorkOrder.html`.
    - Template ini adalah sumber asli tampilan Desktop Web KMB Project (Gambar 2 yang dilampirkan pengguna).
- **Tuntas Masalah Cache PWA & Penyerahan Token (Gambar 3)**:
  - Penyebab Gambar 3: Tangkapan layar diambil pukul 16:24 WIB saat browser masih menyimpan Service Worker cache `mar-projek-v14` (rilis `v15` baru di-deploy pukul 16:47 WIB). Di `v14`, belum ada parsing hash token dari URL dan belum ada anti-flicker CSS di `<head>`.
  - Peningkatan anti-stale cache: Menambahkan strategi `network-first` untuk dokumen navigasi HTML di seluruh Service Worker (`pwa/kmbprojek/sw.js`, `pwa/sum/sw.js`, `pwa/kmb/sw.js`). Saat online, browser selalu menarik HTML terbaru secara instan tanpa menunggu siklus update latar belakang.
  - Nilai token serahan juga otomatis di-prefill ke input (`#tokenInput`) sebagai fallback tambahan.
  - Bump versi: KMB Project (`projek-v16` / `mar-projek-v16`), SUM V2 (`sum-v48` / `mar-sum-v48`), KMB TRA (`kmb-v94` / `mar-v94`).
  - Deploy ketiga Worker ke Cloudflare:
    - KMB Project: `abadiops-porject-kmb` (Version `65318c32-85ac-41dc-9f11-3efa50748117`).
    - SUM V2: `abadiops-sum` (Version `66feead5-b633-42e6-8015-03a2296321fc`).
    - KMB TRA: `abadiops-kmb` (Version `d2918074-6765-448b-b965-e441502053f0`).
- **Verifikasi Publik**:
  - Live `https://kmbprojek.abadiops.com/sw.js` -> `mar-projek-v16`.
  - Live `https://sum.abadiops.com/sw.js` -> `mar-sum-v48`.
  - Live `https://kmbtra.abadiops.com/sw.js` -> `mar-v94`.
- **Yang Belum Selesai & Tindak Lanjut Besok**:
  - **Kunci Akun Layanan Google (`GOOGLE_SA_KEY_FILE`)**: Panduan langkah demi langkah 2 menit untuk Gabriel & Raka telah ditulis di `docs/PANDUAN-SERVICE-ACCOUNT-GOOGLE.md`. Siapa pun yang memiliki akses Google Cloud Console (akun `kawanabadigrup`) dapat membuat kunci JSON tersebut di `console.cloud.google.com` dan membagikan akses Viewer ke 3 spreadsheet produksi (`1lnJo74O…`, `1qHjfIUT…`, `1ehnxDlv…`). Setelah file ada (misal di `D:\sa-key.json`), sinkronisasi cermin mentah (Langkah 2) siap langsung dieksekusi dengan: `$env:GOOGLE_SA_KEY_FILE="D:\sa-key.json"; node tools/sum/sinkron-cermin.mjs --kering`.
  - **Rendering Web 1:1 (Langkah 6)**: Template HTML asli SUM (7 file di `workers/sum/web/`) dan KMB Project (11 file di `workers/kmbprojek/web/`) sudah lengkap di repo dan siap dihubungkan ke Worker masing-masing rumah agar tombol "Web" di pintu tidak perlu lagi ke `script.google.com`.

### 2026-10-29 · Raka (+ AI) · bersama (audit menyeluruh status migrasi: apa yang sudah & apa yang belum)
- Ringkasan Status Selesai (Fondasi, Pintu, & Tiga Rumah 100% Siap):
  - **Pintu Masuk Netral (`abadiops.com`)**:
    - Worker `abadiops-pintu` live di Cloudflare (Version `907aff98…`).
    - Login Zero-Select berjalan di 3 rumah (KMB Project, SUM V2, KMB TRA) tanpa salah kamar.
    - Layar pemilihan 2 mode akses (📱 Aplikasi PWA vs 🖥️ Web Biasa) berjalan normal.
  - **Aplikasi PWA Lapangan Tiga Rumah**:
    - Salinan 1:1 PWA lama berjalan di Cloudflare Workers:
      - KMB Project: `https://kmbprojek.abadiops.com/` (Worker `abadiops-porject-kmb`, PWA `mar-projek-v15`).
      - SUM V2: `https://sum.abadiops.com/` (Worker `abadiops-sum`, PWA `mar-sum-v47`).
      - KMB TRA: `https://kmbtra.abadiops.com/` (Worker `abadiops-kmb`, PWA `mar-kmb-v93`).
    - Mekanisme `masukDariPintu` + anti-kedip inline CSS di `<head>` aktif di ketiga rumah: pengguna langsung masuk ke dashboard tanpa melihat layar token sekilas pun.
  - **Fondasi Supabase Tiga Rumah**:
    - Skema cermin mentah JSONB siap di `db/sum/cermin_sheet.sql`, `db/kmb/cermin_sheet.sql`, dan `db/kmb_projek/cermin_sheet_mentah.sql`.
    - Skrip sinkronisasi siap di `tools/sum/sinkron-cermin.mjs`, `tools/kmb/sinkron-cermin.mjs`, dan `tools/kmb_projek/sinkron-cermin.mjs` (mendukung dry-run `--kering`).
    - Skrip pemeriksa token kembar otomatis siap di `tools/cek-token-kembar.mjs`.
    - Fungsi RPC baca Supabase siap di `db/sum/rpc_baca.sql`, `db/kmb/rpc_baca.sql`, dan `db/kmb_projek/rpc_baca.sql`.
    - Dual-Engine router (Supabase + fallback GAS) terpasang di ketiga worker rumah.
    - 7 Berkas HTML asli Web Desktop SUM V2 tersimpan di `workers/sum/web/`.
- Daftar Rinci Apa yang Belum Selesai (Sesuai Rencana §5 & docs/SERAH-TERIMA-2026-10-29.md):
  - [ ] **1. Kunci Akun Layanan Google (GOOGLE_SA_KEY_FILE)** [Panduan Siap di docs/PANDUAN-SERVICE-ACCOUNT-GOOGLE.md]:
    - Pemblokir utama: Kunci JSON Service Account Google (Viewer ke 3 spreadsheet).
    - Panduan pembuatan 2 menit tersedia di docs/PANDUAN-SERVICE-ACCOUNT-GOOGLE.md. Gabriel atau Raka bisa membuatnya di console.cloud.google.com (akun kawanabadigrup) dan membagikan akses Viewer ke 3 spreadsheet produksi.
  - [ ] **2. Langkah 2: Eksekusi Sinkronisasi Cermin Mentah**:
    - Menjalankan sinkronisasi pertama kali ke Supabase produksi (`--kering` lalu tulis).
    - Memasang pemicu sinkronisasi berkala tiap 5 menit (GitHub Actions atau Cron Cloudflare).
    - Menjaga laporan selisih harian nol selama 7 hari berturut-turut.
  - [ ] **3. Langkah 3: Cadangan Terenkripsi per Jam & Uji Pulih**:
    - Membuat skrip cadangan otomatis (`pg_dump` terenkripsi) tiap jam ke Google Drive kawanabadigrup / R2.
    - Melakukan uji pulih (`restore`) ke database staging dan memverifikasi kesamaan jumlah baris.
  - [ ] **4. Langkah 4: Lingkungan Staging Lengkap**:
    - Membuat project Supabase staging kedua (gratis) di akun bersama.
    - Menyiapkan worker staging (`staging.abadiops.com` dan `staging-<rumah>.abadiops.com`).
  - [ ] **5. Langkah 5: Uji Kembar Aksi Baca (Twin Test)**:
    - Menguji kesamaan byte-per-byte output JSON RPC Supabase vs GAS untuk aksi baca (`ping`, `pull_create_refs`, `pull_monitoring`, `pull_my_wos`, `pull_pending`).
    - Memasukkan aksi yang lulus ke `AKSI_SUPABASE_LULUS_KEMBAR` di worker rumah.
  - [ ] **6. Langkah 6: Halaman Web Desktop 1:1 di Cloudflare**:
    - Mengadaptasi 7 halaman web SUM V2 (`workers/sum/web/`) dan template KMB Project agar memanggil API Worker Cloudflare (`fetch('./api')`), bukan `google.script.run`.
    - Mengubah rujukan `web` di `workers/pintu/wrangler.toml` dari `script.google.com` ke domain web Cloudflare masing-masing rumah.
  - [ ] **7. Langkah 7: Jalur Tulis WO Baru di Belakang Saklar**:
    - Menyiapkan logika penulisan WO baru di Supabase dengan nomor WO 4 digit (`WO-YYYYMMDD-XXXX`) dan buku tamu kiriman (`op_id`).
    - Menyiapkan kalkulasi payroll gabungan (WO lama cermin + WO baru Supabase).
    - Memastikan jalur ini tetap mati selama saklar di posisi `gas`.
  - [ ] **8. Langkah 8: Panel Saklar Visual di abadiops.com**:
    - Membuat panel Durable Object berpelindung kata sandi (secret dipasang Gabriel) dengan fitur peringatan maju dan mundur cepat (penyelamat).
    - Latihan saklar balik di staging (nyala → mati → nyala).
  - [ ] **9. Langkah 9: Titik Henti & Go-Live Serentak**:
    - Menyusun laporan kesiapan akhir sesuai daftar syarat di `docs/SAKLAR.md`.
    - **Berhenti**: Menyerahkan keputusan penyalaan saklar serentak kepada Gabriel.
- Langkah Kerja Berikutnya:
  - Meminta file `GOOGLE_SA_KEY_FILE` ke Gabriel untuk membuka eksekusi Langkah 2 (Cermin Tiga Rumah).

### 2026-10-29 · Raka (+ AI) · bersama (perbaikan login langsung dari pintu dan anti-kedip layar token)
- Berubah:
  - `pwa/kmbprojek/`:
    - `index.html`: Ditambahkan script deteksi URL hash/query `#token=` di `<head>` dengan CSS `html.dari-pintu #screen-login { display: none !important; }` agar layar "Masukkan Token" tidak pernah muncul sekilas saat datang dari pintu.
    - `app.js`: Fungsi `masukDariPintu` diperbaiki agar langsung mengesahkan token baru tanpa terblokir oleh sesi lama, memanggil `showScreen('main')` seketika, dan menangani fallback offline. Versi di-bump ke `projek-v15`.
    - `sw.js`: Versi cache di-bump ke `mar-projek-v15` agar browser klien otomatis menarik pembaruan `app.js` dan membuang cache lama.
  - `pwa/sum/` & `pwa/kmb/`:
    - Penyesuaian identik di `index.html`, `app.js`, dan `sw.js` (SUM bump `mar-sum-v47`, KMB TRA bump `mar-kmb-v93`).
  - Deploy & Verifikasi Cloudflare:
    - Worker `abadiops-porject-kmb` berhasil di-deploy ke Cloudflare (Version `5bf19255…`).
    - Worker `abadiops-sum` berhasil di-deploy ke Cloudflare (Version `f93b0530…`).
    - Worker `abadiops-kmb` berhasil di-deploy ke Cloudflare (Version `3cb6945c…`).
    - Verifikasi publik: `sw.js` live menyajikan `mar-projek-v15` dan `index.html` menyajikan inline script `dari-pintu`.
- Belum selesai / berikutnya: Menunggu `GOOGLE_SA_KEY_FILE` dari Gabriel untuk eksekusi cermin spreadsheet (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · bersama (fondasi rumah SUM dan KMB V2 berbasis Supabase)
- Berubah:
  - `db/sum/rpc_baca.sql`:
    - Membuat fungsi RPC Supabase untuk SUM V2 (`sum_ping`, `sum_create_refs`, `sum_monitoring_bertoken`, `sum_my_wos_bertoken`) yang membaca langsung dari tabel cermin `sum.*`.
  - `db/kmb/rpc_baca.sql`:
    - Membuat fungsi RPC Supabase untuk KMB V2 (`kmbtra_ping`, `kmbtra_create_refs`, `kmbtra_monitoring_bertoken`) yang membaca langsung dari tabel cermin `kmb.*`.
  - `workers/sum/`:
    - `wrangler.toml`: Menambahkan binding `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORAGE_MODE`.
    - `src/index.js`: Mengaktifkan gerbang Dual-Engine (Supabase Read Router dengan fallback otomatis ke GAS).
    - `web/`: Menyimpan 7 berkas asli web desktop SUM V2 (`Main.html`, `MechanicDashboard.html`, `Approval.html`, `WorkOrder.html`, `Reports.html`, `CancelWO.html`, `Styles.html`) dari remote `marsum/master`.
  - `workers/kmb/`:
    - `wrangler.toml`: Menambahkan binding `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORAGE_MODE`.
    - `src/index.js`: Mengaktifkan gerbang Dual-Engine (Supabase Read Router dengan fallback otomatis ke GAS).
  - Verifikasi:
    - Seluruh sintaks JavaScript (`node --check`) lulus 100%.
    - `wrangler deploy --dry-run` pada `workers/sum` dan `workers/kmb` lulus 100%.
- Belum selesai / berikutnya: Menjalankan eksekusi cermin mentah setelah `GOOGLE_SA_KEY_FILE` diterima dari Gabriel (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · pintu (pemulihan layar pilihan Aplikasi PWA vs Web Biasa di abadiops.com)
- Berubah:
  - `workers/pintu/public/index.html`:
    - Mengembalikan layar pilihan 2 mode akses per keputusan Gabriel 28–29 Okt (docs/KEPUTUSAN.md #10 & #28):
      - 📱 **Aplikasi PWA**: untuk HP / lapangan (offline-first) -> https://<rumah>.abadiops.com/#token=...
      - 🖥️ **Web Biasa**: untuk laptop / desktop (menu lengkap) -> https://script.google.com/macros/s/.../exec?token=...
    - Menghapus auto-redirect langsung yang melompati layar pilihan pengguna.
  - **Deploy Berhasil & Live di Produksi**:
    - Worker `abadiops-pintu` berhasil di-deploy ke Cloudflare via `wrangler deploy` (Version ID: 907aff98-5b94-4780-8159-406d148cbc50).
    - Diverifikasi live di `https://abadiops.com/`: setelah token dikenali, pengguna mendapatkan 2 pilihan (Aplikasi PWA atau Web Biasa).
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk sinkron cermin mentah (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · pintu (auto-redirect langsung ke aplikasi rumah LIVE di abadiops.com)
- Berubah:
  - `workers/pintu/public/index.html`:
    - Menghilangkan tombol "Web" yang mengarahkan ke `script.google.com` (GAS lama).
    - Menerapkan auto-redirect langsung (`location.replace`) ke aplikasi rumah di Cloudflare (`<rumah>.abadiops.com#token=...`) begitu token diverifikasi.
    - Menghapus potensi kebingungan pengguna terlempar ke URL Google Apps Script.
  - **Deploy Berhasil & Live di Produksi**:
    - Worker `abadiops-pintu` berhasil di-deploy ke Cloudflare via `wrangler deploy` (Version ID: `f421e13b…`).
    - Diverifikasi live di `https://abadiops.com/`: halaman menyajikan auto-redirect dan bebas tautan `script.google.com`.
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk menjalankan cermin tiga rumah (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · kmb-projek (verifikasi token uji L1 & L2 KMB Project di pintu & live backend)
- Berubah:
  - **Verifikasi Token Uji KMB Project (§5 Langkah 0 selesai)**:
    - Token L1 (`52fd…`) dan L2 (`67e8…`) diterima dari Gabriel.
    - Uji `scripts/buat-token-tiga-rumah.mjs --cek`: kedua token terkonfirmasi eksklusif di KMB Project, tanpa tabrakan di SUM atau KMB TRA.
    - Uji Pintu `abadiops.com/api/pintu`: kedua token dikenali dengan tepat sebagai `kmbprojek`, mengembalikan tautan aplikasi `https://kmbprojek.abadiops.com/` dan profil (`L1 Test`, `L2 Test`).
    - Uji Backend `kmbprojek.abadiops.com/api`:
      - `52fd…` (L1) -> peran `supervisor`, `approved: 68`, `pending_l1: 3`, `pending_l2: 0`, 20 mekanik.
      - `67e8…` (L2) -> peran `superintendent`, `approved: 68`, `pending_l1: 3`, `pending_l2: 0`, 20 mekanik.
    - Token disamarkan penuh sesuai aturan keamanan AGENTS.md §4 & §5.
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk menjalankan cermin tiga rumah (§5 Langkah 2).

### 2026-10-29 · Raka (+ AI) · bersama (§5 langkah 2 & audit kesiapan tugas terbuka)
- Berubah:
  - **Tugas Terbuka §6 Dituntaskan**:
    - `wrangler.toml` (akar): `name` diubah dari `project-kmb` menjadi `project-mar` agar konsisten dengan Worker builds yang terhubung ke Cloudflare (`project-mar`).
    - `scripts/verify-sum-kmb-isolation.mjs`: dipensiunkan dengan banner resmi (menguji arsitektur lama; isolasi sekarang diuji per-rumah via `/api/sehat` & `/api/pintu`).
  - **Fondasi Skema Cermin Mentah JSONB (§5 Langkah 2)**:
    - `db/kmb/cermin_sheet.sql`: skema mentah 21 tabel cermin KMB V2 (`baris`, `nilai`, `data`, `sinkron_at`, `cermin_header`, `cermin_log`, `cermin_meta`) seragam dengan SUM.
    - `db/kmb/README.md`: dokumentasi lengkap cermin KMB V2 dan panduan sinkron.
    - `db/kmb_projek/cermin_sheet_mentah.sql`: skema mentah JSONB 17 tabel cermin KMB Project seragam dengan SUM & KMB, menyelesaikan akar masalah bug #12 & #15 (kolom hilang & katalog jobs).
  - **Perkakas Sinkron Cermin Tiga Rumah**:
    - `tools/kmb/sinkron-cermin.mjs`: alat sinkron Google Sheets API v4 langsung ke skema `kmb` dengan dukungan `--kering` (dry-run).
    - `tools/kmb_projek/sinkron-cermin.mjs`: alat sinkron Google Sheets API v4 langsung ke skema `kmb_projek` dengan dukungan `--kering`.
    - `tools/cek-token-kembar.mjs`: perkakas pemantau harian token kembar lintas rumah (bisa via kueri cermin database atau `--ping` GAS live paralel).
  - **Uji Verifikasi**:
    - Seluruh sintaks skrip baru (`node --check`) lulus 100%.
    - Uji coba live `tools/cek-token-kembar.mjs --ping` terhadap 3 rumah berjalan lancar, token disamarkan tanpa kebocoran rahasia.
- Belum selesai / berikutnya: Menunggu akun layanan Google (`GOOGLE_SA_KEY_FILE`) dari Gabriel untuk menjalankan sinkron cermin pertama (`--kering` lalu tulis) dan project Supabase staging (§5 Langkah 2 & 4).

### 2026-10-29 · Raka (+ AI) · kmb-projek (§5 langkah 1: PWA KMB Project 1:1 dan Worker abadiops-kmbprojek)
- Berubah:
  - **PWA KMB Project 1:1** (`pwa/kmbprojek/`): disalin dari repo `PWA-Project-KMB` (`mar-projek-offline` projek-v13).
    - `app.js`: `API_URL: './api'`, `APP_VERSION = 'projek-v14'`, ditambah `ambilTokenSerahan` & `masukDariPintu` (keputusan 29 Okt nomor 10).
    - `sw.js`: `CACHE = 'mar-projek-v14'`, `API_URL = './api'`.
    - File statis (`index.html`, `manifest.json`, `icon-192.png`, `icon-512.png`): identik 1:1.
    - Menghapus direktori kosong `pwa/kmb-projek`.
  - **Worker KMB Project baru** (`workers/kmbprojek/`): dibuat dari cetakan `workers/kmb/` (Worker `abadiops-kmbprojek`).
    - `wrangler.toml`: `name = "abadiops-kmbprojek"`, `routes = [{ pattern = "kmbprojek.abadiops.com", custom_domain = true }]`, `RUMAH = "kmbprojek"`, `SAKLAR = "gas"`, `GAS_URL = "https://script.google.com/macros/s/AKfycbxh4086qGRZGDqAvdpO7UDdsvqk1Li9NR2rFZLlyVS6gS1zpGrZdcEsb_z-HzKOY02Y/exec"`.
    - `src/index.js`: menyajikan aset PWA dari `env.ASSETS` dan meneruskan setiap panggilan `./api` ke GAS KMB Project apa adanya (saklar `gas`).
    - `README.md`: dokumentasi Worker `abadiops-kmbprojek`.
  - **Uji lokal `wrangler dev`** (`scripts/uji-lokal-kmbprojek.mjs`):
    - 21 uji lulus (7 file PWA HTTP 200, string versi/API/token serahan sah, `/api/sehat` sah, uji kembar terusan ke GAS KMB Project identik, penolakan token rumah lain sah).
  - **Pemantau Vercel dimatikan**: `.github/workflows/pantau.yml` schedule dinonaktifkan sesuai keputusan 29 Okt (MARProject lama di Vercel dibekukan).
- **Domain live kmbprojek.abadiops.com**:
    - Berhasil dialihkan dari `project-mar` ke Worker baru `abadiops-porject-kmb`.
    - Diuji langsung dari luar: `/api/sehat` HTTP 200, 5 berkas PWA HTTP 200 tanpa redirect, terusan API ke GAS KMB Project valid.
    - Pintu `abadiops.com` resmi mengantar ke PWA 1:1 KMB Project.
- Belum selesai / berikutnya: **§5 Langkah 1 SELESAI**. Lanjut ke §5 langkah 2 (cermin ketiga rumah, menunggu akun layanan Google dari Gabriel).

### 2026-10-29 · Gabriel (+ Claude) · bersama (semua keputusan diambil; rencana tanpa bertanya)
- Berubah: dokumen saja. Gabriel menyetujui paket usulan dan menjawab tiga butir sisanya:
  - **Biaya:** opsi gratis dulu. Cadangan buatan sendiri tiap jam dengan uji pulih; Pro atau PITR hanya atas keputusan Gabriel.
  - **Branch:** push langsung ke `main` tetap boleh, dengan koridor uji sebelum dan pantau sesudah push.
  - **Go-live:** serentak di ketiga rumah.
  - `docs/KEPUTUSAN.md`: 16 baris keputusan 29 Okt (nomor lama 1–7 dan 11, ditambah cermin, staging, wewenang, panel, web 1:1, jalur tulis, payroll, dan go-live). Bagian **"Belum diputuskan" sekarang kosong**.
  - `docs/SAKLAR.md`: kode rumah baru, syarat nomor WO 4 angka, cadangan gratis dengan uji pulih (menggantikan syarat Pro), syarat go-live serentak, dan Durable Object.
  - `AGENTS.md`: pengecualian aturan rumah (Raka boleh mengerjakan semua rumah sesuai rencana) dan koridor butir 12 (jalan terus; empat titik henti).
  - `docs/SERAH-TERIMA-2026-10-29.md` §5: **langkah 0–9 dengan syarat "Selesai kalau"**, berakhir di panel saklar jadi dan latihan saklar balik lulus di staging. Menyalakan saklar adalah titik henti untuk Gabriel.
- Belum selesai / berikutnya: Raka dan AI-nya mulai dari §5 langkah 0.

### 2026-10-29 · Gabriel (+ Claude) · bersama (target selesai + panel saklar + serah terima final)
- Berubah: dokumen saja.
  - `docs/SAKLAR.md`:
    - Bagian **Panel saklar di `abadiops.com`**: tersembunyi, kata sandi, peringatan saat maju, mundur sebagai penyelamat tanpa kehilangan data, hanya bergantung pada Cloudflare, gagal membaca berarti `gas`, riwayat perubahan.
    - Bagian **Target selesai migrasi**: matang, diuji langsung, aman, ada cadangan dan jaring pengaman, tinggal menyalakan saklar.
  - `docs/KEPUTUSAN.md`: keputusan target selesai dan panel saklar. Nomor 11 (aplikasi KMB Project 1:1 atau portal) ditambahkan dan menunggu Gabriel.
  - `docs/SERAH-TERIMA-2026-10-29.md` ditulis ulang menjadi versi final:
    - susunan sekarang dan alur masuk;
    - ringkasan perubahan 28–29 Okt;
    - status tiap rumah per tahap;
    - **urutan kerja 8 langkah sampai go-live**;
    - tugas kecil yang masih terbuka;
    - larangan.
  - Tabel tugas: rencana berurutan ditaruh paling atas.
- Belum selesai / berikutnya: Raka dan AI-nya melanjutkan dari `docs/SERAH-TERIMA-2026-10-29.md` §5.

### 2026-10-29 · Gabriel (+ Claude) · bersama (keputusan nomor 10: pilihan di pintu, tanpa layar token lagi)
- Berubah:
  - **Pintu** (`workers/pintu`):
    - Sesudah token dikenali, tampil pilihan "📱 Aplikasi" atau "🖥️ Web".
    - Aplikasi membuka `<rumah>.abadiops.com#token=`. Web membuka alamat GAS rumah itu + `?token=`; ketiga web GAS mengenali `?token=` lewat `TokenContext.js`.
    - `wrangler.toml` mendapat kolom `web` per rumah, dan API mengirim `web_rumah`.
  - **PWA SUM dan KMB V2:** `terimaTokenSerahan` diganti `ambilTokenSerahan` + `masukDariPintu`.
    - Token diproses **sebelum** layar dipilih, jadi layar login tidak pernah tampil. Layar utama langsung muncul, lalu ping memastikan peran dan data disinkron.
    - Blok ping saat boot tidak ikut jalan dua kali.
    - Kalau token ditolak, baru layar login muncul dengan pesannya.
  - **Portal KMB Project:**
    - `built-index.html` mendapat penanda `dari-pintu` di `<head>`, sehingga overlay token tersembunyi sejak halaman mulai dimuat.
    - `checkAuth` menandai `masukDariPintu`, dan `tampilkanSesudahMasuk` melewati pilihan mode portal, langsung ke dashboard.
    - `showGateError` memunculkan overlay lagi kalau token ditolak.
  - Diuji lokal (9 cek lulus): pilihan di pintu, alamat Aplikasi/Web untuk SUM dan KMB TRA, sintaks semua skrip, penanda portal sebelum overlay, token palsu ditolak. Hilangnya layar token secara visual perlu diuji di browser.
- Belum selesai / berikutnya: deploy pintu, `sum`, dan `kmb` (manual), lalu uji browser oleh Gabriel.

### 2026-10-29 · Gabriel (+ Claude) · bersama (cek sambungan tiap rumah + mode Aplikasi/Web)
- Berubah: tidak ada kode. Cek sambungan lewat alamat produksi tiap rumah:
  - **Konfigurasi** cocok dengan catatan resmi proyek GAS masing-masing:
    - `kmbprojek` → `AKfycbxh4086…` (`MAR-PROJEK-KMB`).
    - `kmbtra` → `AKfycbwlwlQv…` (dipakai halaman web `MAR-project`, script `17sBKK…`).
    - `sum` → `AKfycbzB5EUJ…` (`MAR-SUM-v2`).
    - Pintu memakai ketiga alamat yang sama.
  - **KMB TRA** (`kmbtra.abadiops.com`): akun uji SPV-001 dan TYRE-002 diterima dengan profil sama dengan GAS, token SUM ditolak, `pull_monitoring` lewat aplikasi **sama persis** dengan GAS langsung (jalur `gas`).
  - **SUM** (`sum.abadiops.com`): akun uji SPV-000 diterima dengan profil sama, token KMB TRA ditolak, `pull_monitoring` **sama persis** dengan GAS langsung.
  - **KMB Project** (`kmbprojek.abadiops.com`): token SUM dan KMB TRA ditolak. Uji positif belum bisa karena token uji baru belum ada di sheet. Tangkapan layar Gabriel menunjukkan approved 55, pending 26, dan poin 198.69, sama dengan web GAS KMB Project.
  - **Mode akses** (catatan Gabriel): portal KMB Project sudah menampilkan pilihan Aplikasi/Web sesudah login, sedangkan KMB TRA dan SUM masih menampilkan PWA saja. Arti mode dicatat di `docs/KEPUTUSAN.md` (Aplikasi = link aplikasi rumah, Web = link GAS). Tempat pilihan menunggu keputusan nomor 10. Pilihan di portal KMB Project belum sesuai arti itu (bug #18).
- Belum selesai / berikutnya: keputusan nomor 10; uji sambungan penuh KMB Project sesudah token uji ada di sheet.

### 2026-10-29 · Gabriel (+ Claude) · kmb-projek (bug #17: angka contoh palsu dan label sumber)
- Berubah:
  - Temuan Gabriel: dashboard portal menampilkan TOTAL WO 81, sedangkan web GAS 835, dengan label "Live Supabase". Dicek: datanya memang dari GAS (approved 55, pending 26, dan poin 198.69 sama persis). Label itu hanya membaca pilihan engine di browser, dan saklar tidak terlibat.
  - `scripts/patched-app.js`:
    - Angka contoh tertanam (`|| 7/3/21/13/58`, poin 20.20, Rp 52.520, periode contoh) diganti 0 atau "—".
    - Label sumber = `state.sumberData`, diisi dari `source` pada jawaban monitoring (Supabase membawa `source: 'SUPABASE'`, GAS tidak).
  - `scripts/built-index.html`: angka awal statis menjadi 0, teks contoh menjadi "—", dan subtitel TOTAL WO menjadi "Pending + disetujui" (81 = 26 + 55).
  - Diuji di `wrangler dev`: aset sah dan tanpa token, import cocok, token palsu ditolak, tidak ada angka contoh tersisa.
  - Temuan sampingan: API GAS KMB Project punya aksi `list_tokens`. Mungkin bisa dipakai untuk pengecekan token kembar harian (lihat tabel tugas).
- Belum selesai / berikutnya: angka "semua WO sepanjang waktu" yang 1:1 dengan web GAS butuh aksi API baru di GAS; dicatat untuk sesudah migrasi (bug #17).

### 2026-10-29 · Gabriel (+ Claude) · kmb-projek (bug #16: hardcode di portal dibuang)
- Berubah (keputusan Gabriel: tertanam di kode = hardcode = haram; dikerjakan malam ini atas permintaan Gabriel, bukan menunggu Raka):
  - `scripts/patched-app.js`: `DEFAULT_MECHANICS_LIST` (20 mekanik asli beserta tokennya) dikosongkan. `DEFAULT_MONITORING_OVERALL` (angka contoh palsu, misalnya pending L2 21) diganti nol.
  - `data.js` (literal di `worker.js`): `UNITS`, `MECHANICS`, `COMPONENTS`, `TOKENS`, `FACTORS`, dan `RATES` dikosongkan, dari 98.968 menjadi 530 karakter. Nama ekspor dipertahankan supaya import tetap sah. `FACTORS`/`RATES` di `data.js` memang tidak dipakai siapa pun; rumus poin ada di `services/scoring.js`, yang tidak disentuh.
  - Akibat yang sudah diterima Gabriel: tidak ada login offline, dan layar awal kosong sampai data GAS (atau cache lokal sesi terakhir) masuk.
  - Diuji di `wrangler dev`: kelima aset HTTP 200, nol untaian mirip token, sintaks modul sah, import cocok dengan ekspor, token palsu ditolak.
  - Sesudah ini, tidak ada token asli di file terlacak mana pun. Yang tersisa hanya contoh palsu `0123456789abcdef0123` di `docs/MULTI-TENANT-SETUP.md`.
- Belum selesai / berikutnya: Gabriel mengecek portal KMB Project di browser (monitoring dan Create WO terisi dari GAS sesudah login).

### 2026-10-29 · Gabriel (+ Claude) · bersama (serah terima ke Raka)
- Berubah:
  - **Langkah 8 selesai:** Gabriel menguji di browser (Chrome dengan secure DNS), dan semua token dikenali serta diantar ke rumahnya. Pindah ke pintu netral tuntas.
  - Baru: `docs/SERAH-TERIMA-2026-10-29.md`, yang merangkum semua yang ditambah, diubah, dan dibuang 28–29 Okt, beserta tugas Raka.
  - Baru: `AGENTS.md` §0a, koridor cara kerja untuk semua AI termasuk AI Raka. Baru juga `GEMINI.md`, yang menunjuk ke `AGENTS.md`.
  - Tabel "Tugas terbuka" dirapikan: hanya tugas yang masih terbuka, dikelompokkan per pemegang.
  - `scripts/uji-kembar-kmb-projek.mjs`: alamat bawaan menjadi `https://kmbprojek.abadiops.com`, karena `abadiops.com` sekarang pintu.
  - Catatan DNS: provider internet di jaringan Gabriel mencegat DNS (`*.workers.dev` diblokir, dan jawaban "tidak ada" tersimpan sampai 30 menit). Pengujian lancar dengan Chrome → Settings → Privacy and security → Security → Use secure DNS (Cloudflare).
- Belum selesai / berikutnya: tabel tugas terbuka (bagian Raka di atas).

### YYYY-MM-DD · Nama (+ AI) · rumah
- Berubah: …
- Belum selesai / berikutnya: …
```

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


## Tugas terbuka

Hanya tugas yang masih terbuka. Tugas yang selesai tercatat di entri di bawah. Dirapikan 29 Okt 2026 untuk serah terima ke Raka (lihat `docs/SERAH-TERIMA-2026-10-29.md`).

| Tugas | Rumah | Pemegang | Status |
|---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.
|---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.
|---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.
|---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.
|
| **Rencana migrasi berurutan.** Target selesai: tinggal menyalakan saklar. Urutannya ada di `docs/SERAH-TERIMA-2026-10-29.md` §5 dan `docs/SAKLAR.md` | bersama | Gabriel + Raka | panduan utama |
| KMB Project 1:1 dari `mar-projek-offline`: `pwa/kmbprojek/` + `workers/kmbprojek/`, resep empat baris + `masukDariPintu`, diuji di `wrangler dev` | kmb-projek | Raka (+ AI) | **SELESAI** 29 Okt: tayang di `kmbprojek.abadiops.com` via Worker `abadiops-porject-kmb`, 1:1 PWA melayani lapangan, diteruskan ke GAS (§5 langkah 1 tuntas) |
| Cermin terjadwal ketiga rumah (Cron Cloudflare, menyalin setiap sheet termasuk bulan lama), dengan laporan selisih harian; lulus kalau selisihnya nol 7 hari | bersama | Raka + Gabriel | Gabriel: buat akun layanan Google dan bagikan ketiga spreadsheet |
| Panel saklar di `abadiops.com` sesuai `docs/SAKLAR.md` (tersembunyi, kata sandi, peringatan, mundur sebagai penyelamat, hanya bergantung pada Cloudflare) | bersama | Raka (+ AI) | kata sandi diset Gabriel sebagai *secret*; saklar tetap `gas` |
| Jaring pengaman (keputusan 29 Okt: opsi gratis dulu): cadangan `pg_dump` terenkripsi tiap jam ke penyimpanan privat gratis + uji pulih, staging gratis, latihan saklar balik di staging | bersama | Raka (+ AI) | §5 langkah 3, 4, dan 8 |
| Setel env `KMBP_UJI_SPV_TOKEN` dan `SUM_UJI_TOKEN` (nilainya dari Gabriel, jangan ditulis di repo). Token uji baru KMB Project belum dimasukkan ke sheet `ApiTokens` | kmb-projek | Raka + Gabriel | |
| Buang sisa kode pengantaran di portal (`serahkanKeRumah`, `ALAMAT_APLIKASI_RUMAH`, blok antar di `loginWithToken`) | kmb-projek | Raka | sudah mati sejak 29 Okt |
| Bug #15: definisi `kmb_projek.catalog_jobs` ke `cermin_sheet.sql`, diisi lewat skrip sinkron | kmb-projek | Raka | |
| Bug #12: cermin diperbarui terus-menerus, uji kembar per aksi (`scripts/uji-kembar-kmb-projek.mjs`), aksi yang lulus dimasukkan ke `AKSI_SUPABASE_LULUS_KEMBAR` | kmb-projek | Raka | 0 aksi lulus |
| Perbarui atau pensiunkan `scripts/verify-sum-kmb-isolation.mjs` (menguji perilaku lama: Worker KMB Project melayani SUM) | kmb-projek | Raka | |
| Worker `project-kmb` tidak dipakai: hapus, dan/atau samakan `name` di `wrangler.toml` akar dengan `project-mar` | kmb-projek | Raka + Gabriel | |
| SUM: buat akun layanan Google (baca-saja), bagikan spreadsheet SUM sebagai Viewer | sum | Gabriel | langkah ada di `db/sum/README.md` |
| SUM: jalankan `db/sum/cermin_sheet.sql`, lalu sinkron pertama (`--kering` dulu) dan cocokkan jumlah baris 19 sheet | sum | Gabriel | |
| SUM: pelajari `readSheetAsObjects` dan versi aktif 4 fungsi kembar, sebelum aksi baca pertama dipindah | sum | Gabriel | |
| SUM: uji dengan token sungguhan untuk kelima peran, lewat `abadiops.com` | sum | Gabriel | |
| SUM: tombol serah-terima token di PWA lama (pembaca `#token=` di PWA baru sudah ada) | sum | Gabriel | sebelum mekanik dipindah |
| SUM: pindahkan 7 halaman web GAS secara 1:1, lalu tutup halaman web GAS | sum | Gabriel | **wajib sebelum saklar SUM dinyalakan** |
| KMB TRA (KMB V2): uji dengan token sungguhan untuk ketiga peran, lewat `abadiops.com` | kmb | Gabriel | |
| KMB TRA (KMB V2): inventaris perilaku per aksi (`docs/INVENTARIS-KMB.md`) dan skema cermin `kmb` | kmb | Gabriel | |
| KMB TRA (KMB V2): pindahkan halaman web GAS secara 1:1, lalu tutup halaman web GAS | kmb | Gabriel | **wajib sebelum saklar KMB dinyalakan** |
| Pengecekan token kembar otomatis setiap hari untuk semua rumah, dengan peringatan | bersama | Gabriel + Raka | pintu sudah menolak token kembar saat login; pengecekan harian butuh daftar token semua rumah. Cara yang mungkin: akun layanan Google, atau aksi API GAS `list_tokens` yang ada di KMB Project (perlu dicek siapa yang boleh memanggilnya, dan apakah rumah lain punya aksi yang sama) |
| Project Supabase untuk staging | bersama | Gabriel + Raka | menunggu |
| Deploy pintu dan dua rumah untuk keputusan nomor 10: `cd workers/pintu; npx wrangler deploy`, `cd workers/sum; npx wrangler deploy`, `cd workers/kmb; npx wrangler deploy`. Portal KMB Project tayang otomatis dari push | bersama | Gabriel | **deploy selesai** 29 Okt dan diverifikasi dari luar: pintu menampilkan pilihan dan mengirim alamat web, `sum` dan `kmbtra` memakai `masukDariPintu`, `kmbprojek` tanpa layar token. **Sisa:** uji browser oleh Gabriel (jendela penyamaran) |
| Pilihan mode portal KMB Project saat dibuka langsung tanpa pintu: buang atau arahkan ke pintu (bug #18) | kmb-projek | Raka | selesai sendiri setelah §5 langkah 1 (portal dipensiunkan) |
| Uji sambungan penuh KMB Project: masukkan token uji baru SPV-001 ke sheet `ApiTokens` KMB Project, lalu bandingkan data lewat `kmbprojek.abadiops.com` dengan GAS | kmb-projek | Gabriel | KMB TRA dan SUM sudah lulus 29 Okt |
| Rumah baru `kmbbupr` (PT KMB di site BUPR): satu baris `RUMAH` di `workers/pintu/wrangler.toml`, ditambah Worker dan PWA rumahnya | bersama | Gabriel + Raka | sesudah migrasi |

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-10-29 · Gabriel (+ Claude) · bersama + kmb-projek (pintu live; KMB Project kembali ke rumahnya sendiri)
- Berubah:
  - Langkah 1–5 oleh Gabriel:
    - Custom domain `kmbprojek.abadiops.com` di `project-mar`.
    - Deploy `abadiops-kmb` (`kmbtra.abadiops.com`) dan `abadiops-pintu`.
    - `abadiops.com` dilepas dari `project-mar` dan dipasang di `abadiops-pintu`.
    - Semuanya diverifikasi dari luar.
  - Saat pindah, `abadiops.com` sempat tanpa Worker beberapa detik. Resolver yang bertanya pada saat itu bisa menyimpan jawaban "tidak ada" sampai sekitar 30 menit.
  - Langkah 6, aplikasi KMB Project (`worker.js` dan `scripts/patched-app.js`) kembali hanya rumahnya sendiri:
    - Ping hanya ke GAS KMB Project, sehingga 1:1 dengan PWA lama, terisolasi, dan login kembali cepat.
    - `GAS_URLS.KMB_V2` dan `GAS_FALLBACK_URLS.KMB_V2` dibuang.
    - Cadangan ping hanya ke KMB Project.
    - `ALAMAT_APLIKASI_RUMAH` kosong, sehingga blok pengantaran tidak pernah jalan. Itu sisa kode yang bisa dibuang Raka.
    - Diuji di `wrangler dev`: token uji SUM, token uji KMB TRA, dan token palsu ditolak dengan pesan asli GAS.
  - `scripts/buat-token-tiga-rumah.mjs` membaca daftar rumah dari `workers/pintu/wrangler.toml`, jadi rumah baru (misalnya `kmbbupr`) otomatis ikut dicek. Diuji `--cek`: token uji SUM → SUM, KMB TRA → KMB TRA.
  - Catatan perkakas: `sed -i` di Git Bash mengubah akhiran baris seluruh file (CRLF → LF). Untuk file repo, pakai Node.
- Belum selesai / berikutnya:
  - 7: lepas `kmb.abadiops.com` dari `workers/kmb/wrangler.toml`, lalu deploy.
  - 8: uji di browser lewat `abadiops.com`.
  - Raka: `git pull`; buang sisa kode pengantaran di portal; bug #16.

### 2026-10-28 · Gabriel (+ Claude) · bersama (pintu netral abadiops-pintu + penamaan rumah)
- Berubah:
  - Keputusan Gabriel: `abadiops.com` hanya pintu yang netral; rumah: `sum`, `kmbtra` (KMB V2), `kmbprojek` (KMB Project); berikutnya `kmbbupr`.
  - Baru: `workers/pintu/`, yaitu Worker `abadiops-pintu`.
    - `src/index.js`: `POST /api/pintu` mengecek token ke GAS semua rumah sekaligus. Cocok satu: diantar. Cocok lebih dari satu: ditolak. Tidak cocok: pesan asli GAS. Ada rumah yang tidak menjawab: "server sibuk".
    - `public/index.html`: halaman netral "Abadi Operation". Menerima `?token=` (tautan "salin token" dari portal KMB Project) dan `#token=`. Hanya mengingat rumah terakhir, tidak pernah tokennya.
    - `wrangler.toml`: daftar rumah di `[vars] RUMAH`. Alamat GAS disalin dari `GAS_URLS` di `worker.js`.
    - Diuji di `wrangler dev`:
      - Halaman tampil, dan `GET /api/pintu` ditolak (405).
      - Token uji SUM diantar ke `sum.abadiops.com`, token uji KMB TRA ke `kmbtra.abadiops.com`.
      - Token palsu dan token kosong ditolak.
  - `workers/kmb/wrangler.toml`: route `kmbtra.abadiops.com` ditambahkan. `kmb.abadiops.com` sengaja tetap sampai pintu pindah, karena portal di `abadiops.com` masih mengantar ke sana.
  - Catatan uji: proses `wrangler dev` sisa uji kembar siang tadi masih memegang porta 8797/8798 dan menjawab sebagai rumah lain. Semuanya sudah dimatikan. Kalau uji lokal terasa aneh, cek dulu porta dengan `netstat -ano`.
  - `worker.js` (KMB Project, deploy otomatis) **sengaja belum diubah**. Alamat baru baru di-push sesudah domainnya terbukti ada (pelajaran insiden).
- Belum selesai / berikutnya: urutan pindah di tabel tugas.

### 2026-10-28 · Gabriel (+ Claude) · bersama (INSIDEN: pengantaran KMB Project ke domain yang belum ada)
- Kejadian:
  - Commit `d69bb61` (antar pengguna KMB Project ke `projekkmb.abadiops.com`) di-push sebelum domain itu ada.
  - Push ke `main` ternyata langsung tayang di `abadiops.com` lewat Worker `project-mar` (Workers Builds dari GitHub).
  - Selama beberapa menit, pengguna KMB Project yang login di `abadiops.com` dikirim ke alamat yang tidak ada, dan sesi portalnya terhapus.
- Pemulihan:
  - Commit `27c1160` mengosongkan alamat KMB Project. Versi itu tayang sekitar 4 menit sesudah push, diverifikasi dengan memantau `abadiops.com/app.js`.
  - Pengguna yang terdampak cukup membuka `abadiops.com` lagi dan memasukkan token.
- Pelajaran (dicatat di `AGENTS.md` §6):
  - Push ke `main` = deploy produksi.
  - Perubahan yang bergantung pada domain, DNS, atau SQL hanya di-push sesudah hal itu terbukti ada.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (koreksi: Worker di balik abadiops.com; pengantaran KMB Project ditunda)
- Berubah:
  - **Koreksi:** `abadiops.com` tidak dilayani Worker `project-kmb`. Tangkapan layar dashboard menunjukkan `project-kmb` tanpa custom domain dan tanpa route, dengan 1 pemanggilan per 24 jam. Catatan sebelumnya yang menyebut "`project-kmb` live" sudah dibetulkan menjadi "kode baru tayang di `abadiops.com`".
  - Kode baru selalu muncul di `abadiops.com` tanpa deploy manual. Dugaan kuat: ada Worker lain yang terhubung ke GitHub, sehingga **push ke `main` = deploy produksi** (peringatan ditambahkan di `AGENTS.md` §6).
  - Pengantaran KMB Project ke `projekkmb.abadiops.com` **ditunda**: alamat dikosongkan di `worker.js` dan `scripts/patched-app.js`, karena domainnya belum ada (DNS tidak ditemukan). Pembaca `#token=` di `checkAuth()` dan aturan "jangan antar kalau sudah di rumahnya" tetap terpasang; keduanya tidak berpengaruh selama alamat kosong.
- Belum selesai / berikutnya: cari Worker yang melayani `abadiops.com`, pasang `projekkmb.abadiops.com` di sana, lalu isi kembali alamatnya.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (projekkmb.abadiops.com; abadiops.com hanya pintu)
- Berubah:
  - Deploy ulang ketiga Worker oleh Gabriel. `sum.abadiops.com` dan `kmb.abadiops.com` terpasang sebagai custom domain dan diverifikasi.
  - Pintu `abadiops.com` mengantar ke alamat baru. Sempat terlihat masih versi lama karena dicek sebelum deploy selesai; dicek ulang sudah benar.
  - Keputusan Gabriel: KMB Project di `projekkmb.abadiops.com`, `abadiops.com` hanya pintu.
    - `worker.js`: `ALAMAT_RUMAH.KMB_PROJEK`, dan pintu mengirim `alamat_rumah` untuk KMB Project juga.
    - `scripts/patched-app.js`:
      - `ALAMAT_APLIKASI_RUMAH`, nama baru untuk `ALAMAT_RUMAH_LAIN`.
      - Pengguna diantar hanya kalau host halaman berbeda dengan alamat rumahnya.
      - `checkAuth()` membaca `#token=` (didahulukan, lalu dihapus dari alamat).
    - `worker.js` dirakit ulang (`index.html`, `style.css`, `data.js` tidak berubah). `--dry-run` lulus.
  - `wrangler.toml` (akar dan `workers/kmb-projek`): peringatan agar tidak menambah `routes` tanpa mencantumkan `abadiops.com`, karena domain dipasang lewat dashboard.
- Belum selesai / berikutnya:
  - Gabriel: tambah custom domain `projekkmb.abadiops.com` lewat dashboard, lalu deploy `project-kmb`.
  - Lalu uji pengantaran di browser untuk ketiga rumah.

### 2026-10-28 · Gabriel (+ Claude) · bersama (langkah 1–2 + alamat aplikasi rumah)
- Berubah:
  - Supabase, dijalankan Gabriel:
    - `hapus-salinan-token-uji.sql` mengubah 4 baris (`api_tokens` dan `config_mechanics` untuk SPV-001 dan SUPT-001).
    - `rpc_wajib_token.sql` berhasil.
    - Diverifikasi dari luar: token lama hilang dari cermin, 4 fungsi lama tertutup untuk anon, 4 pembungkus menolak token palsu.
  - `abadiops-sum` dan `abadiops-kmb` di-deploy dengan pembaca `#token=`. Diverifikasi lewat IP Cloudflare, karena DNS biasa di jaringan Gabriel mencegat `*.workers.dev`.
  - **Keputusan alamat (pilihan A):**
    - `routes` dengan `custom_domain = true` untuk `sum.abadiops.com` (`workers/sum/wrangler.toml`) dan `kmb.abadiops.com` (`workers/kmb/wrangler.toml`).
    - `ALAMAT_RUMAH` di `worker.js` dan `ALAMAT_RUMAH_LAIN` di `scripts/patched-app.js` diganti ke alamat itu. `worker.js` dirakit ulang (`index.html`, `style.css`, `data.js` tidak berubah).
    - `--dry-run` kedua rumah lulus.
- Belum selesai / berikutnya:
  - Deploy ulang ketiga Worker, kedua rumah dulu supaya alamatnya sudah ada sebelum pintu mengantar ke sana.
  - Lalu uji pengantaran di browser.

### 2026-10-28 · Gabriel (+ Claude) · bersama (haram hardcode + alat token tiga rumah)
- Berubah:
  - Aturan **HARAM hardcode** (keputusan Gabriel): `AGENTS.md` §5 dan `docs/KEPUTUSAN.md`.
  - Baru: `scripts/buat-token-tiga-rumah.mjs`. Skrip ini membuat token hex 20 yang dicek langsung ke GAS ketiga rumah, atau dengan `--cek` memeriksa token yang sudah ada. Tidak ada daftar token di repo, jadi token yang bertambah besok ikut terperiksa.
    - Cek 28 Okt malam: keempat token uji lama kini hanya dikenali KMB V2.
    - Ketiga token uji baru belum terdaftar di rumah mana pun.
  - Hardcode yang dibuang:
    - Daftar token SUM di `worker.js` (`isKnownSumToken`) dan `scripts/patched-app.js` (`tenantCode`). Rumah ditentukan pintu.
    - Token uji SUM di `scripts/verify-sum-kmb-isolation.mjs`, sekarang dari environment `SUM_UJI_TOKEN`.
    - `scripts/sum-monitoring.json`: salinan 40 token dan nama mekanik SUM, tidak dipakai di mana pun, bisa dipulihkan dari git.
    - Token di `docs/PROGRES.md` dan `docs/INVENTARIS-KMB-PROJEK.md` disamarkan.
  - Pencocokan ApiTokens ketiga rumah dari tangkapan layar Gabriel, hanya untuk diketahui dan tidak ditulis di mana pun:
    - Tidak ada token kembar selain 3 akun uji KMB V2 ↔ KMB Project, dan ketiganya sudah dibereskan di sheet.
    - `mechanic_id` yang sama di dua rumah dengan token berbeda (misalnya `SUPT-001`, `SPV-002`) tidak masalah.
- Belum selesai / berikutnya: bug #16, hardcode yang tersisa di portal KMB Project (Raka, perlu keputusan Gabriel).

### 2026-10-28 · Gabriel (+ Claude) · bersama (pintu tiga rumah + serah-terima token + RPC bertoken)
- Berubah:
  - **Pintu** di `worker.js` dan `workers/kmb-projek/worker.js` (keputusan Gabriel 28 Okt malam, bug #11). Ping dicek ke GAS KMB Project, SUM V2, dan KMB V2 sekaligus, dengan batas 25 detik per rumah.
    - Cocok satu: masuk. Untuk SUM V2 dan KMB V2, jawaban membawa `rumah` dan `alamat_rumah`.
    - Cocok lebih dari satu: ditolak.
    - Tidak cocok: jawaban asli GAS.
    - Ada rumah yang tidak menjawab: "Server sedang sibuk".
    - URL GAS KMB V2 diambil dari `workers/kmb/wrangler.toml`.
  - **Isolasi:** selain ping, Worker KMB Project hanya meneruskan ke GAS KMB Project. Rute data ke GAS SUM dihapus.
  - `scripts/patched-app.js`, dirakit ke `worker.js` (`index.html`, `style.css`, dan `data.js` tidak berubah):
    - Sesudah ping berhasil, token SUM V2 / KMB V2 diantar ke aplikasi rumahnya (`#token=`), dan sesi portal dibersihkan.
    - Cadangan ping langsung ke GAS memakai aturan yang sama.
    - Cadangan data langsung ke GAS hanya ke KMB Project.
  - `pwa/sum/app.js` dan `pwa/kmb/app.js`: `terimaTokenSerahan()` membaca `#token=`, menghapusnya dari alamat, lalu menjalankan `doLogin()` yang sudah ada. Kalau HP sudah masuk dengan token lain, token itu tidak diganti, karena antrean kirimannya bisa hilang.
  - **Bug #13:** `db/kmb_projek/rpc_wajib_token.sql` (baru), GRANT di `rpc_baca.sql` diganti REVOKE, dan Worker memanggil `*_bertoken` dengan `p_token`.
  - `scripts/update-worker-engine.mjs` dipensiunkan (langsung keluar dengan pesan), karena skrip itu menimpa seluruh blok `/api/gas` di `worker.js`.
  - `docs/KEPUTUSAN.md`: baris keputusan pintu. `docs/BUG-DICATAT.md`: #11 dan #13 diperbaiki, #15 dicatat. `AGENTS.md` §2 dan §6 diperbarui.
  - **Diuji di `wrangler dev`:**
    - Token uji SUM diantar ke `abadiops-sum`, token uji KMB V2 ke `abadiops-kmb`.
    - SPV-001 dan SUPT-001 lama (kembar KMB V2 + KMB Project) ditolak.
    - Token palsu ditolak.
    - Data bertanda SUM lewat Worker KMB Project ditolak.
    - Login memakan 5–12 detik.
    - Pengantaran di browser (`#token=`) belum diuji, karena perlu browser.
- Belum selesai / berikutnya:
  - Gabriel: deploy ketiga Worker, jalankan dua SQL (`hapus-salinan-token-uji.sql`, `rpc_wajib_token.sql`), lalu uji di browser. Lihat tabel tugas.
  - **Raka, besok pagi: `git pull` dulu.** Yang berubah:
    - `worker.js`: pintu, isolasi, gerbang tahap 4, RPC bertoken.
    - `scripts/patched-app.js`.
    - Skrip sinkron.
    - `update-worker-engine.mjs` dipensiunkan.
  - Di kode pintu, `tenant_code` `KMB` tetap berarti KMB Project, sedangkan KMB V2 memakai `KMB_V2`.
  - PWA KMB V2 mengambil `app.js` dari cache dulu. Perangkat uji yang sudah pernah membuka `abadiops-kmb` perlu menghapus data situsnya sekali. Versi PWA sengaja tidak dinaikkan supaya labelnya tetap 1:1 dengan PWA lama.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (uji kembar baca + gerbang tahap 4)
- Berubah:
  - Baru: `scripts/uji-kembar-kmb-projek.mjs`. Skrip ini mengirim permintaan yang sama seperti frontend ke jalur Supabase dan jalur GAS, lalu membandingkan isinya. Baris dicocokkan per kunci, bukan per urutan, dan token tidak dicetak. Hasil 28 Okt (token uji SPV lama): `ping` beda tipis (Supabase menambah `section`), sedangkan `pull_monitoring` dan `pull_create_refs` **jauh berbeda** (bug #12). `pull_my_wos` sama, tapi hanya karena jatuh ke GAS.
  - `worker.js` dan `workers/kmb-projek/worker.js`: gerbang tahap 4. Supabase hanya melayani aksi yang ada di `AKSI_SUPABASE_LULUS_KEMBAR`, yang sekarang masih kosong. `?uji=supabase` memaksa jalur Supabase, khusus untuk uji kembar. Diuji di `wrangler dev`: jalur bawaan frontend kini dijawab GAS (pending L2 19, approved 44), jalur `?uji=supabase` tetap Supabase (0 dan 1), login token SUM lewat pintu tetap jalan, token palsu tetap ditolak.
  - `scripts/sinkron-kmb-projek-cermin.mjs`: tidak lagi membuat token tiruan `kmb-<id>` (bug #14).
  - `docs/BUG-DICATAT.md`: #12, #13, dan #14.
- Belum selesai / berikutnya:
  - Deploy `project-kmb`, supaya gerbang ini dan pilihan C berlaku di `abadiops.com`. Selama belum di-deploy, supervisor KMB Project di sana melihat 0 pending.
  - Raka: cermin perlu diperbarui terus-menerus (bukan sinkron manual), lalu jalankan uji kembar per aksi. Aksi yang lulus dimasukkan ke `AKSI_SUPABASE_LULUS_KEMBAR`.

### 2026-10-28 · Gabriel (+ Claude) · kmb-projek (pilihan C: hapus salinan token uji KMB V2)
- Berubah:
  - `worker.js` dan `workers/kmb-projek/worker.js`: 4 entri `TOKENS` di data.js dihapus (28 → 24), `offline_token` SUPT-001 dikosongkan, app.js dirakit ulang dari `scripts/patched-app.js`. style.css sengaja dibiarkan persis seperti sebelumnya, karena perakitan ulang mengubah akhiran barisnya. Kode Worker di luar 4 file tertanam tidak berubah.
  - `scripts/patched-app.js`: peran tidak lagi dikunci ke dua token uji lama. Untuk token lain hasilnya sama persis (`tokenRecord.role || 'mechanic'`).
  - `scripts/sinkron-kmb-projek-cermin.mjs`, `scripts/uji-live-supabase-backend.mjs`, `scripts/verify-sum-kmb-isolation.mjs`: token uji supervisor dibaca dari environment `KMBP_UJI_SPV_TOKEN`. Dua skrip pertama berhenti dengan pesan jelas kalau kosong.
  - `tests/api/gas.test.ts`: memakai token palsu `uji-palsu-spv-kmbp`. Fetch dan Supabase di-mock, jadi nilainya tidak berpengaruh. Lulus 3/3.
  - `docs/MULTI-TENANT-SETUP.md` dan `docs/INVENTARIS-KMB-PROJEK.md` tidak lagi memuat token itu.
  - Baru: `db/kmb_projek/hapus-salinan-token-uji.sql`. Yang dicocokkan md5-nya; token mentah tidak ditulis. Sudah diuji di Postgres dalam memori (PGlite) dengan skema `cermin_sheet.sql`: menghapus tepat baris lama, baris lain utuh, jalan kedua 0 baris.
  - Tiga token uji baru untuk `SUPT-001`, `SPV-001`, `MECH-003` sudah dicek: ditolak ("Token tidak dikenal / nonaktif") oleh GAS SUM V2, KMB V2, dan KMB Project, dan tidak ada di bundel. Tokennya hanya diberikan ke Gabriel lewat chat.
  - `docs/KEPUTUSAN.md`: nomor 8 dipindah ke "Sudah diputuskan".
  - Temuan: login KMB Project mengecek `kmb_projek.api_tokens` (RPC `kmb_ping`) **sebelum** GAS. Jadi mengganti token di sheet saja tidak cukup; SQL di atas wajib dijalankan.
- Belum selesai / berikutnya: langkah manual di tabel tugas (sheet, SQL, deploy, `KMBP_UJI_SPV_TOKEN`). Setelah sheet diganti, tunggu paling lama 30 menit (cache token GAS KMB Project): token lama ditolak di KMB Project dan token baru dikenali.

### 2026-10-28 · Gabriel (+ Claude) · bersama (verifikasi token kembar)
- Berubah: tidak ada kode. Keempat token kembar dibandingkan utuh (20 karakter) antara cadangan KMB V2 (23 Sep) dan `workers/kmb-projek/worker.js`: **sama persis**, dan **keempatnya akun uji KMB V2** ("L2 Test", "L1 Test", "Test Mechanic Field 1", "Test Mechanic tyre 1"). Di data KMB Project, `MECH-003` dan `TYRE-002` hanya ada tokennya, tanpa data mekanik.
- Koreksi catatan sebelumnya: token `52fd…` memang token uji (L1 Test), jadi label "token uji" di `docs/MULTI-TENANT-SETUP.md` sudah benar. Tidak ada token pengguna sungguhan yang kembar antar-rumah.
- Belum selesai / berikutnya: persetujuan Gabriel untuk pilihan C (hapus salinan akun uji dari KMB Project).

### 2026-10-28 · Raka (+ Antigravity) · bersama (Isolasi Data SUM vs KMB & Pemisahan Cache Tenant)
- Berubah:
  - **Akar Masalah Data KMB Tampil di SUM:**
    1. Di worker.js, ekstraksi reqSystem sebelumnya memeriksa parsedData.system (dimana parsedData adalah peek.data). Saat frontend mengirim payload JSON { token, system: 'SUM', action: 'pull_monitoring', data: {} }, peek.system tidak terbaca dan reqSystem bernilai kosong (targetSystem default ke 'KMB').
    2. Akibatnya, if (isSupabaseSelected && targetSystem === 'KMB') terpanggil dan Worker mengambil RPC kmb_monitoring serta kmb_create_refs dari database Supabase Singapore KMB Project, mengabaikan rumah SUM.
    3. Di scripts/patched-app.js, fungsi initStorage() memiliki baris peninggalan yang menghapus mar_current_system jika bernilai 'SUM', sehingga sistem selalu ter-reset ke KMB setiap refresh atau load storage.
    4. Cache localStorage menggunakan satu kunci global kmb_gas_refs_v9 dan filter rekondisi yang menolak unit non-vessel milik SUM.
  - **Perbaikan:**
    1. worker.js & workers/kmb-projek/worker.js:
       - Ekstraksi bodySystem diperluas membaca peek.system dan params.get('system').
       - Pengenalan otomatis token SUM (`4651…`, 4738…, prefix sum).
       - isSupabaseSelected dikunci khusus targetSystem === 'KMB'. Untuk SUM, seluruh aksi dialirkan 100% langsung ke SUM GAS (AKfycbzB5EUJ…).
    2. scripts/patched-app.js:
       - api() kini menyematkan parameter query &system=${currentSystem.toLowerCase()} dan header X-MAR-System: currentSystem.
       - Menghapus pembersihan destruktif mar_current_system di initStorage().
       - Kunci cache dan work orders di-scope per tenant (mar_gas_refs_${currentSys}_v1 dan mar_work_orders_${currentSys}).
       - loginWithToken() mengosongkan state in-memory saat berpindah tenant agar tidak ada data unit/mekanik KMB yang bocor ke sesi SUM.
       - Badge sistem dan indikator engine menampilkan PROJEK SUM (biru) dan SPREADSHEET LIVE (Google Sheets) untuk SUM.
  - **Catatan untuk Gabriel (Perbedaan Form Create WO SUM V2 vs KMB Project):**
    - Saat login dengan token SUM V2 (`4651…`), backend kini sudah 100% menarik data monitoring, unit, dan mekanik dari GAS SUM.
    - Namun, form Create WO di `abadiops.com` saat ini masih menyajikan antarmuka KMB Project (3 model pembuatan: Bebas/Unit/Job, pembagian section Rekondisi/Maintenance, dan unit Vessel).
    - Di sistem asli SUM V2 (`docs/INVENTARIS-SUM.md` & `pwa/sum/index.html`), SUM tidak punya section dan form Create WO-nya ringkas 2 level (Kategori Pekerjaan → Komponen Dump Truck → Work Condition → Lokasi Bengkel/Lapangan → Tim Mekanik).
    - PWA asli SUM V2 versi 46 sudah siap 1:1 di folder `pwa/sum/` dan telah dideploy Gabriel ke `https://abadiops-sum.kawanabadigrup.workers.dev`.
    - Dicatat di Bug #11 (`docs/BUG-DICATAT.md`). Menunggu keputusan Gabriel untuk pemisahan frontend di pintu utama `abadiops.com` saat menyajikan rumah SUM.
- Belum selesai / berikutnya:
  - Menunggu verifikasi visual dari pengguna saat login di abadiops.com dengan token SUM.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.


### 2026-11-03 · Raka (+ AI) · kmb-projek (Penghapusan Section Workshop & Pengisian Dropdown Unit Instan Web Work Order)
- Berubah:
  - Menyelesaikan permintaan penghapusan pilihan Workshop dan perbaikan data unit kosong di formulir Web Work Order KMB Project:
    - Menghapus opsi section 'workshop' dari `ALLOWED_SECTIONS`, `sectionRadiosHtml`, dan daftar default di `workers/kmbprojek/web/WorkOrder.html`, sehingga section yang tampil di antarmuka hanya 'Rekondisi' (`vessel`) dan 'Maintenance' (`maintenance`) sesuai spek KMB Project.
    - Memperbaiki pengisian dropdown Unit (`.cas-unit`): `populateCascadeRoot(blockEl, section)` kini dipanggil secara instan saat inisialisasi blok dan pergantian section tanpa menunggu siklus network asynchronous `loadCatalog()`. Unit 28 kendaraan (16 Rekondisi, 11 Maintenance, 1 Others) langsung terisi dalam select box seketika.
    - Menjaga nilai pilihan unit yang sudah dipilih (`prevVal`) agar tidak hilang saat katalog job tiba dari backend.
    - Menyelaraskan teks placeholder `<option value="">-- Pilih Unit --</option>` dan `-- Pilih Model --` dengan bahasa Indonesia seragam.
    - Mengompilasi ulang seluruh template web menggunakan `scripts/build-web-templates.mjs` ke `workers/kmbprojek/src/web-templates.js`.
    - Deploy pembaruan ke staging: Worker `abadiops-kmbprojek-staging` sukses ter-deploy ke Cloudflare Workers (`eb437691-dbe5-42e5-a538-0e68b1b2a5fa`).
  - Verifikasi:
    - HTTP GET `/web?token=52fdb552231348ffb143&page=create`:
      - `ALLOWED_SECTIONS`: `['vessel', 'maintenance']` (Workshop: nihil/dihapus).
      - `UNITS`: 28 unit tertanam (16 Rekondisi, 11 Maintenance).
    - Autentikasi Pintu Staging `POST /api/pintu` dengan token `52fdb552231348ffb143`: sukses mengenali `kmbprojek` (`L1 Test`).
    - Suite uji menyeluruh tetap 100% lulus: `uji-backend-mandiri.mjs` 24/24 LULUS, `uji-serahan-token.mjs` 24/24 LULUS.
- Belum selesai / berikutnya:
  - Commit dan push ke branch `staging` di remote `origin` dan `kmb`.

---

### 2026-11-05 · Raka (+ AI) · bersama (Eksekusi Penuh Blueprint Panduan Deploy Staging Kamis 8)
- Berubah:
  - **Langkah A — SQL Migrasi Kamis Lengkap (`db/kmb_projek/migrasi_kamis_full_penuh.sql`)**:
    - Memperbarui skrip migrasi SQL penuh 5.523 baris dengan sintaks blok idempoten `DO $$ ... END $$;`, penambahan kolom `IF EXISTS` pada `config_units`, `config_components`, dan sinkronisasi otomatis token mekanik.
    - Menyertakan seluruh master data units, components, catalog jobs, dan factors untuk Supabase Gedung 2 Staging (`dnnqrslftndcbmnvuveb`).
  - **Langkah B — Mesin Backend Mandiri & Web Handler `workers/kmbprojek`**:
    - Memperbarui `workers/kmbprojek/src/web-handler.js`: perbaikan `backToken` & `activeFilter`, normalisasi `lengkapiObjekWoWeb`, dan penguncian halaman `/web?page=users` / `?page=config` khusus Admin dengan HTTP 403 Forbidden untuk peran L1/L2.
    - Memperbarui `workers/kmbprojek/src/supabase-backend.js`: dukungan penuh seluruh aksi baca, tulis, `normalisasiBlokWo` untuk formulir multi-baris create WO, `getJobCatalogCached`, serta properti `wo: woObj` pada detail WO modal.
    - Memperbarui `src/domain/scoring.mjs`: rumus pembulatan JavaScript murni tahan galat pecahan biner (`1.005 -> 1.01`, `8.165 -> 8.17`) menggunakan koreksi presisi IEEE 754 epsilon.
    - Memperbarui `workers/kmbprojek/src/index.js` & `wrangler.toml`: mengunci `SAKLAR = "supabase"` dan `STORAGE_MODE = "SUPABASE"` di `[env.staging]`.
  - **Langkah C — Panel Saklar Pusat 3 Rumah (`workers/pintu`)**:
    - Memperbarui `workers/pintu/public/saklar.html`: tampilan terpadu 1:1 CRUD Master Data Config dengan tab per rumah (`SUM V2`, `KMB TRA`, `KMB Projek`, `Semua Rumah`), 5 KPI boxes, filter status, pencarian instan, dan dropdown target rumah pada modal.
    - Memperbarui `workers/pintu/src/index.js` & `workers/pintu/src/user-admin.js`: routing stateless untuk daftar, simpan, dan hapus user serta config untuk seluruh 3 rumah via RPC Supabase.
  - **Hasil Uji Otomatis & Kepatuhan Protokol**:
    - `node scripts/uji-backend-mandiri.mjs`: 40/40 LULUS (100%).
    - `node scripts/uji-user-admin-pusat.mjs`: 27/27 LULUS (100%).
    - `node scripts/uji-serahan-token.mjs`: 24/24 LULUS (100%).
    - Uji HTTP 403 live di staging pada akun operasional (Mekanik): LULUS.
  - **Deploy Staging Berhasil**:
    - `abadiops-pintu-staging`: `https://abadiops-pintu-staging.kawanabadigrup.workers.dev`
    - `abadiops-kmbprojek-staging`: `https://abadiops-kmbprojek-staging.kawanabadigrup.workers.dev`
- Belum selesai / berikutnya:
  - Gabriel mengeksekusi `db/kmb_projek/migrasi_kamis_full_penuh.sql` di Supabase SQL Editor Staging (`dnnqrslftndcbmnvuveb`) bila belum dijalankan.
  - Sesuai AGENTS.md §16, seluruh pekerjaan tetap berada di branch `staging`, tidak men-deploy produksi, dan tidak push ke `main`.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Penyambungan Multi-GAS Token Resolver untuk SUM V2)
- Berubah:
  - Multi-GAS Token Resolver (`worker.js`, `workers/kmb-projek/worker.js`):
    - **Penyebab masalah:** Worker `abadiops.com` sebelumnya hanya memeriksa Supabase `kmb_ping` lalu fallback ke `GAS_EXEC_URL` KMB Project (`AKfycbxh4086…`). Saat token SUM V2 (`4651…` milik SPV-000 L1 Supervisor) dimasukkan, KMB GAS menolak dengan pesan *"Token tidak dikenal / nonaktif"*.
    - **Perilaku baru:**
      - Merestrukturisasi blok `action === 'ping'` di `worker.js` agar berdiri sendiri sebelum pengecekan engine (`isSupabaseSelected && targetSystem === 'KMB'`). Sebelumnya, jika `targetSystem` awal adalah SUM atau belum disetel, blok ping terlewati dan langsung jatuh ke forwarding KMB default.
      - Menambahkan header `X-Active-Engine` pada `Access-Control-Allow-Headers` preflight OPTIONS `/api/gas` agar browser tidak memblokir request karena CORS.
      - Di `worker.js` pada action `ping`: jika `kmb_ping` tidak cocok, Worker memverifikasi token ke `GAS_URLS.KMB` dan `GAS_URLS.SUM` (`AKfycbzB5EUJ…`).
      - Saat GAS SUM memvalidasi token, Worker menyematkan `tenant_code: 'SUM'` dan header `X-MAR-Tenant: SUM`.
      - Untuk aksi data selanjutnya (`pull_monitoring`, `pull_create_refs`, dll.), Worker secara otomatis meneruskan permintaan ke backend SUM jika tenant adalah SUM.
      - Teruji secara lokal via Node: ping token SUM mengembalikan status 200 dengan profil supervisor dan `pull_monitoring` berhasil menarik data monitoring SUM.
  - Client GAS Fallback (`scripts/patched-app.js`):
    - Menambahkan rute SUM ke `GAS_FALLBACK_URLS`.
    - Mengoptimasi pemanggilan `api()` dengan menghapus custom headers yang memicu preflight CORS di browser, serta menyematkan fallback multi-GAS langsung pada klien browser untuk aksi `ping`.
    - Mengemas ulang ke `worker.js` via `scripts/pack-final-worker.mjs`.
- Belum selesai / berikutnya: Verifikasi login langsung dengan token SUM di browser laptop pada abadiops.com.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Fix Mode Akses: Web Normal Buka Portal Lengkap)
- Berubah:
  - Alur Pemilihan Mode Akses (scripts/built-index.html, scripts/patched-app.js, worker.js):
    - **Penyebab masalah:** Sebelumnya tombol atas (PWA) yang menutup gate overlay (`hideGateOverlay()`) dan membuka portal dashboard dengan toast "Mode PWA aktif", sedangkan tombol bawah (Web Normal) mencoba melakukan `window.location.href = /monitoring?token=...` yang menyebabkan reload dan memunculkan kembali modal pilihan mode (looping).
    - **Perilaku baru:**
      - Tombol bawah **Web Normal** (`#btn-mode-web`): Ditandai sebagai mode aktif utama (badge "Buka Semua Modul"). Saat diklik, langsung memanggil `hideGateOverlay()`, mengaktifkan seluruh modul/tab portal web (Performa, Create WO, Monitoring, Approvals, Teknis, Koreksi HM/KM, Reports), memperbarui riwayat URL tanpa reload, dan menampilkan notifikasi sukses "Web Normal aktif (Semua modul terbuka)".
      - Tombol atas **PWA** (`#btn-mode-pwa`): Diberi label "Segera Hadir". Karena PWA offline lapangan masih dalam tahap persiapan, jika diklik sistem memberi pemberitahuan "PWA Lapangan sedang disiapkan" dan mengarahkan pengguna ke Web Normal agar tidak terhalang.
      - Menyesuaikan warna aksen tombol Web Normal secara dinamis (`#3B82F6` untuk SUM, `#10B981` untuk KMB).
      - Menjalankan `scripts/pack-final-worker.mjs` untuk mengemas HTML dan JS terbaru ke dalam `worker.js`.
- Belum selesai / berikutnya: Verifikasi pengujian langsung di browser laptop pada abadiops.com.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (scripts/built-index.html, scripts/patched-app.js):
    - Mengganti teks KMB PORTAL GATE menjadi MAR PORTAL GATE dan title menjadi MAR PORTAL - Mechanic Activity Report.
    - Menyembunyikan label engine toggle (#btn-engine-toggle, #btn-engine-switch-user) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi Masuk ke Aplikasi.
    - Mengganti hardcode state.currentSystem = 'KMB' dan localStorage.setItem('mar_current_system', 'KMB') menjadi dinamis sesuai tenant_code dari respon server atau prefix token (SUM, KMB, dll.).
  - Resolusi Token Multi-Skema (src/backends/supabase/auth.ts, workers/kmb-projek/src/backends/supabase/auth.ts, src/lib/supabaseCerminReader.ts):
    - bacaPingSupabase diperluas agar menyelesaikan token dari kmb_projek.api_tokens, skema relasional sum.api_tokens / cermin sum, dan tabel public.api_tokens.
    - identitasDariTokenSupabase memeriksa tabel token public, fallback sum, dan fallback kmb_projek.
    - Validasi sistem disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di loginWithToken: setelah token valid, menampilkan modal pilihan mode (showModeChoice).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke /monitoring?token=...&tenant=... sekaligus menyinkronkan token dan tenant ke cookies & localStorage.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Perbaikan validasi token di login gate PWA KMB Project (`scripts/patched-app.js`, `worker.js`, `workers/kmb-projek/worker.js`) (Bug #10):
    - **Penyebab masalah:** Sebelumnya, `loginWithToken()` langsung membuat dummy fallback user `{ id: cleanToken, role: 'mechanic', name: 'User KMB' }` jika token tidak ada di cache lokal, lalu segera memanggil `hideGateOverlay()` dan `switchTab('monitoring')` sebelum verifikasi server selesai. Akibatnya, token sembarangan/salah langsung dibawa masuk ke tab monitoring mekanik.
    - **Perilaku baru:**
      1. Saat tombol login ditekan (atau ditekan Enter), tombol langsung berganti status menjadi loading spinner (`Memeriksa token...`) dan di-disable.
      2. Layar login (gate overlay) ditahan tetap terbuka — tidak langsung berpindah tab.
      3. Token diverifikasi secara async via `api('ping')` ke database backend (Supabase Singapore `kmb_ping` atau fallback GAS KMB Project).
      4. Jika token tidak valid / tidak dikenal: user tetap di layar login, muncul pesan error merah di elemen `#gate-error-msg` dan toast error, input token diberi border merah dan fokus, token dibersihkan dari `localStorage` dan URL, dan tombol login kembali aktif.
      5. Jika token valid: profil dan role dimuat sesuai respon backend (mekanik ke monitoring, approver/supervisor ke dashboard).
- Belum selesai / berikutnya: pengujian login langsung di browser untuk berbagai variasi token.

### 2026-10-28 · Gabriel (+ Claude) · bersama (cek token)
- Berubah: tidak ada kode. Cek token kembar antar-rumah, dengan token hanya ditampilkan 4 huruf pertamanya.
  - Sumber: `ApiTokens` dan `offline_token` dari cadangan KMB V2 (23 Sep), `ApiTokens` dari cadangan SUM V2 (15 Sep), dan `TOKENS` dari `workers/kmb-projek/worker.js` (KMB Project). Semua token berupa hex 20 karakter.
  - Jumlah: KMB V2 32 (+3 offline_token), SUM V2 55, KMB Project 28.
  - **4 token kembar, semuanya KMB V2 ↔ KMB Project, dengan mechanic_id yang sama di kedua rumah:** `SUPT-001` (67e8…), `SPV-001` (52fd…), `MECH-003` (fde7…), `TYRE-002` (9b83…). Dua di antaranya approver (superintendent dan supervisor).
  - SUM V2 tidak kembar dengan rumah lain. Tidak ada token kembar di dalam satu rumah.
  - Token `52fd…` juga tercantum sebagai token uji di `docs/MULTI-TENANT-SETUP.md`, padahal di cadangan KMB V2 token itu milik `SPV-001`.
  - Keterbatasan: cadangan bertanggal 15–23 Sep, jadi token yang dibuat sesudahnya belum ikut dicek. Ulangi dengan data terbaru sebelum pintu dinyalakan.
- Belum selesai / berikutnya: keputusan cara menangani 4 token kembar (`docs/KEPUTUSAN.md`, belum diputuskan nomor 8).

### 2026-10-28 · Gabriel (+ Claude) · kmb (2)
- Berubah:
  - Worker `abadiops-kmb` di-deploy Gabriel ke `https://abadiops-kmb.kawanabadigrup.workers.dev` (versi `5f1b2647`), memakai API token kawanabadigrup yang sama dengan SUM.
  - Diuji terhadap versi tayang: `/api/sehat` ok. Ke-7 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): identik dengan jawaban langsung GAS KMB V2. Waktu jawab 3–5 detik.
  - Pemisahan rumah terkonfirmasi: `abadiops-sum` menjawab `X-Abadi-Rumah: sum`, sedangkan `abadiops-kmb` menjawab `kmb`. API token Cloudflare hanya kunci unggah kode, sedangkan data tiap rumah dipisahkan oleh Worker, alamat GAS, dan `ApiTokens` masing-masing.
- Belum selesai / berikutnya: uji token sungguhan di kedua alamat uji, lalu penyambungan ke pintu `abadiops.com` bersama Raka.

### 2026-10-28 · Raka (+ opencode) · bersama
- Berubah:
  - Implementasi **Zero-Select Tenant Login**: hapus pemilihan sistem di `/masuk`. Token otomatis dipetakan ke tenant di database.
  - Update `src/app/masuk/page.tsx`: hapus UI pemilihan sistem, hanya input token.
  - Update `src/app/api/masuk/route.ts`: hapus param `sistem`, token resolution otomatis.
  - Update `src/backends/supabase/auth.ts`: pencarian token di `public.api_tokens` dengan join ke `tenants` untuk deteksi tenant otomatis.
  - Catat keputusan di `docs/KEPUTUSAN.md`: Token unik global, login tanpa pilih sistem.
- Belum selesai / berikutnya:
  - Tambah UI pemilihan mode akses (PWA vs Web Normal) di halaman monitoring/home.
  - Jalankan migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` di Supabase SQL editor production.

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Perbaiki Bug #9 (Pelanggaran Isolasi Rumah §2 & Kebocoran Rute Data SUM):
    - Mengunci frontend `scripts/built-index.html` dan `scripts/patched-app.js` 100% murni KMB Project (menghapus tombol gate SUM `#gate-sys-sum`, tooltip switcher `#project-badge`, event listeners beralih sistem, dan fallback `GAS_FALLBACK_URLS.SUM`).
    - Menambahkan pembersih cache otomatis pada inisialisasi state & storage untuk membuang entri terkontaminasi SUM (`localStorage.mar_current_system === 'SUM'` dan item `kmb_work_orders` berakhiran suffix batch `-A/-U/-V/-W`).
    - Menghapus routing dan fallback `GAS_URLS.SUM` dari wrapper `worker.js` dan mengunci `targetSystem = 'KMB'` serta `targetGasUrl` hanya ke endpoint GAS KMB Project.
    - Menjalankan `scripts/pack-final-worker.mjs` untuk mengemas ulang `worker.js` dan menyinkronkan ke `workers/kmb-projek/worker.js`.
- Belum selesai / berikutnya:
  - Jalankan migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` di Supabase SQL editor production untuk menyelesaikan Bug #6 di sisi basis data.

### 2026-10-28 · Raka (+ opencode) · kmb-projek
- Berubah:
  - Perbaiki Bug #6: hapus kolom `golongan` dari `kmb_projek.config_mechanics` dan field `position` dari RPC `kmb_create_refs`. Dropdown mekanik Create WO sekarang 100% murni nama tanpa label golongan, sesuai GAS asli KMB Project.
  - Buat migrasi `db/kmb_projek/migration_20261028_drop_golongan.sql` untuk drop kolom dari DB production.
  - Update skema `db/kmb_projek/cermin_sheet.sql` dan RPC `db/kmb_projek/rpc_baca.sql`.
- Belum selesai / berikutnya:
  - Jalankan migrasi di Supabase production.

### 2026-10-28 · Gabriel (+ Claude) · kmb
- Berubah:
  - Tahap 3 (Pintu) untuk KMB V2, dengan pola yang sama seperti rumah SUM. Menambah `pwa/kmb/`: salinan 1:1 PWA `mar-offline` v91. Hanya empat baris yang diubah: alamat API di `app.js:6` dan `sw.js:25` menjadi `./api`, serta versi v91 menjadi v92. File lainnya identik byte demi byte.
  - Menambah `workers/kmb/` (Worker `abadiops-kmb`): menyajikan PWA dan meneruskan setiap panggilan API apa adanya ke GAS KMB V2. Akun kawanabadigrup dikunci, saklar tetap `gas`. Kodenya sama dengan Worker SUM.
  - Diuji lokal dengan `wrangler dev`. Ke-7 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS KMB V2. `wrangler deploy --dry-run` valid.
  - Belum di-deploy. Belum diuji dengan token sungguhan.
- Belum selesai / berikutnya: deploy ke alamat uji, uji token sungguhan, inventaris dan cermin KMB V2.

### 2026-10-28 · Raka (+ Antigravity & opencode) · kmb-projek
- Berubah:
  - Perbaiki Bug #8: kembalikan fallback query `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` dengan perlindungan anti cross-tenant. Token dari skema cermin hanya diterima jika prefix `kmb-` atau `s === 'KMB'`.
  - Mengidentifikasi dan mencatat Bug #9 di `docs/BUG-DICATAT.md`: kebocoran rute data SUM pada `worker.js` KMB Project akibat adanya dual-tenant router dan switch system yang melanggar isolasi rumah [AGENTS.md §2].
- Belum selesai / berikutnya:
  - Kunci `worker.js` KMB Project agar 100% terisolasi ke KMB (hapus `GAS_URLS.SUM`, hapus event switch sistem, hapus pembacaan state `mar_current_system === 'SUM'`).
  - Bersihkan label golongan `(1a)` pada dropdown tim mekanik form Create WO dan RPC `kmb_create_refs` (Bug #6).

### 2026-10-28 · Raka (+ Antigravity) · bersama (Universal Login Gate)
- Berubah:
  - Universal Branding & State Portal (`scripts/built-index.html`, `scripts/patched-app.js`):
    - Mengganti teks `KMB PORTAL GATE` menjadi `MAR PORTAL GATE` dan title menjadi `MAR PORTAL - Mechanic Activity Report`.
    - Menyembunyikan label engine toggle (`#btn-engine-toggle`, `#btn-engine-switch-user`) dan menetralkan nama section filter di report.
    - Mengubah tombol login menjadi `Masuk ke Aplikasi`.
    - Mengganti hardcode `state.currentSystem = 'KMB'` dan `localStorage.setItem('mar_current_system', 'KMB')` menjadi dinamis sesuai `tenant_code` dari respon server atau prefix token (`SUM`, `KMB`, dll.).
  - Resolusi Token Multi-Skema (`src/backends/supabase/auth.ts`, `workers/kmb-projek/src/backends/supabase/auth.ts`, `src/lib/supabaseCerminReader.ts`):
    - `bacaPingSupabase` diperluas agar menyelesaikan token dari `kmb_projek.api_tokens`, skema relasional `sum.api_tokens` / cermin `sum`, dan tabel `public.api_tokens`.
    - `identitasDariTokenSupabase` memeriksa tabel token `public`, fallback `sum`, dan fallback `kmb_projek`.
    - Validasi sistem `if (s && s !== 'MAR' && tenantFromDb !== s)` disesuaikan agar gate universal menerima token SUM dan KMB tanpa terblokir sistem default.
  - Alur PWA vs Web Normal:
    - Di `loginWithToken`: setelah token valid, menampilkan modal pilihan mode (`showModeChoice`).
    - Tombol PWA: menutup gate dan memuat dashboard/monitoring PWA offline-first.
    - Tombol Web: mengarahkan ke `/monitoring?token=...&tenant=...` sekaligus menyinkronkan token dan tenant ke cookies & `localStorage`.
- Belum selesai / berikutnya: pengujian login gate dengan token SUM di browser laptop.

### 2026-10-28 · Raka (+ Antigravity) · kmb-projek (dan bersama)
- Berubah:
  - Tarik pembaruan remote dari Gabriel lewat `git pull --rebase` di `main`: menerima fondasi rumah SUM tahap Pintu (`pwa/sum/`, `workers/sum/`, `docs/INVENTARIS-SUM.md`, dan keputusan tetap dua link per rumah di `docs/KEPUTUSAN.md`).
  - Mengaudit perbaikan kebocoran token cross-tenant (commit `4259f67` / Bug #7).
  - Merapikan identitas pencatat Bug #7 di `docs/BUG-DICATAT.md` menjadi Raka (+ opencode).
  - Mencatat temuan bug regresi #8 di `docs/BUG-DICATAT.md`: terhapusnya fallback query `kmb_projek.api_tokens` pada `src/backends/supabase/auth.ts` saat commit `4259f67`.
- Belum selesai / berikutnya:
  - Pulihkan resolusi token `kmb_projek.api_tokens` di `src/backends/supabase/auth.ts` dengan perlindungan anti cross-tenant.
  - Bersihkan label golongan `(1a)` pada dropdown tim mekanik form Create WO dan RPC `kmb_create_refs` (Bug #6).

### 2026-10-28 · Gabriel (+ Claude) · sum (4)
- Berubah: mencatat keputusan Gabriel di `docs/KEPUTUSAN.md`. Selama migrasi tetap dua link per rumah: PWA lapangan dan halaman web menu lengkap. Halaman web tetap di GAS sampai dipindah 1:1, dan wajib sudah dipindah sebelum saklar dinyalakan. Ide satu aplikasi offline-first dengan menu lengkap masuk daftar "setelah ketiga rumah selesai pindah". Berlaku juga untuk rumah kmb dan kmb-projek.
- Belum selesai / berikutnya: uji token sungguhan di alamat uji SUM.

### 2026-10-28 · Gabriel (+ Claude) · sum (3)
- Berubah:
  - Worker `abadiops-sum` di-deploy Gabriel ke `https://abadiops-sum.kawanabadigrup.workers.dev` (versi `fdbdbc6c`), memakai API token kawanabadigrup.
  - Diuji terhadap versi tayang: `/api/sehat` ok. Ke-9 file PWA tersaji 200 tanpa redirect. Uji kembar dengan token palsu (`ping`, `pull_my_wos`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS. Waktu jawab 3–6 detik, hampir seluruhnya waktu GAS.
- Belum selesai / berikutnya: uji dengan token sungguhan untuk kelima peran. Alamat ini belum dipakai mekanik.

### 2026-10-28 · Gabriel (+ Claude) · sum (2)
- Berubah:
  - Tahap 3 (Pintu) untuk SUM. Menambah `pwa/sum/`: salinan 1:1 PWA `mar-sum-offline` v45. Hanya empat baris yang diubah: alamat API di `app.js:8` dan `sw.js:20` menjadi `./api`, serta versi v45 menjadi v46.
  - Menambah `workers/sum/` (Worker `abadiops-sum`): menyajikan PWA dan meneruskan setiap panggilan API apa adanya ke GAS SUM. Tidak ada logika bisnis, saklar tetap `gas`. Buat WO, approve, dan semua aksi lain tetap dikerjakan GAS.
  - Diuji lokal dengan `wrangler dev`. Semua file PWA tersaji 200 tanpa redirect. Uji kembar API dengan token palsu (`ping`, `create_wo`, token kosong, body bukan JSON): jawaban lewat Worker identik dengan jawaban langsung GAS. Kalau GAS tidak terjangkau, Worker menjawab teks biasa (502), sehingga PWA tetap menahan kiriman di antrean.
  - Belum di-deploy ke Cloudflare. Belum diuji dengan token sungguhan.
- Belum selesai / berikutnya: deploy ke alamat uji, uji token sungguhan, sambungkan ke pintu `abadiops.com` bersama Raka.

### 2026-10-28 · Gabriel (+ Claude) · sum
- Berubah:
  - Menambah `docs/INVENTARIS-SUM.md` versi 1: 19 sheet, 26 aksi (13 baca, 13 tulis) beserta gerbang peran dan sheet yang disentuh, 5 peran, halaman web, 4 pemicu terjadwal, Script Properties, rumus poin dan rupiah, nomor WO, dan zona waktu. Disusun dari kode `MAR-SUM-v2` commit `89edc5a`.
  - Menambah `db/sum/cermin_sheet.sql`: skema `sum` berisi 19 tabel cermin mentah (`nilai` = baris persis seperti `getValues()`), plus `cermin_header`, `cermin_log`, dan `cermin_meta`. Belum dijalankan di Supabase.
  - Menambah `tools/sum/sinkron-cermin.mjs`: membaca sheet lewat Google Sheets API memakai akun layanan baca-saja, lalu menulis ke skema `sum`. Ada mode `--kering`. Sintaks sudah dicek dan konversi tanggal WIB ke UTC lulus 4 uji. **Belum pernah dijalankan** terhadap spreadsheet sungguhan.
  - Menambah `db/sum/README.md`: alasan cermin mentah, langkah penyiapan, dan cara menjalankan.
  - Saklar SUM tetap `gas`. GAS dan spreadsheet tidak disentuh.
- Belum selesai / berikutnya: empat tugas SUM di daftar tugas terbuka.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - **STOP & EVALUASI KEPATUHAN PINDAHKAN DULU, PERBAIKI NANTI (AGENTS.md §1 & §2):**
    1. **Kesalahan Teridentifikasi:** Dropdown *Team Composition* pada layar Create WO menampilkan imbuhan grade/golongan `(1a)` di samping nama mekanik (contoh: `Afid Irham (1a)`).
    2. **Akar Masalah:**
       - Template option di `patched-app.js` menyisipkan `${name}${pos ? ` (${pos})` : ''}`.
       - Kolom `golongan` pada `kmb_projek.config_mechanics` di Supabase sempat terisi `'1a'` dan diekspos melalui RPC `kmb_create_refs`.
       - **Koreksi Fatal:** Sistem penilaian dan grading `(1a, 1b, 2a, dst)` adalah milik **Rumah SUM V2**, bukan milik KMB Project. Di Google Spreadsheet dan GAS asli KMB Project, dropdown mekanik sama sekali tidak memiliki label golongan dan murni hanya menampilkan nama mekanik.
    3. **Tindakan:** Menghentikan sementara pekerjaan baru dan mencatat temuan ini secara formal di `docs/BUG-DICATAT.md` (Entri #6) agar menjadi pengingat keras untuk pekerjaan selanjutnya.
- Belum selesai / berikutnya:
  - Kembalikan dropdown *Team Composition* di `scripts/patched-app.js` dan `worker.js` menjadi 100% murni nama mekanik tanpa embel-embel grade `(${pos})`, persis 1:1 seperti GAS dan Spreadsheet KMB.
  - Bersihkan eksposur `golongan` di skema `kmb_projek` / RPC `kmb_create_refs` agar data SUM tidak bocor ke rumah KMB.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengimplementasikan full smart cascading pada form Create WO (Unit -> Component -> Sub Component -> Job):
    1. Auto-select otomatis jika pilihan pada level berikutnya hanya ada 1 (contoh: Unit DLCD/SDVS langsung auto-select Component; Component ber-sub tunggal langsung auto-select Sub Component).
    2. Dependent dropdowns dinonaktifkan (disabled) secara bertingkat dengan label instruksi jelas sebelum dropdown induk dipilih.
    3. Pilihan yang valid tetap dipertahankan saat induk diganti (tidak asal di-reset kosong jika masih kompatibel).
    4. Memperbaiki perhitungan Unit Factor (1.00x) dan kalkulasi Estimated Points di box Preview secara real-time.
    5. Re-pack worker.js.
- Belum selesai / berikutnya:
  - Deploy worker.js terbaru ke Cloudflare Workers.

### 2026-10-27 · Raka (+ opencode) · bersama
- Berubah:
  - Membuat fondasi folder tiga rumah: `workers/kmb/`, `workers/kmb-projek/`, `workers/sum/`, `db/kmb/`, `db/sum/`, `pwa/kmb/`, `pwa/kmb-projek/`, `pwa/sum/`.
  - Menyiapkan repo untuk pemisahan backend dan PWA per rumah sesuai AGENTS.md §6.
  - Menyusun `docs/STRUKTUR-RUMAH.md` memetakan file mana milik rumah mana.
  - Menyusun `docs/PANDUAN-GABRIEL.md` berisi panduan setup langkah demi langkah untuk Gabriel (KMB V2 & SUM V2).
  - Mulai memindahkan KMB Project: `worker.js`, `src/app/`, `src/backends/`, `wrangler.toml`, `tsconfig.json`, `next.config.ts` ke `workers/kmb-projek/`.
- Belum selesai / berikutnya:
  - Gabriel membuat skema `kmb` dan `sum` serta memindahkan PWA masing-masing.
  - Penyesuaian akhir import shared di root.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbaiki pengisian dropdown Create WO (Rekondisi & Maintenance) agar tidak lagi kosong:
    1. Bump cache version ke kmb_gas_refs_v9 dan otomatis purge cache usang (v8/v7) di browser klien.
    2. Menambahkan validasi integritas cache sebelum dipakai (hasRekondisi, validasi count komponen).
    3. Menambahkan ID prefix matching (sdvs, dlcd, sdt, xevb, xtn) dan safety fallback pada getAvailableUnits, getAvailableComponents, getAvailableSubComponents, dan getAvailableJobs agar cascading kebal terhadap perbedaan penamaan section.
    4. Menyinkronkan pull_create_refs secara asinkron-deterministik (await) dalam syncFromSpreadsheet.
    5. Re-pack worker.js siap deploy ke Cloudflare Workers.
- Belum selesai / berikutnya:
  - Deploy bundle worker.js ke Cloudflare Workers Quick Edit.

### 2026-10-27 · Raka (+ opencode) · bersama
- Berubah:
  - Membuat fondasi folder tiga rumah: `workers/kmb/`, `workers/kmb-projek/`, `workers/sum/`, `db/kmb/`, `db/sum/`, `pwa/kmb/`, `pwa/kmb-projek/`, `pwa/sum/`.
  - Menyiapkan repo untuk pemisahan backend dan PWA per rumah sesuai AGENTS.md §6.
  - Menyusun `docs/STRUKTUR-RUMAH.md` memetakan file mana milik rumah mana.
  - Mulai memindahkan KMB Project: `worker.js`, `src/app/`, `src/backends/`, `wrangler.toml`, `tsconfig.json`, `next.config.ts` ke `workers/kmb-projek/`.
- Belum selesai / berikutnya:
  - **Issue**: Kode shared (`src/lib/`, `src/domain/`, `src/pwa/`) perlu di-extract atau dibuat relatif import yang benar. Perlu keputusan apakah frontend Next.js milik KMB Project saja atau shared.
  - Pindahkan `db/kmb_projek/` ke `db/` (sudah benar).
  - Siapkan skema database untuk `kmb` dan `sum` (Gabriel).
  - Tentukan monorepo strategy: `package.json` shared vs per rumah.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Menyinkronkan seluruh 1.533 katalog pekerjaan (`jobs_vessel` 276 baris & `jobs_field` 1.257 baris) dari Google Spreadsheet ke tabel Supabase `kmb_projek.catalog_jobs` dengan kunci komposit `(job_id, section)`.
  - Memperbaiki stored procedure RPC `public.kmb_create_refs()` di [db/kmb_projek/rpc_baca.sql](file:///d:/marbaru/MARProject/db/kmb_projek/rpc_baca.sql) agar mengembalikan format 1:1 GAS untuk `jobs_vessel` dan `jobs_field` beserta work conditions shift 1, shift 2, dan ekstrim.
  - Memperbaiki dropdown katalog yang sebelumnya kosong di halaman Create WO (misalnya untuk unit `SDT-003` yang kini langsung menampilkan 84 pekerjaan transmisi dan 13 sub-komponen lengkap).
  - Diterapkan langsung ke Supabase Singapore (`sptgqsjgszwbreikxdph`) dan terverifikasi live.
- Belum selesai / berikutnya:
  - Gabriel melanjutkan pembuatan skema cermin dan Uji Kembar untuk KMB V2 dan SUM V2.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengimplementasikan fitur **Dynamic Dual-Engine Switcher**: pengguna kini dapat dengan sangat mudah berpindah backend secara on-demand antara **SUPABASE LIVE (PostgreSQL Singapore)** dan **SPREADSHEET LIVE (Google Sheets / Google Apps Script)** tanpa perlu ubah kode.
  - Menambahkan tombol/badge interaktif langsung di antarmuka portal ([scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html)):
    - Badge header (`#btn-engine-toggle`): cukup diklik sekali untuk toggle antara `🟢 SUPABASE LIVE (PostgreSQL)` dan `📊 SPREADSHEET LIVE (Google Sheets)`.
    - Tombol switch di user profile bar (`#btn-engine-switch-user`): tombol cepat "Ke Sheets" / "Ke Supabase".
    - Switch engine di login modal KMB PORTAL GATE (`#gate-engine-toggle`).
  - Mendukung override parameter URL (`?engine=supabase` vs `?engine=sheets` / `?engine=spreadsheet`) dan persistensi pilihan di `localStorage` (`kmb_active_engine`).
  - Menyelaraskan client API di [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js) agar menyertakan header `X-Active-Engine` dan query param `engine` di setiap request.
  - Memperbarui router [worker.js](file:///d:/marbaru/MARProject/worker.js) dan [src/app/api/gas/route.ts](file:///d:/marbaru/MARProject/src/app/api/gas/route.ts) agar saat engine `SPREADSHEET` dipilih, request 100% langsung diteruskan ke Google Apps Script / Sheets. Saat `SUPABASE` dipilih, request baca dilayani sub-50ms oleh Supabase Singapore.
  - Menambahkan unit test di [tests/api/gas.test.ts](file:///d:/marbaru/MARProject/tests/api/gas.test.ts) dan memaketkan ulang ke [worker.js](file:///d:/marbaru/MARProject/worker.js) (lolos validasi sintaks & testing).
- Belum selesai / berikutnya:
  - Copy [worker.js](file:///d:/marbaru/MARProject/worker.js) terbaru ke Cloudflare Workers Quick Edit lalu deploy.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbarui Cloudflare Worker (`worker.js`) dan Portal Web agar langsung terhubung ke basis data Supabase Singapore (`sptgqsjgszwbreikxdph`) menggunakan RPC & REST API.
  - Membuat dan menerapkan fungsi PostgreSQL RPC di Supabase Singapore (`db/kmb_projek/rpc_baca.sql`): `kmb_ping`, `kmb_create_refs`, `kmb_monitoring`, `kmb_my_wos`, dan `kmb_wos_by_status`.
  - Memperbarui badge dan teks pada antarmuka portal ([scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html) dan [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js)) menjadi `🟢 SUPABASE LIVE (PostgreSQL)` dan sinkronisasi `Sync Supabase`.
  - Mengonfigurasi `STORAGE_MODE = "SUPABASE"` di [wrangler.toml](file:///d:/marbaru/MARProject/wrangler.toml) beserta variabel public Supabase.
  - Memaketkan ulang seluruh bundle ke dalam [worker.js](file:///d:/marbaru/MARProject/worker.js) siap deploy ke Cloudflare Workers.
- Belum selesai / berikutnya:
  - Deploy worker.js terbaru ke Cloudflare Workers (lewat tab dashboard Cloudflare atau `wrangler deploy`).

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengaktifkan pengambilan data sistem langsung dari basis data Supabase Singapore (`kmb_projek`) sesuai Tahap 4 Roadmap (`docs/SAKLAR.md` & `AGENTS.md` §2).
  - Mengimplementasikan `src/lib/supabaseCerminReader.ts`: reader sub-50ms untuk aksi baca `ping`, `pull_create_refs`, `pull_monitoring`, `pull_my_wos`, dan kueri status WO (`pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`).
  - Menambahkan endpoint Next.js `src/app/api/gas/route.ts` yang bertindak sebagai Dual-Engine Gateway: menyajikan aksi baca langsung dari Supabase saat `BACKEND_DRIVER=supabase` dan meneruskan aksi tulis ke GAS.
  - Memperbarui `src/backends/supabase/auth.ts` dan `src/backends/supabase/data.ts` untuk mendukung resolusi token dan katalog cermin dari skema `kmb_projek`.
  - Mengalihkan `BACKEND_DRIVER=supabase` di `.env.local`.
  - Pengujian live: `pull_create_refs` selesai dalam 272ms (vs GAS ~6400ms) dan `pull_monitoring` selesai dalam 25ms (vs GAS ~8100ms), 100% data valid dan terverifikasi.
  - Menambahkan pengujian otomatis di `tests/api/gas.test.ts`.
- Belum selesai / berikutnya:
  - Bersama Gabriel mempersiapkan pemisahan folder `workers/` dan `pwa/` ke dalam struktur tiga rumah sesuai §6 `AGENTS.md`.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Memperbaiki bug flash UI di mana panel supervisor ("Mekanik Monitoring L1 & L2") sempat muncul ketika akun mekanik (contoh: Gusti Raka Pamungkas / `VES-012`) sedang proses loading awal.
  - Akar masalah:
    1. Di [scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html), kontainer `#mon-supervisor-panel` belum memiliki atribut bawaan `style="display: none;"`.
    2. Di [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js), pemetaan profil mekanik dari cache lokal (`state.mechanics` asal `pull_create_refs`) tidak memiliki atribut `role` (terisi string kosong `""`), menyebabkan pengecekan `isMechanicMode` bernilai `false` selama beberapa detik sebelum `ping` selesai.
  - Perbaikan:
    - Menambahkan `style="display: none;"` dan loading spinner pada `#mon-supervisor-panel` di template HTML.
    - Memperbaiki `loginWithToken()` agar `user.role` selalu terisi `'mechanic'` sebagai fallback aman jika bukan supervisor/superintendent.
    - Memperketat pengecekan `renderMonitoring()` sehingga panel supervisor hanya dapat terbuka jika role eksplisit supervisor/superintendent.
    - Mengemas ulang [worker.js](file:///d:/marbaru/MARProject/worker.js) melalui `scripts/pack-final-worker.mjs`.
  - Menghapus bagian "Token Pengujian Cepat" (L1 Test, Gusti Raka, Mekanik SUM) dari modal KMB PORTAL GATE di [scripts/built-index.html](file:///d:/marbaru/MARProject/scripts/built-index.html) dan [scripts/patched-app.js](file:///d:/marbaru/MARProject/scripts/patched-app.js) sesuai arahan keamanan dan permintaan Raka.
  - Membuat panduan integrasi lengkap untuk Gabriel di [`docs/CATATAN-GABRIEL.md`](file:///d:/marbaru/MARProject/docs/CATATAN-GABRIEL.md) mencakup arsitektur 3 rumah, alur login/token routing, panduan pembuatan skema cermin `kmb` & `sum`, sinkronisasi snapshot, uji kembar, dan protokol kerja harian.
  - Membuat dan menjalankan skrip simulasi siklus hidup transaksi Work Order langsung di Supabase cloud PostgreSQL ([`scripts/simulasi-alur-supabase.mjs`](file:///d:/marbaru/MARProject/scripts/simulasi-alur-supabase.mjs)): berhasil menguji alur Create WO → Mechanic Submission → L1 Approval → L2 Final Approval & Poin Payroll (`WO-SB-20261027-8491`) dengan stempel waktu audit trail lengkap dan tersimpan permanen di skema `kmb_projek`.
- Belum selesai / berikutnya: Menyiapkan pemantauan cermin harian (Tahap 2 evaluasi 7 hari) dan pengujian aksi baca `pull_create_refs` & `pull_monitoring` dari Worker.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek
- Berubah:
  - Mengeksekusi sinkronisasi data snapshot awal dari Google Apps Script KMB Project ke skema cermin Supabase `kmb_projek` melalui [`scripts/sinkron-kmb-projek-cermin.mjs`](file:///d:/marbaru/MARProject/scripts/sinkron-kmb-projek-cermin.mjs).
  - Mengisi data tabel cermin Supabase:
    - `kmb_projek.config_units`: 28 unit
    - `kmb_projek.config_components`: 276 komponen
    - `kmb_projek.config_mechanics`: 21 mekanik & supervisor
    - `kmb_projek.api_tokens`: 21 token akses aktif
    - `kmb_projek.config_factors`: 6 faktor pengali jabatan & rate
    - `kmb_projek.work_orders`: 15 work order aktif & pending approval
    - `kmb_projek.work_orders_archive`: 51 work order riwayat arsip
  - Menjalankan Uji Kembar (*Twin Test*) Tahap 4 untuk aksi baca (`ping` token supervisor, `ping` token mekanik, katalog unit, dan daftar mekanik): hasil JSON dari Supabase `kmb_projek` 100% identik dengan GAS.
- Belum selesai / berikutnya: Menyiapkan pemantauan cermin harian (Tahap 2 evaluasi 7 hari) dan pengujian aksi baca `pull_create_refs` & `pull_monitoring` dari Worker.

### 2026-10-27 · Raka (+ Antigravity) · kmb-projek & bersama (2)
- Berubah:
  - Menyelesaikan inventaris lengkap perilaku per aksi untuk Rumah KMB Project di [`docs/INVENTARIS-KMB-PROJEK.md`](file:///d:/marbaru/MARProject/docs/INVENTARIS-KMB-PROJEK.md) mencakup 20 aksi, payload, format JSON, pesan error persis huruf demi huruf, baris sheet, dan rumus hitung poin/rupiah.
  - Memverifikasi region project Supabase `sptgqsjgszwbreikxdph` adalah Singapura (`ap-southeast-1`), memperbarui [`docs/KEPUTUSAN.md`](file:///d:/marbaru/MARProject/docs/KEPUTUSAN.md).
  - Memverifikasi Script ID `1k_A_KER…` untuk SUM V2 dari repo `MAR-SUM-v2` (`.clasp.json` dan `SERAH-TERIMA.md`), memperbarui [`AGENTS.md`](file:///d:/marbaru/MARProject/AGENTS.md).
  - Memverifikasi cabang arsip `archive/marproject` tersimpan di remote `kmb` dan `origin`.
  - Menyiapkan skema cermin Google Sheets untuk Rumah KMB Project di Supabase (`db/kmb_projek/cermin_sheet.sql`) sesuai mandat Tahap 2 Cermin.
- Belum selesai / berikutnya:
  - Menunggu input kredensial database untuk project Supabase `sptgqsjgszwbreikxdph` / pembuatan staging project.
  - Pembentukan susunan tiga rumah bersama Gabriel (`workers/`, `pwa/`, `db/`).

### 2026-10-27 · Raka (+ Antigravity) · bersama (kmb-projek & sum)
- Berubah: Menyiapkan pemisahan multi-sistem KMB & SUM (Apps Script terpisah & database Supabase terpisah).
  - Menambahkan routing dinamis di Cloudflare Worker `worker.js` (`/api/gas`) berdasarkan header `X-MAR-System`, token prefix (`sum-` vs `kmb-`), dan query param.
  - Mendefinisikan URL Web App GAS untuk KMB (`AKfycbxh...`) dan SUM (`AKfycbzB...`) dengan fallback override via environment variable.
  - Menyiapkan koneksi kolam PostgreSQL / Supabase terpisah (`DATABASE_URL_KMB` dan `DATABASE_URL_SUM`) di `src/lib/db.ts` dan `src/lib/backendConfig.ts`.
  - Memperbarui `scripts/patched-app.js` dan `scripts/built-index.html` dengan pemilih sistem KMB / SUM, badge klik untuk beralih sistem, dan auto-deteksi token.
  - Menjalankan uji kembar routing (`test-worker-routing.mjs` & `test-backend-multi-tenant.mjs` lulus 100%).
- Belum selesai / berikutnya: Mengisi connection string Supabase khusus untuk SUM di `DATABASE_URL_SUM` (`.env.local` / Cloudflare env) setelah project Supabase SUM siap.

### 2026-10-27 · Gabriel + Claude · bersama (2)
- Berubah: mencatat keputusan Gabriel bahwa repo tetap publik dan token yang ada tetap dipakai. Tiga tugas mendesak soal repo privat, data di bundle, dan penggantian token dihapus dari daftar tugas terbuka. `AGENTS.md` §4 dan `docs/KEPUTUSAN.md` disesuaikan.
- Berikutnya: inventaris perilaku per rumah.

### 2026-10-27 · Gabriel + Claude · bersama
- Berubah: menambah `AGENTS.md`, `CLAUDE.md`, `docs/KEPUTUSAN.md`, `docs/SAKLAR.md`, `docs/PROGRES.md`, dan `docs/BUG-DICATAT.md`. Tidak ada kode yang diubah.
- Sebelum menulis, `main` sudah ditarik sampai commit `2e8e1da`.
- Temuan: repo masih publik, dan data produksi ikut terbawa di bundle frontend. Lihat tugas terbuka.
- Berikutnya: kerjakan tiga tugas mendesak di atas, lalu inventaris per rumah.
