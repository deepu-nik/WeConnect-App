import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, 
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, StatusBar, 
  Modal, Animated, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ArrowLeft, Send, Image as ImageIcon, Camera, 
  Smile, X
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { auth, db } from '../config/firebase';
import { markChatRead } from '../services/chatService';
import { collection, query, where, addDoc, onSnapshot, orderBy, serverTimestamp, doc, updateDoc, getDocs, increment } from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

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
    name: otherUserName = 'Student', 
    avatar: otherUserAvatar = 'https://via.placeholder.com/150' 
  } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [chatId, setChatId] = useState(initialChatId || null);
  
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true); 
  
  const [previewImage, setPreviewImage] = useState(null);
  const [imageCaption, setImageCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const typingTimeout = useRef(null);

  const currentUser = auth.currentUser;

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
          lastMessage: mediaUrl ? '📷 Image' : messageText,
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
        lastMessage: mediaUrl ? '📷 Image' : messageText, updatedAt: serverTimestamp(), ['unreadCount.' + otherUserId]: increment(1) 
      });
    } catch (error) { console.error('Error sending:', error); }
  };

  const pickImage = async (useCamera = false) => {
    const options = { mediaTypes: ['images'], allowsEditing: true, quality: 0.8 };
    let result = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0].uri) setPreviewImage(result.assets[0].uri);
  };

  const uploadAndSendImage = async () => {
    if (!previewImage) return;
    setIsUploading(true);
    const secureUrl = await uploadToCloudinary(previewImage, 'image');
    if (secureUrl) await sendMessage(secureUrl, 'image', imageCaption);
    else Alert.alert('Upload failed', 'Could not upload this image. Please try again.');
    setIsUploading(false);
  };

  const renderMessage = ({ item }) => {
    const isMe = item.senderId === currentUser?.uid;
    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.theirRow]}>
        {!isMe && <TouchableOpacity onPress={() => navigation.navigate('Profile', { uid: otherUserId, name: otherUserName, avatar: otherUserAvatar })}><Image source={{ uri: otherUserAvatar }} style={styles.tinyAvatar} /></TouchableOpacity>}
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
          {item.mediaUrl && item.mediaType === 'image' && (
            <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
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

      {/* HEADER -> Clickable to view Profile */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft size={26} color="#000" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.headerProfileClick} 
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profile', { uid: otherUserId, name: otherUserName, avatar: otherUserAvatar })}
          >
            <Image source={{ uri: otherUserAvatar }} style={styles.headerAvatar} />
            <View>
              <Text style={styles.headerName} numberOfLines={1}>{otherUserName}</Text>
              <Text style={[styles.headerStatus, isOnline && { color: '#34C759' }]}>{isOnline ? 'Online' : 'Offline'}</Text>
            </View>
          </TouchableOpacity>
        </View>
        

      </View>

      <KeyboardAvoidingView style={styles.keyboardAvoid} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
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
          <TouchableOpacity style={styles.cameraBtn} onPress={() => pickImage(true)}><Camera size={22} color="#888" /></TouchableOpacity>
          <View style={styles.inputWrapper}>
            <TextInput style={styles.textInput} placeholder="Send a chat..." placeholderTextColor="#999" value={inputText} onChangeText={handleTextChange} multiline maxLength={500} />
            <TouchableOpacity style={styles.insideInputBtn}><Smile size={20} color="#888" /></TouchableOpacity>
          </View>
          {inputText.trim().length > 0 ? (
             <TouchableOpacity style={styles.sendBtn} onPress={() => sendMessage()}><Send size={18} color="#fff" style={{ marginLeft: 2 }} /></TouchableOpacity>
          ) : (
            <View style={styles.rightIconsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => pickImage(false)}><ImageIcon size={24} color="#888" /></TouchableOpacity>

            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!previewImage} animationType="fade" transparent={false} onRequestClose={() => setPreviewImage(null)}>
        <SafeAreaView style={styles.previewModalContainer}>
          <StatusBar barStyle="light-content" />
          <View style={styles.previewHeader}>
            <TouchableOpacity onPress={() => setPreviewImage(null)} style={styles.previewIconBtn}><X size={28} color="#fff" /></TouchableOpacity>
            <View style={styles.previewToolsRow}>

            </View>
          </View>
          <Image source={{ uri: previewImage }} style={styles.fullPreviewImage} resizeMode="contain" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.previewBottomBar}>
            <TextInput style={styles.captionInput} placeholder="Add a caption..." placeholderTextColor="#ccc" value={imageCaption} onChangeText={setImageCaption} color="#fff" />
            <TouchableOpacity style={styles.sendPreviewBtn} onPress={uploadAndSendImage} disabled={isUploading}>
              {isUploading ? <ActivityIndicator size="small" color="#fff" /> : <Send size={24} color="#fff" />}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
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
});

export default ChatRoomScreen;