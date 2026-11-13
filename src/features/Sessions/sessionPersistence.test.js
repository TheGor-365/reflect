import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createDurableSession, appendDurableTurn
} from './sessionPersistence';

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(), updateDoc: vi.fn(), collection: vi.fn(), doc: vi.fn(),
  union: vi.fn(), timestamp: vi.fn()
}));
vi.mock('../../firebase/config', () => ({
  db: { kind: 'staging-fixture' }, appId: 'reflect-8fdc8'
}));
vi.mock('firebase/firestore', () => ({
  collection: (...args) => {
    mocks.collection(...args);
    return { kind: 'collection', path: args.slice(1).join('/') };
  },
  doc: (...args) => {
    mocks.doc(...args);
    return { kind: 'document', path: args[0].path + '/' + (args[1] || 'allocated-id'), id: args[1] || 'allocated-id' };
  },
  setDoc: (...args) => mocks.setDoc(...args),
  updateDoc: (...args) => mocks.updateDoc(...args),
  arrayUnion: value => { mocks.union(value); return { operation: 'arrayUnion', value }; },
  serverTimestamp: () => ({ operation: 'serverTimestamp' })
}));

const userTurn = {
  id: 'user-a-specific-request-12345', role: 'user', content: 'Я хочу разобраться',
  timestamp: { seconds: 123 }
};
const assistantTurn = {
  id: 'assistant-a-specific-request-12345', role: 'assistant', content: 'Начните с одного факта.',
  timestamp: { seconds: 124 }
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
});

describe('P0 durable chat boundary', () => {
  it('commits the first owner turn before returning a session ID; no provider call', async () => {
    const result = await createDurableSession('synthetic-eric', userTurn);
    expect(result.id).toBe('allocated-id');
    expect(mocks.collection).toHaveBeenCalledWith(
      expect.anything(), 'artifacts', 'reflect-8fdc8', 'users', 'synthetic-eric', 'sessions'
    );
    expect(mocks.setDoc).toHaveBeenCalledOnce();
    expect(mocks.setDoc.mock.calls[0][1].chatHistory).toEqual([userTurn]);
    expect(mocks.setDoc.mock.calls[0][1].recommendations).toEqual([]);
  });

  it('atomic append never rewrites the transcript and preserves all existing turns', async () => {
    await appendDurableTurn('synthetic-eric', 'allocated-id', assistantTurn);
    expect(mocks.union).toHaveBeenCalledExactlyOnceWith(assistantTurn);
    const patch = mocks.updateDoc.mock.calls[0][1];
    expect(patch.chatHistory).toEqual({ operation: 'arrayUnion', value: assistantTurn });
    expect(patch).not.toHaveProperty('recommendations');
    expect(patch).not.toHaveProperty('title');
  });

  it('rejects invalid owner, session and malformed records before any writes', async () => {
    await expect(createDurableSession('../other', userTurn)).rejects.toThrow();
    await expect(appendDurableTurn('synthetic-eric', '../other', assistantTurn)).rejects.toThrow();
    await expect(appendDurableTurn('synthetic-eric', 'allocated-id', {
      ...assistantTurn, content: ''
    })).rejects.toThrow();
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it('never claims a saved session after Firestore rejects creation', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(createDurableSession('synthetic-eric', userTurn))
      .rejects.toThrow('offline');
  });
});
