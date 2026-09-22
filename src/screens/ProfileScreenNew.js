import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
  Award, BookOpen, BriefcaseBusiness, Camera, Check, ChevronRight, Code2, Edit3,
  Github, Globe, GraduationCap, Instagram, Link as LinkIcon, Linkedin, MapPin,
  MessageCircle, Plus, Settings, ShieldCheck, Trash2, UserRound, X, Youtube,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../config/firebase';
import { getPrivateUserProfile, getUserProfile, FALLBACK_AVATAR } from '../services/userService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { areConnected, sendConnectionRequest } from '../services/connectionService';
import { blockUser, isBlockedByMe, reportUser } from '../services/safetyService';
import FeedbackModal from '../components/FeedbackModal';

const YELLOW = '#FFFC00';
const BG = '#F6F6F2';
const CARD = '#FFFFFF';
const TEXT = '#111111';
const MUTED = '#74746D';
const BORDER = '#E4E4DE';

const initials = (name = 'Student') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

function EditModal({ visible, title, fields, values, onChange, onSave, onClose, saving }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.editModal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>EDIT</Text>
              <Text style={styles.modalTitle}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={onClose}><X size={20} color={TEXT} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {fields.map((field) => (
              <View key={field.key} style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <TextInput
                  value={values[field.key] ?? ''}
                  onChangeText={(value) => onChange(field.key, value)}
                  placeholder={field.placeholder}
                  placeholderTextColor="#A0A098"
                  multiline={field.multiline}
                  keyboardType={field.keyboardType || 'default'}
                  autoCapitalize={field.url ? 'none' : 'sentences'}
                  style={[styles.fieldInput, field.multiline && styles.fieldMultiline]}
                />
              </View>
            ))}
            <TouchableOpacity style={styles.saveButton} onPress={onSave} disabled={saving}>
              {saving ? <ActivityIndicator color={TEXT} /> : <><Check size={18} color={TEXT} /><Text style={styles.saveButtonText}>Save changes</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileScreenNew({ route, navigation }) {
  const currentUser = auth.currentUser;
  const targetUid = route?.params?.uid || currentUser?.uid;
  const isSelf = targetUid === currentUser?.uid;

  const [user, setUser] = useState(null);
  const [privateProfile, setPrivateProfile] = useState(null);
  const [vaultCount, setVaultCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalValues, setModalValues] = useState({});
  const [skillInput, setSkillInput] = useState('');
  const [skillDraft, setSkillDraft] = useState([]);
  const [skillModal, setSkillModal] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const scrollRef = useRef(null);
  const projectsSectionY = useRef(0);
  const [fullAvatar, setFullAvatar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);
  const [fullCover, setFullCover] = useState(false);
  const [feedback, setFeedback] = useState({ visible: false, type: 'success', title: '', message: '' });

  const loadProfile = async () => {
    if (!targetUid) return;
    setLoading(true);
    try {
      const [profile, privateData] = await Promise.all([
        getUserProfile(targetUid),
        isSelf ? getPrivateUserProfile(targetUid) : Promise.resolve(null),
      ]);
      if (!profile) throw new Error('Profile not found');
      setUser(profile);
      setPrivateProfile(privateData);
      if (!isSelf) {
        try { setBlocked(await isBlockedByMe(targetUid)); } catch {}
        try { setConnected(await areConnected(currentUser?.uid, targetUid)); } catch {}
        try {
          const sentSnapshot = await getDocs(
            query(collection(db, 'connectionRequests'), where('senderId', '==', currentUser?.uid))
          );
          setPendingRequest(sentSnapshot.docs.some((item) => {
            const data = item.data() || {};
            return data.receiverId === targetUid && data.status === 'pending';
          }));
        } catch {}
      }
      try {
        const vaultSnap = await getDocs(query(collection(db, 'vault_files'), where('uploader.uid', '==', targetUid)));
        setVaultCount(vaultSnap.size);
      } catch {}
    } catch (error) {
      console.error('New profile load failed:', error);
      Alert.alert('Profile unavailable', error?.message || 'Could not load this profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [targetUid]);

  const openSection = (key, title, fields, initial) => {
    setModal({ key, title, fields });
    setModalValues(initial);
  };

  const saveSection = async () => {
    if (!modal || !currentUser || !isSelf) return;
    setSavingSection(modal.key);
    try {
      const next = {};
      modal.fields.forEach((field) => { next[field.key] = String(modalValues[field.key] ?? '').trim(); });
      if (modal.key === 'identity') {
        next.name = next.name || 'Student';
        next.displayName = next.name;
        next.handle = next.handle ? (next.handle.startsWith('@') ? next.handle : '@' + next.handle) : '';
      }
      if (modal.key === 'academic' || modal.key === 'projects') {
        next.projectsCount = Number.parseInt(next.projectsCount || '0', 10) || 0;
      }
      if (modal.key === 'contact') {
        await updateDoc(doc(db, 'userPrivate', currentUser.uid), { whatsapp: next.whatsapp || '' });
        setPrivateProfile((prev) => ({ ...(prev || {}), ...next }));
        setModal(null);
        return;
      }
      await updateDoc(doc(db, 'users', currentUser.uid), next);
      if (modal.key === 'identity') await updateProfile(currentUser, { displayName: next.name });
      setUser((prev) => ({ ...prev, ...next }));
      setModal(null);
    } catch (error) {
      console.error('Profile section save failed:', error);
      Alert.alert('Could not save', error?.message || 'Please try again.');
    } finally {
      setSavingSection(null);
    }
  };

  const pickImage = async (type) => {
    if (!isSelf) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Allow gallery access to update your profile.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.78,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setUploading(true);
      const uploaded = await uploadToCloudinary(result.assets[0].uri, 'image', {
        folder: type === 'cover' ? 'weconnect/profiles/covers' : 'weconnect/profiles/avatars',
        tags: type === 'cover' ? 'weconnect_profile_cover' : 'weconnect_profile_avatar',
        returnMetadata: true,
      });
      if (!uploaded?.secureUrl) throw new Error('Image upload failed.');
      const patch = type === 'avatar'
        ? { avatar: uploaded.secureUrl, photoURL: uploaded.secureUrl, avatarPublicId: uploaded.publicId || null }
        : { coverPhoto: uploaded.secureUrl, coverPhotoPublicId: uploaded.publicId || null };
      await updateDoc(doc(db, 'users', currentUser.uid), patch);
      if (type === 'avatar') await updateProfile(currentUser, { photoURL: uploaded.secureUrl });
      setUser((prev) => ({ ...prev, ...patch }));
    } catch (error) {
      Alert.alert('Upload failed', error?.message || 'Could not update the image.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (type) => {
    if (!isSelf) return;
    const isAvatar = type === 'avatar';
    const label = isAvatar ? 'profile picture' : 'cover picture';
    Alert.alert(
      'Remove picture?',
      `Your ${label} will be removed from your profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploading(true);
              const patch = isAvatar
                ? { avatar: null, photoURL: null, avatarPublicId: null }
                : { coverPhoto: null, coverPhotoPublicId: null };
              await updateDoc(doc(db, 'users', currentUser.uid), patch);
              if (isAvatar) await updateProfile(currentUser, { photoURL: null });
              setUser((prev) => ({ ...prev, ...patch }));
              setFullAvatar(false);
              setFullCover(false);
            } catch (error) {
              Alert.alert('Could not remove', error?.message || 'Please try again.');
            } finally {
              setUploading(false);
            }
          },
        },
      ],
    );
  };

  const openImageActions = (type) => {
    if (!isSelf) return;
    const hasImage = type === 'avatar' ? Boolean(user?.avatar) : Boolean(user?.coverPhoto);
    const label = type === 'avatar' ? 'Profile picture' : 'Cover picture';
    const actions = [
      { text: 'Change picture', onPress: () => pickImage(type) },
    ];
    if (hasImage) actions.push({ text: 'Remove picture', style: 'destructive', onPress: () => removeImage(type) });
    actions.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(label, 'Choose an action', actions);
  };

  const openSkillEditor = () => {
    setSkillDraft([...(user.skills || [])]);
    setSkillInput('');
    setSkillModal(true);
  };

  const addSkill = () => {
    const value = skillInput.trim();
    if (!value || !isSelf || skillDraft.includes(value)) return;
    setSkillDraft((current) => [...current, value].slice(0, 30));
    setSkillInput('');
  };

  const removeSkill = (skill) => {
    if (!isSelf) return;
    setSkillDraft((current) => current.filter((item) => item !== skill));
  };

  const saveSkills = async () => {
    if (!isSelf || skillSaving) return;
    setSkillSaving(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { skills: skillDraft });
      setUser((prev) => ({ ...prev, skills: skillDraft }));
      setSkillModal(false);
    } catch (error) {
      Alert.alert('Could not save skills', error?.message || 'Please try again.');
    } finally {
      setSkillSaving(false);
    }
  };

  const openLink = async (value) => {
    if (!value) return;
    const url = /^https?:\/\//i.test(value) ? value : 'https://' + value;
    try { await Linking.openURL(url); } catch { Alert.alert('Link unavailable', 'Could not open this link.'); }
  };

  const openWhatsApp = async () => {
    const digits = String(privateProfile?.whatsapp || '').replace(/\D/g, '');
    if (!digits) return;
    try { await Linking.openURL('https://wa.me/' + digits); } catch { Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp.'); }
  };

  const sendRequest = async () => {
    if (!user || !currentUser || connecting || pendingRequest) return;
    setConnecting(true);
    try {
      await sendConnectionRequest({
        sender: { uid: currentUser.uid, name: currentUser.displayName, avatar: currentUser.photoURL },
        receiver: user,
      });
      setPendingRequest(true);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Request sent',
        message: 'Your connection request has been sent. You will see the button update once the request is accepted or declined.',
      });
    } catch (error) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Could not connect',
        message: error?.message || 'Please try again in a moment.',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSafety = () => {
    Alert.alert('Profile safety', 'Choose an action.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block student', style: 'destructive', onPress: async () => {
        try { await blockUser(targetUid); setBlocked(true); } catch (e) { Alert.alert('Could not block', e?.message || 'Please try again.'); }
      }},
      { text: 'Report student', onPress: () => {
        Alert.alert('Report student', 'Choose a reason.', [
          { text: 'Spam / scam', onPress: () => reportUser({ targetId: targetUid, reason: 'Spam / scam' }).catch(() => {}) },
          { text: 'Harassment / abuse', onPress: () => reportUser({ targetId: targetUid, reason: 'Harassment / abuse' }).catch(() => {}) },
          { text: 'Impersonation', onPress: () => reportUser({ targetId: targetUid, reason: 'Impersonation' }).catch(() => {}) },
        ]);
      }},
    ]);
  };

  const identityFields = [
    { key: 'name', label: 'Full name', placeholder: 'Your name' },
    { key: 'handle', label: 'Username', placeholder: '@username', url: true },
    { key: 'bio', label: 'About you', placeholder: 'A short student bio', multiline: true },
    { key: 'location', label: 'Campus location', placeholder: 'e.g. Akurdi, Pune' },
  ];
  const academicFields = [
    { key: 'course', label: 'Course / program', placeholder: 'e.g. B.Tech CSE' },
    { key: 'year', label: 'Current year', placeholder: 'e.g. 2nd Year' },
    { key: 'gradYear', label: 'Graduation year', placeholder: 'e.g. 2029' },
    { key: 'projectsCount', label: 'Projects completed', placeholder: '0', keyboardType: 'numeric' },
  ];
  const linkFields = [
    { key: 'website', label: 'Website / portfolio', placeholder: 'https://...', url: true },
    { key: 'github', label: 'GitHub', placeholder: 'https://github.com/... ', url: true },
    { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...', url: true },
    { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...', url: true },
    { key: 'resumeLink', label: 'Resume / CV', placeholder: 'https://...', url: true },
  ];
  const contactFields = [
    { key: 'whatsapp', label: 'WhatsApp number', placeholder: 'Country code + number', keyboardType: 'phone-pad' },
  ];

  const linkItems = [
    ['GitHub', user?.github, Github],
    ['LinkedIn', user?.linkedin, Linkedin],
    ['Instagram', user?.instagram, Instagram],
    ['Website', user?.website, Globe],
    ['Resume / CV', user?.resumeLink, LinkIcon],
  ].filter((item) => item[1]);

  const stats = useMemo(() => [
    ['Connections', user?.connections?.length || 0],
    ['Vault', vaultCount],
    ['Projects', user?.projectsCount || 0],
  ], [user, vaultCount]);

  if (loading || !user) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color={TEXT} /><Text style={styles.loadingText}>Loading profile…</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.coverTouchable} activeOpacity={0.96} onPress={() => user.coverPhoto && setFullCover(true)}>
            {user.coverPhoto ? <Image source={{ uri: user.coverPhoto }} style={styles.coverImage} /> : <View style={styles.coverFallback}><GraduationCap size={70} color="#5E5E58" /></View>}
            <View style={styles.coverOverlay} />
          </TouchableOpacity>
          {isSelf ? (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel="Open Settings"
            >
              <Settings size={20} color={TEXT} />
            </TouchableOpacity>
          ) : null}
          {isSelf ? <TouchableOpacity style={styles.coverEdit} onPress={() => openImageActions('cover')} accessibilityLabel="Edit cover picture"><Camera size={18} color={TEXT} /></TouchableOpacity> : null}
          {uploading ? <View style={styles.uploading}><ActivityIndicator color={TEXT} /></View> : null}
        </View>

        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarShell} onPress={() => setFullAvatar(true)} activeOpacity={0.9}>
            <Image source={{ uri: user.avatar || FALLBACK_AVATAR }} style={styles.avatar} />
            {isSelf ? <TouchableOpacity style={styles.avatarEdit} onPress={() => openImageActions('avatar')} accessibilityLabel="Edit profile picture"><Camera size={14} color={TEXT} /></TouchableOpacity> : null}
          </TouchableOpacity>

          <View style={styles.heroActions}>
            {isSelf ? (
              <TouchableOpacity style={styles.yellowAction} onPress={() => openSection('identity', 'Identity & About', identityFields, { name: user.name, handle: user.handle, bio: user.bio, location: user.location })}>
                <Edit3 size={16} color={TEXT} /><Text style={styles.yellowActionText}>Edit intro</Text>
              </TouchableOpacity>
            ) : (
              <>
                {!connected && !blocked ? (
                  <TouchableOpacity
                    style={[styles.yellowAction, pendingRequest && styles.pendingAction]}
                    onPress={sendRequest}
                    disabled={connecting || pendingRequest}
                  >
                    {pendingRequest ? <Check size={16} color={TEXT} /> : <Plus size={16} color={TEXT} />}
                    <Text style={styles.yellowActionText}>{connecting ? 'Sending…' : pendingRequest ? 'Request sent' : 'Connect'}</Text>
                  </TouchableOpacity>
                ) : null}
                {connected && !blocked ? <TouchableOpacity style={styles.darkAction} onPress={() => navigation.navigate('ChatRoom', { uid: targetUid, name: user.name, avatar: user.avatar })}><MessageCircle size={16} color="#FFFFFF" /><Text style={styles.darkActionText}>Message</Text></TouchableOpacity> : null}
                <TouchableOpacity style={styles.safetyAction} onPress={handleSafety} accessibilityLabel="Block or report student">
                  <ShieldCheck size={16} color={TEXT} />
                  <Text style={styles.safetyActionText}>Safety</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={styles.name}>{user.name || 'Student'}</Text>
          <Text style={styles.handle}>{user.handle || '@student'}</Text>
          <Text style={styles.course}>{user.course || 'Student'}</Text>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : <Text style={styles.bioMuted}>Add a short intro so classmates know what you study and build.</Text>}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}><MapPin size={15} color={MUTED} /><Text style={styles.metaText}>{user.location || 'Campus'}</Text></View>
            <View style={styles.metaItem}><GraduationCap size={15} color={MUTED} /><Text style={styles.metaText}>{user.year || 'Year not set'}</Text></View>
          </View>
        </View>

        <View style={styles.statsCard}>
          {stats.map(([label, value]) => (
            <TouchableOpacity
              style={styles.stat}
              key={label}
              activeOpacity={0.75}
              onPress={() => {
                if (label === 'Connections') {
                  navigation.getParent()?.navigate('Tabs', { screen: 'Connect' });
                } else if (label === 'Vault') {
                  navigation.getParent()?.navigate('Tabs', { screen: 'Vault' });
                } else if (label === 'Projects') {
                  scrollRef.current?.scrollTo({ y: projectsSectionY.current, animated: true });
                }
              }}
            >
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Section title="Academic profile" icon={<GraduationCap size={19} color={TEXT} />} editable={isSelf} onEdit={() => openSection('academic', 'Academic profile', academicFields, { course: user.course, year: user.year, gradYear: user.gradYear, projectsCount: String(user.projectsCount || 0) })}>
          <InfoGrid items={[
            ['College', user.collegeName || user.collegeId || 'Campus'],
            ['Program', user.course || 'Not added'],
            ['Current year', user.year || 'Not added'],
            ['Graduation', user.gradYear || 'Not added'],
          ]} />
        </Section>

        <Section title="Currently learning" icon={<BookOpen size={19} color={TEXT} />} editable={isSelf} onEdit={openSkillEditor}>
          <View style={styles.skillWrap}>
            {(user.skills || []).map((skill) => (
              <View style={styles.skillPill} key={skill}>
                <Code2 size={13} color={TEXT} /><Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}
            {!user.skills?.length ? <Text style={styles.emptyText}>Add technologies, subjects or skills you are currently learning.</Text> : null}
          </View>
        </Section>

        <View onLayout={(event) => { projectsSectionY.current = event.nativeEvent.layout.y; }}>
          <Section title="Projects & work" icon={<BriefcaseBusiness size={19} color={TEXT} />} editable={isSelf} onEdit={() => openSection('projects', 'Projects & work', [{ key: 'projectsCount', label: 'Projects completed', placeholder: '0', keyboardType: 'numeric' }], { projectsCount: String(user.projectsCount || 0) })}>
          <View style={styles.projectRow}>
            <View style={styles.projectIcon}><Code2 size={22} color={TEXT} /></View>
            <View style={{ flex: 1 }}><Text style={styles.projectTitle}>{user.projectsCount || 0} projects completed</Text><Text style={styles.projectSub}>Builds, hackathons and academic work can be highlighted through your portfolio.</Text></View>
          </View>
          {user.resumeLink ? <TouchableOpacity style={styles.linkRow} onPress={() => openLink(user.resumeLink)}><LinkIcon size={17} color={TEXT} /><Text style={styles.linkRowText}>Open resume / portfolio</Text><ChevronRight size={17} color={MUTED} /></TouchableOpacity> : null}
          </Section>
        </View>

        <Section title="Links & portfolio" icon={<Globe size={19} color={TEXT} />} editable={isSelf} onEdit={() => openSection('links', 'Links & portfolio', linkFields, { website: user.website, github: user.github, linkedin: user.linkedin, instagram: user.instagram, resumeLink: user.resumeLink })}>
          {linkItems.length ? linkItems.map(([label, value, Icon]) => (
            <TouchableOpacity key={label} style={styles.linkRow} onPress={() => openLink(value)}>
              <Icon size={17} color={TEXT} /><View style={{ flex: 1 }}><Text style={styles.linkRowText}>{label}</Text><Text style={styles.linkUrl} numberOfLines={1}>{value}</Text></View><ChevronRight size={17} color={MUTED} />
            </TouchableOpacity>
          )) : <Text style={styles.emptyText}>Add GitHub, LinkedIn, Instagram, portfolio or resume links.</Text>}
        </Section>

        <Section title="Contact" icon={<MessageCircle size={19} color={TEXT} />} editable={isSelf} onEdit={() => openSection('contact', 'Private contact', contactFields, { whatsapp: privateProfile?.whatsapp || '' })}>
          {isSelf ? (
            <TouchableOpacity style={styles.contactRow} onPress={openWhatsApp}>
              <View style={styles.contactIcon}><MessageCircle size={18} color={TEXT} /></View>
              <View style={{ flex: 1 }}><Text style={styles.linkRowText}>WhatsApp</Text><Text style={styles.linkUrl}>{privateProfile?.whatsapp ? 'Saved privately' : 'Not added'}</Text></View>
              <ChevronRight size={17} color={MUTED} />
            </TouchableOpacity>
          ) : <Text style={styles.emptyText}>Private contact details are visible only to the account owner.</Text>}
        </Section>

        <Section title="Student activity" icon={<Award size={19} color={TEXT} />}>
          <View style={styles.activityGrid}>
            <Activity label="Vault resources" value={vaultCount} />
            <Activity label="Connections" value={user.connections?.length || 0} />
            <Activity label="Projects" value={user.projectsCount || 0} />
          </View>
          <View style={styles.activityNote}><Text style={styles.activityNoteTitle}>Campus-first profile</Text><Text style={styles.activityNoteText}>Your academic identity, skills and work stay organized for classmates and campus networking.</Text></View>
        </Section>

        <View style={styles.footerCard}>
          <ShieldCheck size={18} color={TEXT} />
          <Text style={styles.footerText}>WeConnect keeps private contact information separate from the public student profile.</Text>
        </View>
      </ScrollView>

      <Modal visible={fullCover} transparent animationType="fade" onRequestClose={() => setFullCover(false)}>
        <TouchableOpacity style={styles.coverModal} activeOpacity={1} onPress={() => setFullCover(false)}>
          {user.coverPhoto ? <Image source={{ uri: user.coverPhoto }} style={styles.fullCover} resizeMode="contain" /> : null}
          <View style={styles.coverModalLabel}>
            <Text style={styles.coverModalTitle}>{user.name || 'Student'}'s cover photo</Text>
            <Text style={styles.coverModalHint}>Tap anywhere to close</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={fullAvatar} transparent animationType="fade" onRequestClose={() => setFullAvatar(false)}>
        <TouchableOpacity style={styles.avatarModal} activeOpacity={1} onPress={() => setFullAvatar(false)}>
          <Image source={{ uri: user.avatar || FALLBACK_AVATAR }} style={styles.fullAvatar} />
          <View style={styles.avatarName}><Text style={styles.avatarNameText}>{user.name}</Text><Text style={styles.avatarHint}>Tap outside to close</Text></View>
        </TouchableOpacity>
      </Modal>

      <FeedbackModal
        visible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onClose={() => setFeedback((current) => ({ ...current, visible: false }))}
      />

      <EditModal
        visible={!!modal}
        title={modal?.title || ''}
        fields={modal?.fields || []}
        values={modalValues}
        onChange={(key, value) => setModalValues((prev) => ({ ...prev, [key]: value }))}
        onSave={saveSection}
        onClose={() => setModal(null)}
        saving={savingSection === modal?.key}
      />

      <Modal visible={skillModal} transparent animationType="slide" onRequestClose={() => setSkillModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editModal}>
            <View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>EDIT</Text><Text style={styles.modalTitle}>Currently learning</Text></View><TouchableOpacity style={styles.modalClose} onPress={() => setSkillModal(false)}><X size={20} color={TEXT} /></TouchableOpacity></View>
            <View style={styles.skillEditor}>
              <Text style={styles.fieldLabel}>Add a skill or technology</Text>
              <View style={styles.skillInputRow}><TextInput value={skillInput} onChangeText={setSkillInput} placeholder="e.g. React Native" placeholderTextColor="#A0A098" style={[styles.fieldInput, { flex: 1 }]} onSubmitEditing={addSkill} /><TouchableOpacity style={styles.addSkillButton} onPress={addSkill}><Plus size={19} color={TEXT} /></TouchableOpacity></View>
              <View style={styles.skillWrap}>{skillDraft.map((skill) => <View key={skill} style={styles.skillPill}><Code2 size={13} color={TEXT} /><Text style={styles.skillText}>{skill}</Text><TouchableOpacity onPress={() => removeSkill(skill)}><Trash2 size={13} color="#777770" /></TouchableOpacity></View>)}</View>
              <TouchableOpacity style={styles.saveButton} onPress={saveSkills} disabled={skillSaving}>
                {skillSaving ? <ActivityIndicator color={TEXT} /> : <><Check size={18} color={TEXT} /><Text style={styles.saveButtonText}>Save changes</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, icon, editable, onEdit, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>
        {editable ? <TouchableOpacity style={styles.editChip} onPress={onEdit}><Edit3 size={13} color={TEXT} /><Text style={styles.editChipText}>Edit</Text></TouchableOpacity> : null}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function InfoGrid({ items }) {
  return <View style={styles.infoGrid}>{items.map(([label, value]) => <View style={styles.infoCell} key={label}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={2}>{value}</Text></View>)}</View>;
}

function Activity({ label, value }) {
  return <View style={styles.activityCell}><Text style={styles.activityValue}>{value}</Text><Text style={styles.activityLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  page: { paddingBottom: 110 },
  loading: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, color: MUTED, fontSize: 12, fontWeight: '700' },
  hero: { height: 230, backgroundColor: YELLOW, overflow: 'hidden' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,252,0,.18)' },
  coverTouchable: { flex: 1 },
  settingsButton: { position: 'absolute', right: 14, top: 10, width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.88)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,.08)' },
  coverEdit: { position: 'absolute', right: 14, bottom: 48, width: 40, height: 40, borderRadius: 14, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D9D600' },
  uploading: { position: 'absolute', right: 14, top: 10, width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.82)', alignItems: 'center', justifyContent: 'center' },
  profileCard: { marginHorizontal: 12, marginTop: -34, padding: 17, paddingTop: 0, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, shadowColor: '#000', shadowOpacity: .05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  avatarShell: { width: 104, height: 104, marginTop: -52, borderRadius: 52, borderWidth: 4, borderColor: CARD, backgroundColor: '#E8E8E2', position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarEdit: { position: 'absolute', right: -1, bottom: -1, width: 30, height: 30, borderRadius: 15, backgroundColor: YELLOW, borderWidth: 2, borderColor: CARD, alignItems: 'center', justifyContent: 'center' },
  heroActions: { position: 'absolute', right: 14, top: 15, flexDirection: 'row', gap: 7 },
  yellowAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, backgroundColor: YELLOW, borderWidth: 1, borderColor: '#D8D500', flexDirection: 'row', alignItems: 'center', gap: 6 },
  yellowActionText: { color: TEXT, fontWeight: '900', fontSize: 11 },
  darkAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, backgroundColor: TEXT, flexDirection: 'row', alignItems: 'center', gap: 6 },
  darkActionText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  pendingAction: { backgroundColor: '#E8E8E3', borderColor: '#D2D2CC' },
  safetyAction: { minHeight: 38, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#F0F0EB', flexDirection: 'row', alignItems: 'center', gap: 5 },
  safetyActionText: { color: TEXT, fontSize: 10, fontWeight: '900' },
  name: { marginTop: 11, fontSize: 25, fontWeight: '900', color: TEXT, letterSpacing: -.6 },
  handle: { marginTop: 2, fontSize: 12, color: MUTED, fontWeight: '700' },
  course: { marginTop: 10, fontSize: 13, color: TEXT, fontWeight: '900' },
  bio: { marginTop: 9, color: '#34342F', fontSize: 13, lineHeight: 19 },
  bioMuted: { marginTop: 9, color: '#989890', fontSize: 13, lineHeight: 19 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: MUTED, fontSize: 11, fontWeight: '700' },
  statsCard: { marginHorizontal: 12, marginTop: 9, minHeight: 76, borderRadius: 20, backgroundColor: TEXT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 12 },
  stat: { alignItems: 'center', minWidth: 90 },
  statValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  statLabel: { color: '#C9C9C2', fontSize: 10, marginTop: 3, fontWeight: '700' },
  section: { marginHorizontal: 12, marginTop: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, paddingHorizontal: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { color: TEXT, fontSize: 16, fontWeight: '900' },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: YELLOW, borderWidth: 1, borderColor: '#D8D500' },
  editChipText: { color: TEXT, fontSize: 10, fontWeight: '900' },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 19, padding: 14 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  infoCell: { width: '48%', minHeight: 64, backgroundColor: '#F8F8F4', borderRadius: 14, padding: 11 },
  infoLabel: { color: '#909089', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .5 },
  infoValue: { color: TEXT, fontSize: 12, fontWeight: '800', marginTop: 5 },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  skillPill: { minHeight: 34, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#FFFEE0', borderWidth: 1, borderColor: '#E9E600', flexDirection: 'row', alignItems: 'center', gap: 5 },
  skillText: { color: TEXT, fontSize: 11, fontWeight: '800' },
  emptyText: { color: '#92928A', fontSize: 12, lineHeight: 18 },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  projectTitle: { color: TEXT, fontSize: 14, fontWeight: '900' },
  projectSub: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 3 },
  linkRow: { minHeight: 54, borderRadius: 13, backgroundColor: '#F8F8F4', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
  linkRowText: { color: TEXT, fontSize: 12, fontWeight: '900' },
  linkUrl: { color: MUTED, fontSize: 10, marginTop: 2, flexShrink: 1 },
  contactRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' },
  activityGrid: { flexDirection: 'row', gap: 8 },
  activityCell: { flex: 1, minHeight: 70, borderRadius: 14, backgroundColor: '#F8F8F4', alignItems: 'center', justifyContent: 'center' },
  activityValue: { fontSize: 18, fontWeight: '900', color: TEXT },
  activityLabel: { fontSize: 9, color: MUTED, marginTop: 4, textAlign: 'center', fontWeight: '700' },
  activityNote: { marginTop: 9, padding: 11, borderRadius: 14, backgroundColor: '#FFFEE0' },
  activityNoteTitle: { color: TEXT, fontSize: 11, fontWeight: '900' },
  activityNoteText: { color: '#5D5D55', fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  footerCard: { margin: 12, marginTop: 14, padding: 13, borderRadius: 17, backgroundColor: '#ECECE7', flexDirection: 'row', gap: 9, alignItems: 'center' },
  footerText: { flex: 1, color: '#686860', fontSize: 10.5, lineHeight: 15 },
  avatarModal: { flex: 1, backgroundColor: 'rgba(0,0,0,.94)', alignItems: 'center', justifyContent: 'center' },
  fullAvatar: { width: '88%', aspectRatio: 1, borderRadius: 22 },
  avatarName: { marginTop: 16, alignItems: 'center' },
  avatarNameText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  avatarHint: { color: '#BDBDB7', fontSize: 10, marginTop: 3 },
  coverModal: { flex: 1, backgroundColor: 'rgba(0,0,0,.96)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  fullCover: { width: '100%', height: '62%' },
  coverModalLabel: { alignItems: 'center', marginTop: 14 },
  coverModalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  coverModalHint: { color: '#BDBDB7', fontSize: 10, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  editModal: { maxHeight: '86%', backgroundColor: CARD, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: BORDER },
  modalHeader: { minHeight: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: BORDER },
  modalEyebrow: { color: '#96968F', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  modalTitle: { color: TEXT, fontSize: 18, fontWeight: '900', marginTop: 2 },
  modalClose: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  modalBody: { padding: 18, paddingBottom: 35 },
  fieldWrap: { marginBottom: 13 },
  fieldLabel: { color: '#6F6F68', fontSize: 10, fontWeight: '900', marginBottom: 6 },
  fieldInput: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F8F8F4', paddingHorizontal: 13, color: TEXT, fontSize: 13 },
  fieldMultiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  saveButton: { minHeight: 52, borderRadius: 16, backgroundColor: YELLOW, borderWidth: 1, borderColor: '#D8D500', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 5 },
  saveButtonText: { color: TEXT, fontWeight: '900', fontSize: 13 },
  skillEditor: { padding: 18 },
  skillInputRow: { flexDirection: 'row', gap: 8 },
  addSkillButton: { width: 48, height: 48, borderRadius: 14, backgroundColor: YELLOW, borderWidth: 1, borderColor: '#D8D500', alignItems: 'center', justifyContent: 'center' },
});

function Dummy(){return null}
