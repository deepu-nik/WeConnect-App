import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, arrayUnion, getDoc, where } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { getUserProfile } from './userService';
import { createDirectChat } from './chatService';
import { sendChatMessage } from './chatMessageService';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_STORY_VIDEO_DURATION_MS = 15 * 1000;
const MAX_STORY_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_STORY_IMAGE_BYTES = 3 * 1024 * 1024;

export const subscribeToStories = (onStories, onError) => {
  let unsubscribe = null;
  let active = true;

  const subscribe = async () => {
    try {
      const profile = await getUserProfile(auth.currentUser?.uid);
      if (!profile?.collegeId) {
        if (active) onStories([]);
        return;
      }

      const q = query(
        collection(db, 'stories'),
        where('collegeId', '==', profile.collegeId),
        where('audience', 'array-contains', auth.currentUser.uid)
      );
      unsubscribe = onSnapshot(q, (snapshot) => {
        const now = Date.now();
        const stories = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((story) => story.collegeId === profile.collegeId).filter((story) => {
          const expires = story.expiresAt?.toDate ? story.expiresAt.toDate().getTime() : new Date(story.expiresAt || 0).getTime();
          return expires > now;
        });
        stories.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        onStories(stories);
      }, onError);
    } catch (error) {
      if (active && onError) onError(error);
    }
  };

  subscribe();
  return () => {
    active = false;
    if (unsubscribe) unsubscribe();
  };
};

const prepareStoryImage = async (uri) => {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    { compress: 0.78, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
};

const validateFileSize = async (uri, maxBytes, label) => {
  const file = new File(uri);
  if (typeof file.size === 'number' && file.size > maxBytes) {
    throw new Error(`${label} is too large. Please choose a smaller file.`);
  }
};

export const createStory = async ({ uri, type = 'image', caption = '', duration = null }) => {
  if (!auth.currentUser?.uid) throw new Error('You must be signed in.');
  if (!uri) throw new Error('Choose a photo or video first.');

  const profile = await getUserProfile(auth.currentUser.uid);
  if (!profile?.collegeId) throw new Error('Your campus profile is incomplete.');

  let uploadUri = uri;
  if (type === 'image') {
    uploadUri = await prepareStoryImage(uri);
    await validateFileSize(uploadUri, MAX_STORY_IMAGE_BYTES, 'Photo');
  } else {
    if (duration && duration > MAX_STORY_VIDEO_DURATION_MS) {
      throw new Error('Story videos must be 15 seconds or shorter.');
    }
    await validateFileSize(uri, MAX_STORY_VIDEO_BYTES, 'Video');
  }

  const media = await uploadToCloudinary(uploadUri, type, { returnMetadata: true });
  if (!media?.secureUrl || !media.publicId) throw new Error('Story upload failed.');

  try {
    return await addDoc(collection(db, 'stories'), {
      collegeId: profile.collegeId,
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'Student',
      userAvatar: auth.currentUser.photoURL || null,
      mediaUrl: media.secureUrl,
      mediaType: type,
      cloudinaryPublicId: media.publicId,
      cloudinaryResourceType: media.resourceType,
      cloudinaryFormat: media.format,
      mediaBytes: media.bytes,
      mediaDuration: media.duration || (duration ? duration / 1000 : null),
      mediaWidth: media.width || null,
      mediaHeight: media.height || null,
      caption: caption.trim(),
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
      viewers: [],
      reactions: {},
      audience: Array.from(new Set([auth.currentUser.uid, ...(profile.connections || [])])),
    });
  } catch (error) {
    console.error('Story metadata save failed after media upload:', error);
    throw new Error('Story could not be published. Please try again.');
  }
};

export const markStoryViewed = async (storyId, uid = auth.currentUser?.uid) => {
  if (!storyId || !uid) return;
  await updateDoc(doc(db, 'stories', storyId), { viewers: arrayUnion(uid) });
};

export const deleteStory = async (storyId) => {
  if (storyId) await deleteDoc(doc(db, 'stories', storyId));
};

export const getActiveStories = async () => {
  const profile = await getUserProfile(auth.currentUser?.uid);
  if (!profile?.collegeId) return [];
  const snapshot = await getDocs(query(
    collection(db, 'stories'),
    where('collegeId', '==', profile.collegeId),
    where('audience', 'array-contains', auth.currentUser.uid)
  ));
  const now = Date.now();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((story) => story.collegeId === profile.collegeId).filter((story) => {
    const expires = story.expiresAt?.toDate ? story.expiresAt.toDate().getTime() : new Date(story.expiresAt || 0).getTime();
    return expires > now;
  });
};

const sendStoryInteractionToChat = async ({ story, kind, emoji, text }) => {
  const viewer = auth.currentUser;
  if (!viewer?.uid || !story?.userId || viewer.uid === story.userId) return;
  const chatId = await createDirectChat({
    currentUser: viewer,
    otherUserId: story.userId,
    otherUser: { name: story.userName || 'Student', avatar: story.userAvatar || null },
  });
  const id = `story-${story.id}-${kind}-${viewer.uid}-${Date.now()}`;
  const messageText = kind === 'reaction' ? `${emoji} reacted to your story` : text.trim();
  await sendChatMessage({
    chatId,
    message: {
      id,
      text: messageText,
      storyContext: {
        type: kind,
        storyId: story.id,
        mediaUrl: story.mediaUrl || null,
        caption: story.caption || '',
        reaction: kind === 'reaction' ? emoji : null,
        senderId: viewer.uid,
      },
    },
  });
};

export const reactToStory = async (storyOrId, emoji) => {
  const uid = auth.currentUser?.uid;
  const storyId = typeof storyOrId === 'string' ? storyOrId : storyOrId?.id;
  const story = typeof storyOrId === 'object' ? storyOrId : null;
  if (!storyId || !uid || !emoji) return;
  const ref = doc(db, 'stories', storyId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const reactions = { ...(snapshot.data().reactions || {}) };
  const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
  reactions[emoji] = users.includes(uid) ? users.filter((id) => id !== uid) : [...users, uid];
  if (!reactions[emoji].length) delete reactions[emoji];
  await updateDoc(ref, { reactions });
  if (story && !users.includes(uid)) await sendStoryInteractionToChat({ story, kind: 'reaction', emoji });
};

export const replyToStory = async (story, text) => {
  const uid = auth.currentUser?.uid;
  const storyId = typeof story === 'string' ? story : story?.id;
  if (!storyId || !uid || !text?.trim()) return;
  const reply = await addDoc(collection(db, 'stories', storyId, 'replies'), {
    senderId: uid,
    senderName: auth.currentUser.displayName || 'Student',
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  if (typeof story === 'object') await sendStoryInteractionToChat({ story, kind: 'reply', text });
  return reply;
};

export const subscribeToStory = (storyId, onStory, onError) => {
  if (!storyId) return () => {};
  return onSnapshot(doc(db, 'stories', storyId), (snapshot) => {
    if (snapshot.exists()) onStory({ id: snapshot.id, ...snapshot.data() });
  }, onError);
};

export const subscribeToStoryReplies = (storyId, onReplies, onError) => {
  if (!storyId) return () => {};
  const q = query(collection(db, 'stories', storyId, 'replies'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => onReplies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
};
