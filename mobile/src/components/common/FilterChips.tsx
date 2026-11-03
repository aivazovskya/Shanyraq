import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

export function FilterChips<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return <View style={styles.row}>
    {options.map(option => <TouchableOpacity key={option.value} onPress={() => onChange(option.value)}
      accessibilityRole="tab" aria-selected={value === option.value} accessibilityState={{ selected: value === option.value }}
      style={[styles.chip, value === option.value && styles.active]}>
      <Text style={[styles.label, value === option.value && styles.activeLabel]}>{option.label}</Text>
    </TouchableOpacity>)}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, maxWidth: '100%' },
  active: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  activeLabel: { color: '#FFFFFF' },
});
