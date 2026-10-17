// Módulo de Control de Tema Claro / Oscuro

export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    // Si no hay preferencia guardada, verificar el sistema operativo
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeToggleUI(theme);
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

function updateThemeToggleUI(theme) {
  const themeBtns = document.querySelectorAll('.theme-toggle-btn');
  themeBtns.forEach(btn => {
    if (theme === 'dark') {
      btn.innerHTML = '☀️ <span>Modo Claro</span>';
      btn.setAttribute('aria-label', 'Cambiar a tema claro');
    } else {
      btn.innerHTML = '🌙 <span>Modo Oscuro</span>';
      btn.setAttribute('aria-label', 'Cambiar a tema oscuro');
    }
  });
}