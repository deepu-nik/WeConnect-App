import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { auth } from '../config/firebase';
import { subscribeToStories } from '../services/storyService';

const groupStories = (stories) => {
  const groups = new Map();
  stories.forEach((story) => {
    const key = story.userId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(story);
  });
  return [...groups.values()].sort((a, b) => {
    const aOwn = a[0]?.userId === auth.currentUser?.uid;
    const bOwn = b[0]?.userId === auth.currentUser?.uid;
    return Number(bOwn) - Number(aOwn);
  });
};

export default function StoriesStrip({ navigation }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToStories((items) => {
      setStories(items);
      setLoading(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, []);

  const groups = useMemo(() => groupStories(stories), [stories]);
  const own = groups.find((group) => group[0]?.userId === auth.currentUser?.uid);
  const others = groups.filter((group) => group[0]?.userId !== auth.currentUser?.uid);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.title}>Stories</Text>
        {loading ? <ActivityIndicator size="small" color="#007AFF" /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('NewStory')}>
          <View style={styles.addRing}>
            {own?.[0]?.mediaUrl ? <Image source={{ uri: own[0].mediaUrl }} style={styles.avatar} /> : <Plus size={28} color="#007AFF" />}
            <View style={styles.plus}><Plus size={12} color="#fff" /></View>
          </View>
          <Text style={styles.name} numberOfLines={1}>Your story</Text>
        </TouchableOpacity>
        {others.map((group) => {
          const story = group[0];
          const seen = group.every((item) => item.viewers?.includes(auth.currentUser?.uid));
          return (
            <TouchableOpacity key={story.userId} style={styles.item} onPress={() => navigation.navigate('StoryViewer', { stories: group, startIndex: 0 })}>
              <View style={[styles.ring, seen && styles.seenRing]}>
                <Image source={{ uri: story.userAvatar || 'https://via.placeholder.com/150' }} style={styles.avatar} />
              </View>
              <Text style={styles.name} numberOfLines={1}>{story.userName || 'Student'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: '#fff', paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  row: { paddingHorizontal: 16, gap: 14 },
  item: { width: 68, alignItems: 'center' },
  ring: { width: 60, height: 60, borderRadius: 30, padding: 3, borderWidth: 3, borderColor: '#007AFF' },
  seenRing: { borderColor: '#cbd5e1' },
  addRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: '100%', height: '100%', borderRadius: 30 },
  plus: { position: 'absolute', right: -1, bottom: -1, width: 20, height: 20, borderRadius: 10, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  name: { marginTop: 5, fontSize: 11, color: '#334155', fontWeight: '600', textAlign: 'center' },
});
