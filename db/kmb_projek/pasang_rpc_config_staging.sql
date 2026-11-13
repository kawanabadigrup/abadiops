-- ==============================================================================
-- PERBAIKAN PENUH PENCOCOKAN WO MEKANIK SUM V2 (`sum`) & CASCADE + WO MEKANIK KMB (`kmb`)
-- ==============================================================================

-- Helper pencocokan kode ID mekanik tahan format (mengabaikan tanda hubung/spasi & nol di depan, mis. SUM-01 == SUM-001)
CREATE OR REPLACE FUNCTION public._kode_mekanik_kanonik(p_val text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(upper(btrim(coalesce(p_val, ''))), '[^A-Z0-9]', '', 'g'),
           '^([A-Z]+)0+([1-9][0-9]*)$',
           '\1\2'
         );
$$;

-- Helper pembaca JSONB tahan spasi/huruf besar/underscore untuk tabel cermin Spreadsheet
CREATE OR REPLACE FUNCTION public._ambil_teks_jsonb(p_data jsonb, VARIADIC p_kunci text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  v text;
  rec record;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN '';
  END IF;
  -- 1. Cek kecocokan langsung
  FOREACH k IN ARRAY p_kunci LOOP
    v := btrim(coalesce(p_data->>k, ''));
    IF v <> '' THEN RETURN v; END IF;
  END LOOP;
  -- 2. Cek kecocokan tanpa memedulikan huruf besar/spasi/underscore
  FOR rec IN SELECT key, value FROM jsonb_each_text(p_data) LOOP
    v := btrim(coalesce(rec.value, ''));
    IF v <> '' THEN
      FOREACH k IN ARRAY p_kunci LOOP
        IF lower(regexp_replace(rec.key, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(k, '[^a-zA-Z0-9]', '', 'g')) THEN
          RETURN v;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN '';
END;
$$;

-- A. FUNGSI PENCOCOKAN WO MEKANIK SUM V2 (Menangani semua variasi WO di work_orders, work_order_team, & wo_supabase)
CREATE OR REPLACE FUNCTION sum._normalisasi_status_wo_sum(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := lower(btrim(coalesce(p_status, '')));
BEGIN
  IF s IN ('', 'open', 'active', 'assigned', 'in_progress', 'in progress', 'draft', 'revised', 'returned', 'kembali', 'kembalikan', 'waiting_mechanic', 'pending_mechanic', 'pending_mechanic_work', 'belum', 'on_progress', 'revisi') THEN
    RETURN 'pending_mechanic_work';
  ELSIF s IN ('pending_l1', 'pending_supervisor', 'waiting_l1', 'submitted', 'menunggu_l1') THEN
    RETURN 'pending_supervisor';
  ELSIF s IN ('pending_l2', 'pending_superintendent', 'waiting_l2', 'approved_l1', 'menunggu_l2') THEN
    RETURN 'pending_superintendent';
  ELSIF s = 'pending_transfer' THEN
    RETURN 'pending_transfer';
  ELSIF s IN ('approved', 'done', 'completed', 'closed', 'approved_l2', 'selesai') THEN
    RETURN 'approved';
  ELSIF s IN ('rejected', 'ditolak') THEN
    RETURN 'rejected';
  ELSIF s IN ('cancelled', 'canceled', 'batal') THEN
    RETURN 'cancelled';
  ELSIF s = 'expired' THEN
    RETURN 'expired';
  END IF;
  RETURN 'pending_mechanic_work';
END;
$$;

CREATE OR REPLACE FUNCTION sum._wo_milik_mekanik_sum(
  p_wo     jsonb,
  p_mid    text,
  p_mname  text DEFAULT '',
  p_memail text DEFAULT '',
  p_mid2   text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_id1      text := upper(btrim(coalesce(p_mid, '')));
  v_id2      text := upper(btrim(coalesce(p_mid2, '')));
  v_kanon1   text := public._kode_mekanik_kanonik(p_mid);
  v_kanon2   text := public._kode_mekanik_kanonik(p_mid2);
  v_name     text := upper(btrim(coalesce(p_mname, '')));
  v_email    text := lower(btrim(coalesce(p_memail, '')));
  v_kandidat text;
BEGIN
  IF v_id1 = '' AND v_id2 = '' AND v_name = '' AND v_email = '' THEN
    RETURN false;
  END IF;

  -- 1. Cek seluruh field tunggal di objek WO
  FOR v_kandidat IN
    SELECT unnest(ARRAY[
      coalesce(p_wo->>'lead_mechanic_id', ''),
      coalesce(p_wo->>'mechanic_id', ''),
      coalesce(p_wo->>'assigned_to', ''),
      coalesce(p_wo->>'mechanic_name', ''),
      coalesce(p_wo->>'lead_mechanic_name', ''),
      coalesce(p_wo->>'name', '')
    ])
  LOOP
    v_kandidat := btrim(v_kandidat);
    IF v_kandidat <> '' THEN
      IF (v_id1 <> '' AND upper(v_kandidat) = v_id1)
         OR (v_id2 <> '' AND upper(v_kandidat) = v_id2)
         OR (v_kanon1 <> '' AND public._kode_mekanik_kanonik(v_kandidat) = v_kanon1)
         OR (v_kanon2 <> '' AND public._kode_mekanik_kanonik(v_kandidat) = v_kanon2)
         OR (v_name <> '' AND upper(v_kandidat) = v_name) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  IF v_email <> '' AND lower(btrim(coalesce(p_wo->>'email', p_wo->>'mechanic_email', ''))) = v_email THEN
    RETURN true;
  END IF;

  -- 2. Cek array `team` & `effective_team` (mendukung elemen objek maupun string langsung)
  IF jsonb_typeof(p_wo->'team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'team') el
       WHERE (v_id1 <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', ''))) = v_id1)
          OR (v_id2 <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', ''))) = v_id2)
          OR (v_kanon1 <> '' AND public._kode_mekanik_kanonik(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', '')) = v_kanon1)
          OR (v_kanon2 <> '' AND public._kode_mekanik_kanonik(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', '')) = v_kanon2)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', el #>> '{}', ''))) = v_name)
          OR (v_email <> '' AND lower(btrim(coalesce(el->>'email', ''))) = v_email)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'effective_team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'effective_team') el
       WHERE (v_id1 <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', ''))) = v_id1)
          OR (v_id2 <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', ''))) = v_id2)
          OR (v_kanon1 <> '' AND public._kode_mekanik_kanonik(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', '')) = v_kanon1)
          OR (v_kanon2 <> '' AND public._kode_mekanik_kanonik(coalesce(el->>'mechanic_id', el->>'id', el->>'user_id', el #>> '{}', '')) = v_kanon2)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', el #>> '{}', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'team_names') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_wo->'team_names') tn
       WHERE (v_name <> '' AND upper(btrim(tn)) = v_name)
          OR (v_id1 <> '' AND upper(btrim(tn)) = v_id1)
          OR (v_kanon1 <> '' AND public._kode_mekanik_kanonik(tn) = v_kanon1)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'team_distribution') = 'object' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(p_wo->'team_distribution') td
       WHERE (v_id1 <> '' AND upper(btrim(td.key)) = v_id1)
          OR (v_id2 <> '' AND upper(btrim(td.key)) = v_id2)
          OR (v_kanon1 <> '' AND public._kode_mekanik_kanonik(td.key) = v_kanon1)
          OR (v_kanon2 <> '' AND public._kode_mekanik_kanonik(td.key) = v_kanon2)
          OR (v_name <> '' AND upper(btrim(td.key)) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  -- 3. Cek daftar dipisah koma/titik koma pada `mechanic_ids` maupun `mechanics`
  IF coalesce(p_wo->>'mechanic_ids', p_wo->>'mechanics', '') <> '' THEN
    IF EXISTS (
      SELECT 1 FROM regexp_split_to_table(coalesce(p_wo->>'mechanic_ids', '') || ',' || coalesce(p_wo->>'mechanics', ''), '[,;]') s
       WHERE btrim(s) <> ''
         AND (
              (v_id1 <> '' AND upper(btrim(s)) = v_id1)
           OR (v_id2 <> '' AND upper(btrim(s)) = v_id2)
           OR (v_kanon1 <> '' AND public._kode_mekanik_kanonik(s) = v_kanon1)
           OR (v_kanon2 <> '' AND public._kode_mekanik_kanonik(s) = v_kanon2)
           OR (v_name <> '' AND upper(btrim(s)) = v_name)
         )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Perbaiki otomatis baris di sum.wo_supabase yang memiliki team kosong tetapi punya team_distribution / lead_mechanic_id
DO $$
BEGIN
  IF to_regclass('sum.wo_supabase') IS NOT NULL THEN
    UPDATE sum.wo_supabase s
       SET team = (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
               'mechanic_id', td.key,
               'mechanic_name', td.key,
               'name', td.key,
               'percentage', coalesce(nullif(td.value, '')::numeric, 100)
             )), '[]'::jsonb)
               FROM jsonb_each_text(s.data->'team_distribution') td
              WHERE btrim(td.key) <> '' AND lower(btrim(td.key)) <> 'undefined'
           ),
           data = s.data || jsonb_build_object(
             'team', (
               SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'mechanic_id', td.key,
                 'mechanic_name', td.key,
                 'name', td.key,
                 'percentage', coalesce(nullif(td.value, '')::numeric, 100)
               )), '[]'::jsonb)
                 FROM jsonb_each_text(s.data->'team_distribution') td
                WHERE btrim(td.key) <> '' AND lower(btrim(td.key)) <> 'undefined'
             )
           )
     WHERE jsonb_array_length(coalesce(s.team, '[]'::jsonb)) = 0
       AND jsonb_typeof(s.data->'team_distribution') = 'object';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sum_my_wos(p_mechanic_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mid_in    text := btrim(coalesce(p_mechanic_id, ''));
  v_mid_canon text := '';
  v_mname     text := '';
  v_memail    text := '';
  v_wos       jsonb := '[]'::jsonb;
  v_pulled    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  SELECT coalesce(nullif(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), ''), nullif(btrim(nilai->>0), ''), v_mid_in),
         coalesce(nullif(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), ''), nullif(btrim(nilai->>1), ''), ''),
         coalesce(nullif(public._ambil_teks_jsonb(data, 'email'), ''), nullif(btrim(nilai->>2), ''), '')
    INTO v_mid_canon, v_mname, v_memail
    FROM sum.config_mechanics
   WHERE public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), nilai->>0, '')) = public._kode_mekanik_kanonik(v_mid_in)
      OR upper(btrim(coalesce(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), nilai->>1, ''))) = upper(v_mid_in)
      OR (v_mid_in LIKE '%@%' AND lower(btrim(coalesce(public._ambil_teks_jsonb(data, 'email'), nilai->>2, ''))) = lower(v_mid_in))
   LIMIT 1;

  v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid_in);

  WITH master_mekanik AS (
    SELECT DISTINCT ON (public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)))
           public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)) AS k_id,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)) AS mechanic_id,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)) AS name
      FROM sum.config_mechanics m
     WHERE coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '') <> ''
  ),
  tim_cermin AS (
    SELECT upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id', 'id'), ''), nullif(t.nilai->>0, ''), ''))) AS wo_key,
           jsonb_agg(jsonb_build_object(
             'mechanic_id', coalesce(mm.mechanic_id, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), nullif(btrim(t.nilai->>1), ''), ''),
             'mechanic_name', coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(btrim(t.nilai->>2), ''), nullif(btrim(t.nilai->>1), ''), ''),
             'name', coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(btrim(t.nilai->>2), ''), nullif(btrim(t.nilai->>1), ''), ''),
             'role_in_wo', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'role_in_wo', 'role'), ''), 'lead'),
             'percentage', 100
           )) AS team_arr,
           jsonb_agg(coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id'), ''), nullif(btrim(t.nilai->>1), ''), '')) AS team_names_arr
      FROM sum.work_order_team t
      LEFT JOIN master_mekanik mm
        ON mm.k_id = public._kode_mekanik_kanonik(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), t.nilai->>1, ''))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id'), t.nilai->>0, '')), '') IS NOT NULL
     GROUP BY 1
  ),
  gabungan_wo AS (
    -- 1. WO dari sum.wo_supabase
    SELECT s.data || jsonb_build_object(
             'id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'wo_id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'wo_number', coalesce(nullif(btrim(s.wo_number), ''), btrim(s.id)),
             'status', sum._normalisasi_status_wo_sum(coalesce(s.data->>'status', s.status))
           ) AS wo
      FROM sum.wo_supabase s
     WHERE to_regclass('sum.wo_supabase') IS NOT NULL
       AND nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0'
    UNION ALL
    -- 2. WO dari sum.work_orders + pengayaan tim dari sum.work_order_team
    SELECT w.data || jsonb_build_object(
             'id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'wo_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'wo_number', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), ''), btrim(w.nilai->>0)),
             'status', sum._normalisasi_status_wo_sum(public._ambil_teks_jsonb(w.data, 'status')),
             'unit_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'unit_id', 'unit_code'), ''), 'WORKSHOP'),
             'component_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_id', 'component_no'), ''), 'COM-001'),
             'component_name', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_name', 'others_description', 'activity', 'component_id'), ''), 'Pekerjaan'),
             'team', CASE
               WHEN tc.team_arr IS NOT NULL THEN tc.team_arr
               WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
               ELSE '[]'::jsonb
             END,
             'effective_team', CASE
               WHEN tc.team_arr IS NOT NULL THEN tc.team_arr
               WHEN jsonb_typeof(w.data->'effective_team') = 'array' AND jsonb_array_length(w.data->'effective_team') > 0 THEN w.data->'effective_team'
               WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
               ELSE '[]'::jsonb
             END,
             'team_names', COALESCE(tc.team_names_arr, CASE WHEN jsonb_typeof(w.data->'team_names') = 'array' THEN w.data->'team_names' ELSE '[]'::jsonb END)
           ) AS wo
      FROM sum.work_orders w
      LEFT JOIN tim_cermin tc
        ON tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), w.nilai->>0, '')))
        OR tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number'), ''), w.nilai->>0, '')))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, ''))) <> 'WO-0'
       AND NOT EXISTS (
         SELECT 1 FROM sum.wo_supabase s2
          WHERE s2.id = coalesce(public._ambil_teks_jsonb(w.data, 'wo_id', 'id'), '')
             OR s2.wo_number = coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id'), '')
       )
  ),
  milik_mekanik AS (
    SELECT wo FROM gabungan_wo
     WHERE sum._wo_milik_mekanik_sum(wo, v_mid_canon, v_mname, v_memail, v_mid_in)
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY coalesce(wo->>'created_at', '') DESC), '[]'::jsonb)
    INTO v_wos
    FROM milik_mekanik;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
    'data', jsonb_build_object('wos', v_wos)
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_mid   text := '';
BEGIN
  IF v_clean = '' THEN
    RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
  END IF;

  SELECT coalesce(
           nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''),
           nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), ''),
           nullif(btrim(t.nilai->>1), ''),
           nullif(public._ambil_teks_jsonb(t.data, 'name', 'email'), ''),
           ''
         )
    INTO v_mid
    FROM sum.api_tokens t
    LEFT JOIN sum.config_mechanics m
      ON public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '')) = public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, ''))
      OR (nullif(public._ambil_teks_jsonb(t.data, 'email'), '') IS NOT NULL AND lower(public._ambil_teks_jsonb(m.data, 'email')) = lower(public._ambil_teks_jsonb(t.data, 'email')))
   WHERE btrim(coalesce(public._ambil_teks_jsonb(t.data, 'token'), t.nilai->>0, '')) = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(btrim(t.data->>'is_active')) <> 'false')
   LIMIT 1;

  IF coalesce(v_mid, '') = '' THEN
    SELECT coalesce(nullif(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), ''), btrim(nilai->>0))
      INTO v_mid
      FROM sum.config_mechanics
     WHERE btrim(public._ambil_teks_jsonb(data, 'token')) = v_clean
     LIMIT 1;
  END IF;

  IF coalesce(v_mid, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
  END IF;

  RETURN public.sum_my_wos(v_mid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sum_my_wos_bertoken(text) TO anon, authenticated, service_role;

-- B. FUNGSI KATALOG CASCADE KMB TRA / V2 (`kmbtra_create_refs` & `kmbtra_create_refs_bertoken`)
-- Menjamin rantai Unit -> Component -> Sub Component -> Job 100% tersambung tanpa putus!
CREATE OR REPLACE FUNCTION public.kmbtra_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units         jsonb := '[]'::jsonb;
  v_mechs         jsonb := '[]'::jsonb;
  v_comps         jsonb := '[]'::jsonb;
  v_jobs_field    jsonb := '[]'::jsonb;
  v_jobs_workshop jsonb := '[]'::jsonb;
  v_refs          jsonb;
  v_pulled        text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  -- 1. Mechanics (sertakan id dan mechanic_id)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)),
    'mechanic_id', coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)),
    'mechanic_name', coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)),
    'name', coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)),
    'section', coalesce(nullif(public._ambil_teks_jsonb(m.data, 'section'), ''), nullif(btrim(m.nilai->>4), ''), 'field'),
    'position', coalesce(nullif(public._ambil_teks_jsonb(m.data, 'position', 'grade'), ''), nullif(btrim(m.nilai->>5), ''), 'junior')
  ) ORDER BY coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)), '[]'::jsonb)
  INTO v_mechs
  FROM kmb.config_mechanics m
  WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '')), '') IS NOT NULL
    AND lower(btrim(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'role'), ''), nullif(m.nilai->>3, ''), 'mechanic'))) = 'mechanic'
    AND upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE';

  -- 2. Components
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(nullif(public._ambil_teks_jsonb(c.data, 'component_id', 'component_no', 'id'), ''), btrim(c.nilai->>0)),
    'component_id', coalesce(nullif(public._ambil_teks_jsonb(c.data, 'component_id', 'component_no', 'id'), ''), btrim(c.nilai->>0)),
    'component_no', coalesce(nullif(public._ambil_teks_jsonb(c.data, 'component_no', 'component_id', 'id'), ''), btrim(c.nilai->>0)),
    'component_name', coalesce(nullif(public._ambil_teks_jsonb(c.data, 'component_name', 'name'), ''), nullif(btrim(c.nilai->>1), ''), btrim(c.nilai->>0)),
    'category', coalesce(nullif(public._ambil_teks_jsonb(c.data, 'category', 'section'), ''), nullif(btrim(c.nilai->>2), ''), 'General'),
    'base_points', coalesce(nullif(regexp_replace(coalesce(nullif(public._ambil_teks_jsonb(c.data, 'base_points', 'base_point', 'points'), ''), c.nilai->>3, '1.25'), '[^0-9.]', '', 'g'), '')::numeric, 1.25),
    'target_hours', coalesce(nullif(regexp_replace(coalesce(nullif(public._ambil_teks_jsonb(c.data, 'target_hours', 'plan_hours', 'hours'), ''), c.nilai->>4, '2.0'), '[^0-9.]', '', 'g'), '')::numeric, 2.0)
  ) ORDER BY coalesce(public._ambil_teks_jsonb(c.data, 'component_id', 'component_no'), c.nilai->>0)), '[]'::jsonb)
  INTO v_comps
  FROM kmb.config_components c
  WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(c.data, 'component_id', 'component_no', 'id'), c.nilai->>0, '')), '') IS NOT NULL
    AND upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(c.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE';

  -- 3. Jobs Field (mendeteksi otomatis tata letak kolom Spreadsheet 6-kolom maupun 7-kolom & membaca seluruh variasi nama kunci JSONB)
  IF to_regclass('kmb.config_jobs_field') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', jid,
      'job_id', jid,
      'unit_model', umod,
      'model', umod,
      'component', comp,
      'component_name', comp,
      'sub_component', sub,
      'sub_component_name', sub,
      'job_description', jdesc,
      'job_name', jdesc,
      'activity', jdesc,
      'plan_hours', ph,
      'target_hours', ph,
      'base_point', GREATEST(bp, ph),
      'base_points', GREATEST(bp, ph),
      'job_type', jtype
    ) ORDER BY comp, sub, jdesc), '[]'::jsonb)
    INTO v_jobs_field
    FROM (
      SELECT coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'job_id', 'id', 'code', 'job_code'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN 'JOB-F-' || j.baris::text ELSE nullif(btrim(j.nilai->>0), '') END,
               'JOB-F-' || j.baris::text
             ) AS jid,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'unit_model', 'model', 'unit_type', 'type', 'model_unit'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>0), '') ELSE nullif(btrim(j.nilai->>1), '') END,
               ''
             ) AS umod,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'component', 'component_name', 'main_component', 'komponen', 'category'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>1), '') ELSE nullif(btrim(j.nilai->>2), '') END,
               'General'
             ) AS comp,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'sub_component', 'sub_component_name', 'subcomponent', 'sub_komponen', 'sub_category'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>2), '') ELSE nullif(btrim(j.nilai->>3), '') END,
               'Standard'
             ) AS sub,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'job_description', 'job_name', 'job', 'activity', 'description', 'uraian_pekerjaan', 'pekerjaan'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>3), '') ELSE nullif(btrim(j.nilai->>4), '') END,
               coalesce(nullif(public._ambil_teks_jsonb(j.data, 'component', 'component_name'), ''), 'Pekerjaan')
             ) AS jdesc,
             GREATEST(coalesce(nullif(regexp_replace(coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'plan_hours', 'target_hours', 'std_hours', 'hours', 'jam'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN j.nilai->>4 ELSE j.nilai->>5 END,
               '2.0'
             ), '[^0-9.]', '', 'g'), '')::numeric, 2.0), 0.25) AS ph,
             GREATEST(coalesce(nullif(regexp_replace(coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'base_point', 'base_points', 'points', 'point', 'poin'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN j.nilai->>5 ELSE j.nilai->>6 END,
               '1.0'
             ), '[^0-9.]', '', 'g'), '')::numeric, 1.0), 0.5) AS bp,
             coalesce(nullif(public._ambil_teks_jsonb(j.data, 'job_type', 'type_job'), ''), 'Preventive') AS jtype
        FROM kmb.config_jobs_field j
       WHERE upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(j.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE'
    ) q;
  END IF;

  -- Fallback otomatis jika config_jobs_field kosong: bangkitkan dari config_components
  IF jsonb_array_length(v_jobs_field) = 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c->>'component_id',
      'job_id', c->>'component_id',
      'unit_model', '',
      'model', '',
      'component', coalesce(nullif(c->>'category', ''), c->>'component_name', 'General'),
      'component_name', coalesce(nullif(c->>'category', ''), c->>'component_name', 'General'),
      'sub_component', coalesce(nullif(c->>'component_name', ''), 'Standard'),
      'sub_component_name', coalesce(nullif(c->>'component_name', ''), 'Standard'),
      'job_description', coalesce(nullif(c->>'component_name', ''), 'Pekerjaan'),
      'job_name', coalesce(nullif(c->>'component_name', ''), 'Pekerjaan'),
      'activity', coalesce(nullif(c->>'component_name', ''), 'Pekerjaan'),
      'plan_hours', coalesce((c->>'target_hours')::numeric, 2.0),
      'target_hours', coalesce((c->>'target_hours')::numeric, 2.0),
      'base_point', coalesce((c->>'base_points')::numeric, 1.25),
      'base_points', coalesce((c->>'base_points')::numeric, 1.25),
      'job_type', 'Preventive'
    )), '[]'::jsonb)
    INTO v_jobs_field
    FROM jsonb_array_elements(v_comps) c;
  END IF;

  -- 4. Units (selaraskan unit_model dengan daftar unit_model di v_jobs_field agar Cascade Unit -> Component selalu nyambung!)
  WITH model_katalog AS (
    SELECT DISTINCT btrim(j->>'unit_model') AS m_kat
      FROM jsonb_array_elements(v_jobs_field) j
     WHERE btrim(coalesce(j->>'unit_model', '')) <> ''
  ),
  unit_mentah AS (
    SELECT coalesce(nullif(public._ambil_teks_jsonb(u.data, 'unit_id', 'unit_code', 'id'), ''), btrim(u.nilai->>0)) AS uid,
           coalesce(nullif(public._ambil_teks_jsonb(u.data, 'unit_name', 'name'), ''), nullif(btrim(u.nilai->>1), ''), btrim(u.nilai->>0)) AS uname,
           coalesce(nullif(public._ambil_teks_jsonb(u.data, 'unit_type', 'type', 'category'), ''), nullif(btrim(u.nilai->>2), ''), 'TRAILER') AS utype,
           coalesce(nullif(public._ambil_teks_jsonb(u.data, 'unit_model', 'model', 'model_unit', 'unit_type', 'type'), ''), nullif(btrim(u.nilai->>2), ''), '') AS umod_raw,
           coalesce(nullif(regexp_replace(coalesce(nullif(public._ambil_teks_jsonb(u.data, 'unit_factor', 'factor'), ''), u.nilai->>3, '1.0'), '[^0-9.]', '', 'g'), '')::numeric, 1.0) AS ufac
      FROM kmb.config_units u
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(u.data, 'unit_id', 'unit_code', 'id'), u.nilai->>0, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(u.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', um.uid,
    'unit_id', um.uid,
    'unit_code', um.uid,
    'unit_name', um.uname,
    'unit_type', um.utype,
    'unit_model', COALESCE(
      (SELECT mk.m_kat FROM model_katalog mk WHERE upper(mk.m_kat) = upper(um.umod_raw) LIMIT 1),
      (SELECT mk.m_kat FROM model_katalog mk WHERE um.umod_raw <> '' AND (upper(um.umod_raw) LIKE '%' || upper(mk.m_kat) || '%' OR upper(mk.m_kat) LIKE '%' || upper(um.umod_raw) || '%') LIMIT 1),
      (SELECT mk.m_kat FROM model_katalog mk WHERE upper(um.uname) LIKE '%' || upper(mk.m_kat) || '%' LIMIT 1),
      um.umod_raw
    ),
    'model', COALESCE(
      (SELECT mk.m_kat FROM model_katalog mk WHERE upper(mk.m_kat) = upper(um.umod_raw) LIMIT 1),
      (SELECT mk.m_kat FROM model_katalog mk WHERE um.umod_raw <> '' AND (upper(um.umod_raw) LIKE '%' || upper(mk.m_kat) || '%' OR upper(mk.m_kat) LIKE '%' || upper(um.umod_raw) || '%') LIMIT 1),
      (SELECT mk.m_kat FROM model_katalog mk WHERE upper(um.uname) LIKE '%' || upper(mk.m_kat) || '%' LIMIT 1),
      um.umod_raw
    ),
    'unit_factor', um.ufac
  ) ORDER BY um.uid), '[]'::jsonb)
  INTO v_units
  FROM unit_mentah um;

  -- 5. Jobs Workshop
  IF to_regclass('kmb.config_jobs_workshop') IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', jid,
      'job_id', jid,
      'unit_model', umod,
      'model', umod,
      'component', comp,
      'component_name', comp,
      'sub_component', sub,
      'sub_component_name', sub,
      'job_description', jdesc,
      'job_name', jdesc,
      'activity', jdesc,
      'plan_hours', ph,
      'target_hours', ph,
      'base_point', GREATEST(bp, ph),
      'base_points', GREATEST(bp, ph),
      'job_type', jtype
    ) ORDER BY comp, sub, jdesc), '[]'::jsonb)
    INTO v_jobs_workshop
    FROM (
      SELECT coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'job_id', 'id', 'code'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN 'JOB-W-' || j.baris::text ELSE nullif(btrim(j.nilai->>0), '') END,
               'JOB-W-' || j.baris::text
             ) AS jid,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'unit_model', 'model', 'unit_type'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>0), '') ELSE nullif(btrim(j.nilai->>1), '') END,
               ''
             ) AS umod,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'component', 'component_name', 'komponen', 'category'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>1), '') ELSE nullif(btrim(j.nilai->>2), '') END,
               'Workshop'
             ) AS comp,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'sub_component', 'sub_component_name', 'subcomponent', 'sub_komponen'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>2), '') ELSE nullif(btrim(j.nilai->>3), '') END,
               'Standard'
             ) AS sub,
             coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'job_description', 'job_name', 'job', 'activity', 'description'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN nullif(btrim(j.nilai->>3), '') ELSE nullif(btrim(j.nilai->>4), '') END,
               'Pekerjaan Workshop'
             ) AS jdesc,
             GREATEST(coalesce(nullif(regexp_replace(coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'plan_hours', 'target_hours', 'hours'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN j.nilai->>4 ELSE j.nilai->>5 END,
               '2.0'
             ), '[^0-9.]', '', 'g'), '')::numeric, 2.0), 0.25) AS ph,
             GREATEST(coalesce(nullif(regexp_replace(coalesce(
               nullif(public._ambil_teks_jsonb(j.data, 'base_point', 'base_points', 'points'), ''),
               CASE WHEN coalesce(j.nilai->>4, '') ~ '^[0-9]+(\.[0-9]+)?$' THEN j.nilai->>5 ELSE j.nilai->>6 END,
               '1.0'
             ), '[^0-9.]', '', 'g'), '')::numeric, 1.0), 0.5) AS bp,
             coalesce(nullif(public._ambil_teks_jsonb(j.data, 'job_type'), ''), 'Workshop') AS jtype
        FROM kmb.config_jobs_workshop j
       WHERE upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(j.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE'
    ) q;
  END IF;

  IF jsonb_array_length(v_jobs_workshop) = 0 THEN
    v_jobs_workshop := v_jobs_field;
  END IF;

  v_refs := jsonb_build_object(
    'units', v_units,
    'mechanics', v_mechs,
    'components', v_comps,
    'jobs_field', v_jobs_field,
    'jobs_workshop', v_jobs_workshop,
    'work_conditions', jsonb_build_array(
      jsonb_build_object('key', 'normal', 'label', 'Normal', 'factor', 1.0),
      jsonb_build_object('key', 'difficult', 'label', 'Sulit', 'factor', 1.1),
      jsonb_build_object('key', 'extreme', 'label', 'Ekstrim', 'factor', 1.2)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', v_refs || jsonb_build_object('refs', v_refs, 'pulled_at', v_pulled),
    'data', v_refs
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF btrim(coalesce(p_token, '')) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
  END IF;
  RETURN public.kmbtra_create_refs();
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmbtra_create_refs_bertoken(text) TO anon, authenticated, service_role;


-- ==============================================================================
-- C. PERBAIKAN KOLOM `disinkron_at` & AUTO-TOKEN MEKANIK (`generateMissingTokens`) DI `kmb` & `sum`
-- ==============================================================================
DO $$
DECLARE
  r record;
  v_mid text;
  v_mname text;
  v_memail text;
  v_mrole text;
  v_tok text;
  v_baris int;
BEGIN
  -- 1. Pastikan kolom disinkron_at dan sinkron_at tersedia di seluruh tabel cermin kmb & sum
  --    (Mencegah galat 42703: column "disinkron_at" of relation "work_orders" does not exist)
  IF to_regclass('kmb.work_orders') IS NOT NULL THEN
    ALTER TABLE kmb.work_orders ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE kmb.work_orders ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;
  IF to_regclass('kmb.work_order_team') IS NOT NULL THEN
    ALTER TABLE kmb.work_order_team ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE kmb.work_order_team ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;
  IF to_regclass('kmb.config_mechanics') IS NOT NULL THEN
    ALTER TABLE kmb.config_mechanics ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE kmb.config_mechanics ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;
  IF to_regclass('kmb.api_tokens') IS NOT NULL THEN
    ALTER TABLE kmb.api_tokens ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE kmb.api_tokens ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;

  IF to_regclass('sum.work_orders') IS NOT NULL THEN
    ALTER TABLE sum.work_orders ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE sum.work_orders ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;
  IF to_regclass('sum.work_order_team') IS NOT NULL THEN
    ALTER TABLE sum.work_order_team ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE sum.work_order_team ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;
  IF to_regclass('sum.config_mechanics') IS NOT NULL THEN
    ALTER TABLE sum.config_mechanics ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE sum.config_mechanics ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;
  IF to_regclass('sum.api_tokens') IS NOT NULL THEN
    ALTER TABLE sum.api_tokens ADD COLUMN IF NOT EXISTS sinkron_at timestamptz DEFAULT now();
    ALTER TABLE sum.api_tokens ADD COLUMN IF NOT EXISTS disinkron_at timestamptz DEFAULT now();
  END IF;

  -- 2. Auto-Generate Token (`generateMissingTokens` di Supabase) untuk seluruh mekanik aktif di `kmb` yang belum punya token
  IF to_regclass('kmb.config_mechanics') IS NOT NULL AND to_regclass('kmb.api_tokens') IS NOT NULL THEN
    FOR r IN SELECT baris, nilai, data FROM kmb.config_mechanics LOOP
      v_mid   := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'mechanic_id', 'id', 'code'), ''), nullif(btrim(r.nilai->>0), ''), '');
      v_mname := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'name', 'mechanic_name', 'nama'), ''), nullif(btrim(r.nilai->>1), ''), v_mid);
      v_memail := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'email'), ''), nullif(btrim(r.nilai->>2), ''), '');
      v_mrole := lower(coalesce(nullif(public._ambil_teks_jsonb(r.data, 'role'), ''), nullif(btrim(r.nilai->>3), ''), 'mechanic'));
      IF v_mid <> '' AND upper(coalesce(nullif(public._ambil_teks_jsonb(r.data, 'status'), ''), 'ACTIVE')) = 'ACTIVE' THEN
        IF NOT EXISTS (
          SELECT 1 FROM kmb.api_tokens t
           WHERE public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')) = public._kode_mekanik_kanonik(v_mid)
             AND (t.data->>'is_active' IS NULL OR lower(btrim(t.data->>'is_active')) <> 'false')
        ) THEN
          v_tok := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'token'), ''), 'kmb-' || lower(regexp_replace(v_mid, '[^a-zA-Z0-9]', '', 'g')) || '-' || substr(md5(v_mid || '-kmbtra'), 1, 8));
          SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.api_tokens WHERE baris < 0;
          IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
          INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
          VALUES (
            v_baris,
            jsonb_build_array(v_tok, v_mid, v_memail, 'true', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            jsonb_build_object(
              'token', v_tok,
              'mechanic_id', v_mid,
              'user_id', v_mid,
              'name', v_mname,
              'email', v_memail,
              'role', v_mrole,
              'status', 'ACTIVE',
              'is_active', 'true'
            ),
            now()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Auto-Generate Token (`generateMissingTokens` di Supabase) untuk seluruh mekanik aktif di `sum` yang belum punya token
  IF to_regclass('sum.config_mechanics') IS NOT NULL AND to_regclass('sum.api_tokens') IS NOT NULL THEN
    FOR r IN SELECT baris, nilai, data FROM sum.config_mechanics LOOP
      v_mid   := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'mechanic_id', 'id', 'code'), ''), nullif(btrim(r.nilai->>0), ''), '');
      v_mname := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'name', 'mechanic_name', 'nama'), ''), nullif(btrim(r.nilai->>1), ''), v_mid);
      v_memail := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'email'), ''), nullif(btrim(r.nilai->>2), ''), '');
      v_mrole := lower(coalesce(nullif(public._ambil_teks_jsonb(r.data, 'role'), ''), nullif(btrim(r.nilai->>3), ''), 'mechanic'));
      IF v_mid <> '' AND upper(coalesce(nullif(public._ambil_teks_jsonb(r.data, 'status'), ''), 'ACTIVE')) = 'ACTIVE' THEN
        IF NOT EXISTS (
          SELECT 1 FROM sum.api_tokens t
           WHERE public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')) = public._kode_mekanik_kanonik(v_mid)
             AND (t.data->>'is_active' IS NULL OR lower(btrim(t.data->>'is_active')) <> 'false')
        ) THEN
          v_tok := coalesce(nullif(public._ambil_teks_jsonb(r.data, 'token'), ''), 'sum-' || lower(regexp_replace(v_mid, '[^a-zA-Z0-9]', '', 'g')) || '-' || substr(md5(v_mid || '-sumv2'), 1, 8));
          SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.api_tokens WHERE baris < 0;
          IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
          INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
          VALUES (
            v_baris,
            jsonb_build_array(v_tok, v_mid, v_memail, 'true', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            jsonb_build_object(
              'token', v_tok,
              'mechanic_id', v_mid,
              'user_id', v_mid,
              'name', v_mname,
              'email', v_memail,
              'role', v_mrole,
              'status', 'ACTIVE',
              'is_active', 'true'
            ),
            now()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
END $$;

-- ==============================================================================
-- D. FUNGSI MONITORING & MY_WOS KMB TRA (`kmbtra_monitoring`, `kmbtra_monitoring_bertoken`, `kmbtra_my_wos`, `kmbtra_my_wos_bertoken`)
-- Menampilkan Nama, ID, Token, dan Angka WO per Kartu Mekanik dengan Lengkap (Tanpa `?` dan Tanpa Peringatan `generateMissingTokens`)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.kmbtra_my_wos(p_mechanic_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mid_in    text := btrim(coalesce(p_mechanic_id, ''));
  v_mid_canon text := '';
  v_mname     text := '';
  v_memail    text := '';
  v_wos       jsonb := '[]'::jsonb;
  v_pulled    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  SELECT coalesce(nullif(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), ''), nullif(btrim(nilai->>0), ''), v_mid_in),
         coalesce(nullif(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), ''), nullif(btrim(nilai->>1), ''), ''),
         coalesce(nullif(public._ambil_teks_jsonb(data, 'email'), ''), nullif(btrim(nilai->>2), ''), '')
    INTO v_mid_canon, v_mname, v_memail
    FROM kmb.config_mechanics
   WHERE public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), nilai->>0, '')) = public._kode_mekanik_kanonik(v_mid_in)
      OR upper(btrim(coalesce(public._ambil_teks_jsonb(data, 'name', 'mechanic_name'), nilai->>1, ''))) = upper(v_mid_in)
   LIMIT 1;

  v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid_in);

  WITH master_mekanik AS (
    SELECT DISTINCT ON (public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)))
           public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0)) AS k_id,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)) AS mechanic_id,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)) AS name
      FROM kmb.config_mechanics m
     WHERE coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '') <> ''
  ),
  tim_cermin AS (
    SELECT upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id', 'id'), ''), nullif(t.nilai->>0, ''), ''))) AS wo_key,
           jsonb_agg(jsonb_build_object(
             'mechanic_id', coalesce(mm.mechanic_id, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), nullif(btrim(t.nilai->>1), ''), ''),
             'mechanic_name', coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(btrim(t.nilai->>2), ''), nullif(btrim(t.nilai->>1), ''), ''),
             'name', coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(btrim(t.nilai->>2), ''), nullif(btrim(t.nilai->>1), ''), ''),
             'role_in_wo', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'role_in_wo', 'role'), ''), 'lead'),
             'percentage', 100
           )) AS team_arr,
           jsonb_agg(coalesce(mm.name, nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id'), ''), nullif(btrim(t.nilai->>1), ''), '')) AS team_names_arr
      FROM kmb.work_order_team t
      LEFT JOIN master_mekanik mm
        ON mm.k_id = public._kode_mekanik_kanonik(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), t.nilai->>1, ''))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id'), t.nilai->>0, '')), '') IS NOT NULL
     GROUP BY 1
  ),
  gabungan_wo AS (
    SELECT s.data || jsonb_build_object(
             'id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'wo_id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'wo_number', coalesce(nullif(btrim(s.wo_number), ''), btrim(s.id)),
             'status', sum._normalisasi_status_wo_sum(coalesce(s.data->>'status', s.status))
           ) AS wo
      FROM kmb.wo_supabase s
     WHERE to_regclass('kmb.wo_supabase') IS NOT NULL
       AND nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0'
    UNION ALL
    SELECT w.data || jsonb_build_object(
             'id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'wo_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'wo_number', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), ''), btrim(w.nilai->>0)),
             'status', sum._normalisasi_status_wo_sum(public._ambil_teks_jsonb(w.data, 'status')),
             'unit_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'unit_id', 'unit_code'), ''), 'WORKSHOP'),
             'component_id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_id', 'component_no'), ''), 'COM-001'),
             'component_name', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'component_name', 'others_description', 'activity', 'component_id'), ''), 'Pekerjaan'),
             'team', CASE
               WHEN tc.team_arr IS NOT NULL THEN tc.team_arr
               WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
               ELSE '[]'::jsonb
             END,
             'effective_team', CASE
               WHEN tc.team_arr IS NOT NULL THEN tc.team_arr
               WHEN jsonb_typeof(w.data->'effective_team') = 'array' AND jsonb_array_length(w.data->'effective_team') > 0 THEN w.data->'effective_team'
               WHEN jsonb_typeof(w.data->'team') = 'array' AND jsonb_array_length(w.data->'team') > 0 THEN w.data->'team'
               ELSE '[]'::jsonb
             END,
             'team_names', COALESCE(tc.team_names_arr, CASE WHEN jsonb_typeof(w.data->'team_names') = 'array' THEN w.data->'team_names' ELSE '[]'::jsonb END)
           ) AS wo
      FROM kmb.work_orders w
      LEFT JOIN tim_cermin tc
        ON tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), w.nilai->>0, '')))
        OR tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number'), ''), w.nilai->>0, '')))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, ''))) <> 'WO-0'
       AND NOT EXISTS (
         SELECT 1 FROM kmb.wo_supabase s2
          WHERE s2.id = coalesce(public._ambil_teks_jsonb(w.data, 'wo_id', 'id'), '')
             OR s2.wo_number = coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id'), '')
       )
  ),
  milik_mekanik AS (
    SELECT wo FROM gabungan_wo
     WHERE sum._wo_milik_mekanik_sum(wo, v_mid_canon, v_mname, v_memail, v_mid_in)
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY coalesce(wo->>'created_at', '') DESC), '[]'::jsonb)
    INTO v_wos
    FROM milik_mekanik;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
    'data', jsonb_build_object('wos', v_wos)
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_mid   text := '';
BEGIN
  IF v_clean = '' THEN
    RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
  END IF;

  SELECT coalesce(
           nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''),
           nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), ''),
           nullif(btrim(t.nilai->>1), ''),
           nullif(public._ambil_teks_jsonb(t.data, 'name', 'email'), ''),
           ''
         )
    INTO v_mid
    FROM kmb.api_tokens t
    LEFT JOIN kmb.config_mechanics m
      ON public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '')) = public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, ''))
      OR (nullif(public._ambil_teks_jsonb(t.data, 'email'), '') IS NOT NULL AND lower(public._ambil_teks_jsonb(m.data, 'email')) = lower(public._ambil_teks_jsonb(t.data, 'email')))
   WHERE btrim(coalesce(public._ambil_teks_jsonb(t.data, 'token'), t.nilai->>0, '')) = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(btrim(t.data->>'is_active')) <> 'false')
   LIMIT 1;

  IF coalesce(v_mid, '') = '' THEN
    SELECT coalesce(nullif(public._ambil_teks_jsonb(data, 'mechanic_id', 'id'), ''), btrim(nilai->>0))
      INTO v_mid
      FROM kmb.config_mechanics
     WHERE btrim(public._ambil_teks_jsonb(data, 'token')) = v_clean
     LIMIT 1;
  END IF;

  IF coalesce(v_mid, '') = '' THEN
    RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
  END IF;

  RETURN public.kmbtra_my_wos(v_mid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmbtra_my_wos_bertoken(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kmbtra_monitoring()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mechs  jsonb := '[]'::jsonb;
  v_total  int := 0;
  v_p_work int := 0;
  v_exp    int := 0;
  v_p_l1   int := 0;
  v_p_l2   int := 0;
  v_app    int := 0;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  WITH token_aktif AS (
    SELECT DISTINCT ON (public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')))
           public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')) AS k_id,
           btrim(coalesce(public._ambil_teks_jsonb(t.data, 'token'), t.nilai->>0, '')) AS token
      FROM kmb.api_tokens t
     WHERE coalesce(public._ambil_teks_jsonb(t.data, 'token'), t.nilai->>0, '') <> ''
       AND (t.data->>'is_active' IS NULL OR lower(btrim(t.data->>'is_active')) <> 'false')
     ORDER BY public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')), t.baris DESC
  ),
  tim_cermin AS (
    SELECT upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id'), ''), t.nilai->>0, ''))) AS wo_key,
           jsonb_agg(jsonb_build_object(
             'mechanic_id', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), btrim(t.nilai->>1), ''),
             'name', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), btrim(t.nilai->>2), '')
           )) AS team_arr
      FROM kmb.work_order_team t
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number'), t.nilai->>0, '')), '') IS NOT NULL
     GROUP BY 1
  ),
  semua_wo AS (
    SELECT s.data || jsonb_build_object(
             'id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'status', sum._normalisasi_status_wo_sum(coalesce(s.data->>'status', s.status))
           ) AS wo
      FROM kmb.wo_supabase s
     WHERE to_regclass('kmb.wo_supabase') IS NOT NULL
       AND nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0'
    UNION ALL
    SELECT w.data || jsonb_build_object(
             'id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'status', sum._normalisasi_status_wo_sum(public._ambil_teks_jsonb(w.data, 'status')),
             'team', COALESCE(tc.team_arr, CASE WHEN jsonb_typeof(w.data->'team') = 'array' THEN w.data->'team' ELSE '[]'::jsonb END)
           ) AS wo
      FROM kmb.work_orders w
      LEFT JOIN tim_cermin tc
        ON tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), w.nilai->>0, '')))
        OR tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number'), ''), w.nilai->>0, '')))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, ''))) <> 'WO-0'
       AND NOT EXISTS (
         SELECT 1 FROM kmb.wo_supabase s2
          WHERE s2.id = coalesce(public._ambil_teks_jsonb(w.data, 'wo_id', 'id'), '')
             OR s2.wo_number = coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id'), '')
       )
  ),
  daftar_mek AS (
    SELECT coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id', 'code'), ''), btrim(m.nilai->>0)) AS mid,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name', 'nama'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)) AS mname,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'email'), ''), nullif(btrim(m.nilai->>2), ''), '') AS memail,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'section'), ''), nullif(btrim(m.nilai->>4), ''), 'field') AS msec,
           (lower(coalesce(public._ambil_teks_jsonb(m.data, 'is_test_account', 'uji'), 'false')) IN ('true', '1')) AS muji,
           coalesce(
             ta.token,
             nullif(public._ambil_teks_jsonb(m.data, 'token'), ''),
             'kmb-' || lower(regexp_replace(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)), '[^a-zA-Z0-9]', '', 'g')) || '-' || substr(md5(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)) || '-kmbtra'), 1, 8)
           ) AS mtok
      FROM kmb.config_mechanics m
      LEFT JOIN token_aktif ta
        ON ta.k_id = public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '')), '') IS NOT NULL
       AND lower(btrim(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'role'), ''), nullif(m.nilai->>3, ''), 'mechanic'))) = 'mechanic'
       AND upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE'
  ),
  mech_counts AS (
    SELECT dm.mid AS id,
           dm.mid AS mechanic_id,
           dm.mname AS name,
           dm.mname AS mechanic_name,
           dm.msec AS section,
           dm.mtok AS token,
           true AS has_token,
           dm.muji AS uji,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'pending_mechanic_work'), 0)::int AS pending_mechanic_work,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'expired'), 0)::int AS expired,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'pending_supervisor'), 0)::int AS pending_l1,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'pending_superintendent'), 0)::int AS pending_l2,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'approved'), 0)::int AS approved
      FROM daftar_mek dm
      LEFT JOIN semua_wo sw ON sum._wo_milik_mekanik_sum(sw.wo, dm.mid, dm.mname, dm.memail)
     GROUP BY dm.mid, dm.mname, dm.msec, dm.mtok, dm.muji
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'mechanic_id', mechanic_id,
           'name', name,
           'mechanic_name', mechanic_name,
           'section', section,
           'token', token,
           'has_token', true,
           'uji', uji,
           'pending_mechanic_work', pending_mechanic_work,
           'pending_work', pending_mechanic_work,
           'perlu_diisi', pending_mechanic_work,
           'expired', expired,
           'pending_l1', pending_l1,
           'pending_l2', pending_l2,
           'pending_approval', pending_l1 + pending_l2,
           'approved', approved
         ) ORDER BY id), '[]'::jsonb),
         count(*)::int,
         coalesce(sum(pending_mechanic_work), 0)::int,
         coalesce(sum(expired), 0)::int,
         coalesce(sum(pending_l1), 0)::int,
         coalesce(sum(pending_l2), 0)::int,
         coalesce(sum(approved), 0)::int
    INTO v_mechs, v_total, v_p_work, v_exp, v_p_l1, v_p_l2, v_app
    FROM mech_counts;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'overall', jsonb_build_object(
        'mechanics', coalesce(v_total, 0),
        'total_mechanics', coalesce(v_total, 0),
        'mechanic_count', coalesce(v_total, 0),
        'pending_mechanic_work', coalesce(v_p_work, 0),
        'pending_work', coalesce(v_p_work, 0),
        'perlu_diisi', coalesce(v_p_work, 0),
        'expired', coalesce(v_exp, 0),
        'pending_l1', coalesce(v_p_l1, 0),
        'pending_l2', coalesce(v_p_l2, 0),
        'pending_approval', coalesce(v_p_l1, 0) + coalesce(v_p_l2, 0),
        'menunggu_approval', coalesce(v_p_l1, 0) + coalesce(v_p_l2, 0),
        'approved', coalesce(v_app, 0)
      ),
      'mechanics', coalesce(v_mechs, '[]'::jsonb),
      'pulled_at', v_pulled
    )
  )::json;
