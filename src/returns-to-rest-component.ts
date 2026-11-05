import { createComponent } from '@iwsdk/core';

/**
 * Tag: once the player lets go, the object eases back to the pose it had when the scene loaded
 * (INTERACTION_SPEC §7.3: "otherwise return the part to its tray position").
 * Declared in a system-free module so the IWSDK editor can author it.
 */
export const ReturnsToRest = createComponent('ReturnsToRest', {});
