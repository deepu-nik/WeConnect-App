import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  TouchableWithoutFeedback, Keyboard, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');
    Keyboard.dismiss();

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (err) {
      const code = err?.code;
      const messages = {
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/user-not-found': 'Invalid email or password.',
        'auth/wrong-password': 'Invalid email or password.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
      };
      setError(messages[code] || 'Failed to log in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.headerContainer}>
            <View style={styles.iconContainer}><LogIn size={40} color="#007AFF" /></View>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue connecting with your campus.</Text>
          </View>

          <View style={styles.formContainer}>
            {error ? <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View> : null}

            <View style={styles.inputWrapper}>
              <Mail size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Student Email"
                placeholderTextColor="#999"
                value={email}
                onChangeText={(value) => { setEmail(value); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Lock size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={(value) => { setPassword(value); setError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textContentType="password"
              />
              <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={20} color="#888" /> : <Eye size={20} color="#888" />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.loginBtn, loading && styles.disabledBtn]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Log In</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgotBtn} onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgotBtn} onPress={() => Alert.alert(
              'Forgot your username?',
              'Your username is not required to sign in. Use your registered student email to log in. Once you are signed in, your username is visible on your Profile.'
            )}>
              <Text style={styles.forgotText}>Forgot Username?</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  headerContainer: { alignItems: 'center', marginBottom: 40 },
  iconContainer: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#E6F4FE', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 30, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 15, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  formContainer: { width: '100%' },
  errorContainer: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 12, padding: 12, marginBottom: 15 },
  errorText: { color: '#be123c', fontSize: 14, textAlign: 'center' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', height: 56, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 15, marginBottom: 14, backgroundColor: '#f8fafc' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#0f172a' },
  eyeIcon: { padding: 5 },
  loginBtn: { height: 54, borderRadius: 14, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  disabledBtn: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  forgotBtn: { alignItems: 'center', paddingVertical: 12 },
  forgotText: { color: '#007AFF', fontWeight: '700' },
  footerContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  footerText: { color: '#64748b' },
  registerLink: { color: '#007AFF', fontWeight: '800' },
});

export default LoginScreen;
