'use client';
import { useEffect, useRef, useState } from 'react';
type Connection = { apiUrl: string; getAccessToken: () => Promise<string> };
/** A managed-auth host supplies the connection. No pasted token or browser storage secret. */
export function ContentWorkbench({ connection }: { connection?: Connection }) {
  const [action, setAction] = useState('DRAFT'),
    [payload, setPayload] = useState('{}'),
    [reason, setReason] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    pending = useRef<{ body: string; key: string } | null>(null),
    life = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    return () => c.abort();
  }, [connection]);
  async function submit() {
    if (!connection || busy) return;
    setBusy(true);
    try {
      const fields = JSON.parse(payload) as unknown;
      if (
        !fields ||
        typeof fields !== 'object' ||
        Array.isArray(fields) ||
        reason.trim().length < 8
      )
        throw new Error(
          'Provide valid JSON fields and a reason of at least eight characters.',
        );
      const body = JSON.stringify({ ...fields, action, reason });
      if (pending.current && pending.current.body !== body)
        throw new Error(
          'Retry the unconfirmed action with its original fields.',
        );
      pending.current ??= { body, key: crypto.randomUUID() };
      const token = await connection.getAccessToken(),
        url = new URL(connection.apiUrl);
      if (
        !token ||
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          )) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('Reconnect through the managed identity host.');
      const response = await fetch(
        connection.apiUrl.replace(/\/$/, '') + '/v1/admin/content/commands',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...JSON.parse(pending.current.body),
            commandId: pending.current.key,
          }),
          signal: life.current?.signal ?? null,
        },
      );
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429)
          pending.current = null;
        throw new Error(
          'Action rejected or unconfirmed. Check your scoped MFA access, review evidence and current content state.',
        );
      }
      pending.current = null;
      setNotice('Server confirmed the audited content action.');
    } catch (e) {
      if (!life.current?.signal.aborted)
        setNotice(
          e instanceof SyntaxError
            ? 'Enter valid JSON.'
            : e instanceof Error
              ? e.message
              : 'Action could not be confirmed.',
        );
    } finally {
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <section>
      <h2>Content review workbench</h2>
      <p>
        Editors draft; separate reviewers provide design and production
        evidence; a separate publisher releases the unchanged manifest. Asset
        imports remain in the original-art pipeline. This workbench cannot mint
        cards or change paid power.
      </p>
      {!connection ? (
        <p>
          Connect a managed administrator session with MFA and
          operator-provisioned scopes. No access is configured in this preview.
        </p>
      ) : null}
      <label>
        Action{' '}
        <select
          value={action}
          disabled={busy || !connection}
          onChange={(e) => setAction(e.target.value)}
        >
          {['DRAFT', 'REVIEW', 'PUBLISH', 'RETIRE', 'PRODUCT_SWITCH'].map(
            (a) => (
              <option key={a}>{a}</option>
            ),
          )}
        </select>
      </label>
      <label>
        Command fields JSON (IDs, templates or review evidence)
        <textarea
          rows={10}
          value={payload}
          disabled={busy || !connection}
          onChange={(e) => setPayload(e.target.value)}
        />
      </label>
      <label>
        Audit reason
        <input
          maxLength={300}
          value={reason}
          disabled={busy || !connection}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button disabled={busy || !connection} onClick={() => void submit()}>
        Submit or retry audited action
      </button>
      <p role="status">{notice}</p>
    </section>
  );
}
