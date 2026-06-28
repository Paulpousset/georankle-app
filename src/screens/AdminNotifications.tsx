import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  Clock,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';

import { track } from '../lib/analytics';
import { getColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { modeLabel } from '../lib/ranked';
import { tr } from '../i18n';
import {
  deleteCampaign,
  listCampaigns,
  listLog,
  previewRecipients,
  saveCampaign,
  searchUsers,
  sendBroadcast,
  setCampaignEnabled,
  type Campaign,
  type LogEntry,
  type Segment,
} from '../lib/admin';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import type { MatchMode } from '../types';

interface AdminNotificationsProps {
  onBack: () => void;
}

const MODES: MatchMode[] = ['classic', 'streak', 'versus', 'globe', 'guess'];

/** Flat UI choice; mapped to the richer `Segment` union on send. */
type SegChoice = 'everyone' | 'inactive' | 'users' | 'played_mode' | 'never_online';

const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AdminNotifications({
  onBack,
}: AdminNotificationsProps) {
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { language } = useLanguage();
  const userId = user?.id ?? '';
  const c = getColors(isDarkMode);
  const t = (fr: string, en: string) => tr(language, fr, en);

  // ── Compose ────────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // ── Targeting ────────────────────────────────────────────────────────────────
  const [seg, setSeg] = useState<SegChoice>('everyone');
  const [days, setDays] = useState('7');
  const [activityMode, setActivityMode] = useState<MatchMode>('classic');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<Array<{ id: string; username: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Array<{ id: string; username: string }>>([]);

  // ── Actions / async ──────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Scheduling ─────────────────────────────────────────────────────────────
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<'daily' | 'weekly'>('weekly');
  const [hour, setHour] = useState(9);
  const [weekday, setWeekday] = useState(1); // Monday
  const [savingCampaign, setSavingCampaign] = useState(false);

  // ── Lists ────────────────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);

  const refreshLists = useCallback(() => {
    listCampaigns().then(setCampaigns).catch(() => {});
    listLog().then(setLog).catch(() => {});
  }, []);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  /** Build the Segment payload from the current UI state, or null if invalid. */
  const buildSegment = (): Segment | null => {
    switch (seg) {
      case 'everyone':
        return { type: 'everyone' };
      case 'inactive': {
        const n = parseInt(days, 10);
        if (!n || n < 1) return null;
        return { type: 'inactive', days: n };
      }
      case 'users':
        if (selectedUsers.length === 0) return null;
        return { type: 'users', ids: selectedUsers.map((u) => u.id) };
      case 'played_mode':
        return { type: 'activity', filter: 'played_mode', mode: activityMode };
      case 'never_online':
        return { type: 'activity', filter: 'never_online' };
    }
  };

  const segmentLabel = (s: Segment): string => {
    switch (s.type) {
      case 'everyone':
        return t('Tout le monde', 'Everyone');
      case 'inactive':
        return t(`Inactifs ${s.days}j+`, `Inactive ${s.days}d+`);
      case 'users':
        return t(`${s.ids.length} joueur(s)`, `${s.ids.length} player(s)`);
      case 'activity':
        return s.filter === 'never_online'
          ? t('Jamais joué en ligne', 'Never played online')
          : `${modeLabel(s.mode as MatchMode, language)}`;
    }
  };

  const runSearch = async () => {
    setSearching(true);
    try {
      setUserResults(await searchUsers(userQuery));
    } finally {
      setSearching(false);
    }
  };

  const toggleUser = (u: { id: string; username: string }) => {
    setSelectedUsers((prev) =>
      prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u],
    );
    setPreview(null);
  };

  // Any change to the target definition invalidates a previously computed count.
  const chooseSeg = (key: SegChoice) => {
    setSeg(key);
    setPreview(null);
  };
  const changeDays = (v: string) => {
    setDays(v.replace(/[^0-9]/g, ''));
    setPreview(null);
  };
  const chooseMode = (m: MatchMode) => {
    setActivityMode(m);
    setPreview(null);
  };

  const doPreview = async () => {
    const segment = buildSegment();
    if (!segment) {
      Alert.alert(t('Cible incomplète', 'Incomplete target'), t('Vérifie la sélection.', 'Check the selection.'));
      return;
    }
    setPreviewing(true);
    try {
      setPreview(await previewRecipients(segment));
    } catch (e) {
      Alert.alert(t('Erreur', 'Error'), e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  };

  const doSend = () => {
    const segment = buildSegment();
    if (!segment) {
      Alert.alert(t('Cible incomplète', 'Incomplete target'), t('Vérifie la sélection.', 'Check the selection.'));
      return;
    }
    if (!title.trim() || !body.trim()) {
      Alert.alert(t('Message vide', 'Empty message'), t('Renseigne un titre et un message.', 'Add a title and a message.'));
      return;
    }
    const confirmMsg = t(
      `Envoyer "${title.trim()}" à : ${segmentLabel(segment)} ?`,
      `Send "${title.trim()}" to: ${segmentLabel(segment)}?`,
    );
    const send = async () => {
      setSending(true);
      try {
        const res = await sendBroadcast(title.trim(), body.trim(), segment);
        track('admin_broadcast_sent', { segment: segment.type, recipients: res.recipients, sent: res.sent });
        refreshLists();
        Alert.alert(
          t('Envoyé', 'Sent'),
          t(`${res.sent}/${res.recipients} notifications envoyées.`, `${res.sent}/${res.recipients} notifications sent.`),
        );
      } catch (e) {
        Alert.alert(t('Erreur', 'Error'), e instanceof Error ? e.message : String(e));
      } finally {
        setSending(false);
      }
    };
    if (Platform.OS === 'web') {
      if (typeof confirm === 'function' && confirm(confirmMsg)) send();
      return;
    }
    Alert.alert(t('Confirmer l\'envoi', 'Confirm send'), confirmMsg, [
      { text: t('Annuler', 'Cancel'), style: 'cancel' },
      { text: t('Envoyer', 'Send'), onPress: send },
    ]);
  };

  const doSaveCampaign = async () => {
    const segment = buildSegment();
    if (!segment) {
      Alert.alert(t('Cible incomplète', 'Incomplete target'), t('Vérifie la sélection.', 'Check the selection.'));
      return;
    }
    if (!title.trim() || !body.trim()) {
      Alert.alert(t('Message vide', 'Empty message'), t('Renseigne un titre et un message.', 'Add a title and a message.'));
      return;
    }
    setSavingCampaign(true);
    try {
      await saveCampaign(
        {
          title: title.trim(),
          body: body.trim(),
          segment,
          schedule,
          hour,
          weekday: schedule === 'weekly' ? weekday : null,
          enabled: true,
        },
        userId,
      );
      track('admin_campaign_saved', { segment: segment.type, schedule });
      setScheduleOpen(false);
      refreshLists();
      Alert.alert(t('Campagne créée', 'Campaign created'), t('Elle partira automatiquement.', 'It will fire automatically.'));
    } catch (e) {
      Alert.alert(t('Erreur', 'Error'), e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCampaign(false);
    }
  };

  const confirmDeleteCampaign = (cp: Campaign) => {
    const del = () => deleteCampaign(cp.id).then(refreshLists).catch(() => {});
    if (Platform.OS === 'web') {
      if (typeof confirm === 'function' && confirm(t('Supprimer cette campagne ?', 'Delete this campaign?'))) del();
      return;
    }
    Alert.alert(t('Supprimer', 'Delete'), t('Supprimer cette campagne ?', 'Delete this campaign?'), [
      { text: t('Annuler', 'Cancel'), style: 'cancel' },
      { text: t('Supprimer', 'Delete'), style: 'destructive', onPress: del },
    ]);
  };

  const weekdays = language === 'fr' ? WEEKDAYS_FR : WEEKDAYS_EN;
  const scheduleSummary = (cp: Campaign) =>
    cp.schedule === 'daily'
      ? t(`Chaque jour à ${cp.hour}h UTC`, `Daily at ${cp.hour}:00 UTC`)
      : t(
          `${weekdays[cp.weekday ?? 0]} à ${cp.hour}h UTC`,
          `${weekdays[cp.weekday ?? 0]} at ${cp.hour}:00 UTC`,
        );

  const SEG_OPTIONS: Array<{ key: SegChoice; label: string }> = [
    { key: 'everyone', label: t('Tout le monde', 'Everyone') },
    { key: 'inactive', label: t('Inactifs', 'Inactive') },
    { key: 'users', label: t('Joueur précis', 'Specific') },
    { key: 'played_mode', label: t('A joué un mode', 'Played a mode') },
    { key: 'never_online', label: t('Jamais en ligne', 'Never online') },
  ];

  const inputStyle = [styles.input, { backgroundColor: c.background, borderColor: c.border, color: c.text }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Back')}
        >
          <ArrowLeft color={c.text} size={20} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{t('Notifications push', 'Push notifications')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* ── Compose ─────────────────────────────────────────────────────── */}
        <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>{t('MESSAGE', 'MESSAGE')}</Text>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, gap: 10 }]}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('Titre', 'Title')}
            placeholderTextColor={c.textFaint}
            style={inputStyle}
            maxLength={80}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('Message…', 'Message…')}
            placeholderTextColor={c.textFaint}
            style={[inputStyle, styles.multiline]}
            multiline
            maxLength={240}
          />
        </View>

        {/* ── Targeting ───────────────────────────────────────────────────── */}
        <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>{t('CIBLE', 'TARGET')}</Text>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, gap: 12 }]}>
          <View style={styles.chipsRow}>
            {SEG_OPTIONS.map((o) => {
              const active = seg === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  onPress={() => chooseSeg(o.key)}
                  style={[
                    styles.chip,
                    { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : c.background },
                  ]}
                  {...a11yButton(o.label, { selected: active })}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : c.textMuted }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Inactive: days */}
          {seg === 'inactive' && (
            <View style={styles.rowBetween}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t('Pas connecté depuis (jours)', 'Not seen for (days)')}</Text>
              <TextInput
                value={days}
                onChangeText={changeDays}
                keyboardType="number-pad"
                style={[inputStyle, { width: 64, textAlign: 'center' }]}
                maxLength={3}
              />
            </View>
          )}

          {/* Played a mode: mode picker */}
          {seg === 'played_mode' && (
            <View style={styles.chipsRow}>
              {MODES.map((m) => {
                const active = activityMode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => chooseMode(m)}
                    style={[
                      styles.chip,
                      { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : c.background },
                    ]}
                    {...a11yButton(modeLabel(m, language), { selected: active })}
                  >
                    <Text style={[styles.chipText, { color: active ? '#fff' : c.textMuted }]}>{modeLabel(m, language)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Specific users: search + select */}
          {seg === 'users' && (
            <View style={{ gap: 8 }}>
              <View style={styles.searchRow}>
                <TextInput
                  value={userQuery}
                  onChangeText={setUserQuery}
                  placeholder={t('Rechercher un pseudo…', 'Search a username…')}
                  placeholderTextColor={c.textFaint}
                  style={[inputStyle, { flex: 1 }]}
                  onSubmitEditing={runSearch}
                  returnKeyType="search"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={runSearch}
                  style={[styles.searchBtn, { backgroundColor: c.accent }]}
                  {...a11yButton(t('Rechercher', 'Search'), { busy: searching })}
                >
                  {searching ? <ActivityIndicator size="small" color="#fff" /> : <Search color="#fff" size={18} />}
                </TouchableOpacity>
              </View>

              {selectedUsers.length > 0 && (
                <View style={styles.chipsRow}>
                  {selectedUsers.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      onPress={() => toggleUser(u)}
                      style={[styles.chip, { borderColor: c.accent, backgroundColor: c.accent, flexDirection: 'row', gap: 4 }]}
                      {...a11yButton(t(`Retirer ${u.username}`, `Remove ${u.username}`))}
                    >
                      <Text style={[styles.chipText, { color: '#fff' }]}>{u.username}</Text>
                      <X color="#fff" size={13} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {userResults.map((u) => {
                const picked = selectedUsers.some((x) => x.id === u.id);
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => toggleUser(u)}
                    style={[styles.resultRow, { borderColor: c.border, backgroundColor: c.background }]}
                    {...a11yButton(u.username, { selected: picked })}
                  >
                    <Text style={[styles.resultName, { color: c.text }]}>{u.username}</Text>
                    {picked && <Check color={c.accent} size={16} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Preview recipient count */}
          <TouchableOpacity
            onPress={doPreview}
            disabled={previewing}
            style={[styles.previewBtn, { borderColor: c.border, backgroundColor: c.background }]}
            {...a11yButton(t('Aperçu du nombre de destinataires', 'Preview recipient count'), { disabled: previewing, busy: previewing })}
          >
            <Users color={c.textMuted} size={16} />
            {previewing ? (
              <ActivityIndicator size="small" color={c.accent} />
            ) : (
              <Text style={[styles.previewText, { color: c.textMuted }]}>
                {preview == null
                  ? t('Aperçu du nombre de destinataires', 'Preview recipient count')
                  : t(`${preview} destinataire(s)`, `${preview} recipient(s)`)}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Send now ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: c.accent }]}
          onPress={doSend}
          disabled={sending}
          {...a11yButton(t('Envoyer maintenant', 'Send now'), { disabled: sending, busy: sending })}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Send color="#fff" size={18} />
              <Text style={styles.sendText}>{t('Envoyer maintenant', 'Send now')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Schedule ─────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.scheduleToggle, { borderColor: c.border }]}
          onPress={() => setScheduleOpen((v) => !v)}
          {...a11yButton(t('Programmer une campagne récurrente', 'Schedule a recurring campaign'), { expanded: scheduleOpen })}
        >
          <Clock color={c.textMuted} size={16} />
          <Text style={[styles.scheduleToggleText, { color: c.textMuted }]}>
            {t('Programmer une campagne récurrente', 'Schedule a recurring campaign')}
          </Text>
        </TouchableOpacity>

        {scheduleOpen && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, gap: 12 }]}>
            <Text style={[styles.fieldLabel, { color: c.textFaint }]}>
              {t('Utilise le message et la cible ci-dessus.', 'Uses the message and target above.')}
            </Text>
            <View style={styles.rowBetween}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t('Fréquence', 'Frequency')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['daily', 'weekly'] as const).map((s) => {
                  const active = schedule === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setSchedule(s)}
                      style={[styles.chip, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : c.background }]}
                      {...a11yButton(s === 'daily' ? t('Chaque jour', 'Daily') : t('Chaque semaine', 'Weekly'), { selected: active })}
                    >
                      <Text style={[styles.chipText, { color: active ? '#fff' : c.textMuted }]}>
                        {s === 'daily' ? t('Chaque jour', 'Daily') : t('Chaque semaine', 'Weekly')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {schedule === 'weekly' && (
              <View style={styles.rowBetween}>
                <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t('Jour', 'Day')}</Text>
                <TouchableOpacity
                  onPress={() => setWeekday((w) => (w + 1) % 7)}
                  style={[styles.stepperBtn, { borderColor: c.border, backgroundColor: c.background }]}
                  {...a11yButton(t(`Jour : ${weekdays[weekday]}`, `Day: ${weekdays[weekday]}`), { hint: t('Appuyer pour changer de jour', 'Tap to change the day') })}
                >
                  <Text style={{ fontFamily: FONTS.monoBold, color: c.text }}>{weekdays[weekday]}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.rowBetween}>
              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>{t('Heure (UTC)', 'Hour (UTC)')}</Text>
              <TouchableOpacity
                onPress={() => setHour((h) => (h + 1) % 24)}
                style={[styles.stepperBtn, { borderColor: c.border, backgroundColor: c.background }]}
                {...a11yButton(t(`Heure : ${hour}h UTC`, `Hour: ${hour}:00 UTC`), { hint: t('Appuyer pour changer l\'heure', 'Tap to change the hour') })}
              >
                <Text style={{ fontFamily: FONTS.monoBold, color: c.text }}>{`${hour}:00`}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: '#2a6e3f', marginTop: 4 }]}
              onPress={doSaveCampaign}
              disabled={savingCampaign}
              {...a11yButton(t('Enregistrer la campagne', 'Save campaign'), { disabled: savingCampaign, busy: savingCampaign })}
            >
              {savingCampaign ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Calendar color="#fff" size={18} />
                  <Text style={styles.sendText}>{t('Enregistrer la campagne', 'Save campaign')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Existing campaigns ───────────────────────────────────────────── */}
        {campaigns.length > 0 && (
          <>
            <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>{t('CAMPAGNES', 'CAMPAIGNS')}</Text>
            <View style={{ gap: 8 }}>
              {campaigns.map((cp) => (
                <View key={cp.id} style={[styles.campaignRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.campaignTitle, { color: c.text }]} numberOfLines={1}>{cp.title}</Text>
                    <Text style={[styles.campaignSub, { color: c.textFaint }]} numberOfLines={1}>
                      {scheduleSummary(cp)} · {segmentLabel(cp.segment)}
                    </Text>
                  </View>
                  <Switch
                    value={cp.enabled}
                    onValueChange={(v) => setCampaignEnabled(cp.id, v).then(refreshLists).catch(() => {})}
                    trackColor={{ false: c.border, true: c.accent }}
                    thumbColor="#fff"
                    accessibilityLabel={t(`Activer la campagne ${cp.title}`, `Enable campaign ${cp.title}`)}
                    accessibilityState={{ selected: cp.enabled }}
                  />
                  <TouchableOpacity
                    onPress={() => confirmDeleteCampaign(cp)}
                    style={{ padding: 6 }}
                    hitSlop={ICON_HIT_SLOP}
                    {...a11yButton(t(`Supprimer la campagne ${cp.title}`, `Delete campaign ${cp.title}`))}
                  >
                    <Trash2 color="#8b1a1a" size={18} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── History ──────────────────────────────────────────────────────── */}
        {log.length > 0 && (
          <>
            <Text style={[styles.outerSectionTitle, { color: c.textMuted }]}>{t('HISTORIQUE', 'HISTORY')}</Text>
            <View style={{ gap: 8 }}>
              {log.map((l) => (
                <View key={l.id} style={[styles.logRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Bell color={c.textFaint} size={15} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.campaignTitle, { color: c.text }]} numberOfLines={1}>{l.title}</Text>
                    <Text style={[styles.campaignSub, { color: c.textFaint }]} numberOfLines={1}>
                      {segmentLabel(l.segment)} · {t(`${l.sent}/${l.recipients} envoyées`, `${l.sent}/${l.recipients} sent`)}
                      {l.source === 'campaign' ? ' · auto' : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: FONTS.headingBlack },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  outerSectionTitle: { fontSize: 11, fontFamily: FONTS.monoBold, letterSpacing: 1, marginBottom: -4, marginLeft: 4, marginTop: 4 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, fontFamily: FONTS.mono },
  multiline: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontFamily: FONTS.monoBold },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 13, fontFamily: FONTS.mono, flexShrink: 1 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBtn: { width: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
  },
  resultName: { fontSize: 14, fontFamily: FONTS.mono },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
  },
  previewText: { fontSize: 13, fontFamily: FONTS.monoBold },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
  },
  sendText: { color: '#fff', fontSize: 15, fontFamily: FONTS.monoBold },
  scheduleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  scheduleToggleText: { fontSize: 13, fontFamily: FONTS.monoBold },
  stepperBtn: { paddingHorizontal: 18, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  campaignRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12 },
  campaignTitle: { fontSize: 14, fontFamily: FONTS.monoBold },
  campaignSub: { fontSize: 11, fontFamily: FONTS.mono, marginTop: 2 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
});
