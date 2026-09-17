import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { ShiftHandoverApi, ShiftHandoverNote } from '../../api/shift-handover';
import { getApiErrorMessage } from '../../api/client';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingState } from '../../components/common/LoadingState';
import { Colors } from '../../constants/colors';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Send,
  AlertCircle,
  RotateCw,
} from 'lucide-react-native';

export const StaffShiftHandoverScreen: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [notes, setNotes] = useState<ShiftHandoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Compose state
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const tenantId = user?.tenantId;
  const canPost = user?.role !== 'HOA_CHAIRMAN';

  const fetchNotes = useCallback(
    async (isRefreshAction = false) => {
      if (!tenantId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefreshAction) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setFetchError(null);

      try {
        const data = await ShiftHandoverApi.getNotes(tenantId);
        setNotes(data || []);
      } catch (err: any) {
        console.warn('Failed to load shift handover notes:', err);
        setFetchError(getApiErrorMessage(err) || t('staff.shiftHandover.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, t],
  );

  useFocusEffect(
    useCallback(() => {
      fetchNotes(false);
    }, [fetchNotes]),
  );

  const handleCreateNote = async () => {
    const trimmed = newContent.trim();
    if (!trimmed || !tenantId || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await ShiftHandoverApi.createNote(tenantId, trimmed);
      setNewContent('');
      await fetchNotes(true);
    } catch (err: any) {
      console.warn('Failed to create shift handover note:', err);
      setSubmitError(getApiErrorMessage(err) || t('staff.shiftHandover.postError'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(i18n.language, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const getRoleLabel = (role?: string | null) => {
    switch (role) {
      case 'HOA_ADMIN':
        return t('staff.roleHoaAdmin');
      case 'HOA_CHAIRMAN':
        return t('staff.roleHoaChairman');
      case 'DISPATCHER':
        return t('staff.roleDispatcher');
      case 'SECURITY':
        return t('staff.roleSecurity');
      default:
        return role || '—';
    }
  };

  const getRoleBadgeVariant = (
    role?: string | null,
  ): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
    switch (role) {
      case 'SECURITY':
        return 'success';
      case 'DISPATCHER':
        return 'info';
      case 'HOA_ADMIN':
        return 'warning';
      default:
        return 'default';
    }
  };

  const renderNoteItem = ({ item }: { item: ShiftHandoverNote }) => {
    const authorName =
      [item.author?.firstName, item.author?.lastName].filter(Boolean).join(' ') ||
      t('staff.staffInfo');

    return (
      <Card style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <View style={styles.noteAuthorContainer}>
            <Text style={styles.noteAuthorName}>{authorName}</Text>
            <Badge
              label={getRoleLabel(item.author?.role)}
              variant={getRoleBadgeVariant(item.author?.role)}
              style={styles.roleBadge}
            />
          </View>
          <View style={styles.noteTimeContainer}>
            <Clock size={13} color={Colors.textMuted} />
            <Text style={styles.noteTimeText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
        <Text style={styles.noteContent}>{item.content}</Text>
      </Card>
    );
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <BookOpen size={40} color={Colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>{t('staff.shiftHandover.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>{t('staff.shiftHandover.emptySubtitle')}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('staff.shiftHandover.screenTitle')}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshIconButton}
          onPress={() => fetchNotes(true)}
          disabled={loading || refreshing}
        >
          <RotateCw
            size={20}
            color={loading || refreshing ? Colors.textMuted : Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      {loading && !refreshing && notes.length === 0 ? (
        <LoadingState message={t('common.loading')} />
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderNoteItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchNotes(true)}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListHeaderComponent={
            <>
              {/* Error banner if fetching failed */}
              {fetchError && (
                <View style={styles.bannerError}>
                  <AlertCircle size={16} color={Colors.danger} />
                  <Text style={styles.bannerErrorText}>{fetchError}</Text>
                  <TouchableOpacity
                    onPress={() => fetchNotes(false)}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>{t('staff.shiftHandover.retry')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Compose Card - Hidden for HOA_CHAIRMAN */}
              {canPost && (
                <Card style={styles.composeCard}>
                  <View style={styles.composeHeader}>
                    <View style={styles.composeIconCircle}>
                      <BookOpen size={16} color={Colors.primary} />
                    </View>
                    <Text style={styles.composeTitle}>
                      {t('staff.shiftHandover.cardTitle')}
                    </Text>
                  </View>

                  <TextInput
                    style={styles.composeInput}
                    value={newContent}
                    onChangeText={(text) => {
                      setNewContent(text);
                      if (submitError) setSubmitError(null);
                    }}
                    placeholder={t('staff.shiftHandover.composePlaceholder')}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={3}
                    maxLength={2000}
                    textAlignVertical="top"
                    editable={!submitting}
                  />

                  {submitError && (
                    <View style={styles.submitErrorContainer}>
                      <AlertCircle size={14} color={Colors.danger} />
                      <Text style={styles.submitErrorText}>{submitError}</Text>
                    </View>
                  )}

                  <View style={styles.composeFooter}>
                    <Text style={styles.charCount}>{`${newContent.length}/2000`}</Text>
                    <Button
                      title={
                        submitting
                          ? t('staff.shiftHandover.submitting')
                          : t('staff.shiftHandover.submitButton')
                      }
                      onPress={handleCreateNote}
                      disabled={!newContent.trim() || submitting || newContent.length > 2000}
                      loading={submitting}
                      size="sm"
                      icon={<Send size={14} color="#FFFFFF" />}
                    />
                  </View>
                </Card>
              )}
            </>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 4,
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
  refreshIconButton: {
    padding: 6,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  bannerErrorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.danger,
    marginLeft: 8,
  },
  retryButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  composeCard: {
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  composeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  composeIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  composeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  composeInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.text,
    minHeight: 80,
  },
  submitErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  submitErrorText: {
    fontSize: 12,
    color: Colors.danger,
    marginLeft: 6,
    flex: 1,
  },
  composeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  noteCard: {
    padding: 14,
    marginBottom: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  noteAuthorContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginRight: 8,
  },
  noteAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginRight: 8,
  },
  roleBadge: {
    marginVertical: 2,
  },
  noteTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteTimeText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 4,
  },
  noteContent: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
