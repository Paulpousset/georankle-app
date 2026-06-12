import { StyleSheet } from 'react-native';

/**
 * Cartographic Atlas shared styles.
 * Dark mode = nautical chart (default). Light variants suffixed with `Light`.
 */
export const commonStyles = StyleSheet.create({
  // ── Containers ──────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: '#0a1628', userSelect: 'none' as any },
  containerLight: { backgroundColor: '#f2e8d0' },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a70',
  },
  headerLight: { backgroundColor: '#e8d9b8', borderBottomColor: '#c4a87a' },

  title: {
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#d8e8f4',
  },
  titleLight: { color: '#2c1810' },

  // ── Stats row ────────────────────────────────────────────────────────────
  headerStats: {
    flexDirection: 'row',
    backgroundColor: '#1a2d50',
    borderRadius: 10,
    padding: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d4a70',
  },
  headerStatsLight: { backgroundColor: '#f8f2e3', borderColor: '#c4a87a' },

  statBox: { paddingHorizontal: 8, alignItems: 'center' },
  statLabel: {
    fontSize: 8,
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a6a88',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  statLabelLight: { color: '#a08060' },
  statValue: {
    fontSize: 16,
    fontFamily: 'SpaceMono_700Bold',
    color: '#d8e8f4',
  },
  statValueLight: { color: '#2c1810' },
  statTotal: {
    fontSize: 10,
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a6a88',
    marginLeft: 2,
  },
  statDivider: { width: 1, height: 20, marginHorizontal: 4 },

  // ── Buttons ──────────────────────────────────────────────────────────────
  refreshBtn: {
    backgroundColor: '#1a2d50',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d4a70',
  },
  refreshBtnLight: { backgroundColor: '#f8f2e3', borderColor: '#c4a87a' },

  playAgainBtn: {
    backgroundColor: '#c04a1a',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#a03a10',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 30,
    width: '100%',
    justifyContent: 'center',
  },
  playAgainText: {
    color: '#fff',
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 14,
    letterSpacing: 1,
  },

  // ── Country cards ────────────────────────────────────────────────────────
  countryCard: {
    backgroundColor: '#132040',
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2d4a70',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  countryCardLight: {
    backgroundColor: '#e8d9b8',
    borderColor: '#c4a87a',
    shadowOpacity: 0.08,
  },
  countryLabel: {
    fontSize: 9,
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a9eff',
    letterSpacing: 1.5,
  },
  countryLabelLight: { color: '#c04a1a' },
  countryFlag: { borderRadius: 6 },
  countryName: {
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#d8e8f4',
    textAlign: 'center',
  },
  countryNameLight: { color: '#2c1810' },
  instruction: {
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a6a88',
    fontSize: 11,
  },
  instructionLight: { color: '#a08060' },

  // ── Theme cards (mode selection) ─────────────────────────────────────────
  themesGrid: { width: '100%' },
  themeCard: {
    backgroundColor: '#132040',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d4a70',
  },
  themeCardLight: { backgroundColor: '#f8f2e3', borderColor: '#c4a87a' },
  usedThemeCard: { opacity: 0.35, backgroundColor: '#0a1628' },
  usedThemeCardLight: { opacity: 0.35, backgroundColor: '#f2e8d0' },
  themeLabel: {
    fontFamily: 'SpaceMono_400Regular',
    color: '#d8e8f4',
    fontSize: 12,
  },
  themeLabelLight: { color: '#2c1810' },
  emoji: { marginRight: 10 },
  selectionInfo: { alignItems: 'flex-end' },
  selectionCountry: {
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a6a88',
    fontSize: 10,
  },
  selectionCountryLight: { color: '#a08060' },
  selectionRank: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 14,
  },

  // ── Win / result card ────────────────────────────────────────────────────
  winCard: {
    backgroundColor: '#132040',
    borderRadius: 16,
    padding: 25,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2d4a70',
  },
  winCardLight: { backgroundColor: '#e8d9b8', borderColor: '#c4a87a' },
  winTitle: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_900Black',
    color: '#d8e8f4',
    marginTop: 15,
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  winTitleLight: { color: '#2c1810' },

  // ── Summary table ─────────────────────────────────────────────────────────
  summaryTotal: { alignItems: 'center', marginBottom: 30 },
  summaryTable: { width: '100%', gap: 8 },
  summaryHeader: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 5 },
  summaryHeaderText: {
    fontSize: 9,
    fontFamily: 'SpaceMono_700Bold',
    color: '#4a6a88',
    letterSpacing: 1,
  },
  summaryHeaderTextLight: { color: '#a08060' },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#0a1628',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#2d4a70',
  },
  summaryRowLight: { backgroundColor: '#f8f2e3', borderLeftColor: '#c4a87a' },
  rowThemeLabel: {
    fontSize: 13,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#d8e8f4',
  },
  rowThemeLabelLight: { color: '#2c1810' },
  rowCountryOptimal: {
    fontSize: 9,
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a6a88',
  },
  rowCountryOptimalLight: { color: '#a08060' },
  rowRank: {
    fontSize: 16,
    fontFamily: 'SpaceMono_700Bold',
  },
  rowRankOptimal: {
    fontSize: 9,
    fontFamily: 'SpaceMono_400Regular',
    color: '#4a6a88',
  },
});
