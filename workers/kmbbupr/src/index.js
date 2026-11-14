/**
 * Rumah KMB Projek BUPR: Worker `abadiops-kmbbupr`. Rumah: kmbbupr.
 *
 * GAS asli di Worker (keputusan Gabriel 14 Nov 2026): kode GAS BUPR yang ASLI (gas/gas-kamar.js, dibungkus
 * tools/kembar/bundel-gas.mjs dari versi yang dipatok di config/rumah.json) dijalankan di atas cermin Supabase.
 * Semua logikanya ada di ../../bersama/gas-rumah.js, sama untuk setiap rumah GAS asli. Penjelasan: ../README.md.
 */
import { buatWorkerRumah } from '../../bersama/gas-rumah.js';
import * as bundel from '../gas/gas-kamar.js';

export default buatWorkerRumah(bundel);
