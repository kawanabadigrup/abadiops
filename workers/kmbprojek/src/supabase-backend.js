/**
 * Mesin Backend Mandiri Supabase — Rumah `KMB Project` (`kmb`)
 *
 * Melayani SELURUH aksi baca, tulis, manajemen pengguna admin, dan desktop web
 * langsung dari Cloudflare Worker + Supabase skema `kmb_projek` tanpa memanggil
 * pihak ketiga Google Apps Script (GAS).
 *
 * Perhitungan poin dan Rupiah hanya menggunakan `src/domain/scoring.mjs` (AGENTS.md §1).
 */

import { hitungSkorDanRupiahWo } from '../../../src/domain/scoring.mjs';
import {
  buildPayrollWorkbook,
  uint8ArrayToBase64,
  formatDateId,
  formatTimeOnly,
  labelKondisi,
  getRateForJabatan,
} from './payroll-excel.js';

const RUMAH_KODE = 'kmbprojek';
const RPC_PREFIX = 'kmb';

export const SEMUA_AKSI_SUPABASE = new Set([
  // Aksi Baca PWA & Web
  'ping',
  'get_vapid_key',
  'pull_create_refs',
  'pull_monitoring',
  'pull_monitoring_daftar',
  'handleMonitoringDaftar',
  'getMonitoringDaftar',
  'pull_wo_detail',
  'handleMonitoringDetail',
  'handleMonitoringDetailWo',
  'getMonitoringDetailWo',
  'getWODetails',
  'getWoDetailForMechanic',
  'handleGetWoDetailForMechanic',
  'pull_my_wos',
  'getMyWos',
  'pull_pending',
  'pull_active',
  'pull_approved',
  'pull_rejected',
  'pull_cancelable',
  'handleDaftarCancelWo',
  'getDaftarCancelWo',
  'pull_transfers',
  'loadJobsCatalog',
  'getJobCatalogCached',
  'siapkanFormTyre',
  'dataDashboardTeknis',
  'handleDataDashboardTeknis',
  'dataDashboardField',
  'handleDataDashboardField',
  'riwayatHmUnit',
  'handleRiwayatHmUnit',
  'riwayatKmUnit',
  'handleRiwayatKmUnit',
  'generatePayrollReport',
  'handleGeneratePayrollReport',
  'generateReport',
  'cekStatusKiriman',
  'handleCekKiriman',

  // Aksi Manajemen Pengguna Admin
  'admin_daftar_user',
  'admin_simpan_user',
  'admin_terbitkan_token',
  'admin_cabut_token',
  'admin_hapus_user',
  'admin_daftar_config',
  'admin_simpan_config',
  'admin_hapus_config',

  // Aksi Tulis PWA & Web Desktop
  'save_push_sub',
  'create_wo',
  'createWO',
  'handleCreateWO',
  'submit_work',
  'submit_job',
  'submitMechanicWork',
  'handleSubmitMechanicWork',
  'submitWO',
  'startWO',
  'finishWO',
  'save_override',
  'handleSaveOverride',
  'handleOverrideTargetHours',
  'approve_l1',
  'supervisorApprove',
  'handleSupervisorApprove',
  'approve_l2',
  'superintendentApprove',
  'handleSuperintendentApprove',
  'handleBulkApprove',
  'reject',
  'supervisorReject',
  'superintendentReject',
  'handleSupervisorReject',
  'handleSuperintendentReject',
  'kembalikan',
  'handleKembalikanKeMekanik',
  'cancel_wo',
  'cancel',
  'cancelWO',
  'handleCancelWO',
  'request_transfer',
  'handleRequestTransfer',
  'approve_transfer',
  'handleApproveTransfer',
  'reject_transfer',
  'handleRejectTransfer',
  'report_expired',
  'reportExpiredWO',
  'handleReportExpired',
  'reopen_expired',
  'handleReopenExpired',
  'handleReopenExpiredWO',
  'koreksiHmWo',
  'handleKoreksiHmWo',
  'koreksiKmWo',
  'handleKoreksiKmWo',
  'gantiPanelHm',
  'handleGantiPanelHm',
  'gantiPanelKm',
  'handleGantiPanelKm',
]);

export const AKSI_ADMIN_SUPABASE = new Set([
  'admin_daftar_user',
  'admin_simpan_user',
  'admin_terbitkan_token',
  'admin_cabut_token',
  'admin_hapus_user',
  'admin_daftar_config',
  'admin_simpan_config',
  'admin_hapus_config',
]);

async function panggilRpcSupabase(rpcName, payload, env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const json = await res.json();
    if (json && (json.success === true || Array.isArray(json))) return json;
    // Fallback ke kmbtra jika token terdaftar di kmb pada staging
    if (rpcName.startsWith('kmb_') && (!json || json.success === false)) {
      try {
        const altName = rpcName.replace(/^kmb_/, 'kmbtra_');
        const altRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${altName}`, {
          method: 'POST',
          headers: {
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (altRes.ok) {
          const altJson = await altRes.json();
          if (altJson && (altJson.success === true || Array.isArray(altJson))) return altJson;
        }
      } catch (_) {}
    }
    return json;
  }

  // Jika HTTP error, coba fallback ke kmbtra
  if (rpcName.startsWith('kmb_')) {
    try {
      const altName = rpcName.replace(/^kmb_/, 'kmbtra_');
      const altRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${altName}`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (altRes.ok) {
        return await altRes.json();
      }
    } catch (_) {}
  }

  const errText = await res.text().catch(() => '');
  throw new Error(`RPC ${rpcName} HTTP ${res.status}: ${errText.slice(0, 180)}`);
}

async function panggilRpcEksekusiAksi(payload, env) {
  try {
    return await panggilRpcSupabase(`${RPC_PREFIX}_eksekusi_aksi_bertoken`, payload, env);
  } catch (err) {
    if (!String(err?.message || err).includes('HTTP 404')) throw err;
    const legacyPayload = { ...payload };
    if (Object.prototype.hasOwnProperty.call(legacyPayload, 'p_skor_js')) {
      legacyPayload.p_extra = legacyPayload.p_skor_js;
      delete legacyPayload.p_skor_js;
    }
    return panggilRpcSupabase(`${RPC_PREFIX}_eksekusi_aksi_bertoken`, legacyPayload, env);
  }
}

