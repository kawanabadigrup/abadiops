// Halaman web GAS asli yang disajikan Worker (MAR Web): pengganti pustaka google.script di peramban, dan
// penyisipannya ke HTML hasil doGet. Di GAS, halaman berjalan di iframe Google yang sudah membawa google.script;
// di sini halaman disajikan langsung, jadi google.script disisipkan sebelum skrip halaman mana pun.

// google.script.run.withSuccessHandler(f).withFailureHandler(g).withUserObject(o).namaFungsi(...args)
// dikirim ke POST <urlRun> sebagai {fn, args}; jawabannya {ok, hasil} atau {ok: false, error}.
export function skripGoogleScript(urlRun) {
  return `<script>
(function () {
  var URL_RUN = ${JSON.stringify(urlRun)};
  function pelari(sukses, gagal, objek) {
    return new Proxy({}, { get: function (_, nama) {
      if (typeof nama !== 'string') return undefined;
      if (nama === 'withSuccessHandler') return function (f) { return pelari(f, gagal, objek); };
      if (nama === 'withFailureHandler') return function (f) { return pelari(sukses, f, objek); };
      if (nama === 'withUserObject') return function (o) { return pelari(sukses, gagal, o); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch(URL_RUN, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: nama, args: args }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && j.ok) { if (sukses) sukses(j.hasil, objek); }
            else { var e = new Error((j && j.error) || 'Gagal memanggil server'); e.name = 'ScriptError'; if (gagal) gagal(e, objek); }
          })
          .catch(function (err) { if (gagal) gagal(err, objek); });
      };
    } });
  }
  window.google = window.google || {};
  google.script = google.script || {};
  google.script.run = pelari(null, null, undefined);
  google.script.host = { origin: location.origin, close: function () {}, setHeight: function () {}, setWidth: function () {}, editor: { focus: function () {} } };
  google.script.url = { getLocation: function (cb) {
    var p = {}, ps = {};
    new URLSearchParams(location.search).forEach(function (v, k) { if (!(k in p)) p[k] = v; (ps[k] = ps[k] || []).push(v); });
    cb({ hash: location.hash.replace(/^#/, ''), parameter: p, parameters: ps });
  } };
  google.script.history = { push: function () {}, replace: function () {}, setChangeHandler: function () {} };
})();
</script>`;
}

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Sisipkan judul, meta, ikon, dan google.script ke awal <head> (atau awal dokumen bila tanpa <head>), seperti
// halaman luar yang dibuat GAS dari setTitle/addMetaTag/setFaviconUrl.
export function sisipkanKeHtml(html, { judul = '', meta = [], favicon = '', skrip = '' } = {}) {
  const kepala = [
    judul ? `<title>${escAttr(judul)}</title>` : '',
    ...meta.map((m) => `<meta name="${escAttr(m.nama)}" content="${escAttr(m.isi)}">`),
    favicon ? `<link rel="icon" href="${escAttr(favicon)}">` : '',
    skrip,
  ].filter(Boolean).join('\n');
  const m = /<head[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + '\n' + kepala + '\n' + html.slice(m.index + m[0].length);
  const d = /<!doctype[^>]*>/i.exec(html);
  if (d) return html.slice(0, d.index + d[0].length) + '\n' + kepala + '\n' + html.slice(d.index + d[0].length);
  return kepala + '\n' + html;
}
