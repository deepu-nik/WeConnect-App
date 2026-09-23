import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const EAS_PROJECT_ID = 'd02fb091-59a8-49aa-8df4-bcbe09252c11';
let pushTokenSubscription = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const registerForPushNotifications = async () => {
  const user = auth.currentUser;
  if (!user?.uid) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let permission = existing;
    if (!existing.granted) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return null;

    const token = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    if (!token?.data) return null;

    await setDoc(doc(db, 'userPrivate', user.uid), {
      expoPushToken: token.data,
      pushTokenUpdatedAt: serverTimestamp(),
    }, { merge: true });

    return token.data;
  } catch (error) {
    console.warn('Push notification registration failed:', error);
    return null;
  }
};

export const subscribeToPushTokenChanges = async () => {
  if (pushTokenSubscription) {
    pushTokenSubscription.remove();
    pushTokenSubscription = null;
  }

  pushTokenSubscription = Notifications.addPushTokenListener(async (token) => {
    const user = auth.currentUser;
    if (!user?.uid || !token?.data) return;

    try {
      await setDoc(doc(db, 'userPrivate', user.uid), {
        expoPushToken: token.data,
        pushTokenUpdatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.warn('Push token refresh save failed:', error);
    }
  });

  return pushTokenSubscription;
};

export const unregisterPushNotifications = async () => {
  const user = auth.currentUser;
  if (!user?.uid) return;
  try {
    await setDoc(doc(db, 'userPrivate', user.uid), {
      expoPushToken: null,
      pushTokenUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.warn('Push notification unregister failed:', error);
  }
};
