import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Trash2 } from 'lucide-react-native';
import { auth } from '../config/firebase';
import { deleteStory, markStoryViewed, reactToStory, replyToStory, subscribeToStory, subscribeToStoryReplies } from '../services/storyService';

const { width, height } = Dimensions.get('window');

export default function StoryViewerScreen({ route, navigation }) {
  const stories = route.params?.stories || [];
  const startIndex = route.params?.startIndex || 0;
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [liveStory, setLiveStory] = useState(story);
  const [replies, setReplies] = useState([]);
  const progress = useRef(new Animated.Value(0)).current;
  const story = stories[index];
  const timer = useRef(null);

  const goNext = () => {
    if (index < stories.length - 1) setIndex((value) => value + 1);
    else navigation.goBack();
  };
  const goPrevious = () => setIndex((value) => Math.max(0, value - 1));

  useEffect(() => {
    if (!story) return;
    const unsubscribeStory = subscribeToStory(story.id, setLiveStory, () => {});
    const unsubscribeReplies = subscribeToStoryReplies(story.id, setReplies, () => {});
    return () => { unsubscribeStory(); unsubscribeReplies(); };
  }, [story?.id]);

  useEffect(() => {
    if (!story) return;
    markStoryViewed(story.id).catch(() => {});
    progress.setValue(0);
    if (!paused) {
      timer.current = Animated.timing(progress, { toValue: 1, duration: story.mediaType === 'video' ? 15000 : 5000, useNativeDriver: false });
      timer.current.start(({ finished }) => { if (finished) goNext(); });
    }
    return () => timer.current?.stop();
  }, [index, story?.id, paused]);

  const isMine = story?.userId === auth.currentUser?.uid;
  const displayedStory = liveStory || story;
  const reactionSummary = Object.entries(displayedStory?.reactions || {}).map(([emoji, users]) => ({ emoji, count: Array.isArray(users) ? users.length : 0 })).filter((item) => item.count > 0);
  if (!story) return null;

  return (
    <View style={styles.container}>
      <Image source={{ uri: story.mediaUrl }} style={styles.media} resizeMode="contain" />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.top}>
          <View style={styles.progressRow}>{stories.map((item, i) => <View key={item.id} style={styles.progressTrack}><Animated.View style={[styles.progressFill, { width: i < index ? '100%' : i === index ? progress.interpolate({inputRange:[0,1],outputRange:['0%','100%']}) : '0%' }]} /></View>)}</View>
          <View style={styles.header}>
            <Image source={{ uri: story.userAvatar || 'https://via.placeholder.com/150' }} style={styles.avatar} />
            <Text style={styles.name}>{story.userName || 'Student'}</Text>
            <Text style={styles.time}>• 24h</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.close}><X size={24} color="#fff" /></TouchableOpacity>
          </View>
        </View>
        <Pressable style={styles.leftTap} onPress={goPrevious} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        <Pressable style={styles.rightTap} onPress={goNext} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        {story.caption ? <Text style={styles.caption}>{story.caption}</Text> : null}
        {paused ? <View style={styles.pausedBadge}><Text style={styles.pausedText}>Paused</Text></View> : null}
        <View style={styles.reactionRow}>
          {['❤️','😂','😮','🔥','👏'].map((emoji) => <TouchableOpacity key={emoji} style={styles.reactionButton} onPress={() => reactToStory(displayedStory, emoji).catch(() => {})}><Text style={styles.reactionEmoji}>{emoji}</Text></TouchableOpacity>)}
        </View>
        {!isMine ? <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.replyWrap}>
          <TextInput value={replyText} onChangeText={setReplyText} placeholder="Reply to story..." placeholderTextColor="rgba(255,255,255,.7)" style={styles.replyInput} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} />
          <TouchableOpacity style={styles.replySend} onPress={async () => { if (!replyText.trim()) return; await replyToStory(displayedStory, replyText); setReplyText(''); setPaused(false); }}><Text style={styles.replySendText}>Send</Text></TouchableOpacity>
        </KeyboardAvoidingView> : null}
        {isMine ? <View style={styles.ownerTools}>
          <View style={styles.insightsCard}>
            <Text style={styles.insightsTitle}>Story activity</Text>
            <Text style={styles.insightsMeta}>{displayedStory?.viewers?.length || 0} views • {replies.length} replies</Text>
            {reactionSummary.length ? <View style={styles.insightsReactions}>{reactionSummary.map((item) => <Text key={item.emoji} style={styles.insightReaction}>{item.emoji} {item.count}</Text>)}</View> : <Text style={styles.noInsights}>No reactions yet</Text>}
            {replies.slice(-2).map((item) => <Text key={item.id} style={styles.insightReply} numberOfLines={1}>{item.senderName || 'Student'}: {item.text}</Text>)}
          </View>
          <TouchableOpacity style={styles.delete} onPress={() => Alert.alert('Delete story','Delete this story?', [{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:async()=>{await deleteStory(story.id); navigation.goBack();}}])}><Trash2 size={20} color="#fff" /></TouchableOpacity></View> : null}
      </SafeAreaView>
    </View>
  );
}
const styles=StyleSheet.create({pausedBadge:{position:'absolute',top:95,alignSelf:'center',paddingHorizontal:12,paddingVertical:6,borderRadius:14,backgroundColor:'rgba(0,0,0,.55)'},pausedText:{color:'#fff',fontWeight:'800',fontSize:12},reactionRow:{position:'absolute',bottom:76,left:18,flexDirection:'row',gap:8},reactionButton:{width:42,height:42,borderRadius:21,backgroundColor:'rgba(0,0,0,.45)',alignItems:'center',justifyContent:'center'},reactionEmoji:{fontSize:21},replyWrap:{position:'absolute',bottom:15,left:18,right:18,flexDirection:'row',alignItems:'center',gap:8},replyInput:{flex:1,height:44,borderRadius:22,borderWidth:1,borderColor:'rgba(255,255,255,.5)',backgroundColor:'rgba(0,0,0,.4)',paddingHorizontal:16,color:'#fff'},replySend:{height:44,paddingHorizontal:15,borderRadius:22,backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},replySendText:{color:'#111827',fontWeight:'800'},container:{flex:1,backgroundColor:'#000'},media:{width,height,position:'absolute'},overlay:{flex:1},top:{paddingHorizontal:10},progressRow:{flexDirection:'row',gap:4,paddingTop:5},progressTrack:{flex:1,height:3,backgroundColor:'rgba(255,255,255,.35)',borderRadius:3,overflow:'hidden'},progressFill:{height:3,backgroundColor:'#fff'},header:{height:55,flexDirection:'row',alignItems:'center',gap:8},avatar:{width:34,height:34,borderRadius:17},name:{color:'#fff',fontWeight:'800',fontSize:14},time:{color:'rgba(255,255,255,.75)',fontSize:12},close:{marginLeft:'auto',padding:8},leftTap:{position:'absolute',left:0,top:70,bottom:0,width:'32%'},rightTap:{position:'absolute',right:0,top:70,bottom:0,width:'68%'},caption:{position:'absolute',left:20,right:20,bottom:80,color:'#fff',fontSize:18,fontWeight:'600',textAlign:'center'},ownerTools:{position:'absolute',left:18,right:18,bottom:18,alignItems:'stretch'},insightsCard:{backgroundColor:'rgba(0,0,0,.62)',borderRadius:16,padding:12,marginBottom:8},insightsTitle:{color:'#fff',fontSize:13,fontWeight:'900'},insightsMeta:{color:'rgba(255,255,255,.78)',fontSize:11,marginTop:3},insightsReactions:{flexDirection:'row',gap:12,marginTop:8},insightReaction:{color:'#fff',fontSize:13,fontWeight:'800'},noInsights:{color:'rgba(255,255,255,.65)',fontSize:11,marginTop:7},insightReply:{color:'#fff',fontSize:11,marginTop:5},delete:{alignSelf:'flex-end',padding:12}
});
