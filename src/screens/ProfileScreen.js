import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from 'firebase/auth';
import { doc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import {
  Camera, CheckCircle, Code, Github, Globe, Instagram, Link as LinkIcon,
  Linkedin, MapPin, Plus, Settings, Trash2, Twitter, UserRound, X, Youtube,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../config/firebase';
import { getUserProfile, FALLBACK_AVATAR } from '../services/userService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

const SKILL_COLORS = ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#FF3B30', '#5856D6'];

const ProfileScreen = ({ route, navigation }) => {
  const currentUser = auth.currentUser;
  const targetUid = route?.params?.uid || currentUser?.uid;
  const isSelf = targetUid === currentUser?.uid;

  const [user, setUser] = useState(null);
  const [vaultCount, setVaultCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [form, setForm] = useState(null);
  const [newSkill, setNewSkill] = useState('');
  const [fullScreenAvatar, setFullScreenAvatar] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await getUserProfile(targetUid);
        if (!active) return;
        setUser(profile || {
          uid: targetUid,
          name: route?.params?.name || 'Student',
          handle: '@student',
          bio: '',
          location: 'Campus',
          avatar: route?.params?.avatar || FALLBACK_AVATAR,
          coverPhoto: '',
          skills: [],
          connections: [],
          projectsCount: 0,
          course: 'B.Tech CSE',
          gradYear: '',
          website: '',
          resumeLink: '',
          instagram: '', linkedin: '', github: '', whatsapp: '',
        });

        const vaultSnap = await getDocs(query(collection(db, 'vault_files'), where('uploader.uid', '==', targetUid)));
        if (active) setVaultCount(vaultSnap.size);
      } catch (error) {
        console.error('Profile load failed:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [targetUid, route?.params]);

  const openEdit = () => {
    setForm({
      name: user.name || '',
      handle: user.handle || '',
      bio: user.bio || '',
      location: user.location || '',
      website: user.website || '',
      resumeLink: user.resumeLink || '',
      instagram: user.instagram || '',
      linkedin: user.linkedin || '',
      github: user.github || '',
      whatsapp: user.whatsapp || '',
      course: user.course || '',
      gradYear: String(user.gradYear || ''),
      projectsCount: String(user.projectsCount || 0),
      skills: [...(user.skills || [])],
    });
    setEditVisible(true);
  };

  const addSkill = () => {
    const skill = newSkill.trim();
    if (!skill || form.skills.includes(skill)) return;
    setForm({ ...form, skills: [...form.skills, skill] });
    setNewSkill('');
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const next = {
        displayName: form.name.trim(),
        name: form.name.trim(),
        handle: form.handle.trim().startsWith('@') ? form.handle.trim() : '@' + form.handle.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        website: form.website.trim(),
        resumeLink: form.resumeLink.trim(),
        instagram: form.instagram.trim(),
        linkedin: form.linkedin.trim(),
        github: form.github.trim(),
        whatsapp: form.whatsapp.trim(),
        course: form.course.trim(),
        gradYear: form.gradYear.trim(),
        projectsCount: Number.parseInt(form.projectsCount, 10) || 0,
        skills: form.skills,
      };
      await updateDoc(doc(db, 'users', currentUser.uid), next);
      await updateProfile(currentUser, { displayName: next.displayName });
      setUser((prev) => ({ ...prev, ...next }));
      setEditVisible(false);
    } catch (error) {
      console.error('Profile save failed:', error);
      Alert.alert('Error', 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (type) => {
    if (!isSelf) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Allow gallery access to change your profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploading(true);
      const url = await uploadToCloudinary(result.assets[0].uri, 'image');
      if (!url) throw new Error('Upload failed');

      const field = type === 'avatar' ? 'photoURL' : 'coverPhoto';
      const patch = { [field]: url };
      if (type === 'avatar') patch.avatar = url;

      await updateDoc(doc(db, 'users', currentUser.uid), patch);
      if (type === 'avatar') {
        await updateProfile(currentUser, { photoURL: url });
      }

      // Keep the screen immediately in sync with Firestore.
      setUser((prev) => ({
        ...prev,
        [type === 'avatar' ? 'avatar' : 'coverPhoto']: url,
      }));
    } catch (error) {
      console.error('Image upload failed:', error);
      Alert.alert('Error', 'Could not update the image.');
    } finally {
      setUploading(false);
    }
  };

  const openWhatsApp = async (value) => {
    const digits = String(value || '').replace(/\\D/g, '');
    if (!digits) return;
    const url = `https://wa.me/${digits}`;
    try { if (await Linking.canOpenURL(url)) await Linking.openURL(url); else Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp.'); } catch { Alert.alert('Error', 'Could not open WhatsApp.'); }
  };

  const openLink = async (value) => {
    if (!value) return;
    const url = /^https?:\/\//i.test(value) ? value : 'https://' + value;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Invalid link', 'This link cannot be opened.');
    } catch {
      Alert.alert('Error', 'Could not open the link.');
    }
  };

  const socialIcon = (value) => {
    const url = value.toLowerCase();
    if (url.includes('github')) return <Github size={16} color="#111" />;
    if (url.includes('linkedin')) return <Linkedin size={16} color="#0077b5" />;
    if (url.includes('instagram')) return <Instagram size={16} color="#E1306C" />;
    if (url.includes('youtube')) return <Youtube size={16} color="#FF0000" />;
    if (url.includes('twitter') || url.includes('x.com')) return <Twitter size={16} color="#111" />;
    return <Globe size={16} color="#007AFF" />;
  };

  const skillCount = useMemo(() => user?.skills?.length || 0, [user]);

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          {user.coverPhoto ? <Image source={{ uri: user.coverPhoto }} style={styles.coverImage} /> : <View style={styles.coverFallback} />}
          <View style={styles.coverShade} />
          <SafeAreaView style={styles.topBar}>
            {isSelf && <TouchableOpacity style={styles.circleBtn} onPress={() => Alert.alert('Settings', 'Profile settings can be added here.')}><Settings size={21} color="#fff" /></TouchableOpacity>}
          </SafeAreaView>
          {isSelf && <TouchableOpacity style={styles.coverEdit} onPress={() => pickImage('cover')}><Camera size={18} color="#fff" /></TouchableOpacity>}
        </View>

        <View style={styles.body}>
          <View style={styles.avatarWrap}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setFullScreenAvatar(user.avatar || FALLBACK_AVATAR)}>
              <Image source={{ uri: user.avatar || FALLBACK_AVATAR }} style={styles.avatar} />
            </TouchableOpacity>
            {isSelf && <TouchableOpacity style={styles.avatarEdit} onPress={() => pickImage('avatar')} disabled={uploading}><Camera size={15} color="#fff" /></TouchableOpacity>}
            {uploading && <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View>}
          </View>

          <View style={styles.actionRow}>
            {isSelf ? (
              <TouchableOpacity style={styles.editButton} onPress={openEdit}><Text style={styles.editText}>Edit Profile</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.messageButton} onPress={() => navigation.navigate('ChatRoom', { uid: user.uid, name: user.name, avatar: user.avatar })}>
                <Text style={styles.messageText}>Message</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.handle}>{user.handle}</Text>
          <Text style={styles.course}>{user.course}{user.gradYear ? ' • Class of ' + user.gradYear : ''}</Text>
          <Text style={styles.bio}>{user.bio}</Text>

          <View style={styles.info}>
            <View style={styles.infoRow}><MapPin size={16} color="#64748b" /><Text style={styles.infoText}>{user.location}</Text></View>
            {user.website ? <TouchableOpacity style={styles.infoRow} onPress={() => openLink(user.website)}>{socialIcon(user.website)}<Text style={styles.linkText}>{user.website.replace(/^https?:\/\//, '')}</Text></TouchableOpacity> : null}
            {user.instagram ? <TouchableOpacity style={styles.infoRow} onPress={() => openLink(user.instagram.startsWith('http') ? user.instagram : 'https://instagram.com/' + user.instagram.replace(/^@/, ''))}><Instagram size={16} color="#E1306C" /><Text style={styles.linkText}>Instagram</Text></TouchableOpacity> : null}
            {user.linkedin ? <TouchableOpacity style={styles.infoRow} onPress={() => openLink(user.linkedin.startsWith('http') ? user.linkedin : 'https://linkedin.com/in/' + user.linkedin.replace(/^@/, ''))}><Linkedin size={16} color="#0077b5" /><Text style={styles.linkText}>LinkedIn</Text></TouchableOpacity> : null}
            {user.github ? <TouchableOpacity style={styles.infoRow} onPress={() => openLink(user.github.startsWith('http') ? user.github : 'https://github.com/' + user.github.replace(/^@/, ''))}><Github size={16} color="#111" /><Text style={styles.linkText}>GitHub</Text></TouchableOpacity> : null}
            {user.whatsapp ? <TouchableOpacity style={styles.infoRow} onPress={() => openWhatsApp(user.whatsapp)}><Text style={{ width: 16, textAlign: 'center', fontWeight: '800', color: '#25D366' }}>W</Text><Text style={styles.linkText}>WhatsApp</Text></TouchableOpacity> : null}
            {user.resumeLink ? <TouchableOpacity style={styles.infoRow} onPress={() => openLink(user.resumeLink)}><LinkIcon size={16} color="#AF52DE" /><Text style={[styles.linkText, { color: '#AF52DE' }]}>View Resume / Portfolio</Text></TouchableOpacity> : null}
          </View>

          <View style={styles.stats}>
            {[
              ['Connections', user.connections?.length || 0],
              ['Vault Notes', vaultCount],
              ['Projects', user.projectsCount || 0],
            ].map(([label, value]) => (
              <View style={styles.stat} key={label}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>
            ))}
          </View>

          {skillCount > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Currently Learning</Text>
              <View style={styles.skillGrid}>
                {user.skills.map((skill, index) => <View key={skill + index} style={[styles.skill, { backgroundColor: SKILL_COLORS[index % SKILL_COLORS.length] }]}><Code size={15} color="#fff" /><Text style={styles.skillText}>{skill}</Text></View>)}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.activity}><CheckCircle size={22} color="#34C759" /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.activityTitle}>Profile active</Text><Text style={styles.activitySub}>Keep your profile updated for classmates.</Text></View></View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!fullScreenAvatar} transparent animationType="fade" onRequestClose={() => setFullScreenAvatar(null)}>
        <View style={styles.fullScreenAvatarOverlay}>
          <TouchableOpacity style={styles.fullScreenAvatarClose} onPress={() => setFullScreenAvatar(null)}><X size={28} color="#fff" /></TouchableOpacity>
          {fullScreenAvatar && <Image source={{ uri: fullScreenAvatar }} style={styles.fullScreenAvatarImage} resizeMode="contain" />}
        </View>
      </Modal>

      <Modal
        visible={editVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>EDIT PROFILE</Text>
                <Text style={styles.modalTitle}>Edit Profile</Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setEditVisible(false)}
                accessibilityLabel="Close edit profile"
              >
                <X size={24} color="#111111" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.form}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              automaticallyAdjustKeyboardInsets
            >
              <Text style={styles.formSectionTitle}>Identity</Text>
              <Text style={styles.formSectionHint}>How classmates identify you on WeConnect.</Text>

              {[
                ['name', 'Full Name'],
                ['handle', 'Username / Handle'],
                ['course', 'Course / Major'],
                ['gradYear', 'Class of'],
                ['location', 'Campus Location'],
              ].map(([key, label]) => (
                <View key={key}>
                  <Text style={styles.label}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(form?.[key] ?? '')}
                    onChangeText={(value) => setForm({ ...form, [key]: value })}
                    placeholder={label}
                    placeholderTextColor="#9A9A93"
                    keyboardType={key === 'gradYear' ? 'numeric' : 'default'}
                    autoCapitalize={key === 'handle' ? 'none' : 'sentences'}
                    autoCorrect={key !== 'handle'}
                  />
                </View>
              ))}

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>About</Text>
                <Text style={styles.formSectionHint}>Tell people a little about yourself.</Text>
                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={form?.bio || ''}
                  onChangeText={(value) => setForm({ ...form, bio: value })}
                  placeholder="A short bio..."
                  placeholderTextColor="#9A9A93"
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Social & Links</Text>
                <Text style={styles.formSectionHint}>Add links classmates can use to find your work.</Text>
                {[
                  ['website', 'Website'],
                  ['instagram', 'Instagram Username / URL'],
                  ['linkedin', 'LinkedIn Username / URL'],
                  ['github', 'GitHub Username / URL'],
                  ['whatsapp', 'WhatsApp Number'],
                  ['resumeLink', 'Resume / Portfolio Link'],
                ].map(([key, label]) => (
                  <View key={key}>
                    <Text style={styles.label}>{label}</Text>
                    <TextInput
                      style={styles.input}
                      value={String(form?.[key] ?? '')}
                      onChangeText={(value) => setForm({ ...form, [key]: value })}
                      placeholder={label}
                      placeholderTextColor="#9A9A93"
                      keyboardType={key === 'whatsapp' ? 'phone-pad' : key === 'website' || key === 'instagram' || key === 'linkedin' || key === 'github' || key === 'resumeLink' ? 'url' : 'default'}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Projects & Skills</Text>
                <Text style={styles.formSectionHint}>Show what you're building and learning.</Text>

                <Text style={styles.label}>Projects Completed</Text>
                <TextInput
                  style={styles.input}
                  value={String(form?.projectsCount ?? '')}
                  onChangeText={(value) => setForm({ ...form, projectsCount: value.replace(/[^0-9]/g, '') })}
                  placeholder="0"
                  placeholderTextColor="#9A9A93"
                  keyboardType="numeric"
                />

                <Text style={styles.label}>Currently Learning</Text>
                <View style={styles.addSkillRow}>
                  <TextInput
                    style={[styles.input, styles.skillInput]}
                    value={newSkill}
                    onChangeText={setNewSkill}
                    placeholder="e.g. Node.js"
                    placeholderTextColor="#9A9A93"
                    autoCapitalize="words"
                  />
                  <TouchableOpacity
                    style={styles.addSkill}
                    onPress={addSkill}
                    accessibilityLabel="Add skill"
                  >
                    <Plus size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

                <View style={styles.editSkills}>
                  {form?.skills?.map((skill) => (
                    <View style={styles.editSkill} key={skill}>
                      <Text style={styles.editSkillText}>{skill}</Text>
                      <TouchableOpacity
                        onPress={() => setForm({ ...form, skills: form.skills.filter((item) => item !== skill) })}
                        accessibilityLabel={`Remove ${skill}`}
                      >
                        <Trash2 size={14} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveProfile}
                disabled={saving}
                activeOpacity={0.86}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}
              </TouchableOpacity>

              <View style={styles.formBottomSpace} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 210, position: 'relative', backgroundColor: '#0f172a' },
  coverImage: { ...StyleSheet.absoluteFillObject },
  coverFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0f172a' },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.3)' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 18, paddingTop: 8 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  coverEdit: { position: 'absolute', right: 18, bottom: 38, padding: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,.5)' },
  body: { marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fff', padding: 20, paddingBottom: 60 },
  avatarWrap: { width: 100, height: 100, marginTop: -68, position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: '#fff', backgroundColor: '#e2e8f0' },
  avatarEdit: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  fullScreenAvatarOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.98)', alignItems: 'center', justifyContent: 'center' },
  fullScreenAvatarImage: { width: '92%', height: '75%' },
  fullScreenAvatarClose: { position: 'absolute', top: 48, right: 18, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 50, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' },
  actionRow: { alignItems: 'flex-end', marginTop: -32, marginBottom: 18 },
  editButton: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: '#dbe1e8' },
  editText: { fontWeight: '800', color: '#0f172a' },
  messageButton: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, backgroundColor: '#007AFF' },
  messageText: { color: '#fff', fontWeight: '800' },
  name: { fontSize: 25, fontWeight: '800', color: '#0f172a' },
  handle: { color: '#64748b', marginTop: 3 },
  course: { color: '#007AFF', fontWeight: '700', marginTop: 8 },
  bio: { color: '#334155', fontSize: 15, lineHeight: 22, marginTop: 12 },
  info: { marginTop: 15, gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: '#64748b' },
  linkText: { color: '#007AFF', flex: 1 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingVertical: 15, marginTop: 20 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  statLabel: { color: '#64748b', fontSize: 12, marginTop: 3 },
  section: { marginTop: 25 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12 },
  skillText: { color: '#fff', fontWeight: '700' },
  activity: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 15, backgroundColor: '#f8fafc' },
  activityTitle: { fontWeight: '800', color: '#0f172a' },
  activitySub: { color: '#64748b', marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.52)', justifyContent: 'flex-end' },
  modal: { height: '92%', backgroundColor: '#F7F7F5', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  modalHeader: { minHeight: 82, paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5DF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#8A8A84', marginBottom: 2 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#111111' },
  modalClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  formScroll: { flex: 1 },
  form: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  formSection: { marginTop: 28 },
  formSectionTitle: { fontSize: 17, fontWeight: '900', color: '#111111', marginBottom: 4 },
  formSectionHint: { fontSize: 11.5, lineHeight: 17, color: '#85857E', marginBottom: 7 },
  label: { color: '#62625C', fontSize: 11, fontWeight: '800', marginTop: 14, marginBottom: 7 },
  input: { minHeight: 49, borderWidth: 1, borderColor: '#E0E0DA', backgroundColor: '#FFFFFF', borderRadius: 13, paddingHorizontal: 14, color: '#111111', fontSize: 14 },
  multiline: { minHeight: 92, paddingTop: 12 },
  addSkillRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  skillInput: { flex: 1 },
  addSkill: { width: 49, height: 49, borderRadius: 13, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' },
  editSkills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  editSkill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF4F5', borderWidth: 1, borderColor: '#FFD5D9', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14 },
  editSkillText: { color: '#B4233A', fontWeight: '800', fontSize: 12 },
  saveButton: { height: 54, backgroundColor: '#111111', borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  saveText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  formBottomSpace: { height: 35 },
});

export default ProfileScreen;
