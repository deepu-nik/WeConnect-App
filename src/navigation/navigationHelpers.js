export const openProfile = (navigation, params = {}) => {
  const state = navigation.getState?.();
  const currentRoute = state?.routes?.[state?.index]?.name;

  // Screens inside MainTabNavigator's tabs can bubble this action to the
  // stack that owns ProfileDetails.
  if (currentRoute && currentRoute !== 'ChatRoom') {
    navigation.navigate('ProfileDetails', params);
    return;
  }

  // ChatRoom lives in the root stack, so explicitly enter MainTabs and then
  // push ProfileDetails inside its stack. No reset, ref, or manual state.
  navigation.navigate('MainTabs', {
    screen: 'ProfileDetails',
    params,
  });
};