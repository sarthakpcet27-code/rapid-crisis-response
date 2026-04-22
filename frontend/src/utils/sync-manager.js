// frontend/src/utils/sync-manager.js
// KEY FIX: waits for Firebase Auth to restore before attempting any sync.
// On Vercel, auth.currentUser is null for 0-2 seconds after page load.
// Syncing before auth resolves = incidents written with guestUid:null = lost.

import { auth, createIncident, sendMessage, updateIncident } from '../firebase';
import {
  getPendingIncidents,
  getPendingLocations,
  getPendingMessages,
  markIncidentSynced,
  markLocationsSynced,
  markMessagesSynced,
  getOfflineSummary,
} from './db';

// ── Listener registry for UI components ──────────────────────
const listeners = new Set();
export const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const notify = (payload) => listeners.forEach(cb => { try { cb(payload); } catch(_) {} });

// ── State ─────────────────────────────────────────────────────
let isSyncing    = false;
let retryTimer   = null;
let retryCount   = 0;
const MAX_RETRY  = 5;
const RETRY_BASE = 15000; // 15s first retry, then 30s, 45s…

// ── Wait for Firebase Auth to restore session ─────────────────
// This is the critical fix: on Vercel the page loads, the online event
// fires, but auth.currentUser is still null for up to 2 seconds while
// Firebase re-establishes the session from localStorage/IndexedDB.
const waitForAuth = (timeoutMs = 8000) =>
  new Promise((resolve) => {
    // If user is already signed in — resolve immediately
    if (auth.currentUser) {
      console.log('[Sync] Auth already ready:', auth.currentUser.uid);
      resolve(auth.currentUser);
      return;
    }

    console.log('[Sync] Waiting for auth to restore...');
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      console.log('[Sync] Auth restored:', user?.uid || 'no user');
      resolve(user); // resolves with null if not logged in
    });

    // Safety: don't wait forever
    setTimeout(() => {
      unsubscribe();
      console.warn('[Sync] Auth wait timed out — proceeding without user');
      resolve(null);
    }, timeoutMs);
  });

// ══════════════════════════════════════════════════════════════
// MAIN SYNC FUNCTION
// ══════════════════════════════════════════════════════════════
export const syncOfflineData = async () => {
  if (isSyncing) {
    console.log('[Sync] Already in progress — skipped');
    return;
  }
  if (!navigator.onLine) {
    console.log('[Sync] Still offline — aborted');
    return;
  }

  // ── CRITICAL: wait for auth before doing anything ────────
  const user = await waitForAuth();
  if (!user) {
    console.warn('[Sync] No authenticated user — cannot sync. Will retry when auth resolves.');
    // Set up one-time auth listener to retry when user signs in
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) { unsub(); setTimeout(syncOfflineData, 1000); }
    });
    return;
  }

  isSyncing = true;
  retryCount = 0;
  clearTimeout(retryTimer);

  try {
    const summary = await getOfflineSummary();
    console.log('[Sync] Summary:', summary);

    if (summary.total === 0) {
      console.log('[Sync] Nothing pending — done');
      isSyncing = false;
      return;
    }

    notify({ status:'syncing', message:`Syncing ${summary.total} items...`, done:0, total:summary.total });

    let done = 0;

    // ── 1. Sync incidents ──────────────────────────────────
    const pending = await getPendingIncidents();
    console.log(`[Sync] Incidents to sync: ${pending.length}`);

    for (const inc of pending) {
      try {
        // Strip local-only fields
        const { id:localId, syncStatus, synced, syncedAt, createdOffline, status:_s, ...firebaseData } = inc;

        // Ensure guestUid is stamped with current logged-in user
        // (it may already be set if saved correctly, but this is a safety net)
        const dataToSend = {
          ...firebaseData,
          guestUid:      firebaseData.guestUid   || user.uid,
          guestName:     firebaseData.guestName  || user.displayName || 'Unknown',
          guestEmail:    firebaseData.guestEmail || user.email || null,
          status:        'active',
          offlineLocalId: localId,
          offlineSynced:  true,
          syncedAt:       Date.now(),
        };

        console.log('[Sync] Sending incident to Firebase:', localId, dataToSend);
        const firebaseId = await createIncident(dataToSend);
        console.log('[Sync] ✅ Incident created in Firebase:', firebaseId);

        await markIncidentSynced(localId);
        done++;
        notify({ status:'syncing', message:`Synced ${done}/${summary.total}...`, done, total:summary.total });

      } catch (err) {
        console.error('[Sync] ❌ Incident sync failed:', err.message, err);
        // Don't throw — try to sync remaining incidents
      }
    }

    // ── 2. Sync location trail ─────────────────────────────
    const locs = await getPendingLocations();
    if (locs.length > 0) {
      try {
        const byIncident = {};
        locs.forEach(l => {
          if (!byIncident[l.incidentId]) byIncident[l.incidentId] = [];
          byIncident[l.incidentId].push(l);
        });
        for (const [incidentId, points] of Object.entries(byIncident)) {
          await updateIncident(incidentId, {
            offlineLocationTrail: points,
            offlineLocationCount: points.length,
            offlineTrailSynced:   true,
          });
        }
        await markLocationsSynced(locs.map(l => l.id));
        done += locs.length;
        console.log(`[Sync] ✅ ${locs.length} location points synced`);
      } catch (err) {
        console.error('[Sync] ❌ Location sync failed:', err.message);
      }
    }

    // ── 3. Sync messages ───────────────────────────────────
    const msgs = await getPendingMessages();
    for (const msg of msgs) {
      try {
        await sendMessage(msg.incidentId, msg.text, msg.sender);
        done++;
      } catch (err) {
        console.error('[Sync] ❌ Message sync failed:', err.message);
      }
    }
    if (msgs.length > 0) await markMessagesSynced(msgs.map(m => m.id));

    // ── Done ───────────────────────────────────────────────
    console.log(`[Sync] ✅ Complete — ${done} items synced`);
    notify({ status:'synced', message:`✅ ${done} item${done !== 1 ? 's' : ''} synced`, done, total:summary.total });

  } catch (err) {
    console.error('[Sync] ❌ Fatal error:', err.message, err);
    scheduleRetry();
  } finally {
    isSyncing = false;
  }
};

