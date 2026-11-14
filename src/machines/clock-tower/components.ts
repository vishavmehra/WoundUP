import { createComponent, Types } from '@iwsdk/core';

// Declared in a system-free module so the IWSDK editor can author it, like src/interaction/components.ts.

/**
 * On the entity of the Clock Tower (its object3D holds the installed parts). `ClockTowerSystem` drives the pendulum, the
 * escapement, the hands, the cam and the bell of that object while `powered` is true.
 */
export const ClockTowerRig = createComponent('ClockTowerRig', {
  /**
   * Is the clock running? The game layer writes it: on the workbench `solve(...).status === 'runs'` while the spring has energy;
   * once the tower is placed in the town it stays true (a town machine does not run down, or the hourly bell could never ring).
   */
  powered: { type: Types.Boolean, default: false },
});
