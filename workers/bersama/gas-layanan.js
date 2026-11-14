/**
 * Layanan Google tiruan untuk menjalankan kode Google Apps Script ASLI sebuah rumah di luar Google:
 * di Worker Cloudflare (workers/<rumah>) dan di komputer kerja sebagai pembanding uji kembar
 * (tools/kembar/gas-lokal.mjs). Satu berkas untuk keduanya, supaya yang diuji di komputer kerja sama
 * dengan yang tayang.
 *
 * Datanya cermin Supabase (public.cermin_baca, db/bersama/cermin_baca.sql): satu sheet = header + baris
 * nilai, bentuknya sama dengan getDataRange().getValues(). Sel di kolom bertipe tanggal menjadi Date.
 *
 *   SpreadsheetApp     sheet dari cermin. Tulisan hanya ke memori dan dicatat di __CATAT.tulis.
 *                      Sheet yang tidak dicermin atau tidak dimuat tampil kosong, dan setiap pembacaannya
 *                      dicatat di __CATAT.baca_dilewati: jawaban yang memakainya tidak boleh dipercaya.
 *   Date               berzona skrip (appsscript.json timeZone). Di GAS, getHours(), getDate(),
 *                      new Date(th, bl, tg), dan parse waktu lokal memakai zona skrip; Worker selalu UTC.
 *   CacheService       kosong di awal setiap panggilan: jawaban = isi sheet, seperti GAS tanpa cache.
 *   PropertiesService  kosong. Lock selalu didapat. Utilities.formatDate memakai zona yang diminta.
 *   UrlFetchApp, GmailApp, DriveApp, HtmlService, Browser tidak tersedia: panggilannya dicatat dan
 *                      dijawab galat. MailApp.sendEmail dicatat tanpa mengirim.
 *
 * buatLayanan dan buatPermintaanPost harus berdiri sendiri (tidak merujuk apa pun di luar badannya),
 * karena gas-lokal menjalankannya di konteks vm lewat toString().
 */

/**
 * @param D    { zonaSkrip, zonaSheet, judul, dilewati: [nama sheet], sheets: { nama: { headers, tanggal, rows }
 *             | { tidak_dimuat: true } } }
 * @param host { uuid(), digest(alg, isiJson) → JSON byte bertanda, b64(isiJson, websafe) → string }
 * @returns    objek layanan yang dipasang sebagai variabel global kode GAS, ditambah __CATAT.
 */
