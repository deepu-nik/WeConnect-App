import { CommonActions } from '@react-navigation/native';

const getRootNavigation = (navigation) => {
  let root = navigation;
  let parent = root.getParent?.();

  while (parent) {
    root = parent;
    parent = root.getParent?.();
  }

  return root;
};

export const openProfile = (navigation, params = {}) => {
  const rootNavigation = getRootNavigation(navigation);

  rootNavigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [
        {
          name: 'MainTabs',
          state: {
            routes: [
              { name: 'Chats' },
              { name: 'Vault' },
              { name: 'Updates' },
              { name: 'Connect' },
              { name: 'Profile' },
            ],
            index: 0,
          },
        },
        {
          name: 'ProfileDetails',
          params,
        },
      ],
    })
  );
};
