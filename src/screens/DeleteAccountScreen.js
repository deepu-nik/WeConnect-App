import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Trash2 } from 'lucide-react-native';
import { deleteMyAccount } from '../services/accountService';

const DeleteAccountScreen = ({ navigation }) => {
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    if (!password) {
      Alert.alert('Password required', 'Enter your current password to continue.');
      return;
    }

    Alert.alert(
      'Delete your account?',
      'This permanently deletes your WeConnect account and the profile/content owned by this account. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMyAccount(password);
            } catch (error) {
              const code = error?.code || '';
              let message = error?.message || 'Could not delete the account.';
              if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
                message = 'The password is incorrect.';
              } else if (code === 'auth/too-many-requests') {
                message = 'Too many attempts. Please wait and try again.';
              }
              Alert.alert('Account deletion failed', message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <ArrowLeft size={22} color="#111" />
          </TouchableOpacity>
          <Text style={styles.title}>Delete Account</Text>
          <View style={styles.spacer} />
        </View>

        <View style={styles.content}>
          <View style={styles.icon}><Trash2 size={30} color="#111" /></View>
          <Text style={styles.heading}>Permanently delete your account</Text>
          <Text style={styles.body}>
            Your WeConnect profile and account-owned content will be removed. You will need to create a new account if you return.
          </Text>

          <Text style={styles.label}>Current password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            autoCapitalize="none"
            editable={!deleting}
          />

          <TouchableOpacity style={[styles.deleteButton, deleting && styles.disabled]} onPress={handleDelete} disabled={deleting}>
            {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteText}>Delete Account Permanently</Text>}
          </TouchableOpacity>

          <Text style={styles.note}>
            For account-security reasons, WeConnect asks you to re-enter your password before deletion.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  spacer: { width: 42 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#111' },
  content: { padding: 24 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FDECEC', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 30 },
  heading: { fontSize: 24, fontWeight: '900', color: '#111', textAlign: 'center', marginTop: 22 },
  body: { fontSize: 15, lineHeight: 22, color: '#555', textAlign: 'center', marginTop: 12 },
  label: { fontSize: 14, fontWeight: '800', color: '#111', marginTop: 32, marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderColor: '#d6d6d6', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: '#111' },
  deleteButton: { height: 52, borderRadius: 13, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.65 },
  deleteText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  note: { color: '#777', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 18 },
});

export default DeleteAccountScreen;