END;
$$;

-- kmbtra_monitoring_bertoken: definisinya pindah ke db/bersama/monitoring_bertoken.sql (gerbang peran seperti GAS, 14 Nov 2026).


CREATE OR REPLACE FUNCTION public.sum_monitoring()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mechs  jsonb := '[]'::jsonb;
  v_total  int := 0;
  v_p_work int := 0;
  v_exp    int := 0;
  v_p_l1   int := 0;
  v_p_l2   int := 0;
  v_app    int := 0;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  WITH token_aktif AS (
    SELECT DISTINCT ON (public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')))
           public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')) AS k_id,
           btrim(coalesce(public._ambil_teks_jsonb(t.data, 'token'), t.nilai->>0, '')) AS token
      FROM sum.api_tokens t
     WHERE coalesce(public._ambil_teks_jsonb(t.data, 'token'), t.nilai->>0, '') <> ''
       AND (t.data->>'is_active' IS NULL OR lower(btrim(t.data->>'is_active')) <> 'false')
     ORDER BY public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'user_id', 'id'), t.nilai->>1, '')), t.baris DESC
  ),
  tim_cermin AS (
    SELECT upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number', 'work_order_id'), ''), t.nilai->>0, ''))) AS wo_key,
           jsonb_agg(jsonb_build_object(
             'mechanic_id', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_id', 'id', 'user_id'), ''), btrim(t.nilai->>1), ''),
             'name', coalesce(nullif(public._ambil_teks_jsonb(t.data, 'mechanic_name', 'name'), ''), btrim(t.nilai->>2), '')
           )) AS team_arr
      FROM sum.work_order_team t
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(t.data, 'wo_id', 'wo_number'), t.nilai->>0, '')), '') IS NOT NULL
     GROUP BY 1
  ),
  semua_wo AS (
    SELECT s.data || jsonb_build_object(
             'id', coalesce(nullif(btrim(s.id), ''), btrim(s.wo_number)),
             'status', sum._normalisasi_status_wo_sum(coalesce(s.data->>'status', s.status))
           ) AS wo
      FROM sum.wo_supabase s
     WHERE to_regclass('sum.wo_supabase') IS NOT NULL
       AND nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0'
    UNION ALL
    SELECT w.data || jsonb_build_object(
             'id', coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), btrim(w.nilai->>0)),
             'status', sum._normalisasi_status_wo_sum(public._ambil_teks_jsonb(w.data, 'status')),
             'team', COALESCE(tc.team_arr, CASE WHEN jsonb_typeof(w.data->'team') = 'array' THEN w.data->'team' ELSE '[]'::jsonb END)
           ) AS wo
      FROM sum.work_orders w
      LEFT JOIN tim_cermin tc
        ON tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_id', 'id', 'wo_number'), ''), w.nilai->>0, '')))
        OR tc.wo_key = upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(w.data, 'wo_number'), ''), w.nilai->>0, '')))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id', 'id'), w.nilai->>0, ''))) <> 'WO-0'
       AND NOT EXISTS (
         SELECT 1 FROM sum.wo_supabase s2
          WHERE s2.id = coalesce(public._ambil_teks_jsonb(w.data, 'wo_id', 'id'), '')
             OR s2.wo_number = coalesce(public._ambil_teks_jsonb(w.data, 'wo_number', 'wo_id'), '')
       )
  ),
  daftar_mek AS (
    SELECT coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id', 'code'), ''), btrim(m.nilai->>0)) AS mid,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'name', 'mechanic_name', 'nama'), ''), nullif(btrim(m.nilai->>1), ''), btrim(m.nilai->>0)) AS mname,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'email'), ''), nullif(btrim(m.nilai->>2), ''), '') AS memail,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'jabatan_aktual', 'section'), ''), nullif(btrim(m.nilai->>4), ''), 'Mekanik') AS mjab,
           coalesce(nullif(public._ambil_teks_jsonb(m.data, 'golongan'), ''), nullif(btrim(m.nilai->>5), ''), '') AS mgol,
           (lower(coalesce(public._ambil_teks_jsonb(m.data, 'is_test_account', 'uji'), 'false')) IN ('true', '1')) AS muji,
           coalesce(
             ta.token,
             nullif(public._ambil_teks_jsonb(m.data, 'token'), ''),
             'sum-' || lower(regexp_replace(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)), '[^a-zA-Z0-9]', '', 'g')) || '-' || substr(md5(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), ''), btrim(m.nilai->>0)) || '-sumv2'), 1, 8)
           ) AS mtok
      FROM sum.config_mechanics m
      LEFT JOIN token_aktif ta
        ON ta.k_id = public._kode_mekanik_kanonik(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0))
     WHERE nullif(btrim(coalesce(public._ambil_teks_jsonb(m.data, 'mechanic_id', 'id'), m.nilai->>0, '')), '') IS NOT NULL
       AND lower(btrim(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'role'), ''), nullif(m.nilai->>3, ''), 'mechanic'))) = 'mechanic'
       AND upper(btrim(coalesce(nullif(public._ambil_teks_jsonb(m.data, 'status'), ''), 'ACTIVE'))) = 'ACTIVE'
  ),
  mech_counts AS (
    SELECT dm.mid AS id,
           dm.mid AS mechanic_id,
           dm.mname AS name,
           dm.mname AS mechanic_name,
           dm.mjab AS jabatan_aktual,
           dm.mgol AS golongan,
           dm.mtok AS token,
           true AS has_token,
           dm.muji AS uji,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'pending_mechanic_work'), 0)::int AS pending_mechanic_work,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'expired'), 0)::int AS expired,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'pending_supervisor'), 0)::int AS pending_l1,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'pending_superintendent'), 0)::int AS pending_l2,
           coalesce(count(sw.wo) FILTER (WHERE (sw.wo->>'status') = 'approved'), 0)::int AS approved
      FROM daftar_mek dm
      LEFT JOIN semua_wo sw ON sum._wo_milik_mekanik_sum(sw.wo, dm.mid, dm.mname, dm.memail)
     GROUP BY dm.mid, dm.mname, dm.mjab, dm.mgol, dm.mtok, dm.muji
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'mechanic_id', mechanic_id,
           'name', name,
           'mechanic_name', mechanic_name,
           'jabatan_aktual', jabatan_aktual,
           'golongan', golongan,
           'token', token,
           'has_token', true,
           'uji', uji,
           'pending_mechanic_work', pending_mechanic_work,
           'pending_work', pending_mechanic_work,
           'perlu_diisi', pending_mechanic_work,
           'expired', expired,
           'pending_l1', pending_l1,
           'pending_l2', pending_l2,
           'pending_approval', pending_l1 + pending_l2,
           'approved', approved
         ) ORDER BY id), '[]'::jsonb),
         count(*)::int,
         coalesce(sum(pending_mechanic_work), 0)::int,
         coalesce(sum(expired), 0)::int,
         coalesce(sum(pending_l1), 0)::int,
         coalesce(sum(pending_l2), 0)::int,
         coalesce(sum(approved), 0)::int
    INTO v_mechs, v_total, v_p_work, v_exp, v_p_l1, v_p_l2, v_app
    FROM mech_counts;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'overall', jsonb_build_object(
        'mechanics', coalesce(v_total, 0),
        'total_mechanics', coalesce(v_total, 0),
        'mechanic_count', coalesce(v_total, 0),
        'pending_mechanic_work', coalesce(v_p_work, 0),
        'pending_work', coalesce(v_p_work, 0),
        'perlu_diisi', coalesce(v_p_work, 0),
        'expired', coalesce(v_exp, 0),
        'pending_l1', coalesce(v_p_l1, 0),
        'pending_l2', coalesce(v_p_l2, 0),
        'pending_approval', coalesce(v_p_l1, 0) + coalesce(v_p_l2, 0),
        'menunggu_approval', coalesce(v_p_l1, 0) + coalesce(v_p_l2, 0),
        'approved', coalesce(v_app, 0)
      ),
      'mechanics', coalesce(v_mechs, '[]'::jsonb),
      'pulled_at', v_pulled
    )
  )::json;
