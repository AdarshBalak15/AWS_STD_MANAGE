/* 
==================================================
STUDENT LOGIN JAVASCRIPT: js/login.js
Simplified AWS Student Management System Frontend
==================================================
*/

document.addEventListener('DOMContentLoaded', () => {
  // Password Visibility Toggle
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('login-password');

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      const icon = togglePassword.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
      }
    });
  }

  // Handle Form Submission
  const loginForm = document.getElementById('student-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const emailInput = document.getElementById('login-email');
      const passwordVal = passwordInput.value;
      const emailVal = emailInput.value.trim();

      // Reset validation states
      emailInput.classList.remove('is-invalid');
      passwordInput.classList.remove('is-invalid');

      let isValid = true;

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        emailInput.classList.add('is-invalid');
        isValid = false;
      }

      // Validate password length
      if (passwordVal.length < 6) {
        passwordInput.classList.add('is-invalid');
        isValid = false;
      }

      if (!isValid) {
        showToast('Login Failed', 'Please review highlighted input errors', 'danger');
        return;
      }

      showLoader();
      try {
        const data = await fetchAPI('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: emailVal,
            password: passwordVal
          })
        });

        // Set session details
        localStorage.setItem('sms_token', data.token);
        localStorage.setItem('sms_current_student', JSON.stringify(data.user));
        
        showToast('Success', `Welcome back, ${data.user.name}!`, 'success');
        
        setTimeout(() => {
          hideLoader();
          window.location.href = 'student-dashboard.html';
        }, 1000);
      } catch (err) {
        hideLoader();
        showToast('Authentication Error', err.message || 'Invalid login details.', 'danger');
        passwordInput.classList.add('is-invalid');
      }
    });
  }
});
