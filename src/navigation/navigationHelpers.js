import { CommonActions } from '@react-navigation/native';

export const openProfile = (navigation, params = {}) => {
  const rootNavigation = navigation.getParent() || navigation;

  rootNavigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        {
          name: 'MainTabs',
          params: { screen: 'Chats' },
        },
        {
          name: 'ProfileDetails',
          params,
        },
      ],
    })
  );
};
