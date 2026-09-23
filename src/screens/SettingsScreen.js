import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, FileText, Info, Lock, LogOut, Shield, Trash2 } from 'lucide-react-native';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

const Row = ({ icon, title, subtitle, onPress, danger = false }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
    <View style={[styles.icon, danger && styles.dangerIcon]}>{icon}</View>
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <ChevronRight size={19} color="#94a3b8" />
  </TouchableOpacity>
);

const SettingsScreen = ({ navigation }) => {
  const user = auth.currentUser;

  const changePassword = () => {
    if (!user?.email) return;
    Alert.alert(
      'Reset password',
      'We will send a password reset link to your registered email address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send link',
          onPress: async () => {
            try {
              await sendPasswordResetEmail(auth, user.email);
              Alert.alert('Email sent', 'Check your registered email for the password reset link.');
            } catch (error) {
              Alert.alert('Could not send email', error?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const logout = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>ACCOUNT</Text>
        <View style={styles.card}>
          <Row icon={<Lock size={19} color="#111" />} title="Change password" subtitle="Send a secure reset link to your email" onPress={changePassword} />
          <Row icon={<Trash2 size={19} color="#111" />} title="Delete account" subtitle="Permanently remove your account and owned data" onPress={() => navigation.navigate('DeleteAccount')} danger />
          <Row icon={<LogOut size={19} color="#111" />} title="Sign out" subtitle="Sign out of this device" onPress={logout} />
        </View>

        <Text style={styles.section}>PRIVACY & SAFETY</Text>
        <View style={styles.card}>
          <Row icon={<Shield size={19} color="#111" />} title="Privacy Policy" subtitle="How WeConnect handles account and campus data" onPress={() => navigation.navigate('PrivacyPolicy')} />
          <Row icon={<Shield size={19} color="#111" />} title="Community Guidelines" subtitle="Rules for respectful campus participation" onPress={() => navigation.navigate('CommunityGuidelines')} />
        </View>

        <Text style={styles.section}>LEGAL</Text>
        <View style={styles.card}>
          <Row icon={<FileText size={19} color="#111" />} title="Terms of Service" subtitle="Terms governing use of WeConnect" onPress={() => navigation.navigate('TermsOfService')} />
        </View>

        <Text style={styles.section}>ABOUT</Text>
        <View style={styles.card}>
          <Row icon={<Info size={19} color="#111" />} title="About WeConnect" subtitle="Campus-first social and academic community" onPress={() => Alert.alert('WeConnect', 'WeConnect is a campus-first student platform built for verified college communities.')} />
        </View>

        <Text style={styles.version}>WeConnect v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#f8fafc'}, header:{height:58,flexDirection:'row',alignItems:'center',paddingHorizontal:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#e5e7eb'}, back:{width:42,height:42,alignItems:'center',justifyContent:'center'}, spacer:{width:42}, title:{flex:1,textAlign:'center',fontSize:18,fontWeight:'800',color:'#111'}, content:{padding:18,paddingBottom:40}, section:{fontSize:12,fontWeight:'900',color:'#64748b',letterSpacing:1,marginTop:16,marginBottom:8}, card:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#e2e8f0',overflow:'hidden'}, row:{minHeight:68,flexDirection:'row',alignItems:'center',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#f1f5f9'}, icon:{width:40,height:40,borderRadius:12,backgroundColor:'#f1f5f9',alignItems:'center',justifyContent:'center'}, dangerIcon:{backgroundColor:'#fff1f2'}, rowText:{flex:1,marginLeft:12},rowTitle:{fontSize:15,fontWeight:'800',color:'#111'},dangerText:{color:'#b42318'},rowSubtitle:{fontSize:12,color:'#64748b',marginTop:3},version:{textAlign:'center',color:'#94a3b8',fontSize:12,marginTop:24}
});
export default SettingsScreen;