import React from 'react';
import { StyleSheet, View, TouchableOpacity, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from './AppText';
import { Badge } from './Badge';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';

export interface SectionTitleProps {
  title: string;
  subtitle?: string;
  badge?: string | number;
  actionText?: string;
  onActionPress?: () => void;
  style?: ViewStyle;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  title,
  subtitle,
  badge,
  actionText,
  onActionPress,
  style,
}) => {
  const { theme } = useTheme();

  const handleAction = () => {
    safeHaptic.selection();
    if (onActionPress) onActionPress();
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleWrap}>
        <View style={styles.headingRow}>
          <Text
            style={[
              styles.title,
              { color: theme.colors.text },
              theme.typography.title,
            ]}
          >
            {title}
          </Text>
          {badge !== undefined && (
            <Badge
              label={String(badge)}
              variant="neutral"
              size="sm"
              style={styles.badge}
            />
          )}
        </View>
        {Boolean(subtitle) && (
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted },
              theme.typography.caption,
            ]}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {Boolean(actionText && onActionPress) && (
        <TouchableOpacity
          onPress={handleAction}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={actionText}
        >
          <Text style={[styles.actionText, { color: theme.colors.primary }, theme.typography.callout]}>
            {actionText}
          </Text>
          <ChevronRight size={16} color={theme.colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  titleWrap: {
    flex: 1,
    marginRight: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  badge: {
    marginLeft: 2,
  },
  subtitle: {
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontWeight: '600',
  },
});
