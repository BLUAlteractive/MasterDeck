import type { ReactNode } from 'react';
import { shellTheme } from '@deckforge/ui';
export const metadata = { title: 'DeckForge · Admin development shell' };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: shellTheme.background,
          color: shellTheme.text,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
