import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, FlatList, Image, Modal, Platform,
  SafeAreaView as NativeSafeAreaView, ScrollView, Share, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Check, Hand, MessageCircle, QrCode as QrIcon, ScanLine, Search, Share2,
  UserCheck, UserPlus, X,
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { acceptConnectionRequest, declineConnectionRequest, sendConnectionRequest, subscribeToConnectionRequests } from '../services/connectionService';
import { getAllUsers, getUserProfile, normalizeUser } from '../services/userService';
import { openProfile } from '../navigation/navigationHelpers';

const LOCATIONS = [
  ['Library', '📚', '#007AFF'],
  ['Canteen', '🍔', '#FF9500'],
  ['Hostel', '🛏️', '#AF52DE'],
  ['Ground', '⚽', '#34C759'],
  ['CS Lab', '💻', '#5856D6'],
  ['Outside', '🚶', '#FF3B30'],
];

const ConnectScreen = ({ navigation }) => {
  const currentUser = auth.currentUser;
  const [activeTab, setActiveTab] = useState('discover');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [myLocation, setMyLocation] = useState('Classroom');
  const [loading, setLoading] = useState(true);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrMode, setQrMode] = useState('my_code');
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (qrVisible) {
          setQrVisible(false);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [qrVisible])
  );

  useEffect(() => {
    if (!currentUser) return undefined;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const next = snapshot.docs
        .filter((item) => item.id !== currentUser.uid)
        .map((item) => normalizeUser(item.id, item.data()));
      const me = snapshot.docs.find((item) => item.id === currentUser.uid);
      if (me?.data()?.location) setMyLocation(me.data().location);
      setUsers(next);
      setLoading(false);
    }, (error) => {
      console.error('Users subscription failed:', error);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;
    return subscribeToConnectionRequests(currentUser.uid, setRequests);
  }, [currentUser]);

  const connectedUsers = useMemo(
    () => users.filter((user) => currentUser?.uid && user.connections.includes(currentUser.uid)),
    [users, currentUser]
  );

  const discoverUsers = useMemo(() => {
    const connectedIds = new Set(connectedUsers.map((user) => user.uid));
    return users.filter((user) => !connectedIds.has(user.uid));
  }, [users, connectedUsers]);

  const filteredData = useMemo(() => {
    let data = activeTab === 'network' ? connectedUsers : activeTab === 'requests' ? requests.map((r) => normalizeUser(r.senderId, r.sender || {})) : discoverUsers;
    const term = searchQuery.trim().toLowerCase();
    if (!term) return data;
    return data.filter((user) => user.name.toLowerCase().includes(term) || user.handle.toLowerCase().includes(term));
  }, [activeTab, connectedUsers, discoverUsers, requests, searchQuery]);

  const updateLocation = async (name, icon) => {
    setMyLocation(name);
    try {
      await import('firebase/firestore').then(({ doc, updateDoc }) =>
        updateDoc(doc(db, 'users', currentUser.uid), { location: name, locationIcon: icon })
      );
    } catch (error) {
      console.error('Location update failed:', error);
      Alert.alert('Error', 'Could not update your location.');
    }
  };

  const customLocation = () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Custom location', 'Choose one of the campus locations for now.');
      return;
    }
    Alert.prompt('Custom Location', 'Where are you?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Update', onPress: (text) => text?.trim() && updateLocation(text.trim(), '📍') },
    ]);
  };

  const sendRequest = async (user) => {
    try {
      await sendConnectionRequest({
        sender: { ...normalizeUser(currentUser.uid, { name: currentUser.displayName, photoURL: currentUser.photoURL }) },
        receiver: user,
      });
      Alert.alert('Request sent', 'Your connection request has been sent.');
    } catch (error) {
      console.error('Connection request failed:', error);
      Alert.alert('Error', 'Could not send the connection request.');
    }
  };

  const handleRequest = async (request, accept) => {
    try {
      if (accept) await acceptConnectionRequest(request);
      else await declineConnectionRequest(request);
    } catch (error) {
      console.error('Connection request update failed:', error);
      Alert.alert('Error', 'Could not update this request.');
    }
  };

  const openQr = (mode = 'my_code') => {
    setQrMode(mode);
    setScanned(false);
    setQrVisible(true);
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission required', 'Camera access is needed to scan QR codes.');
        return;
      }
    }
    openQr('scan');
  };

  const handleScan = async ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);
    try {
      // Accept both the raw Firebase UID and a shared WeConnect deep link.
      const raw = String(data).trim();
      const match = raw.match(/^weconnect:\/\/profile\/([^/?#]+)/i);
      const uid = match ? match[1] : raw;
      const profile = await getUserProfile(uid);
      setQrVisible(false);
      if (!profile) {
        Alert.alert('User not found', 'That QR code does not belong to a WeConnect profile.');
        return;
      }
      openProfile(navigation, { uid: profile.uid, name: profile.name, avatar: profile.avatar });
    } catch (error) {
      console.error('QR scan failed:', error);
      setQrVisible(false);
      Alert.alert('Error', 'Could not load that profile.');
    } finally {
      setScanned(false);
    }
  };

  const shareQr = async () => {
    try {
      const profileUrl = 'weconnect://profile/' + currentUser.uid;
      await Share.share({
        title: 'My WeConnect Profile',
        message: 'Add me on WeConnect! Open my profile in WeConnect: ' + profileUrl,
        url: profileUrl,
      });
    } catch (error) {
      if (error?.message) console.log(error.message);
    }
  };

  const renderItem = ({ item }) => {
    if (activeTab === 'requests') {
      const request = requests.find((entry) => entry.senderId === item.uid);
      return (
        <View style={styles.card}>
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
          <View style={styles.cardInfo}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{item.handle || 'Pending request'}</Text>
          </View>
          <TouchableOpacity style={styles.decline} onPress={() => request && handleRequest(request, false)}>
            <X size={19} color="#FF3B30" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.accept} onPress={() => request && handleRequest(request, true)}>
            <Check size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => openProfile(navigation, { uid: item.uid })}>
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardInfo} onPress={() => openProfile(navigation, { uid: item.uid })}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{activeTab === 'network' ? item.location : (item.bio || item.handle || 'Student')}</Text>
          {activeTab === 'network' && <Text style={styles.location}>{item.locationIcon} {item.location}</Text>}
        </TouchableOpacity>
        {activeTab === 'network' ? (
          <>
            <TouchableOpacity style={styles.wave} onPress={() => Alert.alert('Wave sent', '👋 ' + item.name + ' will see your wave.')}>
              <Hand size={19} color="#FF9500" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chat} onPress={() => navigation.navigate('ChatRoom', { uid: item.uid, name: item.name, avatar: item.avatar })}>
              <MessageCircle size={19} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.connect} onPress={() => sendRequest(item)}>
            <UserPlus size={17} color="#007AFF" />
            <Text style={styles.connectText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Connect</Text>
        <TouchableOpacity style={styles.qrButton} onPress={() => openQr()}>
          <ScanLine size={22} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>WHERE ARE YOU?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locationRow}>
        {LOCATIONS.map(([name, icon, color]) => (
          <TouchableOpacity
            key={name}
            style={[styles.locationChip, myLocation === name && styles.locationChipActive]}
            onPress={() => updateLocation(name, icon)}
          >
            <Text style={[styles.locationText, myLocation === name && styles.locationTextActive]}>{icon} {name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.locationChip} onPress={customLocation}><Text style={styles.locationText}>✏️ Custom</Text></TouchableOpacity>
      </ScrollView>

      <View style={styles.search}>
        <Search size={18} color="#888" />
        <TextInput style={styles.searchInput} placeholder="Search students..." placeholderTextColor="#888" value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      <View style={styles.tabs}>
        {[
          ['discover', 'Discover'],
          ['network', 'My Network'],
          ['requests', 'Requests' + (requests.length ? ' (' + requests.length + ')' : '')],
        ].map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.tab, activeTab === key && styles.activeTab]} onPress={() => setActiveTab(key)}>
            <Text style={[styles.tabText, activeTab === key && styles.activeTabText]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {loading ? <ActivityIndicator size="large" color="#007AFF" /> : (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.uid}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <UserCheck size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>Nothing to see here</Text>
                <Text style={styles.emptyText}>{activeTab === 'requests' ? 'No pending requests.' : 'Try searching for a classmate.'}</Text>
              </View>
            }
          />
        )}
      </View>

      <Modal visible={qrVisible} animationType="slide" onRequestClose={() => setQrVisible(false)}>
        <NativeSafeAreaView style={styles.qrModal}>
          <View style={styles.qrHeader}>
            <TouchableOpacity onPress={() => setQrVisible(false)}><X size={28} color="#000" /></TouchableOpacity>
            <Text style={styles.qrTitle}>Connect via QR</Text>
            <TouchableOpacity onPress={shareQr}><Share2 size={22} color="#007AFF" /></TouchableOpacity>
          </View>

          <View style={styles.qrTabs}>
            <TouchableOpacity style={[styles.qrTab, qrMode === 'my_code' && styles.qrTabActive]} onPress={() => setQrMode('my_code')}>
              <QrIcon size={18} color={qrMode === 'my_code' ? '#fff' : '#64748b'} />
              <Text style={[styles.qrTabText, qrMode === 'my_code' && styles.qrTabTextActive]}>My Code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.qrTab, qrMode === 'scan' && styles.qrTabActive]} onPress={openScanner}>
              <ScanLine size={18} color={qrMode === 'scan' ? '#fff' : '#64748b'} />
              <Text style={[styles.qrTabText, qrMode === 'scan' && styles.qrTabTextActive]}>Scan</Text>
            </TouchableOpacity>
          </View>

          {qrMode === 'my_code' ? (
            <View style={styles.qrCard}>
              <Image source={{ uri: currentUser?.photoURL || 'https://via.placeholder.com/150' }} style={styles.qrAvatar} />
              <Text style={styles.qrName}>{currentUser?.displayName || 'Student'}</Text>
              <QRCode value={currentUser?.uid || 'weconnect'} size={190} />
              <Text style={styles.qrHint}>Let a classmate scan this code to open your profile.</Text>
            </View>
          ) : (
            <View style={styles.scanner}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={scanned ? undefined : handleScan}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              />
              {scanned && <View style={styles.scanOverlay}><ActivityIndicator color="#fff" size="large" /><Text style={styles.scanText}>Opening profile…</Text></View>}
            </View>
          )}
        </NativeSafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  qrButton: { backgroundColor: '#f1f5f9', padding: 9, borderRadius: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#94a3b8', paddingHorizontal: 20, marginBottom: 8 },
  locationRow: { paddingHorizontal: 15, gap: 8, paddingBottom: 12 },
  locationChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  locationText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  locationChipActive: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  locationTextActive: { color: '#007AFF' },
  search: { margin: 15, marginTop: 5, height: 46, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, backgroundColor: '#f8fafc', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, color: '#0f172a', fontSize: 15 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  activeTabText: { color: '#0f172a', fontWeight: '800' },
  content: { flex: 1, backgroundColor: '#f8fafc' },
  list: { padding: 15, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e2e8f0', marginRight: 13 },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#64748b', fontSize: 13, marginTop: 3 },
  location: { color: '#007AFF', fontSize: 12, marginTop: 3, fontWeight: '600' },
  connect: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f4fe', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, gap: 5 },
  connectText: { color: '#007AFF', fontWeight: '700' },
  wave: { padding: 9, backgroundColor: '#fffbeb', borderRadius: 12, marginRight: 6 },
  chat: { padding: 10, backgroundColor: '#007AFF', borderRadius: 13 },
  decline: { padding: 9, backgroundColor: '#ffebeb', borderRadius: 13, marginRight: 6 },
  accept: { padding: 9, backgroundColor: '#34C759', borderRadius: 13 },
  empty: { alignItems: 'center', paddingTop: 70 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#334155', marginTop: 12 },
  emptyText: { color: '#94a3b8', marginTop: 5 },
  qrModal: { flex: 1, backgroundColor: '#f8fafc' },
  qrHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, backgroundColor: '#fff' },
  qrTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  qrTabs: { flexDirection: 'row', margin: 20, backgroundColor: '#e2e8f0', padding: 4, borderRadius: 12 },
  qrTab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 10, borderRadius: 9 },
  qrTabActive: { backgroundColor: '#0f172a' },
  qrTabText: { color: '#64748b', fontWeight: '700' },
  qrTabTextActive: { color: '#fff' },
  qrCard: { margin: 20, padding: 30, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', gap: 14 },
  qrAvatar: { width: 76, height: 76, borderRadius: 38 },
  qrName: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  qrHint: { textAlign: 'center', color: '#64748b', lineHeight: 20 },
  scanner: { margin: 20, flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  scanOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.65)', alignItems: 'center', justifyContent: 'center' },
  scanText: { color: '#fff', marginTop: 10 },
});

export default ConnectScreen;
