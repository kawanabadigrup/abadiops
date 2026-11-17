'use client';

import { useState, useEffect } from 'react';

export default function Masuk() {
  const [token, setToken] = useState(localStorage.getItem('mar_last_token') || '');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'mode'>('input');
  const [hasil, setHasil] = useState<{ peran: string; tenantCode: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('token') || q.get('t');
    if (t) setToken(t);
  }, []);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetch('/api/masuk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const j = await r.json();
      if (!j.ok) {
        setGalat(j.pesan ?? 'Token tidak dikenal');
        setSibuk(false);
        return;
      }
      localStorage.setItem('mar_last_token', token.trim());
      setHasil({ peran: j.peran, tenantCode: j.tenantCode });
      setStep('mode');
      setSibuk(false);
    } catch {
      setGalat('Tidak bisa menghubungi server. Periksa sambungan.');
      setSibuk(false);
    }
  }

  async function pilih(mode: 'pwa' | 'web') {
    setSibuk(true);
    if (mode === 'pwa') window.location.href = '/pwa';
    else window.location.href = '/monitoring';
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="container-sempit" style={{ maxWidth: 520 }}>
        {step === 'input' ? (
          <>
            <div className="page-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 className="page-title" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔐 MAR Login</h1>
              <p className="page-subtitle">Masuk dengan token akses Anda</p>
            </div>

            <form className="card" onSubmit={kirim}>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="token">
                    Token <span className="wajib">*</span>
                  </label>
                  <input
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Ketik token akses Anda"
                    style={{ fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}
                  />
                </div>

                {galat && (
                  <div className="kabar kabar-salah" style={{ marginBottom: '1rem' }}>
                    ⚠️ {galat}
                  </div>
                )}

                <button
                  className="btn-primary btn-blok"
                  disabled={sibuk || token.trim().length < 8}
                >
                  {sibuk ? '⏳ Memeriksa…' : '🔓 Masuk'}
                </button>
              </div>
            </form>

            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <p>Token Anda aman. Sistem otomatis mengenali rumah dari token.</p>
            </div>
          </>
        ) : (
          <>
            <div className="page-header" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h1 className="page-title" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
                {hasil?.tenantCode === 'kmb' ? 'KMB Project' : hasil?.tenantCode === 'sum' ? 'SUM' : 'MAR'}
              </h1>
              <p className="page-subtitle">
                {hasil?.peran === 'superintendent' ? 'Superintendent' :
                 hasil?.peran === 'supervisor' ? 'Supervisor' : 'Mechanic'}
                • {hasil?.tenantCode}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button
                className="btn-primary btn-blok"
                onClick={() => pilih('pwa')}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}
              >
                <span style={{ fontSize: '2rem' }}>📱</span>
                <span style={{ textAlign: 'left' }}>
                  <strong>PWA</strong> – Offline-first untuk HP/komputer
                </span>
              </button>
              <button
                className="btn-primary btn-blok"
                onClick={() => pilih('web')}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}
              >
                <span style={{ fontSize: '2rem' }}>💻</span>
                <span style={{ textAlign: 'left' }}>
                  <strong>Web Normal</strong> – Hubungan langsung ke backend
                </span>
              </button>
            </div>

            <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <p>Anda adalah <strong>{hasil?.peran}</strong> di sistem {hasil?.tenantCode}</p>
              <p style={{ marginTop: '0.5rem' }}>Masuk ulang dengan mengetik token baru.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}