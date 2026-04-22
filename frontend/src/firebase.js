// frontend/src/firebase.js
// Every function that reads/writes Firebase now:
//   1. Has a try-catch and returns null/[] on failure instead of throwing
//   2. Logs the exact error so you can see it in the console
//   3. Uses the correct SDK path

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

// ── Config ─────────────────────────────────────────────────────
// These values must also be set as environment variables in Vercel:
//   REACT_APP_FIREBASE_API_KEY, REACT_APP_FIREBASE_AUTH_DOMAIN, etc.
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY            || "AIzaSyCwvJX7NiL64VLB7gkdpckPcVgfp67w0Xs",
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN        || "rapid-crisis-response.firebaseapp.com",
  databaseURL:       process.env.REACT_APP_FIREBASE_DATABASE_URL       || "https://rapid-crisis-response-default-rtdb.firebaseio.com",
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID         || "rapid-crisis-response",
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET     || "rapid-crisis-response.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID|| "411234284723",
  appId:             process.env.REACT_APP_FIREBASE_APP_ID             || "1:411234284723:web:4d8f4af2ec1f605e20acc6",
};

const app  = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

// ── Helpers ────────────────────────────────────────────────────
const log  = (msg, d)  => console.log(`[Firebase] ${msg}`, d ?? '');
const elog = (msg, e)  => console.error(`[Firebase] ❌ ${msg}`, e?.code ?? '', e?.message ?? '', e ?? '');

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

export const registerGuest = async (name, email, password, phone = '') => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  // Write profile — if this fails the user is still registered, just profile is missing
  try {
    await set(ref(db, `guests/${cred.user.uid}`), {
      name, email, phone, createdAt: Date.now(), role: 'guest',
    });
    log('Profile written for', cred.user.uid);
  } catch (e) {
    elog('Could not write guest profile (check DB rules)', e);
  }
  return cred.user;
};

export const loginGuest   = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutGuest  = ()                 => signOut(auth);
export const onAuthChange = (cb)               => onAuthStateChanged(auth, cb);

// ══════════════════════════════════════════════════════════════
// GUEST PROFILE
// ══════════════════════════════════════════════════════════════

// getGuestProfile: returns the profile object or null — NEVER throws.
// Root cause of "Permission denied" crash: the old version had no try-catch.
export const getGuestProfile = async (uid) => {
  if (!uid) {
    elog('getGuestProfile called with no uid');
    return null;
  }
  try {
    const snap = await get(ref(db, `guests/${uid}`));
    if (!snap.exists()) {
      log(`No profile found for uid=${uid} — will create a placeholder`);
      return null; // caller should handle null gracefully
    }
    return snap.val();
  } catch (e) {
    elog(`getGuestProfile(${uid}) failed — check DB rules for guests/{uid}`, e);
    // Return null instead of throwing so the profile page can show an error UI
    // instead of crashing the whole app
    return null;
  }
};

export const updateGuestProfile = async (uid, data) => {
  try {
    await update(ref(db, `guests/${uid}`), { ...data, updatedAt: Date.now() });
    log('Profile updated for', uid);
  } catch (e) {
    elog(`updateGuestProfile(${uid}) failed`, e);
    throw e; // re-throw so the UI can show "Update failed"
  }
};
 // ── PATCH for frontend/src/firebase.js ──────────────────────
// Replace ONLY the createIncident function with this version.
// Change: fetches guestPhone from guests/{uid} before creating incident
// so the admin dashboard "Reported By" panel always shows the phone number.

export const createIncident = async (data) => {
  const u      = auth.currentUser;
  const incRef = ref(db, 'incidents');
  const newRef = push(incRef);

  // Fetch phone from guest profile (stored separately from Auth)
  // auth.currentUser only has displayName + email, NOT phone
  let guestPhone = data.guestPhone || null;
  if (!guestPhone && u?.uid) {
    try {
      const profileSnap = await get(ref(db, `guests/${u.uid}`));
      guestPhone = profileSnap.val()?.phone || null;
    } catch (_) {
      // Non-fatal — incident still creates, phone just stays null
      console.warn('[Firebase] Could not fetch phone for incident');
    }
  }

  try {
    await set(newRef, {
      ...data,
      id:         newRef.key,
      guestUid:   u?.uid         || null,
      guestEmail: u?.email       || null,
      guestName:  u?.displayName || null,
      guestPhone,                          // ← now always populated
      status:     'active',
      severity:   data.severity  || 'pending',
      created_at: Date.now(),
    });
    console.log('[Firebase] Incident created:', newRef.key, 'phone:', guestPhone);
    return newRef.key;
  } catch (e) {
    console.error('[Firebase] createIncident failed', e?.code, e?.message);
    throw e;
  }
};

// ── ADMIN: all incidents, enriched with guest info ────────────
export const listenToIncidents = (callback) => {
  const incRef = ref(db, 'incidents');
  const unsubscribe = onValue(incRef, async (snap) => {
    try {
      const val = snap.val();
      if (!val) { callback([]); return; }
      const incidents = Object.values(val);

      // Batch-fetch unique guest profiles
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
    } catch (e) {
      elog('listenToIncidents callback failed', e);
      callback([]);
    }
  }, (e) => {
    // onValue error handler — fires when rules block the read
    elog('listenToIncidents: permission denied or network error', e);
    callback([]);
  });

  return unsubscribe;
};

// ── GUEST: only current user's incidents ──────────────────────
// Takes ONE argument (callback). uid read from auth.currentUser internally.
export const listenToMyIncidents = (callback) => {
  const user = auth.currentUser;

  if (!user) {
    elog('listenToMyIncidents: no authenticated user');
    callback([]);
    return () => {};
  }

  const q = query(
    ref(db, 'incidents'),
    orderByChild('guestUid'),
    equalTo(user.uid)  // string, never a function
  );

  const unsubscribe = onValue(q,
    (snap) => {
      try {
        const val = snap.val();
        if (!val) { callback([]); return; }
        const sorted = Object.values(val)
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        callback(sorted);
      } catch (e) {
        elog('listenToMyIncidents callback failed', e);
        callback([]);
      }
    },
    (e) => {
      // This fires when Firebase DENIES the read
      elog('listenToMyIncidents: PERMISSION DENIED or network error', e);
      elog('Check DB rules: incidents should allow read when auth.uid == data.guestUid or via index');
      callback([]); // stop the infinite spinner
    }
  );

  return unsubscribe;
};

// ── Single incident ────────────────────────────────────────────
export const listenToIncident = (id, cb) => {
  if (!id) { cb(null); return () => {}; }
  return onValue(
    ref(db, `incidents/${id}`),
    (snap) => cb(snap.val()),
    (e)    => { elog(`listenToIncident(${id}) failed`, e); cb(null); }
  );
};

// ── Chat ───────────────────────────────────────────────────────
export const sendMessage = async (incidentId, text, sender) => {
  try {
    await push(ref(db, `incidents/${incidentId}/chat`), {
      text, sender, time: Date.now(),
    });
  } catch (e) {
    elog('sendMessage failed', e);
    throw e;
  }
};

// ── Update ─────────────────────────────────────────────────────
export const updateIncident = async (id, data) => {
  try {
    await update(ref(db, `incidents/${id}`), data);
  } catch (e) {
    elog(`updateIncident(${id}) failed`, e);
    throw e;
  }
};