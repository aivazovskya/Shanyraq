import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { useAuth, isStaffUser } from '../../context/AuthContext';
import { AccessApi, GuestPass } from '../../api/access';
import { PropertiesApi, TenantStructureResponse } from '../../api/properties';
import { getApiErrorMessage } from '../../api/client';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import {
  ArrowLeft,
  Building,
  User,
  Car,
  Clock,
  Search,
  Check,
  ChevronRight,
  Share2,
  PlusCircle,
  ShieldCheck,
  X,
} from 'lucide-react-native';

interface SelectedUnitInfo {
  id: string;
  unitNumber: string;
  blockName: string;
  floor?: number;
  entrance?: number;
}

export const StaffGuestPassScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [structure, setStructure] = useState<TenantStructureResponse | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<SelectedUnitInfo | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdPass, setCreatedPass] = useState<GuestPass | null>(null);

  // Unit Picker Modal
  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [unitSearchQuery, setUnitSearchQuery] = useState('');

  const isStaff = isStaffUser(user?.role);

  useEffect(() => {
    const fetchStructure = async () => {
      if (!user?.tenantId) {
        setLoadingStructure(false);
        return;
      }
      try {
        const data = await PropertiesApi.getTenantStructure(user.tenantId);
        setStructure(data);
      } catch (err) {
        console.warn('Failed to load tenant structure:', err);
      } finally {
        setLoadingStructure(false);
      }
    };

    fetchStructure();
  }, [user?.tenantId]);

  // Flatten units from all buildings
  const allUnits = useMemo<SelectedUnitInfo[]>(() => {
    if (!structure?.buildings) return [];
    const list: SelectedUnitInfo[] = [];
    for (const b of structure.buildings) {
      for (const u of b.units) {
        list.push({
          id: u.id,
          unitNumber: u.unitNumber,
          blockName: b.blockName,
          floor: u.floor,
          entrance: u.entrance,
        });
      }
    }
    return list;
  }, [structure]);

  const filteredUnits = useMemo(() => {
    if (!unitSearchQuery.trim()) return allUnits;
    const q = unitSearchQuery.toLowerCase();
    return allUnits.filter(
      (u) =>
        u.unitNumber.toLowerCase().includes(q) ||
        u.blockName.toLowerCase().includes(q)
    );
  }, [allUnits, unitSearchQuery]);

  const handleSelectUnit = (unit: SelectedUnitInfo) => {
    setSelectedUnit(unit);
    setUnitModalVisible(false);
    setUnitSearchQuery('');
  };

  const handleCreatePass = async () => {
    if (!selectedUnit) {
      Alert.alert(t('common.error'), t('staff.guestPass.selectUnitWarning'));
      return;
    }
    if (!guestName.trim()) {
      Alert.alert(t('common.error'), t('staff.guestPass.enterGuestNameWarning'));
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const validTo = new Date(now.getTime() + 12 * 3600 * 1000); // 12 hours

      const pass = await AccessApi.createGuestPass({
        unitId: selectedUnit.id,
        guestName: guestName.trim(),
        guestPlateNumber: guestPlate.trim() || undefined,
        validFrom: now.toISOString(),
        validTo: validTo.toISOString(),
      });

      setCreatedPass(pass);
    } catch (e: any) {
      Alert.alert(t('common.error'), getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSharePass = async (pass: GuestPass) => {
    try {
      const complexName = user?.tenant?.name || structure?.tenantName || t('staff.complexInfo');
      const unitStr = selectedUnit
        ? `${selectedUnit.blockName ? `${selectedUnit.blockName}, ` : ''}${t('common.unitShort')} ${selectedUnit.unitNumber}`
        : '';
      const plateLine = pass.guestPlateNumber
        ? `${t('access.guestPlateLabel', { plate: pass.guestPlateNumber })}\n`
        : '';
      const validTimeStr = new Date(pass.validTo).toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      });

      const message = `${complexName}\n${t('staff.guestPass.sharePassTitle')}\n${unitStr}\n${t('access.guestNameLabel', { name: pass.guestName })}\n${plateLine}${t('access.passCodeTitle')}: ${pass.accessCode}\n${t('access.valid12Hours', { time: validTimeStr })}`;

      await Share.share({ message });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const handleResetForm = () => {
    setCreatedPass(null);
    setGuestName('');
    setGuestPlate('');
    setSelectedUnit(null);
  };

  if (!isStaff) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <ArrowLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('staff.guestPass.title')}</Text>
        </View>
        <View style={styles.content}>
          <Card style={styles.unauthorizedCard}>
            <ShieldCheck size={48} color={Colors.danger} style={{ marginBottom: 12 }} />
            <Text style={styles.unauthorizedTitle}>{t('staff.guestPass.unauthorizedTitle')}</Text>
            <Text style={styles.unauthorizedMsg}>{t('staff.guestPass.unauthorizedMsg')}</Text>
            <Button
              title={t('common.back')}
              onPress={() => navigation.goBack()}
              variant="outline"
              style={{ marginTop: 16 }}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (loadingStructure) {
    return <LoadingState message={t('common.loading')} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('staff.guestPass.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {user?.tenant?.name || structure?.tenantName || t('staff.complexInfo')}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {createdPass ? (
          // ==================== SUCCESS / QR DISPLAY ====================
          <Card style={styles.resultCard}>
            <View style={styles.qrResultContainer}>
              <View style={styles.qrBox}>
                <QRCode
                  value={createdPass.qrCodeUrl || createdPass.accessCode}
                  size={160}
                  color="#111827"
                  backgroundColor="#FFFFFF"
                />
              </View>

              <Text style={styles.passCodeTitle}>{t('access.passCodeTitle')}</Text>
              <Text style={styles.passCode}>{createdPass.accessCode}</Text>

              <View style={styles.passMetaBlock}>
                {selectedUnit && (
                  <View style={styles.metaLine}>
                    <Building size={16} color={Colors.primary} />
                    <Text style={styles.passMetaText}>
                      {selectedUnit.blockName ? `${selectedUnit.blockName}, ` : ''}
                      {t('common.unitShort')} {selectedUnit.unitNumber}
                    </Text>
                  </View>
                )}
                <View style={styles.metaLine}>
                  <User size={16} color={Colors.textMuted} />
                  <Text style={styles.passMetaText}>
                    {t('access.guestNameLabel', { name: createdPass.guestName })}
                  </Text>
                </View>
                {createdPass.guestPlateNumber ? (
                  <View style={styles.metaLine}>
                    <Car size={16} color={Colors.textMuted} />
                    <Text style={styles.passMetaText}>
                      {t('access.guestPlateLabel', { plate: createdPass.guestPlateNumber })}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.metaLine}>
                  <Clock size={16} color={Colors.textMuted} />
                  <Text style={styles.passMetaText}>
                    {t('access.valid12Hours', {
                      time: new Date(createdPass.validTo).toLocaleTimeString(i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })}
                  </Text>
                </View>
              </View>

              <Button
                title={t('access.sharePassBtn')}
                onPress={() => handleSharePass(createdPass)}
                variant="primary"
                size="lg"
                icon={<Share2 color="#FFFFFF" size={20} />}
                style={styles.actionBtn}
              />

              <Button
                title={t('staff.guestPass.issueAnotherBtn')}
                onPress={handleResetForm}
                variant="outline"
                size="lg"
                icon={<PlusCircle color={Colors.text} size={20} />}
                style={styles.secondaryBtn}
              />
            </View>
          </Card>
        ) : (
          // ==================== CREATION FORM ====================
          <View>
            {/* Step 1: Unit Selector Card */}
            <Text style={styles.sectionLabel}>{t('staff.guestPass.selectUnitStep')}</Text>
            <TouchableOpacity
              onPress={() => setUnitModalVisible(true)}
              activeOpacity={0.8}
            >
              <Card style={styles.unitSelectorCard}>
                <View style={styles.unitSelectorRow}>
                  <View style={styles.unitIconContainer}>
                    <Building size={22} color={selectedUnit ? Colors.primary : Colors.textMuted} />
                  </View>
                  <View style={styles.unitInfoContainer}>
                    <Text style={styles.unitCardSub}>
                      {selectedUnit
                        ? t('staff.guestPass.selectedUnitLabel')
                        : t('staff.guestPass.noUnitSelected')}
                    </Text>
                    <Text
                      style={[
                        styles.unitCardTitle,
                        !selectedUnit && styles.unitCardPlaceholder,
                      ]}
                    >
                      {selectedUnit
                        ? `${selectedUnit.blockName ? `${selectedUnit.blockName}, ` : ''}${t('common.unitShort')} ${selectedUnit.unitNumber}`
                        : t('staff.guestPass.selectUnitPlaceholder')}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={Colors.textMuted} />
                </View>
              </Card>
            </TouchableOpacity>

            {/* Step 2: Guest Details Form */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              {t('staff.guestPass.guestDetailsStep')}
            </Text>
            <Card style={styles.formCard}>
              <Input
                label={t('access.guestInputLabel')}
                placeholder={t('access.guestInputPlaceholder')}
                value={guestName}
                onChangeText={setGuestName}
                leftIcon={<User size={18} color={Colors.textMuted} />}
              />

              <Input
                label={t('access.plateInputLabel')}
                placeholder={t('access.plateInputPlaceholder')}
                value={guestPlate}
                onChangeText={setGuestPlate}
                leftIcon={<Car size={18} color={Colors.textMuted} />}
                helper={t('access.plateHelper')}
              />

              {/* Validity notice banner */}
              <View style={styles.validityNotice}>
                <Clock size={16} color={Colors.textMuted} />
                <Text style={styles.validityText}>
                  {t('staff.guestPass.validityNotice')}
                </Text>
              </View>

              <Button
                title={t('access.generateQrBtn')}
                onPress={handleCreatePass}
                loading={submitting}
                size="lg"
                style={{ marginTop: 16 }}
              />
            </Card>
          </View>
        )}
      </ScrollView>

      {/* ==================== UNIT PICKER MODAL ==================== */}
      <Modal visible={unitModalVisible} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('staff.guestPass.chooseUnitTitle')}</Text>
              <TouchableOpacity onPress={() => setUnitModalVisible(false)}>
                <X size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Input
                placeholder={t('staff.guestPass.searchUnitPlaceholder')}
                value={unitSearchQuery}
                onChangeText={setUnitSearchQuery}
                leftIcon={<Search size={18} color={Colors.textMuted} />}
                style={{ marginBottom: 0 }}
              />
            </View>

            <FlatList
              data={filteredUnits}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.unitList}
              renderItem={({ item }) => {
                const isSelected = selectedUnit?.id === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => handleSelectUnit(item)}
                    activeOpacity={0.7}
                    style={[styles.unitItem, isSelected && styles.unitItemSelected]}
                  >
                    <View style={styles.unitItemTextContainer}>
                      <Text style={styles.unitItemTitle}>
                        {item.blockName ? `${item.blockName}, ` : ''}
                        {t('common.unitShort')} {item.unitNumber}
                      </Text>
                      {(item.entrance || item.floor) && (
                        <Text style={styles.unitItemSub}>
                          {item.entrance ? `${t('staff.guestPass.entrance')} ${item.entrance}` : ''}
                          {item.entrance && item.floor ? ' • ' : ''}
                          {item.floor ? `${t('staff.guestPass.floor')} ${item.floor}` : ''}
                        </Text>
                      )}
                    </View>
                    {isSelected && <Check size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyUnits}>
                  <Text style={styles.emptyUnitsText}>
                    {t('staff.guestPass.noUnitsFound')}
                  </Text>
                </View>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unitSelectorCard: {
    padding: 14,
  },
  unitSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  unitInfoContainer: {
    flex: 1,
  },
  unitCardSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  unitCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  unitCardPlaceholder: {
    color: Colors.textMuted,
    fontWeight: 'normal',
  },
  formCard: {
    padding: 16,
  },
  validityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  validityText: {
    fontSize: 12,
    color: Colors.textMuted,
    flex: 1,
  },
  resultCard: {
    padding: 20,
  },
  qrResultContainer: {
    alignItems: 'center',
  },
  qrBox: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  passCodeTitle: {
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  passCode: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 4,
    marginBottom: 16,
  },
  passMetaBlock: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passMetaText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  actionBtn: {
    width: '100%',
  },
  secondaryBtn: {
    width: '100%',
    marginTop: 10,
  },
  unauthorizedCard: {
    padding: 24,
    alignItems: 'center',
  },
  unauthorizedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  unauthorizedMsg: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    height: '75%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSearchBox: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unitList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  unitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: Colors.background,
  },
  unitItemSelected: {
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  unitItemTextContainer: {
    flex: 1,
  },
  unitItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  unitItemSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyUnits: {
    padding: 32,
    alignItems: 'center',
  },
  emptyUnitsText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
});
