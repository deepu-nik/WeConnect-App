import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Image as ImageIcon, Volume2, VolumeX, Type, Sparkles, Palette, AlignCenter, Smile, Crop } from 'lucide-react-native';
import { createStory } from '../services/storyService';

function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  return (
    <View style={styles.previewWrap}>
      <VideoView player={player} style={styles.preview} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
      <TouchableOpacity style={styles.mute} onPress={() => setMuted((value) => !value)}>
        {muted ? <VolumeX size={20} color="#fff" /> : <Volume2 size={20} color="#fff" />}
      </TouchableOpacity>
    </View>
  );
}

export default function NewStoryScreen({ navigation }) {
  const [asset, setAsset] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editor, setEditor] = useState({
    text: '',
    textColor: '#FFFFFF',
    textSize: 26,
    textAlign: 'center',
    textPosition: 'middle',
    sticker: '',
    filter: 'none',
  });

  const pick = async (camera) => {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow access to your camera or photo library.');
      return;
    }

    const result = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
          videoMaxDuration: 15,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
          allowsEditing: false,
        });

    if (!result.canceled) {
      const next = result.assets[0];
      if (next.type === 'video' && next.duration && next.duration > 15000) {
        Alert.alert('Video too long', 'Story videos must be 15 seconds or shorter.');
        return;
      }
      if (next.type === 'video' && next.fileSize && next.fileSize > 10 * 1024 * 1024) {
        Alert.alert('Video too large', 'Story videos must be 10 MB or smaller.');
        return;
      }
      setAsset(next);
    }
  };

  const publish = async () => {
    if (!asset || uploading) return;
    setUploading(true);
    try {
      await createStory({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image',
        caption,
        duration: asset.duration || null,
        editor,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not publish story', error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={25} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.title}>New Story</Text>
        <TouchableOpacity disabled={!asset || uploading} onPress={publish}>
          <Text style={[styles.publish, (!asset || uploading) && styles.disabled]}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {asset ? (
          <View style={styles.previewWrap}>
            {asset.type === 'video'
              ? <VideoPreview uri={asset.uri} />
              : <Image source={{ uri: asset.uri }} style={styles.preview} />}
            {editor.filter !== 'none' ? <View pointerEvents="none" style={[styles.filterOverlay, editor.filter === 'warm' ? styles.filterWarm : editor.filter === 'mono' ? styles.filterMono : styles.filterCool]} /> : null}
            {editor.sticker ? <Text style={styles.stickerOverlay}>{editor.sticker}</Text> : null}
            {editor.text ? (
              <TextInput
                value={editor.text}
                onChangeText={(text) => setEditor((prev) => ({ ...prev, text }))}
                multiline
                placeholder="Type something…"
                placeholderTextColor="rgba(255,255,255,.72)"
                style={[
                  styles.storyTextOverlay,
                  { color: editor.textColor, fontSize: editor.textSize, textAlign: editor.textAlign },
                  editor.textPosition === 'top' ? styles.textTop : editor.textPosition === 'bottom' ? styles.textBottom : styles.textMiddle,
                ]}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Create your story</Text>
            <Text style={styles.emptyText}>Share a photo or video with your campus.</Text>
          </View>
        )}

        {asset ? (
          <View style={styles.editorPanel}>
            <View style={styles.editorHeader}>
              <Text style={styles.editorTitle}>Edit your story</Text>
              <Text style={styles.editorHint}>Tap tools to customise</Text>
            </View>
            <View style={styles.toolRow}>
              <TouchableOpacity style={styles.tool} onPress={() => setEditor((prev) => ({ ...prev, text: prev.text || 'Your story', textPosition: 'middle' }))}>
                <Type size={18} color="#111" /><Text style={styles.toolText}>Text</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tool} onPress={() => setEditor((prev) => ({ ...prev, sticker: prev.sticker === '🔥' ? '✨' : '🔥' }))}>
                <Smile size={18} color="#111" /><Text style={styles.toolText}>Sticker</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tool} onPress={() => setEditor((prev) => ({ ...prev, filter: prev.filter === 'none' ? 'warm' : prev.filter === 'warm' ? 'mono' : prev.filter === 'mono' ? 'cool' : 'none' }))}>
                <Sparkles size={18} color="#111" /><Text style={styles.toolText}>Filter</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tool} onPress={() => setEditor((prev) => ({ ...prev, textAlign: prev.textAlign === 'center' ? 'left' : prev.textAlign === 'left' ? 'right' : 'center' }))}>
                <AlignCenter size={18} color="#111" /><Text style={styles.toolText}>Align</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.tool} onPress={() => setEditor((prev) => ({ ...prev, textPosition: prev.textPosition === 'top' ? 'middle' : prev.textPosition === 'middle' ? 'bottom' : 'top' }))}>
                <Crop size={18} color="#111" /><Text style={styles.toolText}>Position</Text>
              </TouchableOpacity>
            </View>
            {editor.text ? (
              <View style={styles.editorSubRow}>
                <Palette size={16} color="#64748b" />
                {['#FFFFFF', '#FFFC00', '#FF3B30', '#34C759', '#5E5CE6'].map((color) => (
                  <TouchableOpacity key={color} onPress={() => setEditor((prev) => ({ ...prev, textColor: color }))} style={[styles.colorDot, { backgroundColor: color }, editor.textColor === color && styles.colorDotActive]} />
                ))}
                <TouchableOpacity style={styles.sizeButton} onPress={() => setEditor((prev) => ({ ...prev, textSize: prev.textSize >= 40 ? 22 : prev.textSize + 4 }))}><Text style={styles.sizeButtonText}>A</Text></TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} onPress={() => pick(true)}>
            <Camera size={22} color="#007AFF" />
            <Text>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => pick(false)}>
            <ImageIcon size={22} color="#007AFF" />
            <Text>Gallery</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption..."
          maxLength={180}
          multiline
          style={styles.caption}
        />
      </ScrollView>

      {uploading ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploading}>Uploading story…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  publish: { fontSize: 16, fontWeight: '800', color: '#007AFF' },
  disabled: { color: '#cbd5e1' },
  body: { flex: 1, paddingHorizontal: 16 },
  bodyContent: { paddingVertical: 16, paddingBottom: 28 },
  editorPanel: { marginTop: 12, borderRadius: 18, padding: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  editorTitle: { fontSize: 14, fontWeight: '900', color: '#111827' },
  editorHint: { fontSize: 10, color: '#64748B' },
  toolRow: { flexDirection: 'row', gap: 7 },
  tool: { flex: 1, minHeight: 52, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  toolText: { fontSize: 9, fontWeight: '800', color: '#111' },
  editorSubRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1' },
  colorDotActive: { borderWidth: 3, borderColor: '#111827' },
  sizeButton: { marginLeft: 'auto', width: 28, height: 28, borderRadius: 9, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  sizeButtonText: { color: '#fff', fontWeight: '900' },
  filterOverlay: { ...StyleSheet.absoluteFillObject },
  filterWarm: { backgroundColor: 'rgba(255,180,60,.16)' },
  filterMono: { backgroundColor: 'rgba(40,40,40,.25)' },
  filterCool: { backgroundColor: 'rgba(50,130,255,.13)' },
  stickerOverlay: { position: 'absolute', top: '43%', alignSelf: 'center', fontSize: 48 },
  storyTextOverlay: { position: 'absolute', left: 18, right: 18, fontWeight: '900', textShadowColor: 'rgba(0,0,0,.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 5, paddingVertical: 8 },
  textTop: { top: '12%' },
  textMiddle: { top: '42%' },
  textBottom: { bottom: '14%' },
  previewWrap: { width: '100%', aspectRatio: 9 / 14, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' },
  preview: { width: '100%', height: '100%', backgroundColor: '#0f172a' },
  mute: { position: 'absolute', right: 14, bottom: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,.55)', alignItems: 'center', justifyContent: 'center' },
  empty: { aspectRatio: 9 / 14, borderRadius: 18, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  emptyText: { textAlign: 'center', marginTop: 8, color: '#64748b' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  action: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  caption: { marginTop: 14, minHeight: 70, borderRadius: 14, backgroundColor: '#f8fafc', padding: 14, textAlignVertical: 'top', color: '#0f172a' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.65)', alignItems: 'center', justifyContent: 'center' },
  uploading: { color: '#fff', marginTop: 10, fontWeight: '700' },
});
