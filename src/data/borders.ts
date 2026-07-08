/**
 * Land-border adjacency between the game's 195 countries (cca3), declared once
 * per pair and expanded symmetrically by src/lib/borders.ts.
 *
 * Validated against countries_stats.json `borders_count` in borders.test.ts:
 * every country's degree here must equal the official count except for a small
 * documented list of gaps caused by entities OUTSIDE the game's country list
 * (Kosovo, Hong Kong/Macao, Gibraltar, Western Sahara) — plus one deliberate
 * gameplay choice: FRANCE IS METROPOLITAN ONLY (no Suriname/Brazil edges via
 * French Guiana), mirroring the Silhouette mode which also crops far
 * territories.
 */

/** 'AAA-BBB' pairs, each land border listed exactly once. */
export const BORDER_PAIRS: string[] = (
  // Europe
  'AND-FRA AND-ESP MCO-FRA LIE-AUT LIE-CHE SMR-ITA VAT-ITA PRT-ESP ESP-FRA ESP-MAR ' +
  'FRA-BEL FRA-DEU FRA-ITA FRA-LUX FRA-CHE BEL-DEU BEL-LUX BEL-NLD NLD-DEU LUX-DEU ' +
  'DEU-AUT DEU-CZE DEU-DNK DEU-POL DEU-CHE CHE-AUT CHE-ITA AUT-CZE AUT-HUN AUT-ITA ' +
  'AUT-SVK AUT-SVN ITA-SVN NOR-FIN NOR-SWE NOR-RUS SWE-FIN FIN-RUS GBR-IRL ' +
  'POL-BLR POL-CZE POL-LTU POL-RUS POL-SVK POL-UKR CZE-SVK SVK-HUN SVK-UKR ' +
  'HUN-HRV HUN-ROU HUN-SRB HUN-SVN HUN-UKR SVN-HRV HRV-BIH HRV-MNE HRV-SRB ' +
  'BIH-MNE BIH-SRB MNE-ALB MNE-SRB SRB-BGR SRB-MKD SRB-ROU ALB-GRC ALB-MKD ' +
  'MKD-BGR MKD-GRC GRC-BGR GRC-TUR BGR-ROU BGR-TUR ROU-MDA ROU-UKR MDA-UKR ' +
  'UKR-BLR UKR-RUS BLR-LVA BLR-LTU BLR-RUS LTU-LVA LTU-RUS LVA-EST LVA-RUS EST-RUS ' +
  // Middle East & Caucasus
  'TUR-ARM TUR-AZE TUR-GEO TUR-IRN TUR-IRQ TUR-SYR GEO-ARM GEO-AZE GEO-RUS ' +
  'ARM-AZE ARM-IRN AZE-IRN AZE-RUS SYR-IRQ SYR-ISR SYR-JOR SYR-LBN LBN-ISR ' +
  'ISR-EGY ISR-JOR ISR-PSE PSE-EGY PSE-JOR JOR-IRQ JOR-SAU IRQ-IRN IRQ-KWT IRQ-SAU ' +
  'IRN-AFG IRN-PAK IRN-TKM KWT-SAU SAU-OMN SAU-QAT SAU-ARE SAU-YEM ARE-OMN OMN-YEM ' +
  // Central / South / East Asia
  'KAZ-CHN KAZ-KGZ KAZ-RUS KAZ-TKM KAZ-UZB UZB-AFG UZB-KGZ UZB-TJK UZB-TKM ' +
  'TKM-AFG KGZ-CHN KGZ-TJK TJK-AFG TJK-CHN AFG-CHN AFG-PAK PAK-CHN PAK-IND ' +
  'IND-BGD IND-BTN IND-CHN IND-MMR IND-NPL NPL-CHN BTN-CHN BGD-MMR ' +
  'CHN-LAO CHN-MNG CHN-MMR CHN-PRK CHN-RUS CHN-VNM MNG-RUS PRK-KOR PRK-RUS ' +
  // South-East Asia & Oceania
  'MMR-LAO MMR-THA THA-KHM THA-LAO THA-MYS LAO-KHM LAO-VNM VNM-KHM MYS-BRN MYS-IDN ' +
  'IDN-PNG IDN-TLS ' +
  // Africa — MAR-MRT is deliberate: Western Sahara is not in the country
  // list, so Morocco is treated as reaching Mauritania through it (the Travle
  // convention; without this edge players hit an invisible hole in the map).
  'MAR-DZA MAR-MRT DZA-LBY DZA-MLI DZA-MRT DZA-NER DZA-TUN TUN-LBY ' +
  'LBY-TCD LBY-EGY LBY-NER LBY-SDN EGY-SDN SDN-CAF SDN-TCD SDN-ERI SDN-ETH SDN-SSD ' +
  'SSD-CAF SSD-COD SSD-ETH SSD-KEN SSD-UGA ERI-DJI ERI-ETH DJI-ETH DJI-SOM ' +
  'ETH-KEN ETH-SOM SOM-KEN KEN-TZA KEN-UGA UGA-COD UGA-RWA UGA-TZA RWA-BDI RWA-COD ' +
  'RWA-TZA BDI-COD BDI-TZA TZA-COD TZA-MWI TZA-MOZ TZA-ZMB MOZ-MWI MOZ-ZAF MOZ-SWZ ' +
  'MOZ-ZMB MOZ-ZWE MWI-ZMB ZMB-AGO ZMB-BWA ZMB-COD ZMB-NAM ZMB-ZWE ZWE-BWA ZWE-ZAF ' +
  'BWA-NAM BWA-ZAF NAM-AGO NAM-ZAF ZAF-LSO ZAF-SWZ AGO-COG AGO-COD ' +
  'COD-CAF COD-COG COG-CMR COG-CAF COG-GAB GAB-CMR GAB-GNQ GNQ-CMR CMR-CAF CMR-TCD ' +
  'CMR-NGA CAF-TCD TCD-NER TCD-NGA NER-BEN NER-BFA NER-MLI NER-NGA NGA-BEN ' +
  'BEN-BFA BEN-TGO TGO-BFA TGO-GHA GHA-BFA GHA-CIV CIV-BFA CIV-GIN CIV-LBR CIV-MLI ' +
  'LBR-GIN LBR-SLE SLE-GIN GIN-GNB GIN-MLI GIN-SEN GNB-SEN SEN-GMB SEN-MLI SEN-MRT ' +
  'MRT-MLI MLI-BFA ' +
  // Americas
  'USA-CAN USA-MEX MEX-BLZ MEX-GTM GTM-BLZ GTM-SLV GTM-HND SLV-HND HND-NIC NIC-CRI ' +
  'CRI-PAN PAN-COL COL-BRA COL-ECU COL-PER COL-VEN VEN-BRA VEN-GUY GUY-BRA GUY-SUR ' +
  'SUR-BRA BRA-ARG BRA-BOL BRA-PRY BRA-PER BRA-URY ECU-PER PER-BOL PER-CHL ' +
  'BOL-ARG BOL-CHL BOL-PRY PRY-ARG CHL-ARG ARG-URY HTI-DOM'
).split(' ');

