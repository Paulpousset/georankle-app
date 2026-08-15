// Metro : config Expo par défaut + modèles 3D GLB en assets (preview avatar).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb');

module.exports = config;
