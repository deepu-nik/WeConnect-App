import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { getUserProfile } from './userService';
import { isBlockedBetween } from './safetyService';
import { isBlockedBetween } from './safetyService';

export const sendConnectionRequest = async ({ sender, receiver }) => {
  if (!sender?.uid || !receiver?.uid || sender.uid === receiver.uid) return;
  if (await isBlockedBetween(receiver.uid)) throw new Error('You cannot connect with a blocked account.');
  if (await isBlockedBetween(receiver.uid)) throw new Error('You cannot connect with a blocked account.');
  const [senderProfile, receiverProfile] = await Promise.all([
    getUserProfile(sender.uid),
    getUserProfile(receiver.uid),
  ]);
  if (!senderProfile?.collegeId || !receiverProfile?.collegeId || senderProfile.collegeId !== receiverProfile.collegeId) {
    throw new Error('You can only connect with students from your campus.');
  }

  const request = {
    senderId: sender.uid,
    receiverId: receiver.uid,
    status: 'pending',
    sender: {
      uid: sender.uid,
      name: sender.name || 'Student',
      avatar: sender.avatar || null,
    },
    receiver: {
      uid: receiver.uid,
      name: receiver.name || 'Student',
      avatar: receiver.avatar || null,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const existing = await getDocs(query(collection(db, 'connectionRequests'), where('senderId', '==', sender.uid)));
  if (existing.docs.some((item) => {
    const data = item.data();
    return data.receiverId === receiver.uid && data.status === 'pending';
  })) return;
  await addDoc(collection(db, 'connectionRequests'), request);
};

export const acceptConnectionRequest = async (request) => {
  const batch = writeBatch(db);
  batch.update(doc(db, 'connectionRequests', request.id), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', request.senderId), {
    connections: arrayUnion(request.receiverId),
  });
  batch.update(doc(db, 'users', request.receiverId), {
    connections: arrayUnion(request.senderId),
  });
  await batch.commit();
};

export const declineConnectionRequest = async (request) => {
  await updateDoc(doc(db, 'connectionRequests', request.id), {
    status: 'declined',
    updatedAt: serverTimestamp(),
  });
};

export const connectUsersViaQr = async (currentUid, otherUid) => {
  if (!currentUid || !otherUid || currentUid === otherUid) throw new Error('Invalid QR profile.');
  if (await isBlockedBetween(otherUid)) throw new Error('You cannot connect with a blocked account.');
  if (await isBlockedBetween(otherUid)) throw new Error('You cannot connect with a blocked account.');
  const [currentProfile, otherProfile] = await Promise.all([
    getUserProfile(currentUid),
    getUserProfile(otherUid),
  ]);
  if (!currentProfile?.collegeId || !otherProfile?.collegeId || currentProfile.collegeId !== otherProfile.collegeId) {
    throw new Error('You can only connect with students from your campus.');
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', currentUid), { connections: arrayUnion(otherUid) });
  batch.update(doc(db, 'users', otherUid), { connections: arrayUnion(currentUid) });
  await batch.commit();
};

export const subscribeToConnectionRequests = (uid, callback) => {
  const q = query(collection(db, 'connectionRequests'), where('receiverId', '==', uid));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => item.status === 'pending'));
  });
};


export const areConnected = async (currentUid, otherUid) => {
  if (!currentUid || !otherUid || currentUid === otherUid) return false;
  const [currentProfile, otherProfile] = await Promise.all([
    getUserProfile(currentUid),
    getUserProfile(otherUid),
  ]);
  return Boolean(
    currentProfile?.collegeId &&
    otherProfile?.collegeId &&
    currentProfile.collegeId === otherProfile.collegeId &&
    Array.isArray(currentProfile.connections) &&
    currentProfile.connections.includes(otherUid) &&
    Array.isArray(otherProfile.connections) &&
    otherProfile.connections.includes(currentUid)
  );
};

export const assertCanMessage = async (currentUid, otherUid) => {
  if (await isBlockedBetween(otherUid)) {
    throw new Error('Messaging is unavailable because this account is blocked.');
  }
  if (!(await areConnected(currentUid, otherUid))) {
    throw new Error('You can message this student after you connect with each other.');
  }
  return true;
};
