import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Image, TextInput, StatusBar, Modal, ActivityIndicator, 
  ScrollView, Dimensions, Alert, Share, BackHandler
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { 
  Search, MapPin, UserPlus, UserCheck, UserX, 
  MessageCircle, QrCode as QrIcon, ScanLine, Share2, Hand, X, Check
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';

// Firebase & Utils
import { auth, db } from '../config/firebase';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, setDoc, where, getDoc } from 'firebase/firestore';

const { width } = Dimensions.get('window');

const CAMPUS_LOCATIONS = [
  { id: '1', name: 'Library', icon: '📚', color: '#007AFF' },
  { id: '2', name: 'Canteen', icon: '🍔', color: '#FF9500' },
  { id: '3', name: 'Hostel', icon: '🛏️', color: '#AF52DE' },
  { id: '4', name: 'Ground', icon: '⚽', color: '#34C759' },
  { id: '5', name: 'CS Lab', icon: '💻', color: '#5856D6' },
  { id: '6', name: 'Outside', icon: '🚶', color: '#FF3B30' },
];

const ConnectScreen = ({ navigation }) => {
  const currentUser = auth.currentUser;

  // View States
  const [activeTab, setActiveTab] = useState('discover'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [myLocation, setMyLocation] = useState('Classroom');
  
  // Data States
  const [network, setNetwork] = useState([]);
  const [requests, setRequests] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [loading, setLoading] = useState(true);

  // QR Modal & Camera States
  const [isQrModalVisible, setQrModalVisible] = useState(false);
  const [qrMode, setQrMode] = useState('my_code'); 
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // --- HARDWARE BACK BUTTON INTERCEPTOR ---
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isQrModalVisible) {
          setQrModalVisible(false); // Close the modal instead of crashing
          return true; // We handled it
        }
        return false; // Let default navigation happen
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove(); 
    }, [isQrModalVisible]) 
  );

  // --- 1. FETCH LIVE USERS (DISCOVER) ---
  useEffect(() => {
    if (!currentUser) return;

    // Listen for changes in the 'users' collection to populate Discover
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Don't show myself in the Discover tab
        if (doc.id !== currentUser.uid) {
          allUsers.push({
            uid: doc.id,
            name: data.displayName || data.name || 'Student',
            avatar: data.photoURL || data.avatar || 'https://via.placeholder.com/150',
            major: data.bio?.substring(0, 30) || 'Student',
            location: data.location || 'Campus',
            locationIcon: data.locationIcon || '📍'
          });
        }
        
        // If the doc IS the current user, set their location
        if (doc.id === currentUser.uid && data.location) {
           setMyLocation(data.location);
        }
      });
      setDiscover(allUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // --- ACTIONS ---
  const updateLocation = async (loc) => {
    setMyLocation(loc.name);
    if(currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), { 
          location: loc.name, 
          locationIcon: loc.icon 
        });
      } catch (error) {
        console.log("Error updating location", error);
      }
    }
  };

  const handleCustomLocation = () => {
    Alert.prompt("Custom Location", "Where are you?", [
      { text: "Cancel", style: "cancel" },
      { text: "Update", onPress: (text) => updateLocation({ name: text, icon: '📍' }) }
    ]);
  };

  const handleWave = (user) => {
    Alert.alert("Wave Sent! 👋", `You waved at ${user.name}.`);
  };

  const handleConnect = (user) => {
    Alert.alert("Request Sent", `Connection request sent to ${user.name}.`);
  };

  // --- QR & SCANNER LOGIC ---
  const handleShareQR = async () => {
    try {
      const profileLink = `weconnect://profile/${currentUser.uid}`;
      await Share.share({
        message: `Add me on WeConnect! Scan my QR or tap this link: ${profileLink}`,
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true);
    
    if (data && data.length > 10) {
      setQrModalVisible(false); // Close modal automatically
      
      try {
        const userDoc = await getDoc(doc(db, 'users', data));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          navigation.navigate('Profile', { 
            uid: data, 
            name: userData.displayName || userData.name || 'Student', 
            avatar: userData.photoURL || userData.avatar || 'https://via.placeholder.com/150' 
          });
        } else {
           Alert.alert("User Not Found", "This QR code does not match any active WeConnect student.");
           setTimeout(() => setScanned(false), 2000);
        }
      } catch (error) {
         Alert.alert("Error", "Could not load user profile.");
         setTimeout(() => setScanned(false), 2000);
      }
    } else {
      Alert.alert("Invalid Code", "This is not a valid WeConnect profile code.");
      setTimeout(() => setScanned(false), 2000);
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return Alert.alert("Permission Required", "We need camera access to scan QR codes.");
    }
    setScanned(false);
    setQrMode('scan');
  };

  // --- RENDERERS ---
  const renderNetworkItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => navigation.navigate('Profile', { uid: item.uid, name: item.name, avatar: item.avatar })}>
      <Image source={{ uri: item.avatar }} style={styles.avatar} />
      <View style={styles.cardInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <View style={styles.locationBadge}>
          <Text style={styles.locationBadgeText}>{item.locationIcon} {item.location}</Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => handleWave(item)}><Hand size={22} color="#FF9500" /></TouchableOpacity>
        <TouchableOpacity style={styles.primaryIconBtn} onPress={() => navigation.navigate('ChatRoom', { uid: item.uid, name: item.name, avatar: item.avatar })}><MessageCircle size={20} color="#fff" /></TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderRequestItem = ({ item }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.avatar }} style={styles.avatar} />
      <View style={styles.cardInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.subText}>Pending Request</Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.declineBtn}><X size={20} color="#FF3B30" /></TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn}><Check size={20} color="#fff" /><Text style={styles.acceptBtnText}>Accept</Text></TouchableOpacity>
      </View>
    </View>
  );

  const renderDiscoverItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Profile', { uid: item.uid, name: item.name, avatar: item.avatar })}>
      <Image source={{ uri: item.avatar }} style={styles.avatar} />
      <View style={styles.cardInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.subText}>{item.major || 'Student'}</Text>
      </View>
      <TouchableOpacity style={styles.connectBtn} onPress={() => handleConnect(item)}>
        <UserPlus size={18} color="#007AFF" />
        <Text style={styles.connectBtnText}>Connect</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Data Selector
  let currentData = network;
  let currentRenderer = renderNetworkItem;
  if (activeTab === 'requests') { currentData = requests; currentRenderer = renderRequestItem; }
  if (activeTab === 'discover') { currentData = discover; currentRenderer = renderDiscoverItem; }

  if (searchQuery.trim() !== '') {
    currentData = currentData.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.qrBtn} onPress={() => { setQrMode('my_code'); setQrModalVisible(true); }}>
            <ScanLine size={22} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* LIVE STATUS WIDGET */}
      <View style={styles.statusWidget}>
        <Text style={styles.statusTitle}>Where are you right now?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusScroll}>
          {CAMPUS_LOCATIONS.map(loc => (
            <TouchableOpacity key={loc.id} style={[styles.statusChip, myLocation === loc.name && {backgroundColor: loc.color, borderColor: loc.color}]} onPress={() => updateLocation(loc)}>
              <Text style={[styles.statusChipText, myLocation === loc.name && {color: '#fff'}]}>{loc.icon} {loc.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.statusChip} onPress={handleCustomLocation}>
            <Text style={styles.statusChipText}>✏️ Custom...</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#888" style={styles.searchIcon} />
          <TextInput style={styles.searchInput} placeholder="Search students..." placeholderTextColor="#888" value={searchQuery} onChangeText={setSearchQuery} />
        </View>
      </View>

      {/* SEGMENTED TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'discover' && styles.activeTabBtn]} onPress={() => setActiveTab('discover')}>
          <Text style={[styles.tabText, activeTab === 'discover' && styles.activeTabText]}>Discover</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'network' && styles.activeTabBtn]} onPress={() => setActiveTab('network')}>
          <Text style={[styles.tabText, activeTab === 'network' && styles.activeTabText]}>My Network</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'requests' && styles.activeTabBtn]} onPress={() => setActiveTab('requests')}>
          <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>Requests {requests.length > 0 && `(${requests.length})`}</Text>
        </TouchableOpacity>
      </View>

      {/* MAIN LIST */}
      <View style={styles.contentArea}>
        {loading ? (
           <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 50}} />
        ) : (
          <FlatList
            data={currentData}
            keyExtractor={item => item.uid}
            renderItem={currentRenderer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <UserCheck size={48} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>Nothing to see here</Text>
                <Text style={styles.emptyStateSub}>Try searching for friends to add.</Text>
              </View>
            }
          />
        )}
      </View>

      {/* --- REAL QR / SCANNER MODAL --- */}
      <Modal 
        visible={isQrModalVisible} 
        animationType="slide" 
        presentationStyle="pageSheet"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setQrModalVisible(false)}><X size={28} color="#000" /></TouchableOpacity>
            <Text style={styles.modalTitle}>Connect via QR</Text>
            <TouchableOpacity onPress={handleShareQR}><Share2 size={24} color="#007AFF" /></TouchableOpacity>
          </View>

          <View style={styles.qrTabs}>
            <TouchableOpacity style={[styles.qrTab, qrMode === 'my_code' && styles.qrTabActive]} onPress={() => setQrMode('my_code')}>
              <QrIcon size={18} color={qrMode === 'my_code' ? "#fff" : "#64748b"} />
              <Text style={[styles.qrTabText, qrMode === 'my_code' && styles.qrTabTextActive]}>My Code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.qrTab, qrMode === 'scan' && styles.qrTabActive]} onPress={openScanner}>
              <ScanLine size={18} color={qrMode === 'scan' ? "#fff" : "#64748b"} />
              <Text style={[styles.qrTabText, qrMode === 'scan' && styles.qrTabTextActive]}>Scan Code</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.qrContentArea}>
            {qrMode === 'my_code' ? (
              // REAL QR CODE GENERATION
              <View style={styles.myQrBox}>
                <Image source={{ uri: currentUser?.photoURL || 'https://via.placeholder.com/150' }} style={styles.qrAvatar} />
                <Text style={styles.qrName}>{currentUser?.displayName || 'Deepu Sharma'}</Text>
                <Text style={styles.qrHandle}>Student</Text>
                
                <View style={styles.qrPlaceholder}>
                  {currentUser?.uid ? (
                    <QRCode 
                      value={currentUser.uid} 
                      size={180} 
                      color="#0f172a" 
                      backgroundColor="transparent" 
                    />
                  ) : (
                    <ActivityIndicator color="#000" />
                  )}
                </View>
                <Text style={styles.qrHelperText}>Have a friend scan this code to connect instantly.</Text>
              </View>
            ) : (
              // REAL CAMERA SCANNER
              <View style={styles.scannerBox}>
                {!permission?.granted ? (
                   <View style={styles.cameraPlaceholder}>
                     <Text style={{color: '#fff'}}>Requesting camera permission...</Text>
                   </View>
                ) : (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      facing="back"
                      onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                      barcodeScannerSettings={{
                        barcodeTypes: ["qr"],
                      }}
                    />
                    
                    <View style={styles.cameraOverlay}>
                       <View style={[styles.scanCorner, styles.tl]} />
                       <View style={[styles.scanCorner, styles.tr]} />
                       <View style={[styles.scanCorner, styles.bl]} />
                       <View style={[styles.scanCorner, styles.br]} />
                    </View>
                  </>
                )}
                {scanned && <View style={styles.scanningOverlay}><ActivityIndicator size="large" color="#fff" /><Text style={{color:'#fff', marginTop:10}}>Finding Profile...</Text></View>}
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  qrBtn: { backgroundColor: '#f1f5f9', padding: 8, borderRadius: 12 },

  statusWidget: { paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  statusTitle: { fontSize: 13, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 10 },
  statusScroll: { paddingHorizontal: 15, gap: 8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  statusChipText: { fontSize: 14, fontWeight: '600', color: '#334155' },

  searchContainer: { paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 12, height: 45, borderWidth: 1, borderColor: '#e2e8f0' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a' },

  tabContainer: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 10 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  activeTabBtn: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  activeTabText: { color: '#0f172a', fontWeight: '700' },

  contentArea: { flex: 1, backgroundColor: '#f8fafc' },
  listContent: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 100 },
  
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 20, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e2e8f0', marginRight: 15 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  userName: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  subText: { fontSize: 13, color: '#64748b' },
  
  locationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f4fe', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  locationBadgeText: { fontSize: 11, fontWeight: '700', color: '#007AFF' },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 8, backgroundColor: '#fffbf0', borderRadius: 12 },
  primaryIconBtn: { padding: 10, backgroundColor: '#007AFF', borderRadius: 16 },
  declineBtn: { padding: 10, backgroundColor: '#FFEBEB', borderRadius: 16 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#34C759', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 },
  acceptBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 14 },
  connectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f4fe', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 },
  connectBtnText: { color: '#007AFF', fontWeight: 'bold', marginLeft: 6, fontSize: 14 },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyStateText: { marginTop: 15, fontSize: 18, color: '#0f172a', fontWeight: 'bold' },
  emptyStateSub: { marginTop: 5, fontSize: 14, color: '#64748b' },

  modalContainer: { flex: 1, backgroundColor: '#f8fafc' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15, backgroundColor: '#fff' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  
  qrTabs: { flexDirection: 'row', marginHorizontal: 40, marginTop: 20, backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4 },
  qrTab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10, gap: 8 },
  qrTabActive: { backgroundColor: '#0f172a' },
  qrTabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  qrTabTextActive: { color: '#fff' },

  qrContentArea: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  
  myQrBox: { backgroundColor: '#fff', width: '100%', padding: 30, borderRadius: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  qrAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 15, borderWidth: 4, borderColor: '#f8fafc' },
  qrName: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  qrHandle: { fontSize: 15, color: '#64748b', marginTop: 4, marginBottom: 30 },
  qrPlaceholder: { padding: 20, backgroundColor: '#fff', borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.1 },
  qrHelperText: { marginTop: 30, fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 20, lineHeight: 20 },

  scannerBox: { width: '100%', aspectRatio: 0.8, backgroundColor: '#000', borderRadius: 30, overflow: 'hidden', position: 'relative' },
  cameraPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  scanningOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  
  scanCorner: { position: 'absolute', width: 40, height: 40, borderColor: '#007AFF', borderWidth: 5 },
  tl: { top: 60, left: 60, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 20 },
  tr: { top: 60, right: 60, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 20 },
  bl: { bottom: 60, left: 60, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 20 },
  br: { bottom: 60, right: 60, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 20 },
});

export default ConnectScreen;