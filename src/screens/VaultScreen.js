import React, { useState, useEffect, useCallback } from 'react';
import { openProfile } from '../navigation/navigationHelpers';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  TextInput, StatusBar, LayoutAnimation, Modal, Alert, ActivityIndicator, Share, Linking, BackHandler
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { 
  Search, Plus, FileText, Image as ImageIcon, 
  FileArchive, Lock, Users, Download, MoreVertical, 
  Folder, UploadCloud, Link as LinkIcon, ChevronLeft, 
  X, Edit2, Trash2, FolderPlus, Key, ThumbsUp, CheckCircle 
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';

// Using the legacy import to prevent Expo SDK 54 deprecation crashes
import * as FileSystem from 'expo-file-system/legacy'; 
import * as Sharing from 'expo-sharing';

// Firebase & Utils
import { auth, db } from '../config/firebase';
import { collection, query, where, addDoc, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { getUserProfile } from '../services/userService';

const VaultScreen = ({ navigation }) => {
  const currentUser = auth.currentUser;

  // View States
  const [activeTab, setActiveTab] = useState('shared'); 
  const [currentVault, setCurrentVault] = useState(null); 
  const [searchQuery, setSearchQuery] = useState('');

  // Data States
  const [vaults, setVaults] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isVaultModalVisible, setVaultModalVisible] = useState(false);
  const [isJoinModalVisible, setJoinModalVisible] = useState(false);
  const [isRenameModalVisible, setRenameModalVisible] = useState(false); 
  
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultDesc, setNewVaultDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [renameInput, setRenameInput] = useState(''); 

  // Edit, Delete & Download Actions State
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null); 
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState(null);

  // --- 🛠️ FIXED: HARDWARE BACK BUTTON INTERCEPTOR ---
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (currentVault) {
          goBackToVaults();
          return true; // We handled it
        }
        return false; // Let default navigation happen
      };

      // In modern React Native, this returns a subscription object
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      // We call .remove() on the subscription to clean it up!
      return () => subscription.remove(); 
    }, [currentVault]) 
  );

  // --- 1. FETCH VAULTS REAL-TIME ---
  useEffect(() => {
    if (!currentUser) return;
    
    const loadVaults = async () => {
      const profile = await getUserProfile(currentUser.uid);
      if (!profile?.collegeId) {
        setVaults([]);
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'vaults'),
        where('collegeId', '==', profile.collegeId),
        where('members', 'array-contains', currentUser.uid)
      );
    
      const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedVaults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedVaults.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setVaults(fetchedVaults);
      setLoading(false);
    });

      return unsubscribe;
    };

    let unsubscribe;
    loadVaults().then((cleanup) => { unsubscribe = cleanup; }).catch((error) => {
      console.error('Vault subscription failed:', error);
      setVaults([]);
      setLoading(false);
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [currentUser]);

  // --- 2. FETCH FILES WHEN INSIDE A VAULT ---
  useEffect(() => {
    if (!currentVault) {
      setFiles([]);
      return;
    }

    setFiles([]);
    const filesRef = collection(db, 'vault_files');
    const q = query(filesRef, where('vaultId', '==', currentVault.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedFiles.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setFiles(fetchedFiles);
    });

    return () => unsubscribe();
  }, [currentVault]);

  // --- ACTIONS ---
  const handleTabSwitch = (tab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
    setCurrentVault(null); 
  };

  const openVault = (vault) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentVault(vault);
  };

  const goBackToVaults = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentVault(null);
  };

  const createVault = async () => {
    if (!newVaultName.trim()) return;
    try {
      const profile = await getUserProfile(currentUser.uid);
      if (!profile?.collegeId) throw new Error('Your campus profile is incomplete.');
      await addDoc(collection(db, 'vaults'), {
        collegeId: profile.collegeId,
        name: newVaultName.trim(),
        description: newVaultDesc.trim() || (activeTab === 'shared' ? 'Shared Study Material' : 'Private Storage'),
        type: activeTab,
        admins: [currentUser.uid], 
        members: [currentUser.uid], 
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      setNewVaultName('');
      setNewVaultDesc('');
      setVaultModalVisible(false);
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  const joinVault = async () => {
    if (!inviteCode.trim()) return;
    try {
      const vaultRef = doc(db, 'vaults', inviteCode.trim());
      await updateDoc(vaultRef, { members: arrayUnion(currentUser.uid) });
      setInviteCode('');
      setJoinModalVisible(false);
      Alert.alert("Success!", "You joined the vault.");
    } catch (error) {
      Alert.alert("Invalid Code", "Could not find a vault with that invite code.");
    }
  };

  const shareVaultInvite = async (vault) => {
    try {
      await Share.share({
        message: `Join my Class Vault on WeConnect: "${vault.name}"\n\nInvite Code: ${vault.id}\n\nEnter this code in the Vault tab to access our study materials!`,
      });
    } catch (error) { console.error(error); }
  };

  // --- NATIVE DIRECT DOWNLOAD LOGIC ---
  const handleDownload = async (file) => {
    if (!file.fileUrl) {
      Alert.alert("Error", "This file doesn't have a valid download link.");
      return;
    }
    
    try {
      setDownloadingFileId(file.id); 
      
      const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileUri = `${FileSystem.documentDirectory}${safeFilename}`;
      
      const { uri } = await FileSystem.downloadAsync(file.fileUrl, fileUri);
      
      setDownloadingFileId(null); 

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Save or Share File' });
      } else {
        Alert.alert("Downloaded", "File saved to app storage.");
      }
    } catch (error) {
      setDownloadingFileId(null);
      Alert.alert("Error", "Failed to download the file.");
      console.error(error);
    }
  };

  // --- CROSS-PLATFORM EDIT & DELETE LOGIC ---
  const openActionMenu = (item, type) => {
    setSelectedItem({ ...item, itemType: type });
    setActionMenuVisible(true);
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete Confirmation",
      `Are you sure you want to delete "${selectedItem?.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (selectedItem.itemType === 'vault') {
                await deleteDoc(doc(db, 'vaults', selectedItem.id));
                setCurrentVault(null); 
              } else {
                await deleteDoc(doc(db, 'vault_files', selectedItem.id));
              }
              setActionMenuVisible(false);
              setSelectedItem(null);
            } catch (error) {
              Alert.alert("Error", "Failed to delete item.");
            }
          }
        }
      ]
    );
  };

  const openRenameModal = () => {
    setRenameInput(selectedItem?.name || '');
    setActionMenuVisible(false); 
    setRenameModalVisible(true); 
  };

  const executeRename = async () => {
    if (renameInput.trim() && selectedItem) {
      try {
        const collectionName = selectedItem.itemType === 'vault' ? 'vaults' : 'vault_files';
        await updateDoc(doc(db, collectionName, selectedItem.id), { name: renameInput.trim() });
        
        if (selectedItem.itemType === 'vault' && currentVault?.id === selectedItem.id) {
          setCurrentVault({ ...currentVault, name: renameInput.trim() });
        }
        setRenameModalVisible(false);
      } catch (error) {
        Alert.alert("Error", "Failed to rename item.");
      }
    }
  };

  // --- UPLOAD LOGIC ---
  const handleUploadFile = async () => {
    if (!currentVault) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      setIsUploading(true);

      const secureUrl = await uploadToCloudinary(file.uri, 'auto'); 
      
      if (!secureUrl) {
        setIsUploading(false);
        return Alert.alert("Error", "Upload failed. Check Cloudinary details.");
      }

      const isAdmin = currentVault.admins?.includes(currentUser.uid);
      const isPrivate = currentVault.type === 'private';
      const initialStatus = (isAdmin || isPrivate) ? 'approved' : 'pending';

      await addDoc(collection(db, 'vault_files'), {
        vaultId: currentVault.id,
        name: file.name,
        type: file.mimeType?.includes('pdf') ? 'pdf' : file.mimeType?.includes('image') ? 'image' : 'doc',
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        fileUrl: secureUrl,
        uploader: { uid: currentUser.uid, name: currentUser.displayName || 'Student', avatar: currentUser.photoURL || '' },
        status: initialStatus,
        upvotes: [],
        createdAt: serverTimestamp()
      });

      setIsUploading(false);
      if (initialStatus === 'pending') {
        Alert.alert("Sent for Approval", "Your file needs 5 upvotes or Admin approval to become visible to everyone.");
      } else {
        Alert.alert("Success", "File uploaded successfully!");
      }
    } catch (error) {
      setIsUploading(false);
      console.error(error);
    }
  };

  // --- UPVOTE & APPROVAL LOGIC ---
  const toggleUpvote = async (file) => {
    const fileRef = doc(db, 'vault_files', file.id);
    const hasUpvoted = file.upvotes?.includes(currentUser.uid);
    try {
      if (hasUpvoted) {
        await updateDoc(fileRef, { upvotes: arrayRemove(currentUser.uid) });
      } else {
        const newUpvotes = [...(file.upvotes || []), currentUser.uid];
        const updates = { upvotes: arrayUnion(currentUser.uid) };
        if (newUpvotes.length >= 5 && file.status === 'pending') {
          updates.status = 'approved';
          Alert.alert("Threshold Reached!", "This file received 5 upvotes and is now fully approved!");
        }
        await updateDoc(fileRef, updates);
      }
    } catch (error) { console.error(error); }
  };

  const adminApproveFile = async (fileId) => {
    await updateDoc(doc(db, 'vault_files', fileId), { status: 'approved' });
  };

  // --- UI HELPERS ---
  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf': return <FileText size={24} color="#FF3B30" />;
      case 'doc': return <FileText size={24} color="#111111" />;
      case 'image': return <ImageIcon size={24} color="#34C759" />;
      case 'zip': return <FileArchive size={24} color="#FF9500" />;
      default: return <FileText size={24} color="#888" />;
    }
  };

  // --- RENDERERS ---
  const renderVaultItem = ({ item }) => {
    const isAdmin = item.admins?.includes(currentUser.uid);
    return (
      <TouchableOpacity style={styles.listItem} activeOpacity={0.7} onPress={() => openVault(item)}>
        <View style={[styles.iconBox, { backgroundColor: item.type === 'shared' ? '#E6F4FE' : '#F4E8FA' }]}>
          {item.type === 'shared' ? <Users size={24} color="#111111" /> : <Lock size={24} color="#AF52DE" />}
        </View>
        <View style={styles.itemDetails}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemMeta} numberOfLines={1}>{item.description}</Text>
        </View>
        {isAdmin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>}
        
        {item.type === 'shared' && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => shareVaultInvite(item)}>
            <LinkIcon size={20} color="#111111" />
          </TouchableOpacity>
        )}
        
        {isAdmin && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => openActionMenu(item, 'vault')}>
            <MoreVertical size={20} color="#888" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const openUploaderProfile = (uploader) => { if (!uploader?.uid || uploader.uid === currentUser?.uid) return; openProfile(navigation, { uid: uploader.uid, name: uploader.name, avatar: uploader.avatar }); };

  const renderFileItem = ({ item }) => {
    const isAdmin = currentVault?.admins?.includes(currentUser.uid);
    const isUploader = item.uploader?.uid === currentUser.uid;
    const canEdit = isAdmin || isUploader;
    
    const isPending = item.status === 'pending';
    const hasUpvoted = item.upvotes?.includes(currentUser.uid);
    const upvoteCount = item.upvotes?.length || 0;

    return (
      <View style={[styles.listItem, isPending && styles.pendingListItem]}>
        <View style={[styles.iconBox, { backgroundColor: '#F7F7F5', borderWidth: 1, borderColor: '#eee' }]}>
          {getFileIcon(item.type)}
        </View>
        <View style={styles.itemDetails}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {item.size} • By <Text onPress={() => openUploaderProfile(item.uploader)} style={item.uploader?.uid === currentUser.uid ? undefined : styles.uploaderLink}>{item.uploader?.name}</Text>
          </Text>
          {isPending && <Text style={styles.pendingText}>Waiting for Approval ({upvoteCount}/5 votes)</Text>}
        </View>

        {isPending ? (
          <View style={styles.pendingActions}>
            {isAdmin ? (
              <TouchableOpacity style={styles.approveBtn} onPress={() => adminApproveFile(item.id)}>
                <CheckCircle size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.upvoteBtn, hasUpvoted && styles.upvoteBtnActive]} onPress={() => toggleUpvote(item)}>
                <ThumbsUp size={18} color={hasUpvoted ? "#fff" : "#111111"} />
                <Text style={[styles.upvoteText, hasUpvoted && {color: '#fff'}]}>{upvoteCount}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDownload(item)}>
              {downloadingFileId === item.id ? (
                <ActivityIndicator size="small" color="#111111" />
              ) : (
                <Download size={20} color="#888" />
              )}
            </TouchableOpacity>
            
            {canEdit && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => openActionMenu(item, 'file')}>
                <MoreVertical size={20} color="#888" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  const displayVaults = vaults.filter(v => v.type === activeTab && v.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const displayFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      {currentVault ? (
        <View style={styles.folderHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={goBackToVaults}>
            <ChevronLeft size={28} color="#000" />
          </TouchableOpacity>
          <View style={styles.folderHeaderInfo}>
            <Text style={styles.folderHeaderTitle} numberOfLines={1}>{currentVault.name}</Text>
            <Text style={styles.folderHeaderSub}>{currentVault.description}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vault</Text>
          {activeTab === 'shared' && (
            <TouchableOpacity style={styles.joinHeaderBtn} onPress={() => setJoinModalVisible(true)}>
              <Key size={16} color="#111111" />
              <Text style={styles.joinHeaderText}>Join Vault</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* TABS */}
      {!currentVault && (
        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'shared' && styles.activeTabBtn]} onPress={() => handleTabSwitch('shared')}>
            <Users size={18} color={activeTab === 'shared' ? '#111111' : '#707070'} />
            <Text style={[styles.tabText, activeTab === 'shared' && styles.activeTabText]}>Class Vaults</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'private' && styles.activeTabBtn]} onPress={() => handleTabSwitch('private')}>
            <Lock size={18} color={activeTab === 'private' ? '#111111' : '#707070'} />
            <Text style={[styles.tabText, activeTab === 'private' && styles.activeTabText]}>My Private Vault</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={currentVault ? `Search in ${currentVault.name}...` : `Search vaults...`}
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* CONTENT AREA */}
      <View style={styles.contentArea}>
        {loading ? (
           <ActivityIndicator size="large" color="#111111" style={{marginTop: 50}} />
        ) : currentVault ? (
          <FlatList
            data={displayFiles}
            keyExtractor={item => item.id}
            renderItem={renderFileItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <FileText size={48} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>No files uploaded yet</Text>
                <Text style={styles.emptyStateSub}>Tap + to upload material</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={displayVaults}
            keyExtractor={item => item.id}
            renderItem={renderVaultItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Folder size={48} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>No {activeTab} vaults found</Text>
                <Text style={styles.emptyStateSub}>Create one or join via invite code!</Text>
              </View>
            }
          />
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab} 
        activeOpacity={0.8}
        onPress={currentVault ? handleUploadFile : () => setVaultModalVisible(true)}
        disabled={isUploading}
      >
        {isUploading ? <ActivityIndicator color="#111111" /> : (currentVault ? <UploadCloud size={24} color="#111111" /> : <FolderPlus size={24} color="#111111" />)}
      </TouchableOpacity>

      {/* --- CREATE VAULT MODAL --- */}
      <Modal visible={isVaultModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New {activeTab === 'shared' ? 'Shared' : 'Private'} Vault</Text>
              <TouchableOpacity onPress={() => setVaultModalVisible(false)}><X size={24} color="#888" /></TouchableOpacity>
            </View>
            <TextInput style={styles.modalInput} placeholder="Vault Name (e.g., CS 3rd Year)" value={newVaultName} onChangeText={setNewVaultName} />
            <TextInput style={styles.modalInput} placeholder="Purpose / Description" value={newVaultDesc} onChangeText={setNewVaultDesc} />
            <TouchableOpacity style={styles.modalSubmitBtn} onPress={createVault}>
              <Text style={styles.modalSubmitText}>Create Vault</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- JOIN VAULT MODAL --- */}
      <Modal visible={isJoinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Join Class Vault</Text>
              <TouchableOpacity onPress={() => setJoinModalVisible(false)}><X size={24} color="#888" /></TouchableOpacity>
            </View>
            <Text style={styles.modalHelperText}>Enter the Invite Code shared by your CR or Admin.</Text>
            <TextInput style={styles.modalInput} placeholder="Paste Invite Code here..." value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" />
            <TouchableOpacity style={styles.modalSubmitBtn} onPress={joinVault}>
              <Text style={styles.modalSubmitText}>Join Vault</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- NEW CROSS-PLATFORM RENAME MODAL --- */}
      <Modal visible={isRenameModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Item</Text>
              <TouchableOpacity onPress={() => setRenameModalVisible(false)}><X size={24} color="#888" /></TouchableOpacity>
            </View>
            <TextInput 
              style={styles.modalInput} 
              placeholder="Enter new name" 
              value={renameInput} 
              onChangeText={setRenameInput} 
              autoFocus 
            />
            <TouchableOpacity style={styles.modalSubmitBtn} onPress={executeRename}>
              <Text style={styles.modalSubmitText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- ACTIONS MENU MODAL (Edit/Delete) --- */}
      <Modal visible={actionMenuVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionMenuVisible(false)}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{selectedItem?.name || 'Options'}</Text>

            {selectedItem?.itemType === 'file' && (
              <TouchableOpacity style={styles.sheetOption} onPress={() => { setActionMenuVisible(false); handleDownload(selectedItem); }}>
                <View style={[styles.sheetIconBox, { backgroundColor: '#E8E8E3' }]}><Download size={20} color="#111111" /></View>
                <Text style={styles.sheetOptionText}>Download File</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.sheetOption} onPress={openRenameModal}>
              <View style={[styles.sheetIconBox, { backgroundColor: '#E6F4FE' }]}><Edit2 size={20} color="#111111" /></View>
              <Text style={styles.sheetOptionText}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetOption} onPress={confirmDelete}>
              <View style={[styles.sheetIconBox, { backgroundColor: '#FFEBEB' }]}><Trash2 size={20} color="#FF3B30" /></View>
              <Text style={[styles.sheetOptionText, { color: '#FF3B30' }]}>Delete {selectedItem?.itemType}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15, backgroundColor: '#fff' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111111' },
  joinHeaderBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFC00', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  joinHeaderText: { color: '#111111', fontWeight: 'bold', marginLeft: 6, fontSize: 14 },
  
  folderHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingTop: 10, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0EC' },
  backBtn: { padding: 5, marginRight: 10 },
  folderHeaderInfo: { flex: 1 },
  folderHeaderTitle: { fontSize: 20, fontWeight: 'bold', color: '#111111' },
  folderHeaderSub: { fontSize: 13, color: '#707070' },
  
  tabContainer: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#F0F0EC', borderRadius: 12, padding: 4, marginBottom: 5, marginTop: 10 },
  tabBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  activeTabBtn: { backgroundColor: '#FFFC00', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 15, fontWeight: '600', color: '#707070', marginLeft: 8 },
  activeTabText: { color: '#111111' },
  
  searchContainer: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#fff' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7F7F5', borderRadius: 12, paddingHorizontal: 12, height: 45, borderWidth: 1, borderColor: '#E8E8E3' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111111' },
  
  contentArea: { flex: 1, backgroundColor: '#F7F7F5' },
  listContent: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 100 }, 
  
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E8E8E3', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  pendingListItem: { backgroundColor: '#FFFDF5', borderColor: '#FFD60A' },
  iconBox: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  itemDetails: { flex: 1, justifyContent: 'center' },
  itemName: { fontSize: 16, fontWeight: '600', color: '#111111', marginBottom: 4 },
  uploaderLink: { color: '#111111', fontWeight: '700' },
  itemMeta: { fontSize: 13, color: '#707070' },
  adminBadge: { backgroundColor: '#E8E8E3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
  adminBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#475569' },
  actionBtn: { padding: 8, marginRight: -8 },
  
  pendingText: { fontSize: 12, color: '#FF9500', fontWeight: 'bold', marginTop: 4 },
  pendingActions: { flexDirection: 'row', alignItems: 'center' },
  approveBtn: { backgroundColor: '#34C759', padding: 10, borderRadius: 20, marginLeft: 10 },
  upvoteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFC00', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10 },
  upvoteBtnActive: { backgroundColor: '#FFFC00' },
  upvoteText: { color: '#111111', fontWeight: 'bold', marginLeft: 6 },
  
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyStateText: { marginTop: 15, fontSize: 18, color: '#707070', fontWeight: 'bold' },
  emptyStateSub: { marginTop: 5, fontSize: 14, color: '#999999', textAlign: 'center', paddingHorizontal: 20 },
  
  fab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFC00', justifyContent: 'center', alignItems: 'center', shadowColor: '#111111', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111111' },
  modalHelperText: { fontSize: 14, color: '#707070', marginBottom: 20 },
  modalInput: { backgroundColor: '#F7F7F5', borderWidth: 1, borderColor: '#E8E8E3', borderRadius: 12, paddingHorizontal: 15, height: 50, fontSize: 16, color: '#111111', marginBottom: 15 },
  modalSubmitBtn: { backgroundColor: '#FFFC00', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 5 },
  modalSubmitText: { color: '#111111', fontSize: 16, fontWeight: '800' },
  
  bottomSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 },
  sheetHandle: { width: 40, height: 5, backgroundColor: '#E8E8E3', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: '#111111', marginBottom: 20, textAlign: 'center' },
  sheetOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F0F0EC' },
  sheetIconBox: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  sheetOptionText: { fontSize: 16, fontWeight: '600', color: '#111111' },
});

export default VaultScreen;