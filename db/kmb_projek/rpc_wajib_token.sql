-- ==============================================================================
-- BUG #13 (28 Okt 2026): RPC BACA KMB PROJECT WAJIB TOKEN, SAMA SEPERTI GAS
-- Lihat docs/BUG-DICATAT.md #13.
-- ==============================================================================
--
-- Masalah: kmb_create_refs(), kmb_monitoring(), kmb_my_wos(text), dan
-- kmb_wos_by_status(text) bisa dipanggil siapa saja yang memegang kunci anon
-- publik, tanpa token. kmb_monitoring() bahkan mengembalikan token semua mekanik.
-- Di GAS, aksi yang setara menolak token palsu ("Token tidak dikenal / nonaktif").
--
-- Perbaikan, tanpa mengubah isi keempat fungsi itu:
--   1. Keempatnya tidak bisa lagi dipanggil langsung oleh anon/authenticated.
--   2. Pintu masuknya pembungkus *_bertoken. Pembungkus memeriksa token di
--      kmb_projek.api_tokens (status ACTIVE) lalu memanggil fungsi aslinya.
--   3. kmb_my_wos_bertoken mengambil identitas mekanik dari token, sama seperti
--      GAS, bukan dari parameter yang bisa diisi siapa saja.
--
-- Jalankan sesudah rpc_baca.sql dan migration_20261028_drop_golongan.sql.
-- Aman dijalankan berkali-kali. Worker sudah memanggil *_bertoken.

-- 1. Tutup akses langsung
REVOKE EXECUTE ON FUNCTION public.kmb_create_refs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_monitoring() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_my_wos(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kmb_wos_by_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kmb_create_refs() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_monitoring() TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status(text) TO service_role;

-- 2. Pembungkus bertoken
CREATE OR REPLACE FUNCTION public.kmb_create_refs_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM kmb_projek.api_tokens t
         WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;
    RETURN public.kmb_create_refs();
END;
$$;

-- Di GAS (cek 28 Okt): supervisor menerima daftar 20 mekanik beserta tokennya,
-- sedangkan token mekanik (MECH-003) menerima daftar kosong. Pembungkus ini
-- meniru itu. Kalau uji kembar dengan mekanik yang punya baris di Config_Mechanics
-- menunjukkan GAS memberi baris dirinya sendiri, sesuaikan di sini.
-- kmb_monitoring_bertoken: definisinya pindah ke db/bersama/monitoring_bertoken.sql (gerbang peran seperti GAS, 14 Nov 2026).

CREATE OR REPLACE FUNCTION public.kmb_my_wos_bertoken(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id text;
BEGIN
    SELECT t.user_id INTO v_user_id
      FROM kmb_projek.api_tokens t
     WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
     LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;
    RETURN public.kmb_my_wos(v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kmb_wos_by_status_bertoken(p_token text, p_status text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kmb_projek, pg_temp
AS $$
DECLARE
    v_user record;
    v_wos json;
BEGIN
    SELECT t.token, coalesce(t.role, 'mechanic') as role, t.name, t.user_id as mechanic_id
      INTO v_user
      FROM kmb_projek.api_tokens t
     WHERE t.token = btrim(coalesce(p_token, '')) AND t.status = 'ACTIVE'
     LIMIT 1;

    IF v_user.token IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Token tidak dikenal / nonaktif', 'source', 'SUPABASE');
    END IF;

    SELECT coalesce(json_agg(json_build_object(
        'id', coalesce(w.data->>'id', w.wo_number),
        'wo_id', coalesce(w.data->>'id', w.wo_number),
        'wo_number', w.wo_number,
        'date', w.date::text,
        'shift', coalesce(w.shift, '1'),
        'unit_code', w.unit_code,
        'unit_id', w.unit_code,
        'component', w.component,
        'component_name', w.component,
        'activity', w.activity,
        'duration_hours', coalesce(w.duration_hours, 0),
        'status', w.status,
        'points', coalesce(w.points, 0),
        'lead_mechanic_id', w.lead_mechanic_id,
        'created_at', w.created_at,
        'created_at_str', to_char(w.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI'),
        'data', w.data
    ) ORDER BY w.created_at DESC), '[]'::json)
    INTO v_wos
    FROM kmb_projek.work_orders w
    WHERE (
        (p_status = 'pending' AND (
            (v_user.role = 'supervisor' AND w.status IN ('pending_supervisor', 'pending_l1', 'PENDING_L1')) OR
            (v_user.role = 'superintendent' AND w.status IN ('pending_superintendent', 'pending_l2', 'PENDING_L2')) OR
            (v_user.role NOT IN ('supervisor', 'superintendent') AND (w.status LIKE 'PENDING%' OR w.status IN ('pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2')))
        )) OR
        (p_status = 'active' AND w.status IN ('assigned', 'in_progress', 'draft', 'ACTIVE', 'IN_PROGRESS', 'OPEN')) OR
        (p_status = 'approved' AND w.status IN ('approved', 'APPROVED')) OR
        (p_status = 'rejected' AND w.status IN ('rejected', 'REJECTED')) OR
        (w.status = p_status)
    );

    RETURN json_build_object(
        'success', true,
        'source', 'SUPABASE',
        'result', json_build_object(
            'wos', v_wos,
            p_status, v_wos,
            'pulled_at', to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SSOF')
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kmb_create_refs_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_my_wos_bertoken(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kmb_wos_by_status_bertoken(text, text) TO anon, authenticated, service_role;
