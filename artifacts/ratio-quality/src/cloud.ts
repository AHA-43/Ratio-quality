// Thin Firebase layer. The app keeps working fully offline on Dexie; when Firebase is configured
// (VITE_FIREBASE_* env vars) users must sign in and data is mirrored to Firestore + Storage.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator, type User } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, deleteDoc, runTransaction } from 'firebase/firestore';
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
export const isSignedIn = () => Boolean(auth?.currentUser);

type Att = { id: string; data: string; storagePath?: string; [k: string]: unknown };
type AnyDoc = { id: string; [k: string]: any };

/** Moves photos out of the inspection document into `photos/{id}` (one Firestore doc per compressed photo,
 *  free tier, same access rules). The inspection keeps only a reference (photoId). */
const uploadedPhotos = new Set<string>();
async function prepare(store: string, value: AnyDoc): Promise<{ cloudCopy: AnyDoc; uploaded: Record<string, string> }> {
  const uploaded: Record<string, string> = {};
  if (store !== 'inspections' || !value.answers) return { cloudCopy: value, uploaded };
  const answers: Record<string, any> = {};
  for (const [qid, ans] of Object.entries<any>(value.answers)) {
    const atts: Att[] = [];
    for (const a of (ans.attachments ?? []) as Att[]) {
      let ref = a.storagePath ?? (uploadedPhotos.has(a.id) ? `photos/${a.id}` : undefined);
      if (String(a.type ?? '').startsWith('video/')) { atts.push({ ...a, data: '', storagePath: 'device-only' }); continue; }
      if (!ref && a.data?.startsWith('data:') && a.data.length < 1_000_000) {
        try {
          await setDoc(doc(fs!, 'photos', a.id), { inspectionId: value.id, questionId: Number(qid), data: a.data, uid: auth!.currentUser!.uid, at: new Date().toISOString() });
          ref = `photos/${a.id}`; uploaded[a.id] = ref; uploadedPhotos.add(a.id);
        } catch { /* offline or denied: photo stays on the device and is retried on next save */ }
      }
      atts.push({ ...a, data: ref ? '' : a.data, storagePath: ref });
    }
    answers[qid] = { ...ans, attachments: atts };
  }
  return { cloudCopy: { ...value, answers }, uploaded };
}

async function resolvePhoto(path: string): Promise<string> {
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
export async function pullAll(store: string): Promise<AnyDoc[]> {
  if (!fs || !isSignedIn()) return [];
  const snap = await getDocs(collection(fs, store));
  const out: AnyDoc[] = [];
  for (const d of snap.docs) {
    const v = d.data() as AnyDoc;
    if (store === 'inspections' && v.answers) {
      for (const ans of Object.values<any>(v.answers)) {
        for (const a of ans.attachments ?? []) if (a.storagePath && a.storagePath !== 'device-only' && !a.data) a.data = await resolvePhoto(a.storagePath).catch(() => '');
      }
    }
    out.push(v);
  }
  return out;
}
