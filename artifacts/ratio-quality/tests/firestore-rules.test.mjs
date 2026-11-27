// Security-rules tests. Run with: pnpm --filter @workspace/ratio-quality test:rules (starts the Firestore emulator).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, addDoc, collection, getDocs } from 'firebase/firestore';

let env;
const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-ratio', firestore: { rules } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin'), { role: 'admin', canApprove: true, active: true });
    await setDoc(doc(db, 'users/qm'), { role: 'quality_manager', canApprove: false, active: true });
    await setDoc(doc(db, 'users/insp'), { role: 'inspector', canApprove: false, active: true });
    await setDoc(doc(db, 'users/insp2'), { role: 'inspector', canApprove: false, active: true });
    await setDoc(doc(db, 'users/off'), { role: 'inspector', canApprove: false, active: false });
    await setDoc(doc(db, 'inspections/draft1'), { status: 'draft', branchId: 'HAS.01' });
    await setDoc(doc(db, 'inspections/sub1'), { status: 'finalized', workflow: 'submitted' });
    await setDoc(doc(db, 'inspections/app1'), { status: 'finalized', workflow: 'approved' });
    await setDoc(doc(db, 'actions/a1'), { status: 'بانتظار التحقق' });
    await setDoc(doc(db, 'baristaEvals/e1'), { evaluatorUid: 'insp', answers: {} });
    await setDoc(doc(db, 'counters/inspections'), { year: 2026, seq: 5 });
    await setDoc(doc(db, 'inspections/mine'), { status: 'draft', inspectorUid: 'insp' });
    await setDoc(doc(db, 'users/bm'), { role: 'branch_manager', canApprove: false, active: true, branchIds: ['HAS.01'] });
    await setDoc(doc(db, 'inspections/b1ok'), { status: 'finalized', workflow: 'approved', branchId: 'HAS.01' });
    await setDoc(doc(db, 'inspections/b1sub'), { status: 'finalized', workflow: 'submitted', branchId: 'HAS.01' });
    await setDoc(doc(db, 'inspections/b2ok'), { status: 'finalized', workflow: 'approved', branchId: 'HAS.02' });
    await setDoc(doc(db, 'actions/act1'), { status: 'مفتوح', branchId: 'HAS.01', title: 't' });
    await setDoc(doc(db, 'actions/act2'), { status: 'مفتوح', branchId: 'HAS.02', title: 't' });
  });
});
const as = uid => env.authenticatedContext(uid).firestore();

