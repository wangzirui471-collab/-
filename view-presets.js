(function (root, factory) {
  const presets = factory();
  if (typeof module === 'object' && module.exports) module.exports = presets;
  if (root) root.TaiheViewPresets = presets;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DIRECTIONS = Object.freeze({
    YU: Object.freeze({ direction: [0, 1, 0], up: [0, 0, 1] }),
    YD: Object.freeze({ direction: [0, -1, 0], up: [0, 0, 1] }),
    XU: Object.freeze({ direction: [1, 0, 0], up: [0, 0, 1] }),
    XD: Object.freeze({ direction: [-1, 0, 0], up: [0, 0, 1] }),
    ZU: Object.freeze({ direction: [0, 0, 1], up: [0, 1, 0] }),
    ZD: Object.freeze({ direction: [0, 0, -1], up: [0, 1, 0] }),
  });

  function cameraPose(name, center, distance) {
    const preset = DIRECTIONS[name];
    if (
      !preset ||
      !Array.isArray(center) ||
      center.length !== 3 ||
      !center.every(Number.isFinite) ||
      !Number.isFinite(distance) ||
      distance <= 0
    ) {
      return null;
    }

    return {
      position: center.map((coordinate, index) => coordinate + preset.direction[index] * distance),
      up: [...preset.up],
    };
  }

  return Object.freeze({ cameraPose });
}));
