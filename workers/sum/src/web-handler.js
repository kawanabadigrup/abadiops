/**
 * Web Desktop Handler untuk Cloudflare Workers
 * Menyajikan antarmuka desktop 1:1 GAS dan jembatan API google.script.run
 */

import { renderWebPage } from './web-templates.js';
import {
  eksekusiSupabaseBackendSum,
  bacaStatusSaklar,
  ekstrakWoId,
  apakahWoLahirDiSupabase,
  apakahWoLamaDariGas
} from './supabase-backend.js';
import { cekBukuTamu, catatBukuTamu } from './buku-tamu.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Active-Engine, X-Abadi-Rumah',
};

const ROUTER_ACTIONS = new Set([
  'createWO', 'startWO', 'finishWO', 'submitWO',
  'getMyWos', 'getWoDetailForMechanic', 'submitMechanicWork',
  'handleSubmitMechanicWork', 'submitWork', 'submit_work', 'kirim_kerja',
  'handleRequestTransfer', 'requestTransfer', 'request_transfer', 'minta_transfer',
  'reportExpiredWO', 'report_expired',
  'siapkanFormTyre', 'dataDashboardTeknis', 'dataDashboardField',
  'riwayatHmUnit', 'koreksiHmWo', 'gantiPanelHm',
  'riwayatKmUnit', 'koreksiKmWo', 'gantiPanelKm',
  'supervisorApprove', 'handleSupervisorApprove',
  'supervisorReject', 'handleSupervisorReject',
  'superintendentApprove', 'handleSuperintendentApprove',
  'superintendentReject', 'handleSuperintendentReject',
  'handleCancelWO', 'cancelWO', 'cancel_wo', 'batalkan_wo',
  'handleDaftarCancelWo', 'getDaftarCancelWo', 'pull_cancelable', 'daftarCancelWo',
  'handleOverrideTargetHours', 'handleSaveOverride', 'save_override', 'saveOverride', 'overrideAndApprove', 'override_and_approve',
  'handleApproveTransfer', 'handleRejectTransfer',
  'handleKembalikanKeMekanik', 'handleBulkApprove',
  'loadJobsCatalog', 'getJobCatalogCached',
  'handleCreateWO', 'cekStatusKiriman',
  'getWODetails',
  'generatePayrollReport', 'generateReport',
]);

function formatTanggalWIB(rawDate) {
  if (!rawDate) return '-';
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return String(rawDate);
    const wib = new Date(d.getTime() + (7 * 3600000));
    const bulanList = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const tgl = wib.getUTCDate();
    const bln = bulanList[wib.getUTCMonth()];
    const thn = wib.getUTCFullYear();
    const jam = String(wib.getUTCHours()).padStart(2, '0');
    const mnt = String(wib.getUTCMinutes()).padStart(2, '0');
    return tgl + ' ' + bln + ' ' + thn + ' ' + jam + ':' + mnt;
  } catch (_) {
    return String(rawDate);
  }
}

const NAMA_MEKANIK_KNOWN = {
  'VES-004': 'Rahmat', 'VES-005': 'Aji Laksono', 'VES-007': 'Bayu Aji', 'VES-008': 'Dimas',
  'VES-009': 'Cahyo Aji', 'VES-010': 'Aditya', 'VES-011': 'Yudo Hardianto', 'VES-012': 'Gusti Raka Pamungkas',
  'VES-013': 'Nicko Herman Saputra', 'VES-014': 'Wahmi Yogo Prastowo',
  'MNT-002': 'Mekanik Maintenance 2', 'MNT-003': 'Afid Irham', 'MNT-004': 'M. Riyanto',
  'MNT-005': 'Wiwit', 'MNT-006': 'Eliyadi', 'MNT-007': 'Aldo Noviansyah', 'MNT-008': 'Rido Saputra',
  'MNT-009': 'Alan Rohim', 'MNT-010': 'Bagus Wahyu Nurcahyo', 'MNT-011': 'Regista Pratama',
  'MNT-012': 'Khoirul Musthofa', 'MNT-013': 'Syukur Kurniadi', 'GW-user': 'ra',
  'MECH-SVP-005': 'Mekanik SVP 05', 'MECH-SVP-028': 'Mekanik SVP 28', 'MECH-01': 'Mekanik',
  'MECH-SUM-001': 'Mekanik SUM Utama', 'SPV-SUM-001': 'Supervisor SUM',
  'MECH-TRA-001': 'Mekanik TRA Utama', 'SPV-TRA-001': 'Supervisor TRA',
  'MECH-KMBP-001': 'Mekanik Project Utama', 'SPV-KMBP-001': 'Supervisor KMB Project',
  'UJI-01': 'raka l2', 'UJI-ADM-001': 'Uji Supervisor Staging',
};

function resolveNamaMekanik(idOrName, mechMap) {
  if (!idOrName) return '';
  const s = String(idOrName).trim();
  if (mechMap && typeof mechMap.get === 'function' && mechMap.get(s)) return mechMap.get(s);
  if (mechMap && typeof mechMap.get === 'function' && mechMap.get(s.toUpperCase())) return mechMap.get(s.toUpperCase());
  if (NAMA_MEKANIK_KNOWN[s]) return NAMA_MEKANIK_KNOWN[s];
  if (NAMA_MEKANIK_KNOWN[s.toUpperCase()]) return NAMA_MEKANIK_KNOWN[s.toUpperCase()];
  return s;
}

