/**
 * Rumah SUM V2: Worker `abadiops-sum` (produksi, sum.abadiops.com) dan `abadiops-sum-staging`. Rumah: sum.
 *
 * GAS asli di Worker (keputusan Gabriel 14 Nov 2026, langkah (d)): kode GAS SUM V2 yang ASLI (gas/gas-kamar.js,
 * dibungkus tools/kembar/bundel-gas.mjs dari versi yang dipatok di config/rumah.json) dijalankan di atas cermin
 * Supabase. Selama saklar "gas", semua aksi diteruskan ke web app GAS dan /web diarahkan ke web GAS, sama dengan
 * sebelumnya. Semua logikanya ada di ../../bersama/gas-rumah.js. Penjelasan: ../README.md.
 */
import { buatWorkerRumah } from '../../bersama/gas-rumah.js';
import * as bundel from '../gas/gas-kamar.js';

export default buatWorkerRumah(bundel);
