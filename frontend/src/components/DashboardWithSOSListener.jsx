// DashboardWithSOSListener.jsx
// Wraps Dashboard — adds SOS sound alert + special SilentSOS section on top

import React, { useState, useEffect, useRef } from 'react';
import { listenToIncidents, updateIncident } from '../firebase.js';
import Dashboard    from '../pages/Dashboard';
import SOSAlert     from './SOSAlert';
import soundService from '../services/soundNotificationService';

const NEW_INCIDENT_WINDOW_MS = 90_000; // 90 seconds

export default function DashboardWithSOSListener() {
  const [alertQueue,    setAlertQueue]    = useState([]);
  const [currentAlert,  setCurrentAlert]  = useState(null);
  const [silentAlerts,  setSilentAlerts]  = useState([]); // pending silent SOS list
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    const unsubscribe = listenToIncidents((incidentList) => {
      const now     = Date.now();
      const newOnes = [];
      const newSilent = [];

      incidentList.forEach(incident => {
        if (seenIdsRef.current.has(incident.id))                         return;
        if (incident.status === 'acknowledged')                           return;
        if (incident.status === 'resolved')                               return;
        if ((now - (incident.created_at || 0)) > NEW_INCIDENT_WINDOW_MS) return;

        seenIdsRef.current.add(incident.id);

        if (incident.silentAlert) {
          newSilent.push(incident); // goes to silent section
        } else {
          newOnes.push(incident);   // goes to normal alert queue
        }
      });

      if (newOnes.length > 0)   setAlertQueue(prev => [...prev, ...newOnes]);
      if (newSilent.length > 0) {
        setSilentAlerts(prev => [...prev, ...newSilent]);
        // Play louder alarm for silent SOS — staff must not miss this
        soundService.playSilentSOSAlert();
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      soundService.stop();
    };
  }, []);

  // Show next queued normal alert
  useEffect(() => {
    if (!currentAlert && alertQueue.length > 0) setCurrentAlert(alertQueue[0]);
  }, [alertQueue, currentAlert]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleAcknowledge = async (sosId) => {
    soundService.stop();
    try {
      await updateIncident(sosId, { status:'acknowledged', acknowledgedAt:Date.now() });
    } catch (err) { console.error('Acknowledge failed:', err); }
    setAlertQueue(prev => prev.filter(i => i.id !== sosId));
    setCurrentAlert(null);
  };

  const handleMute    = () => soundService.stop();

  const handleOpenMaps = () => {
    if (!currentAlert) return;
    const loc = currentAlert.location;
    const lat  = loc?.lat ?? loc?.latitude  ?? currentAlert.lat;
    const lng  = loc?.lng ?? loc?.longitude ?? currentAlert.lng;
    if (lat != null && lng != null) {
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    }
  };

  const dismissSilent = async (id) => {
    soundService.stop();
    try {
      await updateIncident(id, { status:'acknowledged', acknowledgedAt:Date.now(), silentResponsed:true });
    } catch (_) {}
    setSilentAlerts(prev => prev.filter(i => i.id !== id));
  };

  const openSilentMaps = (incident) => {
    const loc = incident.location;
    const lat  = loc?.lat ?? loc?.latitude  ?? incident.lat;
    const lng  = loc?.lng ?? loc?.longitude ?? incident.lng;
    if (lat != null && lng != null) {
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    } else {
      alert('No GPS coordinates — guest location unknown.');
    }
  };

  return (
    <div style={{ position:'relative' }}>

      {/* ── SILENTSOS SECTION — always visible at top of dashboard ── */}
      {silentAlerts.length > 0 && (
        <div style={{
          margin:'0',
          background:'rgba(226,75,74,0.08)',
          borderBottom:'1px solid rgba(226,75,74,0.3)',
        }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px 8px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:'#E24B4A', animation:'silent-pulse 1s ease-in-out infinite' }} />
              <span style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'16px', letterSpacing:'1px', color:'#F87171' }}>
                🤐 Silent SOS Alerts
              </span>
            </div>
            <span style={{ fontSize:'11px', background:'rgba(226,75,74,0.15)', color:'#F87171', padding:'3px 10px', borderRadius:'10px', border:'1px solid rgba(226,75,74,0.3)' }}>
              {silentAlerts.length} pending
            </span>
          </div>

          {/* Cards */}
          <div style={{ padding:'0 20px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'10px' }}>
            {silentAlerts.map(incident => {
              const loc = incident.location;
              const lat  = loc?.lat ?? loc?.latitude;
              const lng  = loc?.lng ?? loc?.longitude;
              const time = incident.created_at
                ? new Date(incident.created_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
                : '—';

              return (
                <div key={incident.id} style={{
                  background:'rgba(10,10,15,0.8)',
                  border:'1px solid rgba(226,75,74,0.4)',
                  borderRadius:'14px', padding:'14px',
                  animation:'silent-card-pulse 2s ease-in-out infinite',
                }}>
                  {/* Title row */}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                      <span style={{ fontSize:'16px' }}>🔒</span>
                      <span style={{ fontFamily:"'Bebas Neue', cursive", fontSize:'15px', letterSpacing:'1px', color:'#F87171' }}>
                        COVERT SECURITY ALERT
                      </span>
                    </div>
                    <span style={{ fontSize:'10px', background:'rgba(226,75,74,0.15)', color:'#F87171', padding:'2px 8px', borderRadius:'6px', border:'1px solid rgba(226,75,74,0.3)', fontWeight:700, letterSpacing:'0.5px' }}>
                      CRITICAL
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{ marginBottom:'12px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'12px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color:'#6B7280' }}>Detection method</span>
                      <span style={{ color:'#D1D5DB' }}>Phone shake ×3</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'12px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color:'#6B7280' }}>Time triggered</span>
                      <span style={{ color:'#D1D5DB' }}>{time}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'12px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color:'#6B7280' }}>Guest identity</span>
                      <span style={{ color:'#9CA3AF', fontStyle:'italic' }}>Anonymous (covert)</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:'12px' }}>
                      <span style={{ color:'#6B7280' }}>GPS</span>
                      <span style={{ color: lat ? '#34D399' : '#6B7280', fontFamily:'monospace', fontSize:'11px' }}>
                        {lat ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : 'Not available'}
                      </span>
                    </div>
                  </div>

                  {/* Staff instruction */}
                  <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'8px', padding:'8px 10px', marginBottom:'12px', fontSize:'11px', color:'#FCD34D', lineHeight:1.5 }}>
                    ⚠️ Do NOT call back. Guest may be in danger. Dispatch security silently to this location.
                  </div>

                  {/* Action buttons */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    {lat && (
                      <button onClick={() => openSilentMaps(incident)} style={{ padding:'9px', background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:'10px', color:'#34D399', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                        📍 Open Maps
                      </button>
                    )}
                    <button onClick={() => dismissSilent(incident.id)} style={{ padding:'9px', background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:'10px', color:'#34D399', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", gridColumn: lat ? 'auto' : '1 / -1' }}>
                      ✓ Dispatched
                    </button>
                  </div>

                  {/* Incident ID */}
                  <p style={{ margin:'8px 0 0', fontSize:'10px', color:'#374151', textAlign:'right', fontFamily:'monospace' }}>
                    #{(incident.id || '').slice(-8).toUpperCase()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Normal Dashboard ── */}
      <Dashboard />

      {/* ── Normal SOSAlert overlay ── */}
      {currentAlert && (
        <SOSAlert
          key={currentAlert.id}
          sos={currentAlert}
          onAcknowledge={handleAcknowledge}
          onMute={handleMute}
          onOpenMaps={handleOpenMaps}
        />
      )}

      {/* Queue badge */}
      {alertQueue.length > 1 && (
        <div style={{ position:'fixed', bottom:'20px', right:'20px', background:'#E24B4A', color:'#fff', padding:'10px 16px', borderRadius:'12px', fontSize:'13px', fontWeight:600, zIndex:10000, fontFamily:"'DM Sans', sans-serif" }}>
          🚨 {alertQueue.length - 1} more pending
        </div>
      )}

      <style>{`
        @keyframes silent-pulse {
          0%,100% { opacity:1; box-shadow: 0 0 6px #E24B4A; }
          50%      { opacity:0.5; box-shadow: 0 0 0px #E24B4A; }
        }
        @keyframes silent-card-pulse {
          0%,100% { border-color: rgba(226,75,74,0.4); }
          50%      { border-color: rgba(226,75,74,0.9); }
        }
      `}</style>
    </div>
  );
}