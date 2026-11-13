/**
 * Penjaga Gedung: Worker `abadiops-penjaga`. Bagian bersama.
 *
 * Proyek Supabase paket Free dijeda setelah 7 hari tanpa aktivitas. Gedung 1
 * pernah dijeda karena itu (ketahuan 13 Nov 2026: alamatnya NXDOMAIN): selama
 * saklar `gas`, tidak ada yang memanggilnya. Worker ini mengetuk setiap Gedung
 * tiap 6 jam (cron di wrangler.toml), jadi jeda 7 hari tidak pernah tercapai.
 *
 * Ketukan = RPC `sum_ping` dengan token yang pasti tidak ada: satu SELECT,
 * tidak menulis apa pun, dan tidak memakai token asli.
 * Ketukan yang gagal dicatat sebagai error di log Worker (Observability).
 *
 * Ketukan TIDAK membangunkan Gedung yang sudah dijeda. Gedung yang sudah
 * dijeda dipulihkan dari dasbor Supabase (Restore project).
 *
 * GET /cek mengetuk saat itu juga dan menjawab hasilnya.
 */

const TOKEN_KETUK = 'penjaga-ketuk-bukan-token';
const BATAS_MS = 15000;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ketukSemua(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/cek') {
      return new Response('Penjaga Gedung abadiops. Mengetuk tiap 6 jam; GET /cek untuk mengetuk sekarang.\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const hasil = await ketukSemua(env);
    const ok = hasil.length > 0 && hasil.every((h) => h.ok);
    return Response.json({ ok, hasil }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  },
};

async function ketukSemua(env) {
  const hasil = await Promise.all((env.GEDUNG || []).map(ketuk));
  for (const h of hasil) {
    if (h.ok) console.log(JSON.stringify({ penjaga: 'ketuk', ...h }));
    else console.error(JSON.stringify({ penjaga: 'GAGAL', ...h }));
  }
  return hasil;
}

async function ketuk(gedung) {
  const mulai = Date.now();
  try {
    const res = await fetch(`${gedung.url}/rest/v1/rpc/sum_ping`, {
      method: 'POST',
      headers: {
        apikey: gedung.kunci,
        Authorization: `Bearer ${gedung.kunci}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: TOKEN_KETUK }),
      signal: AbortSignal.timeout(BATAS_MS),
    });
    await res.text();
    return { gedung: gedung.nama, ok: res.ok, status: res.status, ms: Date.now() - mulai };
  } catch (err) {
    return { gedung: gedung.nama, ok: false, galat: String((err && err.message) || err), ms: Date.now() - mulai };
  }
}
