import React, { useContext, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Context
import { AuthContext } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import NewStoryScreen from '../screens/NewStoryScreen';
import StoryViewerScreen from '../screens/StoryViewerScreen';
// EXISTING NAVIGATOR (Your Main Tabs)
import MainTabNavigator from './MainTabNavigator';

const Stack = createStackNavigator();

const getProfileUidFromUrl = (url) => {
  if (!url) return null;
  const match = String(url).match(/^weconnect:\/\/profile\/([^/?#]+)/i);
  return match ? match[1] : null;
};

// 1. THE AUTH STACK (Login/Register)
const AuthStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

// 2. THE APP STACK (Tabs + ChatRoom + Profile)
const AuthenticatedStack = () => {
  return (
    <Stack.Navigator screenOptions={{ 
      headerShown: false,
      detachPreviousScreen: true,
     }}>
      {/* The Main App (Tabs) is the first screen */}
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
      
      {/* The Chat Room sits on top of the tabs */}
     <Stack.Screen name="NewStory" component={NewStoryScreen} />
    <Stack.Screen name="StoryViewer" component={StoryViewerScreen} />

    <Stack.Screen
      name="ChatRoom"
      component={ChatRoomScreen}
      options={{
        headerShown: false,
        presentation: "card",
        animation: "slide_from_right",
        gestureEnabled: true,
      }}
    />

    </Stack.Navigator>
  );
};

// 3. THE MAIN NAVIGATOR (Decider)
const AppNavigator = () => {
  const { user, loading, refreshEmailVerification, resendVerificationEmail, logout } = useContext(AuthContext);
  const navigationRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;

    const openProfileFromUrl = (url) => {
      const uid = getProfileUidFromUrl(url);
      if (!uid || !navigationRef.current) return;
      navigationRef.current.navigate('MainTabs', {
        screen: 'ProfileDetails',
        params: { uid },
      });
    };

    Linking.getInitialURL().then(openProfileFromUrl).catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => {
      openProfileFromUrl(url);
    });

    return () => subscription.remove();
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {user ? <AuthenticatedStack /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator;