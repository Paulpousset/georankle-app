/**
 * Connexion Google / Apple — implémentation **native** (iOS + Android).
 * Le web charge `socialAuth.web.ts` (redirection OAuth Supabase) ; les deux
 * modules exportent exactement la même API.
 *
 * Flux natif : le SDK du fournisseur rend un id_token, qu'on échange contre
 * une session Supabase via `signInWithIdToken` — pas de navigateur, pas de
 * redirection, la session arrive par `onAuthStateChange` comme un login email.
 *
 * Prérequis console (voir guide-connexion-apple-google.md) :
 *  - Apple : capability "Sign in with Apple" sur l'App ID + provider Supabase ;
 *  - Google : clients OAuth (web + iOS + Android) + provider Supabase, et
 *    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID dans l'env (eas.json / .env).
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { supabase } from './supabase';
import { log } from './log';

/**
 * Issue d'une tentative : `success` = session ouverte ; `cancelled` = l'utilisateur
 * a refermé la feuille du fournisseur (pas une erreur, ne rien afficher) ;
 * `redirect` = web uniquement, la page part vers le fournisseur.
 */
export type SocialSignInResult = 'success' | 'cancelled' | 'redirect';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/** Le bouton Apple n'a de sens que là où l'OS sait ouvrir la feuille Apple. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Sans client ID web (celui du projet Google Cloud), le SDK ne peut pas rendre d'id_token. */
export function isGoogleSignInAvailable(): boolean {
  return Boolean(GOOGLE_WEB_CLIENT_ID);
}

export async function signInWithApple(): Promise<SocialSignInResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) {
    throw new Error('Apple sign-in returned no identity token');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) {
    log.error('Apple signInWithIdToken error:', error);
    throw error;
  }
  return 'success';
}

let googleConfigured = false;

export async function signInWithGoogle(): Promise<SocialSignInResult> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Google sign-in is not configured (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)');
  }
  if (!googleConfigured) {
    // Le webClientId (client "Web application" du projet Google Cloud) est ce
    // qui fait émettre un id_token vérifiable par Supabase ; les clients
    // iOS/Android du même projet sont résolus nativement (plist / SHA-1).
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleConfigured = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return 'cancelled';
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google sign-in returned no ID token');
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) {
      log.error('Google signInWithIdToken error:', error);
      throw error;
    }
    return 'success';
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return 'cancelled';
      if (e.code === statusCodes.IN_PROGRESS) return 'cancelled';
    }
    throw e;
  }
}
