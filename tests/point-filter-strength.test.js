const test = require('node:test');
const assert = require('node:assert/strict');
const { thresholdForStrength, strengthLevelForPreset, retainedIndices } = require('../dist/point-filter.js');

test('maps the 1–100 filter control monotonically to neighbour thresholds', () => {
  const thresholds = Array.from({ length: 100 }, (_, index) => thresholdForStrength(index + 1));
  assert.equal(thresholds[0], 1);
  assert.equal(thresholds[99], 10);
  assert.ok(thresholds.every((value, index) => index === 0 || value >= thresholds[index - 1]));
});

test('maps the three quick presets onto the continuous strength control', () => {
  assert.deepEqual({
    conservative: strengthLevelForPreset('conservative'),
    standard: strengthLevelForPreset('standard'),
    strong: strengthLevelForPreset('strong'),
  }, { conservative: 12, standard: 23, strong: 45 });
  assert.equal(thresholdForStrength(strengthLevelForPreset('standard')), 3);
});

test('increasing filter strength never increases the retained point count', () => {
  const positions = {
    count: 15,
    array: new Float32Array(Array.from({ length: 15 }, (_, index) => [index, 0, 0]).flat()),
  };
  const levels = [1, 12, 23, 34, 45, 56, 67, 78, 89, 100];
  const retainedCounts = levels.map((level) => retainedIndices(positions, level).indices.length);

  assert.ok(retainedCounts.every((count, index) => index === 0 || count <= retainedCounts[index - 1]));
  assert.ok(retainedCounts[0] > retainedCounts.at(-1));
});
