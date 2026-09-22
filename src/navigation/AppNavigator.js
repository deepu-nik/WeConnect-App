import React, { useContext, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Linking } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerifyEmailScreen from '../screens/VerifyEmailScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import CommunityGuidelinesScreen from '../screens/CommunityGuidelinesScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import NewStoryScreen from '../screens/NewStoryScreen';
import StoryViewerScreen from '../screens/StoryViewerScreen';
import MainTabNavigator from './MainTabNavigator';

const Stack = createStackNavigator();

const getProfileUidFromUrl = (url) => {
  if (!url) return null;
  const match = String(url).match(/^weconnect:\/\/profile\/([^/?#]+)/i);
  return match ? match[1] : null;
};

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
  </Stack.Navigator>
);

const VerifyStack = ({ user, refreshEmailVerification, resendVerificationEmail, logout }) => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="VerifyEmail">
      {() => (
        <VerifyEmailScreen
          user={user}
          onRefresh={refreshEmailVerification}
          onResend={resendVerificationEmail}
          onSignOut={logout}
        />
      )}
    </Stack.Screen>
  </Stack.Navigator>
);

const AuthenticatedStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, detachPreviousScreen: true }}>
    <Stack.Screen name="MainTabs" component={MainTabNavigator} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
    <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
    <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    <Stack.Screen name="NewStory" component={NewStoryScreen} />
    <Stack.Screen name="StoryViewer" component={StoryViewerScreen} />
    <Stack.Screen
      name="ChatRoom"
      component={ChatRoomScreen}
      options={{
        headerShown: false,
        presentation: 'card',
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
  </Stack.Navigator>
);

const AppNavigator = () => {
  const { user, emailVerified, loading, refreshEmailVerification, resendVerificationEmail, logout } = useContext(AuthContext);
  const navigationRef = useRef(null);
  const { colors } = useTheme();

  useEffect(() => {
    if (!emailVerified) return undefined;

    const openProfileFromUrl = (url) => {
      const uid = getProfileUidFromUrl(url);
      if (!uid || !navigationRef.current) return;
      navigationRef.current.navigate('MainTabs', {
        screen: 'ProfileDetails',
        params: { uid },
      });
    };

    Linking.getInitialURL().then(openProfileFromUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => openProfileFromUrl(url));
    return () => subscription.remove();
  }, [emailVerified]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        dark: false,
        colors: {
          primary: '#FFFC00',
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: '#FF3B30',
        },
        fonts: DefaultTheme.fonts,
      }}
    >
      {!user ? (
        <AuthStack />
      ) : !emailVerified ? (
        <VerifyStack
          user={user}
          refreshEmailVerification={refreshEmailVerification}
          resendVerificationEmail={resendVerificationEmail}
          logout={logout}
        />
      ) : (
        <AuthenticatedStack />
      )}
    </NavigationContainer>
  );
};

export default AppNavigator;
