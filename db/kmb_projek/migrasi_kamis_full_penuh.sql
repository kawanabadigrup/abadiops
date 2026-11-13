-- ==============================================================================
-- BACKEND PENUH MANDIRI SUPABASE (BACA + TULIS + DESKTOP WEB) — SKEMA `kmb_projek`
-- Rumah: kmbprojek · Pemegang: Raka · Tanpa Ketergantungan Pihak Ketiga (GAS)
-- Sesuai AGENTS.md §0a, §1, §2, §5, docs/KEPUTUSAN.md, & docs/SAKLAR.md
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_units' AND column_name = 'unit_code'
  ) THEN
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_name text;
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_factor numeric DEFAULT 1.0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_components' AND column_name = 'component_id'
  ) THEN
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS base_points numeric DEFAULT 1.25;
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS target_hours numeric DEFAULT 2.0;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_mechanics' AND column_name = 'mechanic_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'token'
  ) THEN
    INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
    SELECT coalesce(nullif(btrim(m.token), ''), substr(md5(m.mechanic_id || '-kmbp-auto'), 1, 20)),
           lower(coalesce(nullif(btrim(m.role), ''), 'mechanic')),
           btrim(m.mechanic_id),
           coalesce(nullif(btrim(m.name), ''), btrim(m.mechanic_id)),
           'ACTIVE',
           now()
      FROM kmb_projek.config_mechanics m
     WHERE upper(btrim(coalesce(m.status, 'ACTIVE'))) = 'ACTIVE'
       AND nullif(btrim(m.mechanic_id), '') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM kmb_projek.api_tokens t
          WHERE upper(btrim(coalesce(t.user_id, ''))) = upper(btrim(m.mechanic_id))
            AND upper(btrim(coalesce(t.status, 'ACTIVE'))) = 'ACTIVE'
       )
    ON CONFLICT (token) DO NOTHING;
  END IF;
END $$;

-- Pastikan tabel catalog_jobs selalu tersedia (Perbaikan Bug #15)
CREATE TABLE IF NOT EXISTS kmb_projek.catalog_jobs (
    job_id TEXT PRIMARY KEY,
    section TEXT NOT NULL DEFAULT 'maintenance',
    unit_model TEXT,
    component TEXT NOT NULL,
    sub_component TEXT,
    job_description TEXT NOT NULL,
    plan_hours NUMERIC DEFAULT 2.0,
    base_point NUMERIC DEFAULT 1.0,
    job_type TEXT DEFAULT 'Preventive',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
REVOKE ALL ON TABLE kmb_projek.catalog_jobs FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS kmb_projek.wo_counter_supabase (
  tanggal   text PRIMARY KEY,
  terakhir  integer NOT NULL DEFAULT 0,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kmb_projek.wo_supabase (
  id        text PRIMARY KEY,
  wo_number text NOT NULL,
  status    text NOT NULL,
  data      jsonb NOT NULL,
  team      jsonb NOT NULL DEFAULT '[]'::jsonb,
  points    jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot  jsonb,
  diubah_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kmbp_wo_supa_status_idx ON kmb_projek.wo_supabase (status);
CREATE INDEX IF NOT EXISTS kmbp_wo_supa_number_idx ON kmb_projek.wo_supabase (wo_number);

CREATE TABLE IF NOT EXISTS kmb_projek.wo_ops_supabase (
  op_id        text PRIMARY KEY,
  action       text NOT NULL,
  actor_id     text,
  result_json  jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kmb_projek.meter_panel_supabase (
  id           bigserial PRIMARY KEY,
  unit_id      text NOT NULL,
  jenis        text NOT NULL,
  nilai_baru   numeric NOT NULL,
  diganti_pada timestamptz NOT NULL,
  alasan       text NOT NULL,
  actor_id     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE kmb_projek.wo_counter_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb_projek.wo_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb_projek.wo_ops_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb_projek.meter_panel_supabase FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- HELPER INTERNAL 1: Validasi Token Aktif KMB Project (Dual-Format & Case-Insensitive)
-- ==============================================================================
CREATE OR REPLACE FUNCTION kmb_projek._validasi_token_aktif(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean    text := btrim(coalesce(p_token, ''));
  v_is_jsonb boolean;
  v_user     record;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    EXECUTE $q$
      SELECT t.data->>'token' AS token,
             coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'user_id'), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
             coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), '') AS name,
             lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
             coalesce(m.data->>'email', '') AS email,
             coalesce(m.data->>'section', 'maintenance') AS section,
             upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
        FROM kmb_projek.api_tokens t
        LEFT JOIN kmb_projek.config_mechanics m
          ON upper(btrim(coalesce(t.data->>'user_id', t.data->>'mechanic_id', ''))) = upper(btrim(coalesce(m.data->>'mechanic_id', '')))
       WHERE trim(t.data->>'token') = $1
         AND upper(coalesce(t.data->>'status', 'ACTIVE')) = 'ACTIVE'
         AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
       LIMIT 1
    $q$ INTO v_user USING v_clean;
  ELSE
    SELECT t.token,
           coalesce(nullif(trim(m.mechanic_id), ''), trim(t.user_id), '') AS mechanic_id,
           coalesce(nullif(trim(m.name), ''), trim(t.name), '') AS name,
           lower(coalesce(nullif(trim(m.role), ''), trim(t.role), 'mechanic')) AS role,
           coalesce(m.email, '') AS email,
           coalesce(m.section, 'maintenance') AS section,
           upper(coalesce(m.status, 'ACTIVE')) AS mech_status
      INTO v_user
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m
        ON upper(btrim(coalesce(t.user_id, ''))) = upper(btrim(coalesce(m.mechanic_id, '')))
        OR btrim(coalesce(t.token, '')) = btrim(coalesce(m.token, ''))
     WHERE trim(t.token) = v_clean
       AND upper(coalesce(t.status, 'ACTIVE')) = 'ACTIVE'
     LIMIT 1;
  END IF;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role,
    'email', v_user.email,
    'section', v_user.section
  );
END;
$$;

-- ==============================================================================
-- HELPER INTERNAL 2: Nomor WO 4-Digit Harian WIB (`WO-YYYYMMDD-XXXX`)
-- ==============================================================================
CREATE OR REPLACE FUNCTION kmb_projek._nomor_wo_baru_wib()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tgl  text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
  v_max  int := 0;
  v_urut int;
BEGIN
  SELECT coalesce(max(
    CASE
      WHEN wo_number ~ ('^WO-' || v_tgl || '-[0-9]{4}$')
      THEN substring(wo_number from '[0-9]{4}$')::int
      ELSE 0
    END
  ), 0)
  INTO v_max
  FROM kmb_projek.wo_supabase;

  INSERT INTO kmb_projek.wo_counter_supabase (tanggal, terakhir, diubah_at)
  VALUES (v_tgl, GREATEST(v_max, 0) + 1, now())
  ON CONFLICT (tanggal) DO UPDATE
    SET terakhir = GREATEST(kmb_projek.wo_counter_supabase.terakhir, v_max) + 1,
        diubah_at = now()
  RETURNING terakhir INTO v_urut;

  RETURN 'WO-' || v_tgl || '-' || lpad(v_urut::text, 4, '0');
END;
$$;

-- ==============================================================================
-- HELPER INTERNAL 3: Normalisasi Status & Gabung WO Cermin + WO Supabase
-- ==============================================================================
CREATE OR REPLACE FUNCTION kmb_projek._normalisasi_status_wo(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := lower(btrim(coalesce(p_status, '')));
BEGIN
  IF s IN ('open', 'active', 'assigned', 'in_progress', 'draft', 'pending_mechanic_work') THEN
    RETURN 'pending_mechanic_work';
  ELSIF s IN ('pending_l1', 'pending_supervisor') THEN
    RETURN 'pending_supervisor';
  ELSIF s IN ('pending_l2', 'pending_superintendent') THEN
    RETURN 'pending_superintendent';
  ELSIF s = 'pending_transfer' THEN
    RETURN 'pending_transfer';
  ELSIF s = 'approved' THEN
    RETURN 'approved';
  ELSIF s = 'rejected' THEN
    RETURN 'rejected';
  ELSIF s IN ('cancelled', 'canceled') THEN
    RETURN 'cancelled';
  ELSIF s = 'expired' THEN
    RETURN 'expired';
  END IF;
  RETURN coalesce(nullif(s, ''), 'pending_mechanic_work');
END;
$$;

CREATE OR REPLACE FUNCTION kmb_projek._semua_wo_json()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_jsonb boolean;
BEGIN
  -- 1. Kembalikan semua WO dari wo_supabase lebih dulu (abaikan baris hantu/kosong)
  RETURN QUERY
    SELECT s.data
      FROM kmb_projek.wo_supabase s
     WHERE nullif(btrim(coalesce(s.wo_number, s.id, '')), '') IS NOT NULL
       AND upper(btrim(coalesce(s.wo_number, s.id, ''))) <> 'WO-0';

  -- 2. Kembalikan WO dari work_orders yang belum ada di wo_supabase
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'work_orders' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    RETURN QUERY EXECUTE $q$
      SELECT w.data || jsonb_build_object(
               'id', coalesce(w.data->>'id', w.data->>'wo_number'),
               'wo_id', coalesce(w.data->>'id', w.data->>'wo_number'),
               'wo_number', coalesce(w.data->>'wo_number', w.data->>'id'),
               'status', kmb_projek._normalisasi_status_wo(w.data->>'status'),
               'component_name', coalesce(w.data->>'component_name', w.data->>'component', w.data->>'activity', 'Pekerjaan'),
               'unit_id', coalesce(w.data->>'unit_id', w.data->>'unit_code', ''),
               'unit_name', coalesce(w.data->>'unit_name', w.data->>'unit_code', '')
             )
        FROM kmb_projek.work_orders w
       WHERE nullif(btrim(coalesce(w.data->>'wo_number', w.data->>'id', '')), '') IS NOT NULL
         AND upper(btrim(coalesce(w.data->>'wo_number', w.data->>'id', ''))) <> 'WO-0'
         AND NOT EXISTS (
           SELECT 1 FROM kmb_projek.wo_supabase s
            WHERE s.id = coalesce(w.data->>'id', '') OR s.wo_number = coalesce(w.data->>'wo_number', '')
         )
    $q$;
  ELSE
    RETURN QUERY
      SELECT jsonb_build_object(
               'id', w.id,
               'wo_id', w.id,
               'wo_number', w.wo_number,
               'date', w.date::text,
               'shift', coalesce(w.shift, '1'),
               'unit_id', coalesce(w.unit_code, 'WORKSHOP'),
               'unit_code', coalesce(w.unit_code, 'WORKSHOP'),
               'unit_name', coalesce(w.unit_code, 'WORKSHOP'),
               'unit_factor', 1.0,
               'unit', jsonb_build_object(
                 'unit_id', coalesce(w.unit_code, 'WORKSHOP'),
                 'unit_name', coalesce(w.unit_code, 'WORKSHOP'),
                 'unit_factor', 1.0
               ),
               'component_id', coalesce(w.component, 'COM-001'),
               'component_name', coalesce(nullif(w.activity, ''), w.component, 'Pekerjaan'),
               'base_points', coalesce(w.points, 1.0),
               'target_hours', 2.0,
               'effective_base_points', coalesce(w.points, 1.0),
               'effective_target_hours', 2.0,
               'component', jsonb_build_object(
                 'component_no', coalesce(w.component, 'COM-001'),
                 'component_id', coalesce(w.component, 'COM-001'),
                 'component_name', coalesce(nullif(w.activity, ''), w.component, 'Pekerjaan'),
                 'category', coalesce(w.section, 'General'),
                 'base_points', coalesce(w.points, 1.0),
                 'target_hours', 2.0
               ),
               'activity', w.activity,
               'section', coalesce(w.section, 'maintenance'),
               'work_condition', 'normal',
               'location', 'workshop',
               'start_time', w.start_time,
               'end_time', w.end_time,
               'actual_hours', coalesce(w.duration_hours, 0),
               'duration_hours', coalesce(w.duration_hours, 0),
               'status', kmb_projek._normalisasi_status_wo(w.status),
               'points', coalesce(w.points, 0),
               'final_points', coalesce(w.points, 0),
               'idr_value', coalesce(w.idr_value, 0),
               'final_idr', coalesce(w.idr_value, 0),
               'lead_mechanic_id', w.lead_mechanic_id,
               'mechanic_ids', coalesce(w.mechanic_ids, w.lead_mechanic_id, ''),
               'team', CASE WHEN w.lead_mechanic_id IS NOT NULL
                            THEN jsonb_build_array(jsonb_build_object('mechanic_id', w.lead_mechanic_id, 'mechanic_name', coalesce(m.name, w.lead_mechanic_id), 'name', coalesce(m.name, w.lead_mechanic_id), 'percentage', 100))
                            ELSE '[]'::jsonb END,
               'effective_team', CASE WHEN w.lead_mechanic_id IS NOT NULL
                            THEN jsonb_build_array(jsonb_build_object('mechanic_id', w.lead_mechanic_id, 'mechanic_name', coalesce(m.name, w.lead_mechanic_id), 'name', coalesce(m.name, w.lead_mechanic_id), 'percentage', 100))
                            ELSE '[]'::jsonb END,
               'team_names', CASE WHEN w.lead_mechanic_id IS NOT NULL
                                  THEN jsonb_build_array(coalesce(m.name, w.lead_mechanic_id))
                                  ELSE '[]'::jsonb END,
               'keterangan', coalesce(w.notes, ''),
               'created_by', coalesce(w.created_by, ''),
               'created_at', coalesce(to_char(w.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF'), w.date::text),
               'created_at_str', w.date::text
             )
        FROM kmb_projek.work_orders w
        LEFT JOIN kmb_projek.config_mechanics m ON upper(btrim(m.mechanic_id)) = upper(btrim(w.lead_mechanic_id))
       WHERE nullif(btrim(coalesce(w.wo_number, w.id, '')), '') IS NOT NULL
         AND upper(btrim(coalesce(w.wo_number, w.id, ''))) <> 'WO-0'
         AND NOT EXISTS (
           SELECT 1 FROM kmb_projek.wo_supabase s
            WHERE s.id = w.id OR s.wo_number = w.wo_number
         );
  END IF;
END;
$$;

-- Helper pencocokan apakah sebuah WO dimiliki oleh mekanik tertentu (case-insensitive pada ID maupun Nama)
CREATE OR REPLACE FUNCTION kmb_projek._wo_milik_mekanik(p_wo jsonb, p_mid text, p_mname text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_id   text := upper(btrim(coalesce(p_mid, '')));
  v_name text := upper(btrim(coalesce(p_mname, '')));
BEGIN
  IF v_id = '' AND v_name = '' THEN
    RETURN false;
  END IF;

  IF v_id <> '' AND (
       upper(btrim(coalesce(p_wo->>'lead_mechanic_id', ''))) = v_id
    OR upper(btrim(coalesce(p_wo->>'mechanic_id', ''))) = v_id
  ) THEN
    RETURN true;
  END IF;

  IF v_name <> '' AND (
       upper(btrim(coalesce(p_wo->>'lead_mechanic_id', ''))) = v_name
    OR upper(btrim(coalesce(p_wo->>'mechanic_name', ''))) = v_name
  ) THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(p_wo->'team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'team') el
       WHERE (v_id <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el #>> '{}', ''))) = v_id)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'effective_team') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_wo->'effective_team') el
       WHERE (v_id <> '' AND upper(btrim(coalesce(el->>'mechanic_id', el->>'id', el #>> '{}', ''))) = v_id)
          OR (v_name <> '' AND upper(btrim(coalesce(el->>'mechanic_name', el->>'name', el->>'mechanic_id', ''))) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF jsonb_typeof(p_wo->'team_distribution') = 'object' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(p_wo->'team_distribution') td
       WHERE (v_id <> '' AND upper(btrim(td.key)) = v_id)
          OR (v_name <> '' AND upper(btrim(td.key)) = v_name)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_id <> '' AND coalesce(p_wo->>'mechanic_ids', '') <> '' THEN
    IF EXISTS (
      SELECT 1 FROM regexp_split_to_table(p_wo->>'mechanic_ids', '[,;]') s
       WHERE upper(btrim(s)) = v_id
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ==============================================================================
-- 1. RPC BACA LENGKAP KMB PROJECT (`ping`, `create_refs`, `monitoring`, `my_wos`, `wos_by_status`, `monitoring_daftar`, `wo_detail`, `konteks_skor`)
-- ==============================================================================

-- 1a. Ping Token
CREATE OR REPLACE FUNCTION public.kmb_ping(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object(
      'success', false,
      'result', null,
      'error', v_auth->>'error',
      'source', 'SUPABASE'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'result', json_build_object(
      'mechanic_id', coalesce(v_auth->>'mechanic_id', ''),
      'name', coalesce(v_auth->>'name', ''),
      'role', coalesce(v_auth->>'role', 'mechanic'),
      'email', coalesce(v_auth->>'email', ''),
      'section', coalesce(v_auth->>'section', ''),
      'tenant_code', 'KMB'
    ),
    'source', 'SUPABASE'
  );
END;
$$;

-- 1b. Katalog Referensi Pembuatan WO (Units, Mechanics, Components, Jobs Cascade)
CREATE OR REPLACE FUNCTION public.kmb_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units jsonb;
  v_mechs jsonb;
  v_comps jsonb;
  v_jobs_field jsonb;
  v_jobs_workshop jsonb := '[]'::jsonb;
  v_jobs_vessel jsonb;
  v_factors jsonb;
  v_refs jsonb;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  -- Units
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.unit_code,
    'unit_name', coalesce(nullif(btrim(u.unit_name), ''), u.unit_code),
    'unit_type', coalesce(u.section, 'OTHERS'),
    'unit_model', coalesce(u.model, ''),
    'unit_scope', jsonb_build_array(coalesce(u.section, 'all')),
    'unit_factor', coalesce(u.unit_factor, 1.0)
  ) ORDER BY u.unit_code), '[]'::jsonb)
  INTO v_units
  FROM kmb_projek.config_units u
  WHERE upper(btrim(coalesce(u.status, 'ACTIVE'))) = 'ACTIVE';

  -- Mechanics (case-insensitive role & status)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'mechanic_id', m.mechanic_id,
    'mechanic_name', coalesce(nullif(btrim(m.name), ''), m.mechanic_id),
    'name', coalesce(nullif(btrim(m.name), ''), m.mechanic_id),
    'section', coalesce(nullif(btrim(m.section), ''), 'maintenance')
  ) ORDER BY m.mechanic_id), '[]'::jsonb)
  INTO v_mechs
  FROM kmb_projek.config_mechanics m
  WHERE lower(btrim(coalesce(m.role, 'mechanic'))) = 'mechanic'
    AND upper(btrim(coalesce(m.status, 'ACTIVE'))) = 'ACTIVE';

  -- Components
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', c.component_id,
    'component_no', c.component_id,
    'component_name', c.name,
    'category', coalesce(c.section, 'General'),
    'base_points', coalesce(c.base_points, 1.25),
    'target_hours', coalesce(c.target_hours, 2.0)
  ) ORDER BY c.component_id), '[]'::jsonb)
  INTO v_comps
  FROM kmb_projek.config_components c
  WHERE upper(btrim(coalesce(c.status, 'ACTIVE'))) = 'ACTIVE';

  -- Jobs Field / Maintenance
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive')
  ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::jsonb)
  INTO v_jobs_field
  FROM kmb_projek.catalog_jobs j
  WHERE lower(btrim(coalesce(j.section, 'maintenance'))) IN ('maintenance', 'field')
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  -- Fallback otomatis jika catalog_jobs maintenance masih kosong
  IF jsonb_array_length(v_jobs_field) = 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'job_id', c.component_id,
      'unit_model', '',
      'component', c.name,
      'sub_component', 'General',
      'job_description', c.name,
      'plan_hours', 2.0,
      'base_point', 1.25,
      'job_type', 'Preventive'
    ) ORDER BY c.component_id), '[]'::jsonb)
    INTO v_jobs_field
    FROM kmb_projek.config_components c
    WHERE upper(btrim(coalesce(c.status, 'ACTIVE'))) = 'ACTIVE';
  END IF;

  -- Jobs Vessel / Rekondisi / Tyre
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive')
  ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::jsonb)
  INTO v_jobs_vessel
  FROM kmb_projek.catalog_jobs j
  WHERE lower(btrim(coalesce(j.section, ''))) IN ('vessel', 'rekondisi', 'tyre', 'tyreman')
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  IF jsonb_array_length(v_jobs_vessel) = 0 THEN
    v_jobs_vessel := v_jobs_field;
  END IF;

  -- Jobs Workshop
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive')
  ) ORDER BY j.component, j.sub_component, j.job_description), '[]'::jsonb)
  INTO v_jobs_workshop
  FROM kmb_projek.catalog_jobs j
  WHERE lower(btrim(coalesce(j.section, ''))) = 'workshop'
    AND upper(btrim(coalesce(j.status, 'ACTIVE'))) = 'ACTIVE';

  IF jsonb_array_length(v_jobs_workshop) = 0 THEN
    v_jobs_workshop := v_jobs_field;
  END IF;

  -- Factors
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'type', f.factor_type,
    'factor_type', f.factor_type,
    'key', f.key,
    'value', f.value
  )), '[]'::jsonb)
  INTO v_factors
  FROM kmb_projek.config_factors f;

  v_refs := jsonb_build_object(
    'sections', jsonb_build_array('vessel', 'maintenance'),
    'units', v_units,
    'mechanics', v_mechs,
    'components', v_comps,
    'jobs_field', v_jobs_field,
    'jobs_workshop', v_jobs_workshop,
    'jobs_vessel', v_jobs_vessel,
    'factors', v_factors,
    'work_conditions', jsonb_build_array(
      jsonb_build_object('key', 'normal', 'label', 'Shift 1', 'factor', coalesce((SELECT value FROM kmb_projek.config_factors WHERE lower(factor_type) = 'work_condition' AND lower(key) = 'normal' LIMIT 1), 1.0)),
      jsonb_build_object('key', 'difficult', 'label', 'Shift 2', 'factor', coalesce((SELECT value FROM kmb_projek.config_factors WHERE lower(factor_type) = 'work_condition' AND lower(key) = 'difficult' LIMIT 1), 1.1)),
      jsonb_build_object('key', 'extreme', 'label', 'Kondisi Ekstrim', 'factor', coalesce((SELECT value FROM kmb_projek.config_factors WHERE lower(factor_type) = 'work_condition' AND lower(key) = 'extreme' LIMIT 1), 1.2))
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

CREATE OR REPLACE FUNCTION public.kmb_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public.kmb_create_refs();
END;
$$;

-- 1c. Monitoring Ringkasan (Menghitung gabungan wo_supabase + work_orders melalui _semua_wo_json)
CREATE OR REPLACE FUNCTION public.kmb_monitoring()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mechs  jsonb;
  v_total  int := 0;
  v_p_work int := 0;
  v_exp    int := 0;
  v_p_l1   int := 0;
  v_p_l2   int := 0;
  v_app    int := 0;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  WITH semua_wo AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
  ),
  token_aktif AS (
    SELECT DISTINCT ON (upper(btrim(user_id)))
           upper(btrim(user_id)) AS uid_upper,
           btrim(token) AS token
      FROM kmb_projek.api_tokens
     WHERE upper(btrim(coalesce(status, 'ACTIVE'))) = 'ACTIVE'
       AND nullif(btrim(user_id), '') IS NOT NULL
     ORDER BY upper(btrim(user_id)), created_at DESC NULLS LAST
  ),
  mech_counts AS (
    SELECT m.mechanic_id AS id,
           m.mechanic_id AS mechanic_id,
           coalesce(nullif(btrim(m.name), ''), m.mechanic_id) AS name,
           coalesce(m.section, 'maintenance') AS section,
           coalesce(ta.token, nullif(btrim(m.token), ''), '') AS token,
           (coalesce(ta.token, nullif(btrim(m.token), '')) IS NOT NULL) AS has_token,
           CASE WHEN coalesce(m.is_test_account, false) THEN 'UJI' ELSE '' END AS uji,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'pending_mechanic_work'), 0)::int AS pending_mechanic_work,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'expired'), 0)::int AS expired,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'pending_supervisor'), 0)::int AS pending_l1,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'pending_superintendent'), 0)::int AS pending_l2,
           coalesce(count(w.wo) FILTER (WHERE (w.wo->>'status') = 'approved'), 0)::int AS approved
      FROM kmb_projek.config_mechanics m
      LEFT JOIN token_aktif ta ON ta.uid_upper = upper(btrim(m.mechanic_id))
      LEFT JOIN semua_wo w ON kmb_projek._wo_milik_mekanik(w.wo, m.mechanic_id, m.name)
     WHERE lower(btrim(coalesce(m.role, 'mechanic'))) = 'mechanic'
       AND upper(btrim(coalesce(m.status, 'ACTIVE'))) = 'ACTIVE'
     GROUP BY m.mechanic_id, m.name, m.section, m.token, m.is_test_account, ta.token
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'mechanic_id', mechanic_id,
           'name', name,
           'section', section,
           'token', token,
           'has_token', has_token,
           'uji', uji,
           'pending_mechanic_work', pending_mechanic_work,
           'pending_work', pending_mechanic_work,
           'expired', expired,
           'pending_l1', pending_l1,
           'pending_l2', pending_l2,
           'approved', approved
         ) ORDER BY id), '[]'::jsonb),
         count(*)::int
    INTO v_mechs, v_total
    FROM mech_counts;

  SELECT coalesce(count(*) FILTER (WHERE (wo->>'status') = 'pending_mechanic_work'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'expired'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'pending_supervisor'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'pending_superintendent'), 0)::int,
         coalesce(count(*) FILTER (WHERE (wo->>'status') = 'approved'), 0)::int
    INTO v_p_work, v_exp, v_p_l1, v_p_l2, v_app
    FROM kmb_projek._semua_wo_json() AS wo;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'overall', jsonb_build_object(
        'mechanics', coalesce(v_total, 0),
        'total_mechanics', coalesce(v_total, 0),
        'pending_mechanic_work', coalesce(v_p_work, 0),
        'expired', coalesce(v_exp, 0),
        'pending_l1', coalesce(v_p_l1, 0),
        'pending_l2', coalesce(v_p_l2, 0),
        'approved', coalesce(v_app, 0)
      ),
      'mechanics', coalesce(v_mechs, '[]'::jsonb),
      'pulled_at', v_pulled
    )
  )::json;
