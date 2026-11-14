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
  // tidak_aman: operasi pada sheet jarang yang tidak bisa dijawab dari baris yang dimuat. Worker menolak.
  var CATAT = { tulis: [], tak_dikenal: [], baca_dilewati: [], tidak_aman: [], dibaca: [], layanan: [], log: [] };
  // Penanda baris sheet jarang yang tidak dikirim server (cermin_baca p_jarang).
  var TIDAK_DIMUAT = { tidakDimuat: true };
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
  // Semua properti dalam diisi di sini: Proxy tanpaDikenal menjawab properti yang belum ada dengan fungsi pencatat.
  function Lembar(nama, v, lebar, dilewati) {
    this._nama = nama; this._v = v; this._lebar = lebar; this._dilewati = !!dilewati; this._id = DAFTAR.length + 1;
    this._akhir = null; this._berubah = false; this._jarang = null;
  }
  function adaIsi(x) { return x !== undefined && x !== null && x !== ''; }
  Lembar.prototype = {
    _baca: function () { catatSekali(CATAT.dibaca, this._nama); if (this._dilewati) catatSekali(CATAT.baca_dilewati, this._nama); },
    _tulis: function (cara, baris, kolom, isi) {
      var teks; try { teks = JSON.stringify(isi); } catch (e) { teks = String(isi); }
      CATAT.tulis.push({ sheet: this._nama, cara: cara, baris: baris, kolom: kolom, isi: String(teks).slice(0, 300) });
      this._berubah = true;
      this._akhir = null;
    },
    _pastikan: function (baris, kolom) {
      while (this._v.length < baris) this._v.push([]);
      if (kolom > this._lebar) this._lebar = kolom;
    },
    // Seperti Sheets: baris dan kolom terakhir yang BERISI, bukan panjang larik. Baris yang dikosongkan di ujung
    // tidak dihitung, dan appendRow menulis tepat di bawah baris terakhir yang berisi.
    _ujung: function () {
      if (!this._akhir) {
        var nb = this._v.length, nk = 0;
        while (nb > 0 && this._v[nb - 1] !== TIDAK_DIMUAT && !(this._v[nb - 1] || []).some(adaIsi)) nb--;
        for (var i = 0; i < nb; i++) {
          var r = this._v[i];
          if (r === TIDAK_DIMUAT) continue;
          r = r || [];
          for (var j = r.length; j > nk; j--) if (adaIsi(r[j - 1])) { nk = j; break; }
        }
        this._akhir = { b: nb, k: nk };
      }
      return this._akhir;
    },
    // Sheet jarang: baris yang tidak dimuat tidak boleh digeser atau ditimpa.
    _jagaJarang: function (cara, dari, sampai) {
      if (!this._jarang) return;
      for (var i = dari; i <= sampai && i <= this._v.length; i++) {
        if (this._v[i - 1] === TIDAK_DIMUAT) { catatSekali(CATAT.tidak_aman, this._nama + '.' + cara + ' mengenai baris yang tidak dimuat'); return; }
      }
    },
    getName: function () { return this._nama; },
    getSheetName: function () { return this._nama; },
    getSheetId: function () { return this._id; },
    getIndex: function () { return this._id; },
    getParent: function () { return SS; },
    getLastRow: function () { this._baca(); return this._ujung().b; },
    getLastColumn: function () { this._baca(); return this._ujung().k; },
    getMaxRows: function () { return Math.max(this._v.length, 1000); },
    getMaxColumns: function () { return Math.max(this._lebar, 26); },
    getFrozenRows: function () { return 1; },
    getFrozenColumns: function () { return 0; },
    isSheetHidden: function () { return false; },
    getDataRange: function () { var u = this._ujung(); return rentang(this, 1, 1, Math.max(u.b, 1), Math.max(u.k, 1)); },
    getRange: function (a, b, c, d) {
      if (typeof a === 'string') return rentangA1(this, a);
      return rentang(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    appendRow: function (arr) {
      var n = this._ujung().b;
      this._tulis('appendRow', n + 1, 1, arr);
      this._pastikan(n + 1, arr.length);
      this._v[n] = arr.map(salin);
      return this;
    },
    deleteRow: function (n) { this._jagaJarang('deleteRow', n, this._v.length); this._tulis('deleteRow', n, 1, null); this._v.splice(n - 1, 1); return this; },
    deleteRows: function (n, k) { this._jagaJarang('deleteRows', n, this._v.length); this._tulis('deleteRows', n, 1, k); this._v.splice(n - 1, k); return this; },
    insertRowAfter: function (n) { this._jagaJarang('insertRowAfter', n + 1, this._v.length); this._tulis('insertRowAfter', n, 1, null); this._v.splice(n, 0, []); return this; },
    insertRowsAfter: function (n, k) { this._jagaJarang('insertRowsAfter', n + 1, this._v.length); this._tulis('insertRowsAfter', n, 1, k); for (var i = 0; i < k; i++) this._v.splice(n, 0, []); return this; },
    insertRowBefore: function (n) { this._jagaJarang('insertRowBefore', n, this._v.length); this._tulis('insertRowBefore', n, 1, null); this._v.splice(n - 1, 0, []); return this; },
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
        var r = this._l._v[this._b - 1 + i];
        if (r === TIDAK_DIMUAT) { catatSekali(CATAT.tidak_aman, this._l._nama + ' dibaca di baris yang tidak dimuat'); r = []; }
        r = r || [];
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
      this._l._jagaJarang('setValues', this._b, this._b + m.length - 1);
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
    var opsi = { utuh: false, hurufSama: false, regex: false };
    var f = tanpaDikenal('TextFinder', {
      matchEntireCell: function (x) { opsi.utuh = !!x; return f; },
      matchCase: function (x) { opsi.hurufSama = !!x; return f; },
      useRegularExpression: function (x) { opsi.regex = !!x; return f; },
      findAll: function () {
        l._baca();
        var cocok;
        if (opsi.regex) {
          var re = new RegExp(opsi.utuh ? '^(?:' + String(teks) + ')$' : String(teks), opsi.hurufSama ? '' : 'i');
          cocok = function (s) { return re.test(s); };
        } else {
          var cari = opsi.hurufSama ? String(teks) : String(teks).toLowerCase();
          cocok = function (s) { s = opsi.hurufSama ? s : s.toLowerCase(); return opsi.utuh ? s === cari : s.indexOf(cari) !== -1; };
        }
        // Sheet jarang: baris yang tidak dimuat boleh dilewati HANYA bila pencariannya persis saringan server
        // (kolom yang sama, nilai yang sama, cocok utuh dan peka huruf): server sudah mengirim semua baris yang cocok.
        var bolehLewati = !!l._jarang && !opsi.regex && opsi.utuh && opsi.hurufSama && nk === 1
          && k - 1 === l._jarang.kolom && String(teks) === l._jarang.nilai;
        var hasil = [];
        for (var i = 0; i < nb; i++) {
          var r = l._v[b - 1 + i];
          if (r === TIDAK_DIMUAT) {
            if (!bolehLewati) catatSekali(CATAT.tidak_aman, l._nama + ' dicari di baris yang tidak dimuat');
            continue;
          }
          r = r || [];
          for (var j = 0; j < nk; j++) {
            var x = r[k - 1 + j]; if (!adaIsi(x)) continue;
            if (cocok(String(x))) hasil.push(rentang(l, b + i, k + j, 1, 1));
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
    var u = l._ujung();
    var b2 = akhir.b || Math.max(u.b, 1), k2 = akhir.k || Math.max(u.k, 1);
    return rentang(l, b1, k1, b2 - b1 + 1, k2 - k1 + 1);
  }
  function pasangLembar(nama, v, lebar, dilewati) {
    var l = tanpaDikenal('Sheet', new Lembar(nama, v, lebar, dilewati));
    LEMBAR[nama] = l; DAFTAR.push(l);
    return l;
  }

  function barisDariCermin(s, r) {
    var baris = [];
    for (var j = 0; j < s.headers.length; j++) {
      var x = r[j];
      baris.push(s.tanggal[j] && typeof x === 'string' && ISO.test(x) ? new DateZona(x) : (x === undefined || x === null ? '' : x));
    }
    return baris;
  }
  Object.keys(D.sheets).forEach(function (nama) {
    var s = D.sheets[nama];
    if (s.tidak_dimuat) { pasangLembar(nama, [], 0, true); return; }
    if (s.jarang) {
      var vj = [s.headers.slice()];
      for (var n = 0; n < s.jumlah_baris; n++) vj.push(TIDAK_DIMUAT);
      s.baris_dimuat.forEach(function (x) { vj[x.baris - 1] = barisDariCermin(s, x.nilai); });
      var lj = pasangLembar(nama, vj, s.headers.length, false);
      // lastIndexOf: pada nama kolom kembar, data->>kolom di server berisi kolom yang terakhir.
      lj._jarang = { kolom: s.headers.lastIndexOf(s.jarang.kolom), nilai: String(s.jarang.nilai) };
      return;
    }
    var v = s.headers.length ? [s.headers.slice()].concat(s.rows.map(function (r) { return barisDariCermin(s, r); })) : [];
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
    // Pemanggil PWA/web anonim: email kosong. D.penggunaAktif hanya untuk uji (meniru editor atau menu).
    getActiveUser: function () { catatSekali(CATAT.layanan, 'Session.getActiveUser'); return { getEmail: function () { return D.penggunaAktif || ''; } }; },
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

  // ── HtmlService: template hasil kompilasi tools/kembar/templat-gas.mjs, dipasang lewat __pasangTemplat ──
  var TEMPLAT = {}, CARI_GLOBAL = function () { return undefined; };
  function teksCetak(v) { return v === null || v === undefined ? '' : String(v); }
  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;'); }
  function escJsString(s) {
    return s.replace(/[\\'"<>&=`\u2028\u2029\x00-\x1f]/g, function (c) {
      var h = c.charCodeAt(0).toString(16);
      return h.length <= 2 ? '\\x' + ('0' + h).slice(-2) : '\\u' + ('000' + h).slice(-4);
    });
  }
  // Pencetak <?= ?> per konteks (lihat templat-gas.mjs). <?!= ?> mencetak apa adanya.
  var PENCETAK = {
    html: function (v) { return escHtml(teksCetak(v)); },
    attr: function (v) { return escHtml(teksCetak(v)); },
    'url-awal': function (v) {
      var s = teksCetak(v);
      if (/^\s*(javascript|vbscript|data):/i.test(s)) return '#zSoyz';
      return escHtml(s.replace(/[\s"'<>\\`]/g, function (c) { return encodeURIComponent(c); }));
    },
    'url-tengah': function (v) { return escHtml(encodeURIComponent(teksCetak(v))); },
    onevent: function (v) { return escHtml(escJsString(teksCetak(v))); },
    js: function (v) { return escJsString(teksCetak(v)); },
    jskode: function (v) { var j = JSON.stringify(v === undefined ? null : v); return escJsString(String(j)).replace(/\\x22/g, '"'); },
    css: function (v) { return teksCetak(v).replace(/[<>"'\\]/g, ''); },
    komentar: function (v) { return teksCetak(v).replace(/\*\//g, '* /'); },
    mentah: function (v) { return teksCetak(v); },
  };
  // Properti internal tidak boleh terlihat sebagai properti template (scriptlet membaca properti sendiri).
  function Templat(nama) { Object.defineProperty(this, '__namaTemplat', { value: nama, enumerable: false }); }
  Templat.prototype.evaluate = function () {
    var f = TEMPLAT[this.__namaTemplat];
    if (!f) throw new Error('GAS lokal: template ' + this.__namaTemplat + ' tidak dikompilasi');
    return keluaranHtml(f(this, CARI_GLOBAL, PENCETAK));
  };
  Templat.prototype.getRawContent = function () { return (D.html || {})[this.__namaTemplat] || ''; };
  function KeluaranHtml(isi) { this._isi = isi; this._judul = ''; this._meta = []; this._favicon = ''; this._xframe = ''; }
  KeluaranHtml.prototype = {
    getContent: function () { return this._isi; },
    setContent: function (x) { this._isi = teksCetak(x); return this; },
    append: function (x) { this._isi += teksCetak(x); return this; },
    appendUntrusted: function (x) { this._isi += escHtml(teksCetak(x)); return this; },
    clear: function () { this._isi = ''; return this; },
    getTitle: function () { return this._judul; },
    setTitle: function (x) { this._judul = teksCetak(x); return this; },
    addMetaTag: function (nama, isi) { this._meta.push({ nama: teksCetak(nama), isi: teksCetak(isi) }); return this; },
    getMetaTags: function () { return this._meta.slice(); },
    setFaviconUrl: function (x) { this._favicon = teksCetak(x); return this; },
    getFaviconUrl: function () { return this._favicon; },
    setXFrameOptionsMode: function (x) { this._xframe = x; return this; },
    setSandboxMode: function () { return this; },
    setWidth: function () { return this; },
    setHeight: function () { return this; },
    getAs: function () { catatSekali(CATAT.tak_dikenal, 'HtmlOutput.getAs'); return null; },
  };
  function keluaranHtml(isi) { return tanpaDikenal('HtmlOutput', new KeluaranHtml(teksCetak(isi))); }
  var HtmlService = tanpaDikenal('HtmlService', {
    createTemplateFromFile: function (nama) { return new Templat(String(nama)); },
    createHtmlOutputFromFile: function (nama) {
      var isi = (D.html || {})[String(nama)];
      if (isi === undefined) throw new Error('No HTML file named ' + nama + ' was found.');
      return keluaranHtml(isi);
    },
    createHtmlOutput: function (x) { return keluaranHtml(x && typeof x.getContent === 'function' ? x.getContent() : x); },
    createTemplate: function () { catatSekali(CATAT.layanan, 'HtmlService.createTemplate'); throw new Error('GAS lokal: createTemplate dari teks tidak didukung (template dikompilasi saat bundel)'); },
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    SandboxMode: { IFRAME: 'IFRAME', NATIVE: 'NATIVE', EMULATED: 'EMULATED' },
  });

  // Isi baru setiap sheet yang ditulis, dalam bentuk cermin (tools/cermin/sinkron.mjs): header, baris nilai
  // (Date → ISO), dan tipe per kolom dihitung dari baris data. Baris dan kolom kosong di ujung dipotong,
  // sama dengan getDataRange(). Sheet yang dibuat insertSheet ditandai baru.
  function jenisSel(x) { return x instanceof NativeDate ? 'tanggal' : typeof x === 'number' ? 'angka' : typeof x === 'boolean' ? 'boolean' : 'teks'; }
  function teksTipe(set) {
    var t = Object.keys(set).sort();
    return t.length === 0 ? 'kosong' : t.length === 1 ? t[0] : 'campur:' + t.join('+');
  }
  function ekspor() {
    var hasil = {};
    DAFTAR.forEach(function (l) {
      if (!l._berubah) return;
      var u = l._ujung(), headers = [], rows = [], tipeKolom = [];
      var sel = function (i, j) {
        var x = (l._v[i] || [])[j];
        if (x instanceof NativeDate) { var t = NativeDate.prototype.getTime.call(x); return isNaN(t) ? '' : new NativeDate(t).toISOString(); }
        return x === undefined || x === null ? '' : x;
      };
      // Sheet jarang: hanya baris yang dimuat atau baru yang bisa dibandingkan. Tipe kolom digabung dengan tipe
      // lama dari cermin, karena baris lain tidak terlihat.
      if (l._jarang) {
        var asal = D.sheets[l._nama], lama = {}, tipeSet = {};
        asal.baris_dimuat.forEach(function (x) { lama[x.baris] = JSON.stringify(x.nilai); });
        asal.headers.forEach(function (h) {
          tipeSet[h] = {};
          String((asal.tipe || {})[h] || 'kosong').replace(/^campur:/, '').split('+').forEach(function (x) { if (x && x !== 'kosong') tipeSet[h][x] = true; });
        });
        if (u.k > asal.headers.length) catatSekali(CATAT.tidak_aman, l._nama + ' mendapat kolom baru pada sheet jarang');
        var berubah = [];
        for (var bi = 1; bi < u.b; bi++) {
          if (l._v[bi] === TIDAK_DIMUAT) continue;
          var rj = [];
          for (var kj = 0; kj < asal.headers.length; kj++) rj.push(sel(bi, kj));
          if (lama[bi + 1] === JSON.stringify(rj)) continue;
          for (var kt = 0; kt < asal.headers.length; kt++) {
            var asliJ = (l._v[bi] || [])[kt];
            if (adaIsi(asliJ)) tipeSet[asal.headers[kt]][jenisSel(asliJ)] = true;
          }
          berubah.push({ baris: bi + 1, nilai: rj });
        }
        var tipeJ = {};
        asal.headers.forEach(function (h) { tipeJ[h] = teksTipe(tipeSet[h]); });
        hasil[l._nama] = { jarang: true, headers: asal.headers.slice(), tipe: tipeJ, jumlah_baris: u.b - 1, baris_berubah: berubah, baru: false };
        return;
      }
      for (var j = 0; j < u.k; j++) { headers.push(u.b ? String(sel(0, j)) : ''); tipeKolom.push({}); }
      for (var i = 1; i < u.b; i++) {
        var r = [];
        for (var k = 0; k < u.k; k++) {
          var asli = (l._v[i] || [])[k], x = sel(i, k);
          if (adaIsi(asli)) tipeKolom[k][jenisSel(asli)] = true;
          r.push(x);
        }
        rows.push(r);
      }
      var tipe = {};
      headers.forEach(function (h, k) { tipe[h] = teksTipe(tipeKolom[k]); });
      hasil[l._nama] = { headers: headers, rows: rows, tipe: tipe, baru: !D.sheets[l._nama] };
    });
    return hasil;
  }

  return {
    __CATAT: CATAT,
    __ekspor: ekspor,
    __pasangTemplat: function (t, g) { TEMPLAT = t || {}; CARI_GLOBAL = g || CARI_GLOBAL; },
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
      // Alamat web app = alamat web Worker yang sedang melayani (D.urlWeb), supaya tautan antarhalaman tetap di sini.
      getService: function () { return { getUrl: function () { return D.urlWeb || 'https://script.google.com/macros/s/GAS-LOKAL/exec'; } }; },
      // D.pemicu hanya untuk uji: [{ uid, fungsi }] meniru pemicu terpasang.
      getProjectTriggers: function () {
        return (D.pemicu || []).map(function (p) {
          return { getUniqueId: function () { return String(p.uid); }, getHandlerFunction: function () { return p.fungsi; }, getEventType: function () { return 'CLOCK'; } };
        });
      },
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
    HtmlService: HtmlService,
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

// Objek e untuk doGet dari query string, seperti di GAS: parameter berisi nilai pertama, parameters semua nilai.
export function buatPermintaanGet(queryString) {
  var qs = String(queryString || '').replace(/^\?/, ''), parameter = {}, parameters = {};
  qs.split('&').forEach(function (p) {
    if (!p) return;
    var i = p.indexOf('=');
    var k = decodeURIComponent((i < 0 ? p : p.slice(0, i)).replace(/\+/g, ' '));
    var v = i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '));
    if (!Object.prototype.hasOwnProperty.call(parameter, k)) parameter[k] = v;
    (parameters[k] = parameters[k] || []).push(v);
  });
  return { parameter: parameter, parameters: parameters, queryString: qs, contextPath: '', contentLength: -1, pathInfo: '' };
}

// Nilai balik fungsi server untuk google.script.run: hanya primitif, larik, dan objek polos yang sah. Jawaban yang
// memuat Date (atau jenis lain yang tidak sah) diterima peramban sebagai null, karena itulah kode GAS sendiri
// membungkus sebagian jawabannya dengan JSON.parse(JSON.stringify(...)).
export function hasilRun(v) {
  var sah = true;
  (function periksa(x) {
    if (!sah || x === null || x === undefined) return;
    var t = typeof x;
    if (t === 'number' || t === 'string' || t === 'boolean') return;
    if (t === 'function' || t === 'symbol' || t === 'bigint' || x instanceof Date) { sah = false; return; }
    if (Array.isArray(x)) { x.forEach(periksa); return; }
    var p = Object.getPrototypeOf(x);
    if (p !== Object.prototype && p !== null) { sah = false; return; }
    Object.keys(x).forEach(function (k) { periksa(x[k]); });
  })(v);
  return sah ? (v === undefined ? null : JSON.parse(JSON.stringify(v))) : null;
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
