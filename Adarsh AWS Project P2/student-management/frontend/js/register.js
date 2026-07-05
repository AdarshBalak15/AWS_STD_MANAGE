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
  
  const stepAvatar = document.getElementById('step-avatar-dot');
  const stepInfo = document.getElementById('step-info-dot');
  const stepVerify = document.getElementById('step-verify-dot');
  
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
      
      // Update Step Status
      if (stepAvatar) stepAvatar.classList.add('active');
      if (stepInfo) stepInfo.classList.add('active');
    };
    reader.readAsDataURL(file);
  }

  function resetPhotoUpload() {
    base64Photo = "";
    fileInput.value = "";
    previewImg.src = "#";
    previewContainer.style.display = 'none';
    uploadPlaceholder.style.display = 'block';
    
    // Reset Step Status
    if (stepInfo) stepInfo.classList.remove('active');
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
          icon.classList.toggle('bi-eye-fill');
          icon.classList.toggle('bi-eye-slash-fill');
        }
      });
    }
  }

  // ==================================================
  // PASSWORD STRENGTH METER
  // ==================================================
  const pwInput = document.getElementById('register-password');
  const strengthContainer = document.getElementById('register-pw-strength-container');
  const strengthBar = document.getElementById('register-pw-strength-bar');
  const strengthText = document.getElementById('register-pw-strength-text');

  if (pwInput && strengthBar && strengthText && strengthContainer) {
    pwInput.addEventListener('input', () => {
      const val = pwInput.value;
      if (!val) {
        strengthContainer.style.display = 'none';
        return;
      }
      
      strengthContainer.style.display = 'block';
      let score = 0;
      
      if (val.length >= 6) score += 1;
      if (val.length >= 10) score += 1;
      if (/[A-Z]/.test(val)) score += 1;
      if (/[0-9]/.test(val)) score += 1;
      if (/[^A-Za-z0-9]/.test(val)) score += 1;

      // Update UI Based on Score
      let percentage = (score / 5) * 100;
      strengthBar.style.width = `${percentage}%`;
      
      if (score <= 2) {
        strengthBar.className = 'strength-bar bg-danger';
        strengthText.textContent = 'Password Strength: Weak';
        strengthText.className = 'strength-text text-danger';
      } else if (score <= 4) {
        strengthBar.className = 'strength-bar bg-warning';
        strengthText.textContent = 'Password Strength: Medium';
        strengthText.className = 'strength-text text-warning';
      } else {
        strengthBar.className = 'strength-bar bg-success';
        strengthText.textContent = 'Password Strength: Strong & Secure';
        strengthText.className = 'strength-text text-success';
      }
    });
  }

  // ==================================================
  // VALIDATION & SUBMISSION
  // ==================================================
  const registerForm = document.getElementById('student-register-form');
  if (registerForm) {
    // Auto trigger step 2 if typing details
    const textInputs = ['register-name', 'register-email', 'register-password'];
    textInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('focus', () => {
          if (stepInfo) stepInfo.classList.add('active');
        });
      }
    });

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

      if (stepVerify) stepVerify.classList.add('active');
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
        if (stepVerify) stepVerify.classList.remove('active');
        hideLoader();
        showToast('Registration Failed', err.message || 'Server error occurred.', 'danger');
      }
    });
  }
});
