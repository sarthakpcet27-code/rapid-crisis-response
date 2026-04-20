// frontend/src/pages/SOSHistoryPage.jsx — mobile-responsive

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { auth, listenToMyIncidents } from '../firebase';
import { getMyOfflineIncidents } from '../utils/db';
import { useMobile } from '../utils/useMobile';

const CRISIS_ICONS = { fire: '🔥', medical: '🏥', security: '🔒', flood: '🌊', other: '⚠️' };
const SEV = {
  RED: { bg: 'rgba(226,75,74,0.15)', color: '#F87171', border: 'rgba(226,75,74,0.3)', label: 'RED' },
  YELLOW: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: 'rgba(245,158,11,0.3)', label: 'YELLOW' },
  GREEN: { bg: 'rgba(16,185,129,0.15)', color: '#34D399', border: 'rgba(16,185,129,0.3)', label: 'GREEN' },
  pending: { bg: 'rgba(107,114,128,0.15)', color: '#9CA3AF', border: 'rgba(107,114,128,0.3)', label: 'pending' },
  pending_offline: { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: 'rgba(245,158,11,0.3)', label: '⏳ Pending' },
  synced_offline: { bg: 'rgba(16,185,129,0.15)', color: '#34D399', border: 'rgba(16,185,129,0.3)', label: '✓ Synced' },
};
const TYPE_FILTERS = ['All', 'fire', 'medical', 'security', 'flood', 'other'];
const STATUS_FILTERS = ['All', 'active', 'resolved', 'acknowledged', 'pending_offline'];

