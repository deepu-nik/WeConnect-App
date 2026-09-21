import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, 
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, StatusBar, 
  Modal, Animated, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ArrowLeft, Send, Image as ImageIcon, Camera, 
  Smile, X, Video
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { auth, db } from '../config/firebase';
import { markChatRead } from '../services/chatService';
import { getUserProfile } from '../services/userService';
import { collection, query, where, addDoc, onSnapshot, orderBy, serverTimestamp, doc, updateDoc, getDocs, increment } from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { openProfile } from '../navigation/navigationHelpers';
import MediaShareSheet from '../components/MediaShareSheet';

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
  const [fullScreenAvatar, setFullScreenAvatar] = useState(null);
  const typingTimeout = useRef(null);

  const currentUser = auth.currentUser;

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
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));
      setMessages(fetchedMessages);
    });

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

      await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
        text: messageText, senderId: currentUser.uid, createdAt: serverTimestamp(), mediaUrl, mediaType
      });

      await updateDoc(doc(db, 'chats', currentChatId), {
        lastMessage: mediaUrl ? (mediaType === 'video' ? '🎥 Video' : '📷 Photo') : messageText, updatedAt: serverTimestamp(), ['unreadCount.' + otherUserId]: increment(1) 
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
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
          {item.mediaUrl && item.mediaType === 'image' && (
            <TouchableOpacity activeOpacity={0.95} onPress={() => setFullScreenImage(item.mediaUrl)}>
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
        </View>
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

      <Modal visible={!!fullScreenImage} transparent animationType="fade" onRequestClose={() => setFullScreenImage(null)}>
        <View style={styles.fullScreenMediaOverlay}>
          <TouchableOpacity style={styles.fullScreenClose} onPress={() => setFullScreenImage(null)}><X size={28} color="#fff" /></TouchableOpacity>
          {fullScreenImage && <Image source={{ uri: fullScreenImage }} style={styles.fullScreenMedia} resizeMode="contain" />}
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

export default ChatRoomScreen      <MediaShareSheet
        visible={mediaShareVisible}
        onClose={() => setMediaShareVisible(false)}
        onShare={shareMedia}
        title={`Share with ${otherUserName}`}
        shareLabel="Send"
        allowMultiple
      />
;