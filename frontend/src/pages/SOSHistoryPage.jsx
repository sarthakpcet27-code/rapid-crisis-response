// frontend/src/pages/SOSHistoryPage.jsx
// FIXES:
//   Bug 2: offline incidents now correctly detected using createdOffline flag
//          (IndexedDB saves createdOffline:true; we tag them as _source:'offline')
//   Bug 2: "Offline" status filter matches _source==='offline' correctly

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { auth, listenToMyIncidents } from '../firebase';
import { getMyOfflineIncidents } from '../utils/db';

const CRISIS_ICONS = { fire:'🔥', medical:'🏥', security:'🔒', flood:'🌊', other:'⚠️' };

const SEV = {
  RED:             { bg:'rgba(226,75,74,0.15)',   color:'#F87171', border:'rgba(226,75,74,0.3)',   label:'RED'       },
  YELLOW:          { bg:'rgba(245,158,11,0.15)',  color:'#FCD34D', border:'rgba(245,158,11,0.3)',  label:'YELLOW'    },
  GREEN:           { bg:'rgba(16,185,129,0.15)',  color:'#34D399', border:'rgba(16,185,129,0.3)',  label:'GREEN'     },
  pending:         { bg:'rgba(107,114,128,0.15)', color:'#9CA3AF', border:'rgba(107,114,128,0.3)', label:'pending'   },
  pending_offline: { bg:'rgba(245,158,11,0.15)',  color:'#FCD34D', border:'rgba(245,158,11,0.3)',  label:'⏳ Offline' },
};

const TYPE_FILTERS   = ['All','fire','medical','security','flood','other'];
// ← 'offline' filter now works by checking _source==='offline'
const STATUS_FILTERS = ['All','active','resolved','acknowledged','offline'];

