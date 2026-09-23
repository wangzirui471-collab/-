(function (root, factory) {
  const actions = factory();
  if (typeof module === 'object' && module.exports) module.exports = actions;
  else root.TaiheModelActions = actions;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function publicPageUrl(location) {
    const url = new URL(location);
    url.searchParams.delete('embed');
    url.hash = '';
    return url.href;
  }
  function embedCode(location) {
    const url = new URL(publicPageUrl(location));
    url.searchParams.set('embed', '1');
    return '<iframe src="' + url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" width="800" height="600" title="泰合技术 3D 点云" loading="lazy" allowfullscreen></iframe>';
  }
  function modelDetails(model) {
    return {
      title: model.name,
      points: Number(model.pointCount).toLocaleString('en-US'),
      triangles: '0',
      size: (Number(model.bytes) / 1048576).toFixed(2) + ' MB',
      fields: model.fields.join(' · '),
      license: '未注明',
      source: model.local ? '本地文件（未上传）' : '网站公开样例',
    };
  }
  return { publicPageUrl, embedCode, modelDetails };
}));
