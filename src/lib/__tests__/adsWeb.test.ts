import { railSize } from '../adsWeb';

// The pure sizing policy behind the desktop side rails: content is centered at
// ≤600px, so a rail may only appear when the gutter fits it with room to spare
// — the "never overlaps the game" contract.
describe('railSize', () => {
  it('hides the rails on phone/tablet widths', () => {
    expect(railSize(375, 800)).toBeNull();
    expect(railSize(768, 1024)).toBeNull();
    expect(railSize(1119, 900)).toBeNull();
  });

  it('shows a 160×600 wide skyscraper on laptop widths', () => {
    expect(railSize(1120, 900)).toEqual({ width: 160, height: 600 });
    expect(railSize(1440, 900)).toEqual({ width: 160, height: 600 });
  });

  it('upgrades to a 300×600 half-page on large desktops', () => {
    expect(railSize(1520, 900)).toEqual({ width: 300, height: 600 });
    expect(railSize(2560, 1440)).toEqual({ width: 300, height: 600 });
  });

  it('hides the rails when the viewport is too short for the 600px unit', () => {
    expect(railSize(1920, 659)).toBeNull();
    expect(railSize(1920, 660)).toEqual({ width: 300, height: 600 });
  });
});
