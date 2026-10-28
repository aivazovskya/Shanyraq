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
  Platform,
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
  onChangeText,
  placeholder,
  ...rest
}) => {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<any>(null);

  const [isFocused, setIsFocused] = useState(false);
  const [internalValue, setInternalValue] = useState(rest.defaultValue ? String(rest.defaultValue) : '');
  const currentValue = value !== undefined ? value : internalValue;
  const hasValue = Boolean(currentValue !== null && currentValue !== undefined && String(currentValue).length > 0);

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

  const handleChangeText = (text: string) => {
    if (value === undefined) {
      setInternalValue(text);
    }
    if (onChangeText) {
      onChangeText(text);
    }
  };

  const labelAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      floatProgress.value,
      [0, 1],
      [0, rest.multiline ? -8 : -13],
    );
    const scale = interpolate(floatProgress.value, [0, 1], [1, 0.78]);

    return {
      transform: [{ translateY }, { scale }],
    };
  }, [floatProgress, rest.multiline]);

  const getBorderColor = () => {
    if (error) return theme.colors.danger;
    if (isFocused) return theme.colors.borderFocus;
    return theme.colors.border;
  };

  // When field is empty and not focused, placeholder is hidden so floating label acts as placeholder
  const showPlaceholder = isFocused || !label;
  const effectivePlaceholder = showPlaceholder ? placeholder : '';

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.inputContainer,
          rest.multiline && styles.inputContainerMultiline,
          {
            backgroundColor: disabled
              ? theme.colors.surfaceSubtle
              : theme.colors.surface,
            borderColor: getBorderColor(),
            borderWidth: isFocused ? 2 : 1,
            borderRadius: theme.radii.lg,
          },
        ]}
      >
        {Boolean(leftIcon) && (
          <View style={[styles.leftSlot, rest.multiline && styles.leftSlotMultiline]}>
            {leftIcon}
          </View>
        )}

        <View style={[styles.inputInnerWrap, rest.multiline && styles.inputInnerWrapMultiline]}>
          {Boolean(label) && (
            <Animated.Text
              style={[
                styles.floatingLabel,
                rest.multiline && styles.floatingLabelMultiline,
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
          )}

          <TextInput
            ref={inputRef}
            {...rest}
            value={value}
            defaultValue={rest.defaultValue}
            editable={!disabled}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChangeText={handleChangeText}
            placeholder={effectivePlaceholder}
            placeholderTextColor={theme.colors.textLight}
            accessibilityLabel={label || placeholder || rest.accessibilityLabel}
            aria-label={label || placeholder || rest.accessibilityLabel}
            style={[
              styles.textInput,
              rest.multiline && styles.textInputMultiline,
              inputStyle,
              {
                color: theme.colors.text,
                paddingTop: rest.multiline
                  ? hasValue || isFocused
                    ? 22
                    : 6
                  : hasValue || isFocused
                  ? 14
                  : 0,
              },
              Platform.OS === 'web'
                ? ({
                    outlineStyle: 'none',
                    outlineWidth: 0,
                  } as any)
                : null,
            ]}
          />
        </View>

        {Boolean(rightIcon) && (
          <View style={[styles.rightSlot, rest.multiline && styles.rightSlotMultiline]}>
            {rightIcon}
          </View>
        )}
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
  inputContainerMultiline: {
    alignItems: 'flex-start',
    minHeight: 100,
    paddingVertical: 10,
  },
  leftSlot: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftSlotMultiline: {
    marginTop: 6,
  },
  inputInnerWrap: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  inputInnerWrapMultiline: {
    justifyContent: 'flex-start',
    minHeight: 80,
  },
  floatingLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 15,
    fontWeight: '500',
    transformOrigin: 'left center',
  },
  floatingLabelMultiline: {
    top: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
        } as any)
      : {}),
  },
  textInputMultiline: {
    textAlignVertical: 'top',
    paddingBottom: 8,
  },
  rightSlot: {
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSlotMultiline: {
    marginTop: 6,
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
