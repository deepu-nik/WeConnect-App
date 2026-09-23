import React, { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import ChatsScreen from '../screens/ChatsScreen';
import ConnectScreen from '../screens/ConnectScreen';
import ProfileScreenNew from '../screens/ProfileScreenNew';
import UpdatesScreen from '../screens/UpdatesScreen';
import VaultScreen from '../screens/VaultScreen';
import StudentHubScreen from '../screens/StudentHubScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const Tabs = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  useEffect(() => {
    const handleHardwareBack = () => {
      const state = navigation.getState();
      const tabsRoute = state?.routes?.find((route) => route.name === 'Tabs');
      const tabState = tabsRoute?.state;
      const activeTab = tabState?.routes?.[tabState.index ?? 0]?.name;

      if (activeTab && activeTab !== 'Chats') {
        navigation.navigate('Tabs', { screen: 'Chats' });
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => subscription.remove();
  }, [navigation]);

  return (
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
        tabBarStyle: { height: 66 + insets.bottom, paddingBottom: 10 + insets.bottom, paddingTop: 6, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E8E8E3', elevation: 0 },
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
};

const MainTabNavigator = () => (
  <Stack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Tabs" component={Tabs} />
    <Stack.Screen
      name="StudentHub"
      component={StudentHubScreen}
      options={{
        presentation: 'card',
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
    <Stack.Screen
      name="ProfileDetails"
      component={ProfileScreenNew}
      options={{
        presentation: 'card',
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    />
  </Stack.Navigator>
);

export default MainTabNavigator;
