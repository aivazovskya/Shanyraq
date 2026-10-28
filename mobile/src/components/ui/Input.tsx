import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { AlertCircle } from 'lucide-react-native';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  helper?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  disabled?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  error,
  helper,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  disabled = false,
  onFocus,
  onBlur,
  ...rest
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<any>(null);

  const [isFocused, setIsFocused] = useState(false);
  const hasValue = Boolean(value && value.length > 0);

  const floatProgress = useSharedValue(hasValue ? 1 : 0);

  useEffect(() => {
    const target = isFocused || hasValue ? 1 : 0;
    if (reducedMotion) {
      floatProgress.value = target;
    } else {
      floatProgress.value = withTiming(target, { duration: 180 });
    }
  }, [isFocused, hasValue, reducedMotion, floatProgress]);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(floatProgress.value, [0, 1], [0, -14]);
    const scale = interpolate(floatProgress.value, [0, 1], [1, 0.78]);

    return {
      transform: [{ translateY }, { scale }],
    };
  }, [floatProgress]);

  const getBorderColor = () => {
    if (error) return theme.colors.danger;
    if (isFocused) return theme.colors.borderFocus;
    return theme.colors.border;
  };

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.inputContainer,
          {
            backgroundColor: disabled
              ? theme.isDark
                ? '#1E293B'
                : '#F1F5F9'
              : theme.colors.surface,
            borderColor: getBorderColor(),
            borderWidth: isFocused ? 2 : 1,
            borderRadius: theme.radii.lg,
          },
        ]}
      >
        {Boolean(leftIcon) && <View style={styles.leftSlot}>{leftIcon}</View>}

        <View style={styles.inputInnerWrap}>
          <Animated.Text
            style={[
              styles.floatingLabel,
              {
                color: error
                  ? theme.colors.danger
                  : isFocused
                  ? theme.colors.borderFocus
                  : theme.colors.textMuted,
              },
              labelAnimatedStyle,
            ]}
            pointerEvents="none"
          >
            {label}
          </Animated.Text>

          <TextInput
            ref={inputRef}
            value={value}
            editable={!disabled}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[
              styles.textInput,
              {
                color: theme.colors.text,
                paddingTop: hasValue || isFocused ? 14 : 0,
              },
              inputStyle,
            ]}
            placeholderTextColor={theme.colors.textLight}
            accessibilityLabel={label}
            {...rest}
          />
        </View>

        {Boolean(rightIcon) && <View style={styles.rightSlot}>{rightIcon}</View>}
      </Pressable>

      {Boolean(error) ? (
        <View style={styles.messageRow}>
          <AlertCircle size={14} color={theme.colors.danger} />
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
        </View>
      ) : Boolean(helper) ? (
        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>{helper}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  leftSlot: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputInnerWrap: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  floatingLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 15,
    fontWeight: '500',
    transformOrigin: 'left center',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
  },
  rightSlot: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
});