/**
 * Countries whose degree here legitimately differs from the official
 * `borders_count` (entities outside the 195-country list, or the metropolitan
 * France choice). Used by the validation test — any OTHER divergence fails.
 */
export const BORDER_COUNT_EXCEPTIONS: Record<string, { official: number; internal: number; why: string }> = {
  ALB: { official: 4, internal: 3, why: 'Kosovo not in the country list' },
  MKD: { official: 5, internal: 4, why: 'Kosovo not in the country list' },
  MNE: { official: 5, internal: 4, why: 'Kosovo not in the country list' },
  SRB: { official: 8, internal: 7, why: 'Kosovo not in the country list' },
  CHN: { official: 16, internal: 14, why: 'Hong Kong & Macao not in the country list' },
  ESP: { official: 5, internal: 4, why: 'Gibraltar not in the country list' },
  MAR: { official: 3, internal: 3, why: 'Western Sahara absent → MAR-MRT bridge replaces the ESH edge' },
  DZA: { official: 7, internal: 6, why: 'Western Sahara not in the country list' },
  MRT: { official: 4, internal: 4, why: 'Western Sahara absent → MAR-MRT bridge replaces the ESH edge' },
  BRA: { official: 10, internal: 9, why: 'France is metropolitan-only (French Guiana cropped)' },
  SUR: { official: 3, internal: 2, why: 'France is metropolitan-only (French Guiana cropped)' },
};
