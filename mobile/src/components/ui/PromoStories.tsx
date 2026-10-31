import React from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './AppText';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';

export interface PromoStoryItem {
  id: string;
  tag?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  gradientColors?: [string, string, ...string[]];
  testID?: string;
}

export interface PromoStoriesProps {
  items: PromoStoryItem[];
  style?: ViewStyle;
}

export const PromoStories: React.FC<PromoStoriesProps> = ({ items, style }) => {
  const { theme } = useTheme();

  if (!items || items.length === 0) return null;

  const defaultGradients: [string, string][] = theme.isDark
    ? [
        ['#16303F', '#0F2231'],
        ['#1A4058', '#0E293B'],
        ['#1B382F', '#0D261E'],
        ['#362818', '#23180D'],
      ]
    : [
        ['#EAF4FB', '#D6EAF8'],
        ['#EDF7F2', '#DDF0E8'],
        ['#FEF9E7', '#FDEEC9'],
        ['#F4F6F8', '#EAEFF2'],
      ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, style]}
    >
      {items.map((item, index) => {
        const colors = item.gradientColors || defaultGradients[index % defaultGradients.length];

        return (
          <TouchableOpacity
            key={item.id}
            testID={item.testID}
            activeOpacity={0.88}
            onPress={() => {
              safeHaptic.selection();
              item.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.tag || ''} ${item.title}`}
            style={[styles.cardWrapper, { borderColor: theme.colors.border }]}
          >
            <LinearGradient
              colors={colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardContent}
            >
              <View style={styles.topRow}>
                {Boolean(item.tag) && (
                  <View
                    style={[
                      styles.tagBadge,
                      {
                        backgroundColor: theme.isDark
                          ? 'rgba(255, 255, 255, 0.12)'
                          : 'rgba(26, 107, 170, 0.12)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        {
                          color: theme.isDark
                            ? theme.colors.primary
                            : theme.colors.primaryDark,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.tag}
                    </Text>
                  </View>
                )}
                {item.icon && <View style={styles.iconWrap}>{item.icon}</View>}
              </View>

              <Text
                style={[
                  styles.title,
                  { color: theme.colors.text },
                  theme.typography.callout,
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>

              {Boolean(item.subtitle) && (
                <Text
                  style={[
                    styles.subtitle,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                  numberOfLines={1}
                >
                  {item.subtitle}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 10,
  },
  cardWrapper: {
    width: 148,
    height: 102,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iconWrap: {
    marginLeft: 4,
  },
  title: {
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 4,
  },
  subtitle: {
    marginTop: 2,
  },
});
