import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Coins, Heart, HeartPlus, Play, X, type LucideIcon } from 'lucide-react-native';
import type { User } from '@supabase/supabase-js';

import { FONTS } from '../theme/typography';
import type { getColors } from '../theme/colors';
import { tr } from '../i18n';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { track } from '../lib/analytics';
import { playSfx } from '../lib/sfx';
import { useToast } from './ToastProvider';
import { REWARDED_COINS, showRewardedAd, watchRewardedAd } from '../lib/monetization';
import {
  MAX_LIVES,
  STORY_LIFE_PRICE,
  buyLifeWithCoins,
  claimLifeFromAd,
  getCoinBalance,
} from '../lib/story';
import type { Language } from '../types';

const HEART = '#e8772e';
const GOLD = '#e0a93a';

type Busy = null | 'buy' | 'refill' | 'coins';

interface Props {
  visible: boolean;
  onClose: () => void;
  user: User | null;
  lives: number;
  /** Epoch ms of the next regenerated life (0 when full). */
  regenAt: number;
  adAvailable: boolean;
  language: Language;
  colors: ReturnType<typeof getColors>;
  /** Called after any change to lives so the map reloads its snapshot. */
  onChanged: () => void | Promise<void>;
}

/**
 * The « + » sheet of the story map: three ways back into the game.
 *  1. spend STORY_LIFE_PRICE coins for one life;
 *  2. watch a video to refill EVERY life (the best deal, capped per day);
 *  3. watch a video for REWARDED_COINS coins — deliberately worth less than a
 *     full refill, it's there for players who'd rather bank coins.
 */
