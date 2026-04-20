// frontend/src/utils/db.js
// Reliable IndexedDB wrapper for offline SOS storage.
// Every function has: try-catch, timeout safety, console logs for debugging.

const DB_NAME    = 'RespondAI_OfflineDB';
const DB_VERSION = 1;

// ── Singleton DB connection ───────────────────────────────────
let _db = null;

// Generate simple unique ID — no external library needed
const uid = () =>
  'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ── Open (or reuse) IndexedDB connection ─────────────────────
export const initDB = () => {
  // Reuse existing connection
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    console.log('[DB] Opening IndexedDB...');

    // Timeout: if IndexedDB never responds in 4 seconds, fail fast
    const timeout = setTimeout(() => {
      console.error('[DB] ❌ IndexedDB open timed out');
      reject(new Error('IndexedDB open timeout'));
    }, 4000);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => {
      clearTimeout(timeout);
      console.error('[DB] ❌ Failed to open:', req.error);
      reject(req.error);
    };

    req.onsuccess = () => {
      clearTimeout(timeout);
      _db = req.result;
      console.log('[DB] ✅ Opened successfully');
      resolve(_db);
    };

    req.onupgradeneeded = (event) => {
      console.log('[DB] Upgrading schema...');
      const database = event.target.result;

      // Incidents store
      if (!database.objectStoreNames.contains('incidents')) {
        const store = database.createObjectStore('incidents', { keyPath: 'id' });
        store.createIndex('guestUid',   'guestUid',   { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        console.log('[DB] ✅ incidents store created');
      }

      // Locations store
      if (!database.objectStoreNames.contains('locations')) {
        const store = database.createObjectStore('locations', { keyPath: 'id' });
        store.createIndex('incidentId', 'incidentId', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        console.log('[DB] ✅ locations store created');
      }

      // Messages store
      if (!database.objectStoreNames.contains('messages')) {
        const store = database.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('incidentId', 'incidentId', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        console.log('[DB] ✅ messages store created');
      }
    };
  });
};

// ── Generic: run a single IDBRequest with timeout ─────────────
// Returns a Promise that resolves with request.result
const runRequest = (req, label = 'IDB request', timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      console.error(`[DB] ❌ Timeout: ${label}`);
      reject(new Error(`Timeout: ${label}`));
    }, timeoutMs);

    req.onerror = () => {
      clearTimeout(t);
      console.error(`[DB] ❌ Error ${label}:`, req.error);
      reject(req.error);
    };

    req.onsuccess = () => {
      clearTimeout(t);
      resolve(req.result);
    };
  });

// ══════════════════════════════════════════════════════════════
// INCIDENTS
// ══════════════════════════════════════════════════════════════

// Save offline SOS incident to IndexedDB
// Returns the saved incident object (with generated id)
export const saveOfflineIncident = async (data) => {
  console.log('[DB] Saving offline incident...');

  const incident = {
    id:              uid(),
    ...data,
    syncStatus:      'pending',   // 'pending' | 'syncing' | 'synced' | 'failed'
    syncAttempts:    0,
    synced:          false,
    createdOffline:  true,
    created_at:      Date.now(),
  };

  try {
    const database = await initDB();
    const tx       = database.transaction('incidents', 'readwrite');
    const store    = tx.objectStore('incidents');

    await runRequest(store.add(incident), `add incident ${incident.id}`);
    console.log('[DB] ✅ Incident saved:', incident.id);
    return incident;

  } catch (err) {
    console.error('[DB] ❌ saveOfflineIncident failed:', err);
    throw err; // let caller handle it
  }
};

// Get all incidents with syncStatus !== 'synced'
export const getPendingIncidents = async () => {
  try {
    const database = await initDB();
    const tx       = database.transaction('incidents', 'readonly');
    const store    = tx.objectStore('incidents');
    const all      = await runRequest(store.getAll(), 'getAll incidents');
    const pending  = (all || []).filter(i => i.syncStatus !== 'synced');
    console.log(`[DB] Pending incidents: ${pending.length}`);
    return pending;
  } catch (err) {
    console.error('[DB] ❌ getPendingIncidents failed:', err);
    return []; // never throw — caller just gets empty array
  }
};

// Mark an incident as synced
export const markIncidentSynced = async (id) => {
  try {
    const database = await initDB();
    const tx       = database.transaction('incidents', 'readwrite');
    const store    = tx.objectStore('incidents');
    const existing = await runRequest(store.get(id), `get incident ${id}`);
    if (existing) {
      existing.syncStatus = 'synced';
      existing.syncedAt   = Date.now();
      existing.synced     = true;
      await runRequest(store.put(existing), `put incident ${id}`);
      console.log('[DB] ✅ Incident marked synced:', id);
    }
  } catch (err) {
    console.error('[DB] ❌ markIncidentSynced failed:', err);
  }
};

