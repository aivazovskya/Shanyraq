import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { useState } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  containerStyle?: StyleProp<ViewStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helper,
  containerStyle,
  leftIcon,
  rightIcon,
  style,
  onFocus,
  onBlur,
  multiline,
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrapper, multiline && styles.multilineWrapper, focused && styles.inputFocused, error ? styles.inputError : null]}>
        {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}
        <TextInput
          style={[styles.input, multiline && styles.multilineInput, style]}
          multiline={multiline}
          placeholderTextColor={Colors.textLight}
          accessibilityLabel={label}
          accessibilityHint={error || helper}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          {...props}
        />
        {rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>}
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  inputWrapper: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  inputFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  multilineWrapper: { alignItems: 'flex-start' },
  multilineInput: { minHeight: 112, textAlignVertical: 'top' },
  iconContainer: {
    marginHorizontal: 4,
  },
  input: {
    flex: 1,
    outlineWidth: 0,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
