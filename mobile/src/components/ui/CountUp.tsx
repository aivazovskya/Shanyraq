import React, { useEffect, useState } from 'react';
import { Text, TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';

export interface CountUpProps {
  value: number;
  duration?: number;
  currency?: string;
  style?: TextStyle;
}

export const CountUp: React.FC<CountUpProps> = ({
  value,
  duration = 900,
  currency = '₸',
  style,
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(value);
      return;
    }

    let start = 0;
    const end = value;
    const startTime = performance.now();

    let animationFrameId: number;

    const updateCounter = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * easeProgress);

      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(updateCounter);
      } else {
        setDisplayValue(end);
      }
    };

    animationFrameId = requestAnimationFrame(updateCounter);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [value, duration, reducedMotion]);

  const formatted = displayValue.toLocaleString('ru-RU');

  return (
    <Text
      style={[
        {
          color: theme.colors.text,
          ...theme.typography.tabularNums,
        },
        style,
      ]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={`${value} ${currency}`}
    >
      {formatted} {currency}
    </Text>
  );
};
