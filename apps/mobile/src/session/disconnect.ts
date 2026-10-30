export type DisconnectResult = {
  serverRevoked: boolean;
  providerSignedOut: boolean;
  credentialsCleared: boolean;
};

/** Attempt each boundary even if an earlier network/storage operation fails. */
export async function disconnectSession(actions: {
  revokeServer: () => Promise<void>;
  signOutProvider: () => Promise<void>;
  clearCredentials: () => Promise<void>;
}): Promise<DisconnectResult> {
  async function attempt(action: () => Promise<void>) {
    try {
      await action();
      return true;
    } catch {
      return false;
    }
  }
  const serverRevoked = await attempt(actions.revokeServer);
  const providerSignedOut = await attempt(actions.signOutProvider);
  const credentialsCleared = await attempt(actions.clearCredentials);
  return { serverRevoked, providerSignedOut, credentialsCleared };
}

export function disconnectMessage(result: DisconnectResult) {
  if (!result.credentialsCleared || !result.providerSignedOut)
    return 'Private view disconnected. Account cleanup is incomplete; retry cleanup before starting another guest.';
  if (!result.serverRevoked)
    return 'Private view disconnected and saved credentials cleared. Server revocation could not be confirmed.';
  return 'This session was revoked and saved credentials cleared.';
}
