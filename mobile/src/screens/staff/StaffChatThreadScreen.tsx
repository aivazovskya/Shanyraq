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
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { ChatApi, ChatMessage } from '../../api/chat';
import { createRealtimeSocket } from '../../lib/socket';
import { Socket } from 'socket.io-client';
import { Colors } from '../../constants/colors';
import { ArrowLeft, Send, User, ShieldCheck } from 'lucide-react-native';

export const StaffChatThreadScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { user } = useAuth();

  const { conversationId, residentName, unitInfo } = route.params || {};

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const loadMessages = useCallback(
    async (isSilent = false) => {
      if (!conversationId) return;
      if (!isSilent) setLoading(true);

      try {
        const conv = await ChatApi.getConversationMessages(conversationId);
        setMessages(conv.messages || []);
      } catch (err) {
        console.error('Failed to load conversation messages:', err);
      } finally {
        if (!isSilent) setLoading(false);
      }
    },
    [conversationId],
  );

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
          if (!newMsg) return;
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
    }, [conversationId, loadMessages]),
  );

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending || !conversationId) return;

    setSending(true);
    setInputText('');

    try {
      const newMsg = await ChatApi.sendStaffMessage(conversationId, text);
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      console.error('Failed to send staff message:', err);
      // Restore input text if failed
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    // Message is from staff if sender role is not resident
    const isStaffMsg = item.sender?.role && item.sender.role !== 'RESIDENT_OWNER' && item.sender.role !== 'RESIDENT_TENANT';
    const isCurrentUser = item.senderId === user?.id;

    const timeStr = new Date(item.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View
        style={[
          styles.messageRow,
          isStaffMsg ? styles.messageRowStaff : styles.messageRowResident,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isStaffMsg ? styles.messageBubbleStaff : styles.messageBubbleResident,
          ]}
        >
          {/* Sender label */}
          <Text
            style={[
              styles.senderName,
              isStaffMsg ? styles.senderNameStaff : styles.senderNameResident,
            ]}
          >
            {isStaffMsg
              ? isCurrentUser
                ? t('staff.chat.dispatcherReply')
                : `${item.sender?.firstName || ''} (${t('staff.chat.dispatcherReply')})`.trim()
              : residentName || t('staff.chat.resident')}
          </Text>

          {/* Photo attachment if available */}
          {item.photoUrl && (
            <Image
              source={{ uri: item.photoUrl }}
              style={styles.attachedImage}
              resizeMode="cover"
            />
          )}

          {/* Text content */}
          {item.text && (
            <Text
              style={[
                styles.messageText,
                isStaffMsg ? styles.messageTextStaff : styles.messageTextResident,
              ]}
            >
              {item.text}
            </Text>
          )}

          <Text
            style={[
              styles.messageTime,
              isStaffMsg ? styles.messageTimeStaff : styles.messageTimeResident,
            ]}
          >
            {timeStr}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>{residentName || t('staff.chat.threadTitle')}</Text>
          {unitInfo && <Text style={styles.headerSubtitle}>{unitInfo}</Text>}
        </View>

        <View style={{ width: 32 }} />
      </View>

      {/* Messages list */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={t('staff.chat.typeMessagePlaceholder')}
            placeholderTextColor={Colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={18} color="#FFFFFF" />
            )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitleGroup: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  messageRowResident: {
    justifyContent: 'flex-start',
  },
  messageRowStaff: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleResident: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  messageBubbleStaff: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  senderNameResident: {
    color: Colors.textMuted,
  },
  senderNameStaff: {
    color: '#D1FAE5',
  },
  attachedImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 6,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextResident: {
    color: Colors.text,
  },
  messageTextStaff: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeResident: {
    color: Colors.textLight,
  },
  messageTimeStaff: {
    color: '#D1FAE5',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
    color: Colors.text,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
  },
});
