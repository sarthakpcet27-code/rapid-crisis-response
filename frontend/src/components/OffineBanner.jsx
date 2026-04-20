// frontend/src/components/OfflineBanner.jsx
// Slim status bar at top of every page.
// Amber = offline, Blue spinning = syncing, Green = synced, nothing = fully online & clean.

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOfflineSummary } from '../utils/db';
import { subscribe, syncOfflineData } from '../utils/sync-manager';

export default function OfflineBanner() {
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [summary,   setSummary]   = useState({ total:0 });
  const [syncState, setSyncState] = useState(null);
  // syncState shape: { status, message } where status is one of:
  //   'syncing' | 'synced' | 'retrying' | 'failed'

  // ── Track connection ─────────────────────────────────────
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => { setIsOnline(false); setSyncState(null); };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Poll pending summary every 4 seconds ────────────────
  useEffect(() => {
    const refresh = () => getOfflineSummary().then(setSummary);
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  // ── Subscribe to sync events from sync-manager ───────────
  useEffect(() => {
    const unsub = subscribe((data) => {
      setSyncState(data);
      // After "synced", clear the green banner after 4 seconds
      if (data.status === 'synced') {
        setSummary({ total: 0 });
        setTimeout(() => setSyncState(null), 4000);
      }
    });
    return unsub;
  }, []);

  // ── Decide whether to show the banner ────────────────────
  const hasPending  = summary.total > 0;
  const isSyncing   = syncState?.status === 'syncing';
  const isSynced    = syncState?.status === 'synced';
  const isRetrying  = syncState?.status === 'retrying';
  const isFailed    = syncState?.status === 'failed';

  const showBanner  = !isOnline || hasPending || isSyncing || isSynced || isRetrying || isFailed;
  if (!showBanner) return null;

  // ── Pick colour theme ────────────────────────────────────
  const theme = isSynced   ? { color:'#10B981', bg:'rgba(16,185,129,0.12)',  border:'rgba(16,185,129,0.25)'  }
    : isSyncing || isRetrying ? { color:'#3B82F6', bg:'rgba(59,130,246,0.12)',  border:'rgba(59,130,246,0.25)'  }
    : isFailed               ? { color:'#E24B4A', bg:'rgba(226,75,74,0.12)',   border:'rgba(226,75,74,0.25)'   }
    :                          { color:'#F59E0B', bg:'rgba(245,158,11,0.12)',  border:'rgba(245,158,11,0.25)'  };

  const icon = isSynced ? '✅'
    : isSyncing          ? '🔄'
    : isRetrying         ? '⏳'
    : isFailed           ? '❌'
    : '📱';

  const message = syncState?.message
    || (!isOnline
        ? `Offline — SOS & GPS working locally${summary.total > 0 ? ` · ${summary.total} item${summary.total !== 1?'s':''} queued` : ''}`
        : hasPending
          ? `${summary.total} item${summary.total !== 1?'s':''} waiting to sync`
          : '');

  if (!message) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="offline-banner"
        initial={{ height:0, opacity:0 }}
        animate={{ height:'auto', opacity:1 }}
        exit={{ height:0, opacity:0 }}
        transition={{ duration:0.2 }}
        style={{ background:theme.bg, borderBottom:`1px solid ${theme.border}`, overflow:'hidden' }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 20px', gap:'10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0 }}>
            <span style={{ fontSize:'13px', flexShrink:0 }}>{icon}</span>
            <span style={{ fontSize:'12px', color:theme.color, fontFamily:"'DM Sans',sans-serif", fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {message}
            </span>
            {/* Spinning indicator while syncing */}
            {(isSyncing || isRetrying) && (
              <motion.div
                animate={{ rotate:360 }}
                transition={{ duration:1, repeat:Infinity, ease:'linear' }}
                style={{ width:'12px', height:'12px', borderRadius:'50%', border:`2px solid ${theme.color}30`, borderTopColor:theme.color, flexShrink:0 }}
              />
            )}
          </div>

          {/* Manual sync button — only when online and data pending and not already syncing */}
          {isOnline && hasPending && !isSyncing && !isRetrying && (
            <button
              onClick={syncOfflineData}
              style={{ padding:'4px 10px', background:`${theme.color}20`, border:`1px solid ${theme.color}50`, borderRadius:'8px', color:theme.color, fontSize:'11px', fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap', flexShrink:0 }}
            >
              Sync now
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}