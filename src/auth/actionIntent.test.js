import { describe, expect, it } from 'vitest';
import { parseAuthActionIntent, safeAuthActionError } from './actionIntent';

const K = 'synthetic-firebase-public-api-key';
const code = 'SyntheticOnceOnly_123456789';
const link = (mode, extra = '') => '?mode=' + mode + '&oobCode=' + code +
  '&apiKey=' + K + extra;

describe('Stage05A email action URL capability guard', () => {
  it.each(['resetPassword', 'recoverEmail', 'verifyEmail', 'verifyAndChangeEmail'])(
    'allows exactly the Firebase action %s for the configured project', mode => {
      expect(parseAuthActionIntent(link(mode), K)).toEqual({
        valid: true, mode, code
      });
    }
  );

  it('rejects missing, mismatched and duplicated API keys or action codes', () => {
    expect(parseAuthActionIntent(link('verifyEmail'), 'other-project').valid).toBe(false);
    expect(parseAuthActionIntent('?mode=verifyEmail&oobCode=' + code, K).valid).toBe(false);
    expect(parseAuthActionIntent(link('verifyEmail', '&apiKey=' + K), K).valid).toBe(false);
    expect(parseAuthActionIntent(link('verifyEmail', '&oobCode=other'), K).valid).toBe(false);
  });

  it('rejects unsupported operations, hostile code characters and excessive codes', () => {
    expect(parseAuthActionIntent(link('signIn'), K).valid).toBe(false);
    expect(parseAuthActionIntent(link('verifyEmail').replace(code, '<x>'), K).valid).toBe(false);
    expect(parseAuthActionIntent(link('verifyEmail').replace(code, 'A'.repeat(2049)), K).valid).toBe(false);
    expect(parseAuthActionIntent('', K).valid).toBe(false);
  });

  it('ignores untrusted continueUrl and language values, never echoes them', () => {
    const result = parseAuthActionIntent(link('verifyEmail',
      '&continueUrl=https%3A%2F%2Fattacker.test%2F&lang=zz'), K);
    expect(result).toEqual({ valid: true, mode: 'verifyEmail', code });
    expect(JSON.stringify(result)).not.toContain('attacker');
  });

  it('never reflects Firebase raw messages or one-time action codes', () => {
    const message = safeAuthActionError({
      code: 'auth/internal-error',
      message: 'Firebase: secret code ' + code
    });
    expect(message).not.toContain(code);
    expect(message).not.toContain('Firebase:');
  });
});
