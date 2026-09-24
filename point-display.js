(function (root, factory) {
  const display = factory();
  if (typeof module === 'object' && module.exports) module.exports = display;
  else root.TaihePointDisplay = display;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DISTANCE_PALETTE = [
    [0.08, 0.24, 0.98],
    [0.00, 0.82, 1.00],
    [0.04, 0.88, 0.20],
    [1.00, 0.84, 0.04],
  ];

  function estimateSpacing(positions, requestedSamples) {
    const count = positions && Number.isFinite(positions.count)
      ? Math.floor(positions.count)
      : 0;
    if (!positions || !positions.array || count < 2) return 0;

    const sampleCount = Math.min(
      count,
      Math.max(1, Math.floor(requestedSamples || 96)),
    );
    const nearestDistances = [];

    for (let sample = 0; sample < sampleCount; sample += 1) {
      const pointIndex = Math.floor((sample + 0.5) * count / sampleCount);
      const offset = pointIndex * 3;
      const x = positions.array[offset];
      const y = positions.array[offset + 1];
      const z = positions.array[offset + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      let nearestSquared = Infinity;
      for (let other = 0; other < count; other += 1) {
        if (other === pointIndex) continue;
        const otherOffset = other * 3;
        const dx = x - positions.array[otherOffset];
        const dy = y - positions.array[otherOffset + 1];
        const dz = z - positions.array[otherOffset + 2];
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared > 0 && distanceSquared < nearestSquared) {
          nearestSquared = distanceSquared;
        }
      }

      if (Number.isFinite(nearestSquared)) nearestDistances.push(Math.sqrt(nearestSquared));
    }

    if (!nearestDistances.length) return 0;
    nearestDistances.sort(function (a, b) { return a - b; });
    return nearestDistances[Math.floor(nearestDistances.length / 2)];
  }

  function percentile(sortedValues, fraction) {
    if (sortedValues.length === 1) return sortedValues[0];
    const position = (sortedValues.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const blend = position - lower;
    return sortedValues[lower] * (1 - blend) + sortedValues[upper] * blend;
  }

  function interpolateColor(normalized) {
    const scaled = Math.min(1, Math.max(0, normalized)) * (DISTANCE_PALETTE.length - 1);
    const segment = Math.min(Math.floor(scaled), DISTANCE_PALETTE.length - 2);
    const blend = scaled - segment;
    return DISTANCE_PALETTE[segment].map(function (channel, index) {
      return channel * (1 - blend) + DISTANCE_PALETTE[segment + 1][index] * blend;
    });
  }

  function distanceColors(positionArray, origin, lowPercentile, highPercentile) {
    const pointCount = Math.floor((positionArray && positionArray.length || 0) / 3);
    const sensor = Array.isArray(origin) && origin.length >= 3 ? origin : [0, 0, 0];
    const distances = new Float64Array(pointCount);
    const sortedDistances = [];

    for (let index = 0; index < pointCount; index += 1) {
      const offset = index * 3;
      const dx = positionArray[offset] - Number(sensor[0] || 0);
      const dy = positionArray[offset + 1] - Number(sensor[1] || 0);
      const dz = positionArray[offset + 2] - Number(sensor[2] || 0);
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distances[index] = distance;
      if (Number.isFinite(distance)) sortedDistances.push(distance);
    }

    const colors = new Float32Array(pointCount * 3);
    if (!sortedDistances.length) {
      return { colors: colors, minDistance: 0, maxDistance: 0 };
    }

    sortedDistances.sort(function (a, b) { return a - b; });
    const low = Number.isFinite(lowPercentile) ? lowPercentile : 0.02;
    const high = Number.isFinite(highPercentile) ? highPercentile : 0.98;
    const minDistance = percentile(sortedDistances, Math.min(1, Math.max(0, low)));
    const maxDistance = percentile(sortedDistances, Math.min(1, Math.max(low, high)));
    const distanceRange = maxDistance - minDistance;

    for (let index = 0; index < pointCount; index += 1) {
      const normalized = distanceRange > 0 && Number.isFinite(distances[index])
        ? Math.min(1, Math.max(0, (distances[index] - minDistance) / distanceRange))
        : 0.5;
      const rgb = interpolateColor(normalized);
      const offset = index * 3;
      colors[offset] = rgb[0];
      colors[offset + 1] = rgb[1];
      colors[offset + 2] = rgb[2];
    }

    return { colors: colors, minDistance: minDistance, maxDistance: maxDistance };
  }

  function pointSizeForSpacing(spacing, multiplier) {
    const safeSpacing = Number.isFinite(spacing) && spacing > 0 ? spacing : 0;
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0.65;
    return Math.max(safeSpacing * safeMultiplier, 0.001);
  }

  return {
    estimateSpacing: estimateSpacing,
    distanceColors: distanceColors,
    pointSizeForSpacing: pointSizeForSpacing,
  };
}));