test('new user can self-register only as plain inspector', async () => {
  const newbie = env.authenticatedContext('newbie', { email: 'n@x' }).firestore();
  await assertSucceeds(setDoc(doc(newbie, 'users/newbie'), { role: 'inspector', canApprove: false, email: 'n@x' }));
  // a profile must carry the account's own email (no impersonating someone else's address)
  await assertFails(setDoc(doc(env.authenticatedContext('n2', { email: 'n2@x' }).firestore(), 'users/n2'), { role: 'inspector', canApprove: false, email: 'boss@x' }));
  await assertFails(setDoc(doc(as('evil'), 'users/evil'), { role: 'admin', canApprove: true }));
});
test('inspector cannot change own role or approval right; admin can', async () => {
  await assertFails(updateDoc(doc(as('insp'), 'users/insp'), { role: 'admin' }));
  await assertFails(updateDoc(doc(as('insp'), 'users/insp'), { canApprove: true }));
  await assertSucceeds(updateDoc(doc(as('insp'), 'users/insp'), { name: 'Name' }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'users/insp'), { canApprove: true }));
});
test('signed-out and deactivated users cannot read inspections', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'inspections/draft1')));
  await assertFails(getDoc(doc(as('off'), 'inspections/draft1')));
  await assertSucceeds(getDoc(doc(as('insp'), 'inspections/draft1')));
});
test('inspector edits drafts but cannot self-approve', async () => {
  await assertSucceeds(updateDoc(doc(as('insp'), 'inspections/draft1'), { note: 'x' }));
  await assertFails(updateDoc(doc(as('insp'), 'inspections/draft1'), { workflow: 'approved' }));
  await assertFails(setDoc(doc(as('insp'), 'inspections/new1'), { status: 'finalized', workflow: 'approved' }));
});
test('submitted inspection: only approvers change it (inspector may only add the number)', async () => {
  await assertFails(updateDoc(doc(as('insp'), 'inspections/sub1'), { workflow: 'approved' }));
  await assertSucceeds(updateDoc(doc(as('insp'), 'inspections/sub1'), { number: 'RQ-2026-00006', updatedAt: 'x' }));
  await assertSucceeds(updateDoc(doc(as('qm'), 'inspections/sub1'), { workflow: 'approved' }));
});
test('inspector granted approval permission can approve', async () => {
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'users/insp2'), { canApprove: true }));
  await assertSucceeds(updateDoc(doc(as('insp2'), 'inspections/sub1'), { workflow: 'approved' }));
});
test('approved inspection is locked for everyone, including admins', async () => {
  await assertFails(updateDoc(doc(as('admin'), 'inspections/app1'), { status: 'draft' }));
  await assertFails(updateDoc(doc(as('qm'), 'inspections/app1'), { answers: {} }));
  await assertFails(deleteDoc(doc(as('insp'), 'inspections/app1')));
});
test('only quality leads verify (close) corrective actions', async () => {
  await assertFails(updateDoc(doc(as('insp'), 'actions/a1'), { status: 'مغلق' }));
  await assertSucceeds(updateDoc(doc(as('qm'), 'actions/a1'), { status: 'مغلق' }));
  await assertFails(updateDoc(doc(as('insp'), 'actions/a1'), { status: 'مفتوح' }));
});
test('audit log is append-only and readable by leads only', async () => {
  await assertSucceeds(addDoc(collection(as('insp'), 'audit'), { uid: 'insp', action: 'x' }));
  await assertFails(addDoc(collection(as('insp'), 'audit'), { uid: 'someone-else', action: 'x' }));
  await assertFails(getDocs(collection(as('insp'), 'audit')));
  await assertSucceeds(getDocs(collection(as('qm'), 'audit')));
});
test('barista evaluations are private to evaluator and leads', async () => {
  await assertSucceeds(getDoc(doc(as('insp'), 'baristaEvals/e1')));
  await assertFails(getDoc(doc(as('insp2'), 'baristaEvals/e1')));
  await assertSucceeds(getDoc(doc(as('qm'), 'baristaEvals/e1')));
});
test('inspection counter only increments by one', async () => {
  await assertSucceeds(updateDoc(doc(as('insp'), 'counters/inspections'), { year: 2026, seq: 6 }));
  await assertFails(updateDoc(doc(as('insp'), 'counters/inspections'), { year: 2026, seq: 50 }));
});
test('shared config: everyone reads, only quality leads write', async () => {
  await assertFails(setDoc(doc(as('insp'), 'config/app'), { photoRequiredOnFail: [] }));
  await assertSucceeds(setDoc(doc(as('qm'), 'config/app'), { photoRequiredOnFail: [5] }));
  await assertSucceeds(getDoc(doc(as('insp'), 'config/app')));
});
test('photos: owner-tagged images only, immutable', async () => {
  await assertSucceeds(setDoc(doc(as('insp'), 'photos/p1'), { uid: 'insp', data: 'data:image/jpeg;base64,AAAA', inspectionId: 'draft1' }));
  await assertFails(setDoc(doc(as('insp'), 'photos/p2'), { uid: 'qm', data: 'data:image/jpeg;base64,AAAA' }));
  await assertFails(setDoc(doc(as('insp'), 'photos/p3'), { uid: 'insp', data: 'javascript:alert(1)' }));
  await assertFails(updateDoc(doc(as('insp'), 'photos/p1'), { data: 'data:image/png;base64,BBBB' }));
  await assertSucceeds(getDoc(doc(as('insp2'), 'photos/p1')));
});
test('mail log is append-only and tagged with the sender', async () => {
  await assertSucceeds(addDoc(collection(as('insp'), 'mailLog'), { uid: 'insp', inspectionId: 'sub1', channel: 'email' }));
  await assertFails(addDoc(collection(as('insp'), 'mailLog'), { uid: 'qm', inspectionId: 'sub1' }));
});
test('amendment of an approved report is a new draft; the original stays locked', async () => {
  await assertSucceeds(setDoc(doc(as('qm'), 'inspections/app1-r1'), { status: 'draft', amendmentOf: 'app1', revision: 1 }));
  await assertFails(updateDoc(doc(as('qm'), 'inspections/app1'), { amended: true }));
});

