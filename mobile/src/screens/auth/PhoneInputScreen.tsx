import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Colors } from '../../constants/colors';
import { Building2, Phone } from 'lucide-react-native';

type Props = NativeStackScreenProps<AuthStackParamList, 'PhoneInput'>;

export const PhoneInputScreen: React.FC<Props> = ({ navigation }) => {
  const [phone, setPhone] = useState('+7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhoneNumber = (text: string) => {
    // Ensure always starts with +7
    let cleaned = text.replace(/[^\d+]/g, '');
    if (!cleaned.startsWith('+7')) {
      cleaned = '+7' + cleaned.replace(/^\+?7?/, '');
    }
    // Limit to +7 + 10 digits
    if (cleaned.length > 12) {
      cleaned = cleaned.slice(0, 12);
    }
    return cleaned;
  };

  const handlePhoneChange = (val: string) => {
    setError('');
    setPhone(formatPhoneNumber(val));
  };

  const handleSendOtp = async () => {
    if (phone.length < 12) {
      setError('Введите полный номер телефона (10 цифр после +7)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await AuthApi.requestOtp(phone);
      if (res.devCode) {
        Alert.alert('Тестовый SMS-код', `Для быстрого входа в dev-режиме: ${res.devCode}`);
      }
      navigation.navigate('OtpVerify', { phone });
    } catch (err: any) {
      const msg = getApiErrorMessage(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Building2 color="#FFFFFF" size={36} />
          </View>
          <Text style={styles.title}>Шаңырақ</Text>
          <Text style={styles.subtitle}>
            Единое мобильное приложение для собственников и жителей жилых комплексов
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Номер телефона"
            value={phone}
            onChangeText={handlePhoneChange}
            keyboardType="phone-pad"
            placeholder="+7 701 123 45 67"
            error={error}
            helper="На указанный номер поступит SMS с одноразовым кодом"
            leftIcon={<Phone color={Colors.textMuted} size={20} />}
          />

          <Button
            title="Получить код по SMS"
            onPress={handleSendOtp}
            loading={loading}
            size="lg"
            style={styles.button}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 280,
  },
  form: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  button: {
    marginTop: 8,
  },
});