export function buatLayanan(D, host) {
  var NativeDate = Date;
  var CATAT = { tulis: [], tak_dikenal: [], baca_dilewati: [], dibaca: [], layanan: [], log: [] };
  var ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var ZONA = D.zonaSkrip;

  function catatSekali(daftar, isi) { if (daftar.indexOf(isi) === -1) daftar.push(isi); }
  function catatLog(args) {
    if (CATAT.log.length >= 400) return;
    CATAT.log.push([].slice.call(args).map(function (x) {
      try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); }
    }).join(' ').slice(0, 300));
  }
  // Metode yang tidak ditiru tetap bisa dipanggil (dan dirantai), tapi namanya dicatat untuk diperiksa.
  function tanpaDikenal(nama, obj) {
    return new Proxy(obj, {
      get: function (t, p) {
        if (p in t) return t[p];
        if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
        return function () { catatSekali(CATAT.tak_dikenal, nama + '.' + String(p)); return this; };
      },
    });
  }
  function tidakTersedia(nama) {
    return new Proxy({}, {
      get: function (t, p) {
        if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
        return function () { catatSekali(CATAT.layanan, nama + '.' + String(p)); throw new Error('GAS lokal: ' + nama + '.' + String(p) + ' tidak tersedia'); };
      },
    });
  }

  // ── Date berzona skrip ──
  var HARI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var HARI_P = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var BLN_P = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function pad(x, n) { x = String(x); while (x.length < n) x = '0' + x; return x; }
  var fmtZona = {};
  function bagianZona(t, tz) {
    var m = String(tz || '').match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (m) {
      var off = (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
      var u = new NativeDate(t + off * 60000);
      return { y: u.getUTCFullYear(), M: u.getUTCMonth() + 1, d: u.getUTCDate(), H: u.getUTCHours(), m: u.getUTCMinutes(), s: u.getUTCSeconds(), S: u.getUTCMilliseconds(), E: u.getUTCDay(), off: off };
    }
    var z = tz || ZONA;
    if (!fmtZona[z]) fmtZona[z] = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
    var p = {};
    fmtZona[z].formatToParts(new NativeDate(t)).forEach(function (x) { p[x.type] = x.value; });
    var ms = ((t % 1000) + 1000) % 1000;
    var b = { y: +p.year, M: +p.month, d: +p.day, H: (+p.hour) % 24, m: +p.minute, s: +p.second, S: ms, E: HARI.indexOf(p.weekday) };
    b.off = Math.round((NativeDate.UTC(b.y, b.M - 1, b.d, b.H, b.m, b.s) - (t - ms)) / 60000);
    return b;
  }
  function offsetMs(t) { return bagianZona(t, ZONA).off * 60000; }
  // Jam dinding di zona skrip (dihitung seolah UTC) → waktu sebenarnya.
  function dariJamDinding(w) { var u = w - offsetMs(w); return w - offsetMs(u); }
  function lokal(d) { var t = NativeDate.prototype.getTime.call(d); return isNaN(t) ? null : bagianZona(t, ZONA); }
  function setLokal(d, ubah) {
    var b = lokal(d);
    if (!b) return NaN;
    var k = { y: b.y, M: b.M - 1, d: b.d, H: b.H, m: b.m, s: b.s, S: b.S };
    ubah(k);
    var t = dariJamDinding(NativeDate.UTC(k.y, k.M, k.d, k.H, k.m, k.s, k.S));
    return NativeDate.prototype.setTime.call(d, t);
  }
  var namaZona = null;
  function teksZona(t) {
    if (namaZona === null) {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'long' }).formatToParts(new NativeDate(t));
      namaZona = (p.filter(function (x) { return x.type === 'timeZoneName'; })[0] || {}).value || ZONA;
    }
    var o = bagianZona(t, ZONA).off, a = Math.abs(o);
    return 'GMT' + (o < 0 ? '-' : '+') + pad(Math.floor(a / 60), 2) + pad(a % 60, 2) + ' (' + namaZona + ')';
  }
  class DateZona extends NativeDate {
    constructor() {
      var a = arguments;
      if (a.length === 0) { super(); return; }
      if (a.length === 1) {
        var x = a[0];
        if (x instanceof NativeDate) super(NativeDate.prototype.getTime.call(x));
        else if (typeof x === 'string') super(DateZona.parse(x));
        else super(x);
        return;
      }
      var w = NativeDate.UTC(a[0], a[1], a.length > 2 ? a[2] : 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
      super(isNaN(w) ? NaN : dariJamDinding(w));
    }
    static now() { return NativeDate.now(); }
    static UTC() { return NativeDate.UTC.apply(NativeDate, arguments); }
    // Tanpa zona eksplisit, V8 membaca waktu sebagai waktu lokal (kecuali tanggal ISO polos, yang UTC).
    static parse(s) {
      s = String(s).trim();
      var t = NativeDate.parse(s);
      if (isNaN(t)) return t;
      if (/(?:[zZ]|[+-]\d{2}:?\d{2}|\b(?:GMT|UTC)\b.*)$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return t;
      return dariJamDinding(t);
    }
    getFullYear() { var b = lokal(this); return b ? b.y : NaN; }
    getMonth() { var b = lokal(this); return b ? b.M - 1 : NaN; }
    getDate() { var b = lokal(this); return b ? b.d : NaN; }
    getDay() { var b = lokal(this); return b ? b.E : NaN; }
    getHours() { var b = lokal(this); return b ? b.H : NaN; }
    getMinutes() { var b = lokal(this); return b ? b.m : NaN; }
    getSeconds() { var b = lokal(this); return b ? b.s : NaN; }
    getYear() { var b = lokal(this); return b ? b.y - 1900 : NaN; }
    getTimezoneOffset() { var b = lokal(this); return b ? -b.off : NaN; }
    setFullYear(y, M, d) { var a = arguments; return setLokal(this, function (k) { k.y = y; if (a.length > 1) k.M = M; if (a.length > 2) k.d = d; }); }
    setMonth(M, d) { var a = arguments; return setLokal(this, function (k) { k.M = M; if (a.length > 1) k.d = d; }); }
    setDate(d) { return setLokal(this, function (k) { k.d = d; }); }
    setHours(H, m, s, S) { var a = arguments; return setLokal(this, function (k) { k.H = H; if (a.length > 1) k.m = m; if (a.length > 2) k.s = s; if (a.length > 3) k.S = S; }); }
    setMinutes(m, s, S) { var a = arguments; return setLokal(this, function (k) { k.m = m; if (a.length > 1) k.s = s; if (a.length > 2) k.S = S; }); }
    setSeconds(s, S) { var a = arguments; return setLokal(this, function (k) { k.s = s; if (a.length > 1) k.S = S; }); }
    toString() {
      var b = lokal(this);
      if (!b) return 'Invalid Date';
      return HARI[b.E] + ' ' + BLN[b.M - 1] + ' ' + pad(b.d, 2) + ' ' + pad(b.y, 4) + ' ' + pad(b.H, 2) + ':' + pad(b.m, 2) + ':' + pad(b.s, 2) + ' ' + teksZona(this.getTime());
    }
    toDateString() { var b = lokal(this); return b ? HARI[b.E] + ' ' + BLN[b.M - 1] + ' ' + pad(b.d, 2) + ' ' + pad(b.y, 4) : 'Invalid Date'; }
    toTimeString() { var b = lokal(this); return b ? pad(b.H, 2) + ':' + pad(b.m, 2) + ':' + pad(b.s, 2) + ' ' + teksZona(this.getTime()) : 'Invalid Date'; }
    toLocaleString(l, o) { return NativeDate.prototype.toLocaleString.call(this, l, Object.assign({ timeZone: ZONA }, o)); }
    toLocaleDateString(l, o) { return NativeDate.prototype.toLocaleDateString.call(this, l, Object.assign({ timeZone: ZONA }, o)); }
    toLocaleTimeString(l, o) { return NativeDate.prototype.toLocaleTimeString.call(this, l, Object.assign({ timeZone: ZONA }, o)); }
  }
  function salin(x) { return x === undefined || x === null ? '' : (x instanceof NativeDate ? new DateZona(x.getTime()) : x); }

  // ── Sheet dan range ──
  var LEMBAR = {}, DAFTAR = [], SS;
  function Lembar(nama, v, lebar, dilewati) {
    this._nama = nama; this._v = v; this._lebar = lebar; this._dilewati = !!dilewati; this._id = DAFTAR.length + 1;
  }
  Lembar.prototype = {
    _baca: function () { catatSekali(CATAT.dibaca, this._nama); if (this._dilewati) catatSekali(CATAT.baca_dilewati, this._nama); },
    _tulis: function (cara, baris, kolom, isi) {
      var teks; try { teks = JSON.stringify(isi); } catch (e) { teks = String(isi); }
      CATAT.tulis.push({ sheet: this._nama, cara: cara, baris: baris, kolom: kolom, isi: String(teks).slice(0, 300) });
    },
    _pastikan: function (baris, kolom) {
      while (this._v.length < baris) this._v.push([]);
      if (kolom > this._lebar) this._lebar = kolom;
    },
    getName: function () { return this._nama; },
    getSheetName: function () { return this._nama; },
    getSheetId: function () { return this._id; },
    getIndex: function () { return this._id; },
    getParent: function () { return SS; },
    getLastRow: function () { this._baca(); return this._v.length; },
    getLastColumn: function () { this._baca(); return this._v.length ? this._lebar : 0; },
    getMaxRows: function () { return Math.max(this._v.length, 1000); },
    getMaxColumns: function () { return Math.max(this._lebar, 26); },
    getFrozenRows: function () { return 1; },
    getFrozenColumns: function () { return 0; },
    isSheetHidden: function () { return false; },
    getDataRange: function () { return rentang(this, 1, 1, Math.max(this._v.length, 1), Math.max(this._lebar, 1)); },
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') return rentangA1(this, a);
      return rentang(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    appendRow: function (arr) {
      this._tulis('appendRow', this._v.length + 1, 1, arr);
      this._v.push(arr.map(salin));
      if (arr.length > this._lebar) this._lebar = arr.length;
      return this;
    },
    deleteRow: function (n) { this._tulis('deleteRow', n, 1, null); this._v.splice(n - 1, 1); return this; },
    deleteRows: function (n, k) { this._tulis('deleteRows', n, 1, k); this._v.splice(n - 1, k); return this; },
    insertRowAfter: function (n) { this._tulis('insertRowAfter', n, 1, null); this._v.splice(n, 0, []); return this; },
    insertRowsAfter: function (n, k) { this._tulis('insertRowsAfter', n, 1, k); for (var i = 0; i < k; i++) this._v.splice(n, 0, []); return this; },
    insertRowBefore: function (n) { this._tulis('insertRowBefore', n, 1, null); this._v.splice(n - 1, 0, []); return this; },
    insertColumnAfter: function (n) { this._tulis('insertColumnAfter', 1, n, null); this._lebar++; return this; },
    setFrozenRows: function (n) { this._tulis('setFrozenRows', 1, 1, n); return this; },
    // Pencarian teks satu sheet atau range: cukup untuk cara kode GAS ini memakainya (cari sel yang sama persis).
    createTextFinder: function (teks) { return pencari(this, 1, 1, Math.max(this._v.length, 1), Math.max(this._lebar, 1), teks); },
  };
  function Rentang(lembar, baris, kolom, nb, nk) { this._l = lembar; this._b = baris; this._k = kolom; this._nb = nb; this._nk = nk; }
  Rentang.prototype = {
    getValues: function () {
      this._l._baca();
      var out = [];
      for (var i = 0; i < this._nb; i++) {
        var r = this._l._v[this._b - 1 + i] || [];
        var baris = [];
        for (var j = 0; j < this._nk; j++) baris.push(salin(r[this._k - 1 + j]));
        out.push(baris);
      }
      return out;
    },
    getValue: function () { return this.getValues()[0][0]; },
    // Cermin tidak menyimpan tampilan sel. Hasilnya perkiraan, dan pemakaiannya dicatat.
    getDisplayValues: function () {
      catatSekali(CATAT.layanan, 'Range.getDisplayValues (perkiraan)');
      return this.getValues().map(function (r) { return r.map(function (x) { return String(x); }); });
    },
    getDisplayValue: function () { return this.getDisplayValues()[0][0]; },
    setValues: function (m) {
      this._l._tulis('setValues', this._b, this._k, m);
      this._l._pastikan(this._b + m.length - 1, this._k + ((m[0] || []).length) - 1);
      for (var i = 0; i < m.length; i++) {
        var r = this._l._v[this._b - 1 + i];
        for (var j = 0; j < m[i].length; j++) r[this._k - 1 + j] = salin(m[i][j]);
      }
      return this;
    },
    setValue: function (x) { return this.setValues([[x]]); },
    clearContent: function () {
      var kosong = [];
      for (var i = 0; i < this._nb; i++) { kosong.push([]); for (var j = 0; j < this._nk; j++) kosong[i].push(''); }
      return this.setValues(kosong);
    },
    clear: function () { return this.clearContent(); },
    getRow: function () { return this._b; },
    getColumn: function () { return this._k; },
    getNumRows: function () { return this._nb; },
    getNumColumns: function () { return this._nk; },
    getLastRow: function () { return this._b + this._nb - 1; },
    getLastColumn: function () { return this._k + this._nk - 1; },
    getSheet: function () { return this._l; },
    getA1Notation: function () { return hurufKolom(this._k) + this._b + ':' + hurufKolom(this._k + this._nk - 1) + (this._b + this._nb - 1); },
    offset: function (b, k, nb, nk) { return rentang(this._l, this._b + b, this._k + k, nb === undefined ? this._nb : nb, nk === undefined ? this._nk : nk); },
    createTextFinder: function (teks) { return pencari(this._l, this._b, this._k, this._nb, this._nk, teks); },
  };
  function pencari(l, b, k, nb, nk, teks) {
    var opsi = { utuh: false, hurufSama: false };
    var f = tanpaDikenal('TextFinder', {
      matchEntireCell: function (x) { opsi.utuh = !!x; return f; },
      matchCase: function (x) { opsi.hurufSama = !!x; return f; },
      findAll: function () {
        l._baca();
        var cari = opsi.hurufSama ? String(teks) : String(teks).toLowerCase(), hasil = [];
        for (var i = 0; i < nb; i++) {
          var r = l._v[b - 1 + i] || [];
          for (var j = 0; j < nk; j++) {
            var x = r[k - 1 + j]; if (x === undefined || x === null || x === '') continue;
            var s = opsi.hurufSama ? String(x) : String(x).toLowerCase();
            if (opsi.utuh ? s === cari : s.indexOf(cari) !== -1) hasil.push(rentang(l, b + i, k + j, 1, 1));
          }
        }
        return hasil;
      },
      findNext: function () { return f.findAll()[0] || null; },
    });
    return f;
  }
  function rentang(l, b, k, nb, nk) {
    if (!(b >= 1) || !(k >= 1) || !(nb >= 1) || !(nk >= 1)) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    return tanpaDikenal('Range', new Rentang(l, b, k, nb, nk));
  }
  function hurufKolom(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function angkaKolom(h) { var n = 0; for (var i = 0; i < h.length; i++) n = n * 26 + (h.charCodeAt(i) - 64); return n; }
  function rentangA1(l, a1) {
    var t = String(a1).replace(/^.*!/, '').replace(/\$/g, '').toUpperCase();
    var sel = t.split(':').map(function (s) { var m = s.match(/^([A-Z]*)(\d*)$/); return { k: m[1] ? angkaKolom(m[1]) : null, b: m[2] ? parseInt(m[2], 10) : null }; });
    var awal = sel[0], akhir = sel[1] || sel[0];
    var b1 = awal.b || 1, k1 = awal.k || 1;
    var b2 = akhir.b || Math.max(l._v.length, 1), k2 = akhir.k || Math.max(l._lebar, 1);
    return rentang(l, b1, k1, b2 - b1 + 1, k2 - k1 + 1);
  }
  function pasangLembar(nama, v, lebar, dilewati) {
    var l = tanpaDikenal('Sheet', new Lembar(nama, v, lebar, dilewati));
    LEMBAR[nama] = l; DAFTAR.push(l);
    return l;
  }

  Object.keys(D.sheets).forEach(function (nama) {
    var s = D.sheets[nama];
    if (s.tidak_dimuat) { pasangLembar(nama, [], 0, true); return; }
    var v = s.headers.length ? [s.headers.slice()].concat(s.rows.map(function (r) {
      var baris = [];
      for (var j = 0; j < s.headers.length; j++) {
        var x = r[j];
        baris.push(s.tanggal[j] && typeof x === 'string' && ISO.test(x) ? new DateZona(x) : (x === undefined || x === null ? '' : x));
      }
      return baris;
    })) : [];
    pasangLembar(nama, v, s.headers.length, false);
  });
  (D.dilewati || []).forEach(function (nama) { if (!LEMBAR[nama]) pasangLembar(nama, [], 0, true); });

  SS = tanpaDikenal('Spreadsheet', {
    getSheetByName: function (n) { return LEMBAR[n] || null; },
    getSheets: function () { return DAFTAR.slice(); },
    insertSheet: function (n) { CATAT.tulis.push({ sheet: String(n), cara: 'insertSheet' }); return pasangLembar(String(n), [], 0, false); },
    getId: function () { return 'gas-lokal'; },
    getName: function () { return D.judul; },
    getSpreadsheetTimeZone: function () { return D.zonaSheet || ZONA; },
    getUrl: function () { return ''; },
    getActiveSheet: function () { return DAFTAR[0] || null; },
    toast: function () { catatSekali(CATAT.layanan, 'Spreadsheet.toast'); },
  });

  // ── Utilities.formatDate: pola SimpleDateFormat, bahasa Inggris seperti GAS ──
  function potongPola(c, n, t) {
    switch (c) {
      case 'y': return n === 2 ? pad(t.y % 100, 2) : pad(t.y, n);
      case 'M': return n >= 4 ? BLN_P[t.M - 1] : (n === 3 ? BLN[t.M - 1] : pad(t.M, n));
      case 'd': return pad(t.d, n);
      case 'H': return pad(t.H, n);
      case 'h': return pad(t.H % 12 === 0 ? 12 : t.H % 12, n);
      case 'm': return pad(t.m, n);
      case 's': return pad(t.s, n);
      case 'S': return pad(t.S, n);
      case 'E': return n >= 4 ? HARI_P[t.E] : HARI[t.E];
      case 'u': return String(t.E === 0 ? 7 : t.E);
      case 'a': return t.H < 12 ? 'AM' : 'PM';
      case 'Z': { var o = Math.abs(t.off); return (t.off < 0 ? '-' : '+') + pad(Math.floor(o / 60), 2) + pad(o % 60, 2); }
      case 'X': {
        if (t.off === 0) return 'Z';
        var o2 = Math.abs(t.off);
        return (t.off < 0 ? '-' : '+') + pad(Math.floor(o2 / 60), 2) + (n === 1 ? '' : (n === 3 ? ':' : '') + pad(o2 % 60, 2));
      }
      default: catatSekali(CATAT.layanan, 'formatDate huruf pola ' + c); return '';
    }
  }
  function formatTanggal(tanggal, tz, pola) {
    var d = tanggal instanceof NativeDate ? tanggal : new NativeDate(tanggal);
    var waktu = NativeDate.prototype.getTime.call(d);
    if (isNaN(waktu)) throw new Error('Invalid argument: date');
    var t = bagianZona(waktu, tz), P = String(pola), out = '', i = 0;
    while (i < P.length) {
      var c = P[i];
      if (c === "'") {
        if (P[i + 1] === "'") { out += "'"; i += 2; continue; }
        var j = P.indexOf("'", i + 1); if (j < 0) j = P.length;
        out += P.slice(i + 1, j); i = j + 1; continue;
      }
      if (!/[A-Za-z]/.test(c)) { out += c; i++; continue; }
      var n = 1; while (P[i + n] === c) n++;
      out += potongPola(c, n, t); i += n;
    }
    return out;
  }
  function keBytes(x) { return typeof x === 'string' ? { s: x } : { b: [].slice.call(x) }; }
  var Utilities = tanpaDikenal('Utilities', {
    formatDate: formatTanggal,
    getUuid: function () { return host.uuid(); },
    sleep: function () {},
    computeDigest: function (alg, isi) { return JSON.parse(host.digest(String(alg), JSON.stringify(keBytes(isi)))); },
    base64Encode: function (isi) { return host.b64(JSON.stringify(keBytes(isi)), false); },
    base64EncodeWebSafe: function (isi) { return host.b64(JSON.stringify(keBytes(isi)), true); },
    formatString: function (f) { var a = [].slice.call(arguments, 1), i = 0; return String(f).replace(/%[sdif]/g, function () { return String(a[i++]); }); },
    DigestAlgorithm: { MD2: 'MD2', MD5: 'MD5', SHA_1: 'SHA_1', SHA_256: 'SHA_256', SHA_384: 'SHA_384', SHA_512: 'SHA_512' },
    Charset: { UTF_8: 'UTF_8', US_ASCII: 'US_ASCII' },
  });

  // Eksekusi PWA berjalan sebagai deployer dengan pengguna anonim; identitas selalu dari token.
  var Session = tanpaDikenal('Session', {
    getScriptTimeZone: function () { return ZONA; },
    getActiveUser: function () { catatSekali(CATAT.layanan, 'Session.getActiveUser'); return { getEmail: function () { return ''; } }; },
    getEffectiveUser: function () { catatSekali(CATAT.layanan, 'Session.getEffectiveUser'); return { getEmail: function () { return ''; } }; },
    getTemporaryActiveUserKey: function () { return ''; },
  });
  var kunci = { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {}, hasLock: function () { return true; } };
  function simpanan() {
    var isi = {};
    return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(isi, k) ? isi[k] : null; },
      getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(isi, k)) o[k] = isi[k]; }); return o; },
      put: function (k, v) { isi[k] = String(v); },
      putAll: function (o) { Object.keys(o).forEach(function (k) { isi[k] = String(o[k]); }); },
      remove: function (k) { delete isi[k]; },
      removeAll: function (ks) { ks.forEach(function (k) { delete isi[k]; }); },
    };
  }
  var cache = { script: simpanan(), user: simpanan(), document: simpanan() };
  function properti(nama) {
    var isi = {};
    return {
      getProperty: function (k) { return Object.prototype.hasOwnProperty.call(isi, k) ? isi[k] : null; },
      getProperties: function () { var o = {}; Object.keys(isi).forEach(function (k) { o[k] = isi[k]; }); return o; },
      getKeys: function () { return Object.keys(isi); },
      setProperty: function (k, v) { CATAT.tulis.push({ sheet: '(' + nama + ')', cara: 'setProperty', isi: String(k) }); isi[k] = String(v); return this; },
      setProperties: function (o) { var self = this; Object.keys(o).forEach(function (k) { self.setProperty(k, o[k]); }); return this; },
      deleteProperty: function (k) { CATAT.tulis.push({ sheet: '(' + nama + ')', cara: 'deleteProperty', isi: String(k) }); delete isi[k]; return this; },
      deleteAllProperties: function () { isi = {}; return this; },
    };
  }
  var prop = { script: properti('ScriptProperties'), user: properti('UserProperties'), document: properti('DocumentProperties') };

  function Keluaran(isi) { this._isi = String(isi); this._mime = 'TEXT'; }
  Keluaran.prototype = {
    setMimeType: function (m) { this._mime = m; return this; },
    getMimeType: function () { return this._mime; },
    getContent: function () { return this._isi; },
    setContent: function (x) { this._isi = String(x); return this; },
    append: function (x) { this._isi += String(x); return this; },
  };
  var Logger = { log: function () { catatLog(arguments); return Logger; }, getLog: function () { return CATAT.log.join('\n'); }, clear: function () {} };

  return {
    __CATAT: CATAT,
    Date: DateZona,
    SpreadsheetApp: tanpaDikenal('SpreadsheetApp', {
      getActiveSpreadsheet: function () { return SS; },
      getActive: function () { return SS; },
      flush: function () {},
      openById: function () { catatSekali(CATAT.layanan, 'SpreadsheetApp.openById'); throw new Error('GAS lokal: openById tidak tersedia'); },
      openByUrl: function () { catatSekali(CATAT.layanan, 'SpreadsheetApp.openByUrl'); throw new Error('GAS lokal: openByUrl tidak tersedia'); },
      getUi: function () { catatSekali(CATAT.layanan, 'SpreadsheetApp.getUi'); throw new Error('GAS lokal: getUi tidak tersedia'); },
      BorderStyle: {},
    }),
    Utilities: Utilities,
    Session: Session,
    LockService: { getScriptLock: function () { return kunci; }, getDocumentLock: function () { return kunci; }, getUserLock: function () { return kunci; } },
    CacheService: { getScriptCache: function () { return cache.script; }, getUserCache: function () { return cache.user; }, getDocumentCache: function () { return cache.document; } },
    PropertiesService: { getScriptProperties: function () { return prop.script; }, getUserProperties: function () { return prop.user; }, getDocumentProperties: function () { return prop.document; } },
    ContentService: {
      createTextOutput: function (x) { return new Keluaran(x === undefined ? '' : x); },
      MimeType: { JSON: 'JSON', TEXT: 'TEXT', JAVASCRIPT: 'JAVASCRIPT', CSV: 'CSV', XML: 'XML', ICAL: 'ICAL', RSS: 'RSS', ATOM: 'ATOM', VCARD: 'VCARD' },
    },
    ScriptApp: tanpaDikenal('ScriptApp', {
      getService: function () { return { getUrl: function () { return 'https://script.google.com/macros/s/GAS-LOKAL/exec'; } }; },
      getProjectTriggers: function () { return []; },
      newTrigger: function () { catatSekali(CATAT.layanan, 'ScriptApp.newTrigger'); return tanpaDikenal('TriggerBuilder', {}); },
      deleteTrigger: function () { catatSekali(CATAT.layanan, 'ScriptApp.deleteTrigger'); },
      getOAuthToken: function () { catatSekali(CATAT.layanan, 'ScriptApp.getOAuthToken'); throw new Error('GAS lokal: getOAuthToken tidak tersedia'); },
      AuthMode: { FULL: 'FULL', LIMITED: 'LIMITED', NONE: 'NONE' },
    }),
    MailApp: {
      sendEmail: function () { catatSekali(CATAT.layanan, 'MailApp.sendEmail (tidak dikirim)'); },
      getRemainingDailyQuota: function () { return 0; },
    },
    UrlFetchApp: tidakTersedia('UrlFetchApp'),
    GmailApp: tidakTersedia('GmailApp'),
    DriveApp: tidakTersedia('DriveApp'),
    HtmlService: tidakTersedia('HtmlService'),
    Browser: tidakTersedia('Browser'),
    Logger: Logger,
    console: { log: function () { catatLog(arguments); }, info: function () { catatLog(arguments); }, warn: function () { catatLog(arguments); }, error: function () { catatLog(arguments); }, time: function () {}, timeEnd: function () {} },
  };
}

