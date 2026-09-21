import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, Eye, Lock, ShieldCheck } from 'lucide-react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { getUserProfile } from '../services/userService';

const VISIBILITY_OPTIONS = [
  { value: 'everyone', label: 'Everyone', description: 'Anyone who can find your profile can see this.' },
  { value: 'connections', label: 'Connections', description: 'Only people you are connected with can see this.' },
  { value: 'private', label: 'Only me', description: 'Only you can see this information.' },
];

const FIELDS = [
  ['location', 'Location', 'Where you are on campus'],
  ['education', 'Education', 'Course and graduation year'],
  ['skills', 'Skills', 'Your technical skills and interests'],
  ['experience', 'Experience', 'Experience and professional timeline'],
  ['projects', 'Projects', 'Your portfolio projects'],
  ['achievements', 'Achievements', 'Achievements and certifications'],
  ['socialLinks', 'Social links', 'Website and social profiles'],
  ['resume', 'Resume', 'Resume or portfolio document'],
  ['activity', 'Activity', 'Posts and profile activity'],
];

const ProfilePrivacyScreen = ({ navigation }) => {
  const uid = auth.currentUser?.uid;
  const [privacy, setPrivacy] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile(uid).then((profile) => setPrivacy({
      profileVisibility: profile?.privacy?.profileVisibility || 'everyone',
      location: profile?.privacy?.location || 'everyone',
      education: profile?.privacy?.education || 'everyone',
      skills: profile?.privacy?.skills || 'everyone',
      experience: profile?.privacy?.experience || 'everyone',
      projects: profile?.privacy?.projects || 'everyone',
      achievements: profile?.privacy?.achievements || 'everyone',
      socialLinks: profile?.privacy?.socialLinks || 'everyone',
      resume: profile?.privacy?.resume || 'connections',
      activity: profile?.privacy?.activity || 'everyone',
    })).catch(() => setPrivacy({
      profileVisibility: 'everyone',
      location: 'everyone',
      education: 'everyone',
      skills: 'everyone',
      experience: 'everyone',
      projects: 'everyone',
      achievements: 'everyone',
      socialLinks: 'everyone',
      resume: 'connections',
      activity: 'everyone',
    }));
  }, [uid]);

  const save = async (next) => {
    setPrivacy(next);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { privacy: next });
    } catch (error) {
      console.error('Privacy save failed:', error);
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!privacy) return <View style={styles.loading}><ActivityIndicator size="large" color="#111" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><ChevronLeft size={24} color="#111" /></TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>PROFILE</Text><Text style={styles.title}>Privacy</Text></View>
        {saving ? <ActivityIndicator size="small" color="#111" /> : <ShieldCheck size={21} color="#111" />}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}><View style={styles.heroIcon}><Lock size={22} color="#111" /></View><Text style={styles.heroTitle}>Control what people see</Text><Text style={styles.heroText}>Your name and profile identity stay discoverable. These controls decide which additional information is visible.</Text></View>
        <Text style={styles.sectionTitle}>PROFILE VISIBILITY</Text>
        <View style={styles.card}>{VISIBILITY_OPTIONS.map((option) => <TouchableOpacity key={option.value} style={styles.option} onPress={() => save({ ...privacy, profileVisibility: option.value })}><View style={[styles.radio, privacy.profileVisibility === option.value && styles.radioActive]}>{privacy.profileVisibility === option.value ? <View style={styles.radioDot} /> : null}</View><View style={styles.optionCopy}><Text style={styles.optionTitle}>{option.label}</Text><Text style={styles.optionText}>{option.description}</Text></View></TouchableOpacity>)}</View>
        <Text style={styles.sectionTitle}>INFORMATION VISIBILITY</Text>
        <View style={styles.card}>{FIELDS.map(([key, label, description]) => <View key={key} style={styles.fieldRow}><View style={styles.fieldIcon}><Eye size={16} color="#111" /></View><View style={styles.fieldCopy}><Text style={styles.fieldTitle}>{label}</Text><Text style={styles.fieldText}>{description}</Text><View style={styles.chips}>{VISIBILITY_OPTIONS.map((option) => <TouchableOpacity key={option.value} style={[styles.chip, (privacy[key] || 'everyone') === option.value && styles.chipActive]} onPress={() => save({ ...privacy, [key]: option.value })}><Text style={[styles.chipText, (privacy[key] || 'everyone') === option.value && styles.chipTextActive]}>{option.label}</Text></TouchableOpacity>)}</View></View></View>)}</View>
        <Text style={styles.note}>Privacy controls are also enforced by the Profile Screen. Messaging remains restricted to connected users.</Text>
      </ScrollView>
    </View>
  );
};

const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#F6F6F2'},loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#F6F6F2'},
 header:{paddingTop:52,paddingHorizontal:16,paddingBottom:14,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#E5E5DF'},back:{width:40,height:40,borderRadius:20,backgroundColor:'#F0F0EC',alignItems:'center',justifyContent:'center'},headerCopy:{flex:1,marginLeft:11},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#8A8A83'},title:{fontSize:21,fontWeight:'900',color:'#111',marginTop:2},
 content:{padding:16,paddingBottom:40},hero:{backgroundColor:'#111',borderRadius:20,padding:18},heroIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#FFFC00',alignItems:'center',justifyContent:'center'},heroTitle:{fontSize:18,fontWeight:'900',color:'#fff',marginTop:12},heroText:{fontSize:11.5,lineHeight:18,color:'#C7C7C0',marginTop:5},
 sectionTitle:{fontSize:10,fontWeight:'900',letterSpacing:1,color:'#898982',marginTop:22,marginBottom:9},card:{backgroundColor:'#fff',borderRadius:19,borderWidth:1,borderColor:'#E5E5DF',overflow:'hidden'},option:{minHeight:72,padding:13,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#EEEEEA'},radio:{width:22,height:22,borderRadius:11,borderWidth:1.5,borderColor:'#B8B8B0',alignItems:'center',justifyContent:'center'},radioActive:{borderColor:'#111'},radioDot:{width:10,height:10,borderRadius:5,backgroundColor:'#111'},optionCopy:{flex:1,marginLeft:11},optionTitle:{fontSize:13,fontWeight:'900',color:'#222'},optionText:{fontSize:10.5,lineHeight:15,color:'#777770',marginTop:3},
 fieldRow:{padding:13,flexDirection:'row',borderBottomWidth:1,borderBottomColor:'#EEEEEA'},fieldIcon:{width:34,height:34,borderRadius:11,backgroundColor:'#F0F0EC',alignItems:'center',justifyContent:'center'},fieldCopy:{flex:1,marginLeft:10},fieldTitle:{fontSize:13,fontWeight:'900',color:'#222'},fieldText:{fontSize:10.5,color:'#777770',marginTop:3},chips:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},chip:{paddingHorizontal:9,paddingVertical:6,borderRadius:13,backgroundColor:'#F0F0EC'},chipActive:{backgroundColor:'#111'},chipText:{fontSize:9.5,fontWeight:'800',color:'#777770'},chipTextActive:{color:'#fff'},note:{fontSize:10.5,lineHeight:16,color:'#777770',marginTop:16,textAlign:'center'}
});
export default ProfilePrivacyScreen;