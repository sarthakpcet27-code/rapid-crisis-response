// frontend/src/utils/sync-manager.js
// Syncs offline IndexedDB data directly to Firebase when internet returns.
// Uses ES module syntax (import/export) — NOT require() which breaks React.

import { createIncident, sendMessage, updateIncident } from '../firebase';
import {
  getPendingIncidents,
  getPendingLocations,
  getPendingMessages,
  markIncidentSynced,
  markLocationsSynced,
  markMessagesSynced,
  getOfflineSummary,
} from './db';

// ── Singleton state ───────────────────────────────────────────
let isSyncing        = false;
let retryCount       = 0;
let retryTimer       = null;
const MAX_RETRIES    = 5;
const RETRY_DELAY_MS = 30000; // 30 seconds

// ── Listeners list — UI components subscribe here ─────────────
const listeners = new Set();

// Notify all subscribed UI components
const notify = (payload) => {
  listeners.forEach(cb => {
    try { cb(payload); } catch (_) {}
  });
};

// ── Subscribe / unsubscribe ───────────────────────────────────
export const subscribe = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback); // returns unsubscribe fn
};

// ══════════════════════════════════════════════════════════════
// CORE SYNC — sends IndexedDB data to Firebase
// ══════════════════════════════════════════════════════════════
export const syncOfflineData = async () => {
  // Don't double-sync
  if (isSyncing) {
    console.log('[Sync] Already in progress — skipped');
    return;
  }
  if (!navigator.onLine) {
    console.log('[Sync] Still offline — aborted');
    return;
  }

  isSyncing = true;
  retryCount = 0;
  clearTimeout(retryTimer);

  try {
    const summary = await getOfflineSummary();

    if (summary.total === 0) {
      console.log('[Sync] Nothing to sync');
      isSyncing = false;
      return;
    }

    notify({ status: 'syncing', message: `Syncing ${summary.total} items...`, done: 0, total: summary.total });
    console.log(`[Sync] Starting — ${summary.total} items pending`);

    let done = 0;

    // ── Step 1: Sync incidents to Firebase ─────────────────
    const pendingIncidents = await getPendingIncidents();
    console.log(`[Sync] Incidents to sync: ${pendingIncidents.length}`);

    for (const inc of pendingIncidents) {
      try {
        // Strip local-only fields before sending to Firebase
        const {
          id: localId,
          synced,
          syncedAt,
          createdOffline,
          status: _status,
          ...firebaseData
        } = inc;

        // Create in Firebase — returns real Firebase incident ID
        const firebaseId = await createIncident({
          ...firebaseData,
          status:         'active',
          offlineLocalId: localId,
          offlineSynced:  true,
          syncedAt:       Date.now(),
        });

        await markIncidentSynced(localId);
        done++;
        notify({ status: 'syncing', message: `Synced ${done}/${summary.total} items...`, done, total: summary.total });
        console.log(`[Sync] Incident synced: local=${localId} → firebase=${firebaseId}`);

      } catch (err) {
        console.error('[Sync] Incident error:', err);
      }
    }

    // ── Step 2: Sync location trail to Firebase ─────────────
    const pendingLocations = await getPendingLocations();
    if (pendingLocations.length > 0) {
      try {
        // Group location points by their incident ID
        const byIncident = {};
        pendingLocations.forEach(point => {
          if (!byIncident[point.incidentId]) byIncident[point.incidentId] = [];
          byIncident[point.incidentId].push(point);
        });

        for (const [incidentId, points] of Object.entries(byIncident)) {
          await updateIncident(incidentId, {
            offlineLocationTrail: points,
            offlineLocationCount: points.length,
            offlineTrailSynced:   true,
          });
        }

        await markLocationsSynced(pendingLocations.map(l => l.id));
        done += pendingLocations.length;
        notify({ status: 'syncing', message: `Synced locations (${done}/${summary.total})...`, done, total: summary.total });
        console.log(`[Sync] ${pendingLocations.length} location points synced`);

      } catch (err) {
        console.error('[Sync] Locations error:', err);
      }
    }

    // ── Step 3: Sync offline chat messages ──────────────────
    const pendingMessages = await getPendingMessages();
    for (const msg of pendingMessages) {
      try {
        await sendMessage(msg.incidentId, msg.text, msg.sender);
        done++;
      } catch (err) {
        console.error('[Sync] Message error:', err);
      }
    }
    if (pendingMessages.length > 0) {
      await markMessagesSynced(pendingMessages.map(m => m.id));
    }

    // ── All done ────────────────────────────────────────────
    console.log(`[Sync] ✅ Complete — ${done} items synced`);
    notify({ status: 'synced', message: `✅ ${done} item${done !== 1 ? 's' : ''} synced`, done, total: summary.total });

  } catch (err) {
    console.error('[Sync] Fatal error:', err);
    scheduleRetry();

  } finally {
    isSyncing = false;
  }
};

// ── Retry with delay ──────────────────────────────────────────
const scheduleRetry = () => {
  retryCount++;
  if (retryCount > MAX_RETRIES) {
    notify({ status: 'failed', message: 'Sync failed — will retry when online', retries: retryCount });
    console.error(`[Sync] Max retries (${MAX_RETRIES}) exceeded`);
    return;
  }
  const delay = retryCount * RETRY_DELAY_MS;
  console.log(`[Sync] Retry ${retryCount}/${MAX_RETRIES} in ${delay / 1000}s`);
  notify({ status: 'retrying', message: `Retrying in ${delay / 1000}s... (${retryCount}/${MAX_RETRIES})`, retryIn: delay });

  retryTimer = setTimeout(() => {
    if (navigator.onLine) syncOfflineData();
  }, delay);
};

// ══════════════════════════════════════════════════════════════
// AUTO-SYNC LISTENER — call once from App.js
// ══════════════════════════════════════════════════════════════
export const startSyncListener = () => {
  // Fire sync whenever internet is restored
  window.addEventListener('online', () => {
    console.log('[Sync] 🌐 Internet restored — auto-sync starting in 1.5s');
    // Small delay so connection stabilises before Firebase calls
    setTimeout(syncOfflineData, 1500);
  });

  // On load: if online and there's pending data, sync now
  if (navigator.onLine) {
    getOfflineSummary().then(s => {
      if (s.total > 0) {
        console.log(`[Sync] Pending data on load (${s.total} items) — syncing in 3s`);
        setTimeout(syncOfflineData, 3000);
      }
    });
  }

  // Listen for service worker background sync message
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'BACKGROUND_SYNC_TRIGGERED') {
        syncOfflineData();
      }
    });
  }

  console.log('[Sync] Auto-sync listener active');
};

export const registerBackgroundSync = async () => {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('respondai-offline-sync');
  } catch (_) {}
};