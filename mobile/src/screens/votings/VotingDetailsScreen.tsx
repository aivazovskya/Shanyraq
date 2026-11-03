import { LoadError } from '../../components/common/LoadError';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
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
  RefreshCw,
  KeyRound,
  FileCheck2,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'VotingDetails'>;

export const VotingDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  const { meetingId } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const primaryUnitId = user?.ownerships?.find((ownership) => ownership.isVerified && ownership.ownershipType === 'OWNER' && ownership.unit?.building?.tenantId === meeting?.tenantId)?.unitId;
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const loadVersion = useRef(0);
  const voteLock = useRef(false);

  // 2-step SMS Vote Modal State
  const [activeItem, setActiveItem] = useState<AgendaItem | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null);
  const [voteStep, setVoteStep] = useState<1 | 2>(1); // Step 1: select choice, Step 2: enter SMS code
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteError, setVoteError] = useState('');

  const loadDetails = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const data = await VotingsApi.getMeetingDetails(meetingId);
      if (version !== loadVersion.current) return;
      setMeeting(data); setLoadFailed(false);
    } catch {
      if (version === loadVersion.current) setLoadFailed(true);
    } finally {
      if (version === loadVersion.current) { setLoading(false); setRefreshing(false); }
    }
  }, [meetingId]);
  useEffect(() => {
    setMeeting(null); setLoading(true);
    void loadDetails();
    return () => { loadVersion.current++; };
  }, [loadDetails]);
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);
  const retryDetails = () => {
    if (loading || refreshing || voteLock.current) return;
    setRefreshing(true); void loadDetails();
  };
  const closeVoteModal = () => { if (!voteLock.current) setActiveItem(null); };

  const openVoteModal = (item: AgendaItem) => {
    if (voteLock.current || !primaryUnitId || meeting?.status !== 'ACTIVE') return;
    setActiveItem(item);
    setSelectedChoice(null);
    setVoteStep(1);
    setOtpCode('');
    setVoteError('');
  };

  const handleRequestVoteOtp = async () => {
    if (voteLock.current || resendCountdown > 0) return;
    if (!selectedChoice) {
      setVoteError(t('votings.voteSelectChoiceError'));
      return;
    }
    if (!user?.phone) {
      setVoteError(t('votings.phoneNotFoundError'));
      return;
    }

    voteLock.current = true;
    setOtpSending(true);
    setVoteError('');

    try {
      const res = await AuthApi.requestOtp(user.phone);
      if (res.devCode) {
        Alert.alert(
          t('votings.devSmsTitle'),
          t('votings.devSmsBody', { code: res.devCode })
        );
      }
      setOtpCode('');
      setResendCountdown(60);
      setVoteStep(2);
    } catch (e: any) {
      setVoteError(getApiErrorMessage(e));
    } finally {
      voteLock.current = false;
      setOtpSending(false);
    }
  };

  const handleConfirmVote = async () => {
    if (voteLock.current) return;
    if (!activeItem || !selectedChoice || !primaryUnitId) {
      setVoteError(t('votings.insufficientDataError'));
      return;
    }
    if (otpCode.length !== 6) {
      setVoteError(t('votings.enter6DigitSmsCodeError'));
      return;
    }

    voteLock.current = true;
    setSubmittingVote(true);
    setVoteError('');

    try {
      const result = await VotingsApi.castVote({
        agendaItemId: activeItem.id,
        unitId: primaryUnitId,
        choice: selectedChoice,
        otpCode,
      });

      setMeeting((previous) => previous ? { ...previous, agendaItems: previous.agendaItems.map((item) => item.id === activeItem.id ? { ...item, myVote: { choice: selectedChoice, areaWeight: result.areaWeight, votedAt: result.votedAt, signatureHash: result.signatureHash } } : item) } : previous);
      Alert.alert(
        t('votings.voteSuccessTitle'),
        t('votings.voteSuccessMsg', { hash: result.signatureHash.slice(0, 16) }),
      );

      setActiveItem(null);
      await loadDetails();
    } catch (e: any) {
      setVoteError(getApiErrorMessage(e));
    } finally {
      voteLock.current = false;
      setSubmittingVote(false);
    }
  };

  const header = (<View style={styles.topNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          {t('votings.navTitle')}
        </Text>
        <TouchableOpacity onPress={retryDetails} disabled={loading || refreshing || otpSending || submittingVote} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
          {refreshing ? <ActivityIndicator color={Colors.primary} /> : <RefreshCw color={Colors.textMuted} size={20} />}
        </TouchableOpacity>
      </View>);
  if (!meeting) return <SafeAreaView style={styles.container}>{header}{loading ? <LoadingState message={t('votings.loadingDetails')} /> : <LoadError onRetry={retryDetails} retrying={refreshing} />}</SafeAreaView>;

  const isCompleted = meeting.status === 'COMPLETED';

  const getChoiceLabel = (choice: string) => {
    if (choice === 'FOR') return t('votings.voteChoiceFor');
    if (choice === 'AGAINST') return t('votings.voteChoiceAgainst');
    return t('votings.voteChoiceAbstain');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Navigation header */}
      {header}

      {loadFailed && <LoadError onRetry={retryDetails} retrying={refreshing} />}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retryDetails} colors={[Colors.primary]} />} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scrollContent}>
        {/* Title & metadata */}
        <View style={styles.titleSection}>
          <Badge
            label={t(`votings.votingStatus${{ ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DRAFT: 'Draft' }[meeting.status]}`)}
            variant={meeting.status === 'ACTIVE' ? 'success' : 'default'}
          />
          <Text style={styles.meetingTitle}>{meeting.title}</Text>
          <Text style={styles.meetingDates}>
            {t('votings.periodDates', {
              start: new Date(meeting.startDate).toLocaleDateString(i18n.language),
              end: new Date(meeting.endDate).toLocaleDateString(i18n.language),
            })}
          </Text>
          {meeting.description ? (
            <Text style={styles.meetingDescription}>{meeting.description}</Text>
          ) : null}
        </View>

        {/* Quorum Progress Card */}
        <Card style={styles.quorumCard}>
          <View style={styles.quorumHeaderRow}>
            <Text style={styles.quorumTitle}>{t('votings.quorumHeader')}</Text>
            <Text style={styles.quorumPercent}>
              {meeting.quorumPercent?.toFixed(1) || 0}%
            </Text>
          </View>
          <View style={styles.quorumBar}>
            <View
              style={[
                styles.quorumBarFill,
                { width: `${Math.max(0, Math.min(meeting.quorumPercent || 0, 100))}%` },
                meeting.isQuorumReached && styles.quorumBarSuccess,
              ]}
            />
          </View>
          <Text style={styles.quorumNotice}>
            {meeting.isQuorumReached
              ? t('votings.quorumPassedNotice')
              : t('votings.quorumInProgressNotice')}
          </Text>
        </Card>

        {meeting.status === 'ACTIVE' && !primaryUnitId && <Text style={styles.quorumNotice}>{t('votings.verifiedOwnerRequired')}</Text>}
        {/* Agenda items header */}
        <Text style={styles.agendaHeading}>{t('votings.agendaTitle', { count: meeting.agendaItems.length })}</Text>

        {meeting.agendaItems.length === 0 && <Card><Text style={styles.itemDesc}>{t('residentUi.noAgenda')}</Text></Card>}
        {meeting.agendaItems.map((item, index) => {
          const myVote = item.myVote;
          const votesSummary = item.votesSummary;

          return (
            <Card key={item.id} style={styles.agendaCard}>
              <View style={styles.agendaHeaderRow}>
                <Text style={styles.itemOrder}>{t('votings.questionNumber', { index: index + 1 })}</Text>
                <Badge
                  label={
                    item.decisionType === 'QUALIFIED_MAJORITY'
                      ? t('votings.qualifiedMajority')
                      : t('votings.simpleMajority')
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
                      {t('votings.youVoted', { choice: getChoiceLabel(myVote.choice) })}
                    </Text>
                  </View>
                  <View style={styles.signatureRow}>
                    <ShieldCheck color={Colors.textMuted} size={14} />
                    <Text selectable style={styles.signatureHash}>
                      {t('votings.signatureHash', { hash: myVote.signatureHash.slice(0, 20) })}
                    </Text>
                  </View>
                </View>
              ) : meeting.status === 'ACTIVE' && primaryUnitId ? (
                <Button
                  title={t('votings.voteOnQuestion')}
                  onPress={() => openVoteModal(item)}
                  variant="primary"
                  size="md"
                  style={styles.voteBtn}
                />
              ) : null}

              {/* Votes summary by area (available to all residents without showing who voted) */}
              {votesSummary && (
                <View style={styles.summaryContainer}>
                  <Text style={styles.summaryTitle}>{t('votings.resultsByArea')}</Text>
                  <View style={styles.barItem}>
                    <Text style={styles.barLabel}>
                      {t('votings.resultsFor', {
                        percent: votesSummary.forPercent?.toFixed(1) || 0,
                        area: votesSummary.forArea?.toFixed(0) || 0,
                      })}
                    </Text>
                    <View style={styles.miniBar}>
                      <View style={[styles.miniBarFill, { width: `${Math.max(0, Math.min(votesSummary.forPercent || 0, 100))}%`, backgroundColor: '#059669' }]} />
                    </View>
                  </View>
                  <View style={styles.barItem}>
                    <Text style={styles.barLabel}>
                      {t('votings.resultsAgainst', {
                        percent: votesSummary.againstPercent?.toFixed(1) || 0,
                        area: votesSummary.againstArea?.toFixed(0) || 0,
                      })}
                    </Text>
                    <View style={styles.miniBar}><View style={[styles.miniBarFill, { width: `${Math.max(0, Math.min(votesSummary.againstPercent || 0, 100))}%`, backgroundColor: '#EF4444' }]} /></View>
                  </View>
                  <View style={styles.barItem}>
                    <Text style={styles.barLabel}>
                      {t('votings.resultsAbstain', {
                        percent: votesSummary.abstainPercent?.toFixed(1) || 0,
                        area: votesSummary.abstainArea?.toFixed(0) || 0,
                      })}
                    </Text>
                    <View style={styles.miniBar}><View style={[styles.miniBarFill, { width: `${Math.max(0, Math.min(votesSummary.abstainPercent || 0, 100))}%`, backgroundColor: '#9CA3AF' }]} /></View>
                  </View>
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {/* 2-STEP SMS VOTE MODAL */}
      <Modal visible={Boolean(activeItem)} transparent animationType="slide" onRequestClose={closeVoteModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 24 + insets.bottom }]}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{t('votings.modalLegalTitle')}</Text>
            <Text style={styles.modalSub}>
              {activeItem?.title}
            </Text>

            {voteStep === 1 ? (
              // Step 1: Select Option
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>{t('votings.step1Title')}</Text>
                <View style={styles.choiceGroup}>
                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      selectedChoice === 'FOR' && styles.choiceButtonActiveFor,
                    ]}
                    onPress={() => setSelectedChoice('FOR')}
                    disabled={otpSending || submittingVote}
                    accessibilityRole="radio" aria-checked={selectedChoice === 'FOR'} accessibilityState={{ checked: selectedChoice === 'FOR', disabled: otpSending || submittingVote }}
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
                      {t('votings.voteChoiceFor')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      selectedChoice === 'AGAINST' && styles.choiceButtonActiveAgainst,
                    ]}
                    onPress={() => setSelectedChoice('AGAINST')}
                    disabled={otpSending || submittingVote}
                    accessibilityRole="radio" aria-checked={selectedChoice === 'AGAINST'} accessibilityState={{ checked: selectedChoice === 'AGAINST', disabled: otpSending || submittingVote }}
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
                      {t('votings.voteChoiceAgainst')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      selectedChoice === 'ABSTAIN' && styles.choiceButtonActiveAbstain,
                    ]}
                    onPress={() => setSelectedChoice('ABSTAIN')}
                    disabled={otpSending || submittingVote}
                    accessibilityRole="radio" aria-checked={selectedChoice === 'ABSTAIN'} accessibilityState={{ checked: selectedChoice === 'ABSTAIN', disabled: otpSending || submittingVote }}
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
                      {t('votings.voteChoiceAbstain')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {voteError ? <Text accessibilityLiveRegion="polite" style={styles.modalError}>{voteError}</Text> : null}

                <Button
                  title={resendCountdown > 0 ? t('auth.resendTimer', { count: resendCountdown }) : t('votings.confirmViaSms')}
                  onPress={handleRequestVoteOtp}
                  loading={otpSending}
                  disabled={!selectedChoice || resendCountdown > 0}
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            ) : (
              // Step 2: Enter SMS OTP
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>{t('votings.step2Title')}</Text>
                <Text style={styles.otpNotice}>{t('votings.selectedChoice', { choice: selectedChoice ? getChoiceLabel(selectedChoice) : '' })}</Text>
                <Text style={styles.otpNotice}>
                  {t('votings.smsSentNotice', { phone: user?.phone || '' })}
                </Text>

                <Input
                  label={t('votings.smsCodeInputLabel')}
                  value={otpCode}
                  onChangeText={(value) => { setOtpCode(value.replace(/\D/g, '').slice(0, 6)); setVoteError(''); }}
                  editable={!submittingVote && !otpSending}
                  autoComplete="sms-otp" textContentType="oneTimeCode"
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  error={voteError}
                  leftIcon={<KeyRound color={Colors.textMuted} size={18} />}
                  style={styles.modalOtpInput}
                />

                <Button
                  title={t('votings.signAndSubmitVote')}
                  onPress={handleConfirmVote}
                  loading={submittingVote}
                  disabled={otpCode.length !== 6 || otpSending}
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            )}

            {voteStep === 2 && <Button title={resendCountdown > 0 ? t('auth.resendTimer', { count: resendCountdown }) : t('auth.resendButton')} onPress={handleRequestVoteOtp} disabled={resendCountdown > 0 || submittingVote} loading={otpSending} variant="outline" style={{ marginTop: 12 }} />}
            <Button
              title={t('common.cancel')}
              onPress={closeVoteModal}
              disabled={otpSending || submittingVote}
              variant="outline"
              size="md"
              style={styles.modalCancelBtn}
            />
          </ScrollView></View>
        </KeyboardAvoidingView>
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
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: 20,
    borderRadius: 24,
    backgroundColor: Colors.primaryBg,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  meetingTitle: {
    fontSize: 24,
    lineHeight: 31,
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
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    marginBottom: 20,
  },
  quorumHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
  },
  agendaHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
    flex: 1,
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
    flexShrink: 1,
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
