const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateSpacing, distanceColors, pointSizeForSpacing } = require('../dist/point-display.js');

test('estimates median nearest-neighbour spacing from a regular point sample', () => {
  const positions = {
    count: 6,
    array: new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      5, 0, 0, 6, 0, 0, 5, 1, 0,
    ]),
  };
  assert.equal(estimateSpacing(positions, 6), 1);
});

test('maps sensor distance into a varying near-to-far palette and clips outliers', () => {
  const radii = Array.from({ length: 101 }, (_, index) => index + 1);
  radii.push(10000);
  const positions = new Float32Array(radii.flatMap((radius) => [radius, 0, 0]));
  const result = distanceColors(positions, [0, 0, 0]);

  assert.equal(result.colors.length, positions.length);
  assert.ok(result.maxDistance < 10000);
  assert.ok(result.minDistance > 1);
  assert.notDeepEqual(Array.from(result.colors.slice(0, 3)), Array.from(result.colors.slice(150, 153)));
  assert.deepEqual(Array.from(result.colors.slice(-3)), Array.from(result.colors.slice(297, 300)));
});

test('uses a finite middle color when distances have no range', () => {
  const result = distanceColors(new Float32Array([1, 2, 3, 1, 2, 3]), [0, 0, 0]);
  assert.ok(Array.from(result.colors).every(Number.isFinite));
  assert.deepEqual(Array.from(result.colors.slice(0, 3)), Array.from(result.colors.slice(3, 6)));
});

test('scales point diameter to estimated spacing and multiplier', () => {
  assert.equal(pointSizeForSpacing(0.00424, 0.65), 0.002756);
  assert.equal(pointSizeForSpacing(0, 0.65), 0.001);
});
