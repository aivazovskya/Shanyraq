import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { AccessApi, GuestPass } from '../../api/access';
import { PropertiesApi, TenantStructureResponse } from '../../api/properties';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Button,
  Input,
  Badge,
  EmptyState,
  SkeletonList,
  BottomSheet,
  SegmentedControl,
  AnimatedEntrance,
  IconButton,
} from '../../components/ui';
import {
  KeyRound,
  Building,
  User,
  Car,
  Clock,
  Search,
  Share2,
  Trash2,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Plus,
} from 'lucide-react-native';

interface SelectedUnitInfo {
  id: string;
  unitNumber: string;
  blockName: string;
  floor?: number;
  entrance?: number;
}

export const StaffGuestPassScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();

  const tenantId = user?.tenantId || user?.tenant?.id || '';

  // Data states
  const [structure, setStructure] = useState<TenantStructureResponse | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(true);
  const [tenantPasses, setTenantPasses] = useState<GuestPass[]>([]);
  const [loadingPasses, setLoadingPasses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form states
  const [selectedUnit, setSelectedUnit] = useState<SelectedUnitInfo | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [passType, setPassType] = useState<'PEDESTRIAN' | 'VEHICLE'>('PEDESTRIAN');
  const [durationHours, setDurationHours] = useState<'4' | '12' | '24'>('12');
  const [submitting, setSubmitting] = useState(false);

  // Unit picker sheet
  const [unitSheetVisible, setUnitSheetVisible] = useState(false);
  const [unitSearchQuery, setUnitSearchQuery] = useState('');

  // Revoke confirmation sheet
  const [passToRevoke, setPassToRevoke] = useState<GuestPass | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchPasses = useCallback(
    async (isSilent = false) => {
      if (!tenantId) {
        setLoadingPasses(false);
        setRefreshing(false);
        return;
      }
      if (!isSilent) setLoadingPasses(true);

      try {
        const data = await AccessApi.getTenantGuestPasses(tenantId);
        setTenantPasses(data || []);
      } catch (err) {
        console.warn('Failed to load guest passes:', err);
      } finally {
        if (!isSilent) setLoadingPasses(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  const fetchStructure = useCallback(async () => {
    if (!tenantId) {
      setLoadingStructure(false);
      return;
    }
    try {
      const data = await PropertiesApi.getTenantStructure(tenantId);
      setStructure(data);
    } catch (err) {
      console.warn('Failed to load tenant structure:', err);
    } finally {
      setLoadingStructure(false);
    }
  }, [tenantId]);

  useFocusEffect(
    useCallback(() => {
      fetchPasses(true);
      fetchStructure();
    }, [fetchPasses, fetchStructure])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    fetchPasses(true);
    fetchStructure();
  };

  // Flatten all units for search picker
  const allUnits: SelectedUnitInfo[] = useMemo(() => {
    if (!structure?.buildings) return [];
    const units: SelectedUnitInfo[] = [];

    for (const bld of structure.buildings) {
      if (bld.units) {
        for (const u of bld.units) {
          units.push({
            id: u.id,
            unitNumber: u.unitNumber,
            blockName: bld.blockName,
            floor: u.floor,
            entrance: u.entrance,
          });
        }
      }
    }
    return units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  }, [structure]);

  const filteredUnits = useMemo(() => {
    if (!unitSearchQuery.trim()) return allUnits;
    const q = unitSearchQuery.toLowerCase().trim();
    return allUnits.filter(
      (u) =>
        u.unitNumber.toLowerCase().includes(q) ||
        u.blockName.toLowerCase().includes(q)
    );
  }, [allUnits, unitSearchQuery]);

  // Create Guest Pass
  const handleCreatePass = async () => {
    if (!selectedUnit) {
      Alert.alert(t('common.error'), t('staff.guestPass.selectUnitWarning'));
      return;
    }
    if (!guestName.trim()) {
      Alert.alert(t('common.error'), t('staff.guestPass.enterGuestNameWarning'));
      return;
    }

    safeHaptic.selection();
    setSubmitting(true);

    const now = new Date();
    const validFrom = now.toISOString();
    const hours = parseInt(durationHours, 10);
    const validTo = new Date(now.getTime() + hours * 3600 * 1000).toISOString();

    try {
      await AccessApi.createGuestPass({
        unitId: selectedUnit.id,
        guestName: guestName.trim(),
        guestPlateNumber: passType === 'VEHICLE' ? guestPlate.trim() || undefined : undefined,
        validFrom,
        validTo,
      });

      safeHaptic.selection();
      setGuestName('');
      setGuestPlate('');
      setSelectedUnit(null);

      await fetchPasses(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || t('common.error');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Revoke
  const handleConfirmRevoke = async () => {
    if (!passToRevoke || revoking) return;
    safeHaptic.selection();
    setRevoking(true);

    try {
      await AccessApi.revokeGuestPass(passToRevoke.id);
      safeHaptic.selection();
      setPassToRevoke(null);
      await fetchPasses(true);
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        err?.response?.data?.message || t('staff.guestPass.revokeError')
      );
    } finally {
      setRevoking(false);
    }
  };

  const handleSharePass = async (pass: GuestPass) => {
    safeHaptic.selection();
    try {
      const unit = pass.unit
        ? `${pass.unit.building?.blockName ? `${pass.unit.building.blockName}, ` : ''}${t('staff.sos.unit')} ${pass.unit.unitNumber}`
        : '';
      const text = `${t('staff.guestPass.sharePassTitle')}\n${t('staff.guestPass.passCode')}: ${pass.accessCode}\n${unit}\n${t('staff.guestPass.durationLabel')}: ${new Date(pass.validTo).toLocaleString()}`;
      await Share.share({ message: text });
    } catch {}
  };

  const activePasses = useMemo(
    () => tenantPasses.filter((p) => p.status === 'ACTIVE' || (!p.isRevoked && !p.isUsed)),
    [tenantPasses]
  );

  const canGoBack = navigation.canGoBack();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            paddingBottom: tabBarInset + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <AnimatedEntrance index={0}>
          <View style={styles.headerRow}>
            {canGoBack && (
              <IconButton
                icon={<ArrowLeft size={22} color={theme.colors.text} />}
                accessibilityLabel={t('common.back')}
                onPress={() => {
                  safeHaptic.selection();
                  navigation.goBack();
                }}
                variant="ghost"
                size={40}
                style={{ marginRight: 8 }}
              />
            )}

            <View style={styles.headerTextWrap}>
              <Text
                style={[
                  styles.title,
                  { color: theme.colors.text },
                  theme.typography.title,
                ]}
              >
                {t('staff.guestPass.title')}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.textMuted },
                  theme.typography.caption,
                ]}
              >
                {t('staff.guestPass.cardSubtitle')}
              </Text>
            </View>
          </View>
        </AnimatedEntrance>

        {/* Master / Wizard Card */}
        <AnimatedEntrance index={1}>
          <Card
            style={[
              styles.formCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.stepTitle,
                { color: theme.colors.text },
                theme.typography.headline,
              ]}
            >
              {t('staff.guestPass.selectUnitStep')}
            </Text>

            {/* Select Unit Trigger Button */}
            <TouchableOpacity
              style={[
                styles.unitSelectBtn,
                {
                  backgroundColor: theme.colors.surfaceSubtle,
                  borderColor: selectedUnit ? theme.colors.primary : theme.colors.border,
                },
              ]}
              onPress={() => {
                safeHaptic.selection();
                setUnitSheetVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={selectedUnit ? `${selectedUnit.blockName}, ${selectedUnit.unitNumber}` : t('staff.guestPass.selectUnitPlaceholder')}
            >
              <View style={styles.unitBtnLeft}>
                <Building
                  size={18}
                  color={selectedUnit ? theme.colors.primary : theme.colors.textMuted}
                />
                <Text
                  style={[
                    styles.unitBtnText,
                    {
                      color: selectedUnit ? theme.colors.text : theme.colors.textMuted,
                      fontWeight: selectedUnit ? '600' : '400',
                    },
                    theme.typography.body,
                  ]}
                >
                  {selectedUnit
                    ? `${selectedUnit.blockName}, ${t('staff.sos.unit')} ${selectedUnit.unitNumber}`
                    : t('staff.guestPass.selectUnitPlaceholder')}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <Text
              style={[
                styles.stepTitle,
                { color: theme.colors.text, marginTop: 16 },
                theme.typography.headline,
              ]}
            >
              {t('staff.guestPass.guestDetailsStep')}
            </Text>

            {/* Pass Type Switcher (Pedestrian vs Vehicle) */}
            <View style={styles.fieldWrap}>
              <SegmentedControl<'PEDESTRIAN' | 'VEHICLE'>
                options={[
                  {
                    value: 'PEDESTRIAN',
                    label: t('staff.guestPass.pedestrian'),
                    icon: <User size={16} color={theme.colors.primary} />,
                  },
                  {
                    value: 'VEHICLE',
                    label: t('staff.guestPass.vehicle'),
                    icon: <Car size={16} color={theme.colors.primary} />,
                  },
                ]}
                value={passType}
                onChange={(val) => {
                  safeHaptic.selection();
                  setPassType(val);
                }}
              />
            </View>

            {/* Guest Name Input */}
            <View style={styles.fieldWrap}>
              <Input
                label={t('staff.guestPass.guestName')}
                placeholder={t('staff.guestPass.guestName')}
                value={guestName}
                onChangeText={setGuestName}
                leftIcon={<User size={18} color={theme.colors.textMuted} />}
              />
            </View>

            {/* License Plate (if Vehicle) */}
            {passType === 'VEHICLE' && (
              <View style={styles.fieldWrap}>
                <Input
                  label={t('staff.guestPass.plateNumber')}
                  placeholder="001 AAA 01"
                  value={guestPlate}
                  onChangeText={setGuestPlate}
                  autoCapitalize="characters"
                  leftIcon={<Car size={18} color={theme.colors.textMuted} />}
                />
              </View>
            )}

            {/* Duration Selector */}
            <View style={styles.fieldWrap}>
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.colors.textMuted },
                  theme.typography.caption,
                ]}
              >
                {t('staff.guestPass.durationLabel')}
              </Text>
              <SegmentedControl<'4' | '12' | '24'>
                options={[
                  { value: '4', label: `4 ${t('staff.guestPass.hours')}` },
                  { value: '12', label: `12 ${t('staff.guestPass.hours')}` },
                  { value: '24', label: `24 ${t('staff.guestPass.hours')}` },
                ]}
                value={durationHours}
                onChange={(val) => {
                  safeHaptic.selection();
                  setDurationHours(val);
                }}
              />
            </View>

            {/* Issue Button */}
            <Button
              title={t('staff.guestPass.issuePassBtn')}
              variant="primary"
              size="lg"
              onPress={handleCreatePass}
              loading={submitting}
              style={styles.submitBtn}
              leftIcon={<Plus size={18} color="#FFFFFF" />}
            />
          </Card>
        </AnimatedEntrance>

        {/* Active Passes List */}
        <AnimatedEntrance index={2}>
          <View style={styles.sectionWrap}>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.text },
                theme.typography.headline,
              ]}
            >
              {t('staff.guestPass.activePassesTitle')} ({activePasses.length})
            </Text>

            {loadingPasses ? (
              <SkeletonList count={2} />
            ) : activePasses.length > 0 ? (
              <View style={styles.passesList}>
                {activePasses.map((pass) => {
                  const unit = pass.unit
                    ? `${pass.unit.building?.blockName ? `${pass.unit.building.blockName}, ` : ''}${t('staff.sos.unit')} ${pass.unit.unitNumber}`
                    : '';

                  return (
                    <Card
                      key={pass.id}
                      style={[
                        styles.passCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                        },
                      ]}
                    >
                      <View style={styles.passTopRow}>
                        <View style={styles.codeWrap}>
                          <Text
                            style={[
                              styles.codeLabel,
                              { color: theme.colors.textMuted },
                              theme.typography.caption,
                            ]}
                          >
                            {t('staff.guestPass.passCode')}
                          </Text>
                          <Text
                            style={[
                              styles.codeValue,
                              { color: theme.colors.primary },
                              theme.typography.title,
                            ]}
                          >
                            {pass.accessCode}
                          </Text>
                        </View>

                        <Badge
                          label={t('staff.sos.status.ACTIVE')}
                          variant="success"
                          size="sm"
                        />
                      </View>

                      {/* QR Code and Meta */}
                      <View style={styles.passDetailsRow}>
                        <View style={styles.qrBox}>
                          <QRCode
                            value={pass.accessCode}
                            size={72}
                            backgroundColor="transparent"
                            color={theme.isDark ? '#FFFFFF' : '#0F172A'}
                          />
                        </View>

                        <View style={styles.passInfoWrap}>
                          <Text
                            style={[
                              styles.guestName,
                              { color: theme.colors.text },
                              theme.typography.headline,
                            ]}
                            numberOfLines={1}
                          >
                            {pass.guestName}
                          </Text>

                          {Boolean(pass.guestPlateNumber) && (
                            <View style={styles.metaRow}>
                              <Car size={13} color={theme.colors.textMuted} />
                              <Text
                                style={[
                                  styles.metaText,
                                  { color: theme.colors.text },
                                  theme.typography.caption,
                                ]}
                              >
                                {pass.guestPlateNumber}
                              </Text>
                            </View>
                          )}

                          {Boolean(unit) && (
                            <View style={styles.metaRow}>
                              <Building size={13} color={theme.colors.textMuted} />
                              <Text
                                style={[
                                  styles.metaText,
                                  { color: theme.colors.textMuted },
                                  theme.typography.caption,
                                ]}
                              >
                                {unit}
                              </Text>
                            </View>
                          )}

                          <View style={styles.metaRow}>
                            <Clock size={13} color={theme.colors.textMuted} />
                            <Text
                              style={[
                                styles.metaText,
                                { color: theme.colors.textMuted },
                                theme.typography.caption,
                              ]}
                            >
                              {new Date(pass.validTo).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Actions: Share & Revoke */}
                      <View
                        style={[
                          styles.passActionsRow,
                          { borderTopColor: theme.colors.border },
                        ]}
                      >
                        <Button
                          title={t('common.share')}
                          variant="secondary"
                          size="sm"
                          onPress={() => handleSharePass(pass)}
                          style={{ flex: 1 }}
                          leftIcon={<Share2 size={15} color={theme.colors.primary} />}
                        />

                        <Button
                          title={t('staff.guestPass.revokePass')}
                          variant="destructive"
                          size="sm"
                          onPress={() => {
                            safeHaptic.selection();
                            setPassToRevoke(pass);
                          }}
                          style={{ flex: 1 }}
                          leftIcon={<Trash2 size={15} color="#FFFFFF" />}
                        />
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : (
              <Card
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <EmptyState
                  title={t('staff.guestPass.noHistory')}
                  description={t('staff.guestPass.cardSubtitle')}
                />
              </Card>
            )}
          </View>
        </AnimatedEntrance>
      </ScrollView>

      {/* Unit Picker BottomSheet */}
      <BottomSheet
        visible={unitSheetVisible}
        onClose={() => setUnitSheetVisible(false)}
        title={t('staff.guestPass.chooseUnitTitle')}
      >
        <View style={styles.unitSheetBody}>
          <Input
            label={t('common.search')}
            placeholder={t('staff.guestPass.searchUnitPlaceholder')}
            value={unitSearchQuery}
            onChangeText={setUnitSearchQuery}
            leftIcon={<Search size={18} color={theme.colors.textMuted} />}
          />

          <ScrollView style={styles.unitListScroll} showsVerticalScrollIndicator={false}>
            {filteredUnits.length > 0 ? (
              filteredUnits.map((u) => {
                const isSelected = selectedUnit?.id === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    style={[
                      styles.unitPickItem,
                      {
                        backgroundColor: isSelected
                          ? theme.colors.primaryBg
                          : theme.colors.surface,
                        borderColor: isSelected
                          ? theme.colors.primary
                          : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      safeHaptic.selection();
                      setSelectedUnit(u);
                      setUnitSheetVisible(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${u.blockName}, ${u.unitNumber}`}
                  >
                    <View style={styles.unitPickTextWrap}>
                      <Text
                        style={[
                          styles.unitPickTitle,
                          {
                            color: isSelected
                              ? theme.colors.primary
                              : theme.colors.text,
                          },
                          theme.typography.headline,
                        ]}
                      >
                        {u.blockName}, {t('staff.sos.unit')} {u.unitNumber}
                      </Text>
                      {(u.floor != null || u.entrance != null) && (
                        <Text
                          style={[
                            styles.unitPickSub,
                            { color: theme.colors.textMuted },
                            theme.typography.caption,
                          ]}
                        >
                          {u.entrance != null ? `${t('staff.guestPass.entrance')} ${u.entrance}` : ''}
                          {u.floor != null ? ` • ${t('staff.guestPass.floor')} ${u.floor}` : ''}
                        </Text>
                      )}
                    </View>
                    {isSelected && <CheckCircle2 size={18} color={theme.colors.primary} />}
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text
                style={[
                  styles.noUnitsText,
                  { color: theme.colors.textMuted },
                  theme.typography.callout,
                ]}
              >
                {t('staff.guestPass.noUnitsFound')}
              </Text>
            )}
          </ScrollView>
        </View>
      </BottomSheet>

      {/* Revoke Confirmation BottomSheet */}
      <BottomSheet
        visible={Boolean(passToRevoke)}
        onClose={() => setPassToRevoke(null)}
        title={t('staff.guestPass.revokeConfirmTitle')}
      >
        <View style={styles.revokeSheetBody}>
          <Text
            style={[
              styles.revokeSheetMsg,
              { color: theme.colors.textMuted },
              theme.typography.body,
            ]}
          >
            {t('staff.guestPass.revokeConfirmMessage')}
          </Text>

          <Button
            title={t('staff.guestPass.revokePass')}
            variant="destructive"
            size="lg"
            onPress={handleConfirmRevoke}
            loading={revoking}
          />
          <Button
            title={t('common.cancel')}
            variant="secondary"
            size="md"
            onPress={() => setPassToRevoke(null)}
          />
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontWeight: '400',
  },
  formCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  stepTitle: {
    fontWeight: '700',
    marginBottom: 10,
  },
  unitSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  unitBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  unitBtnText: {
    flex: 1,
  },
  fieldWrap: {
    marginTop: 12,
  },
  fieldLabel: {
    fontWeight: '500',
    marginBottom: 6,
  },
  submitBtn: {
    marginTop: 16,
  },
  sectionWrap: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12,
  },
  passesList: {
    gap: 12,
  },
  passCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  passTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  codeWrap: {
    flex: 1,
  },
  codeLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeValue: {
    fontWeight: '800',
    letterSpacing: 2,
  },
  passDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  qrBox: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  passInfoWrap: {
    flex: 1,
    gap: 4,
  },
  guestName: {
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontWeight: '500',
  },
  passActionsRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  emptyCard: {
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  unitSheetBody: {
    gap: 12,
    paddingBottom: 24,
  },
  unitListScroll: {
    maxHeight: 320,
  },
  unitPickItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  unitPickTextWrap: {
    flex: 1,
  },
  unitPickTitle: {
    fontWeight: '600',
  },
  unitPickSub: {
    fontWeight: '400',
  },
  noUnitsText: {
    textAlign: 'center',
    paddingVertical: 20,
  },
  revokeSheetBody: {
    gap: 14,
    paddingBottom: 24,
  },
  revokeSheetMsg: {
    lineHeight: 22,
  },
});
