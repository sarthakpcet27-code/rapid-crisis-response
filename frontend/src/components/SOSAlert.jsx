// src/components/SOSAlert.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import soundService from '../services/soundNotificationService';

const CRISIS_ICONS = {
  fire:'🔥', medical:'🏥', security:'🔒', flood:'🌊', other:'⚠️',
};

const AUTO_DISMISS_SECONDS = 30;

// ── Extract GPS from all Firebase field name patterns ─────────────
const getCoords = (sos) => {
  if (sos?.location?.lat      != null) return { lat: sos.location.lat,      lng: sos.location.lng };
  if (sos?.location?.latitude != null) return { lat: sos.location.latitude, lng: sos.location.longitude };
  if (sos?.lat      != null)           return { lat: sos.lat,               lng: sos.lng };
  if (sos?.latitude != null)           return { lat: sos.latitude,          lng: sos.longitude };
  return null;
};

// ── Format timestamp from any field name ──────────────────────────
const getTime = (sos) => {
  const raw = sos?.created_at || sos?.createdAt || sos?.timestamp || sos?.time;
  if (!raw) return null;
  try {
    return new Date(typeof raw === 'number' ? raw : raw)
      .toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch { return null; }
};

export default function SOSAlert({ sos, onAcknowledge, onMute, onOpenMaps }) {
  const [muted,     setMuted]     = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);
  const [fillWidth, setFillWidth] = useState('100%');
  const soundTimerRef = useRef(null);
  const countdownRef  = useRef(null);

  // ── Continuous siren loop ─────────────────────────────────────
  const playContinuous = useCallback(() => {
    soundService.playAlert(sos?.crisisType || 'sos', 2);
    soundTimerRef.current = setTimeout(playContinuous, 7000);
  }, [sos?.crisisType]);

  useEffect(() => {
    // Start siren immediately
    playContinuous();

    // Desktop notification
    if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') new Notification('🚨 EMERGENCY SOS — RespondAI', {
          body: `${(sos?.crisisType || 'SOS').toUpperCase()} · Floor ${sos?.floor || '?'}, Room ${sos?.room || '?'}`,
          icon: '/favicon.ico',
          requireInteraction: true,
          tag: `sos-${sos?.id || Date.now()}`,
        });
      });
    }

    // Tab title flash
    const original = document.title;
    let tog = false;
    const t = setInterval(() => { document.title = tog ? '🚨 NEW ALERT!' : original; tog = !tog; }, 800);
    return () => { clearTimeout(soundTimerRef.current); clearInterval(t); document.title = original; };
  // eslint-disable-next-line
  }, []);

  // ── Countdown ─────────────────────────────────────────────────
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        const n = prev - 1;
        setFillWidth(`${Math.max(0, (n / AUTO_DISMISS_SECONDS) * 100)}%`);
        if (n <= 0) { clearInterval(countdownRef.current); handleAcknowledge('auto'); }
        return n;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  // eslint-disable-next-line
  }, []);

  const handleAcknowledge = useCallback((reason = 'manual') => {
    clearTimeout(soundTimerRef.current);
    soundService.stop();
    if (typeof onAcknowledge === 'function') onAcknowledge(sos?.id, reason);
  }, [sos?.id, onAcknowledge]);

  const handleMute = () => {
    clearTimeout(soundTimerRef.current);
    soundService.stop();
    setMuted(true);
    if (typeof onMute === 'function') onMute();
  };

  const handleMapsClick = () => {
    const c = getCoords(sos);
    if (c) window.open(`https://www.google.com/maps?q=${c.lat},${c.lng}`, '_blank', 'noopener,noreferrer');
    else alert('No GPS coordinates for this incident.');
    if (typeof onOpenMaps === 'function') onOpenMaps();
  };

  if (!sos) return null;

  const coords     = getCoords(sos);
  const timeStr    = getTime(sos);
  const crisisType = sos.crisisType || sos.crisis_type || 'SOS';

  // ── Styles ────────────────────────────────────────────────────
  const S = {
    overlay: {
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10,10,15,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
      animation: 'sosOverlayIn 0.3s ease-out',
    },
    box: {
      background: '#0D0D14',
      border: '2px solid #FF6B6B',
      borderRadius: '20px',
      padding: '28px 24px 20px',
      maxWidth: '500px',
      width: '100%',
      position: 'relative',
      boxShadow: '0 0 0 1px rgba(255,107,107,0.15), 0 0 60px rgba(255,107,107,0.3), 0 0 120px rgba(255,107,107,0.1)',
      animation: 'sosBoxIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
    },
    closeBtn: {
      position: 'absolute', top: '14px', right: '14px',
      width: '32px', height: '32px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.12)',
      color: '#9CA3AF', fontSize: '15px', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    title: {
      fontFamily: "'Bebas Neue', cursive",
      fontSize: '26px', letterSpacing: '2px',
      color: '#FF6B6B', margin: '0 36px 4px 0',
      animation: 'sosBlink 1s step-end infinite',
    },
    subtitle: {
      fontSize: '12px', color: '#6B7280',
      margin: '0 0 20px', fontFamily: "'DM Sans', sans-serif",
    },
    grid: {
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: '10px', marginBottom: '10px',
    },
    card: {
      background: 'rgba(255,107,107,0.06)',
      border: '1px solid rgba(255,107,107,0.16)',
      borderRadius: '12px', padding: '12px 14px',
    },
    cardFull: {
      background: 'rgba(255,107,107,0.06)',
      border: '1px solid rgba(255,107,107,0.16)',
      borderRadius: '12px', padding: '12px 14px',
      marginBottom: '10px',
    },
    cardLabel: {
      fontSize: '10px', color: '#6B7280',
      textTransform: 'uppercase', letterSpacing: '0.5px',
      margin: '0 0 5px', fontFamily: "'DM Sans', sans-serif",
    },
    cardVal: {
      fontSize: '14px', fontWeight: 600,
      color: '#E5E7EB', margin: 0,
      fontFamily: "'DM Sans', sans-serif",
    },
    cardValRed: {
      fontSize: '15px', fontWeight: 700,
      color: '#FF6B6B', margin: 0,
      fontFamily: "'DM Sans', sans-serif",
    },
    countdownWrap: {
      height: '3px', background: 'rgba(255,107,107,0.2)',
      borderRadius: '2px', overflow: 'hidden', margin: '0 0 16px',
    },
    countdownFill: {
      height: '100%', background: '#FF6B6B',
      borderRadius: '2px', transition: 'width 1s linear',
    },
    btnRow: {
      display: 'flex', gap: '10px', marginBottom: '14px',
    },
    ackBtn: {
      flex: 1, padding: '14px',
      background: 'linear-gradient(135deg, #10B981, #059669)',
      border: 'none', borderRadius: '12px',
      color: '#fff', fontSize: '14px', fontWeight: 700,
      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      boxShadow: '0 0 20px rgba(16,185,129,0.35)',
      transition: 'all 0.15s',
    },
    muteBtn: {
      padding: '14px 18px',
      background: 'rgba(255,107,107,0.1)',
      border: '1px solid rgba(255,107,107,0.35)',
      borderRadius: '12px', color: '#FF6B6B',
      fontSize: '13px', fontWeight: 600,
      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      transition: 'all 0.15s', whiteSpace: 'nowrap',
    },
    mutedBtn: {
      padding: '14px 18px',
      background: 'rgba(107,114,128,0.1)',
      border: '1px solid rgba(107,114,128,0.2)',
      borderRadius: '12px', color: '#6B7280',
      fontSize: '13px', fontWeight: 600,
      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      whiteSpace: 'nowrap',
    },
    pulseRow: {
      display: 'flex', justifyContent: 'center', gap: '8px',
    },
    dot: {
      width: '8px', height: '8px',
      borderRadius: '50%', background: '#FF6B6B',
    },
    mapsBtn: {
      padding: '4px 10px',
      background: 'rgba(16,185,129,0.15)',
      border: '1px solid rgba(16,185,129,0.35)',
      borderRadius: '8px', color: '#34D399',
      fontSize: '12px', fontWeight: 600,
      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      marginLeft: '10px', flexShrink: 0,
    },
  };

  return (
    <div style={S.overlay}>
      <div style={S.box}>

        {/* Close */}
        <button style={S.closeBtn} onClick={() => handleAcknowledge('closed')}>✕</button>

        {/* Title */}
        <p style={S.title}>🚨 EMERGENCY SOS RECEIVED</p>
        <p style={S.subtitle}>
          {CRISIS_ICONS[crisisType] || '⚠️'} {crisisType.toUpperCase()}
          &nbsp;·&nbsp;{timeStr || '—'}
          &nbsp;·&nbsp;Auto-dismiss in {countdown}s
        </p>

        {/* 2-column grid */}
        <div style={S.grid}>
          {/* Crisis Type */}
          <div style={S.card}>
            <p style={S.cardLabel}>Crisis Type</p>
            <p style={S.cardValRed}>{CRISIS_ICONS[crisisType] || '⚠️'} {crisisType.toUpperCase()}</p>
          </div>

          {/* Severity */}
          <div style={S.card}>
            <p style={S.cardLabel}>Severity</p>
            <p style={S.cardValRed}>{String(sos.severity || 'pending')}</p>
          </div>

          {/* Floor */}
          <div style={S.card}>
            <p style={S.cardLabel}>Floor</p>
            <p style={S.cardVal}>{String(sos.floor || '—')}</p>
          </div>

          {/* Room */}
          <div style={S.card}>
            <p style={S.cardLabel}>Room</p>
            <p style={S.cardVal}>{String(sos.room || '—')}</p>
          </div>
        </div>

        {/* GPS Coordinates — full width */}
        <div style={S.cardFull}>
          <p style={S.cardLabel}>GPS Coordinates</p>
          <div style={{ display:'flex', alignItems:'center' }}>
            {coords ? (
              <>
                <span style={{ ...S.cardVal, fontFamily:'monospace', fontSize:'13px' }}>
                  {Number(coords.lat).toFixed(6)},&nbsp;{Number(coords.lng).toFixed(6)}
                </span>
                <button style={S.mapsBtn} onClick={handleMapsClick}>
                  Open Maps ↗
                </button>
              </>
            ) : (
              <span style={{ ...S.cardVal, color:'#6B7280' }}>GPS not available</span>
            )}
          </div>
        </div>

        {/* Guest Report — full width */}
        {sos.description && (
          <div style={S.cardFull}>
            <p style={S.cardLabel}>Guest Report</p>
            <p style={{ ...S.cardVal, lineHeight:'1.5', color:'#D1D5DB' }}>
              {String(sos.description)}
            </p>
          </div>
        )}

        {/* Countdown bar */}
        <div style={S.countdownWrap}>
          <div style={{ ...S.countdownFill, width: fillWidth }} />
        </div>

        {/* Sound status */}
        <p style={{ textAlign:'center', fontSize:'11px', margin:'0 0 10px',
          color: muted ? '#6B7280' : '#FF6B6B', fontFamily:"'DM Sans',sans-serif" }}>
          {muted ? '🔇 Sound muted' : '🔊 Siren playing continuously until acknowledged'}
        </p>

        {/* Buttons */}
        <div style={S.btnRow}>
          <button style={S.ackBtn}
            onMouseEnter={e => e.target.style.transform='translateY(-1px)'}
            onMouseLeave={e => e.target.style.transform='translateY(0)'}
            onClick={() => handleAcknowledge('manual')}>
            ✓ Acknowledge Alert
          </button>
          <button style={muted ? S.mutedBtn : S.muteBtn} onClick={handleMute}>
            {muted ? '🔔 Unmuted' : '🔇 Mute'}
          </button>
        </div>

        {/* Pulse dots */}
        <div style={S.pulseRow}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              ...S.dot,
              animation: `sosPulse 1.5s ease-in-out ${i*0.3}s infinite`,
            }}/>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes sosOverlayIn { from{opacity:0} to{opacity:1} }
        @keyframes sosBoxIn {
          from { transform: translateY(-24px) scale(0.95); opacity:0; }
          to   { transform: translateY(0)     scale(1);    opacity:1; }
        }
        @keyframes sosBlink {
          0%,49%  { opacity:1; }
          50%,100%{ opacity:0.35; }
        }
        @keyframes sosPulse {
          0%,100% { transform:scale(1);   opacity:1;   }
          50%     { transform:scale(1.7); opacity:0.4; }
        }
      `}</style>
    </div>
  );
}