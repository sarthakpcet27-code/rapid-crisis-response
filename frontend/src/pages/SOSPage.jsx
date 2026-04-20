// frontend/src/pages/SOSPage.jsx — mobile-responsive

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { auth, createIncident, updateIncident, sendMessage, listenToIncident } from '../firebase';
import { saveOfflineIncident, saveOfflineLocation } from '../utils/db';
import { registerBackgroundSync } from '../utils/sync-manager';
import { useMobile } from '../utils/useMobile';

const CRISIS_TYPES = [
  { id: 'fire', label: 'Fire', icon: '🔥', color: '#E24B4A', rgb: '226,75,74' },
  { id: 'medical', label: 'Medical', icon: '🏥', color: '#F59E0B', rgb: '245,158,11' },
  { id: 'security', label: 'Security', icon: '🔒', color: '#8B5CF6', rgb: '139,92,246' },
  { id: 'flood', label: 'Flood', icon: '🌊', color: '#3B82F6', rgb: '59,130,246' },
  { id: 'other', label: 'Other', icon: '⚠️', color: '#9CA3AF', rgb: '107,114,128' },
];

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const SHAKE_THRESHOLD = 25, SHAKES_REQUIRED = 3, SHAKE_WINDOW_MS = 2000, SHAKE_DEBOUNCE_MS = 150;

