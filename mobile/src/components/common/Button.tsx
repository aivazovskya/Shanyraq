import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { Colors } from '../../constants/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}) => {
  const getContainerStyle = (): any[] => {
    const base: any[] = [styles.button, styles[`btn_${size}`]];

    if (variant === 'primary') base.push(styles.btn_primary);
    else if (variant === 'secondary') base.push(styles.btn_secondary);
    else if (variant === 'danger') base.push(styles.btn_danger);
    else if (variant === 'outline') base.push(styles.btn_outline);

    if (disabled || loading) base.push(styles.btn_disabled);
    if (style) base.push(style);

    return base;
  };

  const getTextStyle = (): any[] => {
    const base: any[] = [styles.text, styles[`text_${size}`]];

    if (variant === 'primary' || variant === 'danger') base.push(styles.text_white);
    else if (variant === 'secondary') base.push(styles.text_dark);
    else if (variant === 'outline') base.push(styles.text_primary);

    if (disabled) base.push(styles.text_disabled);
    if (textStyle) base.push(textStyle);

    return base;
  };

  return (
    <TouchableOpacity
      style={getContainerStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFFFFF' : Colors.primary}
        />
      ) : (
        <>
          {icon}
          <Text style={getTextStyle()}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btn_sm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btn_md: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  btn_lg: {
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  btn_primary: {
    backgroundColor: Colors.primary,
  },
  btn_secondary: {
    backgroundColor: Colors.border,
  },
  btn_danger: {
    backgroundColor: Colors.danger,
  },
  btn_outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  btn_disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  text_sm: {
    fontSize: 13,
  },
  text_md: {
    fontSize: 16,
  },
  text_lg: {
    fontSize: 18,
  },
  text_white: {
    color: '#FFFFFF',
  },
  text_dark: {
    color: Colors.text,
  },
  text_primary: {
    color: Colors.primary,
  },
  text_disabled: {
    color: Colors.textMuted,
  },
});
