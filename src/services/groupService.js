import {
  arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, orderBy,
  limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { getUserProfile } from './userService';

const GROUPS = 'groups';
const normalize = (id, data = {}) => ({ id, ...data, members: Array.isArray(data.members) ? data.members : [], admins: Array.isArray(data.admins) ? data.admins : [], memberProfiles: data.memberProfiles || {} });

export const subscribeToGroups = (uid, onGroups, onError) => {
  if (!uid) return () => {};
  const q = query(collection(db, GROUPS), where('members', 'array-contains', uid));
  return onSnapshot(q, (snapshot) => {
    const groups = snapshot.docs.map((item) => normalize(item.id, item.data())).sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
    onGroups(groups);
  }, onError);
};

export const getGroup = async (groupId) => {
  if (!groupId) return null;
  const snapshot = await getDoc(doc(db, GROUPS, groupId));
  return snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null;
};

export const subscribeToGroup = (groupId, onGroup, onError) => {
  if (!groupId) return () => {};
  return onSnapshot(doc(db, GROUPS, groupId), (snapshot) => {
    onGroup(snapshot.exists() ? normalize(snapshot.id, snapshot.data()) : null);
  }, onError);
};

export const createGroup = async ({ name, description = '', memberIds = [] }) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  const profile = await getUserProfile(uid);
  if (!profile?.collegeId) throw new Error('Your campus profile is incomplete.');
  const groupRef = doc(collection(db, GROUPS));
  const selfProfile = { name: profile.name || 'Student', avatar: profile.avatar || profile.photoURL || null };
  await setDoc(groupRef, {
    collegeId: profile.collegeId,
    name: name.trim(),
    description: description.trim(),
    avatar: null,
    createdBy: uid,
    admins: [uid],
    members: [uid],
    memberProfiles: { [uid]: selfProfile },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: '',
    unreadCount: { [uid]: 0 },
    typing: { [uid]: false },
  });
  const uniqueIds = Array.from(new Set(memberIds)).filter((id) => id && id !== uid).slice(0, 49);
  if (uniqueIds.length) {
    const profiles = await Promise.all(uniqueIds.map((id) => getUserProfile(id).catch(() => null)));
    for (const person of profiles.filter(Boolean)) {
      if (person.collegeId !== profile.collegeId) continue;
      await addGroupMembers(groupRef.id, [person]);
    }
  }
  return groupRef.id;
};
export const updateGroup = async (groupId, patch) => { if (groupId) await updateDoc(doc(db, GROUPS, groupId), patch); };

export const addGroupMembers = async (groupId, users = []) => {
  let group = await getGroup(groupId);
  if (!group || !group.admins.includes(auth.currentUser?.uid)) throw new Error('Only group admins can add members.');
  for (const user of users) {
    if (!user?.uid || group.members.includes(user.uid) || group.members.length >= 50) continue;
    if (user.collegeId !== group.collegeId) continue;
    const patch = {
      members: arrayUnion(user.uid),
      updatedAt: serverTimestamp(),
      lastMemberAdded: user.uid,
      ['memberProfiles.' + user.uid]: { name: user.name || 'Student', avatar: user.avatar || user.photoURL || null },
      ['unreadCount.' + user.uid]: 0,
      ['typing.' + user.uid]: false,
    };
    await updateDoc(doc(db, GROUPS, groupId), patch);
    group = await getGroup(groupId);
    if (!group) break;
  }
};
export const removeGroupMember = async (groupId, uid) => {
  const group = await getGroup(groupId);
  if (!group || !group.admins.includes(auth.currentUser?.uid)) throw new Error('Only group admins can remove members.');
  if (uid === group.createdBy) throw new Error('The group creator cannot be removed.');
  await updateDoc(doc(db, GROUPS, groupId), { members: arrayRemove(uid), admins: arrayRemove(uid), updatedAt: serverTimestamp() });
};

export const leaveGroup = async (groupId) => {
  const uid = auth.currentUser?.uid; const group = await getGroup(groupId);
  if (!group || !uid || !group.members.includes(uid)) return;
  if (group.createdBy === uid && group.members.length > 1) throw new Error('The group creator cannot leave while other members remain.');
  await updateDoc(doc(db, GROUPS, groupId), { members: arrayRemove(uid), admins: arrayRemove(uid), updatedAt: serverTimestamp() });
};

export const subscribeToGroupMessages = (groupId, onMessages, onError) => {
  const q = query(collection(db, GROUPS, groupId, 'messages'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snapshot) => onMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), createdAt: item.data().createdAt?.toDate?.() || new Date() }))), onError);
};

export const markGroupRead = async (groupId, uid = auth.currentUser?.uid) => {
  if (!groupId || !uid) return;
  await updateDoc(doc(db, GROUPS, groupId), { ['unreadCount.' + uid]: 0 });
};

export const sendGroupMessage = async ({ groupId, text }) => {
  const uid = auth.currentUser?.uid; const clean = String(text || '').trim();
  if (!uid || !groupId || !clean) return;
  const messageRef = doc(collection(db, GROUPS, groupId, 'messages')); const groupRef = doc(db, GROUPS, groupId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(groupRef); if (!snapshot.exists()) throw new Error('Group does not exist.');
    const group = snapshot.data(); if (!group.members?.includes(uid)) throw new Error('You are no longer a member of this group.');
    const unreadCount = { ...(group.unreadCount || {}) }; (group.members || []).forEach((id) => { unreadCount[id] = id === uid ? 0 : Number(unreadCount[id] || 0) + 1; });
    transaction.set(messageRef, { senderId: uid, text: clean, createdAt: serverTimestamp(), deleted: false });
    transaction.update(groupRef, { lastMessage: clean, updatedAt: serverTimestamp(), unreadCount, ['typing.' + uid]: false });
  });
};

export const deleteGroupMessage = async (groupId, messageId) => { if (groupId && messageId) await updateDoc(doc(db, GROUPS, groupId, 'messages', messageId), { deleted: true, text: '' }); };

export const toggleGroupMessageReaction = async (groupId, messageId, emoji) => {
  const uid = auth.currentUser?.uid; if (!uid || !emoji) return;
  const ref = doc(db, GROUPS, groupId, 'messages', messageId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref); if (!snapshot.exists()) return;
    const reactions = { ...(snapshot.data().reactions || {}) }; const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    reactions[emoji] = users.includes(uid) ? users.filter((id) => id !== uid) : [...users, uid];
    if (!reactions[emoji].length) delete reactions[emoji]; transaction.update(ref, { reactions });
  });
};
