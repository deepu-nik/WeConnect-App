import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { getUserProfile } from '../services/userService';
import { COLLEGES, DEFAULT_COLLEGE_ID } from '../config/collegeConfig';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
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
      } catch (error) {
        console.error('Failed to load user profile:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
