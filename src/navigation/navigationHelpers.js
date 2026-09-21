export const openProfile = (navigation, params = {}) => {
  const state = navigation.getState?.();
  const currentRoute = state?.routes?.[state?.index]?.name;

  if (currentRoute === 'ChatRoom') {
    navigation.navigate('MainTabs', {
      screen: 'ProfileDetails',
      params,
    });
    return;
  }

  navigation.navigate('ProfileDetails', params);
};
