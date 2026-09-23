import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, FlatList, Image, Keyboard, KeyboardAvoidingView,
  Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ChevronLeft, ChevronRight, Eye, Heart, MessageCircle, MoreHorizontal, Share2, Trash2, Volume2, VolumeX, X } from 'lucide-react-native';
import { auth } from '../config/firebase';
import { deleteStory, markStoryViewed, reactToStory, replyToStory, subscribeToStory, subscribeToStoryReplies } from '../services/storyService';
import { getUserProfile } from '../services/userService';

const { width, height } = Dimensions.get('window');
const IMAGE_DURATION_MS = 5000;
const FALLBACK_AVATAR = 'https://via.placeholder.com/150';

function StoryMedia({ story, paused, muted, onVideoProgress, onVideoEnd }) {
  const player = useVideoPlayer(story?.mediaType === 'video' ? story.mediaUrl : null, (instance) => {
    instance.loop = false;
    instance.muted = muted;
    instance.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    if (!player || story?.mediaType !== 'video') return undefined;
    player.muted = muted;
    const progressSub = player.addListener('timeUpdate', ({ currentTime }) => {
      onVideoProgress(currentTime, player.duration || story.mediaDuration || 15);
    });
    const endSub = player.addListener('playToEnd', onVideoEnd);
    if (paused) player.pause();
    else player.play();
    return () => {
      progressSub.remove();
      endSub.remove();
      player.pause();
    };
  }, [player, story?.id, story?.mediaType, paused, muted, onVideoProgress, onVideoEnd]);

  if (story?.mediaType !== 'video') {
    return <Image source={{ uri: story?.mediaUrl }} style={styles.media} resizeMode="contain" />;
  }

  return <VideoView player={player} style={styles.media} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />;
}

