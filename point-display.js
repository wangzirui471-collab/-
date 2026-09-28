(function (root, factory) {
  const display = factory();
  if (typeof module === 'object' && module.exports) module.exports = display;
  else root.TaihePointDisplay = display;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEPTH_PALETTE = [
    [0.02, 0.12, 1.00],
    [0.00, 0.84, 1.00],
    [0.02, 0.90, 0.12],
    [1.00, 0.92, 0.02],
    [1.00, 0.42, 0.00],
    [0.94, 0.04, 0.015],
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
    const scaled = Math.min(1, Math.max(0, normalized)) * (DEPTH_PALETTE.length - 1);
    const segment = Math.min(Math.floor(scaled), DEPTH_PALETTE.length - 2);
    const blend = scaled - segment;
    return DEPTH_PALETTE[segment].map(function (channel, index) {
      return channel * (1 - blend) + DEPTH_PALETTE[segment + 1][index] * blend;
    });
  }

  function depthColors(positionArray, origin, lowPercentile, highPercentile) {
    const pointCount = Math.floor((positionArray && positionArray.length || 0) / 3);
    const sensor = Array.isArray(origin) && origin.length >= 3 ? origin : [0, 0, 0];
    // The default MS01 PCD stores forward camera depth on X; Y and Z span the image plane.
    const sensorX = Number(sensor[0]) || 0;
    const depths = new Float64Array(pointCount);
    const sortedDepths = [];

    for (let index = 0; index < pointCount; index += 1) {
      const offset = index * 3;
      const depth = Math.abs(positionArray[offset] - sensorX);
      depths[index] = depth;
      if (Number.isFinite(depth)) sortedDepths.push(depth);
    }

    const colors = new Float32Array(pointCount * 3);
    if (!sortedDepths.length) {
      return { colors: colors, minDepth: 0, maxDepth: 0 };
    }

    sortedDepths.sort(function (a, b) { return a - b; });
    const low = Number.isFinite(lowPercentile) ? lowPercentile : 0.02;
    const high = Number.isFinite(highPercentile) ? highPercentile : 0.98;
    const minDepth = percentile(sortedDepths, Math.min(1, Math.max(0, low)));
    const maxDepth = percentile(sortedDepths, Math.min(1, Math.max(low, high)));
    const depthRange = maxDepth - minDepth;

    for (let index = 0; index < pointCount; index += 1) {
      const normalized = depthRange > 0 && Number.isFinite(depths[index])
        ? Math.min(1, Math.max(0, (depths[index] - minDepth) / depthRange))
        : 0.5;
      const rgb = interpolateColor(normalized);
      const offset = index * 3;
      colors[offset] = rgb[0];
      colors[offset + 1] = rgb[1];
      colors[offset + 2] = rgb[2];
    }

    return { colors: colors, minDepth: minDepth, maxDepth: maxDepth };
  }

  function pointSizeForSpacing(spacing, multiplier) {
    const safeSpacing = Number.isFinite(spacing) && spacing > 0 ? spacing : 0;
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    return Math.max(safeSpacing * safeMultiplier, 0.001);
  }

  function stepPointSize(value, direction, minimum, maximum, increment) {
    const lower = Number.isFinite(minimum) ? minimum : 0.25;
    const upper = Number.isFinite(maximum) ? Math.max(lower, maximum) : 3;
    const current = Number.isFinite(value) ? value : 1;
    const step = Number.isFinite(increment) && increment > 0 ? increment : 0.1;
    const sign = Math.sign(Number(direction) || 0);
    const next = Math.min(upper, Math.max(lower, current + sign * step));
    return Math.round(next * 100) / 100;
  }

  function hasPointRgb(fields, colorAttribute, pointCount) {
    const hasPackedRgb = Array.isArray(fields)
      && fields.some(function (field) { return String(field).toLowerCase() === 'rgb'; });
    return Boolean(
      hasPackedRgb
      && colorAttribute
      && colorAttribute.itemSize >= 3
      && colorAttribute.count === pointCount,
    );
  }

  function addCircularPointMask(material) {
    if (!material || typeof material !== 'object') {
      throw new TypeError('A point material is required to add the circular point mask.');
    }

    const marker = '#include <color_fragment>';
    const previousHook = material.onBeforeCompile;
    const previousCacheKey = typeof material.customProgramCacheKey === 'function'
      ? material.customProgramCacheKey
      : null;

    material.onBeforeCompile = function (shader, renderer) {
      if (typeof previousHook === 'function') previousHook.call(this, shader, renderer);
      if (!shader || typeof shader.fragmentShader !== 'string' || !shader.fragmentShader.includes(marker)) {
        throw new Error('Cannot add circular point mask: expected #include <color_fragment> in the point fragment shader.');
      }

      if (shader.fragmentShader.includes('taihePointRadius')) return;
      shader.fragmentShader = shader.fragmentShader.replace(
        marker,
        marker + '\n'
          + 'float taihePointRadius = length(gl_PointCoord - vec2(0.5));\n'
          + 'if (taihePointRadius >= 0.5) discard;\n'
          + 'diffuseColor.a *= 1.0 - smoothstep(0.46, 0.5, taihePointRadius);',
      );
    };

    material.customProgramCacheKey = function () {
      const previousKey = previousCacheKey ? previousCacheKey.call(this) : '';
      return String(previousKey) + '|taihe-circular-point-mask-v1';
    };

    return material;
  }

  return {
    estimateSpacing: estimateSpacing,
    depthColors: depthColors,
    pointSizeForSpacing: pointSizeForSpacing,
    stepPointSize: stepPointSize,
    hasPointRgb: hasPointRgb,
    addCircularPointMask: addCircularPointMask,
  };
}));

