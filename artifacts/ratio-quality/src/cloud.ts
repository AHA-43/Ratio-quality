// Thin Firebase layer. The app keeps working fully offline on Dexie; when Firebase is configured
// (VITE_FIREBASE_* env vars) users must sign in and data is mirrored to Firestore + Storage.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator, createUserWithEmailAndPassword, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider, type User } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, deleteDoc, runTransaction, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL, connectStorageEmulator } from 'firebase/storage';

const env: Record<string, string | undefined> = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
export const cloudEnabled = Boolean(env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY);

const app = cloudEnabled ? initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, appId: env.VITE_FIREBASE_APP_ID,
}) : undefined;
export const auth = app ? getAuth(app) : undefined;
export const fs = app ? initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }) : undefined;
const storage = app ? getStorage(app) : undefined;
if (app && env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth!, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(fs!, '127.0.0.1', 8080);
  connectStorageEmulator(storage!, '127.0.0.1', 9199);
}

export const watchUser = (cb: (u: User | null) => void) => auth ? onAuthStateChanged(auth, cb) : (cb(null), () => {});
export const signIn = (email: string, password: string) => signInWithEmailAndPassword(auth!, email, password);
export const signOutUser = () => signOut(auth!);
/** Creates an account WITHOUT touching the admin's own session: a second, throw-away Firebase app does the sign-up. */
export async function createAccountAsAdmin(email: string, password: string, name: string): Promise<string> {
  if (!app) throw new Error('cloud disabled');
  const sec = initializeApp(app.options, `rq-create-${Date.now()}`);
  try {
    const a = getAuth(sec); const f = getFirestore(sec);
    if (env.VITE_USE_EMULATORS === 'true') { connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true }); connectFirestoreEmulator(f, '127.0.0.1', 8080); }
    const cred = await createUserWithEmailAndPassword(a, email, password);
    await updateProfile(cred.user, { displayName: name });
    // the new user writes their own plain-inspector profile (allowed by the rules); the admin then sets the role.
    await setDoc(doc(f, 'users', cred.user.uid), { email, name, role: 'inspector', canApprove: false, active: true, createdAt: new Date().toISOString() });
    await signOut(a);
    return cred.user.uid;
  } finally { await deleteApp(sec).catch(() => {}); }
}
export async function changeMyPassword(current: string, next: string) {
  const u = auth?.currentUser; if (!u?.email) throw new Error('signed-out');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  await updatePassword(u, next);
}
export const isSignedIn = () => Boolean(auth?.currentUser);

type Att = { id: string; data: string; storagePath?: string; [k: string]: unknown };
type AnyDoc = { id: string; [k: string]: any };

/** Moves photos out of the inspection document into `photos/{id}` (one Firestore doc per compressed photo,
 *  free tier, same access rules). The inspection keeps only a reference (photoId). */
const uploadedPhotos = new Set<string>();
async function prepare(store: string, value: AnyDoc): Promise<{ cloudCopy: AnyDoc; uploaded: Record<string, string> }> {
  const uploaded: Record<string, string> = {};
  if (store !== 'inspections' || !value.answers) return { cloudCopy: value, uploaded };
  const up = async (a: Att, qid: number): Promise<Att> => {
    let ref = a.storagePath ?? (uploadedPhotos.has(a.id) ? `photos/${a.id}` : undefined);
    if (!ref && a.data?.startsWith('data:') && a.data.length < 1_000_000) {
      try {
        await setDoc(doc(fs!, 'photos', a.id), { inspectionId: value.id, questionId: qid, data: a.data, uid: auth!.currentUser!.uid, at: new Date().toISOString() });
        ref = `photos/${a.id}`; uploaded[a.id] = ref; uploadedPhotos.add(a.id);
      } catch { /* offline or denied: retried on next save */ }
    }
    // Never inline an image in the inspection document (1 MB document limit): it stays on the device until uploaded.
    return { ...a, data: '', storagePath: ref ?? 'pending' };
  };
  const facade = value.facade?.data || value.facade?.storagePath ? await up(value.facade, 0) : value.facade;
  const answers: Record<string, any> = {};
  for (const [qid, ans] of Object.entries<any>(value.answers)) {
    const atts: Att[] = [];
    for (const a of (ans.attachments ?? []) as Att[]) {
      if (String(a.type ?? '').startsWith('video/')) { atts.push({ ...a, data: '', storagePath: 'device-only' }); continue; }
      atts.push(await up(a, Number(qid)));
    }
    answers[qid] = { ...ans, attachments: atts };
  }
  return { cloudCopy: { ...value, answers, ...(facade ? { facade } : {}) }, uploaded };
}

