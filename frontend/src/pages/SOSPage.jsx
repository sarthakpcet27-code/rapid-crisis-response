import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import { createIncident, updateIncident, sendMessage, listenToIncident } from '../firebase';

const DEBUG = true;
const log = (msg, data) => DEBUG && console.log(`[SOSPage] ${msg}`, data ?? '');

const CRISIS_TYPES = [
  { id: 'fire',     label: 'Fire',     icon: '🔥', color: '#E24B4A', rgb: '226,75,74'  },
  { id: 'medical',  label: 'Medical',  icon: '🏥', color: '#F59E0B', rgb: '245,158,11' },
  { id: 'security', label: 'Security', icon: '🔒', color: '#8B5CF6', rgb: '139,92,246' },
  { id: 'flood',    label: 'Flood',    icon: '🌊', color: '#3B82F6', rgb: '59,130,246' },
  { id: 'other',    label: 'Other',    icon: '⚠️', color: '#9CA3AF', rgb: '107,114,128'},
];

const API = 'http://localhost:3001';

// ── SilentSOS shake config ────────────────────────────────────────
const SHAKE_THRESHOLD   = 25;   // m/s² — violent shake only
const SHAKES_REQUIRED   = 3;    // how many shakes needed
const SHAKE_WINDOW_MS   = 2000; // all shakes must happen within 2 seconds
const SHAKE_DEBOUNCE_MS = 150;  // min gap between counted shakes

