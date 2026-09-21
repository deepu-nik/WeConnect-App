import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export const openProfile = (_navigation, params = {}) => {
  if (!navigationRef.isReady()) return;

  navigationRef.dispatch(
    StackActions.push('ProfileDetails', params)
  );
};
