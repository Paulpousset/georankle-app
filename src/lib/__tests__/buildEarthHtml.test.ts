import {
  buildBordersEarthHtml,
  buildFindEarthHtml,
  buildMenuEarthHtml,
  buildRegionEarthHtml,
  type WorldPolygon,
} from '../globe3d/buildEarthHtml';

const pal = {
  bg: '#fff', rim: '#000', landF: '#eee', landS: '#333',
  hovF: '#ddd', hovS: '#222', selF: '#ccc', selS: '#111',
  okF: '#0f0', okS: '#0a0', badF: '#f00', badS: '#a00',
} as never;

const polygons: WorldPolygon[] = [
  { id: 'FRA', r: [[[0, 44], [4, 44], [4, 48], [0, 48]]] },
  { id: 'BRN', r: [[[114, 4], [115, 4], [115, 5], [114, 5]]] },
];

/** The page's own script — everything after the vendored three.js blob. */
function pageScript(html: string): string {
  const blocks = html.split('<script>').slice(1).map((b) => b.split('</script>')[0]);
  return blocks[blocks.length - 1];
}

/**
 * The globe is 1400 lines of JavaScript living inside a template literal: the
 * type-checker never sees it, and a stray paren only shows up as a blank WebView
 * on a device. Parsing it here is the one guard rail it has.
 */
describe('buildEarthHtml', () => {
  const pages: Array<[string, string]> = [
    ['find', buildFindEarthHtml({
      threeSrc: '', isDark: false, pal, polygons,
      dots: [{ cca3: 'BRN', lat: 4.5, lng: 114.5, area: 5770 }],
    })],
    ['borders', buildBordersEarthHtml({
      threeSrc: '', isDark: true, pal, polygons, coords: { FRA: [46, 2] },
    })],
    ['region', buildRegionEarthHtml({
      threeSrc: '', isDark: false, pal, polygons,
      dots: [{ id: 'FRA', lat: 46, lng: 2 }],
      view: { clat: 46, clng: 2, maxAng: 4 },
    })],
    ['menu', buildMenuEarthHtml({ threeSrc: '', isDark: false, pal, polygons })],
  ];

  it.each(pages)('builds a page whose script parses (%s)', (_name, html) => {
    const src = pageScript(html);
    expect(src.length).toBeGreaterThan(1000);
    expect(() => new Function(src)).not.toThrow();
  });

  it('never lets the borders globe draw the countries off the board', () => {
    const src = pageScript(pages[1][1]);
    expect(src).toContain('D.drawBaseLand=false');
  });
});
