import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, 
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, StatusBar, 
  Modal, Animated, Alert, PanResponder
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ArrowLeft, Send, Image as ImageIcon, Camera, 
  Smile, X, Video
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { auth, db } from '../config/firebase';
import { markChatRead } from '../services/chatService';
import { subscribeToMessages, sendChatMessage as sendPersistedMessage, toggleMessageReaction, deleteMessage } from '../services/chatMessageService';
import { getUserProfile } from '../services/userService';
import { collection, query, where, addDoc, onSnapshot, orderBy, serverTimestamp, doc, updateDoc, getDocs, increment } from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { openProfile } from '../navigation/navigationHelpers';
import MediaShareSheet from '../components/MediaShareSheet';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    };
    animateDot(dot1, 0); animateDot(dot2, 150); animateDot(dot3, 300);
  }, []);

  const translateY = (dot) => dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: translateY(dot1) }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: translateY(dot2) }] }]} />
      <Animated.View style={[styles.typingDot, { transform: [{ translateY: translateY(dot3) }] }]} />
    </View>
  );
};

const ChatRoomScreen = ({ route, navigation }) => {
  const { 
    chatId: initialChatId,
    uid: otherUserId,
    name: routeName = 'Student',
    avatar: routeAvatar = 'https://via.placeholder.com/150' 
  } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [otherUserName, setOtherUserName] = useState(routeName);
  const [otherUserAvatar, setOtherUserAvatar] = useState(routeAvatar);
  const [inputText, setInputText] = useState('');
  const [chatId, setChatId] = useState(initialChatId || null);
  
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true); 
  
  const [previewImage, setPreviewImage] = useState(null);
  const [imageCaption, setImageCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [mediaShareVisible, setMediaShareVisible] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [viewerScale] = useState(() => new Animated.Value(1));
  const [viewerTranslateX] = useState(() => new Animated.Value(0));
  const [viewerTranslateY] = useState(() => new Animated.Value(0));
  const viewerPanStart = useRef({ x: 0, y: 0 }).current;
  const [fullScreenAvatar, setFullScreenAvatar] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const typingTimeout = useRef(null);

  const currentUser = auth.currentUser;

  const imageMessages = messages.filter((message) => message.mediaUrl && message.mediaType === 'image');

  const openFullScreenImage = (url) => {
    const index = Math.max(0, imageMessages.findIndex((message) => message.mediaUrl === url));
    setFullScreenImageIndex(index);
    setFullScreenImage(url);
    viewerScale.setValue(1);
    viewerTranslateX.setValue(0);
    viewerTranslateY.setValue(0);
  };

  const closeFullScreenImage = () => {
    setFullScreenImage(null);
    viewerScale.setValue(1);
    viewerTranslateX.setValue(0);
    viewerTranslateY.setValue(0);
  };

  const showAdjacentImage = (direction) => {
    if (!imageMessages.length) return;
    const next = fullScreenImageIndex + direction;
    if (next < 0 || next >= imageMessages.length) return;
    setFullScreenImageIndex(next);
    setFullScreenImage(imageMessages[next].mediaUrl);
    viewerScale.setValue(1);
    viewerTranslateX.setValue(0);
    viewerTranslateY.setValue(0);
  };

  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: viewerScale } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const nextScale = Math.max(1, Math.min(4, event.nativeEvent.scale));
      viewerScale.setValue(nextScale);
      if (nextScale === 1) {
        viewerTranslateX.setValue(0);
        viewerTranslateY.setValue(0);
      }
    }
  };

  const viewerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10,
      onPanResponderGrant: () => {
        viewerPanStart.x = viewerTranslateX.__getValue();
        viewerPanStart.y = viewerTranslateY.__getValue();
      },
      onPanResponderMove: (_, gesture) => {
        const scale = viewerScale.__getValue();
        if (scale > 1) {
          viewerTranslateX.setValue(viewerPanStart.x + gesture.dx);
          viewerTranslateY.setValue(viewerPanStart.y + gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const scale = viewerScale.__getValue();
        if (scale <= 1 && Math.abs(gesture.dx) > 70 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
          showAdjacentImage(gesture.dx < 0 ? 1 : -1);
          return;
        }
        if (scale <= 1 && gesture.dy > 120) {
          closeFullScreenImage();
          return;
        }
        if (scale <= 1) {
          viewerTranslateX.setValue(0);
          viewerTranslateY.setValue(0);
        }
      },
    })
  ).current;

  useEffect(() => {
    let active = true;
    const loadOtherUser = async () => {
      if (!otherUserId) return;
      try {
        const profile = await getUserProfile(otherUserId);
        if (!active || !profile) return;
        setOtherUserName(profile.name || routeName || 'Student');
        setOtherUserAvatar(profile.avatar || routeAvatar || 'https://via.placeholder.com/150');
      } catch (error) {
        console.error('Other user profile load failed:', error);
      }
    };
    loadOtherUser();
    return () => { active = false; };
  }, [otherUserId, routeName, routeAvatar]);

  useEffect(() => {
    const findOrCreateChat = async () => {
      if (chatId || !otherUserId || !currentUser) return; 
      const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
      const querySnapshot = await getDocs(q);
      
      let existingChatId = null;
      querySnapshot.forEach((doc) => {
        if (doc.data().participants.includes(otherUserId)) existingChatId = doc.id;
      });
      if (existingChatId) setChatId(existingChatId);
    };
    findOrCreateChat();
  }, [otherUserId, currentUser, chatId]);

  useEffect(() => {
    if (!chatId || !currentUser) return;
    markChatRead(chatId, currentUser.uid).catch((error) => console.error('Failed to mark chat read:', error));
    const unsubscribeMsgs = subscribeToMessages(chatId, (fetchedMessages) => {
      setMessages(fetchedMessages);
    }, (error) => console.error('Message subscription failed:', error));

    const chatDocRef = doc(db, 'chats', chatId);
    const unsubscribeTyping = onSnapshot(chatDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.typing && data.typing[otherUserId]) setIsOtherUserTyping(true);
        else setIsOtherUserTyping(false);
      }
    });

    return () => { unsubscribeMsgs(); unsubscribeTyping(); };
  }, [chatId, currentUser]);

  useEffect(() => () => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
  }, []);

  const handleTextChange = async (text) => {
    setInputText(text);
    if (!chatId) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), { ['typing.' + currentUser.uid]: true });
    } catch (error) {
      console.error('Typing state update failed:', error);
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'chats', chatId), { ['typing.' + currentUser.uid]: false });
      } catch (error) {
        console.error('Typing state update failed:', error);
      }
    }, 1200);
  };

  const sendMessage = async (mediaUrl = null, mediaType = null, caption = null) => {
    const messageText = caption || inputText.trim();
    const reply = replyingTo;
    setReplyingTo(null);
    if (!messageText && !mediaUrl) return;

    let currentChatId = chatId;
    setInputText(''); 
    setPreviewImage(null);
    setImageCaption('');

    try {
      if (!currentChatId) {
        const newChatRef = await addDoc(collection(db, 'chats'), {
          participants: [currentUser.uid, otherUserId],
          updatedAt: serverTimestamp(),
          lastMessage: mediaUrl ? (mediaType === 'video' ? '🎥 Video' : '📷 Photo') : messageText,
          typing: { [currentUser.uid]: false, [otherUserId]: false },
          usersInfo: {
            [currentUser.uid]: { name: currentUser.displayName || 'You', avatar: currentUser.photoURL || 'https://via.placeholder.com/150' },
            [otherUserId]: { name: otherUserName, avatar: otherUserAvatar }
          }
        });
        currentChatId = newChatRef.id;
        setChatId(currentChatId);
      } else {
        await updateDoc(doc(db, 'chats', currentChatId), { [`typing.${currentUser.uid}`]: false });
      }

      const messageId = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      await sendPersistedMessage({
        chatId: currentChatId,
        message: {
          id: messageId,
          text: messageText,
          mediaUrl,
          mediaType,
          replyTo: reply ? {
            id: reply.id,
            text: reply.text || (reply.mediaType === 'video' ? '🎥 Video' : '📷 Photo'),
            senderId: reply.senderId,
          } : null,
        },
      });
    } catch (error) { console.error('Error sending:', error); }
  };

  const pickImage = async (useCamera = false) => {
    const options = { mediaTypes: ['images'], allowsEditing: true, quality: 0.8 };
    let result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0].uri) setPreviewImage(result.assets[0].uri);
  };

  const shareMedia = async (items, caption) => {
    for (const item of items) {
      const secureUrl = await uploadToCloudinary(item.uri, item.type);
      if (!secureUrl) throw new Error('Media upload failed');
      await sendMessage(secureUrl, item.type, caption);
    }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderId === currentUser?.uid;
    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.theirRow]}>
        {!isMe && (
          <TouchableOpacity onPress={() => setFullScreenAvatar({ name: otherUserName, uri: otherUserAvatar })}>
            <Image source={{ uri: otherUserAvatar }} style={styles.tinyAvatar} />
          </TouchableOpacity>
        )}
        <TouchableOpacity activeOpacity={0.92} onLongPress={() => { setSelectedMessageId(item.id); setReplyingTo(item); }} style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
          {item.mediaUrl && item.mediaType === 'image' && (
            <TouchableOpacity activeOpacity={0.95} onPress={() => openFullScreenImage(item.mediaUrl)}>
              <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {item.mediaUrl && item.mediaType === 'video' && (
            <View style={styles.messageVideo}>
              <Video size={32} color="#fff" />
              <Text style={styles.messageVideoText}>Video</Text>
            </View>
          )}
          {item.text ? <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>{item.text}</Text> : null}
          <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.theirTimeText]}>
            {item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </TouchableOpacity>
        {selectedMessageId === item.id ? (
          <View style={[styles.messageActions, isMe ? styles.messageActionsMine : styles.messageActionsTheirs]}>
            {['❤️', '😂', '👍', '🔥', '😮'].map((emoji) => (
              <TouchableOpacity key={emoji} onPress={async () => {
                await toggleMessageReaction(chatId, item.id, currentUser.uid, emoji);
                setSelectedMessageId(null);
              }}><Text style={styles.reactionEmoji}>{emoji}</Text></TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { setReplyingTo(item); setSelectedMessageId(null); }}>
              <Text style={styles.replyActionText}>Reply</Text>
            </TouchableOpacity>
            {isMe ? <TouchableOpacity onPress={async () => { await deleteMessage(chatId, item.id); setSelectedMessageId(null); }}>
              <Text style={styles.deleteActionText}>Delete</Text>
            </TouchableOpacity> : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}>
            <ArrowLeft size={26} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerProfileClick}
            activeOpacity={0.7}
            onPress={() => openProfile(navigation, { uid: otherUserId, name: otherUserName, avatar: otherUserAvatar })}
          >
            <TouchableOpacity onPress={() => setFullScreenAvatar({ name: otherUserName, uri: otherUserAvatar })}>
              <Image source={{ uri: otherUserAvatar }} style={styles.headerAvatar} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerName} numberOfLines={1}>{otherUserName}</Text>
              <Text style={[styles.headerStatus, isOnline && { color: '#34C759' }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            isOtherUserTyping ? (
              <View style={styles.typingIndicatorRow}>
                <Image source={{ uri: otherUserAvatar }} style={styles.tinyAvatar} />
                <View style={styles.typingBubble}><TypingIndicator /></View>
              </View>
            ) : null
          }
        />

        {replyingTo ? (
          <View style={styles.replyBar}>
            <View style={styles.replyAccent} />
            <View style={styles.replyContent}>
              <Text style={styles.replyLabel}>Replying to {replyingTo.senderId === currentUser?.uid ? 'yourself' : otherUserName}</Text>
              <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text || (replyingTo.mediaType === 'video' ? '🎥 Video' : '📷 Photo')}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)}><X size={20} color="#64748b" /></TouchableOpacity>
          </View>
        ) : null}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.cameraBtn} onPress={() => setMediaShareVisible(true)}>
            <Camera size={22} color="#888" />
          </TouchableOpacity>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Send a chat..."
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={handleTextChange}
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={styles.insideInputBtn}>
              <Smile size={20} color="#888" />
            </TouchableOpacity>
          </View>

          {inputText.trim().length > 0 ? (
            <TouchableOpacity style={styles.sendBtn} onPress={() => sendMessage()}>
              <Send size={18} color="#fff" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={() => setMediaShareVisible(true)}>
              <ImageIcon size={24} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!fullScreenImage} transparent animationType="fade" onRequestClose={closeFullScreenImage}>
        <View style={styles.mediaViewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={closeFullScreenImage}>
            <X size={28} color="#fff" />
          </TouchableOpacity>

          {fullScreenImage && (
            <PinchGestureHandler
              onGestureEvent={onPinchGestureEvent}
              onHandlerStateChange={onPinchStateChange}
              minPointers={2}
              maxPointers={2}
            >
              <Animated.View style={styles.viewerGestureArea} {...viewerPanResponder.panHandlers}>
                <Animated.Image
                  source={{ uri: fullScreenImage }}
                  style={[
                    styles.viewerImage,
                    {
                      transform: [
                        { translateX: viewerTranslateX },
                        { translateY: viewerTranslateY },
                        { scale: viewerScale },
                      ],
                    },
                  ]}
                  resizeMode="contain"
                />
              </Animated.View>
            </PinchGestureHandler>
          )}

          {imageMessages.length > 1 && (
            <View style={styles.viewerCounter}>
              <Text style={styles.viewerCounterText}>{fullScreenImageIndex + 1} / {imageMessages.length}</Text>
            </View>
          )}

          <Text style={styles.viewerHint}>Pinch to zoom • Swipe left/right • Swipe down to close</Text>
        </View>
      </Modal>

      <Modal visible={!!fullScreenAvatar} transparent animationType="fade" onRequestClose={() => setFullScreenAvatar(null)}>
        <View style={styles.fullScreenMediaOverlay}>
          <TouchableOpacity style={styles.fullScreenClose} onPress={() => setFullScreenAvatar(null)}><X size={28} color="#fff" /></TouchableOpacity>
          {fullScreenAvatar?.uri && <Image source={{ uri: fullScreenAvatar.uri }} style={styles.fullScreenAvatar} resizeMode="contain" />}
          {!!fullScreenAvatar?.name && <Text style={styles.fullScreenAvatarName}>{fullScreenAvatar.name}</Text>}
        </View>
      </Modal>

      <MediaShareSheet
        visible={mediaShareVisible}
        onClose={() => setMediaShareVisible(false)}
        onShare={shareMedia}
        title={`Share with ${otherUserName}`}
        shareLabel="Send"
        allowMultiple
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  keyboardAvoid: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', zIndex: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerProfileClick: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBtn: { padding: 8 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ccc', marginRight: 10, marginLeft: 2 },
  headerName: { fontSize: 18, fontWeight: '700', color: '#000' },
  headerStatus: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  listContent: { paddingHorizontal: 15, paddingVertical: 15 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 4 },
  myRow: { justifyContent: 'flex-end' },
  theirRow: { justifyContent: 'flex-start' },
  tinyAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8, marginBottom: 2 },
  messageBubble: { maxWidth: '75%', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  myBubble: { backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#F2F3F5', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  myMessageText: { color: '#fff' },
  theirMessageText: { color: '#000' },
  timeText: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  myTimeText: { color: 'rgba(255,255,255,0.7)' },
  theirTimeText: { color: '#999' },
  messageImage: { width: 220, height: 220, borderRadius: 14, marginBottom: 5 },
  typingIndicatorRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 5, marginLeft: 2 },
  typingBubble: { backgroundColor: '#F2F3F5', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, borderBottomLeftRadius: 4, width: 65, height: 35, justifyContent: 'center' },
  typingContainer: { flexDirection: 'row', justifyContent: 'space-between', width: 30, alignItems: 'center' },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#888' },
  messageActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: '#fff', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6 },
  messageActionsMine: { alignSelf: 'flex-end' },
  messageActionsTheirs: { alignSelf: 'flex-start' },
  reactionEmoji: { fontSize: 19 },
  replyActionText: { fontSize: 12, fontWeight: '800', color: '#007AFF' },
  deleteActionText: { fontSize: 12, fontWeight: '800', color: '#FF3B30' },
  replyBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginBottom: 5, padding: 9, borderRadius: 12, backgroundColor: '#f1f5f9' },
  replyAccent: { width: 3, alignSelf: 'stretch', backgroundColor: '#007AFF', borderRadius: 2, marginRight: 9 },
  replyContent: { flex: 1 },
  replyLabel: { fontSize: 11, fontWeight: '800', color: '#007AFF' },
  replyText: { marginTop: 2, fontSize: 13, color: '#475569' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  cameraBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f2f3f5', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  inputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f2f3f5', borderRadius: 20, marginHorizontal: 10, paddingLeft: 15, paddingRight: 5, minHeight: 40, maxHeight: 100 },
  textInput: { flex: 1, fontSize: 16, color: '#000', paddingTop: 8, paddingBottom: 8, textAlignVertical: 'center' },
  insideInputBtn: { padding: 8 },
  rightIconsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  actionBtn: { paddingHorizontal: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  previewModalContainer: { flex: 1, backgroundColor: '#000' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, zIndex: 10, position: 'absolute', width: '100%' },
  previewToolsRow: { flexDirection: 'row' },
  previewIconBtn: { padding: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 5 },
  fullPreviewImage: { flex: 1, width: '100%', height: '100%' },
  previewBottomBar: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)', position: 'absolute', bottom: 0, width: '100%' },
  captionInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25, paddingHorizontal: 20, height: 50, fontSize: 16, marginRight: 15 },
  sendPreviewBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  mediaViewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerGestureArea: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 48, right: 18, zIndex: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' },
  viewerCounter: { position: 'absolute', top: 58, left: 18, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.6)' },
  viewerCounterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  viewerHint: { position: 'absolute', bottom: 28, color: 'rgba(255,255,255,.75)', fontSize: 12, fontWeight: '600' },
});

export default ChatRoomScreen;
