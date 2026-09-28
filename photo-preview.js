(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TaihePhotoPreview = api;
  }
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const supportedExtensions = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

  function isImageFile(file) {
    if (!file || typeof file.name !== 'string') return false;
    if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
    return (!file.type || file.type === 'application/octet-stream') && supportedExtensions.test(file.name);
  }

  function bindPhotoPreview(elements) {
    const { input, image, placeholder, filename, clearButton, status, urlApi } = elements;
    let currentUrl = null;

    function revokeCurrentUrl() {
      if (!currentUrl) return;
      urlApi.revokeObjectURL(currentUrl);
      currentUrl = null;
    }

    function clear() {
      revokeCurrentUrl();
      image.removeAttribute('src');
      image.hidden = true;
      placeholder.hidden = false;
      filename.textContent = '';
      clearButton.hidden = true;
      input.value = '';
      status.textContent = '照片只在本机浏览器显示，不会上传。';
    }

    function showFile(file) {
      if (!file) return;
      if (!isImageFile(file)) {
        status.textContent = '请选择 JPG、PNG、WEBP 等图片文件。';
        return;
      }

      let nextUrl;
      try {
        nextUrl = urlApi.createObjectURL(file);
      } catch (error) {
        status.textContent = '无法读取这张照片，请换一张图片试试。';
        return;
      }

      const previousUrl = currentUrl;
      currentUrl = nextUrl;
      image.src = nextUrl;
      image.hidden = false;
      placeholder.hidden = true;
      filename.textContent = file.name;
      clearButton.hidden = false;
      status.textContent = '照片只在本机浏览器显示，不会上传。';
      if (previousUrl) urlApi.revokeObjectURL(previousUrl);
    }

    input.addEventListener('change', function (event) {
      const files = event.target && event.target.files;
      showFile(files && files[0]);
    });
    clearButton.addEventListener('click', clear);
    image.addEventListener('error', function () {
      if (currentUrl && image.src === currentUrl) {
        status.textContent = '浏览器无法预览此图片格式，请换成 JPG、PNG 或 WEBP。';
      }
    });

    if (typeof root.addEventListener === 'function') {
      root.addEventListener('pagehide', function (event) {
        if (!event.persisted) revokeCurrentUrl();
      }, { once: true });
    }

    return { clear, showFile };
  }

  return { bindPhotoPreview, isImageFile };
}));
