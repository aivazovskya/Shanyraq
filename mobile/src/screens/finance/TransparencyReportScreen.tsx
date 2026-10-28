import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Rect, G, Text as SvgText } from 'react-native-svg';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Receipt,
  Layers,
  Scale,
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
  ProgressRing,
  AnimatedEntrance,
} from '../../components/ui';
import { financeApi, FinancialTransparencyReport } from '../../api/finance';
import { useAuth, isStaffUser } from '../../context/AuthContext';
import { RootStackParamList } from '../../navigation/types';

type TransparencyReportRouteProp = RouteProp<RootStackParamList, 'TransparencyReport'>;

export const TransparencyReportScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<TransparencyReportRouteProp>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [activeSection, setActiveSection] = useState<'ALL' | 'INCOME' | 'EXPENSES'>('ALL');

  const [report, setReport] = useState<FinancialTransparencyReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // TenantId strictly from verified ownership for residents
  const verifiedOwnerships = (user?.ownerships || []).filter((o) => o.isVerified);
  const matchedOwnership = route.params?.tenantId
    ? verifiedOwnerships.find((o) => o.unit?.building?.tenantId === route.params?.tenantId)
    : null;
  const verifiedTenantId =
    matchedOwnership?.unit?.building?.tenantId ||
    verifiedOwnerships[0]?.unit?.building?.tenantId;

  const resolvedTenantId =
    verifiedTenantId ||
    (user?.role && isStaffUser(user.role)
      ? (route.params?.tenantId || user?.tenantId)
      : null) ||
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
    safeHaptic.selection();
    loadReport();
  };

  const handlePrevMonth = () => {
    safeHaptic.selection();
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
    safeHaptic.selection();

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

  // Palette for chart items from theme
  const chartPalette = useMemo(() => [
    theme.colors.primary,
    theme.colors.info,
    theme.colors.warning,
    theme.colors.success,
    theme.colors.primaryDark,
    theme.colors.textMuted,
  ], [theme]);

  // Donut chart stroke segments
  const donutRadius = 52;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * donutRadius;

  const donutSegments = useMemo(() => {
    if (!report || report.totalCharged <= 0 || report.byTariff.length === 0) return [];

    let currentAngle = 0;
    return report.byTariff.map((item, index) => {
      const share = item.amount / report.totalCharged;
      const strokeDashoffset = circumference * (1 - share);
      const angle = currentAngle;
      currentAngle += share * 360;
      return {
        ...item,
        color: chartPalette[index % chartPalette.length],
        sharePercent: Math.round(share * 100),
        strokeDashoffset,
        rotation: angle,
      };
    });
  }, [report, circumference, chartPalette]);

  // Max expense category for scaling bar chart
  const maxExpenseAmount = useMemo(() => {
    if (!report || report.byExpenseCategory.length === 0) return 0;
    return Math.max(...report.byExpenseCategory.map((c) => c.amount));
  }, [report]);

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
          {t('finance.transparencyTitle', 'Прозрачность финансов')}
        </Text>
        <View style={styles.headerRightPlaceholder} />
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
        {/* Month Selector Bar */}
        <View
          style={[
            styles.periodSelector,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.periodButton, { backgroundColor: theme.colors.surfaceSubtle }]}
            onPress={handlePrevMonth}
            accessibilityRole="button"
            accessibilityLabel={t('finance.transparencyPrevMonth', 'Предыдущий месяц')}
          >
            <ChevronLeft color={theme.colors.text} size={20} />
          </TouchableOpacity>

          <View style={styles.periodCenter}>
            <Calendar color={theme.colors.primary} size={16} />
            <Text style={[styles.periodText, { color: theme.colors.text }]}>
              {formatMonthTitle(selectedMonth, selectedYear)}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.periodButton,
              { backgroundColor: theme.colors.surfaceSubtle },
              isNextDisabled && styles.periodButtonDisabled,
            ]}
            onPress={handleNextMonth}
            disabled={isNextDisabled}
            accessibilityRole="button"
            accessibilityLabel={t('finance.transparencyNextMonth', 'Следующий месяц')}
          >
            <ChevronRight
              color={isNextDisabled ? theme.colors.textLight : theme.colors.text}
              size={20}
            />
          </TouchableOpacity>
        </View>

        {loading && !refreshing ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={3} />
          </View>
        ) : error ? (
          <ErrorState message={error} onRetry={loadReport} />
        ) : !report ? (
          <EmptyState
            title={t('finance.transparencyEmptyTitle', 'Нет данных')}
            description={t('finance.transparencyEmptyDesc', 'За выбранный месяц финансовые операции не зафиксированы')}
            actionTitle={t('common.refresh', 'Обновить')}
            onActionPress={loadReport}
          />
        ) : (
          <AnimatedEntrance>
            {/* Top Aggregate KPI Cards */}
            <View style={styles.kpiRow}>
              {/* Collected Card */}
              <Card
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.successBorder,
                  },
                ]}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconWrap,
                      { backgroundColor: theme.colors.successBg },
                    ]}
                  >
                    <TrendingUp color={theme.colors.success} size={16} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyCollected', 'Собрано')}
                  </Text>
                </View>
                <Text style={[styles.kpiValue, { color: theme.colors.success }]}>
                  {`+${report.totalCollected.toLocaleString()} ₸`}
                </Text>
                <View style={styles.kpiFooterRow}>
                  <Text style={[styles.kpiSub, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyCollectionRate', 'Собираемость')}:
                  </Text>
                  <Badge
                    label={`${report.collectionRatePercent}%`}
                    variant={report.collectionRatePercent >= 80 ? 'success' : 'warning'}
                    size="sm"
                  />
                </View>
              </Card>

              {/* Expenses Card */}
              <Card
                style={[
                  styles.kpiCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.dangerBorder,
                  },
                ]}
              >
                <View style={styles.kpiHeader}>
                  <View
                    style={[
                      styles.kpiIconWrap,
                      { backgroundColor: theme.colors.dangerBg },
                    ]}
                  >
                    <TrendingDown color={theme.colors.danger} size={16} />
                  </View>
                  <Text style={[styles.kpiLabel, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyExpenses', 'Потрачено')}
                  </Text>
                </View>
                <Text style={[styles.kpiValue, { color: theme.colors.danger }]}>
                  {report.totalExpenses > 0 ? `-${report.totalExpenses.toLocaleString()} ₸` : '0 ₸'}
                </Text>
                <View style={styles.kpiFooterRow}>
                  <Text style={[styles.kpiSub, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyExpenseCount', 'Статей')}:
                  </Text>
                  <Badge
                    label={String(report.byExpenseCategory.length)}
                    variant="neutral"
                    size="sm"
                  />
                </View>
              </Card>
            </View>

            {/* Net Balance Hero Banner */}
            <Card
              style={[
                styles.balanceBanner,
                {
                  backgroundColor:
                    report.netBalance >= 0 ? theme.colors.successBg : theme.colors.dangerBg,
                  borderColor:
                    report.netBalance >= 0
                      ? theme.colors.successBorder
                      : theme.colors.dangerBorder,
                },
              ]}
            >
              <View style={styles.balanceBannerLeft}>
                <Text style={[styles.balanceBannerTitle, { color: theme.colors.text }]}>
                  {t('finance.transparencyNetBalance', 'Сальдо периода')}
                </Text>
                <Text style={[styles.balanceBannerSubtitle, { color: theme.colors.textMuted }]}>
                  {report.netBalance >= 0
                    ? t('finance.transparencySurplus', 'Профицит бюджета (поступления превышают траты)')
                    : t('finance.transparencyDeficit', 'Дефицит бюджета (расходы превышают сборы)')}
                </Text>
              </View>
              <Text
                style={[
                  styles.balanceBannerAmount,
                  {
                    color: report.netBalance >= 0 ? theme.colors.success : theme.colors.danger,
                  },
                ]}
              >
                {report.netBalance >= 0
                  ? `+${report.netBalance.toLocaleString()} ₸`
                  : `-${Math.abs(report.netBalance).toLocaleString()} ₸`}
              </Text>
            </Card>

            {/* View Filter: All vs Income vs Expenses */}
            <View style={styles.sectionFilterWrap}>
              <SegmentedControl
                options={[
                  { value: 'ALL', label: t('communityBoard.filterAllTypes', 'Все') },
                  { value: 'INCOME', label: t('finance.transparencyByTariff', 'Поступления') },
                  { value: 'EXPENSES', label: t('finance.transparencyByCategory', 'Расходы') },
                ]}
                value={activeSection}
                onChange={(v) => {
                  safeHaptic.selection();
                  setActiveSection(v as 'ALL' | 'INCOME' | 'EXPENSES');
                }}
              />
            </View>

            {/* SECTION 1: Income by Tariff with Donut Chart */}
            {(activeSection === 'ALL' || activeSection === 'INCOME') && (
              <Card
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.sectionCardHeader}>
                  <View
                    style={[
                      styles.sectionIconWrap,
                      { backgroundColor: theme.colors.primaryBg },
                    ]}
                  >
                    <Receipt color={theme.colors.primary} size={18} />
                  </View>
                  <View style={styles.sectionTitleWrap}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                      {t('finance.transparencyByTariff', 'Поступления по тарифам')}
                    </Text>
                    <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>
                      {t('finance.transparencyByTariffSub', 'Структура начисленных услуг за месяц')}
                    </Text>
                  </View>
                </View>

                {report.byTariff.length === 0 ? (
                  <Text style={[styles.sectionEmptyText, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyNoTariffs', 'Начислений по тарифам не зафиксировано')}
                  </Text>
                ) : (
                  <>
                    {/* Donut Chart on SVG */}
                    <View style={styles.donutContainer}>
                      <Svg width={140} height={140} viewBox="0 0 140 140">
                        <G transform="rotate(-90 70 70)">
                          <Circle
                            cx="70"
                            cy="70"
                            r={donutRadius}
                            stroke={theme.colors.border}
                            strokeWidth={strokeWidth}
                            fill="none"
                          />
                          {donutSegments.map((seg, idx) => {
                            const segmentShare = seg.amount / report.totalCharged;
                            const strokeLength = circumference * segmentShare;
                            return (
                              <Circle
                                key={`donut-seg-${idx}`}
                                cx="70"
                                cy="70"
                                r={donutRadius}
                                stroke={seg.color}
                                strokeWidth={strokeWidth}
                                strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                                strokeDashoffset={0}
                                fill="none"
                                transform={`rotate(${seg.rotation} 70 70)`}
                              />
                            );
                          })}
                        </G>
                        <SvgText
                          x="70"
                          y="66"
                          textAnchor="middle"
                          fontSize="13"
                          fontWeight="700"
                          fill={theme.colors.text}
                        >
                          {report.collectionRatePercent}%
                        </SvgText>
                        <SvgText
                          x="70"
                          y="80"
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="500"
                          fill={theme.colors.textMuted}
                        >
                          {t('finance.transparencyCollectionRate', 'сбор')}
                        </SvgText>
                      </Svg>
                    </View>

                    {/* Breakdown list with color dots */}
                    <View style={styles.breakdownList}>
                      {donutSegments.map((item, index) => (
                        <View
                          key={item.tariffId || `tariff-${index}`}
                          style={[
                            styles.breakdownRow,
                            index < donutSegments.length - 1 && {
                              borderBottomWidth: 1,
                              borderBottomColor: theme.colors.border,
                            },
                          ]}
                        >
                          <View style={styles.breakdownLeft}>
                            <View style={styles.breakdownNameRow}>
                              <View
                                style={[
                                  styles.legendDot,
                                  { backgroundColor: item.color },
                                ]}
                              />
                              <Text
                                style={[styles.breakdownName, { color: theme.colors.text }]}
                                numberOfLines={1}
                              >
                                {item.tariffName}
                              </Text>
                            </View>
                            <Text style={[styles.breakdownShare, { color: theme.colors.textMuted }]}>
                              {t('finance.shareOfAccruals', { percent: item.sharePercent })}
                            </Text>
                          </View>
                          <Text style={[styles.breakdownAmount, { color: theme.colors.text }]}>
                            {item.amount.toLocaleString()} ₸
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </Card>
            )}

            {/* SECTION 2: Expenses by Category with SVG Bar Chart */}
            {(activeSection === 'ALL' || activeSection === 'EXPENSES') && (
              <Card
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View style={styles.sectionCardHeader}>
                  <View
                    style={[
                      styles.sectionIconWrap,
                      { backgroundColor: theme.colors.warningBg },
                    ]}
                  >
                    <Layers color={theme.colors.warning} size={18} />
                  </View>
                  <View style={styles.sectionTitleWrap}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                      {t('finance.transparencyByCategory', 'Расходы по статьям')}
                    </Text>
                    <Text style={[styles.sectionSub, { color: theme.colors.textMuted }]}>
                      {t('finance.transparencyByCategorySub', 'Фактические траты ОСИ/УК за месяц')}
                    </Text>
                  </View>
                </View>

                {report.byExpenseCategory.length === 0 ? (
                  <Text style={[styles.sectionEmptyText, { color: theme.colors.textMuted }]}>
                    {t('finance.transparencyNoExpenses', 'Расходов в этом месяце не зарегистрировано')}
                  </Text>
                ) : (
                  <View style={styles.breakdownList}>
                    {report.byExpenseCategory.map((item, index) => {
                      const sharePercent =
                        report.totalExpenses > 0
                          ? Math.round((item.amount / report.totalExpenses) * 100)
                          : 0;
                      const barPercent =
                        maxExpenseAmount > 0
                          ? Math.min((item.amount / maxExpenseAmount) * 100, 100)
                          : 0;

                      return (
                        <View
                          key={`expense-${item.category}-${index}`}
                          style={[
                            styles.expenseBarRow,
                            index < report.byExpenseCategory.length - 1 && {
                              borderBottomWidth: 1,
                              borderBottomColor: theme.colors.border,
                            },
                          ]}
                        >
                          <View style={styles.expenseTopRow}>
                            <Text
                              style={[styles.breakdownName, { color: theme.colors.text }]}
                              numberOfLines={1}
                            >
                              {item.category}
                            </Text>
                            <Text style={[styles.breakdownAmount, { color: theme.colors.danger }]}>
                              -{item.amount.toLocaleString()} ₸
                            </Text>
                          </View>

                          {/* Responsive SVG Bar Indicator */}
                          <View style={styles.svgBarWrap}>
                            <Svg width="100%" height={8}>
                              <Rect
                                x="0"
                                y="0"
                                width="100%"
                                height="8"
                                rx="4"
                                fill={theme.colors.surfaceSubtle}
                              />
                              <Rect
                                x="0"
                                y="0"
                                width={`${barPercent}%`}
                                height="8"
                                rx="4"
                                fill={theme.colors.danger}
                              />
                            </Svg>
                          </View>

                          <Text style={[styles.breakdownShare, { color: theme.colors.textMuted }]}>
                            {t('finance.shareOfExpenses', { percent: sharePercent })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            )}

            {/* Privacy & Safe Notice Card */}
            <View
              style={[
                styles.noticeBox,
                {
                  backgroundColor: theme.colors.infoBg,
                  borderColor: theme.colors.infoBorder,
                },
              ]}
            >
              <ShieldCheck color={theme.colors.info} size={20} style={styles.noticeIcon} />
              <View style={styles.noticeTextContainer}>
                <Text style={[styles.noticeTitle, { color: theme.colors.info }]}>
                  {t('finance.transparencySafeTitle', 'Прозрачность и защита данных')}
                </Text>
                <Text style={[styles.noticeText, { color: theme.colors.text }]}>
                  {t('finance.transparencySafeNotice')}
                </Text>
              </View>
            </View>
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
  headerRightPlaceholder: {
    width: 44,
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
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
  },
  periodButton: {
    padding: 8,
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonDisabled: {
    opacity: 0.35,
  },
  periodCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodText: {
    fontSize: 15,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  kpiFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiSub: {
    fontSize: 11,
  },
  balanceBanner: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
  },
  balanceBannerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  balanceBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  balanceBannerSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  balanceBannerAmount: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionFilterWrap: {
    marginBottom: 16,
  },
  chartCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionEmptyText: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 12,
    textAlign: 'center',
  },
  donutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  breakdownList: {
    marginTop: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  breakdownLeft: {
    flex: 1,
    paddingRight: 12,
  },
  breakdownNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownName: {
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownShare: {
    fontSize: 12,
    marginTop: 2,
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  expenseBarRow: {
    paddingVertical: 10,
  },
  expenseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  svgBarWrap: {
    marginVertical: 4,
  },
  noticeBox: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
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
    marginBottom: 3,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
