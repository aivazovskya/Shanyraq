import React from 'react';
import { StyleSheet, View, Text, Image, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

export interface AvatarProps {
  name?: string;
  imageUri?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  style?: ViewStyle;
}

export const Avatar: React.FC<AvatarProps> = ({
  name = '',
  imageUri,
  size = 'md',
  style,
}) => {
  const { theme } = useTheme();

  const getDimensions = () => {
    switch (size) {
      case 'sm':
        return { dimension: 34, fontSize: 13 };
      case 'lg':
        return { dimension: 58, fontSize: 22 };
      case 'xl':
        return { dimension: 76, fontSize: 28 };
      case 'md':
      default:
        return { dimension: 46, fontSize: 17 };
    }
  };

  const { dimension, fontSize } = getDimensions();

  const getInitials = (str: string): string => {
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return 'Ш';
  };

  const initials = getInitials(name);

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: theme.colors.primary,
        },
        style,
      ]}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`Аватар ${name}`}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
        />
      ) : (
        <Text style={[styles.initials, { fontSize, color: theme.colors.onPrimary }]}>
          {initials}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  initials: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