test('a draft belongs to its inspector: other inspectors cannot edit or delete it, leads can', async () => {
  await assertSucceeds(updateDoc(doc(as('insp'), 'inspections/mine'), { note: 'mine' }));
  await assertFails(updateDoc(doc(as('insp2'), 'inspections/mine'), { note: 'hijack' }));
  await assertFails(deleteDoc(doc(as('insp2'), 'inspections/mine')));
  await assertSucceeds(updateDoc(doc(as('qm'), 'inspections/mine'), { note: 'lead' }));
  await assertSucceeds(deleteDoc(doc(as('insp'), 'inspections/mine')));
});
test('practice (training) visits are rejected by the cloud', async () => {
  await assertFails(setDoc(doc(as('insp'), 'inspections/t1'), { status: 'draft', training: true }));
  await assertFails(updateDoc(doc(as('insp'), 'inspections/draft1'), { training: true }));
});
test('inspection counter cannot be reset inside a year, only roll over to a new year', async () => {
  await assertFails(updateDoc(doc(as('insp'), 'counters/inspections'), { year: 2026, seq: 1 }));
  await assertSucceeds(updateDoc(doc(as('insp'), 'counters/inspections'), { year: 2027, seq: 1 }));
  await assertFails(updateDoc(doc(as('insp'), 'counters/inspections'), { year: 2026, seq: 2 }));
});

test('past reports can be imported as approved by quality leads only', async () => {
  await assertSucceeds(setDoc(doc(as('qm'), 'inspections/imp1'), { status: 'finalized', workflow: 'approved', imported: { source: 'old.pdf' } }));
  await assertFails(setDoc(doc(as('insp'), 'inspections/imp2'), { status: 'finalized', workflow: 'approved', imported: { source: 'old.pdf' } }));
  await assertFails(updateDoc(doc(as('qm'), 'inspections/imp1'), { branchName: 'x' }));
});

test('device health: each user writes only their own; only quality leads read others', async () => {
  await assertSucceeds(setDoc(doc(as('insp'), 'deviceHealth/insp'), { uid: 'insp', at: '2026-11-27T10:00:00Z', pending: 2 }));
  await assertFails(setDoc(doc(as('insp'), 'deviceHealth/insp2'), { uid: 'insp2', at: 'x' }));
  await assertFails(setDoc(doc(as('insp'), 'deviceHealth/insp'), { uid: 'someone-else' }));
  await assertSucceeds(getDoc(doc(as('qm'), 'deviceHealth/insp')));
  await assertFails(getDoc(doc(as('insp2'), 'deviceHealth/insp')));
});

test('branch manager sees only own branch approved reports and actions', async () => {
  const bm = as('bm');
  await assertSucceeds(getDoc(doc(bm, 'inspections/b1ok')));
  await assertFails(getDoc(doc(bm, 'inspections/b1sub')));
  await assertFails(getDoc(doc(bm, 'inspections/b2ok')));
  const { query, where } = await import('firebase/firestore');
  await assertSucceeds(getDocs(query(collection(bm, 'inspections'), where('branchId', '==', 'HAS.01'), where('workflow', '==', 'approved'))));
  await assertFails(getDocs(collection(bm, 'inspections')));
  await assertSucceeds(getDocs(query(collection(bm, 'actions'), where('branchId', '==', 'HAS.01'))));
  await assertFails(getDoc(doc(bm, 'actions/act2')));
  await assertFails(getDoc(doc(bm, 'equipment/x')));
});
test('branch manager answers own action with proof, but cannot close it or edit anything else', async () => {
  const bm = as('bm');
  await assertSucceeds(updateDoc(doc(bm, 'actions/act1'), { status: 'بانتظار التحقق', evidence: [{ id: 'p', storagePath: 'photos/p' }], managerNote: 'تم', updatedAt: 'x' }));
  await assertFails(updateDoc(doc(bm, 'actions/act1'), { status: 'مغلق' }));
  await assertFails(updateDoc(doc(bm, 'actions/act1'), { title: 'تغيير' }));
  await assertFails(updateDoc(doc(bm, 'actions/act2'), { status: 'بانتظار التحقق' }));
  await assertFails(setDoc(doc(bm, 'inspections/new1'), { status: 'draft', branchId: 'HAS.01' }));
  await assertFails(setDoc(doc(bm, 'actions/new1'), { status: 'مفتوح', branchId: 'HAS.01' }));
});
test('users cannot grant themselves branches; inspectors cannot hijack or create visits for others', async () => {
  await assertFails(updateDoc(doc(as('bm'), 'users/bm'), { branchIds: ['HAS.01', 'HAS.02'] }));
  await assertFails(setDoc(doc(as('insp'), 'inspections/forged'), { status: 'draft', inspectorUid: 'insp2' }));
  await assertSucceeds(setDoc(doc(as('insp'), 'inspections/own'), { status: 'draft', inspectorUid: 'insp' }));
  await assertFails(updateDoc(doc(as('insp'), 'inspections/mine'), { inspectorUid: 'insp2' }));
});
