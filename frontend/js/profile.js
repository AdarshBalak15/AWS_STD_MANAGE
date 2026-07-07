/* 
==================================================
STUDENT PROFILE JAVASCRIPT: js/profile.js
Simplified AWS Student Management System Frontend
==================================================
*/

document.addEventListener('DOMContentLoaded', () => {
  // Load Active Student Context
  const currentStudent = JSON.parse(localStorage.getItem('sms_current_student'));
  if (!currentStudent) {
    window.location.href = 'student-login.html';
    return;
  }

  // Bind Global Navbar User Info
  const navName = document.getElementById('nav-student-name');
  if (navName) navName.textContent = currentStudent.name;

  const navEmail = document.getElementById('nav-student-email');
  if (navEmail) navEmail.textContent = currentStudent.email;

  bindGlobalNavbarAvatar(currentStudent);

  // Initialize page-specific layout bindings
  if (document.getElementById('profile-name')) {
    initProfileViewPage();
  } else if (document.getElementById('edit-profile-form')) {
    initProfileEditPage();
  }
});

// Bind Navbar user avatar
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

// ==================================================
// MY PROFILE VIEW PAGE BINDINGS
// ==================================================
async function initProfileViewPage() {
  buildBreadcrumbs([
    { name: 'Dashboard', url: 'student-dashboard.html' },
    { name: 'My Profile', url: '#' }
  ]);

  showLoader();
  try {
    const data = await fetchAPI('/student/profile');
    const student = data.student;

    // Save/sync cache
    localStorage.setItem('sms_current_student', JSON.stringify(student));

    // Bind Avatar
    const bannerAvatar = document.getElementById('profile-avatar-large');
    if (bannerAvatar) {
      if (student.photo) {
        bannerAvatar.src = student.photo;
      } else {
        bannerAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=2563EB&color=fff&bold=true&size=128`;
      }
    }

    // Bind text details
    document.getElementById('profile-name').textContent = student.name;
    document.getElementById('profile-id').innerHTML = `<i class="fas fa-id-badge text-primary"></i> ${student.id}`;
    
    document.getElementById('detail-name').textContent = student.name;
    document.getElementById('detail-id').textContent = student.id;
    document.getElementById('detail-email').textContent = student.email;

    hideLoader();
  } catch (err) {
    hideLoader();
    showToast('Fetch Error', 'Failed to retrieve student profile.', 'danger');
  }
}

// ==================================================
// PROFILE EDIT PAGE BINDINGS & SAVE ACTIONS
// ==================================================
async function initProfileEditPage() {
  buildBreadcrumbs([
    { name: 'Dashboard', url: 'student-dashboard.html' },
    { name: 'My Profile', url: 'student-profile.html' },
    { name: 'Edit Profile', url: '#' }
  ]);

  const photoInput = document.getElementById('edit-photo-input');
  const photoPreview = document.getElementById('profile-photo-edit-preview');
  
  let localPhotoBase64 = "";

  showLoader();
  try {
    const data = await fetchAPI('/student/profile');
    const student = data.student;
    hideLoader();

    // Populate image previews
    if (photoPreview) {
      if (student.photo) {
        photoPreview.src = student.photo;
        localPhotoBase64 = student.photo;
      } else {
        photoPreview.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=2563EB&color=fff&bold=true&size=128`;
      }
    }

    // Pre-fill inputs
    const nameInp = document.getElementById('edit-name');
    const emailInp = document.getElementById('edit-email');
    const passwordInp = document.getElementById('edit-password');

    if (nameInp) nameInp.value = student.name;
    if (emailInp) emailInp.value = student.email;

    // File input changes
    if (photoInput && photoPreview) {
      photoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          
          if (!file.type.startsWith('image/')) {
            showToast('Format Error', 'Please select an image file (PNG/JPG/JPEG).', 'danger');
            return;
          }

          if (file.size > 1024 * 1024) { // 1MB
            showToast('Size Limit Exceeded', 'Profile photo must be smaller than 1MB.', 'warning');
            return;
          }

          const reader = new FileReader();
          reader.onload = (ev) => {
            localPhotoBase64 = ev.target.result;
            photoPreview.src = localPhotoBase64;
            showToast('Photo Loaded', 'Profile photo preview updated.', 'info');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Form Submit Handler
    const editForm = document.getElementById('edit-profile-form');
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Clear validations
        nameInp.classList.remove('is-invalid');
        emailInp.classList.remove('is-invalid');
        if (passwordInp) passwordInp.classList.remove('is-invalid');

        let isValid = true;

        if (!nameInp.value || nameInp.value.trim().length < 3) { nameInp.classList.add('is-invalid'); isValid = false; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInp.value.trim())) { emailInp.classList.add('is-invalid'); isValid = false; }
        if (passwordInp && passwordInp.value && passwordInp.value.length < 6) { passwordInp.classList.add('is-invalid'); isValid = false; }

        if (!isValid) {
          showToast('Save Blocked', 'Please fix form entries errors.', 'warning');
          return;
        }

        showLoader();
        try {
          const payload = {
            name: nameInp.value.trim(),
            email: emailInp.value.trim(),
            password: passwordInp ? passwordInp.value : '',
            photo: localPhotoBase64
          };

          const result = await fetchAPI('/student/profile', {
            method: 'PUT',
            body: JSON.stringify(payload)
          });

          // Sync cache
          localStorage.setItem('sms_current_student', JSON.stringify(result.student));
          
          showToast('Changes Saved', 'Student profile details successfully updated.', 'success');
          setTimeout(() => {
            hideLoader();
            window.location.href = 'student-profile.html';
          }, 1000);
        } catch (err) {
          hideLoader();
          showToast('Save Failed', err.message || 'Failed to update credentials.', 'danger');
        }
      });
    }

  } catch (err) {
    hideLoader();
    showToast('Fetch Error', 'Failed to retrieve profile credentials.', 'danger');
  }
}
