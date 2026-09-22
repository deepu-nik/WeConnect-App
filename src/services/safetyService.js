import { deleteDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export const getBlockId = (blockerId, blockedId) => blockerId + '_' + blockedId;

export const isBlockedByMe = async (blockedId) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !blockedId) return false;
  const snapshot = await getDoc(doc(db, 'blocks', getBlockId(uid, blockedId)));
  return snapshot.exists();
};

export const blockUser = async (blockedId) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !blockedId || uid === blockedId) throw new Error('Invalid user');
  await setDoc(doc(db, 'blocks', getBlockId(uid, blockedId)), {
    blockerId: uid,
    blockedId,
    createdAt: serverTimestamp(),
  });
};

export const unblockUser = async (blockedId) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !blockedId) return;
  await deleteDoc(doc(db, 'blocks', getBlockId(uid, blockedId)));
};

export const reportUser = async ({ targetId, reason, details = '' }) => {
  const uid = auth.currentUser?.uid;
  if (!uid || !targetId || uid === targetId) throw new Error('Invalid report');
  const reportRef = doc(db, 'reports', uid + '_' + targetId + '_' + Date.now());
  await setDoc(reportRef, {
    reporterId: uid,
    targetId,
    reason: reason || 'Other',
    details: String(details || '').trim().slice(0, 1000),
    status: 'open',
    createdAt: serverTimestamp(),
  });
};
