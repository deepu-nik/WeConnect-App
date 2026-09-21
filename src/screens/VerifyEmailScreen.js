import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MailCheck, RefreshCw, LogOut } from 'lucide-react-native';

const VerifyEmailScreen = ({ user, onRefresh, onResend, onSignOut }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [resending, setResending] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const handleResend = async () => {
    setResending(true);
    await onResend();
    setResending(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MailCheck size={46} color="#111111" />
        </View>

        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to your registered email address.
        </Text>

        <View style={styles.emailCard}>
          <Text style={styles.emailLabel}>EMAIL</Text>
          <Text style={styles.email}>{user?.email || 'your registered email'}</Text>
        </View>

        <Text style={styles.helpText}>
          Open the email, tap the verification link, then come back here and tap
          “I’ve verified my email”.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, refreshing && styles.disabledButton]}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <>
              <RefreshCw size={18} color="#111111" />
              <Text style={styles.primaryText}>I’ve verified my email</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleResend}
          disabled={resending}
        >
          {resending ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <Text style={styles.secondaryText}>Resend verification email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
          <LogOut size={17} color="#64748b" />
          <Text style={styles.signOutText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: '#FFFDE7',
    borderWidth: 1,
    borderColor: '#E8E8E3',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 30, fontWeight: '900', color: '#111111', textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 10,
  },
  emailCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 15,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emailLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#64748b' },
  email: { fontSize: 15, fontWeight: '800', color: '#111111', marginTop: 5 },
  helpText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 16,
  },
  primaryButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#FFFC00',
    borderWidth: 1,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 24,
  },
  disabledButton: { opacity: 0.7 },
  primaryText: { color: '#111111', fontSize: 15, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', paddingVertical: 16 },
  secondaryText: { color: '#007AFF', fontSize: 14, fontWeight: '800' },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 12,
  },
  signOutText: { color: '#64748b', fontWeight: '700' },
});

export default VerifyEmailScreen;
