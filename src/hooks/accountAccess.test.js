import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, sendEmailVerification, reload, confirmPasswordReset,
  applyActionCode, verifyBeforeUpdateEmail
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { clearExplicitlySignedOut, isExplicitlySignedOut, setExplicitlySignedOut } from './accountSession';
import {
  accountErrorMessage, normalizeEmail, registerCurrentAnonymous,
  signInExisting, signOutRegistered, requestPasswordReset, requestEmailVerification,
  refreshVerificationStatus, completePasswordReset, completeEmailVerification,
  requestEmailChange
} from './accountAccess';

vi.mock('../firebase/config', () => ({ auth: { currentUser: null } }));
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: vi.fn((email, password) => ({ email, password })) },
  linkWithCredential: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(), sendEmailVerification: vi.fn(),
  reload: vi.fn(), confirmPasswordReset: vi.fn(), applyActionCode: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn()
}));

beforeEach(() => {
  clearExplicitlySignedOut();
  vi.clearAllMocks();
  auth.currentUser = { uid: 'synthetic-legacy-uid', isAnonymous: true };
});

afterEach(() => clearExplicitlySignedOut());

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
    expect(sendEmailVerification).toHaveBeenCalledWith(result);
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('keeps verified UID and permanent account when verification delivery is unavailable', async () => {
    linkWithCredential.mockResolvedValue({
      user: { uid: 'synthetic-legacy-uid', isAnonymous: false,
        email: 'qa@example.test', emailVerified: false }
    });
    sendEmailVerification.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
    const user = await registerCurrentAnonymous('qa@example.test', 'very-strong-qa-password!');
    expect(user.uid).toBe('synthetic-legacy-uid');
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    expect(linkWithCredential).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('never resends verification for an already verified linked account', async () => {
    linkWithCredential.mockResolvedValue({
      user: { uid: 'synthetic-legacy-uid', isAnonymous: false,
        email: 'qa@example.test', emailVerified: true }
    });
    await registerCurrentAnonymous('qa@example.test', 'very-strong-qa-password!');
    expect(sendEmailVerification).not.toHaveBeenCalled();
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
    setExplicitlySignedOut();
    const result = await signInExisting('QA@EXAMPLE.TEST', 'short', { hasLocalData: false });
    expect(isExplicitlySignedOut()).toBe(false);
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
    expect(isExplicitlySignedOut()).toBe(true);
  });

  it('restores the registered session when Firebase sign-out fails', async () => {
    auth.currentUser = { uid: 'registered-uid', isAnonymous: false };
    signOut.mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await expect(signOutRegistered()).rejects.toMatchObject({
      code: 'auth/network-request-failed'
    });
    expect(isExplicitlySignedOut()).toBe(false);
    expect(auth.currentUser.uid).toBe('registered-uid');
  });

  it('a failed existing-account login cannot silently dismiss signed-out state', async () => {
    setExplicitlySignedOut();
    signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    await expect(signInExisting('qa@example.test', 'wrong')).rejects.toMatchObject({
      code: 'auth/invalid-credential'
    });
    expect(isExplicitlySignedOut()).toBe(true);
  });

  it('does not expose raw Firebase error messages in the UI', () => {
    expect(accountErrorMessage({ code: 'auth/invalid-credential', message: 'Firebase: private' }))
      .toContain('Проверьте email');
    expect(accountErrorMessage({ code: 'auth/internal-error', message: 'Firebase: opaque' }))
      .toContain('Не удалось');
    expect(accountErrorMessage(new Error('Введите пароль.'))).toBe('Введите пароль.');
  });
});


