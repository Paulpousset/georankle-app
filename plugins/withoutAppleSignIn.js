// Retire l'entitlement « Sign in with Apple » que le plugin d'expo-apple-authentication
// ajoute automatiquement (Expo applique les plugins des paquets installés). Le
// profil de provisionnement AppStore ne porte pas encore cette capability : tant
// que Paul ne l'a pas activée sur l'App ID (guide-connexion-apple-google.md) et
// régénéré le profil (login Apple interactif), un build iOS avec l'entitlement
// échoue au signing. La connexion Apple reste dormante (flag social_login_apple
// OFF) : rien ne l'appelle. Pour l'activer : supprimer ce plugin d'app.json et
// remettre "ios.usesAppleSignIn": true.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = (config) =>
  withEntitlementsPlist(config, (c) => {
    delete c.modResults['com.apple.developer.applesignin'];
    return c;
  });
