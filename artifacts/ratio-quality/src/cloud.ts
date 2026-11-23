// Thin Firebase layer. The app keeps working fully offline on Dexie; when Firebase is configured
// (VITE_FIREBASE_* env vars) users must sign in and data is mirrored to Firestore + Storage.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, connectAuthEmulator, type User } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
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

export async function pushDoc(store: string, value: AnyDoc) {
  if (!fs || !isSignedIn()) return {};
  const { cloudCopy, uploaded } = await prepare(store, value);
  await setDoc(doc(fs, store, value.id), JSON.parse(JSON.stringify(cloudCopy)));
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
