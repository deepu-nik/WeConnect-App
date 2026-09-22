import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import ChatsScreen from '../screens/ChatsScreen';
import ConnectScreen from '../screens/ConnectScreen';
import ProfileScreenNew from '../screens/ProfileScreenNew';
import UpdatesScreen from '../screens/UpdatesScreen';
import VaultScreen from '../screens/VaultScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const Tabs = () => (
  <Tab.Navigator
    initialRouteName="Chats"
    backBehavior="none"
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;
        if (route.name === 'Connect') iconName = focused ? 'people' : 'people-outline';
        else if (route.name === 'Chats') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
        else if (route.name === 'Updates') iconName = focused ? 'notifications' : 'notifications-outline';
        else if (route.name === 'Vault') iconName = focused ? 'file-tray-full' : 'file-tray-full-outline';
        else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#111111',
      tabBarInactiveTintColor: '#8A8A8A',
      tabBarStyle: { height: 66, paddingBottom: 10, paddingTop: 6, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8E8E3', elevation: 0 },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '800' },
    })}
  >
    <Tab.Screen name="Chats" component={ChatsScreen} options={{ title: 'Chats' }} />
    <Tab.Screen name="Vault" component={VaultScreen} options={{ title: 'Vault' }} />
    <Tab.Screen name="Updates" component={UpdatesScreen} options={{ title: 'Updates' }} />
    <Tab.Screen name="Connect" component={ConnectScreen} options={{ title: 'Connect' }} />
    <Tab.Screen name="Profile" component={ProfileScreenNew} options={{ title: 'Profile' }} />
  </Tab.Navigator>
);

const MainTabNavigator = () => (
  <Stack.Navigator
    initialRouteName="Tabs"
    screenOptions={{ headerShown: false }}
  >
    <Stack.Screen name="Tabs" component={Tabs} />
    <Stack.Screen
      name="ProfileDetails"
      component={ProfileScreen}
      options={{
        presentation: 'card',
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
  </Stack.Navigator>
);
export default MainTabNavigator;