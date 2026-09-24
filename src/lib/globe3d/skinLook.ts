/**
 * Per-planet adjustments to the shared Cartoon HD material, read by BOTH the
 * gameplay globes (globeSkin → buildEarthHtml) and the profile/shop preview
 * (buildAvatarHtml), so a planet looks the same everywhere.
 *
 *  - specK: sun glint multiplier (1 = the rig's). A white or dusty planet under
 *    the specular dot burns out: Ice lost its borders to it (Paul, 24/09/2026),
 *    and on Mars it painted a pink blob over West Africa.
 *  - val: brightness multiplier of the texture.
 *  - rim: back-light colour. The rig's cyan is an Earth sky; on Mars it read as
 *    a blue rind around a desert planet.
 */
export interface SkinLook {
  specK?: number;
  val?: number;
  rim?: string;
}

export const SKIN_LOOK: Record<string, SkinLook> = {
  ice: { specK: 0.15, val: 0.93 },
  mars: { specK: 0.2, rim: '#ffb27a' },
};
