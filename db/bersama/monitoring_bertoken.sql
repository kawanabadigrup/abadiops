-- =============================================================================
-- Monitoring bertoken ketiga rumah: gerbang peran dan lingkup section seperti GAS.
-- SATU-SATUNYA tempat definisi sum_monitoring_bertoken, kmbtra_monitoring_bertoken, dan
-- kmb_monitoring_bertoken (14 Nov 2026). Definisi lama di file lain sudah dibuang.
--
-- Butir 6 daftar serah-terima 13 Nov: jawaban monitoring memuat TOKEN setiap mekanik, dan token
-- adalah identitas. Siapa pun yang memegangnya bisa bertindak sebagai mekanik itu.
--
-- Aturan GAS yang ditiru:
-- * SUM V2 (ApiService.js, pull_monitoring): DAFTAR-IZIN, hanya supervisor dan superintendent.
--   Peran lain, termasuk peran kosong atau tak terbaca, ditolak dengan 'Monitoring hanya untuk L1 dan L2.'
--   Peran diambil dari Config_Mechanics berdasarkan email (_resolveToken).
-- * KMB V2 dan KMB Project (MechanicService.js, getMonitoringData): mekanik mendapat daftar kosong.
--   Peran lain hanya melihat mekanik dalam lingkup section-nya (getUserSectionScope + userScopeAllows):
--   section penonton boleh daftar berkoma, kosong berarti semua (HO), dan mekanik tanpa section selalu terlihat.
--
-- Belum 1:1 (dicatat di docs/PROGRES.md): angka ringkasan (overall) KMB belum dibatasi lingkup section,
-- akun uji belum disaring (saringOrangUji), dan WO arsip belum ikut dihitung.
-- Aman dijalankan ulang.
-- =============================================================================

