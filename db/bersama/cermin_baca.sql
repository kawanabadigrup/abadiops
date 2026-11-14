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
--   p_hanya         bila diisi, hanya sheet ini yang dikembalikan (sheet lain tidak disebut sama sekali). Untuk pusat
--                   admin di pintu, yang menyunting satu-dua sheet config tanpa memuat sheet transaksi yang besar.
--                   Nama semua sheet tetap ada di "semua_sheet".
-- sinkron_at per sheet adalah versinya: public.cermin_tulis hanya menyimpan bila versi itu belum berubah.
--
-- Isinya mentah, termasuk token di ApiTokens. Karena itu hanya service_role yang boleh memanggil;
-- anon dan authenticated tidak. Token diperiksa oleh kode GAS itu sendiri (_resolveToken).
--
-- Hasilnya disusun sebagai TEKS JSON lalu dikembalikan sebagai json: baris `nilai` (jsonb) disambung dengan
-- string_agg(nilai::text). Membangun objek jsonb besar (jsonb_agg) ±28× lebih lambat: WorkOrders_Archive SUM
-- (9,7 MB) 8,8 detik vs 0,3 detik, melewati batas waktu query API Supabase (galat 57014, BUG-DICATAT #41).
-- Bentuk jawabannya sama dengan versi jsonb.
DROP FUNCTION IF EXISTS public.cermin_baca(text, text[]);
DROP FUNCTION IF EXISTS public.cermin_baca(text, text[], jsonb);
DROP FUNCTION IF EXISTS public.cermin_baca(text, text[], jsonb, text[]);

CREATE FUNCTION public.cermin_baca(p_skema text, p_tidak_dimuat text[] DEFAULT '{}'::text[], p_jarang jsonb DEFAULT '{}'::jsonb, p_hanya text[] DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_meta    text;
  v_semua   text;
  v_bagian  text[] := '{}';
  v_rows    text;
  v_jumlah  integer;
  v_tanggal text;
  j         jsonb;
  r         record;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT coalesce(jsonb_object_agg(kunci, nilai), ''{}''::jsonb)::text FROM %I.cermin_meta', p_skema)
     INTO v_meta;

  EXECUTE format('SELECT coalesce(jsonb_agg(sheet ORDER BY sheet), ''[]''::jsonb)::text FROM %I.cermin_header', p_skema)
     INTO v_semua;

  FOR r IN EXECUTE format('SELECT sheet, tabel, headers, tipe, sinkron_at::text AS versi FROM %I.cermin_header ORDER BY sheet', p_skema) LOOP
    IF p_hanya IS NOT NULL AND NOT (r.sheet = ANY (p_hanya)) THEN
      CONTINUE;
    END IF;
    IF r.sheet = ANY (coalesce(p_tidak_dimuat, '{}'::text[])) THEN
      v_bagian := v_bagian || (to_jsonb(r.sheet)::text || ':{"tidak_dimuat":true}');
      CONTINUE;
    END IF;
    v_tanggal := (SELECT coalesce(jsonb_agg(coalesce(r.tipe ->> u.h, '') LIKE '%tanggal%' ORDER BY u.i), '[]'::jsonb)::text
                    FROM unnest(r.headers) WITH ORDINALITY AS u(h, i));
    j := coalesce(p_jarang, '{}'::jsonb) -> r.sheet;
    IF j IS NOT NULL THEN
      IF NOT (j ->> 'kolom') = ANY (r.headers) THEN
        RAISE EXCEPTION 'sheet % tidak punya kolom %', r.sheet, j ->> 'kolom' USING ERRCODE = '22023';
      END IF;
      -- Sheet jarang: sedikit baris, jadi tetap dibangun sebagai jsonb.
      EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''baris'', baris, ''nilai'', nilai) ORDER BY baris), ''[]''::jsonb)::text
                        FROM %I.%I WHERE data ->> $1 = $2', p_skema, r.tabel)
         INTO v_rows USING j ->> 'kolom', j ->> 'nilai';
      EXECUTE format('SELECT coalesce(max(baris) - 1, 0) FROM %I.%I', p_skema, r.tabel) INTO v_jumlah;
      v_bagian := v_bagian || (to_jsonb(r.sheet)::text || ':' || jsonb_build_object(
        'headers', to_jsonb(r.headers), 'tipe', r.tipe, 'sinkron_at', r.versi,
        'jarang', jsonb_build_object('kolom', j ->> 'kolom', 'nilai', j ->> 'nilai'),
        'jumlah_baris', v_jumlah)::text);
      -- sisipkan "tanggal" dan "baris_dimuat" (sudah teks) ke objek di atas
      v_bagian[array_length(v_bagian, 1)] := left(v_bagian[array_length(v_bagian, 1)], -1)
        || ',"tanggal":' || v_tanggal || ',"baris_dimuat":' || v_rows || '}';
      CONTINUE;
    END IF;
    EXECUTE format('SELECT ''['' || coalesce(string_agg(nilai::text, '','' ORDER BY baris), '''') || '']'' FROM %I.%I', p_skema, r.tabel)
       INTO v_rows;
    v_bagian := v_bagian || (to_jsonb(r.sheet)::text || ':{"headers":' || to_jsonb(r.headers)::text
      || ',"tanggal":' || v_tanggal || ',"rows":' || v_rows || ',"sinkron_at":' || to_jsonb(r.versi)::text || '}');
  END LOOP;

  RETURN ('{"meta":' || v_meta || ',"semua_sheet":' || v_semua || ',"sheets":{' || array_to_string(v_bagian, ',') || '}}')::json;
END;
$$;

REVOKE ALL ON FUNCTION public.cermin_baca(text, text[], jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_baca(text, text[], jsonb, text[]) TO service_role;
