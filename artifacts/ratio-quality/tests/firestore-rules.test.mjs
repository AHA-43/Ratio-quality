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
  });
});
const as = uid => env.authenticatedContext(uid).firestore();

test('new user can self-register only as plain inspector', async () => {
  await assertSucceeds(setDoc(doc(as('newbie'), 'users/newbie'), { role: 'inspector', canApprove: false, email: 'n@x' }));
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