export default function SOSHistoryPage() {
  const isMobile = useMobile();
  const [firebaseInc, setFirebaseInc] = useState([]);
  const [offlineInc, setOfflineInc] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = listenToMyIncidents((data) => { setFirebaseInc(data); setLoading(false); });
    return () => typeof unsub === 'function' && unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try { setOfflineInc(await getMyOfflineIncidents(user.uid)); } catch { setOfflineInc([]); }
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [user]);

  const syncedLocalIds = new Set(firebaseInc.map(i => i.offlineLocalId).filter(Boolean));
  const pendingOffline = offlineInc.filter(i => !syncedLocalIds.has(i.id)).map(i => ({ ...i, _source: 'offline' }));
  const allIncidents = [...firebaseInc.map(i => ({ ...i, _source: 'firebase' })), ...pendingOffline].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  const filtered = allIncidents.filter(inc => {
    const tm = typeFilter === 'All' || inc.crisisType?.toLowerCase() === typeFilter;
    const sm = statusFilter === 'All' || inc.status?.toLowerCase() === statusFilter || (statusFilter === 'pending_offline' && inc._source === 'offline');
    return tm && sm;
  });

  const getBadge = (inc) => inc._source === 'offline' ? SEV.pending_offline : (SEV[inc.severity] || SEV.pending);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #2A2A3A', borderTopColor: '#E24B4A' }} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0F', padding: isMobile ? '16px' : '20px' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>

        {/* Header */}
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ marginBottom: '16px' }}>
          <h1 style={{ fontFamily: "'Bebas Neue',cursive", fontSize: isMobile ? '26px' : '30px', letterSpacing: '2px', color: '#fff', margin: '0 0 4px' }}>
            SOS <span style={{ color: '#E24B4A' }}>History</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <p style={{ color: '#6B7280', fontSize: '13px', margin: 0, fontFamily: "'DM Sans',sans-serif" }}>
              {filtered.length} of {allIncidents.length} incidents
            </p>
            {pendingOffline.length > 0 && (
              <span style={{ fontSize: '11px', background: 'rgba(245,158,11,0.15)', color: '#FCD34D', padding: '1px 8px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.3)' }}>
                ⏳ {pendingOffline.length} offline
              </span>
            )}
          </div>
        </motion.div>

        {/* Type filter — horizontal scroll on mobile */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '8px', scrollbarWidth: 'none' }}>
          {TYPE_FILTERS.map(f => (
            <button key={f} onClick={() => setTypeFilter(f)} style={{
              padding: '7px 13px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 500, fontFamily: "'DM Sans',sans-serif",
              whiteSpace: 'nowrap', minHeight: '36px', flexShrink: 0,
              background: typeFilter === f ? '#E24B4A' : 'rgba(255,255,255,0.05)',
              color: typeFilter === f ? '#fff' : '#6B7280',
            }}>
              {f === 'All' ? 'All' : `${CRISIS_ICONS[f] || ''} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
            </button>
          ))}
        </div>

        {/* Status filter — horizontal scroll on mobile */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px', scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} style={{
              padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer', fontSize: '11px', fontFamily: "'DM Sans',sans-serif",
              whiteSpace: 'nowrap', minHeight: '36px', flexShrink: 0,
              background: statusFilter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: statusFilter === f ? '#E5E7EB' : '#4B5563',
            }}>
              {f === 'All' ? 'All' : f === 'pending_offline' ? '⏳ Offline' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>📋</div>
            <p style={{ fontSize: '14px', margin: '0 0 6px', color: '#6B7280', fontFamily: "'DM Sans',sans-serif" }}>No incidents found</p>
            <p style={{ fontSize: '12px', margin: 0, color: '#2A2A3A', fontFamily: "'DM Sans',sans-serif" }}>Send an SOS to see your history here</p>
          </div>
        ) : filtered.map((inc, idx) => {
          const badge = getBadge(inc);
          const isOpen = selected === (inc.id || `offline-${idx}`);
          const time = inc.created_at ? new Date(inc.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
          const incKey = inc.id || `offline-${idx}`;

          return (
            <motion.div key={incKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }}>
              <div onClick={() => setSelected(isOpen ? null : incKey)} style={{
                background: 'rgba(26,26,38,0.8)',
                border: `1px solid ${isOpen ? 'rgba(226,75,74,0.35)' : 'rgba(255,255,255,0.06)'}`,
                borderLeft: `3px solid ${badge.color}`,
                borderRadius: '14px', padding: isMobile ? '13px' : '14px',
                marginBottom: '10px', cursor: 'pointer',
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{CRISIS_ICONS[inc.crisisType] || '⚠️'}</span>
                    <span style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: 500, color: '#E5E7EB', fontFamily: "'DM Sans',sans-serif" }}>
                      {(inc.crisisType || 'Unknown').toUpperCase()}
                    </span>
                    {inc._source === 'offline' && (
                      <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '1px 6px', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.25)', flexShrink: 0 }}>offline</span>
                    )}
                    {inc.silentAlert && (
                      <span style={{ fontSize: '10px', background: 'rgba(139,92,246,0.15)', color: '#C4B5FD', padding: '1px 6px', borderRadius: '5px', border: '1px solid rgba(139,92,246,0.3)', flexShrink: 0 }}>SILENT</span>
                    )}
                  </div>
                  <span style={{ padding: '2px 9px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0, marginLeft: '8px' }}>
                    {badge.label}
                  </span>
                </div>

                {/* Bottom row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[inc.floor && `Floor ${inc.floor}`, inc.room && `Room ${inc.room}`].filter(Boolean).join(' · ') || 'No location'} · {time}
                  </span>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '6px', fontFamily: "'DM Sans',sans-serif", flexShrink: 0,
                    background: inc._source === 'offline' ? 'rgba(245,158,11,0.08)' : ['resolved', 'acknowledged'].includes(inc.status) ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.08)',
                    color: inc._source === 'offline' ? '#F59E0B' : ['resolved', 'acknowledged'].includes(inc.status) ? '#34D399' : '#6B7280',
                  }}>
                    {inc._source === 'offline' ? 'pending' : (inc.status || 'active')}
                  </span>
                </div>

                {/* Expanded */}
                {isOpen && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {inc._source === 'offline' && (
                      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: '#FCD34D', lineHeight: 1.5 }}>
                        ⏳ Stored on device — will automatically sync when internet returns.
                      </div>
                    )}
                    {inc.description && <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '0 0 10px', lineHeight: 1.6 }}>"{inc.description}"</p>}
                    {(() => {
                      const lat = inc.location?.lat ?? inc.location?.latitude ?? inc.lat;
                      const lng = inc.location?.lng ?? inc.location?.longitude ?? inc.lng;
                      if (!lat) return null;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: '#34D399', fontFamily: 'monospace' }}>📍 {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</span>
                          <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#60A5FA', textDecoration: 'none', padding: '4px 10px', background: 'rgba(96,165,250,0.1)', borderRadius: '6px', border: '1px solid rgba(96,165,250,0.2)' }}>Open Maps ↗</a>
                        </div>
                      );
                    })()}
                    {inc.summary && <p style={{ fontSize: '12px', color: '#8B5CF6', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>AI: {inc.summary}</p>}
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      <style>{`div::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}