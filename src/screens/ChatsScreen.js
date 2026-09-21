import React, { useState, useEffect, useRef } from 'react';
import { openProfile as navigateToProfile } from '../navigation/navigationHelpers';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, ActivityIndicator, StatusBar, Animated, RefreshControl, 
  Dimensions, PanResponder
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MessageCircle, MoreVertical } from 'lucide-react-native'; 

// Firebase & Utils
import { auth, db } from '../config/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import Dashboard from '../components/Dashboard';
import { getUserProfile } from '../services/userService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DASHBOARD_MAX_HEIGHT = SCREEN_HEIGHT * 0.5;

// --- STORY BACKGROUND GRADIENTS (Fallback to solid colors for standard RN Views) ---
const STORY_BACKGROUNDS = [
  '#ff7e5f', // Sunset Orange
  '#00c6ff', // Ocean Blue
  '#f12711', // Fire Red
  '#8E2DE2', // Deep Purple
  '#11998e', // Emerald Green
  '#111111'  // Dark Slate
];

// --- CUSTOM DRAGGABLE TEXT COMPONENT ---
const DraggableText = ({ overlay }) => {
  const pan = useRef(new Animated.ValueXY({ x: overlay.x, y: overlay.y })).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => { pan.flattenOffset(); }
    })
  ).current;

  return (
    <Animated.View {...panResponder.panHandlers} style={[pan.getLayout(), { position: 'absolute', padding: 10 }]}>
      <Text style={[styles.draggableText, { color: overlay.color, fontSize: overlay.fontSize }]}>
        {overlay.text}
      </Text>
    </Animated.View>
  );
};

