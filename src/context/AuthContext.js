import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, reload, sendEmailVerification, signOut } from 'firebase/auth';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { getUserProfile } from '../services/userService';
import { COLLEGES, DEFAULT_COLLEGE_ID } from '../config/collegeConfig';
import Constants from 'expo-constants';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);

  const refreshEmailVerification = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;
    await reload(currentUser);
    const verified = Boolean(auth.currentUser?.emailVerified);
    setEmailVerified(verified);
    return verified;
  };

  const resendVerificationEmail = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No signed-in account found.');
    if (currentUser.emailVerified) return true;
    await sendEmailVerification(currentUser);
    return true;
  };

  const logout = async () => {
    await signOut(auth);
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setEmailVerified(Boolean(nextUser?.emailVerified));
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const rawProfileSnapshot = await getDoc(doc(db, 'users', nextUser.uid));
        const rawProfile = rawProfileSnapshot.exists() ? rawProfileSnapshot.data() : null;

        const privatePatch = {};
        if (rawProfile?.email) privatePatch.email = rawProfile.email;
        if (rawProfile?.whatsapp) privatePatch.whatsapp = rawProfile.whatsapp;

        if (Object.keys(privatePatch).length) {
          await setDoc(doc(db, 'userPrivate', nextUser.uid), {
            ...privatePatch,
            migratedAt: new Date(),
          }, { merge: true });

          const publicCleanup = {};
          if (rawProfile?.email) publicCleanup.email = deleteField();
          if (rawProfile?.whatsapp) publicCleanup.whatsapp = deleteField();
          await updateDoc(doc(db, 'users', nextUser.uid), publicCleanup);
        }

        let nextProfile = await getUserProfile(nextUser.uid);
        if (nextProfile && !nextProfile.collegeId) {
          const college = COLLEGES.find((item) => item.id === DEFAULT_COLLEGE_ID);
          await updateDoc(doc(db, 'users', nextUser.uid), {
            collegeId: DEFAULT_COLLEGE_ID,
            collegeName: college?.name || 'D Y Patil International University',
            course: nextProfile.course || 'Other',
            year: nextProfile.year || 'Other',
            emailVerified: Boolean(nextUser.emailVerified),
          });
          nextProfile = await getUserProfile(nextUser.uid);
        }
        setProfile(nextProfile);
        if (nextUser.emailVerified && Constants.appOwnership !== 'expo') {
          import('../services/notificationService')
            .then(({ registerForPushNotifications }) => registerForPushNotifications())
            .catch(() => {});
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      emailVerified,
      refreshEmailVerification,
      resendVerificationEmail,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