export default function SOSPage() {
  const isMobile = useMobile();

  const [crisisType, setCrisisType] = useState('fire');
  const [description, setDescription] = useState('');
  const [floor, setFloor] = useState('');
  const [room, setRoom] = useState('');
  const [severity, setSeverity] = useState('YELLOW');
  const [location, setLocation] = useState(null);
  const [screen, setScreen] = useState('sos');
  const [countdown, setCountdown] = useState(3);
  const [aiResult, setAiResult] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [guestMsg, setGuestMsg] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [locationCount, setLocationCount] = useState(0);
  const [silentEnabled, setSilentEnabled] = useState(true);
  const [shakeCount, setShakeCount] = useState(0);
  const [motionSupported, setMotionSupported] = useState(true);

  const chatEndRef = useRef(null), countTimerRef = useRef(null);
  const locationTimerRef = useRef(null), recognitionRef = useRef(null);
  const shakeCountRef = useRef(0), lastShakeRef = useRef(0);
  const shakeTimerRef = useRef(null), silentFiredRef = useRef(false);
  const silentEnabledRef = useRef(true), locationRef = useRef(null);

  useEffect(() => { silentEnabledRef.current = silentEnabled; }, [silentEnabled]);
  useEffect(() => { locationRef.current = location; }, [location]);

  // Safety: force out of saving-offline after 3s
  useEffect(() => {
    if (screen !== 'saving-offline') return;
    const timer = setTimeout(() => {
      setScreen('confirm-offline');
      toast('📱 SOS stored — syncs when online', {
        icon: '📱', duration: 4000,
        style: { background: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    const go = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener('online', go); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    registerBackgroundSync().catch(() => { });
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { }
    );
  }, []);

  useEffect(() => {
    if (!currentId) return;
    const unsub = listenToIncident(currentId, (data) => {
      if (data?.chat) setChatMessages(Object.values(data.chat).sort((a, b) => a.time - b.time));
    });
    return () => typeof unsub === 'function' && unsub();
  }, [currentId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  useEffect(() => () => { clearInterval(countTimerRef.current); clearInterval(locationTimerRef.current); clearTimeout(shakeTimerRef.current); recognitionRef.current?.stop(); }, []);

  const startGPSTracking = (localId) => {
    if (locationTimerRef.current) return;
    const track = () => navigator.geolocation.getCurrentPosition(
      async (pos) => { const s = await saveOfflineLocation(localId, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); if (s) setLocationCount(c => c + 1); },
      () => { }
    );
    track();
    locationTimerRef.current = setInterval(track, 10000);
  };
  const stopGPSTracking = () => { clearInterval(locationTimerRef.current); locationTimerRef.current = null; };

  // SilentSOS shake
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
    shakeTimerRef.current = setTimeout(() => { shakeCountRef.current = 0; setShakeCount(0); }, SHAKE_WINDOW_MS);
    if (shakeCountRef.current >= SHAKES_REQUIRED) {
      clearTimeout(shakeTimerRef.current); shakeCountRef.current = 0; setShakeCount(0); fireSilentSOS();
    }
  }, []);

  useEffect(() => {
    if (!silentEnabled) { window.removeEventListener('devicemotion', handleDeviceMotion); return; }
    if (!window.DeviceMotionEvent) { setMotionSupported(false); return; }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(p => p === 'granted' ? window.addEventListener('devicemotion', handleDeviceMotion) : setMotionSupported(false)).catch(() => setMotionSupported(false));
    } else { window.addEventListener('devicemotion', handleDeviceMotion); }
    return () => window.removeEventListener('devicemotion', handleDeviceMotion);
  }, [silentEnabled, handleDeviceMotion]);

  const fireSilentSOS = async () => {
    if (silentFiredRef.current) return;
    silentFiredRef.current = true;
    const user = auth.currentUser;
    const data = { crisisType: 'security', severity: 'RED', silentAlert: true, description: 'Silent SOS — potential threat', location: locationRef.current, guestUid: user?.uid || null, guestName: user?.displayName || 'Unknown', guestEmail: user?.email || null };
    try {
      if (navigator.onLine) { await createIncident(data); }
      else { const s = await saveOfflineIncident(data); if (s) startGPSTracking(s.id); await registerBackgroundSync(); }
      if (navigator.vibrate) navigator.vibrate([50]);
    } catch (_) { }
    setTimeout(() => { silentFiredRef.current = false; }, 8000);
  };

  const getIsOnline = () => navigator.onLine;

  const handleSOSTap = () => {
    if (!description.trim()) { toast.error('Please describe what is happening'); return; }
    setCountdown(3); setScreen('counting');
    let c = 3;
    countTimerRef.current = setInterval(() => {
      c--;
      if (c > 0) { setCountdown(c); }
      else { clearInterval(countTimerRef.current); getIsOnline() ? submitOnline() : submitOffline(); }
    }, 1000);
  };

  const cancelCountdown = () => { clearInterval(countTimerRef.current); setScreen('sos'); };

  const submitOffline = async () => {
    setScreen('saving-offline');
    const user = auth.currentUser;
    const incidentData = { crisisType, description, floor, room, severity, location: locationRef.current, guestUid: user?.uid || null, guestName: user?.displayName || 'Unknown', guestEmail: user?.email || null };
    try {
      toast.loading('Saving SOS locally...', { id: 'offline-save' });
      const saved = await saveOfflineIncident(incidentData);
      clearTimeout(undefined);
      toast.success('SOS saved!', { id: 'offline-save', duration: 3000 });
      startGPSTracking(saved.id);
      try { await registerBackgroundSync(); } catch (_) { }
      try { if (navigator.vibrate) navigator.vibrate([80, 40, 80]); } catch (_) { }
      setScreen('confirm-offline');
    } catch (err) {
      toast.error('Save failed — please try again', { id: 'offline-save' });
    }
  };

  const submitOnline = async () => {
    setScreen('sending-online');
    const user = auth.currentUser;
    const incidentData = { crisisType, description, floor, room, severity, location: locationRef.current, guestUid: user?.uid || null, guestName: user?.displayName || 'Unknown', guestEmail: user?.email || null };
    try {
      const id = await createIncident(incidentData);
      setCurrentId(id);
      try {
        const { data } = await axios.post(`${API}/api/classify`, { description, floor, crisisType }, { timeout: 8000 });
        setAiResult(data);
        await updateIncident(id, { severity: data.severity, sop: data.sop, summary: data.summary });
      } catch (_) { }
      try { const ctx = new AudioContext(), osc = ctx.createOscillator(), g = ctx.createGain(); osc.connect(g); g.connect(ctx.destination); osc.frequency.setValueAtTime(880, ctx.currentTime); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); osc.start(); osc.stop(ctx.currentTime + 0.4); } catch (_) { }
      toast.success('Alert sent! Staff notified.');
      setScreen('confirm-online');
    } catch (err) {
      try { const saved = await saveOfflineIncident(incidentData); startGPSTracking(saved.id); toast('⚠️ Server unreachable — saved locally', { icon: '⚠️', duration: 3000, style: { background: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' } }); setScreen('confirm-offline'); } catch (_) { toast.error('Failed. Call emergency services.'); setScreen('sos'); }
    }
  };

  const sendGuestMsg = () => { if (!guestMsg.trim() || !currentId) return; sendMessage(currentId, guestMsg, 'guest'); setGuestMsg(''); };

  const resetAll = () => { stopGPSTracking(); setScreen('sos'); setChatMessages([]); setCurrentId(null); setAiResult(null); setDescription(''); setFloor(''); setRoom(''); setSeverity('YELLOW'); setLocationCount(0); };

  const sosColor = isOnline ? '#E24B4A' : '#F59E0B';
  const sosRgb = isOnline ? '226,75,74' : '245,158,11';
  const selectedCrisis = CRISIS_TYPES.find(c => c.id === crisisType);
  const px = isMobile ? '16px' : '20px';

  const inputStyle = {
    width: '100%', padding: isMobile ? '12px 14px' : '11px 14px',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: '#E5E7EB', fontSize: '16px', outline: 'none',
    fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box',
  };

  const getSevClass = (sev) => { if (sev === 'RED') return 'severity-red'; if (sev === 'YELLOW') return 'severity-yellow'; if (sev === 'GREEN') return 'severity-green'; return 'severity-pending'; };

  if (screen === 'counting') return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div key={countdown} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '100px' : '140px', color: sosColor, lineHeight: 1 }}>{countdown}</motion.div>
      <p style={{ color: '#6B7280', fontSize: '16px', marginTop: '16px' }}>{isOnline ? `Sending in ${countdown}s...` : `Saving locally in ${countdown}s...`}</p>
      {!isOnline && <p style={{ color: '#F59E0B', fontSize: '13px', marginTop: '6px', textAlign: 'center', padding: '0 20px' }}>Offline — will sync when internet returns</p>}
      <button onClick={cancelCountdown} style={{ marginTop: '24px', color: '#4B5563', background: 'none', border: '1px solid #2A2A3A', borderRadius: '10px', padding: '12px 24px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '14px' }}>Cancel</button>
    </div>
  );

  if (screen === 'saving-offline') return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: '64px', height: '64px', borderRadius: '50%', border: '3px solid #2A2A3A', borderTopColor: '#F59E0B' }} />
      <p style={{ color: '#FCD34D', fontSize: '18px', fontWeight: 500, margin: 0 }}>Saving locally...</p>
      <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>Storing SOS on your device</p>
    </div>
  );

  if (screen === 'sending-online') return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: '64px', height: '64px', borderRadius: '50%', border: '3px solid #2A2A3A', borderTopColor: '#E24B4A' }} />
      <p style={{ color: '#E5E7EB', fontSize: '18px', fontWeight: 500, margin: 0 }}>Sending alert...</p>
      <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>Notifying staff & AI system</p>
    </div>
  );

  if (screen === 'confirm-offline') return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: `20px ${px} 40px` }}>
      <div style={{ maxWidth: '460px', margin: '0 auto' }}>
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center', padding: '28px 0 18px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '30px' }}>📱</div>
          <h2 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '26px' : '30px', letterSpacing: '2px', color: '#FCD34D', margin: '0 0 4px' }}>SOS Saved!</h2>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>Stored on device — auto-sends when online</p>
        </motion.div>
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
          {[{ label: 'SOS status', value: 'Saved locally ✓', color: '#FCD34D' }, { label: 'GPS tracking', value: `Active · ${locationCount} points`, color: '#34D399' }, { label: 'Auto-sync', value: 'Sends when online', color: '#93C5FD' }].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', fontSize: '13px', fontFamily: "'DM Sans',sans-serif" }}>
              <span style={{ color: '#6B7280' }}>{r.label}</span>
              <span style={{ color: r.color, fontWeight: 600 }}>{r.value}</span>
            </div>
          ))}
        </div>
        <button onClick={resetAll} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '15px' }}>Return to SOS page</button>
      </div>
    </div>
  );

  if (screen === 'confirm-online') return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: `20px ${px} 40px` }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center', padding: '28px 0 18px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '30px' }}>✓</div>
          <h2 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '28px' : '34px', letterSpacing: '2px', color: '#fff', margin: '0 0 4px' }}>Alert Sent!</h2>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>Staff notified. Help is on the way.</p>
        </motion.div>
        {aiResult && (
          <div style={{ background: 'rgba(99,60,255,0.08)', border: '1px solid rgba(99,60,255,0.22)', borderRadius: '14px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🤖 AI Response Plan</span>
              <span className={getSevClass(aiResult.severity)}>{aiResult.severity}</span>
            </div>
            {aiResult.summary && <p style={{ fontSize: '12px', color: '#8B5CF6', marginBottom: '8px', fontStyle: 'italic' }}>{aiResult.summary}</p>}
            <ol style={{ paddingLeft: '18px', margin: 0 }}>
              {aiResult.sop?.map((s, i) => <li key={i} style={{ fontSize: '12px', color: '#C4B5FD', marginBottom: '5px', lineHeight: 1.5 }}>{s}</li>)}
            </ol>
          </div>
        )}
        <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden', marginBottom: '12px' }}>
          <div style={{ background: 'rgba(226,75,74,0.1)', borderBottom: '1px solid rgba(226,75,74,0.2)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#F87171' }}>💬 Live Chat with Staff</span>
            <span style={{ fontSize: '11px', color: '#6B7280' }}>{chatMessages.length} messages</span>
          </div>
          <div style={{ background: 'rgba(10,10,15,0.6)', padding: '12px', minHeight: '80px', maxHeight: '200px', overflowY: 'auto' }}>
            {chatMessages.length === 0
              ? <p style={{ color: '#374151', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>Waiting for staff...</p>
              : chatMessages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender === 'guest' ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#4B5563', marginBottom: '3px' }}>{m.sender === 'guest' ? 'You' : '🟢 Staff'}</span>
                  <div style={{ display: 'inline-block', padding: '9px 13px', borderRadius: '12px', fontSize: '14px', maxWidth: '80%', background: m.sender === 'guest' ? '#E24B4A' : 'rgba(255,255,255,0.08)', color: m.sender === 'guest' ? '#fff' : '#D1D5DB' }}>{m.text}</div>
                </div>
              ))
            }
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <input value={guestMsg} onChange={e => setGuestMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendGuestMsg()} placeholder="Type message to staff..."
              style={{ flex: 1, padding: '13px 14px', background: 'transparent', border: 'none', outline: 'none', color: '#E5E7EB', fontSize: '15px', fontFamily: "'DM Sans',sans-serif" }} />
            <button onClick={sendGuestMsg} style={{ padding: '0 20px', background: '#E24B4A', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>Send</button>
          </div>
        </div>
        <button onClick={resetAll} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#6B7280', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '15px' }}>Send another alert</button>
      </div>
    </div>
  );

  // ── MAIN SOS SCREEN ──────────────────────────────────────────
  const sosSize = isMobile ? 130 : 148;

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: `16px ${px} 60px` }}>
      <div style={{ maxWidth: '440px', margin: '0 auto' }}>

        {/* Title */}
        <div style={{ textAlign: 'center', padding: '12px 0 6px' }}>
          <h1 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '30px' : '36px', letterSpacing: '3px', color: '#fff', margin: '0 0 4px' }}>
            Emergency <span style={{ color: sosColor }}>SOS</span>
          </h1>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>
            {isOnline ? 'Fill what you can — help is coming' : '📱 Offline — saves locally & syncs automatically'}
          </p>
        </div>

        {/* SilentSOS panel */}
        <div style={{ marginBottom: '12px', marginTop: '10px' }}>
          <div style={{ background: silentEnabled ? 'rgba(16,185,129,0.06)' : 'rgba(107,114,128,0.06)', border: `1px solid ${silentEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)'}`, borderRadius: '14px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: silentEnabled ? '10px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: silentEnabled ? '#10B981' : '#6B7280' }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: silentEnabled ? '#34D399' : '#6B7280', fontFamily: "'DM Sans',sans-serif" }}>
                  SilentSOS {silentEnabled ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div onClick={() => setSilentEnabled(v => !v)} style={{ width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer', position: 'relative', background: silentEnabled ? '#10B981' : '#374151', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', left: silentEnabled ? '23px' : '3px' }} />
              </div>
            </div>
            {silentEnabled && (
              <>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px', lineHeight: 1.5, fontFamily: "'DM Sans',sans-serif" }}>
                  Shake phone 3× rapidly = silent security alert
                </p>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {[1, 2, 3].map(n => (
                    <div key={n} style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s', background: shakeCount >= n ? '#10B981' : 'rgba(255,255,255,0.06)', color: shakeCount >= n ? '#fff' : '#6B7280' }}>{n}</div>
                  ))}
                  <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: '6px', fontFamily: "'DM Sans',sans-serif" }}>{shakeCount > 0 ? `${shakeCount}/3` : 'Shake counter'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* SOS circle */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px 0', position: 'relative', height: isMobile ? '180px' : '200px' }}>
          {[sosSize + 30, sosSize + 65, sosSize + 100].map((size, i) => (
            <div key={i} style={{ position: 'absolute', width: `${size}px`, height: `${size}px`, borderRadius: '50%', border: `2px solid rgba(${sosRgb},${0.45 - i * 0.12})`, animation: `ring-expand ${1.8 + i * 0.5}s ease-out infinite`, animationDelay: `${i * 0.4}s` }} />
          ))}
          <motion.button whileTap={{ scale: 0.91 }} onClick={handleSOSTap}
            style={{ width: `${sosSize}px`, height: `${sosSize}px`, borderRadius: '50%', background: sosColor, border: `4px solid rgba(${sosRgb},0.4)`, color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2, boxShadow: `0 0 48px rgba(${sosRgb},0.4)` }}>
            <span style={{ fontSize: isMobile ? '32px' : '38px', lineHeight: 1 }}>{selectedCrisis?.icon}</span>
            <span style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '22px' : '26px', letterSpacing: '3px', marginTop: '4px' }}>SOS</span>
            <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{isOnline ? 'Tap to alert staff' : 'Offline — saves locally'}</span>
          </motion.button>
        </div>

        {/* Crisis pills — 3 per row on mobile */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '14px' }}>
          {CRISIS_TYPES.map(c => {
            const sel = crisisType === c.id;
            return (
              <motion.button key={c.id} whileTap={{ scale: 0.94 }} onClick={() => setCrisisType(c.id)}
                style={{ padding: isMobile ? '9px 14px' : '7px 13px', borderRadius: '20px', cursor: 'pointer', fontSize: isMobile ? '13px' : '12px', fontWeight: 500, fontFamily: "'DM Sans',sans-serif", outline: 'none', transition: 'all 0.15s', minHeight: '44px', background: sel ? `rgba(${c.rgb},0.2)` : 'rgba(255,255,255,0.04)', color: sel ? c.color : '#6B7280', border: sel ? `1px solid ${c.color}70` : '1px solid rgba(255,255,255,0.07)' }}>
                {c.icon} {c.label}
              </motion.button>
            );
          })}
        </div>

        {/* GPS + Voice — stacked on mobile */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: '12px', padding: '13px 14px', minHeight: '48px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#34D399' }}>{location ? (isOnline ? 'GPS Live' : 'GPS (Offline)') : 'Locating...'}</span>
          </div>
          <motion.button whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!('webkitSpeechRecognition' in window)) { toast.error('Voice requires Chrome'); return; }
              const r = new window.webkitSpeechRecognition();
              r.lang = 'en-IN'; r.continuous = false; r.interimResults = false;
              r.onstart = () => setIsListening(true); r.onend = () => setIsListening(false);
              r.onresult = (e) => { const t = e.results[0][0].transcript; setDescription(t); if (t.toLowerCase().includes('fire')) setCrisisType('fire'); else if (t.toLowerCase().includes('medical')) setCrisisType('medical'); else if (t.toLowerCase().includes('security')) setCrisisType('security'); toast.success('Voice captured!'); };
              recognitionRef.current = r; r.start();
            }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '8px', background: isListening ? 'rgba(226,75,74,0.15)' : 'rgba(255,255,255,0.04)', border: isListening ? '1px solid rgba(226,75,74,0.4)' : '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '13px 14px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", minHeight: '48px' }}>
            <span style={{ fontSize: '16px' }}>🎤</span>
            <span style={{ fontSize: '13px', color: isListening ? '#F87171' : '#6B7280' }}>{isListening ? 'Listening...' : 'Voice SOS'}</span>
          </motion.button>
        </div>

        {/* Form */}
        <div className="glass-card" style={{ padding: isMobile ? '14px' : '16px', marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '7px' }}>What is happening?</label>
          <textarea rows={isMobile ? 2 : 3} value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. I can smell smoke from the corridor..."
            className="glass-input" style={{ resize: 'none', marginBottom: '12px', fontSize: '16px' }} />
          {/* Floor + Room — stacked on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>Floor</label>
              <input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 6" className="glass-input" style={{ fontSize: '16px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>Room</label>
              <input value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. 614" className="glass-input" style={{ fontSize: '16px' }} />
            </div>
          </div>
        </div>

        {/* Urgency — 1 per row on mobile, 3 on desktop */}
        <div className="glass-card" style={{ padding: isMobile ? '14px' : '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Urgency level</label>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: '8px' }}>
            {[{ val: 'GREEN', label: 'Low / Not urgent', color: '#10B981', rgb: '16,185,129' }, { val: 'YELLOW', label: 'Medium urgency', color: '#F59E0B', rgb: '245,158,11' }, { val: 'RED', label: 'Critical / Life risk', color: '#E24B4A', rgb: '226,75,74' }].map(s => (
              <button key={s.val} onClick={() => setSeverity(s.val)} style={{ padding: isMobile ? '13px 16px' : '9px', borderRadius: '10px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: isMobile ? '14px' : '12px', fontWeight: 600, transition: 'all 0.15s', minHeight: '48px', textAlign: isMobile ? 'left' : 'center', background: severity === s.val ? `rgba(${s.rgb},0.2)` : 'rgba(255,255,255,0.03)', color: severity === s.val ? s.color : '#4B5563', border: severity === s.val ? `1px solid ${s.color}60` : '1px solid rgba(255,255,255,0.06)' }}>
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