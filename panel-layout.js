(function (root, factory) {
  const panelLayout = factory();
  if (typeof module === 'object' && module.exports) module.exports = panelLayout;
  else root.TaihePanelLayout = panelLayout;
}(typeof self !== 'undefined' ? self : this, function () {
  function bindPanelLayout(options) {
    const {
      workspace,
      visualColumn,
      photoPanel,
      workbenchPanel,
      photoToggle,
      workbenchToggle,
      resize,
    } = options;

    let photoVisible = !photoPanel.hidden;
    let workbenchVisible = !workbenchPanel.hidden;

    function render(shouldResize) {
      photoPanel.hidden = !photoVisible;
      visualColumn.classList.toggle('photo-hidden', !photoVisible);
      photoToggle.textContent = photoVisible ? '收起照片' : '展开照片';
      photoToggle.setAttribute('aria-expanded', String(photoVisible));
      photoToggle.setAttribute(
        'aria-label',
        photoVisible ? '收起点云对应照片并扩大点云视图' : '展开点云对应照片并排对照',
      );

      workbenchPanel.hidden = !workbenchVisible;
      workspace.classList.toggle('workbench-hidden', !workbenchVisible);
      workbenchToggle.textContent = workbenchVisible ? '收起工作台' : '展开工作台';
      workbenchToggle.setAttribute('aria-expanded', String(workbenchVisible));
      workbenchToggle.setAttribute(
        'aria-label',
        workbenchVisible ? '收起点云工作台并扩大点云视图' : '展开点云工作台和视图控制',
      );

      if (shouldResize && typeof resize === 'function') resize();
    }

    photoToggle.addEventListener('click', function () {
      photoVisible = !photoVisible;
      render(true);
    });

    workbenchToggle.addEventListener('click', function () {
      workbenchVisible = !workbenchVisible;
      render(true);
    });

    render(false);
  }

  return { bindPanelLayout: bindPanelLayout };
}));
