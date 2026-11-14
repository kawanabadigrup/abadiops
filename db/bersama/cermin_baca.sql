-- Isi cermin satu kamar untuk kode GAS asli yang berjalan di luar Google (workers/bersama/gas-layanan.js,
-- tools/kembar/gas-lokal.mjs). Bentuknya per sheet: header + baris `nilai` berurutan `baris`, sama dengan
-- getDataRange().getValues(); `tanggal` menandai kolom yang selnya dikembalikan menjadi Date.
--
-- Satu fungsi untuk semua kamar: nama skema diberikan pemanggil, dan hanya skema yang punya cermin_header
-- yang dilayani. Sheet di p_tidak_dimuat (misalnya ProcessedOps yang besar) hanya ditandai tidak_dimuat;
-- kode GAS yang membacanya akan tercatat dan jawabannya ditolak.
--
-- Isinya mentah, termasuk token di ApiTokens. Karena itu hanya service_role yang boleh memanggil;
-- anon dan authenticated tidak. Token diperiksa oleh kode GAS itu sendiri (_resolveToken).
CREATE OR REPLACE FUNCTION public.cermin_baca(p_skema text, p_tidak_dimuat text[] DEFAULT '{}'::text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_meta   jsonb;
  v_sheets jsonb := '{}'::jsonb;
  v_rows   jsonb;
  r        record;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT coalesce(jsonb_object_agg(kunci, nilai), ''{}''::jsonb) FROM %I.cermin_meta', p_skema)
     INTO v_meta;

  FOR r IN EXECUTE format('SELECT sheet, tabel, headers, tipe FROM %I.cermin_header ORDER BY sheet', p_skema) LOOP
    IF r.sheet = ANY (coalesce(p_tidak_dimuat, '{}'::text[])) THEN
      v_sheets := v_sheets || jsonb_build_object(r.sheet, jsonb_build_object('tidak_dimuat', true));
      CONTINUE;
    END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(nilai ORDER BY baris), ''[]''::jsonb) FROM %I.%I', p_skema, r.tabel)
       INTO v_rows;
    v_sheets := v_sheets || jsonb_build_object(r.sheet, jsonb_build_object(
      'headers', to_jsonb(r.headers),
      'tanggal', (SELECT coalesce(jsonb_agg(coalesce(r.tipe ->> u.h, '') LIKE '%tanggal%' ORDER BY u.i), '[]'::jsonb)
                    FROM unnest(r.headers) WITH ORDINALITY AS u(h, i)),
      'rows', v_rows));
  END LOOP;

  RETURN jsonb_build_object('meta', v_meta, 'sheets', v_sheets);
END;
$$;

REVOKE ALL ON FUNCTION public.cermin_baca(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_baca(text, text[]) TO service_role;
