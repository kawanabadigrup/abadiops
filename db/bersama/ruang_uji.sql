-- Ruang uji di Gedung 1 (docs/SAKLAR.md, keputusan Gabriel 14 Nov): uji_<skema> = salinan persis cermin asli
-- <skema>, disegarkan dengan SQL di dalam database (tanpa egress, tanpa Google API). Worker uji dan uji kembar
-- membaca/menulis uji_*; cermin asli tidak pernah ditulis sebelum jam mulai rumah itu (kunci di cermin_tulis.sql).
--
-- Pemakaian (sebagai pemilik database, misalnya lewat DATABASE_URL Gedung 1):
--   SELECT public.cermin_salin_ke_uji('kmbbupr');   -- membuang uji_kmbbupr lama lalu menyalin ulang
--
-- Hanya pemilik database yang boleh menjalankan: menyalin ulang membuang semua tulisan uji di uji_<skema>.
CREATE OR REPLACE FUNCTION public.cermin_salin_ke_uji(p_skema text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_uji   text := 'uji_' || p_skema;
  r       record;
  v_seq   text;
  n_tabel integer := 0;
  n_baris bigint := 0;
  c       bigint;
BEGIN
  IF p_skema IS NULL OR left(p_skema, 4) = 'uji_' OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin asli', p_skema USING ERRCODE = '22023';
  END IF;

  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_uji);
  EXECUTE format('CREATE SCHEMA %I', v_uji);

  FOR r IN SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
            WHERE ns.nspname = p_skema AND cl.relkind = 'r' ORDER BY cl.relname LOOP
    EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL)', v_uji, r.relname, p_skema, r.relname);
    EXECUTE format('INSERT INTO %I.%I SELECT * FROM %I.%I', v_uji, r.relname, p_skema, r.relname);
    GET DIAGNOSTICS c = ROW_COUNT;
    n_tabel := n_tabel + 1;
    n_baris := n_baris + c;
  END LOOP;

  -- Kolom serial (misalnya cermin_log.id) yang tersalin masih memakai sequence skema asli: beri sequence sendiri.
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = v_uji AND column_default LIKE 'nextval(%' LOOP
    v_seq := r.table_name || '_' || r.column_name || '_seq';
    EXECUTE format('CREATE SEQUENCE %I.%I OWNED BY %I.%I.%I', v_uji, v_seq, v_uji, r.table_name, r.column_name);
    EXECUTE format('SELECT setval(%L::regclass, coalesce((SELECT max(%I) FROM %I.%I), 0) + 1, false)',
                   format('%I.%I', v_uji, v_seq), r.column_name, v_uji, r.table_name);
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT nextval(%L::regclass)',
                   v_uji, r.table_name, r.column_name, format('%I.%I', v_uji, v_seq));
  END LOOP;

  -- Sama dengan cermin asli: tertutup untuk peran publik. Worker membaca/menulis lewat fungsi SECURITY DEFINER.
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC, anon, authenticated', v_uji);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC, anon, authenticated', v_uji);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC, anon, authenticated', v_uji);

  EXECUTE format('INSERT INTO %I.cermin_meta (kunci, nilai, diubah_at) VALUES (''disalin_dari'', $1, now())
                  ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, diubah_at = now()', v_uji)
    USING p_skema || ' @ ' || now()::text;

  RETURN jsonb_build_object('skema', v_uji, 'tabel', n_tabel, 'baris', n_baris);
END;
$$;

REVOKE ALL ON FUNCTION public.cermin_salin_ke_uji(text) FROM PUBLIC, anon, authenticated, service_role;