export default function SOSPage() {
  // ── Form state ─────────────────────────────────────────────────
  const [crisisType,   setCrisisType]   = useState('fire');
  const [description,  setDescription]  = useState('');
  const [floor,        setFloor]        = useState('');
  const [room,         setRoom]         = useState('');
  const [severity,     setSeverity]     = useState('YELLOW');
  const [location,     setLocation]     = useState(null);

  // ── Flow state ─────────────────────────────────────────────────
  const [screen,       setScreen]       = useState('sos');
  const [countdown,    setCountdown]    = useState(3);
  const [aiResult,     setAiResult]     = useState(null);
  const [currentId,    setCurrentId]    = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [guestMsg,     setGuestMsg]     = useState('');
  const [isListening,  setIsListening]  = useState(false);

  // ── SilentSOS state ────────────────────────────────────────────
  const [silentEnabled,   setSilentEnabled]   = useState(true);
  const [shakeCount,      setShakeCount]       = useState(0);
  const [silentFired,     setSilentFired]      = useState(false);
  const [motionSupported, setMotionSupported]  = useState(true);

  // ── Refs ───────────────────────────────────────────────────────
  const chatEndRef     = useRef(null);
  const countTimerRef  = useRef(null);
  const recognitionRef = useRef(null);

  // SilentSOS refs (don't trigger re-renders)
  const shakeCountRef    = useRef(0);
  const lastShakeTimeRef = useRef(0);
  const shakeTimerRef    = useRef(null);  // reset timer
  const silentFiredRef   = useRef(false); // prevent double-fire
  const silentEnabledRef = useRef(true);  // sync with state
  const locationRef      = useRef(null);  // always fresh location

  // ── Keep refs in sync with state ──────────────────────────────
  useEffect(() => { silentEnabledRef.current = silentEnabled; }, [silentEnabled]);
  useEffect(() => { locationRef.current = location; }, [location]);

  // ── GPS on load ────────────────────────────────────────────────
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => setLocation(null)
    );
  }, []);

  // ── Live chat listener ─────────────────────────────────────────
  useEffect(() => {
    if (!currentId) return;
    const unsub = listenToIncident(currentId, (data) => {
      if (data?.chat) {
        setChatMessages(Object.values(data.chat).sort((a, b) => a.time - b.time));
      }
    });
    return () => typeof unsub === 'function' && unsub();
  }, [currentId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(countTimerRef.current);
      clearTimeout(shakeTimerRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  // ══════════════════════════════════════════════════════════════
  // SILENTSOS — SHAKE DETECTION ENGINE
  // ══════════════════════════════════════════════════════════════

  const handleDeviceMotion = useCallback((event) => {
    if (!silentEnabledRef.current) return;
    if (silentFiredRef.current)    return; // already fired, don't double-trigger

    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;

    const { x = 0, y = 0, z = 0 } = acc;
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    log(`Acceleration magnitude: ${magnitude.toFixed(2)} m/s²`);

    if (magnitude < SHAKE_THRESHOLD) return;

    const now = Date.now();
    const timeSinceLast = now - lastShakeTimeRef.current;

    // Debounce — ignore if too soon after last shake
    if (timeSinceLast < SHAKE_DEBOUNCE_MS) return;

    lastShakeTimeRef.current = now;
    shakeCountRef.current += 1;

    log(`Shake detected! Count: ${shakeCountRef.current}/${SHAKES_REQUIRED}`);
    setShakeCount(shakeCountRef.current); // update UI

    // Reset counter if user stops shaking
    clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      log('Shake window expired — resetting counter');
      shakeCountRef.current = 0;
      setShakeCount(0);
    }, SHAKE_WINDOW_MS);

    // TRIGGER — 3 shakes reached
    if (shakeCountRef.current >= SHAKES_REQUIRED) {
      log('🚨 SilentSOS TRIGGERED! Firing silent incident...');
      clearTimeout(shakeTimerRef.current);
      shakeCountRef.current = 0;
      setShakeCount(0);
      fireSilentSOS();
    }
  }, []);

  // ── Attach / detach DeviceMotion listener ─────────────────────
  useEffect(() => {
    if (!silentEnabled) {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      log('SilentSOS disabled — listener removed');
      return;
    }

    // Check support
    if (!window.DeviceMotionEvent) {
      setMotionSupported(false);
      log('DeviceMotion NOT supported on this device');
      return;
    }

    // iOS 13+ requires explicit permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      log('iOS 13+ — requesting DeviceMotion permission');
      DeviceMotionEvent.requestPermission()
        .then(permission => {
          if (permission === 'granted') {
            window.addEventListener('devicemotion', handleDeviceMotion);
            log('iOS permission granted — SilentSOS active');
          } else {
            setMotionSupported(false);
            log('iOS permission DENIED');
          }
        })
        .catch(err => {
          log('iOS permission request failed:', err);
          setMotionSupported(false);
        });
    } else {
      // Android and desktop — no permission needed
      window.addEventListener('devicemotion', handleDeviceMotion);
      log('SilentSOS listener active (Android/desktop)');
    }

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      log('SilentSOS listener removed on cleanup');
    };
  }, [silentEnabled, handleDeviceMotion]);

  // ── Fire silent SOS to Firebase ───────────────────────────────
  const fireSilentSOS = async () => {
    if (silentFiredRef.current) return; // prevent double fire
    silentFiredRef.current = true;
    setSilentFired(true);

    const loc = locationRef.current;
    log('Firing SilentSOS with location:', loc);

    try {
      const id = await createIncident({
        crisisType:      'security',
        severity:        'RED',
        description:     'Silent SOS triggered — potential threat or attack in progress',
        silentAlert:     true,               // KEY FLAG for dashboard
        detectionMethod: 'DeviceMotion — violent shake x3',
        floor:           '',
        room:            '',
        location:        loc,
        status:          'active',
      });

      log('✅ SilentSOS incident created in Firebase:', id);

      // Subtle haptic vibration (50ms — almost imperceptible)
      if (navigator.vibrate) {
        navigator.vibrate([50]);
        log('Haptic vibration sent');
      }

      // Very subtle visual confirmation (tiny green dot only)
      setTimeout(() => {
        silentFiredRef.current = false;
        setSilentFired(false);
      }, 8000);

    } catch (err) {
      log('❌ SilentSOS Firebase error:', err);
      silentFiredRef.current = false;
      setSilentFired(false);
    }
  };

  // ── TEST button (development only — remove for production) ────
  const testSilentSOS = () => {
    log('TEST: manually triggering SilentSOS');
    fireSilentSOS();
  };

  // ══════════════════════════════════════════════════════════════
  // MANUAL SOS FLOW
  // ══════════════════════════════════════════════════════════════

  const handleSOSTap = () => {
    if (!description.trim()) { toast.error('Please describe what is happening'); return; }
    setCountdown(3);
    setScreen('counting');
    let count = 3;
    countTimerRef.current = setInterval(() => {
      count--;
      if (count > 0) { setCountdown(count); }
      else { clearInterval(countTimerRef.current); submitSOS(); }
    }, 1000);
  };

  const cancelCountdown = () => {
    clearInterval(countTimerRef.current);
    setScreen('sos');
  };

  const submitSOS = async () => {
    setScreen('sending');
    try {
      const id = await createIncident({ description, crisisType, floor, room, severity, location });
      setCurrentId(id);
      try {
        const { data } = await axios.post(`${API}/api/classify`, { description, floor, crisisType });
        setAiResult(data);
        await updateIncident(id, { severity: data.severity, sop: data.sop, summary: data.summary });
      } catch (aiErr) { log('AI classification skipped:', aiErr.message); }

      // Alert sound for manual SOS
      try {
        const ctx  = new AudioContext();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } catch (_) {}

      toast.success('Alert sent! Staff have been notified.');
      setScreen('confirm');
    } catch (err) {
      log('SOS submission failed:', err);
      toast.error('Failed to send. Check your connection.');
      setScreen('sos');
    }
  };

  const sendGuestMsg = () => {
    if (!guestMsg.trim() || !currentId) return;
    sendMessage(currentId, guestMsg, 'guest');
    setGuestMsg('');
  };

  // Voice SOS
  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window)) { toast.error('Voice not supported — use Chrome'); return; }
    const r = new window.webkitSpeechRecognition();
    r.lang = 'en-IN'; r.continuous = false; r.interimResults = false;
    r.onstart  = () => setIsListening(true);
    r.onend    = () => setIsListening(false);
    r.onerror  = () => setIsListening(false);
    r.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setDescription(text);
      const l = text.toLowerCase();
      if (l.includes('fire') || l.includes('smoke'))   setCrisisType('fire');
      else if (l.includes('medical') || l.includes('doctor')) setCrisisType('medical');
      else if (l.includes('security') || l.includes('intruder')) setCrisisType('security');
      else if (l.includes('flood') || l.includes('water')) setCrisisType('flood');
      toast.success('Voice captured!');
    };
    recognitionRef.current = r;
    r.start();
  };

  const getSevClass = (sev) => {
    if (sev === 'RED')    return 'severity-red';
    if (sev === 'YELLOW') return 'severity-yellow';
    if (sev === 'GREEN')  return 'severity-green';
    return 'severity-pending';
  };

  // ══════════════════════════════════════════════════════════════
  // COUNTING SCREEN
  // ══════════════════════════════════════════════════════════════
  if (screen === 'counting') return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <motion.div
        key={countdown}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'140px', color:'#E24B4A', lineHeight:1 }}
      >
        {countdown}
      </motion.div>
      <p style={{ color:'#6B7280', fontSize:'16px', marginTop:'16px' }}>Sending in {countdown}s...</p>
      <button onClick={cancelCountdown} style={{ marginTop:'24px', color:'#4B5563', background:'none', border:'1px solid #2A2A3A', borderRadius:'10px', padding:'8px 20px', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", fontSize:'14px' }}>
        Cancel
      </button>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // SENDING SCREEN
  // ══════════════════════════════════════════════════════════════
  if (screen === 'sending') return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <motion.div animate={{ rotate:360 }} transition={{ duration:1, repeat:Infinity, ease:'linear' }}
        style={{ width:'64px', height:'64px', borderRadius:'50%', border:'3px solid #2A2A3A', borderTopColor:'#E24B4A', marginBottom:'24px' }}
      />
      <p style={{ color:'#E5E7EB', fontSize:'18px', fontWeight:500 }}>Sending alert...</p>
      <p style={{ color:'#6B7280', fontSize:'13px', marginTop:'8px' }}>Notifying staff & AI system</p>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // CONFIRM SCREEN
  // ══════════════════════════════════════════════════════════════
  if (screen === 'confirm') return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', padding:'20px 20px 40px' }}>
      <div style={{ maxWidth:'480px', margin:'0 auto' }}>
        <motion.div initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }} style={{ textAlign:'center', padding:'28px 0 18px' }}>
          <div style={{ width:'70px', height:'70px', borderRadius:'50%', background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:'30px' }}>✓</div>
          <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'34px', letterSpacing:'2px', color:'#fff', margin:'0 0 4px' }}>Alert Sent!</h2>
          <p style={{ color:'#6B7280', fontSize:'14px', margin:0 }}>Staff notified. Help is on the way.</p>
        </motion.div>

        {aiResult && (
          <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.2 }}
            style={{ background:'rgba(99,60,255,0.08)', border:'1px solid rgba(99,60,255,0.22)', borderRadius:'14px', padding:'14px', marginBottom:'12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <span style={{ fontSize:'12px', fontWeight:700, color:'#A78BFA', textTransform:'uppercase', letterSpacing:'0.5px' }}>🤖 AI Response Plan</span>
              <span className={getSevClass(aiResult.severity)}>{aiResult.severity}</span>
            </div>
            {aiResult.summary && <p style={{ fontSize:'12px', color:'#8B5CF6', marginBottom:'10px', fontStyle:'italic' }}>{aiResult.summary}</p>}
            <ol style={{ paddingLeft:'18px', margin:0 }}>
              {aiResult.sop?.map((s, i) => <li key={i} style={{ fontSize:'12px', color:'#C4B5FD', marginBottom:'5px', lineHeight:1.5 }}>{s}</li>)}
            </ol>
          </motion.div>
        )}

        {/* Live Chat */}
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.3 }}
          style={{ border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', overflow:'hidden', marginBottom:'12px' }}>
          <div style={{ background:'rgba(226,75,74,0.1)', borderBottom:'1px solid rgba(226,75,74,0.2)', padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'13px', fontWeight:600, color:'#F87171' }}>💬 Live Chat with Staff</span>
            <span style={{ fontSize:'11px', color:'#6B7280' }}>{chatMessages.length} messages</span>
          </div>
          <div style={{ background:'rgba(10,10,15,0.6)', padding:'12px', minHeight:'100px', maxHeight:'200px', overflowY:'auto' }}>
            {chatMessages.length === 0
              ? <p style={{ color:'#374151', fontSize:'12px', textAlign:'center', marginTop:'30px' }}>Waiting for staff response...</p>
              : chatMessages.map((m, i) => (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.sender==='guest' ? 'flex-end' : 'flex-start', marginBottom:'10px' }}>
                  <span style={{ fontSize:'10px', color:'#4B5563', marginBottom:'3px' }}>{m.sender==='guest' ? 'You' : '🟢 Staff'}</span>
                  <div style={{ display:'inline-block', padding:'8px 12px', borderRadius:'12px', fontSize:'13px', maxWidth:'78%',
                    background: m.sender==='guest' ? '#E24B4A' : 'rgba(255,255,255,0.08)',
                    color:      m.sender==='guest' ? '#fff' : '#D1D5DB',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))
            }
            <div ref={chatEndRef} />
          </div>
          <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            <input value={guestMsg} onChange={e => setGuestMsg(e.target.value)} onKeyDown={e => e.key==='Enter' && sendGuestMsg()}
              placeholder="Type message to staff..."
              style={{ flex:1, padding:'12px 14px', background:'transparent', border:'none', outline:'none', color:'#E5E7EB', fontSize:'13px', fontFamily:"'DM Sans', sans-serif" }} />
            <button onClick={sendGuestMsg} style={{ padding:'0 20px', background:'#E24B4A', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, fontSize:'13px' }}>Send</button>
          </div>
        </motion.div>

        <button onClick={() => { setScreen('sos'); setChatMessages([]); setCurrentId(null); setAiResult(null); setDescription(''); setFloor(''); setRoom(''); }}
          style={{ width:'100%', padding:'12px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color:'#6B7280', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
          Send another alert
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // MAIN SOS SCREEN
  // ══════════════════════════════════════════════════════════════
  const selectedCrisis = CRISIS_TYPES.find(c => c.id === crisisType);

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', padding:'20px 20px 60px' }}>
      <div style={{ maxWidth:'440px', margin:'0 auto' }}>

        {/* Page header */}
        <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} style={{ textAlign:'center', padding:'18px 0 8px' }}>
          <h1 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'36px', letterSpacing:'3px', color:'#fff', margin:'0 0 4px' }}>
            Emergency <span style={{ color:'#E24B4A' }}>SOS</span>
          </h1>
          <p style={{ color:'#6B7280', fontSize:'13px', margin:0 }}>Fill what you can — help is coming</p>
        </motion.div>

        {/* ── SILENTSOS STATUS INDICATOR ── */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.1 }}
          style={{ marginBottom:'12px' }}>
          {/* Enabled panel */}
          <div style={{
            background: silentEnabled ? 'rgba(16,185,129,0.06)' : 'rgba(107,114,128,0.06)',
            border: `1px solid ${silentEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)'}`,
            borderRadius:'14px', padding:'12px 14px',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: silentEnabled ? '10px' : '0' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%',
                  background: silentEnabled ? '#10B981' : '#6B7280',
                  boxShadow: silentEnabled ? '0 0 6px #10B981' : 'none',
                  animation: silentEnabled ? 'pulse-dot 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize:'12px', fontWeight:500, color: silentEnabled ? '#34D399' : '#6B7280', fontFamily:"'DM Sans', sans-serif" }}>
                  SilentSOS {silentEnabled ? 'Active' : 'Disabled'}
                </span>
                {!motionSupported && <span style={{ fontSize:'10px', color:'#F59E0B', marginLeft:'4px' }}>(shake not supported)</span>}
              </div>
              {/* Toggle switch */}
              <div onClick={() => setSilentEnabled(v => !v)}
                style={{ width:'44px', height:'24px', borderRadius:'12px', cursor:'pointer', position:'relative', transition:'background 0.2s',
                  background: silentEnabled ? '#10B981' : '#374151',
                }}>
                <div style={{ position:'absolute', top:'3px', width:'18px', height:'18px', borderRadius:'50%', background:'#fff', transition:'left 0.2s',
                  left: silentEnabled ? '23px' : '3px',
                }} />
              </div>
            </div>

            {silentEnabled && (
              <>
                <p style={{ fontSize:'11px', color:'#6B7280', margin:'0 0 8px', fontFamily:"'DM Sans', sans-serif", lineHeight:1.5 }}>
                  Shake phone 3× rapidly = silent security alert. No sound. No popup. Staff notified secretly.
                </p>
                {/* Shake counter */}
                <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                  {[1,2,3].map(n => (
                    <div key={n} style={{ width:'28px', height:'28px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:600, transition:'all 0.2s',
                      background: shakeCount >= n ? '#10B981' : 'rgba(255,255,255,0.06)',
                      color: shakeCount >= n ? '#fff' : '#6B7280',
                      border: shakeCount >= n ? 'none' : '1px solid rgba(255,255,255,0.1)',
                      transform: shakeCount >= n ? 'scale(1.15)' : 'scale(1)',
                    }}>
                      {n}
                    </div>
                  ))}
                  <span style={{ fontSize:'11px', color:'#6B7280', marginLeft:'6px', fontFamily:"'DM Sans', sans-serif" }}>
                    {shakeCount > 0 ? `${shakeCount}/3 shakes detected` : 'Shake counter'}
                  </span>
                  {silentFired && (
                    <span style={{ marginLeft:'auto', fontSize:'10px', background:'rgba(16,185,129,0.15)', color:'#34D399', padding:'2px 8px', borderRadius:'6px', border:'1px solid rgba(16,185,129,0.3)' }}>
                      Sent ✓
                    </span>
                  )}
                </div>

                {/* DEV TEST BUTTON — remove before production */}
                {DEBUG && (
                  <button onClick={testSilentSOS} style={{ marginTop:'8px', width:'100%', padding:'6px', background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.3)', borderRadius:'8px', color:'#A78BFA', fontSize:'11px', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    [DEV] Test SilentSOS manually
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>

        {/* ── BIG PULSING SOS CIRCLE ── */}
        <motion.div initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ delay:0.15 }}
          style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'24px 0 18px', position:'relative', height:'210px' }}>
          {[160, 195, 230].map((size, i) => (
            <div key={i} style={{ position:'absolute', width:`${size}px`, height:`${size}px`, borderRadius:'50%',
              border:`2px solid rgba(226,75,74,${0.45 - i*0.12})`,
              animation:`ring-expand ${1.8+i*0.5}s ease-out infinite`, animationDelay:`${i*0.4}s`,
            }} />
          ))}
          <motion.button whileTap={{ scale:0.91 }} onClick={handleSOSTap}
            style={{ width:'150px', height:'150px', borderRadius:'50%', background:'#E24B4A',
              border:'4px solid rgba(255,100,100,0.45)', color:'#fff', cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              position:'relative', zIndex:2, boxShadow:'0 0 48px rgba(226,75,74,0.45)',
            }}>
            <span style={{ fontSize:'38px', lineHeight:1 }}>{selectedCrisis?.icon}</span>
            <span style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'28px', letterSpacing:'3px', marginTop:'4px' }}>SOS</span>
            <span style={{ fontSize:'10px', opacity:0.75, marginTop:'2px' }}>Tap to alert staff</span>
          </motion.button>
        </motion.div>

        {/* Crisis type pills */}
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.2 }}>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', justifyContent:'center', marginBottom:'16px' }}>
            {CRISIS_TYPES.map(c => {
              const sel = crisisType === c.id;
              return (
                <motion.button key={c.id} whileTap={{ scale:0.94 }} onClick={() => setCrisisType(c.id)}
                  style={{ padding:'8px 14px', borderRadius:'20px', cursor:'pointer', fontSize:'12px', fontWeight:500,
                    fontFamily:"'DM Sans', sans-serif", outline:'none', transition:'all 0.15s ease',
                    background: sel ? `rgba(${c.rgb}, 0.2)` : 'rgba(255,255,255,0.04)',
                    color:       sel ? c.color : '#6B7280',
                    border:      sel ? `1px solid ${c.color}70` : '1px solid rgba(255,255,255,0.07)',
                    boxShadow:   sel ? `0 0 14px rgba(${c.rgb}, 0.3)` : 'none',
                    transform:   sel ? 'scale(1.05)' : 'scale(1)',
                  }}>
                  {c.icon} {c.label}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* GPS + Voice */}
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.25 }}
          style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.22)', borderRadius:'12px', padding:'10px 12px' }}>
            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#10B981', flexShrink:0, animation:'pulse-dot 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize:'11px', color:'#34D399' }}>{location ? 'GPS Live' : 'Locating...'}</span>
          </div>
          <motion.button whileTap={{ scale:0.97 }} onClick={isListening ? () => { recognitionRef.current?.stop(); setIsListening(false); } : startVoice}
            style={{ display:'flex', alignItems:'center', gap:'8px',
              background: isListening ? 'rgba(226,75,74,0.15)' : 'rgba(255,255,255,0.04)',
              border: isListening ? '1px solid rgba(226,75,74,0.4)' : '1px solid rgba(255,255,255,0.07)',
              borderRadius:'12px', padding:'10px 12px', cursor:'pointer', fontFamily:"'DM Sans', sans-serif",
            }}>
            <span style={{ fontSize:'16px' }}>🎤</span>
            <span style={{ fontSize:'11px', color: isListening ? '#F87171' : '#6B7280' }}>
              {isListening ? 'Listening...' : 'Voice SOS'}
            </span>
          </motion.button>
        </motion.div>

        {/* Description + Floor + Room */}
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.3 }}>
          <div className="glass-card" style={{ padding:'16px', marginBottom:'12px' }}>
            <label style={{ display:'block', fontSize:'11px', color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'7px' }}>What is happening?</label>
            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. I can smell smoke from the corridor..."
              className="glass-input" style={{ resize:'none', marginBottom:'12px' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>
                <label style={{ display:'block', fontSize:'11px', color:'#6B7280', marginBottom:'6px' }}>Floor</label>
                <input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 6" className="glass-input" />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'11px', color:'#6B7280', marginBottom:'6px' }}>Room</label>
                <input value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. 614" className="glass-input" />
              </div>
            </div>
          </div>

          {/* Urgency */}
          <div className="glass-card" style={{ padding:'14px', marginBottom:'20px' }}>
            <label style={{ display:'block', fontSize:'11px', color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px' }}>Urgency level</label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
              {[{ val:'GREEN', label:'Low', color:'#10B981', rgb:'16,185,129' },
                { val:'YELLOW', label:'Medium', color:'#F59E0B', rgb:'245,158,11' },
                { val:'RED', label:'Critical', color:'#E24B4A', rgb:'226,75,74' }].map(s => (
                <button key={s.val} onClick={() => setSeverity(s.val)} style={{ padding:'9px', borderRadius:'10px', cursor:'pointer', fontFamily:"'DM Sans', sans-serif", fontSize:'12px', fontWeight:600, transition:'all 0.15s',
                  background: severity===s.val ? `rgba(${s.rgb},0.2)` : 'rgba(255,255,255,0.03)',
                  color: severity===s.val ? s.color : '#4B5563',
                  border: severity===s.val ? `1px solid ${s.color}60` : '1px solid rgba(255,255,255,0.06)',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
        </motion.div>

      </div>

      <style>{`
        @keyframes ring-expand { 0%{transform:scale(0.75);opacity:.8} 100%{transform:scale(1.15);opacity:0} }
        @keyframes pulse-dot   { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </div>
  );
}