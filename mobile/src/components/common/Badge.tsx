import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { Colors } from '../../constants/colors';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'default',
  style,
  textStyle,
}) => {
  const getBadgeStyle = (): any[] => {
    const base: any[] = [styles.badge];
    if (variant === 'success') base.push(styles.bg_success);
    else if (variant === 'warning') base.push(styles.bg_warning);
    else if (variant === 'danger') base.push(styles.bg_danger);
    else if (variant === 'info') base.push(styles.bg_info);
    else base.push(styles.bg_default);

    if (style) base.push(style);
    return base;
  };

  const getTextStyle = (): any[] => {
    const base: any[] = [styles.text];
    if (variant === 'success') base.push(styles.text_success);
    else if (variant === 'warning') base.push(styles.text_warning);
    else if (variant === 'danger') base.push(styles.text_danger);
    else if (variant === 'info') base.push(styles.text_info);
    else base.push(styles.text_default);

    if (textStyle) base.push(textStyle);
    return base;
  };

  return (
    <View style={getBadgeStyle()}>
      <Text style={getTextStyle()}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  bg_success: {
    backgroundColor: Colors.successBg,
  },
  text_success: {
    color: '#065F46',
  },
  bg_warning: {
    backgroundColor: Colors.warningBg,
  },
  text_warning: {
    color: '#92400E',
  },
  bg_danger: {
    backgroundColor: Colors.dangerBg,
  },
  text_danger: {
    color: '#991B1B',
  },
  bg_info: {
    backgroundColor: Colors.infoBg,
  },
  text_info: {
    color: '#1E40AF',
  },
  bg_default: {
    backgroundColor: Colors.border,
  },
  text_default: {
    color: Colors.text,
  },
});
