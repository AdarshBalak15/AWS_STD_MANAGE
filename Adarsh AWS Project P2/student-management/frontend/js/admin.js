/* 
==================================================
ADMIN CONSOLE JAVASCRIPT: js/admin.js
Simplified AWS Student Management System Frontend
==================================================
*/

let cachedStudents = [];
let cachedPendingDocs = [];
let adminRegChartInstance = null;
let adminVerificationChartInstance = null;

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
        icon.classList.toggle('bi-eye');
        icon.classList.toggle('bi-eye-slash');
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
  setupTableSearchListeners();
}

async function updateAdminMetrics() {
  try {
    const data = await fetchAPI('/admin/stats');
    document.getElementById('stat-total-students').textContent = data.total_students;
    document.getElementById('stat-pending-docs').textContent = data.pending_docs;
    document.getElementById('stat-approved-docs').textContent = data.approved_docs;
    document.getElementById('stat-rejected-docs').textContent = data.rejected_docs;

    // Render charts
    initAdminCharts(data.total_students, data.pending_docs, data.approved_docs, data.rejected_docs);
  } catch (err) {
    console.error("Failed to load admin metrics:", err);
  }
}

async function renderStudentsDirectory() {
  const tbody = document.getElementById('admin-students-tbody');
  if (!tbody) return;

  try {
    const data = await fetchAPI('/admin/students');
    cachedStudents = data.students || [];
    renderStudentsTable(cachedStudents);
  } catch (err) {
    console.error("Failed to load student directory:", err);
  }
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('admin-students-tbody');
  if (!tbody) return;

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
        <td class="font-monospace fw-bold text-primary">${student.id}</td>
        <td>${escapeHTML(student.name)}</td>
        <td>${escapeHTML(student.email)}</td>
      </tr>
    `;
  }).join('');
}

async function renderPendingDocuments() {
  const tbody = document.getElementById('admin-pending-tbody');
  if (!tbody) return;

  try {
    const data = await fetchAPI('/upload/documents');
    // For admin, this shared endpoint returns all documents. We filter for 'Pending'.
    cachedPendingDocs = (data.documents || []).filter(d => d.status === 'Pending');
    renderPendingTable(cachedPendingDocs);
  } catch (err) {
    console.error("Failed to load pending queue:", err);
  }
}

function renderPendingTable(docs) {
  const tbody = document.getElementById('admin-pending-tbody');
  if (!tbody) return;

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
        <td class="text-truncate" style="max-width: 150px;">${escapeHTML(doc.fileName)}</td>
        <td>
          <a href="${fileUrl}" target="_blank" class="text-decoration-none d-inline-flex align-items-center gap-1">
            <i class="bi bi-box-arrow-up-right"></i>
            <span>View PDF</span>
          </a>
        </td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-success btn-sm rounded-pill px-3 py-1 d-flex align-items-center gap-1" onclick="approveDocument('${doc.id}')">
              <i class="bi bi-check-lg"></i><span>Approve</span>
            </button>
            <button class="btn btn-danger btn-sm rounded-pill px-3 py-1 d-flex align-items-center gap-1" onclick="rejectDocument('${doc.id}')">
              <i class="bi bi-x-lg"></i><span>Reject</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==================================================
// SEARCH & FILTER LOGIC
// ==================================================
function setupTableSearchListeners() {
  const studentSearch = document.getElementById('student-search-input');
  const reviewSearch = document.getElementById('review-search-input');

  if (studentSearch) {
    studentSearch.addEventListener('input', () => {
      const val = studentSearch.value.trim().toLowerCase();
      const filtered = cachedStudents.filter(s => 
        s.name.toLowerCase().includes(val) || 
        s.email.toLowerCase().includes(val) || 
        s.id.toLowerCase().includes(val)
      );
      renderStudentsTable(filtered);
    });
  }

  if (reviewSearch) {
    reviewSearch.addEventListener('input', () => {
      const val = reviewSearch.value.trim().toLowerCase();
      const filtered = cachedPendingDocs.filter(d => 
        d.fileName.toLowerCase().includes(val) || 
        (d.studentName && d.studentName.toLowerCase().includes(val)) ||
        d.id.toLowerCase().includes(val)
      );
      renderPendingTable(filtered);
    });
  }
}

// ==================================================
// CHARTS LOGIC
// ==================================================
function initAdminCharts(totalStudents, pending, approved, rejected) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // 1. Verification Doughnut
  const verCtx = document.getElementById('adminVerificationChart');
  if (verCtx) {
    if (adminVerificationChartInstance) {
      adminVerificationChartInstance.destroy();
    }
    
    adminVerificationChartInstance = new Chart(verCtx, {
      type: 'doughnut',
      data: {
        labels: ['Approved', 'Pending', 'Rejected'],
        datasets: [{
          data: [approved, pending, rejected],
          backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? '#0f172a' : '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              font: { family: 'Inter', size: 11 }
            }
          }
        }
      }
    });
  }

  // 2. Registration activity chart
  const regCtx = document.getElementById('adminRegChart');
  if (regCtx) {
    if (adminRegChartInstance) {
      adminRegChartInstance.destroy();
    }

    const regData = [
      Math.max(0, totalStudents - 5),
      Math.max(0, totalStudents - 4),
      Math.max(0, totalStudents - 2),
      Math.max(0, totalStudents - 1),
      totalStudents
    ];

    adminRegChartInstance = new Chart(regCtx, {
      type: 'bar',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Current'],
        datasets: [{
          label: 'Total Students Registered',
          data: regData,
          backgroundColor: '#2563EB',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: 'Inter', size: 10 }, stepSize: 1 }
          }
        }
      }
    });
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
