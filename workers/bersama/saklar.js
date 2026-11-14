// Posisi saklar rumah ini (gas | dua_cabang | supabase) dari SaklarDO pintu, lewat ikatan PINTU dengan kunci
// env.RUMAH (docs/SAKLAR.md). Disimpan 5 detik per isolate. Tanpa jawaban pintu: env.SAKLAR, lalu 'gas'.
let simpan = { nilai: null, sampai: 0 };

export async function bacaStatusSaklar(env) {
  const sekarang = Date.now();
  if (simpan.nilai && simpan.sampai > sekarang) return simpan.nilai;
  let hasil = env.SAKLAR || 'gas';
  if (!env.PINTU || typeof env.PINTU.fetch !== 'function') return hasil;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await env.PINTU.fetch('https://pintu.internal/api/saklar/status', { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const data = await r.json();
      const val = data && data.switches && data.switches[env.RUMAH];
      if (val) {
        hasil = val;
        simpan = { nilai: hasil, sampai: sekarang + 5000 };
      }
    }
  } catch (_) {}
  return hasil;
}
