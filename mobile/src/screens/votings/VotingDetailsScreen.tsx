import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import {
  VotingsApi,
  MeetingItem,
  AgendaItem,
  VoteChoice,
} from '../../api/votings';
import { AuthApi } from '../../api/auth';
import { getApiErrorMessage } from '../../api/client';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowLeft,
  KeyRound,
  FileCheck2,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'VotingDetails'>;

export const VotingDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { meetingId } = route.params;
  const { user } = useAuth();
  const primaryUnitId = user?.ownerships?.[0]?.unitId;

  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [loading, setLoading] = useState(true);

  // 2-step SMS Vote Modal State
  const [activeItem, setActiveItem] = useState<AgendaItem | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null);
  const [voteStep, setVoteStep] = useState<1 | 2>(1); // Step 1: select choice, Step 2: enter SMS code
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteError, setVoteError] = useState('');

  const loadDetails = async () => {
    try {
      const data = await VotingsApi.getMeetingDetails(meetingId);
      setMeeting(data);
    } catch (e: any) {
      Alert.alert('Ошибка', getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [meetingId]);

  const openVoteModal = (item: AgendaItem) => {
    setActiveItem(item);
    setSelectedChoice(null);
    setVoteStep(1);
    setOtpCode('');
    setVoteError('');
  };

  const handleRequestVoteOtp = async () => {
    if (!selectedChoice) {
      setVoteError('Пожалуйста, выберите вариант волеизъявления');
      return;
    }
    if (!user?.phone) {
      setVoteError('Номер телефона не найден в профиле');
      return;
    }

    setOtpSending(true);
    setVoteError('');

    try {
      const res = await AuthApi.requestOtp(user.phone);
      if (res.devCode) {
        Alert.alert('SMS-код подтверждения голоса', `Код: ${res.devCode}`);
      }
      setVoteStep(2);
    } catch (e: any) {
      setVoteError(getApiErrorMessage(e));
    } finally {
      setOtpSending(false);
    }
  };

  const handleConfirmVote = async () => {
    if (!activeItem || !selectedChoice || !primaryUnitId) {
      setVoteError('Недостаточно данных для голосования');
      return;
    }
    if (otpCode.length !== 6) {
      setVoteError('Введите 6-значный SMS-код');
      return;
    }

    setSubmittingVote(true);
    setVoteError('');

    try {
      const result = await VotingsApi.castVote({
        agendaItemId: activeItem.id,
        unitId: primaryUnitId,
        choice: selectedChoice,
        otpCode,
      });

      Alert.alert(
        'Голос юридически зафиксирован!',
        `Ваш голос успешно подписан цифровой подписью.\nХэш подписи: ${result.signatureHash.slice(0, 16)}...`,
      );

      setActiveItem(null);
      await loadDetails();
    } catch (e: any) {
      setVoteError(getApiErrorMessage(e));
    } finally {
      setSubmittingVote(false);
    }
  };

  if (loading || !meeting) {
    return <LoadingState message="Загрузка деталей собрания..." />;
  }

  const isCompleted = meeting.status === 'COMPLETED';

  return (
    <SafeAreaView style={styles.container}>
      {/* Navigation header */}
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          Собрание ОСС
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title & metadata */}
        <View style={styles.titleSection}>
          <Badge
            label={meeting.status === 'ACTIVE' ? 'Идет голосование' : 'Завершено'}
            variant={meeting.status === 'ACTIVE' ? 'success' : 'default'}
          />
          <Text style={styles.meetingTitle}>{meeting.title}</Text>
          <Text style={styles.meetingDates}>
            Период: с {new Date(meeting.startDate).toLocaleDateString('ru-RU')} по{' '}
            {new Date(meeting.endDate).toLocaleDateString('ru-RU')}
          </Text>
          {meeting.description ? (
            <Text style={styles.meetingDescription}>{meeting.description}</Text>
          ) : null}
        </View>

        {/* Quorum Progress Card */}
        <Card style={styles.quorumCard}>
          <View style={styles.quorumHeaderRow}>
            <Text style={styles.quorumTitle}>Кворум собрания</Text>
            <Text style={styles.quorumPercent}>
              {meeting.quorumPercent?.toFixed(1) || 0}%
            </Text>
          </View>
          <View style={styles.quorumBar}>
            <View
              style={[
                styles.quorumBarFill,
                { width: `${Math.min(meeting.quorumPercent || 0, 100)}%` },
                meeting.isQuorumReached && styles.quorumBarSuccess,
              ]}
            />
          </View>
          <Text style={styles.quorumNotice}>
            {meeting.isQuorumReached
              ? '✅ Кворум преодолен (>50% площадей собственников). Решения имеют юридическую силу.'
              : '⏳ Собрание в процессе сбора кворума. Требуется участие >50% площадей ЖК.'}
          </Text>
        </Card>

        {/* Agenda items header */}
        <Text style={styles.agendaHeading}>Повестка дня ({meeting.agendaItems.length})</Text>

        {meeting.agendaItems.map((item, index) => {
          const myVote = item.myVote;
          const votesSummary = item.votesSummary;

          return (
            <Card key={item.id} style={styles.agendaCard}>
              <View style={styles.agendaHeaderRow}>
                <Text style={styles.itemOrder}>Вопрос №{index + 1}</Text>
                <Badge
                  label={
                    item.decisionType === 'QUALIFIED_MAJORITY'
                      ? 'Квалиф. большинство (2/3)'
                      : 'Простое большинство (>50%)'
                  }
                  variant="info"
                />
              </View>

              <Text style={styles.itemTitle}>{item.title}</Text>
              {item.description ? (
                <Text style={styles.itemDesc}>{item.description}</Text>
              ) : null}

              {/* Already Voted Badge */}
              {myVote ? (
                <View style={styles.votedBadgeBlock}>
                  <View style={styles.votedRow}>
                    <CheckCircle2 color="#059669" size={18} />
                    <Text style={styles.votedText}>
                      Вы проголосовали:{' '}
                      <Text style={styles.votedChoice}>
                        {myVote.choice === 'FOR'
                          ? 'ЗА'
                          : myVote.choice === 'AGAINST'
                          ? 'ПРОТИВ'
                          : 'ВОЗДЕРЖАЛСЯ'}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.signatureRow}>
                    <ShieldCheck color={Colors.textMuted} size={14} />
                    <Text style={styles.signatureHash}>
                      HMAC-SHA256: {myVote.signatureHash.slice(0, 20)}...
                    </Text>
                  </View>
                </View>
              ) : meeting.status === 'ACTIVE' ? (
                <Button
                  title="Проголосовать по вопросу"
                  onPress={() => openVoteModal(item)}
                  variant="primary"
                  size="md"
                  style={styles.voteBtn}
                />
              ) : null}

              {/* Votes summary by area (available to all residents without showing who voted) */}
              {votesSummary && (
                <View style={styles.summaryContainer}>
                  <Text style={styles.summaryTitle}>Итоги по площади ЖК:</Text>
                  <View style={styles.barItem}>
                    <Text style={styles.barLabel}>За: {votesSummary.forPercent?.toFixed(1) || 0}% ({votesSummary.forArea?.toFixed(0)} м²)</Text>
                    <View style={styles.miniBar}>
                      <View style={[styles.miniBarFill, { width: `${votesSummary.forPercent || 0}%`, backgroundColor: '#059669' }]} />
                    </View>
                  </View>
                  <View style={styles.barItem}>
                    <Text style={styles.barLabel}>Против: {votesSummary.againstPercent?.toFixed(1) || 0}% ({votesSummary.againstArea?.toFixed(0)} м²)</Text>
                    <View style={[styles.miniBarFill, { width: `${votesSummary.againstPercent || 0}%`, backgroundColor: '#EF4444' }]} />
                  </View>
                  <View style={styles.barItem}>
                    <Text style={styles.barLabel}>Воздержались: {votesSummary.abstainPercent?.toFixed(1) || 0}% ({votesSummary.abstainArea?.toFixed(0)} м²)</Text>
                    <View style={[styles.miniBarFill, { width: `${votesSummary.abstainPercent || 0}%`, backgroundColor: '#9CA3AF' }]} />
                  </View>
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {/* 2-STEP SMS VOTE MODAL */}
      <Modal visible={Boolean(activeItem)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Юридическое волеизъявление</Text>
            <Text style={styles.modalSub}>
              {activeItem?.title}
            </Text>

            {voteStep === 1 ? (
              // Step 1: Select Option
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Шаг 1 из 2: Выберите ваш голос</Text>
                <View style={styles.choiceGroup}>
                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      selectedChoice === 'FOR' && styles.choiceButtonActiveFor,
                    ]}
                    onPress={() => setSelectedChoice('FOR')}
                  >
                    <CheckCircle2
                      color={selectedChoice === 'FOR' ? '#FFFFFF' : '#059669'}
                      size={20}
                    />
                    <Text
                      style={[
                        styles.choiceText,
                        selectedChoice === 'FOR' && styles.choiceTextActive,
                      ]}
                    >
                      ЗА
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      selectedChoice === 'AGAINST' && styles.choiceButtonActiveAgainst,
                    ]}
                    onPress={() => setSelectedChoice('AGAINST')}
                  >
                    <XCircle
                      color={selectedChoice === 'AGAINST' ? '#FFFFFF' : '#EF4444'}
                      size={20}
                    />
                    <Text
                      style={[
                        styles.choiceText,
                        selectedChoice === 'AGAINST' && styles.choiceTextActive,
                      ]}
                    >
                      ПРОТИВ
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      selectedChoice === 'ABSTAIN' && styles.choiceButtonActiveAbstain,
                    ]}
                    onPress={() => setSelectedChoice('ABSTAIN')}
                  >
                    <MinusCircle
                      color={selectedChoice === 'ABSTAIN' ? '#FFFFFF' : '#6B7280'}
                      size={20}
                    />
                    <Text
                      style={[
                        styles.choiceText,
                        selectedChoice === 'ABSTAIN' && styles.choiceTextActive,
                      ]}
                    >
                      ВОЗДЕРЖАЛСЯ
                    </Text>
                  </TouchableOpacity>
                </View>

                {voteError ? <Text style={styles.modalError}>{voteError}</Text> : null}

                <Button
                  title="Подтвердить через SMS-код"
                  onPress={handleRequestVoteOtp}
                  loading={otpSending}
                  disabled={!selectedChoice}
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            ) : (
              // Step 2: Enter SMS OTP
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Шаг 2 из 2: Введите SMS-код</Text>
                <Text style={styles.otpNotice}>
                  На номер {user?.phone} отправлен 6-значный код для цифровой подписи голоса
                </Text>

                <Input
                  label="SMS-код подтверждения"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  error={voteError}
                  leftIcon={<KeyRound color={Colors.textMuted} size={18} />}
                  style={styles.modalOtpInput}
                />

                <Button
                  title="Подписать и отправить голос"
                  onPress={handleConfirmVote}
                  loading={submittingVote}
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            )}

            <Button
              title="Отмена"
              onPress={() => setActiveItem(null)}
              variant="outline"
              size="md"
              style={styles.modalCancelBtn}
            />
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
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    padding: 4,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 16,
  },
  meetingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 8,
  },
  meetingDates: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  meetingDescription: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    marginTop: 8,
  },
  quorumCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    marginBottom: 20,
  },
  quorumHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quorumTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
  },
  quorumPercent: {
    fontSize: 18,
    fontWeight: '800',
    color: '#065F46',
  },
  quorumBar: {
    height: 8,
    backgroundColor: '#D1FAE5',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  quorumBarFill: {
    height: '100%',
    backgroundColor: Colors.warning,
  },
  quorumBarSuccess: {
    backgroundColor: Colors.primary,
  },
  quorumNotice: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 16,
  },
  agendaHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
  },
  agendaCard: {
    marginBottom: 14,
  },
  agendaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemOrder: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  itemDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 12,
  },
  votedBadgeBlock: {
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  votedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  votedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
  },
  votedChoice: {
    fontWeight: '800',
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  signatureHash: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  voteBtn: {
    marginTop: 8,
  },
  summaryContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 6,
  },
  barItem: {
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 11,
    color: Colors.text,
    marginBottom: 2,
  },
  miniBar: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: 4,
    borderRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  stepContainer: {
    marginTop: 8,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 12,
  },
  choiceGroup: {
    gap: 10,
    marginBottom: 16,
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 12,
  },
  choiceButtonActiveFor: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  choiceButtonActiveAgainst: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  choiceButtonActiveAbstain: {
    backgroundColor: '#6B7280',
    borderColor: '#6B7280',
  },
  choiceText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  choiceTextActive: {
    color: '#FFFFFF',
  },
  modalError: {
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 10,
  },
  otpNotice: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  modalOtpInput: {
    textAlign: 'center',
    fontSize: 20,
    letterSpacing: 6,
  },
  modalActionBtn: {
    marginTop: 10,
  },
  modalCancelBtn: {
    marginTop: 10,
  },
});
