#!/usr/bin/env python3
"""Rafraîchit les données pays du jeu depuis l'API de la Banque mondiale.

Met à jour `assets/game_data.json` (valeur + libellés figés `display_fr` /
`display_en`) pour chaque thème adossé à un indicateur de la Banque mondiale
(World Development Indicators), recalcule la densité, et reporte la population
dans `assets/countries_stats.json`.

Pour chaque pays on prend la valeur la plus récente disponible (`mrnev=1`).
Les thèmes « Static » (classements sportifs, passeport, UNESCO…) et ceux qui
ne viennent pas de la Banque mondiale ne sont pas touchés.

Les libellés sont recomposés avec le gabarit déjà présent dans le fichier
(emoji, libellé, unité, nombre de décimales) : le script vérifie d'abord qu'il
sait reproduire à l'identique tous les libellés existants.

Usage :
    python3 scripts/build_game_data.py            # écrit les fichiers
    python3 scripts/build_game_data.py --dry-run  # rapport seulement

Réseau requis : api.worldbank.org.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME_DATA = ROOT / "assets" / "game_data.json"
COUNTRIES_STATS = ROOT / "assets" / "countries_stats.json"
REPORT = ROOT / "assets" / "game_data_sources.json"

# Thème du jeu -> indicateur WDI de la Banque mondiale.
# La superficie n'est volontairement pas rafraîchie (elle ne bouge pas et la
# source actuelle diffère de la Banque mondiale pour les micro-États). Le taux
# d'obésité ne vient pas de la Banque mondiale (OMS) : non rafraîchi ici.
INDICATORS: dict[str, str] = {
    "population": "SP.POP.TOTL",
    "forest_area": "AG.LND.FRST.ZS",
    "agricultural_land": "AG.LND.AGRI.ZS",
    "renewable_energy": "EG.FEC.RNEW.ZS",
    "co2_emissions_pc": "EN.GHG.CO2.PC.CE.AR5",
    "gdp": "NY.GDP.MKTP.CD",
    "gdp_per_capita": "NY.GDP.PCAP.CD",
    "gdp_growth": "NY.GDP.MKTP.KD.ZG",
    "inflation": "FP.CPI.TOTL.ZG",
    "unemployment_rate": "SL.UEM.TOTL.ZS",
    "military_expenditure": "MS.MIL.XPND.GD.ZS",
    "life_expectancy": "SP.DYN.LE00.IN",
    "fertility_rate": "SP.DYN.TFRT.IN",
    "literacy_rate": "SE.ADT.LITR.ZS",
    "physicians_per_1000": "SH.MED.PHYS.ZS",
    "health_expenditure": "SH.XPD.CHEX.GD.ZS",
    "alcohol_consumption": "SH.ALC.PCAP.LI",
    "suicide_rate": "SH.STA.SUIC.P5",
    "homicide_rate": "VC.IHR.PSRC.P5",
    "urban_population": "SP.URB.TOTL.IN.ZS",
    "access_to_electricity": "EG.ELC.ACCS.ZS",
    "internet_users": "IT.NET.USER.ZS",
    "mobile_subscriptions": "IT.CEL.SETS.P2",
    "tourist_arrivals": "ST.INT.ARVL",
    "armed_forces": "MS.MIL.TOTL.P1",
    "air_passengers": "IS.AIR.PSGR",
    "women_parliament": "SG.GEN.PARL.ZS",
    "rd_expenditure": "GB.XPD.RSDV.GD.ZS",
    "electric_consumption": "EG.USE.ELEC.KH.PC",
}

# Écart relatif au-delà duquel une nouvelle valeur est signalée dans le rapport
# (pour repérer un mauvais indicateur, pas pour bloquer).
SUSPICIOUS_RATIO = 3.0

NUM_RE = re.compile(r"^(?P<pre>\$?)(?P<num>-?\d{1,3}(?: \d{3})*(?:\.(?P<dec>\d+))?)(?P<post>.*)$")


def fetch_indicator(code: str) -> dict[str, tuple[float, int]]:
    """{cca3: (valeur, année)} — dernière valeur non vide par pays."""
    url = (
        f"https://api.worldbank.org/v2/country/all/indicator/{code}"
        "?format=json&mrnev=1&per_page=20000"
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                payload = json.load(resp)
            break
        except Exception as exc:  # réseau capricieux : on réessaie
            if attempt == 3:
                raise RuntimeError(f"{code}: {exc}") from exc
            time.sleep(2 ** (attempt + 1))
    if not isinstance(payload, list) or len(payload) < 2 or payload[1] is None:
        raise RuntimeError(f"{code}: réponse inattendue {str(payload)[:200]}")
    out: dict[str, tuple[float, int]] = {}
    for row in payload[1]:
        iso3 = row.get("countryiso3code")
        if iso3 and row.get("value") is not None:
            out[iso3] = (float(row["value"]), int(row["date"]))
    return out


def split_display(display: str) -> tuple[str, str, int, str]:
    """« 👥 Population : 42 647 492 hab. » -> (« 👥 Population : », « », 0, « hab. »)."""
    head, sep, tail = display.rpartition(" : ")
    m = NUM_RE.match(tail)
    if not sep or not m:
        raise ValueError(f"libellé illisible : {display!r}")
    return head + sep + m["pre"], m["post"], len(m["dec"] or ""), m["num"]


def fmt(value: float, decimals: int) -> str:
    return f"{value:,.{decimals}f}".replace(",", " ")


def learn_templates(data: dict) -> dict[str, dict]:
    """Gabarit (préfixe, suffixe, décimales) de chaque thème, appris du fichier."""
    templates: dict[str, dict] = {}
    for country in data["countries"]:
        for theme, datum in country["data"].items():
            if theme in templates:
                continue
            fr = split_display(datum["display_fr"])
            en = split_display(datum["display_en"])
            templates[theme] = {
                "fr": (fr[0], fr[1]),
                "en": (en[0], en[1]),
                "decimals": fr[2],
            }
    return templates


def render(tpl: dict, value: float) -> tuple[str, str]:
    num = fmt(value, tpl["decimals"])
    return (
        f"{tpl['fr'][0]}{num}{tpl['fr'][1]}",
        f"{tpl['en'][0]}{num}{tpl['en'][1]}",
    )


def check_templates(data: dict, templates: dict) -> int:
    """Re-rend chaque libellé existant ; renvoie le nombre d'écarts."""
    mismatches = 0
    for country in data["countries"]:
        for theme, datum in country["data"].items():
            if theme not in INDICATORS and theme != "population_density":
                continue  # thèmes statiques jamais re-rendus (pluriels gérés à la main)
            fr, en = render(templates[theme], datum["value"])
            if (fr, en) != (datum["display_fr"], datum["display_en"]):
                mismatches += 1
                if mismatches <= 10:
                    print(f"  écart {country['cca3']}/{theme}: {datum['display_en']!r} vs {en!r}")
    return mismatches


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check-only", action="store_true",
                        help="vérifie seulement le rendu des libellés, sans réseau")
    args = parser.parse_args()

    data = json.loads(GAME_DATA.read_text(encoding="utf-8"))
    stats = json.loads(COUNTRIES_STATS.read_text(encoding="utf-8"))
    templates = learn_templates(data)

    bad = check_templates(data, templates)
    print(f"Rendu des libellés existants : {bad} écart(s)")
    if args.check_only:
        return 0 if bad == 0 else 1
    if bad:
        print("Le gabarit ne reproduit pas les libellés actuels, abandon.")
        return 1

    fetched: dict[str, dict[str, tuple[float, int]]] = {}
    for theme, code in INDICATORS.items():
        fetched[theme] = fetch_indicator(code)
        print(f"  {theme:24s} {code:22s} {len(fetched[theme])} pays")

    report: dict[str, dict] = {}
    for theme, code in INDICATORS.items():
        values = fetched[theme]
        tpl = templates[theme]
        updated = added = missing = 0
        years: dict[int, int] = {}
        suspicious: list[str] = []
        for country in data["countries"]:
            iso = country["cca3"]
            if iso not in values:
                if theme in country["data"]:
                    missing += 1  # pas de donnée Banque mondiale : on garde l'ancienne
                continue
            value, year = values[iso]
            years[year] = years.get(year, 0) + 1
            old = country["data"].get(theme)
            if old and old["value"] and value:
                ratio = max(abs(value / old["value"]), abs(old["value"] / value))
                if ratio > SUSPICIOUS_RATIO:
                    suspicious.append(f"{iso}: {old['value']:.4g} -> {value:.4g}")
            if old is None:
                added += 1
            elif old["value"] != value:
                updated += 1
            fr, en = render(tpl, value)
            country["data"][theme] = {"value": value, "display_fr": fr, "display_en": en}
        report[theme] = {
            "indicator": code,
            "source": "World Bank WDI",
            "years": dict(sorted(years.items())),
            "updated": updated,
            "added": added,
            "kept_old_value": missing,
            "suspicious": suspicious,
        }

    # Densité dérivée = population / superficie.
    dens_tpl = templates["population_density"]
    for country in data["countries"]:
        pop = country["data"].get("population", {}).get("value")
        area = country["data"].get("area", {}).get("value")
        if pop and area:
            value = pop / area
            fr, en = render(dens_tpl, value)
            country["data"]["population_density"] = {
                "value": value, "display_fr": fr, "display_en": en,
            }

    # Population et superficie reportées dans countries_stats.json.
    by_iso = {c["cca3"]: c for c in data["countries"]}
    for entry in stats:
        src = by_iso.get(entry["cca3"], {}).get("data", {})
        for key in ("population",):
            if key in src:
                v = src[key]["value"]
                entry[key] = int(round(v))

    for theme, r in report.items():
        print(f"{theme:24s} maj={r['updated']:3d} ajout={r['added']:2d} "
              f"gardé={r['kept_old_value']:2d} années={r['years']}")
        for s in r["suspicious"][:5]:
            print(f"    ⚠ {s}")

    if args.dry_run:
        return 0
    GAME_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    COUNTRIES_STATS.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Fichiers écrits.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
