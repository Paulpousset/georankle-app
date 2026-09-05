import type { Language, LocalizedLabel } from '../types';
import { tr } from './';

/**
 * Human-readable explanations for each ranking theme, keyed by theme id.
 * Shown in the "theme info" modal.
 */
const THEME_DESCRIPTIONS: Record<string, LocalizedLabel> = {
  homicide_rate: {
    fr: "Nombre d'homicides volontaires pour 100 000 habitants. Un rang élevé (#1) indique le pays le plus touché par la violence létale.",
    en: 'Number of intentional homicides per 100,000 inhabitants. A high rank (#1) is the country most affected by lethal violence.',
  },
  population_density: {
    fr: "Nombre d'habitants par km². Le #1 est le pays le plus densément peuplé.",
    en: 'Number of inhabitants per km². #1 is the most densely populated country.',
  },
  gdp_growth: {
    fr: 'Croissance annuelle du PIB en %. Le #1 a l’économie qui croît le plus vite.',
    en: 'Annual GDP growth in %. #1 has the fastest-growing economy.',
  },
  agricultural_land: {
    fr: 'Part du territoire dédiée à l’agriculture. Le #1 est le pays le plus agricole.',
    en: 'Share of land used for agriculture. #1 is the most agricultural country.',
  },
  health_expenditure: {
    fr: 'Dépenses de santé en pourcentage du PIB. Le #1 consacre la plus grande part de ses richesses à la santé.',
    en: 'Health spending as a percentage of GDP. #1 spends the largest share of its wealth on health.',
  },
  alcohol_consumption: {
    fr: "Litres d'alcool pur consommés par habitant et par an. Le #1 est le plus gros consommateur.",
    en: 'Litres of pure alcohol consumed per person per year. #1 is the heaviest-drinking country.',
  },
  mobile_subscriptions: {
    fr: 'Abonnements mobiles pour 100 habitants (peut dépasser 100). Le #1 est le pays le plus équipé.',
    en: 'Mobile subscriptions per 100 inhabitants (can exceed 100). #1 is the most mobile-equipped country.',
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
    fr: "PIB divisé par le nombre d'habitants. Le #1 est le pays où les habitants sont les plus riches en moyenne.",
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
    fr: "Nombre moyen d'années qu'un nouveau-né peut espérer vivre. Le #1 est le pays où l'on vit le plus longtemps.",
    en: 'Average number of years a newborn is expected to live. #1 is the country with the longest life expectancy.',
  },
  population: {
    fr: "Nombre total d'habitants. Le #1 est le pays le plus peuplé au monde.",
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
    fr: "Pourcentage de la population adulte considérée comme obèse. Le #1 est le pays avec le plus fort taux d'obésité.",
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
    fr: "Dépenses militaires en pourcentage du PIB. Le #1 consacre la plus grande part de ses richesses à l'armée.",
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
  fifa_ranking: {
    fr: "Points au classement mondial FIFA de football masculin. Les nations britanniques jouant séparément, le Royaume-Uni est représenté par l'Angleterre. Le #1 est la meilleure sélection du monde.",
    en: 'Points in the FIFA men’s world football ranking. British nations play separately, so the United Kingdom is represented by England. #1 is the best national team in the world.',
  },
  fiba_ranking: {
    fr: 'Points au classement mondial FIBA de basket-ball masculin. Le #1 est la meilleure nation de basket.',
    en: 'Points in the FIBA men’s basketball world ranking. #1 is the best basketball nation.',
  },
  rugby_ranking: {
    fr: "Points de rating au classement World Rugby masculin. Les nations britanniques jouant séparément, le Royaume-Uni est représenté par l'Angleterre. Le #1 est la meilleure nation de rugby à XV.",
    en: 'Rating points in the World Rugby men’s ranking. British nations play separately, so the United Kingdom is represented by England. #1 is the best rugby union nation.',
  },
  olympic_medals: {
    fr: "Total des médailles olympiques (Jeux d'été et d'hiver) remportées depuis 1896. Le #1 est le pays le plus médaillé de l'histoire.",
    en: 'Total Olympic medals (Summer and Winter Games) won since 1896. #1 is the most decorated country in history.',
  },
  world_heritage: {
    fr: "Nombre de sites inscrits au patrimoine mondial de l'UNESCO. Le #1 est le pays qui en compte le plus.",
    en: 'Number of sites inscribed on the UNESCO World Heritage List. #1 is the country with the most sites.',
  },
  highest_point: {
    fr: 'Altitude du point culminant du pays, en mètres. Le #1 abrite le plus haut sommet du monde.',
    en: 'Elevation of the country’s highest point, in metres. #1 is home to the world’s highest summit.',
  },
  avg_temperature: {
    fr: 'Température annuelle moyenne du pays en °C (moyennes 1991-2020). Le #1 est le pays le plus chaud.',
    en: 'Average yearly temperature in °C (1991-2020 averages). #1 is the hottest country.',
  },
  armed_forces: {
    fr: "Nombre de militaires en activité. Le #1 possède la plus grande armée du monde en effectifs.",
    en: 'Number of active military personnel. #1 has the largest armed forces in the world by headcount.',
  },
  air_passengers: {
    fr: 'Nombre de passagers transportés chaque année par les compagnies aériennes du pays. Le #1 a le trafic aérien le plus important.',
    en: 'Number of passengers carried each year by the country’s airlines. #1 has the busiest air traffic.',
  },
  women_parliament: {
    fr: 'Pourcentage des sièges du parlement national occupés par des femmes. Le #1 a le parlement le plus paritaire.',
    en: 'Percentage of national parliament seats held by women. #1 has the most gender-balanced parliament.',
  },
  rd_expenditure: {
    fr: 'Dépenses de recherche et développement en pourcentage du PIB. Le #1 investit le plus dans la recherche.',
    en: 'Research and development spending as a percentage of GDP. #1 invests the most in research.',
  },
  electric_consumption: {
    fr: "Consommation d'électricité par habitant, en kWh par an. Le #1 est le plus gros consommateur par personne.",
    en: 'Electricity consumption per capita, in kWh per year. #1 is the biggest consumer per person.',
  },
};

/** Returns the localized description for a theme, or a fallback string. */
export function getThemeDescription(themeId: string, language: Language): string {
  const description = THEME_DESCRIPTIONS[themeId];
  if (description) return tr(language, description.fr, description.en);
  return tr(language, 'Informations non disponibles.', 'Information not available.');
}

/**
 * Spoiler-free version of the theme description: keeps only the sentence that
 * explains what the metric measures, dropping the "#1 is ..." sentence that
 * would reveal the ranking leader. Used in the « Plus ou Moins » theme card.
 */
export function getThemeShortDescription(themeId: string, language: Language): string {
  const full = getThemeDescription(themeId, language);
  const kept = full.split('. ').filter((sentence) => !sentence.includes('#1'));
  if (kept.length === 0) return full;
  const out = kept.join('. ').trim();
  return /[.!?]$/.test(out) ? out : `${out}.`;
}