const ChatsScreen = ({ navigation }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Avatar Modal State
  const [avatarModalData, setAvatarModalData] = useState(null);

  // Animation States
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dashboardHeight = useRef(new Animated.Value(0)).current;
  const dashboardOpacity = useRef(new Animated.Value(0)).current;

  // --- SEARCH LOGIC ---
  const handleSearch = async (text) => {
    setSearchQuery(text);
    if (text.length > 0) {
      setIsSearching(true);
      try {
        const q = query(collection(db, 'users')); 
        const querySnapshot = await getDocs(q);
        const results = [];
        const lowerText = text.toLowerCase();

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const uid = data.uid || doc.id; 
          const possibleName = (data.name || data.displayName || data.username || data.email || 'Student').toLowerCase();
          
          if (possibleName.includes(lowerText) && uid !== currentUser?.uid) {
            results.push({ 
              ...data, uid, 
              name: data.name || data.displayName || data.username || 'Student', 
              avatar: data.avatar || data.photoURL || 'https://via.placeholder.com/150' 
            });
          }
        });
        setSearchResults(results);
      } catch (error) { console.error("Search error:", error); }
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  const openProfile = (user) => navigateToProfile(navigation, { uid: user.uid || user.otherUserId, name: user.name, avatar: user.avatar });

  const startNewChat = (selectedUser) => {
    setIsSearching(false);
    setSearchQuery('');
    navigation.navigate('ChatRoom', { uid: selectedUser.uid, name: selectedUser.name, avatar: selectedUser.avatar });
  };

  // --- STORY STUDIO LOGIC ---
  const openStoryStudio = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return alert("Camera permission is required to create a story.");
    }
    setStoryImage(null);
    setTextOverlays([]);
    setCurrentTextInput('');
    setTextSize(36);
    setIsTypingActive(false);
    setBgIndex(0);
    setStoryStudioVisible(true);
  };

  const handleStoryTap = (item) => {
    if (item.isMe) {
      if (item.hasNew) {
        Alert.alert("Your Story", "What would you like to do?", [
          { text: "View Story", onPress: () => setViewingStory(item.storyData) },
          { text: "Add New Story", onPress: openStoryStudio },
          { text: "Cancel", style: "cancel" }
        ]);
      } else {
        openStoryStudio();
      }
    } else {
      if (item.storyData) {
        setViewingStory(item.storyData);
      }
    }
  };

  const pickStoryImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) {
      setStoryImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setStoryImage(photo.uri);
    }
  };

  const cycleBackground = () => setBgIndex((prev) => (prev + 1) % STORY_BACKGROUNDS.length);

  const handleAddTextDone = () => {
    if (currentTextInput.trim()) {
      setTextOverlays([...textOverlays, { 
        id: Date.now().toString(), 
        text: currentTextInput.trim(), 
        color: textColor,
        fontSize: textSize,
        x: SCREEN_WIDTH / 2 - 100, // Approximate center
        y: SCREEN_HEIGHT / 2 - 50 
      }]);
    }
    setCurrentTextInput('');
    setIsTypingActive(false);
    Keyboard.dismiss();
  };

  const shareStory = async () => {
    if (!storyImage && textOverlays.length === 0) return alert("Add an image or some text first!");
    
    setIsUploadingStory(true);
    try {
      let imageUrl = null;
      if (storyImage) imageUrl = await uploadToCloudinary(storyImage, 'image');

      await addDoc(collection(db, 'stories'), {
        author: {
          uid: currentUser.uid,
          name: currentUser.displayName || 'Student',
          avatar: currentUser.photoURL || 'https://via.placeholder.com/150'
        },
        imageUrl: imageUrl, 
        bgColor: STORY_BACKGROUNDS[bgIndex], 
        textOverlays: textOverlays, 
        createdAt: serverTimestamp(),
        views: []
      });

      setStoryStudioVisible(false);
    } catch (error) {
      console.error(error);
      alert("Failed to upload story.");
    } finally {
      setIsUploadingStory(false);
    }
  };

  // --- RENDERERS ---
  const renderStory = ({ item }) => (
    <TouchableOpacity style={styles.storyContainer} activeOpacity={0.8} onPress={() => item.isMe ? handleStoryTap(item) : openProfile(item)}>
      <View style={[styles.storyRing, item.hasNew && styles.storyRingActive, item.isMe && !item.hasNew && {borderColor: '#eee'}]}>
        <Image source={{ uri: item.avatar }} style={styles.storyAvatar} />
      </View>
      <Text style={styles.storyName} numberOfLines={1}>{item.name}</Text>
      {item.isMe && <View style={styles.addStoryBadge}><Plus size={14} color="#fff" /></View>}
    </TouchableOpacity>
  );

  const renderChatItem = ({ item }) => (
    <View style={styles.chatItem}>
      <TouchableOpacity onPress={() => setAvatarModalData({ name: item.name, avatar: item.avatar })}>
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.chatDetails} activeOpacity={0.7} onPress={() => navigation.navigate('ChatRoom', { chatId: item.id, name: item.name, avatar: item.avatar, uid: item.otherUserId })}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => openProfile(item)}><Text style={styles.chatName} numberOfLines={1}>{item.name}</Text></TouchableOpacity>
          <Text style={styles.chatTime}>{item.timestamp?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}</Text>
        </View>
        <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>{item.lastMessage}</Text>
      </TouchableOpacity>
      {item.unreadCount > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadText}>{item.unreadCount}</Text></View>}
    </View>
  );

  const renderSearchItem = ({ item }) => (
    <View style={styles.chatItem}>
      <TouchableOpacity onPress={() => setAvatarModalData({ name: item.name, avatar: item.avatar || 'https://via.placeholder.com/150' })}>
        <Image source={{ uri: item.avatar || 'https://via.placeholder.com/150' }} style={styles.avatar} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.chatDetails} activeOpacity={0.7} onPress={() => startNewChat(item)}>
        <TouchableOpacity onPress={() => openProfile(item)}><Text style={styles.chatName}>{item.name}</Text></TouchableOpacity>
        <Text style={styles.lastMessage}>{item.email || '@student'}</Text>
      </TouchableOpacity>
      <MessageCircle size={24} color="#111111" />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.weConnectText}>WeConnect</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn}><MoreVertical size={24} color="#000" /></TouchableOpacity>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color="#888" style={styles.searchIcon} />
          <TextInput style={styles.searchInput} placeholder="Search students or chats..." placeholderTextColor="#888" value={searchQuery} onChangeText={handleSearch} />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => {setSearchQuery(''); setIsSearching(false);}}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* DASHBOARD */}
      <Animated.View {...panResponder.panHandlers} style={[{ height: dashboardHeight, opacity: dashboardOpacity, overflow: 'hidden' }]}>
        <Dashboard onClose={closeDashboard} />
      </Animated.View>

      {/* MAIN FEED */}
      {loading && !isSearching ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#111111" /></View>
      ) : (
        <FlatList
          data={isSearching ? searchResults : chats}
          keyExtractor={(item) => item.id || item.uid}
          renderItem={isSearching ? renderSearchItem : renderChatItem}
          refreshControl={!isSearching ? <RefreshControl refreshing={refreshing} onRefresh={handlePullDown} tintColor="transparent" colors={['transparent']} /> : undefined}
          contentContainerStyle={[styles.listContainer, (!isSearching && chats.length === 0) && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{isSearching ? 'No students found.' : 'No messages yet.'}</Text>
              {!isSearching && <Text style={styles.emptySubText}>Pull down to launch utilities, or search for a student!</Text>}
            </View>
          }
        />
      )}

      {/* AVATAR PREVIEW MODAL */}
      <Modal visible={!!avatarModalData} transparent animationType="fade" onRequestClose={() => setAvatarModalData(null)}>
        <View style={styles.avatarModalOverlay}>
          <TouchableOpacity style={styles.avatarModalCloseZone} activeOpacity={1} onPress={() => setAvatarModalData(null)} />
          <View style={styles.avatarModalContent}>
            <View style={styles.avatarModalHeader}>
              <Text style={styles.avatarModalName}>{avatarModalData?.name}</Text>
            </View>
            <Image source={{ uri: avatarModalData?.avatar }} style={styles.avatarModalImage} resizeMode="cover" />
          </View>
          <TouchableOpacity style={styles.avatarModalCloseZone} activeOpacity={1} onPress={() => setAvatarModalData(null)} />
        </View>
      </Modal>

      {/* --- LIVE STORY VIEWER MODAL --- */}
      <Modal visible={!!viewingStory} animationType="fade" transparent={false} onRequestClose={() => setViewingStory(null)}>
        {viewingStory && (
          <TouchableOpacity 
            style={[styles.viewerContainer, { backgroundColor: viewingStory.imageUrl ? '#000' : (viewingStory.bgColor || '#000') }]} 
            activeOpacity={1} 
            onPress={() => setViewingStory(null)}
          >
            <StatusBar hidden />
            {viewingStory.imageUrl && <Image source={{ uri: viewingStory.imageUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
            
            <SafeAreaView style={styles.viewerOverlay}>
              <View style={styles.viewerHeader}>
                <Image source={{ uri: viewingStory.author?.avatar }} style={styles.viewerAvatar} />
                <Text style={styles.viewerName}>{viewingStory.author?.name}</Text>
              </View>
            </SafeAreaView>

            {/* Render Text Overlays exactly where they were placed */}
            {viewingStory.textOverlays?.map((overlay, index) => (
              <View key={index} style={{ position: 'absolute', top: overlay.y, left: overlay.x, padding: 10 }}>
                <Text style={[styles.draggableText, { color: overlay.color, fontSize: overlay.fontSize }]}>{overlay.text}</Text>
              </View>
            ))}
          </TouchableOpacity>
        )}
      </Modal>

      {/* --- ADVANCED STORY STUDIO MODAL --- */}
      <Modal visible={isStoryStudioVisible} animationType="slide" transparent={false} onRequestClose={() => setStoryStudioVisible(false)}>
        <View style={[styles.studioContainer, { backgroundColor: storyImage ? '#000' : STORY_BACKGROUNDS[bgIndex] }]}>
          <StatusBar hidden />
          
          {/* BACKGROUND LAYER */}
          {!storyImage ? (
            permission?.granted ? (
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
            ) : (
              <View style={styles.centerContainer}><Text style={{color:'#fff'}}>Camera Permission Denied</Text></View>
            )
          ) : (
            <Image source={{ uri: storyImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          )}

          {/* STUDIO OVERLAY UI */}
          {!isTypingActive && (
            <SafeAreaView style={styles.studioOverlay}>
              
              {/* Top Controls */}
              <View style={styles.studioTopBar}>
                <TouchableOpacity onPress={() => { setStoryImage(null); setStoryStudioVisible(false); }} style={styles.studioIconBtn}>
                  <X size={28} color="#fff" />
                </TouchableOpacity>

                <View style={styles.studioTools}>
                  <TouchableOpacity onPress={() => setIsTypingActive(true)} style={styles.studioIconBtn}>
                    <Type size={28} color="#fff" />
                  </TouchableOpacity>
                  {!storyImage && (
                    <TouchableOpacity onPress={cycleBackground} style={styles.studioIconBtn}>
                      <Palette size={28} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Render Draggable Text Overlays */}
              {textOverlays.map((overlay) => (
                <DraggableText key={overlay.id} overlay={overlay} />
              ))}

              {/* Bottom Controls (Capture / Share) */}
              <View style={styles.studioBottomBar}>
                {!storyImage ? (
                  <>
                    <TouchableOpacity style={styles.galleryBtn} onPress={pickStoryImage}>
                      <ImageIcon size={28} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.captureBtnRing} onPress={takePhoto}>
                      <View style={styles.captureBtnInner} />
                    </TouchableOpacity>
                    <View style={{width: 44}} /> 
                  </>
                ) : (
                  <View style={styles.shareRow}>
                    <TouchableOpacity style={styles.shareStoryBtn} onPress={shareStory} disabled={isUploadingStory}>
                      {isUploadingStory ? <ActivityIndicator color="#000" /> : (
                        <>
                          <Text style={styles.shareStoryText}>Share to Story</Text>
                          <Send size={18} color="#000" />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </SafeAreaView>
          )}

          {/* TEXT TYPING OVERLAY (Instagram Style) */}
          {isTypingActive && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.typingOverlay}>
              <View style={styles.typingTopBar}>
                 <TouchableOpacity onPress={handleAddTextDone} style={styles.typingDoneBtn}>
                   <Text style={styles.typingDoneText}>Done</Text>
                 </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.typingInput, { color: textColor, fontSize: textSize }]}
                value={currentTextInput}
                onChangeText={setCurrentTextInput}
                placeholder="Type something..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                autoFocus
                multiline
                textAlign="center"
              />

              {/* Text Size Resizer */}
              <View style={styles.resizerRow}>
                <TouchableOpacity onPress={() => setTextSize(Math.max(16, textSize - 6))} style={styles.resizeBtn}><Minus size={20} color="#fff" /></TouchableOpacity>
                <Text style={styles.resizeText}>Size</Text>
                <TouchableOpacity onPress={() => setTextSize(Math.min(60, textSize + 6))} style={styles.resizeBtn}><Plus size={20} color="#fff" /></TouchableOpacity>
              </View>

              {/* Color Picker Row */}
              <View style={styles.colorPickerRow}>
                 {['#ffffff', '#000000', '#FF3B30', '#34C759', '#111111', '#FF9500', '#AF52DE'].map(c => (
                   <TouchableOpacity key={c} onPress={() => setTextColor(c)} style={[styles.colorSwab, {backgroundColor: c}, textColor === c && styles.colorSwabActive]} />
                 ))}
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  weConnectText: { fontSize: 26, fontWeight: '800', color: '#111111', letterSpacing: -0.5 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { marginLeft: 16 },
  
  searchContainer: { paddingHorizontal: 20, paddingBottom: 10, backgroundColor: '#fff', zIndex: 5 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f5f7', borderRadius: 12, paddingHorizontal: 12, height: 45 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#000' },
  clearText: { color: '#111111', fontWeight: 'bold' },
  
  listContainer: { paddingBottom: 30 },
  chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#eee', marginRight: 15 },
  chatDetails: { flex: 1, justifyContent: 'center', paddingVertical: 5 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { fontSize: 17, fontWeight: '600', color: '#000', flex: 1, marginRight: 10 },
  chatTime: { fontSize: 13, color: '#888' },
  lastMessage: { fontSize: 15, color: '#666', flex: 1, paddingRight: 10 },
  lastMessageUnread: { fontWeight: 'bold', color: '#000' },
  unreadBadge: { backgroundColor: '#FFFC00', borderRadius: 12, minWidth: 24, height: 24, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginLeft: 10 },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  emptyContainer: { alignItems: 'center', marginTop: 50, paddingHorizontal: 40 },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8, textAlign: 'center' },
  emptySubText: { fontSize: 15, color: '#888', textAlign: 'center', lineHeight: 22 },

  // Avatar Modal CSS
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  avatarModalCloseZone: { flex: 1, width: '100%' },
  avatarModalContent: { width: 260, backgroundColor: '#fff', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10 },
  avatarModalHeader: { backgroundColor: 'rgba(0,0,0,0.4)', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, padding: 10 },
  avatarModalName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  avatarModalImage: { width: 260, height: 260, backgroundColor: '#ccc' },

  // --- STORY VIEWER CSS ---
  viewerContainer: { flex: 1 },
  viewerOverlay: { ...StyleSheet.absoluteFillObject, padding: 20 },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30, alignSelf: 'flex-start' },
  viewerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  viewerName: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginRight: 10 },

  // Typing Mode CSS
  typingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center' },
  typingTopBar: { position: 'absolute', top: 50, right: 20 },
  typingDoneBtn: { paddingHorizontal: 15, paddingVertical: 8 },
  typingDoneText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  typingInput: { fontWeight: 'bold', width: '100%', paddingHorizontal: 20, minHeight: 100 },
  
  resizerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'absolute', bottom: 100, width: '100%', gap: 20 },
  resizeBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 20 },
  resizeText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  colorPickerRow: { flexDirection: 'row', justifyContent: 'center', gap: 15, position: 'absolute', bottom: 40, width: '100%' },
  colorSwab: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#fff' },
  colorSwabActive: { transform: [{scale: 1.3}] }
});

export default ChatsScreen;