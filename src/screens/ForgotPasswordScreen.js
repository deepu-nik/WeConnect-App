import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Enter your registered student email.');
      return;
    }

    setLoading(true);
    setError('');
    Keyboard.dismiss();

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSent(true);
    } catch (err) {
      const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/user-not-found': 'No account was found for that email.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/too-many-requests': 'Too many requests. Please try again later.',
      };
      setError(messages[err?.code] || 'Could not send the reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={26} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reset Password</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.iconWrap}><Mail size={34} color="#007AFF" /></View>
        <Text style={styles.title}>Forgot your password?</Text>
        <Text style={styles.subtitle}>Enter the email linked to your WeConnect account and we'll send you a password reset link.</Text>

        {sent ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>Reset email sent</Text>
            <Text style={styles.successText}>Check your inbox and follow the link to choose a new password.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.primaryText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.inputWrap}>
              <Mail size={20} color="#888" />
              <TextInput
                style={styles.input}
                placeholder="Student Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={(value) => { setEmail(value); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabled]} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send Reset Link</Text>}
            </TouchableOpacity>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111111' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  iconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#E6F4FE', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '900', color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, color: '#64748b', textAlign: 'center', marginTop: 10, marginBottom: 28 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', height: 56, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 15, backgroundColor: '#f8fafc', marginBottom: 14, gap: 10 },
  input: { flex: 1, fontSize: 16, color: '#0f172a' },
  primaryBtn: { height: 54, borderRadius: 14, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.7 },
  error: { color: '#be123c', backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', padding: 12, borderRadius: 12, marginBottom: 14, textAlign: 'center' },
  successBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 16, padding: 18 },
  successTitle: { color: '#166534', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  successText: { color: '#166534', fontSize: 14, lineHeight: 21, textAlign: 'center', marginVertical: 8 },
});

export default ForgotPasswordScreen;
