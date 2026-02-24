import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Import screens
import ChatsScreen from '../screens/ChatsScreen';
import ConnectScreen from '../screens/ConnectScreen';
import ProfileScreen from '../screens/ProfileScreen';
import UpdatesScreen from '../screens/UpdatesScreen';
import VaultScreen from '../screens/VaultScreen';

const Tab = createBottomTabNavigator();

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      initialRouteName="Chats"
      backBehavior="none" // <--- This prevents the back button from cycling through previous tabs!
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Connect') {
            iconName = focused ? 'people' : 'people-outline'; 
          } else if (route.name === 'Chats') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Updates') {
            iconName = focused ? 'notifications' : 'notifications-outline';
          } else if (route.name === 'Vault') {
            iconName = focused ? 'file-tray-full' : 'file-tray-full-outline'; 
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999999',
        tabBarStyle: { height: 60, paddingBottom: 10, paddingTop: 5 }, 
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
      })}
    >

      <Tab.Screen 
        name="Chats" 
        component={ChatsScreen}
        options={{ title: 'Chats' }}
      />

      <Tab.Screen 
        name="Vault" 
        component={VaultScreen}
        options={{ title: 'Vault' }}
      />

      <Tab.Screen 
        name="Updates" 
        component={UpdatesScreen}
        options={{ title: 'Updates' }}
      />

      <Tab.Screen 
        name="Connect" 
        component={ConnectScreen}
        options={{ title: 'Connect' }}
      />
      
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;