import ExcelJS from 'exceljs/dist/exceljs.bare.min.js';

export function uint8ArrayToBase64(uint8) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function formatDateId(date) {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    return `${dd} ${mmm} ${yyyy}`;
  } catch (_) {
    return String(date);
  }
}

export function formatTimeOnly(date) {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch (_) {
    return String(date);
  }
}

export function labelKondisi(wc) {
  const k = String(wc || '').toLowerCase();
  if (k === 'normal') return 'Shift 1';
  if (k === 'difficult') return 'Shift 2';
  if (k === 'extreme') return 'Kondisi Ekstrim';
  return wc || '-';
}

export function getRateForJabatan(jabatan, position) {
  const j = String(jabatan || position || '').toLowerCase();
  if (j.includes('helper')) return 1500;
  if (j.includes('sr') || j.includes('senior')) return 3000;
  if (j.includes('jr') || j.includes('junior') || j.includes('welder') || j.includes('mekanik')) return 2500;
  return 2500;
}

export async function buildPayrollWorkbook({ periodLabel, generatedAt, summaryRows, detailRows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Abadi Operation';
  wb.created = new Date();

  // --------------------------------------------------------------------------
  // SHEET 1: Ringkasan
  // --------------------------------------------------------------------------
  const ws1 = wb.addWorksheet('Ringkasan', {
    views: [{ state: 'frozen', ySplit: 6, showGridLines: true }]
  });

  // Column widths matching original exactly
  const colWidths1 = [5.13, 25.13, 15.13, 17.63, 15.13, 13.88, 12.63, 20.13];
  colWidths1.forEach((w, idx) => {
    ws1.getColumn(idx + 1).width = w;
  });

  // Row 1: Merged Title
  ws1.mergeCells('A1:H1');
  const titleCell1 = ws1.getCell('A1');
  titleCell1.value = 'LAPORAN PAYROLL INSENTIF MEKANIK';
  titleCell1.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' }, bgColor: { argb: 'FFF97316' } };
  titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2..4: Metadata
  const r2 = ws1.getCell('A2');
  r2.value = 'Periode: ' + periodLabel;
  r2.font = { name: 'Arial', italic: true, color: { argb: 'FFB45309' } };

  const r3 = ws1.getCell('A3');
  r3.value = 'Dibuat: ' + generatedAt;
  r3.font = { name: 'Arial', italic: true, color: { argb: 'FF6B7280' } };

  const r4 = ws1.getCell('A4');
  r4.value = 'Rate per poin: bervariasi per jabatan (lihat kolom Rate/Poin)';
  r4.font = { name: 'Arial', italic: true, color: { argb: 'FF6B7280' } };

  // Row 6: Headers
  const headerRow1 = 6;
  const headers1 = ['No', 'Nama Mekanik', 'Jabatan', 'Mechanic ID', 'Total WO Selesai', 'Total Poin', 'Rate/Poin', 'Total IDR (Rp)'];
  headers1.forEach((h, idx) => {
    const c = ws1.getCell(headerRow1, idx + 1);
    c.value = h;
    c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' }, bgColor: { argb: 'FFF97316' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
  });

  let grandTotalWos = 0;
  let grandTotalPoints = 0;
  let grandTotalIdr = 0;

  // Data rows
  summaryRows.forEach((row, idx) => {
    const rIdx = headerRow1 + 1 + idx;
    const bgArgb = idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    const borderStyle = {
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };

    grandTotalWos += Number(row.wo_count || 0);
    grandTotalPoints += Number(row.total_points || 0);
    grandTotalIdr += Number(row.total_idr || 0);

    const values = [
      idx + 1,
      row.mechanic_name,
      row.jabatan || '-',
      row.mechanic_id,
      Number(row.wo_count || 0),
      Number(row.total_points || 0),
      Number(row.rate || 0),
      Math.round(row.total_idr || 0)
    ];

    values.forEach((v, cIdx) => {
      const cell = ws1.getCell(rIdx, cIdx + 1);
      cell.value = v;
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb }, bgColor: { argb: bgArgb } };
      cell.border = borderStyle;

      if (cIdx === 0) cell.alignment = { horizontal: 'center' };
      else if (cIdx === 3) cell.alignment = { horizontal: 'center' };
      else if (cIdx === 4) cell.alignment = { horizontal: 'right' };
      else if (cIdx === 5) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '#,##0.##';
      } else if (cIdx === 6 || cIdx === 7) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '"Rp "#,##0';
      }
    });
  });

  // Total Row
  const totalRowIdx1 = headerRow1 + 1 + summaryRows.length;
  for (let c = 1; c <= 8; c++) {
    const cell = ws1.getCell(totalRowIdx1, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' }, bgColor: { argb: 'FFF97316' } };
    cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } }
    };
  }

  const cTotal = ws1.getCell(totalRowIdx1, 2);
  cTotal.value = 'TOTAL';

  const cTotWos = ws1.getCell(totalRowIdx1, 5);
  cTotWos.value = grandTotalWos;
  cTotWos.alignment = { horizontal: 'right' };

  const cTotPts = ws1.getCell(totalRowIdx1, 6);
  cTotPts.value = Number(grandTotalPoints.toFixed(2));
  cTotPts.numFmt = '#,##0.##';
  cTotPts.alignment = { horizontal: 'right' };

  const cTotIdr = ws1.getCell(totalRowIdx1, 8);
  cTotIdr.value = Math.round(grandTotalIdr);
  cTotIdr.numFmt = '"Rp "#,##0';
  cTotIdr.alignment = { horizontal: 'right' };

  // --------------------------------------------------------------------------
  // SHEET 2: Detail WO
  // --------------------------------------------------------------------------
  const ws2 = wb.addWorksheet('Detail WO', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: true }]
  });

  // Column widths matching original exactly
  const colWidths2 = [
    4.5, 18.88, 13.88, 13.88, 13.88, 15.13, 12.63, 27.63, 27.63, 13.88,
    10.13, 7.63, 7.63, 10.75, 10.75, 8.88, 7, 8.25, 7.63, 7.63,
    7.63, 9.5, 11.38, 11.38, 15.13
  ];
  colWidths2.forEach((w, idx) => {
    ws2.getColumn(idx + 1).width = w;
  });

  // Row 1: Merged Title
  ws2.mergeCells('A1:Y1');
  const titleCell2 = ws2.getCell('A1');
  titleCell2.value = 'DETAIL WO PER MEKANIK — ' + periodLabel;
  titleCell2.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' }, bgColor: { argb: 'FFF97316' } };
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2..3: Metadata
  const d2 = ws2.getCell('A2');
  d2.value = 'Dibuat: ' + generatedAt;
  d2.font = { name: 'Arial', italic: true, color: { argb: 'FF6B7280' } };

  const d3 = ws2.getCell('A3');
  d3.value = 'Formula: Base Pts × Unit × Kondisi × Waktu × Safety × Redo = WO Poin → Poin Mekanik';
  d3.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FFB45309' } };

  // Row 5: Headers
  const headerRow2 = 5;
  const headers2 = [
    'No', 'Nama Mekanik', 'Jabatan', 'Tgl Submit', 'Tgl Approved',
    'WO Number', 'Unit', 'sub_component (field dan ws) - component name (tyreman)',
    'job_description (field dan ws) - category (tyreman)', 'Kondisi',
    'Lokasi', 'Start', 'End', 'Actual Hours', 'Plan Hours',
    'Base Pts', '×Unit', '×Kondisi', '×Waktu', '×Safety', '×Redo', 'WO Poin', 'Poin Mekanik', 'Rate/Poin', 'IDR (Rp)'
  ];

  headers2.forEach((h, idx) => {
    const colNumber = idx + 1;
    const c = ws2.getCell(headerRow2, colNumber);
    c.value = h;
    c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    let bgArgb = 'FFF97316'; // cols 1..13
    if (colNumber === 14 || colNumber === 15) bgArgb = 'FF4B5563'; // Actual Hours, Plan Hours
    else if (colNumber >= 16 && colNumber <= 21) bgArgb = 'FFAD1457'; // Base Pts .. xRedo
    else if (colNumber >= 22 && colNumber <= 25) bgArgb = 'FFB45309'; // WO Poin .. IDR

    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb }, bgColor: { argb: bgArgb } };
  });

  // Data rows
  let currentBg = 'FFF0F9FF';
  const bgA = 'FFF0F9FF';
  const bgB = 'FFF9FAFB';
  let lastMechName = '';

  detailRows.forEach((row, idx) => {
    const rIdx = headerRow2 + 1 + idx;

    if (row.mechanic_name !== lastMechName) {
      currentBg = currentBg === bgA ? bgB : bgA;
      lastMechName = row.mechanic_name;
    }

    const isSafetyZero = Number(row.snap_safety ?? 1) === 0;

    const values = [
      idx + 1,
      row.mechanic_name,
      row.jabatan || '-',
      row.tgl_submit || '-',
      row.tgl_approved || '-',
      row.wo_number,
      row.unit || '-',
      row.col_i || '-',
      row.col_j || '-',
      row.kondisi || '-',
      row.lokasi || '-',
      row.start_time || '-',
      row.end_time || '-',
      Number(row.actual_hours ?? 0),
      row.plan_hours ? Number(row.plan_hours) : null,
      Number(row.snap_base ?? 0),
      Number(row.snap_unit ?? 1),
      Number(row.snap_wc ?? 1),
      Number(row.snap_time ?? 1),
      Number(row.snap_safety ?? 1),
      Number(row.snap_mtbf ?? 1),
      Number(row.snap_wo_points ?? 0),
      Number(row.points ?? 0),
      Number(row.rate ?? 0),
      Math.round(row.idr ?? 0)
    ];

    values.forEach((v, cIdx) => {
      const colNumber = cIdx + 1;
      const cell = ws2.getCell(rIdx, colNumber);
      cell.value = v;
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: currentBg }, bgColor: { argb: currentBg } };
      cell.border = {
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };

      // Alignment and number formatting
      if (colNumber === 1 || (colNumber >= 4 && colNumber <= 7) || (colNumber >= 10 && colNumber <= 13)) {
        cell.alignment = { horizontal: 'center' };
      } else if (colNumber === 14 || colNumber === 15 || colNumber === 16) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '#,##0.##';
      } else if (colNumber === 17 || colNumber === 18 || colNumber === 19 || colNumber === 21) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '0.00';
      } else if (colNumber === 20) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '0.0';
      } else if (colNumber === 22 || colNumber === 23) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '#,##0.##';
      } else if (colNumber === 24 || colNumber === 25) {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = '"Rp "#,##0';
      }

      // Safety incident highlighting
      if (isSafetyZero && (colNumber === 20 || colNumber === 22)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' }, bgColor: { argb: 'FFFEE2E2' } };
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF991B1B' } };
      }
    });
  });

  return wb;
}

