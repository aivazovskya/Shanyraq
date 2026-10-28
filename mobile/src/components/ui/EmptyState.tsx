import React from 'react';
import { StyleSheet, View, Text, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionTitle?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionTitle,
  onActionPress,
  style,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {/* Geometric modern SVG illustration */}
      <View style={styles.svgWrap}>
        <Svg width={120} height={120} viewBox="0 0 120 120" fill="none">
          <Circle
            cx="60"
            cy="60"
            r="54"
            fill={theme.isDark ? '#064E3B' : '#ECFDF5'}
            opacity={0.6}
          />
          <Rect
            x="36"
            y="48"
            width="48"
            height="44"
            rx="8"
            fill={theme.isDark ? '#1F2937' : '#FFFFFF'}
            stroke={theme.colors.border}
            strokeWidth="2"
          />
          {/* Shanyraq Roof peak */}
          <Path
            d="M32 48L60 26L88 48"
            stroke={theme.colors.primary}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx="60" cy="38" r="4" fill={theme.colors.primary} />
          {/* Interior lines */}
          <Rect
            x="44"
            y="58"
            width="12"
            height="12"
            rx="3"
            fill={theme.isDark ? '#374151' : '#F1F5F9'}
          />
          <Rect
            x="64"
            y="58"
            width="12"
            height="12"
            rx="3"
            fill={theme.isDark ? '#374151' : '#F1F5F9'}
          />
          <Rect
            x="54"
            y="76"
            width="12"
            height="16"
            rx="2"
            fill={theme.colors.primaryLight}
          />
        </Svg>
      </View>

      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {Boolean(description) && (
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {description}
        </Text>
      )}

      {Boolean(actionTitle && onActionPress) && (
        <Button
          title={actionTitle!}
          onPress={onActionPress!}
          variant="secondary"
          size="sm"
          style={styles.actionBtn}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  svgWrap: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 280,
  },
  actionBtn: {
    marginTop: 16,
  },
});
