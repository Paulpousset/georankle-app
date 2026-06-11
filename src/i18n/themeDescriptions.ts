import type { Language, LocalizedLabel } from '../types';

/**
 * Human-readable explanations for each ranking theme, keyed by theme id.
 * Shown in the "theme info" modal.
 */
const THEME_DESCRIPTIONS: Record<string, LocalizedLabel> = {
  prison_population: {
    fr: "Nombre de détenus pour 100 000 habitants. Plus le chiffre est élevé, plus le pays est répressif ou criminalisé.",
    en: 'Number of prisoners per 100,000 inhabitants. Higher values indicate higher incarceration rates.',
  },
  fertility_rate: {
    fr: "Nombre moyen d'enfants par femme. Un chiffre élevé (#1) signifie une natalité forte.",
    en: 'Average number of children per woman. A high number (#1) means a high birth rate.',
  },
  passport_power: {
    fr: 'Nombre de pays accessibles sans visa. Le #1 a le passeport le plus puissant au monde.',
    en: "Number of countries accessible without a visa. #1 has the world's most powerful passport.",
  },
  coastline_length: {
    fr: 'Longueur totale des côtes en km. Le #1 est le pays avec le plus long littoral (Canada).',
    en: 'Total length of the coastline in km. #1 is the country with the longest coastline (Canada).',
  },
  internet_users: {
    fr: 'Pourcentage de la population utilisant Internet. Le #1 est le pays le plus connecté.',
    en: 'Percentage of the population using the Internet. #1 is the most connected country.',
  },
  tourist_arrivals: {
    fr: 'Nombre de touristes internationaux par an. Le #1 est le pays le plus visité au monde.',
    en: 'Number of international tourists per year. #1 is the most visited country in the world.',
  },
  gdp: {
    fr: 'Produit Intérieur Brut global. Le #1 est la plus grande puissance économique mondiale.',
    en: "Gross Domestic Product. #1 is the world's largest economic power.",
  },
  gdp_per_capita: {
    fr: 'PIB divisé par le nombre d\'habitants. Le #1 est le pays où les habitants sont les plus riches en moyenne.',
    en: 'GDP divided by the number of inhabitants. #1 is the country where people are wealthiest on average.',
  },
  inflation: {
    fr: "Hausse générale des prix. Un rang élevé (#1) signifie l'inflation la plus forte (souvent signe de crise).",
    en: 'General increase in prices. A high rank (#1) means the highest inflation (often a sign of crisis).',
  },
  unemployment_rate: {
    fr: 'Pourcentage de la population active sans emploi. Le #1 a le taux de chômage le plus élevé.',
    en: 'Percentage of the labor force without a job. #1 has the highest unemployment rate.',
  },
  literacy_rate: {
    fr: 'Pourcentage de la population sachant lire et écrire. Le #1 est le pays le plus alphabétisé.',
    en: 'Percentage of the population who can read and write. #1 is the most literate country.',
  },
  life_expectancy: {
    fr: 'Nombre moyen d\'années qu\'un nouveau-né peut espérer vivre. Le #1 est le pays où l\'on vit le plus longtemps.',
    en: 'Average number of years a newborn is expected to live. #1 is the country with the longest life expectancy.',
  },
  population: {
    fr: 'Nombre total d\'habitants. Le #1 est le pays le plus peuplé au monde.',
    en: 'Total number of inhabitants. #1 is the most populous country in the world.',
  },
  area: {
    fr: 'Superficie totale du territoire en km². Le #1 est le plus grand pays du monde.',
    en: 'Total land area in km². #1 is the largest country in the world.',
  },
  renewable_energy: {
    fr: "Part des énergies renouvelables dans la consommation totale d'énergie. Le #1 est le pays le plus 'vert'.",
    en: "Share of renewable energy in total energy consumption. #1 is the 'greenest' country.",
  },
  suicide_rate: {
    fr: 'Nombre de suicides pour 100 000 habitants. Un rang élevé (#1) indique un taux de mortalité par suicide important.',
    en: 'Number of suicides per 100,000 people. A high rank (#1) indicates a significant suicide rate.',
  },
  obesity_rate: {
    fr: 'Pourcentage de la population adulte considérée comme obèse. Le #1 est le pays avec le plus fort taux d\'obésité.',
    en: 'Percentage of the adult population considered obese. #1 is the country with the highest obesity rate.',
  },
  access_to_electricity: {
    fr: "Pourcentage de la population ayant accès à l'électricité. Le #1 a une couverture électrique totale.",
    en: 'Percentage of the population with access to electricity. #1 has total electricity coverage.',
  },
  co2_emissions_pc: {
    fr: 'Émissions de dioxyde de carbone par habitant. Le #1 est le pays qui pollue le plus par personne.',
    en: 'Carbon dioxide emissions per capita. #1 is the country that pollutes the most per person.',
  },
  physicians_per_1000: {
    fr: 'Nombre de médecins pour 1000 habitants (similaire à doctors_per_1000). Le #1 a la meilleure couverture médicale.',
    en: 'Number of doctors per 1000 inhabitants. #1 has the best medical coverage.',
  },
  military_expenditure: {
    fr: 'Dépenses militaires en pourcentage du PIB. Le #1 consacre la plus grande part de ses richesses à l\'armée.',
    en: 'Military expenditure as a percentage of GDP. #1 spends the largest share of its wealth on the military.',
  },
  forest_area: {
    fr: 'Pourcentage du territoire couvert par la forêt. Le #1 est le pays le plus boisé.',
    en: 'Percentage of land area covered by forest. #1 is the most forested country.',
  },
  urban_population: {
    fr: 'Pourcentage de la population vivant en zone urbaine. Le #1 est le pays le plus urbanisé.',
    en: 'Percentage of the population living in urban areas. #1 is the most urbanized country.',
  },
};

/** Returns the localized description for a theme, or a fallback string. */
export function getThemeDescription(themeId: string, language: Language): string {
  const description = THEME_DESCRIPTIONS[themeId];
  if (description) return language === 'fr' ? description.fr : description.en;
  return language === 'fr' ? 'Informations non disponibles.' : 'Information not available.';
}
