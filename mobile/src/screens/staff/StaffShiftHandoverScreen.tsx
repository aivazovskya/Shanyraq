import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { useTabBarInset } from '../../hooks/useTabBarInset';
import { ShiftHandoverApi, ShiftHandoverNote } from '../../api/shift-handover';
import { roleLabel } from '../../lib/role-label';
import { safeHaptic } from '../../lib/haptics';
import {
  Card,
  Badge,
  Button,
  Input,
  Avatar,
  EmptyState,
  SkeletonList,
  BottomSheet,
  AnimatedEntrance,
  IconButton,
} from '../../components/ui';
import {
  BookOpen,
  Plus,
  Clock,
  ArrowLeft,
  AlertTriangle,
  FileText,
} from 'lucide-react-native';

export const StaffShiftHandoverScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset(24);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();

  const tenantId = user?.tenantId || user?.tenant?.id || '';
  const canPost = user?.role !== 'HOA_CHAIRMAN';

  const [notes, setNotes] = useState<ShiftHandoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // BottomSheet creation state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = useCallback(
    async (isSilent = false) => {
      if (!tenantId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!isSilent) setLoading(true);

      try {
        const data = await ShiftHandoverApi.getNotes(tenantId);
        setNotes(data || []);
      } catch (err) {
        console.warn('Failed to load shift handover notes:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchNotes(notes.length > 0);
    }, [fetchNotes, notes.length])
  );

  const onRefresh = () => {
    safeHaptic.selection();
    setRefreshing(true);
    fetchNotes(true);
  };

  const handleCreateNote = async () => {
    const trimmed = newContent.trim();
    if (!trimmed || !tenantId || submitting) return;

    safeHaptic.selection();
    setSubmitting(true);

    try {
      await ShiftHandoverApi.createNote(tenantId, trimmed);
      safeHaptic.selection();
      setNewContent('');
      setSheetVisible(false);
      await fetchNotes(true);
    } catch (err: any) {
      console.warn('Failed to create shift note:', err);
      Alert.alert(
        t('common.error'),
        err?.response?.data?.message || t('staff.shiftHandover.postError')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canGoBack = navigation.canGoBack();

  const renderItem = ({ item, index }: { item: ShiftHandoverNote; index: number }) => {
    const authorName = item.author
      ? `${item.author.firstName} ${item.author.lastName}`.trim()
      : t('staff.shiftHandover.author');
    const isSosNote = item.content.toUpperCase().includes('SOS');

    return (
      <AnimatedEntrance index={index}>
        <Card
          style={[
            styles.noteCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: isSosNote ? theme.colors.danger : theme.colors.border,
              borderWidth: isSosNote ? 1.5 : 1,
            },
          ]}
        >
          {/* Header Row: Author, Role, Time */}
          <View style={styles.cardHeaderRow}>
            <Avatar name={authorName} size="sm" style={styles.authorAvatar} />
            <View style={styles.authorInfo}>
              <View style={styles.authorTopLine}>
                <Text
                  style={[
                    styles.authorName,
                    { color: theme.colors.text },
                    theme.typography.headline,
                  ]}
                  numberOfLines={1}
                >
                  {authorName}
                </Text>
                <Badge
                  label={roleLabel(item.author?.role, t)}
                  variant={isSosNote ? 'danger' : 'primary'}
                  size="sm"
                />
              </View>

              <View style={styles.timeRow}>
                <Clock size={12} color={theme.colors.textMuted} />
                <Text
                  style={[
                    styles.timeText,
                    { color: theme.colors.textMuted },
                    theme.typography.caption,
                  ]}
                >
                  {new Date(item.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          </View>

          {/* Content */}
          <Text
            style={[
              styles.contentBody,
              { color: theme.colors.text },
              theme.typography.body,
            ]}
          >
            {item.content}
          </Text>
        </Card>
      </AnimatedEntrance>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.headerWrap,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
          },
        ]}
      >
        <View style={styles.headerRow}>
          {canGoBack && (
            <IconButton
              icon={<ArrowLeft size={22} color={theme.colors.text} />}
              accessibilityLabel={t('common.back')}
              onPress={() => {
                safeHaptic.selection();
                navigation.goBack();
              }}
              variant="ghost"
              size={40}
              style={{ marginRight: 8 }}
            />
          )}

          <View style={styles.headerTextWrap}>
            <Text
              style={[
                styles.title,
                { color: theme.colors.text },
                theme.typography.title,
              ]}
            >
              {t('staff.shiftHandover.screenTitle')}
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
            >
              {t('staff.shiftHandover.cardSubtitle')}
            </Text>
          </View>

          {canPost && (
            <Button
              title={t('staff.shiftHandover.newNote')}
              variant="primary"
              size="sm"
              onPress={() => {
                safeHaptic.selection();
                setSheetVisible(true);
              }}
              leftIcon={<Plus size={16} color="#FFFFFF" />}
            />
          )}
        </View>
      </View>

      {/* Notes List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarInset + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <Card
              style={[
                styles.emptyCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <EmptyState
                title={t('staff.shiftHandover.emptyTitle')}
                description={t('staff.shiftHandover.emptySubtitle')}
              />
            </Card>
          }
        />
      )}

      {/* Create Note BottomSheet */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={t('staff.shiftHandover.createNoteSheetTitle')}
      >
        <View style={styles.sheetBody}>
          <Input
            label={t('staff.shiftHandover.cardTitle')}
            placeholder={t('staff.shiftHandover.composePlaceholder')}
            value={newContent}
            onChangeText={setNewContent}
            multiline
            numberOfLines={4}
            maxLength={2000}
          />

          <View style={styles.charCountRow}>
            <Text
              style={[
                styles.charCountText,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
            >
              {t('staff.shiftHandover.charCount', { count: newContent.length })}
            </Text>
          </View>

          <Button
            title={t('staff.shiftHandover.submitButton')}
            variant="primary"
            size="lg"
            onPress={handleCreateNote}
            loading={submitting}
            disabled={!newContent.trim()}
            style={styles.sheetSubmitBtn}
          />
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    fontWeight: '400',
  },
  loadingWrap: {
    padding: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  noteCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorAvatar: {
    marginRight: 10,
  },
  authorInfo: {
    flex: 1,
  },
  authorTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  authorName: {
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontWeight: '400',
  },
  contentBody: {
    lineHeight: 22,
  },
  emptyCard: {
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
  sheetBody: {
    gap: 12,
    paddingBottom: 24,
  },
  charCountRow: {
    alignItems: 'flex-end',
  },
  charCountText: {
    fontWeight: '400',
  },
  sheetSubmitBtn: {
    marginTop: 8,
  },
});
