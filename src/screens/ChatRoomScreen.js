import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Image as ImageIcon,
  Search,
  Send,
  Smile,
  X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { CommonActions } from '@react-navigation/native';
import { auth, db } from '../config/firebase';
import { createDirectChat, markChatRead } from '../services/chatService';
import {
  addGroupMembers,
  deleteGroupMessage,
  leaveGroup,
  markGroupRead,
  sendGroupMessage,
  setGroupTyping,
  subscribeToGroup,
  subscribeToGroupMessages,
  toggleGroupMessageReaction,
  updateGroup,
} from '../services/groupService';
import {
  deleteMessage,
  loadPendingMessages,
  mergeMessages,
  removePendingMessage,
  savePendingMessage,
  sendChatMessage as sendPersistedMessage,
  subscribeToMessages,
  toggleMessageReaction,
} from '../services/chatMessageService';
import { getUserProfile } from '../services/userService';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { openProfile } from '../navigation/navigationHelpers';
import { blockUser, isBlockedByMe, reportUser } from '../services/safetyService';
import { assertCanMessage } from '../services/connectionService';

const QUICK_REACTIONS = ['❤️', '😂', '👍', '🔥', '😮', '👏'];
const COMPOSER_EMOJIS = [
  ['😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩'],
  ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍'],
  ['👍', '👎', '👏', '🙌', '🙏', '🔥', '💯', '✨'],
  ['😭', '😢', '😡', '🤔', '😮', '😴', '🤗', '😅'],
];

const FALLBACK_AVATAR = 'https://via.placeholder.com/150';

const TypingIndicator = () => {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, []);

  return (
    <View style={styles.typingDots}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              transform: [{
                translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
              }],
            },
          ]}
        />
      ))}
    </View>
  );
};

