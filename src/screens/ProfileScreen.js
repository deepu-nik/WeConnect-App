import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from 'firebase/auth';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
  Award, BookOpen, BriefcaseBusiness, CheckCircle2, Code2, GraduationCap,
  MapPin, Plus, QrCode, Sparkles, Trash2, UserRound, X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db } from '../config/firebase';
import { getUserProfile, FALLBACK_AVATAR } from '../services/userService';
import { sendConnectionRequest } from '../services/connectionService';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import ProfileHero from '../components/profile/ProfileHero';
import ProfileStats from '../components/profile/ProfileStats';
import ProfileSection from '../components/profile/ProfileSection';
import ProfileLinks from '../components/profile/ProfileLinks';
import ProfileTabs from '../components/profile/ProfileTabs';

const SKILL_GROUPS = [
  { title: 'Core', keys: ['C++', 'Python', 'Java', 'JavaScript', 'TypeScript'] },
  { title: 'Development', keys: ['React', 'React Native', 'Node.js', 'Express', 'Firebase', 'MongoDB'] },
  { title: 'Interests', keys: ['AI/ML', 'Data Science', 'Cloud', 'Open Source'] },
];

const fallbackProfile = (uid, route) => ({
  uid,
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
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [fullScreenAvatar, setFullScreenAvatar] = useState(null);
  const [activeTab, setActiveTab] = useState('posts');
  const [newSkill, setNewSkill] = useState('');
  const [form, setForm] = useState(null);

  const isConnected = isSelf || Boolean(user?.connections?.includes(currentUser?.uid));

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!targetUid) return;
      setLoading(true);
      try {
        const profile = await getUserProfile(targetUid);
        const next = profile || fallbackProfile(targetUid, route);
        if (!active) return;
        setUser(next);
        try {
          const vaultSnap = await getDocs(query(collection(db, 'vault_files'), where('uploader.uid', '==', targetUid)));
          if (active) setVaultCount(vaultSnap.size);
        } catch (error) {
          console.warn('Vault count unavailable:', error);
        }
      } catch (error) {
        console.error('Profile load failed:', error);
        if (active) setUser(fallbackProfile(targetUid, route));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [targetUid, route?.params?.uid, route?.params?.name, route?.params?.avatar]);

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
    setEditVisible(true);
  };

  const addSkill = () => {
    const skill = newSkill.trim();
    if (!skill || form.skills.includes(skill)) return;
    setForm({ ...form, skills: [...form.skills, skill] });
    setNewSkill('');
  };

  const saveProfile = async () => {
    if (!currentUser?.uid || !form) return;
    setSaving(true);
    try {
      const handle = form.handle.trim();
      const next = {
        displayName: form.name.trim(),
        name: form.name.trim(),
        handle: handle ? (handle.startsWith('@') ? handle : '@' + handle) : '@student',
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
      Alert.alert('Could not save', 'Please try again.');
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
        quality: 0.78,
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
      Alert.alert('Could not update image', 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const openLink = async (value, label = 'Link') => {
    if (!value) return;
    let url = value;
    if (label === 'Instagram' && !/^https?:/i.test(url)) url = 'https://instagram.com/' + url.replace(/^@/, '');
    else if (label === 'LinkedIn' && !/^https?:/i.test(url)) url = 'https://linkedin.com/in/' + url.replace(/^@/, '');
    else if (label === 'GitHub' && !/^https?:/i.test(url)) url = 'https://github.com/' + url.replace(/^@/, '');
    else if (label === 'WhatsApp') url = 'https://wa.me/' + String(url).replace(/\D/g, '');
    else if (!/^https?:/i.test(url)) url = 'https://' + url;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Invalid link', 'This link cannot be opened.');
    } catch {
      Alert.alert('Error', 'Could not open this link.');
    }
  };

  const shareProfile = async () => {
    if (!user) return;
    const deepLink = 'weconnect://profile/' + user.uid;
    try {
      await Share.share({ title: user.name + ' on WeConnect', message: user.name + ' • ' + (user.handle || '') + '\n' + deepLink });
    } catch {}
  };

  const connect = async () => {
    if (!currentUser || !user || isSelf) return;
    try {
      await sendConnectionRequest({ sender: { uid: currentUser.uid, name: currentUser.displayName || 'Student', avatar: currentUser.photoURL || '' }, receiver: user });
      Alert.alert('Request sent', 'Your connection request has been sent.');
    } catch (error) {
      console.error('Connection request failed:', error);
      Alert.alert('Could not connect', 'Please try again.');
    }
  };

  const profileStrength = useMemo(() => {
    if (!user) return 0;
    const checks = [
      !!user.name, !!user.bio, !!user.avatar && user.avatar !== FALLBACK_AVATAR,
      !!user.coverPhoto, !!user.course, !!user.gradYear, !!user.location,
      (user.skills || []).length > 0, !!user.github || !!user.linkedin || !!user.website,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [user]);

  const groupedSkills = useMemo(() => {
    const skills = user?.skills || [];
    const used = new Set();
    const groups = SKILL_GROUPS.map((group) => {
      const values = skills.filter((skill) => group.keys.some((key) => key.toLowerCase() === skill.toLowerCase()));
      values.forEach((value) => used.add(value));
      return { ...group, values };
    }).filter((group) => group.values.length);
    const other = skills.filter((skill) => !used.has(skill));
    if (other.length) groups.push({ title: 'More', values: other });
    return groups;
  }, [user]);

  if (loading || !user) return <View style={styles.loading}><ActivityIndicator size="large" color="#111" /></View>;

  const stats = [
    { key: 'connections', value: user.connections?.length || 0, label: 'Connections' },
    { key: 'projects', value: user.projectsCount || 0, label: 'Projects' },
    { key: 'vault', value: vaultCount, label: 'Vault Files' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <ProfileHero
          user={user}
          isSelf={isSelf}
          isConnected={isConnected}
          uploading={uploading}
          onAvatarPress={() => setFullScreenAvatar(user.avatar || FALLBACK_AVATAR)}
          onAvatarEdit={() => pickImage('avatar')}
          onCoverEdit={() => pickImage('cover')}
          onEdit={openEdit}
          onMessage={() => navigation.navigate('ChatRoom', { uid: user.uid, name: user.name, avatar: user.avatar })}
          onConnect={connect}
          onShare={shareProfile}
          onMenu={() => setProfileMenuVisible(true)}
        />

        <ProfileStats stats={stats} onPress={(key) => {
          if (key === 'connections') navigation.navigate('Connect');
          if (key === 'vault') navigation.navigate('Vault');
        }} />

        {isSelf && (
          <ProfileSection title="Profile strength" subtitle="Complete the essentials to make your identity useful." action={{ label: 'Edit', onPress: openEdit }}>
            <View style={styles.strengthCard}>
              <View style={styles.strengthTop}><View><Text style={styles.strengthPercent}>{profileStrength}%</Text><Text style={styles.strengthLabel}>profile complete</Text></View><Sparkles size={22} color="#111" /></View>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: profileStrength + '%' }]} /></View>
              <Text style={styles.strengthHint}>{profileStrength < 70 ? 'Add your bio, links, skills and cover photo.' : 'Your profile is ready to represent you around campus.'}</Text>
            </View>
          </ProfileSection>
        )}

        <ProfileSection title="About" subtitle="Your campus identity">
          <View style={styles.infoCard}>
            <InfoRow icon={UserRound} label="About" value={user.bio || 'Add a short introduction about yourself.'} multiline />
            <InfoRow icon={GraduationCap} label="Education" value={(user.course || 'B.Tech Computer Science') + (user.gradYear ? ' • Class of ' + user.gradYear : '')} />
            <InfoRow icon={MapPin} label="Location" value={user.location || 'Campus'} />
          </View>
        </ProfileSection>

        <ProfileSection title="Skills" subtitle="What you build and learn" action={isSelf ? { label: 'Manage', onPress: openEdit } : undefined}>
          {groupedSkills.length ? groupedSkills.map((group) => (
            <View key={group.title} style={styles.skillGroup}>
              <Text style={styles.skillGroupTitle}>{group.title}</Text>
              <View style={styles.skillRow}>{group.values.map((skill) => <View key={skill} style={styles.skillPill}><Code2 size={13} color="#111" /><Text style={styles.skillText}>{skill}</Text></View>)}</View>
            </View>
          )) : <View style={styles.emptyCard}><Code2 size={20} color="#777770" /><Text style={styles.emptyTitle}>No skills added yet</Text><Text style={styles.emptyText}>Add technologies and interests to help people understand what you do.</Text>{isSelf && <TouchableOpacity style={styles.smallButton} onPress={openEdit}><Text style={styles.smallButtonText}>Add skills</Text></TouchableOpacity>}</View>}
        </ProfileSection>

        <ProfileSection title="Education & Experience" subtitle="Build your professional identity">
          <View style={styles.timelineCard}>
            <TimelineItem icon={GraduationCap} title={user.course || 'Computer Science Engineering'} subtitle={(user.gradYear ? 'Class of ' + user.gradYear : 'Student') + ' • ' + (user.location || 'Campus')} />
            <TimelineItem icon={BriefcaseBusiness} title={user.projectsCount ? user.projectsCount + ' projects completed' : 'Start your project portfolio'} subtitle="Projects, internships and experience will live here." />
            <TimelineItem icon={Award} title="Achievements & certifications" subtitle="Add hackathons, certificates and campus milestones." last />
          </View>
        </ProfileSection>

        <ProfileSection title="Portfolio" subtitle="Show what you have built" action={isSelf ? { label: 'Add', onPress: () => Alert.alert('Projects', 'Project management is the next profile module. Your project count is already supported.') } : { label: 'View all', onPress: () => {} }}>
          <View style={styles.portfolioCard}>
            <View style={styles.portfolioIcon}><Code2 size={22} color="#111" /></View>
            <View style={styles.portfolioCopy}><Text style={styles.portfolioTitle}>{user.projectsCount ? user.projectsCount + ' projects' : 'Your project portfolio'}</Text><Text style={styles.portfolioText}>GitHub projects, college builds, hackathons and live work.</Text></View>
            <Text style={styles.arrow}>›</Text>
          </View>
        </ProfileSection>

        <ProfileSection title="Links" subtitle="Connect your digital identity">
          <ProfileLinks user={user} onOpen={openLink} />
        </ProfileSection>

        <ProfileSection title="Highlights" subtitle="The things you want people to notice">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightRow}>
            <Highlight icon={Code2} title="Projects" value={String(user.projectsCount || 0)} />
            <Highlight icon={Award} title="Achievements" value="Add" />
            <Highlight icon={QrCode} title="QR Profile" value="Share" onPress={shareProfile} />
            <Highlight icon={BookOpen} title="Vault" value={String(vaultCount)} onPress={() => navigation.navigate('Vault')} />
          </ScrollView>
        </ProfileSection>

        <ProfileTabs active={activeTab} onChange={setActiveTab} />
        <View style={styles.tabContent}>
          {activeTab === 'posts' && <EmptyTab icon={Sparkles} title="Your story starts here" text="Updates and posts you publish can appear on your profile." />}
          {activeTab === 'projects' && <EmptyTab icon={Code2} title={user.projectsCount ? 'Projects ready to showcase' : 'No projects yet'} text="Your portfolio will become a dedicated space for projects, collaborators, links and demos." />}
          {activeTab === 'activity' && <EmptyTab icon={CheckCircle2} title="Activity" text="Connections, achievements, project updates and campus activity will appear here." />}
        </View>
        <View style={styles.footerSpace} />
      </ScrollView>

      <Modal visible={!!fullScreenAvatar} transparent animationType="fade" onRequestClose={() => setFullScreenAvatar(null)}>
        <View style={styles.avatarModal}><TouchableOpacity style={styles.closeButton} onPress={() => setFullScreenAvatar(null)}><X size={28} color="#fff" /></TouchableOpacity><Image source={{ uri: fullScreenAvatar }} style={styles.fullAvatar} resizeMode="contain" /></View>
      </Modal>

      <Modal visible={profileMenuVisible} transparent animationType="slide" onRequestClose={() => setProfileMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setProfileMenuVisible(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>{user.name}</Text>
            <TouchableOpacity style={styles.menuItem} onPress={shareProfile}><ShareIcon /><Text>Share profile</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setProfileMenuVisible(false); Alert.alert('Report profile', 'Reporting will be available in the moderation module.'); }}><Text style={styles.menuDanger}>Report profile</Text></TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setProfileMenuVisible(false)}><Text style={styles.menuCancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView style={styles.editOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.editModal}>
            <View style={styles.editHeader}><View><Text style={styles.editEyebrow}>PROFILE</Text><Text style={styles.editTitle}>Edit your identity</Text></View><TouchableOpacity onPress={() => setEditVisible(false)}><X size={24} color="#111" /></TouchableOpacity></View>
            <ScrollView contentContainerStyle={styles.form}>
              {[
                ['name','Name'],['handle','Username / Handle'],['course','Course / Major'],['gradYear','Class of'],
                ['location','Campus Location'],['website','Website'],['instagram','Instagram'],['linkedin','LinkedIn'],
                ['github','GitHub'],['whatsapp','WhatsApp Number'],['resumeLink','Resume / Portfolio'],['projectsCount','Projects Completed'],
              ].map(([key,label]) => (
                <View key={key}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={String(form?.[key] ?? '')} onChangeText={(value)=>setForm({...form,[key]:value})} keyboardType={key==='projectsCount'||key==='gradYear'||key==='whatsapp'?'numeric':key==='website'||key==='instagram'||key==='linkedin'||key==='github'||key==='resumeLink'?'url':'default'} autoCapitalize={key==='name'||key==='course'||key==='location'?'sentences':'none'} /></View>
              ))}
              <Text style={styles.label}>Bio</Text>
              <TextInput style={[styles.input,styles.multiline]} value={form?.bio || ''} onChangeText={(value)=>setForm({...form,bio:value})} multiline maxLength={240} placeholder="Tell people what you build or care about" />
              <Text style={styles.label}>Skills</Text>
              <View style={styles.addSkillRow}><TextInput style={[styles.input,{flex:1,marginBottom:0}]} value={newSkill} onChangeText={setNewSkill} placeholder="e.g. React Native" onSubmitEditing={addSkill} /><TouchableOpacity style={styles.addSkillButton} onPress={addSkill}><Plus size={20} color="#fff" /></TouchableOpacity></View>
              <View style={styles.editSkills}>{form?.skills?.map(skill=><View key={skill} style={styles.editSkill}><Text style={styles.editSkillText}>{skill}</Text><TouchableOpacity onPress={()=>setForm({...form,skills:form.skills.filter(item=>item!==skill)})}><Trash2 size={14} color="#C62828" /></TouchableOpacity></View>)}</View>
              <TouchableOpacity style={styles.saveButton} onPress={saveProfile} disabled={saving}>{saving?<ActivityIndicator color="#fff"/>:<Text style={styles.saveText}>Save Changes</Text>}</TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const InfoRow=({icon:Icon,label,value,multiline})=><View style={styles.infoRow}><View style={styles.infoIcon}><Icon size={17} color="#111"/></View><View style={styles.infoCopy}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue,multiline&&styles.infoValueMulti]}>{value}</Text></View></View>;
const TimelineItem=({icon:Icon,title,subtitle,last})=><View style={styles.timelineItem}><View style={styles.timelineIcon}><Icon size={17} color="#111"/></View><View style={[styles.timelineCopy,!last&&styles.timelineBorder]}><Text style={styles.timelineTitle}>{title}</Text><Text style={styles.timelineSubtitle}>{subtitle}</Text></View></View>;
const Highlight=({icon:Icon,title,value,onPress})=><TouchableOpacity style={styles.highlight} onPress={onPress}><View style={styles.highlightIcon}><Icon size={20} color="#111"/></View><Text style={styles.highlightTitle}>{title}</Text><Text style={styles.highlightValue}>{value}</Text></TouchableOpacity>;
const EmptyTab=({icon:Icon,title,text})=><View style={styles.emptyTab}><View style={styles.emptyTabIcon}><Icon size={24} color="#111"/></View><Text style={styles.emptyTabTitle}>{title}</Text><Text style={styles.emptyTabText}>{text}</Text></View>;
const ShareIcon=()=> <Text style={{fontSize:18}}>↗</Text>;

const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#F6F6F2'},page:{paddingBottom:30},loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#F6F6F2'},
 strengthCard:{padding:16,borderRadius:19,backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E5DF'},strengthTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},strengthPercent:{fontSize:24,fontWeight:'900',color:'#111'},strengthLabel:{fontSize:10,color:'#85857E',fontWeight:'700',marginTop:2},progressTrack:{height:8,borderRadius:4,backgroundColor:'#E9E9E4',overflow:'hidden',marginTop:13},progressFill:{height:'100%',borderRadius:4,backgroundColor:'#FFFC00'},strengthHint:{fontSize:11.5,lineHeight:17,color:'#6F6F68',marginTop:10},
 infoCard:{padding:14,borderRadius:19,backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E5DF'},infoRow:{flexDirection:'row',alignItems:'flex-start',paddingVertical:9},infoIcon:{width:34,height:34,borderRadius:11,backgroundColor:'#F0F0EC',alignItems:'center',justifyContent:'center'},infoCopy:{flex:1,marginLeft:10},infoLabel:{fontSize:10,fontWeight:'900',color:'#8A8A83',textTransform:'uppercase',letterSpacing:.7},infoValue:{fontSize:13.5,fontWeight:'700',color:'#24241F',marginTop:3},infoValueMulti:{fontWeight:'500',lineHeight:19},
 skillGroup:{marginBottom:12},skillGroupTitle:{fontSize:10,fontWeight:'900',letterSpacing:1,color:'#8A8A83',textTransform:'uppercase',marginBottom:7},skillRow:{flexDirection:'row',flexWrap:'wrap',gap:7},skillPill:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,paddingVertical:8,borderRadius:14,backgroundColor:'#fff',borderWidth:1,borderColor:'#E1E1DB'},skillText:{fontSize:11.5,fontWeight:'800',color:'#222'},
 emptyCard:{padding:18,borderRadius:18,backgroundColor:'#ECECE7',alignItems:'center'},emptyTitle:{marginTop:8,fontSize:14,fontWeight:'900',color:'#222'},emptyText:{marginTop:4,fontSize:11.5,lineHeight:17,textAlign:'center',color:'#777770'},smallButton:{marginTop:12,paddingHorizontal:14,paddingVertical:8,borderRadius:15,backgroundColor:'#111'},smallButtonText:{color:'#fff',fontSize:11,fontWeight:'900'},
 timelineCard:{backgroundColor:'#fff',borderRadius:19,borderWidth:1,borderColor:'#E5E5DF',paddingHorizontal:14,paddingVertical:4},timelineItem:{flexDirection:'row',minHeight:72},timelineIcon:{width:35,height:35,borderRadius:12,backgroundColor:'#F0F0EC',alignItems:'center',justifyContent:'center',marginTop:12},timelineCopy:{flex:1,marginLeft:11,paddingTop:13},timelineBorder:{borderBottomWidth:1,borderBottomColor:'#EEEEEA',paddingBottom:12},timelineTitle:{fontSize:13,fontWeight:'900',color:'#222'},timelineSubtitle:{fontSize:11.5,color:'#777770',marginTop:4,lineHeight:17},
 portfolioCard:{minHeight:82,borderRadius:19,backgroundColor:'#111',padding:15,flexDirection:'row',alignItems:'center'},portfolioIcon:{width:44,height:44,borderRadius:14,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},portfolioCopy:{flex:1,marginLeft:12},portfolioTitle:{fontSize:14,fontWeight:'900',color:'#fff'},portfolioText:{fontSize:11,color:'#B9B9B2',lineHeight:16,marginTop:3},arrow:{fontSize:28,color:'#fff',marginLeft:8},
 highlightRow:{gap:9,paddingRight:16},highlight:{width:112,height:124,borderRadius:19,backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E5DF',padding:12},highlightIcon:{width:38,height:38,borderRadius:12,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},highlightTitle:{fontSize:11,fontWeight:'900',color:'#222',marginTop:12},highlightValue:{fontSize:10,color:'#85857E',marginTop:3},
 tabContent:{paddingHorizontal:16,paddingTop:14},emptyTab:{minHeight:180,borderRadius:20,backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E5DF',alignItems:'center',justifyContent:'center',padding:25},emptyTabIcon:{width:52,height:52,borderRadius:18,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},emptyTabTitle:{fontSize:16,fontWeight:'900',color:'#111',marginTop:12},emptyTabText:{fontSize:12,lineHeight:18,color:'#777770',textAlign:'center',marginTop:5},footerSpace:{height:15},
 avatarModal:{flex:1,backgroundColor:'rgba(0,0,0,.98)',alignItems:'center',justifyContent:'center'},fullAvatar:{width:'92%',height:'75%'},closeButton:{position:'absolute',right:18,top:52,zIndex:5,width:44,height:44,borderRadius:22,backgroundColor:'rgba(255,255,255,.12)',alignItems:'center',justifyContent:'center'},
 menuOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'flex-end'},menuCard:{backgroundColor:'#fff',borderTopLeftRadius:25,borderTopRightRadius:25,padding:20,paddingBottom:30},menuTitle:{fontSize:18,fontWeight:'900',color:'#111',marginBottom:10},menuItem:{minHeight:52,borderBottomWidth:1,borderBottomColor:'#EEEEEA',flexDirection:'row',alignItems:'center',gap:10},menuDanger:{color:'#C62828',fontWeight:'800'},menuCancel:{marginTop:12,alignItems:'center',paddingVertical:10},menuCancelText:{fontWeight:'800',color:'#777770'},
 editOverlay:{flex:1,backgroundColor:'rgba(0,0,0,.45)',justifyContent:'flex-end'},editModal:{height:'91%',backgroundColor:'#F6F6F2',borderTopLeftRadius:26,borderTopRightRadius:26},editHeader:{padding:19,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5DF',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},editEyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:'#8A8A83'},editTitle:{fontSize:20,fontWeight:'900',color:'#111',marginTop:2},form:{padding:18,paddingBottom:50},label:{fontSize:11,fontWeight:'900',color:'#777770',marginTop:13,marginBottom:7},input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#E0E0DA',backgroundColor:'#fff',paddingHorizontal:13,color:'#111'},multiline:{height:88,textAlignVertical:'top',paddingTop:12},addSkillRow:{flexDirection:'row',gap:8},addSkillButton:{width:48,height:48,borderRadius:14,backgroundColor:'#111',alignItems:'center',justifyContent:'center'},editSkills:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},editSkill:{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:10,paddingVertical:7,borderRadius:14,backgroundColor:'#fff',borderWidth:1,borderColor:'#DDDCD5'},editSkillText:{fontSize:11,fontWeight:'800',color:'#222'},saveButton:{height:52,borderRadius:16,backgroundColor:'#111',alignItems:'center',justifyContent:'center',marginTop:25},saveText:{color:'#fff',fontSize:15,fontWeight:'900'},
});
export default ProfileScreen;
