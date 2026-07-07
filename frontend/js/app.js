/* 
==================================================
GLOBAL JAVASCRIPT: js/app.js
Simplified AWS Student Management System Frontend
==================================================
*/

// Set theme immediately to avoid layout flash
const savedTheme = localStorage.getItem('sms_theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Global UI Components
  initThemeToggle();
  initRipples();
  initSidebarToggle();
  initLogoutConfirmations();
});

// ==================================================
// SHARED ASYNCHRONOUS FETCH CLIENT HELPER
// ==================================================
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  // Set headers
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Inject authorization token (Student ID or Admin username) from localStorage
  const token = localStorage.getItem('sms_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    
    // Check if session has expired or authorization failed
    if (response.status === 401) {
      localStorage.removeItem('sms_token');
      localStorage.removeItem('sms_current_student');
      localStorage.removeItem('sms_current_admin');
      
      showToast('Session Expired', 'Please sign in to continue.', 'danger');
      setTimeout(() => {
        if (window.location.pathname.includes('admin')) {
          window.location.href = 'admin-login.html';
        } else if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
          window.location.href = 'student-login.html';
        }
      }, 1000);
      throw new Error("Unauthorized");
    }

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Request failed");
    }
    return payload;
  } catch (error) {
    console.error(`[API Error] Request failed on ${endpoint}:`, error);
    throw error;
  }
}

// ==================================================
// PREMIUM RIPPLE EFFECT
// ==================================================
function initRipples() {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.btn-premium, .btn-outline-premium');
    if (!button) return;

    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - rect.left - radius}px`;
    circle.style.top = `${e.clientY - rect.top - radius}px`;
    circle.classList.add('ripple');

    const ripple = button.querySelector('.ripple');
    if (ripple) {
      ripple.remove();
    }

    button.appendChild(circle);
  });
}

// ==================================================
// LOADING SPINNER
// ==================================================
function showLoader() {
  let loader = document.getElementById('global-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'loader-overlay';
    loader.innerHTML = '<div class="custom-spinner" role="status" aria-label="Loading"></div>';
    document.body.appendChild(loader);
  }
  loader.classList.remove('hidden');
}

function hideLoader() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.classList.add('hidden');
  }
}

// ==================================================
// TOAST NOTIFICATIONS
// ==================================================
function showToast(title, desc, type = 'success') {
  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  let iconClass = 'fa-check-circle';
  if (type === 'danger') iconClass = 'fa-exclamation-circle';
  if (type === 'warning') iconClass = 'fa-exclamation-triangle';
  if (type === 'info') iconClass = 'fa-info-circle';

  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');
  toast.innerHTML = `
    <span class="custom-toast-icon"><i class="fas ${iconClass}"></i></span>
    <div class="custom-toast-content">
      <div class="custom-toast-title">${escapeHTML(title)}</div>
      <div class="custom-toast-desc">${escapeHTML(desc)}</div>
    </div>
    <span class="custom-toast-close" aria-label="Close Toast"><i class="fas fa-times"></i></span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const autoHide = setTimeout(() => {
    closeToast(toast);
  }, 4000);

  toast.querySelector('.custom-toast-close').addEventListener('click', () => {
    clearTimeout(autoHide);
    closeToast(toast);
  });
}

function closeToast(toast) {
  toast.classList.remove('show');
  toast.addEventListener('transitionend', () => {
    toast.remove();
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ==================================================
// SIDEBAR COLLAPSE TOGGLE (COMMON)
// ==================================================
function initSidebarToggle() {
  const sidebarCollapseBtn = document.getElementById('sidebarCollapse');
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  if (sidebarCollapseBtn && sidebar) {
    sidebarCollapseBtn.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      if (content) {
        content.classList.toggle('active');
      }
    });
  }
}

// ==================================================
// LOGOUT MODAL & HANDLERS
// ==================================================
function initLogoutConfirmations() {
  const logoutLinks = document.querySelectorAll('.logout-trigger');
  logoutLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      let logoutModal = document.getElementById('logoutModal');
      if (!logoutModal) {
        logoutModal = document.createElement('div');
        logoutModal.className = 'modal fade';
        logoutModal.id = 'logoutModal';
        logoutModal.setAttribute('tabindex', '-1');
        logoutModal.setAttribute('aria-labelledby', 'logoutModalLabel');
        logoutModal.setAttribute('aria-hidden', 'true');
        logoutModal.innerHTML = `
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg" style="border-radius:15px;">
              <div class="modal-header border-0">
                <h5 class="modal-title font-weight-bold" id="logoutModalLabel"><i class="fas fa-sign-out-alt text-danger me-2"></i>Confirm Logout</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body text-secondary">
                Are you sure you want to log out of your session?
              </div>
              <div class="modal-footer border-0">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-premium bg-danger border-0 rounded-pill px-4" id="confirmLogoutBtn">Logout</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(logoutModal);

        document.getElementById('confirmLogoutBtn').addEventListener('click', async () => {
          showLoader();
          try {
            await fetchAPI('/auth/logout', { method: 'POST' });
          } catch(e) {
            console.error("Logout API failed:", e);
          }
          
          localStorage.removeItem('sms_token');
          localStorage.removeItem('sms_current_student');
          localStorage.removeItem('sms_current_admin');
          
          setTimeout(() => {
            hideLoader();
            window.location.href = 'index.html';
          }, 800);
        });
      }

      const bsModal = new bootstrap.Modal(logoutModal);
      bsModal.show();
    });
  });
}

// ==================================================
// HELPER: RENDER BREADCRUMB
// ==================================================
function buildBreadcrumbs(items = []) {
  const container = document.getElementById('breadcrumbs-container');
  if (!container) return;

  let html = `<nav aria-label="breadcrumb"><ol class="breadcrumb mb-0">`;
  html += `<li class="breadcrumb-item"><a href="index.html" class="text-decoration-none text-secondary"><i class="fas fa-home me-1"></i>Home</a></li>`;
  
  items.forEach((item, index) => {
    if (index === items.length - 1) {
      html += `<li class="breadcrumb-item active text-primary font-weight-bold" aria-current="page">${escapeHTML(item.name)}</li>`;
    } else {
      html += `<li class="breadcrumb-item"><a href="${item.url}" class="text-decoration-none text-secondary">${escapeHTML(item.name)}</a></li>`;
    }
  });
  
  html += `</ol></nav>`;
  container.innerHTML = html;
}

// ==================================================
// PERSISTENT THEME SWITCHER (DARK / LIGHT)
// ==================================================
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('theme-toggle');
  
  // Sync toggle button icon
  updateThemeToggleIcon(localStorage.getItem('sms_theme') || 'light');

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('sms_theme', newTheme);
      
      updateThemeToggleIcon(newTheme);
      showToast('Theme Changed', `Switched to ${newTheme} mode.`, 'info');
    });
  }
}

function updateThemeToggleIcon(theme) {
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (!themeToggleBtn) return;
  
  const icon = themeToggleBtn.querySelector('i');
  if (icon) {
    if (theme === 'dark') {
      icon.className = 'fas fa-sun text-warning';
    } else {
      icon.className = 'fas fa-moon text-secondary';
    }
  }
}

