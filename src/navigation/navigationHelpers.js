import { StackActions } from '@react-navigation/native';

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

  // ProfileDetails is a root-stack screen. Push it onto the actual root
  // stack instead of resetting the entire navigation state.
  rootNavigation.dispatch(
    StackActions.push('ProfileDetails', params)
  );
};
