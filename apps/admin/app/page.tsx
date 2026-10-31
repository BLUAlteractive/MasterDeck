import { OperationsDashboard } from './operations-dashboard';
import { ContentWorkbench } from './content-workbench';
import { shellTheme } from '@deckforge/ui';
export default function Page() {
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 32 }}>
      <p style={{ color: shellTheme.accent }}>DECKFORGE · DEVELOPMENT</p>
      <h1>DeckForge administration</h1>
      <p>
        The local workspace is running. Content commands require scoped,
        verified MFA access.
      </p>
      <ContentWorkbench />
      <OperationsDashboard />
    </main>
  );
}
