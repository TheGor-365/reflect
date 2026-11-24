// Run ONLY via the R139 isolated emulator workflow. No provider or live data.
import { test, expect, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc,
  collection, getDocs, runTransaction, terminate } from 'firebase/firestore';

const enabled = process.env.REFLECT_R139_EMULATOR === '1';
const projectId = 'demo-reflect-r139';
const scope = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/firebase/config', () => ({
  get db() { return scope.db; }, appId: 'reflect-8fdc8'
}));
vi.mock('../../src/features/Memory/memoryLedgerOperations', () => ({
  memoryLedgerEnabled: () => false,
  createMemoryEventId: () => { throw new Error('Unexpected memory event'); },
  appendOwnerEvidenceInTransaction: () => { throw new Error('Unexpected memory write'); }
}));

test.skipIf(!enabled)('R139 C2 real SDK concurrency, rollback, owner isolation', async () => {
  if (process.env.GCLOUD_PROJECT !== projectId ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19399' ||
      process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:19381' ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('STOP: emulator identity mismatch');
  }
  const clients = [];
  async function client(name) {
    const app = initializeApp({ projectId, apiKey: 'synthetic-only' }, name);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:19399', { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 19381);
    clients.push({ app, db });
    const { user } = await signInAnonymously(auth);
    return { db, uid: user.uid };
  }
  try {
    const alice = await client('r139-alice');
    const bob = await client('r139-bob');
    scope.db = alice.db;
    const { applyRecommendationDecision } = await import('../../src/features/Sessions/recommendationDecisions');
    const root = 'artifacts/reflect-8fdc8/users/' + alice.uid;
    const sessionRef = doc(alice.db, root, 'sessions', 's1');
    const fixture = { chatHistory: [
      { id: 'u1', role: 'user', content: 'Проверить прототип' },
      { id: 'a1', role: 'assistant', content: 'Предложение', interaction: {
        version: 'reflect.interaction.v1', stage: 'synthesize',
        clarifyingQuestion: '', unknowns: [], insights: [],
        recommendationCandidates: [{ title: 'Проверить прототип',
          rationale: 'Есть конкретная задача', sourceRefs: ['current-message'] }]
      }}
    ] };
    await setDoc(sessionRef, fixture);
    const input = { userId: alice.uid, sessionId: 's1', assistantMessageId: 'a1',
      candidateIndex: 0, action: 'goal', goalTitle: 'Проверить прототип',
      goalStep: 'Показать прототип', goalCriteria: 'Получен отзыв' };
    const results = await Promise.all([
      applyRecommendationDecision({ ...input, goalId: 'g1' }),
      applyRecommendationDecision({ ...input, goalId: 'g2' })
    ]);
    expect(results[0].goalId).toBe(results[1].goalId);
    const goals = await getDocs(collection(alice.db, root, 'goals'));
    expect(goals.size).toBe(1);
    expect(goals.docs[0].id).toBe(results[0].goalId);
    expect(goals.docs[0].data()).toMatchObject({ sessionId: 's1',
      sourceMessageId: 'u1', sourceAssistantMessageId: 'a1',
      sourceRecommendationKey: 'r-a1-0' });
    const saved = (await getDoc(sessionRef)).data();
    expect(saved.chatHistory).toEqual(fixture.chatHistory);
    expect(saved.recommendationDecisions['r-a1-0'].goalId).toBe(results[0].goalId);
    await expect(getDoc(doc(bob.db, root, 'sessions', 's1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDoc(doc(bob.db, root, 'goals', results[0].goalId)))
      .rejects.toMatchObject({ code: 'permission-denied' });
    scope.db = bob.db;
    await expect(applyRecommendationDecision({ ...input, goalId: 'forbidden' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    scope.db = alice.db;
    // Force a rules-denied second write in an otherwise valid atomic SDK transaction.
    const rollback = doc(alice.db, root, 'goals', 'rollback');
    await expect(runTransaction(alice.db, async tx => {
      await tx.get(sessionRef);
      tx.set(rollback, { text: 'Must not persist' });
      tx.set(doc(alice.db, 'artifacts/reflect-8fdc8/users/' + bob.uid, 'goals', 'forbidden'), { text: 'Denied' });
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await getDoc(rollback)).exists()).toBe(false);
    expect((await getDocs(collection(alice.db, root, 'goals'))).size).toBe(1);
    console.log('R139_C2_EMULATOR_PASS');

    // C3 characterization, NOT a desired security property. Current hosted
    // rules allow the owner to edit the transcript and bypass the UI gate.
    // Use a separate synthetic session, never the C2 verified source.
    const mutable = doc(alice.db, root, 'sessions', 'c3-mutable');
    const blocked = structuredClone(fixture);
    blocked.chatHistory[1].interaction.stage = 'clarify';
    blocked.chatHistory[1].interaction.clarifyingQuestion = 'Какой критерий?';
    await setDoc(mutable, blocked);
    const c3Input = { ...input, sessionId: 'c3-mutable', goalId: 'c3-goal' };
    await expect(applyRecommendationDecision(c3Input)).rejects.toThrow(/открытый уточняющий/);
    expect((await getDoc(doc(alice.db, root, 'goals', 'c3-goal'))).exists()).toBe(false);
    await setDoc(mutable, fixture);
    expect((await applyRecommendationDecision(c3Input)).status).toBe('accepted');
    // Private receipts remain inaccessible even to the same authenticated UID.
    const privateReceipt = doc(alice.db, '_reflectAiPrivate', 'reflect-8fdc8',
      'attemptOwners', alice.uid, 'sessions', 'c3-mutable', 'turns', 'u1');
    await expect(getDoc(privateReceipt)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(privateReceipt, { status: 'persisted_reply' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    console.log('R139_C3_OWNER_MUTABILITY_LIMIT_REPRODUCED');

    // The private acceptance event, runtime switch and quota must remain
    // inaccessible even to the owner. These are Rules checks, not Admin Auth.
    for (const path of [
      ['_reflectAiPrivate', 'reflect-8fdc8', 'attemptOwners', alice.uid,
        'sessions', 'c3-mutable', 'acceptances', 'verified-fixture'],
      ['_reflectAiPrivate', 'reflect-8fdc8', 'runtimeFlags', 'goalAcceptance'],
      ['_reflectAiPrivate', 'reflect-8fdc8', 'goalAcceptanceQuotas', alice.uid]
    ]) {
      for (const client of [alice, bob]) {
        const privateRef = doc(client.db, ...path);
        await expect(getDoc(privateRef)).rejects.toMatchObject({ code: 'permission-denied' });
        await expect(setDoc(privateRef, { enabled: true }))
          .rejects.toMatchObject({ code: 'permission-denied' });
      }
    }
    console.log('R139_C3C3C2_PRIVATE_RULES_PASS');

  } finally {
    scope.db = null;
    await Promise.all(clients.map(async ({app, db}) => {
      await terminate(db);
      await deleteApp(app);
    }));
  }
}, 90000);
