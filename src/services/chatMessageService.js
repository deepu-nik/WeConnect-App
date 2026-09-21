import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export const MESSAGE_STATUS = { SENDING: 'sending', SENT: 'sent', FAILED: 'failed' };
const PENDING_KEY = 'weconnect.pendingMessages';
const normalizeTimestamp = (value) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
export const normalizeMessage = (message = {}) => ({ ...message, createdAt: normalizeTimestamp(message.createdAt), text: message.text || '', mediaUrl: message.mediaUrl || null, mediaType: message.mediaType || null, status: message.status || MESSAGE_STATUS.SENT });
const readPending = async () => { const raw = await AsyncStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : {}; };
const writePending = (store) => AsyncStorage.setItem(PENDING_KEY, JSON.stringify(store));
export const loadPendingMessages = async (chatId) => { const store = await readPending(); return (store[chatId] || []).map(normalizeMessage); };
export const savePendingMessage = async (chatId, message) => { const store = await readPending(); const next = normalizeMessage(message); const list = store[chatId] || []; const index = list.findIndex((item) => item.id === next.id); if (index >= 0) list[index] = next; else list.unshift(next); await writePending({ ...store, [chatId]: list }); return list.map(normalizeMessage); };
export const removePendingMessage = async (chatId, messageId) => { const store = await readPending(); const list = (store[chatId] || []).filter((item) => item.id !== messageId); await writePending({ ...store, [chatId]: list }); return list.map(normalizeMessage); };
export const subscribeToMessages = (chatId, onMessages, onError) => { const ref = collection(db, 'chats', chatId, 'messages'); const q = query(ref, orderBy('createdAt', 'desc'), limit(100)); return onSnapshot(q, (snapshot) => onMessages(snapshot.docs.map((item) => normalizeMessage({ id: item.id, ...item.data() }))), onError); };
export const sendChatMessage = async ({ chatId, message }) => {
  if (!chatId || !message?.id || !auth.currentUser?.uid) throw new Error('Invalid chat message');
  const senderId = auth.currentUser.uid;
  await runTransaction(db, async (transaction) => {
    const chatRef = doc(db, 'chats', chatId); const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
    const chatSnapshot = await transaction.get(chatRef); if (!chatSnapshot.exists()) throw new Error('Chat does not exist');
    const chat = chatSnapshot.data(); const participants = Array.isArray(chat.participants) ? chat.participants : []; const unreadCount = { ...(chat.unreadCount || {}) };
    participants.forEach((uid) => { unreadCount[uid] = uid === senderId ? 0 : Number(unreadCount[uid] || 0) + 1; });
    transaction.set(messageRef, { text: message.text || '', senderId, mediaUrl: message.mediaUrl || null, mediaType: message.mediaType || null, replyTo: message.replyTo || null, createdAt: serverTimestamp(), status: MESSAGE_STATUS.SENT });
    transaction.update(chatRef, { lastMessage: message.mediaUrl ? (message.mediaType === 'video' ? '🎥 Video' : '📷 Photo') : (message.text || ''), updatedAt: serverTimestamp(), unreadCount, ['typing.' + senderId]: false });
  });
};
export const markChatRead = async (chatId, uid) => { if (chatId && uid) await updateDoc(doc(db, 'chats', chatId), { ['unreadCount.' + uid]: 0 }); };
export const mergeMessages = (serverMessages = [], pendingMessages = []) => { const map = new Map(); [...pendingMessages, ...serverMessages].forEach((message) => { if (message?.id) map.set(message.id, normalizeMessage(message)); }); return [...map.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); };

export const setTyping = async (chatId, uid, value) => {
  if (!chatId || !uid) return;
  await updateDoc(doc(db, 'chats', chatId), { ['typing.' + uid]: Boolean(value) });
};

export const updateMessage = async (chatId, messageId, patch) => {
  if (!chatId || !messageId) return;
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), patch);
};

export const deleteMessage = async (chatId, messageId) => {
  if (!chatId || !messageId) return;
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { deleted: true, text: '', mediaUrl: null });
};

export const toggleMessageReaction = async (chatId, messageId, uid, emoji) => {
  if (!chatId || !messageId || !uid || !emoji) return;
  const ref = doc(db, 'chats', chatId, 'messages', messageId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return;
    const reactions = { ...(snapshot.data().reactions || {}) };
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    reactions[emoji] = users.includes(uid) ? users.filter((id) => id !== uid) : [...users, uid];
    if (!reactions[emoji].length) delete reactions[emoji];
    transaction.update(ref, { reactions });
  });
};
