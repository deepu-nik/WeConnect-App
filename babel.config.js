module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // specific plugin for reanimated (must be listed last)
      'react-native-reanimated/plugin',
    ],
  };
};