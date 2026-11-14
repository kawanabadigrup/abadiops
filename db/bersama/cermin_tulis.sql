-- Simpan tulisan kode GAS yang berjalan di Worker (workers/bersama/gas-simpan.js) ke cermin satu kamar.
-- Semua sheet dalam satu panggilan disimpan dalam SATU transaksi: semuanya, atau tidak sama sekali.
--
-- Konkurensi optimistis, pengganti LockService: setiap sheet membawa sinkron_at yang dibaca
-- public.cermin_baca. Bila sinkron_at sheet mana pun sudah berubah (penulis lain lebih dulu), tidak ada yang
-- disimpan dan galat diawali 'KONFLIK:' (SQLSTATE PT409, dijawab PostgREST sebagai HTTP 409). Worker lalu
-- membaca ulang dan menjalankan ulang GAS. Jangan 40001: pustaka transaksi PostgREST mengulang sendiri
-- transaksi yang gagal dengan kode itu, dengan versi lama yang sama, sampai gerbang Supabase menyerah (504).
--
-- p_perubahan: { "<sheet>": { sinkron_at, headers, tipe, jumlah_baris, sidik,
--                             tulis: [{ baris, nilai, data }] } }
--   tulis       baris yang baru atau berubah (baris = nomor baris di sheet; data mulai baris 2)
--   jumlah_baris  jumlah baris data sesudah ditulis; baris di bawahnya dihapus (deleteRow menggeser naik)
--
-- Hanya service_role yang boleh memanggil.
CREATE OR REPLACE FUNCTION public.cermin_tulis(p_skema text, p_perubahan jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  k        text;
  s        jsonb;
  v_tabel  text;
  v_versi  text;
  n_tulis  integer;
  n_hapus  integer;
  v_hasil  jsonb := '{}'::jsonb;
BEGIN
  IF p_skema IS NULL OR to_regclass(format('%I.cermin_header', p_skema)) IS NULL THEN
    RAISE EXCEPTION 'skema % bukan cermin', p_skema USING ERRCODE = '22023';
  END IF;

  -- Kunci dan periksa dulu semua sheet, berurutan nama, supaya dua penulis tidak saling menunggu silang.
  FOR k IN SELECT x FROM jsonb_object_keys(p_perubahan) AS x ORDER BY x LOOP
    s := p_perubahan -> k;
    v_tabel := NULL;
    EXECUTE format('SELECT tabel, sinkron_at::text FROM %I.cermin_header WHERE sheet = $1 FOR UPDATE', p_skema)
       INTO v_tabel, v_versi USING k;
    IF v_tabel IS NULL THEN
      RAISE EXCEPTION 'sheet % tidak ada di cermin %', k, p_skema USING ERRCODE = '22023';
    END IF;
    IF v_versi IS DISTINCT FROM (s ->> 'sinkron_at') THEN
      RAISE EXCEPTION 'KONFLIK: sheet % berubah sejak dibaca', k USING ERRCODE = 'PT409';
    END IF;
  END LOOP;

  FOR k IN SELECT x FROM jsonb_object_keys(p_perubahan) AS x ORDER BY x LOOP
    s := p_perubahan -> k;
    EXECUTE format('SELECT tabel FROM %I.cermin_header WHERE sheet = $1', p_skema) INTO v_tabel USING k;

    EXECUTE format('DELETE FROM %I.%I WHERE baris > $1', p_skema, v_tabel)
      USING (s ->> 'jumlah_baris')::integer + 1;
    GET DIAGNOSTICS n_hapus = ROW_COUNT;

    EXECUTE format(
      'INSERT INTO %I.%I AS t (baris, nilai, data)
         SELECT (x ->> ''baris'')::integer, x -> ''nilai'', x -> ''data'' FROM jsonb_array_elements($1) AS x
       ON CONFLICT (baris) DO UPDATE SET nilai = EXCLUDED.nilai, data = EXCLUDED.data, sinkron_at = now()
       WHERE t.nilai IS DISTINCT FROM EXCLUDED.nilai OR t.data IS DISTINCT FROM EXCLUDED.data', p_skema, v_tabel)
      USING coalesce(s -> 'tulis', '[]'::jsonb);
    GET DIAGNOSTICS n_tulis = ROW_COUNT;

    EXECUTE format(
      'UPDATE %I.cermin_header
          SET headers = ARRAY(SELECT jsonb_array_elements_text($2)), tipe = $3, jumlah_baris = $4, sidik = $5,
              sinkron_at = clock_timestamp()
        WHERE sheet = $1', p_skema)
      USING k, s -> 'headers', s -> 'tipe', (s ->> 'jumlah_baris')::integer, s ->> 'sidik';

    v_hasil := v_hasil || jsonb_build_object(k, jsonb_build_object('ditulis', n_tulis, 'dihapus', n_hapus));
  END LOOP;

  EXECUTE format(
    'INSERT INTO %I.cermin_meta (kunci, nilai, diubah_at) VALUES (''tulis_worker_terakhir'', $1, now())
     ON CONFLICT (kunci) DO UPDATE SET nilai = EXCLUDED.nilai, diubah_at = now()', p_skema)
    USING now()::text;

  RETURN jsonb_build_object('ok', true, 'sheet', v_hasil);
END;
$$;

REVOKE ALL ON FUNCTION public.cermin_tulis(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cermin_tulis(text, jsonb) TO service_role;
