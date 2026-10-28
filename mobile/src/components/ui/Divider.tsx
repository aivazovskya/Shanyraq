import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface DividerProps {
  vertical?: boolean;
  style?: ViewStyle;
}

export const Divider: React.FC<DividerProps> = ({ vertical = false, style }) => {
  const { theme } = useTheme();

  return (
    <View
      style={[
        vertical ? styles.vertical : styles.horizontal,
        { backgroundColor: theme.colors.border },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  horizontal: {
    height: 1,
    width: '100%',
    marginVertical: 8,
  },
  vertical: {
    width: 1,
    height: '100%',
    marginHorizontal: 8,
  },
});
