'use client';
import { useEffect, useRef, useState } from 'react';
import {
  operationalSummarySchema,
  type OperationalSummary,
} from '@deckforge/contracts';
export function OperationsBoard({ data }: { data: OperationalSummary }) {
  return (
    <section>
      <h2>Operational snapshot</h2>
      <p>
        Database snapshot: {data.generatedAt}. Rolling window starts{' '}
        {data.windowStart}. No client-reported wins or payment-success events
        are counted.
      </p>
      <h3>Server funnels</h3>
      <dl>
        {Object.entries(data.funnel).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>Weekly engaged collectors: {data.wec.count}</h3>
      <p>{data.wec.coverage}</p>
      <h3>Integrity exceptions requiring investigation</h3>
      <dl>
        <dt>Play Chip journal mismatches</dt>
        <dd>{data.integrity.playChipMismatches}</dd>
        <dt>Restricted journal mismatches</dt>
        <dd>{data.integrity.restrictedMismatches}</dd>
        <dt>Missing card origins</dt>
        <dd>{data.integrity.missingCardOrigins}</dd>
        <dt>Purchase/grant mismatches</dt>
        <dd>{data.integrity.purchaseGrantMismatches}</dd>
        <dt>Play Chip signed total (must reconcile to zero)</dt>
        <dd>{data.integrity.playChipTotal}</dd>
        {data.integrity.restrictedTotals.map((row) => (
          <div key={row.currency}>
            <dt>{row.currency} signed total</dt>
            <dd>{row.total}</dd>
          </div>
        ))}
      </dl>
      <h3>Recovery and review queues</h3>
      <dl>
        {Object.entries(data.queues).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3>HTTP latency in this API process</h3>
      <p>
        Since {data.latency.since}: {data.latency.requests} requests. p95 bucket
        upper bound:{' '}
        {data.latency.p95UpperMs === null
          ? 'unavailable or above 5,000 ms'
          : data.latency.p95UpperMs + ' ms'}
        . Process restart resets these observations; they are not a database
        revenue or cross-server metric.
      </p>
      <p>
        Zero integrity exceptions does not prove absence of fraud. Production
        purchase counts exclude sandbox; operational queues cover all stored
        environments. Actual recognized revenue is not inferred from catalog
        reference prices.
      </p>
    </section>
  );
}
export function OperationsDashboard({
  connection,
}: {
  connection?: { apiUrl: string; getAccessToken: () => Promise<string> };
}) {
  const [data, setData] = useState<OperationalSummary | null>(null),
    [reason, setReason] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    pending = useRef<{ id: string; reason: string } | null>(null),
    life = useRef<AbortController | null>(null),
    working = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    return () => c.abort();
  }, [connection]);
  async function read() {
    if (!connection || working.current) return;
    if (reason.trim().length < 8) {
      setNotice('Provide an audit reason of at least eight characters.');
      return;
    }
    if (pending.current && pending.current.reason !== reason) {
      setNotice('Retry with the original unconfirmed audit reason.');
      return;
    }
    working.current = true;
    setBusy(true);
    pending.current ??= { id: crypto.randomUUID(), reason };
    try {
      const url = new URL(connection.apiUrl);
      if (
        url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )
      )
        throw new Error('invalid endpoint');
      if (url.username || url.password || url.search || url.hash)
        throw new Error('invalid endpoint');
      const token = await connection.getAccessToken();
      if (!token) throw new Error('missing session');
      const response = await fetch(
        connection.apiUrl.replace(/\/$/, '') + '/v1/admin/operations/snapshot',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commandId: pending.current.id,
            reason: pending.current.reason,
          }),
          signal: life.current?.signal ?? null,
        },
      );
      if (!response.ok) {
        if (response.status < 500 && response.status !== 429)
          pending.current = null;
        throw new Error('denied');
      }
      const snapshot = operationalSummarySchema.parse(await response.json());
      if (!life.current?.signal.aborted) {
        pending.current = null;
        setData(snapshot);
        setNotice('Audited database snapshot loaded.');
      }
    } catch {
      if (!life.current?.signal.aborted)
        setNotice(
          'Snapshot denied or unconfirmed. Check scoped MFA access and retry.',
        );
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <section>
      <h2>Operations dashboard</h2>
      {!connection ? (
        <p>
          Connect an operator-provisioned AUDITOR session with MFA. No user data
          is loaded in this preview.
        </p>
      ) : null}
      <label>
        Snapshot audit reason
        <input
          value={reason}
          maxLength={300}
          disabled={!connection || busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button disabled={!connection || busy} onClick={() => void read()}>
        Load or retry audited snapshot
      </button>
      <p role="status">{notice}</p>
      {data ? <OperationsBoard data={data} /> : null}
    </section>
  );
}
