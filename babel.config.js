module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@protocol': './src/protocol',
          '@storage': './src/storage',
          '@identity': './src/identity',
          '@dtn': './src/dtn',
          '@transport': './src/transport',
          '@discovery': './src/discovery',
          '@routing': './src/routing',
          '@gateway': './src/gateway',
          '@app': './src/app',
          '@screens': './src/screens'
        }
      }
    ]
  ]
};
