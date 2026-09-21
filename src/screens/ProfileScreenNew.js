import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
  Camera,
  CheckCircle,
  Code,
  Github,
  Globe,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  MapPin,
  Plus,
  Settings,
  Trash2,
  Twitter,
  X,
  Youtube,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { auth, db } from '../config/firebase';
import { getUserProfile, FALLBACK_AVATAR } from '../services/userService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

const SKILL_COLORS = ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#FF3B30', '#5856D6'];

const ProfileScreenNew = ({ route, navigation }) => {
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

    const loadProfile = async () => {
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
          instagram: '',
          linkedin: '',
          github: '',
          whatsapp: '',
        });

        const vaultSnap = await getDocs(
          query(
            collection(db, 'vault_files'),
            where('uploader.uid', '==', targetUid)
          )
        );

        if (active) setVaultCount(vaultSnap.size);
      } catch (error) {
        console.error('Profile load failed:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [targetUid, route?.params]);

  const openEdit = () => {
    if (!user) return;

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

    setNewSkill('');
    setEditVisible(true);
  };

  const updateForm = (key, value) => {
    setForm((previous) => ({
      ...(previous || {}),
      [key]: value,
    }));
  };

  const addSkill = () => {
    const skill = newSkill.trim();

    if (!skill || form?.skills?.includes(skill)) return;

    setForm((previous) => ({
      ...(previous || {}),
      skills: [...(previous?.skills || []), skill],
    }));
    setNewSkill('');
  };

  const removeSkill = (skill) => {
    setForm((previous) => ({
      ...(previous || {}),
      skills: (previous?.skills || []).filter((item) => item !== skill),
    }));
  };

  const saveProfile = async () => {
    if (!form || !currentUser?.uid) return;

    setSaving(true);

    try {
      const name = form.name.trim();

      const next = {
        displayName: name,
        name,
        handle: form.handle.trim().startsWith('@')
          ? form.handle.trim()
          : '@' + form.handle.trim(),
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
        skills: form.skills || [],
      };

      await updateDoc(doc(db, 'users', currentUser.uid), next);
      await updateProfile(currentUser, { displayName: next.displayName });

      setUser((previous) => ({
        ...previous,
        ...next,
      }));

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
        Alert.alert(
          'Permission required',
          'Allow gallery access to change your profile photo.'
        );
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

      if (type === 'avatar') {
        patch.avatar = url;
      }

      await updateDoc(doc(db, 'users', currentUser.uid), patch);

      if (type === 'avatar') {
        await updateProfile(currentUser, { photoURL: url });
      }

      setUser((previous) => ({
        ...previous,
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
    const digits = String(value || '').replace(/\D/g, '');

    if (!digits) return;

    const url = `https://wa.me/${digits}`;

    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp.');
      }
    } catch {
      Alert.alert('Error', 'Could not open WhatsApp.');
    }
  };

  const openLink = async (value) => {
    if (!value) return;

    const url = /^https?:\/\//i.test(value)
      ? value
      : 'https://' + value;

    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Invalid link', 'This link cannot be opened.');
      }
    } catch {
      Alert.alert('Error', 'Could not open the link.');
    }
  };

  const socialIcon = (value) => {
    const url = String(value || '').toLowerCase();

    if (url.includes('github')) {
      return <Github size={16} color="#111111" />;
    }

    if (url.includes('linkedin')) {
      return <Linkedin size={16} color="#0077B5" />;
    }

    if (url.includes('instagram')) {
      return <Instagram size={16} color="#E1306C" />;
    }

    if (url.includes('youtube')) {
      return <Youtube size={16} color="#FF0000" />;
    }

    if (url.includes('twitter') || url.includes('x.com')) {
      return <Twitter size={16} color="#111111" />;
    }

    return <Globe size={16} color="#007AFF" />;
  };

  const skillCount = useMemo(
    () => user?.skills?.length || 0,
    [user]
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>Profile could not be loaded.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.profileScrollContent}
      >
        <View style={styles.cover}>
          {user.coverPhoto ? (
            <Image
              source={{ uri: user.coverPhoto }}
              style={styles.coverImage}
            />
          ) : (
            <View style={styles.coverFallback} />
          )}

          <View style={styles.coverShade} />

          <SafeAreaView style={styles.topBar}>
            {isSelf && (
              <TouchableOpacity
                style={styles.circleButton}
                onPress={() =>
                  Alert.alert(
                    'Settings',
                    'Profile settings can be added here.'
                  )
                }
              >
                <Settings size={21} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </SafeAreaView>

          {isSelf && (
            <TouchableOpacity
              style={styles.coverEdit}
              onPress={() => pickImage('cover')}
            >
              <Camera size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.profileBody}>
          <View style={styles.avatarWrap}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                setFullScreenAvatar(user.avatar || FALLBACK_AVATAR)
              }
            >
              <Image
                source={{ uri: user.avatar || FALLBACK_AVATAR }}
                style={styles.avatar}
              />
            </TouchableOpacity>

            {isSelf && (
              <TouchableOpacity
                style={styles.avatarEdit}
                onPress={() => pickImage('avatar')}
                disabled={uploading}
              >
                <Camera size={15} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {uploading && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.actionRow}>
            {isSelf ? (
              <TouchableOpacity
                style={styles.editButton}
                onPress={openEdit}
              >
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() =>
                  navigation.navigate('ChatRoom', {
                    uid: user.uid,
                    name: user.name,
                    avatar: user.avatar,
                  })
                }
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.handle}>{user.handle}</Text>

          <Text style={styles.course}>
            {user.course}
            {user.gradYear ? ' • Class of ' + user.gradYear : ''}
          </Text>

          {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          <View style={styles.info}>
            <View style={styles.infoRow}>
              <MapPin size={16} color="#64748B" />
              <Text style={styles.infoText}>{user.location}</Text>
            </View>

            {!!user.website && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => openLink(user.website)}
              >
                {socialIcon(user.website)}
                <Text style={styles.linkText}>
                  {user.website.replace(/^https?:\/\//, '')}
                </Text>
              </TouchableOpacity>
            )}

            {!!user.instagram && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() =>
                  openLink(
                    user.instagram.startsWith('http')
                      ? user.instagram
                      : 'https://instagram.com/' +
                        user.instagram.replace(/^@/, '')
                  )
                }
              >
                <Instagram size={16} color="#E1306C" />
                <Text style={styles.linkText}>Instagram</Text>
              </TouchableOpacity>
            )}

            {!!user.linkedin && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() =>
                  openLink(
                    user.linkedin.startsWith('http')
                      ? user.linkedin
                      : 'https://linkedin.com/in/' +
                        user.linkedin.replace(/^@/, '')
                  )
                }
              >
                <Linkedin size={16} color="#0077B5" />
                <Text style={styles.linkText}>LinkedIn</Text>
              </TouchableOpacity>
            )}

            {!!user.github && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() =>
                  openLink(
                    user.github.startsWith('http')
                      ? user.github
                      : 'https://github.com/' +
                        user.github.replace(/^@/, '')
                  )
                }
              >
                <Github size={16} color="#111111" />
                <Text style={styles.linkText}>GitHub</Text>
              </TouchableOpacity>
            )}

            {!!user.whatsapp && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => openWhatsApp(user.whatsapp)}
              >
                <Text style={styles.whatsappIcon}>W</Text>
                <Text style={styles.linkText}>WhatsApp</Text>
              </TouchableOpacity>
            )}

            {!!user.resumeLink && (
              <TouchableOpacity
                style={styles.infoRow}
                onPress={() => openLink(user.resumeLink)}
              >
                <LinkIcon size={16} color="#AF52DE" />
                <Text style={[styles.linkText, styles.resumeText]}>
                  View Resume / Portfolio
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.stats}>
            {[
              ['Connections', user.connections?.length || 0],
              ['Vault Notes', vaultCount],
              ['Projects', user.projectsCount || 0],
            ].map(([label, value]) => (
              <View style={styles.stat} key={label}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {skillCount > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Currently Learning</Text>

              <View style={styles.skillGrid}>
                {user.skills.map((skill, index) => (
                  <View
                    key={skill + index}
                    style={[
                      styles.skill,
                      {
                        backgroundColor:
                          SKILL_COLORS[index % SKILL_COLORS.length],
                      },
                    ]}
                  >
                    <Code size={15} color="#FFFFFF" />
                    <Text style={styles.skillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>

            <View style={styles.activity}>
              <CheckCircle size={22} color="#34C759" />

              <View style={styles.activityTextWrap}>
                <Text style={styles.activityTitle}>Profile active</Text>
                <Text style={styles.activitySub}>
                  Keep your profile updated for classmates.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={!!fullScreenAvatar}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenAvatar(null)}
      >
        <View style={styles.avatarModal}>
          <TouchableOpacity
            style={styles.avatarModalClose}
            onPress={() => setFullScreenAvatar(null)}
          >
            <X size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {!!fullScreenAvatar && (
            <Image
              source={{ uri: fullScreenAvatar }}
              style={styles.fullScreenAvatar}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={editVisible}
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <SafeAreaView style={styles.editorRoot}>
          <KeyboardAvoidingView
            style={styles.editorKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.editorHeader}>
              <View style={styles.editorHeaderCopy}>
                <Text style={styles.editorEyebrow}>PROFILE</Text>
                <Text style={styles.editorTitle}>Edit Profile</Text>
                <Text style={styles.editorSubtitle}>
                  Keep your WeConnect profile up to date.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.editorClose}
                onPress={() => setEditVisible(false)}
                accessibilityLabel="Close edit profile"
              >
                <X size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.editorScroll}
              contentContainerStyle={styles.editorContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === 'ios' ? 'interactive' : 'on-drag'
              }
            >
              <View style={styles.editorCard}>
                <Text style={styles.editorSectionTitle}>Identity</Text>
                <Text style={styles.editorHint}>
                  How classmates identify you on WeConnect.
                </Text>

                {[
                  ['name', 'Full Name'],
                  ['handle', 'Username / Handle'],
                  ['course', 'Course / Major'],
                  ['gradYear', 'Class of'],
                  ['location', 'Campus Location'],
                ].map(([key, label]) => (
                  <View key={key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{label}</Text>

                    <TextInput
                      style={styles.fieldInput}
                      value={String(form?.[key] ?? '')}
                      onChangeText={(value) => updateForm(key, value)}
                      placeholder={label}
                      placeholderTextColor="#9CA3AF"
                      keyboardType={
                        key === 'gradYear' ? 'numeric' : 'default'
                      }
                      autoCapitalize={
                        key === 'handle' ? 'none' : 'sentences'
                      }
                      autoCorrect={key !== 'handle'}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.editorCard}>
                <Text style={styles.editorSectionTitle}>About</Text>
                <Text style={styles.editorHint}>
                  Tell people a little about yourself.
                </Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Bio</Text>

                  <TextInput
                    style={[styles.fieldInput, styles.bioInput]}
                    value={form?.bio || ''}
                    onChangeText={(value) => updateForm('bio', value)}
                    placeholder="A short bio..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </View>

              <View style={styles.editorCard}>
                <Text style={styles.editorSectionTitle}>Social & Links</Text>
                <Text style={styles.editorHint}>
                  Add links classmates can use to find your work.
                </Text>

                {[
                  ['website', 'Website'],
                  ['instagram', 'Instagram Username / URL'],
                  ['linkedin', 'LinkedIn Username / URL'],
                  ['github', 'GitHub Username / URL'],
                  ['whatsapp', 'WhatsApp Number'],
                  ['resumeLink', 'Resume / Portfolio Link'],
                ].map(([key, label]) => (
                  <View key={key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{label}</Text>

                    <TextInput
                      style={styles.fieldInput}
                      value={String(form?.[key] ?? '')}
                      onChangeText={(value) => updateForm(key, value)}
                      placeholder={label}
                      placeholderTextColor="#9CA3AF"
                      keyboardType={
                        key === 'whatsapp'
                          ? 'phone-pad'
                          : 'url'
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.editorCard}>
                <Text style={styles.editorSectionTitle}>
                  Projects & Skills
                </Text>
                <Text style={styles.editorHint}>
                  Show what you are building and learning.
                </Text>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Projects Completed
                  </Text>

                  <TextInput
                    style={styles.fieldInput}
                    value={String(form?.projectsCount ?? '')}
                    onChangeText={(value) =>
                      updateForm(
                        'projectsCount',
                        value.replace(/[^0-9]/g, '')
                      )
                    }
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    Currently Learning
                  </Text>

                  <View style={styles.skillInputRow}>
                    <TextInput
                      style={[styles.fieldInput, styles.skillInput]}
                      value={newSkill}
                      onChangeText={setNewSkill}
                      placeholder="e.g. Node.js"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="words"
                    />

                    <TouchableOpacity
                      style={styles.addSkillButton}
                      onPress={addSkill}
                      accessibilityLabel="Add skill"
                    >
                      <Plus size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {!!form?.skills?.length && (
                  <View style={styles.skillChips}>
                    {form.skills.map((skill) => (
                      <View style={styles.skillChip} key={skill}>
                        <Text style={styles.skillChipText}>{skill}</Text>

                        <TouchableOpacity
                          onPress={() => removeSkill(skill)}
                          accessibilityLabel={`Remove ${skill}`}
                        >
                          <Trash2 size={14} color="#B4233A" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  saving && styles.saveButtonDisabled,
                ]}
                onPress={saveProfile}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    Save Changes
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.editorBottomSpace} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  profileScrollContent: {
    paddingBottom: 40,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    color: '#64748B',
    fontSize: 15,
  },
  cover: {
    height: 210,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
  },
  coverShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,.30)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEdit: {
    position: 'absolute',
    right: 18,
    bottom: 38,
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,.50)',
  },
  profileBody: {
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingBottom: 60,
  },
  avatarWrap: {
    width: 100,
    height: 100,
    marginTop: -68,
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#E2E8F0',
  },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    alignItems: 'flex-end',
    marginTop: -32,
    marginBottom: 18,
  },
  editButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DBE1E8',
  },
  editButtonText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  messageButton: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#007AFF',
  },
  messageButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  name: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
  },
  handle: {
    color: '#64748B',
    marginTop: 3,
  },
  course: {
    color: '#007AFF',
    fontWeight: '700',
    marginTop: 8,
  },
  bio: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  info: {
    marginTop: 15,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: '#64748B',
  },
  linkText: {
    color: '#007AFF',
    flex: 1,
  },
  resumeText: {
    color: '#AF52DE',
  },
  whatsappIcon: {
    width: 16,
    textAlign: 'center',
    fontWeight: '800',
    color: '#25D366',
  },
  stats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 15,
    marginTop: 20,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 3,
  },
  section: {
    marginTop: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
  },
  skillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
  },
  skillText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
  },
  activityTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  activityTitle: {
    fontWeight: '800',
    color: '#0F172A',
  },
  activitySub: {
    color: '#64748B',
    marginTop: 3,
  },
  avatarModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenAvatar: {
    width: '92%',
    height: '75%',
  },
  avatarModalClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  editorRoot: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  editorKeyboard: {
    flex: 1,
  },
  editorHeader: {
    minHeight: 96,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  editorEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#007AFF',
    marginBottom: 3,
  },
  editorTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  editorSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#6B7280',
  },
  editorClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorScroll: {
    flex: 1,
  },
  editorContent: {
    padding: 16,
    paddingBottom: 12,
  },
  editorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editorSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  editorHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
    marginBottom: 4,
  },
  field: {
    marginTop: 13,
  },
  fieldLabel: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 7,
  },
  fieldInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingHorizontal: 13,
    color: '#111827',
    fontSize: 14,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  skillInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skillInput: {
    flex: 1,
  },
  addSkillButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
  },
  skillChipText: {
    color: '#9F1239',
    fontWeight: '800',
    fontSize: 12,
  },
  saveButton: {
    height: 56,
    backgroundColor: '#007AFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  editorBottomSpace: {
    height: 28,
  },
});

export default ProfileScreenNew;
