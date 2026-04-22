// frontend/src/utils/db.js
const DB_NAME = 'RespondAI_OfflineDB';
const DB_VERSION = 1;
let _db = null;

const uid = () =>
  'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const initDB = () => {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    console.log('[DB] Opening IndexedDB...');
    if (!window.indexedDB) { reject(new Error('IndexedDB not available')); return; }

    const timeout = setTimeout(() => reject(new Error('IndexedDB open timeout')), 5000);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => { clearTimeout(timeout); reject(req.error); };
    req.onsuccess = () => { clearTimeout(timeout); _db = req.result; console.log('[DB] ✅ Opened'); resolve(_db); };
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('incidents')) {
        const s = db.createObjectStore('incidents', { keyPath:'id' });
        s.createIndex('guestUid',   'guestUid',   { unique:false });
        s.createIndex('syncStatus', 'syncStatus', { unique:false });
      }
      if (!db.objectStoreNames.contains('locations')) {
        const s = db.createObjectStore('locations', { keyPath:'id' });
        s.createIndex('incidentId', 'incidentId', { unique:false });
        s.createIndex('syncStatus', 'syncStatus', { unique:false });
      }
      if (!db.objectStoreNames.contains('messages')) {
        const s = db.createObjectStore('messages', { keyPath:'id' });
        s.createIndex('incidentId', 'incidentId', { unique:false });
        s.createIndex('syncStatus', 'syncStatus', { unique:false });
      }
      console.log('[DB] ✅ Schema upgraded');
    };
  });
};

const runRequest = (req, label = 'IDB', ms = 5000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    req.onerror   = () => { clearTimeout(t); reject(req.error); };
    req.onsuccess = () => { clearTimeout(t); resolve(req.result); };
  });

// ── INCIDENTS ─────────────────────────────────────────────────

export const saveOfflineIncident = async (data) => {
  console.log('[DB] Saving offline incident:', data.crisisType);
  const incident = { id:uid(), ...data, syncStatus:'pending', synced:false, createdOffline:true, created_at:Date.now() };
  try {
    const db = await initDB();
    const tx = db.transaction('incidents', 'readwrite');
    await runRequest(tx.objectStore('incidents').add(incident), `add-incident-${incident.id}`);
    console.log('[DB] ✅ Saved:', incident.id);
    return incident;
  } catch (err) { console.error('[DB] ❌ saveOfflineIncident:', err.message); throw err; }
};

export const getPendingIncidents = async () => {
  try {
    const db  = await initDB();
    const tx  = db.transaction('incidents', 'readonly');
    const all = await runRequest(tx.objectStore('incidents').getAll(), 'getAll-incidents') || [];
    const pending = all.filter(i => i.syncStatus !== 'synced');
    console.log(`[DB] Pending incidents: ${pending.length}/${all.length}`);
    return pending;
  } catch (err) { console.error('[DB] ❌ getPendingIncidents:', err.message); return []; }
};

export const markIncidentSynced = async (id) => {
  try {
    const db    = await initDB();
    const tx    = db.transaction('incidents', 'readwrite');
    const store = tx.objectStore('incidents');
    const item  = await runRequest(store.get(id), `get-incident-${id}`);
    if (item) { item.syncStatus='synced'; item.syncedAt=Date.now(); item.synced=true; await runRequest(store.put(item), `put-incident-${id}`); }
    console.log('[DB] ✅ markIncidentSynced:', id);
  } catch (err) { console.error('[DB] ❌ markIncidentSynced:', err.message); }
};

export const getMyOfflineIncidents = async (guestUid) => {
  try {
    const db  = await initDB();
    const tx  = db.transaction('incidents', 'readonly');
    const all = await runRequest(tx.objectStore('incidents').getAll(), 'getAll-mine') || [];
    return all.filter(i => i.guestUid === guestUid).sort((a, b) => b.created_at - a.created_at);
  } catch (err) { console.error('[DB] ❌ getMyOfflineIncidents:', err.message); return []; }
};

// ── LOCATIONS ─────────────────────────────────────────────────

export const saveOfflineLocation = async (incidentId, lat, lng, accuracy = 0) => {
  const point = { id:uid(), incidentId, lat, lng, accuracy, timestamp:Date.now(), syncStatus:'pending' };
  try {
    const db = await initDB();
    const tx = db.transaction('locations', 'readwrite');
    await runRequest(tx.objectStore('locations').add(point), 'add-location');
    return point;
  } catch (err) { console.error('[DB] ❌ saveOfflineLocation:', err.message); return null; }
};

export const getPendingLocations = async () => {
  try {
    const db  = await initDB();
    const tx  = db.transaction('locations', 'readonly');
    const all = await runRequest(tx.objectStore('locations').getAll(), 'getAll-locations') || [];
    return all.filter(l => l.syncStatus !== 'synced');
  } catch (err) { return []; }
};

export const markLocationsSynced = async (ids) => {
  if (!ids?.length) return;
  try {
    const db    = await initDB();
    const tx    = db.transaction('locations', 'readwrite');
    const store = tx.objectStore('locations');
    const all   = await runRequest(store.getAll(), 'getAll-locs-sync') || [];
    await Promise.all(all.filter(l => ids.includes(l.id)).map(l => { l.syncStatus='synced'; return runRequest(store.put(l), `put-loc-${l.id}`); }));
  } catch (err) { console.error('[DB] ❌ markLocationsSynced:', err.message); }
};

// ── MESSAGES ──────────────────────────────────────────────────

export const saveOfflineMessage = async (incidentId, text, sender) => {
  const msg = { id:uid(), incidentId, text, sender, time:Date.now(), syncStatus:'pending' };
  try {
    const db = await initDB();
    const tx = db.transaction('messages', 'readwrite');
    await runRequest(tx.objectStore('messages').add(msg), 'add-message');
    return msg;
  } catch (err) { console.error('[DB] ❌ saveOfflineMessage:', err.message); return null; }
};

export const getPendingMessages = async () => {
  try {
    const db  = await initDB();
    const tx  = db.transaction('messages', 'readonly');
    const all = await runRequest(tx.objectStore('messages').getAll(), 'getAll-messages') || [];
    return all.filter(m => m.syncStatus !== 'synced');
  } catch (err) { return []; }
};

export const markMessagesSynced = async (ids) => {
  if (!ids?.length) return;
  try {
    const db    = await initDB();
    const tx    = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const all   = await runRequest(store.getAll(), 'getAll-msgs-sync') || [];
    await Promise.all(all.filter(m => ids.includes(m.id)).map(m => { m.syncStatus='synced'; return runRequest(store.put(m), `put-msg-${m.id}`); }));
  } catch (err) { console.error('[DB] ❌ markMessagesSynced:', err.message); }
};

// ── SUMMARY ───────────────────────────────────────────────────

export const getOfflineSummary = async () => {
  try {
    const [inc, loc, msg] = await Promise.all([getPendingIncidents(), getPendingLocations(), getPendingMessages()]);
    return { pendingIncidents:inc.length, pendingLocations:loc.length, pendingMessages:msg.length, total:inc.length+loc.length+msg.length };
  } catch (err) { return { pendingIncidents:0, pendingLocations:0, pendingMessages:0, total:0 }; }
};