(function () {
  'use strict';

  const DEFAULT_POINT_CLOUD = './cloud_20260924_083459_906.pcd';

  const viewport = document.querySelector('#viewport');
  const loading = document.querySelector('#loading');
  const errorPanel = document.querySelector('#error');
  const errorMessage = document.querySelector('#error-message');
  const fileName = document.querySelector('#file-name');
  const pointCount = document.querySelector('#point-count');
  const fields = document.querySelector('#fields');
  const resetButton = document.querySelector('#reset-view');
  const axisViewButtons = document.querySelectorAll('[data-axis-view]');
  const pointSizeInput = document.querySelector('#point-size');
  const pointSizeValue = document.querySelector('#point-size-value');
  const pointSizeNote = document.querySelector('#point-size-note');
  const fileInput = document.querySelector('#pcd-file');
  const fileDropzone = document.querySelector('#file-dropzone');
  const fileSelection = document.querySelector('#file-selection');
  const flyPointFilterInput = document.querySelector('#fly-point-filter');
  const filterStrengthInput = document.querySelector('#filter-strength');
  const filterLevelInput = document.querySelector('#filter-level');
  const filterLevelValue = document.querySelector('#filter-level-value');
  const filterSummary = document.querySelector('#filter-summary');
  const modelActions = window.TaiheModelActions;
  const pointDisplay = window.TaihePointDisplay;
  const viewPresets = window.TaiheViewPresets;
  const downloadButton = document.querySelector('#download-model');
  const shareButton = document.querySelector('#share-model');
  const embedButton = document.querySelector('#embed-model');
  const linkDialog = document.querySelector('#link-dialog');
  const dialogValue = document.querySelector('#dialog-value');
  let selectedLocalFile = null;
  let sourceGeometry = null;

  if (new URLSearchParams(window.location.search).get('embed') === '1') {
    document.body.classList.add('embed-mode');
  }

  if (!viewport || !window.THREE) {
    throw new Error('Three.js 未能加载，请检查网络连接后刷新页面。');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

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
  let cloudSpacing = 0;

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
      if (key === 'VIEWPOINT') header.viewpoint = parts.slice(0, 3).map(Number);
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

  function createDistanceColors(geometry, parsedHeader) {
    const positions = geometry.getAttribute('position');
    const result = pointDisplay.distanceColors(
      positions.array,
      parsedHeader.viewpoint || [0, 0, 0],
    );
    geometry.setAttribute('color', new THREE.BufferAttribute(result.colors, 3));
    fields.textContent = (parsedHeader.fields || ['x', 'y', 'z']).join(' · ');
  }

  function fitCamera() {
    if (!cloudPoints) return;

    const box = new THREE.Box3().setFromObject(cloudPoints);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    cloudRadius = Math.max(sphere.radius, 0.01);

    const distance = (cloudRadius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 1.15;
    camera.up.set(0, 1, 0);
    camera.position.set(distance * 0.8, distance * 0.58, distance);
    camera.near = Math.max(cloudRadius / 1000, 0.001);
    camera.far = Math.max(cloudRadius * 100, 100);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = Math.max(cloudRadius * 0.04, 0.01);
    controls.maxDistance = Math.max(cloudRadius * 80, 100);
    controls.update();
  }

  function setAxisView(name) {
    if (!cloudPoints) return;

    const center = controls.target;
    const distance = camera.position.distanceTo(center);
    const pose = viewPresets.cameraPose(name, center.toArray(), distance);
    if (!pose) return;

    camera.up.set(...pose.up);
    camera.position.set(...pose.position);
    camera.lookAt(center);
    controls.update();
  }

  function updatePointSize() {
    const multiplier = Number(pointSizeInput.value);
    const actualSize = pointDisplay.pointSizeForSpacing(cloudSpacing, multiplier);
    pointSizeValue.textContent = multiplier.toFixed(2) + '×';
    pointSizeNote.textContent = cloudSpacing > 0
      ? '估算点距 ' + cloudSpacing.toPrecision(3) + ' · 当前点径 ' + actualSize.toPrecision(3)
      : '加载后按点间距自动适配';
    if (cloudMaterial) cloudMaterial.size = actualSize;
  }

  function updateFilterLevelLabel() {
    filterLevelValue.textContent = Math.round(Number(filterLevelInput.value)) + ' / 100';
  }

  function disposeCloud(points) {
    if (!points) return;
    scene.remove(points);
    points.geometry.dispose();
    points.material.dispose();
  }

  function makeGeometryFromIndices(source, indices) {
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(source.attributes)) {
      const attribute = source.getAttribute(name);
      const itemSize = attribute.itemSize;
      const compact = new attribute.array.constructor(indices.length * itemSize);
      for (let outputIndex = 0; outputIndex < indices.length; outputIndex += 1) {
        const sourceOffset = indices[outputIndex] * itemSize;
        const outputOffset = outputIndex * itemSize;
        compact.set(attribute.array.subarray(sourceOffset, sourceOffset + itemSize), outputOffset);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(compact, itemSize, attribute.normalized));
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function refreshFilteredCloud() {
    if (!sourceGeometry) return;

    const originalCount = sourceGeometry.getAttribute('position').count;
    const filterResult = flyPointFilterInput.checked
      ? window.TaihePointFilter.retainedIndices(
        sourceGeometry.getAttribute('position'),
        Number(filterLevelInput.value),
      )
      : {
        indices: Uint32Array.from({ length: originalCount }, function (_, index) { return index; }),
        radius: 0,
      };
    const visibleGeometry = makeGeometryFromIndices(sourceGeometry, filterResult.indices);

    if (cloudPoints) {
      const previousGeometry = cloudPoints.geometry;
      cloudPoints.geometry = visibleGeometry;
      previousGeometry.dispose();
    } else {
      cloudPoints = new THREE.Points(visibleGeometry, cloudMaterial);
      scene.add(cloudPoints);
    }

    const visibleCount = filterResult.indices.length;
    const removedCount = originalCount - visibleCount;
    pointCount.textContent = visibleCount.toLocaleString('zh-CN');
    const modelPoints = document.querySelector('#model-points');
    if (modelPoints) modelPoints.textContent = visibleCount.toLocaleString('en-US');

    if (!flyPointFilterInput.checked) {
      filterSummary.textContent = '滤波已关闭 · 显示全部 ' + originalCount.toLocaleString('zh-CN') + ' 点';
    } else if (removedCount > 0) {
      filterSummary.textContent = '强度 ' + filterLevelInput.value + '/100 · 已剔除 ' + removedCount.toLocaleString('zh-CN') + ' 个孤立点 · 保留 ' + visibleCount.toLocaleString('zh-CN') + ' 点';
    } else {
      filterSummary.textContent = '强度 ' + filterLevelInput.value + '/100 · 未发现孤立点 · 显示全部 ' + originalCount.toLocaleString('zh-CN') + ' 点';
    }
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

    cloudSpacing = pointDisplay.estimateSpacing(positions, 96);
    createDistanceColors(geometry, parsedHeader);
    geometry.computeBoundingBox();
    geometry.center();

    const nextMaterial = new THREE.PointsMaterial({
      size: pointDisplay.pointSizeForSpacing(cloudSpacing, Number(pointSizeInput.value)),
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: true,
    });
    disposeCloud(cloudPoints);
    if (sourceGeometry) sourceGeometry.dispose();
    sourceGeometry = geometry;
    cloudMaterial = nextMaterial;
    cloudPoints = null;
    refreshFilteredCloud();

    fileName.textContent = displayName;
    updatePointSize();
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
  axisViewButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setAxisView(button.dataset.axisView);
    });
  });
  flyPointFilterInput.addEventListener('change', refreshFilteredCloud);
  filterStrengthInput.addEventListener('change', function () {
    if (filterStrengthInput.value !== 'custom') {
      filterLevelInput.value = String(window.TaihePointFilter.strengthLevelForPreset(filterStrengthInput.value));
    }
    updateFilterLevelLabel();
    refreshFilteredCloud();
  });
  filterLevelInput.addEventListener('input', function () {
    filterStrengthInput.value = 'custom';
    updateFilterLevelLabel();
  });
  filterLevelInput.addEventListener('change', refreshFilteredCloud);
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
    updatePointSize();
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

  updateFilterLevelLabel();
  resizeRenderer();
  loadPointCloud();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}());
