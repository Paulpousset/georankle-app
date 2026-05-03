import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Dimensions, Image, Appearance, Modal } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Trophy, RefreshCcw, Moon, Sun, ArrowLeftRight, Home, LayoutGrid, Zap, User, LogIn, BarChart3, Users } from 'lucide-react-native';

import gameData from './assets/game_data.json';
import StreakGame from './StreakGame';
import VersusCapitals from './VersusCapitals';
import Auth from './Auth';
import Leaderboard from './Leaderboard';
import { supabase } from './supabase';

const CCA3_TO_CCA2 = {
  "AFG": "AF", "ALB": "AL", "DZA": "DZ", "ASM": "AS", "AND": "AD", "AGO": "AO", "AIA": "AI", "ATA": "AQ", "ATG": "AG", "ARG": "AR",
  "ARM": "AM", "ABW": "AW", "AUS": "AU", "AUT": "AT", "AZE": "AZ", "BHS": "BS", "BHR": "BH", "BGD": "BD", "BRB": "BB", "BLR": "BY",
  "BEL": "BE", "BLZ": "BZ", "BEN": "BJ", "BMU": "BM", "BTN": "BT", "BOL": "BO", "BES": "BQ", "BIH": "BA", "BWA": "BW", "BVT": "BV",
  "BRA": "BR", "IOT": "IO", "VGB": "VG", "BRN": "BN", "BGR": "BG", "BFA": "BF", "BDI": "BI", "KHM": "KH", "CMR": "CM", "CAN": "CA",
  "CPV": "CV", "CYM": "KY", "CAF": "CF", "TCD": "TD", "CHL": "CL", "CHN": "CN", "CXR": "CX", "CCK": "CC", "COL": "CO", "COM": "KM",
  "COG": "CG", "COD": "CD", "COK": "CK", "CRI": "CR", "CIV": "CI", "HRV": "HR", "CUB": "CU", "CUW": "CW", "CYP": "CY", "CZE": "CZ",
  "DNK": "DK", "DJI": "DJ", "DMA": "DM", "DOM": "DO", "ECU": "EC", "EGY": "EG", "SLV": "SV", "GNQ": "GQ", "ERI": "ER", "EST": "EE",
  "ETH": "ET", "FLK": "FK", "FRO": "FO", "FJI": "FJ", "FIN": "FI", "FRA": "FR", "GUF": "GF", "PYF": "PF", "ATF": "TF", "GAB": "GA",
  "GMB": "GM", "GEO": "GE", "DEU": "DE", "GHA": "GH", "GIB": "GI", "GRC": "GR", "GRL": "GL", "GRD": "GD", "GLP": "GP", "GUM": "GU",
  "GTM": "GT", "GGY": "GG", "GIN": "GN", "GNB": "GW", "GUY": "GY", "HTI": "HT", "HMD": "HM", "VAT": "VA", "HND": "HN", "HKG": "HK",
  "HUN": "HU", "ISL": "IS", "IND": "IN", "IDN": "ID", "IRN": "IR", "IRQ": "IQ", "IRL": "IE", "IMN": "IM", "ISR": "IL", "ITA": "IT",
  "JAM": "JM", "JPN": "JP", "JEY": "JE", "JOR": "JO", "KAZ": "KZ", "KEN": "KE", "KIR": "KI", "PRK": "KP", "KOR": "KR", "KWT": "KW",
  "KGZ": "KG", "LAO": "LA", "LVA": "LV", "LBN": "LB", "LSO": "LS", "LBR": "LR", "LBY": "LY", "LIE": "LI", "LTU": "LT", "LUX": "LU",
  "MAC": "MO", "MKD": "MK", "MDG": "MG", "MWI": "MW", "MYS": "MY", "MDV": "MV", "MLI": "ML", "MLT": "MT", "MHL": "MH", "MTQ": "MQ",
  "MRT": "MR", "MUS": "MU", "MYT": "YT", "MEX": "MX", "FSM": "FM", "MDA": "MD", "MCO": "MC", "MNG": "MN", "MNE": "ME", "MSR": "MS",
  "MAR": "MA", "MOZ": "MZ", "MMR": "MM", "NAM": "NA", "NRU": "NR", "NPL": "NP", "NLD": "NL", "NCL": "NC", "NZL": "NZ", "NIC": "NI",
  "NER": "NE", "NGA": "NG", "NIU": "NU", "NFK": "NF", "MNP": "MP", "NOR": "NO", "OMN": "OM", "PAK": "PK", "PLW": "PW", "PSE": "PS",
  "PAN": "PA", "PNG": "PG", "PRY": "PY", "PER": "PE", "PHL": "PH", "PCN": "PN", "POL": "PL", "PRT": "PT", "PRI": "PR", "QAT": "QA",
  "REU": "RE", "ROU": "RO", "RUS": "RU", "RWA": "RW", "BLM": "BL", "SHN": "SH", "KNA": "KN", "LCA": "LC", "MAF": "MF", "SPM": "PM",
  "VCT": "VC", "WSM": "WS", "SMR": "SM", "STP": "ST", "SAU": "SA", "SEN": "SN", "SRB": "RS", "SYC": "SC", "SLE": "SL", "SGP": "SG",
  "SXM": "SX", "SVK": "SK", "SVN": "SI", "SLB": "SB", "SOM": "SO", "ZAF": "ZA", "SGS": "GS", "SSD": "SS", "ESP": "ES", "LKA": "LK",
  "SDN": "SD", "SUR": "SR", "SJM": "SJ", "SWZ": "SZ", "SWE": "SE", "CHE": "CH", "SYR": "SY", "TWN": "TW", "TJK": "TJ", "TZA": "TZ",
  "THA": "TH", "TLS": "TL", "TGO": "TG", "TKL": "TK", "TON": "TO", "TTO": "TT", "TUN": "TN", "TUR": "TR", "TKM": "TM", "TCA": "TC",
  "TUV": "TV", "UGA": "UG", "UKR": "UA", "ARE": "AE", "GBR": "GB", "USA": "US", "UMI": "UM", "URY": "UY", "UZB": "UZ", "VUT": "VU",
  "VEN": "VE", "VNM": "VN", "VIR": "VI", "WLF": "WF", "ESH": "EH", "YEM": "YE", "ZMB": "ZM", "ZWE": "ZW", "ALA": "AX", "UNK": "XK"
};

