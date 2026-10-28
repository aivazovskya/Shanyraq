import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronLeft,
  KeyRound,
  Clock,
} from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import * as Haptics from 'expo-haptics';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  BottomSheet,
  Input,
  SkeletonList,
  ErrorState,
  AnimatedEntrance,
} from '../../components/ui';
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

type Props = NativeStackScreenProps<RootStackParamList, 'VotingDetails'>;

export const VotingDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { meetingId } = route.params;
  const { user } = useAuth();
  const primaryUnitId = user?.ownerships?.[0]?.unitId;

  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2-step SMS Vote Modal State
  const [activeItem, setActiveItem] = useState<AgendaItem | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null);
  const [voteStep, setVoteStep] = useState<1 | 2>(1); // Step 1: select choice, Step 2: enter SMS code
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteError, setVoteError] = useState('');

  const loadDetails = useCallback(async () => {
    try {
      setError(null);
      const data = await VotingsApi.getMeetingDetails(meetingId);
      setMeeting(data);
    } catch (e: any) {
      const msg = getApiErrorMessage(e);
      setError(msg);
      Alert.alert(t('common.error'), msg);
    } finally {
      setLoading(false);
    }
  }, [meetingId, t]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const openVoteModal = (item: AgendaItem) => {
    safeHaptic.selection();
    setActiveItem(item);
    setSelectedChoice(null);
    setVoteStep(1);
    setOtpCode('');
    setVoteError('');
  };

  const closeVoteModal = () => {
    safeHaptic.selection();
    setActiveItem(null);
  };

  const handleRequestVoteOtp = async () => {
    if (!selectedChoice) {
      setVoteError(t('votings.voteSelectChoiceError'));
      return;
    }
    if (!user?.phone) {
      setVoteError(t('votings.phoneNotFoundError'));
      return;
    }

    setOtpSending(true);
    setVoteError('');

    try {
      const res = await AuthApi.requestOtp(user.phone);
      safeHaptic.selection();
      if (res.devCode) {
        Alert.alert(
          t('votings.devSmsTitle'),
          t('votings.devSmsBody', { code: res.devCode }),
        );
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
      setVoteError(t('votings.insufficientDataError'));
      return;
    }
    if (otpCode.length !== 6) {
      setVoteError(t('votings.enter6DigitSmsCodeError'));
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

      safeHaptic.notification(Haptics.NotificationFeedbackType.Success);
      const hash =
        (result as any)?.vote?.voteHash ||
        (result as any)?.signatureHash ||
        (result as any)?.voteHash ||
        '';
      Alert.alert(
        t('votings.voteSuccessTitle'),
        t('votings.voteSuccessMsg', { hash: hash ? hash.slice(0, 16) : '' }),
      );

      setActiveItem(null);
      await loadDetails();
    } catch (e: any) {
      setVoteError(getApiErrorMessage(e));
    } finally {
      setSubmittingVote(false);
    }
  };

  const getChoiceLabel = (choice: string) => {
    if (choice === 'FOR') return t('votings.voteChoiceFor');
    if (choice === 'AGAINST') return t('votings.voteChoiceAgainst');
    return t('votings.voteChoiceAbstain');
  };

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
        <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {t('votings.navTitle')}
        </Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 24) + 32 }]}
      >
        {loading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonList count={3} />
          </View>
        ) : error && !meeting ? (
          <ErrorState message={error} onRetry={loadDetails} />
        ) : !meeting ? null : (
          <AnimatedEntrance>
            {/* Title & metadata section */}
            <View style={styles.titleSection}>
              <Badge
                label={
                  meeting.status === 'ACTIVE'
                    ? t('votings.votingStatusActive')
                    : t('votings.votingStatusCompleted')
                }
                variant={meeting.status === 'ACTIVE' ? 'success' : 'neutral'}
                size="md"
              />
              <Text style={[styles.meetingTitle, { color: theme.colors.text }]}>
                {meeting.title}
              </Text>
              <View style={styles.dateMetaRow}>
                <Clock size={13} color={theme.colors.textMuted} />
                <Text style={[styles.meetingDates, { color: theme.colors.textMuted }]}>
                  {t('votings.periodDates', {
                    start: new Date(meeting.startDate).toLocaleDateString(i18n.language),
                    end: new Date(meeting.endDate).toLocaleDateString(i18n.language),
                  })}
                </Text>
              </View>
              {Boolean(meeting.description) && (
                <Text style={[styles.meetingDescription, { color: theme.colors.text }]}>
                  {meeting.description}
                </Text>
              )}
            </View>

            {/* Quorum Progress Card */}
            <Card
              style={[
                styles.quorumCard,
                {
                  backgroundColor: meeting.isQuorumReached
                    ? theme.colors.successBg
                    : theme.colors.surface,
                  borderColor: meeting.isQuorumReached
                    ? theme.colors.successBorder
                    : theme.colors.border,
                },
              ]}
            >
              <View style={styles.quorumHeaderRow}>
                <Text style={[styles.quorumTitle, { color: theme.colors.text }]}>
                  {t('votings.quorumHeader')}
                </Text>
                <Text
                  style={[
                    styles.quorumPercent,
                    {
                      color: meeting.isQuorumReached
                        ? theme.colors.success
                        : theme.colors.warning,
                    },
                  ]}
                >
                  {meeting.quorumPercent?.toFixed(1) || 0}%
                </Text>
              </View>
              <View
                style={[
                  styles.quorumBar,
                  { backgroundColor: theme.colors.border },
                ]}
              >
                <View
                  style={[
                    styles.quorumBarFill,
                    {
                      width: `${Math.min(meeting.quorumPercent || 0, 100)}%`,
                      backgroundColor: meeting.isQuorumReached
                        ? theme.colors.primary
                        : theme.colors.warning,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.quorumNotice, { color: theme.colors.textMuted }]}>
                {meeting.isQuorumReached
                  ? t('votings.quorumPassedNotice')
                  : t('votings.quorumInProgressNotice')}
              </Text>
            </Card>

            {/* Agenda items list */}
            <Text style={[styles.agendaHeading, { color: theme.colors.text }]}>
              {t('votings.agendaTitle', { count: meeting.agendaItems.length })}
            </Text>

            {meeting.agendaItems.map((item, index) => {
              const myVote = item.myVote;
              const votesSummary = item.votesSummary;

              return (
                <Card
                  key={item.id}
                  style={[
                    styles.agendaCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.agendaHeaderRow}>
                    <Text style={[styles.itemOrder, { color: theme.colors.primary }]}>
                      {t('votings.questionNumber', { index: index + 1 })}
                    </Text>
                    <Badge
                      label={
                        item.decisionType === 'QUALIFIED_MAJORITY'
                          ? t('votings.qualifiedMajority')
                          : t('votings.simpleMajority')
                      }
                      variant="info"
                      size="sm"
                    />
                  </View>

                  <Text style={[styles.itemTitle, { color: theme.colors.text }]}>
                    {item.title || item.question}
                  </Text>
                  {Boolean(item.description) && (
                    <Text style={[styles.itemDesc, { color: theme.colors.textMuted }]}>
                      {item.description}
                    </Text>
                  )}

                  {/* Already Voted Badge Block */}
                  {myVote ? (
                    <View
                      style={[
                        styles.votedBadgeBlock,
                        {
                          backgroundColor: theme.colors.successBg,
                          borderColor: theme.colors.successBorder,
                        },
                      ]}
                    >
                      <View style={styles.votedRow}>
                        <CheckCircle2 color={theme.colors.success} size={18} />
                        <Text style={[styles.votedText, { color: theme.colors.success }]}>
                          {t('votings.youVoted', { choice: getChoiceLabel(myVote.choice) })}
                        </Text>
                      </View>
                      <View style={styles.signatureRow}>
                        <ShieldCheck color={theme.colors.textMuted} size={14} />
                        <Text style={[styles.signatureHash, { color: theme.colors.textMuted }]}>
                          {t('votings.signatureHash', {
                            hash: (myVote.signatureHash || (myVote as any).voteHash || '').slice(0, 20),
                          })}
                        </Text>
                      </View>
                    </View>
                  ) : meeting.status === 'ACTIVE' ? (
                    <Button
                      title={t('votings.voteOnQuestion')}
                      onPress={() => openVoteModal(item)}
                      variant="primary"
                      size="md"
                      style={styles.voteBtn}
                    />
                  ) : null}

                  {/* Votes summary by area */}
                  {votesSummary && (
                    <View
                      style={[
                        styles.summaryContainer,
                        { borderTopColor: theme.colors.border },
                      ]}
                    >
                      <Text style={[styles.summaryTitle, { color: theme.colors.textMuted }]}>
                        {t('votings.resultsByArea')}
                      </Text>
                      <View style={styles.barItem}>
                        <Text style={[styles.barLabel, { color: theme.colors.text }]}>
                          {t('votings.resultsFor', {
                            percent: votesSummary.forPercent?.toFixed(1) || 0,
                            area: votesSummary.forArea?.toFixed(0) || 0,
                          })}
                        </Text>
                        <View style={[styles.miniBar, { backgroundColor: theme.colors.border }]}>
                          <View
                            style={[
                              styles.miniBarFill,
                              {
                                width: `${votesSummary.forPercent || 0}%`,
                                backgroundColor: theme.colors.success,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <View style={styles.barItem}>
                        <Text style={[styles.barLabel, { color: theme.colors.text }]}>
                          {t('votings.resultsAgainst', {
                            percent: votesSummary.againstPercent?.toFixed(1) || 0,
                            area: votesSummary.againstArea?.toFixed(0) || 0,
                          })}
                        </Text>
                        <View style={[styles.miniBar, { backgroundColor: theme.colors.border }]}>
                          <View
                            style={[
                              styles.miniBarFill,
                              {
                                width: `${votesSummary.againstPercent || 0}%`,
                                backgroundColor: theme.colors.danger,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <View style={styles.barItem}>
                        <Text style={[styles.barLabel, { color: theme.colors.text }]}>
                          {t('votings.resultsAbstain', {
                            percent: votesSummary.abstainPercent?.toFixed(1) || 0,
                            area: votesSummary.abstainArea?.toFixed(0) || 0,
                          })}
                        </Text>
                        <View style={[styles.miniBar, { backgroundColor: theme.colors.border }]}>
                          <View
                            style={[
                              styles.miniBarFill,
                              {
                                width: `${votesSummary.abstainPercent || 0}%`,
                                backgroundColor: theme.colors.textMuted,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                </Card>
              );
            })}
          </AnimatedEntrance>
        )}
      </ScrollView>

      {/* 2-STEP SMS VOTE BOTTOMSHEET */}
      {activeItem && (
        <BottomSheet
          visible={Boolean(activeItem)}
          onClose={closeVoteModal}
          title={t('votings.modalLegalTitle')}
        >
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sheetQuestionTitle, { color: theme.colors.text }]}>
              {activeItem.title || activeItem.question}
            </Text>

            {voteStep === 1 ? (
              // Step 1: Select Choice
              <View style={styles.stepContainer}>
                <Text style={[styles.stepTitle, { color: theme.colors.primary }]}>
                  {t('votings.step1Title')}
                </Text>
                <View style={styles.choiceGroup}>
                  {/* FOR Button */}
                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      {
                        backgroundColor:
                          selectedChoice === 'FOR'
                            ? theme.colors.successBg
                            : theme.colors.surface,
                        borderColor:
                          selectedChoice === 'FOR'
                            ? theme.colors.success
                            : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      safeHaptic.selection();
                      setSelectedChoice('FOR');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedChoice === 'FOR' }}
                    accessibilityLabel={t('votings.voteChoiceFor')}
                  >
                    <CheckCircle2 color={theme.colors.success} size={22} />
                    <Text
                      style={[
                        styles.choiceText,
                        {
                          color:
                            selectedChoice === 'FOR'
                              ? theme.colors.success
                              : theme.colors.text,
                        },
                      ]}
                    >
                      {t('votings.voteChoiceFor')}
                    </Text>
                  </TouchableOpacity>

                  {/* AGAINST Button */}
                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      {
                        backgroundColor:
                          selectedChoice === 'AGAINST'
                            ? theme.colors.dangerBg
                            : theme.colors.surface,
                        borderColor:
                          selectedChoice === 'AGAINST'
                            ? theme.colors.danger
                            : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      safeHaptic.selection();
                      setSelectedChoice('AGAINST');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedChoice === 'AGAINST' }}
                    accessibilityLabel={t('votings.voteChoiceAgainst')}
                  >
                    <XCircle color={theme.colors.danger} size={22} />
                    <Text
                      style={[
                        styles.choiceText,
                        {
                          color:
                            selectedChoice === 'AGAINST'
                              ? theme.colors.danger
                              : theme.colors.text,
                        },
                      ]}
                    >
                      {t('votings.voteChoiceAgainst')}
                    </Text>
                  </TouchableOpacity>

                  {/* ABSTAIN Button */}
                  <TouchableOpacity
                    style={[
                      styles.choiceButton,
                      {
                        backgroundColor:
                          selectedChoice === 'ABSTAIN'
                            ? theme.colors.surfaceSubtle
                            : theme.colors.surface,
                        borderColor:
                          selectedChoice === 'ABSTAIN'
                            ? theme.colors.borderFocus
                            : theme.colors.border,
                      },
                    ]}
                    onPress={() => {
                      safeHaptic.selection();
                      setSelectedChoice('ABSTAIN');
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedChoice === 'ABSTAIN' }}
                    accessibilityLabel={t('votings.voteChoiceAbstain')}
                  >
                    <MinusCircle color={theme.colors.textMuted} size={22} />
                    <Text
                      style={[
                        styles.choiceText,
                        {
                          color:
                            selectedChoice === 'ABSTAIN'
                              ? theme.colors.text
                              : theme.colors.textMuted,
                        },
                      ]}
                    >
                      {t('votings.voteChoiceAbstain')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {Boolean(voteError) && (
                  <Text style={[styles.modalError, { color: theme.colors.danger }]}>
                    {voteError}
                  </Text>
                )}

                <Button
                  title={t('votings.confirmViaSms')}
                  onPress={handleRequestVoteOtp}
                  loading={otpSending}
                  disabled={!selectedChoice}
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            ) : (
              // Step 2: SMS Verification
              <View style={styles.stepContainer}>
                <Text style={[styles.stepTitle, { color: theme.colors.primary }]}>
                  {t('votings.step2Title')}
                </Text>
                <Text style={[styles.otpNotice, { color: theme.colors.textMuted }]}>
                  {t('votings.smsSentNotice', { phone: user?.phone || '' })}
                </Text>

                <Input
                  label={t('votings.smsCodeInputLabel')}
                  value={otpCode}
                  onChangeText={(v) => {
                    setOtpCode(v);
                    setVoteError('');
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  error={voteError}
                  leftIcon={<KeyRound color={theme.colors.textMuted} size={18} />}
                />

                <Text style={[styles.legalDisclaimer, { color: theme.colors.textMuted }]}>
                  {t('votings.digitalSignatureNotice')}
                </Text>

                <Button
                  title={t('votings.signAndSubmitVote')}
                  onPress={handleConfirmVote}
                  loading={submittingVote}
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            )}
          </ScrollView>
        </BottomSheet>
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
    flex: 1,
    textAlign: 'center',
  },
  headerRightPlaceholder: {
    width: 44,
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
  },
  skeletonWrap: {
    paddingTop: 12,
  },
  titleSection: {
    marginBottom: 4,
  },
  meetingTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  dateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  meetingDates: {
    fontSize: 12,
  },
  meetingDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  quorumCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
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
  },
  quorumPercent: {
    fontSize: 18,
    fontWeight: '800',
  },
  quorumBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  quorumBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  quorumNotice: {
    fontSize: 12,
    lineHeight: 16,
  },
  agendaHeading: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  agendaCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
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
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 6,
  },
  itemDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  votedBadgeBlock: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  votedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  votedText: {
    fontSize: 14,
    fontWeight: '700',
  },
  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  signatureHash: {
    fontSize: 11,
    fontFamily: 'monospace',
  },
  voteBtn: {
    marginTop: 8,
  },
  summaryContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  barItem: {
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 12,
    marginBottom: 3,
  },
  miniBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: 6,
    borderRadius: 3,
  },
  sheetScroll: {
    paddingBottom: 24,
  },
  sheetQuestionTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 14,
  },
  stepContainer: {
    marginTop: 4,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  choiceGroup: {
    gap: 10,
    marginBottom: 16,
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
    minHeight: 52,
  },
  choiceText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalError: {
    fontSize: 12,
    marginBottom: 10,
  },
  otpNotice: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  legalDisclaimer: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    marginBottom: 12,
  },
  modalActionBtn: {
    marginTop: 8,
  },
});
