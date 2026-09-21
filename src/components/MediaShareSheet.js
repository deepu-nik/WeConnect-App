import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, Check, Image as ImageIcon, Send, X, Video } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

const MediaShareSheet = ({
  visible,
  onClose,
  onShare,
  title = 'Share media',
  shareLabel = 'Send',
  allowMultiple = true,
}) => {
  const [items, setItems] = useState([]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setItems([]);
    setCaption('');
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose?.();
  };

  const addAssets = (assets = []) => {
    const next = assets
      .filter((asset) => asset?.uri)
      .map((asset) => ({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        mimeType: asset.mimeType || null,
        duration: asset.duration || null,
      }));

    setItems((current) => {
      if (!allowMultiple) return next.slice(0, 1);
      const seen = new Set(current.map((item) => item.uri));
      return [...current, ...next.filter((item) => !seen.has(item.uri))].slice(0, 10);
    });
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo and video access to share media.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: allowMultiple,
      selectionLimit: allowMultiple ? 10 : 1,
      allowsEditing: !allowMultiple,
      quality: 0.85,
    });

    if (!result.canceled) addAssets(result.assets);
  };

  const capture = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow camera access to capture media.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.85,
      videoMaxDuration: 60,
    });

    if (!result.canceled) addAssets(result.assets);
  };

  const removeItem = (uri) => {
    setItems((current) => current.filter((item) => item.uri !== uri));
  };

  const share = async () => {
    if (!items.length || busy) return;
    setBusy(true);
    try {
      await onShare?.(items, caption.trim());
      reset();
      onClose?.();
    } catch (error) {
      console.error('Media share failed:', error);
      Alert.alert('Share failed', 'We could not share this media. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const countLabel = useMemo(
    () => items.length === 1 ? '1 item selected' : items.length + ' items selected',
    [items.length]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={close} disabled={busy} style={styles.iconButton}>
            <X size={25} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>{title}</Text>
            {items.length > 0 && <Text style={styles.subtitle}>{countLabel}</Text>}
          </View>
          <TouchableOpacity onPress={share} disabled={!items.length || busy} style={[styles.sendButton, !items.length && styles.disabled]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Send size={19} color="#fff" />}
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.heroIcon}><ImageIcon size={34} color="#007AFF" /></View>
            <Text style={styles.emptyTitle}>Share something</Text>
            <Text style={styles.emptyText}>Pick photos or videos, capture something new, then add a caption.</Text>

            <View style={styles.sourceRow}>
              <TouchableOpacity style={styles.sourceCard} onPress={capture}>
                <Camera size={25} color="#007AFF" />
                <Text style={styles.sourceTitle}>Camera</Text>
                <Text style={styles.sourceSub}>Photo or video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sourceCard} onPress={pickFromGallery}>
                <ImageIcon size={25} color="#007AFF" />
                <Text style={styles.sourceTitle}>Gallery</Text>
                <Text style={styles.sourceSub}>Up to 10 items</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.grid}>
              {items.map((item) => (
                <View key={item.uri} style={styles.tile}>
                  {item.type === 'video' ? (
                    <View style={styles.videoTile}>
                      <Video size={30} color="#fff" />
                      <Text style={styles.videoLabel}>VIDEO</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: item.uri }} style={styles.media} />
                  )}
                  <TouchableOpacity style={styles.remove} onPress={() => removeItem(item.uri)}>
                    <X size={15} color="#fff" />
                  </TouchableOpacity>
                  {item.type === 'video' && <View style={styles.videoBadge}><Video size={12} color="#fff" /></View>}
                </View>
              ))}
              {allowMultiple && items.length < 10 && (
                <TouchableOpacity style={styles.addTile} onPress={pickFromGallery}>
                  <ImageIcon size={24} color="#64748b" />
                  <Text style={styles.addText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.captionCard}>
              <ImageIcon size={20} color="#94a3b8" />
              <TextInput
                style={styles.caption}
                value={caption}
                onChangeText={setCaption}
                placeholder="Write a caption..."
                placeholderTextColor="#94a3b8"
                multiline
                maxLength={1000}
              />
            </View>

            <View style={styles.tip}>
              <Check size={17} color="#34C759" />
              <Text style={styles.tipText}>You can share photos and videos together.</Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { height: 76, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 2, fontSize: 11, color: '#64748b' },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  heroIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#eaf4ff', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 23, fontWeight: '800', color: '#0f172a' },
  emptyText: { textAlign: 'center', color: '#64748b', lineHeight: 21, marginTop: 7, maxWidth: 320 },
  sourceRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 28 },
  sourceCard: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  sourceTitle: { marginTop: 10, fontWeight: '800', color: '#0f172a' },
  sourceSub: { marginTop: 4, color: '#94a3b8', fontSize: 12, textAlign: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.8%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0f172a', position: 'relative' },
  media: { width: '100%', height: '100%' },
  videoTile: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  videoLabel: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 5 },
  remove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.65)', alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', bottom: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.65)', alignItems: 'center', justifyContent: 'center' },
  addTile: { width: '31.8%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  addText: { marginTop: 5, color: '#64748b', fontWeight: '700' },
  captionCard: { marginTop: 18, backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: '#e2e8f0', minHeight: 90 },
  caption: { flex: 1, color: '#0f172a', fontSize: 16, lineHeight: 22, minHeight: 60 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, paddingHorizontal: 4 },
  tipText: { color: '#64748b', fontSize: 12 },
});

export default MediaShareSheet;
