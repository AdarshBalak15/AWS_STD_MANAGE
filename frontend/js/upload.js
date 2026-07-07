/* 
==================================================
STUDENT UPLOAD JAVASCRIPT: js/upload.js
Simplified AWS Student Management System Frontend
==================================================
*/

document.addEventListener('DOMContentLoaded', () => {
  buildBreadcrumbs([
    { name: 'Dashboard', url: 'student-dashboard.html' },
    { name: 'Upload Documents', url: '#' }
  ]);

  const currentStudent = JSON.parse(localStorage.getItem('sms_current_student'));
  if (!currentStudent) {
    window.location.href = 'student-login.html';
    return;
  }

  const navName = document.getElementById('nav-student-name');
  if (navName) navName.textContent = currentStudent.name;

  const navEmail = document.getElementById('nav-student-email');
  if (navEmail) navEmail.textContent = currentStudent.email;

  bindGlobalNavbarAvatar(currentStudent);

  loadDocumentsList();
  initFileSelectionComponents();
  initUploadFormHandler();
});

function bindGlobalNavbarAvatar(student) {
  const avatars = document.querySelectorAll('#nav-avatar');
  avatars.forEach(avatar => {
    if (student.photo) {
      avatar.src = student.photo;
    } else {
      avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=2563EB&color=fff&bold=true`;
    }
  });
}

let selectedFile = null;

// ==================================================
// FILE SELECTION LOGIC
// ==================================================
function initFileSelectionComponents() {
  const uploadZone = document.getElementById('doc-upload-zone');
  const fileInput = document.getElementById('doc-file-input');
  const placeholder = document.getElementById('doc-placeholder');
  const selectedContainer = document.getElementById('doc-selected-container');
  const selectedName = document.getElementById('doc-selected-name');
  const selectedDetails = document.getElementById('doc-selected-details');
  const removeBtn = document.getElementById('remove-selected-doc');

  if (uploadZone) {
    uploadZone.addEventListener('click', () => {
      fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--primary-color)';
      uploadZone.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.style.borderColor = 'var(--border-color)';
      uploadZone.style.backgroundColor = 'var(--bg-color)';
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'var(--border-color)';
      uploadZone.style.backgroundColor = 'var(--bg-color)';
      if (e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelected(e.target.files[0]);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetFilePicker();
    });
  }

  function handleFileSelected(file) {
    if (!file.name.toLowerCase().endswith('.pdf')) {
      showToast('Format Blocked', 'Only PDF documents are supported.', 'danger');
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB
      showToast('Size Blocked', 'File exceeds 2MB limit.', 'warning');
      return;
    }

    selectedFile = file;
    selectedName.textContent = file.name;
    
    const sizeString = file.size > 1024 * 1024 
      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` 
      : `${(file.size / 1024).toFixed(0)} KB`;
    
    selectedDetails.textContent = `PDF Document • ${sizeString}`;
    placeholder.style.display = 'none';
    selectedContainer.style.display = 'block';
  }
}

// Add simple polyfill in case endswith is not on String.prototype
if (!String.prototype.endswith) {
  String.prototype.endswith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
  };
}

function resetFilePicker() {
  selectedFile = null;
  const inp = document.getElementById('doc-file-input');
  if (inp) inp.value = "";
  const placeholder = document.getElementById('doc-placeholder');
  const selectedContainer = document.getElementById('doc-selected-container');
  if (placeholder) placeholder.style.display = 'block';
  if (selectedContainer) selectedContainer.style.display = 'none';
}

// ==================================================
// HANDLE DOCUMENT SUBMISSION
// ==================================================
function initUploadFormHandler() {
  const form = document.getElementById('doc-upload-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      showToast('File Required', 'Please select a PDF document first.', 'warning');
      return;
    }

    const progressWrapper = document.getElementById('upload-progress-wrapper');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressPercent = document.getElementById('upload-progress-percentage');
    
    progressWrapper.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressPercent.textContent = '0%';

    let progress = 0;
    const interval = setInterval(async () => {
      progress += Math.floor(Math.random() * 20) + 15;
      if (progress >= 90) {
        progress = 90;
        clearInterval(interval);
        
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
          const data = await fetchAPI('/upload/upload', {
            method: 'POST',
            body: formData
          });

          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';

          setTimeout(() => {
            progressWrapper.style.display = 'none';
            resetFilePicker();
            showToast('Upload Successful', `'${data.document.fileName}' uploaded to S3.`, 'success');
            loadDocumentsList();
          }, 300);
        } catch (err) {
          progressWrapper.style.display = 'none';
          showToast('Upload Failed', err.message || 'Server error during upload.', 'danger');
        }
      } else {
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        progressPercent.textContent = `${progress}%`;
      }
    }, 150);
  });
}