// Get ALL incidents for a specific user (for SOS history page)
export const getMyOfflineIncidents = async (guestUid) => {
  try {
    const database = await initDB();
    const tx       = database.transaction('incidents', 'readonly');
    const store    = tx.objectStore('incidents');
    const all      = await runRequest(store.getAll(), 'getAll for user');
    return (all || [])
      .filter(i => i.guestUid === guestUid)
      .sort((a, b) => b.created_at - a.created_at);
  } catch (err) {
    console.error('[DB] ❌ getMyOfflineIncidents failed:', err);
    return [];
  }
};

// ══════════════════════════════════════════════════════════════
// LOCATIONS (GPS trail)
// ══════════════════════════════════════════════════════════════

export const saveOfflineLocation = async (incidentId, lat, lng, accuracy = 0) => {
  const point = {
    id: uid(), incidentId,
    lat, lng, accuracy,
    timestamp:  Date.now(),
    syncStatus: 'pending',
  };
  try {
    const database = await initDB();
    const tx       = database.transaction('locations', 'readwrite');
    const store    = tx.objectStore('locations');
    await runRequest(store.add(point), 'add location');
    return point;
  } catch (err) {
    console.error('[DB] ❌ saveOfflineLocation failed:', err);
    return null; // GPS save failure is non-fatal
  }
};

export const getPendingLocations = async () => {
  try {
    const database = await initDB();
    const tx       = database.transaction('locations', 'readonly');
    const store    = tx.objectStore('locations');
    const all      = await runRequest(store.getAll(), 'getAll locations');
    return (all || []).filter(l => l.syncStatus !== 'synced');
  } catch (err) {
    console.error('[DB] ❌ getPendingLocations failed:', err);
    return [];
  }
};

export const markLocationsSynced = async (ids) => {
  if (!ids || ids.length === 0) return;
  try {
    const database = await initDB();
    const tx       = database.transaction('locations', 'readwrite');
    const store    = tx.objectStore('locations');
    const all      = await runRequest(store.getAll(), 'getAll locs for sync');
    await Promise.all(
      (all || []).filter(l => ids.includes(l.id)).map(l => {
        l.syncStatus = 'synced';
        l.syncedAt   = Date.now();
        return runRequest(store.put(l), `put loc ${l.id}`);
      })
    );
  } catch (err) {
    console.error('[DB] ❌ markLocationsSynced failed:', err);
  }
};

// ══════════════════════════════════════════════════════════════
// MESSAGES
// ══════════════════════════════════════════════════════════════

export const saveOfflineMessage = async (incidentId, text, sender) => {
  const msg = { id:uid(), incidentId, text, sender, time:Date.now(), syncStatus:'pending' };
  try {
    const database = await initDB();
    const tx       = database.transaction('messages', 'readwrite');
    const store    = tx.objectStore('messages');
    await runRequest(store.add(msg), 'add message');
    return msg;
  } catch (err) {
    console.error('[DB] ❌ saveOfflineMessage failed:', err);
    return null;
  }
};

export const getPendingMessages = async () => {
  try {
    const database = await initDB();
    const tx       = database.transaction('messages', 'readonly');
    const store    = tx.objectStore('messages');
    const all      = await runRequest(store.getAll(), 'getAll messages');
    return (all || []).filter(m => m.syncStatus !== 'synced');
  } catch (err) {
    return [];
  }
};

export const markMessagesSynced = async (ids) => {
  if (!ids || ids.length === 0) return;
  try {
    const database = await initDB();
    const tx       = database.transaction('messages', 'readwrite');
    const store    = tx.objectStore('messages');
    const all      = await runRequest(store.getAll(), 'getAll msgs for sync');
    await Promise.all(
      (all || []).filter(m => ids.includes(m.id)).map(m => {
        m.syncStatus = 'synced';
        return runRequest(store.put(m), `put msg ${m.id}`);
      })
    );
  } catch (err) {
    console.error('[DB] ❌ markMessagesSynced failed:', err);
  }
};

// ══════════════════════════════════════════════════════════════
// SUMMARY (used by OfflineBanner)
// ══════════════════════════════════════════════════════════════

export const getOfflineSummary = async () => {
  try {
    const [inc, loc, msg] = await Promise.all([
      getPendingIncidents(),
      getPendingLocations(),
      getPendingMessages(),
    ]);
    return {
      pendingIncidents: inc.length,
      pendingLocations: loc.length,
      pendingMessages:  msg.length,
      total:            inc.length + loc.length + msg.length,
    };
  } catch (err) {
    console.error('[DB] ❌ getOfflineSummary failed:', err);
    return { pendingIncidents:0, pendingLocations:0, pendingMessages:0, total:0 };
  }
};