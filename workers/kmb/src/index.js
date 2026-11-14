/**
 * Rumah KMB TRA / V2: Worker `abadiops-kmb` (produksi, kmbtra.abadiops.com) dan `abadiops-kmb-staging`. Rumah: kmbtra.
 *
 * GAS asli di Worker (keputusan Gabriel 14 Nov 2026, langkah (d)): kode GAS KMB TRA / V2 yang ASLI (gas/gas-kamar.js,
 * dibungkus tools/kembar/bundel-gas.mjs dari versi yang dipatok di config/rumah.json) dijalankan di atas cermin
 * Supabase. Selama saklar "gas", semua aksi diteruskan ke web app GAS dan /web diarahkan ke web GAS, sama dengan
 * sebelumnya. Semua logikanya ada di ../../bersama/gas-rumah.js. Penjelasan: ../README.md.
 */
import { buatWorkerRumah } from '../../bersama/gas-rumah.js';
import * as bundel from '../gas/gas-kamar.js';

export default buatWorkerRumah(bundel);
