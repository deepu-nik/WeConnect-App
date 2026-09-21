import React, { useContext } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Context
import { AuthContext } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ChatRoomScreen from '../screens/ChatRoomScreen';
import ProfileScreen from '../screens/ProfileScreen';

// EXISTING NAVIGATOR (Your Main Tabs)
import MainTabNavigator from './MainTabNavigator';
import { navigationRef } from './navigationHelpers';

const Stack = createStackNavigator();

// 1. THE AUTH STACK (Login/Register)
const AuthStack = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
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
      
      {/* The Chat Room sits on top of the tabs */}
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

    {/* The Profile details screen is always rooted above Chats so system back returns to Chats */}
     <Stack.Screen
      name="ProfileDetails"
      component={ProfileScreen}
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
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {user ? (
        // IF LOGGED IN: Show the Authenticated Stack (Tabs + Chats + Profile)
        <AuthenticatedStack /> 
      ) : (
        // IF LOGGED OUT: Show Login
        <AuthStack /> 
      )}
    </NavigationContainer>
  );
};

export default AppNavigator;