export default function StoryViewerScreen({ route, navigation }) {
  const stories = route.params?.stories || [];
  const startIndex = route.params?.startIndex || 0;
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [liveStory, setLiveStory] = useState(null);
  const [replies, setReplies] = useState([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activityVisible, setActivityVisible] = useState(false);
  const [viewerProfiles, setViewerProfiles] = useState([]);
  const [viewerLoading, setViewerLoading] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const imageTimer = useRef(null);
  const story = stories[index];
  const displayedStory = liveStory || story;
  const isMine = displayedStory?.userId === auth.currentUser?.uid;

  const goNext = useCallback(() => {
    if (index < stories.length - 1) setIndex((value) => value + 1);
    else navigation.goBack();
  }, [index, stories.length, navigation]);

  const goPrevious = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);

  useEffect(() => {
    if (!story) return undefined;
    setLiveStory(null);
    setReplyText('');
    const unsubscribeStory = subscribeToStory(story.id, setLiveStory, () => {});
    const unsubscribeReplies = subscribeToStoryReplies(story.id, setReplies, () => {});
    return () => { unsubscribeStory(); unsubscribeReplies(); };
  }, [story?.id]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardHeight(event.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!story || story.mediaType === 'video') return undefined;
    progress.setValue(0);
    if (!paused) {
      imageTimer.current = Animated.timing(progress, { toValue: 1, duration: IMAGE_DURATION_MS, useNativeDriver: false });
      imageTimer.current.start(({ finished }) => { if (finished) goNext(); });
    }
    return () => imageTimer.current?.stop();
  }, [story?.id, paused, goNext]);

  useEffect(() => {
    if (story && !isMine) markStoryViewed(story.id).catch(() => {});
  }, [story?.id, isMine]);

  const handleVideoProgress = useCallback((currentTime, duration) => {
    if (duration) progress.setValue(Math.min(1, currentTime / duration));
  }, [progress]);

  const reactionSummary = Object.entries(displayedStory?.reactions || {})
    .map(([emoji, users]) => ({ emoji, count: Array.isArray(users) ? users.length : 0 }))
    .filter((item) => item.count > 0);
  const myReaction = reactionSummary.find((item) => displayedStory?.reactions?.[item.emoji]?.includes(auth.currentUser?.uid))?.emoji;

  const openActivity = async () => {
    setActivityVisible(true);
    if (!isMine || !displayedStory?.viewers?.length) return;
    setViewerLoading(true);
    try {
      const viewerIds = Array.from(new Set((displayedStory.viewers || []).filter(Boolean))).slice(0, 50);
      const profiles = await Promise.all(viewerIds.map(async (uid) => {
        try {
          const profile = await getUserProfile(uid);
          return { ...(profile || {}), uid: profile?.uid || uid };
        } catch {
          return { uid, name: 'Student' };
        }
      }));
      setViewerProfiles(profiles.filter((profile) => profile?.uid));
    } finally {
      setViewerLoading(false);
    }
  };

  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || isMine) return;
    try {
      await replyToStory(displayedStory, text);
      setReplyText('');
      Keyboard.dismiss();
      setPaused(false);
    } catch {
      Alert.alert('Reply failed', 'Please try again.');
    }
  };

  const shareStory = async () => {
    try {
      await Share.share({ message: displayedStory?.caption ? 'Check out this WeConnect story: ' + displayedStory.caption : 'Check out this WeConnect story on WeConnect.' });
    } catch {}
  };

  const confirmDelete = () => {
    Alert.alert('Delete story', 'This story will disappear for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteStory(displayedStory.id); navigation.goBack(); } catch { Alert.alert('Delete failed', 'Please try again.'); }
      }},
    ]);
  };

  if (!story) return null;

  return (
    <View style={styles.container}>
      <StoryMedia story={displayedStory} paused={paused} muted={muted} onVideoProgress={handleVideoProgress} onVideoEnd={goNext} />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.top}>
          <View style={styles.progressRow}>
            {stories.map((item, i) => (
              <View key={item.id} style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: i < index ? '100%' : i === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }]} />
              </View>
            ))}
          </View>

          <View style={styles.header}>
            <Image source={{ uri: displayedStory.userAvatar || FALLBACK_AVATAR }} style={styles.avatar} />
            <View style={styles.headerIdentity}>
              <Text style={styles.name}>{displayedStory.userName || 'Student'}</Text>
              <Text style={styles.time}>WeConnect story • 24h</Text>
            </View>
            {displayedStory.mediaType === 'video' ? (
              <TouchableOpacity onPress={() => setMuted((value) => !value)} style={styles.headerButton}>
                {muted ? <VolumeX size={21} color="#fff" /> : <Volume2 size={21} color="#fff" />}
              </TouchableOpacity>
            ) : null}
            {isMine ? <TouchableOpacity onPress={openActivity} style={styles.headerButton}><MoreHorizontal size={22} color="#fff" /></TouchableOpacity> : null}
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.close}><X size={24} color="#fff" /></TouchableOpacity>
          </View>
        </View>

        <Pressable style={styles.leftTap} onPress={goPrevious} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        <Pressable style={styles.rightTap} onPress={goNext} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />

        {displayedStory.caption ? <Text style={styles.caption}>{displayedStory.caption}</Text> : null}
        {paused ? <View style={styles.pausedBadge}><Text style={styles.pausedText}>Paused</Text></View> : null}

        {!isMine ? (
          <View style={[styles.viewerBottom, { bottom: Math.max(12, keyboardHeight + 8) }]}>
            <View style={styles.reactionRow}>
              {['❤️', '😂', '😮', '🔥', '👏'].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionButton, myReaction === emoji && styles.reactionButtonActive]}
                  onPress={() => reactToStory(displayedStory, emoji).catch(() => {})}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.replyWrap}>
              <TextInput
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Reply to story..."
                placeholderTextColor="rgba(255,255,255,.72)"
                style={styles.replyInput}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                returnKeyType="send"
                onSubmitEditing={sendReply}
              />
              <TouchableOpacity style={styles.replySend} onPress={sendReply}><Text style={styles.replySendText}>Send</Text></TouchableOpacity>
            </KeyboardAvoidingView>
            <TouchableOpacity style={styles.shareButton} onPress={shareStory}><Share2 size={18} color="#fff" /><Text style={styles.shareText}>Share</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ownerTools}>
            <TouchableOpacity style={styles.insightsCard} onPress={openActivity} activeOpacity={0.86}>
              <View style={styles.insightsTop}>
                <View><Text style={styles.insightsTitle}>Story activity</Text><Text style={styles.insightsMeta}>{displayedStory?.viewers?.length || 0} views • {replies.length} replies</Text></View>
                <Eye size={19} color="#fff" />
              </View>
              <View style={styles.insightsStats}>
                {reactionSummary.length ? reactionSummary.map((item) => <Text key={item.emoji} style={styles.insightReaction}>{item.emoji} {item.count}</Text>) : <Text style={styles.noInsights}>No reactions yet</Text>}
              </View>
              {replies.length ? <Text style={styles.insightReply}>{replies[replies.length - 1].senderName || 'Student'}: {replies[replies.length - 1].text}</Text> : null}
              <Text style={styles.tapHint}>Tap to view viewers, reactions and replies</Text>
            </TouchableOpacity>
            <View style={styles.ownerActions}>
              <TouchableOpacity style={styles.ownerAction} onPress={shareStory}><Share2 size={18} color="#fff" /><Text style={styles.ownerActionText}>Share</Text></TouchableOpacity>
              <TouchableOpacity style={styles.ownerActionDanger} onPress={confirmDelete}><Trash2 size={18} color="#fff" /><Text style={styles.ownerActionText}>Delete</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      <Modal visible={activityVisible} animationType="slide" transparent onRequestClose={() => setActivityVisible(false)}>
        <View style={styles.activityOverlay}>
          <TouchableOpacity style={styles.activityBackdrop} activeOpacity={1} onPress={() => setActivityVisible(false)} />
          <View style={styles.activitySheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View><Text style={styles.sheetEyebrow}>STORY ACTIVITY</Text><Text style={styles.sheetTitle}>{displayedStory?.viewers?.length || 0} views</Text></View>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setActivityVisible(false)}><X size={19} color="#111" /></TouchableOpacity>
            </View>

            <View style={styles.reactionSummaryCard}>
              <View style={styles.summaryIcon}><Heart size={18} color="#111" /></View>
              <View style={{ flex: 1 }}><Text style={styles.summaryTitle}>Reactions</Text><Text style={styles.summarySub}>{reactionSummary.length ? reactionSummary.map((item) => item.emoji + ' ' + item.count).join('   ') : 'No reactions yet'}</Text></View>
            </View>

            <View style={styles.activityTabs}>
              <View style={styles.activityTabActive}><Eye size={15} color="#111" /><Text style={styles.activityTabText}>Viewers</Text></View>
              <View style={styles.activityTab}><MessageCircle size={15} color="#777" /><Text style={styles.activityTabTextMuted}>{replies.length} replies</Text></View>
            </View>

            {isMine ? (
              viewerLoading ? <View style={styles.center}><ActivityIndicator color="#111" /></View> :
              <FlatList
                data={viewerProfiles}
                keyExtractor={(item, itemIndex) => String(item?.uid || item?.id || `viewer-${itemIndex}`)}
                contentContainerStyle={styles.viewerList}
                ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyActivity}>No viewers yet. Share your story with classmates.</Text></View>}
                renderItem={({ item }) => (
                  <View style={styles.viewerRow}>
                    <Image source={{ uri: item.avatar || FALLBACK_AVATAR }} style={styles.viewerAvatar} />
                    <View style={{ flex: 1 }}><Text style={styles.viewerName}>{item.name || 'Student'}</Text><Text style={styles.viewerMeta}>{item.handle || item.course || 'WeConnect student'}</Text></View>
                  </View>
                )}
              />
            ) : (
              <FlatList
                data={replies}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.viewerList}
                ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyActivity}>No replies yet.</Text></View>}
                renderItem={({ item }) => <View style={styles.replyRow}><Text style={styles.viewerName}>{item.senderName || 'Student'}</Text><Text style={styles.replyText}>{item.text}</Text></View>}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  media: { width, height, position: 'absolute', backgroundColor: '#000' },
  overlay: { flex: 1 },
  top: { paddingHorizontal: 10 },
  progressRow: { flexDirection: 'row', gap: 4, paddingTop: 5 },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,.35)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#fff' },
  header: { height: 57, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIdentity: { flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  name: { color: '#fff', fontWeight: '900', fontSize: 14 },
  time: { color: 'rgba(255,255,255,.72)', fontSize: 10, marginTop: 1 },
  headerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  close: { padding: 8 },
  leftTap: { position: 'absolute', left: 0, top: 70, bottom: 0, width: '32%' },
  rightTap: { position: 'absolute', right: 0, top: 70, bottom: 0, width: '68%' },
  caption: { position: 'absolute', left: 20, right: 20, bottom: 195, color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  pausedBadge: { position: 'absolute', top: 105, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.55)' },
  pausedText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  viewerBottom: { position: 'absolute', left: 16, right: 16 },
  reactionRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  reactionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,.52)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  reactionButtonActive: { backgroundColor: 'rgba(255,252,0,.35)', borderColor: '#FFFC00' },
  reactionEmoji: { fontSize: 20 },
  replyWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyInput: { flex: 1, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,.55)', backgroundColor: 'rgba(0,0,0,.48)', paddingHorizontal: 16, color: '#fff', fontSize: 13 },
  replySend: { height: 46, paddingHorizontal: 15, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  replySendText: { color: '#111', fontWeight: '900' },
  shareButton: { alignSelf: 'center', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.48)' },
  shareText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  ownerTools: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  insightsCard: { backgroundColor: 'rgba(0,0,0,.68)', borderRadius: 18, padding: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  insightsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  insightsTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  insightsMeta: { color: 'rgba(255,255,255,.72)', fontSize: 10, marginTop: 3 },
  insightsStats: { flexDirection: 'row', gap: 12, marginTop: 9 },
  insightReaction: { color: '#fff', fontSize: 12, fontWeight: '800' },
  noInsights: { color: 'rgba(255,255,255,.6)', fontSize: 11 },
  insightReply: { color: '#fff', fontSize: 11, marginTop: 9 },
  tapHint: { color: 'rgba(255,255,255,.58)', fontSize: 9, marginTop: 8 },
  ownerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  ownerAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: 'rgba(0,0,0,.55)' },
  ownerActionDanger: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: 'rgba(150,0,0,.72)' },
  ownerActionText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  activityOverlay: { flex: 1, justifyContent: 'flex-end' },
  activityBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.5)' },
  activitySheet: { maxHeight: '78%', backgroundColor: '#F6F6F2', borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#C7C7C1' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sheetEyebrow: { color: '#8C8C84', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sheetTitle: { color: '#111', fontSize: 20, fontWeight: '900', marginTop: 2 },
  sheetClose: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  reactionSummaryCard: { minHeight: 62, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4E4DE', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  summaryIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { color: '#111', fontSize: 12, fontWeight: '900' },
  summarySub: { color: '#686860', fontSize: 11, marginTop: 3 },
  activityTabs: { flexDirection: 'row', gap: 8, marginTop: 11 },
  activityTabActive: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: '#FFFC00' },
  activityTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, backgroundColor: '#E9E9E4' },
  activityTabText: { color: '#111', fontSize: 10, fontWeight: '900' },
  activityTabTextMuted: { color: '#777', fontSize: 10, fontWeight: '800' },
  viewerList: { paddingVertical: 10 },
  viewerRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  viewerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E5DF' },
  viewerName: { color: '#111', fontSize: 12, fontWeight: '900' },
  viewerMeta: { color: '#85857D', fontSize: 10, marginTop: 2 },
  replyRow: { paddingVertical: 10, paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: '#E5E5DF' },
  replyText: { color: '#44443F', fontSize: 12, marginTop: 4, lineHeight: 17 },
  center: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  emptyActivity: { color: '#85857D', fontSize: 12, textAlign: 'center', paddingHorizontal: 35 },
});