-- Lingkup section penonton: 'field, tyreman' -> {field,tyreman}; kosong -> NULL (= semua).
CREATE OR REPLACE FUNCTION public._lingkup_section(p_section text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(array(
    SELECT lower(btrim(s)) FROM unnest(string_to_array(coalesce(p_section, ''), ',')) AS s WHERE btrim(s) <> ''
  ), '{}'::text[]);
$$;

-- true bila lingkup (NULL = semua) mengizinkan section. Section berkoma lolos bila salah satunya masuk lingkup.
CREATE OR REPLACE FUNCTION public._lingkup_section_boleh(p_lingkup text[], p_section text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_lingkup IS NULL
      OR nullif(btrim(coalesce(p_section, '')), '') IS NULL
      OR EXISTS (
           SELECT 1 FROM unnest(string_to_array(lower(p_section), ',')) AS s
            WHERE btrim(s) <> '' AND btrim(s) = ANY (p_lingkup)
         );
$$;

-- ── SUM V2 ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sum_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user record;
    v_total_mechs int;
    v_pending_work int;
    v_expired int;
    v_pending_l1 int;
    v_pending_l2 int;
    v_approved int;
    v_mechs json;
BEGIN
    -- Validasi token. Peran diambil dari Config_Mechanics berdasarkan email, seperti _resolveToken GAS SUM V2.
    SELECT t.data->>'mechanic_id' as mechanic_id,
           lower(btrim(coalesce(m.data->>'role', ''))) as role
      INTO v_user
      FROM sum.api_tokens t
      LEFT JOIN sum.config_mechanics m
        ON lower(trim(t.data->>'email')) = lower(trim(m.data->>'email'))
     WHERE trim(t.data->>'token') = trim(p_token)
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif');
    END IF;

    -- Gerbang DAFTAR-IZIN seperti pull_monitoring GAS SUM V2: jawaban ini memuat token setiap mekanik,
    -- jadi hanya L1 (supervisor) dan L2 (superintendent). Peran lain, kosong, atau tak terbaca ditolak.
    IF v_user.role NOT IN ('supervisor', 'superintendent') THEN
        RETURN json_build_object('success', false, 'error', 'Monitoring hanya untuk L1 dan L2.');
    END IF;

    -- Hitung total mekanik aktif
    SELECT count(*)::int INTO v_total_mechs
      FROM sum.config_mechanics
     WHERE (data->>'status' IS NULL OR lower(btrim(data->>'status')) = 'active')
       AND lower(btrim(coalesce(data->>'role', 'mechanic'))) = 'mechanic';

    -- Agregat status WO dari tabel cermin sum.work_orders
    SELECT
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) IN ('open', 'active', 'assigned', 'in_progress', 'pending_mechanic_work')), 0)::int,
        coalesce(count(*) filter (WHERE upper(coalesce(data->>'status', '')) = 'EXPIRED'), 0)::int,
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) IN ('pending_l1', 'pending_supervisor')), 0)::int,
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) IN ('pending_l2', 'pending_superintendent')), 0)::int,
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) = 'approved'), 0)::int
      INTO v_pending_work, v_expired, v_pending_l1, v_pending_l2, v_approved
      FROM sum.work_orders;

    -- Ringkasan per mekanik
    WITH per_mech AS (
        SELECT m.data->>'mechanic_id' as mechanic_id,
               coalesce(nullif(m.data->>'mechanic_name', ''), nullif(m.data->>'name', ''), m.data->>'mechanic_id') as name,
               coalesce(m.data->>'jabatan_aktual', '') as jabatan,
               coalesce(nullif(max(t.data->>'token'), ''), '') as token,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) IN ('open', 'active', 'assigned', 'in_progress', 'pending_mechanic_work')), 0)::int as pending_work,
               coalesce(count(w.baris) filter (WHERE upper(coalesce(w.data->>'status', '')) = 'EXPIRED'), 0)::int as expired,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) IN ('pending_l1', 'pending_supervisor')), 0)::int as pending_l1,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) IN ('pending_l2', 'pending_superintendent')), 0)::int as pending_l2,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) = 'approved'), 0)::int as approved
          FROM sum.config_mechanics m
          LEFT JOIN sum.api_tokens t
            ON lower(trim(t.data->>'mechanic_id')) = lower(trim(m.data->>'mechanic_id'))
           AND (t.data->>'is_active' IS NULL OR lower(trim(t.data->>'is_active')) <> 'false')
          LEFT JOIN sum.work_orders w
            ON lower(trim(w.data->>'lead_mechanic_id')) = lower(trim(m.data->>'mechanic_id'))
            OR EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'team') = 'array' THEN w.data->'team' ELSE '[]'::jsonb END) member
                 WHERE lower(trim(coalesce(member->>'mechanic_id', member->>'id', ''))) = lower(trim(m.data->>'mechanic_id'))
            )
         WHERE (m.data->>'status' IS NULL OR lower(btrim(m.data->>'status')) = 'active')
           AND lower(btrim(coalesce(m.data->>'role', 'mechanic'))) = 'mechanic'
         GROUP BY m.data->>'mechanic_id',
                  coalesce(nullif(m.data->>'mechanic_name', ''), nullif(m.data->>'name', ''), m.data->>'mechanic_id'),
                  m.data->>'jabatan_aktual'
    )
    SELECT coalesce(json_agg(json_build_object(
        'mechanic_id', mechanic_id,
        'name', name,
        'jabatan', jabatan,
        'token', token,
        'has_token', token <> '',
        'pending_work', pending_work,
        'expired', expired,
        'pending_l1', pending_l1,
        'pending_l2', pending_l2,
        'approved', approved
    ) ORDER BY name), '[]'::json)
    INTO v_mechs
    FROM per_mech;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'overall', json_build_object(
                'mechanics', v_total_mechs,
                'pending_mechanic_work', v_pending_work,
                'expired', v_expired,
                'pending_l1', v_pending_l1,
                'pending_l2', v_pending_l2,
                'approved', v_approved
            ),
            'mechanics', v_mechs,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$