const ChatRoomScreen = ({ route, navigation }) => {
  const {
    chatId: initialChatId,
    uid: otherUserId,
    name: routeName = 'Student',
    avatar: routeAvatar = FALLBACK_AVATAR,
    chatType = 'direct',
    groupId: routeGroupId = null,
  } = route.params || {};

  const isGroup = chatType === 'group' || Boolean(routeGroupId);
  const groupId = routeGroupId;
  const currentUser = auth.currentUser;
  const listRef = useRef(null);
  const typingTimeout = useRef(null);
  const viewerScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const pinchStartScale = useRef(1);

  const [chatId, setChatId] = useState(initialChatId || null);
  const [messages, setMessages] = useState([]);
  const [otherUserName, setOtherUserName] = useState(routeName);
  const [otherUserAvatar, setOtherUserAvatar] = useState(routeAvatar);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [fullScreenAvatar, setFullScreenAvatar] = useState(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaVisible, setMediaVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [group, setGroup] = useState(null);
  const [groupAddVisible, setGroupAddVisible] = useState(false);
  const [groupConnections, setGroupConnections] = useState([]);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [groupRenameVisible, setGroupRenameVisible] = useState(false);
  const [groupRenameText, setGroupRenameText] = useState('');
  const returningHomeRef = useRef(false);

  const imageMessages = useMemo(
    () => messages.filter((message) => message.mediaUrl && message.mediaType === 'image' && !message.deleted),
    [messages]
  );

  const searchResults = useMemo(() => {
    const queryText = searchQuery.trim().toLowerCase();
    if (!queryText) return [];
    return messages.filter((message) => message.text?.toLowerCase().includes(queryText));
  }, [messages, searchQuery]);

  useEffect(() => {
    if (!isGroup || !groupId || !currentUser) return undefined;
    let active = true;
    const unsubscribeGroup = subscribeToGroup(
      groupId,
      (nextGroup) => {
        if (!active) return;
        setGroup(nextGroup);
        if (nextGroup?.name) setOtherUserName(nextGroup.name);
        setOtherUserAvatar(nextGroup?.avatar || FALLBACK_AVATAR);
      },
      (error) => console.error('Group subscription failed:', error)
    );
    const unsubscribeMessages = subscribeToGroupMessages(
      groupId,
      (nextMessages) => {
        if (active) setMessages(nextMessages);
      },
      (error) => console.error('Group message subscription failed:', error)
    );
    markGroupRead(groupId, currentUser.uid).catch(() => {});
    return () => {
      active = false;
      unsubscribeGroup?.();
      unsubscribeMessages?.();
    };
  }, [isGroup, groupId, currentUser?.uid]);

  useEffect(() => {
    let active = true;
    const loadOtherUser = async () => {
      if (!otherUserId) return;
      try {
        const profile = await getUserProfile(otherUserId);
        if (!active || !profile) return;
        setOtherUserName(profile.name || routeName || 'Student');
        setOtherUserAvatar(profile.avatar || routeAvatar || FALLBACK_AVATAR);
      } catch (error) {
        console.error('Other user profile load failed:', error);
      }
    };
    loadOtherUser();
    return () => { active = false; };
  }, [otherUserId, routeName, routeAvatar]);

  useEffect(() => {
    const findExistingChat = async () => {
      if (chatId || !otherUserId || !currentUser) return;
      try {
        if (await isBlockedByMe(otherUserId)) {
          setBlocked(true);
          return;
        }
        const currentProfile = await getUserProfile(currentUser.uid);
        if (!currentProfile?.collegeId) return;
        const q = query(
          collection(db, 'chats'),
          where('collegeId', '==', currentProfile.collegeId),
          where('participants', 'array-contains', currentUser.uid)
        );
        const snapshot = await getDocs(q);
        const existing = snapshot.docs.find((item) => item.data()?.participants?.includes(otherUserId));
        if (existing) setChatId(existing.id);
      } catch (error) {
        console.error('Chat lookup failed:', error);
      }
    };
    findExistingChat();
  }, [chatId, otherUserId, currentUser, isGroup]);

  useEffect(() => {
    if (isGroup || !chatId || !currentUser) return;

    markChatRead(chatId, currentUser.uid).catch((error) => console.error('Failed to mark chat read:', error));

    loadPendingMessages(chatId)
      .then((pending) => {
        if (pending.length) setMessages((current) => mergeMessages(current, pending));
      })
      .catch(() => {});

    const unsubscribeMessages = subscribeToMessages(
      chatId,
      (nextMessages) => {
        loadPendingMessages(chatId)
          .then((pending) => setMessages(mergeMessages(nextMessages, pending)))
          .catch(() => setMessages(nextMessages));
      },
      (error) => console.error('Message subscription failed:', error)
    );

    const unsubscribeChat = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setIsOtherUserTyping(Boolean(data.typing?.[otherUserId]));
    });

    return () => {
      unsubscribeMessages();
      unsubscribeChat();
    };
  }, [chatId, currentUser, otherUserId, isGroup]);

  useEffect(() => () => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  }, []);

  const setTyping = (value) => {
    if (!currentUser) return;
    if (isGroup) {
      setGroupTyping(groupId, currentUser.uid, value).catch(() => {});
      return;
    }
    if (!chatId) return;
    updateDoc(doc(db, 'chats', chatId), { ['typing.' + currentUser.uid]: value }).catch(() => {});
  };

  const handleTextChange = (text) => {
    setInputText(text);
    if ((!chatId && !isGroup) || !currentUser) return;
    setTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTyping(false), 1200);
  };

  const createChatIfNeeded = async () => {
    if (isGroup) return groupId;
    if (blocked) throw new Error('You have blocked this student. Unblock them from their profile to message again.');
    if (chatId) return chatId;
    if (!currentUser || !otherUserId) throw new Error('Missing chat participants');

    const createdChatId = await createDirectChat({
      currentUser,
      otherUserId,
      otherUser: { name: otherUserName, avatar: otherUserAvatar },
    });
    setChatId(createdChatId);
    return createdChatId;
  };

  const sendMessage = async (mediaUrl = null, mediaType = null, caption = null) => {
    const messageText = caption ?? inputText.trim();
    if (!messageText && !mediaUrl) return;

    const reply = replyingTo;
    setInputText('');
    setReplyingTo(null);
    setEmojiPickerVisible(false);
    setTyping(false);

    try {
      const activeChatId = await createChatIfNeeded();

      if (isGroup) {
        await sendGroupMessage({
          groupId,
          text: messageText,
          mediaUrl,
          mediaType,
          replyTo: reply ? {
            id: reply.id,
            text: reply.text || (reply.mediaType === 'video' ? '🎥 Video' : '📷 Photo'),
            senderId: reply.senderId,
          } : null,
        });
        return;
      }

      const messageId = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8);

      const localMessage = {
        id: messageId,
        text: messageText,
        senderId: currentUser.uid,
        mediaUrl,
        mediaType,
        replyTo: reply
          ? {
              id: reply.id,
              text: reply.text || (reply.mediaType === 'video' ? '🎥 Video' : '📷 Photo'),
              senderId: reply.senderId,
            }
          : null,
        createdAt: new Date(),
        status: 'sending',
      };
      await savePendingMessage(activeChatId, localMessage);
      setMessages((current) => mergeMessages([localMessage], current));

      try {
        await sendPersistedMessage({
          chatId: activeChatId,
          message: localMessage,
        });
        await removePendingMessage(activeChatId, messageId);
      } catch (error) {
        const failedMessage = { ...localMessage, status: 'failed' };
        await savePendingMessage(activeChatId, failedMessage);
        setMessages((current) => mergeMessages([failedMessage], current));
        throw error;
      }
    } catch (error) {
      setInputText(messageText);
      setReplyingTo(reply);
      Alert.alert('Message not sent', error?.message || 'Please check your connection and try again.');
      console.error('Message send failed:', error);
    }
  };

  const uploadAndSendItems = async (items) => {
    if (!items?.length || isUploading) return;
    const selected = items.slice(0, 10);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: selected.length });
    setEmojiPickerVisible(false);
    Keyboard.dismiss();

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const item = selected[index];
        const secureUrl = await uploadToCloudinary(item.uri, item.type);
        if (!secureUrl) throw new Error('Media upload failed');
        await sendMessage(secureUrl, item.type);
        setUploadProgress({ current: index + 1, total: selected.length });
      }
    } catch (error) {
      console.error('Media send failed:', error);
      Alert.alert('Could not send media', 'Some media could not be sent. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const openGalleryAndSend = async () => {
    if (isUploading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Gallery permission needed', 'Allow WeConnect to access photos and videos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.length) {
        await uploadAndSendItems(result.assets.map((asset) => ({
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'image',
        })));
      }
    } catch (error) {
      console.error('Gallery picker failed:', error);
      Alert.alert('Gallery error', 'Unable to open the gallery right now.');
    }
  };

  const openCameraAndSend = async () => {
    if (isUploading) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow WeConnect to use your camera.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        videoMaxDuration: 60,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.length) {
        await uploadAndSendItems(result.assets.map((asset) => ({
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'image',
        })));
      }
    } catch (error) {
      console.error('Camera failed:', error);
      Alert.alert('Camera error', 'Unable to open the camera right now.');
    }
  };

  const openFullScreenImage = (url) => {
    const index = Math.max(0, imageMessages.findIndex((message) => message.mediaUrl === url));
    setFullScreenImageIndex(index);
    setFullScreenImage(url);
    viewerScale.setValue(1);
    pinchScale.setValue(1);
  };

  const closeFullScreenImage = () => {
    setFullScreenImage(null);
    viewerScale.setValue(1);
    pinchScale.setValue(1);
  };

  const showAdjacentImage = (direction) => {
    const nextIndex = fullScreenImageIndex + direction;
    if (nextIndex < 0 || nextIndex >= imageMessages.length) return;
    setFullScreenImageIndex(nextIndex);
    setFullScreenImage(imageMessages[nextIndex].mediaUrl);
    viewerScale.setValue(1);
    pinchScale.setValue(1);
  };

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = (event) => {
    const { state, oldState, scale } = event.nativeEvent;
    if (state === State.BEGAN) {
      pinchStartScale.current = viewerScale.__getValue();
      pinchScale.setValue(1);
      return;
    }
    if (oldState === State.ACTIVE || state === State.END || state === State.CANCELLED) {
      const nextScale = Math.max(1, Math.min(4, pinchStartScale.current * scale));
      viewerScale.setValue(nextScale);
      pinchScale.setValue(1);
    }
  };

  const handleMessageLongPress = (messageId) => {
    Keyboard.dismiss();
    setEmojiPickerVisible(false);
    setSelectedMessageId(messageId);
  };

  const handleShareMessage = async (item) => {
    setSelectedMessageId(null);
    const text = item.text || (item.mediaType === 'video' ? '🎥 Video from WeConnect' : item.mediaType === 'image' ? '📷 Photo from WeConnect' : '');
    if (!text) return;
    try {
      await Share.share({ message: text });
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleDeleteMessage = async (item) => {
    setSelectedMessageId(null);
    try {
      if (isGroup) {
        await deleteGroupMessage(groupId, item.id);
      } else {
        await deleteMessage(chatId, item.id);
      }
    } catch (error) {
      Alert.alert('Could not delete', 'The message could not be deleted.');
    }
  };

  const insertEmoji = (emoji) => {
    setInputText((value) => value + emoji);
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderId === currentUser?.uid;
    const senderProfile = isGroup
      ? (group?.memberProfiles?.[item.senderId] || { name: 'Student', avatar: FALLBACK_AVATAR })
      : { name: otherUserName, avatar: otherUserAvatar };
    const senderName = senderProfile.name || 'Student';
    const senderAvatar = senderProfile.avatar || FALLBACK_AVATAR;
    const reactions = Object.entries(item.reactions || {}).filter(([, users]) => Array.isArray(users) && users.length);
    const replyPreview = item.replyTo?.text;

    return (
      <Pressable
        style={[styles.messageRow, isMe ? styles.myRow : styles.theirRow]}
        onLongPress={() => handleMessageLongPress(item.id)}
        delayLongPress={300}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      >
        {!isMe && (
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => setFullScreenAvatar({ name: senderName, uri: senderAvatar })}
          >
            <Image source={{ uri: senderAvatar }} style={styles.tinyAvatar />
          </TouchableOpacity>
        )}

        <View style={[styles.messageColumn, isMe ? styles.messageColumnMine : styles.messageColumnTheirs]}>
          {isGroup && !isMe ? <Text style={styles.groupSenderName}>{senderName}</Text> : null}
          <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
            {replyPreview ? (
              <View style={[styles.quotedReply, isMe ? styles.quotedReplyMine : styles.quotedReplyTheirs]}>
                <Text style={[styles.quotedReplyLabel, isMe && styles.quotedReplyLabelMine]}>
                  {item.replyTo?.senderId === currentUser?.uid ? 'You' : (isGroup ? (group?.memberProfiles?.[item.replyTo?.senderId]?.name || 'Student') : otherUserName)}
                </Text>
                <Text style={[styles.quotedReplyText, isMe && styles.quotedReplyTextMine]} numberOfLines={2}>
                  {replyPreview}
                </Text>
              </View>
            ) : null}

            {item.storyContext ? (
              <View style={styles.storyChatCard}>
                {item.storyContext.mediaUrl ? <Image source={{ uri: item.storyContext.mediaUrl }} style={styles.storyChatImage} /> : null}
                <View style={styles.storyChatMeta}>
                  <Text style={styles.storyChatLabel}>{item.storyContext.type === 'reaction' ? 'STORY REACTION' : 'STORY REPLY'}</Text>
                  {item.storyContext.reaction ? <Text style={styles.storyChatReaction}>{item.storyContext.reaction}</Text> : null}
                  <Text style={styles.storyChatCaption} numberOfLines={2}>{item.storyContext.caption || 'Your story'}</Text>
                </View>
              </View>
            ) : null}

            {item.deleted ? (
              <Text style={[styles.deletedText, isMe && styles.myDeletedText]}>This message was deleted</Text>
            ) : (
              <>
                {item.mediaUrl && item.mediaType === 'image' ? (
                  <Pressable
                    onPress={() => openFullScreenImage(item.mediaUrl)}
                    onLongPress={() => handleMessageLongPress(item.id)}
                    delayLongPress={300}
                  >
                    <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} resizeMode="cover" />
                  </Pressable>
                ) : null}

                {item.mediaUrl && item.mediaType === 'video' ? (
                  <Pressable
                    style={styles.messageVideo}
                    onLongPress={() => handleMessageLongPress(item.id)}
                    delayLongPress={300}
                  >
                    <View style={styles.videoPlayCircle}>
                      <Text style={styles.videoPlayGlyph}>▶</Text>
                    </View>
                    <Text style={styles.messageVideoText}>Video</Text>
                  </Pressable>
                ) : null}

                {item.text ? (
                  <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
                    {item.text}
                  </Text>
                ) : null}
              </>
            )}

            <View style={styles.messageMeta}>
              <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.theirTimeText]}>
                {item.createdAt?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' }) || ''}
              </Text>
              {isMe && !item.deleted ? <Check size={13} color="rgba(255,255,255,0.72)" /> : null}
            </View>
          </View>

          {reactions.length > 0 ? (
            <View style={[styles.reactionPillRow, isMe ? styles.reactionPillRowMine : styles.reactionPillRowTheirs]}>
              {reactions.map(([emoji, users]) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.reactionPill}
                  onPress={() => isGroup ? toggleGroupMessageReaction(groupId, item.id, emoji) : toggleMessageReaction(chatId, item.id, currentUser.uid, emoji)}
                >
                  <Text style={styles.reactionPillEmoji}>{emoji}</Text>
                  {users.length > 1 ? <Text style={styles.reactionPillCount}>{users.length}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {selectedMessageId === item.id ? (
            <View style={[styles.messageActions, isMe ? styles.messageActionsMine : styles.messageActionsTheirs]}>
              <View style={styles.reactionActionRow}>
                {QUICK_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.reactionAction}
                    onPress={async () => {
                      if (isGroup) {
                        await toggleGroupMessageReaction(groupId, item.id, emoji);
                      } else {
                        await toggleMessageReaction(chatId, item.id, currentUser.uid, emoji);
                      }
                      setSelectedMessageId(null);
                    }}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.actionDivider} />
              <TouchableOpacity style={styles.actionChip} onPress={() => { setReplyingTo(item); setSelectedMessageId(null); }}>
                <Text style={styles.replyActionText}>Reply</Text>
              </TouchableOpacity>
              {!item.deleted ? (
                <TouchableOpacity style={styles.actionChip} onPress={() => handleShareMessage(item)}>
                  <Text style={styles.shareActionText}>Share</Text>
                </TouchableOpacity>
              ) : null}
              {isMe && !item.deleted ? (
                <TouchableOpacity style={styles.actionChip} onPress={() => handleDeleteMessage(item)}>
                  <Text style={styles.deleteActionText}>Delete</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.actionChip} onPress={() => setSelectedMessageId(null)}>
                <Text style={styles.cancelActionText}>×</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const loadGroupConnections = async () => {
    if (!isGroup || !group || !currentUser) return;
    try {
      const me = await getUserProfile(currentUser.uid);
      const ids = Array.isArray(me?.connections)
        ? me.connections.filter((id) => !group.members.includes(id))
        : [];
      const profiles = await Promise.all(ids.map((id) => getUserProfile(id).catch(() => null)));
      setGroupConnections(profiles.filter((profile) => profile?.collegeId === group.collegeId));
      setSelectedGroupMembers([]);
      setGroupAddVisible(true);
    } catch (error) {
      Alert.alert('Could not load students', error?.message || 'Please try again.');
    }
  };

  const submitGroupRename = async () => {
    const value = groupRenameText.trim();
    if (!value || !groupId) return Alert.alert('Group name required', 'Enter a group name.');
    try {
      await updateGroup(groupId, { name: value });
      setGroupRenameVisible(false);
    } catch (error) {
      Alert.alert('Could not rename group', error?.message || 'Please try again.');
    }
  };

  const addSelectedGroupMembers = async () => {
    if (!groupId || !selectedGroupMembers.length) return;
    try {
      const users = groupConnections.filter((person) => selectedGroupMembers.includes(person.uid));
      await addGroupMembers(groupId, users);
      setGroupAddVisible(false);
      setSelectedGroupMembers([]);
    } catch (error) {
      Alert.alert('Could not add members', error?.message || 'Please try again.');
    }
  };

  const leaveCurrentGroup = async () => {
    if (!groupId) return;
    setDetailsVisible(false);
    Alert.alert('Leave group?', 'You will stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(groupId);
            returnToHomeChats();
          } catch (error) {
            Alert.alert('Cannot leave group', error?.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const returnToHomeChats = () => {
    if (returningHomeRef.current) return;
    returningHomeRef.current = true;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{
          name: 'MainTabs',
          params: {
            screen: 'Tabs',
            params: { screen: 'Chats' },
          },
        }],
      })
    );
  };

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (returningHomeRef.current) return;
      event.preventDefault();
      returnToHomeChats();
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="auto" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBack} onPress={returnToHomeChats}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerProfile}
          activeOpacity={0.75}
          onPress={() => isGroup ? setDetailsVisible(true) : openProfile(navigation, { uid: otherUserId, name: otherUserName, avatar: otherUserAvatar })}
        >
          {isGroup ? (
            <View style={styles.groupHeaderAvatar}><Text style={styles.groupHeaderGlyph}>👥</Text></View>
          ) : (
            <Image source={{ uri: otherUserAvatar }} style={styles.headerAvatar} />
          )}
          <View style={styles.headerIdentity}>
            <Text style={styles.headerName} numberOfLines={1}>{isGroup ? (group?.name || otherUserName) : otherUserName}</Text>
            <View style={styles.onlineRow}>
              {!isGroup ? <View style={styles.onlineDot} /> : null}
              <Text style={styles.headerStatus}>{isGroup ? `${group?.members?.length || 0} members` : (isOtherUserTyping ? 'typing…' : 'Chat')}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerAction} onPress={() => setSearchVisible((value) => !value)}>
            <Search size={20} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerAction} onPress={() => setMediaVisible(true)}>
            <ImageIcon size={20} color="#111827" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerAction} onPress={() => setDetailsVisible(true)}>
            <Ellipsis size={20} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      {searchVisible ? (
        <View style={styles.searchBar}>
          <Search size={18} color="#999999" />
          <TextInput
            autoFocus
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search messages"
            placeholderTextColor="#999999"
            style={styles.searchInput}
          />
          {searchQuery ? (
            <Text style={styles.searchCount}>{searchResults.length}</Text>
          ) : null}
          <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }}>
            <X size={18} color="#707070" />
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            isOtherUserTyping ? (
              <View style={styles.typingIndicatorRow}>
                <Image source={{ uri: otherUserAvatar }} style={styles.tinyAvatar} />
                <View style={styles.typingBubble}><TypingIndicator /></View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyAvatarRing}>
                <Image source={{ uri: otherUserAvatar }} style={styles.emptyAvatar} />
              </View>
              <Text style={styles.emptyTitle}>Say hi to {otherUserName.split(' ')[0]}</Text>
              <Text style={styles.emptySubtitle}>Send a message, photo or video to start the conversation.</Text>
            </View>
          }
        />
        {replyingTo ? (
          <View style={styles.replyBar}>
            <View style={styles.replyAccent} />
            <View style={styles.replyContent}>
              <Text style={styles.replyLabel}>Replying to {replyingTo.senderId === currentUser?.uid ? 'yourself' : otherUserName}</Text>
              <Text style={styles.replyText} numberOfLines={1}>
                {replyingTo.text || (replyingTo.mediaType === 'video' ? '🎥 Video' : '📷 Photo')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)}><X size={19} color="#707070" /></TouchableOpacity>
          </View>
        ) : null}
        {emojiPickerVisible ? (
          <View style={styles.emojiPanel}>
            <View style={styles.emojiPanelHeader}>
              <Text style={styles.emojiPanelTitle}>Quick emojis</Text>
              <TouchableOpacity onPress={() => setEmojiPickerVisible(false)}><X size={16} color="#999999" /></TouchableOpacity>
            </View>
            {COMPOSER_EMOJIS.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.emojiRow}>
                {row.map((emoji) => (
                  <TouchableOpacity key={emoji} style={styles.emojiButton} onPress={() => insertEmoji(emoji)}>
                    <Text style={styles.emojiButtonText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.composerSticky}>
          <View style={styles.composerShell}>
            <View style={styles.composer}>
              <TouchableOpacity style={styles.composerIcon} onPress={openCameraAndSend} disabled={isUploading}>
                <Camera size={21} color="#475569" />
              </TouchableOpacity>
              <View style={styles.textInputShell}>
                <TextInput
                  value={inputText}
                  onChangeText={handleTextChange}
                  placeholder="Message…"
                  placeholderTextColor="#999999"
                  multiline
                  maxLength={1000}
                  style={styles.textInput}
                  onFocus={() => setEmojiPickerVisible(false)}
                />
                <TouchableOpacity
                  style={styles.emojiToggle}
                  onPress={() => { Keyboard.dismiss(); setEmojiPickerVisible((value) => !value); }}
                >
                  <Smile size={20} color={emojiPickerVisible ? '#111111' : '#707070'} />
                </TouchableOpacity>
              </View>
              {inputText.trim() ? (
                <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()}>
                  <Send size={18} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.sendButtonGhost} onPress={openGalleryAndSend} disabled={isUploading}>
                  <ImageIcon size={20} color="#111111" />
                </TouchableOpacity>
              )}
            </View>
            {isUploading ? (
              <View style={styles.uploadStatus}>
                <ActivityIndicator size="small" color="#111111" />
                <Text style={styles.uploadStatusText}>Sending {uploadProgress.current}/{uploadProgress.total}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!fullScreenImage} transparent animationType="fade" onRequestClose={closeFullScreenImage}>
        <View style={styles.mediaViewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={closeFullScreenImage}>
            <X size={27} color="#fff" />
          </TouchableOpacity>

          {fullScreenImage ? (
            <PinchGestureHandler
              onGestureEvent={onPinchGestureEvent}
              onHandlerStateChange={onPinchStateChange}
              minPointers={2}
              maxPointers={2}
            >
              <Animated.View style={styles.viewerGestureArea}>
                <Animated.Image
                  source={{ uri: fullScreenImage }}
                  style={[styles.viewerImage, { transform: [{ scale: viewerScale }, { scale: pinchScale }] }]}
                  resizeMode="contain"
                />
              </Animated.View>
            </PinchGestureHandler>
          ) : null}

          {fullScreenImageIndex > 0 ? (
            <TouchableOpacity style={[styles.viewerArrow, styles.viewerArrowLeft]} onPress={() => showAdjacentImage(-1)}>
              <ChevronLeft size={28} color="#fff" />
            </TouchableOpacity>
          ) : null}
          {fullScreenImageIndex < imageMessages.length - 1 ? (
            <TouchableOpacity style={[styles.viewerArrow, styles.viewerArrowRight]} onPress={() => showAdjacentImage(1)}>
              <ChevronRight size={28} color="#fff" />
            </TouchableOpacity>
          ) : null}

          {imageMessages.length > 1 ? (
            <View style={styles.viewerCounter}>
              <Text style={styles.viewerCounterText}>{fullScreenImageIndex + 1} / {imageMessages.length}</Text>
            </View>
          ) : null}
          <View style={styles.viewerHintPill}>
            <Text style={styles.viewerHint}>Pinch to zoom • tap arrows to browse</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={!!fullScreenAvatar} transparent animationType="fade" onRequestClose={() => setFullScreenAvatar(null)}>
        <View style={styles.fullScreenMediaOverlay}>
          <TouchableOpacity style={styles.fullScreenClose} onPress={() => setFullScreenAvatar(null)}>
            <X size={28} color="#fff" />
          </TouchableOpacity>
          {fullScreenAvatar?.uri ? (
            <Image source={{ uri: fullScreenAvatar.uri }} style={styles.fullScreenAvatar} resizeMode="contain" />
          ) : null}
          <Text style={styles.fullScreenAvatarName}>{fullScreenAvatar?.name || ''}</Text>
        </View>
      </Modal>

      <Modal visible={searchVisible && false} transparent>
        <View />
      </Modal>

      <Modal visible={mediaVisible} animationType="slide" onRequestClose={() => setMediaVisible(false)}>
        <SafeAreaView style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Shared photos</Text>
            <TouchableOpacity onPress={() => setMediaVisible(false)}>
              <X size={24} color="#111827" />
            </TouchableOpacity>
          </View>
          {imageMessages.length ? (
            <FlatList
              data={imageMessages}
              numColumns={3}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.mediaGrid}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.gridImageWrap} onPress={() => { setMediaVisible(false); openFullScreenImage(item.mediaUrl); }}>
                  <Image source={{ uri: item.mediaUrl }} style={styles.gridImage} />
                </TouchableOpacity>
              )}
            />
          ) : (
            <View style={styles.modalEmpty}>
              <ImageIcon size={40} color="#cbd5e1" />
              <Text style={styles.modalEmptyTitle}>No photos yet</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={detailsVisible} transparent animationType="fade" onRequestClose={() => setDetailsVisible(false)}>
        <Pressable style={styles.detailsOverlay} onPress={() => setDetailsVisible(false)}>
          <Pressable style={[styles.detailsCard, isGroup && styles.groupDetailsCard]} onPress={() => {}}>
            <Image source={{ uri: isGroup ? (group?.avatar || FALLBACK_AVATAR) : otherUserAvatar }} style={styles.detailsAvatar} />
            <Text style={styles.detailsName}>{isGroup ? (group?.name || 'Group') : otherUserName}</Text>
            <Text style={styles.detailsMeta}>{isGroup ? `${group?.members?.length || 0} members` : 'Conversation'}</Text>
            {!isGroup ? (
              <>
                <TouchableOpacity style={styles.detailsAction} onPress={() => { setDetailsVisible(false); openProfile(navigation, { uid: otherUserId, name: otherUserName, avatar: otherUserAvatar }); }}>
                  <Text style={styles.detailsActionText}>View profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailsAction} onPress={() => { setDetailsVisible(false); setMediaVisible(true); }}>
                  <Text style={styles.detailsActionText}>Shared photos</Text>
                </TouchableOpacity>
                <View style={styles.detailsDivider} />
                <TouchableOpacity style={styles.detailsSafetyAction} onPress={async () => {
                  setDetailsVisible(false);
                  try { await blockUser(otherUserId); setBlocked(true); Alert.alert('Student blocked', 'You will no longer be able to message this student.'); }
                  catch (error) { Alert.alert('Could not block', error?.message || 'Please try again.'); }
                }}>
                  <Text style={styles.detailsSafetyText}>Block student</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailsSafetyAction} onPress={() => {
                  setDetailsVisible(false);
                  Alert.alert('Report student', 'Choose a reason.', [
                    { text: 'Spam / scam', onPress: () => reportUser({ targetId: otherUserId, reason: 'Spam / scam' }).catch(() => {}) },
                    { text: 'Harassment / abuse', onPress: () => reportUser({ targetId: otherUserId, reason: 'Harassment / abuse' }).catch(() => {}) },
                    { text: 'Impersonation', onPress: () => reportUser({ targetId: otherUserId, reason: 'Impersonation' }).catch(() => {}) },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}>
                  <Text style={styles.detailsSafetyText}>Report student</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {group?.admins?.includes(currentUser?.uid) ? (
                  <>
                    <TouchableOpacity style={styles.detailsAction} onPress={() => { setDetailsVisible(false); setGroupRenameText(group?.name || ''); setGroupRenameVisible(true); }}>
                      <Text style={styles.detailsActionText}>Rename group</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.detailsAction} onPress={() => { setDetailsVisible(false); loadGroupConnections(); }}>
                      <Text style={styles.detailsActionText}>Add members</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                <View style={styles.detailsDivider} />
                <Text style={styles.groupMembersTitle}>Members</Text>
                <View style={styles.groupMembersList}>
                  {(group?.members || []).slice(0, 12).map((memberId) => {
                    const person = group?.memberProfiles?.[memberId] || { name: 'Student', avatar: FALLBACK_AVATAR };
                    return (
                      <View key={memberId} style={styles.groupMemberRow}>
                        <Image source={{ uri: person.avatar || FALLBACK_AVATAR }} style={styles.groupMemberAvatar} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupMemberName}>{person.name || 'Student'}</Text>
                          <Text style={styles.groupMemberMeta}>{memberId === group?.createdBy ? 'Creator' : group?.admins?.includes(memberId) ? 'Admin' : 'Member'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <TouchableOpacity style={[styles.detailsSafetyAction, styles.groupLeaveAction]} onPress={leaveCurrentGroup}>
                  <Text style={styles.detailsSafetyText}>Leave group</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.detailsCancel} onPress={() => setDetailsVisible(false)}>
              <Text style={styles.detailsCancelText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={groupRenameVisible} transparent animationType="fade" onRequestClose={() => setGroupRenameVisible(false)}>
        <View style={styles.detailsOverlay}>
          <View style={styles.groupEditCard}>
            <Text style={styles.groupEditTitle}>Rename group</Text>
            <TextInput value={groupRenameText} onChangeText={setGroupRenameText} placeholder="Group name" placeholderTextColor="#999999" style={styles.groupEditInput} maxLength={50} autoFocus />
            <View style={styles.groupEditActions}>
              <TouchableOpacity style={styles.groupEditCancel} onPress={() => setGroupRenameVisible(false)}><Text style={styles.groupEditCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.groupEditSave} onPress={submitGroupRename}><Text style={styles.groupEditSaveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={groupAddVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGroupAddVisible(false)}>
        <SafeAreaView style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add members</Text>
            <TouchableOpacity onPress={() => setGroupAddVisible(false)}><X size={24} color="#111827" /></TouchableOpacity>
          </View>
          <FlatList
            data={groupConnections}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              const selected = selectedGroupMembers.includes(item.uid);
              return (
                <TouchableOpacity
                  style={[styles.groupMemberRow, styles.groupMemberPickerRow, selected && styles.groupMemberSelected]}
                  onPress={() => setSelectedGroupMembers((current) => selected ? current.filter((id) => id !== item.uid) : [...current, item.uid])}
                >
                  <Image source={{ uri: item.avatar || FALLBACK_AVATAR }} style={styles.groupMemberAvatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupMemberName}>{item.name || 'Student'}</Text>
                    <Text style={styles.groupMemberMeta}>{item.handle || 'Connection'}</Text>
                  </View>
                  <View style={[styles.groupPickerCheck, selected && styles.groupPickerCheckActive]}>
                    {selected ? <Check size={15} color="#111111" /> : null}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<View style={styles.modalEmpty}><Text style={styles.modalEmptyTitle}>No eligible connections</Text></View>}
          />
          <TouchableOpacity style={styles.groupAddSave} onPress={addSelectedGroupMembers} disabled={!selectedGroupMembers.length}>
            <Text style={styles.groupAddSaveText}>Add {selectedGroupMembers.length || ''} members</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' },
  keyboardAvoid: { flex: 1 },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f7',
  },
  headerBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E8E8E3' },
  groupHeaderAvatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  groupHeaderGlyph: { fontSize: 20 },
  headerIdentity: { marginLeft: 10, flex: 1 },
  headerName: { fontSize: 16, fontWeight: '800', color: '#111111' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 5 },
  headerStatus: { fontSize: 11, fontWeight: '600', color: '#707070' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginVertical: 7, paddingHorizontal: 12, minHeight: 40, borderRadius: 20, backgroundColor: '#EEEEEA' },
  searchInput: { flex: 1, paddingHorizontal: 8, fontSize: 14, color: '#111111' },
  searchCount: { fontSize: 12, fontWeight: '800', color: '#111111', marginRight: 8 },
  listContent: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 12 },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', minHeight: 44, paddingVertical: 3 },
  myRow: { justifyContent: 'flex-end', paddingLeft: 44 },
  theirRow: { justifyContent: 'flex-start', paddingRight: 44 },
  avatarWrap: { width: 32, alignItems: 'center', marginRight: 6 },
  tinyAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E8E8E3' },
  messageColumn: { maxWidth: '82%', flexDirection: 'column' },
  messageColumnMine: { alignItems: 'flex-end' },
  messageColumnTheirs: { alignItems: 'flex-start' },
  groupSenderName: { marginLeft: 5, marginBottom: 2, fontSize: 9.5, fontWeight: '900', color: '#707070' },
  messageBubble: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 21, minWidth: 56, overflow: 'hidden' },
  myBubble: { backgroundColor: '#FFFC00', borderBottomRightRadius: 6 },
  theirBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: '#e7edf4' },
  quotedReply: { borderLeftWidth: 3, borderRadius: 8, paddingLeft: 8, paddingVertical: 5, paddingRight: 5, marginBottom: 6, backgroundColor: 'rgba(15,23,42,0.06)' },
  quotedReplyMine: { backgroundColor: 'rgba(255,255,255,0.14)', borderLeftColor: '#fff' },
  quotedReplyTheirs: { borderLeftColor: '#111111' },
  quotedReplyLabel: { fontSize: 10, fontWeight: '900', color: '#111111' },
  quotedReplyLabelMine: { color: '#fff' },
  quotedReplyText: { marginTop: 2, fontSize: 12, color: '#707070' },
  quotedReplyTextMine: { color: 'rgba(255,255,255,0.85)' },
  storyChatCard: { flexDirection: 'row', alignItems: 'center', minHeight: 58, marginBottom: 6, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.08)', overflow: 'hidden' },
  storyChatImage: { width: 48, height: 58, backgroundColor: '#e2e8f0' },
  storyChatMeta: { flex: 1, paddingHorizontal: 9, paddingVertical: 6 },
  storyChatLabel: { fontSize: 9, fontWeight: '900', color: '#64748b', letterSpacing: 0.7 },
  storyChatReaction: { fontSize: 19, marginTop: 1 },
  storyChatCaption: { fontSize: 10, color: '#475569', marginTop: 2 },
  messageImage: { width: 240, height: 240, borderRadius: 15, marginBottom: 3, backgroundColor: '#E8E8E3' },
  messageVideo: { width: 240, height: 175, borderRadius: 15, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  videoPlayCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  videoPlayGlyph: { color: '#fff', fontSize: 20, marginLeft: 3 },
  messageVideoText: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 7 },
  messageText: { fontSize: 16, lineHeight: 21 },
  myMessageText: { color: '#111111' },
  theirMessageText: { color: '#111111' },
  deletedText: { fontSize: 14, fontStyle: 'italic', color: '#707070' },
  myDeletedText: { color: 'rgba(255,255,255,0.75)' },
  messageMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 2 },
  timeText: { fontSize: 9, fontWeight: '600' },
  myTimeText: { color: 'rgba(17,17,17,0.55)' },
  theirTimeText: { color: '#999999' },
  reactionPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -1, zIndex: 3 },
  reactionPillRowMine: { alignSelf: 'flex-end' },
  reactionPillRowTheirs: { alignSelf: 'flex-start' },
  reactionPill: { flexDirection: 'row', alignItems: 'center', minHeight: 26, paddingHorizontal: 7, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E3', elevation: 2 },
  reactionPillEmoji: { fontSize: 14 },
  reactionPillCount: { fontSize: 10, fontWeight: '800', color: '#707070', marginLeft: 3 },
  messageActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignSelf: 'flex-start', marginTop: 5, padding: 5, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E3', elevation: 7, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, zIndex: 20, maxWidth: '100%' },
  messageActionsMine: { alignSelf: 'flex-end' },
  messageActionsTheirs: { alignSelf: 'flex-start' },
  reactionActionRow: { flexDirection: 'row', alignItems: 'center' },
  reactionAction: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  reactionEmoji: { fontSize: 19 },
  actionDivider: { width: 1, height: 23, backgroundColor: '#E8E8E3', marginHorizontal: 3 },
  actionChip: { paddingHorizontal: 8, paddingVertical: 7 },
  replyActionText: { fontSize: 11, fontWeight: '900', color: '#111111' },
  shareActionText: { fontSize: 11, fontWeight: '900', color: '#0f766e' },
  deleteActionText: { fontSize: 11, fontWeight: '900', color: '#ef4444' },
  cancelActionText: { fontSize: 18, fontWeight: '800', color: '#707070' },
  typingIndicatorRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 5, marginLeft: 3 },
  typingBubble: { width: 64, height: 38, marginLeft: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf4', alignItems: 'center', justifyContent: 'center' },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#999999' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 45, paddingVertical: 150 },
  emptyAvatarRing: { width: 92, height: 92, borderRadius: 46, padding: 3, backgroundColor: '#dbeafe' },
  emptyAvatar: { width: 86, height: 86, borderRadius: 43 },
  emptyTitle: { marginTop: 15, fontSize: 18, fontWeight: '900', color: '#111111' },
  emptySubtitle: { marginTop: 6, fontSize: 13, lineHeight: 19, color: '#707070', textAlign: 'center' },
  replyBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginBottom: 6, padding: 9, borderRadius: 15, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E3' },
  replyAccent: { width: 3, alignSelf: 'stretch', backgroundColor: '#111111', borderRadius: 2, marginRight: 9 },
  replyContent: { flex: 1 },
  replyLabel: { fontSize: 10, fontWeight: '900', color: '#111111' },
  replyText: { marginTop: 2, fontSize: 13, color: '#475569' },
  emojiPanel: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E8E8E3', paddingHorizontal: 7, paddingTop: 6, paddingBottom: 5 },
  emojiPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4 },
  emojiPanelTitle: { fontSize: 11, fontWeight: '900', color: '#707070' },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around' },
  emojiButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  emojiButtonText: { fontSize: 24 },
  composerSticky: { backgroundColor: '#F7F7F5' },
  composerShell: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, backgroundColor: '#F7F7F5' },
  composer: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingVertical: 5, borderRadius: 27, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E3', elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  composerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  textInputShell: { flex: 1, minHeight: 40, maxHeight: 100, flexDirection: 'row', alignItems: 'center', marginHorizontal: 2, paddingLeft: 8, borderRadius: 20, backgroundColor: '#F0F0EC' },
  textInput: { flex: 1, color: '#111111', fontSize: 15, paddingVertical: 8, paddingRight: 3, textAlignVertical: 'center' },
  emojiToggle: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111111' },
  sendButtonGhost: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFC00' },
  uploadStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 7 },
  uploadStatusText: { fontSize: 11, fontWeight: '700', color: '#111111' },
  mediaViewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerGestureArea: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 50, right: 17, zIndex: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  viewerArrow: { position: 'absolute', top: '48%', zIndex: 30, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  viewerArrowLeft: { left: 12 },
  viewerArrowRight: { right: 12 },
  viewerCounter: { position: 'absolute', top: 60, left: 16, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)' },
  viewerCounterText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  viewerHintPill: { position: 'absolute', bottom: 27, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)' },
  viewerHint: { color: 'rgba(255,255,255,0.86)', fontSize: 11, fontWeight: '700' },
  fullScreenMediaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center' },
  fullScreenClose: { position: 'absolute', top: 50, right: 18, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  fullScreenAvatar: { width: '90%', height: '65%' },
  fullScreenAvatarName: { marginTop: 18, color: '#fff', fontSize: 17, fontWeight: '800' },
  modalPage: { flex: 1, backgroundColor: '#F7F7F5' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8E8E3' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111111' },
  mediaGrid: { padding: 3 },
  gridImageWrap: { width: '33.333%', aspectRatio: 1, padding: 3 },
  gridImage: { flex: 1, borderRadius: 7, backgroundColor: '#E8E8E3' },
  modalEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalEmptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '800', color: '#707070' },
  detailsOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end' },
  groupDetailsCard: { paddingBottom: 18 },
  groupMembersTitle: { width: '100%', marginTop: 8, marginBottom: 6, fontSize: 12, fontWeight: '900', color: '#111111' },
  groupMembersList: { width: '100%', maxHeight: 210 },
  groupMemberRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 7, borderRadius: 13, marginBottom: 5, backgroundColor: '#F8F8F4' },
  groupMemberPickerRow: { paddingHorizontal: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4DE' },
  groupMemberSelected: { backgroundColor: '#FFFEE0', borderColor: '#111111' },
  groupMemberAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8E8E3', marginRight: 9 },
  groupMemberName: { fontSize: 12, fontWeight: '900', color: '#111111' },
  groupMemberMeta: { fontSize: 9.5, color: '#7B7B74', marginTop: 2 },
  groupPickerCheck: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, borderColor: '#C8C8C0', alignItems: 'center', justifyContent: 'center' },
  groupPickerCheckActive: { backgroundColor: '#FFFC00', borderColor: '#111111' },
  groupLeaveAction: { backgroundColor: '#FFF2F2', marginTop: 6 },
  groupEditCard: { margin: 20, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18 },
  groupEditTitle: { fontSize: 18, fontWeight: '900', color: '#111111', marginBottom: 11 },
  groupEditInput: { minHeight: 50, borderWidth: 1, borderColor: '#E4E4DE', borderRadius: 14, paddingHorizontal: 13, color: '#111111', backgroundColor: '#F8F8F4' },
  groupEditActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  groupEditCancel: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 13, backgroundColor: '#F0F0EB' },
  groupEditCancelText: { color: '#55554F', fontSize: 12, fontWeight: '800' },
  groupEditSave: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 13, backgroundColor: '#FFFC00' },
  groupEditSaveText: { color: '#111111', fontSize: 12, fontWeight: '900' },
  groupAddSave: { margin: 16, minHeight: 48, borderRadius: 15, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  groupAddSaveText: { color: '#111111', fontSize: 12, fontWeight: '900' },
  detailsCard: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 30, alignItems: 'center' },
  detailsAvatar: { width: 82, height: 82, borderRadius: 41 },
  detailsName: { marginTop: 12, fontSize: 19, fontWeight: '900', color: '#111111' },
  detailsMeta: { marginTop: 3, fontSize: 12, color: '#999999' },
  detailsAction: { width: '100%', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#EEEEEA', alignItems: 'center' },
  detailsActionText: { fontSize: 14, fontWeight: '800', color: '#111111' },
  detailsCancel: { marginTop: 12, paddingVertical: 10 },
  detailsCancelText: { fontSize: 14, fontWeight: '800', color: '#707070' },
});

export default ChatRoomScreen;