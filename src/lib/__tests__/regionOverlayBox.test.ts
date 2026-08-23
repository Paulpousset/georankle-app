import { regionOverlayBox } from '../globe3d/buildEarthHtml';
import type { WorldPolygon } from '../globe3d/buildEarthHtml';

/** One square polygon, given as [lng, lat] rings like the region data. */
const square = (id: string, lng0: number, lat0: number, size: number): WorldPolygon => ({
  id,
  r: [[
    [lng0, lat0],
    [lng0 + size, lat0],
    [lng0 + size, lat0 + size],
    [lng0, lat0 + size],
  ]],
});

describe('regionOverlayBox', () => {
  it('wraps the polygons with a small margin', () => {
    const box = regionOverlayBox({ clat: 46, clng: 2 }, [square('a', 0, 44, 4)]);
    expect(box).not.toBeNull();
    // 4° span + 6% margin on each side, and never inside the polygons.
    expect(box!.lng0).toBeLessThan(0);
    expect(box!.lng1).toBeGreaterThan(4);
    expect(box!.lat0).toBeLessThan(44);
    expect(box!.lat1).toBeGreaterThan(48);
    expect(box!.lng1 - box!.lng0).toBeLessThan(5);
  });

  it('yields one box for a country straddling the antimeridian', () => {
    const box = regionOverlayBox({ clat: -17, clng: 179 }, [
      square('west', 177, -18, 1),
      square('east', -179, -18, 1), // = 181° once unwrapped around the centre
    ]);
    expect(box).not.toBeNull();
    // Unwrapped, not split: a naive min/max would give a 358°-wide box.
    expect(box!.lng1 - box!.lng0).toBeLessThan(6);
    expect(box!.lng1).toBeGreaterThan(180);
  });

  it('still boxes a continent-wide country (Alaska + Hawaii + the mainland)', () => {
    const box = regionOverlayBox({ clat: 40, clng: -120 }, [
      square('ak', -160, 60, 5),
      square('hi', -157, 20, 2),
      square('me', -70, 44, 2),
    ]);
    // Wide, but still a quarter of the sphere: worth ~3x the canvas resolution.
    expect(box).not.toBeNull();
    expect(box!.lng1 - box!.lng0).toBeLessThan(120);
  });

  it('falls back to the full-sphere overlay for a globe-spanning set', () => {
    // Metropolitan France + New Caledonia: no patch left to cut out.
    expect(regionOverlayBox({ clat: 10, clng: 60 }, [
      square('fr', 2, 46, 2),
      square('nc', 165, -22, 2),
    ])).toBeNull();
  });

  it('falls back near the poles, where a sphere patch buys nothing', () => {
    expect(regionOverlayBox({ clat: 88, clng: 0 }, [square('p', -1, 87, 2)])).toBeNull();
  });
});
