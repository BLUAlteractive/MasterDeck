import { Text as NativeText, View } from 'react-native';
import type { ComponentProps } from 'react';
import { shellTheme } from '@deckforge/ui';
function Text(props: ComponentProps<typeof NativeText>) {
  return (
    <NativeText
      {...props}
      style={[
        { color: shellTheme.text, fontSize: 16, lineHeight: 24 },
        props.style,
      ]}
    />
  );
}
import {
  pokerRulesVersions,
  type PokerMode,
  type PokerViewResponse,
} from '@deckforge/contracts';
import { getFace } from '@deckforge/game-core';
export function PokerMatchScreen({
  mode,
  rulesetVersion,
  view,
}: {
  mode: PokerMode;
  rulesetVersion: string;
  view?: PokerViewResponse;
}) {
  if (
    rulesetVersion !== pokerRulesVersions[mode] ||
    (view && (mode !== 'CLASSIC' || view.rulesetVersion !== rulesetVersion))
  )
    throw new Error('Mismatched match rules');
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text accessibilityRole="header">
        {mode === 'CLASSIC'
          ? "Classic Hold'em"
          : "Evolved Hold'em — experimental"}
      </Text>
      <Text>Rules: {rulesetVersion}</Text>
      <Text>
        {mode === 'CLASSIC'
          ? 'Standard poker ranking. Rarity and card upgrades never change the winner.'
          : 'Collectible bonuses apply only to included earned hole cards. Live Evolved play is unavailable pending balancing review.'}
      </Text>
      {view ? (
        <>
          <Text>
            Hand phase: {view.street}. State version: {view.stateVersion}.
          </Text>
          <Text>
            Blinds: {view.smallBlind}/{view.bigBlind} earned Play Chips. Current
            bet: {view.currentBet}.
          </Text>
          <Text>
            Board:{' '}
            {view.board.length
              ? view.board.map((face) => getFace(face).label).join(', ')
              : 'not dealt yet'}
            .
          </Text>
          {view.players.map((player, seat) => (
            <Text key={player.id}>
              Seat {seat + 1}
              {view.dealer === seat ? ' (dealer)' : ''}:
              {player.hole
                ? player.hole.map((face) => getFace(face).label).join(', ')
                : 'Hidden cards'}
              . Play Chips: {player.stack}. Committed: {player.committed}.
              Street bet: {player.streetBet}. {player.folded ? 'Folded.' : ''}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}
