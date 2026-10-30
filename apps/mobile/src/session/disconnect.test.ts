import { describe, expect, it } from 'vitest';
import { disconnectMessage, disconnectSession } from './disconnect';

describe('session disconnect across independent trust boundaries', () => {
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    'attempts all cleanup steps and reports exact outcomes for failure mask %i',
    async (mask) => {
      const calls: string[] = [];
      const action = (name: string, bit: number) => async () => {
        calls.push(name);
        if (mask & bit) throw new Error('Sensitive provider diagnostics');
      };
      const result = await disconnectSession({
        revokeServer: action('server', 1),
        signOutProvider: action('provider', 2),
        clearCredentials: action('storage', 4),
      });
      expect(calls).toEqual(['server', 'provider', 'storage']);
      expect(result).toEqual({
        serverRevoked: !(mask & 1),
        providerSignedOut: !(mask & 2),
        credentialsCleared: !(mask & 4),
      });
      const message = disconnectMessage(result);
      expect(message).not.toContain('Sensitive');
      if (mask & 6) expect(message).toContain('cleanup is incomplete');
      else if (mask & 1) expect(message).toContain('could not be confirmed');
      else
        expect(message).toContain('was revoked and saved credentials cleared');
    },
  );
});
