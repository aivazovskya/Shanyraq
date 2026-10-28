import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import {
  PropertiesApi,
  TenantSearchResult,
  TenantStructureResponse,
  BuildingStructure,
  UnitInfo,
} from '../../api/properties';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { IconButton } from '../../components/ui/IconButton';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { SkeletonList } from '../../components/ui/Skeleton';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Search,
  Building,
  CheckCircle2,
  Clock,
  LogOut,
  ChevronRight,
  ArrowLeft,
  ShieldAlert,
  Home,
  Check,
} from 'lucide-react-native';

export const ClaimUnitScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user, refreshProfile, logout } = useAuth();
  const { theme } = useTheme();

  // Wizard step: 1 (Complex), 2 (Block), 3 (Unit), 4 (Role & Confirm)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Search & structure state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [tenants, setTenants] = useState<TenantSearchResult[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null);
  const [structure, setStructure] = useState<TenantStructureResponse | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingStructure | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitInfo | null>(null);

  // Form state
  const [ownershipType, setOwnershipType] = useState<'OWNER' | 'TENANT'>('OWNER');
  const [sharePercent, setSharePercent] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [error, setError] = useState('');

  // Existing claim status
  const existingOwnership = user?.ownerships && user.ownerships.length > 0 ? user.ownerships[0] : null;

  useEffect(() => {
    searchTenants('');
  }, []);

  const searchTenants = async (q: string) => {
    setSearching(true);
    try {
      const results = await PropertiesApi.searchTenants(q);
      setTenants(results);
    } catch (err) {
      console.warn('Search tenants error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectTenant = async (tenant: TenantSearchResult) => {
    safeHaptic.selection();
    setSelectedTenant(tenant);
    setSelectedBuilding(null);
    setSelectedUnit(null);

    try {
      const struct = await PropertiesApi.getTenantStructure(tenant.id);
      setStructure(struct);
      if (struct.buildings.length === 1) {
        setSelectedBuilding(struct.buildings[0]);
        setStep(3);
      } else {
        setStep(2);
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), getApiErrorMessage(err));
    }
  };

  const handleSelectBuilding = (building: BuildingStructure) => {
    safeHaptic.selection();
    setSelectedBuilding(building);
    setSelectedUnit(null);
    setStep(3);
  };

  const handleSelectUnit = (unit: UnitInfo) => {
    safeHaptic.selection();
    setSelectedUnit(unit);
    setStep(4);
  };

  const handleBackStep = () => {
    safeHaptic.selection();
    if (step === 4) {
      setStep(3);
    } else if (step === 3) {
      if (structure && structure.buildings.length === 1) {
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(1);
    }
  };

  const handleSubmitClaim = async () => {
    if (!selectedUnit) {
      setError(t('onboarding.selectUnitError'));
      return;
    }

    safeHaptic.impact();
    setSubmitting(true);
    setError('');

    try {
      await PropertiesApi.claimOwnership({
        unitId: selectedUnit.id,
        ownershipType,
        sharePercent: ownershipType === 'OWNER' ? parseFloat(sharePercent) || 100 : undefined,
      });

      safeHaptic.notification();
      await refreshProfile();
      Alert.alert(t('common.success'), t('onboarding.claimSentSuccess'));
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshStatus = async () => {
    safeHaptic.selection();
    setRefreshingStatus(true);
    try {
      await refreshProfile();
    } finally {
      setRefreshingStatus(false);
    }
  };

  // State 2: Claim already submitted and Pending Verification
  if (existingOwnership && !existingOwnership.isVerified) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.statusContent}>
          <View style={styles.statusWrapper}>
            <View
              style={[
                styles.iconContainerYellow,
                {
                  backgroundColor: theme.colors.warningBg,
                  borderColor: theme.colors.warningBorder,
                },
              ]}
            >
              <Clock color={theme.colors.warning} size={48} />
            </View>

            <Text style={[styles.statusTitle, { color: theme.colors.text }]}>
              {t('onboarding.pendingTitle')}
            </Text>
            <Text style={[styles.statusSubtitle, { color: theme.colors.textMuted }]}>
              {t('onboarding.pendingSubtitle', {
                unit: existingOwnership.unit?.unitNumber || '',
                block: existingOwnership.unit?.building?.blockName || t('dashboard.defaultComplex'),
              })}
            </Text>

            <Card
              style={[
                styles.infoCard,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
            >
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>
                  {t('onboarding.statusLabel')}
                </Text>
                <Badge label={t('onboarding.statusUnderReview')} variant="warning" />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>
                  {t('onboarding.ownershipTypeLabel')}
                </Text>
                <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                  {existingOwnership.ownershipType === 'OWNER'
                    ? t('onboarding.roleOwner')
                    : t('onboarding.roleTenant')}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>
                  {t('onboarding.areaLabel')}
                </Text>
                <Text style={[styles.infoValue, { color: theme.colors.text }]}>
                  {existingOwnership.unit?.area} {t('common.sqm')}
                </Text>
              </View>
            </Card>

            <View
              style={[
                styles.warningBox,
                {
                  backgroundColor: theme.colors.surfaceSubtle,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <ShieldAlert size={20} color={theme.colors.warning} style={{ marginRight: 10, marginTop: 2 }} />
              <Text style={[styles.warningNotice, { color: theme.colors.textMuted }]}>
                {t('onboarding.securityWarningNotice')}
              </Text>
            </View>

            <View style={styles.actionsBlock}>
              <Button
                title={t('onboarding.refreshStatusBtn')}
                onPress={handleRefreshStatus}
                loading={refreshingStatus}
                variant="primary"
                size="lg"
              />
              <Button
                title={t('onboarding.logoutBtn')}
                onPress={logout}
                variant="secondary"
                size="md"
                leftIcon={<LogOut color={theme.colors.primary} size={18} />}
                style={styles.logoutBtn}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const stepsList = [
    { num: 1, label: t('onboarding.stepComplex') },
    { num: 2, label: t('onboarding.stepBlock') },
    { num: 3, label: t('onboarding.stepUnit') },
    { num: 4, label: t('onboarding.stepConfirm') },
  ];

  // State 1: Claim Wizard
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top Header with Back Step if > 1 */}
        <View style={styles.topHeader}>
          {step > 1 && (
            <IconButton
              icon={<ArrowLeft size={22} color={theme.colors.text} />}
              onPress={handleBackStep}
              accessibilityLabel={t('common.back')}
              variant="ghost"
              size={44}
              style={styles.backBtn}
            />
          )}
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {t('onboarding.claimTitle')}
            </Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
              {t('onboarding.claimSubtitle')}
            </Text>
          </View>
        </View>

        {/* Wizard Steps Progress Indicator */}
        <View style={styles.stepsIndicator}>
          {stepsList.map((s, idx) => {
            const isCompleted = step > s.num;
            const isCurrent = step === s.num;
            return (
              <React.Fragment key={s.num}>
                <View style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      isCompleted && { backgroundColor: theme.colors.success },
                      isCurrent && {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.primary,
                      },
                      !isCompleted &&
                        !isCurrent && {
                          backgroundColor: theme.colors.surfaceSubtle,
                          borderColor: theme.colors.border,
                          borderWidth: 1,
                        },
                    ]}
                  >
                    {isCompleted ? (
                      <Check size={14} color="#FFFFFF" />
                    ) : (
                      <Text
                        style={[
                          styles.stepNumText,
                          isCurrent ? { color: '#FFFFFF' } : { color: theme.colors.textMuted },
                        ]}
                      >
                        {s.num}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      isCurrent
                        ? { color: theme.colors.primary, fontWeight: '700' }
                        : { color: theme.colors.textMuted },
                    ]}
                  >
                    {s.label}
                  </Text>
                </View>
                {idx < stepsList.length - 1 && (
                  <View
                    style={[
                      styles.stepLine,
                      {
                        backgroundColor:
                          step > idx + 1 ? theme.colors.success : theme.colors.border,
                      },
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Step 1: Select Complex */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
              {t('onboarding.step1SelectComplex')}
            </Text>

            <Input
              label={t('common.search')}
              placeholder={t('onboarding.searchComplexPlaceholder')}
              value={searchQuery}
              onChangeText={(val) => {
                setSearchQuery(val);
                searchTenants(val);
              }}
              leftIcon={<Search color={theme.colors.textMuted} size={18} />}
            />

            {searching ? (
              <SkeletonList count={3} />
            ) : (
              <View style={styles.tenantsList}>
                {tenants.map((tItem) => {
                  const isSelected = selectedTenant?.id === tItem.id;
                  return (
                    <Card
                      key={tItem.id}
                      onPress={() => handleSelectTenant(tItem)}
                      style={[
                        styles.tenantCard,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primaryBg
                            : theme.colors.card,
                          borderColor: isSelected
                            ? theme.colors.primary
                            : theme.colors.border,
                        },
                      ]}
                      accessibilityLabel={`${tItem.name}, ${tItem.city}, ${tItem.address}`}
                    >
                      <View
                        style={[
                          styles.tenantIconWrap,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primary
                              : theme.colors.surfaceSubtle,
                          },
                        ]}
                      >
                        <Building
                          color={isSelected ? '#FFFFFF' : theme.colors.primary}
                          size={22}
                        />
                      </View>
                      <View style={styles.tenantInfo}>
                        <Text style={[styles.tenantName, { color: theme.colors.text }]}>
                          {tItem.name}
                        </Text>
                        <Text style={[styles.tenantAddress, { color: theme.colors.textMuted }]}>
                          {tItem.city}, {tItem.address}
                        </Text>
                      </View>
                      <ChevronRight color={theme.colors.textLight} size={20} />
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Step 2: Select Block */}
        {step === 2 && structure && (
          <View style={styles.stepContainer}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
              {t('onboarding.chooseBlock')}
            </Text>
            <Text style={[styles.stepSubheading, { color: theme.colors.textMuted }]}>
              {selectedTenant?.name}
            </Text>

            <View style={styles.blocksList}>
              {structure.buildings.map((b) => {
                const isSelected = selectedBuilding?.id === b.id;
                return (
                  <Card
                    key={b.id}
                    onPress={() => handleSelectBuilding(b)}
                    style={[
                      styles.blockCard,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primaryBg
                          : theme.colors.card,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                    accessibilityLabel={b.blockName}
                  >
                    <Home color={isSelected ? theme.colors.primary : theme.colors.textMuted} size={24} />
                    <View style={styles.blockInfo}>
                      <Text style={[styles.blockName, { color: theme.colors.text }]}>
                        {b.blockName}
                      </Text>
                      <Text style={[styles.blockSub, { color: theme.colors.textMuted }]}>
                        {b.units.length} {t('onboarding.stepUnit').toLowerCase()}
                      </Text>
                    </View>
                    <ChevronRight color={theme.colors.textLight} size={20} />
                  </Card>
                );
              })}
            </View>
          </View>
        )}

        {/* Step 3: Select Unit */}
        {step === 3 && (selectedBuilding || structure?.buildings[0]) && (
          <View style={styles.stepContainer}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
              {t('onboarding.chooseUnit')}
            </Text>
            <Text style={[styles.stepSubheading, { color: theme.colors.textMuted }]}>
              {selectedTenant?.name} • {(selectedBuilding || structure?.buildings[0])?.blockName}
            </Text>

            <View style={styles.unitsGrid}>
              {(selectedBuilding || structure?.buildings[0])?.units.map((u) => {
                const isSelected = selectedUnit?.id === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[
                      styles.unitChip,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.card,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => handleSelectUnit(u)}
                    accessibilityLabel={`${t('common.unitShort')} ${u.unitNumber}, ${u.area} ${t('common.sqm')}`}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        { color: isSelected ? '#FFFFFF' : theme.colors.text },
                      ]}
                    >
                      {t('common.unitShort')} {u.unitNumber}
                    </Text>
                    <Text
                      style={[
                        styles.unitAreaText,
                        { color: isSelected ? 'rgba(255, 255, 255, 0.85)' : theme.colors.textMuted },
                      ]}
                    >
                      {u.area} {t('common.sqm')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Step 4: Role & Confirm */}
        {step === 4 && selectedUnit && (
          <View style={styles.stepContainer}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
              {t('onboarding.step3OwnershipType')}
            </Text>

            {/* Selected unit summary card */}
            <Card
              style={[
                styles.summaryCard,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
            >
              <Text style={[styles.summaryTitle, { color: theme.colors.textMuted }]}>
                {t('onboarding.selectedUnit')}
              </Text>
              <Text style={[styles.summaryUnit, { color: theme.colors.text }]}>
                {selectedTenant?.name}, {(selectedBuilding || structure?.buildings[0])?.blockName},{' '}
                {t('common.unitShort')} {selectedUnit.unitNumber}
              </Text>
              <Text style={[styles.summaryArea, { color: theme.colors.primary }]}>
                {selectedUnit.area} {t('common.sqm')}
              </Text>
            </Card>

            <View style={styles.roleTabsWrap}>
              <SegmentedControl
                options={[
                  { value: 'OWNER', label: t('onboarding.roleOwner') },
                  { value: 'TENANT', label: t('onboarding.roleTenant') },
                ]}
                value={ownershipType}
                onChange={(val) => setOwnershipType(val)}
              />
            </View>

            {ownershipType === 'OWNER' && (
              <Input
                label={t('onboarding.sharePercentLabel')}
                value={sharePercent}
                onChangeText={setSharePercent}
                keyboardType="numeric"
                helper={t('onboarding.sharePercentHelper')}
              />
            )}

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.dangerBorder }]}>
                <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
              </View>
            ) : null}

            <Button
              title={t('onboarding.submitClaimBtn')}
              onPress={handleSubmitClaim}
              loading={submitting}
              size="lg"
              style={styles.submitBtn}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusContent: {
    padding: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  statusWrapper: {
    alignItems: 'center',
  },
  iconContainerYellow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 24,
  },
  infoCard: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    width: '100%',
  },
  warningNotice: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  actionsBlock: {
    width: '100%',
    gap: 12,
  },
  logoutBtn: {
    marginTop: 4,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {
    marginRight: 8,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  stepsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 6,
    marginBottom: 16,
  },
  stepContainer: {
    gap: 14,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
  },
  stepSubheading: {
    fontSize: 13,
    marginTop: -8,
    marginBottom: 4,
  },
  tenantsList: {
    gap: 10,
    marginTop: 4,
  },
  tenantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  tenantIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  tenantAddress: {
    fontSize: 13,
  },
  blocksList: {
    gap: 10,
    marginTop: 4,
  },
  blockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  blockInfo: {
    flex: 1,
  },
  blockName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  blockSub: {
    fontSize: 13,
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  unitChip: {
    width: '31%',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  unitAreaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  summaryCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  summaryUnit: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  summaryArea: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  roleTabsWrap: {
    marginVertical: 4,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
    marginTop: 8,
  },
});
