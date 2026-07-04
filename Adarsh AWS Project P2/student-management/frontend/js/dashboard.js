/* 
==================================================
STUDENT DASHBOARD JAVASCRIPT: js/dashboard.js
Simplified AWS Student Management System Frontend
==================================================
*/

document.addEventListener('DOMContentLoaded', () => {
  // Set Breadcrumbs
  buildBreadcrumbs([{ name: 'Dashboard', url: 'student-dashboard.html' }]);

  // Load Active Student Context
  const currentStudent = JSON.parse(localStorage.getItem('sms_current_student'));
  if (!currentStudent) {
    window.location.href = 'student-login.html';
    return;
  }

  // Bind Name and Welcome Header
  const studentNameElems = document.querySelectorAll('#nav-student-name, #welcome-student-name');
  studentNameElems.forEach(el => el.textContent = currentStudent.name);

  const emailEl = document.getElementById('nav-student-email');
  if (emailEl) emailEl.textContent = currentStudent.email;

  // Bind Profile Photo
  bindAvatar(currentStudent);

  // Populate Dashboard Metrics and Recent Activities
  loadDashboardData();
});

// Bind avatar image fallback or base64 representation
function bindAvatar(student) {
  const avatars = document.querySelectorAll('#nav-avatar');
  avatars.forEach(avatar => {
    if (student.photo) {
      avatar.src = student.photo;
    } else {
      avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=2563EB&color=fff&bold=true`;
    }
  });
}

// Fetch dashboard data
async function loadDashboardData() {
  try {
    const data = await fetchAPI('/upload/documents');
    const myDocs = data.documents || [];

    // Calculate Metrics
    const uploadedCount = myDocs.length;
    const approvedCount = myDocs.filter(d => d.status === 'Approved').length;
    const pendingCount = myDocs.filter(d => d.status === 'Pending').length;

    // Update DOM Counts
    document.getElementById('stat-uploaded').textContent = uploadedCount;
    document.getElementById('stat-pending').textContent = pendingCount;
    document.getElementById('stat-approved').textContent = approvedCount;

    // Render Recent Activity Table
    const tbody = document.getElementById('student-activities-tbody');
    if (!tbody) return;

    if (uploadedCount === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center text-secondary py-4">
            <i class="fas fa-file-pdf opacity-50 me-2" style="font-size:1.5rem;"></i>
            No files uploaded yet. Click "New Upload" to get started.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = myDocs.map(doc => {
      let badgeClass = 'pending';
      if (doc.status === 'Approved') badgeClass = 'approved';
      if (doc.status === 'Rejected') badgeClass = 'rejected';

      const fileUrl = doc.file_path || '#';
      const shortUrl = fileUrl.startsWith('http') ? 'View on S3' : 'View Local File';

      return `
        <tr>
          <td class="font-weight-bold">
            <div class="d-flex align-items-center gap-2">
              <i class="far fa-file-pdf text-primary opacity-75"></i>
              <span>${escapeHTML(doc.fileName)}</span>
            </div>
          </td>
          <td class="text-secondary">
            <a href="${fileUrl}" target="_blank" class="text-decoration-none"><i class="fas fa-external-link-alt me-1"></i>${shortUrl}</a>
          </td>
          <td>
            <span class="badge-custom ${badgeClass}">
              <i class="fas ${doc.status === 'Approved' ? 'fa-check' : doc.status === 'Rejected' ? 'fa-times' : 'fa-clock'}"></i>
              ${doc.status}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    showToast('Data Error', 'Failed to retrieve dashboard metrics.', 'danger');
  }
}
