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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  ShieldCheck,
  Receipt,
  Layers,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { LoadingState } from '../../components/common/LoadingState';
import { financeApi, FinancialTransparencyReport } from '../../api/finance';
import { useAuth } from '../../context/AuthContext';
import { RootStackParamList } from '../../navigation/types';

type TransparencyReportRouteProp = RouteProp<RootStackParamList, 'TransparencyReport'>;

export const TransparencyReportScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<TransparencyReportRouteProp>();
  const { t } = useTranslation();
  const { user } = useAuth();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [report, setReport] = useState<FinancialTransparencyReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedTenantId =
    route.params?.tenantId ||
    user?.tenantId ||
    (user?.ownerships?.[0] as any)?.unit?.building?.tenantId ||
    null;

  const loadReport = useCallback(async () => {
    if (!resolvedTenantId) {
      setError(t('finance.transparencyNoTenantError', 'Не удалось определить жилой комплекс'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const data = await financeApi.getTransparencyReport(resolvedTenantId, {
        month: selectedMonth,
        year: selectedYear,
      });
      setReport(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err.message ||
        t('finance.transparencyLoadError', 'Не удалось загрузить отчет о прозрачности');
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [resolvedTenantId, selectedMonth, selectedYear, t]);

  useEffect(() => {
    setLoading(true);
    loadReport();
  }, [loadReport]);

  const onRefresh = () => {
    setRefreshing(true);
    loadReport();
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    const isCurrentOrFuture =
      selectedYear > now.getFullYear() ||
      (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth() + 1);

    if (isCurrentOrFuture) return;

    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const isNextDisabled =
    selectedYear > now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth() + 1);

  const formatMonthTitle = (month: number, year: number) => {
    const monthKey = `common.months.${month}`;
    const localizedMonth = t(monthKey, {
      defaultValue: new Date(year, month - 1, 1).toLocaleString('ru', { month: 'long' }),
    });
    return `${localizedMonth.charAt(0).toUpperCase() + localizedMonth.slice(1)} ${year}`;
  };

  if (loading && !refreshing) {
    return <LoadingState message={t('common.loading', 'Загрузка...')} />;
  }

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
        <Text style={styles.headerTitle}>{t('finance.transparencyTitle', 'Прозрачность финансов')}</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Month Selector */}
        <View style={styles.periodSelector}>
          <TouchableOpacity
            style={styles.periodButton}
            onPress={handlePrevMonth}
            accessibilityLabel={t('finance.transparencyPrevMonth', 'Предыдущий месяц')}
          >
            <ChevronLeft color={Colors.text} size={20} />
          </TouchableOpacity>

          <View style={styles.periodCenter}>
            <Calendar color={Colors.primary} size={16} />
            <Text style={styles.periodText}>{formatMonthTitle(selectedMonth, selectedYear)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.periodButton, isNextDisabled && styles.periodButtonDisabled]}
            onPress={handleNextMonth}
            disabled={isNextDisabled}
            accessibilityLabel={t('finance.transparencyNextMonth', 'Следующий месяц')}
          >
            <ChevronRight color={isNextDisabled ? Colors.textMuted : Colors.text} size={20} />
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: '#FEE2E2' }]}>
              <AlertCircle color={Colors.danger} size={32} />
            </View>
            <Text style={styles.emptyTitle}>{t('common.error', 'Ошибка')}</Text>
            <Text style={styles.emptyDesc}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadReport}>
              <Text style={styles.retryButtonText}>{t('common.refresh', 'Обновить')}</Text>
            </TouchableOpacity>
          </View>
        ) : !report ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Scale color={Colors.textMuted} size={36} />
            </View>
            <Text style={styles.emptyTitle}>{t('finance.transparencyEmptyTitle', 'Нет данных')}</Text>
            <Text style={styles.emptyDesc}>
              {t('finance.transparencyEmptyDesc', 'За выбранный месяц финансовые операции не зафиксированы')}
            </Text>
          </View>
        ) : (
          <>
            {/* Top Aggregate KPI Cards */}
            <View style={styles.kpiRow}>
              {/* Collected Card */}
              <View style={[styles.kpiCard, styles.kpiCardCollected]}>
                <View style={styles.kpiHeader}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#ECFDF5' }]}>
                    <TrendingUp color="#059669" size={18} />
                  </View>
                  <Text style={styles.kpiLabel}>
                    {t('finance.transparencyCollected', 'Собрано')}
                  </Text>
                </View>
                <Text style={[styles.kpiValue, { color: '#059669' }]}>
                  {`+${report.totalCollected.toLocaleString()} ₸`}
                </Text>
                <Text style={styles.kpiSub}>
                  {t('finance.transparencyCollectionRate', 'Собираемость')}: {report.collectionRatePercent}%
                </Text>
              </View>

              {/* Expenses Card */}
              <View style={[styles.kpiCard, styles.kpiCardExpenses]}>
                <View style={styles.kpiHeader}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF2F2' }]}>
                    <TrendingDown color="#DC2626" size={18} />
                  </View>
                  <Text style={styles.kpiLabel}>
                    {t('finance.transparencyExpenses', 'Потрачено')}
                  </Text>
                </View>
                <Text style={[styles.kpiValue, { color: '#DC2626' }]}>
                  {report.totalExpenses > 0 ? `-${report.totalExpenses.toLocaleString()} ₸` : '0 ₸'}
                </Text>
                <Text style={styles.kpiSub}>
                  {t('finance.transparencyExpenseCount', 'Категорий')}: {report.byExpenseCategory.length}
                </Text>
              </View>
            </View>

            {/* Net Balance Banner */}
            <View
              style={[
                styles.balanceBanner,
                report.netBalance >= 0 ? styles.balanceBannerPositive : styles.balanceBannerNegative,
              ]}
            >
              <View style={styles.balanceBannerLeft}>
                <Text style={styles.balanceBannerTitle}>
                  {t('finance.transparencyNetBalance', 'Сальдо периода')}
                </Text>
                <Text style={styles.balanceBannerSubtitle}>
                  {report.netBalance >= 0
                    ? t('finance.transparencySurplus', 'Профицит бюджета (поступления превышают траты)')
                    : t('finance.transparencyDeficit', 'Дефицит бюджета (расходы превышают сборы)')}
                </Text>
              </View>
              <Text
                style={[
                  styles.balanceBannerAmount,
                  report.netBalance >= 0 ? styles.textPositive : styles.textNegative,
                ]}
              >
                {report.netBalance >= 0
                  ? `+${report.netBalance.toLocaleString()} ₸`
                  : `-${Math.abs(report.netBalance).toLocaleString()} ₸`}
              </Text>
            </View>

            {/* Summary Metrics Row */}
            <View style={styles.summaryBar}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t('finance.transparencyCharged', 'Начислено')}</Text>
                <Text style={styles.summaryValue}>{report.totalCharged.toLocaleString()} ₸</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>{t('finance.transparencyCollectionRate', 'Собираемость')}</Text>
                <Text style={styles.summaryValue}>{report.collectionRatePercent}%</Text>
              </View>
            </View>

            {/* Income by Tariff Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <Receipt color={Colors.primary} size={18} />
                </View>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle}>
                    {t('finance.transparencyByTariff', 'Поступления по тарифам')}
                  </Text>
                  <Text style={styles.sectionSub}>
                    {t('finance.transparencyByTariffSub', 'Структура начисленных услуг за месяц')}
                  </Text>
                </View>
              </View>

              {report.byTariff.length === 0 ? (
                <Text style={styles.sectionEmptyText}>
                  {t('finance.transparencyNoTariffs', 'Начислений по тарифам не зафиксировано')}
                </Text>
              ) : (
                report.byTariff.map((item, index) => {
                  const sharePercent =
                    report.totalCharged > 0
                      ? Math.round((item.amount / report.totalCharged) * 100)
                      : 0;

                  return (
                    <View
                      key={item.tariffId || `tariff-${index}`}
                      style={[
                        styles.breakdownRow,
                        index === report.byTariff.length - 1 && styles.breakdownRowLast,
                      ]}
                    >
                      <View style={styles.breakdownLeft}>
                        <Text style={styles.breakdownName}>{item.tariffName}</Text>
                        <Text style={styles.breakdownShare}>{sharePercent}% от начислений</Text>
                      </View>
                      <Text style={styles.breakdownAmount}>
                        {item.amount.toLocaleString()} ₸
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Expenses by Category Section */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Layers color="#D97706" size={18} />
                </View>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle}>
                    {t('finance.transparencyByCategory', 'Расходы по статьям')}
                  </Text>
                  <Text style={styles.sectionSub}>
                    {t('finance.transparencyByCategorySub', 'Фактические траты ОСИ/УК за месяц')}
                  </Text>
                </View>
              </View>

              {report.byExpenseCategory.length === 0 ? (
                <Text style={styles.sectionEmptyText}>
                  {t('finance.transparencyNoExpenses', 'Расходов в этом месяце не зарегистрировано')}
                </Text>
              ) : (
                report.byExpenseCategory.map((item, index) => {
                  const sharePercent =
                    report.totalExpenses > 0
                      ? Math.round((item.amount / report.totalExpenses) * 100)
                      : 0;

                  return (
                    <View
                      key={`expense-${item.category}-${index}`}
                      style={[
                        styles.breakdownRow,
                        index === report.byExpenseCategory.length - 1 && styles.breakdownRowLast,
                      ]}
                    >
                      <View style={styles.breakdownLeft}>
                        <Text style={styles.breakdownName}>{item.category}</Text>
                        <Text style={styles.breakdownShare}>{sharePercent}% от расходов</Text>
                      </View>
                      <Text style={[styles.breakdownAmount, { color: '#DC2626' }]}>
                        -{item.amount.toLocaleString()} ₸
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Privacy & Transparency Notice Footer */}
            <View style={styles.noticeBox}>
              <ShieldCheck color={Colors.primary} size={20} style={styles.noticeIcon} />
              <View style={styles.noticeTextContainer}>
                <Text style={styles.noticeTitle}>
                  {t('finance.transparencySafeTitle', 'Прозрачность и защита данных')}
                </Text>
                <Text style={styles.noticeText}>
                  {t(
                    'finance.transparencySafeNotice',
                    'Отчет формируется автоматически на основе данных ОСИ. Персональные данные жителей и номера квартир защищены и не отображаются в публичном отчете.',
                  )}
                </Text>
              </View>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 6,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRightPlaceholder: {
    width: 36,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  periodButtonDisabled: {
    opacity: 0.4,
  },
  periodCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  kpiCardCollected: {
    borderColor: '#D1FAE5',
  },
  kpiCardExpenses: {
    borderColor: '#FEE2E2',
  },
  kpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  kpiSub: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  balanceBanner: {
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
  },
  balanceBannerPositive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  balanceBannerNegative: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  balanceBannerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  balanceBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  balanceBannerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  balanceBannerAmount: {
    fontSize: 20,
    fontWeight: '800',
  },
  textPositive: {
    color: '#059669',
  },
  textNegative: {
    color: '#DC2626',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  sectionEmptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  breakdownRowLast: {
    borderBottomWidth: 0,
  },
  breakdownLeft: {
    flex: 1,
    paddingRight: 10,
  },
  breakdownName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  breakdownShare: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  breakdownAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  noticeBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 12,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeTextContainer: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 2,
  },
  noticeText: {
    fontSize: 12,
    color: '#1E3A8A',
    lineHeight: 17,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