END;
$$;

-- kmb_monitoring_bertoken: definisinya pindah ke db/bersama/monitoring_bertoken.sql (gerbang peran seperti GAS, 14 Nov 2026).

-- 1d. Daftar WO Mekanik (`kmb_my_wos` & `kmb_my_wos_bertoken`, Case-Insensitive pada ID & Nama)
CREATE OR REPLACE FUNCTION public.kmb_my_wos(p_mechanic_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mid    text := btrim(coalesce(p_mechanic_id, ''));
  v_mname  text := '';
  v_wos    jsonb := '[]'::jsonb;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  SELECT coalesce(name, '') INTO v_mname
    FROM kmb_projek.config_mechanics
   WHERE upper(btrim(mechanic_id)) = upper(v_mid)
   LIMIT 1;

  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE kmb_projek._wo_milik_mekanik(wo, v_mid, v_mname)
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_wos
    FROM semua;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
    'data', jsonb_build_object('wos', v_wos)
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth   jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_mid    text;
  v_mname  text;
  v_wos    jsonb := '[]'::jsonb;
  v_pulled text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  v_mid   := coalesce(v_auth->>'mechanic_id', '');
  v_mname := coalesce(v_auth->>'name', '');

  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE kmb_projek._wo_milik_mekanik(wo, v_mid, v_mname)
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_wos
    FROM semua;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('wos', v_wos, 'pulled_at', v_pulled),
    'data', jsonb_build_object('wos', v_wos)
  )::json;
END;
$$;