// ── Retry with backoff ────────────────────────────────────────
const scheduleRetry = () => {
  retryCount++;
  if (retryCount > MAX_RETRY) {
    notify({ status:'failed', message:'Sync failed — will retry when online' });
    return;
  }
  const delay = retryCount * RETRY_BASE;
  console.log(`[Sync] Retry ${retryCount}/${MAX_RETRY} in ${delay / 1000}s`);
  notify({ status:'retrying', message:`Retrying in ${Math.round(delay/1000)}s... (${retryCount}/${MAX_RETRY})`, retryIn:delay });
  retryTimer = setTimeout(() => { if (navigator.onLine) syncOfflineData(); }, delay);
};

// ══════════════════════════════════════════════════════════════
// AUTO-SYNC LISTENER — called once from App.js
// ══════════════════════════════════════════════════════════════
export const startSyncListener = () => {
  // Sync when internet is restored
  window.addEventListener('online', () => {
    console.log('[Sync] 🌐 Internet restored');
    // Delay 2s to let Firebase reconnect before we try to write
    setTimeout(syncOfflineData, 2000);
  });

  // On load: if online and there's pending data, sync after auth settles
  if (navigator.onLine) {
    // Wait 4s on page load — gives Firebase time to restore auth session
    // (especially important on Vercel where cold starts happen)
    setTimeout(async () => {
      const summary = await getOfflineSummary();
      if (summary.total > 0) {
        console.log(`[Sync] Found ${summary.total} pending items on load — syncing`);
        syncOfflineData();
      }
    }, 4000);
  }

  // Listen for service worker background sync
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'BACKGROUND_SYNC_TRIGGERED') syncOfflineData();
    });
  }

  // Also sync whenever auth state changes to a logged-in user
  // (covers case: user was logged out when offline, logs in when online)
  auth.onAuthStateChanged((user) => {
    if (user && navigator.onLine) {
      setTimeout(async () => {
        const summary = await getOfflineSummary();
        if (summary.total > 0) {
          console.log('[Sync] Auth resolved with pending data — syncing');
          syncOfflineData();
        }
      }, 1000);
    }
  });

  console.log('[Sync] ✅ Auto-sync listener active');
};

export const registerBackgroundSync = async () => {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('respondai-offline-sync');
  } catch (_) {}
};