function lengkapiObjekWoWeb(w, mechMap) {
  if (!w || typeof w !== 'object') return {};
  const d = (w.data && typeof w.data === 'object') ? w.data : {};
  const id = String(w.id || w.wo_id || w.wo_number || d.id || d.wo_id || d.wo_number || 'WO-0');
  const wo_number = String(w.wo_number || d.wo_number || id);

  const rawStatus = w.status || d.status || 'pending_mechanic_work';
  const st = String(rawStatus).toLowerCase().trim();
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
    if (st === 'pending_l2' || st === 'pending_superintendent') sl = 'Menunggu Level 2';
    else if (st === 'pending_l1' || st === 'pending_supervisor') sl = 'Menunggu Level 1';
    else if (st === 'pending_transfer') sl = 'Menunggu Transfer';
    else sl = 'Menunggu Approval';
  } else {
    sl = 'Perlu Diisi Mekanik';
  }

  const validOrEmpty = (str) => {
    const s = String(str || '').trim();
    return (s && s.toUpperCase() !== 'UNKNOWN' && s.toUpperCase() !== 'UNDEFINED' && s !== '-') ? s : '';
  };

  const unitObj = (w.unit && typeof w.unit === 'object') ? w.unit : {};
  const unit_id = validOrEmpty(w.unit_id) || validOrEmpty(w.unit_code) || validOrEmpty(unitObj.unit_id) || 'WORKSHOP';
  const unit_name = validOrEmpty(w.unit_name) || validOrEmpty(unitObj.unit_name) || unit_id;
  const unit_factor = Number(w.unit_factor ?? unitObj.unit_factor ?? 1.0);

  const compObj = (w.component && typeof w.component === 'object') ? w.component : {};
  const compStr = typeof w.component === 'string' ? w.component : '';
  const component_id = validOrEmpty(w.component_id) || validOrEmpty(compObj.component_no) || validOrEmpty(compObj.component_id) || validOrEmpty(compStr) || validOrEmpty(w.job_id) || 'COM-001';
  const component_name = validOrEmpty(w.component_name) ||
    validOrEmpty(compObj.component_name) ||
    validOrEmpty(compStr) ||
    validOrEmpty(w.others_description) ||
    validOrEmpty(w.activity) ||
    validOrEmpty(w.job_description) ||
    validOrEmpty(component_id) ||
    'Pekerjaan';
  // Override Overlay (Prioritaskan nilai override jika WO telah di-override)
  const rawOv = (d.override && typeof d.override === 'object')
    ? d.override
    : ((w.override && typeof w.override === 'object')
      ? w.override
      : ((d.override_data && typeof d.override_data === 'object')
        ? d.override_data
        : ((w.override_data && typeof w.override_data === 'object') ? w.override_data : null)));
  const ov = rawOv ? { ...(typeof rawOv.override_data === 'object' ? rawOv.override_data : {}), ...rawOv } : null;

  const is_overridden = Boolean(ov || w.is_overridden || d.is_overridden || w.has_override || d.has_override);
  const override_reason = String((ov && (ov.override_reason || ov.judgment || ov.catatan || ov.notes)) || w.override_reason || d.override_reason || '').trim();
  const overridden_by = String((ov && ov.overridden_by) || d.override_by || w.override_by || '').trim();
  const overridden_at = String((ov && ov.overridden_at) || d.override_at || w.override_at || '').trim();

  let base_points = Number((ov && ov.base_points) ?? w.base_points ?? w.points ?? compObj.base_points ?? 1.0);
  let target_hours = Number((ov && ov.target_hours) ?? w.target_hours ?? compObj.target_hours ?? 2.0);
  let effective_base_points = Number(base_points);
  let effective_target_hours = Number(target_hours);

  // Normalisasi kondisi kerja & faktor pengali
  const rawCond = String((ov && ov.work_condition) || w.work_condition || d.work_condition || 'normal').toLowerCase();
  let cond_factor = 1.0;
  let work_condition = 'Normal';
  if (rawCond === 'extreme' || rawCond.includes('ekstrim') || rawCond.includes('resiko tinggi')) {
    cond_factor = 1.2;
    work_condition = 'Resiko Tinggi';
  } else if (rawCond === 'difficult' || rawCond.includes('berat') || rawCond.includes('malam') || rawCond.includes('hujan')) {
    cond_factor = 1.1;
    work_condition = 'Malam/Hujan';
  }

  // Jam kerja aktual
  let actual_hours = Number((ov && ov.actual_hours) ?? w.actual_hours ?? d.actual_hours ?? w.duration_hours ?? d.duration_hours);
  if (!Number.isFinite(actual_hours) || actual_hours < 0) actual_hours = 0;
  if (actual_hours <= 0 && ((ov && ov.start_time && ov.end_time) || (w.start_time && w.end_time))) {
    const s = new Date((ov && ov.start_time) || w.start_time).getTime();
    const e = new Date((ov && ov.end_time) || w.end_time).getTime();
    if (!isNaN(s) && !isNaN(e) && e > s) {
      actual_hours = Math.round(((e - s) / 3600000) * 100) / 100;
    }
  }
  if ((!actual_hours || actual_hours <= 0) && (st === 'approved' || sg === 'done')) {
    actual_hours = target_hours;
  }

  // Poin & Rupiah (Pastikan tidak pernah 0 atau kosong di UI!)
  let rawFinalPts = Number((ov && ov.final_points) ?? w.final_points ?? d.final_points ?? w.points ?? d.points);
  let final_points = (Number.isFinite(rawFinalPts) && rawFinalPts > 0) ? rawFinalPts : Math.round((base_points * unit_factor * cond_factor) * 100) / 100;
  if (!final_points || final_points <= 0) final_points = 1.0;

  let rawFinalIdr = Number((ov && ov.final_idr) ?? w.final_idr ?? d.final_idr);
  let final_idr = (Number.isFinite(rawFinalIdr) && rawFinalIdr > 0) ? rawFinalIdr : Math.round(final_points * 2500);
  if (!final_idr || final_idr <= 0) final_idr = Math.round(final_points * 2500);

  // Tim & Pembagian Poin / IDR
  let team = (ov && Array.isArray(ov.team) && ov.team.length > 0)
    ? ov.team
    : (Array.isArray(w.team) ? w.team : (Array.isArray(d.team) ? d.team : (Array.isArray(w.effective_team) ? w.effective_team : [])));
  const teamDist = w.team_distribution || d.team_distribution;
  if (!team.length && teamDist && typeof teamDist === 'object') {
    team = Object.entries(teamDist).map(([mid, pct]) => ({
      mechanic_id: String(mid).trim(),
      mechanic_name: resolveNamaMekanik(mid, mechMap),
      name: resolveNamaMekanik(mid, mechMap),
      percentage: Number(pct) || 100,
    }));
  }
  const rawTm = w.team_members || d.team_members;
  if (!team.length && rawTm) {
    if (typeof rawTm === 'string') {
      try {
        const parsed = JSON.parse(rawTm);
        if (Array.isArray(parsed)) {
          team = parsed.map(p => typeof p === 'string' ? { mechanic_id: p, mechanic_name: p, name: p, percentage: 100 } : p);
        }
      } catch (_) {
        team = rawTm.split(',').map(s => s.trim()).filter(Boolean).map(name => ({
          mechanic_id: name, mechanic_name: name, name: name, percentage: 100
        }));
      }
    } else if (Array.isArray(rawTm)) {
      team = rawTm.map(p => typeof p === 'string' ? { mechanic_id: p, mechanic_name: p, name: p, percentage: 100 } : p);
    }
  }
  const leadId = w.lead_mechanic_id || d.lead_mechanic_id || w.mechanic_id || d.mechanic_id;
  const leadName = w.mechanic_name || d.mechanic_name || w.lead_mechanic_name || d.lead_mechanic_name || (w.created_by ? String(w.created_by).split('@')[0] : '') || (w.submitted_by ? String(w.submitted_by).split('@')[0] : '') || leadId;
  if (!team.length && leadName) {
    const resolvedLead = resolveNamaMekanik(leadName, mechMap);
    team = [{ mechanic_id: String(leadId || leadName), mechanic_name: String(resolvedLead), name: String(resolvedLead), percentage: 100 }];
  }
  if (!team.length) {
    team = [{ mechanic_id: 'MECH-01', mechanic_name: 'Mekanik', name: 'Mekanik', percentage: 100 }];
  }

  const memberCount = Math.max(1, team.length);
  team = team.map((m) => {
    const pct = Number(m.percentage ?? (100 / memberCount));
    const mPoints = Math.round((final_points * (pct / 100)) * 100) / 100;
    const mRole = String(m.role || m.position || '').toLowerCase();
    const mRate = (mRole.includes('sr') || mRole.includes('senior')) ? 3000 : 2500;
    const mIdr = Math.round(mPoints * mRate);
    const mRawName = String(m.mechanic_name || m.name || m.mechanic_id || m.id || 'Mekanik').trim();
    const mName = resolveNamaMekanik(mRawName, mechMap);
    return {
      ...m,
      mechanic_id: String(m.mechanic_id || m.id || mName),
      mechanic_name: mName,
      name: mName,
      percentage: pct,
      share_points: mPoints,
      share_idr: mIdr,
      formatted_label: mName + ' (' + mPoints + ' pts · Rp ' + String(mIdr).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ')'
    };
  });

  const team_names = team.map(m => m.formatted_label);
  const rawCreatedAt = w.created_at || d.created_at || w.date || d.date || w.submitted_at || d.submitted_at;
  const created_at_str = formatTanggalWIB(rawCreatedAt);

  return {
    ...d,
    ...w,
    id,
    wo_id: id,
    wo_number,
    status: st,
    status_group: sg,
    status_label: sl,
    boleh_kirim: sg === 'assigned',
    unit_id,
    unit_code: unit_id,
    unit_name,
    unit_factor,
    unit: {
      unit_id,
      unit_name,
      unit_factor,
    },
    component_id,
    component_name,
    base_points,
    target_hours,
    effective_base_points,
    effective_target_hours,
    actual_hours,
    work_condition,
    final_points,
    final_idr,
    points: final_points,
    is_overridden,
    has_override: is_overridden,
    override_reason,
    overridden_by,
    overridden_at,
    component: {
      component_no: component_id,
      component_id,
      component_name,
      category: String(compObj.category || w.section || d.section || 'General'),
      base_points,
      target_hours,
    },
    team,
    effective_team: team,
    team_names,
    team_count: team.length,
    mechanics: team.map(m => m.mechanic_name || m.name).filter(Boolean).join(', ') || resolveNamaMekanik(leadName, mechMap) || resolveNamaMekanik(leadId, mechMap) || '-',
    created_by_name: (() => {
      let rawCreator = w.created_by_name || d.created_by_name || w.created_by || d.created_by || w.creator_name || d.creator_name || w.requester || d.requester || w.foreman || d.foreman || w.supervisor || d.supervisor || w.approved_by_l1 || d.approved_by_l1 || '';
      let res = '';
      if (rawCreator) {
        let s = String(rawCreator).trim();
        if (s.includes('@')) s = s.split('@')[0];
        res = resolveNamaMekanik(s, mechMap) || s;
      }
      return res || (w.submitted_by ? String(w.submitted_by).split('@')[0] : '') || 'PIC Lapangan';
    })(),
    created_at: (() => {
      let raw = w.created_at || d.created_at || w.date || d.date || w.submitted_at || d.submitted_at || '';
      let dt = raw ? new Date(raw) : null;
      if (!dt || isNaN(dt.getTime())) {
        const match = String(wo_number).match(/WO-(\d{4})(\d{2})(\d{2})/i);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
        return new Date().toISOString().slice(0, 10);
      }
      return raw;
    })(),
    created_at_str,
    judgment: (() => {
      let rawJd = String((ov && (ov.judgment || ov.override_reason || ov.catatan || ov.notes)) || w.judgment || d.judgment || w.evaluation || d.evaluation || override_reason || '').trim();
      if (!rawJd) {
        if (actual_hours > 0 && target_hours > 0) {
          if (actual_hours <= 0.8 * target_hours) rawJd = 'Fast (Efisien)';
          else if (actual_hours <= target_hours) rawJd = 'On Target';
          else {
            const diff = Math.round((actual_hours - target_hours) * 10) / 10;
            rawJd = `Overtime (+${diff} jam)`;
          }
        } else if (st === 'approved' || sg === 'done') {
          rawJd = 'Sesuai Target';
        } else {
          rawJd = '—';
        }
      }
      return rawJd;
    })(),
  };
}