-- 1e. Daftar WO berdasarkan status (`kmb_wos_by_status` & `kmb_wos_by_status_bertoken`)
CREATE OR REPLACE FUNCTION public.kmb_wos_by_status(p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req       text := lower(btrim(coalesce(p_status, 'pending')));
  v_wos       jsonb := '[]'::jsonb;
  v_transfers jsonb := '[]'::jsonb;
  v_pulled    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
BEGIN
  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_wos
    FROM semua
   WHERE (
     (v_req = 'pending' AND (wo->>'status') IN ('pending_supervisor', 'pending_superintendent', 'pending_transfer'))
     OR (v_req = 'active' AND (wo->>'status') IN ('pending_mechanic_work', 'expired'))
     OR (v_req = 'approved' AND (wo->>'status') = 'approved')
     OR (v_req = 'rejected' AND (wo->>'status') IN ('rejected', 'cancelled'))
     OR (v_req = 'cancelable' AND (wo->>'status') IN ('pending_mechanic_work', 'pending_supervisor', 'pending_superintendent', 'expired'))
     OR (v_req = 'transfers' AND ((wo->>'status') = 'pending_transfer' OR coalesce(wo->>'transfer_status', '') = 'pending'))
     OR ((wo->>'status') = v_req)
   );

  WITH tr AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE (wo->>'status') = 'pending_transfer' OR coalesce(wo->>'transfer_status', '') = 'pending'
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_transfers
    FROM tr;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'wos', v_wos,
      'pending', CASE WHEN v_req = 'pending' THEN v_wos ELSE '[]'::jsonb END,
      'active', CASE WHEN v_req = 'active' THEN v_wos ELSE '[]'::jsonb END,
      'approved', CASE WHEN v_req = 'approved' THEN v_wos ELSE '[]'::jsonb END,
      'rejected', CASE WHEN v_req = 'rejected' THEN v_wos ELSE '[]'::jsonb END,
      'transfers', CASE WHEN v_req = 'transfers' THEN v_wos ELSE v_transfers END,
      'pulled_at', v_pulled
    ),
    'data', jsonb_build_object(
      'wos', v_wos,
      'pending', CASE WHEN v_req = 'pending' THEN v_wos ELSE '[]'::jsonb END,
      'active', CASE WHEN v_req = 'active' THEN v_wos ELSE '[]'::jsonb END,
      'approved', CASE WHEN v_req = 'approved' THEN v_wos ELSE '[]'::jsonb END,
      'rejected', CASE WHEN v_req = 'rejected' THEN v_wos ELSE '[]'::jsonb END,
      'transfers', CASE WHEN v_req = 'transfers' THEN v_wos ELSE v_transfers END
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_wos_by_status_bertoken(p_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public.kmb_wos_by_status(p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_monitoring_daftar_bertoken(p_token text, p_kategori text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth  jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_kat   text := lower(btrim(coalesce(p_kategori, 'belum')));
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  WITH semua AS (
    SELECT wo FROM kmb_projek._semua_wo_json() AS wo
     WHERE (v_kat = 'belum' AND (wo->>'status') = 'pending_mechanic_work')
        OR (v_kat = 'expired' AND (wo->>'status') = 'expired')
        OR (v_kat = 'l1' AND (wo->>'status') = 'pending_supervisor')
        OR (v_kat = 'l2' AND (wo->>'status') = 'pending_superintendent')
        OR (v_kat = 'approved' AND (wo->>'status') = 'approved')
  )
  SELECT coalesce(jsonb_agg(wo ORDER BY wo->>'created_at' DESC), '[]'::jsonb)
    INTO v_items
    FROM semua;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'kategori', v_kat,
      'judul', 'Daftar Work Order',
      'total', jsonb_array_length(v_items),
      'ditampilkan', jsonb_array_length(v_items),
      'items', v_items
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_wo_detail_bertoken(p_token text, p_wo_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_wo   jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  SELECT wo INTO v_wo
    FROM kmb_projek._semua_wo_json() AS wo
   WHERE trim(wo->>'id') = btrim(coalesce(p_wo_id, ''))
      OR trim(wo->>'wo_number') = btrim(coalesce(p_wo_id, ''))
   LIMIT 1;

  IF v_wo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Work order tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  RETURN jsonb_build_object('success', true, 'source', 'SUPABASE', 'result', v_wo || jsonb_build_object('wo', v_wo), 'data', v_wo || jsonb_build_object('wo', v_wo))::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_konteks_skor_bertoken(p_token text, p_wo_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth    jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_wo      jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  SELECT wo INTO v_wo
    FROM kmb_projek._semua_wo_json() AS wo
   WHERE trim(wo->>'id') = btrim(coalesce(p_wo_id, ''))
      OR trim(wo->>'wo_number') = btrim(coalesce(p_wo_id, ''))
   LIMIT 1;

  IF v_wo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Work order tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('factor_type', factor_type, 'type', factor_type, 'key', key, 'value', value)), '[]'::jsonb)
      INTO v_factors FROM kmb_projek.config_factors;
  EXCEPTION WHEN OTHERS THEN v_factors := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'wo', v_wo,
      'factors', v_factors,
      'base_settings', '[]'::jsonb,
      'mechanics', coalesce((SELECT jsonb_agg(jsonb_build_object('mechanic_id', mechanic_id, 'name', name, 'section', section)) FROM kmb_projek.config_mechanics), '[]'::jsonb)
    )
  )::json;
END;
$$;

-- ==============================================================================
-- 2. EKSEKUSI AKSI TULIS & DESKTOP MANDIRI (`kmb_eksekusi_aksi_bertoken`)
-- ==============================================================================
-- Signature ini sebelumnya mengembalikan jsonb. Return type tidak dapat
-- diubah dengan CREATE OR REPLACE, sehingga overload lama harus dihapus dulu.
DROP FUNCTION IF EXISTS public.kmb_eksekusi_aksi_bertoken(text, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.kmb_eksekusi_aksi_bertoken(
  p_token   text,
  p_aksi    text,
  p_op_id   text,
  p_payload jsonb,
  p_skor_js jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth       jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_aksi       text := btrim(coalesce(p_aksi, ''));
  v_op_id      text := btrim(coalesce(p_op_id, ''));
  v_actor_id   text;
  v_actor_name text;
  v_actor_role text;
  v_cached     jsonb;
  v_now_iso    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF');
  v_tgl_str    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY');
  v_wo_id      text;
  v_wo_num     text;
  v_wo         jsonb;
  v_bp         numeric := 1.0;
  v_th         numeric := 2.0;
  v_uf         numeric := 1.0;
  v_act_hours  numeric := 0;
  v_part_hours numeric := 0;
  v_start_iso  text;
  v_end_iso    text;
  v_reason     text;
  v_team       jsonb := '[]'::jsonb;
  v_team_names jsonb := '[]'::jsonb;
  v_lead_id    text := '';
  v_elem       jsonb;
  v_blk        jsonb;
  v_blocks     jsonb;
  v_created    jsonb := '[]'::jsonb;
  v_mid        text;
  v_mid_canon  text;
  v_mname      text;
  v_job_id     text;
  v_comp_id    text;
  v_comp_name  text;
  v_unit_id    text;
  v_unit_name  text;
  v_fp         numeric := 0;
  v_total_idr  numeric := 0;
  v_putaran    int := 1;
  v_out        jsonb;
  v_is_rel     boolean;
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;

  v_actor_id   := v_auth->>'mechanic_id';
  v_actor_name := v_auth->>'name';
  v_actor_role := v_auth->>'role';

  IF v_op_id <> '' THEN
    SELECT result_json INTO v_cached FROM kmb_projek.wo_ops_supabase WHERE op_id = v_op_id LIMIT 1;
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'work_orders' AND column_name = 'wo_number'
  ) INTO v_is_rel;

  -- A. SIMPAN PUSH SUBSCRIPTION
  IF v_aksi = 'save_push_sub' THEN
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('saved', true));
  END IF;

  -- B. BUAT WORK ORDER BARU (Mendukung baik payload tunggal maupun batch `blocks: [...]`)
  IF v_aksi IN ('create_wo', 'createWO', 'handleCreateWO', 'buat_wo') THEN
    IF jsonb_typeof(p_payload->'blocks') = 'array' AND jsonb_array_length(p_payload->'blocks') > 0 THEN
      v_blocks := p_payload->'blocks';
    ELSIF jsonb_typeof(p_payload->'data'->'blocks') = 'array' AND jsonb_array_length(p_payload->'data'->'blocks') > 0 THEN
      v_blocks := p_payload->'data'->'blocks';
    ELSE
      v_blocks := jsonb_build_array(coalesce(p_payload, '{}'::jsonb));
    END IF;

    FOR v_blk IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
      v_wo_num     := kmb_projek._nomor_wo_baru_wib();
      v_wo_id      := 'WO-KMBP-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
      v_team       := '[]'::jsonb;
      v_team_names := '[]'::jsonb;
      v_lead_id    := '';

      v_job_id    := btrim(coalesce(v_blk->>'job_id', ''));
      v_comp_id   := btrim(coalesce(nullif(v_blk->>'component_id', ''), nullif(v_blk->>'component', ''), nullif(v_job_id, ''), 'COM-001'));
      v_comp_name := btrim(coalesce(nullif(v_blk->>'component_name', ''), nullif(v_blk->>'others_description', ''), nullif(v_blk->>'activity', ''), ''));
      v_unit_id   := btrim(coalesce(nullif(v_blk->>'unit_id', ''), nullif(v_blk->>'unit_code', ''), 'WORKSHOP'));
      v_unit_name := btrim(coalesce(nullif(v_blk->>'unit_name', ''), ''));

      v_bp := coalesce(nullif(v_blk->>'others_base_points', '')::numeric, nullif(v_blk->>'manual_base_points', '')::numeric, nullif(v_blk->>'base_points', '')::numeric, null);
      v_th := coalesce(nullif(v_blk->>'others_target_hours', '')::numeric, nullif(v_blk->>'manual_target_hours', '')::numeric, nullif(v_blk->>'target_hours', '')::numeric, null);
      v_uf := coalesce(nullif(v_blk->>'others_unit_factor', '')::numeric, nullif(v_blk->>'manual_unit_factor', '')::numeric, nullif(v_blk->>'unit_factor', '')::numeric, null);

      -- Lengkapi unit_name & unit_factor dari config_units bila belum dikirim klien
      IF v_unit_id <> '' AND v_unit_id <> 'WORKSHOP' AND v_unit_id <> 'OTHERS' THEN
        BEGIN
          SELECT coalesce(nullif(v_unit_name, ''), nullif(btrim(unit_name), ''), v_unit_id),
                 coalesce(v_uf, unit_factor, 1.0)
            INTO v_unit_name, v_uf
            FROM kmb_projek.config_units
           WHERE upper(btrim(unit_code)) = upper(v_unit_id)
           LIMIT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
      v_unit_name := coalesce(nullif(v_unit_name, ''), v_unit_id);
      v_uf        := coalesce(v_uf, 1.0);

      -- Lengkapi nama pekerjaan, poin dasar, dan target jam dari catalog_jobs / config_components bila belum dikirim klien
      IF v_job_id <> '' THEN
        BEGIN
          SELECT coalesce(nullif(v_comp_name, ''), job_description, component, v_comp_id),
                 coalesce(v_bp, base_point, 1.25),
                 coalesce(v_th, plan_hours, 2.0)
            INTO v_comp_name, v_bp, v_th
            FROM kmb_projek.catalog_jobs
           WHERE btrim(job_id) = v_job_id
           LIMIT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      IF (coalesce(v_comp_name, '') = '' OR v_bp IS NULL OR v_th IS NULL) AND v_is_rel THEN
        BEGIN
          SELECT coalesce(nullif(v_comp_name, ''), name, v_comp_id),
                 coalesce(v_bp, base_points, 1.25),
                 coalesce(v_th, target_hours, 2.0)
            INTO v_comp_name, v_bp, v_th
            FROM kmb_projek.config_components
           WHERE btrim(component_id) = v_comp_id OR btrim(component_id) = v_job_id
           LIMIT 1;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      v_comp_name := coalesce(nullif(v_comp_name, ''), v_job_id, v_comp_id, 'Pekerjaan');
      v_bp := coalesce(v_bp, 1.25);
      v_th := coalesce(v_th, 2.0);

      IF jsonb_typeof(v_blk->'team') = 'array' AND jsonb_array_length(v_blk->'team') > 0 THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_blk->'team') LOOP
          v_mid := btrim(coalesce(v_elem->>'mechanic_id', v_elem->>'id', v_elem #>> '{}', ''));
          IF v_mid <> '' THEN
            v_mid_canon := v_mid;
            v_mname     := v_mid;
            BEGIN
              IF v_is_rel THEN
                SELECT mechanic_id, coalesce(nullif(btrim(name), ''), mechanic_id)
                  INTO v_mid_canon, v_mname
                  FROM kmb_projek.config_mechanics
                 WHERE upper(btrim(mechanic_id)) = upper(v_mid)
                    OR upper(btrim(name)) = upper(v_mid)
                 LIMIT 1;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
            v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid);
            v_mname     := coalesce(nullif(v_mname, ''), v_mid_canon);
            IF v_lead_id = '' THEN v_lead_id := v_mid_canon; END IF;
            v_team := v_team || jsonb_build_array(jsonb_build_object(
              'mechanic_id', v_mid_canon,
              'mechanic_name', v_mname,
              'name', v_mname,
              'percentage', coalesce(nullif(v_elem->>'percentage', '')::numeric, 100)
            ));
            v_team_names := v_team_names || jsonb_build_array(v_mname);
          END IF;
        END LOOP;
      ELSIF jsonb_typeof(v_blk->'team_distribution') = 'object' THEN
        FOR v_mid IN SELECT key FROM jsonb_each(v_blk->'team_distribution') LOOP
          v_mid := btrim(coalesce(v_mid, ''));
          IF v_mid <> '' THEN
            v_mid_canon := v_mid;
            v_mname     := v_mid;
            BEGIN
              IF v_is_rel THEN
                SELECT mechanic_id, coalesce(nullif(btrim(name), ''), mechanic_id)
                  INTO v_mid_canon, v_mname
                  FROM kmb_projek.config_mechanics
                 WHERE upper(btrim(mechanic_id)) = upper(v_mid)
                    OR upper(btrim(name)) = upper(v_mid)
                 LIMIT 1;
              END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
            v_mid_canon := coalesce(nullif(v_mid_canon, ''), v_mid);
            v_mname     := coalesce(nullif(v_mname, ''), v_mid_canon);
            IF v_lead_id = '' THEN v_lead_id := v_mid_canon; END IF;
            v_team := v_team || jsonb_build_array(jsonb_build_object(
              'mechanic_id', v_mid_canon,
              'mechanic_name', v_mname,
              'name', v_mname,
              'percentage', coalesce(nullif(v_blk->'team_distribution'->>v_mid, '')::numeric, 100)
            ));
            v_team_names := v_team_names || jsonb_build_array(v_mname);
          END IF;
        END LOOP;
      END IF;

      -- Fallback bila pembuat WO adalah mekanik sendiri dan tidak memilih tim
      IF v_lead_id = '' AND v_actor_role = 'mechanic' THEN
        v_lead_id := v_actor_id;
        v_team := jsonb_build_array(jsonb_build_object('mechanic_id', v_actor_id, 'mechanic_name', v_actor_name, 'name', v_actor_name, 'percentage', 100));
        v_team_names := jsonb_build_array(v_actor_name);
      END IF;

      v_wo := jsonb_build_object(
        'id', v_wo_id,
        'wo_id', v_wo_id,
        'wo_number', v_wo_num,
        'status', 'pending_mechanic_work',
        'status_group', 'assigned',
        'status_label', 'Perlu Diisi Mekanik',
        'section', coalesce(v_blk->>'section', v_auth->>'section', 'maintenance'),
        'job_id', v_job_id,
        'component_id', v_comp_id,
        'component_name', v_comp_name,
        'component', jsonb_build_object(
          'component_no', v_comp_id,
          'component_id', v_comp_id,
          'component_name', v_comp_name,
          'category', coalesce(v_blk->>'section', 'General'),
          'base_points', v_bp,
          'target_hours', v_th
        ),
        'unit_id', v_unit_id,
        'unit_code', v_unit_id,
        'unit_name', v_unit_name,
        'unit_factor', v_uf,
        'unit', jsonb_build_object(
          'unit_id', v_unit_id,
          'unit_name', v_unit_name,
          'unit_factor', v_uf
        ),
        'base_points', v_bp,
        'target_hours', v_th,
        'effective_base_points', v_bp,
        'effective_target_hours', v_th,
        'work_condition', coalesce(v_blk->>'work_condition', 'normal'),
        'location', coalesce(v_blk->>'location', 'workshop'),
        'hour_meter', coalesce(v_blk->>'hour_meter', ''),
        'kilometers', coalesce(v_blk->>'kilometers', ''),
        'keterangan', coalesce(v_blk->>'keterangan', v_blk->>'notes', ''),
        'wo_group_id', coalesce(v_blk->>'wo_group_id', ''),
        'wo_group_mode', coalesce(v_blk->>'wo_group_mode', ''),
        'grup_total', coalesce(nullif(v_blk->>'grup_total', '')::int, jsonb_array_length(v_blocks)),
        'grup_selesai', 0,
        'lead_mechanic_id', v_lead_id,
        'team', v_team,
        'effective_team', v_team,
        'team_names', v_team_names,
        'team_count', GREATEST(jsonb_array_length(v_team), 1),
        'created_by', v_actor_id,
        'created_by_name', v_actor_name,
        'created_by_is_mechanic', (v_actor_role = 'mechanic'),
        'created_at', v_now_iso,
        'created_at_str', v_tgl_str,
        'batas_kerja_at', to_char((now() + interval '24 hours') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'source', 'SUPABASE'
      );

      INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
      VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, v_team, now());

      IF v_is_rel THEN
        BEGIN
          INSERT INTO kmb_projek.work_orders (
            id, wo_number, date, shift, unit_code, component, activity, section,
            lead_mechanic_id, mechanic_ids, status, notes, created_by, created_at, source
          ) VALUES (
            v_wo_id, v_wo_num, (now() AT TIME ZONE 'Asia/Jakarta')::date, 'Shift 1',
            v_unit_id, v_comp_id, v_comp_name, v_wo->>'section',
            v_lead_id, v_lead_id, 'assigned', v_wo->>'keterangan', v_actor_id, now(), 'SUPABASE'
          ) ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      v_created := v_created || jsonb_build_array(jsonb_build_object(
        'id', v_wo_id,
        'wo_id', v_wo_id,
        'wo_number', v_wo_num,
        'unit_id', v_unit_id,
        'unit_name', v_unit_name,
        'component_id', v_comp_id,
        'component_name', v_comp_name,
        'label', v_comp_name || ' · ' || v_unit_id
      ));
    END LOOP;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object(
        'id', v_created->0->>'wo_id',
        'wo_id', v_created->0->>'wo_id',
        'wo_number', v_created->0->>'wo_number',
        'status', 'pending_mechanic_work',
        'created', v_created,
        'failed', '[]'::jsonb,
        'message', 'Work order ' || coalesce(v_created->0->>'wo_number', '') || ' berhasil dibuat di Supabase'
      ),
      'data', jsonb_build_object(
        'id', v_created->0->>'wo_id',
        'wo_id', v_created->0->>'wo_id',
        'wo_number', v_created->0->>'wo_number',
        'created', v_created,
        'failed', '[]'::jsonb
      )
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- Ambil WO untuk aksi mutasi
  v_wo_id := btrim(coalesce(p_payload->>'wo_id', p_payload->>'id', p_payload->>'wo_number', ''));
  SELECT wo INTO v_wo
    FROM kmb_projek._semua_wo_json() AS wo
   WHERE trim(wo->>'id') = v_wo_id OR trim(wo->>'wo_number') = v_wo_id
   LIMIT 1;

  IF v_wo IS NULL AND v_aksi NOT IN ('riwayatHmUnit', 'riwayatKmUnit', 'gantiPanelHm', 'gantiPanelKm', 'ganti_panel_meter', 'dataDashboardTeknis', 'dataDashboardField', 'loadJobsCatalog', 'generatePayrollReport', 'generateReport') THEN
    RETURN json_build_object('success', false, 'error', 'Work order ' || v_wo_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF v_wo IS NOT NULL THEN
    v_wo_id  := v_wo->>'id';
    v_wo_num := v_wo->>'wo_number';
  END IF;

  -- C. SUBMIT WORK
  IF v_aksi IN ('submit_work', 'submit_job', 'submitMechanicWork', 'handleSubmitMechanicWork', 'submitWO', 'startWO', 'finishWO', 'kirim_kerja') THEN
    v_start_iso := coalesce(nullif(trim(p_payload->>'start_time'), ''), v_now_iso);
    v_end_iso   := coalesce(nullif(trim(p_payload->>'end_time'), ''), v_now_iso);
    BEGIN
      v_act_hours := round((EXTRACT(EPOCH FROM (v_end_iso::timestamptz - v_start_iso::timestamptz)) / 3600.0)::numeric, 2);
      IF v_act_hours <= 0 THEN v_act_hours := 0.25; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_act_hours := coalesce(nullif(p_payload->>'duration_hours', '')::numeric, 1.0);
    END;
    v_act_hours := round(v_act_hours + coalesce((v_wo->>'partial_hours')::numeric, 0), 2);

    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_supervisor',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Approval L1',
      'start_time', v_start_iso,
      'end_time', v_end_iso,
      'actual_hours', v_act_hours,
      'duration_hours', v_act_hours,
      'hour_meter', coalesce(nullif(p_payload->>'hour_meter', ''), v_wo->>'hour_meter', ''),
      'kilometers', coalesce(nullif(p_payload->>'kilometers', ''), v_wo->>'kilometers', ''),
      'part_type', coalesce(p_payload->>'part_type', p_payload->>'part_category', v_wo->>'part_type', ''),
      'part_category', coalesce(p_payload->>'part_category', p_payload->>'part_type', v_wo->>'part_category', ''),
      'submitted_by', v_actor_id,
      'submitted_by_name', v_actor_name,
      'submitted_at', v_now_iso,
      'submitted_at_str', v_tgl_str
    );

    IF p_payload ? 'detail_tyre' AND p_payload->'detail_tyre' IS NOT NULL AND jsonb_typeof(p_payload->'detail_tyre') = 'object' THEN
      v_wo := v_wo || jsonb_build_object(
        'detail_tyre', p_payload->'detail_tyre',
        'tyre', jsonb_build_object(
          'jenis', CASE
            WHEN p_payload->'detail_tyre' ? 'inspeksi' THEN 'inspeksi'
            WHEN p_payload->'detail_tyre' ? 'remove_instal' THEN 'remove_instal'
            WHEN p_payload->'detail_tyre' ? 'repair' THEN 'repair'
            ELSE coalesce(v_wo #>> '{tyre,jenis}', 'inspeksi')
          END,
          'before', coalesce(v_wo #> '{tyre,before}', '{}'::jsonb),
          'isian', p_payload->'detail_tyre'
        )
      );
    END IF;

    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_supervisor', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_supervisor', data = EXCLUDED.data, diubah_at = now();

    IF v_is_rel THEN
      BEGIN
        UPDATE kmb_projek.work_orders
           SET status = 'pending_supervisor', duration_hours = v_act_hours, submitted_by = v_actor_id, submitted_at = now()
         WHERE id = v_wo_id OR wo_number = v_wo_num;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_supervisor', 'actual_hours', v_act_hours),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_supervisor', 'actual_hours', v_act_hours)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- D. SAVE OVERRIDE
  IF v_aksi IN ('save_override', 'handleSaveOverride', 'handleOverrideTargetHours') THEN
    IF v_actor_role = 'mechanic' THEN
      RETURN json_build_object('success', false, 'error', 'Mekanik tidak berhak melakukan override', 'source', 'SUPABASE');
    END IF;

    IF p_payload ? 'base_points' AND nullif(btrim(coalesce(p_payload->>'base_points', '')), '') IS NOT NULL THEN
      v_wo := v_wo || jsonb_build_object(
        'base_points', (p_payload->>'base_points')::numeric,
        'effective_base_points', (p_payload->>'base_points')::numeric,
        'has_spv_override_bp', CASE WHEN v_actor_role <> 'superintendent' THEN true ELSE coalesce((v_wo->>'has_spv_override_bp')::boolean, false) END,
        'has_supt_override_bp', CASE WHEN v_actor_role = 'superintendent' THEN true ELSE coalesce((v_wo->>'has_supt_override_bp')::boolean, false) END
      );
    END IF;
    IF p_payload ? 'target_hours' AND nullif(btrim(coalesce(p_payload->>'target_hours', '')), '') IS NOT NULL THEN
      v_wo := v_wo || jsonb_build_object(
        'target_hours', (p_payload->>'target_hours')::numeric,
        'effective_target_hours', (p_payload->>'target_hours')::numeric,
        'has_spv_override_th', CASE WHEN v_actor_role <> 'superintendent' THEN true ELSE coalesce((v_wo->>'has_spv_override_th')::boolean, false) END,
        'has_supt_override_th', CASE WHEN v_actor_role = 'superintendent' THEN true ELSE coalesce((v_wo->>'has_supt_override_th')::boolean, false) END
      );
    END IF;
    IF p_payload ? 'start_time' AND p_payload ? 'end_time' AND nullif(btrim(coalesce(p_payload->>'start_time', '')), '') IS NOT NULL THEN
      v_start_iso := p_payload->>'start_time';
      v_end_iso   := p_payload->>'end_time';
      BEGIN
        v_act_hours := round((EXTRACT(EPOCH FROM (v_end_iso::timestamptz - v_start_iso::timestamptz)) / 3600.0)::numeric, 2);
        IF v_act_hours > 0 THEN
          v_wo := v_wo || jsonb_build_object('start_time', v_start_iso, 'end_time', v_end_iso, 'actual_hours', v_act_hours, 'duration_hours', v_act_hours);
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF jsonb_typeof(p_payload->'team') = 'array' AND jsonb_array_length(p_payload->'team') > 0 THEN
      v_team := '[]'::jsonb;
      v_team_names := '[]'::jsonb;
      FOR v_elem IN SELECT * FROM jsonb_array_elements(p_payload->'team') LOOP
        v_mid := btrim(coalesce(v_elem->>'mechanic_id', v_elem->>'id', v_elem #>> '{}', ''));
        IF v_mid <> '' THEN
          v_mname := v_mid;
          BEGIN
            IF v_is_rel THEN
              SELECT coalesce(nullif(btrim(name), ''), mechanic_id) INTO v_mname
                FROM kmb_projek.config_mechanics
               WHERE upper(btrim(mechanic_id)) = upper(v_mid) LIMIT 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          v_mname := coalesce(nullif(v_mname, ''), v_mid);
          v_team := v_team || jsonb_build_array(jsonb_build_object('mechanic_id', v_mid, 'mechanic_name', v_mname, 'name', v_mname, 'percentage', 100));
          v_team_names := v_team_names || jsonb_build_array(v_mname);
        END IF;
      END LOOP;
      v_wo := v_wo || jsonb_build_object(
        'team', v_team,
        'effective_team', v_team,
        'team_names', v_team_names,
        'has_spv_override_team', CASE WHEN v_actor_role <> 'superintendent' THEN true ELSE coalesce((v_wo->>'has_spv_override_team')::boolean, false) END,
        'has_supt_override_team', CASE WHEN v_actor_role = 'superintendent' THEN true ELSE coalesce((v_wo->>'has_supt_override_team')::boolean, false) END
      );
    END IF;

    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, team = EXCLUDED.team, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- E. APPROVE L1
  IF v_aksi IN ('approve_l1', 'supervisorApprove', 'handleSupervisorApprove') THEN
    IF v_actor_role NOT IN ('supervisor', 'foreman_approver', 'superintendent', 'admin') THEN
      RETURN json_build_object('success', false, 'error', 'Hanya Supervisor (L1) atau Superintendent (L2) yang berhak menyetujui L1', 'source', 'SUPABASE');
    END IF;

    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_superintendent',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Approval L2',
      'safety_incident', coalesce((p_payload->>'safety_incident')::boolean, false),
      'mtbf_redo_status', coalesce(p_payload->>'mtbf_status', p_payload->>'mtbf_redo_status', 'first_time'),
      'l1_by', v_actor_id,
      'l1_name', v_actor_name,
      'approved_by_supervisor', v_actor_name,
      'approved_by_supervisor_name', v_actor_name,
      'l1_at', v_now_iso,
      'supervisor_approved_at', v_now_iso,
      'l1_notes', coalesce(p_payload->>'notes', '')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_superintendent', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_superintendent', data = EXCLUDED.data, diubah_at = now();

    IF v_is_rel THEN
      BEGIN
        UPDATE kmb_projek.work_orders SET status = 'pending_superintendent', approved_l1_by = v_actor_id, approved_l1_at = now()
         WHERE id = v_wo_id OR wo_number = v_wo_num;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_superintendent'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_superintendent')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- F. APPROVE L2
  IF v_aksi IN ('approve_l2', 'superintendentApprove', 'handleSuperintendentApprove') THEN
    v_fp        := coalesce((p_skor_js->>'finalPoints')::numeric, (v_wo->>'base_points')::numeric, 1.25);
    v_total_idr := coalesce((p_skor_js->>'totalIdr')::numeric, 0);

    v_wo := v_wo || jsonb_build_object(
      'status', 'approved',
      'status_group', 'done',
      'status_label', 'Approved',
      'safety_incident', coalesce((p_payload->>'safety_incident')::boolean, (v_wo->>'safety_incident')::boolean, false),
      'mtbf_redo_status', coalesce(p_payload->>'mtbf_status', v_wo->>'mtbf_redo_status', 'first_time'),
      'l2_by', v_actor_id,
      'l2_name', v_actor_name,
      'l2_at', v_now_iso,
      'disahkan_at_str', v_tgl_str,
      'final_points', v_fp,
      'points', v_fp,
      'final_idr', v_total_idr,
      'idr_value', v_total_idr,
      'timeliness', coalesce(p_skor_js->'timeliness', jsonb_build_object('status', coalesce(p_skor_js->>'timelinessStatus', 'on_time'), 'label', 'On Time'))
    );

    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, points, snapshot, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'approved', v_wo, coalesce(v_wo->'team', '[]'::jsonb), coalesce(p_skor_js->'mechanicPoints', '[]'::jsonb), p_skor_js, now())
    ON CONFLICT (id) DO UPDATE SET status = 'approved', data = EXCLUDED.data, points = EXCLUDED.points, snapshot = EXCLUDED.snapshot, diubah_at = now();

    IF v_is_rel THEN
      BEGIN
        UPDATE kmb_projek.work_orders
           SET status = 'approved', approved_l2_by = v_actor_id, approved_l2_at = now(), points = v_fp, idr_value = v_total_idr
         WHERE id = v_wo_id OR wo_number = v_wo_num;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'approved', 'final_points', v_fp, 'final_idr', v_total_idr),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'approved', 'final_points', v_fp, 'final_idr', v_total_idr)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- G. REJECT ATAU KEMBALIKAN KE MEKANIK
  IF v_aksi IN ('reject', 'supervisorReject', 'superintendentReject', 'handleSupervisorReject', 'handleSuperintendentReject', 'kembalikan', 'handleKembalikanKeMekanik') THEN
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'rejection_reason', 'Ditolak'));
    IF v_aksi IN ('kembalikan', 'handleKembalikanKeMekanik') THEN
      v_putaran := coalesce((v_wo->>'putaran')::int, 1) + 1;
      v_wo := v_wo || jsonb_build_object(
        'status', 'pending_mechanic_work',
        'status_group', 'assigned',
        'status_label', 'Perlu Diperbaiki Mekanik',
        'putaran', v_putaran,
        'alasan_kembali', v_reason,
        'return_reason', v_reason,
        'dikembalikan_oleh_nama', v_actor_name,
        'returned_by', v_actor_name,
        'returned_at', v_now_iso
      );
    ELSE
      v_wo := v_wo || jsonb_build_object(
        'status', 'rejected',
        'status_group', 'rejected',
        'status_label', 'Ditolak',
        'rejection_reason', v_reason,
        'rejected_by', v_actor_id,
        'rejected_by_name', v_actor_name,
        'rejected_at', v_now_iso
      );
    END IF;
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status', 'putaran', v_putaran),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', v_wo->>'status', 'putaran', v_putaran)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- H. CANCEL WO
  IF v_aksi IN ('cancel_wo', 'cancel', 'cancelWO', 'handleCancelWO', 'batal_wo') THEN
    v_reason := btrim(coalesce(p_payload->>'reason', p_payload->>'cancel_reason', 'Dibatalkan'));
    v_wo := v_wo || jsonb_build_object(
      'status', 'cancelled',
      'status_group', 'rejected',
      'status_label', 'Dibatalkan',
      'cancel_reason', v_reason,
      'rejection_reason', v_reason,
      'cancelled_by', v_actor_id,
      'cancelled_by_name', v_actor_name,
      'rejected_by_name', v_actor_name,
      'cancelled_at', v_now_iso,
      'final_points', 0,
      'points', 0,
      'final_idr', 0,
      'idr_value', 0
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, points, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'cancelled', v_wo, coalesce(v_wo->'team', '[]'::jsonb), '[]'::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET status = 'cancelled', data = EXCLUDED.data, points = '[]'::jsonb, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'cancelled'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'cancelled')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- I. TRANSFER WO (request_transfer, approve_transfer, reject_transfer)
  IF v_aksi IN ('request_transfer', 'handleRequestTransfer') THEN
    v_start_iso := coalesce(nullif(trim(p_payload->>'session_start_time'), ''), v_now_iso);
    BEGIN
      v_part_hours := GREATEST(0, round((EXTRACT(EPOCH FROM (now() - v_start_iso::timestamptz)) / 3600.0)::numeric, 2));
    EXCEPTION WHEN OTHERS THEN
      v_part_hours := 0;
    END;

    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_transfer',
      'status_group', 'pending_approval',
      'status_label', 'Menunggu Keputusan Transfer',
      'transfer_status', 'pending',
      'transfer_note', coalesce(p_payload->>'transfer_note', ''),
      'transfer_session_hours', v_part_hours,
      'session_hours', v_part_hours,
      'partial_hours_now', coalesce((v_wo->>'partial_hours')::numeric, 0),
      'partial_hours_after', round(coalesce((v_wo->>'partial_hours')::numeric, 0) + v_part_hours, 2),
      'transfer_requested_by', v_actor_id,
      'transfer_requested_by_name', v_actor_name,
      'requested_by_name', v_actor_name,
      'transfer_requested_at', v_now_iso
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_transfer', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_transfer', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_transfer'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_transfer')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('approve_transfer', 'handleApproveTransfer') THEN
    v_team := '[]'::jsonb;
    v_team_names := '[]'::jsonb;
    v_lead_id := '';
    IF jsonb_typeof(p_payload->'target_mechanic_ids') = 'array' THEN
      FOR v_elem IN SELECT * FROM jsonb_array_elements(p_payload->'target_mechanic_ids') LOOP
        v_mid := btrim(coalesce(v_elem #>> '{}', v_elem->>'mechanic_id', ''));
        IF v_mid <> '' THEN
          v_mname := v_mid;
          BEGIN
            IF v_is_rel THEN
              SELECT coalesce(nullif(btrim(name), ''), mechanic_id) INTO v_mname
                FROM kmb_projek.config_mechanics
               WHERE upper(btrim(mechanic_id)) = upper(v_mid) LIMIT 1;
            END IF;
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
          v_mname := coalesce(nullif(v_mname, ''), v_mid);
          IF v_lead_id = '' THEN v_lead_id := v_mid; END IF;
          v_team := v_team || jsonb_build_array(jsonb_build_object('mechanic_id', v_mid, 'mechanic_name', v_mname, 'name', v_mname, 'percentage', 100));
          v_team_names := v_team_names || jsonb_build_array(v_mname);
        END IF;
      END LOOP;
    END IF;
    IF jsonb_array_length(v_team) = 0 THEN
      v_team := coalesce(v_wo->'team', '[]'::jsonb);
      v_team_names := coalesce(v_wo->'team_names', '[]'::jsonb);
      v_lead_id := coalesce(v_wo->>'lead_mechanic_id', '');
    END IF;

    v_part_hours := round(coalesce((v_wo->>'partial_hours')::numeric, 0) + coalesce((v_wo->>'transfer_session_hours')::numeric, 0), 2);
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_mechanic_work',
      'status_group', 'assigned',
      'status_label', 'Perlu Diisi Mekanik',
      'transfer_status', 'approved',
      'partial_hours', v_part_hours,
      'lead_mechanic_id', v_lead_id,
      'team', v_team,
      'effective_team', v_team,
      'team_names', v_team_names,
      'team_count', GREATEST(jsonb_array_length(v_team), 1),
      'batas_kerja_at', to_char((now() + interval '24 hours') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, v_team, now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_mechanic_work', data = EXCLUDED.data, team = EXCLUDED.team, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work', 'partial_hours', v_part_hours),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work', 'partial_hours', v_part_hours)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('reject_transfer', 'handleRejectTransfer') THEN
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_mechanic_work',
      'status_group', 'assigned',
      'status_label', 'Perlu Diisi Mekanik',
      'transfer_status', 'rejected',
      'transfer_rejection_reason', coalesce(p_payload->>'rejection_reason', p_payload->>'reason', '')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_mechanic_work', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work'),
      'data', jsonb_build_object('wo_id', v_wo_id, 'wo_number', v_wo_num, 'status', 'pending_mechanic_work')
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- J. REPORT EXPIRED & REOPEN EXPIRED
  IF v_aksi IN ('report_expired', 'reportExpiredWO', 'handleReportExpired') THEN
    v_wo := v_wo || jsonb_build_object('is_reported_expired', true, 'dilaporkan', true, 'reported_expired_at', v_now_iso);
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'is_reported_expired', true),
      'data', jsonb_build_object('wo_id', v_wo_id, 'is_reported_expired', true)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  IF v_aksi IN ('reopen_expired', 'handleReopenExpired', 'handleReopenExpiredWO') THEN
    IF v_actor_role NOT IN ('supervisor', 'foreman_approver', 'superintendent', 'admin') THEN
      RETURN json_build_object('success', false, 'error', 'Hanya Pengawas (L1/L2) yang berhak membuka kunci WO expired', 'source', 'SUPABASE');
    END IF;
    v_wo := v_wo || jsonb_build_object(
      'status', 'pending_mechanic_work',
      'status_group', 'assigned',
      'status_label', 'Perlu Diisi Mekanik',
      'is_expired', false,
      'is_reported_expired', false,
      'dilaporkan', false,
      'dibuka_ulang', true,
      'reopened_at', v_now_iso,
      'reopened_by', v_actor_id,
      'batas_kerja_at', to_char((now() + interval '24 hours') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    );
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, 'pending_mechanic_work', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET status = 'pending_mechanic_work', data = EXCLUDED.data, diubah_at = now();

    v_out := jsonb_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object('wo_id', v_wo_id, 'status', 'pending_mechanic_work', 'reopened_at', v_now_iso),
      'data', jsonb_build_object('wo_id', v_wo_id, 'status', 'pending_mechanic_work', 'reopened_at', v_now_iso)
    );
    IF v_op_id <> '' THEN
      INSERT INTO kmb_projek.wo_ops_supabase (op_id, action, actor_id, result_json)
      VALUES (v_op_id, v_aksi, v_actor_id, v_out) ON CONFLICT (op_id) DO NOTHING;
    END IF;
    RETURN v_out::json;
  END IF;

  -- K. KOREKSI METER & GANTI PANEL METER (HM / KM)
  IF v_aksi IN ('koreksiHmWo', 'handleKoreksiHmWo', 'koreksiKmWo', 'handleKoreksiKmWo', 'koreksi_meter') THEN
    IF lower(v_aksi) LIKE '%hm%' OR coalesce(p_payload->>'jenis', 'hm') = 'hm' THEN
      v_wo := v_wo || jsonb_build_object('hour_meter', coalesce(p_payload->>'nilai_baru', p_payload->>'hm_baru', ''));
    ELSE
      v_wo := v_wo || jsonb_build_object('kilometers', coalesce(p_payload->>'nilai_baru', p_payload->>'km_baru', ''));
    END IF;
    INSERT INTO kmb_projek.wo_supabase (id, wo_number, status, data, team, diubah_at)
    VALUES (v_wo_id, v_wo_num, v_wo->>'status', v_wo, coalesce(v_wo->'team', '[]'::jsonb), now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('wo_id', v_wo_id, 'updated', true), 'data', json_build_object('wo_id', v_wo_id, 'updated', true));
  END IF;

  IF v_aksi IN ('gantiPanelHm', 'handleGantiPanelHm', 'gantiPanelKm', 'handleGantiPanelKm', 'ganti_panel_meter') THEN
    INSERT INTO kmb_projek.meter_panel_supabase (unit_id, jenis, nilai_baru, diganti_pada, alasan, actor_id)
    VALUES (
      coalesce(p_payload->>'unit_id', p_payload->>'unit_code', ''),
      CASE WHEN lower(v_aksi) LIKE '%km%' THEN 'km' ELSE 'hm' END,
      coalesce(nullif(coalesce(p_payload->>'nilai_baru', p_payload->>'hm_baru', p_payload->>'km_baru'), '')::numeric, 0),
      coalesce(nullif(coalesce(p_payload->>'diganti_pada', p_payload->>'berlaku_at'), '')::timestamptz, now()),
      coalesce(p_payload->>'alasan', 'Ganti panel meter'),
      v_actor_id
    );
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('saved', true), 'data', json_build_object('saved', true));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Aksi ' || v_aksi || ' belum didukung', 'source', 'SUPABASE');
END;
$$;

