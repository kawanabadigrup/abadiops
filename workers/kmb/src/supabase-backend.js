/**
 * Backend Mandiri Penuh Supabase untuk Rumah KMB Project
 * Sesuai docs/panduan_deploy_staging_kamis 2.md & AGENTS.md §1, §2
 *
 * Menggantikan seluruh peran GAS:
 * - Aksi baca & tulis dilayani langsung oleh Cloudflare Worker + Supabase RPC skema kmb_projek
 * - Mesin scoring JavaScript murni (1:1 ScoringService.gs)
 * - Penomoran WO 4-digit WIB (WO-YYYYMMDD-XXXX)
 */

import {
  buildPayrollWorkbook,
  uint8ArrayToBase64,
  formatDateId,
  formatTimeOnly,
  labelKondisi,
  getRateForJabatan,
} from './payroll-excel.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine, X-Abadi-Rumah',
};

// Ambang ketepatan waktu
const AMBANG_TEPAT_WAKTU = { ON_TIME_MAX: 100, LATE_MAX: 150 };

const FACTORS = {
  work_condition: { normal: 1.0, difficult: 1.1, extreme: 1.2 },
  timeliness: { on_time: 1.0, late: 0.8, way_late: 0.5 },
  safety: { no_incident: 1.0, incident: 0.0 },
  mtbf: { first_time: 1.2, redo: 0.8 },
};

function bulatkan(nilai, desimal = 2) {
  if (!Number.isFinite(nilai)) return 0;
  const f = 10 ** desimal;
  const skala = nilai * f;
  const koreksi = Math.abs(skala) * Number.EPSILON;
  return Math.round(skala + Math.sign(skala) * koreksi) / f;
}

function hitungSkorMandiri(m) {
  const actual = parseFloat(m.actualHours) || 0;
  const target = parseFloat(m.targetHours) || 0;
  let timeStatus = 'on_time';
  if (target > 0) {
    const rasio = (actual / target) * 100;
    if (rasio <= AMBANG_TEPAT_WAKTU.ON_TIME_MAX) timeStatus = 'on_time';
    else if (rasio <= AMBANG_TEPAT_WAKTU.LATE_MAX) timeStatus = 'late';
    else timeStatus = 'way_late';
  }

  const condFactor = (FACTORS.work_condition && FACTORS.work_condition[m.workCondition]) ?? 1.0;
  const timeFactor = (FACTORS.timeliness && FACTORS.timeliness[timeStatus]) ?? 1.0;
  const safeFactor = m.safetyIncident ? FACTORS.safety.incident : FACTORS.safety.no_incident;
  const mtbfFactor = (FACTORS.mtbf && FACTORS.mtbf[m.mtbfStatus || 'first_time']) ?? 1.0;

  const base = parseFloat(m.basePoints) || 0;
  const unit = parseFloat(m.unitFactor ?? 1.0) || 1.0;

  const finalPoints = bulatkan(base * unit * condFactor * timeFactor * safeFactor * mtbfFactor, 2);

  return {
    basePoints: base,
    unitFactor: unit,
    workConditionFactor: condFactor,
    timelinessFactor: timeFactor,
    safetyFactor: safeFactor,
    mtbfFactor: mtbfFactor,
    finalPoints,
  };
}

let cacheSaklar = { nilai: null, waktu: 0 };

export async function bacaStatusSaklar(env) {
  if (env.STORAGE_MODE === 'SUPABASE' || env.SAKLAR === 'supabase') {
    return 'supabase';
  }
  const sekarang = Date.now();
  if (cacheSaklar.nilai && cacheSaklar.waktu > sekarang) {
    return cacheSaklar.nilai;
  }
  let hasil = env.SAKLAR || 'gas';
  try {
    const isStaging = (env.GAS_URL && env.GAS_URL.includes('gas-tiruan')) || (env.RUMAH && env.RUMAH.includes('staging'));
    const url = isStaging
      ? 'https://abadiops-pintu-staging.kawanabadigrup.workers.dev/api/saklar/status'
      : 'https://abadiops.com/api/saklar/status';

    const fetcher = (env && env.PINTU && typeof env.PINTU.fetch === 'function')
      ? env.PINTU.fetch.bind(env.PINTU)
      : fetch;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetcher(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      const rKey = (env.RUMAH === 'kmb') ? 'kmbtra' : env.RUMAH;
      const val = data?.switches?.[rKey] || data?.switches?.[env.RUMAH];
      if (val) {
        hasil = val;
        cacheSaklar = { nilai: hasil, waktu: sekarang + 5000 };
      }
    }
  } catch (_) {}
  return hasil;
}

