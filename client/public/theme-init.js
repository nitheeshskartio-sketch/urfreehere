// Applies the saved (or system) colour theme before the page paints, so there is no flash.
(function () {
  try {
    var saved = localStorage.getItem('urfree.theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
