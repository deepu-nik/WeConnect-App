import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCheck, ChevronRight, MessageCircle, Plus, Search, Sparkles, UserRoundPlus, X } from 'lucide-react-native';
import { auth, db } from '../config/firebase';
import { getUserProfile } from '../services/userService';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { createDirectChat, markChatRead } from '../services/chatService';
import { createGroupChat } from '../services/groupService';
import Dashboard from '../components/Dashboard';

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
  const [composerVisible, setComposerVisible] = useState(false);
  const [groupVisible, setGroupVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupCandidates, setGroupCandidates] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [loadingGroupCandidates, setLoadingGroupCandidates] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
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
            const isGroup = data.type === 'group' || participants.length > 2;
            const otherUserId = isGroup ? null : participants.find((uid) => uid !== currentUser.uid);
            const otherInfo = data.usersInfo?.[otherUserId] || {};
            return {
              id: chatDoc.id,
              isGroup,
              memberCount: participants.length,
              otherUserId,
              name: isGroup ? (data.groupName || 'Group chat') : (otherInfo.name || 'Student'),
              avatar: isGroup ? (data.groupAvatar || FALLBACK_AVATAR) : (otherInfo.avatar || FALLBACK_AVATAR),
              lastMessage: data.lastMessage || 'Start the conversation',
              timestamp: data.updatedAt?.toDate?.() || new Date(0),
              unreadCount: Number(data.unreadCount?.[currentUser.uid] || 0),
              typing: isGroup
                ? participants.some((uid) => uid !== currentUser.uid && Boolean(data.typing?.[uid]))
                : Boolean(data.typing?.[otherUserId]),
            };
          }).filter((chat) => chat.isGroup || (chat.otherUserId && chat.otherUserId !== currentUser.uid));

          const directChats = rawChats.filter((chat) => !chat.isGroup);
          const groups = rawChats.filter((chat) => chat.isGroup);
          const uniqueDirect = Array.from(directChats.reduce((map, chat) => {
            const existing = map.get(chat.otherUserId);
            if (!existing || chat.timestamp > existing.timestamp) map.set(chat.otherUserId, chat);
            return map;
          }, new Map()).values());
          const uniqueByPerson = [...uniqueDirect, ...groups];
          setChats(uniqueByPerson.sort((a, b) => b.timestamp - a.timestamp));
          setLoading(false);
          setRefreshing(false);

          Promise.all(uniqueByPerson.map(async (chat) => {
            if (chat.isGroup) return chat;
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
              return chat;
            }
          })).then((resolved) => {
            if (!active) return;
            setChats(resolved.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp));
          });
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

  const unreadCount = useMemo(() => chats.filter((chat) => chat.unreadCount > 0).length, [chats]);
  const filteredChats = useMemo(() => filter === 'unread' ? chats.filter((chat) => chat.unreadCount > 0) : chats, [chats, filter]);
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

  const openGroupComposer = async () => {
    setComposerVisible(false);
    setGroupVisible(true);
    setLoadingGroupCandidates(true);
    try {
      const me = await getUserProfile(currentUser.uid);
      const connectedIds = new Set(me?.connections || []);
      const snapshot = await getDocs(query(collection(db, 'users'), where('collegeId', '==', me?.collegeId || '')));
      const candidates = snapshot.docs
        .map((item) => {
          const data = item.data() || {};
          return { ...data, uid: data.uid || item.id, name: data.name || data.displayName || 'Student', avatar: data.avatar || data.photoURL || FALLBACK_AVATAR };
        })
        .filter((user) => user.uid !== currentUser.uid && connectedIds.has(user.uid));
      setGroupCandidates(candidates);
    } catch (error) {
      console.error('Group candidates failed:', error);
      setGroupCandidates([]);
    } finally {
      setLoadingGroupCandidates(false);
    }
  };

  const toggleGroupMember = (uid) => {
    setSelectedGroupIds((current) => current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid]);
  };

  const handleCreateGroup = async () => {
    if (creatingGroup) return;
    const selected = groupCandidates.filter((member) => selectedGroupIds.includes(member.uid));
    if (!groupName.trim()) {
      Alert.alert('Group name required', 'Give your group a name.');
      return;
    }
    if (!selected.length) {
      Alert.alert('Add members', 'Select at least one classmate.');
      return;
    }
    setCreatingGroup(true);
    try {
      const chatId = await createGroupChat({ name: groupName, members: selected });
      setGroupVisible(false);
      setGroupName('');
      setSelectedGroupIds([]);
      navigation.navigate('ChatRoom', { chatId, isGroup: true, name: groupName.trim(), avatar: '' });
    } catch (error) {
      Alert.alert('Could not create group', error?.message || 'Make sure you are connected with the selected students.');
    } finally {
      setCreatingGroup(false);
    }
  };
  const openChat = async (chat) => {
    if (chat.isGroup) {
      navigation.navigate('ChatRoom', { chatId: chat.id, isGroup: true, name: chat.name, avatar: chat.avatar });
      return;
    }
    try {
      const canonicalChatId = await createDirectChat({
        currentUser,
        otherUserId: chat.otherUserId,
        otherUser: { name: chat.name, avatar: chat.avatar },
      });
      navigation.navigate('ChatRoom', { chatId: canonicalChatId, name: chat.name, avatar: chat.avatar, uid: chat.otherUserId });
    } catch (error) {
      console.error('Canonical chat open failed:', error);
      navigation.navigate('ChatRoom', { chatId: chat.id, name: chat.name, avatar: chat.avatar, uid: chat.otherUserId });
    }
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

  const renderChat = ({ item }) => (
    <TouchableOpacity style={[styles.chatCard, item.unreadCount > 0 && styles.chatCardUnread]} activeOpacity={0.86} onPress={() => openChat(item)} onLongPress={() => markRead(item)} delayLongPress={350}>
      <Avatar uri={item.avatar} name={item.name} onPress={() => setAvatarPreview({ name: item.name, avatar: item.avatar })} />
      <View style={styles.chatContent}>
        <View style={styles.chatTopRow}>
          <Text style={[styles.chatName, item.unreadCount > 0 && styles.chatNameUnread]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.chatTime, item.unreadCount > 0 && styles.chatTimeUnread]}>{dateLabel(item.timestamp)}</Text>
        </View>
        <View style={styles.chatBottomRow}>
          <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>{item.typing ? 'typing…' : item.lastMessage}</Text>
          {item.unreadCount > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text></View> : null}
        </View>
      </View>
      <ChevronRight size={16} color="#B8B8B3" />
    </TouchableOpacity>
  );

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
      <StatusBar barStyle="dark-content" />
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

      <TouchableOpacity style={styles.fab} activeOpacity={0.86} onPress={() => setComposerVisible(true)} accessibilityLabel="Create a conversation or group"><Plus size={25} color="#111111" strokeWidth={2.6} /></TouchableOpacity>

      <Modal visible={composerVisible} transparent animationType="fade" onRequestClose={() => setComposerVisible(false)}>
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => setComposerVisible(false)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Start something new</Text>
            <TouchableOpacity style={styles.actionRow} onPress={() => { setComposerVisible(false); navigation.navigate('Connect'); }}>
              <View style={styles.actionIcon}><MessageCircle size={20} color="#111111" /></View>
              <View style={styles.actionCopy}><Text style={styles.actionTitle}>New conversation</Text><Text style={styles.actionSubtitle}>Message a classmate</Text></View>
              <ChevronRight size={18} color="#8A8A84" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={openGroupComposer}>
              <View style={styles.actionIcon}><UserRoundPlus size={20} color="#111111" /></View>
              <View style={styles.actionCopy}><Text style={styles.actionTitle}>New group</Text><Text style={styles.actionSubtitle}>Create a group chat with your connections</Text></View>
              <ChevronRight size={18} color="#8A8A84" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={groupVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGroupVisible(false)}>
        <SafeAreaView style={styles.groupModal}>
          <View style={styles.groupHeader}>
            <TouchableOpacity onPress={() => setGroupVisible(false)}><X size={23} color="#111111" /></TouchableOpacity>
            <Text style={styles.groupTitle}>New group</Text>
            <TouchableOpacity onPress={handleCreateGroup} disabled={creatingGroup}><Text style={styles.groupCreateText}>{creatingGroup ? '...' : 'Create'}</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.groupBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.groupLabel}>GROUP NAME</Text>
            <TextInput value={groupName} onChangeText={setGroupName} placeholder="e.g. DSA Study Group" placeholderTextColor="#999999" style={styles.groupNameInput} maxLength={40} />
            <Text style={styles.groupLabel}>ADD CONNECTIONS</Text>
            {loadingGroupCandidates ? <ActivityIndicator size="small" color="#111111" /> : groupCandidates.length ? groupCandidates.map((member) => {
              const selected = selectedGroupIds.includes(member.uid);
              return (
                <TouchableOpacity key={member.uid} style={[styles.groupMemberRow, selected && styles.groupMemberSelected]} onPress={() => toggleGroupMember(member.uid)}>
                  <Avatar uri={member.avatar} name={member.name} size={46} />
                  <View style={styles.groupMemberInfo}><Text style={styles.groupMemberName}>{member.name}</Text><Text style={styles.groupMemberMeta}>{member.username ? '@' + member.username : 'Connected student'}</Text></View>
                  <View style={[styles.memberCheck, selected && styles.memberCheckSelected]}>{selected ? <Text style={styles.memberCheckGlyph}>✓</Text> : null}</View>
                </TouchableOpacity>
              );
            }) : <Text style={styles.groupEmpty}>You need at least one connection to create a group.</Text>}
            <Text style={styles.groupFootnote}>Groups use the same WeConnect chat room as direct messages. No separate chat experience.</Text>
          </ScrollView>
        </SafeAreaView>
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
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 28 },
  actionSheetTitle: { fontSize: 18, fontWeight: '900', color: '#111111', marginBottom: 10 },
  actionRow: { minHeight: 68, borderRadius: 18, backgroundColor: '#F7F7F5', marginTop: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  actionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, paddingHorizontal: 11 },
  actionTitle: { fontSize: 14, fontWeight: '900', color: '#111111' },
  actionSubtitle: { fontSize: 11, color: '#777770', marginTop: 3 },
  groupModal: { flex: 1, backgroundColor: '#F6F6F2' },
  groupHeader: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  groupTitle: { fontSize: 17, fontWeight: '900', color: '#111111' },
  groupCreateText: { fontSize: 13, fontWeight: '900', color: '#111111' },
  groupBody: { padding: 16, paddingBottom: 30 },
  groupLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#8B8B84', marginTop: 12, marginBottom: 8 },
  groupNameInput: { minHeight: 52, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4DE', paddingHorizontal: 14, color: '#111111', fontSize: 15 },
  groupMemberRow: { minHeight: 64, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5DF', paddingHorizontal: 10, marginBottom: 7, flexDirection: 'row', alignItems: 'center' },
  groupMemberSelected: { borderColor: '#111111', backgroundColor: '#FFFEE6' },
  groupMemberInfo: { flex: 1, paddingHorizontal: 10 },
  groupMemberName: { fontSize: 14, fontWeight: '800', color: '#22221F' },
  groupMemberMeta: { fontSize: 11, color: '#85857E', marginTop: 2 },
  memberCheck: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, borderColor: '#C8C8C2', alignItems: 'center', justifyContent: 'center' },
  memberCheckSelected: { backgroundColor: '#111111', borderColor: '#111111' },
  memberCheckGlyph: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  groupEmpty: { fontSize: 13, lineHeight: 19, color: '#777770', paddingVertical: 20 },
  groupFootnote: { marginTop: 18, fontSize: 11, lineHeight: 17, color: '#8A8A84' },
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