REVOKE EXECUTE ON FUNCTION kmb_projek._validasi_token_aktif(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._nomor_wo_baru_wib() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._normalisasi_status_wo(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._semua_wo_json() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION kmb_projek._wo_milik_mekanik(jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_create_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_monitoring() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_my_wos(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_wos_by_status(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kmb_create_refs() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.kmb_ping(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_create_refs_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring_daftar_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wo_detail_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_konteks_skor_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_eksekusi_aksi_bertoken(text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;

-- ==============================================================================
-- FUNGSI RPC MANAJEMEN PENGGUNA & TOKEN (ADMIN) — RUMAH KMB PROJECT (Skema `kmb_projek`)
-- Rumah: kmb-projek · Pemegang: Raka · Sesuai AGENTS.md §0a.9, §2, §4, §5
-- ==============================================================================
--
-- Kompatibilitas Ganda (Dual-Format):
--   Skema `kmb_projek` di Gedung 1 & Gedung 2 memiliki tabel cermin relasional
--   (`db/kmb_projek/cermin_sheet.sql`) sekaligus disiapkan menuju cermin mentah
--   JSONB (`db/kmb_projek/cermin_sheet_mentah.sql`). Fungsi RPC di file ini
--   mendeteksi bentuk kolom secara otomatis sehingga 100% aman dijalankan pada
--   kedua bentuk tabel tanpa galat.
--
-- Prinsip Keamanan & Isolasi:
--   1. Hanya menyentuh skema `kmb_projek` (Kamar tidak saling mengintip).
--   2. Semua fungsi internal di-REVOKE dari PUBLIC/anon/authenticated.
--   3. Pintu masuk publik (`kmb_admin_*_bertoken`) memvalidasi token admin aktif.
--   4. Tidak ada `tenant_id` yang di-hardcode.
--   5. Nilai token mentah tidak pernah dicatat di `audit_logs` (hanya md5 & samaran).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb_projek;

-- Pastikan kolom tambahan & tabel audit_logs tersedia pada skema relasional kmb_projek
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_mechanics' AND column_name = 'mechanic_id'
  ) THEN
    ALTER TABLE kmb_projek.config_mechanics ADD COLUMN IF NOT EXISTS may_admin boolean NOT NULL DEFAULT false;
    ALTER TABLE kmb_projek.config_mechanics ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;
    ALTER TABLE kmb_projek.config_mechanics ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'token'
  ) THEN
    ALTER TABLE kmb_projek.api_tokens ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
    ALTER TABLE kmb_projek.api_tokens ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kmb_projek.audit_logs (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    text NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);

REVOKE ALL ON SCHEMA kmb_projek FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA kmb_projek FROM anon, authenticated;

-- ==============================================================================
-- HELPER VALIDASI TOKEN ADMIN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean    text := btrim(coalesce(p_token, ''));
  v_is_jsonb boolean;
  v_user     record;
  v_boleh    boolean := false;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  -- Tidak ada kata ajaib pengganti token. Panel saklar memanggil fungsi _internal dengan kunci rahasia
  -- Supabase lewat Worker pintu; fungsi *_bertoken hanya menerima token pengguna yang sah.

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'api_tokens' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    EXECUTE $q$
      SELECT t.data->>'token' AS token,
             coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'user_id'), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
             coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), '') AS name,
             lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
             lower(coalesce(m.data->>'may_admin', 'false')) AS may_admin,
             upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
        FROM kmb_projek.api_tokens t
        LEFT JOIN kmb_projek.config_mechanics m
          ON trim(coalesce(t.data->>'user_id', t.data->>'mechanic_id')) = trim(m.data->>'mechanic_id')
       WHERE trim(t.data->>'token') = $1
         AND upper(coalesce(t.data->>'status', 'ACTIVE')) = 'ACTIVE'
         AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
       LIMIT 1
    $q$ INTO v_user USING v_clean;
  ELSE
    SELECT t.token,
           coalesce(nullif(trim(m.mechanic_id), ''), trim(t.user_id), '') AS mechanic_id,
           coalesce(nullif(trim(m.name), ''), trim(t.name), '') AS name,
           lower(coalesce(nullif(trim(m.role), ''), trim(t.role), 'mechanic')) AS role,
           CASE WHEN coalesce(m.may_admin, false) THEN 'true' ELSE 'false' END AS may_admin,
           upper(coalesce(m.status, 'ACTIVE')) AS mech_status
      INTO v_user
      FROM kmb_projek.api_tokens t
      LEFT JOIN kmb_projek.config_mechanics m ON upper(btrim(coalesce(t.user_id, ''))) = upper(btrim(coalesce(m.mechanic_id, ''))) OR btrim(coalesce(t.token, '')) = btrim(coalesce(m.token, ''))
     WHERE trim(t.token) = v_clean
       AND upper(coalesce(t.status, 'ACTIVE')) = 'ACTIVE'
     LIMIT 1;
  END IF;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'supervisor', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
  IF NOT v_boleh THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Menu Admin hanya untuk yang diberi hak admin.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role
  );
END;
$$;

-- ==============================================================================
-- 1. DAFTAR USER & TOKEN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_daftar_user_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_jsonb boolean;
  v_users    json;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_mechanics' AND column_name = 'data'
  ) INTO v_is_jsonb;

  IF v_is_jsonb THEN
    EXECUTE $q$
      WITH token_aktif AS (
        SELECT DISTINCT ON (trim(coalesce(data->>'user_id', data->>'mechanic_id')))
               trim(coalesce(data->>'user_id', data->>'mechanic_id')) AS mechanic_id,
               trim(data->>'token') AS token
          FROM kmb_projek.api_tokens
         WHERE upper(coalesce(data->>'status', 'ACTIVE')) = 'ACTIVE'
           AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
         ORDER BY trim(coalesce(data->>'user_id', data->>'mechanic_id')), baris DESC
      ),
      daftar AS (
        SELECT coalesce(m.data->>'mechanic_id', '') AS mechanic_id,
               coalesce(m.data->>'name', '') AS name,
               coalesce(m.data->>'email', '') AS email,
               lower(coalesce(nullif(trim(m.data->>'role'), ''), 'mechanic')) AS role,
               coalesce(m.data->>'section', 'maintenance') AS section,
               upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) AS status,
               (upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
               (lower(coalesce(m.data->>'is_test_account', 'false')) IN ('true', '1')) AS akun_uji,
               (lower(coalesce(m.data->>'may_admin', 'false')) IN ('true', '1') OR lower(coalesce(m.data->>'role', '')) IN ('superintendent', 'admin')) AS boleh_admin,
               ta.token AS token,
               CASE WHEN ta.token IS NOT NULL AND length(ta.token) >= 4
                    THEN left(ta.token, 4) || '…'
                    ELSE null
               END AS token_masked,
               (ta.token IS NOT NULL) AS has_token,
               0 AS jejak
          FROM kmb_projek.config_mechanics m
          LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.data->>'mechanic_id')
         WHERE nullif(trim(m.data->>'mechanic_id'), '') IS NOT NULL
         ORDER BY (upper(coalesce(m.data->>'status', 'ACTIVE')) = 'ACTIVE') DESC,
                  lower(coalesce(m.data->>'role', 'mechanic')),
                  coalesce(m.data->>'name', '')
      )
      SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json) FROM daftar
    $q$ INTO v_users;
  ELSE
    WITH token_aktif AS (
      SELECT DISTINCT ON (trim(user_id))
             trim(user_id) AS mechanic_id,
             trim(token) AS token
        FROM kmb_projek.api_tokens
       WHERE upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
         AND nullif(trim(user_id), '') IS NOT NULL
       ORDER BY trim(user_id), created_at DESC NULLS LAST
    ),
    jejak_wo AS (
      SELECT trim(lead_mechanic_id) AS mechanic_id,
             count(*)::int AS wo_count
        FROM kmb_projek.work_orders
       WHERE nullif(trim(lead_mechanic_id), '') IS NOT NULL
       GROUP BY trim(lead_mechanic_id)
    ),
    daftar AS (
      SELECT m.mechanic_id,
             m.name,
             coalesce(m.email, '') AS email,
             lower(coalesce(nullif(trim(m.role), ''), 'mechanic')) AS role,
             coalesce(m.section, 'maintenance') AS section,
             upper(coalesce(nullif(trim(m.status), ''), 'ACTIVE')) AS status,
             (upper(coalesce(nullif(trim(m.status), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
             coalesce(m.is_test_account, false) AS akun_uji,
             (coalesce(m.may_admin, false) OR lower(coalesce(m.role, '')) IN ('superintendent', 'admin')) AS boleh_admin,
             coalesce(ta.token, nullif(trim(m.token), '')) AS token,
             CASE WHEN coalesce(ta.token, nullif(trim(m.token), '')) IS NOT NULL
                  THEN left(coalesce(ta.token, trim(m.token)), 4) || '…'
                  ELSE null
             END AS token_masked,
             (coalesce(ta.token, nullif(trim(m.token), '')) IS NOT NULL) AS has_token,
             coalesce(jw.wo_count, 0) AS jejak
        FROM kmb_projek.config_mechanics m
        LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.mechanic_id)
        LEFT JOIN jejak_wo jw ON jw.mechanic_id = trim(m.mechanic_id)
       ORDER BY (upper(coalesce(m.status, 'ACTIVE')) = 'ACTIVE') DESC,
                lower(coalesce(m.role, 'mechanic')),
                m.name
    )
    SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json)
      INTO v_users
      FROM daftar;
  END IF;

  RETURN json_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbprojek',
    'result', json_build_object(
      'rumah', 'kmbprojek',
      'users', v_users,
      'sections', json_build_array('vessel', 'maintenance', 'workshop'),
      'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_daftar_user_internal();
END;
$$;

-- ==============================================================================
-- 2. SIMPAN / UBAH USER KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_simpan_user_internal(
  p_actor_id text,
  p_op_id    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_kode        text := upper(btrim(coalesce(p_payload->>'mechanic_id', p_payload->>'kode', '')));
  v_nama        text := btrim(coalesce(p_payload->>'name', p_payload->>'nama', ''));
  v_email       text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_peran       text := lower(btrim(coalesce(p_payload->>'role', p_payload->>'peran', 'mechanic')));
  v_section     text := btrim(coalesce(p_payload->>'section', 'maintenance'));
  v_aktif       boolean := coalesce((p_payload->>'aktif')::boolean, upper(coalesce(p_payload->>'status', 'ACTIVE')) <> 'INACTIVE', true);
  v_status      text := CASE WHEN v_aktif THEN 'ACTIVE' ELSE 'INACTIVE' END;
  v_akun_uji    boolean := coalesce((p_payload->>'akunUji')::boolean, (p_payload->>'is_test_account')::boolean, false);
  v_boleh_admin boolean := coalesce((p_payload->>'bolehAdmin')::boolean, (p_payload->>'may_admin')::boolean, v_peran = 'superintendent');
  v_lama        record;
  v_baru        boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT result_json INTO v_existing_op
    FROM kmb_projek.processed_ops
   WHERE op_id = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF length(v_kode) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Kode mekanik minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF length(v_nama) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Nama minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF v_peran NOT IN ('mechanic', 'supervisor', 'superintendent', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Peran tidak sah: ' || v_peran, 'source', 'SUPABASE');
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_kode THEN
    IF NOT v_aktif THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menonaktifkan akun Anda sendiri.', 'source', 'SUPABASE');
    END IF;
    IF NOT v_boleh_admin AND v_peran <> 'superintendent' THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.', 'source', 'SUPABASE');
    END IF;
  END IF;

  SELECT mechanic_id, name, section, email, role, status, may_admin, is_test_account
    INTO v_lama
    FROM kmb_projek.config_mechanics
   WHERE upper(trim(mechanic_id)) = v_kode
   LIMIT 1;

  IF v_lama.mechanic_id IS NOT NULL THEN
    UPDATE kmb_projek.config_mechanics
       SET name = v_nama,
           email = v_email,
           role = v_peran,
           section = v_section,
           status = v_status,
           may_admin = v_boleh_admin,
           is_test_account = v_akun_uji,
           updated_at = now()
     WHERE upper(trim(mechanic_id)) = v_kode;
    v_baru := false;

    -- Sinkronkan juga nama & peran di api_tokens milik mekanik ini
    UPDATE kmb_projek.api_tokens
       SET name = v_nama,
           role = v_peran
     WHERE upper(trim(user_id)) = v_kode;
  ELSE
    INSERT INTO kmb_projek.config_mechanics (
      mechanic_id, name, section, email, role, status, may_admin, is_test_account, created_at, updated_at
    ) VALUES (
      v_kode, v_nama, v_section, v_email, v_peran, v_status, v_boleh_admin, v_akun_uji, now(), now()
    );
    v_baru := true;
  END IF;

  INSERT INTO kmb_projek.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    coalesce(p_actor_id, 'ADMIN'),
    CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END,
    'mechanic',
    v_kode,
    jsonb_build_object(
      'lama', CASE WHEN v_baru THEN null ELSE row_to_json(v_lama)::jsonb END,
      'baru', jsonb_build_object(
        'mechanic_id', v_kode,
        'name', v_nama,
        'email', v_email,
        'role', v_peran,
        'section', v_section,
        'status', v_status,
        'may_admin', v_boleh_admin,
        'is_test_account', v_akun_uji
      )
    )
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_kode,
      'name', v_nama,
      'role', v_peran,
      'status', v_status,
      'baru', v_baru,
      'rumah', 'kmbprojek'
    )
  );

  INSERT INTO kmb_projek.processed_ops (op_id, action, token, processed_at, result_json)
  VALUES (v_op_id, 'admin_simpan_user', coalesce(p_actor_id, 'ADMIN'), now(), v_hasil)
  ON CONFLICT (op_id) DO NOTHING;

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_simpan_user_bertoken(
  p_token   text,
  p_op_id   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_simpan_user_internal(v_auth->>'mechanic_id', p_op_id, p_payload);
END;
$$;

-- ==============================================================================
-- 3. TERBITKAN / GANTI TOKEN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_terbitkan_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text,
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_mech        record;
  v_tok_lama    text;
  v_token       text := btrim(coalesce(p_token_baru, ''));
  v_mengganti   boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT result_json INTO v_existing_op
    FROM kmb_projek.processed_ops
   WHERE op_id = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  SELECT mechanic_id, name, role, status INTO v_mech
    FROM kmb_projek.config_mechanics
   WHERE upper(trim(mechanic_id)) = v_target_id
   LIMIT 1;

  IF v_mech.mechanic_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mekanik ' || v_target_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF upper(coalesce(v_mech.status, 'ACTIVE')) = 'INACTIVE' THEN
    RETURN json_build_object(
      'success', false,
      'error', v_mech.name || ' sudah nonaktif — aktifkan dulu sebelum diberi token.',
      'source', 'SUPABASE'
    );
  END IF;

  SELECT trim(token) INTO v_tok_lama
    FROM kmb_projek.api_tokens
   WHERE upper(trim(user_id)) = v_target_id
     AND upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_tok_lama IS NOT NULL AND NOT coalesce(p_ganti, false) THEN
    RETURN json_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', jsonb_build_object(
        'mechanic_id', v_target_id,
        'token', v_tok_lama,
        'token_masked', left(v_tok_lama, 4) || '…',
        'mengganti_lama', false,
        'rumah', 'kmbprojek'
      )
    );
  END IF;

  IF v_tok_lama IS NOT NULL THEN
    v_mengganti := true;
    UPDATE kmb_projek.api_tokens
       SET status = 'REVOKED',
           revoked_at = now()
     WHERE upper(trim(user_id)) = v_target_id
       AND upper(coalesce(status, 'ACTIVE')) = 'ACTIVE';
  END IF;

  IF v_token = '' THEN
    v_token := 'kmbp-' || substr(md5(random()::text || clock_timestamp()::text || v_target_id), 1, 12);
  END IF;

  INSERT INTO kmb_projek.api_tokens (token, role, user_id, name, status, created_at)
  VALUES (v_token, coalesce(v_mech.role, 'mechanic'), v_target_id, v_mech.name, 'ACTIVE', now())
  ON CONFLICT (token) DO UPDATE
    SET status = 'ACTIVE', revoked_at = NULL, user_id = EXCLUDED.user_id, role = EXCLUDED.role, name = EXCLUDED.name;

  UPDATE kmb_projek.config_mechanics
     SET token = v_token,
         updated_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  -- Audit log TANPA nilai token mentah
  INSERT INTO kmb_projek.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    coalesce(p_actor_id, 'ADMIN'),
    CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END,
    'mechanic',
    v_target_id,
    jsonb_build_object(
      'nama', v_mech.name,
      'mengganti_lama', v_mengganti,
      'token_md5', md5(v_token),
      'token_samaran', left(v_token, 4) || '…'
    )
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'token', v_token,
      'token_masked', left(v_token, 4) || '…',
      'mengganti_lama', v_mengganti,
      'rumah', 'kmbprojek'
    )
  );

  INSERT INTO kmb_projek.processed_ops (op_id, action, token, processed_at, result_json)
  VALUES (v_op_id, 'admin_terbitkan_token', coalesce(p_actor_id, 'ADMIN'), now(), v_hasil)
  ON CONFLICT (op_id) DO NOTHING;

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_terbitkan_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text DEFAULT '',
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_terbitkan_token_internal(
    v_auth->>'mechanic_id', p_op_id, p_mechanic_id, p_token_baru, p_ganti
  );
