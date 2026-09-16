/**
 * NAUKRI-STYLE HOME PAGE LOGIC & INTERACTION CONTROLLER
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------- REFERENCES ----------------
    const regForm = document.getElementById('naukri-register-form');
    const nameInput = document.getElementById('reg-fullname');
    const emailInput = document.getElementById('reg-email');
    const passwordInput = document.getElementById('reg-password');
    const phoneInput = document.getElementById('reg-phone');
    const togglePwdBtn = document.getElementById('toggle-pwd-btn');
    const submitBtn = document.getElementById('btn-register-submit');
    const workTiles = document.querySelectorAll('.work-status-tile');
    const workStatusInput = document.getElementById('reg-work-status');
    const whatsappChk = document.getElementById('reg-whatsapp');

    // Login modal references
    const loginModal = document.getElementById('login-modal');
    const btnOpenLogin = document.getElementById('btn-open-login');
    const btnCloseLogin = document.getElementById('btn-close-login');
    const modalLoginForm = document.getElementById('modal-login-form');
    const modalLoginEmail = document.getElementById('modal-login-email');
    const modalLoginPwd = document.getElementById('modal-login-password');
    const modalTogglePwd = document.getElementById('modal-toggle-pwd');
    const btnModalLoginSubmit = document.getElementById('btn-modal-login-submit');

    // Google Sign-in button
    const btnGoogle = document.getElementById('btn-google-signup');

    // ---------------- 1. WORK STATUS SELECTOR ----------------
    workTiles.forEach(tile => {
        tile.addEventListener('click', () => {
            workTiles.forEach(t => t.classList.remove('active'));
            tile.classList.add('active');
            const status = tile.getAttribute('data-status');
            if (workStatusInput) {
                workStatusInput.value = status;
            }
        });
    });

    // ---------------- 2. PASSWORD TOGGLE ----------------
    if (togglePwdBtn && passwordInput) {
        togglePwdBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            const icon = togglePwdBtn.querySelector('i');
            if (icon) {
                icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }
            togglePwdBtn.setAttribute('title', isPassword ? 'Hide Password' : 'Show Password');
        });
    }

    if (modalTogglePwd && modalLoginPwd) {
        modalTogglePwd.addEventListener('click', () => {
            const isPassword = modalLoginPwd.type === 'password';
            modalLoginPwd.type = isPassword ? 'text' : 'password';
            const icon = modalTogglePwd.querySelector('i');
            if (icon) {
                icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }
        });
    }

    // ---------------- 3. ERROR HELPERS ----------------
    function clearErrors() {
        document.querySelectorAll('.error-text').forEach(el => {
            el.textContent = '';
            el.classList.remove('show');
        });
        document.querySelectorAll('.form-input').forEach(el => {
            el.classList.remove('is-error');
        });
    }

    function setError(inputId, message) {
        const input = document.getElementById(inputId);
        const errorEl = document.getElementById(`${inputId}-error`);
        if (input) {
            input.classList.add('is-error');
        }
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('show');
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // ---------------- 4. REGISTRATION SUBMIT ----------------
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors();

            const fullName = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';
            const phone = phoneInput ? phoneInput.value.trim() : '';
            const workStatus = workStatusInput ? workStatusInput.value : 'fresher';

            let hasError = false;

            if (!fullName || fullName.length < 2) {
                setError('reg-fullname', 'Please enter your full name (minimum 2 characters)');
                hasError = true;
            }

            if (!email || !isValidEmail(email)) {
                setError('reg-email', 'Please enter a valid email address');
                hasError = true;
            }

            if (!password || password.length < 6) {
                setError('reg-password', 'Password must be at least 6 characters long');
                hasError = true;
            }

            if (!phone || phone.replace(/\D/g, '').length < 10) {
                setError('reg-phone', 'Please enter a valid 10-digit mobile number');
                hasError = true;
            }

            if (hasError) return;

            // Submit Button Loading state
            if (submitBtn) {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
            }

            try {
                // Save work status preference in local storage for profile customization
                localStorage.setItem(`user_work_status_${email.toLowerCase()}`, workStatus);

                if (window.auth && typeof window.auth.register === 'function') {
                    const response = await window.auth.register({
                        fullName: fullName,
                        email: email,
                        phone: `+91 ${phone}`,
                        password: password,
                        role: 'seeker'
                    });

                    showNotification(`Account created successfully! Welcome, ${response.user.fullName || fullName}`, 'success');
                    
                    const redirectUrl = `seeker-dashboard.html?name=${encodeURIComponent(fullName)}&email=${encodeURIComponent(email)}&role=seeker&phone=${encodeURIComponent(phone)}&status=${encodeURIComponent(workStatus)}`;
                    
                    setTimeout(() => {
                        window.location.href = redirectUrl;
                    }, 800);
                } else {
                    // Fallback local storage registration
                    const mockUser = {
                        id: 'usr_' + Date.now(),
                        fullName: fullName,
                        email: email,
                        phone: `+91 ${phone}`,
                        role: 'seeker',
                        workStatus: workStatus
                    };
                    localStorage.setItem('currentUser', JSON.stringify(mockUser));
                    showNotification(`Account created! Welcome, ${fullName}`, 'success');
                    setTimeout(() => {
                        window.location.href = 'seeker-dashboard.html';
                    }, 800);
                }
            } catch (err) {
                console.error("Registration error:", err);
                showNotification(err.message || 'Registration failed. Please try again.', 'error');
                if (err.message && err.message.toLowerCase().includes('already registered')) {
                    setError('reg-email', err.message);
                } else {
                    setError('reg-fullname', err.message);
                }
            } finally {
                if (submitBtn) {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // ---------------- 5. GOOGLE SIGN-IN HANDLER ----------------
    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            if (window.auth && typeof window.auth.loginWithProvider === 'function') {
                try {
                    await window.auth.loginWithProvider('google');
                } catch (err) {
                    console.log('Google Auth prompt fallback');
                    mockGoogleSignIn();
                }
            } else {
                mockGoogleSignIn();
            }
        });
    }

    function mockGoogleSignIn() {
        const dummyEmail = 'user.google@gmail.com';
        const dummyName = 'Google Candidate';
        const mockUser = {
            id: 'usr_g_' + Date.now(),
            fullName: dummyName,
            email: dummyEmail,
            role: 'seeker',
            workStatus: 'fresher'
        };
        localStorage.setItem('currentUser', JSON.stringify(mockUser));
        showNotification('Signing in with Google...', 'info');
        setTimeout(() => {
            window.location.href = `seeker-dashboard.html?name=${encodeURIComponent(dummyName)}&email=${encodeURIComponent(dummyEmail)}&role=seeker`;
        }, 900);
    }

    // ---------------- 6. LOGIN MODAL LOGIC ----------------
    if (btnOpenLogin && loginModal) {
        btnOpenLogin.addEventListener('click', (e) => {
            e.preventDefault();
            loginModal.classList.add('active');
            if (modalLoginEmail) modalLoginEmail.focus();
        });
    }

    if (btnCloseLogin && loginModal) {
        btnCloseLogin.addEventListener('click', () => {
            loginModal.classList.remove('active');
        });
    }

    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                loginModal.classList.remove('active');
            }
        });
    }

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && loginModal && loginModal.classList.contains('active')) {
            loginModal.classList.remove('active');
        }
    });

    // Demo Fill Credentials Helper
    window.quickFillLogin = function(role) {
        if (!modalLoginEmail || !modalLoginPwd) return;
        if (role === 'seeker') {
            modalLoginEmail.value = 'seeker@smartjob.com';
            modalLoginPwd.value = 'MyPassword123';
        } else if (role === 'employer') {
            modalLoginEmail.value = 'employer@smartjob.com';
            modalLoginPwd.value = 'Company@123';
        } else if (role === 'admin') {
            modalLoginEmail.value = 'admin@smartjob.com';
            modalLoginPwd.value = 'Admin@1234';
        }
    };

    // Modal Login Form Submit
    if (modalLoginForm) {
        modalLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = modalLoginEmail.value.trim();
            const password = modalLoginPwd.value;

            if (!email || !password) {
                showNotification('Please enter both email and password', 'error');
                return;
            }

            if (btnModalLoginSubmit) {
                btnModalLoginSubmit.disabled = true;
                btnModalLoginSubmit.textContent = 'Signing in...';
            }

            try {
                if (window.auth && typeof window.auth.login === 'function') {
                    const res = await window.auth.login(email, password, true);
                    showNotification(`Welcome back, ${res.user.fullName}!`, 'success');
                    const dest = window.auth.getRoleRedirectUrl(res.user.role);
                    setTimeout(() => {
                        window.location.href = dest;
                    }, 800);
                } else {
                    showNotification('Signed in successfully!', 'success');
                    setTimeout(() => {
                        window.location.href = 'seeker-dashboard.html';
                    }, 800);
                }
            } catch (err) {
                showNotification(err.message || 'Login failed. Please check your credentials.', 'error');
            } finally {
                if (btnModalLoginSubmit) {
                    btnModalLoginSubmit.disabled = false;
                    btnModalLoginSubmit.textContent = 'Sign In';
                }
            }
        });
    }

    // ---------------- 7. TOAST NOTIFICATION HELPER ----------------
    function showNotification(message, type = 'info') {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:10px; pointer-events:none;';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb';
        toast.style.cssText = `background:${bg}; color:#fff; padding:12px 20px; border-radius:10px; font-size:13.5px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,0.18); display:flex; align-items:center; gap:10px; pointer-events:auto; transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1); transform:translateY(20px); opacity:0;`;
        
        const iconClass = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
        toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
        
        toastContainer.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.transform = 'translateY(20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
});
