/**
 * Durable Object untuk Menyimpan Nilai Saklar dan Riwayat Pembalikan
 * Sesuai docs/SAKLAR.md § Panel saklar di abadiops.com
 *
 * Sifat:
 * - Strongly consistent seketika di semua lokasi Cloudflare edge.
 * - Nilai tersimpan persisten di storage Durable Object.
 * - Default posisi awal: 'gas' untuk semua rumah.
 * - Riwayat audit log tersimpan hingga 50 entri terakhir.
 * - Buku tamu kiriman (tabel SQLite buku_tamu): hanya untuk Worker rumah lewat ikatan Durable Object.
 */

// Umur catatan buku tamu. Kiriman yang dikirim ulang lebih dari 30 hari kemudian diproses seperti kiriman baru.
const UMUR_BUKU_TAMU_MS = 30 * 24 * 60 * 60 * 1000;

export class SaklarDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  // Kode kamar yang aktif, dari RUMAH di wrangler.toml pintu (lingkungan Worker ini).
  kodeRumah() {
    let r = this.env && this.env.RUMAH;
    try { r = typeof r === 'string' ? JSON.parse(r) : r; } catch (_) { r = null; }
    return Array.isArray(r) ? r.map((x) => String(x.kode)) : [];
  }

  // Saklar setiap kamar aktif. Kamar yang baru ditambahkan ke RUMAH otomatis mendapat posisi bawaan 'gas'.
  async getSwitches() {
    const tersimpan = (await this.ctx.storage.get('switches')) || {};
    const switches = {};
    let baru = false;
    for (const kode of this.kodeRumah()) {
      if (tersimpan[kode]) {
        switches[kode] = tersimpan[kode];
      } else {
        switches[kode] = { posisi: 'gas', diubah_at: null, oleh: 'Sistem', alasan: 'Posisi bawaan' };
        baru = true;
      }
    }
    if (baru) await this.ctx.storage.put('switches', { ...tersimpan, ...switches });
    return switches;
  }

  async getHistory() {
    let history = await this.ctx.storage.get('history');
    if (!history) {
      history = [];
      await this.ctx.storage.put('history', history);
    }
    return history;
  }

  // Tabel buku tamu, sekali per instance. Catatan model lama (kunci 'op:<op_id>' tanpa rumah, pemilik,
  // dan umur) tidak terbaca lagi oleh kode ini, jadi dibuang sekalian.
  async siapkanBukuTamu() {
    if (this.bukuTamuSiap) return;
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS buku_tamu (
      rumah     TEXT    NOT NULL,
      op_id     TEXT    NOT NULL,
      pemilik   TEXT    NOT NULL,
      hasil     TEXT    NOT NULL,
      dibuat_at INTEGER NOT NULL,
      PRIMARY KEY (rumah, op_id)
    )`);
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS buku_tamu_umur ON buku_tamu (dibuat_at)');
    for (;;) {
      const lama = await this.ctx.storage.list({ prefix: 'op:', limit: 128 });
      if (lama.size === 0) break;
      await this.ctx.storage.delete([...lama.keys()]);
    }
    this.bukuTamuSiap = true;
  }

  async fetch(request, init) {
    const reqUrl = typeof request === 'string' ? request : (request && request.url ? request.url : '');
    const url = new URL(reqUrl, 'https://saklar.internal');
    const action = url.searchParams.get('action');
    const method = (typeof request === 'string' ? init && init.method : request && request.method) || 'GET';

    if (action === 'status') {
      const switches = await this.getSwitches();
      const history = await this.getHistory();
      return new Response(JSON.stringify({ success: true, switches, history }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Buku Tamu Kiriman (docs/SAKLAR.md). Hanya dipanggil Worker rumah lewat ikatan Durable Object;
    // pintu tidak punya rute publik untuknya. Catatan dikunci per rumah + op_id, dan hasilnya hanya
    // diberikan kepada pemilik token yang sama (sidik SHA-256 token, bukan tokennya).
    if ((action === 'buku_tamu_cek' || action === 'buku_tamu_simpan') && method === 'POST') {
      let body = {};
      try {
        if (typeof request !== 'string' && request && typeof request.json === 'function') {
          body = await request.json();
        } else if (init && init.body) {
          body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        }
      } catch (_) {}
      const rumah = String(body.rumah || '').trim();
      const opId = String(body.op_id || '').trim();
      const pemilik = String(body.pemilik || '').trim();
      if (!rumah || !opId || !/^[0-9a-f]{64}$/.test(pemilik)) {
        return new Response(JSON.stringify({ success: false, error: 'rumah, op_id, dan sidik pemilik wajib' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await this.siapkanBukuTamu();
      const sql = this.ctx.storage.sql;
      const batas = Date.now() - UMUR_BUKU_TAMU_MS;
      if (action === 'buku_tamu_cek') {
        const baris = sql.exec('SELECT pemilik, hasil, dibuat_at FROM buku_tamu WHERE rumah = ? AND op_id = ?', rumah, opId).toArray()[0];
        if (!baris || baris.dibuat_at < batas || baris.pemilik !== pemilik) {
          return new Response(JSON.stringify({ found: false }), { headers: { 'Content-Type': 'application/json' } });
        }
        const record = { op_id: opId, rumah, result: JSON.parse(baris.hasil), timestamp: new Date(baris.dibuat_at).toISOString() };
        return new Response(JSON.stringify({ found: true, record }), { headers: { 'Content-Type': 'application/json' } });
      }
      // Catatan pertama yang menang, seperti ProcessedOps. Catatan kedaluwarsa dibuang lebih dulu.
      sql.exec('DELETE FROM buku_tamu WHERE dibuat_at < ?', batas);
      sql.exec('INSERT OR IGNORE INTO buku_tamu (rumah, op_id, pemilik, hasil, dibuat_at) VALUES (?, ?, ?, ?, ?)',
        rumah, opId, pemilik, JSON.stringify(body.result === undefined ? null : body.result), Date.now());
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'ubah' && method === 'POST') {
      let body = {};
      try {
        if (typeof request !== 'string' && request && typeof request.json === 'function') {
          body = await request.json();
        } else if (init && init.body) {
          body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        }
      } catch (_) {
        return new Response(JSON.stringify({ success: false, error: 'Bad JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { rumah, posisi, oleh, alasan } = body;
      const validPosisi = ['gas', 'dua_cabang', 'supabase'];

      if (!rumah || typeof rumah !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'Kode rumah wajib diisi' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!validPosisi.includes(posisi)) {
        return new Response(JSON.stringify({ success: false, error: 'Posisi saklar tidak sah: ' + posisi }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!this.kodeRumah().includes(rumah)) {
        return new Response(JSON.stringify({ success: false, error: 'Kode rumah tidak dikenal: ' + rumah }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const switches = await this.getSwitches();
      const history = await this.getHistory();
      const dari = (switches[rumah] && switches[rumah].posisi) || 'gas';

      // Format waktu WIB
      const now = new Date();
      const waktuWib = now.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) + ' WIB';

      switches[rumah] = {
        posisi,
        diubah_at: waktuWib,
        oleh: oleh || 'Gabriel',
        alasan: alasan || 'Pembalikan saklar via Panel Abadi',
      };

      const catatan = {
        waktu_wib: waktuWib,
        timestamp: now.toISOString(),
        rumah,
        dari,
        ke: posisi,
        alasan: alasan || 'Pembalikan saklar via Panel Abadi',
        oleh: oleh || 'Gabriel',
      };

      history.unshift(catatan);
      if (history.length > 50) history.pop();

      await this.ctx.storage.put('switches', switches);
      await this.ctx.storage.put('history', history);

      return new Response(JSON.stringify({ success: true, switches, history, catatan }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Aksi tidak dikenal' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
