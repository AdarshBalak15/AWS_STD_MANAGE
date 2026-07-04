/* 
==================================================
STUDENT REGISTER JAVASCRIPT: js/register.js
Simplified AWS Student Management System Frontend
==================================================
*/

document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('profile-upload-zone');
  const fileInput = document.getElementById('register-photo');
  const previewContainer = document.getElementById('profile-preview-container');
  const previewImg = document.getElementById('profile-photo-preview');
  const uploadPlaceholder = document.getElementById('upload-placeholder');
  const removeBtn = document.getElementById('remove-preview');
  
  let base64Photo = ""; // Cached base64 photo

  // ==================================================
  // PHOTO UPLOAD ZONE LOGIC
  // ==================================================
  if (uploadZone) {
    uploadZone.addEventListener('click', (e) => {
      if (e.target.closest('#remove-preview')) return;
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
        handleImageSelection(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleImageSelection(e.target.files[0]);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetPhotoUpload();
    });
  }

  function handleImageSelection(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Format Error', 'Please upload a valid image file (PNG/JPG/JPEG).', 'danger');
      return;
    }

    if (file.size > 1024 * 1024) { // 1MB Limit
      showToast('Size Limit Exceeded', 'Profile photo must be smaller than 1MB.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      base64Photo = e.target.result;
      previewImg.src = base64Photo;
      uploadPlaceholder.style.display = 'none';
      previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  function resetPhotoUpload() {
    base64Photo = "";
    fileInput.value = "";
    previewImg.src = "#";
    previewContainer.style.display = 'none';
    uploadPlaceholder.style.display = 'block';
  }

  // ==================================================
  // PASSWORD SHOW / HIDE TOGGLES
  // ==================================================
  setupPasswordToggle('togglePasswordRegister', 'register-password');
  setupPasswordToggle('toggleConfirmPasswordRegister', 'register-confirm-password');

  function setupPasswordToggle(toggleId, inputId) {
    const btn = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (btn && input) {
      btn.addEventListener('click', () => {
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        const icon = btn.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-eye');
          icon.classList.toggle('fa-eye-slash');
        }
      });
    }
  }

  // ==================================================
  // VALIDATION & SUBMISSION
  // ==================================================
  const registerForm = document.getElementById('student-register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('register-name');
      const emailInput = document.getElementById('register-email');
      const passwordInput = document.getElementById('register-password');
      const confirmInput = document.getElementById('register-confirm-password');

      // Clear validation state
      const inputs = [nameInput, emailInput, passwordInput, confirmInput];
      inputs.forEach(input => input.classList.remove('is-invalid'));

      let isValid = true;

      // Validations
      if (nameInput.value.trim().length < 3) { nameInput.classList.add('is-invalid'); isValid = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) { emailInput.classList.add('is-invalid'); isValid = false; }
      if (passwordInput.value.length < 6) { passwordInput.classList.add('is-invalid'); isValid = false; }
      if (passwordInput.value !== confirmInput.value) { confirmInput.classList.add('is-invalid'); isValid = false; }

      if (!isValid) {
        showToast('Registration Blocked', 'Please fill in all details correctly.', 'warning');
        return;
      }

      showLoader();
      try {
        const payload = {
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          password: passwordInput.value,
          photo: base64Photo
        };

        const data = await fetchAPI('/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        // Set session
        localStorage.setItem('sms_token', data.token);
        localStorage.setItem('sms_current_student', JSON.stringify(data.student));

        showToast('Account Created', 'Registration successful! Launching dashboard...', 'success');

        setTimeout(() => {
          hideLoader();
          window.location.href = 'student-dashboard.html';
        }, 1200);
      } catch (err) {
        hideLoader();
        showToast('Registration Failed', err.message || 'Server error occurred.', 'danger');
      }
    });
  }
});
