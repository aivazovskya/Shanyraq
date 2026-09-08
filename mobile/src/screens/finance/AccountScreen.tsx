import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  Calendar,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  Info,
  Building,
  Home,
  AlertCircle,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { LoadingState } from '../../components/common/LoadingState';
import { financeApi, PersonalAccountData } from '../../api/finance';

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();

  const [accounts, setAccounts] = useState<PersonalAccountData[]>([]);
  const [selectedAccountIndex, setSelectedAccountIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'charges' | 'payments'>('charges');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      setError(null);
      const data = await financeApi.getMyAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || t('finance.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAccounts();
  };

  if (loading) {
    return <LoadingState message={t('common.loading')} />;
  }

  const currentAccount = accounts[selectedAccountIndex] || null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back', 'Назад')}
        >
          <ChevronLeft color="#0F172A" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('finance.title')}</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: '#FEE2E2' }]}>
              <AlertCircle color={Colors.danger} size={32} />
            </View>
            <Text style={styles.emptyTitle}>{t('common.error')}</Text>
            <Text style={styles.emptyDesc}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadAccounts}>
              <Text style={styles.retryButtonText}>{t('common.refresh')}</Text>
            </TouchableOpacity>
          </View>
        ) : !currentAccount ? (
          // Empty State for non-owners or residents without verified ownership
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <CreditCard color={Colors.textMuted} size={36} />
            </View>
            <Text style={styles.emptyTitle}>{t('finance.emptyTitle')}</Text>
            <Text style={styles.emptyDesc}>{t('finance.emptyDesc')}</Text>
          </View>
        ) : (
          <>
            {/* Account Selector if multiple units owned */}
            {accounts.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.accountSelector}
                contentContainerStyle={styles.accountSelectorContent}
              >
                {accounts.map((acc, index) => {
                  const isSelected = index === selectedAccountIndex;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.accountPill,
                        isSelected && styles.accountPillSelected,
                      ]}
                      onPress={() => setSelectedAccountIndex(index)}
                    >
                      <Home
                        color={isSelected ? '#FFFFFF' : Colors.textMuted}
                        size={14}
                      />
                      <Text
                        style={[
                          styles.accountPillText,
                          isSelected && styles.accountPillTextSelected,
                        ]}
                      >
                        {t('common.unitShort')} {acc.unit.unitNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Main Balance Card */}
            <View
              style={[
                styles.balanceCard,
                currentAccount.balance < 0
                  ? styles.balanceCardDebt
                  : currentAccount.balance > 0
                  ? styles.balanceCardCredit
                  : styles.balanceCardZero,
              ]}
            >
              <View style={styles.balanceHeader}>
                <View style={styles.balanceHeaderLeft}>
                  <Text style={styles.accountNumberLabel}>
                    {t('finance.accountNumber', { number: currentAccount.accountNumber })}
                  </Text>
                  <Text style={styles.unitInfoText}>
                    {t('common.unitShort')} {currentAccount.unit.unitNumber} •{' '}
                    {currentAccount.unit.building.blockName} • {currentAccount.unit.area}{' '}
                    {t('common.sqm')}
                  </Text>
                </View>

                <View style={styles.balanceIconCircle}>
                  {currentAccount.balance < 0 ? (
                    <ArrowDownLeft color={Colors.danger} size={20} />
                  ) : currentAccount.balance > 0 ? (
                    <ArrowUpRight color={Colors.primary} size={20} />
                  ) : (
                    <CreditCard color={Colors.textMuted} size={20} />
                  )}
                </View>
              </View>

              <View style={styles.balanceValueContainer}>
                <Text style={styles.balanceStatusText}>
                  {currentAccount.balance < 0
                    ? t('finance.statusDebt')
                    : currentAccount.balance > 0
                    ? t('finance.statusCredit')
                    : t('finance.statusZero')}
                </Text>
                <Text
                  style={[
                    styles.balanceAmountText,
                    currentAccount.balance < 0
                      ? styles.textDebt
                      : currentAccount.balance > 0
                      ? styles.textCredit
                      : styles.textZero,
                  ]}
                >
                  {currentAccount.balance < 0
                    ? `-${Math.abs(currentAccount.balance).toLocaleString()} ₸`
                    : currentAccount.balance > 0
                    ? `+${currentAccount.balance.toLocaleString()} ₸`
                    : '0 ₸'}
                </Text>
              </View>
            </View>

            {/* Offline Payment Notice */}
            <View style={styles.noticeBox}>
              <Info color={Colors.info} size={18} style={styles.noticeIcon} />
              <Text style={styles.noticeText}>{t('finance.offlineNotice')}</Text>
            </View>

            {/* Tabs: Charges vs Payments */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'charges' && styles.tabButtonActive]}
                onPress={() => setActiveTab('charges')}
              >
                <Calendar
                  color={activeTab === 'charges' ? Colors.primary : Colors.textMuted}
                  size={16}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'charges' && styles.tabButtonTextActive,
                  ]}
                >
                  {t('finance.tabCharges')} ({currentAccount.charges?.length || 0})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'payments' && styles.tabButtonActive]}
                onPress={() => setActiveTab('payments')}
              >
                <Coins
                  color={activeTab === 'payments' ? Colors.primary : Colors.textMuted}
                  size={16}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'payments' && styles.tabButtonTextActive,
                  ]}
                >
                  {t('finance.tabPayments')} ({currentAccount.payments?.length || 0})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content: Charges */}
            {activeTab === 'charges' && (
              <View style={styles.listSection}>
                {!currentAccount.charges || currentAccount.charges.length === 0 ? (
                  <View style={styles.emptyTabContainer}>
                    <Text style={styles.emptyTabText}>{t('finance.noCharges')}</Text>
                  </View>
                ) : (
                  currentAccount.charges.map((charge) => (
                    <View key={charge.id} style={styles.itemRow}>
                      <View style={styles.itemLeft}>
                        <Text style={styles.itemTitle}>{charge.tariffItem?.name || '—'}</Text>
                        <Text style={styles.itemSubtitle}>
                          {t('finance.period')}: {String(charge.periodMonth).padStart(2, '0')}.
                          {charge.periodYear} •{' '}
                          {new Date(charge.createdAt).toLocaleDateString(
                            i18n.language === 'kk'
                              ? 'kk-KZ'
                              : i18n.language === 'en'
                              ? 'en-US'
                              : 'ru-RU',
                          )}
                        </Text>
                      </View>
                      <Text style={styles.itemChargeAmount}>
                        {charge.amount.toLocaleString()} ₸
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Tab Content: Payments */}
            {activeTab === 'payments' && (
              <View style={styles.listSection}>
                {!currentAccount.payments || currentAccount.payments.length === 0 ? (
                  <View style={styles.emptyTabContainer}>
                    <Text style={styles.emptyTabText}>{t('finance.noPayments')}</Text>
                  </View>
                ) : (
                  currentAccount.payments.map((payment) => (
                    <View key={payment.id} style={styles.itemRow}>
                      <View style={styles.itemLeft}>
                        <Text style={styles.itemTitle}>
                          {new Date(payment.paidAt).toLocaleDateString(
                            i18n.language === 'kk'
                              ? 'kk-KZ'
                              : i18n.language === 'en'
                              ? 'en-US'
                              : 'ru-RU',
                          )}
                        </Text>
                        <Text style={styles.itemSubtitle}>
                          {payment.note || t('finance.methodManual', 'Касса ОСИ / перевод')}
                        </Text>
                      </View>
                      <Text style={styles.itemPaymentAmount}>
                        +{payment.amount.toLocaleString()} ₸
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRightPlaceholder: {
    width: 32,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  accountSelector: {
    marginBottom: 12,
  },
  accountSelectorContent: {
    gap: 8,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  accountPillSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  accountPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  accountPillTextSelected: {
    color: '#FFFFFF',
  },
  balanceCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  balanceCardDebt: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  balanceCardCredit: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  balanceCardZero: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  balanceHeaderLeft: {
    flex: 1,
  },
  accountNumberLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unitInfoText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
    marginTop: 2,
  },
  balanceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceValueContainer: {
    marginTop: 4,
  },
  balanceStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  balanceAmountText: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  textDebt: {
    color: '#E11D48',
  },
  textCredit: {
    color: Colors.primary,
  },
  textZero: {
    color: '#334155',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
    gap: 10,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 17,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0F172A',
  },
  listSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  itemChargeAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemPaymentAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: Colors.primary,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyTabContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTabText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});
