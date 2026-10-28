import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import io, { Socket } from 'socket.io-client';
import {
  ArrowLeft,
  Send,
  MessageSquare,
  ShieldCheck,
  Building2,
  RefreshCw,
  Paperclip,
  X,
  Check,
  CheckCheck,
} from 'lucide-react-native';

import { useAuth } from '../../context/AuthContext';
import { ChatApi, ChatMessage, Conversation } from '../../api/chat';
import { UploadsApi } from '../../api/uploads';
import { TokenStorage } from '../../storage/token-storage';
import { Config } from '../../constants/config';
import { useTheme } from '../../theme/ThemeContext';
import { IconButton } from '../../components/ui/IconButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { safeHaptic } from '../../lib/haptics';

interface GroupedItem {
  type: 'date' | 'message';
  dateStr?: string;
  message?: ChatMessage;
}

export const ChatScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [inputText, setInputText] = useState('');
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const [unverifiedError, setUnverifiedError] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  const loadConversation = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setUnverifiedError(false);

    try {
      const conv = await ChatApi.getMyConversation();
      setConversation(conv);
      setMessages(conv.messages || []);
      return conv;
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setUnverifiedError(true);
      } else if (!isSilent) {
        console.warn('Failed to load chat conversation:', err);
      }
      return null;
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  // Real-time WebSocket connection
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const initSocket = async () => {
        const conv = await loadConversation();
        if (!active) return;

        const token = await TokenStorage.getAccessToken();
        if (!token || !active) return;

        const socket = io(Config.SOCKET_URL, {
          auth: { token },
          transports: ['websocket', 'polling'],
          autoConnect: true,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          if (conv?.id) {
            socket.emit('chat:join', { conversationId: conv.id });
          }
        });

        socket.on('reconnect', () => {
          if (conv?.id) {
            socket.emit('chat:join', { conversationId: conv.id });
          }
          loadConversation(true);
        });

        socket.on('chat:message', (newMsg: ChatMessage) => {
          if (newMsg) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        });
      };

      initSocket();

      return () => {
        active = false;
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }, [loadConversation])
  );

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('photos.libraryPermission') || 'Permission required');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingPhoto(true);

      const context = ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > 1920) {
        context.resize(asset.width >= asset.height ? { width: 1920 } : { height: 1920 });
      }

      const image = await context.renderAsync();
      let optimizedUri: string;
      try {
        optimizedUri = (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri;
      } finally {
        image.release();
        context.release();
      }

      const uploadResult = await UploadsApi.uploadFile(
        optimizedUri,
        `chat-photo-${Date.now()}.jpg`,
        'image/jpeg',
        'media'
      );

      setAttachedPhoto(uploadResult.url);
      safeHaptic.selection();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('photos.failed'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend && !attachedPhoto) return;
    if (sending || uploadingPhoto) return;

    safeHaptic.selection();
    setSending(true);
    try {
      const newMsg = await ChatApi.sendMessage(textToSend || undefined, attachedPhoto || undefined);
      setMessages((prev) => [...prev, newMsg]);
      setInputText('');
      setAttachedPhoto(null);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.response?.data?.message || t('chat.sendError'));
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getDateHeaderLabel = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (d.toDateString() === today.toDateString()) {
        return t('chat.today');
      }
      if (d.toDateString() === yesterday.toDateString()) {
        return t('chat.yesterday');
      }
      return d.toLocaleDateString([], { day: 'numeric', month: 'long' });
    } catch {
      return dateStr;
    }
  };

  // Group messages with date separators
  const groupedItems: GroupedItem[] = [];
  let lastDateStr = '';

  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== lastDateStr) {
      lastDateStr = msgDate;
      groupedItems.push({
        type: 'date',
        dateStr: msg.createdAt,
      });
    }
    groupedItems.push({
      type: 'message',
      message: msg,
    });
  }

  const renderItem = ({ item }: { item: GroupedItem }) => {
    if (item.type === 'date' && item.dateStr) {
      return (
        <View style={styles.dateSeparator}>
          <View style={[styles.datePill, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.dateText, { color: theme.colors.textMuted }]}>
              {getDateHeaderLabel(item.dateStr)}
            </Text>
          </View>
        </View>
      );
    }

    if (!item.message) return null;
    const msg = item.message;
    const isMe = msg.senderId === user?.id;

    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        {!isMe && (
          <View style={[styles.dispatcherAvatar, { backgroundColor: theme.colors.primaryBg, borderColor: theme.colors.border, borderWidth: 1 }]}>
            <Building2 color={theme.colors.primary} size={16} />
          </View>
        )}

        <View
          style={[
            styles.bubble,
            isMe
              ? [styles.bubbleMe, { backgroundColor: theme.colors.primary }]
              : [styles.bubbleOther, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1 }],
          ]}
        >
          {!isMe && (
            <Text style={[styles.senderName, { color: theme.colors.primary }]}>
              {t('chat.dispatcherFallback')} ({t('chat.supportTeam')})
            </Text>
          )}

          {msg.photoUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setPreviewImage(msg.photoUrl)}
              style={styles.imageWrapper}
            >
              <Image
                source={{ uri: msg.photoUrl }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          {msg.text ? (
            <Text
              style={[
                styles.messageText,
                isMe ? { color: '#FFFFFF' } : { color: theme.colors.text },
              ]}
            >
              {msg.text}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text
              style={[
                styles.timeText,
                isMe ? { color: 'rgba(255, 255, 255, 0.75)' } : { color: theme.colors.textLight },
              ]}
            >
              {formatMessageTime(msg.createdAt)}
            </Text>
            {isMe && (
              <View style={styles.checkIcon}>
                <CheckCheck size={14} color="rgba(255, 255, 255, 0.85)" />
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: 1,
          },
        ]}
      >
        <IconButton
          icon={<ArrowLeft color={theme.colors.text} size={22} />}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('common.back')}
          variant="ghost"
          size={44}
        />

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {t('chat.screenTitle')}
          </Text>
          <View style={styles.onlineBadgeRow}>
            <View style={[styles.onlineDot, { backgroundColor: theme.colors.success }]} />
            <Text style={[styles.headerSub, { color: theme.colors.textMuted }]}>
              {t('chat.screenSubtitle')}
            </Text>
          </View>
        </View>

        <IconButton
          icon={<RefreshCw color={theme.colors.textMuted} size={20} />}
          onPress={() => loadConversation()}
          accessibilityLabel={t('common.refresh')}
          variant="ghost"
          size={44}
        />
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonList count={5} />
        </View>
      ) : unverifiedError ? (
        <View style={styles.centerContainer}>
          <ShieldCheck color={theme.colors.warning} size={48} />
          <Text style={[styles.unverifiedTitle, { color: theme.colors.text }]}>
            {t('chat.unverifiedTitle')}
          </Text>
          <Text style={[styles.unverifiedSub, { color: theme.colors.textMuted }]}>
            {t('chat.unverifiedNotice')}
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <EmptyState
                title={t('chat.emptyTitle')}
                description={t('chat.emptySubtitle')}
              />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={groupedItems}
              keyExtractor={(item, index) =>
                item.type === 'date' ? `date-${item.dateStr}-${index}` : item.message?.id || `msg-${index}`
              }
              renderItem={renderItem}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          {/* Attached Photo Preview Bar */}
          {attachedPhoto && (
            <View
              style={[
                styles.attachedBar,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              ]}
            >
              <Image source={{ uri: attachedPhoto }} style={styles.attachedThumb} />
              <Text style={[styles.attachedText, { color: theme.colors.text }]} numberOfLines={1}>
                {t('chat.photoAttached')}
              </Text>
              <TouchableOpacity
                onPress={() => setAttachedPhoto(null)}
                style={[styles.removeAttachBtn, { backgroundColor: theme.colors.surface }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={t('common.delete')}
              >
                <X color={theme.colors.textMuted} size={16} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input Bar */}
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                borderTopWidth: 1,
              },
            ]}
          >
            <TouchableOpacity
              onPress={handlePickPhoto}
              disabled={uploadingPhoto || sending}
              style={[
                styles.attachBtn,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                },
              ]}
              accessibilityLabel={t('chat.attachPhotoTitle')}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Paperclip color={theme.colors.textMuted} size={20} />
              )}
            </TouchableOpacity>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surfaceSubtle,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder={t('chat.inputPlaceholder')}
              placeholderTextColor={theme.colors.textLight}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: theme.colors.primary },
                (!inputText.trim() && !attachedPhoto) || sending || uploadingPhoto
                  ? styles.sendBtnDisabled
                  : null,
              ]}
              onPress={handleSendMessage}
              disabled={(!inputText.trim() && !attachedPhoto) || sending || uploadingPhoto}
              accessibilityLabel={t('common.send')}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send color="#FFFFFF" size={18} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Fullscreen Photo Viewer Modal */}
      {previewImage && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPreviewImage(null)}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setPreviewImage(null)}
                style={styles.modalCloseBtn}
                accessibilityLabel={t('common.close')}
              >
                <X color="#FFFFFF" size={24} />
              </TouchableOpacity>
            </View>
            <Image source={{ uri: previewImage }} style={styles.fullImage} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  onlineBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  keyboardView: {
    flex: 1,
  },
  skeletonContainer: {
    flex: 1,
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  unverifiedTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  unverifiedSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    maxWidth: 280,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 3,
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  dispatcherAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  imageWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
  },
  messageImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
  },
  checkIcon: {
    marginLeft: 2,
  },
  attachedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 10,
  },
  attachedThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  attachedText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  removeAttachBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    maxHeight: 110,
    minHeight: 44,
    borderWidth: 1,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: '90%',
    height: '80%',
  },
});
