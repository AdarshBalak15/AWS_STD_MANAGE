/* 
==================================================
ADMIN CONSOLE JAVASCRIPT: js/admin.js
Simplified AWS Student Management System Frontend
==================================================
*/

document.addEventListener('DOMContentLoaded', () => {
  const adminLoginForm = document.getElementById('admin-login-form');
  
  if (adminLoginForm) {
    initAdminLoginPage();
  } else {
    initConsoleGlobal();

    if (document.getElementById('admin-students-tbody')) {
      initAdminDashboardPage();
    }
  }
});

// ==================================================
// ADMIN PORTAL LOGIN LOGIC
// ==================================================
function initAdminLoginPage() {
  const toggleBtn = document.getElementById('togglePasswordAdmin');
  const passwordInp = document.getElementById('admin-password');

  if (toggleBtn && passwordInp) {
    toggleBtn.addEventListener('click', () => {
      const type = passwordInp.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInp.setAttribute('type', type);
      const icon = toggleBtn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
      }
    });
  }

  const form = document.getElementById('admin-login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usernameInp = document.getElementById('admin-username');
    const usernameVal = usernameInp.value.trim();
    const passVal = passwordInp.value;

    usernameInp.classList.remove('is-invalid');
    passwordInp.classList.remove('is-invalid');

    let isValid = true;
    if (usernameVal.length < 3) { usernameInp.classList.add('is-invalid'); isValid = false; }
    if (passVal.length < 6) { passwordInp.classList.add('is-invalid'); isValid = false; }

    if (!isValid) return;

    showLoader();
    try {
      // Backend uses the username mapping sent as 'email' coordinate
      const data = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: usernameVal, password: passVal })
      });

      localStorage.setItem('sms_token', data.token);
      localStorage.setItem('sms_current_admin', JSON.stringify(data.user));
      
      showToast('Console Access Granted', 'Initializing secure administrative session...', 'success');
      setTimeout(() => {
        hideLoader();
        window.location.href = 'admin-dashboard.html';
      }, 1000);
    } catch (err) {
      hideLoader();
      showToast('Access Denied', err.message || 'Invalid administrator credentials.', 'danger');
      passwordInp.classList.add('is-invalid');
    }
  });
}

function initConsoleGlobal() {
  const currentAdmin = JSON.parse(localStorage.getItem('sms_current_admin'));
  if (!currentAdmin && !window.location.pathname.includes('admin-login.html')) {
    window.location.href = 'admin-login.html';
  }
}

// ==================================================
// ADMIN OVERVIEW DASHBOARD LOGIC
// ==================================================
function initAdminDashboardPage() {
  buildBreadcrumbs([{ name: 'Console Overview', url: '#' }]);
  updateAdminMetrics();
  renderStudentsDirectory();
  renderPendingDocuments();
}

async function updateAdminMetrics() {
  try {
    const data = await fetchAPI('/admin/stats');
    document.getElementById('stat-total-students').textContent = data.total_students;
    document.getElementById('stat-pending-docs').textContent = data.pending_docs;
    document.getElementById('stat-approved-docs').textContent = data.approved_docs;
    document.getElementById('stat-rejected-docs').textContent = data.rejected_docs;
  } catch (err) {
    console.error("Failed to load admin metrics:", err);
  }
}

async function renderStudentsDirectory() {
  const tbody = document.getElementById('admin-students-tbody');
  if (!tbody) return;

  try {
    const data = await fetchAPI('/admin/students');
    const students = data.students || [];

    if (students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-secondary py-4">No student records found.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = students.map(student => {
      const avatarUrl = student.photo
        ? student.photo
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=2563EB&color=fff&bold=true`;

      return `
        <tr>
          <td><img src="${avatarUrl}" alt="Student Avatar" class="profile-dropdown-img"></td>
          <td class="font-monospace fw-bold">${student.id}</td>
          <td>${escapeHTML(student.name)}</td>
          <td>${escapeHTML(student.email)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Failed to load student directory:", err);
  }
}

async function renderPendingDocuments() {
  const tbody = document.getElementById('admin-pending-tbody');
  if (!tbody) return;

  try {
    const data = await fetchAPI('/upload/documents');
    // For admin, this shared endpoint returns all documents. We filter for 'Pending'.
    const docs = (data.documents || []).filter(d => d.status === 'Pending');

    if (docs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-secondary py-4">No pending documents in review queue.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = docs.map(doc => {
      const fileUrl = doc.file_path || '#';
      
      return `
        <tr>
          <td><strong>${escapeHTML(doc.studentName || 'Student')}</strong></td>
          <td>${escapeHTML(doc.fileName)}</td>
          <td>
            <a href="${fileUrl}" target="_blank" class="text-decoration-none">
              <i class="fas fa-external-link-alt me-1"></i>View PDF
            </a>
          </td>
          <td>
            <div class="d-flex gap-2">
              <button class="btn btn-success btn-sm rounded-pill px-3" onclick="approveDocument('${doc.id}')">
                <i class="fas fa-check me-1"></i>Approve
              </button>
              <button class="btn btn-danger btn-sm rounded-pill px-3" onclick="rejectDocument('${doc.id}')">
                <i class="fas fa-times me-1"></i>Reject
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Failed to load pending queue:", err);
  }
}

// Action triggers
window.approveDocument = async function(id) {
  const conf = confirm("Approve this document upload?");
  if (!conf) return;

  showLoader();
  try {
    await fetchAPI(`/admin/documents/${id}/approve`, { method: 'POST' });
    showToast('Success', 'Document has been approved.', 'success');
    updateAdminMetrics();
    renderPendingDocuments();
    hideLoader();
  } catch (err) {
    hideLoader();
    showToast('Failed', err.message || 'Failed to approve document.', 'danger');
  }
};

window.rejectDocument = async function(id) {
  const conf = confirm("Reject this document upload?");
  if (!conf) return;

  showLoader();
  try {
    await fetchAPI(`/admin/documents/${id}/reject`, { method: 'POST' });
    showToast('Status Updated', 'Document rejected.', 'warning');
    updateAdminMetrics();
    renderPendingDocuments();
    hideLoader();
  } catch (err) {
    hideLoader();
    showToast('Failed', err.message || 'Failed to reject document.', 'danger');
  }
};