export async function handleWebRequest(request, env, url) {
  const token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    return new Response(renderPesanWeb('Perlu Token', 'Token autentikasi tidak ditemukan. Silakan masuk melalui pintu resmi.', 'https://abadiops.com', 'Buka Pintu abadiops.com'), {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 1. Verifikasi token via ping
  const pingRes = await panggilAksiInternal('ping', token, {}, env);
  if (!pingRes || (!pingRes.success && !pingRes.email && !pingRes.mechanic_id)) {
    const errMsg = (pingRes && (pingRes.error || (pingRes.error && pingRes.error.message))) || 'Token tidak dikenal atau nonaktif.';
    return new Response(renderPesanWeb('Akses Ditolak', errMsg, 'https://abadiops.com', 'Kembali ke Pintu'), {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const role = pingRes.role || (pingRes.result && pingRes.result.role) || 'supervisor';
  const email = pingRes.email || (pingRes.result && pingRes.result.email) || '';
  const name = pingRes.name || pingRes.mechanic_name || (pingRes.result && pingRes.result.name) || pingRes.mechanic_id || '';
  const mechanic_id = pingRes.mechanic_id || (pingRes.result && pingRes.result.mechanic_id) || '';

  const user = {
    email: email,
    role: role,
    mechanic_name: name || mechanic_id || 'Pengguna',
    name: name,
    mechanic_id: mechanic_id,
  };

  const roleLower = String(role || user.role || '').toLowerCase();

  // 2. Tentukan halaman
  let page = (url.searchParams.get('page') || '').toLowerCase().trim().split('&')[0];

  if (page === 'users' || page === 'config') {
    return new Response(renderPesanAksesAdminDitolak(user.role), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!page) {
    page = (roleLower === 'mechanic') ? 'mechanic'
         : (roleLower === 'supervisor') ? 'approvals'
         : 'dashboard';
  }

  const rawBack = (url.searchParams.get('back') || '').trim();
  const backToken = rawBack && rawBack !== token ? rawBack : '';
  const activeFilter = (url.searchParams.get('filter') || 'assigned').toLowerCase().trim();

  // 3. Ambil data inisial halaman jika diperlukan
  const context = {
    baseUrl: '/web',
    token: token,
    backToken: backToken,
    activeFilter: activeFilter,
    user: user,
    currentView: url.searchParams.get('view') || 'pending',
    viewAsMechanicId: url.searchParams.get('as') || '',
  };

  try {
    if (['create', 'workorder'].includes(page)) {
      const refs = await panggilAksiInternal('pull_create_refs', token, {}, env);
      const refsData = refs && refs.result ? refs.result : (refs && refs.data ? refs.data : {});
      if (refs && refs.success && refsData) {
        const actualRefs = (refsData && refsData.refs) ? refsData.refs : refsData;
        context.components = actualRefs.components || refsData.components || [];
        context.units = actualRefs.units || refsData.units || [];
        context.mechanics = actualRefs.mechanics || refsData.mechanics || [];
        context.workConditions = actualRefs.work_conditions || refsData.work_conditions || [];
        context.userScope = actualRefs.user_scope || refsData.user_scope || null;
      }
    } else if (['approvals', 'approval'].includes(page)) {
      const [pending, active, approved, rejected, mechList] = await Promise.all([
        panggilAksiInternal('pull_pending', token, {}, env),
        panggilAksiInternal('pull_active', token, {}, env),
        panggilAksiInternal('pull_approved', token, {}, env),
        panggilAksiInternal('pull_rejected', token, {}, env),
        panggilAksiInternal('pull_create_refs', token, {}, env),
      ]);
      const pendingData = pending && pending.result ? pending.result : (pending && pending.data ? pending.data : {});
      const activeData = active && active.result ? active.result : (active && active.data ? active.data : {});
      const approvedData = approved && approved.result ? approved.result : (approved && approved.data ? approved.data : {});
      const rejectedData = rejected && rejected.result ? rejected.result : (rejected && rejected.data ? rejected.data : {});
      const mechData = mechList && mechList.result ? mechList.result : (mechList && mechList.data ? mechList.data : {});
      const actualMechRefs = (mechData && mechData.refs) ? mechData.refs : mechData;

      const rawList = (pendingData.pending || pendingData.approvals || pendingData.wos || (Array.isArray(pendingData) ? pendingData : [])).map(lengkapiObjekWoWeb);
      // Sesuai docs/SPEK-LAYAR/04-APPROVALS.md baris 49-52:
      // Antrean L1 (supervisor) hanya pending_supervisor / pending_l1.
      // Antrean L2 (superintendent) hanya pending_superintendent / pending_l2.
      let pendingList = rawList.filter((w) => w.status !== 'pending_transfer');
      if (roleLower === 'supervisor') {
        pendingList = pendingList.filter((w) => {
          const wst = String(w.status || '').toLowerCase().trim();
          return wst === 'pending_supervisor' || wst === 'pending_l1';
        });
      } else if (roleLower === 'superintendent') {
        pendingList = pendingList.filter((w) => {
          const wst = String(w.status || '').toLowerCase().trim();
          return wst === 'pending_superintendent' || wst === 'pending_l2';
        });
      }
      context.pendingApprovals = pendingList;
      context.pendingCount = pendingList.length;
      context.pendingTotal = pendingList.length;
      context.pendingTransfers = (pendingData.transfers || []).map(lengkapiObjekWoWeb);
      context.activeWos = (activeData.active || activeData.wos || (Array.isArray(activeData) ? activeData : [])).map(lengkapiObjekWoWeb);
      context.approvedWos = (approvedData.approved || approvedData.wos || (Array.isArray(approvedData) ? approvedData : [])).map(lengkapiObjekWoWeb);
      context.rejectedWos = (rejectedData.rejected || rejectedData.wos || (Array.isArray(rejectedData) ? rejectedData : [])).map(lengkapiObjekWoWeb);
      context.allMechanics = actualMechRefs.mechanics || actualMechRefs.allMechanics || [];
    } else if (['mechanic', 'monitoring', 'mechanicdashboard'].includes(page)) {
      const myWos = await panggilAksiInternal('pull_my_wos', token, {}, env);
      const mon = await panggilAksiInternal('pull_monitoring', token, {}, env);
      const myWosData = myWos && myWos.result ? myWos.result : (myWos && myWos.data ? myWos.data : {});
      const monData = mon && mon.result ? mon.result : (mon && mon.data ? mon.data : {});
      const rawWosList = myWosData.wos || (Array.isArray(myWosData) ? myWosData : []);
      // WO yang dibatalkan (cancelled/rejected) otomatis hilang dari halaman pengerjaan mekanik
      const activeWosOnly = rawWosList.filter(w => {
        const st = String(w.status || '').toLowerCase().trim();
        const sg = String(w.status_group || '').toLowerCase().trim();
        return !['cancelled', 'canceled', 'rejected', 'batal'].includes(st) && sg !== 'rejected';
      });
      const enrichedWos = activeWosOnly.map(lengkapiObjekWoWeb);
      const computedCounts = myWosData.counts || {
        all: enrichedWos.length,
        assigned: enrichedWos.filter((w) => w.status_group === 'assigned').length,
        in_progress: 0,
        pending_approval: enrichedWos.filter((w) => w.status_group === 'pending_approval').length,
        done: enrichedWos.filter((w) => w.status_group === 'done').length,
      };
      const filteredWos = ['assigned', 'pending_approval', 'done'].includes(activeFilter)
        ? enrichedWos.filter((w) => w.status_group === activeFilter)
        : enrichedWos;
      context.initialData = {
        wos: filteredWos,
        allWos: enrichedWos,
        counts: computedCounts,
        activeFilter,
        viewing_as: context.viewAsMechanicId || null,
        mechanic: user,
      };
      context.monitoringData = monData;
      context.mons = (monData && monData.mechanics) || (Array.isArray(monData) ? monData : []);
    } else if (['dashboard', 'main'].includes(page)) {
      const [mon, pending, active, approved, rejected] = await Promise.all([
        panggilAksiInternal('pull_monitoring', token, {}, env),
        panggilAksiInternal('pull_pending', token, {}, env),
        panggilAksiInternal('pull_active', token, {}, env),
        panggilAksiInternal('pull_approved', token, {}, env),
        panggilAksiInternal('pull_rejected', token, {}, env),
      ]);
      const ekstrakIsi = (x) => (x && x.result ? x.result : (x && x.data ? x.data : (Array.isArray(x) ? x : {})));
      const dmon = ekstrakIsi(mon);
      const dp = ekstrakIsi(pending);
      const da = ekstrakIsi(active);
      const dap = ekstrakIsi(approved);
      const dr = ekstrakIsi(rejected);
      const ov = dmon.overall || {};
      const mechsArr = Array.isArray(dmon) ? dmon : (Array.isArray(dmon?.mechanics) ? dmon.mechanics : []);

      // Kamus Mekanik Dinamis
      const mechMap = new Map();
      if (Array.isArray(mechsArr)) {
        mechsArr.forEach(m => {
          const mid = m.mechanic_id || m.id;
          const mname = m.name || m.mechanic_name;
          if (mid && mname) {
            mechMap.set(String(mid).trim().toUpperCase(), mname);
            mechMap.set(String(mid).trim(), mname);
          }
        });
      }

      const saringWoSah = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object' && (x.id || x.wo_id || x.wo_number) && String(x.wo_number || x.id) !== 'WO-0');
      const listPending = saringWoSah(dp.pending || dp.wos || (Array.isArray(dp) ? dp : [])).map(w => lengkapiObjekWoWeb(w, mechMap));
      const listActive = saringWoSah(da.active || da.wos || (Array.isArray(da) ? da : [])).map(w => lengkapiObjekWoWeb(w, mechMap));
      const listApproved = saringWoSah(dap.approved || dap.wos || (Array.isArray(dap) ? dap : [])).map(w => lengkapiObjekWoWeb(w, mechMap));
      const listRejected = saringWoSah(dr.rejected || dr.wos || (Array.isArray(dr) ? dr : [])).map(w => lengkapiObjekWoWeb(w, mechMap));

      const petaWo = new Map();
      [...listPending, ...listActive, ...listApproved, ...listRejected].forEach((w) => {
        const k = String(w.wo_number || w.id);
        if (k && !petaWo.has(k)) petaWo.set(k, w);
      });
      const semuaWo = Array.from(petaWo.values()).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

      // Leaderboard
      const petaMekanik = new Map();
      listApproved.forEach((w) => {
        (w.team || []).forEach((m) => {
          const mid = String(m.mechanic_id || m.id || m.mechanic_name || m.name || 'MECH-01');
          const mname = resolveNamaMekanik(m.mechanic_name || m.name || mid, mechMap);
          const pts = Number(m.share_points ?? w.final_points ?? 0);
          const cur = petaMekanik.get(mid) || { id: mid, mechanic_id: mid, name: mname, mechanic_name: mname, total_points: 0, points: 0, wo_count: 0, count: 0 };
          cur.total_points = Number((cur.total_points + pts).toFixed(2));
          cur.points = cur.total_points;
          cur.wo_count += 1;
          cur.count += 1;
          petaMekanik.set(mid, cur);
        });
      });
      const leaderboard = Array.from(petaMekanik.values()).sort((a, b) => b.total_points - a.total_points);

      // Trend Poin 7 Hari Terakhir
      const trendMap = new Map();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const k = d.toISOString().slice(5, 10);
        trendMap.set(k, 0);
      }
      listApproved.forEach((w) => {
        const t = String(w.created_at || w.date || '').slice(5, 10);
        if (trendMap.has(t)) {
          trendMap.set(t, Number((trendMap.get(t) + Number(w.final_points || 0)).toFixed(2)));
        }
      });

      const totalPoints = listApproved.reduce((s, w) => s + Number(w.final_points || 0), 0);
      const woBerjam = semuaWo.filter((w) => Number(w.actual_hours) > 0);
      const avgJam = woBerjam.length > 0 ? Number((woBerjam.reduce((s, w) => s + Number(w.actual_hours), 0) / woBerjam.length).toFixed(1)) : 0;

      // Perhitungan Metrik KPI yang Konsisten & Matematis (TOTAL WO >= APPROVED + PENDING):
      const countApproved = listApproved.length;
      const countPending = listPending.length + listActive.length;
      const countTotal = Math.max(semuaWo.length, countApproved + countPending);

      context.dashboardData = {
        user,
        periode: dmon.periode || 'Bulan Berjalan',
        periodeLabel: dmon.periode || 'Bulan Berjalan',
        stats: {
          totalWOs: countTotal,
          approved: countApproved,
          pending: countPending,
          totalPoints: Number(totalPoints.toFixed(2)),
          activeMechanics: mechsArr.length || (ov.total_mechanics || ov.mechanics || 0),
          thisMonth: countTotal,
          avgCompletion: avgJam,
          avgCompletionLabel: avgJam > 0 ? `${avgJam} jam` : '—',
          mechanicsByGrade: (dmon.stats && dmon.stats.mechanicsByGrade) || [],
        },
        recentWOs: semuaWo.slice(0, 30),
        leaderboard,
        submitLeaderboard: leaderboard.map((x) => ({ ...x, submit_count: x.wo_count })),
        leaderboardHarian: {
          tanggal: new Date().toISOString().slice(0, 10),
          label: 'Hari Ini',
          vessel: { nama: 'Rekondisi', jumlah_wo: listApproved.filter((w) => w.section === 'vessel').length, baris: leaderboard.slice(0, 5) },
          maintenance: { nama: 'Maintenance', jumlah_wo: listApproved.filter((w) => w.section !== 'vessel').length, baris: leaderboard.slice(0, 5) },
        },
        charts: dmon.charts || {
          pointsTrend: {
            labels: Array.from(trendMap.keys()),
            data: Array.from(trendMap.values()),
            periodeLabel: 'Bulan Berjalan',
          },
        },
      };
    }
  } catch (err) {
    console.error('Error saat mempersiapkan context halaman web:', err);
  }

  // 4. Render HTML
  try {
    const html = renderWebPage(page, context);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Abadi-Rumah': env.RUMAH || 'sum',
        'X-Abadi-Web': page,
      },
    });
  } catch (err) {
    console.error('Error saat merender halaman web:', err);
    return new Response(renderPesanWeb('Galat Tampilan Web', 'Terjadi kesalahan saat memuat halaman web: ' + ((err && err.message) || err), 'https://abadiops.com', 'Kembali ke Pintu'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

export async function handleWebBridgeApi(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response('Hanya POST diperbolehkan', { status: 405, headers: CORS });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'JSON payload tidak valid' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const token = body.token || '';
  const action = body.action || '';
  let data = body.data || {};
  if (typeof data === 'object' && data !== null && !data.token) {
    data.token = token;
  }

  // Normalisasi payload untuk aksi pembuatan laporan (Reports)
  if (['generatePayrollReport', 'handleGeneratePayrollReport', 'generateReport'].includes(action)) {
    if (Array.isArray(body.args) && body.args.length > 0) {
      data = {
        filter_type: body.args[0] || 'month',
        year: body.args[1] || null,
        month: body.args[2] || null,
        start_date: body.args[3] || null,
        end_date: body.args[4] || null,
        section_filter: body.args[5] || 'all',
        token: body.args[6] || token
      };
    } else if (typeof data === 'string') {
      data = { filter_type: data, token };
    }
  }
  body.data = data;

  // Role Guard untuk Approval L1 vs L2
  if (['approve_l2', 'handleSuperintendentApprove', 'superintendentApprove'].includes(action)) {
    const userRes = await panggilAksiInternal('ping', token, {}, env);
    const user = (userRes && userRes.result) ? userRes.result : (userRes && userRes.data ? userRes.data : {});
    const roleLower = String(user.role || '').toLowerCase();
    if (roleLower === 'supervisor') {
      return new Response(JSON.stringify({
        success: false,
        error: { message: 'Akses ditolak: Hanya Level 2 (Superintendent / Manager) yang berhak melakukan Approval Level 2' },
        source: 'SUPABASE'
      }), {
        status: 403,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }

  // Buku Tamu Kiriman (Idempotency Store di Cloudflare, docs/SAKLAR.md)
  const opId = body.op_id || body.kiriman_id || data.op_id || data.kiriman_id;
  if (opId) {
    const cached = await cekBukuTamu(opId, token, env);
    if (cached && cached.result) {
      return new Response(JSON.stringify(cached.result), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'X-Abadi-Buku-Tamu': 'hit' }
      });
    }
  }

  const liveSaklar = await bacaStatusSaklar(env);
  const targetWoId = ekstrakWoId(body);
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);
  const woGas = apakahWoLamaDariGas(targetWoId);

  // Aturan Saklar Balik & Satu Rumah Seumur Hidup:
  // 1. Jika WO lahir di Supabase (4 digit / WO-SB-*), WAJIB ke Supabase bahkan saat saklar 'gas'.
  // 2. Jika WO lama lahir di GAS (3 digit), saat dua_cabang tetap diteruskan ke GAS.
  const harusKeSupabase = woSupabase || (liveSaklar === 'supabase') || ((liveSaklar !== 'gas' || url.searchParams.get('uji') === 'supabase') && !woGas);

  if (harusKeSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const resSupa = await eksekusiSupabaseBackendSum(action, token, body, env);
      if (resSupa && resSupa.status === 200) {
        if (opId) {
          try {
            const klon = resSupa.clone();
            const dataResult = await klon.json();
            await catatBukuTamu(opId, token, dataResult, env);
          } catch (_) {}
        }
        return resSupa;
      }
      if (liveSaklar === 'supabase' || woSupabase) {
        return resSupa || new Response(JSON.stringify({ success: false, error: 'Supabase backend gagal', source: 'SUPABASE' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    } catch (e) {
      if (liveSaklar === 'supabase' || woSupabase) {
        return new Response(JSON.stringify({ success: false, error: 'Supabase error: ' + ((e && e.message) || e), source: 'SUPABASE' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }
  }

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;

  try {
    let res;
    if (ROUTER_ACTIONS.has(action)) {
      // Format URL encoded untuk Router.gs
      const params = new URLSearchParams();
      params.append('action', action);
      if (token) params.append('token', token);
      params.append('data', typeof data === 'string' ? data : JSON.stringify(data));
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Abadi-Rumah': env.RUMAH || '',
          'X-Abadi-Token': token || '',
        },
        body: params.toString(),
        redirect: 'follow',
      });
    } else {
      // Format JSON untuk ApiService.gs
      res = await fetcher(env.GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'X-Abadi-Rumah': env.RUMAH || '',
          'X-Abadi-Token': token || '',
        },
        body: JSON.stringify({ token, action, data }),
        redirect: 'follow',
      });
    }

    const resText = await res.text();
    if (res.ok && opId) {
      try {
        const dataResult = JSON.parse(resText);
        await catatBukuTamu(opId, token, dataResult, env);
      } catch (_) {}
    }
    return new Response(resText, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: 'Koneksi ke backend gagal: ' + ((err && err.message) || err) }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

async function panggilAksiInternal(action, token, data, env) {
  const liveSaklar = await bacaStatusSaklar(env);
  const targetWoId = ekstrakWoId({ action, data });
  const woSupabase = apakahWoLahirDiSupabase(targetWoId);
  const woGas = apakahWoLamaDariGas(targetWoId);
  const harusKeSupabase = woSupabase || (liveSaklar === 'supabase') || (liveSaklar !== 'gas' && !woGas);

  if (harusKeSupabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    try {
      const resSupa = await eksekusiSupabaseBackendSum(action, token, { data: data || {} }, env);
      if (resSupa && resSupa.status === 200) {
        const json = await resSupa.json().catch(() => null);
        if (json) return json;
      }
      if (liveSaklar === 'supabase' || woSupabase) {
        return null;
      }
    } catch (_) {
      if (liveSaklar === 'supabase' || woSupabase) return null;
    }
  }

  const fetcher = (env && env.GAS_TIRUAN && typeof env.GAS_TIRUAN.fetch === 'function')
    ? env.GAS_TIRUAN.fetch.bind(env.GAS_TIRUAN)
    : fetch;
  try {
    const res = await fetcher(env.GAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'X-Abadi-Rumah': env.RUMAH || '',
      },
      body: JSON.stringify({ action, token, data: data || {} }),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

function renderPesanWeb(judul, pesan, urlTombol, teksTombol) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${judul} - Abadi Operation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #111827; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .box { background: white; padding: 2.5rem; border-radius: 16px; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 440px; width: 100%; text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.75rem; color: #0F172A; }
    p { color: #64748B; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.75rem; }
    a { display: inline-block; background: #4F633F; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 600; font-size: 0.95rem; transition: background 0.2s; }
    a:hover { background: #384B2B; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${judul}</h1>
    <p>${pesan}</p>
    <a href="${urlTombol}">${teksTombol}</a>
  </div>
</body>
</html>`;
}

function renderPesanAksesAdminDitolak(userRole) {
  const roleLabel = String(userRole || 'Pengguna').toUpperCase();
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akses Ditolak (403) - Abadi Operation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0F172A; color: #F8FAFC;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
    }
    .card {
      background: #1E293B; border: 1px solid #334155; border-radius: 16px;
      padding: 36px 28px; max-width: 540px; text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon { font-size: 52px; margin-bottom: 16px; }
    h1 { font-size: 21px; font-weight: 700; color: #F87171; margin-bottom: 12px; }
    .badge {
      display: inline-block; background: #334155; color: #F1F5F9;
      padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 700;
      margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    p { font-size: 14.5px; color: #94A3B8; line-height: 1.6; margin-bottom: 24px; }
    .btn-group { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-block; text-decoration: none; padding: 10px 20px;
      border-radius: 8px; font-weight: 600; font-size: 14px; transition: all 0.2s;
    }
    .btn-primary { background: #3B82F6; color: white; }
    .btn-primary:hover { background: #2563EB; }
    .btn-secondary { background: #334155; color: #E2E8F0; }
    .btn-secondary:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>Akses Terbatas Khusus Administrator</h1>
    <div class="badge">Peran Akun: ${roleLabel}</div>
    <p>
      Menu <strong>Manajemen Pengguna &amp; Token</strong> serta <strong>Master Data Config</strong> (Units, Components, Catalog Jobs, Factors) tidak diperuntukkan bagi peran operasional L1 / L2 di Web Desktop.
      <br><br>
      Konfigurasi sistem disatukan di <strong>Panel Saklar &amp; Pengelola Pusat</strong> yang hanya dapat diakses oleh Administrator dengan autentikasi kata sandi.
    </p>
    <div class="btn-group">
      <a href="/web" class="btn btn-secondary">← Kembali ke Halaman Utama</a>
      <a href="/saklar" class="btn btn-primary">Buka Panel Saklar Pusat →</a>
    </div>
  </div>
</body>
</html>`;
}

