import { initializeApp }   from "firebase/app";
import {
  getDatabase, ref, set, push, onValue, update, get,
  query, orderByChild, equalTo,
} from "firebase/database";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyCwvJX7NiL64VLB7gkdpckPcVgfp67w0Xs",
  authDomain:        "rapid-crisis-response.firebaseapp.com",
  databaseURL:       "https://rapid-crisis-response-default-rtdb.firebaseio.com",
  projectId:         "rapid-crisis-response",
  storageBucket:     "rapid-crisis-response.firebasestorage.app",
  messagingSenderId: "411234284723",
  appId:             "1:411234284723:web:4d8f4af2ec1f605e20acc6"
};

const app  = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

export const registerGuest = async (name, email, password, phone = '') => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await set(ref(db, `guests/${cred.user.uid}`), {
    name, email, phone, createdAt: Date.now(), role: 'guest',
  });
  return cred.user;
};

export const loginGuest   = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutGuest  = ()                 => signOut(auth);
export const onAuthChange = (cb)               => onAuthStateChanged(auth, cb);

export const getGuestProfile = async (uid) => {
  const snap = await get(ref(db, `guests/${uid}`));
  return snap.val();
};

export const updateGuestProfile = (uid, data) =>
  update(ref(db, `guests/${uid}`), { ...data, updatedAt: Date.now() });

// ══════════════════════════════════════════════════════════════
// INCIDENTS
// ══════════════════════════════════════════════════════════════

// Create incident — always stamps guestUid + guest info
export const createIncident = async (data) => {
  const u      = auth.currentUser;
  const incRef = ref(db, 'incidents');
  const newRef = push(incRef);
  await set(newRef, {
    ...data,
    id:         newRef.key,
    guestUid:   u?.uid         || null,
    guestEmail: u?.email       || null,
    guestName:  u?.displayName || null,
    status:     'active',
    severity:   data.severity  || 'pending',
    created_at: Date.now(),
  });
  return newRef.key;
};

// ── ADMIN: listen to ALL incidents, enriched with guest profile ──
export const listenToIncidents = (callback) => {
  return onValue(ref(db, 'incidents'), async (snap) => {
    const val = snap.val();
    if (!val) { callback([]); return; }
    const incidents = Object.values(val);

    // Batch-fetch unique guest profiles (avoids N+1 reads)
    const uids     = [...new Set(incidents.map(i => i.guestUid).filter(Boolean))];
    const profiles = {};
    await Promise.all(uids.map(async uid => {
      const p = await getGuestProfile(uid);
      if (p) profiles[uid] = p;
    }));

    const enriched = incidents.map(inc => {
      const p = inc.guestUid ? profiles[inc.guestUid] : null;
      return {
        ...inc,
        guestName:  inc.guestName  || p?.name  || 'Unknown Guest',
        guestEmail: inc.guestEmail || p?.email  || '—',
        guestPhone: inc.guestPhone || p?.phone  || '—',
      };
    });

    callback(enriched);
  });
};

// ── GUEST: only current user's own incidents ──────────────────
// Takes ONE argument (callback only) — uid is read from auth.currentUser.
// This matches every call site: listenToMyIncidents(callback)
export const listenToMyIncidents = (callback) => {
  const user = auth.currentUser;

  // No user logged in — return empty immediately
  if (!user) {
    callback([]);
    return () => {};
  }

  const uid = user.uid;

  // Server-side filter: only incidents where guestUid === uid
  const q = query(
    ref(db, 'incidents'),
    orderByChild('guestUid'),
    equalTo(uid)           // uid is a string — never a function
  );

  const unsubscribe = onValue(q, (snap) => {
    const val = snap.val();
    if (!val) { callback([]); return; }
    const sorted = Object.values(val)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    callback(sorted);
  });

  return unsubscribe;
};

// ── Single incident listener (for guest chat screen) ──────────
export const listenToIncident = (id, cb) =>
  onValue(ref(db, `incidents/${id}`), (snap) => cb(snap.val()));

// ── Chat ──────────────────────────────────────────────────────
export const sendMessage = (incidentId, text, sender) =>
  push(ref(db, `incidents/${incidentId}/chat`), {
    text, sender, time: Date.now(),
  });

// ── Update any incident fields ────────────────────────────────
export const updateIncident = (id, data) =>
  update(ref(db, `incidents/${id}`), data);