function normalisasiAksi(action) {
  const a = String(action || '').trim();
  const map = {
    'createWO': 'create_wo',
    'handleCreateWO': 'create_wo',
    'buat_wo': 'create_wo',
    'submitWork': 'submit_work',
    'handleSubmitMechanicWork': 'submit_work',
    'submitMechanicWork': 'submit_work',
    'submitWO': 'submit_work',
    'kirim_kerja': 'submit_work',
    'handleSupervisorApprove': 'approve_l1',
    'supervisorApprove': 'approve_l1',
    'handleSuperintendentApprove': 'approve_l2',
    'superintendentApprove': 'approve_l2',
    'handleSupervisorReject': 'reject',
    'supervisorReject': 'reject',
    'handleSuperintendentReject': 'reject',
    'superintendentReject': 'reject',
    'handleCancelWO': 'cancel_wo',
    'cancelWO': 'cancel_wo',
    'batalkan_wo': 'cancel_wo',
    'cancel_wo': 'cancel_wo',
    'handleDaftarCancelWo': 'pull_cancelable',
    'getDaftarCancelWo': 'pull_cancelable',
    'pull_cancelable': 'pull_cancelable',
    'daftarCancelWo': 'pull_cancelable',
    'handleSaveOverride': 'save_override',
    'saveOverride': 'save_override',
    'save_override': 'save_override',
    'overrideAndApprove': 'save_override',
    'override_and_approve': 'save_override',
    'override': 'save_override',
    'handleOverrideTargetHours': 'save_override',
    'handleApproveTransfer': 'approve_transfer',
    'handleRejectTransfer': 'reject_transfer',
    'getMyWos': 'pull_my_wos',
    'handleGetMyWos': 'pull_my_wos',
    'getWoDetailForMechanic': 'pull_wo_detail',
    'handleGetWoDetailForMechanic': 'pull_wo_detail',
    'getWODetails': 'pull_wo_detail',
    'handleMonitoringDetail': 'pull_wo_detail',
    'handleMonitoringDetailWo': 'pull_wo_detail',
    'getMonitoringDetailWo': 'pull_wo_detail',
    'generatePayrollReport': 'generate_payroll_report',
    'handleGeneratePayrollReport': 'generate_payroll_report',
    'generateReport': 'generate_payroll_report',
  };
  return map[a] || a;
}

const cacheRefsPerRumah = {};

