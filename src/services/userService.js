import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export const FALLBACK_AVATAR = 'https://via.placeholder.com/150';

export const normalizeUser = (uid, data = {}) => ({
  uid,
  name: data.displayName || data.name || 'Student',
  handle: data.handle || '',
  avatar: data.photoURL || data.avatar || FALLBACK_AVATAR,
  bio: data.bio || '',
  email: data.email || '',
  location: data.location || 'Campus',
  locationIcon: data.locationIcon || '📍',
  locationPhoto: data.locationPhoto || '',
  course: data.course || '',
  gradYear: data.gradYear || '',
  skills: Array.isArray(data.skills) ? data.skills : [],
  connections: Array.isArray(data.connections) ? data.connections : [],
  coverPhoto: data.coverPhoto || '',
  projectsCount: Number(data.projectsCount) || 0,
  projects: Array.isArray(data.projects) ? data.projects : [],
  achievements: Array.isArray(data.achievements) ? data.achievements : [],
  experience: Array.isArray(data.experience) ? data.experience : [],
  website: data.website || '',
  resumeLink: data.resumeLink || '',
  instagram: data.instagram || '',
  linkedin: data.linkedin || '',
  github: data.github || '',
  whatsapp: data.whatsapp || '',
  privacy: {
    profileVisibility: data.privacy?.profileVisibility || 'everyone',
    location: data.privacy?.location || 'everyone',
    education: data.privacy?.education || 'everyone',
    skills: data.privacy?.skills || 'everyone',
    experience: data.privacy?.experience || 'everyone',
    projects: data.privacy?.projects || 'everyone',
    achievements: data.privacy?.achievements || 'everyone',
    socialLinks: data.privacy?.socialLinks || 'everyone',
    resume: data.privacy?.resume || 'connections',
    activity: data.privacy?.activity || 'everyone',
    connections: data.privacy?.connections || 'everyone',
  },
});

export const getUserProfile = async (uid) => {
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? normalizeUser(snapshot.id, snapshot.data()) : null;
};

export const getAllUsers = async (currentUid) => {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .filter((item) => item.id !== currentUid)
    .map((item) => normalizeUser(item.id, item.data()));
};

export const findUsersByName = async (searchText, currentUid) => {
  const text = searchText.trim().toLowerCase();
  if (!text) return [];
  const users = await getAllUsers(currentUid);
  return users.filter((user) =>
    [user.name, user.handle, user.email].some((value) =>
      value.toLowerCase().includes(text)
    )
  );
};
