import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth, db } from '../config/firebase';

const deleteQueryDocs = async (q) => {
  const snapshot = await getDocs(q);
  if (!snapshot.size) return;

  for (let start = 0; start < snapshot.docs.length; start += 450) {
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + 450).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
};

export const deleteMyAccount = async (password) => {
  const user = auth.currentUser;
  if (!user?.uid || !user.email) throw new Error('No signed-in account found.');
  if (!password) throw new Error('Enter your current password to continue.');

  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, password)
  );

  const uid = user.uid;

  await deleteQueryDocs(query(collection(db, 'connectionRequests'), where('senderId', '==', uid)));
  await deleteQueryDocs(query(collection(db, 'connectionRequests'), where('receiverId', '==', uid)));
  await deleteQueryDocs(query(collection(db, 'blocks'), where('blockerId', '==', uid)));
  await deleteQueryDocs(query(collection(db, 'stories'), where('userId', '==', uid)));
  await deleteQueryDocs(query(collection(db, 'buzz_posts'), where('authorId', '==', uid)));
  await deleteQueryDocs(query(collection(db, 'vault_files'), where('uploader.uid', '==', uid)));
  await deleteQueryDocs(query(collection(db, 'vaults'), where('createdBy', '==', uid)));

  await deleteDoc(doc(db, 'userPrivate', uid));
  await deleteDoc(doc(db, 'users', uid));

  await deleteUser(user);
};
