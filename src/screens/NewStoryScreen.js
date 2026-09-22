import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, Image as ImageIcon, Volume2, VolumeX } from 'lucide-react-native';
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

      <View style={styles.body}>
        {asset ? (
          asset.type === 'video'
            ? <VideoPreview uri={asset.uri} />
            : <Image source={{ uri: asset.uri }} style={styles.preview} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Create your story</Text>
            <Text style={styles.emptyText}>Share a photo or video with your campus.</Text>
          </View>
        )}

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
      </View>

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
  body: { flex: 1, padding: 16 },
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
