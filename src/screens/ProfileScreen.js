import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
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

  // Profile is a real stack screen when opened from another screen.
  // Follow the same hardware-back pattern used by Vault/Connect: handle it
  // only while this screen is focused, then let normal navigation pop it.
  useFocusEffect(
    useCallback(() => {
      if (route?.name !== 'ProfileDetails') return undefined;

      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }

        // Defensive fallback: never leave the authenticated app from ProfileDetails.
        navigation.navigate('MainTabs', { screen: 'Chats' });
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [navigation, route?.name])
  );
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
      if (type === 'avatar') await updateProfile(currentUser, { photoURL: url });
      setUser((prev) => ({ ...prev, [type === 'avatar' ? 'avatar' : 'coverPhoto']: url }));
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
            <Image source={{ uri: user.avatar || FALLBACK_AVATAR }} style={styles.avatar} />
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

      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>Edit Profile</Text><TouchableOpacity onPress={() => setEditVisible(false)}><X size={24} color="#0f172a" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.form}>
              {[
                ['name', 'Name'], ['handle', 'Username / Handle'], ['course', 'Course / Major'],
                ['gradYear', 'Class of'], ['location', 'Campus Location'], ['website', 'Website'], ['instagram', 'Instagram Username / URL'],
                ['linkedin', 'LinkedIn Username / URL'], ['github', 'GitHub Username / URL'], ['whatsapp', 'WhatsApp Number'],
                ['resumeLink', 'Resume / Portfolio Link'], ['projectsCount', 'Projects Completed'],
              ].map(([key, label]) => (
                <View key={key}>
                  <Text style={styles.label}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(form?.[key] ?? '')}
                    onChangeText={(value) => setForm({ ...form, [key]: value })}
                    keyboardType={key === 'projectsCount' || key === 'gradYear' || key === 'whatsapp' ? 'numeric' : key.includes('Link') || ['website','instagram','linkedin','github'].includes(key) ? 'url' : 'default'}
                    autoCapitalize={['handle','website','instagram','linkedin','github','resumeLink','whatsapp'].includes(key) ? 'none' : 'sentences'}
                  />
                </View>
              ))}
              <Text style={styles.label}>Bio</Text>
              <TextInput style={[styles.input, styles.multiline]} value={form?.bio} onChangeText={(value) => setForm({ ...form, bio: value })} multiline />

              <Text style={styles.label}>Currently Learning</Text>
              <View style={styles.addSkillRow}><TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={newSkill} onChangeText={setNewSkill} placeholder="e.g. Node.js" /><TouchableOpacity style={styles.addSkill} onPress={addSkill}><Plus size={20} color="#fff" /></TouchableOpacity></View>
              <View style={styles.editSkills}>
                {form?.skills?.map((skill) => (
                  <View style={styles.editSkill} key={skill}><Text style={styles.editSkillText}>{skill}</Text><TouchableOpacity onPress={() => setForm({ ...form, skills: form.skills.filter((item) => item !== skill) })}><Trash2 size={14} color="#FF3B30" /></TouchableOpacity></View>
                ))}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={saveProfile} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}</TouchableOpacity>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' },
  modal: { height: '88%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  form: { padding: 20, paddingBottom: 50 },
  label: { color: '#64748b', fontWeight: '700', marginTop: 14, marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 13, color: '#0f172a' },
  multiline: { height: 85, textAlignVertical: 'top', paddingTop: 12 },
  addSkillRow: { flexDirection: 'row', gap: 8 },
  addSkill: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  editSkills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  editSkill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14 },
  editSkillText: { color: '#be123c', fontWeight: '700' },
  saveButton: { height: 52, backgroundColor: '#007AFF', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

export default ProfileScreen;
