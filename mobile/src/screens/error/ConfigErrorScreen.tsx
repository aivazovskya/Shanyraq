import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Terminal } from 'lucide-react-native';
import { Config } from '../../constants/config';

export const ConfigErrorScreen: React.FC = () => {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconWrap}>
          <AlertTriangle size={48} color="#DC2626" />
        </View>

        <Text style={styles.title}>{t('configError.title')}</Text>
        <Text style={styles.subtitle}>{t('configError.subtitle')}</Text>

        <View style={styles.card}>
          <Text style={styles.description}>
            {t('configError.description')}
          </Text>

          <View style={styles.terminalBox}>
            <View style={styles.terminalHeader}>
              <Terminal size={14} color="#94A3B8" />
              <Text style={styles.terminalLabel}>{t('configError.envLabel')}</Text>
            </View>
            <Text style={styles.terminalCode}>{t('configError.envExample')}</Text>
          </View>

          <Text style={styles.instruction}>
            {t('configError.instruction')}
          </Text>
          <Text style={styles.subInstruction}>
            {t('configError.subInstruction')}
          </Text>
        </View>

        {Boolean(Config.configErrorMessage) && (
          <Text style={styles.logNotice}>
            [Log] {Config.configErrorMessage}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#450A0A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#B91C1C',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#E2E8F0',
    marginBottom: 16,
  },
  terminalBox: {
    backgroundColor: '#090D16',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  terminalLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  terminalCode: {
    fontSize: 13,
    color: '#34D399',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  instruction: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '600',
    marginBottom: 8,
  },
  subInstruction: {
    fontSize: 13,
    lineHeight: 20,
    color: '#94A3B8',
  },
  logNotice: {
    marginTop: 20,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
