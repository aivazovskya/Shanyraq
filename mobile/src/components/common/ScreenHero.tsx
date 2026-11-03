import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';

/** Shared introduction for resident tab screens; children can contain actions. */
export function ScreenHero({ title, subtitle, children, style }: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.container, style]}>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    {children && <View style={styles.content}>{children}</View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { padding: 20, borderRadius: 24, backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primaryLight, marginBottom: 16 },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.6, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 14, lineHeight: 21, color: Colors.textMuted, marginTop: 6 },
  content: { marginTop: 18 },
});
