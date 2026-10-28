import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CreditCard,
  Calendar,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Home,
  Gauge,
  FileText,
  Share2,
  CheckCircle2,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  SegmentedControl,
  SkeletonList,
  EmptyState,
  ErrorState,
  CountUp,
  AnimatedEntrance,
} from '../../components/ui';
import { financeApi, PersonalAccountData, ChargeItem, PaymentItem } from '../../api/finance';
import { useAuth } from '../../context/AuthContext';

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

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
      setAccounts(data || []);
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
    safeHaptic.selection();
    loadAccounts();
  };

  const currentAccount = accounts[selectedAccountIndex] || null;

  // Group charges by period (Year-Month)
  const groupedCharges = useMemo(() => {
    if (!currentAccount?.charges || currentAccount.charges.length === 0) return [];

    const map = new Map<string, { periodKey: string; month: number; year: number; charges: ChargeItem[]; total: number }>();

    for (const c of currentAccount.charges) {
      const key = `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, {
          periodKey: key,
          month: c.periodMonth,
          year: c.periodYear,
          charges: [],
          total: 0,
        });
      }
      const entry = map.get(key)!;
      entry.charges.push(c);
      entry.total += c.amount;
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [currentAccount?.charges]);

  const handleShareReceipt = async () => {
    if (!currentAccount) return;
    safeHaptic.selection();
    try {
      const message = `${t('finance.receiptDownload')}: ${currentAccount.accountNumber}\n` +
        `${t('common.unitShort')} ${currentAccount.unit.unitNumber} • ${currentAccount.unit.building.blockName}\n` +
        `${t('finance.currentBalance')}: ${currentAccount.balance >= 0 ? '+' : ''}${currentAccount.balance.toLocaleString()} ₸\n` +
        `${t('finance.receiptOfflineNotice')}`;

      await Share.share({
        message,
        title: t('finance.receiptDownload'),
      });
    } catch (err) {
      // User cancelled or share dismissed
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 4,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            safeHaptic.selection();
            navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', 'Назад')}
        >
          <ChevronLeft color={theme.colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('finance.title')}
        </Text>
        <TouchableOpacity
          style={styles.headerRightBtn}
          onPress={handleShareReceipt}
          disabled={!currentAccount}
          accessibilityRole="button"
          accessibilityLabel={t('finance.shareReceipt')}
        >
          <Share2 color={currentAccount ? theme.colors.primary : 'transparent'} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={3} />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={loadAccounts} />
        ) : !currentAccount ? (
          <EmptyState
            title={t('finance.emptyTitle')}
            description={t('finance.emptyDesc')}
            actionTitle={t('common.refresh')}
            onActionPress={loadAccounts}
          />
        ) : (
          <AnimatedEntrance>
            {/* Multi-unit account selector pills */}
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
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        safeHaptic.selection();
                        setSelectedAccountIndex(index);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${t('common.unitShort')} ${acc.unit.unitNumber}`}
                    >
                      <Home
                        color={isSelected ? theme.colors.onPrimary : theme.colors.textMuted}
                        size={14}
                      />
                      <Text
                        style={[
                          styles.accountPillText,
                          {
                            color: isSelected ? theme.colors.onPrimary : theme.colors.text,
                            fontWeight: isSelected ? '700' : '600',
                          },
                        ]}
                      >
                        {t('common.unitShort')} {acc.unit.unitNumber}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Hero Balance Card */}
            <Card
              style={[
                styles.heroCard,
                {
                  backgroundColor:
                    currentAccount.balance < 0
                      ? theme.colors.dangerBg
                      : currentAccount.balance > 0
                      ? theme.colors.successBg
                      : theme.colors.surface,
                  borderColor:
                    currentAccount.balance < 0
                      ? theme.colors.dangerBorder
                      : currentAccount.balance > 0
                      ? theme.colors.successBorder
                      : theme.colors.border,
                },
              ]}
            >
              <View style={styles.heroHeader}>
                <View style={styles.heroHeaderLeft}>
                  <Text style={[styles.accountNumberLabel, { color: theme.colors.textMuted }]}>
                    {t('finance.accountNumber', { number: currentAccount.accountNumber })}
                  </Text>
                  <Text style={[styles.unitInfoText, { color: theme.colors.text }]}>
                    {t('common.unitShort')} {currentAccount.unit.unitNumber} •{' '}
                    {currentAccount.unit.building.blockName} • {currentAccount.unit.area}{' '}
                    {t('common.sqm')}
                  </Text>
                </View>

                <View
                  style={[
                    styles.heroIconCircle,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  {currentAccount.balance < 0 ? (
                    <ArrowDownLeft color={theme.colors.danger} size={22} />
                  ) : currentAccount.balance > 0 ? (
                    <ArrowUpRight color={theme.colors.success} size={22} />
                  ) : (
                    <CheckCircle2 color={theme.colors.primary} size={22} />
                  )}
                </View>
              </View>

              <View style={styles.heroBalanceBody}>
                <Badge
                  label={
                    currentAccount.balance < 0
                      ? t('finance.statusDebt')
                      : currentAccount.balance > 0
                      ? t('finance.statusCredit')
                      : t('finance.statusZero')
                  }
                  variant={
                    currentAccount.balance < 0
                      ? 'danger'
                      : currentAccount.balance > 0
                      ? 'success'
                      : 'neutral'
                  }
                  size="md"
                  style={styles.heroBadge}
                />

                <View style={styles.countUpRow}>
                  <Text
                    style={[
                      styles.heroSignText,
                      {
                        color:
                          currentAccount.balance < 0
                            ? theme.colors.danger
                            : currentAccount.balance > 0
                            ? theme.colors.success
                            : theme.colors.text,
                      },
                    ]}
                  >
                    {currentAccount.balance < 0 ? '−' : currentAccount.balance > 0 ? '+' : ''}
                  </Text>
                  <CountUp
                    value={Math.abs(currentAccount.balance)}
                    duration={800}
                    style={{
                      fontSize: 32,
                      fontWeight: '800',
                      letterSpacing: -0.5,
                      color:
                        currentAccount.balance < 0
                          ? theme.colors.danger
                          : currentAccount.balance > 0
                          ? theme.colors.success
                          : theme.colors.text,
                    }}
                  />
                </View>
              </View>
            </Card>

            {/* Offline Payment Notice */}
            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: theme.colors.infoBg,
                  borderColor: theme.colors.infoBorder,
                },
              ]}
            >
              <Info color={theme.colors.info} size={18} style={styles.noticeIcon} />
              <Text style={[styles.noticeText, { color: theme.colors.text }]}>
                {t('finance.offlineNotice')}
              </Text>
            </View>

            {/* Quick Actions Grid */}
            <View style={styles.quickActionsContainer}>
              <TouchableOpacity
                style={[
                  styles.quickActionCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('Meters');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('finance.metersQuickLink')}
              >
                <View
                  style={[
                    styles.quickActionIconWrap,
                    { backgroundColor: theme.colors.primaryBg },
                  ]}
                >
                  <Gauge color={theme.colors.primary} size={20} />
                </View>
                <View style={styles.quickActionTextWrap}>
                  <Text style={[styles.quickActionTitle, { color: theme.colors.text }]}>
                    {t('finance.metersQuickLink')}
                  </Text>
                  <Text style={[styles.quickActionSub, { color: theme.colors.textMuted }]}>
                    {t('meters.title')}
                  </Text>
                </View>
                <ChevronRight color={theme.colors.textMuted} size={18} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.quickActionCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.navigate('TransparencyReport', {
                    tenantId:
                      (currentAccount?.unit?.building as any)?.tenantId ||
                      user?.ownerships?.find((o) => o.isVerified)?.unit?.building?.tenantId,
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={t('finance.transparencyQuickLink')}
              >
                <View
                  style={[
                    styles.quickActionIconWrap,
                    { backgroundColor: theme.colors.successBg },
                  ]}
                >
                  <FileText color={theme.colors.success} size={20} />
                </View>
                <View style={styles.quickActionTextWrap}>
                  <Text style={[styles.quickActionTitle, { color: theme.colors.text }]}>
                    {t('finance.transparencyQuickLink')}
                  </Text>
                  <Text style={[styles.quickActionSub, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyQuickLinkSub')}
                  </Text>
                </View>
                <ChevronRight color={theme.colors.textMuted} size={18} />
              </TouchableOpacity>
            </View>

            {/* Segmented Control: Charges vs Payments */}
            <View style={styles.segmentWrap}>
              <SegmentedControl
                options={[
                  {
                    value: 'charges',
                    label: `${t('finance.tabCharges')} (${currentAccount.charges?.length || 0})`,
                    icon: <Calendar color={theme.colors.textMuted} size={15} />,
                  },
                  {
                    value: 'payments',
                    label: `${t('finance.tabPayments')} (${currentAccount.payments?.length || 0})`,
                    icon: <Coins color={theme.colors.textMuted} size={15} />,
                  },
                ]}
                value={activeTab}
                onChange={(val) => {
                  safeHaptic.selection();
                  setActiveTab(val as 'charges' | 'payments');
                }}
              />
            </View>

            {/* Tab 1: Charges grouped by period */}
            {activeTab === 'charges' && (
              <View style={styles.tabContentWrap}>
                {groupedCharges.length === 0 ? (
                  <EmptyState
                    title={t('finance.noCharges')}
                    description={t('finance.receiptOfflineNotice')}
                  />
                ) : (
                  groupedCharges.map((group) => (
                    <Card
                      key={group.periodKey}
                      style={[
                        styles.periodGroupCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.periodGroupHeader,
                          {
                            borderBottomColor: theme.colors.border,
                            backgroundColor: theme.colors.surfaceSubtle,
                          },
                        ]}
                      >
                        <View style={styles.periodGroupTitleRow}>
                          <Calendar color={theme.colors.primary} size={16} />
                          <Text style={[styles.periodGroupTitle, { color: theme.colors.text }]}>
                            {t(`common.months.${group.month}`, {
                              defaultValue: new Date(group.year, group.month - 1, 1).toLocaleString('ru', { month: 'long' }),
                            })}{' '}
                            {group.year}
                          </Text>
                        </View>
                        <Text style={[styles.periodGroupTotal, { color: theme.colors.text }]}>
                          {group.total.toLocaleString()} ₸
                        </Text>
                      </View>

                      {group.charges.map((charge, cIdx) => (
                        <View
                          key={charge.id}
                          style={[
                            styles.chargeRow,
                            cIdx < group.charges.length - 1 && {
                              borderBottomWidth: 1,
                              borderBottomColor: theme.colors.border,
                            },
                          ]}
                        >
                          <View style={styles.chargeLeft}>
                            <Text style={[styles.chargeTitle, { color: theme.colors.text }]}>
                              {charge.tariffItem?.name || '—'}
                            </Text>
                            <Text style={[styles.chargeSubtitle, { color: theme.colors.textMuted }]}>
                              {new Date(charge.createdAt).toLocaleDateString(
                                i18n.language === 'kk'
                                  ? 'kk-KZ'
                                  : i18n.language === 'en'
                                  ? 'en-US'
                                  : 'ru-RU',
                              )}
                            </Text>
                          </View>
                          <Text style={[styles.chargeAmount, { color: theme.colors.text }]}>
                            {charge.amount.toLocaleString()} ₸
                          </Text>
                        </View>
                      ))}
                    </Card>
                  ))
                )}
              </View>
            )}

            {/* Tab 2: Payments */}
            {activeTab === 'payments' && (
              <View style={styles.tabContentWrap}>
                {!currentAccount.payments || currentAccount.payments.length === 0 ? (
                  <EmptyState
                    title={t('finance.noPayments')}
                    description={t('finance.offlineNotice')}
                  />
                ) : (
                  <Card
                    style={[
                      styles.paymentsCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    {currentAccount.payments.map((payment, pIdx) => (
                      <View
                        key={payment.id}
                        style={[
                          styles.paymentRow,
                          pIdx < currentAccount.payments.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: theme.colors.border,
                          },
                        ]}
                      >
                        <View style={styles.paymentLeft}>
                          <Text style={[styles.paymentTitle, { color: theme.colors.text }]}>
                            {new Date(payment.paidAt).toLocaleDateString(
                              i18n.language === 'kk'
                                ? 'kk-KZ'
                                : i18n.language === 'en'
                                ? 'en-US'
                                : 'ru-RU',
                            )}
                          </Text>
                          <Text style={[styles.paymentSubtitle, { color: theme.colors.textMuted }]}>
                            {payment.note || t('finance.methodManual', 'Касса ОСИ / перевод')}
                          </Text>
                        </View>
                        <Text style={[styles.paymentAmount, { color: theme.colors.success }]}>
                          +{payment.amount.toLocaleString()} ₸
                        </Text>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            )}
          </AnimatedEntrance>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
    marginLeft: -4,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerRightBtn: {
    padding: 6,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  skeletonWrap: {
    paddingTop: 12,
  },
  accountSelector: {
    marginBottom: 14,
  },
  accountSelectorContent: {
    gap: 8,
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
  },
  accountPillText: {
    fontSize: 13,
  },
  heroCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroHeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  accountNumberLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unitInfoText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 3,
  },
  heroIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroBalanceBody: {
    marginTop: 4,
  },
  heroBadge: {
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  countUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSignText: {
    fontSize: 32,
    fontWeight: '800',
    marginRight: 2,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  quickActionsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 52,
  },
  quickActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickActionTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  segmentWrap: {
    marginBottom: 16,
  },
  tabContentWrap: {
    gap: 12,
  },
  periodGroupCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 0,
    marginBottom: 12,
  },
  periodGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  periodGroupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  periodGroupTotal: {
    fontSize: 14,
    fontWeight: '700',
  },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chargeLeft: {
    flex: 1,
    marginRight: 12,
  },
  chargeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  chargeSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  chargeAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  paymentsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 0,
    overflow: 'hidden',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  paymentLeft: {
    flex: 1,
    marginRight: 12,
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  paymentSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
