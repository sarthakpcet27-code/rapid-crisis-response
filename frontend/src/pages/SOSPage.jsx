// frontend/src/pages/SOSPage.jsx
// KEY FIXES:
//   1. submitOnline() has TWO separate try-catch blocks:
//      - Block A: createIncident (Firebase) — failure here → offline fallback
//      - Block B: axios /api/classify — failure here → WARN ONLY, never offline fallback
//   2. API URL reads from REACT_APP_API_URL env var (set this in Vercel!)
//   3. guestUid/guestName/guestEmail always stamped on every incident
//   4. ✅ PATCH_1b: buildIncidentData() helper added to include guestPhone in both online/offline incidents

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  auth,
  createIncident,
  updateIncident,
  sendMessage,
  listenToIncident,
  getGuestProfile,
} from '../firebase';
import { saveOfflineIncident, saveOfflineLocation } from '../utils/db';
import { registerBackgroundSync } from '../utils/sync-manager';

// ── CRITICAL: set REACT_APP_API_URL in Vercel environment variables
// If blank → AI classify is skipped gracefully (no offline fallback)
const API = process.env.REACT_APP_API_URL || '';

const log = (...a) => console.log('[SOS]', ...a);
const warn = (...a) => console.warn('[SOS]', ...a);

const CRISIS_TYPES = [
  { id: 'fire', label: 'Fire', icon: '🔥', color: '#E24B4A', rgb: '226,75,74' },
  { id: 'medical', label: 'Medical', icon: '🏥', color: '#F59E0B', rgb: '245,158,11' },
  { id: 'security', label: 'Security', icon: '🔒', color: '#8B5CF6', rgb: '139,92,246' },
  { id: 'flood', label: 'Flood', icon: '🌊', color: '#3B82F6', rgb: '59,130,246' },
  { id: 'other', label: 'Other', icon: '⚠️', color: '#9CA3AF', rgb: '107,114,128' },
];

// SilentSOS config
const SHAKE_THRESHOLD = 25;
const SHAKES_REQUIRED = 3;
const SHAKE_WINDOW_MS = 2000;
const SHAKE_DEBOUNCE_MS = 150;

