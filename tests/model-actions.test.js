const test = require('node:test');
const assert = require('node:assert/strict');
const { publicPageUrl, embedCode, modelDetails } = require('../dist/model-actions.js');

test('shared link removes embed mode and local-only fragments', () => {
  assert.equal(publicPageUrl('https://example.github.io/viewer/?embed=1#local'), 'https://example.github.io/viewer/');
});

test('embed code targets the public viewer with embed mode', () => {
  assert.equal(embedCode('https://example.github.io/viewer/'), '<iframe src="https://example.github.io/viewer/?embed=1" width="800" height="600" title="泰合技术 3D 点云" loading="lazy" allowfullscreen></iframe>');
});

test('model details report loaded point count and file size without inventing a license', () => {
  assert.deepEqual(modelDetails({ name: 'tree.pcd', pointCount: 263964, bytes: 4223556, fields: ['x', 'y', 'z', 'intensity'], local: true }), {
    title: 'tree.pcd', points: '263,964', triangles: '0', size: '4.03 MB', fields: 'x · y · z · intensity', license: '未注明', source: '本地文件（未上传）'
  });
});
