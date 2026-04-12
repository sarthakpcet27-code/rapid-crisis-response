import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, push, onValue, update } from "firebase/database";

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCwvJX7NiL64VLB7gkdpckPcVgfp67w0Xs",
  authDomain:        "rapid-crisis-response.firebaseapp.com",
  databaseURL:       "https://rapid-crisis-response-default-rtdb.firebaseio.com",
  projectId:         "rapid-crisis-response",
  storageBucket:     "rapid-crisis-response.firebasestorage.app",
  messagingSenderId: "411234284723",
  appId:             "1:411234284723:web:4d8f4af2ec1f605e20acc6"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// ── Create a new incident ─────────────────────────────────────────
export const createIncident = async (data) => {
  const incRef = ref(db, 'incidents');
  const newRef = push(incRef);
  await set(newRef, {
    ...data,
    id:         newRef.key,
    status:     'active',
    severity:   'pending',
    created_at: Date.now(),
  });
  return newRef.key;
};

// ── Listen to ALL incidents (dashboard) ──────────────────────────
export const listenToIncidents = (callback) => {
  const incRef = ref(db, 'incidents');
  const unsubscribe = onValue(incRef, (snap) => {
    const val = snap.val();
    callback(val ? Object.values(val) : []);
  });
  return unsubscribe;
};

// ── Listen to ONE incident (guest confirm screen chat) ────────────
// CRITICAL: must return unsubscribe so caller can clean up
export const listenToIncident = (id, cb) => {
  const incidentRef = ref(db, `incidents/${id}`);
  const unsubscribe = onValue(incidentRef, (snap) => cb(snap.val()));
  return unsubscribe;   // ← caller does: const unsub = listenToIncident(...); return unsub;
};

// ── Send a chat message ───────────────────────────────────────────
// sender = 'guest' or 'staff'
export const sendMessage = (incidentId, text, sender) =>
  push(ref(db, `incidents/${incidentId}/chat`), {
    text,
    sender,
    time: Date.now(),
  });

// ── Update incident fields (severity, sop, status, etc.) ─────────
export const updateIncident = (id, data) =>
  update(ref(db, `incidents/${id}`), data);