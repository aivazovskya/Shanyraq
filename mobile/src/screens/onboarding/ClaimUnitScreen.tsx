import { ScreenHero } from '../../components/common/ScreenHero';
import { useNavigation } from '@react-navigation/native';
import { LoadError } from '../../components/common/LoadError';
import { parseDecimalInput } from '../../utils/decimal-input';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import {
  PropertiesApi,
  TenantSearchResult,
  TenantStructureResponse,
  UnitInfo,
} from '../../api/properties';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Colors } from '../../constants/colors';
import {
  Search,
  Building,
  CheckCircle2,
  Clock,
  LogOut,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react-native';

export const ClaimUnitScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { user, refreshProfile, logout } = useAuth();

  // Search & structure state
  const [searchQuery, setSearchQuery] = useState('');
  const [tenants, setTenants] = useState<TenantSearchResult[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null);
  const [structure, setStructure] = useState<TenantStructureResponse | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<UnitInfo | null>(null);

  // Form state
  const [ownershipType, setOwnershipType] = useState<'OWNER' | 'TENANT'>('OWNER');
  const [sharePercent, setSharePercent] = useState('100');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchFailed, setSearchFailed] = useState(false);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureFailed, setStructureFailed] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const searchVersion = useRef(0);
  const structureVersion = useRef(0);
  const claimLock = useRef(false);

  // Existing claim status
  const existingOwnership = user?.ownerships && user.ownerships.length > 0 ? user.ownerships[0] : null;

  const searchTenants = useCallback(async (q: string, version = ++searchVersion.current) => {
    setSearchLoading(true);
    try {
      const results = await PropertiesApi.searchTenants(q);
      if (version !== searchVersion.current) return;
      setTenants(results);
      setSearchFailed(false);
    } catch {
      if (version === searchVersion.current) setSearchFailed(true);
    } finally {
      if (version === searchVersion.current) setSearchLoading(false);
    }
  }, []);
  useEffect(() => {
    const version = ++searchVersion.current;
    setSearchLoading(true);
    setTenants([]);
    const timer = setTimeout(() => void searchTenants(searchQuery, version), searchQuery ? 300 : 0);
    return () => { clearTimeout(timer); searchVersion.current++; };
  }, [searchQuery, searchTenants]);
  const handleSelectTenant = async (result: TenantSearchResult) => {
    if (claimLock.current) return;
    const version = ++structureVersion.current;
    setSelectedTenant(result);
    setSelectedUnit(null);
    setStructure(null);
    setStructureLoading(true);
    setStructureFailed(false);
    setError('');
    try {
      const response = await PropertiesApi.getTenantStructure(result.id);
      if (version === structureVersion.current) setStructure(response);
    } catch {
      if (version === structureVersion.current) setStructureFailed(true);
    } finally {
      if (version === structureVersion.current) setStructureLoading(false);
    }
  };

  const handleSubmitClaim = async () => {
    if (claimLock.current) return;
    if (!selectedUnit) {
      setError(t('onboarding.selectUnitError'));
      return;
    }

    const share = parseDecimalInput(sharePercent);
    if (ownershipType === 'OWNER' && (share === null || share < 0.01 || share > 100)) {
      setError(t('onboarding.invalidShare'));
      return;
    }
    claimLock.current = true;
    setSubmitting(true);
    setError('');

    try {
      await PropertiesApi.claimOwnership({
        unitId: selectedUnit.id,
        ownershipType,
        sharePercent: ownershipType === 'OWNER' ? share ?? undefined : undefined,
      });

      await refreshProfile();
      Alert.alert(t('common.success'), t('onboarding.claimSentSuccess'));
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      claimLock.current = false;
      setSubmitting(false);
    }
  };

  const header = <View style={styles.topNav}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(navigation.canGoBack() ? 'common.back' : 'profile.logoutButton')} disabled={submitting || checkingStatus} style={styles.navButton} onPress={() => navigation.canGoBack() ? navigation.goBack() : logout()}>
      {navigation.canGoBack() ? <ArrowLeft size={24} color={Colors.text} /> : <LogOut size={22} color={Colors.text} />}
    </TouchableOpacity>
    <Text style={styles.navTitle}>{t('onboarding.claimTitle')}</Text><View style={{ width: 44 }} />
  </View>;

  // State 2: Claim already submitted and Pending Verification
  if (existingOwnership && !existingOwnership.isVerified) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={styles.statusWrapper}>
          <View style={styles.iconContainerYellow}>
            <Clock color="#D97706" size={48} />
          </View>
          <Text style={styles.statusTitle}>{t('onboarding.pendingTitle')}</Text>
          <Text style={styles.statusSubtitle}>
            {t('onboarding.pendingSubtitle', {
              unit: existingOwnership.unit?.unitNumber || '',
              block: existingOwnership.unit?.building?.blockName || t('dashboard.defaultComplex'),
            })}
          </Text>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('onboarding.statusLabel')}</Text>
              <Badge label={t('onboarding.statusUnderReview')} variant="warning" />
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('onboarding.ownershipTypeLabel')}</Text>
              <Text style={styles.infoValue}>
                {existingOwnership.ownershipType === 'OWNER' ? t('onboarding.roleOwner') : t('onboarding.roleTenant')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('onboarding.areaLabel')}</Text>
              <Text style={styles.infoValue}>{existingOwnership.unit?.area} {t('common.sqm')}</Text>
            </View>
          </Card>

          <Text style={styles.warningNotice}>
            {t('onboarding.securityWarningNotice')}
          </Text>

          <View style={styles.actionsBlock}>
            <Button
              title={t('onboarding.refreshStatusBtn')}
              onPress={async () => { if (checkingStatus) return; setCheckingStatus(true); try { await refreshProfile(); } finally { setCheckingStatus(false); } }}
              loading={checkingStatus}
              variant="primary"
              size="lg"
            />
            <Button
              title={t('onboarding.logoutBtn')}
              onPress={logout}
              variant="outline"
              size="md"
              icon={<LogOut color={Colors.primary} size={18} />}
              style={styles.logoutBtn}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // State 1: Claim form
  return (
    <SafeAreaView style={styles.container}>
      {header}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scrollContent}>
        <ScreenHero title={t('residentUi.claimIntro')} subtitle={t('onboarding.claimSubtitle')} />

        {/* Step 1: Complex search */}
        <Text style={styles.sectionHeading}>{t('onboarding.step1SelectComplex')}</Text>
        <Input
          placeholder={t('onboarding.searchComplexPlaceholder')}
          value={searchQuery}
          editable={!submitting}
          accessibilityLabel={t('onboarding.searchComplexPlaceholder')}
          onChangeText={(val) => {
            setSearchQuery(val);
            structureVersion.current++;
            setSelectedTenant(null); setSelectedUnit(null); setStructure(null); setStructureLoading(false); setStructureFailed(false); setError('');
          }}
          leftIcon={<Search color={Colors.textMuted} size={18} />}
        />

        {searchLoading ? <ActivityIndicator color={Colors.primary} accessibilityLabel={t('common.loading')} /> : searchFailed ? <LoadError onRetry={() => searchTenants(searchQuery)} /> : tenants.length === 0 ? <Text style={styles.warningNotice}>{t('common.noMatches')}</Text> : null}
        {(selectedTenant ? [selectedTenant] : tenants).map((tItem) => (
          <TouchableOpacity
            key={tItem.id}
            style={[
              styles.tenantItem,
              selectedTenant?.id === tItem.id && styles.tenantItemSelected,
            ]}
            onPress={() => handleSelectTenant(tItem)}
            disabled={submitting}
            accessibilityRole="radio" aria-checked={selectedTenant?.id === tItem.id} accessibilityState={{ checked: selectedTenant?.id === tItem.id }}
          >
            <Building
              color={selectedTenant?.id === tItem.id ? Colors.primary : Colors.textMuted}
              size={24}
            />
            <View style={styles.tenantInfo}>
              <Text style={styles.tenantName}>{tItem.name}</Text>
              <Text style={styles.tenantAddress}>
                {tItem.city}, {tItem.address}
              </Text>
            </View>
            <ChevronRight color={Colors.textLight} size={20} />
          </TouchableOpacity>
        ))}

        {selectedTenant && <Button title={t('residentUi.changeComplex')} variant="outline" size="sm" disabled={submitting} onPress={() => { structureVersion.current++; setSelectedTenant(null); setSelectedUnit(null); setStructure(null); setStructureFailed(false); setStructureLoading(false); setError(''); }} />}
        {structureLoading && <ActivityIndicator color={Colors.primary} accessibilityLabel={t('common.loading')} />}
        {structureFailed && selectedTenant && <LoadError onRetry={() => handleSelectTenant(selectedTenant)} />}
        {/* Step 2: Building & Unit selection */}
        {structure && (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionHeading}>{t('onboarding.step2SelectUnit')}</Text>
            {structure.buildings.every(building => building.units.length === 0) && <Text style={styles.emptyHint}>{t('residentUi.noUnitsHint')}</Text>}
            {structure.buildings.map((b) => (
              <View key={b.id} style={styles.buildingSection}>
                <Text style={styles.buildingName}>{b.blockName}</Text>
                <View style={styles.unitsGrid}>
                  {b.units.map((u) => {
                    const isSelected = selectedUnit?.id === u.id;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.unitChip,
                          isSelected && styles.unitChipSelected,
                        ]}
                        onPress={() => { setSelectedUnit(u); setError(''); }}
                        disabled={submitting}
                        accessibilityRole="radio" aria-checked={isSelected} accessibilityState={{ checked: isSelected }}
                      >
                        <Text
                          style={[
                            styles.unitChipText,
                            isSelected && styles.unitChipTextSelected,
                          ]}
                        >
                          {t('common.unitShort')} {u.unitNumber}
                        </Text>
                        <Text
                          style={[
                            styles.unitAreaText,
                            isSelected && styles.unitAreaTextSelected,
                          ]}
                        >
                          {u.area} {t('common.sqm')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Step 3: Ownership role */}
        {selectedUnit && (
          <View style={styles.stepBlock}>
            <Text style={styles.sectionHeading}>{t('onboarding.step3OwnershipType')}</Text>
            <View style={styles.roleTabs}>
              <TouchableOpacity
                style={[
                  styles.roleTab,
                  ownershipType === 'OWNER' && styles.roleTabActive,
                ]}
                onPress={() => { setOwnershipType('OWNER'); setError(''); }}
                disabled={submitting}
                accessibilityRole="tab" aria-selected={ownershipType === 'OWNER'} accessibilityState={{ selected: ownershipType === 'OWNER' }}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    ownershipType === 'OWNER' && styles.roleTabTextActive,
                  ]}
                >
                  {t('onboarding.roleOwner')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleTab,
                  ownershipType === 'TENANT' && styles.roleTabActive,
                ]}
                onPress={() => { setOwnershipType('TENANT'); setError(''); }}
                disabled={submitting}
                accessibilityRole="tab" aria-selected={ownershipType === 'TENANT'} accessibilityState={{ selected: ownershipType === 'TENANT' }}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    ownershipType === 'TENANT' && styles.roleTabTextActive,
                  ]}
                >
                  {t('onboarding.roleTenant')}
                </Text>
              </TouchableOpacity>
            </View>

            {ownershipType === 'OWNER' && (
              <Input
                label={t('onboarding.sharePercentLabel')}
                value={sharePercent}
                error={error === t('onboarding.invalidShare') ? error : undefined}
                onChangeText={(value) => { setSharePercent(value); setError(''); }}
                editable={!submitting}
                keyboardType="decimal-pad"
                helper={t('onboarding.sharePercentHelper')}
              />
            )}

            {error && error !== t('onboarding.invalidShare') ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.text },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topHeader: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    letterSpacing: -0.6,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 16,
  },
  emptyHint: { fontSize: 14, lineHeight: 21, color: Colors.textMuted, marginBottom: 12 },
  tenantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 12,
  },
  tenantItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  tenantAddress: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  stepBlock: {
    marginTop: 16,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  buildingSection: {
    marginBottom: 16,
  },
  buildingName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 8,
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  unitChip: {
    minWidth: 72,
    flexGrow: 1,
    flexBasis: '28%',
    minHeight: 64,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  unitChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  unitChipTextSelected: {
    color: '#FFFFFF',
  },
  unitAreaText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  unitAreaTextSelected: {
    color: '#D1FAE5',
  },
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.border,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  roleTab: {
    minHeight: 48,
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  roleTabActive: {
    backgroundColor: Colors.surface,
  },
  roleTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  roleTabTextActive: {
    color: Colors.text,
  },
  submitBtn: {
    marginTop: 12,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 10,
  },
  statusWrapper: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainerYellow: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 300,
  },
  infoCard: {
    width: '100%',
    marginTop: 24,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  warningNotice: {
    fontSize: 13,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    lineHeight: 18,
    textAlign: 'center',
  },
  actionsBlock: {
    width: '100%',
    marginTop: 24,
    gap: 12,
  },
  logoutBtn: {
    marginTop: 4,
  },
});
