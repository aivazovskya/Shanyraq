import React from 'react';
import { StyleSheet, View, Text, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { Button } from './Button';
import { RotateCcw } from 'lucide-react-native';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  retryTitle?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Произошла ошибка',
  message = 'Не удалось загрузить данные. Попробуйте обновить экран.',
  retryTitle = 'Повторить попытку',
  onRetry,
  style,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.svgWrap}>
        <Svg width={100} height={100} viewBox="0 0 100 100" fill="none">
          <Circle
            cx="50"
            cy="50"
            r="44"
            fill={theme.isDark ? '#450A0A' : '#FEF2F2'}
            stroke={theme.isDark ? '#7F1D1D' : '#FCA5A5'}
            strokeWidth="2"
          />
          <Path
            d="M50 32V54"
            stroke={theme.colors.danger}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <Circle cx="50" cy="66" r="2.5" fill={theme.colors.danger} />
        </Svg>
      </View>

      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>

      {Boolean(onRetry) && (
        <Button
          title={retryTitle}
          onPress={onRetry!}
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw size={15} color={theme.colors.text} />}
          style={styles.retryBtn}
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
  message: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 280,
  },
  retryBtn: {
    marginTop: 18,
  },
});
