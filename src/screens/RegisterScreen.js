import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Keyboard, StatusBar, Image, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Mail, Lock, Eye, EyeOff, Camera, ArrowLeft, AtSign } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';

const FALLBACK_AVATAR = 'https://via.placeholder.com/150';

const RegisterScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to your gallery.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setAvatarUri(result.assets[0].uri);
      }
    } catch (pickError) {
      console.error('Image picker error:', pickError);
      Alert.alert('Error', 'Could not open your gallery.');
    }
  };

  const handleRegister = async () => {
    const cleanName = name.trim();
    const cleanHandle = handle.trim().replace(/^@+/, '').toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanHandle || !cleanEmail || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError('');
    Keyboard.dismiss();

    try {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = credential.user;

      let avatar = FALLBACK_AVATAR;
      if (avatarUri) {
        avatar = (await uploadToCloudinary(avatarUri, 'image')) || avatar;
      }

      await updateProfile(user, {
        displayName: cleanName,
        photoURL: avatar,
      });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: cleanName,
        displayName: cleanName,
        handle: '@' + cleanHandle,
        email: cleanEmail,
        avatar,
        photoURL: avatar,
        bio: 'Available to chat',
        connections: [],
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Registration error:', err);
      const messages = {
        'auth/email-already-in-use': 'This email is already in use.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Choose a stronger password.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
      };
      setError(messages[err?.code] || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Login');
          }} style={styles.backBtn}>
          <ArrowLeft size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Account</Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarContainer}>
            <TouchableOpacity style={styles.avatarWrapper} onPress={pickImage}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}><User size={40} color="#999" /></View>
              )}
              <View style={styles.cameraIconContainer}><Camera size={16} color="#fff" /></View>
            </TouchableOpacity>
            <Text style={styles.avatarText}>Add Profile Photo</Text>
          </View>

          <View style={styles.formContainer}>
            {error ? <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View> : null}

            {[
              { icon: User, placeholder: 'Full Name', value: name, set: setName },
              { icon: AtSign, placeholder: 'Username (Handle)', value: handle, set: setHandle, autoCapitalize: 'none' },
              { icon: Mail, placeholder: 'Student Email', value: email, set: setEmail, keyboardType: 'email-address', autoCapitalize: 'none' },
            ].map(({ icon: Icon, ...field }) => (
              <View style={styles.inputWrapper} key={field.placeholder}>
                <Icon size={20} color="#888" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={field.placeholder}
                  placeholderTextColor="#999"
                  value={field.value}
                  onChangeText={(value) => { field.set(value); setError(''); }}
                  autoCapitalize={field.autoCapitalize}
                  keyboardType={field.keyboardType}
                  autoCorrect={false}
                />
              </View>
            ))}

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
              />
              <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={20} color="#888" /> : <Eye size={20} color="#888" />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.registerBtn, loading && styles.disabledBtn]} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.registerBtnText}>Sign Up</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  keyboard: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  avatarContainer: { alignItems: 'center', marginVertical: 20 },
  avatarWrapper: { width: 100, height: 100, borderRadius: 50, position: 'relative' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  cameraIconContainer: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#64748b', marginTop: 8, fontSize: 13 },
  formContainer: { width: '100%' },
  errorContainer: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 12, padding: 12, marginBottom: 15 },
  errorText: { color: '#be123c', fontSize: 14, textAlign: 'center' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', height: 56, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 15, marginBottom: 14, backgroundColor: '#f8fafc' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: '#0f172a' },
  eyeIcon: { padding: 5 },
  registerBtn: { height: 54, borderRadius: 14, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  disabledBtn: { opacity: 0.7 },
  registerBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  footerContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: '#64748b' },
  loginLink: { color: '#007AFF', fontWeight: '800' },
});

export default RegisterScreen;
