import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

const Privacy Policy = ({ navigation }) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={22} color="#111" /></TouchableOpacity>
      <Text style={styles.title}>Privacy Policy</Text>
      <View style={styles.spacer} />
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>WeConnect is a campus-first student platform. This policy describes the main categories of information the app uses to provide its features.</Text>
      <Text style={styles.heading}>Information we collect</Text><Text style={styles.body}>Account information such as your name, username, registered email address, college, course and year. You may also add profile information such as a bio, skills, links and profile images.</Text><Text style={styles.heading}>How we use information</Text><Text style={styles.body}>We use information to authenticate accounts, provide campus-scoped discovery and communication, display profiles, deliver stories, updates, chats and Vault features, prevent abuse, and maintain account security.</Text><Text style={styles.heading}>Campus visibility</Text><Text style={styles.body}>WeConnect is designed to keep student discovery and campus content within the verified campus boundary supported by the app. Cross-campus access is not part of the current launch model.</Text><Text style={styles.heading}>Private information</Text><Text style={styles.body}>Your registered email address and contact information such as WhatsApp are stored separately from the public campus profile and are not intended to be visible to other students.</Text><Text style={styles.heading}>Content and media</Text><Text style={styles.body}>Posts, stories, messages, profile images and uploaded study resources are processed only as needed to provide their respective features. Uploaded media may be stored with third-party infrastructure used by the app.</Text><Text style={styles.heading}>Security</Text><Text style={styles.body}>We use Firebase Authentication and Firestore security rules to restrict access. No internet service can guarantee absolute security, so keep your password private and report suspicious activity.</Text><Text style={styles.heading}>Your choices</Text><Text style={styles.body}>You can update your profile, request password reset, sign out, and delete your account from Settings. Some account-owned or shared content may require additional cleanup after deletion.</Text><Text style={styles.heading}>Changes</Text><Text style={styles.body}>This policy may be updated as WeConnect adds features or changes its data practices. Material changes should be reflected in an updated version date.</Text>
      <Text style={styles.note}>Last updated: September 22, 2026</Text>
    </ScrollView>
  </SafeAreaView>
);
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#fff'},header:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#e5e7eb'},back:{width:42,height:42,alignItems:'center',justifyContent:'center'},spacer:{width:42},title:{flex:1,textAlign:'center',fontSize:18,fontWeight:'800',color:'#111'},content:{padding:20,paddingBottom:50},intro:{fontSize:15,lineHeight:23,color:'#334155',marginBottom:8},heading:{fontSize:17,fontWeight:'900',color:'#111',marginTop:22,marginBottom:8},body:{fontSize:14,lineHeight:22,color:'#475569'},note:{fontSize:12,color:'#94a3b8',marginTop:28}});
export default Privacy Policy;