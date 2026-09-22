import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { getUserProfile } from './userService';

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

export const createGroupChat = async ({ name, members = [] }) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('You must be signed in.');
  const groupName = String(name || '').trim();
  if (!groupName) throw new Error('Please enter a group name.');

  const me = await getUserProfile(currentUser.uid);
  if (!me?.collegeId) throw new Error('Your campus profile is incomplete.');

  const selected = members.filter((member) => member?.uid && member.uid !== currentUser.uid);
  if (!selected.length) throw new Error('Add at least one classmate.');

  const participants = unique([currentUser.uid, ...selected.map((member) => member.uid)]);
  const usersInfo = {
    [currentUser.uid]: {
      name: me.name || currentUser.displayName || 'Student',
      avatar: me.avatar || currentUser.photoURL || '',
    },
  };

  selected.forEach((member) => {
    usersInfo[member.uid] = {
      name: member.name || 'Student',
      avatar: member.avatar || '',
    };
  });

  const unreadCount = {};
  const typing = {};
  participants.forEach((uid) => {
    unreadCount[uid] = 0;
    typing[uid] = false;
  });

  const ref = await addDoc(collection(db, 'chats'), {
    type: 'group',
    groupName,
    groupAvatar: '',
    createdBy: currentUser.uid,
    admins: [currentUser.uid],
    participants,
    usersInfo,
    collegeId: me.collegeId,
    lastMessage: 'Group created',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    unreadCount,
    typing,
  });

  return ref.id;
};

export const getGroupChat = async (chatId) => {
  if (!chatId) return null;
  const snapshot = await getDoc(doc(db, 'chats', chatId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
};

export const updateGroupChat = async (chatId, patch) => {
  if (!chatId) throw new Error('Missing group chat.');
  await updateDoc(doc(db, 'chats', chatId), patch);
};

export const addGroupMembers = async (chatId, members = []) => {
  const group = await getGroupChat(chatId);
  if (!group) throw new Error('Group not found.');
  const current = Array.isArray(group.participants) ? group.participants : [];
  const additions = members.filter((member) => member?.uid && !current.includes(member.uid));
  if (!additions.length) return;

  const nextParticipants = unique([...current, ...additions.map((member) => member.uid)]);
  const nextInfo = { ...(group.usersInfo || {}) };
  const nextUnread = { ...(group.unreadCount || {}) };
  const nextTyping = { ...(group.typing || {}) };

  additions.forEach((member) => {
    nextInfo[member.uid] = { name: member.name || 'Student', avatar: member.avatar || '' };
    nextUnread[member.uid] = 0;
    nextTyping[member.uid] = false;
  });

  await updateGroupChat(chatId, {
    participants: nextParticipants,
    usersInfo: nextInfo,
    unreadCount: nextUnread,
    typing: nextTyping,
  });
};

export const leaveGroupChat = async (chatId) => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('You must be signed in.');
  const group = await getGroupChat(chatId);
  if (!group) throw new Error('Group not found.');

  const participants = (group.participants || []).filter((uid) => uid !== currentUser.uid);
  if (!participants.length) throw new Error('You are the only member left. Delete the group instead.');

  const admins = (group.admins || []).filter((uid) => uid !== currentUser.uid);
  if (!admins.length) admins.push(participants[0]);

  const usersInfo = { ...(group.usersInfo || {}) };
  const unreadCount = { ...(group.unreadCount || {}) };
  const typing = { ...(group.typing || {}) };
  delete usersInfo[currentUser.uid];
  delete unreadCount[currentUser.uid];
  delete typing[currentUser.uid];

  await updateGroupChat(chatId, {
    participants,
    admins,
    usersInfo,
    unreadCount,
    typing,
    lastMessage: (group.usersInfo?.[currentUser.uid]?.name || 'A member') + ' left the group',
    updatedAt: serverTimestamp(),
  });
};
