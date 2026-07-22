import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Share } from 'react-native';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { tr } from '../i18n';
import { a11yButton } from '../lib/a11y';
import { showAlert } from '../lib/alert';
import { track } from '../lib/analytics';
import {
  getReferralInfo,
  redeemReferral,
  myReferralLink,
  type ReferralInfo,
} from '../lib/referral';

/**
 * Parrainage card for the Friends screen: the invite→earn half of the viral
 * loop, made visible. Shows the user's own code + a one-tap share of their
 * invite link (both players earn coins), the count of friends brought in, and —
 * for anyone who didn't arrive via a link — a field to enter a friend's code.
 */
export function ReferralCard(): React.ReactElement | null {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);

  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const refresh = useCallback(() => {
    getReferralInfo().then(setInfo);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onShare = useCallback(() => {
    if (!info) return;
    track('referral_shared', {});
    const link = myReferralLink(info.code);
    Share.share({
      message: tr(
        language,
        `Rejoins-moi sur GeoG 🌍 — on gagne tous les deux 50 pièces : ${link}`,
        `Join me on GeoG 🌍 — we both earn 50 coins: ${link}`,
      ),
    }).catch(() => {});
  }, [info, language]);

  const onRedeem = useCallback(async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4 || redeeming) return;
    setRedeeming(true);
    const res = await redeemReferral(code);
    setRedeeming(false);
    if (res.granted) {
      setCodeInput('');
      track('referral_redeemed', { coins: res.coins });
      showAlert(
        tr(language, '🎉 Parrainage validé', '🎉 Referral applied'),
        tr(language, `Vous gagnez chacun ${res.coins} pièces.`, `You both earn ${res.coins} coins.`),
      );
      refresh();
    } else {
      const why = res.reason === 'invalid_code'
        ? tr(language, 'Code introuvable.', 'Code not found.')
        : res.reason === 'self'
          ? tr(language, "C'est ton propre code 🙂", "That's your own code 🙂")
          : res.reason === 'already_referred'
            ? tr(language, 'Tu as déjà utilisé un code.', 'You already used a code.')
            : tr(language, 'Impossible pour le moment.', 'Not possible right now.');
      showAlert(tr(language, 'Parrainage', 'Referral'), why);
    }
  }, [codeInput, redeeming, language, refresh]);

  // Logged out / RPC unavailable → render nothing (Friends still works).
  if (!info) return null;

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>
        {tr(language, '🎁 Parrainage', '🎁 Invite friends')}
      </Text>
      <Text style={[styles.sub, { color: c.textMuted }]}>
        {tr(
          language,
          'Partage ton lien : vous gagnez chacun 50 pièces.',
          'Share your link: you both earn 50 coins.',
        )}
      </Text>

      <View style={[styles.codeRow, { backgroundColor: c.background, borderColor: c.border }]}>
        <Text style={[styles.code, { color: c.accent }]}>{info.code}</Text>
        {info.count > 0 && (
          <Text style={[styles.count, { color: c.textMuted }]}>
            {tr(language, `${info.count} filleul(s)`, `${info.count} joined`)}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.shareBtn, { backgroundColor: c.accent }]}
        onPress={onShare}
        {...a11yButton(tr(language, 'Partager mon lien', 'Share my link'))}
      >
        <Text style={styles.shareBtnText}>
          {tr(language, 'Partager mon lien', 'Share my link')}
        </Text>
      </TouchableOpacity>

      {!info.alreadyReferred && (
        <View style={styles.redeemRow}>
          <TextInput
            style={[styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }]}
            placeholder={tr(language, "Code d'un ami", "A friend's code")}
            placeholderTextColor={c.textFaint}
            value={codeInput}
            onChangeText={setCodeInput}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
            onSubmitEditing={onRedeem}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.redeemBtn, { borderColor: c.accent }]}
            onPress={onRedeem}
            {...a11yButton(tr(language, 'Valider le code', 'Apply code'))}
          >
            <Text style={[styles.redeemBtnText, { color: c.accent }]}>
              {tr(language, 'Valider', 'Apply')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  title: { fontFamily: FONTS.heading, fontSize: 17, marginBottom: 4 },
  sub: { fontFamily: FONTS.mono, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12,
  },
  code: { fontFamily: FONTS.monoBold, fontSize: 20, letterSpacing: 2 },
  count: { fontFamily: FONTS.mono, fontSize: 12 },
  shareBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontFamily: FONTS.heading, fontSize: 15 },
  redeemRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.mono, fontSize: 14 },
  redeemBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  redeemBtnText: { fontFamily: FONTS.heading, fontSize: 14 },
});
