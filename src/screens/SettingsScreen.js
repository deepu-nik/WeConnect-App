import React, { useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft, Check, ChevronRight, FileText, Info, Lock, LogOut, Moon,
  Shield, Sun, Trash2, Smartphone, X,
} from 'lucide-react-native';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';

const Row = ({ icon, title, subtitle, onPress, danger = false, trailing }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
    <View style={[styles.icon, danger && styles.dangerIcon]}>{icon}</View>
    <View style={styles.rowText}>
      <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    {trailing || <ChevronRight size={19} color="#94a3b8" />}
  </TouchableOpacity>
);

const ThemeOption = ({ icon, title, subtitle, selected, onPress }) => (
  <TouchableOpacity style={[styles.themeOption, selected && styles.themeOptionSelected]} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.themeIcon}>{icon}</View>
    <View style={styles.themeText}>
      <Text style={styles.themeTitle}>{title}</Text>
      <Text style={styles.themeSubtitle}>{subtitle}</Text>
    </View>
    {selected ? <View style={styles.selected}><Check size={16} color="#111111" /></View> : null}
  </TouchableOpacity>
);

const SettingsScreen = ({ navigation }) => {
  const user = auth.currentUser;
  const { preference, activeScheme, colors, setPreference } = useTheme();
  const [themeModalVisible, setThemeModalVisible] = useState(false);

  const themeLabel = preference === 'system'
    ? 'System default'
    : preference === 'dark'
      ? 'Dark'
      : 'Light';

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

  const selectTheme = async (next) => {
    await setPreference(next);
    setThemeModalVisible(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, { color: colors.muted }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row icon={<Lock size={19} color={colors.text} />} title="Change password" subtitle="Send a secure reset link to your email" onPress={changePassword} />
          <Row icon={<Trash2 size={19} color={colors.text} />} title="Delete account" subtitle="Permanently remove your account and owned data" onPress={() => navigation.navigate('DeleteAccount')} danger />
          <Row icon={<LogOut size={19} color={colors.text} />} title="Sign out" subtitle="Sign out of this device" onPress={logout} />
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row
            icon={activeScheme === 'dark' ? <Moon size={19} color={colors.text} /> : <Sun size={19} color={colors.text} />}
            title="Theme"
            subtitle={themeLabel}
            onPress={() => setThemeModalVisible(true)}
            trailing={<ChevronRight size={19} color={colors.muted} />}
          />
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>PRIVACY & SAFETY</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row icon={<Shield size={19} color={colors.text} />} title="Privacy Policy" subtitle="How WeConnect handles account and campus data" onPress={() => navigation.navigate('PrivacyPolicy')} />
          <Row icon={<Shield size={19} color={colors.text} />} title="Community Guidelines" subtitle="Rules for respectful campus participation" onPress={() => navigation.navigate('CommunityGuidelines')} />
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>LEGAL</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row icon={<FileText size={19} color={colors.text} />} title="Terms of Service" subtitle="Terms governing use of WeConnect" onPress={() => navigation.navigate('TermsOfService')} />
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row icon={<Info size={19} color={colors.text} />} title="About WeConnect" subtitle="Campus-first social and academic community" onPress={() => Alert.alert('WeConnect', 'WeConnect is a campus-first student platform built for verified college communities.')} />
        </View>

        <Text style={[styles.version, { color: colors.muted }]}>WeConnect v1.0.0</Text>
      </ScrollView>

      <Modal visible={themeModalVisible} transparent animationType="fade" onRequestClose={() => setThemeModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.themeSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: colors.muted }]}>APPEARANCE</Text>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Choose your theme</Text>
              </View>
              <TouchableOpacity style={[styles.close, { backgroundColor: colors.surfaceMuted }]} onPress={() => setThemeModalVisible(false)}>
                <X size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ThemeOption
              icon={<Smartphone size={20} color={colors.text} />}
              title="System default"
              subtitle="Follow your phone's light or dark mode"
              selected={preference === 'system'}
              onPress={() => selectTheme('system')}
            />
            <ThemeOption
              icon={<Sun size={20} color={colors.text} />}
              title="Light"
              subtitle="Use the WeConnect light interface"
              selected={preference === 'light'}
              onPress={() => selectTheme('light')}
            />
            <ThemeOption
              icon={<Moon size={20} color={colors.text} />}
              title="Dark"
              subtitle="Use the WeConnect dark interface"
              selected={preference === 'dark'}
              onPress={() => selectTheme('dark')}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  spacer: { width: 42 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  content: { padding: 18, paddingBottom: 40 },
  section: { fontSize: 12, fontWeight: '900', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  dangerIcon: { backgroundColor: '#FFF1F2' },
  rowText: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  dangerText: { color: '#B42318' },
  rowSubtitle: { fontSize: 12, color: '#64748B', marginTop: 3 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 24 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  themeSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, paddingBottom: 28 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sheetTitle: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  themeOption: { minHeight: 68, borderRadius: 17, borderWidth: 1, borderColor: '#E4E4DE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8 },
  themeOptionSelected: { backgroundColor: '#FFFEE0', borderColor: '#E9E600' },
  themeIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#F0F0EB', alignItems: 'center', justifyContent: 'center' },
  themeText: { flex: 1, marginLeft: 11 },
  themeTitle: { color: '#111', fontSize: 14, fontWeight: '900' },
  themeSubtitle: { color: '#74746D', fontSize: 11, marginTop: 2 },
  selected: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
});

export default SettingsScreen;
