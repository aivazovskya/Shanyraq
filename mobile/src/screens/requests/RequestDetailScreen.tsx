import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import {
  ServiceRequestsApi,
  ServiceRequestItem,
  RequestComment,
} from '../../api/service-requests';
import { getApiErrorMessage } from '../../api/client';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Send, Star, User, Phone } from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDetail'>;

export const RequestDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { requestId } = route.params;

  const [request, setRequest] = useState<ServiceRequestItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Rating state
  const [rating, setRating] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const loadDetails = async () => {
    try {
      const data = await ServiceRequestsApi.getRequestDetails(requestId);
      setRequest(data);
    } catch (e: any) {
      Alert.alert('Ошибка', getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [requestId]);

  const handleSendComment = async () => {
    if (!newComment.trim()) return;

    setSendingComment(true);
    try {
      await ServiceRequestsApi.addComment(requestId, newComment.trim());
      setNewComment('');
      await loadDetails();
    } catch (e: any) {
      Alert.alert('Ошибка', getApiErrorMessage(e));
    } finally {
      setSendingComment(false);
    }
  };

  const handleRate = async () => {
    setSubmittingRating(true);
    try {
      await ServiceRequestsApi.rateRequest(requestId, rating, ratingFeedback.trim() || undefined);
      Alert.alert('Спасибо!', 'Ваша оценка помогает улучшать качество сервиса в доме.');
      await loadDetails();
    } catch (e: any) {
      Alert.alert('Ошибка', getApiErrorMessage(e));
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading || !request) {
    return <LoadingState message="Загрузка обращения..." />;
  }

  const isResolved = request.status === 'RESOLVED';
  const hasRated = request.rating !== null && request.rating !== undefined;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topNav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft color={Colors.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          Заявка №{request.id.slice(0, 8)}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Status & Title Card */}
          <Card style={styles.mainCard}>
            <View style={styles.statusRow}>
              <Badge label={request.status} variant="info" />
              <Text style={styles.dateText}>
                {new Date(request.createdAt).toLocaleString('ru-RU')}
              </Text>
            </View>

            <Text style={styles.requestTitle}>{request.title}</Text>
            <Text style={styles.requestDesc}>{request.description}</Text>

            <View style={styles.infoMeta}>
              <Text style={styles.metaItem}>Категория: {request.category}</Text>
              <Text style={styles.metaItem}>Срочность: {request.priority}</Text>
            </View>

            {/* Assignee Contact */}
            {request.assignee ? (
              <View style={styles.assigneeBox}>
                <User color={Colors.primary} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.assigneeName}>
                    Мастер: {request.assignee.firstName} {request.assignee.lastName}
                  </Text>
                  <Text style={styles.assigneePhone}>{request.assignee.phone}</Text>
                </View>
              </View>
            ) : null}
          </Card>

          {/* Rating Section (When Resolved) */}
          {isResolved && !hasRated && (
            <Card style={styles.ratingCard}>
              <Text style={styles.ratingTitle}>Оцените работу мастера</Text>
              <Text style={styles.ratingSub}>
                Заявка помечена как выполненная. Пожалуйста, подтвердите качество:
              </Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Star
                      color={star <= rating ? '#F59E0B' : Colors.borderDark}
                      fill={star <= rating ? '#F59E0B' : 'transparent'}
                      size={32}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Input
                placeholder="Оставьте отзыв или комментарий к оценке..."
                value={ratingFeedback}
                onChangeText={setRatingFeedback}
                containerStyle={{ marginTop: 10 }}
              />

              <Button
                title="Отправить оценку"
                onPress={handleRate}
                loading={submittingRating}
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
                <Text style={styles.ratedText}>Ваша оценка: {request.rating} из 5 звезд</Text>
              </View>
              {request.feedback ? (
                <Text style={styles.ratedFeedback}>«{request.feedback}»</Text>
              ) : null}
            </Card>
          )}

          {/* Chat Timeline */}
          <Text style={styles.chatSectionTitle}>
            Переписка по заявке ({request.comments?.length || 0})
          </Text>

          {request.comments && request.comments.length > 0 ? (
            request.comments.map((c) => (
              <View key={c.id} style={styles.commentBubble}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>
                    {c.author.firstName} {c.author.lastName} ({c.author.role})
                  </Text>
                  <Text style={styles.commentTime}>
                    {new Date(c.createdAt).toLocaleTimeString('ru-RU', {
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
              Пока нет сообщений. Напишите уточнение диспетчеру ниже.
            </Text>
          )}
        </ScrollView>

        {/* Comment Input Footer */}
        <View style={styles.commentInputRow}>
          <Input
            placeholder="Написать сообщение диспетчеру..."
            value={newComment}
            onChangeText={setNewComment}
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSendComment}
            disabled={sendingComment || !newComment.trim()}
          >
            <Send color="#FFFFFF" size={20} />
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
    padding: 4,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  mainCard: {
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  requestDesc: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  infoMeta: {
    flexDirection: 'row',
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
    gap: 12,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  commentHeader: {
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
});
