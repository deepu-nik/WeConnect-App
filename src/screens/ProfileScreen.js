import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, 
  Dimensions, StatusBar, Modal, TextInput, KeyboardAvoidingView, 
  Platform, ActivityIndicator, Alert, Linking 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Settings, Edit3, MapPin, Link as LinkIcon, 
  BookOpen, Code, Terminal, CheckCircle, Camera, ArrowLeft, X,
  Github, Linkedin, Twitter, Instagram, Globe, Youtube, FileText, Trash2, Plus
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

// Firebase & Utils
import { auth, db } from '../config/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

const { width } = Dimensions.get('window');

// Helper to generate consistent vibrant colors for skills
const SKILL_COLORS = ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#FF3B30', '#5856D6'];

const ProfileScreen = ({ route, navigation }) => {
  const currentUser = auth.currentUser;
  
  const { uid: viewedUid, name: viewedName, avatar: viewedAvatar } = route?.params || {};
  const isViewingSelf = !viewedUid || viewedUid === currentUser?.uid;
  const targetUid = isViewingSelf ? currentUser?.uid : viewedUid;

  // Real Data State
  const [userData, setUserData] = useState({
    name: viewedName || currentUser?.displayName || 'Student',
    handle: `@student_${targetUid?.substring(0,4) || 'user'}`,
    bio: 'Add a bio to tell people about yourself.',
    location: 'Campus',
    website: '',
    resumeLink: '',
    course: 'B.Tech CSE',
    gradYear: '2026',
    avatar: viewedAvatar || currentUser?.photoURL || 'https://via.placeholder.com/150',
    coverPhoto: 'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe?q=80&w=1000&auto=format&fit=crop',
    skills: ['React Native', 'AI/ML'],
    projectsCount: 0,
    connections: []
  });
  
  const [vaultNotesCount, setVaultNotesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Edit Modal States
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);

  // --- FETCH USER DATA & STATS FROM FIREBASE ---
  useEffect(() => {
    const fetchUserData = async () => {
      if (!targetUid) return;
      try {
        // 1. Fetch Profile Data
        const userDocRef = doc(db, 'users', targetUid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(prev => ({
            ...prev,
            name: data.displayName || data.name || prev.name,
            handle: data.handle || prev.handle,
            bio: data.bio || prev.bio,
            location: data.location || prev.location,
            website: data.website || prev.website,
            resumeLink: data.resumeLink || prev.resumeLink,
            course: data.course || prev.course,
            gradYear: data.gradYear || prev.gradYear,
            avatar: data.photoURL || data.avatar || prev.avatar,
            coverPhoto: data.coverPhoto || prev.coverPhoto,
            skills: data.skills || prev.skills,
            projectsCount: data.projectsCount || prev.projectsCount,
            connections: data.connections || prev.connections
          }));
        }

        // 2. Fetch LIVE Vault Notes Uploaded by this user
        const vaultQ = query(collection(db, 'vault_files'), where('uploader.uid', '==', targetUid));
        const vaultSnap = await getDocs(vaultQ);
        setVaultNotesCount(vaultSnap.docs.length);

      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [targetUid]);

  // --- SMART LINK PARSER ---
  const getSocialIcon = (url, size = 16, color = "#007AFF") => {
    if (!url) return <LinkIcon size={size} color={color} />;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('github.com')) return <Github size={size} color="#333" />;
    if (lowerUrl.includes('linkedin.com')) return <Linkedin size={size} color="#0077b5" />;
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return <Twitter size={size} color="#1DA1F2" />;
    if (lowerUrl.includes('instagram.com')) return <Instagram size={size} color="#E1306C" />;
    if (lowerUrl.includes('youtube.com')) return <Youtube size={size} color="#FF0000" />;
    return <Globe size={size} color={color} />;
  };

  // --- IMAGE UPLOAD LOGIC ---
  const handleImagePick = async (type) => {
    if (!isViewingSelf) return;
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsImageUploading(true);
        const imageUrl = await uploadToCloudinary(result.assets[0].uri, 'image');
        
        if (imageUrl) {
          const userRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userRef, {
            [type === 'avatar' ? 'photoURL' : 'coverPhoto']: imageUrl
          });
          setUserData(prev => ({ ...prev, [type === 'avatar' ? 'avatar' : 'coverPhoto']: imageUrl }));
        }
        setIsImageUploading(false);
      }
    } catch (error) {
      console.error(error);
      setIsImageUploading(false);
      Alert.alert("Error", "Failed to upload image.");
    }
  };

  // --- PROFILE EDIT LOGIC ---
  const openEditModal = () => {
    setEditForm({
      name: userData.name,
      handle: userData.handle,
      bio: userData.bio,
      location: userData.location,
      website: userData.website,
      resumeLink: userData.resumeLink,
      course: userData.course,
      gradYear: userData.gradYear,
      skills: [...userData.skills],
      projectsCount: userData.projectsCount.toString()
    });
    setNewSkill('');
    setEditModalVisible(true);
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && !editForm.skills.includes(newSkill.trim())) {
      setEditForm({ ...editForm, skills: [...editForm.skills, newSkill.trim()] });
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setEditForm({ ...editForm, skills: editForm.skills.filter(s => s !== skillToRemove) });
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const updatedData = {
        displayName: editForm.name,
        name: editForm.name,
        handle: editForm.handle,
        bio: editForm.bio,
        location: editForm.location,
        website: editForm.website,
        resumeLink: editForm.resumeLink,
        course: editForm.course,
        gradYear: editForm.gradYear,
        skills: editForm.skills,
        projectsCount: parseInt(editForm.projectsCount) || 0
      };
      
      await updateDoc(userRef, updatedData);
      setUserData(prev => ({ ...prev, ...updatedData }));
      setEditModalVisible(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Failed to save profile updates.");
    } finally {
      setIsSaving(false);
    }
  };

  const openLink = async (url) => {
    if (!url) return;
    let fullUrl = url;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }
    const supported = await Linking.canOpenURL(fullUrl);
    if (supported) {
      await Linking.openURL(fullUrl);
    } else {
      Alert.alert("Error", "Cannot open this link.");
    }
  };

  // --- REUSABLE COMPONENTS ---
  const StatsBox = ({ title, value }) => (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  const SkillBadge = ({ text, index }) => {
    // Pick a consistent color based on index
    const color = SKILL_COLORS[index % SKILL_COLORS.length];
    // Alternate icons for visual variety
    const icon = index % 2 === 0 ? <Terminal size={16} color="#fff" /> : <Code size={16} color="#fff" />;
    
    return (
      <View style={[styles.skillBadge, { backgroundColor: color }]}>
        {icon}
        <Text style={styles.skillText}>{text}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* COVER PHOTO AREA */}
        <View style={styles.coverContainer}>
          <Image source={{ uri: userData.coverPhoto }} style={styles.coverPhoto} />
          <View style={styles.coverOverlay} />
          
          {isViewingSelf && (
            <TouchableOpacity style={styles.editCoverBtn} onPress={() => handleImagePick('coverPhoto')}>
              <Camera size={20} color="#fff" />
            </TouchableOpacity>
          )}

          <SafeAreaView style={styles.headerBtns}>
            {!isViewingSelf ? (
               <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
                 <ArrowLeft size={24} color="#fff" />
               </TouchableOpacity>
            ) : (
               <Text style={styles.headerTitle}>Profile</Text>
            )}
            
            {isViewingSelf && (
              <TouchableOpacity style={styles.iconBtn}>
                <Settings size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </View>

        {/* PROFILE INFO SECTION */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: userData.avatar }} style={styles.avatar} />
            {isImageUploading && (
              <View style={styles.avatarUploadingOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {isViewingSelf && !isImageUploading && (
              <TouchableOpacity style={styles.editAvatarBtn} onPress={() => handleImagePick('avatar')}>
                <Camera size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionRow}>
            {isViewingSelf ? (
              <>
                <TouchableOpacity style={styles.editProfileBtn} onPress={openEditModal}>
                  <Text style={styles.editProfileText}>Edit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareBtn}>
                  <Edit3 size={20} color="#000" />
                </TouchableOpacity>
              </>
            ) : (
               <TouchableOpacity style={[styles.editProfileBtn, { backgroundColor: '#007AFF', borderColor: '#007AFF' }]}>
                  <Text style={[styles.editProfileText, { color: '#fff' }]}>Message</Text>
                </TouchableOpacity>
            )}
          </View>

          <View style={styles.detailsContainer}>
            <Text style={styles.nameText}>{userData.name}</Text>
            <Text style={styles.handleText}>{userData.handle}</Text>
            
            <Text style={styles.courseText}>
               {userData.course} {userData.gradYear ? `• Class of ${userData.gradYear}` : ''}
            </Text>

            <Text style={styles.bioText}>{userData.bio}</Text>

            <View style={styles.infoRow}>
              <MapPin size={16} color="#666" />
              <Text style={styles.infoText}>{userData.location}</Text>
            </View>
            
            {/* Social Link with Smart Icon */}
            {userData.website ? (
              <TouchableOpacity style={styles.infoRow} onPress={() => openLink(userData.website)}>
                {getSocialIcon(userData.website)}
                <Text style={[styles.infoText, { color: '#007AFF' }]}>{userData.website.replace(/^https?:\/\//, '')}</Text>
              </TouchableOpacity>
            ) : null}

            {/* Resume Link */}
            {userData.resumeLink ? (
              <TouchableOpacity style={styles.infoRow} onPress={() => openLink(userData.resumeLink)}>
                <FileText size={16} color="#AF52DE" />
                <Text style={[styles.infoText, { color: '#AF52DE', fontWeight: 'bold' }]}>View Resume / CV</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.statsContainer}>
            <StatsBox title="Connections" value={userData.connections?.length || 0} />
            <StatsBox title="Vault Notes" value={vaultNotesCount} />
            <StatsBox title="Projects" value={userData.projectsCount} />
          </View>

          {/* DYNAMIC SKILLS SECTION */}
          {userData.skills && userData.skills.length > 0 && (
            <View style={styles.skillsSection}>
              <Text style={styles.sectionTitle}>Currently Learning</Text>
              <View style={styles.skillsGrid}>
                {userData.skills.map((skill, index) => (
                  <SkillBadge key={index} text={skill} index={index} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.activitySection}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.activityCard}>
              <CheckCircle size={24} color="#34C759" />
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Profile Updated</Text>
                <Text style={styles.activitySub}>Keeping things fresh</Text>
              </View>
              <Text style={styles.activityTime}>Just now</Text>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* --- EDIT PROFILE MODAL --- */}
      <Modal visible={isEditModalVisible} animationType="slide" transparent={true} onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}><X size={24} color="#0f172a" /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
              
              {/* Basic Info */}
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput style={styles.inputBox} value={editForm.name} onChangeText={(t) => setEditForm({...editForm, name: t})} />

              <Text style={styles.inputLabel}>Username / Handle</Text>
              <TextInput style={styles.inputBox} value={editForm.handle} onChangeText={(t) => setEditForm({...editForm, handle: t})} autoCapitalize="none" />

              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput style={[styles.inputBox, { height: 80, paddingTop: 12 }]} value={editForm.bio} onChangeText={(t) => setEditForm({...editForm, bio: t})} multiline />
              
              {/* Academic Info */}
              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={{flex: 2}}>
                  <Text style={styles.inputLabel}>Course / Major</Text>
                  <TextInput style={styles.inputBox} value={editForm.course} onChangeText={(t) => setEditForm({...editForm, course: t})} placeholder="e.g. B.Tech CSE" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.inputLabel}>Class Of</Text>
                  <TextInput style={styles.inputBox} value={editForm.gradYear} onChangeText={(t) => setEditForm({...editForm, gradYear: t})} placeholder="2026" keyboardType="numeric" />
                </View>
              </View>

              <Text style={styles.inputLabel}>Campus Location / Hostel</Text>
              <TextInput style={styles.inputBox} value={editForm.location} onChangeText={(t) => setEditForm({...editForm, location: t})} />

              {/* Links */}
              <Text style={styles.inputLabel}>Social Link (GitHub, LinkedIn, etc.)</Text>
              <TextInput style={styles.inputBox} value={editForm.website} onChangeText={(t) => setEditForm({...editForm, website: t})} placeholder="github.com/yourname" autoCapitalize="none" keyboardType="url" />

              <Text style={styles.inputLabel}>Resume / Portfolio Link</Text>
              <TextInput style={styles.inputBox} value={editForm.resumeLink} onChangeText={(t) => setEditForm({...editForm, resumeLink: t})} placeholder="drive.google.com/..." autoCapitalize="none" keyboardType="url" />

              <Text style={styles.inputLabel}>Number of Projects Completed</Text>
              <TextInput style={styles.inputBox} value={String(editForm.projectsCount)} onChangeText={(t) => setEditForm({...editForm, projectsCount: t})} keyboardType="numeric" />

              {/* Editable Skills Section */}
              <Text style={styles.inputLabel}>Currently Learning (Skills)</Text>
              <View style={styles.skillInputRow}>
                <TextInput 
                  style={[styles.inputBox, { flex: 1, marginBottom: 0 }]} 
                  value={newSkill} 
                  onChangeText={setNewSkill} 
                  placeholder="e.g. Node.js" 
                  onSubmitEditing={handleAddSkill}
                />
                <TouchableOpacity style={styles.addSkillBtn} onPress={handleAddSkill}>
                  <Plus size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.editSkillsGrid}>
                {editForm.skills?.map((skill, index) => (
                  <View key={index} style={styles.editSkillChip}>
                    <Text style={styles.editSkillText}>{skill}</Text>
                    <TouchableOpacity onPress={() => handleRemoveSkill(skill)}>
                      <Trash2 size={14} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  coverContainer: { height: 200, width: '100%', position: 'relative' },
  coverPhoto: { width: '100%', height: '100%', position: 'absolute' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  editCoverBtn: { position: 'absolute', right: 20, bottom: 40, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20, zIndex: 10 },
  
  headerBtns: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  iconBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  
  profileSection: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, paddingHorizontal: 20, paddingBottom: 50 },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, marginTop: -50, borderWidth: 4, borderColor: '#fff', backgroundColor: '#eee', position: 'relative' },
  avatar: { width: '100%', height: '100%', borderRadius: 50 },
  avatarUploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  editAvatarBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007AFF', padding: 8, borderRadius: 15, borderWidth: 2, borderColor: '#fff' },
  
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -40, marginBottom: 20 },
  editProfileBtn: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },
  editProfileText: { fontWeight: 'bold', color: '#000', fontSize: 14 },
  shareBtn: { padding: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  
  detailsContainer: { marginBottom: 20 },
  nameText: { fontSize: 24, fontWeight: 'bold', color: '#000' },
  handleText: { fontSize: 15, color: '#888', marginBottom: 6 },
  courseText: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginBottom: 12 },
  bioText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 15 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoText: { marginLeft: 10, fontSize: 14, color: '#555' },
  
  statsContainer: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 15, marginBottom: 20 },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  statTitle: { fontSize: 13, color: '#888', fontWeight: '500' },
  
  skillsSection: { marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 15 },
  skillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skillBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  skillText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  
  activitySection: { marginBottom: 20 },
  activityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  activityContent: { flex: 1, marginLeft: 15 },
  activityTitle: { fontSize: 15, fontWeight: 'bold', color: '#000' },
  activitySub: { fontSize: 13, color: '#666', marginTop: 2 },
  activityTime: { fontSize: 12, color: '#888', fontWeight: '500' },

  // --- MODAL STYLES ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  
  inputLabel: { fontSize: 14, fontWeight: 'bold', color: '#64748b', marginBottom: 8, marginTop: 15 },
  inputBox: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 15, height: 48, fontSize: 15, color: '#0f172a', marginBottom: 5 },
  
  skillInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  addSkillBtn: { backgroundColor: '#007AFF', width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  editSkillsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  editSkillChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEB', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#FF3B30' },
  editSkillText: { color: '#FF3B30', fontWeight: '600', marginRight: 8 },

  saveBtn: { backgroundColor: '#007AFF', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 30, marginBottom: 40 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});

export default ProfileScreen;