// Applies the saved (or system) light/dark theme and colour theme before the page paints, so there is no flash.
(function () {
  try {
    var saved = localStorage.getItem('urfree.theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var palette = localStorage.getItem('humble.palette');
    if (palette && /^(lavender|mint|coffee|midnight)$/.test(palette)) document.documentElement.dataset.palette = palette;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