async function ambilRefsUntukLookup(env, token, rpcPrefix, supaHeaders) {
  const sekarang = Date.now();
  const c = cacheRefsPerRumah[rpcPrefix];
  if (c && (sekarang - c.waktu < 300000) && c.data) {
    return c.data;
  }
  try {
    const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/${rpcPrefix}_create_refs_bertoken`;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({ p_token: token }),
    });
    if (res.ok) {
      const j = await res.json();
      const data = j.result || j.data || {};
      cacheRefsPerRumah[rpcPrefix] = { waktu: sekarang, data };
      return data;
    }
  } catch (_) {}
  return cacheRefsPerRumah[rpcPrefix]?.data || {};
}

function lengkapiDataBlokDenganRefs(b, refs) {
  if (!b || typeof b !== 'object') return {};
  const comps = (refs && refs.components) || [];
  const units = (refs && refs.units) || [];

  const compId = String(b.component_id || b.component_no || b.component || '').trim();
  const unitId = String(b.unit_id || b.unit_code || '').trim();

  const c = comps.find((x) =>
    (x.component_no && x.component_no.toUpperCase() === compId.toUpperCase()) ||
    (x.component_id && x.component_id.toUpperCase() === compId.toUpperCase())
  );
  const u = units.find((x) =>
    (x.unit_id && x.unit_id.toUpperCase() === unitId.toUpperCase()) ||
    (x.unit_code && x.unit_code.toUpperCase() === unitId.toUpperCase())
  );

  const rawCompName = b.component_name || b.component;
  const isUnknownComp = !rawCompName || rawCompName === 'UNKNOWN';
  const compName = (!isUnknownComp ? rawCompName : null) || c?.component_name || c?.component_no || b.others_description || b.keterangan || compId || 'Pekerjaan';

  const rawUnitName = b.unit_name || b.unit_code;
  const isUnknownUnit = !rawUnitName || rawUnitName === 'UNKNOWN';
  const unitName = (!isUnknownUnit ? rawUnitName : null) || u?.unit_name || unitId || 'WORKSHOP';

  const unitFactor = Number(b.unit_factor ?? b.others_unit_factor ?? b.manual_unit_factor ?? u?.unit_factor ?? 1.0);
  const basePoints = Number(b.base_points ?? b.others_base_points ?? b.manual_base_points ?? c?.base_points ?? c?.base_point ?? 1.0);
  const targetHours = Number(b.target_hours ?? b.others_target_hours ?? b.manual_target_hours ?? c?.target_hours ?? 2.0);
  const category = b.category || c?.category || 'General';

  return {
    ...b,
    unit_id: unitId || 'WORKSHOP',
    unit_code: unitId || 'WORKSHOP',
    unit_name: unitName,
    unit_factor: unitFactor,
    component_id: compId || 'COM-001',
    component_no: compId || 'COM-001',
    component: compName,
    component_name: compName,
    activity: b.activity || b.job_description || compName,
    job_description: b.job_description || b.activity || compName,
    base_points: basePoints,
    target_hours: targetHours,
    category: category,
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
      .filter((m) => m.mechanic_id && !['undefined', 'null'].includes(m.mechanic_id.toLowerCase()));
  }
  if (!b.lead_mechanic_id && Array.isArray(b.team) && b.team.length > 0) {
    b.lead_mechanic_id = b.team[0].mechanic_id;
  }
  return b;
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

/**
 * Eksekusi Backend Mandiri Supabase untuk Rumah KMB Project & Multi-Rumah
 */
export async function eksekusiSupabaseBackendKmbp(action, token, body, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }

  const cleanAksi = normalisasiAksi(action);
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Token tidak ditemukan',
      source: 'SUPABASE'
    }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const supaHeaders = {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  const rumah = (env.RUMAH || 'kmbtra').toLowerCase();
  const rpcPrefix = (rumah === 'sum') ? 'sum' : (rumah === 'kmbtra' || rumah === 'kmb') ? 'kmbtra' : 'kmb';
  const rpcUrl = `${env.SUPABASE_URL}/rest/v1/rpc/${rpcPrefix}_eksekusi_aksi_bertoken`;

  
  // Khusus loadJobsCatalog / getJobCatalogCached
  if (action === 'loadJobsCatalog' || action === 'getJobCatalogCached' || cleanAksi === 'getJobCatalogCached' || cleanAksi === 'loadJobsCatalog') {
    const rawSec = typeof body.data === 'string' ? body.data : (body.data?.section || body.section || (body.args && body.args[0]) || 'vessel');
    const sec = String(rawSec || 'vessel').toLowerCase().trim();

    try {
      const resRefs = await fetch(rpcUrl, {
        method: 'POST',
        headers: supaHeaders,
        body: JSON.stringify({
          p_token: cleanToken,
          p_aksi: 'pull_create_refs',
          p_op_id: (body.op_id || 'cat-' + Date.now()),
          p_payload: {},
          p_extra: null,
        }),
      });

      if (resRefs.ok) {
        const refsData = await resRefs.json();
        const rData = refsData && refsData.result ? refsData.result : (refsData && refsData.data ? refsData.data : {});
        const refs = (rData && rData.refs) ? rData.refs : rData;

        let jobs = [];
        if (sec === 'vessel') {
          jobs = refs.jobs_vessel || [];
        } else if (sec === 'maintenance' || sec === 'field') {
          jobs = refs.jobs_field || [];
        } else if (sec === 'workshop') {
          jobs = refs.jobs_workshop || [];
        } else {
          jobs = refs['jobs_' + sec] || refs.jobs_field || refs.jobs_vessel || [];
        }

        return new Response(JSON.stringify({
          success: true,
          data: { jobs, section: sec },
          result: { jobs, section: sec },
          jobs: jobs,
          source: 'SUPABASE'
        }), {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Abadi-Rumah': env.RUMAH || 'kmb',
            'X-Abadi-Jalur': 'supabase',
          },
        });
      }
    } catch (err) {
      console.warn('Gagal memuat katalog Supabase:', err);
    }
  }

  // Khusus cekStatusKiriman
  if (cleanAksi === 'cekStatusKiriman') {
    return new Response(JSON.stringify({
      success: true,
      keadaan: 'selesai',
      pesan: 'Kiriman selesai diproses di Supabase.',
      struk: { created: [] },
      source: 'SUPABASE'
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // Siapkan payload (gabungkan body dan body.data agar parameter tidak tercecer)
  let payload = (typeof body.data === 'object' && body.data !== null) ? { ...body, ...body.data } : (body.payload || body || {});
  if (typeof payload !== 'object' || payload === null) {
    payload = {};
  }
  if (body.override_data && typeof body.override_data === 'object') {
    payload = { ...payload, ...body.override_data };
  }

  if (cleanAksi === 'create_wo') {
    const refs = await ambilRefsUntukLookup(env, cleanToken, rpcPrefix, supaHeaders);
    payload = lengkapiDataBlokDenganRefs(normalisasiBlokWo(payload), refs);
    if (!payload.lead_mechanic_id && Array.isArray(payload.team) && payload.team.length > 0) {
      payload.lead_mechanic_id = payload.team[0].mechanic_id;
    }
  }

  if (['pull_wo_detail', 'getWODetails', 'getWoDetailForMechanic', 'handleGetWoDetailForMechanic', 'approve_l1', 'approve_l2', 'reject', 'cancel_wo', 'save_override', 'approve_transfer', 'reject_transfer'].includes(cleanAksi)) {
    payload.wo_id = payload.wo_id || payload.id || ekstrakWoId(body) || ekstrakWoId(payload);
    if (cleanAksi === 'cancel_wo') {
      payload.reason = payload.reason || payload.alasan || body.reason || body.alasan || 'Dibatalkan oleh pembuat';
    }
  }

  // Jika submit work, pastikan status & status_group disetel ke pending_approval
  if (cleanAksi === 'submit_work') {
    payload.status = payload.status || 'pending_supervisor';
    payload.status_group = 'pending_approval';
    payload.status_label = 'Menunggu Level 1';
    if (payload.actual_hours && payload.target_hours && !payload.final_points) {
      const skor = hitungSkorMandiri({
        basePoints: payload.base_points || payload.plan_points || 0,
        unitFactor: payload.unit_factor || 1.0,
        workCondition: payload.work_condition || 'normal',
        actualHours: payload.actual_hours,
        targetHours: payload.target_hours,
        safetyIncident: payload.safety_incident,
        mtbfStatus: payload.mtbf_status,
      });
      payload.final_points = skor.finalPoints;
      payload.points = skor.finalPoints;
    }
  }

  // Khusus approve L1: naikkan status ke Level 2
  if (cleanAksi === 'approve_l1') {
    payload.status = 'pending_superintendent';
    payload.status_group = 'pending_approval';
    payload.status_label = 'Menunggu Level 2';
  }

  // Khusus approve L2: hitung final points & final idr
  if (cleanAksi === 'approve_l2') {
    payload.status = 'approved';
    payload.status_group = 'done';
    payload.status_label = 'Approved';
    const basePts = Number(payload.base_points || payload.plan_points || 1.0) || 1.0;
    const unitF = Number(payload.unit_factor || 1.0) || 1.0;
    const rawCond = String(payload.work_condition || 'normal').toLowerCase();
    const condF = (rawCond === 'extreme' ? 1.2 : (rawCond === 'difficult' || rawCond === 'berat' ? 1.1 : 1.0));
    const calcPts = Math.round((basePts * unitF * condF) * 100) / 100;
    payload.final_points = (Number(payload.final_points) > 0) ? Number(payload.final_points) : calcPts;
    payload.final_idr = (Number(payload.final_idr) > 0) ? Number(payload.final_idr) : Math.round(payload.final_points * 2500);
    payload.points = payload.final_points;
  }

  // Khusus save_override: unpack override_data dan hitung poin live
  if (cleanAksi === 'save_override') {
    if (payload.override_data && typeof payload.override_data === 'object') {
      payload = { ...payload, ...payload.override_data };
    }
    payload.wo_id = payload.wo_id || payload.id || ekstrakWoId(body) || ekstrakWoId(payload);
    payload.is_overridden = true;
    payload.has_override = true;

    if (payload.target_hours_jam !== undefined || payload.target_hours_menit !== undefined) {
      payload.target_hours = Number(payload.target_hours_jam || 0) + (Number(payload.target_hours_menit || 0) / 60);
    }

    if (payload.start_time && payload.end_time && !payload.actual_hours) {
      const stMs = new Date(payload.start_time).getTime();
      const etMs = new Date(payload.end_time).getTime();
      if (!isNaN(stMs) && !isNaN(etMs) && etMs > stMs) {
        payload.actual_hours = Number(((etMs - stMs) / 3600000).toFixed(2));
        payload.duration_hours = payload.actual_hours;
      }
    }
    const basePts = Number(payload.base_points || 1.0) || 1.0;
    const unitF = Number(payload.unit_factor || 1.0) || 1.0;
    const rawCond = String(payload.work_condition || 'normal').toLowerCase();
    const condF = (rawCond === 'extreme' || rawCond.includes('ekstrim') || rawCond.includes('resiko')) ? 1.2 : ((rawCond === 'difficult' || rawCond.includes('berat') || rawCond.includes('malam') || rawCond.includes('hujan')) ? 1.1 : 1.0);
    const calcPts = Math.round((basePts * unitF * condF) * 100) / 100;
    payload.final_points = (Number(payload.final_points) > 0) ? Number(payload.final_points) : calcPts;
    payload.final_idr = (Number(payload.final_idr) > 0) ? Number(payload.final_idr) : Math.round(payload.final_points * 2500);
    payload.points = payload.final_points;
    payload.override_reason = payload.override_reason || payload.judgment || payload.notes || 'Penyesuaian oleh approver';
  }

  try {
    // 1. Batch creation jika ada blocks (format form Web WorkOrder.html)
    const blocks = payload.blocks || (payload.data && payload.data.blocks);
    if (cleanAksi === 'create_wo' && Array.isArray(blocks) && blocks.length > 0) {
      const refs = await ambilRefsUntukLookup(env, cleanToken, rpcPrefix, supaHeaders);
      const created = [];
      const failed = [];
      for (let i = 0; i < blocks.length; i++) {
        const rawB = normalisasiBlokWo(blocks[i]);
        const b = lengkapiDataBlokDenganRefs(rawB, refs);
        const blockPayload = {
          unit_id: b.unit_id,
          unit_code: b.unit_id,
          unit_name: b.unit_name,
          unit_factor: b.unit_factor,
          component_id: b.component_id,
          component_no: b.component_id,
          component: b.component,
          component_name: b.component_name,
          activity: b.activity,
          job_description: b.job_description,
          category: b.category,
          lead_mechanic_id: b.lead_mechanic_id || (b.team && b.team[0] && b.team[0].mechanic_id) || '',
          shift: b.shift || payload.shift || '1',
          work_condition: b.work_condition || 'normal',
          duration_hours: b.duration_hours || b.actual_hours || 0,
          target_hours: b.target_hours,
          base_points: b.base_points,
          team: b.team || [],
          keterangan: b.keterangan || '',
          data: b
        };
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({
            p_token: cleanToken,
            p_aksi: 'create_wo',
            p_op_id: (body.op_id || 'op-' + Date.now()) + '-' + (i + 1),
            p_payload: blockPayload,
            p_extra: body.extra || null,
          }),
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.success && resData.result) {
            const woNum = resData.result.wo_number || resData.result.id;
            created.push({
              wo_number: woNum,
              wo_id: woNum,
              id: woNum,
              unit_id: b.unit_id,
              unit_name: b.unit_name,
              component: b.component,
              component_name: b.component_name,
              activity: b.activity,
              status: resData.result.status || 'assigned'
            });
          } else {
            failed.push({ index: i, error: (resData && resData.error) || 'Gagal membuat WO' });
          }
        } else {
          const errText = await res.text();
          failed.push({ index: i, error: errText });
        }
      }

      return new Response(JSON.stringify({
        success: created.length > 0,
        data: {
          wo_id: created[0]?.wo_number || '',
          id: created[0]?.wo_number || '',
          created: created,
          failed: failed,
        },
        result: {
          wo_id: created[0]?.wo_number || '',
          id: created[0]?.wo_number || '',
          created: created,
          status: created[0]?.status || 'assigned',
        },
        source: 'SUPABASE'
      }), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'kmb',
          'X-Abadi-Jalur': 'supabase',
        },
      });
    }

    // 1.5 Penanganan laporan insentif / payroll (Reports)
    if (cleanAksi === 'generate_payroll_report') {
      const approvedRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: supaHeaders,
        body: JSON.stringify({
          p_token: cleanToken,
          p_aksi: 'pull_approved',
          p_op_id: 'report-' + Date.now(),
          p_payload: {},
          p_extra: null,
        }),
      });

      let allApproved = [];
      if (approvedRes.ok) {
        const approvedData = await approvedRes.json();
        allApproved = Array.isArray(approvedData.result)
          ? approvedData.result
          : (approvedData.result?.approved || approvedData.result?.wos || (Array.isArray(approvedData) ? approvedData : []));
      }

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
        const dateStr = w.approved_l2_at || w.superintendent_approved_at || w.approved_at || w.submitted_at || w.created_at;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        if (d < startDate || d > endDate) return false;
        if (sectionFilter && sectionFilter !== 'all') {
          if (String(w.section || '').toLowerCase() !== sectionFilter) return false;
        }
        return true;
      });

      // Load refs untuk metadata mekanik
      const refs = await ambilRefsUntukLookup(env, cleanToken, rpcPrefix, supaHeaders);
      const mechsList = (refs && refs.mechanics) || [];
      const allMechanics = {};
      for (const m of mechsList) {
        if (m.mechanic_id) allMechanics[m.mechanic_id] = m;
      }

      const now = new Date();
      const generatedAt = `${formatDateId(now)} ${now.toLocaleTimeString('id-ID')}`;

      const detailRows = [];
      const mechanicMap = {};

      for (const w of matchingWos) {
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
            tgl_submit: formatDateId(w.submitted_at || w.created_at),
            tgl_approved: formatDateId(w.approved_l2_at || w.superintendent_approved_at || w.approved_at || w.created_at),
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

      detailRows.sort((a, b) => {
        if (a.mechanic_name < b.mechanic_name) return -1;
        if (a.mechanic_name > b.mechanic_name) return 1;
        if (a.wo_number < b.wo_number) return -1;
        if (a.wo_number > b.wo_number) return 1;
        return 0;
      });

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
          total_wos: matchingWos.length,
          total_idr: Math.round(grandTotalIdr),
          total_points: Number(grandTotalPoints.toFixed(2)),
        },
        dikecualikan: { baris: 0, nama: [] },
        filename: filename,
        file_b64: fileB64,
        download_url: '#',
        wos: matchingWos,
        total_wo: matchingWos.length,
        generated_at: now.toISOString(),
      };

      return new Response(JSON.stringify({
        success: true,
        source: 'SUPABASE',
        result: reportOut,
        data: reportOut,
      }), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'kmb',
          'X-Abadi-Jalur': 'supabase',
        },
      });
    }

    // 2. Pemanggilan tunggal standar via RPC
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify({
        p_token: cleanToken,
        p_aksi: cleanAksi,
        p_op_id: body.op_id || body.client_op_id || ('op-' + Date.now()),
        p_payload: payload,
        p_extra: body.extra || null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Format respon agar kompatibel penuh dengan Web Desktop & PWA
      if (cleanAksi === 'create_wo' && data.success && data.result) {
        const woNum = data.result.wo_number || data.result.id;
        const singleCreated = [{
          wo_number: woNum,
          wo_id: woNum,
          id: woNum,
          unit_id: payload.unit_code || payload.unit_id || '',
          component: payload.component || '',
          activity: payload.activity || payload.job_description || '',
          status: data.result.status || 'assigned'
        }];
        data.data = {
          wo_id: woNum,
          id: woNum,
          created: singleCreated,
          failed: []
        };
      } else if (cleanAksi === 'pull_create_refs' && data.result) {
        data.data = (data.result && data.result.refs) ? data.result.refs : data.result;
      } else if (['pull_wo_detail', 'getWODetails', 'getWoDetailForMechanic'].includes(cleanAksi) && data.result) {
        const woObj = data.result.wo || data.result;
        const teamArr = woObj.team || data.result.team || [];
        const fullDetail = { ...woObj, wo: woObj, team: teamArr };
        data.result = fullDetail;
        data.data = fullDetail;
      } else if (cleanAksi === 'submit_work' && data.success) {
        let actHours = 0;
        if (payload.start_time && payload.end_time) {
          const s = new Date(payload.start_time).getTime();
          const e = new Date(payload.end_time).getTime();
          if (!isNaN(s) && !isNaN(e) && e > s) {
            actHours = Math.round(((e - s) / 3600000) * 100) / 100;
          }
        }
        if (!actHours) {
          actHours = Number(payload.duration_hours || payload.actual_hours || 0.25);
        }
        const submitData = {
          wo_id: payload.wo_id || data.wo_id || '',
          wo_number: payload.wo_id || data.wo_id || '',
          status: 'pending_supervisor',
          status_group: 'pending_approval',
          status_label: 'Menunggu Level 1',
          actual_hours: actHours,
          duration_hours: actHours,
          ...(data.data || data.result || {})
        };
        data.data = submitData;
        data.result = submitData;
      } else if (cleanAksi === 'approve_l1' && data.success) {
        const l1Data = {
          wo_id: payload.wo_id || data.wo_id || '',
          wo_number: payload.wo_id || data.wo_id || '',
          status: 'pending_superintendent',
          status_group: 'pending_approval',
          status_label: 'Menunggu Level 2',
          ...(data.data || data.result || {})
        };
        data.data = l1Data;
        data.result = l1Data;
      } else if (cleanAksi === 'approve_l2' && data.success) {
        const l2Data = {
          wo_id: payload.wo_id || data.wo_id || '',
          wo_number: payload.wo_id || data.wo_id || '',
          status: 'approved',
          status_group: 'done',
          status_label: 'Approved',
          final_points: payload.final_points || 2.5,
          final_idr: payload.final_idr || 6250,
          points: payload.final_points || 2.5,
          ...(data.data || data.result || {})
        };
        data.data = l2Data;
        data.result = l2Data;
      } else if (cleanAksi === 'save_override' && data.success) {
        if (payload.and_approve) {
          const targetWoId = payload.wo_id || data.wo_id || '';
          const approveAksi = (body.user_role === 'superintendent' || payload.role === 'superintendent') ? 'approve_l2' : 'approve_l1';
          try {
            await fetch(rpcUrl, {
              method: 'POST',
              headers: supaHeaders,
              body: JSON.stringify({
                p_token: cleanToken,
                p_aksi: approveAksi,
                p_op_id: 'ov-appr-' + Date.now(),
                p_payload: {
                  wo_id: targetWoId,
                  final_points: payload.final_points,
                  final_idr: payload.final_idr,
                  points: payload.final_points,
                },
                p_extra: null,
              }),
            });
          } catch (_) {}
        }
        const ovResult = {
          wo_id: payload.wo_id || data.wo_id || '',
          wo_number: payload.wo_id || data.wo_id || '',
          is_overridden: true,
          and_approved: Boolean(payload.and_approve),
          base_points: payload.base_points,
          target_hours: payload.target_hours,
          actual_hours: payload.actual_hours,
          final_points: payload.final_points,
          final_idr: payload.final_idr,
          work_condition: payload.work_condition,
          override_reason: payload.override_reason,
          ...(data.data || data.result || {})
        };
        data.data = ovResult;
        data.result = ovResult;
      } else if (cleanAksi === 'pull_cancelable' && data.result) {
        const rawList = Array.isArray(data.result) ? data.result : (data.result.wos || data.result.cancelable || []);
        const cancelableList = rawList.filter(w => {
          const st = String(w.status || '').toLowerCase().trim();
          const sg = String(w.status_group || '').toLowerCase().trim();
          return !['approved', 'done', 'cancelled', 'canceled', 'rejected', 'batal'].includes(st) && sg !== 'done' && sg !== 'rejected';
        }).map(w => {
          const compName = w.component_name || w.component || w.activity || w.job_description || 'Pekerjaan';
          const unitName = w.unit_name || w.unit_code || w.unit_id || 'WORKSHOP';
          const st = String(w.status || 'assigned').toLowerCase().trim();
          const sl = (st === 'assigned' || st === 'pending_mechanic_work') ? 'Belum Dikerjakan'
            : (st === 'in_progress') ? 'Sedang Dikerjakan'
            : (st === 'pending_transfer') ? 'Menunggu Transfer'
            : (st === 'pending_supervisor' || st === 'pending_l1') ? 'Menunggu Approval L1'
            : (st === 'pending_superintendent' || st === 'pending_l2') ? 'Menunggu Approval L2'
            : (w.status_label || w.status || 'Aktif');
          let tNames = [];
          if (Array.isArray(w.team)) {
            tNames = w.team.map(m => m.mechanic_name || m.name || m.mechanic_id).filter(Boolean);
          } else if (w.lead_mechanic_id) {
            tNames = [w.lead_mechanic_name || w.lead_mechanic_id];
          }
          return {
            ...w,
            id: w.wo_number || w.id,
            wo_number: w.wo_number || w.id,
            status: st,
            status_label: sl,
            component_name: compName,
            unit_name: unitName,
            location: (w.location === 'field' ? 'Field' : 'Workshop'),
            team_names: tNames,
            created_at: w.created_at || w.date || '',
            created_by_name: w.created_by_name || (w.created_by ? String(w.created_by).split('@')[0] : 'Creator'),
            submitted_at: w.submitted_at || '',
            submitted_by_name: w.submitted_by_name || (w.submitted_by ? String(w.submitted_by).split('@')[0] : ''),
          };
        });
        data.data = cancelableList;
        data.result = cancelableList;
      } else if (cleanAksi === 'cancel_wo' && data.success) {
        const cData = {
          wo_id: payload.wo_id || data.wo_id || '',
          wo_number: payload.wo_id || data.wo_id || '',
          status: 'cancelled',
          status_group: 'rejected',
          status_label: 'Dibatalkan',
          reason: payload.reason || 'Dibatalkan oleh pembuat',
          ...(data.data || data.result || {})
        };
        data.data = cData;
        data.result = cData;
      } else if (cleanAksi === 'pull_my_wos' && data.result) {
        const rawWos = data.result.wos || (Array.isArray(data.result) ? data.result : []);
        const activeOnly = rawWos.filter(w => {
          const st = String(w.status || '').toLowerCase().trim();
          const sg = String(w.status_group || '').toLowerCase().trim();
          return !['cancelled', 'canceled', 'rejected', 'batal'].includes(st) && sg !== 'rejected';
        });
        if (data.result.wos) {
          data.result.wos = activeOnly;
        } else if (Array.isArray(data.result)) {
          data.result = activeOnly;
        }
        data.data = data.result;
      } else if (!data.data && data.result) {
        data.data = data.result;
      } else if (!data.data) {
        data.data = { ...data };
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Abadi-Rumah': env.RUMAH || 'kmb',
          'X-Abadi-Jalur': 'supabase',
        },
      });
    }

    const errText = await res.text();
    return new Response(JSON.stringify({
      success: false,
      error: `Supabase RPC gagal: ${errText}`,
      source: 'SUPABASE'
    }), {
      status: res.status >= 400 && res.status < 500 ? res.status : 500,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Kesalahan backend Supabase: ' + ((err && err.message) || err),
      source: 'SUPABASE'
    }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

export const eksekusiSupabaseBackendKmb = eksekusiSupabaseBackendKmbp;
export const eksekusiSupabaseBackendSum = eksekusiSupabaseBackendKmbp;
