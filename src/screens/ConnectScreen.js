import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, BackHandler, FlatList, Image, Modal, Platform,
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
import * as ImagePicker from 'expo-image-picker';
import { collection, onSnapshot, doc, updateDoc, query, where } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { acceptConnectionRequest, connectUsersViaQr, declineConnectionRequest, sendConnectionRequest, subscribeToConnectionRequests } from '../services/connectionService';
import { getUserProfile, normalizeUser } from '../services/userService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { openProfile } from '../navigation/navigationHelpers';

const LOCATIONS = [
  ['Library', '📚', '#111111'],
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
  const [myLocationIcon, setMyLocationIcon] = useState('📍');
  const [myLocationPhoto, setMyLocationPhoto] = useState('');
  const [uploadingLocationPhoto, setUploadingLocationPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrMode, setQrMode] = useState('my_code');
  const [scanned, setScanned] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [locationPreview, setLocationPreview] = useState(null);
  const [customLocationVisible, setCustomLocationVisible] = useState(false);
  const [customLocationText, setCustomLocationText] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (scannerVisible) {
          setScannerVisible(false);
          setScanned(false);
          setScanSuccess(false);
          return true;
        }
        if (qrVisible) {
          setQrVisible(false);
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [qrVisible, scannerVisible])
  );

  useEffect(() => {
    if (!currentUser) return undefined;
    let unsubscribe = null;
    let active = true;

    const subscribeToCampusUsers = async () => {
      try {
        const meProfile = await getUserProfile(currentUser.uid);
        if (!meProfile?.collegeId) {
          if (active) setLoading(false);
          return;
        }

        const usersQuery = query(collection(db, 'users'), where('collegeId', '==', meProfile.collegeId));
        unsubscribe = onSnapshot(usersQuery, (snapshot) => {
          const next = snapshot.docs
            .filter((item) => item.id !== currentUser.uid)
            .map((item) => normalizeUser(item.id, item.data()));
          const me = snapshot.docs.find((item) => item.id === currentUser.uid);
          if (me?.data()?.location) setMyLocation(me.data().location);
          if (me?.data()?.locationIcon) setMyLocationIcon(me.data().locationIcon);
          if (me?.data()?.locationPhoto) setMyLocationPhoto(me.data().locationPhoto);
          setUsers(next);
          setLoading(false);
        }, (error) => {
          console.error('Campus users subscription failed:', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('Could not load campus profile:', error);
        if (active) setLoading(false);
      }
    };

    subscribeToCampusUsers();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
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

  const updateLocation = async (name, icon, locationPhoto = myLocationPhoto) => {
    setMyLocation(name);
    setMyLocationIcon(icon);
    if (locationPhoto !== undefined) setMyLocationPhoto(locationPhoto);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        location: name,
        locationIcon: icon,
        locationPhoto: locationPhoto || '',
      });
    } catch (error) {
      console.error('Location update failed:', error);
      Alert.alert('Error', 'Could not update your location.');
    }
  };

  const pickLocationPhoto = async () => {
    if (!currentUser) return;
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission required', 'Photo library access is needed to add a location photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingLocationPhoto(true);
      const url = await uploadToCloudinary(result.assets[0].uri, 'image');
      if (!url) throw new Error('Upload failed.');

      await updateDoc(doc(db, 'users', currentUser.uid), {
        locationPhoto: url,
      });
      setMyLocationPhoto(url);
    } catch (error) {
      console.error('Location photo update failed:', error);
      Alert.alert('Error', 'Could not upload that location photo.');
    } finally {
      setUploadingLocationPhoto(false);
    }
  };

  const removeLocationPhoto = async () => {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { locationPhoto: '' });
      setMyLocationPhoto('');
    } catch (error) {
      console.error('Location photo removal failed:', error);
    }
  };

  const customLocation = () => {
    setCustomLocationText(myLocation && !LOCATIONS.some(([name]) => name === myLocation) ? myLocation : '');
    setCustomLocationVisible(true);
  };

  const saveCustomLocation = async () => {
    const value = customLocationText.trim();
    if (!value) {
      Alert.alert('Custom location', 'Please enter a location.');
      return;
    }
    await updateLocation(value, '📍');
    setCustomLocationVisible(false);
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

  const openQr = () => {
    setQrMode('my_code');
    setScanned(false);
    setScanSuccess(false);
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

    setScanned(false);
    setScanSuccess(false);
    setScannerVisible(true);
  };

  const handleScan = useCallback(async ({ data }) => {
    if (scanned || scanSuccess || !data) return;
    setScanned(true);
    try {
      const raw = String(data).trim();
      const match = raw.match(/^weconnect:\/\/profile\/([^/?#]+)/i);
      const uid = match ? match[1] : raw;
      const profile = await getUserProfile(uid);
      if (!profile) throw new Error('User not found');
      if (profile.uid === currentUser?.uid) throw new Error('You cannot connect with yourself.');
      await connectUsersViaQr(currentUser.uid, profile.uid);

      setScannerVisible(false);
      setScanned(false);
      setScanSuccess(false);
      openProfile(navigation, { uid: profile.uid, name: profile.name, avatar: profile.avatar });
    } catch (error) {
      console.error('QR scan failed:', error);
      setScanned(false);
      Alert.alert('Scan failed', error?.message === 'User not found' ? 'That QR code does not belong to a WeConnect profile.' : (error?.message || 'Could not connect this profile.'));
    }
  }, [scanned, scanSuccess, currentUser, navigation]);

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
    if (!item?.uid) return null;

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
            <Check size={18} color="#111111" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => item.uid && openProfile(navigation, { uid: item.uid })}>
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardInfo} onPress={() => item.uid && openProfile(navigation, { uid: item.uid })}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{activeTab === 'network' ? item.location : (item.bio || item.handle || 'Student')}</Text>
          {activeTab === 'network' && (
            <TouchableOpacity style={styles.locationPreviewRow} onPress={() => setLocationPreview(item)} activeOpacity={0.8}>
              {item.locationPhoto ? <Image source={{ uri: item.locationPhoto }} style={styles.networkLocationThumb} /> : <Text style={styles.locationIcon}>{item.locationIcon}</Text>}
              <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
              {item.locationPhoto ? <Text style={styles.viewLocationText}>View</Text> : null}
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {activeTab === 'network' ? (
          <>
            <TouchableOpacity style={styles.wave} onPress={() => Alert.alert('Wave sent', '👋 ' + item.name + ' will see your wave.')} accessibilityLabel="Wave">
              <Hand size={19} color="#FF9500" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chat} onPress={() => navigation.navigate('ChatRoom', { uid: item.uid, name: item.name, avatar: item.avatar })} accessibilityLabel="Chat">
              <MessageCircle size={19} color="#111111" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.connect} onPress={() => sendRequest(item)} accessibilityLabel="Connect">
            <UserPlus size={17} color="#111111" />
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
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.qrButton} onPress={openQr} accessibilityLabel="Show my QR code">
            <QrIcon size={22} color="#111111" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.qrButton} onPress={openScanner} accessibilityLabel="Scan QR code">
            <ScanLine size={22} color="#111111" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionLabel}>WHERE ARE YOU?</Text>
      <View style={styles.locationViewport}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.locationRow}
        >
          {[...LOCATIONS, ['Custom', '✏️', '#111111']].map(([name, icon]) => (
            <TouchableOpacity
              key={name}
              style={[styles.locationCard, name !== 'Custom' && myLocation === name && styles.locationCardActive]}
              onPress={() => name === 'Custom' ? customLocation() : updateLocation(name, icon)}
              activeOpacity={0.85}
            >
              {name !== 'Custom' && myLocationPhoto && myLocation === name ? (
                <Image source={{ uri: myLocationPhoto }} style={styles.locationCardPhoto} />
              ) : (
                <View style={styles.locationCardIconWrap}>
                  <Text style={styles.locationCardIcon}>{icon}</Text>
                </View>
              )}
              <Text style={[styles.locationCardName, name !== 'Custom' && myLocation === name && styles.locationCardNameActive]} numberOfLines={1}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {myLocation ? (
        <View style={styles.locationStatusRow}>
          <View style={styles.locationStatusLeft}>
            <Text style={styles.locationStatusIcon}>{myLocationIcon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationStatusTitle}>You're at {myLocation}</Text>
              <Text style={styles.locationStatusSub}>Share a quick photo so friends can see your spot.</Text>
            </View>
          </View>
          <View style={styles.locationPhotoActions}>
            <TouchableOpacity style={styles.locationPhotoButton} onPress={pickLocationPhoto} disabled={uploadingLocationPhoto}>
              {uploadingLocationPhoto ? <ActivityIndicator size="small" color="#111111" /> : <Text style={styles.locationPhotoButtonText}>{myLocationPhoto ? 'Change' : 'Add photo'}</Text>}
            </TouchableOpacity>
            {myLocationPhoto ? (
              <TouchableOpacity style={styles.locationPhotoRemove} onPress={removeLocationPhoto}>
                <Text style={styles.locationPhotoRemoveText}>×</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <Modal visible={customLocationVisible} transparent animationType="fade" onRequestClose={() => setCustomLocationVisible(false)}>
        <View style={styles.customLocationOverlay}>
          <View style={styles.customLocationCard}>
            <View style={styles.customLocationHeader}>
              <View>
                <Text style={styles.customLocationTitle}>Set custom location</Text>
                <Text style={styles.customLocationHint}>Tell your campus where you are.</Text>
              </View>
              <TouchableOpacity onPress={() => setCustomLocationVisible(false)}>
                <X size={20} color="#111111" />
              </TouchableOpacity>
            </View>
            <TextInput autoFocus value={customLocationText} onChangeText={setCustomLocationText} placeholder="e.g. Block A, Room 204" placeholderTextColor="#999999" style={styles.customLocationInput} maxLength={60} returnKeyType="done" onSubmitEditing={saveCustomLocation} />
            <TouchableOpacity style={styles.customLocationSave} onPress={saveCustomLocation}>
              <Text style={styles.customLocationSaveText}>Save location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
        {loading ? <ActivityIndicator size="large" color="#111111" /> : (
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

      <Modal visible={!!locationPreview} transparent animationType="fade" onRequestClose={() => setLocationPreview(null)}>
        <View style={styles.locationModalOverlay}>
          <TouchableOpacity style={styles.locationModalBackdrop} activeOpacity={1} onPress={() => setLocationPreview(null)} />
          <View style={styles.locationModalCard}>
            <View style={styles.locationModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationModalTitle}>{locationPreview?.name || 'Location'}</Text>
                <Text style={styles.locationModalSubtitle}>{locationPreview?.locationIcon} {locationPreview?.location || 'Campus'}</Text>
              </View>
              <TouchableOpacity onPress={() => setLocationPreview(null)}><X size={22} color="#111111" /></TouchableOpacity>
            </View>
            {locationPreview?.locationPhoto ? (
              <Image source={{ uri: locationPreview.locationPhoto }} style={styles.locationModalImage} />
            ) : (
              <View style={styles.locationModalEmpty}><Text style={{ fontSize: 48 }}>{locationPreview?.locationIcon || '📍'}</Text><Text style={styles.locationModalEmptyText}>No location photo shared</Text></View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={() => {
          setScannerVisible(false);
          setScanned(false);
          setScanSuccess(false);
        }}
      >
        <SafeAreaView style={styles.scannerScreen} edges={['top', 'bottom']}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setScannerVisible(false)} accessibilityLabel="Close QR scanner">
              <X size={28} color="#111111" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan QR Code</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.scannerCameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              ratio="16:9"
              mode="picture"
              autofocus="on"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onCameraReady={() => console.log('QR camera preview ready')}
              onMountError={(error) => {
                console.error('QR camera mount failed:', error);
                Alert.alert('Camera unavailable', error?.message || 'Could not start the camera preview.');
              }}
              onBarcodeScanned={scanned ? undefined : handleScan}
            />
            <View pointerEvents="none" style={styles.scannerFrame}>
              <View style={styles.scannerCorner} />
            </View>
            <View pointerEvents="none" style={styles.scannerHintPill}>
              <Text style={styles.scannerHintText}>Point your camera at a WeConnect QR code</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={qrVisible}
        animationType="slide"
        hardwareAccelerated={Platform.OS === 'android'}
        onRequestClose={() => setQrVisible(false)}
      >
        <SafeAreaView style={styles.qrModal} edges={['top', 'bottom']}>
          <View style={styles.qrHeader}>
            <TouchableOpacity onPress={() => setQrVisible(false)}><X size={28} color="#000" /></TouchableOpacity>
            <Text style={styles.qrTitle}>Connect via QR</Text>
            <TouchableOpacity onPress={shareQr}><Share2 size={22} color="#111111" /></TouchableOpacity>
          </View>

          <View style={styles.qrCard}>
            <Image source={{ uri: currentUser?.photoURL || 'https://via.placeholder.com/150' }} style={styles.qrAvatar} />
            <Text style={styles.qrName}>{currentUser?.displayName || 'Student'}</Text>
            <QRCode value={currentUser?.uid ? 'weconnect://profile/' + currentUser.uid : 'weconnect'} size={190} backgroundColor="#FFFFFF" color="#111111" />
            <Text style={styles.qrHint}>Let a classmate scan this code to open your profile.</Text>
            <TouchableOpacity style={styles.nativeScannerButton} onPress={openScanner} activeOpacity={0.85}>
              <ScanLine size={19} color="#111111" />
              <Text style={styles.nativeScannerButtonText}>Scan a QR Code</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#111111' },
  qrActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrButton: { backgroundColor: '#F0F0EC', padding: 9, borderRadius: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#999999', paddingHorizontal: 20, marginBottom: 8 },
  locationViewport: { height: 92, flexGrow: 0, flexShrink: 0, width: '100%' },
  locationRow: { paddingHorizontal: 15, alignItems: 'flex-start', height: 92, gap: 8 },
  customLocationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  customLocationCard: { width: '100%', borderRadius: 22, backgroundColor: '#FFFFFF', padding: 18 },
  customLocationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  customLocationTitle: { fontSize: 18, fontWeight: '900', color: '#111111' },
  customLocationHint: { marginTop: 3, fontSize: 11, color: '#777770' },
  customLocationInput: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#E4E4DE', backgroundColor: '#F7F7F5', paddingHorizontal: 14, color: '#111111', fontSize: 14 },
  customLocationSave: { marginTop: 12, minHeight: 48, borderRadius: 15, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  customLocationSaveText: { color: '#111111', fontSize: 13, fontWeight: '900' },
  search: { margin: 15, marginTop: 5, height: 46, borderWidth: 1, borderColor: '#E8E8E3', borderRadius: 12, backgroundColor: '#F7F7F5', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, color: '#111111', fontSize: 15 },
  tabs: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#F0F0EC', borderRadius: 12, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  activeTab: { backgroundColor: '#fff' },
  tabText: { color: '#707070', fontWeight: '600', fontSize: 13 },
  activeTabText: { color: '#111111', fontWeight: '800' },

  locationCard: { width: 78, height: 86, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E3', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginRight: 2, overflow: 'hidden' },
  locationCardActive: { backgroundColor: '#FFFC00', borderColor: '#111111' },
  locationCardIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F5' },
  locationCardIcon: { fontSize: 25 },
  locationCardPhoto: { width: 48, height: 48, borderRadius: 14 },
  locationCardName: { fontSize: 11, fontWeight: '800', color: '#111111', maxWidth: 64, textAlign: 'center' },
  locationCardNameActive: { color: '#111111' },
  locationStatusRow: { marginHorizontal: 15, marginBottom: 10, padding: 10, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E8E3', flexDirection: 'row', alignItems: 'center' },
  locationStatusLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  locationStatusIcon: { fontSize: 20, marginRight: 9 },
  locationStatusTitle: { fontSize: 13, fontWeight: '800', color: '#111111' },
  locationStatusSub: { fontSize: 10, color: '#707070', marginTop: 2 },
  locationPhotoActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  locationPhotoButton: { backgroundColor: '#FFFC00', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, minWidth: 62, alignItems: 'center' },
  locationPhotoButtonText: { color: '#111111', fontSize: 11, fontWeight: '800' },
  locationPhotoRemove: { marginLeft: 5, width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F0EC', alignItems: 'center', justifyContent: 'center' },
  locationPhotoRemoveText: { color: '#707070', fontSize: 18, lineHeight: 18 },
  content: { flex: 1, backgroundColor: '#F7F7F5' },
  list: { padding: 15, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#E8E8E3' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E8E8E3', marginRight: 13 },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#111111' },
  meta: { color: '#707070', fontSize: 13, marginTop: 3 },
  locationPreviewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  networkLocationThumb: { width: 34, height: 34, borderRadius: 9, marginRight: 7 },
  locationIcon: { fontSize: 18, marginRight: 6 },
  location: { color: '#111111', fontSize: 12, fontWeight: '700', flex: 1 },
  viewLocationText: { color: '#707070', fontSize: 10, fontWeight: '800', marginLeft: 5 },
  connect: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFC00', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, gap: 5 },
  connectText: { color: '#111111', fontWeight: '700' },
  wave: { padding: 9, backgroundColor: '#fffbeb', borderRadius: 12, marginRight: 6 },
  chat: { padding: 10, backgroundColor: '#FFFC00', borderRadius: 13 },
  decline: { padding: 9, backgroundColor: '#ffebeb', borderRadius: 13, marginRight: 6 },
  accept: { padding: 9, backgroundColor: '#34C759', borderRadius: 13 },
  empty: { alignItems: 'center', paddingTop: 70 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#334155', marginTop: 12 },
  emptyText: { color: '#999999', marginTop: 5 },
  locationModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  locationModalBackdrop: { ...StyleSheet.absoluteFillObject },
  locationModalCard: { backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden' },
  locationModalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  locationModalTitle: { fontSize: 18, fontWeight: '900', color: '#111111' },
  locationModalSubtitle: { fontSize: 13, color: '#707070', marginTop: 3, fontWeight: '600' },
  locationModalImage: { width: '100%', height: 300, backgroundColor: '#F0F0EC' },
  locationModalEmpty: { height: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F5' },
  locationModalEmptyText: { color: '#707070', marginTop: 10 },
  scannerScreen: { flex: 1, backgroundColor: '#000' },
  scannerHeader: { height: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff' },
  scannerTitle: { fontSize: 18, fontWeight: '900', color: '#111111' },
  scannerCameraWrap: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#000' },
  scannerFrame: { position: 'absolute', left: '15%', right: '15%', top: '28%', aspectRatio: 1, borderWidth: 2, borderColor: '#FFFC00', borderRadius: 24 },
  scannerCorner: { position: 'absolute', width: 28, height: 28, borderLeftWidth: 4, borderTopWidth: 4, borderColor: '#FFFC00', top: -2, left: -2, borderTopLeftRadius: 12 },
  scannerHintPill: { position: 'absolute', bottom: 44, left: 24, right: 24, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.68)', alignItems: 'center' },
  scannerHintText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  qrModal: { flex: 1, backgroundColor: '#F7F7F5' },
  qrHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, backgroundColor: '#fff' },
  qrTitle: { fontSize: 18, fontWeight: '800', color: '#111111' },
  qrCard: { margin: 20, padding: 30, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', gap: 14 },
  qrAvatar: { width: 76, height: 76, borderRadius: 38 },
  qrName: { fontSize: 22, fontWeight: '800', color: '#111111' },
  qrHint: { textAlign: 'center', color: '#707070', lineHeight: 20 },
  nativeScannerButton: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFC00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  nativeScannerButtonText: { color: '#111111', fontWeight: '900' },
});

export default ConnectScreen;
