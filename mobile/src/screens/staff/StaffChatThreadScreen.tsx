import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Socket } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { ChatApi, ChatMessage } from '../../api/chat';
import { UploadsApi } from '../../api/uploads';
import { createRealtimeSocket } from '../../lib/socket';
import { safeHaptic } from '../../lib/haptics';
import {
  IconButton,
  Badge,
  Button,
  SkeletonList,
  Avatar,
} from '../../components/ui';
import {
  ArrowLeft,
  Send,
  Paperclip,
  CheckCircle2,
  CheckCheck,
  X,
  User,
} from 'lucide-react-native';

interface GroupedItem {
  type: 'date' | 'message';
  dateStr?: string;
  message?: ChatMessage;
}

export const StaffChatThreadScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { theme } = useTheme();

  const { conversationId, residentName, unitInfo } = route.params || {};

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [attachedPhoto, setAttachedPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isResolved, setIsResolved] = useState<boolean>(route.params?.isResolved ?? false);
  const [resolving, setResolving] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const canResolve = ['DISPATCHER', 'HOA_ADMIN', 'SUPERADMIN'].includes(user?.role || '');

  const loadMessages = useCallback(
    async (isSilent = false) => {
      if (!conversationId) return;
      if (!isSilent) setLoading(true);

      try {
        const conv = await ChatApi.getConversationMessages(conversationId);
        setMessages(conv.messages || []);
        if (typeof conv.isResolved === 'boolean') {
          setIsResolved(conv.isResolved);
        }
      } catch (err) {
        console.warn('Failed to load conversation messages:', err);
      } finally {
        if (!isSilent) setLoading(false);
      }
    },
    [conversationId]
  );

  const handleResolve = async () => {
    if (!conversationId || resolving) return;
    safeHaptic.selection();
    setResolving(true);

    try {
      await ChatApi.resolveConversation(conversationId);
      setIsResolved(true);
      safeHaptic.selection();
    } catch (err: any) {
      console.warn('Failed to resolve conversation:', err);
      Alert.alert(
        t('common.error'),
        err?.response?.data?.message || t('staff.chat.resolveError')
      );
    } finally {
      setResolving(false);
    }
  };

  // Real-time WebSocket connection to specific conversation room
  useFocusEffect(
    useCallback(() => {
      let socket: Socket | null = null;
      let active = true;

      const initSocket = async () => {
        if (!conversationId) return;
        await loadMessages();
        if (!active) return;

        socket = await createRealtimeSocket();
        if (!socket || !active) return;

        socket.on('connect', () => {
          socket?.emit('chat:join', { conversationId });
          loadMessages(true);
        });

        socket.on('reconnect', () => {
          socket?.emit('chat:join', { conversationId });
          loadMessages(true);
        });

        socket.on('chat:message', (newMsg: ChatMessage) => {
          safeHaptic.selection();
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        });
      };

      initSocket();

      return () => {
        active = false;
        if (socket) {
          socket.emit('chat:leave', { conversationId });
          socket.disconnect();
        }
      };
    }, [conversationId, loadMessages])
  );

  const handlePickPhoto = async () => {
    if (uploadingPhoto) return;
    safeHaptic.selection();

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setUploadingPhoto(true);
        const uploaded = await UploadsApi.uploadFile(
          result.assets[0].uri,
          'chat-attachment.jpg',
          'image/jpeg',
          'media'
        );
        setAttachedPhoto(uploaded.url);
      }
    } catch (err) {
      console.warn('Failed to pick/upload photo:', err);
      Alert.alert(t('common.error'), t('common.uploadFailed'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend && !attachedPhoto) return;
    if (sending || uploadingPhoto || !conversationId) return;

    safeHaptic.selection();
    setSending(true);

    try {
      const newMsg = await ChatApi.sendStaffMessage(
        conversationId,
        textToSend || undefined,
        attachedPhoto || undefined
      );

      setMessages((prev) => [...prev, newMsg]);
      setInputText('');
      setAttachedPhoto(null);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        err?.response?.data?.message || t('staff.chat.sendMessageError')
      );
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

  // Group messages by date
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
          <View
            style={[
              styles.datePill,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.dateText,
                { color: theme.colors.textMuted },
                theme.typography.caption,
              ]}
            >
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
      <View
        style={[
          styles.messageRow,
          isMe ? styles.messageRowMe : styles.messageRowOther,
        ]}
      >
        {!isMe && (
          <Avatar
            name={residentName || t('staff.chat.resident')}
            size="sm"
            style={styles.senderAvatar}
          />
        )}

        <View
          style={[
            styles.bubble,
            isMe
              ? [
                  styles.bubbleMe,
                  { backgroundColor: theme.colors.primary },
                ]
              : [
                  styles.bubbleOther,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ],
          ]}
        >
          {Boolean(msg.photoUrl) && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setPreviewImage(msg.photoUrl)}
              style={styles.photoContainer}
            >
              <Image
                source={{ uri: msg.photoUrl! }}
                style={styles.photoThumbnail}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}

          {Boolean(msg.text) && (
            <Text
              style={[
                styles.bubbleText,
                {
                  color: isMe ? theme.colors.onPrimary : theme.colors.text,
                },
                theme.typography.body,
              ]}
            >
              {msg.text}
            </Text>
          )}

          <View style={styles.bubbleFooter}>
            <Text
              style={[
                styles.timeText,
                {
                  color: isMe ? 'rgba(255, 255, 255, 0.75)' : theme.colors.textMuted,
                },
                theme.typography.caption,
              ]}
            >
              {formatMessageTime(msg.createdAt)}
            </Text>
            {isMe && (
              <CheckCheck
                size={14}
                color="rgba(255, 255, 255, 0.85)"
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Custom Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.colors.surface,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <IconButton
            icon={<ArrowLeft size={22} color={theme.colors.text} />}
            accessibilityLabel={t('common.back')}
            onPress={() => {
              safeHaptic.selection();
              navigation.goBack();
            }}
            variant="ghost"
            size={40}
          />

          <View style={styles.headerTitleWrap}>
            <Text
              style={[
                styles.headerName,
                { color: theme.colors.text },
                theme.typography.headline,
              ]}
              numberOfLines={1}
            >
              {residentName || t('staff.chat.threadTitle')}
            </Text>
            {Boolean(unitInfo) && (
              <Text
                style={[
                  styles.headerUnit,
                  { color: theme.colors.textMuted },
                  theme.typography.caption,
                ]}
                numberOfLines={1}
              >
                {unitInfo}
              </Text>
            )}
          </View>

          {/* Resolve Button or Badge */}
          {canResolve && !isResolved && (
            <Button
              title={t('staff.chat.resolveBtn')}
              variant="secondary"
              size="sm"
              onPress={handleResolve}
              loading={resolving}
              leftIcon={<CheckCircle2 size={15} color={theme.colors.primary} />}
            />
          )}
          {isResolved && (
            <Badge
              label={t('staff.chat.resolvedBadge')}
              variant="success"
              size="sm"
            />
          )}
        </View>

        {/* Messages List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <SkeletonList count={4} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={groupedItems}
            keyExtractor={(_, index) => `item-${index}`}
            renderItem={renderItem}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        {/* Attached Photo Preview */}
        {Boolean(attachedPhoto) && (
          <View
            style={[
              styles.attachedPreviewRow,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            <View style={styles.attachedThumbnailWrap}>
              <Image
                source={{ uri: attachedPhoto! }}
                style={styles.attachedThumbnail}
              />
              <TouchableOpacity
                style={[
                  styles.removeAttachBtn,
                  { backgroundColor: theme.colors.danger },
                ]}
                onPress={() => setAttachedPhoto(null)}
              >
                <X size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Input Bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <IconButton
            icon={<Paperclip size={20} color={theme.colors.textMuted} />}
            accessibilityLabel={t('staff.chat.photoAttachment')}
            onPress={handlePickPhoto}
            variant="ghost"
            size={40}
            disabled={uploadingPhoto || sending}
          />

          <TextInput
            style={[
              styles.textInput,
              {
                color: theme.colors.text,
                backgroundColor: theme.colors.surfaceSubtle,
                borderColor: theme.colors.border,
              },
              theme.typography.body,
            ]}
            placeholder={t('staff.chat.typeMessagePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />

          <IconButton
            icon={<Send size={18} color={theme.colors.onPrimary} />}
            accessibilityLabel={t('staff.chat.send')}
            onPress={handleSendMessage}
            variant="primary"
            size={40}
            disabled={(!inputText.trim() && !attachedPhoto) || sending}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Photo Preview Modal */}
      <Modal visible={Boolean(previewImage)} transparent animationType="fade">
        <Pressable
          style={styles.fullscreenModalBackdrop}
          onPress={() => setPreviewImage(null)}
        >
          <IconButton
            icon={<X size={24} color="#FFFFFF" />}
            accessibilityLabel={t('common.close')}
            onPress={() => setPreviewImage(null)}
            variant="ghost"
            style={styles.closeModalBtn}
          />
          {Boolean(previewImage) && (
            <Image
              source={{ uri: previewImage! }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  headerName: {
    fontWeight: '700',
  },
  headerUnit: {
    fontWeight: '500',
  },
  loadingWrap: {
    padding: 16,
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 6,
  },
  datePill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dateText: {
    fontWeight: '500',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 2,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  senderAvatar: {
    marginRight: 8,
    marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  bubbleText: {
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
  },
  photoContainer: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: 200,
    height: 160,
    borderRadius: 12,
  },
  attachedPreviewRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  attachedThumbnailWrap: {
    position: 'relative',
    width: 60,
    height: 60,
  },
  attachedThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeAttachBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  fullscreenModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
  },
  fullscreenImage: {
    width: '94%',
    height: '80%',
  },
});
