import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useTheme } from '../../theme/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  BadgeVariant,
  Button,
  IconButton,
  Input,
  SkeletonCard,
  SkeletonList,
  AnimatedEntrance,
  Divider,
} from '../../components/ui';
import {
  ArrowLeft,
  Send,
  Star,
  User,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  MessageSquare,
  ChevronRight,
  ImageIcon,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetail'>;

const STATUS_STEPS: RequestStatus[] = [
  'PENDING',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

export const RequestDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { requestId } = route.params;

  const [request, setRequest] = useState<ServiceRequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Fullscreen photo modal
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Rating state
  const [rating, setRating] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const canChangeStatus =
    user?.role === 'DISPATCHER' || user?.role === 'HOA_ADMIN';

  const loadDetails = useCallback(async () => {
    try {
      const data = await ServiceRequestsApi.getRequestDetails(requestId);
      setRequest(data);
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setLoading(false);
    }
  }, [requestId, showToast, t]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleSendComment = async () => {
    if (!newComment.trim() || sendingComment) return;

    setSendingComment(true);
    safeHaptic.selection();

    try {
      await ServiceRequestsApi.addComment(requestId, newComment.trim());
      setNewComment('');
      safeHaptic.notification();
      await loadDetails();
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setSendingComment(false);
    }
  };

  const handleRate = async () => {
    setSubmittingRating(true);
    safeHaptic.selection();

    try {
      await ServiceRequestsApi.rateRequest(
        requestId,
        rating,
        ratingFeedback.trim() || undefined
      );
      safeHaptic.notification();
      showToast({
        type: 'success',
        title: t('requests.ratingThanksTitle'),
        message: t('requests.ratingThanksMsg'),
      });
      await loadDetails();
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleUpdateStatus = async (newStatus: RequestStatus) => {
    if (!request || request.status === newStatus || updatingStatus) return;

    setUpdatingStatus(true);
    safeHaptic.selection();

    try {
      await ServiceRequestsApi.updateStatus(requestId, newStatus);
      safeHaptic.notification();
      showToast({
        type: 'success',
        title: t('common.success'),
        message: t('staff.requests.statusUpdateSuccess'),
      });
      await loadDetails();
    } catch (e: any) {
      showToast({
        type: 'error',
        title: t('common.error'),
        message: getApiErrorMessage(e),
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading || !request) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background,
            paddingTop: Math.max(insets.top, 16) + 12,
            paddingHorizontal: 16,
          },
        ]}
      >
        <SkeletonCard style={{ height: 180, marginBottom: 16 }} />
        <SkeletonCard style={{ height: 140, marginBottom: 16 }} />
        <SkeletonList count={3} />
      </View>
    );
  }

  const statusInfo = getStatusInfo(request.status, t);
  const statusVariant: BadgeVariant =
    statusInfo.variant === 'default' ? 'neutral' : statusInfo.variant;

  const currentStepIndex =
    request.status === 'REJECTED'
      ? -1
      : STATUS_STEPS.indexOf(request.status as RequestStatus);

  const formattedCreated = new Date(request.createdAt).toLocaleString(
    i18n.language,
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
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
        <IconButton
          icon={<ArrowLeft color={theme.colors.text} size={22} />}
          onPress={() => navigation.goBack()}
          variant="ghost"
          accessibilityLabel={t('common.back')}
        />
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('requests.requestNumberTitle', { id: request.id.slice(0, 8) })}
          </Text>
          <Text style={[styles.headerDate, { color: theme.colors.textMuted }]}>
            {formattedCreated}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 90 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main Status & Info Card */}
          <AnimatedEntrance index={0}>
            <Card style={styles.card}>
              <View style={styles.cardTopRow}>
                <Badge
                  label={getCategoryLabel(request.category, t)}
                  variant="neutral"
                  size="sm"
                />
                <Badge
                  label={statusInfo.label}
                  variant={statusVariant}
                  size="sm"
                  mode="subtle"
                />
              </View>

              <Text style={[styles.title, { color: theme.colors.text }]}>
                {request.title}
              </Text>
              <Text style={[styles.desc, { color: theme.colors.textMuted }]}>
                {request.description}
              </Text>

              {request.unit && (
                <View
                  style={[
                    styles.unitBadge,
                    {
                      backgroundColor: theme.colors.surfaceSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.unitText, { color: theme.colors.text }]}>
                    {t('staff.requests.unitPrefix', {
                      unit: request.unit.unitNumber,
                    })}
                    {request.unit.building?.blockName
                      ? ` (${request.unit.building.blockName})`
                      : ''}
                  </Text>
                </View>
              )}

              {/* Assignee if any */}
              {request.assignee && (
                <View
                  style={[
                    styles.assigneeBox,
                    {
                      backgroundColor: theme.colors.surfaceSubtle,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.assigneeAvatar,
                      { backgroundColor: theme.colors.primaryBg },
                    ]}
                  >
                    <User size={18} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.assigneeName,
                        { color: theme.colors.text },
                      ]}
                    >
                      {t('requests.masterLabel', {
                        name: `${request.assignee.firstName} ${request.assignee.lastName}`,
                      })}
                    </Text>
                    {Boolean(request.assignee.phone) && (
                      <Text
                        style={[
                          styles.assigneePhone,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        {request.assignee.phone}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </Card>
          </AnimatedEntrance>

          {/* Status Timeline */}
          <AnimatedEntrance index={1}>
            <Card style={styles.card}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {t('requests.timelineTitle')}
              </Text>

              <View style={styles.timeline}>
                {STATUS_STEPS.map((st, idx) => {
                  const isDone = currentStepIndex >= idx;
                  const isCurrent = currentStepIndex === idx;
                  const stInfo = getStatusInfo(st, t);

                  return (
                    <View key={st} style={styles.timelineStepRow}>
                      <View style={styles.timelineTrackCol}>
                        <View
                          style={[
                            styles.timelineNode,
                            {
                              backgroundColor: isDone
                                ? theme.colors.primary
                                : theme.colors.surfaceSubtle,
                              borderColor: isCurrent
                                ? theme.colors.primary
                                : isDone
                                ? theme.colors.primary
                                : theme.colors.border,
                            },
                          ]}
                        >
                          {isDone ? (
                            <CheckCircle2 size={14} color="#FFFFFF" />
                          ) : (
                            <View
                              style={[
                                styles.nodeDot,
                                { backgroundColor: theme.colors.textLight },
                              ]}
                            />
                          )}
                        </View>
                        {idx < STATUS_STEPS.length - 1 && (
                          <View
                            style={[
                              styles.timelineLine,
                              {
                                backgroundColor:
                                  currentStepIndex > idx
                                    ? theme.colors.primary
                                    : theme.colors.border,
                              },
                            ]}
                          />
                        )}
                      </View>

                      <View style={styles.timelineTextCol}>
                        <Text
                          style={[
                            styles.timelineStepLabel,
                            {
                              color: isDone
                                ? theme.colors.text
                                : theme.colors.textLight,
                              fontWeight: isCurrent ? '700' : '500',
                            },
                          ]}
                        >
                          {stInfo.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
          </AnimatedEntrance>

          {/* Photo Gallery if attachments exist */}
          {request.attachments && request.attachments.length > 0 && (
            <AnimatedEntrance index={2}>
              <Card style={styles.card}>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                >
                  {t('requests.photosLabel')} ({request.attachments.length})
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryScroll}
                >
                  {request.attachments.map((att, i) => (
                    <TouchableOpacity
                      key={att.id || att.fileUrl || i}
                      activeOpacity={0.85}
                      onPress={() => {
                        safeHaptic.selection();
                        setSelectedPhoto(att.fileUrl);
                      }}
                      style={[
                        styles.galleryItem,
                        { borderColor: theme.colors.border },
                      ]}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={t('requests.viewPhoto')}
                    >
                      <Image source={{ uri: att.fileUrl }} style={styles.galleryThumb} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Card>
            </AnimatedEntrance>
          )}

          {/* Staff Action Buttons (Dispatcher / Admin only) */}
          {canChangeStatus && (
            <AnimatedEntrance index={3}>
              <Card style={styles.card}>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                >
                  {t('staff.requests.changeStatusTitle')}
                </Text>

                <View style={styles.statusButtonsRow}>
                  {STATUS_STEPS.map((st) => {
                    const isCurrent = request.status === st;
                    const stInfo = getStatusInfo(st, t);

                    return (
                      <Button
                        key={st}
                        title={stInfo.label}
                        size="sm"
                        variant={isCurrent ? 'primary' : 'secondary'}
                        disabled={isCurrent || updatingStatus}
                        onPress={() => handleUpdateStatus(st)}
                        style={styles.statusActionBtn}
                      />
                    );
                  })}
                </View>
              </Card>
            </AnimatedEntrance>
          )}

          {/* Rating Section (If RESOLVED) */}
          {request.status === 'RESOLVED' && (
            <AnimatedEntrance index={4}>
              <Card style={styles.card}>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.text }]}
                >
                  {t('requests.rateMasterTitle')}
                </Text>
                <Text
                  style={[
                    styles.sectionSubtitle,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {t('requests.rateMasterSub')}
                </Text>

                {request.rating ? (
                  <View style={styles.ratedBox}>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={24}
                          color={
                            s <= request.rating!
                              ? theme.colors.warning
                              : theme.colors.surfaceSubtle
                          }
                          fill={
                            s <= request.rating!
                              ? theme.colors.warning
                              : 'transparent'
                          }
                        />
                      ))}
                    </View>
                    {Boolean(request.feedback) && (
                      <Text
                        style={[
                          styles.feedbackText,
                          { color: theme.colors.textMuted },
                        ]}
                      >
                        «{request.feedback}»
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.ratingForm}>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <TouchableOpacity
                          key={s}
                          onPress={() => {
                            safeHaptic.selection();
                            setRating(s);
                          }}
                          style={styles.starTouch}
                          accessibilityRole="button"
                          accessibilityLabel={`${s} stars`}
                        >
                          <Star
                            size={32}
                            color={
                              s <= rating
                                ? theme.colors.warning
                                : theme.colors.border
                            }
                            fill={
                              s <= rating
                                ? theme.colors.warning
                                : 'transparent'
                            }
                          />
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Input
                      label={t('requests.reviewPlaceholder')}
                      placeholder={t('requests.reviewPlaceholder')}
                      value={ratingFeedback}
                      onChangeText={setRatingFeedback}
                      containerStyle={{ marginTop: 12 }}
                    />

                    <Button
                      title={t('requests.submitRatingBtn')}
                      variant="primary"
                      size="md"
                      onPress={handleRate}
                      loading={submittingRating}
                      style={{ marginTop: 12 }}
                    />
                  </View>
                )}
              </Card>
            </AnimatedEntrance>
          )}

          {/* Comments Section */}
          <AnimatedEntrance index={5}>
            <View style={styles.commentsSection}>
              <Text
                style={[styles.sectionTitle, { color: theme.colors.text }]}
              >
                {t('requests.commentsTitle')} (
                {request.comments?.length || 0})
              </Text>

              {(!request.comments || request.comments.length === 0) && (
                <Text
                  style={[
                    styles.noCommentsText,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {t('chat.emptySubtitle')}
                </Text>
              )}

              {request.comments?.map((comment: RequestComment) => {
                const isMyComment = comment.authorId === user?.id;
                const authorName =
                  [comment.author?.firstName, comment.author?.lastName]
                    .filter(Boolean)
                    .join(' ') ||
                  (isMyComment ? t('dashboard.defaultResident') : t('chat.dispatcherFallback'));

                const commentDate = new Date(comment.createdAt).toLocaleString(
                  i18n.language,
                  { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }
                );

                return (
                  <View
                    key={comment.id}
                    style={[
                      styles.commentBubbleRow,
                      isMyComment ? styles.myBubbleRow : styles.otherBubbleRow,
                    ]}
                  >
                    <View
                      style={[
                        styles.commentBubble,
                        isMyComment
                          ? [
                              styles.myBubble,
                              { backgroundColor: theme.colors.primaryBg, borderColor: theme.colors.border },
                            ]
                          : [
                              styles.otherBubble,
                              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                            ],
                      ]}
                    >
                      <View style={styles.commentHeader}>
                        <Text
                          style={[
                            styles.commentAuthor,
                            {
                              color: isMyComment
                                ? theme.colors.primary
                                : theme.colors.text,
                            },
                          ]}
                        >
                          {authorName}
                        </Text>
                        <Text
                          style={[
                            styles.commentTime,
                            { color: theme.colors.textLight },
                          ]}
                        >
                          {commentDate}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.commentMessage,
                          { color: theme.colors.text },
                        ]}
                      >
                        {comment.text}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </AnimatedEntrance>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Reply Bar */}
      <View
        style={[
          styles.replyBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        <TextInput
          value={newComment}
          onChangeText={setNewComment}
          placeholder={t('requests.commentPlaceholder')}
          placeholderTextColor={theme.colors.textLight}
          style={[
            styles.replyInput,
            {
              backgroundColor: theme.colors.surfaceSubtle,
              color: theme.colors.text,
              borderColor: theme.colors.border,
              ...(Platform.OS === 'web'
                ? ({ outlineStyle: 'none', outlineWidth: 0 } as any)
                : {}),
            },
          ]}
          multiline
          maxLength={1000}
        />
        <IconButton
          icon={<Send size={20} color={theme.colors.onPrimary} />}
          variant="primary"
          size={44}
          onPress={handleSendComment}
          disabled={!newComment.trim() || sendingComment}
          accessibilityLabel={t('requests.sendComment')}
        />
      </View>

      {/* Fullscreen Photo Viewer Modal */}
      {selectedPhoto && (
        <Modal
          visible={Boolean(selectedPhoto)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhoto(null)}
        >
          <View style={styles.photoModalBackdrop}>
            <TouchableOpacity
              onPress={() => setSelectedPhoto(null)}
              style={[
                styles.modalCloseBtn,
                { top: Math.max(insets.top, 20) + 10 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('requests.closePhoto')}
            >
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Image
              source={{ uri: selectedPhoto }}
              style={styles.modalImage}
              resizeMode="contain"
            />
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
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerDate: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    padding: 16,
    marginBottom: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  unitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  unitText: {
    fontSize: 13,
    fontWeight: '600',
  },
  assigneeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  assigneeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assigneeName: {
    fontSize: 14,
    fontWeight: '700',
  },
  assigneePhone: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  timeline: {
    paddingLeft: 6,
  },
  timelineStepRow: {
    flexDirection: 'row',
    minHeight: 44,
  },
  timelineTrackCol: {
    alignItems: 'center',
    width: 24,
  },
  timelineNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  nodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  timelineTextCol: {
    flex: 1,
    paddingLeft: 12,
    paddingTop: 2,
    paddingBottom: 16,
  },
  timelineStepLabel: {
    fontSize: 14,
  },
  galleryScroll: {
    gap: 10,
  },
  galleryItem: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  galleryThumb: {
    width: '100%',
    height: '100%',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusActionBtn: {
    marginBottom: 4,
  },
  ratedBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  ratingForm: {
    alignItems: 'center',
    width: '100%',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginVertical: 8,
  },
  starTouch: {
    padding: 6,
  },
  feedbackText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  commentsSection: {
    marginTop: 6,
    gap: 10,
  },
  noCommentsText: {
    fontSize: 13,
    paddingVertical: 8,
  },
  commentBubbleRow: {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 6,
  },
  myBubbleRow: {
    justifyContent: 'flex-end',
  },
  otherBubbleRow: {
    justifyContent: 'flex-start',
  },
  commentBubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  myBubble: {
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    borderBottomLeftRadius: 4,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 11,
  },
  commentMessage: {
    fontSize: 14,
    lineHeight: 19,
  },
  replyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  replyInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '94%',
    height: '80%',
  },
});
