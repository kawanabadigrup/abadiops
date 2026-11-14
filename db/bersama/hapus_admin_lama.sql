-- Membuang pusat admin lama (fungsi SQL per rumah, BUG-DICATAT #39). Penggantinya pusat admin di atas cermin
-- (workers/pintu/src/admin-cermin.js), yang membaca dan menulis lewat public.cermin_baca / cermin_tulis.
--
-- Yang dibuang dan alasannya:
--   - pemicu *_pertahankan_admin_* dan tabel admin_users_supabase / admin_tokens_supabase (sum, kmb): setiap kali ada
--     baris baru masuk ke config_mechanics / api_tokens, data dari tabel bayangan itu disuntikkan ulang dengan
--     susunan kolom yang ditulis tetap (tidak sama dengan judul sheet), jadi ada dua sumber kebenaran;
--   - fungsi public.(sum|kmbtra|kmb)_admin_* dan _*_admin_*_internal, _*_validasi_admin_token, sum._cek_is_admin:
--     menulis baris bernomor palsu (>= 100000) dan nilai yang panjangnya tidak sama dengan judul sheet; versi
--     *_bertoken bisa dipanggil anon dan memberi daftar token semua orang kepada supervisor mana pun.
-- Tidak ada fungsi lain yang memakainya (dicek 14 Nov 2026). Hanya untuk gedung yang pernah dipasangi
-- db/kmb_projek/migrasi_kamis_full_penuh.sql (staging); Gedung 1 tidak punya semua ini, dan skrip ini aman diulang.
DROP TRIGGER IF EXISTS trg_sum_pertahankan_admin_users ON sum.config_mechanics;
DROP TRIGGER IF EXISTS trg_sum_pertahankan_admin_tokens ON sum.api_tokens;
DROP TRIGGER IF EXISTS trg_kmb_pertahankan_admin_users ON kmb.config_mechanics;
DROP TRIGGER IF EXISTS trg_kmb_pertahankan_admin_tokens ON kmb.api_tokens;
DROP FUNCTION IF EXISTS sum._pertahankan_admin_users();
DROP FUNCTION IF EXISTS sum._pertahankan_admin_tokens();
DROP FUNCTION IF EXISTS kmb._pertahankan_admin_users();
DROP FUNCTION IF EXISTS kmb._pertahankan_admin_tokens();
DROP TABLE IF EXISTS sum.admin_users_supabase;
DROP TABLE IF EXISTS sum.admin_tokens_supabase;
DROP TABLE IF EXISTS kmb.admin_users_supabase;
DROP TABLE IF EXISTS kmb.admin_tokens_supabase;

DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE (n.nspname = 'public' AND p.proname ~ '^_?(sum|kmbtra|kmb)_(admin_|validasi_admin_token)')
        OR (n.nspname = 'sum' AND p.proname = '_cek_is_admin')
  LOOP
    EXECUTE 'DROP FUNCTION ' || f;
  END LOOP;
END $$;
