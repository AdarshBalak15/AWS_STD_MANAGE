/* 
==================================================
STUDENT DASHBOARD JAVASCRIPT: js/dashboard.js
Simplified AWS Student Management System Frontend
==================================================
*/

let trendChartInstance = null;
let statusChartInstance = null;

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
  const skeleton = document.getElementById('table-skeleton');
  const tableWrapper = document.getElementById('table-wrapper');
  
  if (skeleton) skeleton.style.display = 'block';
  if (tableWrapper) tableWrapper.style.display = 'none';

  try {
    const data = await fetchAPI('/upload/documents');
    const myDocs = data.documents || [];

    // Calculate Metrics
    const uploadedCount = myDocs.length;
    const approvedCount = myDocs.filter(d => d.status === 'Approved').length;
    const pendingCount = myDocs.filter(d => d.status === 'Pending').length;
    const rejectedCount = myDocs.filter(d => d.status === 'Rejected').length;

    // Update DOM Counts
    document.getElementById('stat-uploaded').textContent = uploadedCount;
    document.getElementById('stat-pending').textContent = pendingCount;
    document.getElementById('stat-approved').textContent = approvedCount;

    // Render Recent Activity Table
    const tbody = document.getElementById('student-activities-tbody');
    if (tbody) {
      if (uploadedCount === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center text-secondary py-4">
              <i class="bi bi-file-earmark-pdf text-muted opacity-50 me-2" style="font-size:1.5rem;"></i>
              No files uploaded yet. Click "New Upload" to get started.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = myDocs.map(doc => {
          let badgeClass = 'pending';
          if (doc.status === 'Approved') badgeClass = 'approved';
          if (doc.status === 'Rejected') badgeClass = 'rejected';

          const fileUrl = doc.file_path || '#';
          const shortUrl = fileUrl.startsWith('http') ? 'View S3 Storage' : 'View Local Storage';

          return `
            <tr>
              <td class="fw-bold">
                <div class="d-flex align-items-center gap-2">
                  <i class="bi bi-file-earmark-pdf-fill text-primary"></i>
                  <span>${escapeHTML(doc.fileName)}</span>
                </div>
              </td>
              <td>
                <a href="${fileUrl}" target="_blank" class="text-decoration-none d-inline-flex align-items-center gap-1">
                  <i class="bi bi-box-arrow-up-right"></i>
                  <span>${shortUrl}</span>
                </a>
              </td>
              <td>
                <span class="badge-custom ${badgeClass}">
                  <i class="bi ${doc.status === 'Approved' ? 'bi-check-circle-fill' : doc.status === 'Rejected' ? 'bi-x-circle-fill' : 'bi-hourglass-split'}"></i>
                  <span>${doc.status}</span>
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Initialize Charts
    initStudentCharts(uploadedCount, pendingCount, approvedCount, rejectedCount);

    if (skeleton) skeleton.style.display = 'none';
    if (tableWrapper) tableWrapper.style.display = 'block';

  } catch (err) {
    if (skeleton) skeleton.style.display = 'none';
    if (tableWrapper) tableWrapper.style.display = 'block';
    showToast('Data Error', 'Failed to retrieve dashboard metrics.', 'danger');
  }
}

// Render dynamic charts
function initStudentCharts(uploaded, pending, approved, rejected) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  // 1. Status Doughnut Chart
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
    if (statusChartInstance) {
      statusChartInstance.destroy();
    }
    
    statusChartInstance = new Chart(statusCtx, {
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

  // 2. Upload Trend Line Chart
  const trendCtx = document.getElementById('uploadTrendChart');
  if (trendCtx) {
    if (trendChartInstance) {
      trendChartInstance.destroy();
    }

    // Mock timeline points based on count
    const baseCount = Math.max(0, uploaded - 3);
    const chartData = [baseCount, baseCount + 1, baseCount + 1, baseCount + 2, uploaded];

    trendChartInstance = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Current'],
        datasets: [{
          label: 'Total Uploaded PDF Files',
          data: chartData,
          fill: true,
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          borderColor: '#2563EB',
          borderWidth: 2,
          tension: 0.4,
          pointBackgroundColor: '#2563EB'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
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
