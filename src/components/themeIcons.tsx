/**
 * Atlas icon per ranking theme (ClassicGame / StreakGame metrics + ThemeInfoModal).
 *
 * Maps each theme id from game_data.json to an on-brand line icon, replacing the
 * emoji that game_data still carries. Use <ThemeIcon id={theme.id} … /> at the
 * render sites; unknown ids render nothing (the emoji field stays as a data fallback).
 */
import React from 'react';
import {
  AtlasPopulation,
  AtlasArea,
  AtlasDensity,
  AtlasCoastline,
  AtlasForest,
  AtlasAgriculture,
  AtlasLeaf,
  AtlasFactory,
  AtlasCoinStack,
  AtlasCoin,
  AtlasBarChart,
  AtlasTrendUp,
  AtlasBriefcase,
  AtlasMedal,
  AtlasLifeExp,
  AtlasBaby,
  AtlasBook,
  AtlasMedical,
  AtlasCapsule,
  AtlasWine,
  AtlasBurger,
  AtlasBrain,
  AtlasShield,
  AtlasSkyline,
  AtlasBulb,
  AtlasGlobe,
  AtlasPhone,
  AtlasPlane,
  AtlasPassport,
  type AtlasIconProps,
} from './AtlasIcons';

type IconComp = React.ComponentType<AtlasIconProps>;

export const THEME_ICONS: Record<string, IconComp> = {
  population: AtlasPopulation,
  area: AtlasArea,
  population_density: AtlasDensity,
  coastline_length: AtlasCoastline,
  forest_area: AtlasForest,
  agricultural_land: AtlasAgriculture,
  renewable_energy: AtlasLeaf,
  co2_emissions_pc: AtlasFactory,
  gdp: AtlasCoinStack,
  gdp_per_capita: AtlasCoin,
  gdp_growth: AtlasBarChart,
  inflation: AtlasTrendUp,
  unemployment_rate: AtlasBriefcase,
  military_expenditure: AtlasMedal,
  life_expectancy: AtlasLifeExp,
  fertility_rate: AtlasBaby,
  literacy_rate: AtlasBook,
  physicians_per_1000: AtlasMedical,
  health_expenditure: AtlasCapsule,
  alcohol_consumption: AtlasWine,
  obesity_rate: AtlasBurger,
  suicide_rate: AtlasBrain,
  homicide_rate: AtlasShield,
  urban_population: AtlasSkyline,
  access_to_electricity: AtlasBulb,
  internet_users: AtlasGlobe,
  mobile_subscriptions: AtlasPhone,
  tourist_arrivals: AtlasPlane,
  passport_power: AtlasPassport,
};

/** Renders the line icon for a ranking theme id (nothing if the id is unknown). */
export function ThemeIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  const Icon = THEME_ICONS[id];
  return Icon ? <Icon color={color} size={size} /> : null;
}
