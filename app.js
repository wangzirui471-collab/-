(function () {
  'use strict';

  const DEFAULT_POINT_CLOUD = './cloud_20260922_053021_559.pcd';

  const viewport = document.querySelector('#viewport');
  const loading = document.querySelector('#loading');
  const errorPanel = document.querySelector('#error');
  const errorMessage = document.querySelector('#error-message');
  const fileName = document.querySelector('#file-name');
  const pointCount = document.querySelector('#point-count');
  const fields = document.querySelector('#fields');
  const resetButton = document.querySelector('#reset-view');
  const pointSizeInput = document.querySelector('#point-size');
  const pointSizeValue = document.querySelector('#point-size-value');
  const fileInput = document.querySelector('#pcd-file');
  const fileDropzone = document.querySelector('#file-dropzone');
  const fileSelection = document.querySelector('#file-selection');
  const modelActions = window.TaiheModelActions;
  const downloadButton = document.querySelector('#download-model');
  const shareButton = document.querySelector('#share-model');
  const embedButton = document.querySelector('#embed-model');
  const linkDialog = document.querySelector('#link-dialog');
  const dialogValue = document.querySelector('#dialog-value');
  let selectedLocalFile = null;

  if (new URLSearchParams(window.location.search).get('embed') === '1') {
    document.body.classList.add('embed-mode');
  }

  if (!viewport || !window.THREE) {
    throw new Error('Three.js 未能加载，请检查网络连接后刷新页面。');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07111f);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 1000);
  camera.position.set(2.2, 1.6, 2.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x07111f, 0);
  viewport.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.01;
  controls.maxDistance = 10000;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  controls.mouseButtons.RIGHT = null;
  renderer.domElement.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  let cloudPoints = null;
  let cloudMaterial = null;
  let cloudRadius = 1;
  let helperGrid = null;
  let helperAxes = null;

  function setLoading(isLoading) {
    loading.hidden = !isLoading;
  }

  function showError(error) {
    setLoading(false);
    errorPanel.hidden = false;
    errorMessage.textContent = error instanceof Error ? error.message : String(error);
  }

  function hideError() {
    errorPanel.hidden = true;
  }

  function updateFileSelection(message, isError) {
    fileSelection.textContent = message;
    fileSelection.classList.toggle('is-error', Boolean(isError));
  }

  function resizeRenderer() {
    const width = Math.max(viewport.clientWidth, 1);
    const height = Math.max(viewport.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function normalizeIntensity(value, min, max) {
    const numericValue = Number(value);
    const numericMin = Number(min);
    const numericMax = Number(max);

    if (
      !Number.isFinite(numericValue) ||
      !Number.isFinite(numericMin) ||
      !Number.isFinite(numericMax) ||
      numericMax <= numericMin
    ) {
      return 0.5;
    }

    return clamp01((numericValue - numericMin) / (numericMax - numericMin));
  }

  function intensityToRgb(normalized) {
    const value = clamp01(Number.isFinite(Number(normalized)) ? Number(normalized) : 0.5);
    const hue = (2 / 3) * (1 - value);
    const scaled = hue * 6;
    const sector = Math.floor(scaled);
    const fraction = scaled - sector;
    const q = 1 - fraction;
    const t = fraction;

    switch (sector % 6) {
      case 0: return [1, t, 0];
      case 1: return [q, 1, 0];
      case 2: return [0, 1, t];
      case 3: return [0, q, 1];
      case 4: return [t, 0, 1];
      default: return [1, 0, q];
    }
  }

  function parseHeaderFromBinary(buffer) {
    const bytes = new Uint8Array(buffer);
    const previewLength = Math.min(bytes.length, 16384);
    const text = new TextDecoder().decode(bytes.subarray(0, previewLength));
    const dataMatch = /(?:^|\r?\n)DATA\s+(\S+)[^\r\n]*(?:\r?\n|$)/i.exec(text);

    if (!dataMatch) {
      throw new Error('PCD 文件缺少 DATA 声明。');
    }

    const headerText = text.slice(0, dataMatch.index + dataMatch[0].length);
    const header = {
      fields: [],
      sizes: [],
      types: [],
      counts: [],
      points: 0,
      data: String(dataMatch[1]).toLowerCase(),
      dataOffset: dataMatch.index + dataMatch[0].length,
    };

    for (const rawLine of headerText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      const key = parts.shift().toUpperCase();
      if (key === 'FIELDS') header.fields = parts;
      if (key === 'SIZE') header.sizes = parts.map(Number);
      if (key === 'TYPE') header.types = parts;
      if (key === 'COUNT') header.counts = parts.map(Number);
      if (key === 'POINTS') header.points = Number(parts[0] || 0);
      if (key === 'WIDTH' && !header.points) header.points = Number(parts[0] || 0);
      if (key === 'HEIGHT' && header.points && header.points === Number(parts[0] || 0)) {
        header.points *= Number(parts[0] || 0);
      }
    }

    if (!header.counts.length) header.counts = header.fields.map(function () { return 1; });
    if (header.data !== 'binary' || header.fields.length === 0 || header.sizes.length === 0) {
      return header;
    }

    const intensityIndex = header.fields.indexOf('intensity');
    if (intensityIndex < 0 || !header.points) return header;

    const rowSize = header.fields.reduce(function (sum, field, index) {
      return sum + (header.sizes[index] || 0) * (header.counts[index] || 1);
    }, 0);
    const intensityOffset = header.fields.slice(0, intensityIndex).reduce(function (sum, field, index) {
      return sum + (header.sizes[index] || 0) * (header.counts[index] || 1);
    }, 0);
    const values = new Float32Array(header.points);
    const dataView = new DataView(buffer, header.dataOffset);

    for (let index = 0; index < header.points; index += 1) {
      const offset = index * rowSize + intensityOffset;
      values[index] = readScalar(dataView, offset, header.types[intensityIndex], header.sizes[intensityIndex]);
    }

    header.values = values;
    return header;
  }

  function readScalar(dataView, offset, type, size) {
    if (type === 'F' && size === 4) return dataView.getFloat32(offset, true);
    if (type === 'F' && size === 8) return dataView.getFloat64(offset, true);
    if (type === 'I' && size === 1) return dataView.getInt8(offset);
    if (type === 'I' && size === 2) return dataView.getInt16(offset, true);
    if (type === 'I' && size === 4) return dataView.getInt32(offset, true);
    if (type === 'U' && size === 1) return dataView.getUint8(offset);
    if (type === 'U' && size === 2) return dataView.getUint16(offset, true);
    if (type === 'U' && size === 4) return dataView.getUint32(offset, true);
    throw new Error('暂不支持 intensity 字段类型。');
  }

  function createIntensityColors(geometry, parsedHeader) {
    const positions = geometry.getAttribute('position');
    const intensities = geometry.getAttribute('intensity');
    const existingColors = geometry.getAttribute('color');
    const colors = new Float32Array(positions.count * 3);

    if (intensities && intensities.count === positions.count) {
      let min = Infinity;
      let max = -Infinity;
      for (let index = 0; index < intensities.count; index += 1) {
        const value = intensities.getX(index);
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }

      for (let index = 0; index < positions.count; index += 1) {
        const normalized = normalizeIntensity(intensities.getX(index), min, max);
        const rgb = intensityToRgb(normalized);
        const offset = index * 3;
        colors[offset] = rgb[0];
        colors[offset + 1] = rgb[1];
        colors[offset + 2] = rgb[2];
      }
      fields.textContent = (parsedHeader.fields || ['x', 'y', 'z', 'intensity']).join(' · ');
    } else if (existingColors && existingColors.count === positions.count) {
      for (let index = 0; index < existingColors.count; index += 1) {
        const offset = index * 3;
        colors[offset] = existingColors.getX(index);
        colors[offset + 1] = existingColors.getY(index);
        colors[offset + 2] = existingColors.getZ(index);
      }
      fields.textContent = 'x · y · z · rgb';
    } else {
      for (let index = 0; index < positions.count; index += 1) {
        const offset = index * 3;
        colors[offset] = 0.28;
        colors[offset + 1] = 0.84;
        colors[offset + 2] = 0.92;
      }
      fields.textContent = (parsedHeader.fields || ['x', 'y', 'z']).join(' · ');
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  function rebuildHelpers(radius) {
    if (helperGrid) scene.remove(helperGrid);
    if (helperAxes) scene.remove(helperAxes);

    const size = Math.max(radius * 2.4, 1);
    helperGrid = new THREE.GridHelper(size, 12, 0x244665, 0x142b43);
    helperGrid.position.y = -radius * 0.72;
    helperGrid.material.opacity = 0.48;
    helperGrid.material.transparent = true;
    scene.add(helperGrid);

    helperAxes = new THREE.AxesHelper(Math.max(radius * 0.42, 0.25));
    helperAxes.material.transparent = true;
    helperAxes.material.opacity = 0.72;
    scene.add(helperAxes);
  }

  function fitCamera() {
    if (!cloudPoints) return;

    const box = new THREE.Box3().setFromObject(cloudPoints);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    cloudRadius = Math.max(sphere.radius, 0.01);

    const distance = (cloudRadius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 1.15;
    camera.position.set(distance * 0.8, distance * 0.58, distance);
    camera.near = Math.max(cloudRadius / 1000, 0.001);
    camera.far = Math.max(cloudRadius * 100, 100);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = Math.max(cloudRadius * 0.04, 0.01);
    controls.maxDistance = Math.max(cloudRadius * 80, 100);
    controls.update();
    rebuildHelpers(cloudRadius);
  }

  function disposeCloud(points) {
    if (!points) return;
    scene.remove(points);
    points.geometry.dispose();
    points.material.dispose();
  }

  function loadPointCloudBuffer(buffer, displayName, localFile) {
    const parsedHeader = parseHeaderFromBinary(buffer);
    const loader = new THREE.PCDLoader();
    const loadedPoints = loader.parse(buffer, displayName);
    const geometry = loadedPoints && loadedPoints.geometry;
    const positions = geometry && geometry.getAttribute('position');

    if (!geometry || !positions || positions.count === 0) {
      throw new Error('PCD 文件中没有可显示的点。');
    }

    if (parsedHeader.values && parsedHeader.values.length === positions.count) {
      geometry.setAttribute('intensity', new THREE.Float32BufferAttribute(parsedHeader.values, 1));
    }

    geometry.computeBoundingBox();
    geometry.center();
    createIntensityColors(geometry, parsedHeader);

    const nextMaterial = new THREE.PointsMaterial({
      size: Number(pointSizeInput.value),
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
    });
    const nextPoints = new THREE.Points(geometry, nextMaterial);

    disposeCloud(cloudPoints);
    cloudMaterial = nextMaterial;
    cloudPoints = nextPoints;
    scene.add(cloudPoints);

    fileName.textContent = displayName;
    pointCount.textContent = positions.count.toLocaleString('zh-CN');
    pointSizeValue.textContent = Number(pointSizeInput.value).toFixed(2);
    selectedLocalFile = localFile || null;
    const details = modelActions.modelDetails({
      name: localFile ? displayName : 'MS01 点云样例',
      pointCount: positions.count,
      bytes: buffer.byteLength,
      fields: parsedHeader.fields,
      local: Boolean(localFile),
    });
    document.querySelector('#model-title').textContent = details.title;
    document.querySelector('#model-points').textContent = details.points;
    document.querySelector('#model-triangles').textContent = details.triangles + '（点云）';
    document.querySelector('#model-size').textContent = details.size;
    document.querySelector('#model-fields').textContent = details.fields;
    document.querySelector('#model-source').textContent = details.source;
    document.querySelector('#model-license').textContent = details.license;
    downloadButton.disabled = false;
    fitCamera();
  }

  function loadPointCloud() {
    const pointCloudUrl = viewport.dataset.pointCloud || DEFAULT_POINT_CLOUD;
    setLoading(true);
    hideError();

    const fileLoader = new THREE.FileLoader();
    fileLoader.setResponseType('arraybuffer');
    fileLoader.load(
      pointCloudUrl,
      function (buffer) {
        try {
          loadPointCloudBuffer(buffer, pointCloudUrl.split('/').pop());
          updateFileSelection('默认点云已加载');
          setLoading(false);
        } catch (error) {
          showError(error);
        }
      },
      undefined,
      showError,
    );
  }

  function loadLocalFile(file) {
    if (!file) return;

    if (!/\.pcd$/i.test(file.name)) {
      updateFileSelection('格式不支持，请选择 .pcd 文件', true);
      showError(new Error('请选择扩展名为 .pcd 的点云文件。'));
      return;
    }

    setLoading(true);
    hideError();
    updateFileSelection('正在读取 ' + file.name + '…');

    file.arrayBuffer().then(function (buffer) {
      loadPointCloudBuffer(buffer, file.name, file);
      updateFileSelection(file.name);
      setLoading(false);
    }).catch(function (error) {
      updateFileSelection('读取失败，请检查 PCD 文件', true);
      showError(error);
    });
  }

  resetButton.addEventListener('click', fitCamera);
  downloadButton.addEventListener('click', function () {
    const anchor = document.createElement('a');
    const cloudUrl = viewport.dataset.pointCloud || DEFAULT_POINT_CLOUD;
    const objectUrl = selectedLocalFile ? URL.createObjectURL(selectedLocalFile) : null;
    anchor.href = objectUrl || cloudUrl;
    anchor.download = selectedLocalFile ? selectedLocalFile.name : cloudUrl.split('/').pop();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (objectUrl) setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);
  });

  function showLinkDialog(mode) {
    const isEmbed = mode === 'embed';
    document.querySelector('#dialog-title').textContent = isEmbed ? '嵌入模型' : '分享模型';
    document.querySelector('#dialog-description').textContent = isEmbed
      ? '复制这段 HTML，粘贴到允许 iframe 的网页中。'
      : '此链接展示网站公开样例；你在本机选取的 PCD 不会随链接分享。';
    dialogValue.value = isEmbed
      ? modelActions.embedCode(window.location.href)
      : modelActions.publicPageUrl(window.location.href);
    document.querySelector('#copy-status').textContent = '';
    linkDialog.showModal();
    dialogValue.select();
  }
  shareButton.addEventListener('click', function () { showLinkDialog('share'); });
  embedButton.addEventListener('click', function () { showLinkDialog('embed'); });
  document.querySelector('#close-dialog').addEventListener('click', function () { linkDialog.close(); });
  document.querySelector('#copy-link').addEventListener('click', function () {
    const status = document.querySelector('#copy-status');
    navigator.clipboard.writeText(dialogValue.value).then(function () {
      status.textContent = '已复制到剪贴板';
    }).catch(function () {
      dialogValue.focus();
      dialogValue.select();
      status.textContent = '自动复制失败，已选中文本，请按 Ctrl+C 复制。';
    });
  });
  pointSizeInput.addEventListener('input', function () {
    const value = Number(pointSizeInput.value);
    pointSizeValue.textContent = value.toFixed(2);
    if (cloudMaterial) cloudMaterial.size = value;
  });
  fileInput.addEventListener('change', function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    loadLocalFile(file);
  });
  ['dragenter', 'dragover'].forEach(function (eventName) {
    fileDropzone.addEventListener(eventName, function (event) {
      event.preventDefault();
      fileDropzone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (eventName) {
    fileDropzone.addEventListener(eventName, function (event) {
      event.preventDefault();
      fileDropzone.classList.remove('is-dragging');
    });
  });
  fileDropzone.addEventListener('drop', function (event) {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    loadLocalFile(file);
  });
  window.addEventListener('resize', resizeRenderer);

  resizeRenderer();
  loadPointCloud();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}());
