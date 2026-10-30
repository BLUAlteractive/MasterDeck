import { Pressable, Text, StyleSheet } from 'react-native';
import { shellTheme } from '@deckforge/ui';
export function Action({
  label,
  onPress,
  selected = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    backgroundColor: shellTheme.surface,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#607682',
    borderRadius: 10,
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: shellTheme.accent,
    borderColor: shellTheme.accent,
  },
  disabled: { opacity: 0.45 },
  label: { fontSize: 15, color: shellTheme.text },
  selectedLabel: { color: shellTheme.background, fontWeight: '700' },
});
