import React, { useState, useEffect, useRef } from 'react';
import { openProfile as navigateToProfile } from '../navigation/navigationHelpers';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, ActivityIndicator, StatusBar, Animated, RefreshControl, 
  Dimensions, PanResponder, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MessageCircle, MoreVertical } from 'lucide-react-native'; 

// Firebase & Utils
import { auth, db } from '../config/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import Dashboard from '../components/Dashboard';
import { getUserProfile } from '../services/userService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DASHBOARD_MAX_HEIGHT = SCREEN_HEIGHT * 0.5;

const ChatsScreen = ({ navigation }) => {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser?.uid) { setChats([]); setLoading(false); return undefined; }
    setLoading(true);
    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
    const unsubscribe = onSnapshot(chatsQuery, (snapshot) => {
      const nextChats = snapshot.docs.map((chatDoc) => {
        const data = chatDoc.data() || {};
        const participants = Array.isArray(data.participants) ? data.participants : [];
        const otherUserId = participants.find((uid) => uid !== currentUser.uid);
        const otherInfo = data.usersInfo?.[otherUserId] || {};
        const timestamp = data.updatedAt?.toDate?.() || new Date(0);
        return { id: chatDoc.id, otherUserId, name: otherInfo.name || 'Student', avatar: otherInfo.avatar || 'https://via.placeholder.com/150', lastMessage: data.lastMessage || 'No messages yet', timestamp, unreadCount: Number(data.unreadCount?.[currentUser.uid] || 0) };
      }).sort((a, b) => b.timestamp - a.timestamp);
      setChats(nextChats); setLoading(false);
    }, (error) => { console.error('Chats subscription failed:', error); setChats([]); setLoading(false); });
    return unsubscribe;
  }, [currentUser?.uid]);

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Avatar Modal State
  const [avatarModalData, setAvatarModalData] = useState(null);

  // Dashboard / refresh state
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dashboardHeight = useRef(new Animated.Value(0)).current;
  const dashboardOpacity = useRef(new Animated.Value(0)).current;

  const animateDashboard = (open) => {
    setIsTasksOpen(open);
    Animated.parallel([
      Animated.spring(dashboardHeight, {
        toValue: open ? DASHBOARD_MAX_HEIGHT : 0,
        useNativeDriver: false,
        tension: 90,
        friction: 12,
      }),
      Animated.timing(dashboardOpacity, {
        toValue: open ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDashboard = () => animateDashboard(false);

  const handlePullDown = () => {
    if (isSearching) return;
    setRefreshing(true);
    animateDashboard(true);
    setTimeout(() => setRefreshing(false), 350);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 35) {
          animateDashboard(true);
        } else if (gestureState.dy < -35) {
          animateDashboard(false);
        }
      },
    })
  ).current;

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
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  avatarModalCloseZone: { flex: 1, width: '100%' },
  avatarModalContent: { width: 260, backgroundColor: '#fff', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10 },
  avatarModalHeader: { backgroundColor: 'rgba(0,0,0,0.4)', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, padding: 10 },
  avatarModalName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  avatarModalImage: { width: 260, height: 260, backgroundColor: '#ccc' },
});

export default ChatsScreen;