import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Users,
  UserPlus,
  Phone,
  Calendar,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Home,
  ShieldCheck,
  Edit3,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  Input,
  SegmentedControl,
  BottomSheet,
  SkeletonList,
  EmptyState,
  AnimatedEntrance,
} from '../../components/ui';
import {
  PropertiesApi,
  UnitResidentItem,
  UnitInvitationItem,
} from '../../api/properties';
import { useAuth } from '../../context/AuthContext';
import { roleLabel } from '../../lib/role-label';

export const ResidentsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const ownedUnits = useMemo(
    () => (user?.ownerships || []).filter((o) => o.ownershipType === 'OWNER' && o.isVerified),
    [user?.ownerships],
  );

  const [selectedUnitIndex, setSelectedUnitIndex] = useState(0);
  const activeOwnership = ownedUnits[selectedUnitIndex];
  const activeUnitId = activeOwnership?.unitId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [residents, setResidents] = useState<UnitResidentItem[]>([]);
  const [invitations, setInvitations] = useState<UnitInvitationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [maxAllowed, setMaxAllowed] = useState(5);

  // Invite Modal
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteType, setInviteType] = useState<'TENANT' | 'FAMILY_MEMBER'>('TENANT');
  const [inviteLeaseEnd, setInviteLeaseEnd] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  // Edit Lease Modal
  const [editingResident, setEditingResident] = useState<UnitResidentItem | null>(null);
  const [newLeaseEndDate, setNewLeaseEndDate] = useState('');
  const [leaseSubmitting, setLeaseSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeUnitId) {
      setLoading(false);
      return;
    }
    try {
      const data = await PropertiesApi.getUnitResidents(activeUnitId);
      setResidents(data.residents || []);
      setInvitations(data.invitations || []);
      setTotalCount(data.totalCount ?? 0);
      setMaxAllowed(data.maxAllowed || 5);
    } catch (err: any) {
      console.warn('Failed to load residents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeUnitId]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    loadData();
  };

  const handleSendInvite = async () => {
    if (!activeUnitId) return;

    const trimmed = invitePhone.trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    let normalizedPhone = trimmed;
    if (digitsOnly.length === 11 && (digitsOnly.startsWith('7') || digitsOnly.startsWith('8'))) {
      normalizedPhone = '+7' + digitsOnly.slice(1);
    } else if (digitsOnly.length === 10) {
      normalizedPhone = '+7' + digitsOnly;
    } else {
      Alert.alert(t('common.error'), t('cabinet.invalidPhoneFormat', 'Укажите корректный номер телефона (+7...)'));
      return;
    }

    if (user?.phone && normalizedPhone === user.phone) {
      Alert.alert(t('common.error'), t('cabinet.cannotInviteSelf', 'Собственник не может пригласить самого себя'));
      return;
    }

    if (residents.some((r) => r.phone === normalizedPhone || r.user.phone === normalizedPhone)) {
      Alert.alert(
        t('common.error'),
        t('cabinet.phoneAlreadyResident', 'Пользователь с этим номером телефона уже является жильцом квартиры'),
      );
      return;
    }

    if (invitations.some((i) => i.phone === normalizedPhone && i.status === 'PENDING')) {
      Alert.alert(
        t('common.error'),
        t('cabinet.invitationAlreadyPending', 'Приглашение для этого номера уже ожидает входа'),
      );
      return;
    }

    if (inviteLeaseEnd) {
      const selectedDate = new Date(inviteLeaseEnd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate <= today) {
        Alert.alert(t('common.error'), t('cabinet.leaseDatePastError', 'Дата окончания аренды должна быть в будущем'));
        return;
      }
    }

    setInviteSubmitting(true);
    try {
      await PropertiesApi.inviteResident(activeUnitId, {
        phone: normalizedPhone,
        fullName: inviteName.trim() || undefined,
        ownershipType: inviteType,
        leaseEndDate: inviteLeaseEnd ? new Date(inviteLeaseEnd).toISOString() : undefined,
      });

      safeHaptic.notification();
      Alert.alert(t('common.success'), t('cabinet.inviteSentSuccess', 'Приглашение успешно отправлено!'));
      setInviteModalVisible(false);
      setInvitePhone('');
      setInviteName('');
      setInviteType('TENANT');
      setInviteLeaseEnd('');
      loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.response?.data?.message || err.message || t('cabinet.inviteFailed', 'Ошибка при отправке приглашения'));
    } finally {
      setInviteSubmitting(false);
    }
  };

  const confirmRevokeResident = (resident: UnitResidentItem) => {
    safeHaptic.selection();
    Alert.alert(
      t('cabinet.revokeAccessModalTitle', 'Отозвать доступ жильца?'),
      t(
        'cabinet.revokeAccessConfirmDesc',
        'Вы уверены, что хотите отозвать доступ жильца {{name}}? Все активные гостевые пропуска будут аннулированы, а сессия пользователя завершена.',
        { name: `${resident.user.firstName} ${resident.user.lastName}` },
      ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cabinet.revokeConfirmBtn', 'Отозвать доступ'),
          style: 'destructive',
          onPress: async () => {
            if (!activeUnitId) return;
            try {
              await PropertiesApi.revokeResident(activeUnitId, resident.id);
              safeHaptic.notification();
              Alert.alert(t('common.success'), t('cabinet.residentRevokedSuccess', 'Доступ жильца успешно отозван'));
              loadData();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.response?.data?.message || err.message || t('cabinet.revokeFailed', 'Ошибка при отзыве доступа'));
            }
          },
        },
      ],
    );
  };

  const confirmRevokeInvitation = (invitation: UnitInvitationItem) => {
    safeHaptic.selection();
    Alert.alert(
      t('cabinet.cancelInvitationBtn', 'Отозвать приглашение?'),
      invitation.phone,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cabinet.cancelInvitationBtn', 'Отозвать'),
          style: 'destructive',
          onPress: async () => {
            if (!activeUnitId) return;
            try {
              await PropertiesApi.revokeInvitation(activeUnitId, invitation.id);
              safeHaptic.notification();
              Alert.alert(t('common.success'), t('cabinet.invitationRevokedSuccess', 'Приглашение отозвано'));
              loadData();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.response?.data?.message || err.message || t('cabinet.revokeFailed', 'Ошибка при отзыве приглашения'));
            }
          },
        },
      ],
    );
  };

  const handleUpdateLease = async () => {
    if (!activeUnitId || !editingResident) return;
    setLeaseSubmitting(true);
    try {
      await PropertiesApi.extendLease(activeUnitId, editingResident.id, {
        leaseEndDate: newLeaseEndDate ? new Date(newLeaseEndDate).toISOString() : null,
      });
      safeHaptic.notification();
      Alert.alert(t('common.success'), t('cabinet.leaseUpdatedSuccess', 'Срок аренды успешно обновлен'));
      setEditingResident(null);
      loadData();
    } catch (err: any) {
      Alert.alert(t('common.error'), err.response?.data?.message || err.message || t('cabinet.leaseUpdateFailed', 'Ошибка при обновлении срока'));
    } finally {
      setLeaseSubmitting(false);
    }
  };

  if (!ownedUnits.length) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ChevronLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('navigation.cabinetResidents', 'Жильцы квартиры')}
          </Text>
        </View>
        <EmptyState
          title={t('cabinet.residentsOwnerOnlyTitle', 'Доступ ограничен')}
          description={t(
            'cabinet.residentsOwnerOnlySubtitle',
            'Управление жильцами доступно только подтвержденному собственнику помещения.',
          )}
        />
      </View>
    );
  }

  const isLimitReached = totalCount >= maxAllowed;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('navigation.cabinetResidents', 'Жильцы квартиры')}
        </Text>
        <TouchableOpacity
          style={styles.addHeaderBtn}
          onPress={() => {
            if (isLimitReached) {
              Alert.alert(t('common.error'), t('cabinet.residentLimitReached', 'Достигнут лимит (максимум 5 жильцов)'));
              return;
            }
            safeHaptic.selection();
            setInviteModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('cabinet.inviteResidentBtn', 'Пригласить жильца')}
        >
          <UserPlus size={22} color={isLimitReached ? theme.colors.textMuted : theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Unit Selector if multiple owned units */}
        {ownedUnits.length > 1 && (
          <View style={styles.unitSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ownedUnits.map((o, idx) => (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => {
                    safeHaptic.selection();
                    setSelectedUnitIndex(idx);
                  }}
                  style={[
                    styles.unitChip,
                    {
                      backgroundColor: idx === selectedUnitIndex ? theme.colors.primaryBg : theme.colors.surface,
                      borderColor: idx === selectedUnitIndex ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      { color: idx === selectedUnitIndex ? theme.colors.primary : theme.colors.text },
                    ]}
                  >
                    {t('common.unitShort')} {o.unit?.unitNumber} ({o.unit?.building?.blockName})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Unit Summary Card */}
        <AnimatedEntrance index={0}>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={[styles.homeIconCircle, { backgroundColor: theme.colors.primaryBg }]}>
                <Home color={theme.colors.primary} size={22} />
              </View>
              <View style={styles.summaryInfo}>
                <Text style={[styles.summaryUnitName, { color: theme.colors.text }]}>
                  {t('cabinet.apartment', { number: activeOwnership?.unit?.unitNumber || '' })} •{' '}
                  {activeOwnership?.unit?.building?.blockName || ''}
                </Text>
                <Text style={[styles.summarySub, { color: theme.colors.textMuted }]}>
                  {activeOwnership?.unit?.area} м² • {t('cabinet.maxResidentsPerUnit', { max: maxAllowed, defaultValue: 'Лимит до {{max}} жильцов' })}
                </Text>
              </View>
              <Badge
                label={`${totalCount} / ${maxAllowed}`}
                variant={isLimitReached ? 'warning' : 'success'}
                size="md"
              />
            </View>
          </Card>
        </AnimatedEntrance>

        {loading ? (
          <SkeletonList count={3} style={{ marginTop: 16 }} />
        ) : (
          <>
            {/* Section 1: Active Residents */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('cabinet.verifiedResidentsTitle', 'Текущие жильцы')} ({residents.length})
              </Text>
            </View>

            {residents.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  {t('cabinet.noResidentsYet', 'Жильцов пока нет')}
                </Text>
              </Card>
            ) : (
              residents.map((r, idx) => {
                const isResidentOwner = r.ownershipType === 'OWNER';
                const isExpired = r.isLeaseExpired || (r.leaseEndDate && new Date(r.leaseEndDate).getTime() < Date.now());

                return (
                  <AnimatedEntrance key={r.id} index={idx + 1}>
                    <Card style={styles.residentCard}>
                      <View style={styles.residentHeader}>
                        <View style={styles.residentLeft}>
                          <View style={[styles.avatarCircle, { backgroundColor: theme.colors.card }]}>
                            <Text style={[styles.avatarInitial, { color: theme.colors.text }]}>
                              {(r.user.firstName || 'Ж').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.residentTextInfo}>
                            <View style={styles.residentNameRow}>
                              <Text style={[styles.residentName, { color: theme.colors.text }]}>
                                {r.user.firstName} {r.user.lastName}
                              </Text>
                              <Badge
                                label={roleLabel(r.ownershipType, t)}
                                variant={
                                  r.ownershipType === 'OWNER'
                                    ? 'primary'
                                    : r.ownershipType === 'TENANT'
                                    ? 'info'
                                    : 'neutral'
                                }
                                size="sm"
                              />
                              {isExpired && (
                                <Badge label={t('cabinet.leaseExpired', 'Истек')} variant="danger" size="sm" />
                              )}
                            </View>

                            <View style={styles.metaRow}>
                              <Phone size={13} color={theme.colors.textMuted} />
                              <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
                                {r.user.phone}
                              </Text>
                            </View>

                            <View style={styles.metaRow}>
                              <Calendar size={13} color={theme.colors.textMuted} />
                              <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
                                {r.leaseEndDate
                                  ? `${t('cabinet.leaseUntil', 'Срок:')} ${new Date(r.leaseEndDate).toLocaleDateString()}`
                                  : t('cabinet.leaseIndefinite', 'Бессрочно')}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {!isResidentOwner && (
                        <View style={[styles.residentActions, { borderTopColor: theme.colors.border }]}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { borderColor: theme.colors.border }]}
                            onPress={() => {
                              safeHaptic.selection();
                              setEditingResident(r);
                              setNewLeaseEndDate(r.leaseEndDate ? r.leaseEndDate.substring(0, 10) : '');
                            }}
                          >
                            <Edit3 size={14} color={theme.colors.text} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>
                              {t('cabinet.changeLeaseBtn', 'Срок')}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, styles.revokeBtn, { borderColor: theme.colors.dangerBorder }]}
                            onPress={() => confirmRevokeResident(r)}
                          >
                            <Trash2 size={14} color={theme.colors.danger} />
                            <Text style={[styles.actionBtnText, { color: theme.colors.danger }]}>
                              {t('cabinet.revokeAccessBtn', 'Отозвать')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </Card>
                  </AnimatedEntrance>
                );
              })
            )}

            {/* Section 2: Pending Invitations */}
            <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('cabinet.pendingInvitationsTitle', 'Ожидающие приглашения')} ({invitations.length})
              </Text>
            </View>

            {invitations.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  {t('cabinet.noPendingInvitations', 'Нет активных приглашений')}
                </Text>
              </Card>
            ) : (
              invitations.map((inv) => (
                <Card key={inv.id} style={styles.invitationCard}>
                  <View style={styles.invitationRow}>
                    <View style={[styles.clockCircle, { backgroundColor: theme.colors.warningBg }]}>
                      <Clock size={18} color={theme.colors.warning} />
                    </View>
                    <View style={styles.invitationInfo}>
                      <View style={styles.invitationPhoneRow}>
                        <Text style={[styles.invitationPhone, { color: theme.colors.text }]}>
                          {inv.phone}
                        </Text>
                        {inv.fullName && (
                          <Text style={[styles.invitationName, { color: theme.colors.textMuted }]}>
                            ({inv.fullName})
                          </Text>
                        )}
                        <Badge
                          label={roleLabel(inv.ownershipType, t)}
                          variant={inv.ownershipType === 'TENANT' ? 'info' : 'neutral'}
                          size="sm"
                        />
                      </View>
                      <Text style={[styles.invitationMeta, { color: theme.colors.textMuted }]}>
                        {inv.leaseEndDate
                          ? `${t('cabinet.leaseUntil', 'Срок:')} ${new Date(inv.leaseEndDate).toLocaleDateString()}`
                          : t('cabinet.leaseIndefinite', 'Бессрочно')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmRevokeInvitation(inv)}
                      style={[styles.cancelInvBtn, { borderColor: theme.colors.dangerBorder }]}
                    >
                      <X size={16} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* BottomSheet 1: Invite Resident */}
      <BottomSheet
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        title={t('cabinet.inviteResidentModalTitle', 'Пригласить жильца')}
      >
        <ScrollView style={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Input
            label={t('cabinet.residentPhoneLabel', 'Номер телефона')}
            placeholder="+77015550199"
            value={invitePhone}
            onChangeText={setInvitePhone}
            keyboardType="phone-pad"
          />

          <Input
            label={t('cabinet.residentNameLabel', 'ФИО жильца (необязательно)')}
            placeholder="Иван Иванов"
            value={inviteName}
            onChangeText={setInviteName}
          />

          <View style={styles.fieldWrap}>
            <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
              {t('cabinet.residentRoleLabel', 'Категория жильца')}
            </Text>
            <SegmentedControl
              options={[
                { value: 'TENANT', label: t('onboarding.roleTenant') },
                { value: 'FAMILY_MEMBER', label: t('onboarding.roleFamilyMember', 'Член семьи') },
              ]}
              value={inviteType}
              onChange={(val) => setInviteType(val as any)}
            />
          </View>

          <Input
            label={t('cabinet.leaseEndDateLabel', 'Срок аренды (ГГГГ-ММ-ДД)')}
            placeholder="2026-12-31"
            value={inviteLeaseEnd}
            onChangeText={setInviteLeaseEnd}
            helper={t('cabinet.leaseEndDateHint', 'Если не указано, доступ бессрочный')}
          />

          <Button
            title={t('cabinet.sendInviteBtn', 'Отправить приглашение')}
            onPress={handleSendInvite}
            loading={inviteSubmitting}
            variant="primary"
            size="lg"
            style={{ marginTop: 12, marginBottom: 24 }}
          />
        </ScrollView>
      </BottomSheet>

      {/* BottomSheet 2: Edit Lease */}
      <BottomSheet
        visible={Boolean(editingResident)}
        onClose={() => setEditingResident(null)}
        title={t('cabinet.editLeaseModalTitle', 'Изменить срок проживания')}
      >
        <View style={styles.sheetContent}>
          <Text style={[styles.editResidentHeader, { color: theme.colors.textMuted }]}>
            {editingResident?.user.firstName} {editingResident?.user.lastName} ({editingResident?.user.phone})
          </Text>

          <Input
            label={t('cabinet.newLeaseEndDateLabel', 'Новый срок аренды (ГГГГ-ММ-ДД)')}
            placeholder="2026-12-31"
            value={newLeaseEndDate}
            onChangeText={setNewLeaseEndDate}
          />

          <TouchableOpacity onPress={() => setNewLeaseEndDate('')} style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: theme.colors.primary, fontWeight: '600' }}>
              {t('cabinet.makeIndefinite', 'Сделать бессрочным')}
            </Text>
          </TouchableOpacity>

          <Button
            title={t('common.save', 'Сохранить')}
            onPress={handleUpdateLease}
            loading={leaseSubmitting}
            variant="primary"
            size="lg"
            style={{ marginBottom: 24 }}
          />
        </View>
      </BottomSheet>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 6,
  },
  addHeaderBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  unitSelector: {
    marginBottom: 12,
  },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  unitChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryCard: {
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryUnitName: {
    fontSize: 15,
    fontWeight: '700',
  },
  summarySub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeaderRow: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  residentCard: {
    marginBottom: 10,
    padding: 14,
  },
  residentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  residentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  residentTextInfo: {
    flex: 1,
  },
  residentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  residentName: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  metaText: {
    fontSize: 12,
  },
  residentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  revokeBtn: {
    backgroundColor: 'transparent',
  },
  invitationCard: {
    marginBottom: 8,
    padding: 12,
  },
  invitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clockCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  invitationInfo: {
    flex: 1,
  },
  invitationPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  invitationPhone: {
    fontSize: 13,
    fontWeight: '700',
  },
  invitationName: {
    fontSize: 12,
  },
  invitationMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  cancelInvBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyCard: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  sheetContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  editResidentHeader: {
    fontSize: 13,
    marginBottom: 16,
  },
});
