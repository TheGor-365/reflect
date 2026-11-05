import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, signOut
} from 'firebase/auth';
import { auth } from '../firebase/config';
import {
  accountErrorMessage, normalizeEmail, registerCurrentAnonymous,
  signInExisting, signOutRegistered
} from './accountAccess';

vi.mock('../firebase/config', () => ({ auth: { currentUser: null } }));
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: vi.fn((email, password) => ({ email, password })) },
  linkWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser = { uid: 'synthetic-legacy-uid', isAnonymous: true };
});

describe('Firebase account linking and sign-in safeguards', () => {
  it('normalizes email without retaining a password', () => {
    expect(normalizeEmail('  Demo+QA@Example.TEST ')).toBe('demo+qa@example.test');
  });

  it('links credentials to existing anonymous UID, preserving Firestore ownership', async () => {
    linkWithCredential.mockResolvedValue({
      user: { uid: 'synthetic-legacy-uid', isAnonymous: false, email: 'qa@example.test' }
    });
    const result = await registerCurrentAnonymous('  QA@EXAMPLE.TEST ', 'very-strong-qa-password!');
    expect(EmailAuthProvider.credential).toHaveBeenCalledWith('qa@example.test', 'very-strong-qa-password!');
    expect(linkWithCredential).toHaveBeenCalledWith(auth.currentUser, expect.anything());
    expect(result.uid).toBe('synthetic-legacy-uid');
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('does not switch to a different UID when a link result violates continuity', async () => {
    linkWithCredential.mockResolvedValue({ user: { uid: 'wrong-user' } });
    await expect(registerCurrentAnonymous('qa@example.test', 'very-strong-qa-password!'))
      .rejects.toThrow('сохранение UID');
  });


  it('never acknowledges a partial link that remains anonymous', async () => {
    linkWithCredential.mockResolvedValue({
      user: { uid: 'synthetic-legacy-uid', isAnonymous: true, email: null }
    });
    await expect(registerCurrentAnonymous('qa@example.test', 'very-strong-qa-password!'))
      .rejects.toThrow('Привязка email не подтверждена');
  });
  it('preserves guest identity on duplicate email failures', async () => {
    linkWithCredential.mockRejectedValue({ code: 'auth/email-already-in-use' });
    await expect(registerCurrentAnonymous('used@example.test', 'very-strong-qa-password!'))
      .rejects.toMatchObject({ code: 'auth/email-already-in-use' });
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(accountErrorMessage({ code: 'auth/email-already-in-use' }))
      .toContain('Текущие анонимные данные не переключались');
  });

  it('blocks existing-login switching whenever guest has Firestore documents or profile', async () => {
    await expect(signInExisting('qa@example.test', 'very-strong-qa-password!', { hasLocalData: true }))
      .rejects.toThrow('Сначала привяжите');
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('signs into a previous registered account only if guest data is empty', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'existing-account' } });
    const result = await signInExisting('QA@EXAMPLE.TEST', 'short', { hasLocalData: false });
    expect(signInWithEmailAndPassword)
      .toHaveBeenCalledWith(auth, 'qa@example.test', 'short');
    expect(result.uid).toBe('existing-account');
  });

  it('rejects invalid email and short NEW password without modifying Auth', async () => {
    await expect(registerCurrentAnonymous('invalid', 'long-enough-password'))
      .rejects.toThrow('корректный email');
    await expect(registerCurrentAnonymous('qa@example.test', 'short'))
      .rejects.toThrow('10 символов');
    expect(linkWithCredential).not.toHaveBeenCalled();
  });

  it('refuses to sign out an anonymous account with potentially unrecoverable data', async () => {
    await expect(signOutRegistered()).rejects.toThrow('Гостевой аккаунт нельзя');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out a registered account explicitly', async () => {
    auth.currentUser = { uid: 'linked-id', isAnonymous: false };
    signOut.mockResolvedValue(undefined);
    await signOutRegistered();
    expect(signOut).toHaveBeenCalledWith(auth);
  });

  it('does not expose raw Firebase error messages in the UI', () => {
    expect(accountErrorMessage({ code: 'auth/invalid-credential', message: 'Firebase: private' }))
      .toContain('Проверьте email');
    expect(accountErrorMessage({ code: 'auth/internal-error', message: 'Firebase: opaque' }))
      .toContain('Не удалось');
    expect(accountErrorMessage(new Error('Введите пароль.'))).toBe('Введите пароль.');
  });
});