END;
$$;

-- sum_monitoring_bertoken: definisinya pindah ke db/bersama/monitoring_bertoken.sql (gerbang peran seperti GAS, 14 Nov 2026).



-- Segarkan cache skema PostgREST agar seluruh fungsi RPC baru langsung aktif tanpa delay 404 PGRST202
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- VERIFIKASI OTOMATIS RPC & DATA KETIGA RUMAH DI SUPABASE GEDUNG 2 (`dnnqrslftndcbmnvuveb`)
-- ==============================================================================
SELECT
  rumah,
  rpc_tersedia,
  jumlah_unit,
  jumlah_mekanik,
  jumlah_job_cascade,
  CASE WHEN rpc_tersedia >= 5 AND jumlah_job_cascade > 0 THEN 'SIAP UJI END-TO-END' ELSE 'PERLU CEK DATA' END AS status_kesiapan
FROM (
  SELECT
    '1. KMB Projek (kmb_projek)' AS rumah,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('kmb_ping', 'kmb_create_refs_bertoken', 'kmb_monitoring_bertoken', 'kmb_my_wos_bertoken', 'kmb_eksekusi_aksi_bertoken', 'kmb_admin_daftar_config_bertoken')) AS rpc_tersedia,
    jsonb_array_length(coalesce((public.kmb_create_refs()::jsonb #> '{result,units}'), '[]'::jsonb)) AS jumlah_unit,
    jsonb_array_length(coalesce((public.kmb_create_refs()::jsonb #> '{result,mechanics}'), '[]'::jsonb)) AS jumlah_mekanik,
    jsonb_array_length(coalesce((public.kmb_create_refs()::jsonb #> '{result,jobs_field}'), '[]'::jsonb)) AS jumlah_job_cascade
  UNION ALL
  SELECT
    '2. SUM V2 (sum)' AS rumah,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('sum_my_wos_bertoken', 'sum_admin_daftar_user_bertoken', 'sum_admin_daftar_config_bertoken', 'sum_admin_simpan_config_bertoken', 'sum_admin_hapus_config_bertoken')) AS rpc_tersedia,
    (SELECT count(*)::int FROM sum.config_units) AS jumlah_unit,
    (SELECT count(*)::int FROM sum.config_mechanics) AS jumlah_mekanik,
    (SELECT count(*)::int FROM sum.config_components) AS jumlah_job_cascade
  UNION ALL
  SELECT
    '3. KMB TRA / V2 (kmb)' AS rumah,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('kmbtra_create_refs_bertoken', 'kmbtra_admin_daftar_user_bertoken', 'kmbtra_admin_daftar_config_bertoken', 'kmbtra_admin_simpan_config_bertoken', 'kmbtra_admin_hapus_config_bertoken')) AS rpc_tersedia,
    jsonb_array_length(coalesce((public.kmbtra_create_refs()::jsonb #> '{result,units}'), '[]'::jsonb)) AS jumlah_unit,
    jsonb_array_length(coalesce((public.kmbtra_create_refs()::jsonb #> '{result,mechanics}'), '[]'::jsonb)) AS jumlah_mekanik,
    jsonb_array_length(coalesce((public.kmbtra_create_refs()::jsonb #> '{result,jobs_field}'), '[]'::jsonb)) AS jumlah_job_cascade
) ringkasan
ORDER BY rumah;
