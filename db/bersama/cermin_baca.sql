-- Isi cermin satu kamar untuk kode GAS asli yang berjalan di luar Google (workers/bersama/gas-layanan.js,
-- tools/kembar/gas-lokal.mjs). Bentuknya per sheet: header + baris `nilai` berurutan `baris`, sama dengan
-- getDataRange().getValues(); `tanggal` menandai kolom yang selnya dikembalikan menjadi Date.
--
-- Satu fungsi untuk semua kamar: nama skema diberikan pemanggil, dan hanya skema yang punya cermin_header
-- yang dilayani.
--   p_tidak_dimuat  sheet yang hanya ditandai tidak_dimuat (misalnya ProcessedOps untuk aksi baca); kode GAS
--                   yang membacanya tercatat dan jawabannya ditolak.
--   p_jarang        { "<sheet>": { "kolom": "<header>", "nilai": "<teks>" } }: sheet dimuat JARANG, hanya baris
--                   yang kolomnya sama persis dengan nilai itu (dengan nomor barisnya) ditambah jumlah baris.
--                   Untuk ProcessedOps pada aksi tulis: GAS hanya mencari op_id kiriman ini lalu menambah satu
--                   baris, jadi seluruh isi sheet tidak perlu dikirim.
-- sinkron_at per sheet adalah versinya: public.cermin_tulis hanya menyimpan bila versi itu belum berubah.
--
-- Isinya mentah, termasuk token di ApiTokens. Karena itu hanya service_role yang boleh memanggil;
-- anon dan authenticated tidak. Token diperiksa oleh kode GAS itu sendiri (_resolveToken).
DROP FUNCTION IF EXISTS public.cermin_baca(text, text[]);

CREATE OR REPLACE FUNCTION public.cermin_baca(p_skema text, p_tidak_dimuat text[] DEFAULT '{}'::text[], p_jarang jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_meta    jsonb;
  v_bagian  jsonb[] := '{}';
  v_rows    jsonb;
  v_jumlah  integer;
  v_tanggal jsonb;
  j         jsonb;
  r         record;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT coalesce(jsonb_object_agg(kunci, nilai), ''{}''::jsonb) FROM %I.cermin_meta', p_skema)
     INTO v_meta;

  FOR r IN EXECUTE format('SELECT sheet, tabel, headers, tipe, sinkron_at::text AS versi FROM %I.cermin_header ORDER BY sheet', p_skema) LOOP
    IF r.sheet = ANY (coalesce(p_tidak_dimuat, '{}'::text[])) THEN
      v_bagian := v_bagian || jsonb_build_object(r.sheet, jsonb_build_object('tidak_dimuat', true));
      CONTINUE;
    END IF;
    v_tanggal := (SELECT coalesce(jsonb_agg(coalesce(r.tipe ->> u.h, '') LIKE '%tanggal%' ORDER BY u.i), '[]'::jsonb)
                    FROM unnest(r.headers) WITH ORDINALITY AS u(h, i));
    j := coalesce(p_jarang, '{}'::jsonb) -> r.sheet;
    IF j IS NOT NULL THEN
      IF NOT (j ->> 'kolom') = ANY (r.headers) THEN
        RAISE EXCEPTION 'sheet % tidak punya kolom %', r.sheet, j ->> 'kolom' USING ERRCODE = '22023';
      END IF;
      EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''baris'', baris, ''nilai'', nilai) ORDER BY baris), ''[]''::jsonb)
                        FROM %I.%I WHERE data ->> $1 = $2', p_skema, r.tabel)
         INTO v_rows USING j ->> 'kolom', j ->> 'nilai';
      EXECUTE format('SELECT coalesce(max(baris) - 1, 0) FROM %I.%I', p_skema, r.tabel) INTO v_jumlah;
      v_bagian := v_bagian || jsonb_build_object(r.sheet, jsonb_build_object(
        'headers', to_jsonb(r.headers), 'tanggal', v_tanggal, 'tipe', r.tipe, 'sinkron_at', r.versi,
        'jarang', jsonb_build_object('kolom', j ->> 'kolom', 'nilai', j ->> 'nilai'),
        'baris_dimuat', v_rows, 'jumlah_baris', v_jumlah));
      CONTINUE;
    END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(nilai ORDER BY baris), ''[]''::jsonb) FROM %I.%I', p_skema, r.tabel)
       INTO v_rows;
    v_bagian := v_bagian || jsonb_build_object(r.sheet, jsonb_build_object(
      'headers', to_jsonb(r.headers), 'tanggal', v_tanggal, 'rows', v_rows, 'sinkron_at', r.versi));
  END LOOP;

  -- Satu penggabungan di akhir, bukan menyambung objek yang terus membesar di setiap putaran.
  RETURN jsonb_build_object('meta', v_meta,
    'sheets', (SELECT coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) FROM unnest(v_bagian) AS b(o), jsonb_each(b.o) AS k));
END;
$$;

REVOKE ALL ON FUNCTION public.cermin_baca(text, text[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_baca(text, text[], jsonb) TO service_role;
