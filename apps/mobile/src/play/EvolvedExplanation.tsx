import { useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import {
  evolvedExplanationSchema,
  type EvolvedExplanationView,
} from '@deckforge/contracts';
export function EvolvedExplanation({
  explanation,
}: {
  explanation: EvolvedExplanationView;
}) {
  const view = evolvedExplanationSchema.parse(explanation);
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text accessibilityRole="header">
        Evolved power explanation — experimental
      </Text>
      <Text>
        Rules: {view.rulesetVersion}. Effects: {view.effectsVersion}.
      </Text>
      <Text accessible accessibilityLabel={view.summary}>
        {view.summary}
      </Text>
      <Text>
        All 21 candidate hands were evaluated. Power is capped; this analysis
        does not settle chips.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide candidate details' : 'Show all 21 candidate details'
        }
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text>
          {expanded
            ? 'Hide candidate details'
            : 'Show all 21 candidate details'}
        </Text>
      </Pressable>
      {(expanded
        ? view.candidates
        : view.candidates.filter((candidate) => candidate.selected)
      ).map((candidate) => (
        <View key={[...candidate.cards].sort().join(',')}>
          <Text
            accessible
            accessibilityLabel={`${candidate.selected ? 'Selected candidate. ' : ''}${candidate.description}`}
          >
            {candidate.selected ? 'Selected: ' : ''}
            {candidate.cards.join(', ')}. {candidate.description}
          </Text>
        </View>
      ))}
    </View>
  );
}