// ==================================================
// RENDER UPLOADED DOCUMENTS HISTORY
// ==================================================
async function loadDocumentsList() {
  const container = document.getElementById('my-documents-container');
  if (!container) return;

  try {
    const data = await fetchAPI('/upload/documents');
    const myDocs = data.documents || [];

    if (myDocs.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5 text-secondary border rounded-3 p-4 bg-light-subtle" style="border-color: var(--border-color) !important;">
          <i class="bi bi-folder2-open opacity-25 mb-3 d-block" style="font-size:3.5rem;"></i>
          <h6 class="fw-semibold">No Documents Uploaded</h6>
          <p class="small text-secondary mb-0">Use the uploader panel to submit certificates for AWS verification.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = myDocs.map(doc => {
      let badgeClass = 'pending';
      if (doc.status === 'Approved') badgeClass = 'approved';
      if (doc.status === 'Rejected') badgeClass = 'rejected';

      const deleteBtn = doc.status === 'Approved'
        ? ''
        : `<button class="btn btn-outline-danger btn-sm rounded-pill px-3" onclick="deleteDocument('${doc.id}')">
            <i class="bi bi-trash-fill me-1"></i>Delete
           </button>`;

      return `
        <div class="glass-card hover-lift p-3 mb-3">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            
            <div class="d-flex gap-3 align-items-center">
              <div class="bg-primary-subtle text-primary rounded-3 d-flex align-items-center justify-content-center" style="width:48px; height:48px; font-size:1.5rem; flex-shrink:0;">
                <i class="bi bi-file-earmark-pdf-fill"></i>
              </div>
              
              <div style="min-width:0;">
                <h6 class="fw-bold mb-1 text-truncate text-primary" style="font-size:0.95rem;" title="${escapeHTML(doc.fileName)}">
                  ${escapeHTML(doc.fileName)}
                </h6>
                <div class="text-secondary small" style="font-size: 0.75rem;">
                  <span>ID: <strong>${doc.id}</strong></span>
                </div>
              </div>
            </div>

            <span class="badge-custom ${badgeClass} align-self-start">
              <i class="bi ${doc.status === 'Approved' ? 'bi-check-circle-fill' : doc.status === 'Rejected' ? 'bi-x-circle-fill' : 'bi-hourglass-split'}"></i>
              <span>${doc.status}</span>
            </span>

          </div>

          <div class="d-flex justify-content-end gap-2 mt-3 pt-2 border-top" style="border-color: var(--border-color) !important;">
            <button class="btn btn-light btn-sm rounded-pill px-3" onclick="previewDocument('${doc.id}', '${doc.file_path}')">
              <i class="bi bi-eye-fill me-1"></i>Preview
            </button>
            ${deleteBtn}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast('Error', 'Failed to retrieve uploaded documents.', 'danger');
  }
}

// Preview File Trigger
window.previewDocument = function(id, fileUrl) {
  const renderArea = document.getElementById('preview-render-area');
  const label = document.getElementById('documentPreviewModalLabel');
  
  if (!renderArea || !label) return;

  label.textContent = `Preview Document`;
  renderArea.innerHTML = "";

  if (fileUrl.startsWith('http') || fileUrl.endsWith('.pdf') || fileUrl.includes('uploads')) {
    renderArea.innerHTML = `<iframe src="${fileUrl}" width="100%" height="500px" style="border:none; border-radius:10px;"></iframe>`;
  } else {
    renderArea.innerHTML = `
      <div class="text-white text-center py-5">
        <i class="bi bi-filetype-pdf text-warning mb-3" style="font-size:4rem;"></i>
        <h5>${id}</h5>
        <a href="${fileUrl}" target="_blank" class="btn btn-premium rounded-pill px-4 mt-2">
          <i class="bi bi-download-button-fill me-1"></i>Download & View
        </a>
      </div>
    `;
  }

  const modal = new bootstrap.Modal(document.getElementById('documentPreviewModal'));
  modal.show();
};

// Delete Trigger
window.deleteDocument = async function(id) {
  const confirmDel = confirm("Are you sure you want to delete this document upload?");
  if (!confirmDel) return;

  try {
    await fetchAPI(`/upload/documents/${id}`, { method: 'DELETE' });
    showToast('File Removed', 'Document has been deleted.', 'info');
    loadDocumentsList();
  } catch (err) {
    showToast('Deletion Failed', err.message || 'Server error occurred during deletion.', 'danger');
  }
};
