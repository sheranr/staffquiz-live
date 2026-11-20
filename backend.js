// Data layer: Google Firebase (Firestore + anonymous sign-in).
// The pages only use the functions returned by createBackend(), so the backend can be swapped.
import {
  initializeApp, getAuth, signInAnonymously, onAuthStateChanged,
  initializeFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs,
  serverTimestamp, Timestamp,
} from './vendor/firebase.js';
import { firebaseConfig } from './config.js';

export const SERVER_TS = { __serverTimestamp: true };

// Firestore Timestamps -> plain milliseconds, so the app only deals with numbers
function out(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(out);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = out(v[k]); return o; }
  return v;
}
// SERVER_TS sentinel -> Firestore server timestamp (time is set by Google's servers = fair)
function inp(v) {
  if (v === SERVER_TS) return serverTimestamp();
  if (Array.isArray(v)) return v.map(inp);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = inp(v[k]); return o; }
  return v;
}
const data = (snap) => (snap.exists() ? out(snap.data({ serverTimestamps: 'estimate' })) : null);

export async function createBackend() {
  if (!firebaseConfig || !firebaseConfig.projectId || firebaseConfig.projectId.startsWith('PASTE')) {
    throw new Error('Firebase is not set up yet (config.js).');
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  const user = await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => { if (u) { off(); resolve(u); } });
    signInAnonymously(auth).catch(reject);
  });
  const g = (pin) => doc(db, 'games', pin);

  return {
    uid: user.uid,
    SERVER_TS,
    async getGame(pin) { return data(await getDoc(g(pin))); },
    async createGame(pin, d) { await setDoc(g(pin), inp(d)); },
    async updateGame(pin, patch) { await updateDoc(g(pin), inp(patch)); },
    watchGame(pin, cb) { return onSnapshot(g(pin), (s) => cb(data(s)), (e) => console.warn(e)); },

    async getPlayer(pin, uid) { return data(await getDoc(doc(db, 'games', pin, 'players', uid))); },
    async addPlayer(pin, d) { await setDoc(doc(db, 'games', pin, 'players', user.uid), inp(d)); },
    async updatePlayer(pin, uid, patch) { await updateDoc(doc(db, 'games', pin, 'players', uid), inp(patch)); },
    watchPlayer(pin, uid, cb) { return onSnapshot(doc(db, 'games', pin, 'players', uid), (s) => cb(data(s)), (e) => console.warn(e)); },
    watchPlayers(pin, cb) {
      return onSnapshot(collection(db, 'games', pin, 'players'), (qs) => cb(qs.docs.map((d) => ({ id: d.id, ...out(d.data({ serverTimestamps: 'estimate' })) }))), (e) => console.warn(e));
    },
    async nameTaken(pin, nameLower) {
      const qs = await getDocs(query(collection(db, 'games', pin, 'players'), where('nameLower', '==', nameLower)));
      return qs.docs.some((d) => d.id !== user.uid && !d.data().kicked);
    },

    async submitAnswer(pin, q, choice) {
      await setDoc(doc(db, 'games', pin, 'answers', `${q}_${user.uid}`), { uid: user.uid, q, choice, at: serverTimestamp() });
    },
    watchAnswers(pin, q, cb) {
      return onSnapshot(query(collection(db, 'games', pin, 'answers'), where('q', '==', q)),
        (qs) => cb(qs.docs.filter((d) => !d.metadata.hasPendingWrites).map((d) => out(d.data()))), (e) => console.warn(e));
    },
  };
}
