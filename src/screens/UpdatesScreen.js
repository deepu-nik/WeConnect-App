import React, { useState, useEffect } from 'react';
import { openProfile as navigateToProfile } from '../navigation/navigationHelpers';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Share,
  Image, TextInput, StatusBar, Modal, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Camera, Heart, MessageCircle, Send, MoreVertical, 
  Plus, X, Image as ImageIcon, MessageSquare, BarChart2, 
  MapPin, VenetianMask, Zap, Flame, Rocket, Ticket, Calendar 
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

// Firebase & Utils
import { auth, db } from '../config/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, orderBy, increment, where } from 'firebase/firestore';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import MediaShareSheet from '../components/MediaShareSheet';
import { getUserProfile } from '../services/userService';
import StoriesStrip from '../components/StoriesStrip';

const { width } = Dimensions.get('window');

const UpdatesScreen = ({ navigation }) => {
  const currentUser = auth.currentUser;

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create Post Modal State
  const [isModalVisible, setModalVisible] = useState(false);
  const [postType, setPostType] = useState('event'); 
  const [isUploading, setIsUploading] = useState(false);
  
  // Comments Modal State
  const [isCommentsVisible, setCommentsVisible] = useState(false);
  const [activePostId, setActivePostId] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  
  // Form States
  const [caption, setCaption] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [mediaShareVisible, setMediaShareVisible] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']); 
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');

  // --- ⏳ FETCH POSTS (WITH 48-HOUR AUTO-HIDE LOGIC) ---
  useEffect(() => {
    let unsubscribe = null;
    let active = true;

    const subscribeToCampusPosts = async () => {
      if (!currentUser?.uid) return;
      try {
        const profile = await getUserProfile(currentUser.uid);
        if (!active || !profile?.collegeId) {
          if (active) setLoading(false);
          return;
        }

        const q = query(
          collection(db, 'buzz_posts'),
          where('collegeId', '==', profile.collegeId),
          orderBy('createdAt', 'desc')
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
          const now = Date.now();
          const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
          const cutoffTime = now - FORTY_EIGHT_HOURS_MS;

          const fetchedPosts = snapshot.docs
            .map(postDoc => ({ id: postDoc.id, ...postDoc.data() }))
            .filter(post => {
              if (!post.createdAt) return true;
              const postTime = post.createdAt.toMillis ? post.createdAt.toMillis() : post.createdAt.toDate().getTime();
              return postTime > cutoffTime;
            });

          setPosts(fetchedPosts);
          setLoading(false);
        }, (error) => {
          console.error('Campus posts subscription failed:', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('Could not load campus profile:', error);
        if (active) setLoading(false);
      }
    };

    subscribeToCampusPosts();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser?.uid]);

  // --- FETCH COMMENTS REAL-TIME ---
  useEffect(() => {
    if (!activePostId || activePostId.startsWith('dummy_')) return;

    const commentsRef = collection(db, 'buzz_posts', activePostId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(fetchedComments);
    });

    return () => unsubscribe();
  }, [activePostId]);

  // --- UPLOAD / CREATE POST LOGIC ---
  const handleMediaPicked = async (items, mediaCaption) => {
    setSelectedMedia(items);
    setSelectedImage(items[0]?.uri || null);
    if (mediaCaption) setCaption(mediaCaption);
  };

  const handleCreatePost = async () => {
    if (isUploading) return;
    setIsUploading(true);

    try {
      if (!currentUser) throw new Error('You must be signed in.');
      if (['confession', 'hot_take', 'plan'].includes(postType) && !caption.trim()) {
        setIsUploading(false);
        return alert('Please write something before sharing.');
      }
      if (postType === 'poll' && !pollQuestion.trim()) {
        setIsUploading(false);
        return alert('Please add a poll question.');
      }
      let imageUrl = null;
      let mediaItems = [];
      if ((postType === 'image' || postType === 'spotted') && selectedMedia.length) {
        for (const media of selectedMedia) {
          const url = await uploadToCloudinary(media.uri, media.type);
          if (!url) throw new Error('Media upload failed');
          mediaItems.push({ url, type: media.type });
        }
        imageUrl = mediaItems[0]?.url || null;
      }

      const newPost = {
        collegeId: (await getUserProfile(currentUser.uid))?.collegeId || 'dypiu',
        authorId: currentUser.uid,
        type: postType,
        createdAt: serverTimestamp(),
        likes: [],
        commentCount: 0,
        expireAt: new Date(Date.now() + (48 * 60 * 60 * 1000)) 
      };

      if (postType === 'confession') {
        newPost.author = { name: 'Anonymous Student', avatar: 'https://via.placeholder.com/150/0f172a/FFFFFF?text=?' };
        newPost.content = caption;
      } else {
        newPost.author = { 
          uid: currentUser.uid, 
          name: currentUser.displayName || 'Student', 
          avatar: currentUser.photoURL || 'https://via.placeholder.com/150' 
        };
        newPost.content = caption;
        newPost.imageUrl = imageUrl;
        newPost.mediaItems = mediaItems;
      }

      if (postType === 'poll') {
        const validOptions = pollOptions.filter(opt => opt.trim() !== '');
        if (validOptions.length < 2) {
          setIsUploading(false);
          return alert("Polls need at least 2 options!");
        }
        newPost.question = pollQuestion;
        newPost.options = validOptions;
        newPost.votes = {}; 
      }
      
      if (postType === 'event') {
        if (!eventName.trim() || !eventDate.trim()) {
           setIsUploading(false);
           return alert("Please provide an Event Name and Date!");
        }
        newPost.eventName = eventName;
        newPost.eventDate = eventDate;
      }

      await addDoc(collection(db, 'buzz_posts'), newPost);

      setModalVisible(false);
      setCaption('');
      setSelectedImage(null);
      setSelectedMedia([]);
      setPollQuestion('');
      setPollOptions(['', '']);
      setEventName('');
      setEventDate('');
      setIsUploading(false);

    } catch (error) {
      console.error(error);
      setIsUploading(false);
      alert("Failed to create post.");
    }
  };

  // --- INTERACTION LOGIC ---
  const toggleLike = async (postId, currentLikes) => {

    const postRef = doc(db, 'buzz_posts', postId);
    if (currentLikes.includes(currentUser.uid)) {
      await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
    } else {
      await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
    }
  };

  const votePoll = async (postId, optionIndex) => {
    const postRef = doc(db, 'buzz_posts', postId);
    await updateDoc(postRef, {
      [`votes.${currentUser.uid}`]: optionIndex
    });
  };

  const openComments = (postId) => {
    setActivePostId(postId);
    setCommentsVisible(true);
  };

  const postComment = async () => {
    if (!newComment.trim() || !activePostId) return;
    setIsPostingComment(true);

    try {
      const commentsRef = collection(db, 'buzz_posts', activePostId, 'comments');
      await addDoc(commentsRef, {
        text: newComment.trim(),
        author: {
          uid: currentUser.uid,
          name: currentUser.displayName || 'Student',
          avatar: currentUser.photoURL || 'https://via.placeholder.com/150'
        },
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'buzz_posts', activePostId), { commentCount: increment(1) });

      setNewComment('');
    } catch (error) {
      console.error(error);
      alert("Failed to post comment.");
    } finally {
      setIsPostingComment(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((new Date() - timestamp.toDate()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + 'y';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + 'mo';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + 'd';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + 'h';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + 'm';
    return Math.floor(seconds) + 's';
  };

  // --- COMPONENT RENDERERS ---
  const renderPost = ({ item }) => {
    const isLiked = item.likes?.includes(currentUser?.uid);
    const likeCount = item.likes?.length || 0;
    const commentCount = item.commentCount || 0;

    // --- 1. EVENT / HACKATHON CARD ---
    if (item.type === 'event') {
      return (
        <View style={styles.eventCard}>
          <View style={styles.eventBanner}>
             <View style={styles.eventBadge}>
               <Ticket size={14} color="#fff" />
               <Text style={styles.eventBadgeText}>Upcoming Event</Text>
             </View>
          </View>
          
          <View style={styles.eventBody}>
            <Text style={styles.eventTitle}>{item.eventName}</Text>
            <View style={styles.eventDateRow}>
               <Calendar size={14} color="#707070" />
               <Text style={styles.eventDateText}>{item.eventDate}</Text>
            </View>
            
            {item.content ? <Text style={styles.eventDesc}>{item.content}</Text> : null}
            
            <View style={styles.eventAuthorRow}>
               <TouchableOpacity onPress={() => openProfile(item.author)}><Image source={{ uri: item.author.avatar }} style={styles.eventAvatar} /></TouchableOpacity>
               <Text style={styles.eventAuthorText}>Posted by <Text onPress={() => openProfile(item.author)} style={{fontWeight: 'bold', color: '#111111'}}>{item.author.name}</Text> • {formatTime(item.createdAt)}</Text>
            </View>

            <View style={styles.eventFooter}>
               <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
                 <Text style={styles.eventRsvpCount}>🎟️ {likeCount} attending</Text>
                 <TouchableOpacity onPress={() => openComments(item.id)} style={{flexDirection: 'row', alignItems: 'center'}}>
                    <MessageCircle size={20} color="#707070" />
                    <Text style={{marginLeft: 5, color: '#707070', fontWeight: 'bold'}}>{commentCount}</Text>
                 </TouchableOpacity>
               </View>

               <TouchableOpacity 
                 style={[styles.eventRsvpBtn, isLiked && styles.eventRsvpBtnActive]} 
                 onPress={() => toggleLike(item.id, item.likes || [])}
               >
                 <Text style={[styles.eventRsvpBtnText, isLiked && {color: '#fff'}]}>
                   {isLiked ? "RSVP'd ✅" : "RSVP Now"}
                 </Text>
               </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // --- 2. PREMIUM IMAGE / SPOTTED POST CARD ---
    if (item.type === 'image' || item.type === 'spotted') {
      return (
        <View style={styles.premiumCard}>
          <View style={styles.cardHeader}>
            <TouchableOpacity onPress={() => openProfile(item.author)}><Image source={{ uri: item.author.avatar }} style={styles.authorAvatar} /></TouchableOpacity>
            <View style={styles.authorInfo}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <TouchableOpacity onPress={() => openProfile(item.author)}><Text style={styles.authorName}>{item.author.name}</Text></TouchableOpacity>
                {item.type === 'spotted' && (
                  <View style={styles.spottedBadge}>
                    <MapPin size={10} color="#fff" />
                    <Text style={styles.spottedText}>Spotted</Text>
                  </View>
                )}
              </View>
              <Text style={styles.postTime}>{formatTime(item.createdAt)}</Text>
            </View>
            <TouchableOpacity style={styles.moreIcon}><MoreVertical size={20} color="#999999" /></TouchableOpacity>
          </View>

          {(item.mediaItems?.length || item.imageUrl) ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.mediaCarousel}>
              {(item.mediaItems?.length ? item.mediaItems : [{ url: item.imageUrl, type: 'image' }]).map((media, index) => (
                <View key={media.url || index} style={styles.imageWrapper}>
                  {media.type === 'video' ? (
                    <View style={[styles.premiumImage, styles.videoPostPlaceholder]}>
                      <Camera size={34} color="#fff" />
                      <Text style={styles.videoPostText}>Video</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: media.url }} style={styles.premiumImage} resizeMode="cover" />
                  )}
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.cardFooter}>
            {item.content ? (
              <Text style={styles.premiumCaption}>
                <Text style={styles.captionAuthor}>{item.author.name} </Text>
                {item.content}
              </Text>
            ) : null}

            <View style={styles.premiumActionRow}>
              <View style={styles.actionLeft}>
                <TouchableOpacity onPress={() => toggleLike(item.id, item.likes || [])} style={styles.actionBtnPremium}>
                  <Heart size={22} color={isLiked ? "#FF3B30" : "#707070"} fill={isLiked ? "#FF3B30" : "transparent"} />
                  <Text style={[styles.actionCount, isLiked && {color: '#FF3B30'}]}>{likeCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openComments(item.id)} style={styles.actionBtnPremium}>
                  <MessageCircle size={22} color="#707070" />
                  <Text style={styles.actionCount}>{commentCount}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.actionBtnPremiumShare} onPress={() => sharePost(item)}>
                <Send size={20} color="#707070" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // --- 3. SECRET CONFESSION CARD ---
    if (item.type === 'confession') {
      return (
        <View style={styles.confessionPremiumCard}>
          <View style={styles.confessionHeader}>
            <View style={styles.confessionLabelBadge}>
              <VenetianMask size={14} color="#AF52DE" />
              <Text style={styles.confessionLabelText}>Secret Confession</Text>
            </View>
            <Text style={styles.confessionTime}>{formatTime(item.createdAt)}</Text>
          </View>
          <Text style={styles.confessionText}>"{item.content}"</Text>
          <View style={styles.confessionActionRow}>
            <TouchableOpacity onPress={() => toggleLike(item.id, item.likes || [])} style={styles.actionBtnPremium}>
              <Heart size={20} color={isLiked ? "#FF3B30" : "rgba(255,255,255,0.6)"} fill={isLiked ? "#FF3B30" : "transparent"} />
              <Text style={[styles.confessionActionCount, isLiked && {color: '#FF3B30'}]}>{likeCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openComments(item.id)} style={styles.actionBtnPremium}>
              <MessageCircle size={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.confessionActionCount}>{commentCount}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // --- 4. HOT TAKE CARD ---
    if (item.type === 'hot_take') {
      return (
        <View style={styles.hotTakeCard}>
          <View style={styles.hotTakeHeader}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
              <TouchableOpacity onPress={() => openProfile(item.author)}><Image source={{ uri: item.author.avatar }} style={styles.hotTakeAvatar} /></TouchableOpacity>
              <View>
                <TouchableOpacity onPress={() => openProfile(item.author)}><Text style={styles.hotTakeAuthor}>{item.author.name}</Text></TouchableOpacity>
                <Text style={styles.hotTakeTime}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.hotTakeBadge}>
              <Flame size={14} color="#dc2626" fill="#dc2626" />
              <Text style={styles.hotTakeBadgeText}>Hot Take</Text>
            </View>
          </View>
          
          <Text style={styles.hotTakeText}>{item.content}</Text>
          
          <View style={styles.hotTakeActionRow}>
            <TouchableOpacity onPress={() => toggleLike(item.id, item.likes || [])} style={styles.actionBtnPremium}>
              <Flame size={20} color={isLiked ? "#fff" : "rgba(255,255,255,0.7)"} fill={isLiked ? "#fff" : "transparent"} />
              <Text style={[styles.hotTakeActionCount, isLiked && {color: '#fff', fontWeight: 'bold'}]}>
                {likeCount} {isLiked ? 'Agree' : 'Agrees'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openComments(item.id)} style={styles.actionBtnPremium}>
              <MessageCircle size={20} color="rgba(255,255,255,0.7)" />
              <Text style={styles.hotTakeActionCount}>{commentCount} Debates</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // --- 5. FLASH PLAN CARD ---
    if (item.type === 'plan') {
      return (
        <View style={styles.flashPlanCard}>
          <View style={styles.cardHeader}>
            <Image source={{ uri: item.author.avatar }} style={styles.authorAvatar} />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{item.author.name}</Text>
              <Text style={styles.postTime}>{formatTime(item.createdAt)}</Text>
            </View>
            <View style={styles.planBadge}>
              <Rocket size={14} color="#111111" />
              <Text style={styles.planBadgeText}>Flash Plan</Text>
            </View>
          </View>

          <View style={styles.planContentBox}>
            <Text style={styles.planText}>{item.content}</Text>
          </View>

          <View style={styles.planFooter}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
              <Text style={styles.planJoinCount}>🔥 {likeCount} people are in</Text>
              <TouchableOpacity onPress={() => openComments(item.id)} style={{flexDirection: 'row', alignItems: 'center'}}>
                 <MessageCircle size={20} color="#707070" />
                 <Text style={{marginLeft: 5, color: '#707070', fontWeight: 'bold'}}>{commentCount}</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={[styles.planJoinBtn, isLiked && styles.planJoinBtnActive]} 
              onPress={() => toggleLike(item.id, item.likes || [])}
            >
              <Text style={[styles.planJoinBtnText, isLiked && {color: '#fff'}]}>
                {isLiked ? "You're In! ✅" : "Count Me In ✋"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // --- 6. INTERACTIVE POLL WIDGET ---
    if (item.type === 'poll') {
      const totalVotes = Object.keys(item.votes || {}).length;
      const userVotedIndex = item.votes ? item.votes[currentUser?.uid] : undefined;
      const hasVoted = userVotedIndex !== undefined;

      return (
        <View style={styles.premiumCard}>
          <View style={styles.cardHeader}>
            <Image source={{ uri: item.author.avatar }} style={styles.authorAvatar} />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{item.author.name}</Text>
              <Text style={styles.postTime}>{formatTime(item.createdAt)} • Poll</Text>
            </View>
            <TouchableOpacity style={styles.moreIcon}><MoreVertical size={20} color="#999999" /></TouchableOpacity>
          </View>
          
          <View style={styles.pollWrapper}>
            <Text style={styles.pollPremiumQuestion}>{item.question}</Text>
            
            {item.options.map((option, index) => {
              const optionVotes = Object.values(item.votes || {}).filter(v => v === index).length;
              const percent = totalVotes === 0 ? 0 : Math.round((optionVotes / totalVotes) * 100);
              const isMyVote = userVotedIndex === index;

              return (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.pollPremiumOption, hasVoted && styles.pollPremiumOptionVoted, isMyVote && styles.pollPremiumOptionMine]}
                  onPress={() => !hasVoted && votePoll(item.id, index)}
                  activeOpacity={hasVoted ? 1 : 0.7}
                >
                  {hasVoted && (
                    <View style={[styles.pollPremiumProgress, { width: `${percent}%`, backgroundColor: isMyVote ? '#E6F4FE' : '#F0F0EC' }]} />
                  )}
                  
                  <View style={styles.pollPremiumOptionContent}>
                    <Text style={[styles.pollPremiumOptionText, isMyVote && {fontWeight: '700', color: '#111111'}]}>{option}</Text>
                    {hasVoted && <Text style={[styles.pollPremiumPercent, isMyVote && {color: '#111111'}]}>{percent}%</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            
            <View style={styles.pollFooterRow}>
               <Text style={styles.pollTotalVotes}>{totalVotes} total votes</Text>
               <View style={{flexDirection: 'row', alignItems: 'center', gap: 15}}>
                 <TouchableOpacity onPress={() => toggleLike(item.id, item.likes || [])} style={styles.actionBtnPremium}>
                   <Heart size={18} color={isLiked ? "#FF3B30" : "#707070"} fill={isLiked ? "#FF3B30" : "transparent"} />
                   <Text style={[styles.actionCount, isLiked && {color: '#FF3B30'}]}>{likeCount}</Text>
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => openComments(item.id)} style={styles.actionBtnPremium}>
                    <MessageCircle size={18} color="#707070" />
                    <Text style={styles.actionCount}>{commentCount}</Text>
                 </TouchableOpacity>
               </View>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  const sharePost = async (post) => {
    const media = post.mediaItems?.[0]?.url || post.imageUrl;
    const message = [post.content, media].filter(Boolean).join('\n\n');
    if (!message) return;
    try {
      await Share.share({
        title: 'Share from College Buzz',
        message,
        ...(media ? { url: media } : {}),
      });
    } catch (error) {
      if (error?.message) console.log('Post share cancelled:', error.message);
    }
  };

  const openProfile = (author) => { if (!author?.uid || author.uid === currentUser?.uid) return; navigateToProfile(navigation, { uid: author.uid, name: author.name, avatar: author.avatar }); };

  const renderComment = ({ item }) => (
    <View style={styles.commentRow}>
      <Image source={{ uri: item.author.avatar }} style={styles.commentAvatar} />
      <View style={styles.commentContent}>
        <TouchableOpacity onPress={() => openProfile(item.author)}><Text style={styles.commentAuthor}>{item.author.name} <Text style={styles.commentTime}>{formatTime(item.createdAt)}</Text></Text></TouchableOpacity>
        <Text style={styles.commentText}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* PREMIUM HEADER WITH LIGHTNING ICON */}
      <View style={styles.premiumHeader}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>College Buzz</Text>
          <Zap size={24} color="#FF9500" fill="#FF9500" style={styles.headerZapIcon} />
        </View>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => setModalVisible(true)}>
          <View style={styles.headerPlusWrapper}>
            <Plus size={20} color="#000" />
          </View>
        </TouchableOpacity>
      </View>

      {/* MAIN FEED */}
      {loading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#111111" /></View>
      ) : (
        <>
          <StoriesStrip navigation={navigation} />

      <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.feedContent, posts.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyTitle}>No recent updates</Text>
              <Text style={styles.emptySubtitle}>Be the first to post something useful for your campus.</Text>
            </View>
          }
        />
        </>
      )}

      {/* --- CREATE POST MODAL --- */}
      <Modal visible={isModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>New Buzz</Text>
            <TouchableOpacity onPress={handleCreatePost} disabled={isUploading}>
              {isUploading ? <ActivityIndicator size="small" color="#111111" /> : <Text style={styles.postText}>Share</Text>}
            </TouchableOpacity>
          </View>

          {/* Horizontally Scrollable Type Selector Tabs */}
          <View style={styles.tabsWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeTabsScroll}>
              <TouchableOpacity style={[styles.typeTab, postType === 'event' && styles.typeTabActive]} onPress={() => setPostType('event')}>
                <Ticket size={16} color={postType === 'event' ? "#AF52DE" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'event' && {color: '#AF52DE'}]}>Event Drop</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeTab, postType === 'plan' && styles.typeTabActive]} onPress={() => setPostType('plan')}>
                <Rocket size={16} color={postType === 'plan' ? "#111111" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'plan' && {color: '#111111'}]}>Flash Plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeTab, postType === 'image' && styles.typeTabActive]} onPress={() => setPostType('image')}>
                <ImageIcon size={16} color={postType === 'image' ? "#111111" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'image' && styles.typeTabTextActive]}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeTab, postType === 'poll' && styles.typeTabActive]} onPress={() => setPostType('poll')}>
                <BarChart2 size={16} color={postType === 'poll' ? "#FF9500" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'poll' && {color: '#FF9500'}]}>Poll</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeTab, postType === 'confession' && styles.typeTabActive]} onPress={() => setPostType('confession')}>
                <VenetianMask size={16} color={postType === 'confession' ? "#1e1b4b" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'confession' && {color: '#1e1b4b'}]}>Confession</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeTab, postType === 'hot_take' && styles.typeTabActive]} onPress={() => setPostType('hot_take')}>
                <Flame size={16} color={postType === 'hot_take' ? "#dc2626" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'hot_take' && {color: '#dc2626'}]}>Hot Take</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeTab, postType === 'spotted' && styles.typeTabActive]} onPress={() => setPostType('spotted')}>
                <MapPin size={16} color={postType === 'spotted' ? "#FF3B30" : "#888"} />
                <Text style={[styles.typeTabText, postType === 'spotted' && {color: '#FF3B30'}]}>Spotted</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
            <ScrollView style={styles.modalBody}>
              
              {/* EVENT INPUT */}
              {postType === 'event' && (
                <View style={styles.eventInputWrapper}>
                  <Text style={styles.eventInputTitle}>What's Happening?</Text>
                  <TextInput
                    style={styles.eventTitleInput}
                    placeholder="e.g., Smart India Hackathon"
                    placeholderTextColor="#999999"
                    value={eventName}
                    onChangeText={setEventName}
                  />
                  <TextInput
                    style={styles.eventDateInput}
                    placeholder="When? (e.g., Tomorrow, 6 PM)"
                    placeholderTextColor="#999999"
                    value={eventDate}
                    onChangeText={setEventDate}
                  />
                  <TextInput
                    style={styles.eventDescInput}
                    placeholder="Add details, link, or location..."
                    placeholderTextColor="#999999"
                    multiline
                    value={caption}
                    onChangeText={setCaption}
                  />
                </View>
              )}

              {/* IMAGE / SPOTTED INPUT */}
              {(postType === 'image' || postType === 'spotted') && (
                <>
                  <TouchableOpacity style={styles.imagePickerBtn} onPress={() => setMediaShareVisible(true)}>
                    {selectedMedia.length ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedMediaRow}>
                        {selectedMedia.map((media) => (
                          <View key={media.uri} style={styles.selectedMediaTile}>
                            {media.type === 'video' ? (
                              <View style={styles.videoSelected}><Camera size={24} color="#fff" /></View>
                            ) : (
                              <Image source={{ uri: media.uri }} style={styles.previewImage} resizeMode="cover" />
                            )}
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={styles.imagePickerPlaceholder}>
                        <ImageIcon size={32} color="#888" />
                        <Text style={styles.imagePickerText}>Add photos or videos</Text>
                        <Text style={styles.imagePickerSubtext}>Select up to 10</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TextInput
                    style={styles.captionInput}
                    placeholder={postType === 'spotted' ? "Who or what did you spot?" : "Write a caption..."}
                    multiline
                    value={caption}
                    onChangeText={setCaption}
                  />
                </>
              )}

              {/* CONFESSION INPUT */}
              {postType === 'confession' && (
                <View style={styles.confessionInputWrapper}>
                  <Text style={styles.confessionWarning}>Your identity will be completely hidden.</Text>
                  <TextInput
                    style={styles.confessionInput}
                    placeholder="I confess that..."
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    multiline
                    value={caption}
                    onChangeText={setCaption}
                  />
                </View>
              )}

              {/* HOT TAKE INPUT */}
              {postType === 'hot_take' && (
                <View style={styles.hotTakeInputWrapper}>
                  <Text style={styles.hotTakeWarning}>Spill your most controversial campus opinion.</Text>
                  <TextInput
                    style={styles.hotTakeInput}
                    placeholder="The library coffee is actually..."
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    multiline
                    value={caption}
                    onChangeText={setCaption}
                  />
                </View>
              )}

              {/* FLASH PLAN INPUT */}
              {postType === 'plan' && (
                <View style={styles.planInputWrapper}>
                  <Rocket size={32} color="#111111" style={{marginBottom: 10}} />
                  <TextInput
                    style={styles.planInput}
                    placeholder="What's the plan? (e.g. Need 2 for Futsal at 6 PM)"
                    placeholderTextColor="#999999"
                    multiline
                    value={caption}
                    onChangeText={setCaption}
                  />
                </View>
              )}

              {/* POLL INPUT */}
              {postType === 'poll' && (
                <View style={styles.pollInputWrapper}>
                  <TextInput style={styles.pollQuestionInput} placeholder="Ask a question..." value={pollQuestion} onChangeText={setPollQuestion} />
                  {pollOptions.map((opt, idx) => (
                    <TextInput
                      key={idx}
                      style={styles.pollOptionInput}
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChangeText={(text) => {
                        const newOpts = [...pollOptions];
                        newOpts[idx] = text;
                        setPollOptions(newOpts);
                      }}
                    />
                  ))}
                  {pollOptions.length < 4 && (
                    <TouchableOpacity style={styles.addOptionBtn} onPress={() => setPollOptions([...pollOptions, ''])}>
                      <Plus size={16} color="#111111" />
                      <Text style={styles.addOptionText}>Add Option</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <MediaShareSheet
        visible={mediaShareVisible}
        onClose={() => setMediaShareVisible(false)}
        onShare={handleMediaPicked}
        title="Add media to your Buzz"
        shareLabel="Use media"
        allowMultiple
      />

      {/* --- COMMENTS BOTTOM SHEET MODAL --- */}
      <Modal visible={isCommentsVisible} animationType="slide" transparent={true} onRequestClose={() => setCommentsVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.commentsOverlay}>
          <TouchableOpacity style={styles.commentsCloseZone} activeOpacity={1} onPress={() => setCommentsVisible(false)} />
          
          <View style={styles.commentsContainer}>
            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentsVisible(false)}><X size={24} color="#111111" /></TouchableOpacity>
            </View>

            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              renderItem={renderComment}
              contentContainerStyle={{ padding: 20 }}
              ListEmptyComponent={
                <Text style={styles.noCommentsText}>No comments yet. Start the conversation!</Text>
              }
            />

            <View style={styles.commentInputRow}>
              <Image source={{ uri: currentUser?.photoURL || 'https://via.placeholder.com/150' }} style={styles.commentInputAvatar} />
              <TextInput
                style={styles.commentInputBox}
                placeholder="Add a comment..."
                placeholderTextColor="#999999"
                value={newComment}
                onChangeText={setNewComment}
                multiline
              />
              <TouchableOpacity style={styles.postCommentBtn} onPress={postComment} disabled={isPostingComment || newComment.trim() === ''}>
                {isPostingComment ? <ActivityIndicator size="small" color="#111111" /> : <Send size={20} color={newComment.trim() === '' ? "#999999" : "#111111"} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' }, 
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111111' },
  emptySubtitle: { marginTop: 6, textAlign: 'center', color: '#707070', lineHeight: 21 },
  
  // Premium Header
  premiumHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15, backgroundColor: '#F7F7F5' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#111111', letterSpacing: -0.5 },
  headerZapIcon: { marginLeft: 6, marginTop: 2 },
  headerIconBtn: { padding: 4 },
  headerPlusWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },

  feedContent: { paddingBottom: 100, paddingTop: 10 },
  
  // --- 0. EVENT CARD (NEW) ---
  eventCard: { backgroundColor: '#fff', borderRadius: 24, marginHorizontal: 16, marginBottom: 20, shadowColor: '#AF52DE', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 15, elevation: 5, overflow: 'hidden' },
  eventBanner: { height: 60, backgroundColor: '#AF52DE', justifyContent: 'center', paddingHorizontal: 20 },
  eventBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  eventBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  eventBody: { padding: 20 },
  eventTitle: { fontSize: 20, fontWeight: '800', color: '#111111', marginBottom: 8 },
  eventDateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  eventDateText: { fontSize: 14, fontWeight: '600', color: '#707070', marginLeft: 6 },
  eventDesc: { fontSize: 15, color: '#334155', lineHeight: 22, marginBottom: 15 },
  eventAuthorRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F0F0EC', paddingBottom: 15, marginBottom: 15 },
  eventAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  eventAuthorText: { fontSize: 12, color: '#707070' },
  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventRsvpCount: { fontSize: 14, fontWeight: 'bold', color: '#111111' },
  eventRsvpBtn: { backgroundColor: '#F0F0EC', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  eventRsvpBtnActive: { backgroundColor: '#AF52DE' },
  eventRsvpBtnText: { fontSize: 13, fontWeight: '800', color: '#475569' },

  // --- 1. PREMIUM WHITE CARDS (Image, Spotted) ---
  premiumCard: { backgroundColor: '#fff', borderRadius: 24, marginHorizontal: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 15, elevation: 4, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  authorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F0EC', marginRight: 12 },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 15, fontWeight: '700', color: '#111111' },
  postTime: { fontSize: 12, color: '#707070', marginTop: 2, fontWeight: '500' },
  moreIcon: { padding: 4 },
  
  spottedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF3B30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  spottedText: { color: '#fff', fontSize: 10, fontWeight: '800', marginLeft: 3, textTransform: 'uppercase' },

  imageWrapper: { paddingHorizontal: 12, paddingBottom: 12 },
  premiumImage: { width: '100%', aspectRatio: 1, borderRadius: 16, backgroundColor: '#F7F7F5' },

  cardFooter: { paddingHorizontal: 16, paddingBottom: 16 },
  premiumCaption: { fontSize: 15, color: '#334155', lineHeight: 22, marginBottom: 12 },
  captionAuthor: { fontWeight: '700', color: '#111111' },

  premiumActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0EC' },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  actionBtnPremium: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: 14, fontWeight: '600', color: '#707070' },
  actionBtnPremiumShare: { padding: 4 },

  // --- 2. PREMIUM DARK CONFESSION CARD ---
  confessionPremiumCard: { backgroundColor: '#111111', borderRadius: 24, marginHorizontal: 16, marginBottom: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 15, elevation: 8 },
  confessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  confessionLabelBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(175, 82, 222, 0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  confessionLabelText: { color: '#AF52DE', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginLeft: 6 },
  confessionTime: { color: '#707070', fontSize: 12, fontWeight: '600' },
  confessionText: { color: '#fff', fontSize: 22, fontWeight: '600', lineHeight: 32, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', marginBottom: 25 },
  confessionActionRow: { flexDirection: 'row', alignItems: 'center', gap: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 15 },
  confessionActionCount: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },

  // --- 3. HOT TAKE CARD ---
  hotTakeCard: { backgroundColor: '#ef4444', borderRadius: 24, marginHorizontal: 16, marginBottom: 20, padding: 20, shadowColor: '#dc2626', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  hotTakeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  hotTakeAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', marginRight: 10 },
  hotTakeAuthor: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hotTakeTime: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  hotTakeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  hotTakeBadgeText: { color: '#dc2626', fontSize: 11, fontWeight: '800', marginLeft: 4, textTransform: 'uppercase' },
  hotTakeText: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 30, marginBottom: 20, fontStyle: 'italic' },
  hotTakeActionRow: { flexDirection: 'row', alignItems: 'center', gap: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 15 },
  hotTakeActionCount: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },

  // --- 4. FLASH PLAN CARD ---
  flashPlanCard: { backgroundColor: '#fff', borderRadius: 24, marginHorizontal: 16, marginBottom: 20, shadowColor: '#111111', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFC00' },
  planBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFC00', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  planBadgeText: { color: '#111111', fontSize: 12, fontWeight: '800', marginLeft: 4 },
  planContentBox: { paddingHorizontal: 20, paddingBottom: 20 },
  planText: { fontSize: 18, fontWeight: '700', color: '#111111', lineHeight: 26 },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F7F7F5', paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#F0F0EC' },
  planJoinCount: { fontSize: 14, fontWeight: '600', color: '#707070' },
  planJoinBtn: { backgroundColor: '#E8E8E3', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  planJoinBtnActive: { backgroundColor: '#111111' },
  planJoinBtnText: { fontSize: 14, fontWeight: '800', color: '#475569' },

  // --- 5. PREMIUM POLL WIDGET ---
  pollWrapper: { paddingHorizontal: 16, paddingBottom: 16 },
  pollPremiumQuestion: { fontSize: 18, fontWeight: '800', color: '#111111', marginBottom: 16, lineHeight: 24 },
  pollPremiumOption: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E8E8E3', marginBottom: 10, justifyContent: 'center', overflow: 'hidden', backgroundColor: '#fff' },
  pollPremiumOptionVoted: { borderColor: '#F0F0EC', backgroundColor: '#F7F7F5' },
  pollPremiumOptionMine: { borderColor: '#111111', backgroundColor: '#fff' },
  pollPremiumProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 12 },
  pollPremiumOptionContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, zIndex: 1 },
  pollPremiumOptionText: { fontSize: 15, color: '#334155', fontWeight: '500', flex: 1, paddingRight: 10 },
  pollPremiumPercent: { fontSize: 14, fontWeight: '700', color: '#707070' },
  pollFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0EC' },
  pollTotalVotes: { fontSize: 13, fontWeight: '600', color: '#999999' },

  // --- COMMENTS MODAL STYLES ---
  commentsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  commentsCloseZone: { flex: 1, width: '100%' },
  commentsContainer: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '75%' },
  commentsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0EC' },
  commentsTitle: { fontSize: 18, fontWeight: 'bold', color: '#111111' },
  noCommentsText: { textAlign: 'center', color: '#999999', marginTop: 40 },
  commentRow: { flexDirection: 'row', marginBottom: 20 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0EC', marginRight: 12 },
  commentContent: { flex: 1, backgroundColor: '#F7F7F5', padding: 12, borderRadius: 16 },
  commentAuthor: { fontSize: 14, fontWeight: 'bold', color: '#111111', marginBottom: 4 },
  commentTime: { fontWeight: 'normal', color: '#999999', fontSize: 12 },
  commentText: { fontSize: 15, color: '#334155', lineHeight: 20 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderTopWidth: 1, borderTopColor: '#F0F0EC', backgroundColor: '#fff' },
  commentInputAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  commentInputBox: { flex: 1, backgroundColor: '#F0F0EC', borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, minHeight: 40, maxHeight: 100, fontSize: 15, color: '#111111' },
  postCommentBtn: { marginLeft: 15, padding: 5 },

  // --- CREATE POST MODAL STYLES ---
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  cancelText: { fontSize: 16, color: '#000' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  postText: { fontSize: 16, fontWeight: 'bold', color: '#111111' },
  
  tabsWrapper: { backgroundColor: '#F7F7F5', borderBottomWidth: 1, borderBottomColor: '#F0F0EC' },
  typeTabsScroll: { paddingHorizontal: 15, paddingVertical: 12, gap: 10 },
  typeTab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F0F0EC', gap: 6 },
  typeTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  typeTabText: { fontSize: 14, fontWeight: '600', color: '#707070' },
  typeTabTextActive: { color: '#111111' },

  modalBody: { flex: 1, padding: 15 },
  
  eventInputWrapper: { backgroundColor: '#F7F7F5', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#F0F0EC' },
  eventInputTitle: { fontSize: 18, fontWeight: 'bold', color: '#111111', marginBottom: 15 },
  eventTitleInput: { backgroundColor: '#fff', height: 50, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E8E3', fontWeight: 'bold' },
  eventDateInput: { backgroundColor: '#fff', height: 50, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E8E3' },
  eventDescInput: { backgroundColor: '#fff', height: 100, borderRadius: 12, paddingHorizontal: 15, paddingTop: 15, fontSize: 16, borderWidth: 1, borderColor: '#E8E8E3' },

  imagePickerBtn: { width: '100%', aspectRatio: 1, backgroundColor: '#F0F0EC', borderRadius: 16, overflow: 'hidden', marginBottom: 15 },
  previewImage: { width: '100%', height: '100%' },
  imagePickerPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePickerText: { marginTop: 10, fontSize: 15, color: '#888', fontWeight: '500' },
  imagePickerSubtext: { marginTop: 4, fontSize: 12, color: '#999999' },
  selectedMediaRow: { padding: 8, gap: 8 },
  selectedMediaTile: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFC00' },
  videoSelected: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFC00' },
  mediaCarousel: { marginBottom: 0 },
  videoPostPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFC00' },
  videoPostText: { color: '#fff', fontWeight: '700', marginTop: 7 },
  captionInput: { fontSize: 16, color: '#111111', minHeight: 80 },

  confessionInputWrapper: { backgroundColor: '#FFFC00', borderRadius: 20, padding: 24, minHeight: 250, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  confessionWarning: { color: '#AF52DE', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center', letterSpacing: 0.5 },
  confessionInput: { color: '#fff', fontSize: 24, fontWeight: '600', lineHeight: 32, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },

  hotTakeInputWrapper: { backgroundColor: '#ef4444', borderRadius: 20, padding: 24, minHeight: 250, shadowColor: '#dc2626', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  hotTakeWarning: { color: '#fff', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 20, textAlign: 'center', letterSpacing: 0.5 },
  hotTakeInput: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 32, fontStyle: 'italic' },

  planInputWrapper: { backgroundColor: '#F7F7F5', padding: 24, borderRadius: 20, borderWidth: 2, borderColor: '#FFFC00', minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  planInput: { fontSize: 20, fontWeight: '700', color: '#111111', textAlign: 'center', width: '100%' },

  pollInputWrapper: { backgroundColor: '#fff', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, borderWidth: 1, borderColor: '#F0F0EC' },
  pollQuestionInput: { fontSize: 18, fontWeight: '700', color: '#111111', marginBottom: 20 },
  pollOptionInput: { backgroundColor: '#F7F7F5', height: 50, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E8E3' },
  addOptionBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 5 },
  addOptionText: { color: '#111111', fontWeight: '700', marginLeft: 6, fontSize: 15 }
});

export default UpdatesScreen;