export default function SOSHistoryPage() {
  const [firebaseInc,  setFirebaseInc]  = useState([]);
  const [offlineInc,   setOfflineInc]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [typeFilter,   setTypeFilter]   = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected,     setSelected]     = useState(null);
  const [dbError,      setDbError]      = useState(false);

  const user = auth.currentUser;

  // ── Firebase incidents ──────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = listenToMyIncidents((data) => {
      setFirebaseInc(data);
      setLoading(false);
    });
    return () => typeof unsub === 'function' && unsub();
  }, [user]);

  // ── IndexedDB offline incidents — the key fix for Bug 2 ────
  // Previous code may have used user.uid filter that didn't match,
  // or forgot to poll IndexedDB entirely.
  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadOffline = async () => {
      try {
        // getMyOfflineIncidents filters by guestUid === user.uid
        const data = await getMyOfflineIncidents(user.uid);
        if (!active) return;
        console.log('[SOSHistory] IndexedDB offline incidents:', data.length);
        setOfflineInc(data);
        setDbError(false);
      } catch (err) {
        console.error('[SOSHistory] IndexedDB read failed:', err);
        if (active) setDbError(true);
      }
    };

    loadOffline();
    // Re-poll every 8s so newly synced incidents disappear from offline list
    const interval = setInterval(loadOffline, 8000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  // ── Merge + deduplicate ─────────────────────────────────────
  // Firebase incidents that came from offline sync have offlineLocalId set.
  // We hide the IndexedDB copy once it's represented in Firebase.
  const syncedLocalIds = new Set(
    firebaseInc.map(inc => inc.offlineLocalId).filter(Boolean)
  );

  // Tag offline incidents with _source so the filter can match them
  const pendingOfflineOnly = offlineInc
    .filter(inc => {
      // Include if NOT yet synced to Firebase
      // Match by: createdOffline flag OR syncStatus !== 'synced' OR !synced
      const notSynced = !syncedLocalIds.has(inc.id) &&
        (inc.createdOffline === true || inc.syncStatus !== 'synced' || inc.synced === false);
      return notSynced;
    })
    .map(inc => ({ ...inc, _source:'offline' }));

  const allIncidents = [
    ...firebaseInc.map(inc => ({ ...inc, _source:'firebase' })),
    ...pendingOfflineOnly,
  ].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  // ── Filter ──────────────────────────────────────────────────
  const filtered = allIncidents.filter(inc => {
    const typeMatch = typeFilter === 'All' ||
      inc.crisisType?.toLowerCase() === typeFilter;

    // ← FIX: 'offline' filter now checks _source, not inc.status
    const statusMatch = statusFilter === 'All'
      ? true
      : statusFilter === 'offline'
        ? inc._source === 'offline'
        : inc.status?.toLowerCase() === statusFilter;

    return typeMatch && statusMatch;
  });

  const getBadge = (inc) => {
    if (inc._source === 'offline') return SEV.pending_offline;
    return SEV[inc.severity] || SEV.pending;
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <motion.div animate={{ rotate:360 }} transition={{ duration:1, repeat:Infinity, ease:'linear' }}
        style={{ width:'44px', height:'44px', borderRadius:'50%', border:'3px solid #2A2A3A', borderTopColor:'#E24B4A' }} />
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#0A0A0F', padding:'20px' }}>
      <div style={{ maxWidth:'560px', margin:'0 auto' }}>

        {/* Header */}
        <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} style={{ marginBottom:'18px' }}>
          <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontSize:'30px', letterSpacing:'2px', color:'#fff', margin:'0 0 4px' }}>
            SOS <span style={{ color:'#E24B4A' }}>History</span>
          </h1>
          <p style={{ color:'#6B7280', fontSize:'13px', margin:0, fontFamily:"'DM Sans',sans-serif" }}>
            {filtered.length} of {allIncidents.length} incidents
            {pendingOfflineOnly.length > 0 && (
              <span style={{ marginLeft:'8px', fontSize:'11px', background:'rgba(245,158,11,0.15)', color:'#FCD34D', padding:'1px 8px', borderRadius:'8px', border:'1px solid rgba(245,158,11,0.3)' }}>
                ⏳ {pendingOfflineOnly.length} offline pending
              </span>
            )}
          </p>
          {dbError && (
            <p style={{ fontSize:'11px', color:'#F87171', margin:'4px 0 0', fontFamily:"'DM Sans',sans-serif" }}>
              ⚠️ Could not load offline incidents from this device
            </p>
          )}
        </motion.div>

        {/* Type filter */}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'8px' }}>
          {TYPE_FILTERS.map(f => (
            <button key={f} onClick={() => setTypeFilter(f)} style={{
              padding:'5px 12px', borderRadius:'16px', border:'none', cursor:'pointer',
              fontSize:'11px', fontWeight:500, fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s',
              background: typeFilter===f ? '#E24B4A' : 'rgba(255,255,255,0.05)',
              color:       typeFilter===f ? '#fff'    : '#6B7280',
            }}>
              {f==='All' ? 'All' : `${CRISIS_ICONS[f]||''} ${f.charAt(0).toUpperCase()+f.slice(1)}`}
            </button>
          ))}
        </div>

        {/* Status filter — 'offline' tab is now here */}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'20px' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding:'4px 10px', borderRadius:'8px',
              border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer',
              fontSize:'11px', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s',
              background: statusFilter===f ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:       statusFilter===f ? '#E5E7EB' : '#4B5563',
            }}>
              {f==='All'     ? 'All'
               : f==='offline'? '⏳ Offline'
               : f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <div style={{ fontSize:'44px', marginBottom:'12px' }}>📋</div>
            <p style={{ fontSize:'14px', margin:'0 0 6px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif" }}>
              {statusFilter === 'offline'
                ? 'No offline incidents found on this device'
                : 'No incidents found'}
            </p>
            <p style={{ fontSize:'12px', margin:0, color:'#2A2A3A', fontFamily:"'DM Sans',sans-serif" }}>
              {statusFilter === 'offline'
                ? 'Offline SOSes are stored on the device you used — check that device'
                : 'Send an SOS to see your history here'}
            </p>
          </div>
        ) : (
          filtered.map((inc, idx) => {
            const badge  = getBadge(inc);
            const isOpen = selected === (inc.id || `offline-${idx}`);
            const time   = inc.created_at
              ? new Date(inc.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })
              : '—';
            const incKey = inc.id || `offline-${idx}`;

            return (
              <motion.div key={incKey} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.3) }}>
                <div
                  onClick={() => setSelected(isOpen ? null : incKey)}
                  style={{
                    background:   'rgba(26,26,38,0.8)',
                    border:       `1px solid ${isOpen ? 'rgba(226,75,74,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    borderLeft:   `3px solid ${badge.color}`,
                    borderRadius: '14px',
                    padding:      '14px',
                    marginBottom: '10px',
                    cursor:       'pointer',
                    transition:   'all 0.15s',
                  }}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                      <span style={{ fontSize:'18px' }}>{CRISIS_ICONS[inc.crisisType] || '⚠️'}</span>
                      <span style={{ fontSize:'14px', fontWeight:500, color:'#E5E7EB', fontFamily:"'DM Sans',sans-serif" }}>
                        {(inc.crisisType || 'Unknown').toUpperCase()}
                      </span>
                      {inc._source === 'offline' && (
                        <span style={{ fontSize:'10px', background:'rgba(245,158,11,0.12)', color:'#F59E0B', padding:'1px 7px', borderRadius:'6px', border:'1px solid rgba(245,158,11,0.25)' }}>
                          offline
                        </span>
                      )}
                      {inc.silentAlert && (
                        <span style={{ fontSize:'10px', background:'rgba(139,92,246,0.15)', color:'#C4B5FD', padding:'1px 6px', borderRadius:'5px', border:'1px solid rgba(139,92,246,0.3)' }}>
                          SILENT
                        </span>
                      )}
                    </div>
                    <span style={{ padding:'2px 9px', borderRadius:'8px', fontSize:'11px', fontWeight:700, fontFamily:"'DM Sans',sans-serif", background:badge.bg, color:badge.color, border:`1px solid ${badge.border}` }}>
                      {badge.label}
                    </span>
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'11px', color:'#6B7280', fontFamily:"'DM Sans',sans-serif" }}>
                      {[inc.floor && `Floor ${inc.floor}`, inc.room && `Room ${inc.room}`].filter(Boolean).join(' · ') || 'No location'} · {time}
                    </span>
                    <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'6px', fontFamily:"'DM Sans',sans-serif",
                      background: inc._source==='offline' ? 'rgba(245,158,11,0.08)'
                        : ['resolved','acknowledged'].includes(inc.status) ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.08)',
                      color: inc._source==='offline' ? '#F59E0B'
                        : ['resolved','acknowledged'].includes(inc.status) ? '#34D399' : '#6B7280',
                    }}>
                      {inc._source==='offline' ? 'waiting to sync' : (inc.status || 'active')}
                    </span>
                  </div>

                  {isOpen && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
                      style={{ marginTop:'12px', paddingTop:'12px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                      {inc._source === 'offline' && (
                        <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:'8px', padding:'8px 12px', marginBottom:'10px', fontSize:'12px', color:'#FCD34D', fontFamily:"'DM Sans',sans-serif" }}>
                          ⏳ Stored on this device — syncs automatically when online.
                        </div>
                      )}
                      {inc.description && (
                        <p style={{ fontSize:'13px', color:'#9CA3AF', margin:'0 0 10px', fontFamily:"'DM Sans',sans-serif", lineHeight:1.6 }}>
                          "{inc.description}"
                        </p>
                      )}
                      {(() => {
                        const lat = inc.location?.lat ?? inc.location?.latitude ?? inc.lat;
                        const lng = inc.location?.lng ?? inc.location?.longitude ?? inc.lng;
                        if (!lat) return null;
                        return (
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                            <span style={{ fontSize:'11px', color:'#34D399', fontFamily:'monospace' }}>
                              📍 {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                            </span>
                            <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer"
                              style={{ fontSize:'11px', color:'#60A5FA', textDecoration:'none' }}>
                              Open Maps ↗
                            </a>
                          </div>
                        );
                      })()}
                      {inc.summary && (
                        <p style={{ fontSize:'12px', color:'#8B5CF6', margin:0, fontStyle:'italic', fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}>
                          AI: {inc.summary}
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}