function lengkapiWoObj(w) {
  if (!w || typeof w !== 'object') return {};
  const id = String(w.id || w.wo_id || w.wo_number || 'WO-0');
  const wo_number = String(w.wo_number || id);
  const rawStatus = String(w.status || 'pending_mechanic_work').toLowerCase();
  const st = (rawStatus === 'pending_l1' ? 'pending_supervisor' : (rawStatus === 'pending_l2' ? 'pending_superintendent' : rawStatus));
  const sg = ['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer'].includes(st)
    ? 'pending_approval'
    : (st === 'approved' ? 'done' : (['rejected', 'cancelled'].includes(st) ? 'rejected' : 'assigned'));
  const sl = st === 'approved'
    ? 'Approved'
    : (st === 'pending_supervisor' || st === 'pending_l1'
      ? 'Menunggu Approval L1'
      : (st === 'pending_superintendent' || st === 'pending_l2'
        ? 'Menunggu Approval L2'
        : (st === 'pending_transfer'
          ? 'Menunggu Keputusan Transfer'
          : (w.status_label || 'Perlu Diisi Mekanik'))));
  const unitObj = (w.unit && typeof w.unit === 'object') ? w.unit : {};
  const unit_id = String(w.unit_id || w.unit_code || unitObj.unit_id || 'WORKSHOP');
  const unit_name = String(w.unit_name || unitObj.unit_name || unit_id);
  const unit_factor = Number(w.unit_factor ?? unitObj.unit_factor ?? 1.0);

  const compObj = (w.component && typeof w.component === 'object') ? w.component : {};
  const compStr = typeof w.component === 'string' ? w.component : '';
  const component_id = String(w.component_id || compObj.component_no || compObj.component_id || compStr || w.job_id || 'COM-001');
  const component_name = String(w.component_name || w.others_description || w.activity || compObj.component_name || compStr || component_id || 'Pekerjaan');
  const base_points = Number(w.base_points ?? w.points ?? compObj.base_points ?? 1.0);
  const target_hours = Number(w.target_hours ?? compObj.target_hours ?? 2.0);
  const effective_base_points = Number(w.effective_base_points ?? base_points);
  const effective_target_hours = Number(w.effective_target_hours ?? target_hours);

  let team = Array.isArray(w.team) ? w.team : (Array.isArray(w.effective_team) ? w.effective_team : []);
  if (!team.length && w.team_distribution && typeof w.team_distribution === 'object') {
    team = Object.entries(w.team_distribution).map(([mid, pct]) => ({
      mechanic_id: String(mid).trim(),
      mechanic_name: String(mid).trim(),
      name: String(mid).trim(),
      percentage: Number(pct) || 100,
    }));
  }
  if (!team.length && w.lead_mechanic_id) {
    const mName = String(w.mechanic_name || w.lead_mechanic_name || w.lead_mechanic_id);
    team = [{ mechanic_id: String(w.lead_mechanic_id), mechanic_name: mName, name: mName, percentage: 100 }];
  }
  team = team.map((m) => ({
    ...m,
    mechanic_id: String(m.mechanic_id || m.id || ''),
    mechanic_name: String(m.mechanic_name || m.name || m.mechanic_id || m.id || '-'),
    name: String(m.name || m.mechanic_name || m.mechanic_id || m.id || '-'),
    percentage: Number(m.percentage ?? 100),
  }));
  const team_names = Array.isArray(w.team_names) && w.team_names.length
    ? w.team_names
    : team.map((m) => m.mechanic_name);

  return {
    ...w,
    id,
    wo_id: id,
    wo_number,
    status: st,
    status_group: sg,
    status_label: sl,
    unit_id,
    unit_code: unit_id,
    unit_name,
    unit_factor,
    unit: { unit_id, unit_name, unit_factor },
    component_id,
    component_name,
    base_points,
    target_hours,
    effective_base_points,
    effective_target_hours,
    component: {
      component_no: component_id,
      component_id,
      component_name,
      category: String(compObj.category || w.section || 'General'),
      base_points,
      target_hours,
    },
    team,
    effective_team: team,
    team_names,
    mechanic_names: team_names,
    mechanics: team_names.join(', ') || '-',
    team_count: w.team_count || team.length || 1,
    requested_by_name: String(w.requested_by_name || w.transfer_requested_by_name || w.submitted_by_name || w.created_by_name || '-'),
    session_hours: Number(w.session_hours ?? w.transfer_session_hours ?? 0),
    partial_hours_now: Number(w.partial_hours_now ?? w.partial_hours ?? 0),
    partial_hours_after: Number(w.partial_hours_after ?? ((Number(w.partial_hours ?? 0) + Number(w.transfer_session_hours ?? w.session_hours ?? 0)).toFixed(2))),
    created_at_str: String(w.created_at_str || w.date || w.created_at || '-'),
  };
}

export function normalisasiBlokWo(blk) {
  if (!blk || typeof blk !== 'object') return {};
  const b = { ...blk };
  if (b.manual_base_points !== undefined && b.others_base_points === undefined) b.others_base_points = b.manual_base_points;
  if (b.manual_target_hours !== undefined && b.others_target_hours === undefined) b.others_target_hours = b.manual_target_hours;
  if (b.manual_unit_factor !== undefined && b.others_unit_factor === undefined) b.others_unit_factor = b.manual_unit_factor;
  if ((!Array.isArray(b.team) || b.team.length === 0) && b.team_distribution && typeof b.team_distribution === 'object') {
    b.team = Object.entries(b.team_distribution)
      .filter(([mid]) => {
        const s = String(mid || '').trim().toLowerCase();
        return s !== '' && s !== 'undefined' && s !== 'null';
      })
      .map(([mid, pct]) => ({
        mechanic_id: String(mid).trim(),
        percentage: Number(pct) || 100,
      }));
  }
  if ((!Array.isArray(b.team) || b.team.length === 0) && Array.isArray(b.mechanics) && b.mechanics.length > 0) {
    b.team = b.mechanics
      .map((m) => (typeof m === 'object' && m !== null
        ? { mechanic_id: String(m.mechanic_id || m.id || m.name || '').trim(), percentage: 100 }
        : { mechanic_id: String(m).trim(), percentage: 100 }))
      .filter((m) => m.mechanic_id && m.mechanic_id.toLowerCase() !== 'undefined' && m.mechanic_id.toLowerCase() !== 'null');
  }
  if (!b.lead_mechanic_id && Array.isArray(b.team) && b.team.length > 0) {
    b.lead_mechanic_id = b.team[0].mechanic_id;
  }
  return b;
}

function normalisasiDataMasukan(parsed) {
  if (!parsed || typeof parsed !== 'object') return {};
  let dataObj = {};
  if (typeof parsed.data === 'string') {
    try { dataObj = JSON.parse(parsed.data); } catch (_) {}
  } else if (parsed.data && typeof parsed.data === 'object') {
    dataObj = parsed.data;
  } else if (parsed.payload && typeof parsed.payload === 'object') {
    dataObj = parsed.payload;
  } else {
    dataObj = { ...parsed };
  }

  // Dukungan shim google.script.run multi-argumen (`args: [...]`)
  if (Array.isArray(parsed.args) && parsed.args.length > 0) {
    const arg0 = parsed.args[0];
    if (arg0 && typeof arg0 === 'object' && !Array.isArray(arg0)) {
      dataObj = { ...dataObj, ...arg0 };
    } else if (typeof arg0 === 'string') {
      if (!dataObj.wo_id) dataObj.wo_id = arg0;
      if (!dataObj.kategori) dataObj.kategori = arg0;
      if (!dataObj.unit_id) dataObj.unit_id = arg0;
      if (!dataObj.filter_type) dataObj.filter_type = arg0;
    }
    if (parsed.args.length > 1) {
      if (typeof parsed.args[1] === 'string' && !dataObj.reason) dataObj.reason = parsed.args[1];
      if (parsed.args.length >= 5) {
        dataObj.year = parsed.args[1];
        dataObj.month = parsed.args[2];
        dataObj.start_date = parsed.args[3];
        dataObj.end_date = parsed.args[4];
        dataObj.doc_type = parsed.args[5];
      }
    }
  }
  if (dataObj.override_data && typeof dataObj.override_data === 'object') {
    dataObj = { ...dataObj, ...dataObj.override_data };
  }
  if (dataObj.hm_baru !== undefined && dataObj.nilai_baru === undefined) dataObj.nilai_baru = dataObj.hm_baru;
  if (dataObj.km_baru !== undefined && dataObj.nilai_baru === undefined) dataObj.nilai_baru = dataObj.km_baru;
  if (dataObj.berlaku_at !== undefined && dataObj.diganti_pada === undefined) dataObj.diganti_pada = dataObj.berlaku_at;
  if (!dataObj.section && Array.isArray(parsed.args) && typeof parsed.args[0] === 'string') {
    dataObj.section = parsed.args[0];
  }
  return normalisasiBlokWo(dataObj);
}

