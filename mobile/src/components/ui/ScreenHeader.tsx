import React from 'react';
import { StyleSheet, View, ViewStyle, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from './AppText';
import { IconButton } from './IconButton';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  transparent?: boolean;
  withSafeArea?: boolean;
  style?: ViewStyle;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  onBack,
  showBack,
  leftElement,
  rightElement,
  transparent = false,
  withSafeArea = true,
  style,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const canGoBack = navigation?.canGoBack ? navigation.canGoBack() : false;
  const shouldShowBack = showBack !== undefined ? showBack : Boolean(onBack || canGoBack);

  const handleBack = () => {
    safeHaptic.selection();
    if (onBack) {
      onBack();
    } else if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const topPadding = withSafeArea ? Math.max(insets.top, Platform.OS === 'web' ? 12 : 16) + 4 : 0;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: topPadding,
          backgroundColor: transparent ? 'transparent' : theme.colors.surface,
          borderBottomColor: transparent ? 'transparent' : theme.colors.border,
          borderBottomWidth: transparent ? 0 : 1,
        },
        style,
      ]}
    >
      <View style={styles.contentRow}>
        <View style={styles.leftSlot}>
          {leftElement ? (
            leftElement
          ) : shouldShowBack ? (
            <IconButton
              icon={<ArrowLeft size={22} color={theme.colors.text} />}
              accessibilityLabel={t('common.back')}
              onPress={handleBack}
              variant="ghost"
              size={40}
            />
          ) : null}
        </View>

        <View style={styles.centerSlot}>
          <Text
            style={[
              styles.title,
              { color: theme.colors.text },
              theme.typography.headline,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {Boolean(subtitle) && (
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.rightSlot}>
          {rightElement || null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 10,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  leftSlot: {
    minWidth: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    marginHorizontal: 8,
    justifyContent: 'center',
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 1,
  },
  rightSlot: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
