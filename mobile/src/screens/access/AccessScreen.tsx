import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Share,
  Platform,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { AuthApi } from '../../api/auth';
import {
  AccessApi,
  AccessPoint,
  GuestPass,
  StreamEndpoints,
} from '../../api/access';
import { getApiErrorMessage } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  BadgeVariant,
  Button,
  IconButton,
  Input,
  SkeletonCard,
  EmptyState,
  AnimatedEntrance,
  Divider,
} from '../../components/ui';
import { HoldToOpenButton } from '../../components/access/HoldToOpenButton';
import { PinEntryModal } from '../../components/access/PinEntryModal';
import {
  ShieldCheck,
  UserPlus,
  Video,
  Share2,
  Copy,
  X,
  Clock,
  Car,
  KeyRound,
  ChevronRight,
  ShieldAlert,
  Sliders,
  QrCode,
  Shield,
  Trash2,
} from 'lucide-react-native';

export const AccessScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);

  const { user } = useAuth();
  const tenantId =
    user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;
  const primaryUnitId = user?.ownerships?.[0]?.unitId;
  const isVerified = user?.ownerships?.[0]?.isVerified;

  const [points, setPoints] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingPointId, setOpeningPointId] = useState<string | null>(null);

  // 2FA PIN states
  const [isPinSet, setIsPinSet] = useState<boolean | null>(null);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [selectedBarrier, setSelectedBarrier] = useState<AccessPoint | null>(
    null
  );
  const [pinError, setPinError] = useState<string | null>(null);
  const [openingWithPin, setOpeningWithPin] = useState(false);

  // Guest Pass modal
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [creatingPass, setCreatingPass] = useState(false);
  const [createdPass, setCreatedPass] = useState<GuestPass | null>(null);

  // Guest passes history
  const [guestPasses, setGuestPasses] = useState<GuestPass[]>([]);
  const [loadingPasses, setLoadingPasses] = useState(false);
  const [revokingPassId, setRevokingPassId] = useState<string | null>(null);

  // Camera stream modal
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [selectedStream, setSelectedStream] = useState<StreamEndpoints | null>(
    null
  );
  const [loadingStream, setLoadingStream] = useState(false);

  const fetchPinStatus = useCallback(async () => {
    try {
      const res = await AuthApi.getPinStatus();
      setIsPinSet(res.isPinSet);
    } catch (err) {
      console.warn('Failed to load PIN status:', err);
    }
  }, []);

  const fetchGuestPasses = useCallback(async () => {
    if (!primaryUnitId || !isVerified) {
      setGuestPasses([]);
      return;
    }
    try {
      setLoadingPasses(true);
      const passes = await AccessApi.getUnitGuestPasses(primaryUnitId);
      setGuestPasses(passes || []);
    } catch (err) {
      console.warn('Failed to load guest passes:', err);
    } finally {
      setLoadingPasses(false);
    }
  }, [primaryUnitId, isVerified]);

  const fetchPoints = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const [data] = await Promise.all([
        AccessApi.getAccessPoints(tenantId),
        fetchGuestPasses(),
        fetchPinStatus(),
      ]);
      setPoints(data || []);
    } catch (err) {
      console.warn('Failed to load access points:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, fetchGuestPasses, fetchPinStatus]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  useEffect(() => {
    if (isFocused) {
      fetchPinStatus();
      fetchGuestPasses();
    }
  }, [isFocused, fetchPinStatus, fetchGuestPasses]);

  const onRefresh = () => {
    setRefreshing(true);
    safeHaptic.selection();
    fetchPoints();
  };

  const handleRevokePass = async (pass: GuestPass) => {
    safeHaptic.selection();
    setRevokingPassId(pass.id);
    try {
      await AccessApi.revokeGuestPass(pass.id);
      safeHaptic.notification();
      showToast({
        type: 'success',
        title: t('common.success'),
        message: t('access.revokedSuccess'),
      });
      fetchGuestPasses();
      if (createdPass?.id === pass.id) {
        setCreatedPass(null);
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(err),
      });
    } finally {
      setRevokingPassId(null);
    }
  };

  const handleTriggerOpenBarrier = (barrier: AccessPoint) => {
    if (!isVerified) {
      showToast({
        type: 'warning',
        title: t('access.accessRestrictedTitle'),
        message: t('access.accessRestrictedMsg'),
      });
      return;
    }

    if (isPinSet === false) {
      showToast({
        type: 'warning',
        title: t('access.pinNotSetTitle'),
        message: t('access.pinNotSetMsg'),
        onPress: () => navigation.navigate('PinSetup'),
      });
      return;
    }

    setSelectedBarrier(barrier);
    setPinError(null);
    setPinModalVisible(true);
  };

  const handleConfirmPin = async (pin: string) => {
    if (!selectedBarrier) return;

    setOpeningWithPin(true);
    setPinError(null);

    try {
      const res = await AccessApi.openBarrier(
        selectedBarrier.id,
        pin,
        primaryUnitId
      );
      setPinModalVisible(false);
      setSelectedBarrier(null);
      safeHaptic.notification();

      showToast({
        type: 'success',
        title: t('access.openSuccessTitle'),
        message: res.message || t('access.openSuccessMsg'),
      });
    } catch (e: any) {
      const msg = getApiErrorMessage(e);
      safeHaptic.notification();
      if (msg.includes('PIN_NOT_SET')) {
        setIsPinSet(false);
        setPinModalVisible(false);
        showToast({
          type: 'error',
          title: t('access.pinNotSetTitle'),
          message: t('access.profilePinSetupMsg'),
          onPress: () => navigation.navigate('PinSetup'),
        });
      } else {
        setPinError(msg || t('access.incorrectPin'));
      }
    } finally {
      setOpeningWithPin(false);
    }
  };

  const handleCreatePass = async () => {
    if (!primaryUnitId) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: t('access.noUnitAttachedError'),
      });
      return;
    }

    if (!guestName.trim()) {
      showToast({
        type: 'warning',
        title: t('common.error'),
        message: t('access.enterGuestNameWarning'),
      });
      return;
    }

    setCreatingPass(true);
    safeHaptic.selection();

    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      const pass = await AccessApi.createGuestPass({
        unitId: primaryUnitId,
        guestName: guestName.trim(),
        guestPlateNumber: guestPlate.trim() || undefined,
        validFrom: now.toISOString(),
        validTo: expiry.toISOString(),
      });

      setCreatedPass(pass);
      setGuestName('');
      setGuestPlate('');
      safeHaptic.notification();
      fetchGuestPasses();

      showToast({
        type: 'success',
        title: t('common.success'),
        message: t('access.passCreatedSuccess', { code: pass.accessCode }),
      });
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setCreatingPass(false);
    }
  };

  const handleSharePass = async (pass: GuestPass) => {
    safeHaptic.selection();
    try {
      const plateLine = pass.guestPlateNumber
        ? `${t('access.guestPlateLabel', { plate: pass.guestPlateNumber })}\n`
        : '';
      const message = t('access.shareTemplateTitle', {
        complex: user?.tenant?.name || t('dashboard.defaultComplex'),
        guest: pass.guestName,
        plateLine,
        code: pass.accessCode,
        time: new Date(pass.validTo).toLocaleTimeString(i18n.language, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });

      await Share.share({ message });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const handleCopyCode = async (code: string) => {
    safeHaptic.selection();
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    ) {
      try {
        await navigator.clipboard.writeText(code);
      } catch (err) {
        console.warn('Clipboard write error:', err);
      }
    }
    showToast({
      type: 'success',
      title: t('common.success'),
      message: t('access.codeCopied'),
    });
  };

  const handleOpenIntercom = async (pointId: string) => {
    if (!isVerified) {
      showToast({
        type: 'warning',
        title: t('access.accessRestrictedTitle'),
        message: t('access.accessRestrictedMsg'),
      });
      return;
    }

    setOpeningPointId(pointId);
    safeHaptic.selection();

    try {
      const res = await AccessApi.openBarrier(pointId, '', primaryUnitId);
      safeHaptic.notification();
      showToast({
        type: 'success',
        title: t('access.openSuccessTitle'),
        message: res.message || t('access.openSuccessMsg'),
      });
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setOpeningPointId(null);
    }
  };

  const handleWatchCamera = async (point: AccessPoint) => {
    setLoadingStream(true);
    safeHaptic.selection();
    try {
      const streams = await AccessApi.getCameraStream(point.id);
      setSelectedStream(streams);
      setCameraModalVisible(true);
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('access.cameraUnavailableTitle'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setLoadingStream(false);
    }
  };

  const getPassRemainingTime = (validTo: string): string => {
    const diff = new Date(validTo).getTime() - Date.now();
    if (diff <= 0) return t('access.statusExpired');
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours} ${t('common.hoursShort')} ${mins} ${t('common.minsShort')}`;
    return `${mins} ${t('common.minsShort')}`;
  };

  const activePasses = guestPasses.filter(
    (p) => p.status === 'ACTIVE' && new Date(p.validTo).getTime() > Date.now()
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {t('access.title')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {t('access.subtitle')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            safeHaptic.selection();
            navigation.navigate('PinSetup');
          }}
          style={[
            styles.pinStatusBtn,
            {
              backgroundColor: isPinSet
                ? theme.colors.primaryBg
                : theme.colors.warningBg,
              borderColor: isPinSet
                ? theme.colors.primary
                : theme.colors.warning,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="PIN 2FA"
        >
          <KeyRound
            size={14}
            color={isPinSet ? theme.colors.primary : theme.colors.warning}
          />
          <Text
            style={[
              styles.pinStatusText,
              {
                color: isPinSet
                  ? theme.colors.primary
                  : theme.colors.warning,
              },
            ]}
          >
            {isPinSet ? t('common.configured') : 'PIN 2FA'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarInset },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Verification Warning Notice if unverified */}
        {!isVerified && (
          <AnimatedEntrance index={0}>
            <Card
              style={[
                styles.warningBanner,
                {
                  backgroundColor: theme.colors.warningBg,
                  borderColor: theme.colors.warningBorder,
                },
              ]}
            >
              <View style={styles.warningRow}>
                <ShieldAlert size={20} color={theme.colors.warning} />
                <Text
                  style={[styles.warningText, { color: theme.colors.warning }]}
                >
                  {t('access.unverifiedNotice')}
                </Text>
              </View>
            </Card>
          </AnimatedEntrance>
        )}

        {/* 2FA PIN Recommendation Banner if PIN not set */}
        {isPinSet === false && (
          <AnimatedEntrance index={1}>
            <Card
              onPress={() => {
                safeHaptic.selection();
                navigation.navigate('PinSetup');
              }}
              style={[
                styles.pinPromoCard,
                {
                  backgroundColor: theme.colors.infoBg,
                  borderColor: theme.colors.infoBorder,
                },
              ]}
              accessibilityLabel={t('access.pinBannerTitle')}
            >
              <View style={styles.pinPromoRow}>
                <View
                  style={[
                    styles.pinIconCircle,
                    { backgroundColor: theme.colors.info },
                  ]}
                >
                  <KeyRound size={20} color="#FFFFFF" />
                </View>
                <View style={styles.pinPromoTextWrap}>
                  <Text
                    style={[styles.pinPromoTitle, { color: theme.colors.info }]}
                  >
                    {t('access.pinBannerTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.pinPromoSub,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {t('access.pinBannerSub')}
                  </Text>
                </View>
                <ChevronRight size={18} color={theme.colors.info} />
              </View>
            </Card>
          </AnimatedEntrance>
        )}

        {/* SECTION 1: Barriers & Gates */}
        <AnimatedEntrance index={2}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>
              {t('access.barriersSection')}
            </Text>
          </View>

          {loading ? (
            <SkeletonCard style={{ height: 160 }} />
          ) : points.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text
                style={[styles.emptyCardText, { color: theme.colors.textMuted }]}
              >
                {t('access.noBarriers')}
              </Text>
            </Card>
          ) : (
            <View style={styles.pointsList}>
              {points.map((point) => {
                const isIntercom = point.type === 'DOOR_INTERCOM';
                const isOpening = openingPointId === point.id;

                return (
                  <Card key={point.id} style={styles.pointCard}>
                    <View style={styles.pointCardHeader}>
                      <View style={styles.pointLeftWrap}>
                        <View
                          style={[
                            styles.pointIconWrap,
                            {
                              backgroundColor: theme.colors.primaryBg,
                              borderColor: theme.colors.primary,
                            },
                          ]}
                        >
                          <ShieldCheck size={22} color={theme.colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.pointName,
                              { color: theme.colors.text },
                            ]}
                          >
                            {point.name}
                          </Text>
                          <Text
                            style={[
                              styles.pointMeta,
                              { color: theme.colors.textMuted },
                            ]}
                          >
                            {point.type === 'BARRIER'
                              ? t('access.pointTypeBarrier')
                              : point.type === 'GATE'
                              ? t('access.pointTypeGate')
                              : t('access.pointTypeIntercom')}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.pointRightWrap}>
                        <Badge
                          label={
                            point.isActive
                              ? t('access.pointOnline')
                              : t('access.pointOffline')
                          }
                          variant={point.isActive ? 'success' : 'neutral'}
                          size="sm"
                          showDot
                        />

                        {Boolean(point.streamName) && (
                          <IconButton
                            icon={<Video size={18} color={theme.colors.primary} />}
                            onPress={() => handleWatchCamera(point)}
                            variant="surface"
                            size={36}
                            accessibilityLabel={t('access.watchCamera')}
                          />
                        )}
                      </View>
                    </View>

                    {/* Action: HoldToOpenButton for Barrier / Gate / Intercom */}
                    <HoldToOpenButton
                      title={
                        isIntercom
                          ? t('access.holdToOpenIntercom')
                          : t('access.holdToOpen')
                      }
                      onConfirmed={() => {
                        if (isIntercom) {
                          return handleOpenIntercom(point.id);
                        } else {
                          return handleTriggerOpenBarrier(point);
                        }
                      }}
                      loading={isOpening}
                      disabled={!isVerified}
                    />
                  </Card>
                );
              })}
            </View>
          )}
        </AnimatedEntrance>

        {/* SECTION 2: Guest Passes */}
        <AnimatedEntrance index={3}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.sectionHeading, { color: theme.colors.text }]}
              >
                {t('access.guestPassesSection')}
              </Text>
              <Text
                style={[styles.sectionSubheading, { color: theme.colors.textMuted }]}
              >
                {t('access.guestPromoSub')}
              </Text>
            </View>

            <Button
              title={t('access.createPassBtn')}
              onPress={() => {
                safeHaptic.selection();
                setGuestModalVisible(true);
              }}
              variant="primary"
              size="sm"
              leftIcon={<UserPlus size={16} color={theme.colors.onPrimary} />}
              disabled={!isVerified}
              accessibilityLabel={t('access.createPassBtn')}
            />
          </View>

          {/* If created pass is active, display detailed QR Card */}
          {createdPass && (
            <Card
              style={[
                styles.qrHeroCard,
                {
                  backgroundColor: theme.colors.surfaceElevated,
                  borderColor: theme.colors.primary,
                },
              ]}
            >
              <View style={styles.qrCardHeader}>
                <View style={styles.qrBadgeRow}>
                  <Badge
                    label={t('access.passActive')}
                    variant="success"
                    size="sm"
                    showDot
                  />
                  <Text
                    style={[
                      styles.qrExpireText,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {t('access.passExpiresIn', {
                      time: getPassRemainingTime(createdPass.validTo),
                    })}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setCreatedPass(null)}
                  style={styles.qrCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <X size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.qrCodeBox}>
                <View style={styles.qrCodeCanvasWrap}>
                  <QRCode
                    value={`SHANYRAQ:PASS:${createdPass.id}:${createdPass.accessCode}`}
                    size={160}
                    color="#000000"
                    backgroundColor="#FFFFFF"
                  />
                </View>

                <View style={styles.codeMetaBox}>
                  <Text
                    style={[
                      styles.codeLabel,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {t('access.passCodeTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.codeDigits,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {createdPass.accessCode}
                  </Text>
                  <Text
                    style={[styles.guestName, { color: theme.colors.text }]}
                  >
                    {t('access.guestNameLabel', { name: createdPass.guestName })}
                  </Text>
                  {Boolean(createdPass.guestPlateNumber) && (
                    <Text
                      style={[styles.guestPlate, { color: theme.colors.textMuted }]}
                    >
                      {t('access.guestPlateLabel', {
                        plate: createdPass.guestPlateNumber,
                      })}
                    </Text>
                  )}
                </View>
              </View>

              {/* Actions row: Share, Copy, Revoke */}
              <View
                style={[
                  styles.qrActionsRow,
                  { borderTopColor: theme.colors.border },
                ]}
              >
                <Button
                  title={t('access.sharePassBtn')}
                  onPress={() => handleSharePass(createdPass)}
                  variant="primary"
                  size="sm"
                  leftIcon={<Share2 size={16} color={theme.colors.onPrimary} />}
                  style={styles.qrActionBtn}
                />
                <Button
                  title={t('access.copyCode')}
                  onPress={() => handleCopyCode(createdPass.accessCode)}
                  variant="secondary"
                  size="sm"
                  leftIcon={<Copy size={16} color={theme.colors.text} />}
                  style={styles.qrActionBtn}
                />
                <Button
                  title={t('access.revokePassBtn')}
                  onPress={() => handleRevokePass(createdPass)}
                  variant="destructive"
                  size="sm"
                  style={styles.qrActionBtn}
                />
              </View>
            </Card>
          )}

          {/* Active Guest Passes List */}
          {activePasses.length > 0 ? (
            <View style={styles.activePassesList}>
              {activePasses.map((pass) => (
                <Card key={pass.id} style={styles.passMiniCard}>
                  <View style={styles.passMiniRow}>
                    <View
                      style={[
                        styles.passMiniIcon,
                        { backgroundColor: theme.colors.primaryBg },
                      ]}
                    >
                      <QrCode size={20} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.passMiniName, { color: theme.colors.text }]}
                      >
                        {pass.guestName}
                      </Text>
                      <Text
                        style={[
                          styles.passMiniCode,
                          { color: theme.colors.primary },
                        ]}
                      >
                        {pass.accessCode}
                        {pass.guestPlateNumber ? ` • ${pass.guestPlateNumber}` : ''}
                      </Text>
                      <Text
                        style={[
                          styles.passMiniExpiry,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        {t('access.validUntil', {
                          time: new Date(pass.validTo).toLocaleTimeString(
                            i18n.language,
                            { hour: '2-digit', minute: '2-digit' }
                          ),
                        })}
                      </Text>
                    </View>

                    <View style={styles.passMiniActions}>
                      <IconButton
                        icon={<Share2 size={16} color={theme.colors.primary} />}
                        onPress={() => handleSharePass(pass)}
                        variant="surface"
                        size={36}
                        accessibilityLabel={t('access.sharePassBtn')}
                      />
                      <IconButton
                        icon={<Trash2 size={16} color={theme.colors.danger} />}
                        onPress={() => handleRevokePass(pass)}
                        variant="surface"
                        size={36}
                        disabled={revokingPassId === pass.id}
                        accessibilityLabel={t('access.revokePassBtn')}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : !createdPass ? (
            <EmptyState
              title={t('access.noHistory')}
              description={t('access.guestPromoSub')}
              actionTitle={t('access.createPassBtn')}
              onActionPress={() => {
                safeHaptic.selection();
                setGuestModalVisible(true);
              }}
            />
          ) : null}
        </AnimatedEntrance>
      </ScrollView>

      {/* 2FA PIN Modal */}
      {selectedBarrier && (
        <PinEntryModal
          visible={pinModalVisible}
          accessPointName={selectedBarrier.name}
          loading={openingWithPin}
          error={pinError}
          onConfirm={handleConfirmPin}
          onCancel={() => {
            setPinModalVisible(false);
            setSelectedBarrier(null);
          }}
          onForgotPin={() => {
            setPinModalVisible(false);
            navigation.navigate('PinSetup');
          }}
        />
      )}

      {/* Guest Pass Creation Modal */}
      <Modal
        visible={guestModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGuestModalVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { backgroundColor: theme.colors.overlay },
          ]}
        >
          <View
            style={[
              styles.createModalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                ...theme.shadows.floating,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text
                style={[styles.modalTitle, { color: theme.colors.text }]}
              >
                {t('access.guestModalTitle')}
              </Text>
              <IconButton
                icon={<X size={20} color={theme.colors.textMuted} />}
                onPress={() => setGuestModalVisible(false)}
                variant="ghost"
                size={36}
                accessibilityLabel={t('common.close')}
              />
            </View>

            <Input
              label={t('access.guestInputLabel')}
              placeholder={t('access.guestInputPlaceholder')}
              value={guestName}
              onChangeText={setGuestName}
              containerStyle={{ marginBottom: 14 }}
            />

            <Input
              label={t('access.plateInputLabel')}
              placeholder={t('access.plateInputPlaceholder')}
              value={guestPlate}
              onChangeText={setGuestPlate}
              helper={t('access.plateHelper')}
              containerStyle={{ marginBottom: 20 }}
            />

            <Button
              title={t('access.generateQrBtn')}
              onPress={async () => {
                await handleCreatePass();
                setGuestModalVisible(false);
              }}
              loading={creatingPass}
              variant="primary"
              size="lg"
              leftIcon={<QrCode size={20} color={theme.colors.onPrimary} />}
              style={{ width: '100%' }}
              accessibilityLabel={t('access.generateQrBtn')}
            />
          </View>
        </View>
      </Modal>

      {/* Camera Live Stream Modal */}
      {selectedStream && (
        <Modal
          visible={cameraModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCameraModalVisible(false)}
        >
          <View
            style={[
              styles.modalOverlay,
              { backgroundColor: theme.colors.overlay },
            ]}
          >
            <View
              style={[
                styles.createModalCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.modalHeaderRow}>
                <Text
                  style={[styles.modalTitle, { color: theme.colors.text }]}
                >
                  {t('access.liveCameraTitle')}
                </Text>
                <IconButton
                  icon={<X size={20} color={theme.colors.textMuted} />}
                  onPress={() => setCameraModalVisible(false)}
                  variant="ghost"
                  size={36}
                  accessibilityLabel={t('common.close')}
                />
              </View>

              <View
                style={[
                  styles.cameraStreamBox,
                  { backgroundColor: theme.colors.overlay },
                ]}
              >
                <Video size={36} color={theme.colors.primary} />
                <Text style={styles.streamConnectingText}>
                  {t('access.connectingStream')}
                </Text>
                <Text style={[styles.streamEndpointText, { color: theme.colors.textMuted }]}>
                  {selectedStream.endpoints?.hls || selectedStream.endpoints?.webPlayer || 'Live Stream'}
                </Text>
              </View>

              <Button
                title={t('common.close')}
                variant="secondary"
                onPress={() => setCameraModalVisible(false)}
                style={{ marginTop: 14, width: '100%' }}
              />
            </View>
          </View>
        </Modal>
      )}
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
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  pinStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pinStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  warningBanner: {
    padding: 14,
    borderWidth: 1,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  pinPromoCard: {
    padding: 14,
    borderWidth: 1.5,
  },
  pinPromoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pinIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPromoTextWrap: {
    flex: 1,
  },
  pinPromoTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  pinPromoSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSubheading: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 14,
    textAlign: 'center',
  },
  pointsList: {
    gap: 12,
  },
  pointCard: {
    padding: 16,
    gap: 14,
  },
  pointCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  pointLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pointIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pointMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  pointRightWrap: {
    alignItems: 'flex-end',
    gap: 6,
  },
  qrHeroCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 14,
    alignItems: 'center',
  },
  qrCardHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrExpireText: {
    fontSize: 12,
    fontWeight: '500',
  },
  qrCloseBtn: {
    padding: 4,
  },
  qrCodeBox: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  qrCodeCanvasWrap: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 14,
  },
  codeMetaBox: {
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  codeDigits: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    marginVertical: 4,
  },
  guestName: {
    fontSize: 15,
    fontWeight: '700',
  },
  guestPlate: {
    fontSize: 13,
    marginTop: 2,
  },
  qrActionsRow: {
    width: '100%',
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  qrActionBtn: {
    flex: 1,
  },
  activePassesList: {
    gap: 10,
    marginTop: 8,
  },
  passMiniCard: {
    padding: 14,
  },
  passMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  passMiniIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passMiniName: {
    fontSize: 15,
    fontWeight: '700',
  },
  passMiniCode: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  passMiniExpiry: {
    fontSize: 11,
    marginTop: 2,
  },
  passMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  createModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  cameraStreamBox: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 12,
  },
  streamConnectingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  streamEndpointText: {
    fontSize: 11,
    marginTop: 4,
  },
});
