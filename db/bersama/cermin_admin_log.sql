-- Catatan setiap perubahan lewat pusat admin (workers/pintu/src/admin-cermin.js): siapa, kapan, sheet dan baris
-- mana, isi sebelum dan sesudah. Spreadsheet punya riwayat versi; cermin tidak, jadi riwayatnya di sini.
--
-- Sengaja BUKAN sheet AuditLogs milik GAS: penjaga dan audit integritas GAS membaca AuditLogs, dan aksi yang tidak
-- dikenalnya bisa dianggap kebocoran. Token di ApiTokens disamarkan sebelum dicatat (empat huruf pertama).
--
-- Hanya service_role (Worker pintu) yang boleh membaca dan menulis; anon dan authenticated tidak.
CREATE TABLE IF NOT EXISTS public.cermin_admin_log (
  id      bigserial PRIMARY KEY,
  waktu   timestamptz NOT NULL DEFAULT clock_timestamp(),
  skema   text NOT NULL,
  sheet   text NOT NULL,
  aksi    text NOT NULL,          -- ubah | tambah | hapus | token_terbit | token_cabut
  baris   integer,                -- nomor baris sheet sebelum perubahan (tambah: baris baru)
  kunci   text,                   -- isi kolom pertama baris itu (mechanic_id, unit_id, setting_key, ...)
  oleh    text NOT NULL,          -- nama yang diisi di panel
  ip      text,
  uang    boolean NOT NULL DEFAULT false,  -- menyentuh kolom uang (sudah dikonfirmasi dua kali)
  sebelum jsonb,
  sesudah jsonb
);

CREATE INDEX IF NOT EXISTS cermin_admin_log_skema_waktu ON public.cermin_admin_log (skema, waktu DESC);

ALTER TABLE public.cermin_admin_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cermin_admin_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.cermin_admin_log_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.cermin_admin_log TO service_role;
GRANT USAGE ON SEQUENCE public.cermin_admin_log_id_seq TO service_role;
