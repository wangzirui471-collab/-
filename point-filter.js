(function (root, factory) {
  const filter = factory();
  if (typeof module === 'object' && module.exports) module.exports = filter;
  else root.TaihePointFilter = filter;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAMPLE_COUNT = 48;
  const RADIUS_FACTOR = 2.8;
  const STRENGTH_THRESHOLDS = {
    conservative: 2,
    standard: 3,
    strong: 5,
  };

  function cellKey(x, y, z) {
    return x + ',' + y + ',' + z;
  }

  function estimateSpacing(positions) {
    const count = positions.count;
    const sampleCount = Math.min(SAMPLE_COUNT, count);
    const nearestDistances = [];

    for (let sample = 0; sample < sampleCount; sample += 1) {
      const pointIndex = Math.floor((sample + 0.5) * count / sampleCount);
      const offset = pointIndex * 3;
      const x = positions.array[offset];
      const y = positions.array[offset + 1];
      const z = positions.array[offset + 2];
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

  function retainedIndices(positions, strength) {
    const count = positions.count;
    if (count < 8) {
      return { indices: Uint32Array.from({ length: count }, function (_, index) { return index; }), radius: 0 };
    }

    const spacing = estimateSpacing(positions);
    const radius = spacing * RADIUS_FACTOR;
    if (!Number.isFinite(radius) || radius <= 0) {
      return { indices: Uint32Array.from({ length: count }, function (_, index) { return index; }), radius: 0 };
    }

    const radiusSquared = radius * radius;
    const threshold = STRENGTH_THRESHOLDS[strength] || STRENGTH_THRESHOLDS.conservative;
    const cells = new Map();

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const cx = Math.floor(positions.array[offset] / radius);
      const cy = Math.floor(positions.array[offset + 1] / radius);
      const cz = Math.floor(positions.array[offset + 2] / radius);
      const key = cellKey(cx, cy, cz);
      let bucket = cells.get(key);
      if (!bucket) {
        bucket = [];
        cells.set(key, bucket);
      }
      bucket.push(index);
    }

    const retained = [];
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const x = positions.array[offset];
      const y = positions.array[offset + 1];
      const z = positions.array[offset + 2];
      const cx = Math.floor(x / radius);
      const cy = Math.floor(y / radius);
      const cz = Math.floor(z / radius);
      let neighbors = 0;

      for (let dx = -1; dx <= 1 && neighbors < threshold; dx += 1) {
        for (let dy = -1; dy <= 1 && neighbors < threshold; dy += 1) {
          for (let dz = -1; dz <= 1 && neighbors < threshold; dz += 1) {
            const bucket = cells.get(cellKey(cx + dx, cy + dy, cz + dz));
            if (!bucket) continue;
            for (const other of bucket) {
              if (other === index) continue;
              const otherOffset = other * 3;
              const ox = x - positions.array[otherOffset];
              const oy = y - positions.array[otherOffset + 1];
              const oz = z - positions.array[otherOffset + 2];
              if (ox * ox + oy * oy + oz * oz <= radiusSquared) {
                neighbors += 1;
                if (neighbors >= threshold) break;
              }
            }
          }
        }
      }

      if (neighbors >= threshold) retained.push(index);
    }

    return { indices: Uint32Array.from(retained), radius: radius };
  }

  return { retainedIndices: retainedIndices };
}));
