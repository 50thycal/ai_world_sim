// Apply before styles paint. Dark is the default; an explicit choice survives reloads.
(() => {
  const root = document.documentElement;
  let saved;
  try { saved = localStorage.getItem('village-theme'); } catch { /* Storage can be unavailable in private/embedded views. */ }
  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111a17' : '#f5f2e9');
    const button = document.getElementById('theme-toggle');
    if (button) {
      const next = theme === 'dark' ? 'light' : 'dark';
      button.textContent = theme === 'dark' ? 'Light' : 'Dark';
      button.setAttribute('aria-label', `Switch to ${next} mode`);
      button.title = `Switch to ${next} mode`;
    }
  }
  apply(saved === 'light' ? 'light' : 'dark');
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem('village-theme', next); } catch { /* The current page still switches. */ }
    });
  });
})();