;

-- ── KMB TRA (KMB V2) ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kmbtra_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user record;
    v_total_mechs int;
    v_pending_work int;
    v_pending_l1 int;
    v_pending_l2 int;
    v_approved int;
    v_mechs json;
    v_lingkup text[];
BEGIN
    -- Validasi token
    SELECT t.data->>'mechanic_id' as mechanic_id,
           coalesce(m.data->>'role', 'mechanic') as role,
           m.data->>'section' as section
      INTO v_user
      FROM kmb.api_tokens t
      LEFT JOIN kmb.config_mechanics m
        ON lower(trim(t.data->>'email')) = lower(trim(m.data->>'email'))
        OR trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
     WHERE trim(t.data->>'token') = trim(p_token)
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF v_user.role IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif');
    END IF;

    -- Lingkup section penonton seperti getUserSectionScope GAS KMB V2: kosong berarti semua (HO).
    v_lingkup := public._lingkup_section(v_user.section);

    -- Hitung total mekanik aktif
    SELECT count(*)::int INTO v_total_mechs
      FROM kmb.config_mechanics
     WHERE (data->>'status' IS NULL OR lower(btrim(data->>'status')) = 'active')
       AND lower(btrim(coalesce(data->>'role', 'mechanic'))) = 'mechanic';

    -- Agregat status WO dari tabel cermin kmb.work_orders
    SELECT
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) IN ('open', 'active', 'assigned', 'in_progress', 'pending_mechanic_work')), 0)::int,
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) IN ('pending_l1', 'pending_supervisor')), 0)::int,
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) IN ('pending_l2', 'pending_superintendent')), 0)::int,
        coalesce(count(*) filter (WHERE lower(coalesce(data->>'status', '')) = 'approved'), 0)::int
      INTO v_pending_work, v_pending_l1, v_pending_l2, v_approved
      FROM kmb.work_orders;

    -- Ringkasan per mekanik
    WITH per_mech AS (
        SELECT m.baris as id,
               m.data->>'mechanic_id' as mechanic_id,
               m.data->>'name' as name,
               coalesce(m.data->>'section', '') as section,
               coalesce(m.data->>'jabatan', m.data->>'position', '') as jabatan,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) IN ('open', 'active', 'assigned', 'in_progress', 'pending_mechanic_work')), 0)::int as pending_work,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) IN ('pending_l1', 'pending_supervisor')), 0)::int as pending_l1,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) IN ('pending_l2', 'pending_superintendent')), 0)::int as pending_l2,
               coalesce(count(w.baris) filter (WHERE lower(coalesce(w.data->>'status', '')) = 'approved'), 0)::int as approved
          FROM kmb.config_mechanics m
          LEFT JOIN kmb.work_orders w
            ON lower(trim(w.data->>'lead_mechanic_id')) = lower(trim(m.data->>'mechanic_id'))
            OR EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(w.data->'team') = 'array' THEN w.data->'team' ELSE '[]'::jsonb END) member
                 WHERE lower(trim(coalesce(member->>'mechanic_id', member->>'id', ''))) = lower(trim(m.data->>'mechanic_id'))
            )
         WHERE (m.data->>'status' IS NULL OR lower(btrim(m.data->>'status')) = 'active')
           AND lower(btrim(coalesce(m.data->>'role', 'mechanic'))) = 'mechanic'
           -- Daftar ini memuat token setiap mekanik: hanya mekanik dalam lingkup section penonton (userScopeAllows).
           AND public._lingkup_section_boleh(v_lingkup, m.data->>'section')
         GROUP BY m.baris, m.data->>'mechanic_id', m.data->>'name', m.data->>'section', m.data->>'jabatan', m.data->>'position'
    )
     SELECT coalesce(json_agg(json_build_object(
         'id', pm.id,
         'mechanic_id', pm.mechanic_id,
         'name', coalesce(pm.name, pm.mechanic_id),
         'section', pm.section,
         'jabatan', pm.jabatan,
         'pending_mechanic_work', pm.pending_work,
         'pending_l1', pm.pending_l1,
         'pending_l2', pm.pending_l2,
         'approved', pm.approved,
         'has_token', (t.token IS NOT NULL),
         'token', t.token
     ) ORDER BY coalesce(pm.name, pm.mechanic_id)), '[]'::json)
    INTO v_mechs
    FROM per_mech pm
    LEFT JOIN LATERAL (
        SELECT at.data->>'token' as token
          FROM kmb.api_tokens at
         WHERE trim(at.data->>'mechanic_id') = trim(pm.mechanic_id)
           AND (at.data->>'is_active' IS NULL OR at.data->>'is_active' <> 'false')
         ORDER BY at.baris DESC
         LIMIT 1
    ) t ON true;

    -- Jika yang memanggil hanya mekanik biasa, sembunyikan daftar mekanik lain (privasi)
    IF lower(coalesce(v_user.role, 'mechanic')) = 'mechanic' THEN
        v_mechs := '[]'::json;
    END IF;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'overall', json_build_object(
                'mechanics', v_total_mechs,
                'pending_mechanic_work', v_pending_work,
                'pending_l1', v_pending_l1,
                'pending_l2', v_pending_l2,
                'approved', v_approved
            ),
            'mechanics', v_mechs,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$
