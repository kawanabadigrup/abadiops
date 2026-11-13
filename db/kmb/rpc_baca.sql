-- ==============================================================================
-- FUNGSI RPC BACA SUPABASE UNTUK RUMAH KMB V2 / TRA (Skema `kmb`)
-- Sesuai Tahap 4: Aksi Baca Cermin Langsung dari kmb
-- Berdasarkan db/kmb/cermin_sheet.sql
-- Diperbarui: 30 Okt 2026 (Perbaikan Bug #22: Wajib Token & Faktor Dinamis 1:1 GAS)
-- ==============================================================================

-- 1. RPC kmbtra_ping: Resolusi token instan KMB V2
CREATE OR REPLACE FUNCTION public.kmbtra_ping(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user record;
BEGIN
    SELECT t.data->>'token' as token,
           coalesce(m.data->>'role', 'mechanic') as role,
           coalesce(m.data->>'mechanic_name', m.data->>'name', t.data->>'mechanic_id', '') as name,
           coalesce(t.data->>'mechanic_id', t.data->>'user_id', m.data->>'mechanic_id') as mechanic_id,
           coalesce(m.data->>'email', t.data->>'email', '') as email,
           coalesce(m.data->>'section', '') as section
      INTO v_user
      FROM kmb.api_tokens t
      LEFT JOIN kmb.config_mechanics m 
        ON lower(trim(t.data->>'email')) = lower(trim(m.data->>'email'))
        OR trim(t.data->>'mechanic_id') = trim(m.data->>'mechanic_id')
     WHERE trim(t.data->>'token') = trim(p_token)
       AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
     LIMIT 1;

    IF v_user.token IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'result', json_build_object(
            'mechanic_id', coalesce(v_user.mechanic_id, ''),
            'name', coalesce(v_user.name, ''),
            'role', coalesce(v_user.role, 'mechanic'),
            'email', coalesce(v_user.email, ''),
            'section', coalesce(v_user.section, ''),
            'tenant_code', 'KMB',
            'rumah', 'kmbtra'
        ),
        'source', 'SUPABASE'
    );
END;
$$;

-- 2. Fungsi Internal: Katalog unit, komponen, mekanik KMB V2 (Tidak boleh dipanggil langsung)
CREATE OR REPLACE FUNCTION public._kmbtra_create_refs_internal()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_units json;
    v_comps json;
    v_jobs json;
    v_mechs json;
    v_factors json;
    v_f_normal numeric := 1.0;
    v_f_difficult numeric := 1.1;
    v_f_extreme numeric := 1.2;
BEGIN
    -- Units
    SELECT coalesce(json_agg(json_build_object(
        'unit_id', coalesce(data->>'unit_id', data->>'unit_code'),
        'unit_name', coalesce(nullif(data->>'unit_name', ''), nullif(data->>'unit_model', ''), nullif(data->>'model', ''), data->>'unit_id', data->>'unit_code', ''),
        'unit_type', coalesce(data->>'unit_type', data->>'type', ''),
        'unit_factor', coalesce(nullif(data->>'unit_factor', '')::numeric, 1.0),
        'status', coalesce(data->>'status', 'ACTIVE')
    ) ORDER BY data->>'unit_id'), '[]'::json)
    INTO v_units
    FROM kmb.config_units
    WHERE data->>'status' IS NULL OR lower(btrim(data->>'status')) = 'active';

    -- Components
    SELECT coalesce(json_agg(json_build_object(
        'component_no', coalesce(data->>'component_no', data->>'component_id'),
        'component_id', coalesce(data->>'component_id', data->>'component_no'),
        'component_name', coalesce(data->>'component_name', data->>'component', data->>'activity', ''),
        'category', coalesce(data->>'category', ''),
        'base_points', coalesce(nullif(data->>'base_points', '')::numeric, nullif(data->>'base_point', '')::numeric, 0),
        'base_point', coalesce(nullif(data->>'base_point', '')::numeric, nullif(data->>'base_points', '')::numeric, 0),
        'target_hours', coalesce(nullif(data->>'target_hours', '')::numeric, 0),
        'status', coalesce(data->>'status', 'ACTIVE')
    ) ORDER BY data->>'component_name'), '[]'::json)
    INTO v_comps
    FROM kmb.config_components
    WHERE data->>'status' IS NULL OR lower(btrim(data->>'status')) = 'active';

    -- Katalog cascade KMB. Jika sheet job khusus belum dicermin, bentuk
    -- satu job generik per komponen agar form tetap dapat dipakai.
    SELECT coalesce(json_agg(json_build_object(
        'job_id', coalesce(data->>'component_id', data->>'component_no'),
        'unit_model', '',
        'component', coalesce(data->>'component_name', data->>'component', data->>'activity', data->>'component_id'),
        'sub_component', 'Standard',
        'job_description', coalesce(data->>'component_name', data->>'component', data->>'activity', data->>'component_id'),
        'plan_hours', coalesce(nullif(data->>'target_hours', '')::numeric, 2.0),
        'target_hours', coalesce(nullif(data->>'target_hours', '')::numeric, 2.0),
        'base_point', coalesce(nullif(data->>'base_points', '')::numeric, nullif(data->>'base_point', '')::numeric, 1.0),
        'base_points', coalesce(nullif(data->>'base_points', '')::numeric, nullif(data->>'base_point', '')::numeric, 1.0)
    ) ORDER BY data->>'component_name'), '[]'::json)
    INTO v_jobs
    FROM kmb.config_components
    WHERE data->>'status' IS NULL OR lower(btrim(data->>'status')) = 'active';

    -- Mechanics (role = mechanic)
    SELECT coalesce(json_agg(json_build_object(
        'mechanic_id', data->>'mechanic_id',
        'mechanic_name', coalesce(data->>'mechanic_name', data->>'name', data->>'mechanic_id'),
        'name', coalesce(data->>'name', data->>'mechanic_name', data->>'mechanic_id'),
        'email', coalesce(data->>'email', ''),
        'section', coalesce(data->>'section', '')
    ) ORDER BY data->>'name'), '[]'::json)
    INTO v_mechs
    FROM kmb.config_mechanics
    WHERE (data->>'status' IS NULL OR lower(btrim(data->>'status')) = 'active')
      AND lower(btrim(coalesce(data->>'role', 'mechanic'))) = 'mechanic';

    -- Factors
    SELECT coalesce(json_agg(json_build_object(
        'factor_type', coalesce(data->>'factor_type', data->>'type', ''),
        'key', data->>'key',
        'value', (data->>'value')::numeric
    )), '[]'::json)
    INTO v_factors
    FROM kmb.config_factors;

    -- Work Conditions dinamis dari cermin config_factors (Bug #22, 1:1 GAS KMB TRA getWorkConditionOptionsForView)
    SELECT coalesce((data->>'value')::numeric, 1.0) INTO v_f_normal
      FROM kmb.config_factors
     WHERE (lower(btrim(data->>'factor_type')) = 'work_condition' OR lower(btrim(data->>'type')) = 'work_condition')
       AND (lower(btrim(data->>'key')) = 'normal' OR lower(btrim(data->>'factor_key')) = 'normal')
     LIMIT 1;

    SELECT coalesce((data->>'value')::numeric, 1.1) INTO v_f_difficult
      FROM kmb.config_factors
     WHERE (lower(btrim(data->>'factor_type')) = 'work_condition' OR lower(btrim(data->>'type')) = 'work_condition')
       AND (lower(btrim(data->>'key')) = 'difficult' OR lower(btrim(data->>'factor_key')) = 'difficult')
     LIMIT 1;

    SELECT coalesce((data->>'value')::numeric, 1.2) INTO v_f_extreme
      FROM kmb.config_factors
     WHERE (lower(btrim(data->>'factor_type')) = 'work_condition' OR lower(btrim(data->>'type')) = 'work_condition')
       AND (lower(btrim(data->>'key')) = 'extreme' OR lower(btrim(data->>'factor_key')) = 'extreme')
     LIMIT 1;

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'units', v_units,
            'components', v_comps,
            'jobs_field', v_jobs,
            'jobs_workshop', v_jobs,
            'jobs_vessel', v_jobs,
            'mechanics', v_mechs,
            'factors', v_factors,
            'work_conditions', json_build_array(
                json_build_object('key', 'normal', 'label', 'Shift 1', 'factor', coalesce(v_f_normal, 1.0)),
                json_build_object('key', 'difficult', 'label', 'Shift 2', 'factor', coalesce(v_f_difficult, 1.1)),
                json_build_object('key', 'extreme', 'label', 'Kondisi Ekstrim', 'factor', coalesce(v_f_extreme, 1.2))
            ),
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

-- 2b. Pembungkus Bertoken Publik: kmbtra_create_refs_bertoken (Wajib Token Sah, Bug #22)
CREATE OR REPLACE FUNCTION public.kmbtra_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM kmb.api_tokens t
         WHERE trim(t.data->>'token') = btrim(coalesce(p_token, ''))
           AND (t.data->>'is_active' IS NULL OR t.data->>'is_active' <> 'false')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'result', null,
            'error', 'Token tidak dikenal / nonaktif',
            'source', 'SUPABASE'
        );
    END IF;

    RETURN public._kmbtra_create_refs_internal();
END;
$$;

-- Alias backward compatibility (diproteksi hanya untuk service_role)
CREATE OR REPLACE FUNCTION public.kmbtra_create_refs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN public._kmbtra_create_refs_internal();
END;
$$;

-- 3. RPC kmbtra_monitoring_bertoken: KPI Monitoring Pengawas KMB V2
-- kmbtra_monitoring_bertoken: definisinya pindah ke db/bersama/monitoring_bertoken.sql (gerbang peran seperti GAS, 14 Nov 2026).

-- ==============================================================================
-- HAK AKSES PERIZINAN (Bug #13 & Bug #22)
-- Tutup fungsi tanpa token dari publik/anon, hanya buka fungsi bertoken.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public._kmbtra_create_refs_internal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmbtra_create_refs() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._kmbtra_create_refs_internal() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_create_refs() TO service_role;

GRANT EXECUTE ON FUNCTION public.kmbtra_ping(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmbtra_create_refs_bertoken(text) TO anon, authenticated, service_role;
