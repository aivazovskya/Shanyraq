import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Share,
  Alert,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../context/AuthContext';
import {
  AccessApi,
  AccessPoint,
  GuestPass,
  StreamEndpoints,
} from '../../api/access';
import { getApiErrorMessage } from '../../api/client';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Badge } from '../../components/common/Badge';
import { HoldToOpenButton } from '../../components/access/HoldToOpenButton';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import {
  ShieldCheck,
  UserPlus,
  Video,
  Share2,
  X,
  Clock,
  Car,
  CheckCircle2,
} from 'lucide-react-native';

export const AccessScreen: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenantId || (user?.ownerships?.[0] as any)?.unit?.building?.tenantId;
  const primaryUnitId = user?.ownerships?.[0]?.unitId;
  const isVerified = user?.ownerships?.[0]?.isVerified;

  const [points, setPoints] = useState<AccessPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingPointId, setOpeningPointId] = useState<string | null>(null);

  // Guest Pass modal
  const [guestModalVisible, setGuestModalVisible] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [creatingPass, setCreatingPass] = useState(false);
  const [createdPass, setCreatedPass] = useState<GuestPass | null>(null);

  // Camera stream modal
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [selectedStream, setSelectedStream] = useState<StreamEndpoints | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);

  const fetchPoints = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      const data = await AccessApi.getAccessPoints(tenantId);
      setPoints(data);
    } catch (err) {
      console.warn('Failed to load access points:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPoints();
  }, [tenantId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPoints();
  };

  const handleOpenBarrier = async (pointId: string) => {
    if (!isVerified) {
      Alert.alert(
        'Доступ ограничен',
        'Открытие шлагбаума доступно только после подтверждения права собственности управляющей компанией.',
      );
      return;
    }

    setOpeningPointId(pointId);
    try {
      const res = await AccessApi.openBarrier(pointId, primaryUnitId);
      Alert.alert('Успешно', res.message || 'Шлагбаум открыт на 20 секунд');
    } catch (e: any) {
      Alert.alert('Ошибка', getApiErrorMessage(e));
    } finally {
      setOpeningPointId(null);
    }
  };

  const handleCreateGuestPass = async () => {
    if (!primaryUnitId || !isVerified) {
      Alert.alert(
        'Ошибка',
        'Оформление гостевых пропусков доступно только для подтвержденных квартир',
      );
      return;
    }
    if (!guestName.trim()) {
      Alert.alert('Внимание', 'Введите имя гостя');
      return;
    }

    setCreatingPass(true);
    try {
      const now = new Date();
      const validTo = new Date(now.getTime() + 12 * 3600 * 1000); // 12 hours

      const pass = await AccessApi.createGuestPass({
        unitId: primaryUnitId,
        guestName: guestName.trim(),
        guestPlateNumber: guestPlate.trim() || undefined,
        validFrom: now.toISOString(),
        validTo: validTo.toISOString(),
      });

      setCreatedPass(pass);
      setGuestName('');
      setGuestPlate('');
    } catch (e: any) {
      Alert.alert('Ошибка', getApiErrorMessage(e));
    } finally {
      setCreatingPass(false);
    }
  };

  const handleSharePass = async (pass: GuestPass) => {
    try {
      await Share.share({
        message:
          `🏢 Пропуск в ${user?.tenant?.name || 'ЖК Шаңырақ'}\n` +
          `Гость: ${pass.guestName}\n` +
          (pass.guestPlateNumber ? `Авто: ${pass.guestPlateNumber}\n` : '') +
          `Код для въезда/КПП: ${pass.accessCode}\n` +
          `Действует до: ${new Date(pass.validTo).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const handleViewCamera = async (pointId: string) => {
    setLoadingStream(true);
    setCameraModalVisible(true);
    try {
      const stream = await AccessApi.getCameraStream(pointId);
      setSelectedStream(stream);
    } catch (e: any) {
      Alert.alert('Камера недоступна', getApiErrorMessage(e));
      setCameraModalVisible(false);
    } finally {
      setLoadingStream(false);
    }
  };

  if (loading) {
    return <LoadingState message="Загрузка точек доступа..." />;
  }

  const barriers = points.filter((p) => p.type === 'BARRIER' || p.type === 'GATE');
  const cameras = points.filter((p) => p.type === 'CAMERA');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Управление доступом</Text>
          <Text style={styles.subtitle}>
            Шлагбаумы, ворота, гостевые пропуска и камеры видеонаблюдения
          </Text>
        </View>

        {!isVerified && (
          <View style={styles.unverifiedBanner}>
            <Text style={styles.unverifiedBannerText}>
              ⚠️ Ваша квартира находится на проверке в УК. Открытие шлагбаумов будет доступно сразу после верификации.
            </Text>
          </View>
        )}

        {/* Section: Barriers */}
        <Text style={styles.sectionHeading}>Шлагбаумы и въездные ворота</Text>

        {barriers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>В вашем ЖК пока нет настроенных шлагбаумов</Text>
          </Card>
        ) : (
          barriers.map((b) => (
            <Card key={b.id} style={styles.barrierCard}>
              <View style={styles.barrierHeader}>
                <View style={styles.barrierInfo}>
                  <Text style={styles.barrierName}>{b.name}</Text>
                  <Text style={styles.barrierType}>
                    {b.type === 'BARRIER' ? 'Шлагбаум' : 'Ворота паркинга'}
                  </Text>
                </View>
                <Badge label="Активен" variant="success" />
              </View>

              <View style={styles.buttonWrapper}>
                <HoldToOpenButton
                  title="Удерживайте для открытия"
                  onConfirmed={() => handleOpenBarrier(b.id)}
                  loading={openingPointId === b.id}
                  disabled={!isVerified}
                />
              </View>
            </Card>
          ))
        )}

        {/* Section: Guest Passes */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Гостевые пропуска</Text>
          <Button
            title="+ Оформить"
            onPress={() => {
              setCreatedPass(null);
              setGuestModalVisible(true);
            }}
            variant="outline"
            size="sm"
            disabled={!isVerified}
          />
        </View>

        <Card style={styles.guestPromoCard}>
          <View style={styles.guestPromoRow}>
            <UserPlus color={Colors.primary} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.guestPromoTitle}>Пропуск гостю или курьеру</Text>
              <Text style={styles.guestPromoSub}>
                Создайте временный PIN-код или QR для въезда автомобиля или прохода через КПП
              </Text>
            </View>
          </View>
        </Card>

        {/* Section: Cameras */}
        <Text style={styles.sectionHeading}>Камеры наблюдения двора</Text>

        {cameras.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>В ЖК нет подключенных онлайн-камер</Text>
          </Card>
        ) : (
          cameras.map((c) => (
            <Card key={c.id} style={styles.cameraCard}>
              <View style={styles.cameraRow}>
                <View style={styles.cameraIcon}>
                  <Video color={Colors.primary} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cameraName}>{c.name}</Text>
                  <Text style={styles.cameraSub}>Онлайн трансляция двора</Text>
                </View>
                <Button
                  title="Смотреть"
                  onPress={() => handleViewCamera(c.id)}
                  variant="primary"
                  size="sm"
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* CREATE GUEST PASS MODAL */}
      <Modal visible={guestModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Гостевой пропуск</Text>
              <TouchableOpacity onPress={() => setGuestModalVisible(false)}>
                <X color={Colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            {createdPass ? (
              // Display created QR Pass
              <View style={styles.qrResultContainer}>
                <View style={styles.qrBox}>
                  <QRCode
                    value={createdPass.qrCodeUrl || createdPass.accessCode}
                    size={160}
                    color="#111827"
                    backgroundColor="#FFFFFF"
                  />
                </View>

                <Text style={styles.passCodeTitle}>6-значный PIN-код:</Text>
                <Text style={styles.passCode}>{createdPass.accessCode}</Text>

                <View style={styles.passMetaBlock}>
                  <Text style={styles.passMetaText}>Гость: {createdPass.guestName}</Text>
                  {createdPass.guestPlateNumber ? (
                    <Text style={styles.passMetaText}>Автомобиль: {createdPass.guestPlateNumber}</Text>
                  ) : null}
                  <Text style={styles.passMetaText}>
                    Действует 12 часов (до {new Date(createdPass.validTo).toLocaleTimeString('ru-RU')})
                  </Text>
                </View>

                <Button
                  title="Поделиться пропуском"
                  onPress={() => handleSharePass(createdPass)}
                  variant="primary"
                  size="lg"
                  icon={<Share2 color="#FFFFFF" size={20} />}
                  style={{ width: '100%', marginTop: 16 }}
                />
              </View>
            ) : (
              // Input form
              <View>
                <Input
                  label="ФИО или имя гостя / курьера"
                  placeholder="Например: Азамат или Курьер Choco"
                  value={guestName}
                  onChangeText={setGuestName}
                />
                <Input
                  label="Госномер автомобиля (если на машине)"
                  placeholder="Например: 777KZ01"
                  value={guestPlate}
                  onChangeText={setGuestPlate}
                  leftIcon={<Car color={Colors.textMuted} size={18} />}
                  helper="Охранник на шлагбауме сверит номер и пропустит"
                />

                <Button
                  title="Сгенерировать QR-пропуск"
                  onPress={handleCreateGuestPass}
                  loading={creatingPass}
                  size="lg"
                  style={{ marginTop: 12 }}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* CAMERA VIEWER MODAL */}
      <Modal visible={cameraModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: 360 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedStream?.name || 'Прямой эфир камеры'}
              </Text>
              <TouchableOpacity onPress={() => setCameraModalVisible(false)}>
                <X color={Colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.streamContainer}>
              <View style={styles.streamMockPlaceholder}>
                <Video color="#FFFFFF" size={48} />
                <Text style={styles.streamMockText}>
                  {selectedStream ? `HLS стрим: ${selectedStream.streamName}` : 'Подключение...'}
                </Text>
                <Badge label="LIVE WebRTC / HLS" variant="danger" style={{ marginTop: 8 }} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  unverifiedBanner: {
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  unverifiedBannerText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
    marginTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 16,
  },
  barrierCard: {
    marginBottom: 12,
  },
  barrierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  barrierInfo: {
    flex: 1,
  },
  barrierName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  barrierType: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  buttonWrapper: {
    marginTop: 4,
  },
  guestPromoCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    marginBottom: 16,
  },
  guestPromoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  guestPromoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
  },
  guestPromoSub: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 16,
  },
  cameraCard: {
    marginBottom: 10,
  },
  cameraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  cameraSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyCard: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  qrResultContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  qrBox: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  passCodeTitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
  },
  passCode: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    color: Colors.primary,
  },
  passMetaBlock: {
    width: '100%',
    backgroundColor: Colors.background,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 4,
  },
  passMetaText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  streamContainer: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  streamMockPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  streamMockText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
});
