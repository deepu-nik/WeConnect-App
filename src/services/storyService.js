import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, arrayUnion, getDoc, where } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { uploadToCloudinary } from '../utils/cloudinaryHelper';
import { getUserProfile } from './userService';

const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

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
        orderBy('createdAt', 'desc')
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const cutoff = Date.now() - STORY_LIFETIME_MS;
        const stories = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((story) => {
          const created = story.createdAt?.toDate ? story.createdAt.toDate().getTime() : new Date(story.createdAt || 0).getTime();
          return created >= cutoff;
        });
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

export const createStory = async ({ uri, type = 'image', caption = '' }) => {
  if (!auth.currentUser?.uid) throw new Error('You must be signed in.');
  const profile = await getUserProfile(auth.currentUser.uid);
  if (!profile?.collegeId) throw new Error('Your campus profile is incomplete.');
  const mediaUrl = await uploadToCloudinary(uri, type);
  if (!mediaUrl) throw new Error('Story upload failed.');
  return addDoc(collection(db, 'stories'), {
    collegeId: profile.collegeId,
    userId: auth.currentUser.uid,
    userName: auth.currentUser.displayName || 'Student',
    userAvatar: auth.currentUser.photoURL || null,
    mediaUrl, mediaType: type, caption: caption.trim(),
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + STORY_LIFETIME_MS),
    viewers: [], reactions: {},
  });
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
  const snapshot = await getDocs(query(collection(db, 'stories'), where('collegeId', '==', profile.collegeId)));
  const cutoff = Date.now() - STORY_LIFETIME_MS;
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((story) => {
    const created = story.createdAt?.toDate ? story.createdAt.toDate().getTime() : new Date(story.createdAt || 0).getTime();
    return created >= cutoff;
  });
};
export const reactToStory = async (storyId, emoji) => {
  const uid = auth.currentUser?.uid;
  if (!storyId || !uid || !emoji) return;
  const ref = doc(db, 'stories', storyId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return;
  const reactions = { ...(snapshot.data().reactions || {}) };
  const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
  reactions[emoji] = users.includes(uid) ? users.filter((id) => id !== uid) : [...users, uid];
  if (!reactions[emoji].length) delete reactions[emoji];
  await updateDoc(ref, { reactions });
};

export const replyToStory = async (storyId, text) => {
  const uid = auth.currentUser?.uid;
  if (!storyId || !uid || !text?.trim()) return;
  return addDoc(collection(db, 'stories', storyId, 'replies'), {
    senderId: uid,
    senderName: auth.currentUser.displayName || 'Student',
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
};

export const subscribeToStoryReplies = (storyId, onReplies, onError) => {
  if (!storyId) return () => {};
  const q = query(collection(db, 'stories', storyId, 'replies'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => onReplies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
};
