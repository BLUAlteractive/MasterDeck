import { shellTheme } from '@deckforge/ui';
export default function Page() {
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 32 }}>
      <p style={{ color: shellTheme.accent }}>DECKFORGE · DEVELOPMENT</p>
      <h1>Administration starts here.</h1>
      <p>
        The local workspace is running. Catalog and moderation tools arrive in
        later milestones.
      </p>
      <p>This shell has no administrative actions or user data.</p>
    </main>
  );
}
