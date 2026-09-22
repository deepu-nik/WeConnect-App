import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCheck, ChevronRight, MessageCircle, Plus, Search, Sparkles, UserRoundPlus, Users, X } from 'lucide-react-native';
import { auth, db } from '../config/firebase';
import { getUserProfile } from '../services/userService';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { createDirectChat, markChatRead } from '../services/chatService';
import Dashboard from '../components/Dashboard';
import { subscribeToGroups } from '../services/groupService';

const FALLBACK_AVATAR = 'https://via.placeholder.com/150';

const dateLabel = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = Math.floor((now - date) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

const initials = (name = 'Student') => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const Avatar = ({ uri, name, size = 56, onPress }) => {
  const [imageError, setImageError] = useState(false);
  const body = (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={{ uri: uri || FALLBACK_AVATAR }} onError={() => setImageError(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />
      {(!uri || imageError) ? (
        <View style={styles.avatarFallback}>
          <Text style={[styles.avatarInitials, { fontSize: Math.max(11, size * 0.25) }]}>{initials(name)}</Text>
        </View>
      ) : null}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.82}>{body}</TouchableOpacity> : body;
};

const ChatsScreen = ({ navigation }) => {
  const currentUser = auth.currentUser;
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [filter, setFilter] = useState('all');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [groups, setGroups] = useState([]);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const profileCache = useRef(new Map());

  useEffect(() => {
    if (!currentUser?.uid) { setChats([]); setLoading(false); return undefined; }

    let unsubscribe = null;
    let active = true;

    const subscribeToCampusChats = async () => {
      setLoading(true);
      try {
        const profile = await getUserProfile(currentUser.uid);
        if (!profile?.collegeId) {
          if (active) { setChats([]); setLoading(false); }
          return;
        }

        const q = query(
          collection(db, 'chats'),
          where('collegeId', '==', profile.collegeId),
          where('participants', 'array-contains', currentUser.uid)
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
          const rawChats = snapshot.docs.map((chatDoc) => {
            const data = chatDoc.data() || {};
            const participants = Array.isArray(data.participants) ? data.participants : [];
            const otherUserId = participants.find((uid) => uid !== currentUser.uid);
            const otherInfo = data.usersInfo?.[otherUserId] || {};
            return {
              id: chatDoc.id,
              otherUserId,
              name: otherInfo.name || 'Student',
              avatar: otherInfo.avatar || FALLBACK_AVATAR,
              lastMessage: data.lastMessage || 'Start the conversation',
              timestamp: data.updatedAt?.toDate?.() || new Date(0),
              unreadCount: Number(data.unreadCount?.[currentUser.uid] || 0),
              typing: Boolean(data.typing?.[otherUserId]),
            };
          }).filter((chat) => chat.otherUserId && chat.otherUserId !== currentUser.uid);
          // A legacy/random chat id can exist for the same pair. Collapse those records by person so one student never appears twice.
          const uniqueByPerson = Array.from(rawChats.reduce((map, chat) => {
            const existing = map.get(chat.otherUserId);
            if (!existing || chat.timestamp > existing.timestamp) map.set(chat.otherUserId, chat);
            return map;
          }, new Map()).values());
          setChats(uniqueByPerson.sort((a, b) => b.timestamp - a.timestamp));
          setLoading(false);
          setRefreshing(false);

          Promise.all(uniqueByPerson.map(async (chat) => {
            if (profileCache.current.has(chat.otherUserId)) {
              return { ...chat, ...profileCache.current.get(chat.otherUserId) };
            }
            try {
              const profile = await getUserProfile(chat.otherUserId);
              if (!profile || profile.uid === currentUser.uid) return null;
              if (!Array.isArray(profile.connections) || !profile.connections.includes(currentUser.uid)) return null;
              const canonical = { name: profile.name || chat.name, avatar: profile.avatar || chat.avatar };
              profileCache.current.set(chat.otherUserId, canonical);
              return { ...chat, ...canonical };
            } catch {
              return chat.name === 'You' ? null : chat;
            }
          })).then((resolved) => {
            if (!active) return;
            setChats(resolved.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp));
          });
          setRefreshing(false);
        }, (error) => {
          console.error('Chats subscription failed:', error);
          setChats([]);
          setLoading(false);
          setRefreshing(false);
        });
      } catch (error) {
        console.error('Could not load campus chats:', error);
        if (active) setLoading(false);
      }
    };

    subscribeToCampusChats();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) { setGroups([]); return undefined; }
    return subscribeToGroups(currentUser.uid, setGroups, (error) => console.error('Groups subscription failed:', error));
  }, [currentUser?.uid]);

  const unreadCount = useMemo(() =>
    chats.filter((chat) => chat.unreadCount > 0).length +
    groups.filter((group) => Number(group.unreadCount?.[currentUser?.uid] || 0) > 0).length,
    [chats, groups, currentUser?.uid]
  );
  const chatListItems = useMemo(() => {
    const direct = chats
      .filter((chat) => filter !== 'unread' || chat.unreadCount > 0)
      .map((chat) => ({ ...chat, itemType: 'direct', sortTime: chat.timestamp?.getTime?.() || 0 }));
    const groupItems = groups
      .filter((group) => filter !== 'unread' || Number(group.unreadCount?.[currentUser?.uid] || 0) > 0)
      .map((group) => ({
        ...group,
        itemType: 'group',
        id: `group:${group.id}`,
        name: group.name,
        avatar: group.avatar || null,
        lastMessage: group.lastMessage || `${group.members?.length || 0} members`,
        unreadCount: Number(group.unreadCount?.[currentUser?.uid] || 0),
        timestamp: group.updatedAt?.toDate?.() || new Date(0),
        sortTime: group.updatedAt?.toMillis?.() || 0,
        groupId: group.id,
      }));
    return [...direct, ...groupItems].sort((a, b) => b.sortTime - a.sortTime);
  }, [chats, groups, filter, currentUser?.uid]);
  const filteredChats = useMemo(() => chatListItems, [chatListItems]);
  const searchMode = Boolean(searchQuery.trim());
  const matchingChats = useMemo(() => {
    const text = searchQuery.trim().toLowerCase();
    if (!text) return [];
    return chats.filter((chat) => chat.name.toLowerCase().includes(text) || chat.lastMessage.toLowerCase().includes(text));
  }, [chats, searchQuery]);

  const handleSearch = async (text) => {
    setSearchQuery(text);
    if (!text.trim()) { setStudentResults([]); setSearchingStudents(false); return; }
    setSearchingStudents(true);
    try {
      const profile = await getUserProfile(currentUser?.uid);
      if (!profile?.collegeId) {
        setStudentResults([]);
        return;
      }
      const snapshot = await getDocs(query(collection(db, 'users'), where('collegeId', '==', profile.collegeId)));
      const lower = text.trim().toLowerCase();
      setStudentResults(snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return { ...data, uid: data.uid || doc.id, name: data.name || data.displayName || data.username || 'Student', avatar: data.avatar || data.photoURL || FALLBACK_AVATAR };
      }).filter((user) => {
        if (user.uid === currentUser?.uid) return false;
        const haystack = [user.name, user.username].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(lower);
      }).slice(0, 12));
    } catch (error) {
      console.error('Student search failed:', error);
      setStudentResults([]);
    } finally { setSearchingStudents(false); }
  };

  const clearSearch = () => { setSearchQuery(''); setStudentResults([]); };
  const openChat = (chat) => {
    // This chat document is already known from the live home-chat subscription.
    // Navigate immediately instead of doing another Firestore/profile lookup before
    // the transition. ChatRoom handles the already-existing document directly.
    navigation.navigate('ChatRoom', {
      chatId: chat.id,
      name: chat.name,
      avatar: chat.avatar,
      uid: chat.otherUserId,
    });
  };
  const startNewChat = async (user) => {
    clearSearch();
    try {
      const canonicalChatId = await createDirectChat({ currentUser, otherUserId: user.uid, otherUser: user });
      navigation.navigate('ChatRoom', { chatId: canonicalChatId, uid: user.uid, name: user.name, avatar: user.avatar });
    } catch (error) {
      console.error('New chat creation failed:', error);
      navigation.navigate('ChatRoom', { uid: user.uid, name: user.name, avatar: user.avatar });
    }
  };

  const markRead = async (chat) => {
    if (!chat.unreadCount || !currentUser?.uid) return;
    try { await markChatRead(chat.id, currentUser.uid); } catch (error) { console.error('Mark chat read failed:', error); }
  };

  const renderChat = ({ item }) => {
    const isGroup = item.itemType === 'group';
    const displayAvatar = item.avatar || FALLBACK_AVATAR;
    return (
      <TouchableOpacity
        style={[styles.chatCard, item.unreadCount > 0 && styles.chatCardUnread]}
        activeOpacity={0.86}
        onPress={() => isGroup
          ? navigation.navigate('ChatRoom', { chatType: 'group', groupId: item.groupId, name: item.name, avatar: displayAvatar })
          : openChat(item)}
        onLongPress={() => !isGroup && markRead(item)}
        delayLongPress={350}
      >
        {isGroup ? (
          <View style={[styles.avatar, styles.groupListAvatar]}>
            <Users size={21} color="#111111" />
          </View>
        ) : (
          <Avatar uri={item.avatar} name={item.name} onPress={() => setAvatarPreview({ name: item.name, avatar: item.avatar })} />
        )}
        <View style={styles.chatContent}>
          <View style={styles.chatTopRow}>
            <Text style={[styles.chatName, item.unreadCount > 0 && styles.chatNameUnread]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.chatTime, item.unreadCount > 0 && styles.chatTimeUnread]}>{dateLabel(item.timestamp)}</Text>
          </View>
          <View style={styles.chatBottomRow}>
            <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>
              {item.typing ? 'typing…' : item.lastMessage}
            </Text>
            {item.unreadCount > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View> : null}
          </View>
        </View>
        <ChevronRight size={16} color="#B8B8B3" />
      </TouchableOpacity>
    );
  };

  const renderStudent = ({ item }) => (
    <TouchableOpacity style={styles.studentResult} activeOpacity={0.82} onPress={() => startNewChat(item)}>
      <Avatar uri={item.avatar} name={item.name} size={50} />
      <View style={styles.studentInfo}>
        <Text style={styles.studentName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.studentMeta} numberOfLines={1}>{item.username ? '@' + item.username : 'WeConnect student'}</Text>
      </View>
      <View style={styles.startChatButton}><MessageCircle size={17} color="#111111" /></View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="auto" />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 450); }} tintColor="#111111" />} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>WeConnect</Text>
          <TouchableOpacity style={styles.studentHubButton} onPress={() => setDashboardVisible(true)} accessibilityLabel="Open Student Hub">
            <Sparkles size={17} color="#111111" />
            <Text style={styles.studentHubButtonText}>Student Hub</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchShell}>
          <Search size={20} color="#777770" />
          <TextInput value={searchQuery} onChangeText={handleSearch} placeholder="Search people or conversations" placeholderTextColor="#96968F" style={styles.searchInput} returnKeyType="search" autoCorrect={false} />
          {searchMode ? <TouchableOpacity onPress={clearSearch} style={styles.clearButton}><X size={17} color="#55554F" /></TouchableOpacity> : null}
        </View>

        {!searchMode ? (
          <>
            <View style={styles.sectionHeader}>
              <View><Text style={styles.sectionTitle}>Messages</Text><Text style={styles.sectionHint}>{unreadCount ? unreadCount + ' unread' : 'Everything is caught up'}</Text></View>
              <View style={styles.filterPillRow}>
                <TouchableOpacity style={[styles.filterPill, filter === 'all' && styles.filterPillActive]} onPress={() => setFilter('all')}><Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.filterPill, filter === 'unread' && styles.filterPillActive]} onPress={() => setFilter('unread')}><Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>Unread{unreadCount ? ' ' + unreadCount : ''}</Text></TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.searchHeader}><Text style={styles.searchHeading}>Search results</Text><Text style={styles.searchHint}>Chats and students</Text></View>
        )}

        {loading && !searchMode ? (
          <View style={styles.loadingBox}><ActivityIndicator size="small" color="#111111" /><Text style={styles.loadingText}>Loading your conversations…</Text></View>
        ) : searchMode ? (
          <>
            {matchingChats.length ? <View style={styles.resultsSection}><Text style={styles.resultsLabel}>YOUR CHATS</Text>{matchingChats.map((chat) => <View key={chat.id}>{renderChat({ item: chat })}</View>)}</View> : null}
            <View style={styles.resultsSection}>
              <Text style={styles.resultsLabel}>STUDENTS</Text>
              {searchingStudents ? <View style={styles.loadingBoxSmall}><ActivityIndicator size="small" color="#111111" /></View> : studentResults.length ? <FlatList data={studentResults} keyExtractor={(item) => item.uid} renderItem={renderStudent} scrollEnabled={false} /> : <View style={styles.emptySearch}><Search size={25} color="#B7B7B0" /><Text style={styles.emptyTitle}>No students found</Text><Text style={styles.emptyText}>Try a name, username or email.</Text></View>}
            </View>
          </>
        ) : (
          <View style={styles.chatList}>
            {filteredChats.length ? filteredChats.map((chat) => <View key={chat.id}>{renderChat({ item: chat })}</View>) : (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>{filter === 'unread' ? <CheckCheck size={28} color="#111111" /> : <MessageCircle size={28} color="#111111" />}</View>
                <Text style={styles.emptyTitle}>{filter === 'unread' ? 'You are all caught up.' : 'Your inbox is quiet.'}</Text>
                <Text style={styles.emptyText}>{filter === 'unread' ? 'No unread conversations right now.' : 'Start a conversation with someone from your campus.'}</Text>
                {filter === 'all' ? <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.navigate('Connect')}><UserRoundPlus size={17} color="#FFFFFF" /><Text style={styles.emptyButtonText}>Find students</Text></TouchableOpacity> : null}
              </View>
            )}
          </View>
        )}
        <View style={styles.footerSpace} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} activeOpacity={0.86} onPress={() => setActionMenuVisible(true)} accessibilityLabel="Create chat or group"><Plus size={25} color="#111111" strokeWidth={2.6} /></TouchableOpacity>

      <Modal visible={actionMenuVisible} transparent animationType="fade" onRequestClose={() => setActionMenuVisible(false)}>
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => setActionMenuVisible(false)}>
          <View style={styles.actionSheet}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionTitle}>Start something new</Text>
            <Text style={styles.actionSubtitle}>Choose what you want to create.</Text>
            <TouchableOpacity style={styles.actionOption} onPress={() => { setActionMenuVisible(false); navigation.navigate('Connect'); }}>
              <View style={styles.actionIcon}><MessageCircle size={20} color="#111111" /></View>
              <View style={{ flex: 1 }}><Text style={styles.actionOptionTitle}>New conversation</Text><Text style={styles.actionOptionText}>Message a connected student.</Text></View>
              <ChevronRight size={18} color="#888880" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionOption} onPress={() => { setActionMenuVisible(false); navigation.navigate('CreateGroup'); }}>
              <View style={styles.actionIcon}><Users size={20} color="#111111" /></View>
              <View style={{ flex: 1 }}><Text style={styles.actionOptionTitle}>Create group</Text><Text style={styles.actionOptionText}>Bring classmates into one chat.</Text></View>
              <ChevronRight size={18} color="#888880" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!avatarPreview} transparent animationType="fade" onRequestClose={() => setAvatarPreview(null)}>
        <TouchableOpacity style={styles.avatarModalOverlay} activeOpacity={1} onPress={() => setAvatarPreview(null)}>
          <View style={styles.avatarModalCard}><Image source={{ uri: avatarPreview?.avatar || FALLBACK_AVATAR }} style={styles.avatarModalImage} /><Text style={styles.avatarModalName}>{avatarPreview?.name || 'Student'}</Text><Text style={styles.avatarModalHint}>Tap outside to close</Text></View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={dashboardVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDashboardVisible(false)}>
        <SafeAreaView style={styles.dashboardModal}>
          <View style={styles.dashboardModalHeader}>
            <View><Text style={styles.dashboardModalEyebrow}>STUDENT HUB</Text><Text style={styles.dashboardModalTitle}>Everything in one place.</Text></View>
            <TouchableOpacity style={styles.dashboardClose} onPress={() => setDashboardVisible(false)}><X size={20} color="#111111" /></TouchableOpacity>
          </View>
          <View style={styles.dashboardBody}><Dashboard onClose={() => setDashboardVisible(false)} /></View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F6F2' },
  page: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 5, paddingBottom: 18 },
  brand: { fontSize: 25, fontWeight: '900', letterSpacing: -0.8, color: '#111111' },
  studentHubButton: { minHeight: 42, paddingHorizontal: 13, borderRadius: 14, backgroundColor: '#FFFC00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#E8E500' },
  studentHubButtonText: { fontSize: 12, fontWeight: '900', color: '#111111' },
  searchShell: { minHeight: 52, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4DE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 9, shadowColor: '#000', shadowOpacity: 0.035, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minHeight: 48, color: '#111111', fontSize: 15, paddingVertical: 0 },
  clearButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEEEEA', alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { marginTop: 24, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111111' },
  sectionHint: { fontSize: 11, color: '#8A8A84', marginTop: 3 },
  filterPillRow: { flexDirection: 'row', gap: 5 },
  filterPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: '#ECECE7' },
  filterPillActive: { backgroundColor: '#111111' },
  filterText: { fontSize: 11, fontWeight: '800', color: '#6C6C66' },
  filterTextActive: { color: '#FFFFFF' },
  chatList: { gap: 7 },
  chatCard: { minHeight: 78, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF', flexDirection: 'row', alignItems: 'center' },
  chatCardUnread: { borderColor: '#E2E2D8', backgroundColor: '#FFFEE6' },
  avatar: { backgroundColor: '#E7E7E1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  avatarFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7E7E1' },
  avatarInitials: { color: '#55554F', fontWeight: '900' },
  chatContent: { flex: 1, minWidth: 0, paddingRight: 8 },
  chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  chatName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#22221F', marginRight: 8 },
  chatNameUnread: { fontWeight: '900' },
  chatTime: { fontSize: 10, fontWeight: '700', color: '#9A9A93' },
  chatTimeUnread: { color: '#111111' },
  chatBottomRow: { flexDirection: 'row', alignItems: 'center' },
  lastMessage: { flex: 1, fontSize: 12.5, color: '#777770', paddingRight: 8 },
  lastMessageUnread: { color: '#22221F', fontWeight: '800' },
  unreadBadge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  searchHeader: { marginTop: 20, marginBottom: 10 },
  searchHeading: { fontSize: 19, fontWeight: '900', color: '#111111' },
  searchHint: { fontSize: 11, color: '#8A8A84', marginTop: 2 },
  resultsSection: { marginTop: 9 },
  resultsLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#8B8B84', marginBottom: 7, paddingHorizontal: 3 },
  studentResult: { minHeight: 69, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF', flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 14, fontWeight: '800', color: '#22221F' },
  studentMeta: { fontSize: 11, color: '#85857E', marginTop: 3 },
  startChatButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  loadingBox: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingBoxSmall: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 12, color: '#7A7A73' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 48, paddingHorizontal: 35 },
  emptyIcon: { width: 66, height: 66, borderRadius: 22, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#111111', textAlign: 'center' },
  emptyText: { fontSize: 12.5, lineHeight: 19, color: '#7A7A73', textAlign: 'center', marginTop: 5 },
  emptyButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 18, backgroundColor: '#111111' },
  emptyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptySearch: { alignItems: 'center', paddingVertical: 45 },
  footerSpace: { height: 80 },
  groupListAvatar: { marginRight: 11, width: 50, height: 50, borderRadius: 17, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 28 },
  actionSheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#D5D5CE', marginBottom: 15 },
  actionTitle: { fontSize: 21, fontWeight: '900', color: '#111111' },
  actionSubtitle: { fontSize: 12, color: '#777770', marginTop: 3, marginBottom: 13 },
  actionOption: { minHeight: 70, borderRadius: 18, backgroundColor: '#F6F6F2', borderWidth: 1, borderColor: '#E4E4DE', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  actionOptionTitle: { fontSize: 14, fontWeight: '900', color: '#111111' },
  actionOptionText: { fontSize: 11, color: '#777770', marginTop: 2 },
  fab: { position: 'absolute', right: 19, bottom: 18, width: 57, height: 57, borderRadius: 20, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  avatarModalCard: { width: 280, borderRadius: 24, overflow: 'hidden', backgroundColor: '#FFFFFF', alignItems: 'center', paddingBottom: 18 },
  avatarModalImage: { width: 280, height: 280, backgroundColor: '#E7E7E1' },
  avatarModalName: { marginTop: 14, fontSize: 17, fontWeight: '900', color: '#111111' },
  avatarModalHint: { marginTop: 4, fontSize: 11, color: '#898981' },
  dashboardModal: { flex: 1, backgroundColor: '#F6F6F2' },
  dashboardModalHeader: { minHeight: 76, paddingHorizontal: 18, paddingVertical: 13, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E5DF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dashboardModalEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#8B8B84' },
  dashboardModalTitle: { fontSize: 17, fontWeight: '900', color: '#111111', marginTop: 2 },
  dashboardClose: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  dashboardBody: { flex: 1, paddingTop: 5 },
});

export default ChatsScreen;