describe('email verification and password recovery boundaries', () => {
  it('requests recovery via Firebase without signing out, changing UID or saving a password', async () => {
    const guest = auth.currentUser;
    sendPasswordResetEmail.mockResolvedValue(undefined);
    await requestPasswordReset('  QA@Example.TEST ');
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'qa@example.test');
    expect(auth.currentUser).toBe(guest);
    expect(signOut).not.toHaveBeenCalled();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('rejects malformed recovery email before sending', async () => {
    await expect(requestPasswordReset('invalid-email')).rejects.toThrow('корректный email');
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('allows verification only for registered, unverified users', async () => {
    await expect(requestEmailVerification()).rejects.toThrow('зарегистрированный');
    auth.currentUser = { uid: 'linked', email: 'qa@example.test',
      isAnonymous: false, emailVerified: false };
    sendEmailVerification.mockResolvedValue(undefined);
    await requestEmailVerification();
    expect(sendEmailVerification).toHaveBeenCalledWith(auth.currentUser);
    auth.currentUser.emailVerified = true;
    await requestEmailVerification();
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('changes unreachable email by sending verified link without replacing UID', async () => {
    auth.currentUser = { uid: 'registered-synthetic', isAnonymous: false,
      email: 'old@example.test', emailVerified: false };
    const before = auth.currentUser;
    verifyBeforeUpdateEmail.mockResolvedValue(undefined);
    await requestEmailChange('  NEW@EXAMPLE.TEST ');
    expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(
      before, 'new@example.test'
    );
    expect(auth.currentUser).toBe(before);
    expect(signOut).not.toHaveBeenCalled();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('rejects changing email when anonymous or same address', async () => {
    await expect(requestEmailChange('new@example.test'))
      .rejects.toThrow('зарегистрированный аккаунт');
    expect(verifyBeforeUpdateEmail).not.toHaveBeenCalled();
    auth.currentUser = { uid: 'linked', isAnonymous: false,
      email: 'old@example.test' };
    await expect(requestEmailChange('OLD@example.test'))
      .rejects.toThrow('должен отличаться');
    expect(verifyBeforeUpdateEmail).not.toHaveBeenCalled();
  });

  it('keeps registered user unchanged when new email verification is rejected', async () => {
    auth.currentUser = { uid: 'linked', isAnonymous: false,
      email: 'old@example.test' };
    const original = auth.currentUser;
    verifyBeforeUpdateEmail.mockRejectedValueOnce({ code: 'auth/email-already-in-use' });
    await expect(requestEmailChange('used@example.test'))
      .rejects.toMatchObject({ code: 'auth/email-already-in-use' });
    expect(auth.currentUser).toBe(original);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('refreshes verified state only for the same Firebase UID', async () => {
    auth.currentUser = { uid: 'linked', email: 'qa@example.test',
      isAnonymous: false, emailVerified: false };
    reload.mockImplementationOnce(async () => { auth.currentUser.emailVerified = true; });
    expect((await refreshVerificationStatus()).emailVerified).toBe(true);
    expect(auth.currentUser.uid).toBe('linked');
    reload.mockImplementationOnce(async () => { auth.currentUser = { uid: 'changed' }; });
    await expect(refreshVerificationStatus()).rejects.toThrow('Изменился идентификатор');
  });

  it('applies Firebase verification code without changing the current UID', async () => {
    const originalUser = auth.currentUser;
    applyActionCode.mockResolvedValue(undefined);
    await completeEmailVerification('synthetic-action-code');
    expect(applyActionCode).toHaveBeenCalledWith(auth, 'synthetic-action-code');
    expect(auth.currentUser).toBe(originalUser);
  });

  it('confirms a reset code only with strong replacement password', async () => {
    await expect(completePasswordReset('local-test-code', 'short'))
      .rejects.toThrow('10 символов');
    expect(confirmPasswordReset).not.toHaveBeenCalled();
    confirmPasswordReset.mockResolvedValue(undefined);
    await completePasswordReset('local-test-code', 'synthetic-new-strong-password');
    expect(confirmPasswordReset).toHaveBeenCalledWith(
      auth, 'local-test-code', 'synthetic-new-strong-password');
  });
});