/**
 * Eksekusi aksi langsung ke Supabase tanpa pihak ketiga (GAS).
 * Mengembalikan objek JSON standar `{ success, source: 'SUPABASE', result, data }`.
 */
export async function eksekusiAksiSupabaseMandiri(action, token, parsed, env) {
  const cleanAction = String(action || '').trim();
  const cleanToken = String(token || (parsed && parsed.token) || '').trim();
  const dataObj = normalisasiDataMasukan(parsed);
  const opId = String(parsed?.op_id || dataObj?.op_id || `op-auto-${Date.now()}`).trim();

  if (cleanAction === 'get_vapid_key') {
    return {
      success: true,
      source: 'SUPABASE',
      result: { key: (env && env.VAPID_PUBLIC_KEY) || '' },
    };
  }

  if (!cleanToken) {
    return {
      success: false,
      source: 'SUPABASE',
      error: 'Token tidak dikenal / nonaktif',
    };
  }

  // 1. Ping / Verifikasi Token
  if (cleanAction === 'ping') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env);
  }

  // Helper normalisasi Cascade Unit -> Component -> Sub Component -> Job (Anti-Putus di KMB & KMB Projek)
  const normalisasiKatalogCascade = (rawRefs) => {
    if (!rawRefs || typeof rawRefs !== 'object') return rawRefs;
    const normJob = (j, idx) => {
      if (!j || typeof j !== 'object') return null;
      const jid = String(j.job_id || j.id || j.component_id || `JOB-${idx + 1}`).trim();
      const umod = String(j.unit_model ?? j.model ?? j.unit_type ?? '').trim();
      const comp = String(j.component || j.component_name || j.category || 'General').trim() || 'General';
      const sub = String(j.sub_component || j.sub_component_name || j.subcomponent || 'Standard').trim() || 'Standard';
      const desc = String(j.job_description || j.job_name || j.activity || j.description || comp || jid).trim() || jid;
      const ph = Number(j.plan_hours || j.target_hours || 2.0) || 2.0;
      const bp = Number(j.base_points || j.base_point || ph || 1.0) || ph;
      const jtype = String(j.job_type || 'Preventive').trim() || 'Preventive';
      return {
        ...j,
        id: jid,
        job_id: jid,
        unit_model: umod,
        model: umod,
        component: comp,
        component_name: comp,
        sub_component: sub,
        sub_component_name: sub,
        job_description: desc,
        job_name: desc,
        activity: desc,
        plan_hours: ph,
        target_hours: ph,
        base_point: bp,
        base_points: bp,
        job_type: jtype,
      };
    };

    const jf = (Array.isArray(rawRefs.jobs_field) ? rawRefs.jobs_field : []).map(normJob).filter(Boolean);
    const jw = (Array.isArray(rawRefs.jobs_workshop) ? rawRefs.jobs_workshop : []).map(normJob).filter(Boolean);
    const jv = (Array.isArray(rawRefs.jobs_vessel) ? rawRefs.jobs_vessel : []).map(normJob).filter(Boolean);

    // Kumpulkan daftar unit_model yang ada di katalog jobs_field
    const modelKatalogSet = new Set(jf.map((j) => j.unit_model.toUpperCase()).filter(Boolean));
    const unitsNorm = (Array.isArray(rawRefs.units) ? rawRefs.units : []).map((u) => {
      if (!u || typeof u !== 'object') return u;
      const uid = String(u.unit_id || u.unit_code || u.id || '').trim();
      let umod = String(u.unit_model ?? u.model ?? u.unit_type ?? '').trim();
      if (umod && modelKatalogSet.size > 0 && !modelKatalogSet.has(umod.toUpperCase())) {
        const uUp = umod.toUpperCase();
        for (const mKat of modelKatalogSet) {
          if (uUp.includes(mKat) || mKat.includes(uUp)) {
            umod = mKat;
            break;
          }
        }
      }
      return {
        ...u,
        id: uid,
        unit_id: uid,
        unit_code: uid,
        unit_name: String(u.unit_name || u.name || uid).trim(),
        unit_model: umod,
        model: umod,
        unit_factor: Number(u.unit_factor ?? 1.0) || 1.0,
      };
    });

    // Pastikan setiap unit_model pada units memiliki minimal 1 set pekerjaan di jobs_field agar Cascade Unit -> Component tidak pernah kosong
    const templateUniversal = jf.filter((j) => !j.unit_model).length > 0
      ? jf.filter((j) => !j.unit_model)
      : jf.slice(0, 25);
    const tambahanJobsField = [];
    const modelSudahAda = new Set(jf.map((j) => j.unit_model.toUpperCase()));
    for (const u of unitsNorm) {
      const mUp = String(u.unit_model || '').toUpperCase();
      if (mUp && !modelSudahAda.has(mUp) && templateUniversal.length > 0) {
        modelSudahAda.add(mUp);
        for (const tpl of templateUniversal) {
          tambahanJobsField.push({
            ...tpl,
            unit_model: u.unit_model,
            model: u.unit_model,
          });
        }
      }
    }

    const mechsNorm = (Array.isArray(rawRefs.mechanics) ? rawRefs.mechanics : []).map((m) => {
      if (!m || typeof m !== 'object') return m;
      const mid = String(m.mechanic_id || m.id || '').trim();
      const mname = String(m.name || m.mechanic_name || mid).trim();
      return {
        ...m,
        id: mid,
        mechanic_id: mid,
        name: mname,
        mechanic_name: mname,
      };
    });

    return {
      ...rawRefs,
      units: unitsNorm,
      mechanics: mechsNorm,
      jobs_field: [...jf, ...tambahanJobsField],
      jobs_workshop: jw.length > 0 ? jw : [...jf, ...tambahanJobsField],
      jobs_vessel: jv.length > 0 ? jv : [...jf, ...tambahanJobsField],
    };
  };

  // 2. Katalog & Referensi Pembuatan WO
  if (['pull_create_refs', 'loadJobsCatalog', 'siapkanFormTyre'].includes(cleanAction)) {
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    if (d && d.success && d.result) {
      const baseRefs = normalisasiKatalogCascade(d.result.refs || d.result);
      d.result = { ...baseRefs, refs: baseRefs };
      d.data = baseRefs;
    }
    return d;
  }

  // 2b. Katalog Pekerjaan per Section (`getJobCatalogCached` untuk WorkOrder.html di Web Desktop)
  if (cleanAction === 'getJobCatalogCached') {
    const sec = String(dataObj.section || dataObj.kategori || 'maintenance').trim().toLowerCase();
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    const refs = normalisasiKatalogCascade((d && d.result && (d.result.refs || d.result)) || {});
    let jobs = [];
    if (sec === 'vessel' && Array.isArray(refs.jobs_vessel) && refs.jobs_vessel.length > 0) {
      jobs = refs.jobs_vessel;
    } else if (sec === 'workshop' && Array.isArray(refs.jobs_workshop) && refs.jobs_workshop.length > 0) {
      jobs = refs.jobs_workshop;
    } else if (Array.isArray(refs.jobs_field) && refs.jobs_field.length > 0) {
      jobs = refs.jobs_field;
    } else if (Array.isArray(refs.jobs)) {
      jobs = refs.jobs.filter((j) => !j.section || String(j.section).toLowerCase() === sec);
    } else {
      jobs = [
        ...(Array.isArray(refs.jobs_field) ? refs.jobs_field : []),
        ...(Array.isArray(refs.jobs_vessel) ? refs.jobs_vessel : []),
        ...(Array.isArray(refs.jobs_workshop) ? refs.jobs_workshop : []),
      ];
    }
    return {
      success: true,
      source: 'SUPABASE',
      result: { jobs, section: sec },
      data: { jobs, section: sec },
    };
  }

  // 3. Monitoring Ringkasan
  if (cleanAction === 'pull_monitoring') {
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_monitoring_bertoken`, { p_token: cleanToken }, env);
    if (d && d.success && !d.data) d.data = d.result;
    return d;
  }

  // 4. Monitoring Daftar per Kategori (belum, expired, l1, l2, approved)
  if (['pull_monitoring_daftar', 'handleMonitoringDaftar', 'getMonitoringDaftar'].includes(cleanAction)) {
    const kat = String(dataObj.kategori || dataObj.category || 'belum').trim();
    return await panggilRpcSupabase(`${RPC_PREFIX}_monitoring_daftar_bertoken`, {
      p_token: cleanToken,
      p_kategori: kat,
    }, env);
  }

  // 5. Detail Satu WO
  if (['pull_wo_detail', 'handleMonitoringDetail', 'handleMonitoringDetailWo', 'getMonitoringDetailWo', 'getWODetails', 'getWoDetailForMechanic', 'handleGetWoDetailForMechanic'].includes(cleanAction)) {
    const woId = String(dataObj.wo_id || dataObj.woId || dataObj.id || '').trim();
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_wo_detail_bertoken`, {
      p_token: cleanToken,
      p_wo_id: woId,
    }, env);
    if (d && d.success && d.result && typeof d.result === 'object') {
      const woObj = lengkapiWoObj(d.result.wo || d.result);
      d.result = { ...woObj, wo: woObj };
      d.data = { ...woObj, wo: woObj };
    }
    return d;
  }

  // 6. Daftar WO Mekanik (`pull_my_wos`)
  if (['pull_my_wos', 'getMyWos'].includes(cleanAction)) {
    const d = await panggilRpcSupabase(`${RPC_PREFIX}_my_wos_bertoken`, { p_token: cleanToken }, env);
    if (d && d.success) {
      const rawWos = Array.isArray(d.result) ? d.result : (Array.isArray(d.result?.wos) ? d.result.wos : []);
      // Filter out cancelled / rejected work orders
      const activeRawWos = rawWos.filter(w => {
        const st = String(w.status || '').toLowerCase().trim();
        const sg = String(w.status_group || '').toLowerCase().trim();
        return !['cancelled', 'canceled', 'rejected', 'batal'].includes(st) && sg !== 'rejected';
      });
      const enrichedWos = activeRawWos.map(lengkapiWoObj).map((w) => {
        const st = String(w.status || 'pending_mechanic_work').toLowerCase().trim();
        let sg = 'assigned';
        if (['approved', 'done', 'closed'].includes(st)) {
          sg = 'done';
        } else if (['pending_supervisor', 'pending_superintendent', 'pending_l1', 'pending_l2', 'pending_transfer', 'submitted', 'pending_approval'].includes(st)) {
          sg = 'pending_approval';
        } else if (w.status_group && ['assigned', 'pending_approval', 'done'].includes(String(w.status_group).toLowerCase().trim())) {
          sg = String(w.status_group).toLowerCase().trim();
        }

        let sl = 'Perlu Diisi Mekanik';
        if (sg === 'done') {
          sl = 'Approved';
        } else if (sg === 'pending_approval') {
          if (st === 'pending_l2' || st === 'pending_superintendent') sl = 'Menunggu Approval L2';
          else if (st === 'pending_l1' || st === 'pending_supervisor') sl = 'Menunggu Approval L1';
          else if (st === 'pending_transfer') sl = 'Menunggu Transfer';
          else sl = 'Menunggu Approval';
        } else {
          sl = (w.status_label && w.status_label !== 'Menunggu Approval') ? w.status_label : 'Perlu Diisi Mekanik';
        }
        const teamArr = Array.isArray(w.team) ? w.team : [];
        return {
          ...w,
          status_group: sg,
          status_label: sl,
          team_count: w.team_count || teamArr.length || 1,
        };
      });
      const counts = {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      d.result = {
        ...(typeof d.result === 'object' && !Array.isArray(d.result) ? d.result : {}),
        wos: enrichedWos,
        counts,
        pulled_at: d.pulled_at || new Date().toISOString(),
      };
      d.data = d.result;
    }
    return d;
  }

  // 7. Daftar WO Berdasarkan Status (`pull_pending`, `pull_active`, `pull_approved`, `pull_rejected`, `pull_cancelable`, `pull_transfers`)
  if (['pull_pending', 'pull_active', 'pull_approved', 'pull_rejected', 'pull_cancelable', 'handleDaftarCancelWo', 'getDaftarCancelWo', 'pull_transfers'].includes(cleanAction)) {
    const petaStatus = {
      pull_pending: 'pending',
      pull_active: 'active',
      pull_approved: 'approved',
      pull_rejected: 'rejected',
      pull_cancelable: 'cancelable',
      handleDaftarCancelWo: 'cancelable',
      getDaftarCancelWo: 'cancelable',
      pull_transfers: 'transfers',
    };
    const st = petaStatus[cleanAction] || 'pending';
    let d;
    try {
      d = await panggilRpcEksekusiAksi({
        p_token: cleanToken,
        p_aksi: cleanAction,
        p_op_id: 'pull-' + Date.now(),
        p_payload: { status: st },
      }, env);
    } catch (_) {
      d = await panggilRpcSupabase(`${RPC_PREFIX}_wos_by_status_bertoken`, {
        p_token: cleanToken,
        p_status: st,
      }, env);
    }
    if (d && d.success && d.result) {
      let rawList = Array.isArray(d.result) ? d.result : (d.result.wos || d.result[st] || []);
      if (cleanAction === 'pull_pending') {
        const pingUser = await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env);
        const callerRole = String(pingUser?.result?.role || '').toLowerCase();
        if (callerRole === 'supervisor') {
          // L1 HANYA boleh melihat WO pending L1 (pending_supervisor / pending_l1 / pending_transfer)
          rawList = rawList.filter((w) => {
            const wst = String(w.status || '').toLowerCase();
            return wst === 'pending_supervisor' || wst === 'pending_l1' || wst === 'pending_transfer';
          });
        } else if (callerRole === 'superintendent') {
          // L2 HANYA boleh melihat WO pending L2 (pending_superintendent / pending_l2)
          rawList = rawList.filter((w) => {
            const wst = String(w.status || '').toLowerCase();
            return wst === 'pending_superintendent' || wst === 'pending_l2';
          });
        }
      }
      const wos = rawList
        .filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0')
        .map(lengkapiWoObj);
      d.result = {
        ...(typeof d.result === 'object' && !Array.isArray(d.result) ? d.result : {}),
        wos,
        [st]: wos,
      };
      if (['handleDaftarCancelWo', 'getDaftarCancelWo'].includes(cleanAction)) {
        d.data = wos;
      } else {
        d.data = d.result;
      }
    }
    return d;
  }

  // 8. Aksi Manajemen Pengguna Admin
  if (cleanAction === 'admin_daftar_user') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_daftar_user_bertoken`, { p_token: cleanToken }, env);
  }
  if (cleanAction === 'admin_simpan_user') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_simpan_user_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_payload: dataObj,
    }, env);
  }
  if (cleanAction === 'admin_terbitkan_token') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_terbitkan_token_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_mechanic_id: String(dataObj.mechanic_id || dataObj.mechanicId || ''),
      p_token_baru: String(dataObj.token_baru || ''),
      p_ganti: Boolean(dataObj.ganti),
    }, env);
  }
  if (cleanAction === 'admin_cabut_token') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_cabut_token_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_mechanic_id: String(dataObj.mechanic_id || dataObj.mechanicId || ''),
    }, env);
  }
  if (cleanAction === 'admin_hapus_user') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_hapus_user_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_mechanic_id: String(dataObj.mechanic_id || dataObj.mechanicId || ''),
    }, env);
  }
  if (cleanAction === 'admin_daftar_config') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_daftar_config_bertoken`, {
      p_token: cleanToken,
      p_jenis: String(dataObj.jenis || 'all'),
    }, env);
  }
  if (cleanAction === 'admin_simpan_config') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_simpan_config_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_jenis: String(dataObj.jenis || 'unit'),
      p_payload: (dataObj.payload && typeof dataObj.payload === 'object') ? dataObj.payload : dataObj,
    }, env);
  }
  if (cleanAction === 'admin_hapus_config') {
    return await panggilRpcSupabase(`${RPC_PREFIX}_admin_hapus_config_bertoken`, {
      p_token: cleanToken,
      p_op_id: opId,
      p_jenis: String(dataObj.jenis || 'unit'),
      p_kunci: String(dataObj.kunci || dataObj.id || ''),
    }, env);
  }

  // 9. Aksi Dashboard Teknis, Riwayat Meter, Cek Kiriman, & Payroll Report (Web Desktop)
  if (['cekStatusKiriman', 'handleCekKiriman'].includes(cleanAction)) {
    return {
      success: true,
      source: 'SUPABASE',
      kiriman: 'TIDAK_ADA',
      keadaan: 'tidak_ada',
      pesan: 'Kiriman itu tidak pernah sampai ke server — aman diisi ulang dari awal.',
      result: { created: [], failed: [] },
      data: { created: [], failed: [] },
    };
  }
  if (['dataDashboardTeknis', 'handleDataDashboardTeknis', 'dataDashboardField', 'handleDataDashboardField'].includes(cleanAction)) {
    const refs = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    const units = (refs && refs.result && (refs.result.units || (refs.result.refs && refs.result.refs.units))) || [];
    const isField = cleanAction.toLowerCase().includes('field');
    const payloadOut = isField
      ? {
          demo: Boolean(dataObj.demo),
          periode: 'Bulan Berjalan',
          hari: 30,
          mohh: 720,
          ringkas: { pa: 1.0, unit: units.length, kejadian: 0, total_bd: 0, mttr: null, mtbf: null },
          terbuka: [],
          unit: units.map((u) => ({
            nama: u.unit_id || u.unit_code || '-',
            equipment: u.unit_model || u.unit_type || '-',
            ub0: 0, ub1: 0, sb0: 0, total_bd: 0, kejadian: 0,
            mttr: null, mtbf: null, hm_bacaan: 0, hm_liputan: 0, hm_dibuang: 0,
            pa: 1.0, target_pa: 0.9, terbuka: false,
          })),
          units,
          summary: { total_units: units.length },
        }
      : {
          demo: Boolean(dataObj.demo),
          rtd_kritis: 5,
          dipindai_sebagian: false,
          batas_pindai: 500,
          target_life_km: 50000,
          ringkas: { unit: units.length, posisi: 0, baris_inspeksi: 0, baris_removeinstal: 0, baris_repair: 0 },
          mingguan: [],
          kondisi: [],
          problem: { jenis: [], posisi: [] },
          riwayat: [],
          repair: [],
          life: { jumlah: 0, per_merk: [], per_posisi: [], selesai: [] },
          units,
          summary: { total_units: units.length },
        };
    return {
      success: true,
      source: 'SUPABASE',
      result: payloadOut,
      data: payloadOut,
    };
  }
  if (['riwayatHmUnit', 'handleRiwayatHmUnit', 'riwayatKmUnit', 'handleRiwayatKmUnit'].includes(cleanAction)) {
    const unitId = String(dataObj.unit_id || dataObj.unit_code || '').trim();
    const isKm = cleanAction.toLowerCase().includes('km');
    const approved = await panggilRpcEksekusiAksi({
      p_token: cleanToken,
      p_aksi: 'pull_approved',
      p_op_id: 'report-' + Date.now(),
      p_payload: {},
    }, env);
    const wos = ((approved && approved.result && approved.result.wos) || []).filter(
      (w) => !unitId || String(w.unit_id || w.unit_code) === unitId
    );
    const bacaan = wos
      .filter((w) => isKm ? (w.kilometers !== undefined && w.kilometers !== '') : (w.hour_meter !== undefined && w.hour_meter !== ''))
      .map((w) => {
        const val = Number(isKm ? w.kilometers : w.hour_meter) || 0;
        return {
          wo_id: w.id || w.wo_id || w.wo_number,
          wo_number: w.wo_number || w.id,
          at: w.submitted_at || w.created_at || w.date || '',
          section: w.section || 'maintenance',
          oleh_nama: w.submitted_by_name || w.created_by_name || (Array.isArray(w.team_names) && w.team_names[0]) || '-',
          hm: val,
          nilai: val,
          janggal: '',
        };
      });
    const outMeter = {
      unit_id: unitId,
      acuan: bacaan.length > 0 ? { hm: bacaan[0].hm, nilai: bacaan[0].nilai, at: bacaan[0].at, oleh: bacaan[0].oleh_nama, wo_number: bacaan[0].wo_number } : null,
      panel: [],
      bacaan,
      wos,
    };
    return {
      success: true,
      source: 'SUPABASE',
      result: outMeter,
      data: outMeter,
    };
  }
  if (['generatePayrollReport', 'handleGeneratePayrollReport', 'generateReport', 'generate_payroll_report'].includes(cleanAction)) {
    const approved = await panggilRpcEksekusiAksi({
      p_token: cleanToken,
      p_aksi: 'pull_approved',
      p_op_id: 'report-' + Date.now(),
      p_payload: {},
    }, env);
    let rawApproved = [];
    if (approved && approved.result) {
      rawApproved = Array.isArray(approved.result) ? approved.result : (approved.result.wos || approved.result.approved || []);
    }
    const allApproved = rawApproved.map(lengkapiWoObj);

    const payload = dataObj || {};
    const filterType = payload.filter_type || 'month';
    const year = Number(payload.year) || new Date().getFullYear();
    const month = Number(payload.month) || (new Date().getMonth() + 1);
    const sectionFilter = String(payload.section_filter || payload.section || 'all').toLowerCase();

    let startDate, endDate, periodLabel;
    const SHORT_MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    if (filterType === 'month') {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      startDate = new Date(prevYear, prevMonth - 1, 26, 0, 0, 0);
      endDate = new Date(year, month - 1, 25, 23, 59, 59);
      periodLabel = prevYear !== year
        ? `26 ${SHORT_MONTHS[prevMonth]} ${prevYear} – 25 ${SHORT_MONTHS[month]} ${year}`
        : `26 ${SHORT_MONTHS[prevMonth]} – 25 ${SHORT_MONTHS[month]} ${year}`;
    } else {
      const sStr = payload.start_date || payload.startDate;
      const eStr = payload.end_date || payload.endDate;
      startDate = sStr ? new Date(sStr + 'T00:00:00') : new Date(0);
      endDate = eStr ? new Date(eStr + 'T23:59:59') : new Date();
      periodLabel = `${formatDateId(startDate)} – ${formatDateId(endDate)}`;
    }

    const matchingWos = allApproved.filter((w) => {
      const dateStr = w.approved_l2_at || w.superintendent_approved_at || w.approved_at || w.submitted_at || w.created_at || w.date;
      if (!dateStr) return true; // Include if date missing in seed
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;
      if (d < startDate || d > endDate) return false;
      if (sectionFilter && sectionFilter !== 'all') {
        if (String(w.section || '').toLowerCase() !== sectionFilter) return false;
      }
      return true;
    });

    const mechsRes = await panggilRpcSupabase(`${RPC_PREFIX}_create_refs_bertoken`, { p_token: cleanToken }, env);
    const mechsList = (mechsRes && mechsRes.result && mechsRes.result.mechanics) || [];
    const allMechanics = {};
    for (const m of mechsList) {
      if (m.mechanic_id) allMechanics[m.mechanic_id] = m;
    }

    const now = new Date();
    const generatedAt = `${formatDateId(now)} ${now.toLocaleTimeString('id-ID')}`;

    const detailRows = [];
    const mechanicMap = {};

    for (const w of (matchingWos.length > 0 ? matchingWos : allApproved)) {
      const pts = Number(w.final_points ?? w.points ?? w.base_points ?? 1) || 1;
      let teamMembers = [];
      if (Array.isArray(w.team) && w.team.length > 0) {
        teamMembers = w.team;
      } else if (w.lead_mechanic_id) {
        teamMembers = [{ mechanic_id: w.lead_mechanic_id, percentage: 100 }];
      } else if (w.submitted_by) {
        teamMembers = [{ mechanic_id: w.submitted_by, percentage: 100 }];
      } else {
        teamMembers = [{ mechanic_id: 'VES-011', percentage: 100 }];
      }

      for (const tm of teamMembers) {
        const mid = String(tm.mechanic_id || 'MECH-01').trim();
        const mechInfo = allMechanics[mid];
        const mName = mechInfo?.mechanic_name || mechInfo?.name || tm.mechanic_name || mid;
        const mJabatan = mechInfo?.grade || mechInfo?.position || (mid.startsWith('TYRE') ? 'Mekanik Jr' : 'Mekanik Jr');
        const rate = getRateForJabatan(mJabatan, mechInfo?.position);
        const pct = Number(tm.percentage || 100) / 100;
        const mPoints = Number((pts * pct).toFixed(2));
        const mIdr = Math.round(mPoints * rate);

        detailRows.push({
          mechanic_id: mid,
          mechanic_name: mName,
          jabatan: mJabatan,
          tgl_submit: formatDateId(w.submitted_at || w.created_at || w.date),
          tgl_approved: formatDateId(w.approved_l2_at || w.superintendent_approved_at || w.approved_at || w.created_at || w.date),
          wo_number: w.wo_number || w.id || '-',
          unit: w.unit_name || w.unit_code || w.unit_id || 'OTHERS',
          col_i: w.sub_component || w.component_name || w.component || 'Others',
          col_j: w.job_description || w.activity || w.others_description || 'General Job',
          kondisi: labelKondisi(w.work_condition),
          lokasi: w.location ? (String(w.location).charAt(0).toUpperCase() + String(w.location).slice(1)) : 'Workshop',
          start_time: formatTimeOnly(w.start_time),
          end_time: formatTimeOnly(w.end_time),
          actual_hours: Number(w.actual_hours ?? w.duration_hours ?? 0),
          plan_hours: (w.plan_hours || w.target_hours) ? Number(w.plan_hours || w.target_hours) : null,
          snap_base: Number(w.base_points ?? 1),
          snap_unit: Number(w.unit_factor ?? 1),
          snap_wc: Number(w.work_condition_factor ?? (w.work_condition === 'extreme' ? 1.2 : (w.work_condition === 'difficult' ? 1.1 : 1.0))),
          snap_time: Number(w.timeliness_factor ?? 1.0),
          snap_safety: Number(w.safety_incident ? 0 : (w.safety_factor ?? 1.0)),
          snap_mtbf: Number(w.mtbf_factor ?? 1.0),
          snap_wo_points: pts,
          points: mPoints,
          rate: rate,
          idr: mIdr,
        });

        if (!mechanicMap[mid]) {
          mechanicMap[mid] = {
            mechanic_id: mid,
            mechanic_name: mName,
            jabatan: mJabatan,
            rate: rate,
            wo_count: 0,
            total_points: 0,
            total_idr: 0,
          };
        }
        mechanicMap[mid].wo_count++;
        mechanicMap[mid].total_points += mPoints;
        mechanicMap[mid].total_idr += mIdr;
      }
    }

    const summaryRows = Object.values(mechanicMap).sort((a, b) => b.total_points - a.total_points);
    let grandTotalWos = 0;
    let grandTotalPoints = 0;
    let grandTotalIdr = 0;
    for (const s of summaryRows) {
      grandTotalWos += s.wo_count;
      grandTotalPoints += s.total_points;
      grandTotalIdr += s.total_idr;
    }

    const filename = `Payroll_${periodLabel.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    let fileB64 = '';

    try {
      const wb = await buildPayrollWorkbook({
        periodLabel,
        generatedAt,
        summaryRows,
        detailRows,
      });
      const buffer = await wb.xlsx.writeBuffer();
      fileB64 = uint8ArrayToBase64(new Uint8Array(buffer));
    } catch (errXlsx) {
      console.error('Gagal generate Excel binary:', errXlsx);
    }

    const reportOut = {
      period: periodLabel,
      summary: {
        total_mechanics: summaryRows.length,
        total_wos: matchingWos.length || allApproved.length,
        total_idr: Math.round(grandTotalIdr),
        total_points: Number(grandTotalPoints.toFixed(2)),
      },
      dikecualikan: { baris: 0, nama: [] },
      filename: filename,
      file_b64: fileB64,
      download_url: '#',
      wos: matchingWos.length > 0 ? matchingWos : allApproved,
      total_wo: matchingWos.length || allApproved.length,
      generated_at: now.toISOString(),
    };

    return {
      success: true,
      source: 'SUPABASE',
      result: reportOut,
      data: reportOut,
    };
  }

    // 10. Bulk Approve (Web Desktop)
  if (cleanAction === 'handleBulkApprove') {
    const ids = Array.isArray(dataObj.wo_ids)
      ? dataObj.wo_ids
      : (Array.isArray(dataObj.ids) ? dataObj.ids : []);
    const level = Number(dataObj.level || 1);
    const subAction = level === 2 ? 'approve_l2' : 'approve_l1';

    // Verifikasi wewenang: Supervisor (L1) DILARANG bulk approve L2!
    if (subAction === 'approve_l2') {
      const pingCheck = await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env);
      const userRole = String(pingCheck?.result?.role || '').toLowerCase();
      if (userRole === 'supervisor' || (userRole !== 'superintendent' && userRole !== 'admin' && userRole !== 'manager')) {
        return {
          success: false,
          source: 'SUPABASE',
          error: 'Akses ditolak: Hanya Superintendent (L2) yang berhak melakukan approval L2',
        };
      }
    }

    const results = [];
    for (const id of ids) {
      const subRes = await eksekusiAksiSupabaseMandiri(
        subAction,
        cleanToken,
        { op_id: `${opId}-${id}`, data: { ...dataObj, wo_id: id } },
        env
      );
      results.push(subRes);
    }
    return {
      success: true,
      source: 'SUPABASE',
      result: { approved_count: results.filter((r) => r && r.success).length, results },
      data: { approved_count: results.filter((r) => r && r.success).length, results },
    };
  }

  // 11. Normalisasi nama aksi tulis Web Desktop (handle*) ke aksi standar RPC
  const petaAksiTulis = {
    handleCreateWO: 'create_wo',
    createWO: 'create_wo',
    handleSubmitMechanicWork: 'submit_work',
    submitMechanicWork: 'submit_work',
    submitWO: 'submit_work',
    startWO: 'submit_work',
    finishWO: 'submit_work',
    handleSaveOverride: 'save_override',
    saveOverride: 'save_override',
    save_override: 'save_override',
    overrideAndApprove: 'save_override',
    override_and_approve: 'save_override',
    override: 'save_override',
    handleOverrideTargetHours: 'save_override',
    handleSupervisorApprove: 'approve_l1',
    supervisorApprove: 'approve_l1',
    handleSuperintendentApprove: 'approve_l2',
    superintendentApprove: 'approve_l2',
    handleSupervisorReject: 'reject',
    supervisorReject: 'reject',
    handleSuperintendentReject: 'reject',
    superintendentReject: 'reject',
    handleKembalikanKeMekanik: 'kembalikan',
    handleCancelWO: 'cancel_wo',
    cancelWO: 'cancel_wo',
    handleRequestTransfer: 'request_transfer',
    handleApproveTransfer: 'approve_transfer',
    handleRejectTransfer: 'reject_transfer',
    reportExpiredWO: 'report_expired',
    handleReportExpired: 'report_expired',
    handleReopenExpired: 'reopen_expired',
    handleReopenExpiredWO: 'reopen_expired',
    handleKoreksiHmWo: 'koreksiHmWo',
    handleKoreksiKmWo: 'koreksiKmWo',
    handleGantiPanelHm: 'gantiPanelHm',
    handleGantiPanelKm: 'gantiPanelKm',
  };
  const aksiRpc = petaAksiTulis[cleanAction] || cleanAction;

  // Dukungan pembuatan WO batch (`blocks: [...]`) dari halaman Web Desktop (`WorkOrder.html`)
  if (aksiRpc === 'create_wo' && Array.isArray(dataObj.blocks) && dataObj.blocks.length > 0) {
    const kirimanId = String(dataObj.kiriman_id || opId);
    const sharedGroupMode = String(dataObj.blocks[0]?.wo_group_mode || dataObj.wo_group_mode || '').trim();
    const sharedGroupId = (sharedGroupMode && dataObj.blocks.length >= 2)
      ? String(dataObj.blocks[0]?.wo_group_id || `GRP-${kirimanId}`)
      : '';
    const created = [];
    const failed = [];
    for (let i = 0; i < dataObj.blocks.length; i++) {
      const blk = normalisasiBlokWo(dataObj.blocks[i] || {});
      if (sharedGroupId && !blk.wo_group_id) blk.wo_group_id = sharedGroupId;
      if (sharedGroupMode && !blk.wo_group_mode) blk.wo_group_mode = sharedGroupMode;
      if (sharedGroupId) blk.grup_total = dataObj.blocks.length;
      const subRes = await panggilRpcEksekusiAksi({
        p_token: cleanToken,
        p_aksi: 'create_wo',
        p_op_id: `${kirimanId}-${i + 1}`,
        p_payload: blk,
        p_skor_js: null,
      }, env);
      const compLbl = blk.component_name || blk.others_description || blk.job_id || blk.component_id || (subRes && subRes.result && subRes.result.component_name) || 'Pekerjaan';
      const unitLbl = blk.unit_id || (subRes && subRes.result && subRes.result.unit_id) || 'WORKSHOP';
      if (subRes && subRes.success && subRes.result) {
        created.push({
          ...subRes.result,
          index: i,
          component_id: blk.component_id || blk.job_id || '',
          component_name: compLbl,
          unit_id: unitLbl,
          label: `${compLbl} · ${unitLbl}`,
        });
      } else {
        failed.push({ index: i, component_id: blk.component_id || blk.job_id || '', unit_id: unitLbl, label: `${compLbl} · ${unitLbl}`, error: (subRes && subRes.error) || 'Gagal membuat baris WO' });
      }
    }
    return {
      success: failed.length === 0,
      source: 'SUPABASE',
      result: { created, failed, wo_id: created[0]?.wo_id, wo_number: created[0]?.wo_number },
      data: { created, failed, wo_id: created[0]?.wo_id, wo_number: created[0]?.wo_number },
    };
  }

  // 12. Validasi Hak Akses Approval
  if (aksiRpc === 'approve_l1') {
    const pingUser = await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env);
    const callerRole = String(pingUser?.result?.role || '').toLowerCase();
    if (callerRole === 'mechanic') {
      return {
        success: false,
        source: 'SUPABASE',
        error: 'Akses ditolak: Mekanik tidak memiliki hak akses approval',
      };
    }
  }

  // 12b. Khusus Approve L2: Supervisor (L1) DILARANG KERAS mengeksekusi L2!
  // Hitung Poin & Rupiah di JS (`src/domain/scoring.mjs`) sebelum simpan ke Supabase
  let skorJs = null;
  if (aksiRpc === 'approve_l2') {
    const pingUser = await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env);
    const callerRole = String(pingUser?.result?.role || '').toLowerCase();
    if (callerRole === 'supervisor' || (callerRole !== 'superintendent' && callerRole !== 'admin' && callerRole !== 'manager')) {
      return {
        success: false,
        source: 'SUPABASE',
        error: 'Akses ditolak: Hanya Superintendent (L2) yang berhak melakukan approval L2',
      };
    }
    const woId = String(dataObj.wo_id || dataObj.id || '').trim();
    if (woId) {
      try {
        const konteks = await panggilRpcSupabase(`${RPC_PREFIX}_konteks_skor_bertoken`, {
          p_token: cleanToken,
          p_wo_id: woId,
        }, env);
        if (konteks && konteks.success && konteks.result && konteks.result.wo) {
          skorJs = hitungSkorDanRupiahWo({
            rumah: RUMAH_KODE,
            wo: konteks.result.wo,
            factorsList: konteks.result.factors || [],
            baseSettingsList: konteks.result.base_settings || [],
            mechanicsList: konteks.result.mechanics || [],
            safetyIncident: Boolean(dataObj.safety_incident),
            mtbfRedoStatus: String(dataObj.mtbf_status || dataObj.mtbf_redo_status || 'first_time'),
          });
        }
      } catch (_) {}
    }
  }

  // Khusus save_override: hitung poin dan siapkan data override
  if (aksiRpc === 'save_override') {
    dataObj.wo_id = dataObj.wo_id || dataObj.id || ekstrakWoId(dataObj);
    dataObj.is_overridden = true;
    dataObj.has_override = true;
    if (dataObj.target_hours_jam !== undefined || dataObj.target_hours_menit !== undefined) {
      dataObj.target_hours = Number(dataObj.target_hours_jam || 0) + (Number(dataObj.target_hours_menit || 0) / 60);
    }
    if (dataObj.start_time && dataObj.end_time && !dataObj.actual_hours) {
      const stMs = new Date(dataObj.start_time).getTime();
      const etMs = new Date(dataObj.end_time).getTime();
      if (!isNaN(stMs) && !isNaN(etMs) && etMs > stMs) {
        dataObj.actual_hours = Number(((etMs - stMs) / 3600000).toFixed(2));
        dataObj.duration_hours = dataObj.actual_hours;
      }
    }
    const basePts = Number(dataObj.base_points || 1.0) || 1.0;
    const unitF = Number(dataObj.unit_factor || 1.0) || 1.0;
    const rawCond = String(dataObj.work_condition || 'normal').toLowerCase();
    const condF = (rawCond === 'extreme' || rawCond.includes('ekstrim') || rawCond.includes('resiko')) ? 1.2 : ((rawCond === 'difficult' || rawCond.includes('berat') || rawCond.includes('malam') || rawCond.includes('hujan')) ? 1.1 : 1.0);
    const calcPts = Math.round((basePts * unitF * condF) * 100) / 100;
    dataObj.final_points = (Number(dataObj.final_points) > 0) ? Number(dataObj.final_points) : calcPts;
    dataObj.final_idr = (Number(dataObj.final_idr) > 0) ? Number(dataObj.final_idr) : Math.round(dataObj.final_points * 2500);
    dataObj.points = dataObj.final_points;
    dataObj.override_reason = dataObj.override_reason || dataObj.judgment || dataObj.notes || 'Penyesuaian oleh approver';
  }

  // 13. Panggil RPC Eksekusi Aksi Tulis di Supabase
  const resRpc = await panggilRpcEksekusiAksi({
    p_token: cleanToken,
    p_aksi: aksiRpc,
    p_op_id: opId,
    p_payload: dataObj,
    p_skor_js: skorJs,
  }, env);

  if (aksiRpc === 'save_override' && resRpc && resRpc.success) {
    if (dataObj.and_approve) {
      const targetWoId = dataObj.wo_id || resRpc.wo_id || '';
      const pingUser = await panggilRpcSupabase(`${RPC_PREFIX}_ping`, { p_token: cleanToken }, env).catch(() => null);
      const callerRole = String(pingUser?.result?.role || dataObj.user_role || '').toLowerCase();
      const approveAksi = (callerRole === 'superintendent' || callerRole === 'manager') ? 'approve_l2' : 'approve_l1';
      try {
        await panggilRpcEksekusiAksi({
          p_token: cleanToken,
          p_aksi: approveAksi,
          p_op_id: 'ov-appr-' + Date.now(),
          p_payload: {
            wo_id: targetWoId,
            final_points: dataObj.final_points,
            final_idr: dataObj.final_idr,
            points: dataObj.final_points,
          },
          p_skor_js: null,
        }, env);
      } catch (_) {}
    }
    const ovResult = {
      wo_id: dataObj.wo_id || '',
      wo_number: dataObj.wo_id || '',
      is_overridden: true,
      and_approved: Boolean(dataObj.and_approve),
      base_points: dataObj.base_points,
      target_hours: dataObj.target_hours,
      actual_hours: dataObj.actual_hours,
      final_points: dataObj.final_points,
      final_idr: dataObj.final_idr,
      work_condition: dataObj.work_condition,
      override_reason: dataObj.override_reason,
      ...(resRpc.result || resRpc.data || {})
    };
    return {
      success: true,
      source: 'SUPABASE',
      result: ovResult,
      data: ovResult
    };
  }

  return resRpc;
}
export function ekstrakWoId(body) {
  if (!body) return '';
  if (typeof body === 'string') return body.trim();
  const d = body.data;
  if (typeof d === 'string' && d.trim().startsWith('WO-')) return d.trim();
  return (
    body.wo_id ||
    body.wo_number ||
    body.id ||
    (d && (d.wo_id || d.wo_number || d.id)) ||
    ''
  ).trim();
}

export function apakahWoLahirDiSupabase(woId) {
  if (!woId || typeof woId !== 'string') return false;
  const s = woId.trim().toUpperCase();
  if (s.startsWith('WO-SB-') || s.startsWith('WO-KMBP-') || s.startsWith('WO-SUM-') || s.startsWith('WO-KMB-') || s.startsWith('SB-')) return true;
  if (/^WO-\d{8}-\d{4}$/.test(s)) return true;
  return false;
}

export function apakahWoLamaDariGas(woId) {
  if (!woId || typeof woId !== 'string') return false;
  const s = woId.trim().toUpperCase();
  if (/^WO-\d{8}-\d{3}$/.test(s)) return true;
  return false;
}

export { eksekusiAksiSupabaseMandiri as eksekusiSupabaseBackendKmbp };
