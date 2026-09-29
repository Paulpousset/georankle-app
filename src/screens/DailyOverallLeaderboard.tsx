import { useCallback, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Award } from 'lucide-react-native';

import { useCachedData } from '../lib/cache';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { tr } from '../i18n';
import { a11yButton, a11yImage } from '../lib/a11y';
import { DAILY_MODES, getTodayUTC } from '../lib/daily';
import {
  DAILY_OVERALL_PRIZES,
  fetchDailyOverall,
  previousDayUTC,
  type DailyOverallEntry,
} from '../lib/dailyOverall';
import { Avatar } from '../components/Avatar';
import { AsyncState } from '../components/AsyncState';
import { AtlasCoin } from '../components/AtlasIcons';

type Day = 'today' | 'yesterday';

interface Props {
  accent: string;
  currentUserId?: string | null;
  onOpenPlayer?: (userId: string, username?: string | null) => void;
}

const MEDAL_COLORS = ['#c4872a', '#7aa0c4', '#a08060'];
const COIN = '#c4872a';

/** Classement général : tous les dailies du jour combinés, podium payé en pièces. */
export function DailyOverallLeaderboard({ accent, currentUserId, onOpenPlayer }: Props) {
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const c = getColors(isDarkMode);
  const [day, setDay] = useState<Day>('today');
  const today = getTodayUTC();
  const date = day === 'today' ? today : previousDayUTC(today);

  const fetcher = useCallback(() => fetchDailyOverall(date), [date]);
  // ttl 0 : même raison que DailyLeaderboard, le classement bouge sans arrêt.
  const { data: cachedData, loading, refreshing, error, refetch } = useCachedData<DailyOverallEntry[]>(
    `daily-overall:${date}`,
    fetcher,
    { ttl: 0 },
  );
  const data = cachedData ?? [];
  const anonymous = tr(language, 'Anonyme', 'Anonymous');

  const renderItem = useCallback(
    ({ item }: { item: DailyOverallEntry }) => {
      const index = item.rank - 1;
      const isTop3 = index < 3;
      const isMe = !!currentUserId && item.user_id === currentUserId;
      const name = item.username || anonymous;
      const rankLabel = tr(language, 'Rang {0}', 'Rank {0}', [item.rank]);
      // Hier : les pièces réellement versées. Aujourd'hui : ce que le podium
      // actuel toucherait à minuit, en plus pâle.
      const coins = day === 'yesterday' ? item.coins : isTop3 ? DAILY_OVERALL_PRIZES[index] : null;
      return (
        <TouchableOpacity
          activeOpacity={onOpenPlayer ? 0.6 : 1}
          disabled={!onOpenPlayer}
          onPress={() => onOpenPlayer?.(item.user_id, item.username)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            borderRadius: 14,
            marginBottom: 8,
            borderWidth: isMe ? 2 : 1,
            backgroundColor: c.card,
            borderColor: isMe ? accent : c.border,
          }}
          {...a11yButton(`${rankLabel}, ${name}${isMe ? tr(language, ' (toi)', ' (you)') : ''}`, {
            disabled: !onOpenPlayer,
            hint: onOpenPlayer ? tr(language, 'Voir le profil', 'View profile') : undefined,
          })}
        >
          <View style={{ width: 34, alignItems: 'center' }}>
            {isTop3 ? (
              <Award size={24} color={MEDAL_COLORS[index]} {...a11yImage(rankLabel)} />
            ) : (
              <Text style={{ fontFamily: FONTS.monoBold, color: c.textMuted }}>{item.rank}</Text>
            )}
          </View>
          <Avatar config={item.avatarConfig} photoUrl={item.avatarUrl} username={name} size={34} />
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <Text style={{ fontFamily: FONTS.heading, color: c.text }} numberOfLines={1}>
              {name}
              {isMe ? tr(language, ' (toi)', ' (you)') : ''}
            </Text>
            <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textFaint }}>
              {tr(language, '{0}/{1} défis', '{0}/{1} challenges', [item.modesPlayed, DAILY_MODES.length])}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontFamily: FONTS.headingBlack, fontSize: 16, color: accent }}>
              {item.total} <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textFaint }}>pts</Text>
            </Text>
            {coins ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, opacity: day === 'today' ? 0.6 : 1 }}
                {...a11yImage(tr(language, '{0} pièces', '{0} coins', [coins]))}
              >
                <AtlasCoin color={COIN} size={13} />
                <Text style={{ fontFamily: FONTS.monoBold, fontSize: 11, color: COIN }}>+{coins}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [c, accent, onOpenPlayer, currentUserId, language, anonymous, day],
  );

  const showSpinner = loading || (refreshing && data.length === 0);

  const header = (
    <View style={{ gap: 10, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        {(
          [
            { key: 'today' as Day, label: tr(language, "Aujourd'hui", 'Today') },
            { key: 'yesterday' as Day, label: tr(language, 'Hier', 'Yesterday') },
          ]
        ).map(({ key, label }) => {
          const active = day === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setDay(key)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: active ? accent : 'transparent' }}
              {...a11yButton(label, { role: 'tab', selected: active })}
            >
              <Text style={{ fontFamily: FONTS.monoBold, fontSize: 12, color: active ? 'white' : c.textMuted }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {DAILY_OVERALL_PRIZES.map((coins, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Award size={16} color={MEDAL_COLORS[i]} />
              <AtlasCoin color={COIN} size={14} />
              <Text style={{ fontFamily: FONTS.monoBold, fontSize: 13, color: COIN }}>+{coins}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: FONTS.mono, fontSize: 10, color: c.textFaint, textAlign: 'center', lineHeight: 15 }}>
          {tr(
            language,
            "Chaque défi rapporte jusqu'à 1000 pts (ton score ÷ le meilleur du jour). Le podium est payé à minuit UTC.",
            'Each challenge is worth up to 1000 pts (your score ÷ the day’s best). The podium is paid at midnight UTC.',
          )}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 10 }}>
      {header}
      <AsyncState
        loading={showSpinner}
        error={error}
        onRetry={refetch}
        errorLabel={tr(language, 'Impossible de charger le classement.', 'Could not load the leaderboard.')}
      >
        <FlatList
          data={data}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 40, fontFamily: FONTS.mono, color: c.textMuted }}>
              {day === 'today'
                ? tr(language, "Personne n'a encore joué aujourd'hui.\nSois le premier !", 'Nobody has played today yet.\nBe the first!')
                : tr(language, 'Aucun résultat hier.', 'No results yesterday.')}
            </Text>
          }
        />
      </AsyncState>
    </View>
  );
}