export async function resolvePhoto(path: string): Promise<string> {
  if (!fs || !path || path === 'pending' || path === 'device-only') return '';
  if (path.startsWith('photos/')) {
    const snap = await getDoc(doc(fs!, 'photos', path.slice(7)));
    return snap.exists() ? String(snap.data().data ?? '') : '';
  }
  return getDownloadURL(ref(storage!, path)).catch(() => '');
}

export const DEVICE_ID = (() => { try { let d = localStorage.getItem('rq-device'); if (!d) { d = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('rq-device', d); } return d; } catch { return 'unknown'; } })();
export class ConflictError extends Error { constructor(public cloud: AnyDoc) { super('conflict'); } }
/** Drafts are written with a precondition: only if the cloud copy is still the one this device last saw
 *  (expectedUpdatedAt). Transactions need a connection, so offline edits are never blind-written later. */
export async function pushDoc(store: string, value: AnyDoc, expectedUpdatedAt?: string) {
  if (!fs || !isSignedIn()) return {};
  const { cloudCopy, uploaded } = await prepare(store, value);
  const ref_ = doc(fs, store, value.id);
  const data = JSON.parse(JSON.stringify(cloudCopy));
  if (store === 'inspections' && value.status === 'draft') {
    await runTransaction(fs, async tx => {
      const snap = await tx.get(ref_);
      const cur = snap.exists() ? snap.data() as AnyDoc : null;
      // Only another device's newer write is a conflict; this device's own in-flight autosaves never are.
      if (cur && expectedUpdatedAt && cur.updatedAt && cur.updatedAt > expectedUpdatedAt && cur._writer && cur._writer !== DEVICE_ID) throw new ConflictError({ ...cur, id: value.id });
      tx.set(ref_, { ...data, _writer: DEVICE_ID });
    });
  } else await setDoc(ref_, data);
  return uploaded;
}
export async function removeDoc(store: string, id: string) {
  if (fs && isSignedIn()) await deleteDoc(doc(fs, store, id));
}
/** Whole collection, WITHOUT photo data: photos are fetched only for records this device actually stores
 *  (see fillPhotos), instead of re-downloading every image on every sync. */
export async function pullAll(store: string): Promise<AnyDoc[]> {
  if (!fs || !isSignedIn()) return [];
  const snap = await getDocs(collection(fs, store));
  return snap.docs.map(d => ({ ...(d.data() as AnyDoc), id: d.id }));
}
/** Downloads missing photo data for one record, a few at a time. */
export async function fillPhotos(v: AnyDoc) {
  const atts: Att[] = [];
  if (v.facade) atts.push(v.facade);
  for (const ans of Object.values<any>(v.answers ?? {})) for (const a of ans.attachments ?? []) atts.push(a);
  const todo = atts.filter(a => !a.data && a.storagePath && a.storagePath !== 'device-only' && a.storagePath !== 'pending');
  for (let k = 0; k < todo.length; k += 6) await Promise.all(todo.slice(k, k + 6).map(async a => { a.data = await resolvePhoto(a.storagePath!).catch(() => ''); }));
}
/** Live updates: calls back with every added/changed document of a collection (first call: all of them). */
export function watchStore(store: string, cb: (docs: AnyDoc[]) => void, onError?: () => void): () => void {
  if (!fs || !isSignedIn()) return () => {};
  return onSnapshot(collection(fs, store), snap => {
    const changed = snap.docChanges().filter(c => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites).map(c => ({ ...(c.doc.data() as AnyDoc), id: c.doc.id }));
    if (changed.length) cb(changed);
  }, () => onError?.());
}