END;
$$;

-- ==============================================================================
-- 4. CABUT TOKEN KMB PROJECT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_cabut_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_dicabut     int := 0;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT result_json INTO v_existing_op
    FROM kmb_projek.processed_ops
   WHERE op_id = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_target_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.',
      'source', 'SUPABASE'
    );
  END IF;

  WITH updated AS (
    UPDATE kmb_projek.api_tokens
       SET status = 'REVOKED',
           revoked_at = now()
     WHERE upper(trim(user_id)) = v_target_id
       AND upper(coalesce(status, 'ACTIVE')) = 'ACTIVE'
    RETURNING token
  )
  SELECT count(*)::int INTO v_dicabut FROM updated;

  UPDATE kmb_projek.config_mechanics
     SET token = NULL,
         updated_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  INSERT INTO kmb_projek.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (
    coalesce(p_actor_id, 'ADMIN'),
    'admin_token_cabut',
    'mechanic',
    v_target_id,
    jsonb_build_object('dicabut', v_dicabut)
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'dicabut', v_dicabut,
      'rumah', 'kmbprojek'
    )
  );

  INSERT INTO kmb_projek.processed_ops (op_id, action, token, processed_at, result_json)
  VALUES (v_op_id, 'admin_cabut_token', coalesce(p_actor_id, 'ADMIN'), now(), v_hasil)
  ON CONFLICT (op_id) DO NOTHING;

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_cabut_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmb_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_cabut_token_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._kmb_validasi_admin_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_daftar_user_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_simpan_user_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_terbitkan_token_internal(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_cabut_token_internal(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._kmb_validasi_admin_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_daftar_user_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_simpan_user_internal(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_terbitkan_token_internal(text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_cabut_token_internal(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.kmb_admin_daftar_user_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_simpan_user_bertoken(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_terbitkan_token_bertoken(text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_cabut_token_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. HAPUS PENGGUNA PERMANEN (DELETE CRUD) — Kamar `kmb_projek`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmb_admin_hapus_user_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_op_id     text := btrim(coalesce(p_op_id, ''));
  v_dihapus   int := 0;
  v_hasil     jsonb;
BEGIN
  IF v_target_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'mechanic_id wajib diisi', 'source', 'SUPABASE');
  END IF;
  IF v_target_id = upper(btrim(coalesce(p_actor_id, ''))) THEN
    RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menghapus akun Anda sendiri.', 'source', 'SUPABASE');
  END IF;

  DELETE FROM kmb_projek.api_tokens WHERE upper(trim(coalesce(user_id, ''))) = v_target_id;
  DELETE FROM kmb_projek.config_mechanics WHERE upper(trim(mechanic_id)) = v_target_id;
  GET DIAGNOSTICS v_dihapus = ROW_COUNT;

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('mechanic_id', v_target_id, 'dihapus', v_dihapus, 'rumah', 'kmbprojek')
  );
  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_hapus_user_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_hapus_user_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmb_admin_hapus_user_internal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmb_admin_hapus_user_internal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_hapus_user_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. CRUD KONFIGURASI (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) — Kamar `kmb_projek`
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_units' AND column_name = 'unit_code'
  ) THEN
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_name text;
    ALTER TABLE kmb_projek.config_units ADD COLUMN IF NOT EXISTS unit_factor numeric DEFAULT 1.0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'kmb_projek' AND table_name = 'config_components' AND column_name = 'component_id'
  ) THEN
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS base_points numeric DEFAULT 1.25;
    ALTER TABLE kmb_projek.config_components ADD COLUMN IF NOT EXISTS target_hours numeric DEFAULT 2.0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._kmb_admin_daftar_config_internal(p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units   jsonb := '[]'::jsonb;
  v_comps   jsonb := '[]'::jsonb;
  v_jobs    jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.unit_code,
    'unit_code', u.unit_code,
    'unit_name', coalesce(nullif(btrim(u.unit_name), ''), u.unit_code),
    'unit_model', coalesce(u.model, ''),
    'section', coalesce(u.section, 'maintenance'),
    'unit_factor', coalesce(u.unit_factor, 1.0),
    'current_hm', coalesce(u.current_hm, 0),
    'current_km', coalesce(u.current_km, 0),
    'status', upper(coalesce(u.status, 'ACTIVE'))
  ) ORDER BY u.unit_code), '[]'::jsonb)
  INTO v_units
  FROM kmb_projek.config_units u;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', c.component_id,
    'component_no', c.component_id,
    'component_name', c.name,
    'category', coalesce(c.section, 'General'),
    'section', coalesce(c.section, 'maintenance'),
    'base_points', coalesce(c.base_points, 1.25),
    'target_hours', coalesce(c.target_hours, 2.0),
    'status', upper(coalesce(c.status, 'ACTIVE'))
  ) ORDER BY c.component_id), '[]'::jsonb)
  INTO v_comps
  FROM kmb_projek.config_components c;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', j.job_id,
    'section', coalesce(j.section, 'maintenance'),
    'unit_model', coalesce(j.unit_model, ''),
    'component', j.component,
    'sub_component', coalesce(j.sub_component, 'Standard'),
    'job_description', j.job_description,
    'plan_hours', coalesce(j.plan_hours, 2.0),
    'base_point', coalesce(j.base_point, 1.0),
    'job_type', coalesce(j.job_type, 'Preventive'),
    'status', upper(coalesce(j.status, 'ACTIVE'))
  ) ORDER BY j.section, j.component, j.job_id), '[]'::jsonb)
  INTO v_jobs
  FROM kmb_projek.catalog_jobs j;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', f.factor_type || ':' || f.key,
    'factor_type', f.factor_type,
    'key', f.key,
    'value', f.value,
    'description', coalesce(f.description, '')
  ) ORDER BY f.factor_type, f.key), '[]'::jsonb)
  INTO v_factors
  FROM kmb_projek.config_factors f;

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbprojek',
    'result', jsonb_build_object(
      'rumah', 'kmbprojek',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    ),
    'data', jsonb_build_object(
      'rumah', 'kmbprojek',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_daftar_config_bertoken(p_token text, p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_daftar_config_internal(p_jenis);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmb_admin_simpan_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_ft    text;
  v_fk    text;
BEGIN
  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'Kode Unit (unit_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    INSERT INTO kmb_projek.config_units (unit_code, unit_name, model, section, unit_factor, status, updated_at)
    VALUES (
      v_id,
      btrim(coalesce(nullif(p_payload->>'unit_name', ''), v_id)),
      btrim(coalesce(p_payload->>'unit_model', p_payload->>'model', '')),
      btrim(coalesce(p_payload->>'section', 'maintenance')),
      coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0),
      upper(btrim(coalesce(p_payload->>'status', 'ACTIVE'))),
      now()
    )
    ON CONFLICT (unit_code) DO UPDATE SET
      unit_name   = EXCLUDED.unit_name,
      model       = EXCLUDED.model,
      section     = EXCLUDED.section,
      unit_factor = EXCLUDED.unit_factor,
      status      = EXCLUDED.status,
      updated_at  = now();

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'ID Komponen (component_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    INSERT INTO kmb_projek.config_components (component_id, name, section, base_points, target_hours, status)
    VALUES (
      v_id,
      btrim(coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'name', ''), v_id)),
      btrim(coalesce(p_payload->>'category', p_payload->>'section', 'General')),
      coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.25),
      coalesce(nullif(p_payload->>'target_hours', '')::numeric, 2.0),
      upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    )
    ON CONFLICT (component_id) DO UPDATE SET
      name         = EXCLUDED.name,
      section      = EXCLUDED.section,
      base_points  = EXCLUDED.base_points,
      target_hours = EXCLUDED.target_hours,
      status       = EXCLUDED.status;

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN
      v_id := 'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;
    INSERT INTO kmb_projek.catalog_jobs (
      job_id, section, unit_model, component, sub_component, job_description, plan_hours, base_point, job_type, status
    ) VALUES (
      v_id,
      lower(btrim(coalesce(nullif(p_payload->>'section', ''), 'maintenance'))),
      btrim(coalesce(p_payload->>'unit_model', '')),
      btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      btrim(coalesce(nullif(p_payload->>'sub_component', ''), 'Standard')),
      btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 2.0),
      coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      btrim(coalesce(nullif(p_payload->>'job_type', ''), 'Preventive')),
      upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    )
    ON CONFLICT (job_id) DO UPDATE SET
      section         = EXCLUDED.section,
      unit_model      = EXCLUDED.unit_model,
      component       = EXCLUDED.component,
      sub_component   = EXCLUDED.sub_component,
      job_description = EXCLUDED.job_description,
      plan_hours      = EXCLUDED.plan_hours,
      base_point      = EXCLUDED.base_point,
      job_type        = EXCLUDED.job_type,
      status          = EXCLUDED.status;

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_ft := lower(btrim(coalesce(p_payload->>'factor_type', p_payload->>'type', 'work_condition')));
    v_fk := lower(btrim(coalesce(p_payload->>'key', '')));
    IF v_fk = '' THEN
      RETURN json_build_object('success', false, 'error', 'Key faktor wajib diisi', 'source', 'SUPABASE');
    END IF;
    INSERT INTO kmb_projek.config_factors (factor_type, key, value, description)
    VALUES (
      v_ft,
      v_fk,
      coalesce(nullif(p_payload->>'value', '')::numeric, 1.0),
      btrim(coalesce(p_payload->>'description', ''))
    )
    ON CONFLICT (factor_type, key) DO UPDATE SET
      value       = EXCLUDED.value,
      description = EXCLUDED.description;

    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_ft || ':' || v_fk));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_simpan_config_bertoken(
  p_token   text,
  p_op_id   text,
  p_jenis   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_simpan_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmb_admin_hapus_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_kunci    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis   text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci   text := btrim(coalesce(p_kunci, ''));
  v_dihapus int := 0;
BEGIN
  IF v_kunci = '' THEN
    RETURN json_build_object('success', false, 'error', 'Kunci item wajib diisi', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM kmb_projek.config_units WHERE upper(btrim(unit_code)) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM kmb_projek.config_components WHERE upper(btrim(component_id)) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    DELETE FROM kmb_projek.catalog_jobs WHERE upper(btrim(job_id)) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM kmb_projek.config_factors
     WHERE lower(btrim(factor_type)) || ':' || lower(btrim(key)) = lower(v_kunci)
        OR lower(btrim(key)) = lower(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', v_jenis, 'kunci', v_kunci, 'dihapus', v_dihapus));
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_admin_hapus_config_bertoken(
  p_token text,
  p_op_id text,
  p_jenis text,
  p_kunci text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmb_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmb_admin_hapus_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_kunci);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmb_admin_daftar_config_internal(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_simpan_config_internal(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmb_admin_hapus_config_internal(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmb_admin_daftar_config_internal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_simpan_config_internal(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmb_admin_hapus_config_internal(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- FUNGSI RPC MANAJEMEN PENGGUNA & TOKEN (ADMIN) — RUMAH SUM V2 (Skema `sum`)
-- Rumah: sum · Pemegang: Gabriel · Sesuai AGENTS.md §0a.9, §2, §4, §5 & INVENTARIS-SUM.md
-- ==============================================================================
--
-- Prinsip Protokol & Keamanan:
--   1. Isolasi Kamar (docs/GEDUNG-DAN-STAGING.md §1): Hanya membaca & menulis
--      ke skema `sum`. Tidak pernah mengintip skema rumah lain.
--   2. Wajib Token & Hak Admin (Bug #13 & #22): Fungsi internal ditutup dari
--      PUBLIC/anon/authenticated. Pintu masuk publik (`*_bertoken`) wajib
--      memvalidasi token aktif di `sum.api_tokens` milik pengguna berhak admin
--      (`role IN ('superintendent', 'admin')` atau `may_admin = 'true'`).
--   3. Khas SUM V2 (docs/INVENTARIS-SUM.md):
--      - Mendukung 5 peran SUM: `mechanic`, `supervisor`, `superintendent`,
--        `foreman`, `foreman_approver`.
--      - Mendukung kolom `jabatan_aktual`, `golongan` (1a–5c), dan `notify_email`.
--   4. Anti-Kekunci Sendiri: Admin tidak bisa menonaktifkan akun sendiri,
--      mencabut hak admin sendiri, atau mencabut token sendiri.
--   5. Orang Tidak Pernah Dihapus: Hanya dinonaktifkan (`status = 'INACTIVE'`).
--      Token lama dicabut (`is_active = 'false'`, `revoked_at` diisi), bukan dihapus.
--   6. Jejak Audit Bersih: Nilai token mentah TIDAK PERNAH ditulis ke `sum.audit_logs`
--      (hanya `md5(token)` dan samaran 4 karakter).
--
-- Aman dijalankan berulang kali (idempotent).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS sum;

CREATE TABLE IF NOT EXISTS sum.admin_users_supabase (
  mechanic_id text PRIMARY KEY,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sum.admin_tokens_supabase (
  token       text PRIMARY KEY,
  mechanic_id text NOT NULL,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE sum.admin_users_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE sum.admin_tokens_supabase FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sum._pertahankan_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT mechanic_id, data FROM sum.admin_users_supabase LOOP
    UPDATE sum.config_mechanics
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'name', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'role', 'mechanic'),
             coalesce(r.data->>'jabatan_aktual', ''),
             coalesce(r.data->>'golongan', ''),
             coalesce(r.data->>'status', 'ACTIVE'),
             coalesce(r.data->>'may_admin', 'false')
           ),
           sinkron_at = now()
     WHERE trim(data->>'mechanic_id') = trim(r.mechanic_id);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.config_mechanics WHERE baris >= 100000;
      INSERT INTO sum.config_mechanics (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'name', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'role', 'mechanic'),
          coalesce(r.data->>'jabatan_aktual', ''),
          coalesce(r.data->>'golongan', ''),
          coalesce(r.data->>'status', 'ACTIVE'),
          coalesce(r.data->>'may_admin', 'false')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sum_pertahankan_admin_users ON sum.config_mechanics;
CREATE TRIGGER trg_sum_pertahankan_admin_users
AFTER INSERT ON sum.config_mechanics
FOR EACH STATEMENT
EXECUTE FUNCTION sum._pertahankan_admin_users();

CREATE OR REPLACE FUNCTION sum._pertahankan_admin_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT token, mechanic_id, data FROM sum.admin_tokens_supabase LOOP
    UPDATE sum.api_tokens
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'token', ''),
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'is_active', 'true'),
             coalesce(r.data->>'created_at', '')
           ),
           sinkron_at = now()
     WHERE trim(data->>'token') = trim(r.token);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.api_tokens WHERE baris >= 100000;
      INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'token', ''),
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'is_active', 'true'),
          coalesce(r.data->>'created_at', '')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sum_pertahankan_admin_tokens ON sum.api_tokens;
CREATE TRIGGER trg_sum_pertahankan_admin_tokens
AFTER INSERT ON sum.api_tokens
FOR EACH STATEMENT
EXECUTE FUNCTION sum._pertahankan_admin_tokens();

-- ==============================================================================
-- HELPER VALIDASI TOKEN ADMIN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_user  record;
  v_boleh boolean := false;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  -- Tidak ada kata ajaib pengganti token. Panel saklar memanggil fungsi _internal dengan kunci rahasia
  -- Supabase lewat Worker pintu; fungsi *_bertoken hanya menerima token pengguna yang sah.

  SELECT t.data->>'token' AS token,
         coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
         coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), trim(t.data->>'mechanic_id'), '') AS name,
         lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
         lower(coalesce(m.data->>'may_admin', t.data->>'may_admin', 'false')) AS may_admin,
         upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
    INTO v_user
    FROM sum.api_tokens t
    LEFT JOIN sum.config_mechanics m
      ON (nullif(trim(t.data->>'mechanic_id'), '') IS NOT NULL AND trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id'))
      OR (nullif(trim(t.data->>'email'), '') IS NOT NULL AND lower(trim(t.data->>'email')) = lower(trim(m.data->>'email')))
   WHERE trim(t.data->>'token') = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
     AND (t.data->>'revoked_at' IS NULL OR trim(t.data->>'revoked_at') = '')
   LIMIT 1;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'supervisor', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
  IF NOT v_boleh THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Menu Admin hanya untuk yang diberi hak admin.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role
  );
END;
$$;

-- ==============================================================================
-- 1. DAFTAR USER & TOKEN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_daftar_user_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users json;
BEGIN
  WITH token_aktif AS (
    SELECT DISTINCT ON (trim(data->>'mechanic_id'))
           trim(data->>'mechanic_id') AS mechanic_id,
           trim(data->>'token') AS token,
           data->>'created_at' AS created_at
      FROM sum.api_tokens
     WHERE (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
       AND nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY trim(data->>'mechanic_id'), baris DESC
  ),
  jejak_wo AS (
    SELECT trim(data->>'mechanic_id') AS mechanic_id,
           count(*)::int AS wo_count
      FROM sum.work_order_team
     WHERE nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     GROUP BY trim(data->>'mechanic_id')
  ),
  daftar AS (
    SELECT m.baris,
           coalesce(m.data->>'mechanic_id', '') AS mechanic_id,
           coalesce(m.data->>'name', '') AS name,
           coalesce(m.data->>'email', '') AS email,
           lower(coalesce(nullif(trim(m.data->>'role'), ''), 'mechanic')) AS role,
           coalesce(m.data->>'jabatan_aktual', '') AS jabatan_aktual,
           coalesce(m.data->>'golongan', '') AS golongan,
           coalesce(m.data->>'notify_email', '') AS notify_email,
           upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) AS status,
           (upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
           (lower(coalesce(m.data->>'is_test_account', 'false')) IN ('true', '1')) AS akun_uji,
           (lower(coalesce(m.data->>'may_admin', 'false')) IN ('true', '1') OR lower(coalesce(m.data->>'role', '')) IN ('superintendent', 'admin')) AS boleh_admin,
           ta.token AS token,
           CASE WHEN ta.token IS NOT NULL AND length(ta.token) >= 4
                THEN left(ta.token, 4) || '…'
                ELSE null
           END AS token_masked,
           (ta.token IS NOT NULL) AS has_token,
           coalesce(jw.wo_count, 0) AS jejak
      FROM sum.config_mechanics m
      LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.data->>'mechanic_id')
      LEFT JOIN jejak_wo jw ON jw.mechanic_id = trim(m.data->>'mechanic_id')
     WHERE nullif(trim(m.data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY (upper(coalesce(m.data->>'status', 'ACTIVE')) = 'ACTIVE') DESC,
              lower(coalesce(m.data->>'role', 'mechanic')),
              coalesce(m.data->>'name', '')
  )
  SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json)
    INTO v_users
    FROM daftar;

  RETURN json_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'sum',
    'result', json_build_object(
      'rumah', 'sum',
      'users', v_users,
      'roles', json_build_array('mechanic', 'supervisor', 'superintendent', 'foreman', 'foreman_approver'),
      'golongan_options', json_build_array('1a', '1b', '1c', '2a', '2b', '2c', '3a', '3b', '3c', '4a', '4b', '4c', '5a', '5b', '5c'),
      'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_daftar_user_internal();
END;
$$;

-- ==============================================================================
-- 2. SIMPAN / UBAH USER SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_simpan_user_internal(
  p_actor_id text,
  p_op_id    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id        text := btrim(coalesce(p_op_id, ''));
  v_existing_op  jsonb;
  v_kode         text := upper(btrim(coalesce(p_payload->>'mechanic_id', p_payload->>'kode', '')));
  v_nama         text := btrim(coalesce(p_payload->>'name', p_payload->>'nama', ''));
  v_email        text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_peran        text := lower(btrim(coalesce(p_payload->>'role', p_payload->>'peran', 'mechanic')));
  v_jabatan      text := btrim(coalesce(p_payload->>'jabatan_aktual', p_payload->>'grade', ''));
  v_golongan     text := lower(btrim(coalesce(p_payload->>'golongan', '')));
  v_notify_email text := lower(btrim(coalesce(p_payload->>'notify_email', v_email)));
  v_aktif        boolean := coalesce((p_payload->>'aktif')::boolean, upper(coalesce(p_payload->>'status', 'ACTIVE')) <> 'INACTIVE', true);
  v_status       text := CASE WHEN v_aktif THEN 'ACTIVE' ELSE 'INACTIVE' END;
  v_akun_uji     boolean := coalesce((p_payload->>'akunUji')::boolean, (p_payload->>'is_test_account')::boolean, false);
  v_boleh_admin  boolean := coalesce((p_payload->>'bolehAdmin')::boolean, (p_payload->>'may_admin')::boolean, v_peran = 'superintendent');
  v_lama         record;
  v_baris        int;
  v_baru         boolean := false;
  v_data_baru    jsonb;
  v_waktu_wib    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_hasil        jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM sum.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF length(v_kode) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Kode mekanik minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF length(v_nama) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Nama minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF v_peran NOT IN ('mechanic', 'supervisor', 'superintendent', 'foreman', 'foreman_approver', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Peran tidak sah: ' || v_peran, 'source', 'SUPABASE');
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_kode THEN
    IF NOT v_aktif THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menonaktifkan akun Anda sendiri.', 'source', 'SUPABASE');
    END IF;
    IF NOT v_boleh_admin AND v_peran <> 'superintendent' THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.', 'source', 'SUPABASE');
    END IF;
  END IF;

  SELECT baris, data INTO v_lama
    FROM sum.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_kode
   LIMIT 1;

  v_data_baru := coalesce(v_lama.data, '{}'::jsonb) || jsonb_build_object(
    'mechanic_id', v_kode,
    'name', v_nama,
    'email', v_email,
    'role', v_peran,
    'jabatan_aktual', v_jabatan,
    'golongan', v_golongan,
    'notify_email', v_notify_email,
    'status', v_status,
    'is_test_account', CASE WHEN v_akun_uji THEN 'true' ELSE 'false' END,
    'may_admin', CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END,
    'source', 'SUPABASE',
    'updated_at', v_waktu_wib
  );

  IF v_lama.baris IS NOT NULL THEN
    UPDATE sum.config_mechanics
       SET data = v_data_baru,
           nilai = jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_jabatan, v_golongan, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
           sinkron_at = now()
     WHERE baris = v_lama.baris;
    v_baris := v_lama.baris;
    v_baru := false;
  ELSE
    SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.config_mechanics WHERE baris >= 100000;
    INSERT INTO sum.config_mechanics (baris, nilai, data, sinkron_at)
    VALUES (
      v_baris,
      jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_jabatan, v_golongan, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
      v_data_baru,
      now()
    );
    v_baru := true;
  END IF;

  INSERT INTO sum.admin_users_supabase (mechanic_id, data, diubah_at)
  VALUES (v_kode, v_data_baru, now())
  ON CONFLICT (mechanic_id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  INSERT INTO sum.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END, 'mechanic', v_kode),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END,
      'entity_type', 'mechanic',
      'entity_id', v_kode,
      'details', jsonb_build_object(
        'lama', coalesce(v_lama.data, null),
        'baru', v_data_baru
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_kode,
      'name', v_nama,
      'role', v_peran,
      'status', v_status,
      'baru', v_baru,
      'rumah', 'sum'
    )
  );

  INSERT INTO sum.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.processed_ops),
    jsonb_build_array(v_op_id, 'admin_simpan_user', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_simpan_user',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_simpan_user_bertoken(
  p_token   text,
  p_op_id   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_simpan_user_internal(v_auth->>'mechanic_id', p_op_id, p_payload);
END;
$$;

-- ==============================================================================
-- 3. TERBITKAN / GANTI TOKEN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_terbitkan_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text,
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_mech        record;
  v_tok_lama    record;
  v_token       text := btrim(coalesce(p_token_baru, ''));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_baris       int;
  v_tok_data    jsonb;
  v_mengganti   boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM sum.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  SELECT baris, data INTO v_mech
    FROM sum.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
   LIMIT 1;

  IF v_mech.baris IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mekanik ' || v_target_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF upper(coalesce(v_mech.data->>'status', 'ACTIVE')) = 'INACTIVE' THEN
    RETURN json_build_object(
      'success', false,
      'error', coalesce(v_mech.data->>'name', v_target_id) || ' sudah nonaktif — aktifkan dulu sebelum diberi token.',
      'source', 'SUPABASE'
    );
  END IF;

  SELECT baris, trim(data->>'token') AS token, data
    INTO v_tok_lama
    FROM sum.api_tokens
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
     AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
     AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
   ORDER BY baris DESC
   LIMIT 1;

  IF v_tok_lama.token IS NOT NULL AND NOT coalesce(p_ganti, false) THEN
    RETURN json_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', json_build_object(
        'mechanic_id', v_target_id,
        'token', v_tok_lama.token,
        'token_masked', left(v_tok_lama.token, 4) || '…',
        'mengganti_lama', false,
        'rumah', 'sum'
      )
    );
  END IF;

  IF v_tok_lama.token IS NOT NULL THEN
    v_mengganti := true;
    UPDATE sum.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false');

    UPDATE sum.admin_tokens_supabase
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
           diubah_at = now()
     WHERE upper(trim(mechanic_id)) = v_target_id;
  END IF;

  IF v_token = '' THEN
    v_token := 'sum-' || substr(md5(random()::text || clock_timestamp()::text || v_target_id), 1, 12);
  END IF;

  v_tok_data := jsonb_build_object(
    'token', v_token,
    'mechanic_id', v_target_id,
    'name', coalesce(v_mech.data->>'name', v_target_id),
    'email', coalesce(v_mech.data->>'email', ''),
    'role', coalesce(v_mech.data->>'role', 'mechanic'),
    'is_active', 'true',
    'created_at', v_waktu_wib,
    'revoked_at', '',
    'source', 'SUPABASE'
  );

  SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM sum.api_tokens WHERE baris >= 100000;
  INSERT INTO sum.api_tokens (baris, nilai, data, sinkron_at)
  VALUES (
    v_baris,
    jsonb_build_array(v_token, v_target_id, coalesce(v_mech.data->>'email', ''), 'true', v_waktu_wib),
    v_tok_data,
    now()
  );

  INSERT INTO sum.admin_tokens_supabase (token, mechanic_id, data, diubah_at)
  VALUES (v_token, v_target_id, v_tok_data, now())
  ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  -- Audit log TANPA token mentah
  INSERT INTO sum.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END, 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END,
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object(
        'nama', coalesce(v_mech.data->>'name', v_target_id),
        'mengganti_lama', v_mengganti,
        'token_md5', md5(v_token),
        'token_samaran', left(v_token, 4) || '…'
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'token', v_token,
      'token_masked', left(v_token, 4) || '…',
      'mengganti_lama', v_mengganti,
      'rumah', 'sum'
    )
  );

  INSERT INTO sum.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.processed_ops),
    jsonb_build_array(v_op_id, 'admin_terbitkan_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_terbitkan_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_terbitkan_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text DEFAULT '',
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_terbitkan_token_internal(
    v_auth->>'mechanic_id', p_op_id, p_mechanic_id, p_token_baru, p_ganti
  );
END;
$$;

-- ==============================================================================
-- 4. CABUT TOKEN SUM V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_cabut_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_dicabut     int := 0;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM sum.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_target_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.',
      'source', 'SUPABASE'
    );
  END IF;

  WITH updated AS (
    UPDATE sum.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
    RETURNING baris
  )
  SELECT count(*)::int INTO v_dicabut FROM updated;

  UPDATE sum.admin_tokens_supabase
     SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
         diubah_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  INSERT INTO sum.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), 'admin_token_cabut', 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', 'admin_token_cabut',
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object('dicabut', v_dicabut)
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'dicabut', v_dicabut,
      'rumah', 'sum'
    )
  );

  INSERT INTO sum.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM sum.processed_ops),
    jsonb_build_array(v_op_id, 'admin_cabut_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_cabut_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_cabut_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._sum_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_cabut_token_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._sum_validasi_admin_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_daftar_user_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_simpan_user_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_terbitkan_token_internal(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_cabut_token_internal(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._sum_validasi_admin_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_daftar_user_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_simpan_user_internal(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_terbitkan_token_internal(text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_cabut_token_internal(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.sum_admin_daftar_user_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_simpan_user_bertoken(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_terbitkan_token_bertoken(text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_cabut_token_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. HAPUS PENGGUNA PERMANEN (DELETE CRUD) — Kamar `sum`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_hapus_user_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_op_id     text := btrim(coalesce(p_op_id, ''));
  v_dihapus   int := 0;
  v_hasil     jsonb;
BEGIN
  IF v_target_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'mechanic_id wajib diisi', 'source', 'SUPABASE');
  END IF;
  IF v_target_id = upper(btrim(coalesce(p_actor_id, ''))) THEN
    RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menghapus akun Anda sendiri.', 'source', 'SUPABASE');
  END IF;

  DELETE FROM sum.api_tokens WHERE upper(trim(coalesce(data->>'mechanic_id', data->>'user_id', ''))) = v_target_id;
  DELETE FROM sum.config_mechanics WHERE upper(trim(coalesce(data->>'mechanic_id', ''))) = v_target_id;
  GET DIAGNOSTICS v_dihapus = ROW_COUNT;

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('mechanic_id', v_target_id, 'dihapus', v_dihapus, 'rumah', 'sum')
  );
  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_hapus_user_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_hapus_user_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sum_admin_hapus_user_internal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sum_admin_hapus_user_internal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_hapus_user_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. CRUD KONFIGURASI (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) — Kamar `sum`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._sum_admin_daftar_config_internal(p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units   jsonb := '[]'::jsonb;
  v_comps   jsonb := '[]'::jsonb;
  v_jobs    jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_code', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_name', coalesce(nullif(btrim(data->>'unit_name'), ''), data->>'unit_id', ''),
    'unit_model', coalesce(data->>'unit_model', data->>'model', ''),
    'section', coalesce(data->>'section', data->>'unit_type', 'field'),
    'unit_factor', coalesce(nullif(regexp_replace(coalesce(data->>'unit_factor', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'unit_id', '')), '[]'::jsonb)
  INTO v_units
  FROM sum.config_units
  WHERE coalesce(data->>'unit_id', data->>'unit_code', '') <> '';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', coalesce(data->>'component_id', data->>'component_no', ''),
    'component_no', coalesce(data->>'component_no', data->>'component_id', ''),
    'component_name', coalesce(data->>'component_name', data->>'name', ''),
    'category', coalesce(data->>'category', data->>'section', 'General'),
    'section', coalesce(data->>'section', data->>'category', 'General'),
    'base_points', coalesce(nullif(regexp_replace(coalesce(data->>'base_points', data->>'base_point', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'target_hours', coalesce(nullif(regexp_replace(coalesce(data->>'target_hours', data->>'plan_hours', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'component_id', data->>'component_no', '')), '[]'::jsonb)
  INTO v_comps
  FROM sum.config_components
  WHERE coalesce(data->>'component_id', data->>'component_no', '') <> '';

  
  v_jobs := v_comps;
  

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', coalesce(data->>'factor_type', data->>'type', 'factor') || ':' || coalesce(data->>'key', data->>'factor_key', ''),
    'factor_type', coalesce(data->>'factor_type', data->>'type', 'work_condition'),
    'key', coalesce(data->>'key', data->>'factor_key', ''),
    'value', coalesce(nullif(regexp_replace(coalesce(data->>'value', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'description', coalesce(data->>'description', '')
  ) ORDER BY coalesce(data->>'factor_type', data->>'type', ''), coalesce(data->>'key', '')), '[]'::jsonb)
  INTO v_factors
  FROM sum.config_factors
  WHERE coalesce(data->>'key', data->>'factor_key', '') <> '';

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'sum',
    'result', jsonb_build_object(
      'rumah', 'sum',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    ),
    'data', jsonb_build_object(
      'rumah', 'sum',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_daftar_config_bertoken(p_token text, p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_daftar_config_internal(p_jenis);
END;
$$;

CREATE OR REPLACE FUNCTION public._sum_admin_simpan_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_baris int;
  v_obj   jsonb;
  v_ft    text;
  v_fk    text;
BEGIN
  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'Kode Unit (unit_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'unit_id', v_id,
      'unit_code', v_id,
      'unit_name', btrim(coalesce(nullif(p_payload->>'unit_name', ''), v_id)),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', p_payload->>'model', '')),
      'section', btrim(coalesce(p_payload->>'section', 'field')),
      'unit_type', btrim(coalesce(p_payload->>'section', 'UNIT')),
      'unit_factor', coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM sum.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_units SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_units WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_units (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'ID Komponen (component_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'component_id', v_id,
      'component_no', v_id,
      'component_name', btrim(coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'name', ''), v_id)),
      'category', btrim(coalesce(p_payload->>'category', p_payload->>'section', 'General')),
      'base_points', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN
      v_id := 'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;
    v_obj := jsonb_build_object(
      'job_id', v_id,
      'component_id', v_id,
      'component_no', v_id,
      'section', lower(btrim(coalesce(nullif(p_payload->>'section', ''), 'field'))),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', '')),
      'component', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'category', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'sub_component', btrim(coalesce(nullif(p_payload->>'sub_component', ''), 'Standard')),
      'job_description', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'component_name', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'plan_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'base_points', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'job_type', btrim(coalesce(nullif(p_payload->>'job_type', ''), 'Preventive')),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE'))),
      'is_active', 'TRUE'
    );
    
    SELECT baris INTO v_baris FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_ft := lower(btrim(coalesce(p_payload->>'factor_type', p_payload->>'type', 'work_condition')));
    v_fk := lower(btrim(coalesce(p_payload->>'key', '')));
    IF v_fk = '' THEN
      RETURN json_build_object('success', false, 'error', 'Key faktor wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'factor_type', v_ft,
      'type', v_ft,
      'key', v_fk,
      'factor_key', v_fk,
      'value', coalesce(nullif(p_payload->>'value', '')::numeric, 1.0),
      'description', btrim(coalesce(p_payload->>'description', ''))
    );
    SELECT baris INTO v_baris
      FROM sum.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) = v_ft
       AND lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = v_fk
     LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE sum.config_factors SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM sum.config_factors WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO sum.config_factors (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_ft, v_fk), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_ft || ':' || v_fk));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_simpan_config_bertoken(
  p_token   text,
  p_op_id   text,
  p_jenis   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_simpan_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._sum_admin_hapus_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_kunci    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis   text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci   text := btrim(coalesce(p_kunci, ''));
  v_dihapus int := 0;
BEGIN
  IF v_kunci = '' THEN
    RETURN json_build_object('success', false, 'error', 'Kunci item wajib diisi', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM sum.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    
    DELETE FROM sum.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = upper(v_kunci);
    
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM sum.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) || ':' || lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci)
        OR lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', v_jenis, 'kunci', v_kunci, 'dihapus', v_dihapus));
END;
$$;

CREATE OR REPLACE FUNCTION public.sum_admin_hapus_config_bertoken(
  p_token text,
  p_op_id text,
  p_jenis text,
  p_kunci text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._sum_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._sum_admin_hapus_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_kunci);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sum_admin_daftar_config_internal(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_simpan_config_internal(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sum_admin_hapus_config_internal(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sum_admin_daftar_config_internal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_simpan_config_internal(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._sum_admin_hapus_config_internal(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sum_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- FUNGSI RPC MANAJEMEN PENGGUNA & TOKEN (ADMIN) — RUMAH KMB V2 / TRA (Skema `kmb`)
-- Rumah: kmb · Pemegang: Gabriel · Sesuai AGENTS.md §0a.9, §2, §4, §5
-- ==============================================================================
--
-- Prinsip Protokol & Keamanan:
--   1. Isolasi Kamar (docs/GEDUNG-DAN-STAGING.md §1): Hanya membaca & menulis
--      ke skema `kmb`. Tidak pernah mengintip skema rumah lain.
--   2. Wajib Token & Hak Admin (Bug #13 & #22): Fungsi internal ditutup dari
--      PUBLIC/anon/authenticated. Pintu masuk publik (`*_bertoken`) wajib
--      memvalidasi token aktif di `kmb.api_tokens` milik pengguna berhak admin
--      (`role IN ('superintendent', 'admin')` atau `may_admin = 'true'`).
--   3. Tanpa Hardcode (AGENTS.md §5): Tidak ada `tenant_id`, token, atau daftar
--      mekanik yang di-hardcode.
--   4. Anti-Kekunci Sendiri (`src/domain/admin.ts`): Admin tidak bisa mencabut
--      hak admin dirinya sendiri, menonaktifkan dirinya sendiri, atau mencabut
--      token dirinya sendiri.
--   5. Orang Tidak Pernah Dihapus: Hanya dinonaktifkan (`status = 'INACTIVE'`).
--      Token lama dicabut (`is_active = 'false'`, `revoked_at` diisi), bukan dihapus.
--   6. Jejak Audit Bersih (`AGENTS.md` §4 & §0a.9): Nilai token mentah TIDAK PERNAH
--      ditulis ke `kmb.audit_logs` (hanya `md5(token)` dan samaran 4 karakter).
--   7. Tahan Sinkron Cermin: Perubahan dari Supabase disimpan juga di tabel
--      pendamping `kmb.admin_users_supabase` & `kmb.admin_tokens_supabase` dengan
--      trigger statement-level agar tidak terhapus saat `sinkron-cermin.mjs` jalan.
--
-- Aman dijalankan berulang kali (idempotent).
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS kmb;

-- Tabel pendamping untuk menjaga mutasi pengguna/token Supabase saat cermin disinkron ulang
CREATE TABLE IF NOT EXISTS kmb.admin_users_supabase (
  mechanic_id text PRIMARY KEY,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kmb.admin_tokens_supabase (
  token       text PRIMARY KEY,
  mechanic_id text NOT NULL,
  data        jsonb NOT NULL,
  diubah_at   timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE kmb.admin_users_supabase FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE kmb.admin_tokens_supabase FROM PUBLIC, anon, authenticated;

-- Trigger penahan agar baris yang dikelola di Supabase tetap bertahan seusai sinkron cermin
CREATE OR REPLACE FUNCTION kmb._pertahankan_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT mechanic_id, data FROM kmb.admin_users_supabase LOOP
    UPDATE kmb.config_mechanics
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'name', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'role', 'mechanic'),
             coalesce(r.data->>'section', ''),
             coalesce(r.data->>'position', ''),
             coalesce(r.data->>'status', 'ACTIVE'),
             coalesce(r.data->>'may_admin', 'false')
           ),
           sinkron_at = now()
     WHERE trim(data->>'mechanic_id') = trim(r.mechanic_id);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.config_mechanics WHERE baris >= 100000;
      INSERT INTO kmb.config_mechanics (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'name', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'role', 'mechanic'),
          coalesce(r.data->>'section', ''),
          coalesce(r.data->>'position', ''),
          coalesce(r.data->>'status', 'ACTIVE'),
          coalesce(r.data->>'may_admin', 'false')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kmb_pertahankan_admin_users ON kmb.config_mechanics;
CREATE TRIGGER trg_kmb_pertahankan_admin_users
AFTER INSERT ON kmb.config_mechanics
FOR EACH STATEMENT
EXECUTE FUNCTION kmb._pertahankan_admin_users();

CREATE OR REPLACE FUNCTION kmb._pertahankan_admin_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_baris int;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT token, mechanic_id, data FROM kmb.admin_tokens_supabase LOOP
    UPDATE kmb.api_tokens
       SET data = r.data,
           nilai = jsonb_build_array(
             coalesce(r.data->>'token', ''),
             coalesce(r.data->>'mechanic_id', ''),
             coalesce(r.data->>'email', ''),
             coalesce(r.data->>'is_active', 'true'),
             coalesce(r.data->>'created_at', '')
           ),
           sinkron_at = now()
     WHERE trim(data->>'token') = trim(r.token);

    IF NOT FOUND THEN
      SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.api_tokens WHERE baris >= 100000;
      INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
      VALUES (
        v_baris,
        jsonb_build_array(
          coalesce(r.data->>'token', ''),
          coalesce(r.data->>'mechanic_id', ''),
          coalesce(r.data->>'email', ''),
          coalesce(r.data->>'is_active', 'true'),
          coalesce(r.data->>'created_at', '')
        ),
        r.data,
        now()
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_kmb_pertahankan_admin_tokens ON kmb.api_tokens;
CREATE TRIGGER trg_kmb_pertahankan_admin_tokens
AFTER INSERT ON kmb.api_tokens
FOR EACH STATEMENT
EXECUTE FUNCTION kmb._pertahankan_admin_tokens();

-- ==============================================================================
-- HELPER VALIDASI TOKEN ADMIN KMB V2
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_validasi_admin_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_token, ''));
  v_user  record;
  v_boleh boolean := false;
BEGIN
  IF v_clean = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  -- Tidak ada kata ajaib pengganti token. Panel saklar memanggil fungsi _internal dengan kunci rahasia
  -- Supabase lewat Worker pintu; fungsi *_bertoken hanya menerima token pengguna yang sah.

  SELECT t.data->>'token' AS token,
         coalesce(nullif(trim(m.data->>'mechanic_id'), ''), trim(t.data->>'mechanic_id'), '') AS mechanic_id,
         coalesce(nullif(trim(m.data->>'name'), ''), trim(t.data->>'name'), trim(t.data->>'mechanic_id'), '') AS name,
         lower(coalesce(nullif(trim(m.data->>'role'), ''), trim(t.data->>'role'), 'mechanic')) AS role,
         lower(coalesce(m.data->>'may_admin', t.data->>'may_admin', 'false')) AS may_admin,
         upper(coalesce(m.data->>'status', 'ACTIVE')) AS mech_status
    INTO v_user
    FROM kmb.api_tokens t
    LEFT JOIN kmb.config_mechanics m
      ON (nullif(trim(t.data->>'mechanic_id'), '') IS NOT NULL AND trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id'))
      OR (nullif(trim(t.data->>'email'), '') IS NOT NULL AND lower(trim(t.data->>'email')) = lower(trim(m.data->>'email')))
   WHERE trim(t.data->>'token') = v_clean
     AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
     AND (t.data->>'revoked_at' IS NULL OR trim(t.data->>'revoked_at') = '')
   LIMIT 1;

  IF v_user.token IS NULL OR v_user.mech_status = 'INACTIVE' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token tidak dikenal / nonaktif');
  END IF;

  v_boleh := (v_user.role IN ('superintendent', 'supervisor', 'admin')) OR (v_user.may_admin IN ('true', '1', 'yes'));
  IF NOT v_boleh THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Menu Admin hanya untuk yang diberi hak admin.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'mechanic_id', v_user.mechanic_id,
    'name', v_user.name,
    'role', v_user.role
  );
END;
$$;

-- ==============================================================================
-- 1. DAFTAR USER & TOKEN (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_daftar_user_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users json;
  v_rates json;
BEGIN
  WITH token_aktif AS (
    SELECT DISTINCT ON (trim(data->>'mechanic_id'))
           trim(data->>'mechanic_id') AS mechanic_id,
           trim(data->>'token') AS token,
           data->>'created_at' AS created_at
      FROM kmb.api_tokens
     WHERE (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
       AND nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY trim(data->>'mechanic_id'), baris DESC
  ),
  jejak_wo AS (
    SELECT trim(data->>'mechanic_id') AS mechanic_id,
           count(*)::int AS wo_count
      FROM kmb.work_order_team
     WHERE nullif(trim(data->>'mechanic_id'), '') IS NOT NULL
     GROUP BY trim(data->>'mechanic_id')
  ),
  daftar AS (
    SELECT m.baris,
           coalesce(m.data->>'mechanic_id', '') AS mechanic_id,
           coalesce(m.data->>'name', '') AS name,
           coalesce(m.data->>'email', '') AS email,
           lower(coalesce(nullif(trim(m.data->>'role'), ''), 'mechanic')) AS role,
           coalesce(m.data->>'section', '') AS section,
           coalesce(m.data->>'position', m.data->>'grade', 'junior') AS position,
           coalesce(m.data->>'grade', m.data->>'position', '') AS grade,
           upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) AS status,
           (upper(coalesce(nullif(trim(m.data->>'status'), ''), 'ACTIVE')) = 'ACTIVE') AS aktif,
           (lower(coalesce(m.data->>'is_test_account', 'false')) IN ('true', '1')) AS akun_uji,
           (lower(coalesce(m.data->>'boleh_lihat_performa', m.data->>'may_view_performance', 'false')) IN ('true', '1')) AS boleh_performa,
           (lower(coalesce(m.data->>'boleh_lihat_teknis', m.data->>'may_view_technical', 'false')) IN ('true', '1')) AS boleh_teknis,
           (lower(coalesce(m.data->>'boleh_lihat_report', m.data->>'may_view_report', 'false')) IN ('true', '1')) AS boleh_report,
           (lower(coalesce(m.data->>'may_admin', 'false')) IN ('true', '1') OR lower(coalesce(m.data->>'role', '')) IN ('superintendent', 'admin')) AS boleh_admin,
           ta.token AS token,
           CASE WHEN ta.token IS NOT NULL AND length(ta.token) >= 4
                THEN left(ta.token, 4) || '…'
                ELSE null
           END AS token_masked,
           (ta.token IS NOT NULL) AS has_token,
           coalesce(jw.wo_count, 0) AS jejak
      FROM kmb.config_mechanics m
      LEFT JOIN token_aktif ta ON ta.mechanic_id = trim(m.data->>'mechanic_id')
      LEFT JOIN jejak_wo jw ON jw.mechanic_id = trim(m.data->>'mechanic_id')
     WHERE nullif(trim(m.data->>'mechanic_id'), '') IS NOT NULL
     ORDER BY (upper(coalesce(m.data->>'status', 'ACTIVE')) = 'ACTIVE') DESC,
              lower(coalesce(m.data->>'role', 'mechanic')),
              coalesce(m.data->>'name', '')
  )
  SELECT coalesce(json_agg(row_to_json(daftar)), '[]'::json)
    INTO v_users
    FROM daftar;

  SELECT coalesce(json_agg(json_build_object(
    'key', coalesce(data->>'key', data->>'position', ''),
    'label', coalesce(data->>'label', data->>'key', ''),
    'value', coalesce((nullif(trim(data->>'value'), ''))::numeric, 0)
  )), '[]'::json)
    INTO v_rates
    FROM kmb.config_rates;

  RETURN json_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbtra',
    'result', json_build_object(
      'rumah', 'kmbtra',
      'users', v_users,
      'rates', v_rates,
      'sections', json_build_array('field', 'workshop', 'tyreman'),
      'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_daftar_user_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_daftar_user_internal();
END;
$$;

-- ==============================================================================
-- 2. SIMPAN / UBAH USER (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_simpan_user_internal(
  p_actor_id text,
  p_op_id    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id        text := btrim(coalesce(p_op_id, ''));
  v_existing_op  jsonb;
  v_kode         text := upper(btrim(coalesce(p_payload->>'mechanic_id', p_payload->>'kode', '')));
  v_nama         text := btrim(coalesce(p_payload->>'name', p_payload->>'nama', ''));
  v_email        text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_peran        text := lower(btrim(coalesce(p_payload->>'role', p_payload->>'peran', 'mechanic')));
  v_section      text := btrim(coalesce(p_payload->>'section', ''));
  v_position     text := btrim(coalesce(p_payload->>'position', p_payload->>'grade', 'junior'));
  v_aktif        boolean := coalesce((p_payload->>'aktif')::boolean, upper(coalesce(p_payload->>'status', 'ACTIVE')) <> 'INACTIVE', true);
  v_status       text := CASE WHEN v_aktif THEN 'ACTIVE' ELSE 'INACTIVE' END;
  v_akun_uji     boolean := coalesce((p_payload->>'akunUji')::boolean, (p_payload->>'is_test_account')::boolean, false);
  v_boleh_perf   boolean := coalesce((p_payload->>'bolehPerforma')::boolean, (p_payload->>'may_view_performance')::boolean, false);
  v_boleh_tek    boolean := coalesce((p_payload->>'bolehTeknis')::boolean, (p_payload->>'may_view_technical')::boolean, false);
  v_boleh_rep    boolean := coalesce((p_payload->>'bolehReport')::boolean, (p_payload->>'may_view_report')::boolean, false);
  v_boleh_admin  boolean := coalesce((p_payload->>'bolehAdmin')::boolean, (p_payload->>'may_admin')::boolean, v_peran = 'superintendent');
  v_lama         record;
  v_baris        int;
  v_baru         boolean := false;
  v_data_baru    jsonb;
  v_waktu_wib    text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_hasil        jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  -- Cek idempotensi di processed_ops
  SELECT (data->'result_json') INTO v_existing_op
    FROM kmb.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF length(v_kode) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Kode mekanik minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF length(v_nama) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Nama minimal 2 huruf', 'source', 'SUPABASE');
  END IF;
  IF v_peran NOT IN ('mechanic', 'supervisor', 'superintendent', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Peran tidak sah: ' || v_peran, 'source', 'SUPABASE');
  END IF;

  -- Cegah admin mengunci dirinya sendiri
  IF upper(btrim(coalesce(p_actor_id, ''))) = v_kode THEN
    IF NOT v_aktif THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menonaktifkan akun Anda sendiri.', 'source', 'SUPABASE');
    END IF;
    IF NOT v_boleh_admin AND v_peran <> 'superintendent' THEN
      RETURN json_build_object('success', false, 'error', 'Anda tidak bisa mencabut hak admin Anda sendiri. Minta admin lain melakukannya, supaya tidak ada keadaan tanpa admin sama sekali.', 'source', 'SUPABASE');
    END IF;
  END IF;

  SELECT baris, data INTO v_lama
    FROM kmb.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_kode
   LIMIT 1;

  v_data_baru := coalesce(v_lama.data, '{}'::jsonb) || jsonb_build_object(
    'mechanic_id', v_kode,
    'name', v_nama,
    'email', v_email,
    'role', v_peran,
    'section', v_section,
    'position', v_position,
    'grade', v_position,
    'status', v_status,
    'is_test_account', CASE WHEN v_akun_uji THEN 'true' ELSE 'false' END,
    'boleh_lihat_performa', CASE WHEN v_boleh_perf THEN 'true' ELSE 'false' END,
    'boleh_lihat_teknis', CASE WHEN v_boleh_tek THEN 'true' ELSE 'false' END,
    'boleh_lihat_report', CASE WHEN v_boleh_rep THEN 'true' ELSE 'false' END,
    'may_admin', CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END,
    'source', 'SUPABASE',
    'updated_at', v_waktu_wib
  );

  IF v_lama.baris IS NOT NULL THEN
    UPDATE kmb.config_mechanics
       SET data = v_data_baru,
           nilai = jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_section, v_position, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
           sinkron_at = now()
     WHERE baris = v_lama.baris;
    v_baris := v_lama.baris;
    v_baru := false;
  ELSE
    SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.config_mechanics WHERE baris >= 100000;
    INSERT INTO kmb.config_mechanics (baris, nilai, data, sinkron_at)
    VALUES (
      v_baris,
      jsonb_build_array(v_kode, v_nama, v_email, v_peran, v_section, v_position, v_status, CASE WHEN v_boleh_admin THEN 'true' ELSE 'false' END),
      v_data_baru,
      now()
    );
    v_baru := true;
  END IF;

  INSERT INTO kmb.admin_users_supabase (mechanic_id, data, diubah_at)
  VALUES (v_kode, v_data_baru, now())
  ON CONFLICT (mechanic_id) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  -- Catat di audit_logs (tanpa token)
  INSERT INTO kmb.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END, 'mechanic', v_kode),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_baru THEN 'admin_orang_baru' ELSE 'admin_orang_ubah' END,
      'entity_type', 'mechanic',
      'entity_id', v_kode,
      'details', jsonb_build_object(
        'lama', coalesce(v_lama.data, null),
        'baru', v_data_baru
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_kode,
      'name', v_nama,
      'role', v_peran,
      'status', v_status,
      'baru', v_baru,
      'rumah', 'kmbtra'
    )
  );

  INSERT INTO kmb.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.processed_ops),
    jsonb_build_array(v_op_id, 'admin_simpan_user', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_simpan_user',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_simpan_user_bertoken(
  p_token   text,
  p_op_id   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_simpan_user_internal(v_auth->>'mechanic_id', p_op_id, p_payload);
END;
$$;

-- ==============================================================================
-- 3. TERBITKAN / GANTI TOKEN (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_terbitkan_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text,
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_mech        record;
  v_tok_lama    record;
  v_token       text := btrim(coalesce(p_token_baru, ''));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_baris       int;
  v_tok_data    jsonb;
  v_mengganti   boolean := false;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM kmb.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  SELECT baris, data INTO v_mech
    FROM kmb.config_mechanics
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
   LIMIT 1;

  IF v_mech.baris IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mekanik ' || v_target_id || ' tidak ditemukan', 'source', 'SUPABASE');
  END IF;

  IF upper(coalesce(v_mech.data->>'status', 'ACTIVE')) = 'INACTIVE' THEN
    RETURN json_build_object(
      'success', false,
      'error', coalesce(v_mech.data->>'name', v_target_id) || ' sudah nonaktif — aktifkan dulu sebelum diberi token.',
      'source', 'SUPABASE'
    );
  END IF;

  -- Cek apakah sudah punya token aktif
  SELECT baris, trim(data->>'token') AS token, data
    INTO v_tok_lama
    FROM kmb.api_tokens
   WHERE upper(trim(data->>'mechanic_id')) = v_target_id
     AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
     AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
   ORDER BY baris DESC
   LIMIT 1;

  IF v_tok_lama.token IS NOT NULL AND NOT coalesce(p_ganti, false) THEN
    RETURN json_build_object(
      'success', true,
      'source', 'SUPABASE',
      'result', json_build_object(
        'mechanic_id', v_target_id,
        'token', v_tok_lama.token,
        'token_masked', left(v_tok_lama.token, 4) || '…',
        'mengganti_lama', false,
        'rumah', 'kmbtra'
      )
    );
  END IF;

  -- Cabut token lama (disimpan sebagai riwayat, tidak dihapus)
  IF v_tok_lama.token IS NOT NULL THEN
    v_mengganti := true;
    UPDATE kmb.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false');

    UPDATE kmb.admin_tokens_supabase
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
           diubah_at = now()
     WHERE upper(trim(mechanic_id)) = v_target_id;
  END IF;

  -- Bangun token baru berawalan kmb- jika belum disediakan Pintu
  IF v_token = '' THEN
    v_token := 'kmb-' || substr(md5(random()::text || clock_timestamp()::text || v_target_id), 1, 12);
  END IF;

  v_tok_data := jsonb_build_object(
    'token', v_token,
    'mechanic_id', v_target_id,
    'name', coalesce(v_mech.data->>'name', v_target_id),
    'email', coalesce(v_mech.data->>'email', ''),
    'role', coalesce(v_mech.data->>'role', 'mechanic'),
    'is_active', 'true',
    'created_at', v_waktu_wib,
    'revoked_at', '',
    'source', 'SUPABASE'
  );

  SELECT coalesce(max(baris), 100000) + 1 INTO v_baris FROM kmb.api_tokens WHERE baris >= 100000;
  INSERT INTO kmb.api_tokens (baris, nilai, data, sinkron_at)
  VALUES (
    v_baris,
    jsonb_build_array(v_token, v_target_id, coalesce(v_mech.data->>'email', ''), 'true', v_waktu_wib),
    v_tok_data,
    now()
  );

  INSERT INTO kmb.admin_tokens_supabase (token, mechanic_id, data, diubah_at)
  VALUES (v_token, v_target_id, v_tok_data, now())
  ON CONFLICT (token) DO UPDATE SET data = EXCLUDED.data, diubah_at = now();

  -- Audit log TANPA nilai token mentah (hanya md5 & samaran 4 karakter)
  INSERT INTO kmb.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END, 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', CASE WHEN v_mengganti THEN 'admin_token_ganti' ELSE 'admin_token_terbit' END,
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object(
        'nama', coalesce(v_mech.data->>'name', v_target_id),
        'mengganti_lama', v_mengganti,
        'token_md5', md5(v_token),
        'token_samaran', left(v_token, 4) || '…'
      )
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'token', v_token,
      'token_masked', left(v_token, 4) || '…',
      'mengganti_lama', v_mengganti,
      'rumah', 'kmbtra'
    )
  );

  INSERT INTO kmb.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.processed_ops),
    jsonb_build_array(v_op_id, 'admin_terbitkan_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_terbitkan_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_terbitkan_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text,
  p_token_baru  text DEFAULT '',
  p_ganti       boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_terbitkan_token_internal(
    v_auth->>'mechanic_id', p_op_id, p_mechanic_id, p_token_baru, p_ganti
  );
END;
$$;

-- ==============================================================================
-- 4. CABUT TOKEN (INTERNAL & BERTOKEN)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_cabut_token_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op_id       text := btrim(coalesce(p_op_id, ''));
  v_existing_op jsonb;
  v_target_id   text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_waktu_wib   text := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"');
  v_dicabut     int := 0;
  v_hasil       jsonb;
BEGIN
  IF v_op_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'op_id wajib untuk aksi tulis', 'source', 'SUPABASE');
  END IF;

  SELECT (data->'result_json') INTO v_existing_op
    FROM kmb.processed_ops
   WHERE trim(data->>'op_id') = v_op_id
   LIMIT 1;
  IF v_existing_op IS NOT NULL THEN
    RETURN v_existing_op::json;
  END IF;

  IF upper(btrim(coalesce(p_actor_id, ''))) = v_target_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Anda tidak bisa mencabut token Anda sendiri — Anda akan terkunci di luar.',
      'source', 'SUPABASE'
    );
  END IF;

  WITH updated AS (
    UPDATE kmb.api_tokens
       SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib, 'source', 'SUPABASE'),
           sinkron_at = now()
     WHERE upper(trim(data->>'mechanic_id')) = v_target_id
       AND (data->>'is_active' IS NULL OR lower(trim(data->>'is_active')) <> 'false')
       AND (data->>'revoked_at' IS NULL OR trim(data->>'revoked_at') = '')
    RETURNING baris, trim(data->>'token') AS token, data
  )
  SELECT count(*)::int INTO v_dicabut FROM updated;

  UPDATE kmb.admin_tokens_supabase
     SET data = data || jsonb_build_object('is_active', 'false', 'revoked_at', v_waktu_wib),
         diubah_at = now()
   WHERE upper(trim(mechanic_id)) = v_target_id;

  INSERT INTO kmb.audit_logs (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.audit_logs),
    jsonb_build_array(v_waktu_wib, coalesce(p_actor_id, 'ADMIN'), 'admin_token_cabut', 'mechanic', v_target_id),
    jsonb_build_object(
      'timestamp', v_waktu_wib,
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'action', 'admin_token_cabut',
      'entity_type', 'mechanic',
      'entity_id', v_target_id,
      'details', jsonb_build_object('dicabut', v_dicabut)
    ),
    now()
  );

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object(
      'mechanic_id', v_target_id,
      'dicabut', v_dicabut,
      'rumah', 'kmbtra'
    )
  );

  INSERT INTO kmb.processed_ops (baris, nilai, data, sinkron_at)
  VALUES (
    (SELECT coalesce(max(baris), 1) + 1 FROM kmb.processed_ops),
    jsonb_build_array(v_op_id, 'admin_cabut_token', coalesce(p_actor_id, 'ADMIN'), v_waktu_wib),
    jsonb_build_object(
      'op_id', v_op_id,
      'action', 'admin_cabut_token',
      'actor_id', coalesce(p_actor_id, 'ADMIN'),
      'processed_at', v_waktu_wib,
      'result_json', v_hasil
    ),
    now()
  );

  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_cabut_token_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb;
BEGIN
  v_auth := public._kmbtra_validasi_admin_token(p_token);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_cabut_token_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- Tutup fungsi internal dari publik/anon, hanya buka fungsi *_bertoken.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._kmbtra_validasi_admin_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_daftar_user_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_simpan_user_internal(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_terbitkan_token_internal(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_cabut_token_internal(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._kmbtra_validasi_admin_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_daftar_user_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_simpan_user_internal(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_terbitkan_token_internal(text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_cabut_token_internal(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.kmbtra_admin_daftar_user_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_simpan_user_bertoken(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_terbitkan_token_bertoken(text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_cabut_token_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. HAPUS PENGGUNA PERMANEN (DELETE CRUD) — Kamar `kmb`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_hapus_user_internal(
  p_actor_id    text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id text := upper(btrim(coalesce(p_mechanic_id, '')));
  v_op_id     text := btrim(coalesce(p_op_id, ''));
  v_dihapus   int := 0;
  v_hasil     jsonb;
BEGIN
  IF v_target_id = '' THEN
    RETURN json_build_object('success', false, 'error', 'mechanic_id wajib diisi', 'source', 'SUPABASE');
  END IF;
  IF v_target_id = upper(btrim(coalesce(p_actor_id, ''))) THEN
    RETURN json_build_object('success', false, 'error', 'Anda tidak bisa menghapus akun Anda sendiri.', 'source', 'SUPABASE');
  END IF;

  DELETE FROM kmb.api_tokens WHERE upper(trim(coalesce(data->>'mechanic_id', data->>'user_id', ''))) = v_target_id;
  DELETE FROM kmb.config_mechanics WHERE upper(trim(coalesce(data->>'mechanic_id', ''))) = v_target_id;
  GET DIAGNOSTICS v_dihapus = ROW_COUNT;

  v_hasil := jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'result', jsonb_build_object('mechanic_id', v_target_id, 'dihapus', v_dihapus, 'rumah', 'kmbtra')
  );
  RETURN v_hasil::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_hapus_user_bertoken(
  p_token       text,
  p_op_id       text,
  p_mechanic_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_hapus_user_internal(v_auth->>'mechanic_id', p_op_id, p_mechanic_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_hapus_user_internal(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_hapus_user_internal(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_hapus_user_bertoken(text, text, text) TO anon, authenticated, service_role;

-- ==============================================================================
-- 6. CRUD KONFIGURASI (UNITS, COMPONENTS, CATALOG JOBS, FACTORS) — Kamar `kmb`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public._kmbtra_admin_daftar_config_internal(p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_units   jsonb := '[]'::jsonb;
  v_comps   jsonb := '[]'::jsonb;
  v_jobs    jsonb := '[]'::jsonb;
  v_factors jsonb := '[]'::jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_code', coalesce(data->>'unit_id', data->>'unit_code', ''),
    'unit_name', coalesce(nullif(btrim(data->>'unit_name'), ''), data->>'unit_id', ''),
    'unit_model', coalesce(data->>'unit_model', data->>'model', ''),
    'section', coalesce(data->>'section', data->>'unit_type', 'field'),
    'unit_factor', coalesce(nullif(regexp_replace(coalesce(data->>'unit_factor', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'unit_id', '')), '[]'::jsonb)
  INTO v_units
  FROM kmb.config_units
  WHERE coalesce(data->>'unit_id', data->>'unit_code', '') <> '';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'component_id', coalesce(data->>'component_id', data->>'component_no', ''),
    'component_no', coalesce(data->>'component_no', data->>'component_id', ''),
    'component_name', coalesce(data->>'component_name', data->>'name', ''),
    'category', coalesce(data->>'category', data->>'section', 'General'),
    'section', coalesce(data->>'section', data->>'category', 'General'),
    'base_points', coalesce(nullif(regexp_replace(coalesce(data->>'base_points', data->>'base_point', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'target_hours', coalesce(nullif(regexp_replace(coalesce(data->>'target_hours', data->>'plan_hours', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'component_id', data->>'component_no', '')), '[]'::jsonb)
  INTO v_comps
  FROM kmb.config_components
  WHERE coalesce(data->>'component_id', data->>'component_no', '') <> '';

  
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'job_id', coalesce(data->>'job_id', data->>'component_id', ''),
    'section', coalesce(data->>'section', 'field'),
    'unit_model', coalesce(data->>'unit_model', ''),
    'component', coalesce(data->>'component', data->>'category', 'General'),
    'sub_component', coalesce(data->>'sub_component', 'Standard'),
    'job_description', coalesce(data->>'job_description', data->>'component_name', ''),
    'plan_hours', coalesce(nullif(regexp_replace(coalesce(data->>'plan_hours', data->>'target_hours', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'base_point', coalesce(nullif(regexp_replace(coalesce(data->>'base_point', data->>'base_points', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'job_type', coalesce(data->>'job_type', 'Preventive'),
    'status', upper(coalesce(data->>'status', 'ACTIVE'))
  ) ORDER BY coalesce(data->>'job_id', '')), '[]'::jsonb)
  INTO v_jobs
  FROM kmb.config_jobs_field;
  

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kunci', coalesce(data->>'factor_type', data->>'type', 'factor') || ':' || coalesce(data->>'key', data->>'factor_key', ''),
    'factor_type', coalesce(data->>'factor_type', data->>'type', 'work_condition'),
    'key', coalesce(data->>'key', data->>'factor_key', ''),
    'value', coalesce(nullif(regexp_replace(coalesce(data->>'value', ''), '[^0-9.-]', '', 'g'), '')::numeric, 1.0),
    'description', coalesce(data->>'description', '')
  ) ORDER BY coalesce(data->>'factor_type', data->>'type', ''), coalesce(data->>'key', '')), '[]'::jsonb)
  INTO v_factors
  FROM kmb.config_factors
  WHERE coalesce(data->>'key', data->>'factor_key', '') <> '';

  RETURN jsonb_build_object(
    'success', true,
    'source', 'SUPABASE',
    'rumah', 'kmbtra',
    'result', jsonb_build_object(
      'rumah', 'kmbtra',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    ),
    'data', jsonb_build_object(
      'rumah', 'kmbtra',
      'units', v_units,
      'components', v_comps,
      'jobs', v_jobs,
      'factors', v_factors
    )
  )::json;
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_daftar_config_bertoken(p_token text, p_jenis text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_daftar_config_internal(p_jenis);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmbtra_admin_simpan_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_payload  jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis text := lower(btrim(coalesce(p_jenis, '')));
  v_id    text;
  v_baris int;
  v_obj   jsonb;
  v_ft    text;
  v_fk    text;
BEGIN
  IF v_jenis IN ('unit', 'units') THEN
    v_id := upper(btrim(coalesce(p_payload->>'unit_id', p_payload->>'unit_code', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'Kode Unit (unit_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'unit_id', v_id,
      'unit_code', v_id,
      'unit_name', btrim(coalesce(nullif(p_payload->>'unit_name', ''), v_id)),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', p_payload->>'model', '')),
      'section', btrim(coalesce(p_payload->>'section', 'field')),
      'unit_type', btrim(coalesce(p_payload->>'section', 'UNIT')),
      'unit_factor', coalesce(nullif(p_payload->>'unit_factor', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM kmb.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_units SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_units WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_units (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'unit', 'id', v_id));

  ELSIF v_jenis IN ('component', 'components') THEN
    v_id := upper(btrim(coalesce(p_payload->>'component_id', p_payload->>'component_no', '')));
    IF v_id = '' THEN
      RETURN json_build_object('success', false, 'error', 'ID Komponen (component_id) wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'component_id', v_id,
      'component_no', v_id,
      'component_name', btrim(coalesce(nullif(p_payload->>'component_name', ''), nullif(p_payload->>'name', ''), v_id)),
      'category', btrim(coalesce(p_payload->>'category', p_payload->>'section', 'General')),
      'base_points', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_points', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'target_hours', '')::numeric, 1.0),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE')))
    );
    SELECT baris INTO v_baris FROM kmb.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_components SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_components WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_components (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'component', 'id', v_id));

  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    v_id := upper(btrim(coalesce(p_payload->>'job_id', '')));
    IF v_id = '' THEN
      v_id := 'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;
    v_obj := jsonb_build_object(
      'job_id', v_id,
      'component_id', v_id,
      'component_no', v_id,
      'section', lower(btrim(coalesce(nullif(p_payload->>'section', ''), 'field'))),
      'unit_model', btrim(coalesce(p_payload->>'unit_model', '')),
      'component', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'category', btrim(coalesce(nullif(p_payload->>'component', ''), 'General')),
      'sub_component', btrim(coalesce(nullif(p_payload->>'sub_component', ''), 'Standard')),
      'job_description', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'component_name', btrim(coalesce(nullif(p_payload->>'job_description', ''), v_id)),
      'plan_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'target_hours', coalesce(nullif(p_payload->>'plan_hours', '')::numeric, 1.0),
      'base_point', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'base_points', coalesce(nullif(p_payload->>'base_point', '')::numeric, 1.0),
      'job_type', btrim(coalesce(nullif(p_payload->>'job_type', ''), 'Preventive')),
      'status', upper(btrim(coalesce(p_payload->>'status', 'ACTIVE'))),
      'is_active', 'TRUE'
    );
    
    SELECT baris INTO v_baris FROM kmb.config_jobs_field WHERE upper(btrim(coalesce(data->>'job_id', data->>'component_id', ''))) = v_id LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_jobs_field SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_jobs_field WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_jobs_field (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_id), v_obj, now());
    END IF;
    
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'job', 'id', v_id));

  ELSIF v_jenis IN ('factor', 'factors') THEN
    v_ft := lower(btrim(coalesce(p_payload->>'factor_type', p_payload->>'type', 'work_condition')));
    v_fk := lower(btrim(coalesce(p_payload->>'key', '')));
    IF v_fk = '' THEN
      RETURN json_build_object('success', false, 'error', 'Key faktor wajib diisi', 'source', 'SUPABASE');
    END IF;
    v_obj := jsonb_build_object(
      'factor_type', v_ft,
      'type', v_ft,
      'key', v_fk,
      'factor_key', v_fk,
      'value', coalesce(nullif(p_payload->>'value', '')::numeric, 1.0),
      'description', btrim(coalesce(p_payload->>'description', ''))
    );
    SELECT baris INTO v_baris
      FROM kmb.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) = v_ft
       AND lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = v_fk
     LIMIT 1;
    IF v_baris IS NOT NULL THEN
      UPDATE kmb.config_factors SET data = data || v_obj, sinkron_at = now() WHERE baris = v_baris;
    ELSE
      SELECT coalesce(min(baris), 0) - 1 INTO v_baris FROM kmb.config_factors WHERE baris < 0;
      IF v_baris IS NULL OR v_baris >= 0 THEN v_baris := -1; END IF;
      INSERT INTO kmb.config_factors (baris, nilai, data, sinkron_at) VALUES (v_baris, jsonb_build_array(v_ft, v_fk), v_obj, now());
    END IF;
    RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', 'factor', 'id', v_ft || ':' || v_fk));
  END IF;

  RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_simpan_config_bertoken(
  p_token   text,
  p_op_id   text,
  p_jenis   text,
  p_payload jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_simpan_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._kmbtra_admin_hapus_config_internal(
  p_actor_id text,
  p_op_id    text,
  p_jenis    text,
  p_kunci    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jenis   text := lower(btrim(coalesce(p_jenis, '')));
  v_kunci   text := btrim(coalesce(p_kunci, ''));
  v_dihapus int := 0;
BEGIN
  IF v_kunci = '' THEN
    RETURN json_build_object('success', false, 'error', 'Kunci item wajib diisi', 'source', 'SUPABASE');
  END IF;

  IF v_jenis IN ('unit', 'units') THEN
    DELETE FROM kmb.config_units WHERE upper(btrim(coalesce(data->>'unit_id', data->>'unit_code', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('component', 'components') THEN
    DELETE FROM kmb.config_components WHERE upper(btrim(coalesce(data->>'component_id', data->>'component_no', ''))) = upper(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('job', 'jobs', 'catalog_job') THEN
    
    DELETE FROM kmb.config_jobs_field WHERE upper(btrim(coalesce(data->>'job_id', data->>'component_id', ''))) = upper(v_kunci);
    
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSIF v_jenis IN ('factor', 'factors') THEN
    DELETE FROM kmb.config_factors
     WHERE lower(btrim(coalesce(data->>'factor_type', data->>'type', ''))) || ':' || lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci)
        OR lower(btrim(coalesce(data->>'key', data->>'factor_key', ''))) = lower(v_kunci);
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Jenis config tidak dikenal: ' || v_jenis, 'source', 'SUPABASE');
  END IF;

  RETURN json_build_object('success', true, 'source', 'SUPABASE', 'result', json_build_object('jenis', v_jenis, 'kunci', v_kunci, 'dihapus', v_dihapus));
END;
$$;

CREATE OR REPLACE FUNCTION public.kmbtra_admin_hapus_config_bertoken(
  p_token text,
  p_op_id text,
  p_jenis text,
  p_kunci text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth jsonb := public._kmbtra_validasi_admin_token(p_token);
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  RETURN public._kmbtra_admin_hapus_config_internal(v_auth->>'mechanic_id', p_op_id, p_jenis, p_kunci);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_daftar_config_internal(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_simpan_config_internal(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._kmbtra_admin_hapus_config_internal(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_daftar_config_internal(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_simpan_config_internal(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._kmbtra_admin_hapus_config_internal(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_daftar_config_bertoken(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_simpan_config_bertoken(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_admin_hapus_config_bertoken(text, text, text, text) TO anon, authenticated, service_role;