export default function SOSPage() {
  // Form
  const [crisisType, setCrisisType] = useState('fire');
  const [description, setDescription] = useState('');
  const [floor, setFloor] = useState('');
  const [room, setRoom] = useState('');
  const [severity, setSeverity] = useState('YELLOW');
  const [location, setLocation] = useState(null);

  // Flow: 'sos' | 'counting' | 'saving-offline' | 'sending-online' | 'confirm-offline' | 'confirm-online'
  const [screen, setScreen] = useState('sos');
  const [countdown, setCountdown] = useState(3);
  const [aiResult, setAiResult] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [guestMsg, setGuestMsg] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [locationCount, setLocationCount] = useState(0);

  // SilentSOS
  const [silentEnabled, setSilentEnabled] = useState(true);
  const [shakeCount, setShakeCount] = useState(0);
  const [motionOk, setMotionOk] = useState(true);

  // Refs
  const chatEndRef = useRef(null);
  const countTimerRef = useRef(null);
  const locationTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const shakeCountRef = useRef(0);
  const lastShakeRef = useRef(0);
  const shakeTimerRef = useRef(null);
  const silentFiredRef = useRef(false);
  const silentEnabledRef = useRef(true);
  const locationRef = useRef(null);

  useEffect(() => {
    silentEnabledRef.current = silentEnabled;
  }, [silentEnabled]);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const getIsOnline = () => navigator.onLine;

  // ✅ PATCH_1b: Build incident payload (includes guestPhone for online + offline)
  const buildIncidentData = async () => {
    const user = auth.currentUser;

    let guestPhone = null;
    if (user?.uid) {
      try {
        const profile = await getGuestProfile(user.uid);
        guestPhone = profile?.phone ?? profile?.phoneNumber ?? profile?.guestPhone ?? null;
      } catch (e) {
        console.warn('[SOS] getGuestProfile failed (phone missing):', e);
      }
    }

    return {
      crisisType,
      description,
      floor,
      room,
      severity,
      location: locationRef.current,

      guestUid: user?.uid || null,
      guestName: user?.displayName || 'Unknown',
      guestEmail: user?.email || null,
      guestPhone, // ✅ added
    };
  };

  // GPS on mount
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => log('GPS unavailable')
    );
  }, []);

  useEffect(() => {
    registerBackgroundSync().catch(() => {});
  }, []);

  // Live chat (online incidents)
  useEffect(() => {
    if (!currentId) return;
    const unsub = listenToIncident(currentId, (data) => {
      if (data?.chat) setChatMessages(Object.values(data.chat).sort((a, b) => a.time - b.time));
    });
    return () => typeof unsub === 'function' && unsub();
  }, [currentId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(
    () => () => {
      clearInterval(countTimerRef.current);
      clearInterval(locationTimerRef.current);
      clearTimeout(shakeTimerRef.current);
      recognitionRef.current?.stop();
    },
    []
  );

  // Safety timer: if saving-offline screen hangs > 3s, force transition
  useEffect(() => {
    if (screen !== 'saving-offline') return;
    const t = setTimeout(() => {
      warn('Safety timer: forcing confirm-offline');
      toast('📱 SOS stored — syncs when online', {
        icon: '📱',
        duration: 4000,
        style: {
          background: 'rgba(245,158,11,0.15)',
          color: '#FCD34D',
          border: '1px solid rgba(245,158,11,0.3)',
        },
      });
      setScreen('confirm-offline');
    }, 3000);
    return () => clearTimeout(t);
  }, [screen]);

  // GPS tracking for offline incidents
  const startGPSTracking = (localId) => {
    if (locationTimerRef.current) return;
    const track = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const saved = await saveOfflineLocation(
            localId,
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy
          );
          if (saved) setLocationCount((c) => c + 1);
        },
        () => {}
      );
    };
    track();
    locationTimerRef.current = setInterval(track, 10000);
  };

  const stopGPSTracking = () => {
    clearInterval(locationTimerRef.current);
    locationTimerRef.current = null;
  };

  // ── SilentSOS ──────────────────────────────────────────────
  const handleDeviceMotion = useCallback((event) => {
    if (!silentEnabledRef.current || silentFiredRef.current) return;
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;
    const { x = 0, y = 0, z = 0 } = acc;
    if (Math.sqrt(x * x + y * y + z * z) < SHAKE_THRESHOLD) return;
    const now = Date.now();
    if (now - lastShakeRef.current < SHAKE_DEBOUNCE_MS) return;
    lastShakeRef.current = now;
    shakeCountRef.current++;
    setShakeCount(shakeCountRef.current);
    clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      shakeCountRef.current = 0;
      setShakeCount(0);
    }, SHAKE_WINDOW_MS);
    if (shakeCountRef.current >= SHAKES_REQUIRED) {
      clearTimeout(shakeTimerRef.current);
      shakeCountRef.current = 0;
      setShakeCount(0);
      fireSilentSOS();
    }
  }, []);

  useEffect(() => {
    if (!silentEnabled) {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      return;
    }
    if (!window.DeviceMotionEvent) {
      setMotionOk(false);
      return;
    }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then((p) =>
          p === 'granted'
            ? window.addEventListener('devicemotion', handleDeviceMotion)
            : setMotionOk(false)
        )
        .catch(() => setMotionOk(false));
    } else {
      window.addEventListener('devicemotion', handleDeviceMotion);
    }
    return () => window.removeEventListener('devicemotion', handleDeviceMotion);
  }, [silentEnabled, handleDeviceMotion]);

  const fireSilentSOS = async () => {
    if (silentFiredRef.current) return;
    silentFiredRef.current = true;
    const user = auth.currentUser;

    // (Optional) include phone here too if you want silent alerts to show phone:
    // const data = await buildIncidentData(); then override crisisType/severity/etc.
    const data = {
      crisisType: 'security',
      severity: 'RED',
      silentAlert: true,
      description: 'Silent SOS — potential threat (shake detection)',
      location: locationRef.current,
      guestUid: user?.uid || null,
      guestName: user?.displayName || 'Unknown',
      guestEmail: user?.email || null,
    };

    try {
      if (getIsOnline()) {
        await createIncident(data);
      } else {
        const s = await saveOfflineIncident(data);
        if (s) startGPSTracking(s.id);
      }
      if (navigator.vibrate) navigator.vibrate([50]);
    } catch (e) {
      warn('SilentSOS error:', e);
    } finally {
      setTimeout(() => {
        silentFiredRef.current = false;
      }, 8000);
    }
  };

  // ─��� Manual SOS countdown ───────────────────────────────────
  const handleSOSTap = () => {
    if (!description.trim()) {
      toast.error('Please describe what is happening');
      return;
    }
    setCountdown(3);
    setScreen('counting');
    let c = 3;
    countTimerRef.current = setInterval(() => {
      c--;
      if (c > 0) {
        setCountdown(c);
      } else {
        clearInterval(countTimerRef.current);
        if (getIsOnline()) submitOnline();
        else submitOffline();
      }
    }, 1000);
  };

  const cancelCountdown = () => {
    clearInterval(countTimerRef.current);
    setScreen('sos');
  };

  // ══════════════════════════════════════════════════════════
  // OFFLINE PATH — IndexedDB only, NEVER touches Firebase
  // ══════════════════════════════════════════════════════════
  const submitOffline = async () => {
    log('Offline path');
    setScreen('saving-offline');

    try {
      const incidentData = await buildIncidentData();

      toast.loading('Saving SOS locally...', { id: 'offline-save' });
      const saved = await saveOfflineIncident(incidentData);
      if (!saved) throw new Error('saveOfflineIncident returned null');

      toast.success('SOS saved to device!', { id: 'offline-save', duration: 3000 });
      startGPSTracking(saved.id);

      try {
        await registerBackgroundSync();
      } catch (_) {}
      try {
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
      } catch (_) {}

      setScreen('confirm-offline');
    } catch (e) {
      warn('Offline save error:', e);
      toast.error('Save failed — please try again', { id: 'offline-save' });
      setTimeout(() => setScreen('confirm-offline'), 800); // safety: never strand user
    }
  };

  // ══════════════════════════════════════════════════════════
  // ONLINE PATH — Firebase only
  // Block A: createIncident → if fails → offline fallback
  // Block B: AI classify  → if fails → WARN ONLY, keep showing confirm-online
  // ══════════════════════════════════════════════════════════
  const submitOnline = async () => {
    log('Online path');
    setScreen('sending-online');

    const incidentData = await buildIncidentData();

    // ── Block A: Create incident in Firebase ─────────────────
    let firebaseId;
    try {
      firebaseId = await createIncident(incidentData);
      setCurrentId(firebaseId);
      log('Incident created in Firebase:', firebaseId);
    } catch (createErr) {
      // Only fall back to offline if Firebase itself fails
      warn('createIncident failed — falling back to offline:', createErr);
      toast('⚠️ Could not reach server — saving locally', {
        icon: '⚠️',
        duration: 3000,
        style: {
          background: 'rgba(245,158,11,0.15)',
          color: '#FCD34D',
          border: '1px solid rgba(245,158,11,0.3)',
        },
      });
      try {
        const saved = await saveOfflineIncident(incidentData);
        if (saved) startGPSTracking(saved.id);
        setScreen('confirm-offline');
      } catch (saveErr) {
        warn('Offline fallback also failed:', saveErr);
        toast.error('Failed to save. Please call emergency services directly.');
        setScreen('sos');
      }
      return;
    }

    // Firebase incident created — we are in "online" mode from here on.
    // Show online confirm FIRST, then run AI in background.
    toast.success('Alert sent! Staff notified.');
    setScreen('confirm-online'); // ← show chat UI immediately

    // ── Block B: AI classify — failure is non-fatal ──────────
    if (API) {
      try {
        const { data } = await axios.post(
          `${API}/api/classify`,
          { description, floor, crisisType },
          { timeout: 10000 }
        );
        setAiResult(data);
        await updateIncident(firebaseId, {
          severity: data.severity,
          sop: data.sop,
          summary: data.summary,
        });
        log('AI classify success:', data.severity);
      } catch (aiErr) {
        // AI failed — DO NOT fall back to offline, DO NOT change screen
        warn('AI classify failed (non-fatal):', aiErr?.message || aiErr);
        toast('⚠️ AI plan unavailable — staff notified', {
          icon: '⚠️',
          duration: 3000,
          style: {
            background: 'rgba(107,114,128,0.15)',
            color: '#9CA3AF',
            border: '1px solid rgba(107,114,128,0.2)',
          },
        });
      }
    } else {
      warn('REACT_APP_API_URL not set — AI classify skipped');
    }

    // Brief confirmation sound
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) {}
  };

  const sendGuestMsg = () => {
    if (!guestMsg.trim() || !currentId) return;
    sendMessage(currentId, guestMsg, 'guest');
    setGuestMsg('');
  };

  const resetAll = () => {
    stopGPSTracking();
    setScreen('sos');
    setChatMessages([]);
    setCurrentId(null);
    setAiResult(null);
    setDescription('');
    setFloor('');
    setRoom('');
    setSeverity('YELLOW');
    setLocationCount(0);
  };

  const selectedCrisis = CRISIS_TYPES.find((c) => c.id === crisisType);
  const isOnline = getIsOnline();
  const sosColor = isOnline ? '#E24B4A' : '#F59E0B';
  const sosRgb = isOnline ? '226,75,74' : '245,158,11';

  const getSevClass = (sev) =>
    sev === 'RED'
      ? 'severity-red'
      : sev === 'YELLOW'
        ? 'severity-yellow'
        : sev === 'GREEN'
          ? 'severity-green'
          : 'severity-pending';

  // ══════════════════════════════════════════════════════════
  // COUNTING
  // ══════════════════════════════════════════════════════════
  if (screen === 'counting')
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          key={countdown}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            fontFamily: "'Bebas Neue',cursive",
            fontSize: '140px',
            color: sosColor,
            lineHeight: 1,
          }}
        >
          {countdown}
        </motion.div>
        <p style={{ color: '#6B7280', fontSize: '16px', marginTop: '16px' }}>
          {isOnline ? `Sending in ${countdown}s...` : `Saving locally in ${countdown}s...`}
        </p>
        {!isOnline && (
          <p style={{ color: '#F59E0B', fontSize: '12px', marginTop: '6px' }}>
            Offline — will sync when internet returns
          </p>
        )}
        <button
          onClick={cancelCountdown}
          style={{
            marginTop: '24px',
            color: '#4B5563',
            background: 'none',
            border: '1px solid #2A2A3A',
            borderRadius: '10px',
            padding: '8px 20px',
            cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif",
            fontSize: '14px',
          }}
        >
          Cancel
        </button>
      </div>
    );

  // ══════════════════════════════════════════════════════════
  // SAVING OFFLINE (amber spinner)
  // ══════════════════════════════════════════════════════════
  if (screen === 'saving-offline')
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '3px solid #2A2A3A',
            borderTopColor: '#F59E0B',
          }}
        />
        <p style={{ color: '#FCD34D', fontSize: '18px', fontWeight: 500, margin: 0 }}>
          Saving locally...
        </p>
        <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>
          Storing SOS on your device
        </p>
      </div>
    );

  // ══════════════════════════════════════════════════════════
  // SENDING ONLINE (red spinner)
  // ══════════════════════════════════════════════════════════
  if (screen === 'sending-online')
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: '3px solid #2A2A3A',
            borderTopColor: '#E24B4A',
          }}
        />
        <p style={{ color: '#E5E7EB', fontSize: '18px', fontWeight: 500, margin: 0 }}>
          Sending alert...
        </p>
        <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>
          Notifying staff & AI system
        </p>
      </div>
    );

  // ══════════════════════════════════════════════════════════
  // OFFLINE CONFIRM
  // ══════════════════════════════════════════════════════════
  if (screen === 'confirm-offline')
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: '20px 20px 40px' }}>
        <div style={{ maxWidth: '460px', margin: '0 auto' }}>
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ textAlign: 'center', padding: '28px 0 18px' }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: '30px',
              }}
            >
              📱
            </div>
            <h2
              style={{
                fontFamily: "'Bebas Neue',cursive",
                fontSize: '30px',
                letterSpacing: '2px',
                color: '#FCD34D',
                margin: '0 0 4px',
              }}
            >
              SOS Saved!
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
              Stored on device — auto-sends when online
            </p>
          </motion.div>
          <div
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '12px',
            }}
          >
            {[
              { label: 'SOS status', value: 'Saved locally ✓', color: '#FCD34D' },
              { label: 'GPS tracking', value: `Active · ${locationCount} pts`, color: '#34D399' },
              { label: 'Auto-sync', value: 'Will send when internet returns', color: '#93C5FD' },
            ].map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  fontSize: '12px',
                  fontFamily: "'DM Sans',sans-serif",
                }}
              >
                <span style={{ color: '#6B7280' }}>{r.label}</span>
                <span style={{ color: r.color, fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={resetAll}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: '#6B7280',
              cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            Return to SOS page
          </button>
        </div>
      </div>
    );

  // ══════════════════════════════════════════════════════════
  // ONLINE CONFIRM + LIVE CHAT
  // ══════════════════════════════════════════════════════════
  if (screen === 'confirm-online')
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: '20px 20px 40px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ textAlign: 'center', padding: '28px 0 18px' }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: '30px',
              }}
            >
              ✓
            </div>
            <h2
              style={{
                fontFamily: "'Bebas Neue',cursive",
                fontSize: '34px',
                letterSpacing: '2px',
                color: '#fff',
                margin: '0 0 4px',
              }}
            >
              Alert Sent!
            </h2>
            <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
              Staff notified. Help is on the way.
            </p>
          </motion.div>

          {aiResult && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              style={{
                background: 'rgba(99,60,255,0.08)',
                border: '1px solid rgba(99,60,255,0.22)',
                borderRadius: '14px',
                padding: '14px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#A78BFA',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  🤖 AI Response Plan
                </span>
                <span className={getSevClass(aiResult.severity)}>{aiResult.severity}</span>
              </div>
              {aiResult.summary && (
                <p style={{ fontSize: '12px', color: '#8B5CF6', marginBottom: '8px', fontStyle: 'italic' }}>
                  {aiResult.summary}
                </p>
              )}
              <ol style={{ paddingLeft: '18px', margin: 0 }}>
                {aiResult.sop?.map((s, i) => (
                  <li key={i} style={{ fontSize: '12px', color: '#C4B5FD', marginBottom: '5px', lineHeight: 1.5 }}>
                    {s}
                  </li>
                ))}
              </ol>
            </motion.div>
          )}

          {/* Live chat */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '14px',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                background: 'rgba(226,75,74,0.1)',
                borderBottom: '1px solid rgba(226,75,74,0.2)',
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F87171' }}>💬 Live Chat with Staff</span>
              <span style={{ fontSize: '11px', color: '#6B7280' }}>{chatMessages.length} messages</span>
            </div>
            <div style={{ background: 'rgba(10,10,15,0.6)', padding: '12px', minHeight: '80px', maxHeight: '180px', overflowY: 'auto' }}>
              {chatMessages.length === 0 ? (
                <p style={{ color: '#374151', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>
                  Waiting for staff...
                </p>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender === 'guest' ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                    <span style={{ fontSize: '10px', color: '#4B5563', marginBottom: '3px' }}>
                      {m.sender === 'guest' ? 'You' : '🟢 Staff'}
                    </span>
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        maxWidth: '78%',
                        background: m.sender === 'guest' ? '#E24B4A' : 'rgba(255,255,255,0.08)',
                        color: m.sender === 'guest' ? '#fff' : '#D1D5DB',
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                value={guestMsg}
                onChange={(e) => setGuestMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendGuestMsg()}
                placeholder="Type message to staff..."
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#E5E7EB',
                  fontSize: '13px',
                  fontFamily: "'DM Sans',sans-serif",
                }}
              />
              <button
                onClick={sendGuestMsg}
                style={{
                  padding: '0 20px',
                  background: '#E24B4A',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Send
              </button>
            </div>
          </motion.div>

          <button
            onClick={resetAll}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: '#6B7280',
              cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            Send another alert
          </button>
        </div>
      </div>
    );

  // ══════════════════════════════════════════════════════════
  // MAIN SOS SCREEN
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: '20px 20px 60px' }}>
      <div style={{ maxWidth: '440px', margin: '0 auto' }}>
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ textAlign: 'center', padding: '16px 0 6px' }}>
          <h1 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: '36px', letterSpacing: '3px', color: '#fff', margin: '0 0 4px' }}>
            Emergency <span style={{ color: sosColor }}>SOS</span>
          </h1>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>
            {isOnline ? 'Fill what you can — help is coming' : '📱 Offline — SOS saves locally & syncs automatically'}
          </p>
        </motion.div>

        {/* SilentSOS */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ marginBottom: '12px' }}>
          <div style={{ background: silentEnabled ? 'rgba(16,185,129,0.06)' : 'rgba(107,114,128,0.06)', border: `1px solid ${silentEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)'}`, borderRadius: '14px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: silentEnabled ? '10px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: silentEnabled ? '#10B981' : '#6B7280' }} />
                <span style={{ fontSize: '12px', fontWeight: 500, color: silentEnabled ? '#34D399' : '#6B7280', fontFamily: "'DM Sans',sans-serif" }}>
                  SilentSOS {silentEnabled ? 'Active' : 'Disabled'}
                  {!motionOk ? ' (not supported)' : ''}
                </span>
              </div>
              <div onClick={() => setSilentEnabled((v) => !v)} style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', position: 'relative', background: silentEnabled ? '#10B981' : '#374151', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', left: silentEnabled ? '23px' : '3px' }} />
              </div>
            </div>
            {silentEnabled && (
              <>
                <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 8px', lineHeight: 1.5, fontFamily: "'DM Sans',sans-serif" }}>
                  Shake phone 3× = silent security alert. Works offline.
                </p>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        background: shakeCount >= n ? '#10B981' : 'rgba(255,255,255,0.06)',
                        color: shakeCount >= n ? '#fff' : '#6B7280',
                      }}
                    >
                      {n}
                    </div>
                  ))}
                  <span style={{ fontSize: '11px', color: '#6B7280', marginLeft: '6px', fontFamily: "'DM Sans',sans-serif" }}>
                    {shakeCount > 0 ? `${shakeCount}/3` : 'Shake counter'}
                  </span>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* SOS circle */}
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 }} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0 16px', position: 'relative', height: '200px' }}>
          {[160, 195, 230].map((size, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                border: `2px solid rgba(${sosRgb},${0.45 - i * 0.12})`,
                animation: `ring-expand ${1.8 + i * 0.5}s ease-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
          <motion.button
            whileTap={{ scale: 0.91 }}
            onClick={handleSOSTap}
            style={{
              width: '148px',
              height: '148px',
              borderRadius: '50%',
              background: sosColor,
              border: `4px solid rgba(${sosRgb},0.4)`,
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 2,
              boxShadow: `0 0 48px rgba(${sosRgb},0.4)`,
            }}
          >
            <span style={{ fontSize: '38px', lineHeight: 1 }}>{selectedCrisis?.icon}</span>
            <span style={{ fontFamily: "'Bebas Neue',cursive", fontSize: '26px', letterSpacing: '3px', marginTop: '4px' }}>SOS</span>
            <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{isOnline ? 'Tap to alert staff' : 'Offline — saves locally'}</span>
          </motion.button>
        </motion.div>

        {/* Crisis pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '14px' }}>
          {CRISIS_TYPES.map((c) => {
            const sel = crisisType === c.id;
            return (
              <motion.button
                key={c.id}
                whileTap={{ scale: 0.94 }}
                onClick={() => setCrisisType(c.id)}
                style={{
                  padding: '7px 13px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 500,
                  fontFamily: "'DM Sans',sans-serif",
                  outline: 'none',
                  transition: 'all 0.15s',
                  background: sel ? `rgba(${c.rgb},0.2)` : 'rgba(255,255,255,0.04)',
                  color: sel ? c.color : '#6B7280',
                  border: sel ? `1px solid ${c.color}70` : '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {c.icon} {c.label}
              </motion.button>
            );
          })}
        </div>

        {/* GPS + Voice */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: '12px', padding: '10px 12px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', flexShrink: 0, animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize: '11px', color: '#34D399' }}>{location ? (isOnline ? 'GPS Live' : 'GPS (Offline)') : 'Locating...'}</span>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!('webkitSpeechRecognition' in window)) {
                toast.error('Voice requires Chrome');
                return;
              }
              const r = new window.webkitSpeechRecognition();
              r.lang = 'en-IN';
              r.continuous = false;
              r.interimResults = false;
              r.onstart = () => setIsListening(true);
              r.onend = () => setIsListening(false);
              r.onresult = (e) => {
                const t = e.results[0][0].transcript;
                setDescription(t);
                if (t.toLowerCase().includes('fire')) setCrisisType('fire');
                else if (t.toLowerCase().includes('medical')) setCrisisType('medical');
                else if (t.toLowerCase().includes('security')) setCrisisType('security');
                toast.success('Voice captured!');
              };
              recognitionRef.current = r;
              r.start();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isListening ? 'rgba(226,75,74,0.15)' : 'rgba(255,255,255,0.04)',
              border: isListening ? '1px solid rgba(226,75,74,0.4)' : '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px',
              padding: '10px 12px',
              cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            <span style={{ fontSize: '16px' }}>🎤</span>
            <span style={{ fontSize: '11px', color: isListening ? '#F87171' : '#6B7280' }}>
              {isListening ? 'Listening...' : 'Voice SOS'}
            </span>
          </motion.button>
        </div>

        {/* Form */}
        <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>
            What is happening?
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. I can smell smoke from the corridor..."
            className="glass-input"
            style={{ resize: 'none', marginBottom: '12px' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>Floor</label>
              <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. 6" className="glass-input" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>Room</label>
              <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 614" className="glass-input" />
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Urgency level
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
            {[
              { val: 'GREEN', label: 'Low', color: '#10B981', rgb: '16,185,129' },
              { val: 'YELLOW', label: 'Medium', color: '#F59E0B', rgb: '245,158,11' },
              { val: 'RED', label: 'Critical', color: '#E24B4A', rgb: '226,75,74' },
            ].map((s) => (
              <button
                key={s.val}
                onClick={() => setSeverity(s.val)}
                style={{
                  padding: '9px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: 'all 0.15s',
                  background: severity === s.val ? `rgba(${s.rgb},0.2)` : 'rgba(255,255,255,0.03)',
                  color: severity === s.val ? s.color : '#4B5563',
                  border: severity === s.val ? `1px solid ${s.color}60` : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ring-expand{0%{transform:scale(0.75);opacity:.8}100%{transform:scale(1.15);opacity:0}}
        @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>
    </div>
  );
}