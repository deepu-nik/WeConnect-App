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
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  Award,
  BriefcaseBusiness,
  Camera,
  CheckCircle2,
  ChevronRight,
  Code2,
  Edit3,
  ExternalLink,
  Github,
  Globe2,
  GraduationCap,
  Heart,
  Instagram,
  Link2,
  Linkedin,
  MapPin,
  MessageCircle,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  Users,
  X,
  Youtube,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { auth, db } from '../config/firebase';
import { FALLBACK_AVATAR, getUserProfile } from '../services/userService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

const COLORS = {
  ink: '#111111',
  muted: '#777770',
  blue: '#FFD60A',
  blueSoft: '#FFF8D6',
  border: '#E8E8E3',
  bg: '#F7F7F5',
  white: '#FFFFFF',
  green: '#16803C',
  purple: '#FFD60A',
  orange: '#FFD60A',
};

const DEFAULT_ARRAYS = {
  projects: [],
  achievements: [],
  certifications: [],
  experience: [],
  interests: [],
  languages: [],
  clubs: [],
};

const ProfileScreenNew = ({ route, navigation }) => {
  const currentUser = auth.currentUser;
  const targetUid = route?.params?.uid || currentUser?.uid;
  const isSelf = targetUid === currentUser?.uid;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [fullScreenAvatar, setFullScreenAvatar] = useState(null);
  const [activeSection, setActiveSection] = useState('Overview');
  const [form, setForm] = useState(null);

  const loadProfile = async () => {
    if (!targetUid) return;

    try {
      setLoading(true);
      const profile = await getUserProfile(targetUid);

      if (profile) {
        const raw = await getDoc(doc(db, 'users', targetUid));
        const data = raw.exists() ? raw.data() : {};
        setUser({
          ...profile,
          ...DEFAULT_ARRAYS,
          ...data,
          uid: targetUid,
          name: data.displayName || data.name || profile.name || 'Student',
          avatar: data.photoURL || data.avatar || profile.avatar || FALLBACK_AVATAR,
        });
      }
    } catch (error) {
      console.error('Profile load failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [targetUid]);

  const completion = useMemo(() => {
    if (!user) return 0;

    const checks = [
      !!user.name,
      !!user.handle,
      !!user.bio,
      !!user.avatar && user.avatar !== FALLBACK_AVATAR,
      !!user.course,
      !!user.gradYear,
      !!user.location,
      (user.skills || []).length > 0,
      (user.projects || []).length > 0,
      !!user.resumeLink,
      !!(user.linkedin || user.github),
      (user.interests || []).length > 0,
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [user]);

  const openEdit = () => {
    if (!user) return;

    setForm({
      name: user.name || '',
      handle: user.handle || '',
      bio: user.bio || '',
      location: user.location || '',
      course: user.course || '',
      gradYear: String(user.gradYear || ''),
      department: user.department || '',
      university: user.university || 'DY Patil International University',
      careerGoal: user.careerGoal || '',
      resumeLink: user.resumeLink || '',
      website: user.website || '',
      instagram: user.instagram || '',
      linkedin: user.linkedin || '',
      github: user.github || '',
      whatsapp: user.whatsapp || '',
      skills: [...(user.skills || [])],
      interests: [...(user.interests || [])],
      languages: [...(user.languages || [])],
      clubs: [...(user.clubs || [])],
    });
    setEditVisible(true);
  };

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addToArray = (key, value) => {
    const clean = value.trim();
    if (!clean || form[key]?.includes(clean)) return;
    updateForm(key, [...(form[key] || []), clean]);
  };

  const removeFromArray = (key, value) => {
    updateForm(key, (form[key] || []).filter((item) => item !== value));
  };

  const saveProfile = async () => {
    if (!form || !currentUser?.uid) return;

    setSaving(true);
    try {
      const name = form.name.trim();
      const next = {
        displayName: name,
        name,
        handle: form.handle.trim().startsWith('@') ? form.handle.trim() : '@' + form.handle.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        course: form.course.trim(),
        gradYear: form.gradYear.trim(),
        department: form.department.trim(),
        university: form.university.trim(),
        careerGoal: form.careerGoal.trim(),
        resumeLink: form.resumeLink.trim(),
        website: form.website.trim(),
        instagram: form.instagram.trim(),
        linkedin: form.linkedin.trim(),
        github: form.github.trim(),
        whatsapp: form.whatsapp.trim(),
        skills: form.skills || [],
        interests: form.interests || [],
        languages: form.languages || [],
        clubs: form.clubs || [],
      };

      await updateDoc(doc(db, 'users', currentUser.uid), next);
      await updateProfile(currentUser, { displayName: name });
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
        Alert.alert('Permission required', 'Allow gallery access to change your profile image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.75,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploading(true);
      const url = await uploadToCloudinary(result.assets[0].uri, 'image');
      if (!url) throw new Error('Upload failed');

      const patch = type === 'avatar'
        ? { avatar: url, photoURL: url }
        : { coverPhoto: url };

      await updateDoc(doc(db, 'users', currentUser.uid), patch);
      if (type === 'avatar') await updateProfile(currentUser, { photoURL: url });

      setUser((prev) => ({ ...prev, ...(type === 'avatar' ? { avatar: url, photoURL: url } : { coverPhoto: url }) }));
    } catch (error) {
      console.error('Image upload failed:', error);
      Alert.alert('Error', 'Could not update the image.');
    } finally {
      setUploading(false);
    }
  };

  const openLink = async (value) => {
    if (!value) return;
    const url = /^https?:\/\//i.test(value) ? value : 'https://' + value;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open this link.');
    }
  };

  const SectionButton = ({ icon: Icon, label }) => (
    <TouchableOpacity
      style={[styles.sectionTab, activeSection === label && styles.sectionTabActive]}
      onPress={() => setActiveSection(label)}
    >
      <Icon size={16} color={activeSection === label ? COLORS.blue : COLORS.muted} />
      <Text style={[styles.sectionTabText, activeSection === label && styles.sectionTabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const EmptyState = ({ icon: Icon, title, text }) => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Icon size={22} color={COLORS.muted} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.blue} /></View>;
  }

  if (!user) {
    return <View style={styles.loading}><Text style={styles.errorText}>Profile could not be loaded.</Text></View>;
  }

  const projects = user.projects || [];
  const achievements = user.achievements || [];
  const certifications = user.certifications || [];
  const experience = user.experience || [];
  const interests = user.interests || [];
  const skills = user.skills || [];
  const connections = user.connections || [];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.cover}>
          {user.coverPhoto ? <Image source={{ uri: user.coverPhoto }} style={styles.coverImage} /> : <View style={styles.coverFallback} />}
          <View style={styles.coverGradient} />
          <SafeAreaView style={styles.coverTop}>
            <View />
            {isSelf && (
              <TouchableOpacity style={styles.coverButton} onPress={() => pickImage('cover')}>
                <Camera size={18} color="#FFF" />
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </View>

        <View style={styles.hero}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarContainer}>
              <TouchableOpacity onPress={() => setFullScreenAvatar(user.avatar || FALLBACK_AVATAR)}>
                <Image source={{ uri: user.avatar || FALLBACK_AVATAR }} style={styles.avatar} />
              </TouchableOpacity>
              {isSelf && (
                <TouchableOpacity style={styles.avatarCamera} onPress={() => pickImage('avatar')} disabled={uploading}>
                  {uploading ? <ActivityIndicator size="small" color="#FFF" /> : <Camera size={15} color="#FFF" />}
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.heroActions}>
              {isSelf ? (
                <TouchableOpacity style={styles.primaryOutline} onPress={openEdit}>
                  <Edit3 size={15} color={COLORS.ink} />
                  <Text style={styles.primaryOutlineText}>Edit Profile</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => navigation.navigate('ChatRoom', { uid: user.uid, name: user.name, avatar: user.avatar })}
                >
                  <MessageCircle size={16} color="#FFF" />
                  <Text style={styles.primaryButtonText}>Message</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.name}>{user.name}</Text>
          {!!user.handle && <Text style={styles.handle}>{user.handle}</Text>}

          <View style={styles.identityLine}>
            {!!user.course && <Text style={styles.identityStrong}>{user.course}</Text>}
            {!!user.gradYear && <Text style={styles.identityMuted}>Class of {user.gradYear}</Text>}
          </View>

          {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          <View style={styles.metaRow}>
            {!!user.location && <View style={styles.metaItem}><MapPin size={15} color={COLORS.muted} /><Text style={styles.metaText}>{user.location}</Text></View>}
            {!!user.university && <View style={styles.metaItem}><GraduationCap size={15} color={COLORS.muted} /><Text style={styles.metaText}>{user.university}</Text></View>}
          </View>

          {!!user.careerGoal && (
            <View style={styles.goalPill}>
              <Sparkles size={14} color={COLORS.purple} />
              <Text style={styles.goalText}>{user.careerGoal}</Text>
            </View>
          )}

          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{connections.length}</Text><Text style={styles.statLabel}>Connections</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{projects.length}</Text><Text style={styles.statLabel}>Projects</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{skills.length}</Text><Text style={styles.statLabel}>Skills</Text></View>
          </View>

          {isSelf && (
            <View style={styles.completionCard}>
              <View style={styles.completionTop}>
                <View>
                  <Text style={styles.completionTitle}>Profile strength</Text>
                  <Text style={styles.completionSubtitle}>{completion}% complete</Text>
                </View>
                <Text style={styles.completionPercent}>{completion}%</Text>
              </View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: completion + '%' }]} /></View>
              <TouchableOpacity style={styles.completeAction} onPress={openEdit}>
                <Text style={styles.completeActionText}>{completion < 100 ? 'Complete your profile' : 'Keep your profile fresh'}</Text>
                <ChevronRight size={16} color={COLORS.blue} />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
            <SectionButton icon={UserRound} label="Overview" />
            <SectionButton icon={Code2} label="Projects" />
            <SectionButton icon={Trophy} label="Achievements" />
          </ScrollView>

          {activeSection === 'Overview' && (
            <>
              <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>About</Text>{isSelf && <TouchableOpacity onPress={openEdit}><Edit3 size={16} color={COLORS.muted} /></TouchableOpacity>}</View>
                <Text style={styles.aboutText}>{user.bio || 'Add a short introduction so classmates know who you are.'}</Text>
                <View style={styles.detailGrid}>
                  <Detail icon={GraduationCap} label="Education" value={[user.course, user.department].filter(Boolean).join(' • ') || 'Not added'} />
                  <Detail icon={MapPin} label="Location" value={user.location || 'Not added'} />
                  <Detail icon={Sparkles} label="Career goal" value={user.careerGoal || 'Not added'} />
                  <Detail icon={Globe2} label="Website" value={user.website || 'Not added'} />
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>Skills</Text>{isSelf && <TouchableOpacity onPress={openEdit}><Edit3 size={16} color={COLORS.muted} /></TouchableOpacity>}</View>
                {skills.length ? <View style={styles.chips}>{skills.map((skill) => <View style={styles.skillChip} key={skill}><Code2 size={13} color={COLORS.blue} /><Text style={styles.skillText}>{skill}</Text></View>)}</View> : <EmptyState icon={Code2} title="No skills added" text="Add technologies and skills you are learning." />}
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>Social & Links</Text></View>
                <View style={styles.linksGrid}>
                  {[
                    ['GitHub', user.github, Github],
                    ['LinkedIn', user.linkedin, Linkedin],
                    ['Instagram', user.instagram, Instagram],
                    ['Website', user.website, Globe2],
                    ['YouTube', user.youtube, Youtube],
                    ['Resume', user.resumeLink, Link2],
                  ].filter(([, value]) => !!value).map(([label, value, Icon]) => (
                    <TouchableOpacity style={styles.linkCard} key={label} onPress={() => openLink(value)}>
                      <Icon size={18} color={COLORS.ink} />
                      <Text style={styles.linkCardText}>{label}</Text>
                      <ExternalLink size={13} color={COLORS.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {activeSection === 'Projects' && (
            <View style={styles.card}>
              <View style={styles.cardHeader}><Text style={styles.cardTitle}>Projects</Text>{isSelf && <TouchableOpacity onPress={() => Alert.alert('Projects', 'Project editor will be added in the next profile phase.')}><Plus size={18} color={COLORS.blue} /></TouchableOpacity>}</View>
              {projects.length ? projects.map((project, index) => (
                <View style={styles.projectCard} key={project.id || project.title || index}>
                  {!!project.image && <Image source={{ uri: project.image }} style={styles.projectImage} />}
                  <View style={styles.projectBody}>
                    <View style={styles.projectTitleRow}><Text style={styles.projectTitle}>{project.title || 'Untitled Project'}</Text>{project.featured && <View style={styles.featuredBadge}><Text style={styles.featuredText}>FEATURED</Text></View>}</View>
                    {!!project.description && <Text style={styles.projectDescription}>{project.description}</Text>}
                    {!!project.techStack?.length && <View style={styles.chips}>{project.techStack.map((tech) => <View style={styles.miniChip} key={tech}><Text style={styles.miniChipText}>{tech}</Text></View>)}</View>}
                    <View style={styles.projectLinks}>
                      {!!project.github && <TouchableOpacity onPress={() => openLink(project.github)}><Github size={18} color={COLORS.ink} /></TouchableOpacity>}
                      {!!project.liveUrl && <TouchableOpacity onPress={() => openLink(project.liveUrl)}><ExternalLink size={18} color={COLORS.blue} /></TouchableOpacity>}
                    </View>
                  </View>
                </View>
              )) : <EmptyState icon={Code2} title="Your portfolio starts here" text="Projects will become rich portfolio cards with tech stacks, GitHub, live demos and featured status." />}
            </View>
          )}

          {activeSection === 'Achievements' && (
            <>
              <ListCard title="Achievements" icon={Trophy} items={achievements} emptyTitle="No achievements yet" emptyText="Add hackathons, awards, competitions and milestones." />
              <ListCard title="Certifications" icon={Award} items={certifications} emptyTitle="No certifications yet" emptyText="Show certificates and credentials on your profile." />
            </>
          )}

          {false && activeSection === 'Experience' && (
            <View style={styles.card}>
              <View style={styles.cardHeader}><Text style={styles.cardTitle}>Experience</Text></View>
              {experience.length ? experience.map((item, index) => (
                <View style={styles.timelineItem} key={item.id || item.title || index}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineTitle}>{item.title || 'Experience'}</Text>
                    {!!item.organization && <Text style={styles.timelineOrg}>{item.organization}</Text>}
                    {!!item.period && <Text style={styles.timelinePeriod}>{item.period}</Text>}
                    {!!item.description && <Text style={styles.timelineDescription}>{item.description}</Text>}
                  </View>
                </View>
              )) : <EmptyState icon={BriefcaseBusiness} title="No experience added" text="Internships, roles, volunteering and leadership can appear here." />}
            </View>
          )}

          {false && activeSection === 'Interests' && (
            <>
              <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>Interests</Text></View>
                {interests.length ? <View style={styles.chips}>{interests.map((item) => <View style={styles.interestChip} key={item}><Heart size={13} color={COLORS.purple} /><Text style={styles.interestText}>{item}</Text></View>)}</View> : <EmptyState icon={Heart} title="No interests added" text="Add domains, hobbies and topics you care about." />}
              </View>
              <View style={styles.card}>
                <View style={styles.cardHeader}><Text style={styles.cardTitle}>Clubs & Communities</Text></View>
                {(user.clubs || []).length ? <View style={styles.chips}>{user.clubs.map((item) => <View style={styles.interestChip} key={item}><Users size={13} color={COLORS.blue} /><Text style={styles.interestText}>{item}</Text></View>)}</View> : <EmptyState icon={Users} title="No communities added" text="Show clubs, societies and communities you are part of." />}
              </View>
            </>
          )}

          <View style={styles.bottomCard}>
            <View style={styles.bottomIcon}><QrCode size={22} color={COLORS.blue} /></View>
            <View style={styles.bottomCopy}><Text style={styles.bottomTitle}>Share your profile</Text><Text style={styles.bottomText}>QR sharing and public profile links are part of the next profile phase.</Text></View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!fullScreenAvatar} transparent animationType="fade" onRequestClose={() => setFullScreenAvatar(null)}>
        <View style={styles.avatarModal}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setFullScreenAvatar(null)}><X size={28} color="#FFF" /></TouchableOpacity>
          {!!fullScreenAvatar && <Image source={{ uri: fullScreenAvatar }} style={styles.fullAvatar} resizeMode="contain" />}
        </View>
      </Modal>

      <Modal visible={editVisible} animationType="slide" onRequestClose={() => setEditVisible(false)}>
        <SafeAreaView style={styles.editorRoot}>
          <KeyboardAvoidingView style={styles.editorKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.editorHeader}>
              <View><Text style={styles.editorEyebrow}>WE CONNECT</Text><Text style={styles.editorTitle}>Build your profile</Text><Text style={styles.editorSubtitle}>Your student identity, portfolio and career snapshot.</Text></View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setEditVisible(false)}><X size={22} color={COLORS.ink} /></TouchableOpacity>
            </View>

            <ScrollView style={styles.editorScroll} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
              <EditorCard title="Identity" hint="The information people see first.">
                <Field label="Full Name" value={form?.name} onChange={(v) => updateForm('name', v)} />
                <Field label="Username / Handle" value={form?.handle} onChange={(v) => updateForm('handle', v)} autoCapitalize="none" />
                <Field label="Bio" value={form?.bio} onChange={(v) => updateForm('bio', v)} multiline />
              </EditorCard>

              <EditorCard title="Education" hint="Make your academic identity clear.">
                <Field label="University" value={form?.university} onChange={(v) => updateForm('university', v)} />
                <Field label="Course / Major" value={form?.course} onChange={(v) => updateForm('course', v)} />
                <Field label="Department" value={form?.department} onChange={(v) => updateForm('department', v)} />
                <Field label="Class of" value={form?.gradYear} onChange={(v) => updateForm('gradYear', v)} keyboardType="numeric" />
                <Field label="Campus Location" value={form?.location} onChange={(v) => updateForm('location', v)} />
              </EditorCard>

              <EditorCard title="Career" hint="Tell people where you are heading.">
                <Field label="Career Goal" value={form?.careerGoal} onChange={(v) => updateForm('careerGoal', v)} placeholder="e.g. Software Engineer • AI/ML" />
                <Field label="Resume / Portfolio URL" value={form?.resumeLink} onChange={(v) => updateForm('resumeLink', v)} autoCapitalize="none" keyboardType="url" />
              </EditorCard>

              <EditorCard title="Skills" hint="Technologies and capabilities you are learning.">
                <ArrayEditor items={form?.skills || []} label="Skill" placeholder="e.g. React Native" onAdd={(v) => addToArray('skills', v)} onRemove={(v) => removeFromArray('skills', v)} />
              </EditorCard>

              <EditorCard title="Social & Links" hint="Connect your public work.">
                <Field label="GitHub" value={form?.github} onChange={(v) => updateForm('github', v)} autoCapitalize="none" keyboardType="url" />
                <Field label="LinkedIn" value={form?.linkedin} onChange={(v) => updateForm('linkedin', v)} autoCapitalize="none" keyboardType="url" />
                <Field label="Instagram" value={form?.instagram} onChange={(v) => updateForm('instagram', v)} autoCapitalize="none" keyboardType="url" />
                <Field label="Website" value={form?.website} onChange={(v) => updateForm('website', v)} autoCapitalize="none" keyboardType="url" />
                <Field label="WhatsApp" value={form?.whatsapp} onChange={(v) => updateForm('whatsapp', v)} keyboardType="phone-pad" />
              </EditorCard>

              <TouchableOpacity style={styles.saveButton} onPress={saveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : <><CheckCircle2 size={18} color="#FFF" /><Text style={styles.saveText}>Save Profile</Text></>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const Detail = ({ icon: Icon, label, value }) => (
  <View style={styles.detail}>
    <Icon size={16} color={COLORS.muted} />
    <View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue} numberOfLines={2}>{value}</Text></View>
  </View>
);

const ListCard = ({ title, icon: Icon, items, emptyTitle, emptyText }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}><View style={styles.titleWithIcon}><Icon size={19} color={COLORS.orange} /><Text style={styles.cardTitle}>{title}</Text></View></View>
    {items.length ? items.map((item, index) => (
      <View style={styles.listItem} key={item.id || item.title || index}>
        <View style={styles.listIcon}><Icon size={17} color={COLORS.orange} /></View>
        <View style={styles.listCopy}><Text style={styles.listTitle}>{item.title || item.name || 'Achievement'}</Text>{!!item.organization && <Text style={styles.listMeta}>{item.organization}</Text>}{!!item.date && <Text style={styles.listMeta}>{item.date}</Text>}{!!item.description && <Text style={styles.listDescription}>{item.description}</Text>}</View>
      </View>
    )) : <EmptyState icon={Icon} title={emptyTitle} text={emptyText} />}
  </View>
);

const EmptyState = ({ icon: Icon, title, text }) => (
  <View style={styles.emptyState}><View style={styles.emptyIcon}><Icon size={22} color={COLORS.muted} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>
);

const EditorCard = ({ title, hint, children }) => (
  <View style={styles.editorCard}><Text style={styles.editorSectionTitle}>{title}</Text><Text style={styles.editorHint}>{hint}</Text>{children}</View>
);

const Field = ({ label, value, onChange, multiline, placeholder, ...props }) => (
  <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={[styles.fieldInput, multiline && styles.multiline]} value={value || ''} onChangeText={onChange} placeholder={placeholder || label} placeholderTextColor="#9CA3AF" multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} {...props} /></View>
);

const ArrayEditor = ({ items, label, placeholder, onAdd, onRemove }) => {
  const [value, setValue] = useState('');
  return (
    <View>
      <View style={styles.arrayRow}><TextInput style={[styles.fieldInput, styles.arrayInput]} value={value} onChangeText={setValue} placeholder={placeholder} placeholderTextColor="#9CA3AF" /><TouchableOpacity style={styles.addButton} onPress={() => { onAdd(value); setValue(''); }}><Plus size={20} color="#FFF" /></TouchableOpacity></View>
      {!!items.length && <View style={styles.chips}>{items.map((item) => <View style={styles.editChip} key={item}><Text style={styles.editChipText}>{item}</Text><TouchableOpacity onPress={() => onRemove(item)}><Trash2 size={13} color="#B4233A" /></TouchableOpacity></View>)}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 50 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  errorText: { color: COLORS.muted },
  cover: { height: 210, backgroundColor: COLORS.blue, position: 'relative' },
  coverImage: { ...StyleSheet.absoluteFillObject },
  coverFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.blue },
  coverGradient: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.16)' },
  coverTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6 },
  coverButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,.75)', alignItems: 'center', justifyContent: 'center' },
  hero: { marginTop: -28, backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 0 },
  avatarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  avatarContainer: { width: 104, height: 104, marginTop: -52, position: 'relative' },
  avatar: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: COLORS.white, backgroundColor: '#E2E8F0' },
  avatarCamera: { position: 'absolute', right: 0, bottom: 2, width: 31, height: 31, borderRadius: 16, backgroundColor: COLORS.ink, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  heroActions: { paddingBottom: 9 },
  primaryOutline: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryOutlineText: { fontWeight: '800', color: COLORS.ink, fontSize: 13 },
  primaryButton: { height: 40, paddingHorizontal: 17, borderRadius: 20, backgroundColor: COLORS.blue, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryButtonText: { color: COLORS.ink, fontWeight: '800' },
  name: { marginTop: 13, fontSize: 26, lineHeight: 31, fontWeight: '900', color: COLORS.ink },
  handle: { marginTop: 2, color: COLORS.muted, fontSize: 14 },
  identityLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 },
  identityStrong: { color: COLORS.ink, fontWeight: '800' },
  identityMuted: { color: COLORS.muted },
  bio: { marginTop: 12, color: '#334155', fontSize: 15, lineHeight: 22 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  metaText: { color: COLORS.muted, fontSize: 12 },
  goalPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: COLORS.blueSoft },
  goalText: { color: COLORS.ink, fontWeight: '700', fontSize: 12 },
  stats: { marginTop: 18, paddingVertical: 15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 27, backgroundColor: COLORS.border },
  statValue: { fontSize: 19, fontWeight: '900', color: COLORS.ink },
  statLabel: { marginTop: 3, color: COLORS.muted, fontSize: 11 },
  completionCard: { marginTop: 16, padding: 15, borderRadius: 17, backgroundColor: COLORS.blueSoft, borderWidth: 1, borderColor: '#DBEAFE' },
  completionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  completionTitle: { fontSize: 14, fontWeight: '900', color: COLORS.ink },
  completionSubtitle: { marginTop: 2, color: COLORS.muted, fontSize: 11 },
  completionPercent: { color: COLORS.blue, fontSize: 20, fontWeight: '900' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#DBEAFE', marginTop: 11, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: COLORS.blue },
  completeAction: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completeActionText: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  sectionTabs: { gap: 8, paddingVertical: 17 },
  sectionTab: { height: 38, paddingHorizontal: 13, borderRadius: 19, backgroundColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTabActive: { backgroundColor: COLORS.blue, borderWidth: 1, borderColor: COLORS.ink },
  sectionTabText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  sectionTabTextActive: { color: COLORS.ink },
  card: { backgroundColor: COLORS.white, borderRadius: 19, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 13 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: COLORS.ink },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aboutText: { color: '#475569', lineHeight: 21, fontSize: 14 },
  detailGrid: { marginTop: 15, gap: 12 },
  detail: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  detailCopy: { flex: 1 },
  detailLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { marginTop: 2, color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.blueSoft, borderWidth: 1, borderColor: '#F0D33B' },
  skillText: { color: COLORS.ink, fontWeight: '800', fontSize: 12 },
  miniChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: '#F1F5F9' },
  miniChipText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  linksGrid: { gap: 8 },
  linkCard: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FAFAF7', flexDirection: 'row', alignItems: 'center', gap: 9 },
  linkCardText: { flex: 1, color: COLORS.ink, fontWeight: '700', fontSize: 13 },
  projectCard: { overflow: 'hidden', borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 11 },
  projectImage: { width: '100%', height: 150, backgroundColor: '#E2E8F0' },
  projectBody: { padding: 13 },
  projectTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  projectTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: COLORS.ink },
  featuredBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, backgroundColor: COLORS.blue },
  featuredText: { color: COLORS.ink, fontSize: 8, fontWeight: '900' },
  projectDescription: { marginTop: 7, color: COLORS.muted, lineHeight: 19, fontSize: 13 },
  projectLinks: { flexDirection: 'row', gap: 16, marginTop: 11 },
  listItem: { flexDirection: 'row', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.blueSoft, alignItems: 'center', justifyContent: 'center' },
  listCopy: { flex: 1 },
  listTitle: { color: COLORS.ink, fontWeight: '900', fontSize: 14 },
  listMeta: { marginTop: 3, color: COLORS.muted, fontSize: 12 },
  listDescription: { marginTop: 5, color: '#475569', fontSize: 12, lineHeight: 18 },
  timelineItem: { flexDirection: 'row', gap: 12, paddingBottom: 18 },
  timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.blue, marginTop: 4 },
  timelineBody: { flex: 1 },
  timelineTitle: { color: COLORS.ink, fontWeight: '900' },
  timelineOrg: { marginTop: 3, color: COLORS.blue, fontWeight: '700' },
  timelinePeriod: { marginTop: 3, color: COLORS.muted, fontSize: 11 },
  timelineDescription: { marginTop: 5, color: '#475569', lineHeight: 18, fontSize: 12 },
  interestChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.blueSoft },
  interestText: { color: COLORS.ink, fontWeight: '800', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 12 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 9, color: COLORS.ink, fontWeight: '900' },
  emptyText: { marginTop: 4, color: COLORS.muted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  bottomCard: { marginTop: 2, padding: 15, borderRadius: 17, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', gap: 12, alignItems: 'center' },
  bottomIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.blueSoft, alignItems: 'center', justifyContent: 'center' },
  bottomCopy: { flex: 1 },
  bottomTitle: { fontWeight: '900', color: COLORS.ink },
  bottomText: { marginTop: 3, color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  avatarModal: { flex: 1, backgroundColor: 'rgba(0,0,0,.98)', alignItems: 'center', justifyContent: 'center' },
  modalClose: { position: 'absolute', top: 48, right: 18, zIndex: 5, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' },
  fullAvatar: { width: '92%', height: '75%' },
  editorRoot: { flex: 1, backgroundColor: COLORS.bg },
  editorKeyboard: { flex: 1 },
  editorHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, minHeight: 95, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorEyebrow: { color: COLORS.blue, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  editorTitle: { marginTop: 2, color: COLORS.ink, fontSize: 23, fontWeight: '900' },
  editorSubtitle: { marginTop: 3, color: COLORS.muted, fontSize: 11 },
  closeButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  editorScroll: { flex: 1 },
  editorContent: { padding: 16, paddingBottom: 30 },
  editorCard: { padding: 16, backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 13 },
  editorSectionTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  editorHint: { marginTop: 3, marginBottom: 5, color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  field: { marginTop: 12 },
  fieldLabel: { marginBottom: 6, color: '#374151', fontSize: 11, fontWeight: '800' },
  fieldInput: { minHeight: 49, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 13, color: COLORS.ink, fontSize: 14 },
  multiline: { minHeight: 95, paddingTop: 12 },
  arrayRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 9 },
  arrayInput: { flex: 1 },
  addButton: { width: 49, height: 49, borderRadius: 12, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' },
  editChipText: { color: '#9F1239', fontSize: 12, fontWeight: '800' },
  saveButton: { height: 56, borderRadius: 16, backgroundColor: COLORS.blue, borderWidth: 1, borderColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  saveText: { color: COLORS.ink, fontWeight: '900', fontSize: 15 },
});

export default ProfileScreenNew;