;

-- ── KMB Project ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kmb_monitoring_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth  jsonb := kmb_projek._validasi_token_aktif(p_token);
  v_hasil jsonb;
  v_lingkup text[];
BEGIN
  IF NOT coalesce((v_auth->>'ok')::boolean, false) THEN
    RETURN json_build_object('success', false, 'error', v_auth->>'error', 'source', 'SUPABASE');
  END IF;
  v_hasil := public.kmb_monitoring()::jsonb;
  IF (v_hasil #> '{result,mechanics}') IS NOT NULL THEN
    IF lower(coalesce(v_auth->>'role', 'mechanic')) = 'mechanic' THEN
      v_hasil := jsonb_set(v_hasil, '{result,mechanics}', '[]'::jsonb);
    ELSE
      -- Daftar ini memuat token setiap mekanik: hanya mekanik dalam lingkup section penonton, seperti
      -- getUserSectionScope + userScopeAllows GAS KMB Project. Section penonton dibaca dari Config_Mechanics,
      -- bukan dari v_auth->>'section' yang diisi 'maintenance' bila kosong (di GAS kosong berarti semua).
      -- to_jsonb dipakai supaya jalan untuk tabel bentuk lama (kolom) maupun cermin mentah (data jsonb).
      SELECT public._lingkup_section(coalesce(r.j->'data', r.j)->>'section') INTO v_lingkup
        FROM (SELECT to_jsonb(m) AS j FROM kmb_projek.config_mechanics m) r
       WHERE upper(btrim(coalesce(r.j->'data', r.j)->>'mechanic_id')) = upper(btrim(coalesce(v_auth->>'mechanic_id', '')))
       LIMIT 1;
      v_hasil := jsonb_set(v_hasil, '{result,mechanics}', coalesce((
        SELECT jsonb_agg(e.x ORDER BY e.urut)
          FROM jsonb_array_elements(v_hasil #> '{result,mechanics}') WITH ORDINALITY AS e(x, urut)
         WHERE public._lingkup_section_boleh(v_lingkup, e.x->>'section')
      ), '[]'::jsonb));
    END IF;
  END IF;
  RETURN v_hasil::json;
END;
$$
;

REVOKE EXECUTE ON FUNCTION public._lingkup_section(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._lingkup_section_boleh(text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lingkup_section(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._lingkup_section_boleh(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sum_monitoring_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_monitoring_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring_bertoken(text) TO anon, authenticated, service_role;