// Nama layanan yang dipasang sebagai variabel global kode GAS (urutannya tidak penting).
export const NAMA_LAYANAN = ['Date', 'SpreadsheetApp', 'Utilities', 'Session', 'LockService', 'CacheService', 'PropertiesService',
  'ContentService', 'ScriptApp', 'MailApp', 'UrlFetchApp', 'GmailApp', 'DriveApp', 'HtmlService', 'Browser', 'Logger', 'console'];

// Satu permintaan PWA: POST text/plain berisi {token, action, op_id, data}, seperti yang diterima doPost di produksi.
export function buatPermintaanPost(isiJson) {
  return { postData: { contents: isiJson, type: 'text/plain', length: isiJson.length, name: 'postData' }, parameter: {}, parameters: {}, contextPath: '', contentLength: isiJson.length, queryString: '' };
}

// Hasil public.cermin_baca → data untuk buatLayanan.
export function dataDariCermin(cermin, zonaSkrip) {
  const meta = cermin.meta || {};
  return {
    zonaSkrip,
    zonaSheet: meta.zona_waktu || null,
    judul: meta.judul || '',
    dilewati: String(meta.sheet_dilewati || '').split(',').map((s) => s.trim()).filter(Boolean),
    sinkron: meta.sinkron_terakhir || null,
    sheets: cermin.sheets || {},
  };
}
