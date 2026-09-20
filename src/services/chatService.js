import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export const findDirectChat = async (currentUid, otherUid) => {
  if (!currentUid || !otherUid) return null;
  const snapshot = await getDocs(
    query(collection(db, 'chats'), where('participants', 'array-contains', currentUid))
  );
  const existing = snapshot.docs.find((item) =>
    Array.isArray(item.data().participants) && item.data().participants.includes(otherUid)
  );
  return existing ? { id: existing.id, ...existing.data() } : null;
};

export const createDirectChat = async ({ currentUser, otherUser, otherUserId }) => {
  const existing = await findDirectChat(currentUser.uid, otherUserId);
  if (existing) return existing.id;

  const chat = await addDoc(collection(db, 'chats'), {
    participants: [currentUser.uid, otherUserId],
    updatedAt: serverTimestamp(),
    lastMessage: '',
    typing: { [currentUser.uid]: false, [otherUserId]: false },
    unreadCount: { [currentUser.uid]: 0, [otherUserId]: 0 },
    usersInfo: {
      [currentUser.uid]: {
        name: currentUser.profile?.name || currentUser.displayName || 'Student',
        avatar: currentUser.profile?.avatar || currentUser.photoURL || null,
      },
      [otherUserId]: {
        name: otherUser.name || 'Student',
        avatar: otherUser.avatar || null,
      },
    },
  });

  return chat.id;
};

export const markChatRead = async (chatId, uid) => {
  if (!chatId || !uid) return;
  await updateDoc(doc(db, 'chats', chatId), {
    ['unreadCount.' + uid]: 0,
  });
};