export function StoryLivesSheet({
  visible, onClose, user, lives, regenAt, adAvailable, language, colors: c, onChanged,
}: Props) {
  const toast = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const full = lives >= MAX_LIVES;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getCoinBalance(user).then((b) => alive && setBalance(b));
    return () => {
      alive = false;
    };
  }, [visible, user]);

  const buy = useCallback(async () => {
    setBusy('buy');
    const res = await buyLifeWithCoins(user);
    setBusy(null);
    if (res.granted) {
      playSfx('purchase');
      setBalance(res.balance);
      toast.success(tr(language, '+1 vie !', '+1 life!'));
      track('story_life_bought', { price: STORY_LIFE_PRICE });
      await onChanged();
      return;
    }
    if (res.balance != null) setBalance(res.balance);
    toast.info(
      res.reason === 'funds'
        ? tr(language, 'Pas assez de pièces.', 'Not enough coins.')
        : res.reason === 'full'
          ? tr(language, 'Tes vies sont déjà au maximum.', 'Your lives are already full.')
          : res.reason === 'signed_out'
            ? tr(language, 'Connecte-toi pour utiliser tes pièces.', 'Sign in to use your coins.')
            : tr(language, 'Impossible pour le moment, réessaie.', 'Not possible right now, try again.'),
    );
  }, [user, language, toast, onChanged]);

  const refill = useCallback(async () => {
    setBusy('refill');
    const ad = await watchRewardedAd();
    if (!ad.earned) {
      setBusy(null);
      toast.error(tr(language, 'Vidéo non terminée.', 'Video not finished.'));
      return;
    }
    const claim = await claimLifeFromAd(user);
    setBusy(null);
    if (claim.granted) {
      playSfx('levelup');
      toast.success(tr(language, 'Toutes tes vies sont rechargées !', 'All your lives are back!'));
      track('story_life_ad_claimed');
      await onChanged();
      onClose();
    } else {
      toast.info(tr(language, 'Vies déjà au maximum ou limite du jour atteinte.', 'Lives already full or daily limit reached.'));
    }
  }, [user, language, toast, onChanged, onClose]);

  const earnCoins = useCallback(async () => {
    setBusy('coins');
    const res = await showRewardedAd();
    setBusy(null);
    if (res.granted) {
      playSfx('coin');
      const coins = res.coins ?? REWARDED_COINS;
      setBalance((b) => (b ?? 0) + coins);
      toast.success(tr(language, '+{0} pièces !', '+{0} coins!', [coins]));
      track('story_coins_ad_claimed', { coins });
    } else if (res.reason === 'capped') {
      toast.info(tr(language, 'Limite de vidéos atteinte pour aujourd’hui.', 'Daily video limit reached.'));
    } else {
      toast.error(tr(language, 'Vidéo non terminée.', 'Video not finished.'));
    }
  }, [language, toast]);

  const canBuy = !!user && !full && (balance ?? 0) >= STORY_LIFE_PRICE;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: c.card,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 18,
            paddingTop: 20,
            paddingBottom: 16,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            hitSlop={ICON_HIT_SLOP}
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }}
            {...a11yButton(tr(language, 'Fermer', 'Close'))}
          >
            <X color={c.textMuted} size={22} />
          </TouchableOpacity>

          <Text style={{ fontFamily: FONTS.heading, fontSize: 20, color: c.text, textAlign: 'center' }}>
            {tr(language, 'Recharge tes vies', 'Refill your lives')}
          </Text>

          {/* Hearts + regen */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            {Array.from({ length: MAX_LIVES }, (_, i) => (
              <Heart key={i} size={26} color={HEART} fill={i < lives ? HEART : 'transparent'} />
            ))}
          </View>
          <Text style={{ fontFamily: FONTS.mono, fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 6 }}>
            {full ? tr(language, 'Vies au maximum', 'Lives are full') : <RegenLabel regenAt={regenAt} language={language} />}
          </Text>

          <View style={{ gap: 10, marginTop: 16 }}>
            <Option
              icon={HeartPlus}
              tint={HEART}
              title={tr(language, '1 vie', '1 life')}
              subtitle={
                !user
                  ? tr(language, 'Connecte-toi pour payer en pièces', 'Sign in to pay with coins')
                  : balance == null
                    ? tr(language, 'Payer avec tes pièces', 'Pay with your coins')
                    : tr(language, 'Solde : {0} pièces', 'Balance: {0} coins', [balance])
              }
              price={<PricePill coins={STORY_LIFE_PRICE} colors={c} />}
              disabled={!canBuy || busy != null}
              busy={busy === 'buy'}
              onPress={buy}
              colors={c}
              a11y={tr(language, 'Acheter une vie pour {0} pièces', 'Buy one life for {0} coins', [STORY_LIFE_PRICE])}
            />
            <Option
              icon={Play}
              tint="#2a8f5a"
              title={tr(language, 'Toutes les vies', 'All lives')}
              subtitle={tr(language, 'Regarde une courte vidéo', 'Watch a short video')}
              badge={tr(language, 'MEILLEURE OFFRE', 'BEST DEAL')}
              price={<VideoPill language={language} />}
              disabled={!adAvailable || full || busy != null}
              busy={busy === 'refill'}
              onPress={refill}
              colors={c}
              highlight
              a11y={tr(language, 'Regarder une vidéo pour recharger toutes les vies', 'Watch a video to refill all lives')}
            />
            <Option
              icon={Coins}
              tint={GOLD}
              title={tr(language, '+{0} pièces', '+{0} coins', [REWARDED_COINS])}
              subtitle={tr(language, 'Regarde une vidéo, garde tes pièces', 'Watch a video, bank the coins')}
              price={<VideoPill language={language} />}
              disabled={!adAvailable || !user || busy != null}
              busy={busy === 'coins'}
              onPress={earnCoins}
              colors={c}
              a11y={tr(language, 'Regarder une vidéo pour {0} pièces', 'Watch a video for {0} coins', [REWARDED_COINS])}
            />
          </View>

          {!adAvailable ? (
            <Text style={{ fontFamily: FONTS.mono, fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 12 }}>
              {tr(language, 'Vidéos indisponibles pour le moment.', 'Videos unavailable right now.')}
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RegenLabel({ regenAt, language }: { regenAt: number; language: Language }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, regenAt - now);
  const total = Math.floor(ms / 1000);
  const mmss = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return <>{tr(language, 'Prochaine vie dans {0}', 'Next life in {0}', [mmss])}</>;
}

function PricePill({ coins, colors: c }: { coins: number; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surface, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }}>
      <Coins color={GOLD} size={14} />
      <Text style={{ fontFamily: FONTS.heading, fontSize: 14, color: c.text }}>{coins}</Text>
    </View>
  );
}

function VideoPill({ language }: { language: Language }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2a8f5a', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }}>
      <Play color="#fff" fill="#fff" size={11} />
      <Text style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#fff' }}>{tr(language, 'VIDÉO', 'VIDEO')}</Text>
    </View>
  );
}

function Option({
  icon: Icon, tint, title, subtitle, price, badge, disabled, busy, onPress, colors: c, highlight, a11y,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  subtitle: string;
  price: React.ReactNode;
  badge?: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
  highlight?: boolean;
  a11y: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        borderWidth: highlight ? 2 : 1,
        borderColor: highlight ? '#2a8f5a' : c.border,
        backgroundColor: c.surface,
        opacity: disabled && !busy ? 0.5 : 1,
      }}
      {...a11yButton(a11y, { disabled })}
    >
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: tint + '26', alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={tint} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        {badge ? (
          <Text style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#2a8f5a', letterSpacing: 0.8 }}>{badge}</Text>
        ) : null}
        <Text style={{ fontFamily: FONTS.heading, fontSize: 16, color: c.text }}>{title}</Text>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 11, color: c.textMuted }} numberOfLines={2}>{subtitle}</Text>
      </View>
      {busy ? <ActivityIndicator color={tint} /> : price}
    </TouchableOpacity>
  );
}
