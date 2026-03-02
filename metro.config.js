const { getDefaultConfig } = require('expo/metro-config');

module.exports = (() => {
  const defaultConfig = getDefaultConfig(__dirname);
  
  return {
    ...defaultConfig,
    resolver: {
      ...defaultConfig.resolver,
      assetExts: [...defaultConfig.resolver.assetExts, 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ttf', 'otf', 'woff', 'woff2'],
      sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs', 'mjs'],
      extraNodeModules: {
        'crypto': require.resolve('expo-crypto'),
        'stream': require.resolve('stream-browserify'),
        'buffer': require.resolve('buffer'),
        'process': require.resolve('process/browser'),
        'url': require.resolve('url'),
        'assert': require.resolve('assert'),
        'util': require.resolve('util'),
        'events': require.resolve('events/'),
        'vm': require.resolve('vm-browserify'),
        'http': require.resolve('stream-http'),
        'https': require.resolve('https-browserify'),
        // إزالة os-browserify و path-browserify و querystring-es3 لأنها غير ضرورية
        'fs': false,
        'child_process': false,
        'net': false,
        'tls': false,
      }
    },
  };
})();
