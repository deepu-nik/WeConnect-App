import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react-native';

const ICONS = {
  success: { Icon: CheckCircle2, background: '#EAF8EF', icon: '#1B7F3A' },
  error: { Icon: AlertCircle, background: '#FFF0F0', icon: '#C62828' },
  info: { Icon: Info, background: '#EEF4FF', icon: '#2457C5' },
};

export default function FeedbackModal({
  visible,
  type = 'success',
  title,
  message,
  actionLabel = 'Done',
  onClose,
}) {
  const config = ICONS[type] || ICONS.info;
  const Icon = config.Icon;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close">
            <X size={18} color="#666660" />
          </TouchableOpacity>

          <View style={[styles.iconWrap, { backgroundColor: config.background }]}>
            <Icon size={28} color={config.icon} strokeWidth={2.4} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.action} onPress={onClose} activeOpacity={0.82}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F1ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: '#707069',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 300,
  },
  action: {
    width: '100%',
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: '#FFFC00',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  actionText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '900',
  },
});
