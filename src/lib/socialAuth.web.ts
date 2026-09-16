/**
 * Connexion Google / Apple — implémentation **web**.
 *
 * Sur le web, pas de SDK natif : `signInWithOAuth` redirige la page entière
 * vers le fournisseur, qui renvoie vers l'URL courante (/play, /es/play…)
 * avec les jetons dans le fragment. Le client Supabase les détecte au retour
 * (`detectSessionInUrl` est activé côté web dans lib/supabase.ts) et la
 * session arrive par `onAuthStateChange`, comme un login email.
 *
 * ⚠️ Chaque URL de retour doit être autorisée dans le dashboard Supabase
 * (Authentication → URL Configuration) — `https://playgeog.com/**` couvre tout.
 */
import { supabase } from './supabase';
import { log } from './log';

export type SocialSignInResult = 'success' | 'cancelled' | 'redirect';

export async function isAppleSignInAvailable(): Promise<boolean> {
  return true;
}

export function isGoogleSignInAvailable(): boolean {
  return true;
}

async function oauthRedirect(provider: 'google' | 'apple'): Promise<SocialSignInResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // Revenir exactement sur la page d'où l'on part (déclinaisons /xx/play
      // comprises), sans query ni fragment.
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) {
    log.error(`OAuth ${provider} error:`, error);
    throw error;
  }
  return 'redirect';
}

export async function signInWithApple(): Promise<SocialSignInResult> {
  return oauthRedirect('apple');
}

export async function signInWithGoogle(): Promise<SocialSignInResult> {
  return oauthRedirect('google');
}
