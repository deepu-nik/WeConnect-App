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
import {
  Camera,
  Check,
  Crop,
  FlipHorizontal,
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
  Send,
  X,
  Video,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const CROP_PRESETS = [
  { key: 'original', label: 'Original' },
  { key: 'square', label: '1:1' },
  { key: 'portrait', label: '4:5' },
  { key: 'landscape', label: '16:9' },
];

const getCropRect = (width, height, preset) => {
  if (!width || !height || preset === 'original') return null;

  const targetRatio =
    preset === 'square'
      ? 1
      : preset === 'portrait'
        ? 4 / 5
        : 16 / 9;

  const currentRatio = width / height;

  if (currentRatio > targetRatio) {
    const cropWidth = Math.round(height * targetRatio);
    return {
      originX: Math.round((width - cropWidth) / 2),
      originY: 0,
      width: cropWidth,
      height: height,
    };
  }

  const cropHeight = Math.round(width / targetRatio);
  return {
    originX: 0,
    originY: Math.round((height - cropHeight) / 2),
    width,
    height: cropHeight,
  };
};

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
  const [editingIndex, setEditingIndex] = useState(null);
  const [editPreset, setEditPreset] = useState('original');
  const [editRotation, setEditRotation] = useState(0);
  const [editFlip, setEditFlip] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const reset = () => {
    setItems([]);
    setCaption('');
    setBusy(false);
    setEditingIndex(null);
    setEditPreset('original');
    setEditRotation(0);
    setEditFlip(false);
    setEditBusy(false);
  };

  const close = () => {
    if (busy || editBusy) return;
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
        width: asset.width || null,
        height: asset.height || null,
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

  const openEditor = (index) => {
    const item = items[index];
    if (!item || item.type !== 'image') {
      Alert.alert('Video editing', 'Photo editing is available here. Videos can be sent directly.');
      return;
    }

    setEditingIndex(index);
    setEditPreset('original');
    setEditRotation(0);
    setEditFlip(false);
  };

  const closeEditor = () => {
    if (editBusy) return;
    setEditingIndex(null);
    setEditPreset('original');
    setEditRotation(0);
    setEditFlip(false);
  };

  const applyEdits = async () => {
    if (editingIndex === null || editBusy) return;

    const item = items[editingIndex];
    if (!item || item.type !== 'image') return;

    setEditBusy(true);
    try {
      const actions = [];
      const crop = getCropRect(item.width, item.height, editPreset);

      if (crop) actions.push({ crop });
      if (editRotation) actions.push({ rotate: editRotation });
      if (editFlip) actions.push({ flip: { horizontal: true } });

      if (!actions.length) {
        closeEditor();
        return;
      }

      const result = await ImageManipulator.manipulateAsync(
        item.uri,
        actions,
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      setItems((current) =>
        current.map((entry, index) =>
          index === editingIndex
            ? {
                ...entry,
                uri: result.uri,
                mimeType: 'image/jpeg',
                width: result.width,
                height: result.height,
              }
            : entry
        )
      );

      closeEditor();
    } catch (error) {
      console.error('Image edit failed:', error);
      Alert.alert('Edit failed', 'We could not apply these edits. Please try again.');
    } finally {
      setEditBusy(false);
    }
  };

  const send = async () => {
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
    () => (items.length === 1 ? '1 item selected' : items.length + ' items selected'),
    [items.length]
  );

  const editingItem = editingIndex !== null ? items[editingIndex] : null;

  return (
    <>
      <Modal visible={visible && editingIndex === null} animationType="slide" onRequestClose={close}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={close} disabled={busy} style={styles.iconButton}>
              <X size={25} color="#0f172a" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.title}>{title}</Text>
              {items.length > 0 && <Text style={styles.subtitle}>{countLabel}</Text>}
            </View>

            <TouchableOpacity
              onPress={send}
              disabled={!items.length || busy}
              style={[styles.sendButton, !items.length && styles.disabled]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Send size={19} color="#fff" />}
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.heroIcon}>
                <ImageIcon size={34} color="#007AFF" />
              </View>
              <Text style={styles.emptyTitle}>Share something</Text>
              <Text style={styles.emptyText}>
                Pick photos or videos, capture something new, edit it if you want, then send.
              </Text>

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
                {items.map((item, index) => (
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

                    <TouchableOpacity style={styles.editButton} onPress={() => openEditor(index)}>
                      <Crop size={14} color="#fff" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>

                    {item.type === 'video' && (
                      <View style={styles.videoBadge}>
                        <Video size={12} color="#fff" />
                      </View>
                    )}
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

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryAction} onPress={pickFromGallery}>
                  <ImageIcon size={18} color="#007AFF" />
                  <Text style={styles.secondaryActionText}>Add media</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryAction} onPress={send} disabled={busy}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Send size={18} color="#fff" />
                      <Text style={styles.primaryActionText}>{shareLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.tip}>
                <Check size={17} color="#34C759" />
                <Text style={styles.tipText}>
                  Edit any photo or tap Send to share everything immediately.
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        visible={visible && editingIndex !== null}
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <View style={styles.editorContainer}>
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={closeEditor} disabled={editBusy} style={styles.iconButton}>
              <X size={25} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.editorTitle}>Edit photo</Text>
            <TouchableOpacity
              onPress={applyEdits}
              disabled={editBusy}
              style={styles.doneButton}
            >
              {editBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.doneText}>Done</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.editorCanvas}>
            {editingItem && <Image source={{ uri: editingItem.uri }} style={styles.editorImage} resizeMode="contain" />}
          </View>

          <View style={styles.editorControls}>
            <Text style={styles.sectionTitle}>Crop</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
              {CROP_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.key}
                  style={[styles.preset, editPreset === preset.key && styles.presetActive]}
                  onPress={() => setEditPreset(preset.key)}
                >
                  <Crop size={16} color={editPreset === preset.key ? '#fff' : '#0f172a'} />
                  <Text style={[styles.presetText, editPreset === preset.key && styles.presetTextActive]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>Adjust</Text>
            <View style={styles.adjustRow}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setEditRotation((value) => (value + 270) % 360)}
              >
                <RotateCcw size={21} color="#0f172a" />
                <Text style={styles.adjustText}>Rotate left</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setEditRotation((value) => (value + 90) % 360)}
              >
                <RotateCw size={21} color="#0f172a" />
                <Text style={styles.adjustText}>Rotate right</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.adjustButton, editFlip && styles.adjustActive]}
                onPress={() => setEditFlip((value) => !value)}
              >
                <FlipHorizontal size={21} color={editFlip ? '#fff' : '#0f172a'} />
                <Text style={[styles.adjustText, editFlip && styles.adjustTextActive]}>Flip</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.editorHint}>
              Crop, rotate, or flip the photo. Videos can be sent directly without editing.
            </Text>
          </View>
        </View>
      </Modal>
    </>
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
  editButton: { position: 'absolute', left: 6, bottom: 6, minWidth: 48, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: 'rgba(0,0,0,.7)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  editButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  videoBadge: { position: 'absolute', bottom: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.65)', alignItems: 'center', justifyContent: 'center' },
  addTile: { width: '31.8%', aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  addText: { marginTop: 5, color: '#64748b', fontWeight: '700' },
  captionCard: { marginTop: 18, backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: '#e2e8f0', minHeight: 90 },
  caption: { flex: 1, color: '#0f172a', fontSize: 16, lineHeight: 22, minHeight: 60 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryAction: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: '#eaf4ff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryActionText: { color: '#007AFF', fontWeight: '800' },
  primaryAction: { flex: 1.25, minHeight: 50, borderRadius: 14, backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryActionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, paddingHorizontal: 4 },
  tipText: { color: '#64748b', fontSize: 12, flex: 1 },
  editorContainer: { flex: 1, backgroundColor: '#000' },
  editorHeader: { height: 78, paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  doneButton: { minWidth: 64, height: 40, borderRadius: 20, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  doneText: { color: '#fff', fontWeight: '800' },
  editorCanvas: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 16 },
  editorImage: { width: '100%', height: '100%' },
  editorControls: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },
  presetRow: { gap: 8, paddingBottom: 18 },
  preset: { height: 42, paddingHorizontal: 14, borderRadius: 21, backgroundColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', gap: 6 },
  presetActive: { backgroundColor: '#007AFF' },
  presetText: { color: '#0f172a', fontWeight: '700' },
  presetTextActive: { color: '#fff' },
  adjustRow: { flexDirection: 'row', gap: 8 },
  adjustButton: { flex: 1, minHeight: 68, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', gap: 6 },
  adjustActive: { backgroundColor: '#007AFF' },
  adjustText: { color: '#0f172a', fontSize: 11, fontWeight: '700' },
  adjustTextActive: { color: '#fff' },
  editorHint: { marginTop: 14, color: '#64748b', fontSize: 12, lineHeight: 18 },
});

export default MediaShareSheet;
