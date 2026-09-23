import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Plus } from 'lucide-react-native';
import { auth } from '../config/firebase';
import { subscribeToStories } from '../services/storyService';

const FALLBACK_AVATAR = 'https://via.placeholder.com/150';
const YELLOW = '#FFFC00';

const groupStories = (stories = []) => {
  const groups = new Map();

  stories.forEach((story) => {
    const uid = story?.userId;
    if (!uid) return;
    if (!groups.has(uid)) groups.set(uid, []);
    groups.get(uid).push(story);
  });

  return [...groups.values()].sort((a, b) => {
    const currentUid = auth.currentUser?.uid;
    const aOwn = a[0]?.userId === currentUid;
    const bOwn = b[0]?.userId === currentUid;
    return Number(bOwn) - Number(aOwn);
  });
};

export default function StoriesStrip({ navigation }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToStories(
      (items) => {
        setStories(Array.isArray(items) ? items : []);
        setLoading(false);
      },
      (error) => {
        console.error('Stories subscription failed:', error);
        setLoading(false);
      }
    );

    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);

  const groups = useMemo(() => groupStories(stories), [stories]);
  const currentUid = auth.currentUser?.uid;
  const own = groups.find((group) => group[0]?.userId === currentUid);
  const others = groups.filter((group) => group[0]?.userId !== currentUid);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.title}>Stories</Text>
        {loading ? <ActivityIndicator size="small" color="#111111" /> : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <TouchableOpacity
          key="your-story"
          style={styles.item}
          onPress={() => own
            ? navigation.navigate('StoryViewer', { stories: own, startIndex: 0 })
            : navigation.navigate('NewStory')}
          activeOpacity={0.85}
        >
          <View style={styles.addRing}>
            {own?.[0]?.mediaUrl ? (
              <Image source={{ uri: own[0].mediaUrl }} style={styles.avatar} />
            ) : (
              <Plus size={28} color="#111111" />
            )}
            <View style={styles.plus}>
              <Plus size={12} color="#111111" />
            </View>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {own ? 'Your story' : 'Add story'}
          </Text>
        </TouchableOpacity>
        {own ? (
          <TouchableOpacity
            style={styles.addStoryButton}
            onPress={() => navigation.navigate('NewStory')}
            accessibilityLabel="Add another story"
          >
            <Plus size={12} color="#111111" />
          </TouchableOpacity>
        ) : null}

        {others.map((group) => {
          const story = group?.[0];
          if (!story?.userId) return null;

          const seen = group.every((item) =>
            item?.viewers?.includes(currentUid)
          );

          return (
            <TouchableOpacity
              key={story.userId}
              style={styles.item}
              onPress={() =>
                navigation.navigate('StoryViewer', {
                  stories: group,
                  startIndex: 0,
                })
              }
              activeOpacity={0.85}
            >
              <View style={[styles.ring, seen && styles.seenRing]}>
                <Image
                  source={{ uri: story.userAvatar || FALLBACK_AVATAR }}
                  style={styles.avatar}
                />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {story.userName || 'Student'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E3',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  row: {
    paddingHorizontal: 16,
    gap: 14,
  },
  item: {
    width: 68,
    position: 'relative',
    alignItems: 'center',
  },
  ring: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    borderWidth: 3,
    borderColor: '#111111',
  },
  seenRing: {
    borderColor: '#D4D4D0',
  },
  addRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#D4D4D0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F7F7F5',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  plus: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFC00',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  addStoryButton: {
    position: 'absolute',
    right: 2,
    top: 43,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: YELLOW,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 5,
    fontSize: 11,
    color: '#333333',
    fontWeight: '600',
    textAlign: 'center',
  },
});
