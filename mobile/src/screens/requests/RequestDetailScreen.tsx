import { LoadError } from '../../components/common/LoadError';
import { RequestPhotos } from '../../components/common/RequestPhotos';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { RootStackParamList } from '../../navigation/types';
import {
  ServiceRequestsApi,
  ServiceRequestItem,
  RequestComment,
  RequestStatus,
} from '../../api/service-requests';
import {
  getCategoryLabel,
  getPriorityLabel,
  getStatusInfo,
} from '../../utils/requestLabels';
import { getApiErrorMessage } from '../../api/client';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Send, Star, User, RefreshCw } from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetail'>;

export const RequestDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { requestId } = route.params;

  const [request, setRequest] = useState<ServiceRequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const detailsVersion = useRef(0);
  const activeRequest = useRef(requestId);
  activeRequest.current = requestId;
  const mutationLock = useRef(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const canChangeStatus = user?.role === 'DISPATCHER' || user?.role === 'HOA_ADMIN';

  // Rating state
  const [rating, setRating] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const busy = sendingComment || submittingRating || updatingStatus;
  const loadDetails = useCallback(async () => {
    const version = ++detailsVersion.current;
    try {
      const data = await ServiceRequestsApi.getRequestDetails(requestId);
      if (version !== detailsVersion.current) return;
      setRequest(data);
      setLoadFailed(false);
    } catch {
      if (version === detailsVersion.current) setLoadFailed(true);
    } finally {
      if (version === detailsVersion.current) { setLoading(false); setRefreshing(false); }
    }
  }, [requestId]);
  useEffect(() => {
    activeRequest.current = requestId;
    setRequest(null);
    setLoading(true);
    setActionError(null);
    setNewComment('');
    void loadDetails();
    return () => { detailsVersion.current++; activeRequest.current = ''; };
  }, [loadDetails]);
  const retryDetails = () => {
    if (loading || refreshing || mutationLock.current) return;
    setRefreshing(true);
    void loadDetails();
  };

  const handleSendComment = async () => {
    const comment = newComment.trim();
    if (!comment || mutationLock.current) return;
    mutationLock.current = true;
    setActionError(null);

    setSendingComment(true);
    try {
      const added = await ServiceRequestsApi.addComment(requestId, comment);
      if (activeRequest.current !== requestId) return;
      setRequest((previous) => previous ? { ...previous, comments: [...(previous.comments || []).filter((item) => item.id !== added.id), added] } : previous);
      setNewComment('');
      await loadDetails();
    } catch (e: any) {
      if (activeRequest.current === requestId) setActionError(getApiErrorMessage(e));
    } finally {
      mutationLock.current = false;
      setSendingComment(false);
    }
  };

  const handleRate = async () => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setActionError(null);
    setSubmittingRating(true);
    try {
      await ServiceRequestsApi.rateRequest(requestId, rating, ratingFeedback.trim() || undefined);
      if (activeRequest.current !== requestId) return;
      setRequest((previous) => previous ? { ...previous, rating, feedback: ratingFeedback.trim(), status: 'CLOSED' } : previous);
      Alert.alert(t('requests.ratingThanksTitle'), t('requests.ratingThanksMsg'));
      await loadDetails();
    } catch (e: any) {
      if (activeRequest.current === requestId) setActionError(getApiErrorMessage(e));
    } finally {
      mutationLock.current = false;
      setSubmittingRating(false);
    }
  };

  const handleUpdateStatus = async (newStatus: RequestStatus) => {
    if (!request || request.status === newStatus || mutationLock.current) return;
    mutationLock.current = true;
    setActionError(null);
    setUpdatingStatus(true);
    try {
      await ServiceRequestsApi.updateStatus(requestId, newStatus);
      if (activeRequest.current !== requestId) return;
      setRequest((previous) => previous ? { ...previous, status: newStatus } : previous);
      await loadDetails();
    } catch (e: any) {
      if (activeRequest.current === requestId) setActionError(getApiErrorMessage(e));
    } finally {
      mutationLock.current = false;
      setUpdatingStatus(false);
    }
  };

  const header = (<View style={styles.topNav}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          {t('requests.requestNumberTitle', { id: (request?.id || requestId).slice(0, 8) })}
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.retry')} onPress={retryDetails} disabled={loading || refreshing || busy} style={styles.backBtn}>
          {refreshing ? <ActivityIndicator color={Colors.primary} /> : <RefreshCw size={20} color={Colors.textMuted} />}
        </TouchableOpacity>
      </View>);
  if (!request) return <SafeAreaView style={styles.container}>{header}{loading ? <LoadingState message={t('requests.loadingRequestDetails')} /> : <LoadError onRetry={retryDetails} retrying={refreshing} />}</SafeAreaView>;

  const isResolved = request.status === 'RESOLVED';
  const hasRated = request.rating !== null && request.rating !== undefined;
  const statusInfo = getStatusInfo(request.status, t);

  return (
    <SafeAreaView style={styles.container}>
      {header}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {actionError && <Text accessibilityLiveRegion="polite" style={{ color: Colors.danger, backgroundColor: Colors.dangerBg, padding: 12, fontSize: 14 }}>{actionError}</Text>}
        {loadFailed && <LoadError onRetry={retryDetails} retrying={refreshing} />}
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retryDetails} colors={[Colors.primary]} />} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scrollContent}>
          {/* Status & Title Card */}
          <Card style={styles.mainCard}>
            <View style={styles.statusRow}>
              <Badge label={statusInfo.label} variant={statusInfo.variant} />
              <Text style={styles.dateText}>
                {new Date(request.createdAt).toLocaleString(i18n.language)}
              </Text>
            </View>

            <Text style={styles.requestTitle}>{request.title}</Text>
            <Text style={styles.requestDesc}>{request.description}</Text>
            {!!request.attachments?.some(file => file.fileType.startsWith('image/')) && (
              <RequestPhotos key={request.id} requestId={request.id} attachments={request.attachments} />
            )}

            <View style={styles.infoMeta}>
              <Text style={styles.metaItem}>
                {t('requests.categoryMeta', { cat: getCategoryLabel(request.category, t) })}
              </Text>
              <Text style={styles.metaItem}>
                {t('requests.priorityMeta', { prio: getPriorityLabel(request.priority, t) })}
              </Text>
            </View>

            {request.unit?.unitNumber && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.metaItem}>
                  {t('staff.requests.unitPrefix', { unit: request.unit.unitNumber })}
                  {request.unit.building?.blockName ? ` (${request.unit.building.blockName})` : ''}
                </Text>
              </View>
            )}

            {/* Assignee Contact */}
            {request.assignee ? (
              <View style={styles.assigneeBox}>
                <User color={Colors.primary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.assigneeName}>
                    {t('requests.masterLabel', { name: `${request.assignee.firstName} ${request.assignee.lastName}` })}
                  </Text>
                  <Text style={styles.assigneePhone}>{request.assignee.phone}</Text>
                </View>
              </View>
            ) : null}
          </Card>

          {/* Staff Status Change Section (DISPATCHER & HOA_ADMIN only) */}
          {canChangeStatus && (
            <Card style={styles.statusChangeCard}>
              <Text style={styles.statusChangeTitle}>
                {t('staff.requests.changeStatusTitle')}
              </Text>
              <View style={styles.statusButtonsGrid}>
                {(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'] as RequestStatus[]).map((st) => {
                  const stInfo = getStatusInfo(st, t);
                  const isCurrent = request.status === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.statusButton,
                        isCurrent && styles.statusButtonCurrent,
                      ]}
                      onPress={() => handleUpdateStatus(st)}
                      disabled={isCurrent || busy}
                      accessibilityRole="button" accessibilityState={{ disabled: isCurrent || busy, selected: isCurrent, busy: updatingStatus }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.statusButtonText,
                          isCurrent && styles.statusButtonTextCurrent,
                        ]}
                      >
                        {stInfo.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          )}

          {/* Rating Section (When Resolved, creator only) */}
          {isResolved && !hasRated && user?.id === request.creatorId && (
            <Card style={styles.ratingCard}>
              <Text style={styles.ratingTitle}>{t('requests.rateMasterTitle')}</Text>
              <Text style={styles.ratingSub}>
                {t('requests.rateMasterSub')}
              </Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)} disabled={busy} accessibilityRole="radio" aria-checked={rating === star} accessibilityState={{ checked: rating === star, disabled: busy }} accessibilityLabel={t('requests.yourRatingLabel', { rating: star })} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
                    <Star
                      color={star <= rating ? '#F59E0B' : Colors.borderDark}
                      fill={star <= rating ? '#F59E0B' : 'transparent'}
                      size={32}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                placeholder={t('requests.reviewPlaceholder')}
                value={ratingFeedback}
                editable={!busy}
                accessibilityLabel={t('requests.reviewPlaceholder')}
                onChangeText={setRatingFeedback}
                containerStyle={{ marginTop: 10 }}
              />

              <Button
                title={t('requests.submitRatingBtn')}
                onPress={handleRate}
                loading={submittingRating}
                disabled={busy}
                variant="primary"
                size="md"
              />
            </Card>
          )}

          {/* Already rated badge */}
          {hasRated && (
            <Card style={styles.ratedCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Star color="#F59E0B" fill="#F59E0B" size={20} />
                <Text style={styles.ratedText}>{t('requests.yourRatingLabel', { rating: request.rating })}</Text>
              </View>
              {request.feedback ? (
                <Text style={styles.ratedFeedback}>«{request.feedback}»</Text>
              ) : null}
            </Card>
          )}

          {/* Chat Timeline */}
          <Text style={styles.chatSectionTitle}>
            {t('requests.chatTimelineTitle', { count: request.comments?.length || 0 })}
          </Text>

          {request.comments && request.comments.length > 0 ? (
            request.comments.map((c) => (
              <View key={c.id} style={styles.commentBubble}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>
                    {c.author.firstName} {c.author.lastName}
                  </Text>
                  <Text style={styles.commentTime}>
                    {new Date(c.createdAt).toLocaleTimeString(i18n.language, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noCommentsText}>
              {t('requests.noCommentsNotice')}
            </Text>
          )}
        </ScrollView>

        {/* Comment Input Footer */}
        <View style={styles.commentInputRow}>
          <Input
            placeholder={t('requests.commentInputPlaceholder')}
            value={newComment}
            editable={!busy}
            accessibilityLabel={t('requests.commentInputPlaceholder')}
            onChangeText={setNewComment}
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
          <TouchableOpacity
            style={[styles.sendButton, (busy || !newComment.trim()) && { opacity: 0.4 }]}
            onPress={handleSendComment}
            disabled={busy || !newComment.trim()}
            accessibilityRole="button" accessibilityLabel={t('requests.sendComment')} accessibilityState={{ busy: sendingComment, disabled: busy || !newComment.trim() }}
          >
            {sendingComment ? <ActivityIndicator color="#FFFFFF" /> : <Send color="#FFFFFF" size={20} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  mainCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  requestTitle: {
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  requestDesc: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  infoMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    gap: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metaItem: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  assigneeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 10,
  },
  assigneeName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  assigneePhone: {
    fontSize: 12,
    color: Colors.primaryDark,
    marginTop: 1,
  },
  ratingCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    marginBottom: 16,
  },
  ratingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
  },
  ratingSub: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 4,
    lineHeight: 18,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginVertical: 14,
  },
  ratedCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  ratedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  ratedFeedback: {
    fontSize: 13,
    color: '#78350F',
    marginTop: 4,
    fontStyle: 'italic',
  },
  chatSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  commentBubble: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  commentHeader: {
    flexWrap: 'wrap',
    gap: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  commentTime: {
    fontSize: 11,
    color: Colors.textLight,
  },
  commentText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  noCommentsText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChangeCard: {
    marginBottom: 16,
    padding: 16,
  },
  statusChangeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  statusButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusButtonCurrent: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  statusButtonText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  statusButtonTextCurrent: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