const getFlagUrl = (cca3) => {
  const code = CCA3_TO_CCA2[cca3];
  if (!code) return `https://flagcdn.com/w160/un.png`; 
  return `https://flagcdn.com/w160/${code.toLowerCase()}.png`;
};

const { width } = Dimensions.get('window');

export default function App() {
  const systemTheme = Appearance.getColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(systemTheme === 'dark');
  const [language, setLanguage] = useState('fr'); // 'fr' or 'en'
  const [gameMode, setGameMode] = useState('menu'); // 'menu', 'classic', 'streak', or 'versus'
  const [sessionThemes, setSessionThemes] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [bestScore, setBestScore] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [usedThemeIds, setUsedThemeIds] = useState([]); // Array of theme IDs in order of selection
  const [selections, setSelections] = useState({}); // { themeId: { countryName, rank } }
  const [optimalSelections, setOptimalSelections] = useState({}); // { themeId: { countryName, rank } }
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    initGame();
    
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchUserBestScores(session.user.id);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setShowAuthModal(false);
        fetchUserBestScores(session.user.id);
        // Create profile if it doesn't exist
        supabase.from('profiles').upsert({ id: session.user.id }, { onConflict: 'id' }).then(({error}) => {
          if (error) console.log('Profile upsert error:', error);
        });
      } else {
        setBestScore(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserBestScores = async (userId) => {
    const { data: scores } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', userId)
      .eq('game_mode', 'classic');

    if (scores && scores.length > 0) {
      // Filter out old scores that were total ranks (usually > 100) and keep only efficiency (%)
      const validScores = scores.map(s => s.score).filter(s => s <= 100);
      if (validScores.length > 0) {
          const maxEfficiency = Math.max(...validScores);
          setBestScore(maxEfficiency);
      } else {
          setBestScore(null);
      }
    }
  };

  const solveOptimal = (currentThemes, currentRounds) => {
    if (!currentThemes || currentThemes.length < 8 || !currentRounds || currentRounds.length < 8) return {};

    let bestMapping = {};
    let minTotal = Infinity;

    const themeIds = currentThemes.map(t => t.id);
    const matrix = currentRounds.map(country => 
      themeIds.map(themeId => country.ranks[themeId] || 200)
    );

    const solve = (countryIdx, currentUsedThemes, currentSum, currentMapping) => {
      if (countryIdx === 8) {
        if (currentSum < minTotal) {
          minTotal = currentSum;
          bestMapping = { ...currentMapping };
        }
        return;
      }

      for (let themeIdx = 0; themeIdx < 8; themeIdx++) {
        if (!(currentUsedThemes & (1 << themeIdx))) {
          const rank = matrix[countryIdx][themeIdx];
          if (currentSum + rank >= minTotal) continue; 
          
          const nextMapping = { ...currentMapping };
          nextMapping[themeIds[themeIdx]] = {
            countryName: language === 'fr' ? currentRounds[countryIdx].name : (currentRounds[countryIdx].name_en || currentRounds[countryIdx].name),
            rank: rank,
            cca3: currentRounds[countryIdx].cca3
          };
          solve(countryIdx + 1, currentUsedThemes | (1 << themeIdx), currentSum + rank, nextMapping);
        }
      }
    };

    solve(0, 0, 0, {});
    return bestMapping;
  };

  const toggleLanguage = () => setLanguage(l => l === 'fr' ? 'en' : 'fr');
  const toggleTheme = () => setIsDarkMode(prev => !prev);

  const initGame = () => {
    // 1. Select 8 random themes for the session
    const allThemeIds = Object.keys(gameData.themes).filter(themeId => {
      // Extra safety: only pick themes that are actually present in a significant number of countries
      const coverage = gameData.countries.filter(c => c.ranks && c.ranks[themeId] !== undefined).length;
      return coverage > 10; 
    });
    const shuffledThemes = [...allThemeIds].sort(() => Math.random() - 0.5);
    const selectedThemes = shuffledThemes.slice(0, 8).map(id => ({
        id,
        ...gameData.themes[id]
    }));
    
    // 2. Select 8 random countries for the 8 rounds
    let countries = gameData.countries.filter(c => {
        return selectedThemes.every(theme => 
            c.ranks && 
            c.ranks[theme.id] !== undefined &&
            c.data &&
            c.data[theme.id] !== undefined
        );
    });
    
    // FALLBACK: If not enough countries match ALL 8 themes exactly, 
    // pick countries that have the most data available.
    if (countries.length < 8) {
      console.warn("Not enough countries with all 8 themes, falling back...");
      countries = [...gameData.countries].sort((a, b) => 
        Object.keys(b.ranks).length - Object.keys(a.ranks).length
      );
    }

    const shuffledCountries = [...countries].sort(() => Math.random() - 0.5);
    const selectedCountries = shuffledCountries.slice(0, 8);
    
    // UPDATE STATES IN ORDER
    setSessionThemes(selectedThemes);
    setRounds(selectedCountries);
    setCurrentRoundIndex(0);
    setTotalScore(0);
    setGameOver(false);
    setUsedThemeIds([]);
    setSelections({});
    
    // Calculate optimal solution
    const optimal = solveOptimal(selectedThemes, selectedCountries);
    setOptimalSelections(optimal);
  };

  const selectTheme = (themeId) => {
    if (gameOver || usedThemeIds.includes(themeId)) return;

    const country = rounds[currentRoundIndex];
    const rank = country.ranks[themeId] || 200;
    
    // Update selections
    setSelections(prev => ({
        ...prev,
        [themeId]: {
            countryName: language === 'fr' ? country.name : (country.name_en || country.name),
            rank: rank,
            cca3: country.cca3
        }
    }));

    setUsedThemeIds(prev => [...prev, themeId]);
    setTotalScore(prev => prev + rank);

    // Auto-advance or end game
    if (currentRoundIndex < 7) {
        setTimeout(() => {
            setCurrentRoundIndex(prev => prev + 1);
        }, 300); // Reduced delay from 800ms to 300ms for snappier feel
    } else {
        setTimeout(() => {
            setGameOver(true);
            const finalScore = totalScore + rank;
            
            // Calculate efficiency for the game
            const optimalTotal = Object.values(optimalSelections).reduce((acc, curr) => acc + curr.rank, 0);
            const efficiency = Math.round((optimalTotal / Math.max(finalScore, 1)) * 100);

            setBestScore(prev => (prev === null || efficiency > prev) ? efficiency : prev);
            
            // Save to Supabase (score column now stores efficiency for classic mode)
            if (user) {
              supabase.from('scores').insert({
                user_id: user.id,
                game_mode: 'classic',
                score: efficiency
              }).then(({ error }) => {
                if (error) console.error('Error saving classic efficiency:', error);
              });
            }
        }, 500); // Reduced delay from 1000ms to 500ms
    }
  };

  const getRankColor = (rank) => {
    if (rank <= 5) return '#10b981'; // Success Green
    if (rank <= 20) return '#38bdf8'; // Info Blue
    if (rank <= 50) return '#f59e0b'; // Warning Amber
    return '#ef4444'; // Error Red
  };

  const MainMenu = () => (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, !isDarkMode && styles.containerLight, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        
        <View style={{ position: 'absolute', top: 60, right: 20, flexDirection: 'row', gap: 10 }}>
          {/* User Auth Button */}
          <TouchableOpacity 
            onPress={() => user ? setShowAuthModal(true) : setShowAuthModal(true)}
            style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }]}
          >
            {user ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' }}>
                  <User color="white" size={16} />
                </View>
                <Text style={{ color: isDarkMode ? '#f8fafc' : '#1e293b', fontWeight: 'bold', fontSize: 12 }}>
                  {language === 'fr' ? 'Profil' : 'Profile'}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <LogIn color={isDarkMode ? '#f8fafc' : '#1e293b'} size={20} />
                <Text style={{ color: isDarkMode ? '#f8fafc' : '#1e293b', fontWeight: 'bold', fontSize: 12 }}>
                  {language === 'fr' ? 'Connexion' : 'Login'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleLanguage} style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10, minWidth: 45, alignItems: 'center' }]}>
            <Text style={{ color: isDarkMode ? '#fff' : '#1e293b', fontWeight: 'bold' }}>{language.toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleTheme} style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}>
            {isDarkMode ? <Sun color="#fbbf24" size={24} /> : <Moon color="#64748b" size={24} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowLeaderboard(true)} style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 10 }]}>
            <BarChart3 color={isDarkMode ? '#f8fafc' : '#1e293b'} size={24} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, !isDarkMode && styles.titleLight, { fontSize: 48, marginBottom: 10 }]}>GeoRankle</Text>
        <Text style={{ color: '#64748b', fontSize: 16, marginBottom: 50, textAlign: 'center' }}>
          {language === 'fr' ? 'Testez vos connaissances géographiques mondiales' : 'Test your global geographical knowledge'}
        </Text>

        <View style={{ gap: 20, width: '100%', maxWidth: 400 }}>
          <TouchableOpacity 
            onPress={() => setGameMode('classic')}
            style={[styles.countryCard, !isDarkMode && styles.countryCardLight, { padding: 25, flexDirection: 'row', alignItems: 'center', gap: 20, borderLeftWidth: 8, borderLeftColor: '#10b981' }]}
          >
            <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 15, borderRadius: 15 }}>
              <LayoutGrid color="#10b981" size={32} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 22, textAlign: 'left' }]}>
                {language === 'fr' ? 'Mode Classique' : 'Classic Mode'}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 14 }}>
                {language === 'fr' ? '8 pays, 8 thèmes. Minimisez votre rang total !' : '8 countries, 8 themes. Minimize your total rank!'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setGameMode('streak')}
            style={[styles.countryCard, !isDarkMode && styles.countryCardLight, { padding: 25, flexDirection: 'row', alignItems: 'center', gap: 20, borderLeftWidth: 8, borderLeftColor: '#fbbf24' }]}
          >
            <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: 15, borderRadius: 15 }}>
              <Zap color="#fbbf24" size={32} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 22, textAlign: 'left' }]}>
                {language === 'fr' ? 'Mode Streak' : 'Streak Mode'}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 14 }}>
                {language === 'fr' ? 'Trouvez le meilleur rang. Une erreur et c\'est fini !' : 'Find the best rank. One mistake and it\'s over!'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setGameMode('versus')}
            style={[styles.countryCard, !isDarkMode && styles.countryCardLight, { padding: 25, flexDirection: 'row', alignItems: 'center', gap: 20, borderLeftWidth: 8, borderLeftColor: '#3b82f6' }]}
          >
            <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: 15, borderRadius: 15 }}>
              <Users color="#3b82f6" size={32} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.countryName, !isDarkMode && styles.countryNameLight, { fontSize: 22, textAlign: 'left' }]}>
                {language === 'fr' ? 'Mode Versus' : 'Versus Mode'}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 14 }}>
                {language === 'fr' ? 'Affrontez un ami sur les capitales (1v1 local)' : 'Challenge a friend on capitals (local 1v1)'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={{ position: 'absolute', bottom: 40, color: '#475569', fontSize: 12 }}>v2.0 • GeoRankle Engine</Text>

        <Modal
          visible={showAuthModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowAuthModal(false)}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <View style={{ width: '90%', maxWidth: 400, backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderRadius: 24, padding: 10 }}>
              <TouchableOpacity 
                style={{ alignSelf: 'flex-end', padding: 10 }}
                onPress={() => setShowAuthModal(false)}
              >
                <Text style={{ color: isDarkMode ? '#fff' : '#1e293b', fontWeight: 'bold', fontSize: 18 }}>X</Text>
              </TouchableOpacity>
              <Auth 
                language={language} 
                onAuthSuccess={() => setShowAuthModal(false)} 
              />
            </View>
          </View>
        </Modal>

        <Modal
          visible={showLeaderboard}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowLeaderboard(false)}
        >
          <View style={{ flex: 1, backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 20 }}>
                <TouchableOpacity 
                  onPress={() => setShowLeaderboard(false)}
                  style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 8, paddingHorizontal: 15 }]}
                >
                  <Text style={{ color: isDarkMode ? '#f8fafc' : '#1e293b', fontWeight: 'bold' }}>
                    {language === 'fr' ? 'Fermer' : 'Close'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Leaderboard language={language} isDarkMode={isDarkMode} />
            </SafeAreaView>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );

  if (gameMode === 'menu') {
    return <MainMenu />;
  }

  if (gameMode === 'streak') {
    return <StreakGame 
      isDarkMode={isDarkMode} 
      setIsDarkMode={setIsDarkMode} 
      setGameMode={setGameMode} 
      language={language} 
      setLanguage={setLanguage}
      user={user}
    />;
  }

  if (gameMode === 'versus') {
    return <VersusCapitals 
      isDarkMode={isDarkMode} 
      setGameMode={setGameMode} 
      language={language} 
    />;
  }

  if (rounds.length === 0 || sessionThemes.length === 0) return <View style={[styles.container, !isDarkMode && styles.containerLight]}><Text style={{color: isDarkMode ? 'white' : 'black'}}>Chargement...</Text></View>;

  const currentCountry = !gameOver ? rounds[currentRoundIndex] : null;

  const themeStyles = {
    container: [styles.container, !isDarkMode && styles.containerLight],
    header: [styles.header, !isDarkMode && styles.headerLight],
    title: [styles.title, !isDarkMode && styles.titleLight],
    headerStats: [styles.headerStats, !isDarkMode && styles.headerStatsLight],
    statLabel: [styles.statLabel, !isDarkMode && styles.statLabelLight],
    statValue: [styles.statValue, !isDarkMode && styles.statValueLight],
    statBox: [styles.statBox, !isDarkMode && styles.statBoxLight],
    countryCard: [styles.countryCard, !isDarkMode && styles.countryCardLight],
    countryLabel: [styles.countryLabel, !isDarkMode && styles.countryLabelLight],
    countryName: [styles.countryName, !isDarkMode && styles.countryNameLight],
    instruction: [styles.instruction, !isDarkMode && styles.instructionLight],
    themeCard: (isUsed) => [
      styles.themeCard, 
      !isDarkMode && styles.themeCardLight,
      isUsed && (isDarkMode ? styles.usedThemeCard : styles.usedThemeCardLight)
    ],
    themeLabel: [styles.themeLabel, !isDarkMode && styles.themeLabelLight],
    selectionCountry: [styles.selectionCountry, !isDarkMode && styles.selectionCountryLight],
    winCard: [styles.winCard, !isDarkMode && styles.winCardLight],
    winTitle: [styles.winTitle, !isDarkMode && styles.winTitleLight],
    summaryHeaderText: [styles.summaryHeaderText, !isDarkMode && styles.summaryHeaderTextLight],
    rowThemeLabel: [styles.rowThemeLabel, !isDarkMode && styles.rowThemeLabelLight],
    rowCountryOptimal: [styles.rowCountryOptimal, !isDarkMode && styles.rowCountryOptimalLight],
    summaryRow: [styles.summaryRow, !isDarkMode && styles.summaryRowLight],
    summaryTotal: [styles.summaryTotal, !isDarkMode && styles.summaryTotalLight],
  };

  const optimalTotal = Object.values(optimalSelections).reduce((acc, curr) => acc + curr.rank, 0);
  
  // Calculate potential efficiency in real-time
  // We compare current score with the sum of optimal ranks for themes already used
  const usedOptimalScore = usedThemeIds.reduce((acc, themeId) => acc + (optimalSelections[themeId]?.rank || 0), 0);
  const currentEfficiency = usedThemeIds.length > 0 
    ? Math.round((usedOptimalScore / Math.max(totalScore, 1)) * 100) 
    : 0;

  const efficiency = Math.round((optimalTotal / Math.max(totalScore, 1)) * 100);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={themeStyles.container}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        
        <View style={themeStyles.header}>
          <TouchableOpacity onPress={() => setGameMode('menu')} style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 8, marginRight: 10, backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
            <Home color="#10b981" size={20} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={themeStyles.title}>GeoRankle</Text>
          </View>

          <View style={{ flex: 1.5, alignItems: 'center' }}>
            <View style={[themeStyles.statBox, { paddingHorizontal: 20, flexDirection: 'row', gap: 15 }]}>
              <View style={{ alignItems: 'center' }}>
                <Text style={themeStyles.statLabel}>
                  {language === 'fr' ? 'SCORE' : 'SCORE'}
                </Text>
                <Text style={[themeStyles.statValue, { fontSize: 32, color: getRankColor(totalScore / (currentRoundIndex || 1)) }]}>
                  {totalScore}
                </Text>
              </View>
              <View style={{ width: 1, height: '60%', backgroundColor: isDarkMode ? '#334155' : '#e2e8f0', alignSelf: 'center' }} />
              <View style={{ alignItems: 'center' }}>
                <Text style={themeStyles.statLabel}>
                  {language === 'fr' ? 'EFFICACITÉ' : 'EFFICIENCY'}
                </Text>
                <Text style={[themeStyles.statValue, { fontSize: 32, color: currentEfficiency >= 80 ? '#10b981' : currentEfficiency >= 50 ? '#3b82f6' : '#ef4444' }]}>
                  {currentEfficiency}%
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flex: 1, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <View style={themeStyles.headerStats}>
              <View style={themeStyles.statBox}>
                <Text style={themeStyles.statLabel}>ROUND</Text>
                <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
                  <Text style={[themeStyles.statValue, { fontSize: 18 }]}>{gameOver ? '8' : currentRoundIndex + 1}</Text>
                  <Text style={styles.statTotal}>/8</Text>
                </View>
              </View>
              <View style={[styles.statDivider, { backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' }]} />
              <View style={themeStyles.statBox}>
                <Text style={themeStyles.statLabel}>{language === 'fr' ? 'BEST EFF' : 'BEST EFF'}</Text>
                <Text style={[themeStyles.statValue, { color: isDarkMode ? '#fbbf24' : '#d97706', fontSize: 18 }]}>
                    {bestScore === null || bestScore > 100 ? '--' : `${bestScore}%`}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={() => setIsDarkMode(!isDarkMode)} style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { padding: 6 }]}>
                {isDarkMode ? <Sun color="#fbbf24" size={16} /> : <Moon color="#64748b" size={16} />}
              </TouchableOpacity>
                <TouchableOpacity onPress={toggleLanguage} style={[styles.refreshBtn, !isDarkMode && styles.refreshBtnLight, { paddingHorizontal: 12, paddingVertical: 6, minWidth: 45, alignItems: 'center' }]}>
                  <Text style={{ color: isDarkMode ? '#fff' : '#1e293b', fontWeight: 'bold', fontSize: 13 }}>{language.toUpperCase()}</Text>
                </TouchableOpacity>
            </View>
          </View>
        </View>

          <View style={{ flex: 1 }}>
            {!gameOver && currentCountry ? (
                <View style={{ flex: 1, paddingHorizontal: 15, paddingVertical: 10, alignItems: 'center' }}>
                    <View style={[themeStyles.countryCard, { padding: 15, marginBottom: 10, width: '100%', maxWidth: 500 }]}>
                        <Text style={themeStyles.countryLabel}>
                          {language === 'fr' ? 'PAYS ACTUEL' : 'CURRENT COUNTRY'}
                        </Text>
                        <Image 
                          source={{ uri: getFlagUrl(currentCountry.cca3) }} 
                          style={[styles.countryFlag, { height: 50, width: 75, marginVertical: 4 }]} 
                        />
                        <Text style={[themeStyles.countryName, { fontSize: 28, marginVertical: 2 }]}>
                          {language === 'fr' ? currentCountry.name : (currentCountry.name_en || currentCountry.name)}
                        </Text>
                        <Text style={[themeStyles.instruction, { fontSize: 13, marginTop: 2 }]}>
                          {language === 'fr' ? 'Assignez un thème à ce pays' : 'Assign a category to this country'}
                        </Text>
                    </View>

                    <View style={[styles.themesGrid, { flex: 1, justifyContent: 'center', gap: 8, width: '100%', maxWidth: 500 }]}>
                        {sessionThemes.map((theme) => {
                            const selection = selections[theme.id];
                            const isUsed = !!selection;

                            return (
                                <TouchableOpacity 
                                    key={theme.id} 
                                    style={[
                                        themeStyles.themeCard(isUsed), 
                                        { padding: 10, borderRadius: 12, minHeight: 45, borderLeftWidth: 5, borderLeftColor: isUsed ? getRankColor(selection.rank) : (isDarkMode ? '#334155' : '#cbd5e1') }
                                    ]}
                                    onPress={() => selectTheme(theme.id)}
                                    disabled={isUsed}
                                >
                                    <Text style={[styles.emoji, { fontSize: 20, marginRight: 10 }]}>{theme.emoji}</Text>
                                    <Text style={[themeStyles.themeLabel, { fontSize: 14, flex: 1 }]} numberOfLines={1}>
                                      {language === 'fr' ? theme.label.fr : (theme.label.en || theme.label.fr)}
                                    </Text>
                                  {isUsed && (
                                      <View style={styles.selectionInfo}>
                                          <Text style={[themeStyles.selectionCountry, { fontSize: 10 }]} numberOfLines={1}>{selection.countryName}</Text>
                                          <Text style={[styles.selectionRank, { fontSize: 18, color: getRankColor(selection.rank) }]}>#{selection.rank}</Text>
                                      </View>
                                  )}
                              </TouchableOpacity>
                          );
                      })}
                  </View>
              </View>
          ) : (
              <View style={{ flex: 1, padding: 20, alignItems: 'center' }}>
                  <View style={[themeStyles.winCard, { flex: 1, padding: 30, justifyContent: 'space-between', width: '100%', maxWidth: 800 }]}>
                      <View style={{ alignItems: 'center' }}>
                        <Trophy color="#fbbf24" size={48} />
                        <Text style={[themeStyles.winTitle, { fontSize: 32, marginTop: 10, marginBottom: 5 }]}>
                          {language === 'fr' ? 'SESSION TERMINÉE' : 'SESSION FINISHED'}
                        </Text>
                        
                        <View style={{ flexDirection: 'row', gap: 30, marginBottom: 20 }}>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={[themeStyles.statLabel, { fontSize: 12 }]}>
                                  {language === 'fr' ? 'SCORE TOTAL' : 'TOTAL SCORE'}
                                </Text>
                                <Text style={[themeStyles.statValue, { fontSize: 48, lineHeight: 48, color: getRankColor(totalScore/8) }]}>{totalScore}</Text>
                                <Text style={{ fontSize: 12, color: '#64748b' }}>
                                  {language === 'fr' ? 'Optimal : ' : 'Optimal: '}
                                  <Text style={{ fontWeight: 'bold' }}>{optimalTotal}</Text>
                                </Text>
                            </View>

                            <View style={{ width: 1, height: '80%', backgroundColor: isDarkMode ? '#334155' : '#e2e8f0', alignSelf: 'center' }} />

                            <View style={{ alignItems: 'center' }}>
                                <Text style={[themeStyles.statLabel, { fontSize: 12 }]}>
                                  {language === 'fr' ? 'EFFICACITÉ' : 'EFFICIENCY'}
                                </Text>
                                <Text style={[themeStyles.statValue, { fontSize: 48, lineHeight: 48, color: efficiency >= 80 ? '#10b981' : efficiency >= 50 ? '#3b82f6' : '#ef4444' }]}>
                                  {efficiency}%
                                </Text>
                                <Text style={{ fontSize: 12, color: '#64748b' }}>
                                  {language === 'fr' ? 'Indice de perf' : 'Perf index'}
                                </Text>
                            </View>
                        </View>
                      </View>

                      <View style={[styles.summaryTable, { flex: 1, marginVertical: 10 }]}>
                        <View style={[styles.summaryHeader, { marginBottom: 8, paddingHorizontal: 15 }]}>
                          <Text style={[themeStyles.summaryHeaderText, { flex: 1.5, fontSize: 12 }]}>
                            {language === 'fr' ? 'THÈME' : 'THEME'}
                          </Text>
                          <Text style={[themeStyles.summaryHeaderText, { flex: 2.2, fontSize: 12 }]}>
                            {language === 'fr' ? 'VOTRE CHOIX' : 'YOUR CHOICE'}
                          </Text>
                          <Text style={[themeStyles.summaryHeaderText, { flex: 2.2, fontSize: 12 }]}>
                            {language === 'fr' ? 'SCORE OPTIMAL' : 'OPTIMAL SCORE'}
                          </Text>
                        </View>
                        
                        <View style={{ flex: 1, gap: 4 }}>
                          {sessionThemes.map((theme) => {
                            const selection = selections[theme.id];
                            const optimal = optimalSelections[theme.id];
                            const optimalCountryName = language === 'fr' ? optimal.countryName : (gameData.countries.find(c => c.cca3 === optimal.cca3)?.name_en || optimal.countryName);
                            return (
                              <View key={theme.id} style={[themeStyles.summaryRow, { padding: 8, borderRadius: 12, backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f1f5f9' }]}>
                                {/* Colonne Thème */}
                                <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 16 }}>{theme.emoji}</Text>
                                  <Text style={[themeStyles.rowThemeLabel, { fontSize: 12 }]} numberOfLines={1}>
                                    {language === 'fr' ? theme.label.fr : theme.label.en}
                                  </Text>
                                </View>

                                {/* Colonne Utilisateur */}
                                <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 8, borderRightWidth: 1, borderRightColor: isDarkMode ? '#334155' : '#e2e8f0', paddingRight: 8 }}>
                                  <Image source={{ uri: getFlagUrl(selection.cca3) }} style={{ width: 24, height: 16, borderRadius: 3 }} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, color: isDarkMode ? '#f8fafc' : '#1e293b', fontWeight: '700' }} numberOfLines={1}>{selection.countryName}</Text>
                                    <Text style={{ fontSize: 14, fontWeight: '900', color: getRankColor(selection.rank), lineHeight: 16 }}>#{selection.rank}</Text>
                                  </View>
                                </View>

                                {/* Colonne Optimal */}
                                <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                                  <Image source={{ uri: getFlagUrl(optimal.cca3) }} style={{ width: 24, height: 16, borderRadius: 3, opacity: 0.8 }} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '500' }} numberOfLines={1}>{optimalCountryName}</Text>
                                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#64748b', lineHeight: 16 }}>#{optimal.rank}</Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 15, width: '100%', marginTop: 10 }}>
                        <TouchableOpacity style={[styles.playAgainBtn, { flex: 2, paddingVertical: 14 }]} onPress={initGame}>
                            <RefreshCcw color="#fff" size={20} />
                            <Text style={[styles.playAgainText, { fontSize: 16 }]}>
                              {language === 'fr' ? 'REJOUER' : 'PLAY AGAIN'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.playAgainBtn, { backgroundColor: isDarkMode ? '#334155' : '#94a3b8', flex: 1, paddingVertical: 14 }]} onPress={() => setGameMode('menu')}>
                            <Home color="#fff" size={20} />
                            <Text style={[styles.playAgainText, { fontSize: 16 }]}>MENU</Text>
                        </TouchableOpacity>
                      </View>
                  </View>
              </View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', userSelect: 'none' },
  containerLight: { backgroundColor: '#f8fafc' },
  header: { 
    paddingHorizontal: 15, 
    paddingVertical: 10, 
    flexDirection: 'row', 
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b'
  },
  headerLight: { backgroundColor: '#fff', borderBottomColor: '#e2e8f0' },
  title: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  titleLight: { color: '#1e293b' },
  headerStats: { 
    flexDirection: 'row', 
    backgroundColor: '#1e293b', 
    borderRadius: 12, 
    padding: 6,
    alignItems: 'center'
  },
  headerStatsLight: { backgroundColor: '#f1f5f9' },
  statBox: { paddingHorizontal: 8, alignItems: 'center' },
  statLabel: { fontSize: 8, color: '#64748b', fontWeight: 'bold', marginBottom: 2 },
  statLabelLight: { color: '#94a3b8' },
  statValue: { fontSize: 16, fontWeight: '900', color: '#f8fafc' },
  statValueLight: { color: '#1e293b' },
  statTotal: { fontSize: 10, color: '#475569', marginLeft: 2 },
  statDivider: { width: 1, height: 20, marginHorizontal: 4 },
  refreshBtn: { 
    backgroundColor: '#1e293b', 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  refreshBtnLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  countryCard: { 
    backgroundColor: '#1e293b', 
    borderRadius: 20, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  countryCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0', shadowOpacity: 0.05 },
  countryLabel: { fontSize: 10, fontWeight: 'bold', color: '#38bdf8', letterSpacing: 1 },
  countryFlag: { borderRadius: 8 },
  countryName: { fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  countryNameLight: { color: '#1e293b' },
  instruction: { color: '#64748b', fontWeight: '500' },
  themesGrid: { width: '100%' },
  themeCard: { 
    backgroundColor: '#1e293b', 
    flexDirection: 'row', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  themeCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  usedThemeCard: { opacity: 0.4, backgroundColor: '#0f172a' },
  usedThemeCardLight: { opacity: 0.4, backgroundColor: '#f8fafc' },
  themeLabel: { fontWeight: 'bold', color: '#f8fafc' },
  themeLabelLight: { color: '#334155' },
  emoji: { marginRight: 10 },
  selectionInfo: { alignItems: 'flex-end' },
  selectionCountry: { color: '#64748b', fontWeight: 'bold' },
  selectionRank: { fontWeight: '900' },
  winCard: { backgroundColor: '#1e293b', borderRadius: 24, padding: 25, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  winCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  winTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc', marginTop: 15, marginBottom: 20 },
  winTitleLight: { color: '#1e293b' },
  summaryTotal: { alignItems: 'center', marginBottom: 30 },
  summaryTable: { width: '100%', gap: 10 },
  summaryHeader: { flexDirection: 'row', paddingHorizontal: 10, marginBottom: 5 },
  summaryHeaderText: { fontSize: 10, fontWeight: '900', color: '#475569' },
  summaryRow: { flexDirection: 'row', backgroundColor: '#0f172a', padding: 12, borderRadius: 12, alignItems: 'center' },
  summaryRowLight: { backgroundColor: '#f8fafc' },
  rowThemeLabel: { fontSize: 13, fontWeight: 'bold', color: '#f8fafc' },
  rowThemeLabelLight: { color: '#1e293b' },
  rowCountryOptimal: { fontSize: 10, color: '#475569' },
  rowRank: { fontSize: 16, fontWeight: '900' },
  rowRankOptimal: { fontSize: 10, color: '#475569' },
  playAgainBtn: { backgroundColor: '#10b981', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 30, width: '100%', justifyContent: 'center' },
  playAgainText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});