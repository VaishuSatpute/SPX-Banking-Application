/* ==========================================================================
   OFFICIAL ENTERPRISE BANK MANAGEMENT SYSTEM - PORTAL CORE LOGIC
   ========================================================================== */

// Removed initDatabase

// Application & Navigation State
let currentUser = null;
let currentOtpCode = '';
let pendingOtpAction = null; // 'LOGIN', 'REGISTER', 'RESET_PASSWORD'
let pendingPayload = null;
let pendingOtpEmail = null;
let otpTimerInterval = null;
let otpExpiryTimestamp = 0;
let viewHistory = ['login']; // Navigation history stack for Back button

const captchas = {
    login: '',
    reg: '',
    reset: ''
};

// DOM Content Loaded Handler
document.addEventListener('DOMContentLoaded', () => {
    setupOtpBoxNavigation();
    checkExistingSession();
    startPortalClock();
    
    // Generate initial CAPTCHA challenges
    generateCaptcha('login');
    generateCaptcha('reg');
    generateCaptcha('reset');

});

/* ==========================================================================
   1. LIVE PORTAL CLOCK
   ========================================================================== */
function startPortalClock() {
    const clockEl = document.getElementById('portal-clock');
    if (!clockEl) return;
    const update = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleString('en-US', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }) + ' IST';
    };
    update();
    setInterval(update, 1000);
}

/* ==========================================================================
   2. INTERACTIVE CAPTCHA GENERATOR (CANVAS BASED)
   ========================================================================== */
function generateCaptcha(type) {
    const canvas = document.getElementById(`${type}-captcha-canvas`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    captchas[type] = code;

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(15, 23, 42, ${0.15 + Math.random() * 0.25})`;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    ctx.font = 'bold 22px "Roboto Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const charWidth = canvas.width / 5;
    for (let i = 0; i < code.length; i++) {
        ctx.save();
        const x = charWidth * i + charWidth / 2;
        const y = canvas.height / 2 + (Math.random() * 4 - 2);
        const angle = (Math.random() * 0.4) - 0.2;

        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = i % 2 === 0 ? '#1d4ed8' : '#0f172a';
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
    }

    for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(15, 23, 42, ${Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    const inputField = document.getElementById(`${type}-captcha-input`);
    if (inputField) inputField.value = '';
}

function validateCaptcha(type) {
    const input = document.getElementById(`${type}-captcha-input`).value.trim().toUpperCase();
    const expected = captchas[type].toUpperCase();
    return input === expected;
}

/* ==========================================================================
   3. VIEW NAVIGATION & BACK BUTTON HISTORY
   ========================================================================== */
function switchView(viewName) {
    if (viewHistory[viewHistory.length - 1] !== viewName) {
        viewHistory.push(viewName);
    }
    
    // Purge Registration State on View Switching
    if (viewName === 'login' || viewName === 'register') {
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.reset();
        
        const registerForm = document.getElementById('register-form');
        if (registerForm) registerForm.reset();
        
        const regError = document.getElementById('reg-error-msg');
        if (regError) {
            regError.style.display = 'none';
            regError.textContent = '';
        }
        
        const loginError = document.getElementById('login-error-msg');
        if (loginError) {
            loginError.style.display = 'none';
            loginError.textContent = '';
        }
        
        // Clear password strength indicator
        if (typeof checkPasswordStrength === 'function') {
            checkPasswordStrength('');
        }
    }

    renderView(viewName);
}

function goBack() {
    if (viewHistory.length > 1) {
        viewHistory.pop(); // Remove current view
        const previousView = viewHistory[viewHistory.length - 1] || 'login';
        renderView(previousView);
    } else {
        renderView('login');
    }
}

function renderView(viewName) {
    const views = ['login-view', 'register-view', 'forgot-password-view', 'dashboard-view'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.classList.remove('view-active');
        }
    });

    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('view-active');
    }

    if (viewName === 'forgot-password') {
        document.getElementById('forgot-password-form-1').classList.remove('hidden');
        document.getElementById('forgot-password-form-2').classList.add('hidden');
    }

    if (viewName === 'login') generateCaptcha('login');
    if (viewName === 'register') generateCaptcha('reg');
    if (viewName === 'forgot-password') generateCaptcha('reset');
}

/* ==========================================================================
   4. PASSWORD UTILITIES
   ========================================================================== */
function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    const eyeOpen = btnEl.querySelector('.eye-open');
    const eyeClosed = btnEl.querySelector('.eye-closed');
    
    if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.classList.add('hidden');
        eyeClosed.classList.remove('hidden');
    } else {
        input.type = 'password';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
    }
}

function checkPasswordStrength(val) {
    const bar = document.getElementById('strength-bar');
    const text = document.getElementById('strength-text');
    let score = 0;

    if (!val) {
        bar.style.width = '0%';
        bar.style.backgroundColor = 'transparent';
        text.textContent = 'Password Rating';
        text.style.color = ''; // Reset the color back to CSS default
        return;
    }

    if (val.length >= 6) score += 25;
    if (val.length >= 10) score += 25;
    if (/[A-Z]/.test(val)) score += 25;
    if (/[0-9!@#$%^&*]/.test(val)) score += 25;

    bar.style.width = `${score}%`;

    if (score <= 25) {
        bar.style.backgroundColor = '#dc2626';
        text.textContent = 'Weak Password';
        text.style.color = '#dc2626';
    } else if (score <= 50) {
        bar.style.backgroundColor = '#d97706';
        text.textContent = 'Moderate Password';
        text.style.color = '#d97706';
    } else if (score <= 75) {
        bar.style.backgroundColor = '#2563eb';
        text.textContent = 'Strong Password';
        text.style.color = '#2563eb';
    } else {
        bar.style.backgroundColor = '#059669';
        text.textContent = 'Bank-Grade Strong Password';
        text.style.color = '#059669';
    }
}

/* ==========================================================================
   5. AUTHENTICATION FORM HANDLERS (WITH CAPTCHA CHECK)
   ========================================================================== */

// 1. LOGIN HANDLER
async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!validateCaptcha('login')) {
        showToast('Invalid Security CAPTCHA code. Please re-enter the code.', 'error');
        generateCaptcha('login');
        return;
    }

    const btn = document.getElementById('btn-login');
    const errorMsgDiv = document.getElementById('login-error-msg');
    
    // Clear previous errors
    errorMsgDiv.style.display = 'none';
    errorMsgDiv.textContent = '';
    
    setButtonLoading(btn, true);

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        
        setButtonLoading(btn, false);

        if (!data.success) {
            // Always show inline error message
            errorMsgDiv.textContent = data.message;
            errorMsgDiv.style.display = 'block';

            if (response.status === 423 && data.lockout && data.remaining_seconds) {
                // --- HTTP 423: ACCOUNT LOCKED ---
                let timeLeft = data.remaining_seconds;
                const loginUser = document.getElementById('login-username');
                const loginPass = document.getElementById('login-password');
                const loginCap = document.getElementById('login-captcha-input');

                // Immediately clear ALL input fields (username, password, captcha)
                loginUser.value = '';
                loginPass.value = '';
                loginCap.value = '';

                // Disable all inputs and the login button
                btn.disabled = true;
                loginUser.disabled = true;
                loginPass.disabled = true;
                loginCap.disabled = true;

                // Re-clear after disable inside rAF to defeat any browser autofill
                // that may fire asynchronously after the initial .value = '' call
                requestAnimationFrame(() => {
                    loginUser.value = '';
                    loginPass.value = '';
                    loginCap.value = '';
                });

                // Real-time countdown: update every 1s
                const lockoutInterval = setInterval(() => {
                    timeLeft--;
                    errorMsgDiv.textContent = `Account locked. Please wait ${timeLeft}s...`;

                    if (timeLeft <= 0) {
                        clearInterval(lockoutInterval);

                        // Clear the error banner
                        errorMsgDiv.style.display = 'none';
                        errorMsgDiv.textContent = '';

                        // Re-enable all inputs and button
                        btn.disabled = false;
                        loginUser.disabled = false;
                        loginPass.disabled = false;
                        loginCap.disabled = false;

                        // Auto-refresh CAPTCHA for a clean retry
                        generateCaptcha('login');
                    }
                }, 1000);

            } else {
                // --- HTTP 401: INCORRECT CREDENTIALS ---
                // Keep username intact, clear password + captcha, refresh CAPTCHA
                const loginPass = document.getElementById('login-password');
                const loginCap = document.getElementById('login-captcha-input');
                loginPass.value = '';
                loginCap.value = '';
                generateCaptcha('login');
            }
            return;
        }

        // Pass email to triggerOtpFlow so the user gets the OTP
        triggerOtpFlow('LOGIN', data.email, { user: data.user });
    } catch (err) {
        setButtonLoading(btn, false);
        showToast('Cannot connect to server', 'error');
    }
}

// 2. REGISTER HANDLER
async function handleRegisterSubmit(e) {
    e.preventDefault();
    const firstName = document.getElementById('reg-firstname').value.trim();
    const lastName = document.getElementById('reg-lastname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!validateCaptcha('reg')) {
        showToast('Invalid Security CAPTCHA code. Please re-enter.', 'error');
        generateCaptcha('reg');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters long', 'error');
        return;
    }

    const btn = document.getElementById('btn-register');
    const errorMsgDiv = document.getElementById('reg-error-msg');
    
    // Clear previous errors
    if (errorMsgDiv) {
        errorMsgDiv.style.display = 'none';
        errorMsgDiv.textContent = '';
    }

    setButtonLoading(btn, true);

    try {
        setButtonLoading(btn, false);
        const payload = { username, email, password, firstName, lastName };
        triggerOtpFlow('REGISTER', email, payload);
    } catch (err) {
        setButtonLoading(btn, false);
        showToast('Cannot connect to server', 'error');
    }
}

// 3. FORGOT PASSWORD STEP 1 HANDLER
function handleForgotPasswordRequest(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();

    if (!validateCaptcha('reset')) {
        showToast('Invalid Security CAPTCHA code. Please re-enter.', 'error');
        generateCaptcha('reset');
        return;
    }

    const btn = document.getElementById('btn-forgot-1');
    setButtonLoading(btn, true);

    setTimeout(() => {
        setButtonLoading(btn, false);
        triggerOtpFlow('RESET_PASSWORD', email, { userEmail: email });
    }, 500);
}

// 4. FORGOT PASSWORD STEP 2 HANDLER
async function handleNewPasswordSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('reset-verified-email').textContent;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    const btn = document.getElementById('btn-forgot-2');
    setButtonLoading(btn, true);

    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: email, password: newPassword })
        });
        
        const data = await response.json();
        setButtonLoading(btn, false);

        // Helper refs for the two password fields and inline error div
        const newPwField = document.getElementById('new-password');
        const confirmPwField = document.getElementById('confirm-new-password');
        const resetErrDiv = document.getElementById('reset-pw-error-msg');

        if (!response.ok || !data.success) {
            if (response.status === 400 && data.error === 'same_password') {
                // Show inline red error directly below Confirm New Password
                resetErrDiv.textContent = data.message;
                resetErrDiv.style.display = 'block';
                // Immediately clear both password fields for a fresh re-entry
                newPwField.value = '';
                confirmPwField.value = '';
                newPwField.focus();
            } else {
                // Generic errors go to toast
                resetErrDiv.style.display = 'none';
                showToast(data.message || 'Password reset failed', 'error');
            }
            return;
        }

        // Clear any residual inline error on success
        resetErrDiv.style.display = 'none';
        resetErrDiv.textContent = '';

        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
        document.getElementById('reset-email').value = '';
        document.getElementById('reset-verified-email').textContent = '';
        
        const resetForm2 = document.getElementById('forgot-password-form-2');
        if (resetForm2) resetForm2.reset();
        
        showToast('Password updated successfully! Please login.', 'success');
        switchView('login');
        
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.reset();
        
    } catch (err) {
        console.error('Password reset error:', err);
        setButtonLoading(btn, false);
        showToast('Cannot connect to server. Please try again later.', 'error');
    }
}

/* ==========================================================================
   6. REAL GMAIL OTP DISPATCH ENGINE
   ========================================================================== */

function maskEmail(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return email || '';
    }

    const [username, domain] = email.split('@');
    let maskedUser = '';

    if (username.length <= 2) {
        maskedUser = username[0] + '*';
    } else if (username.length === 3) {
        maskedUser = username[0] + '*' + username[2];
    } else {
        maskedUser = username.slice(0, 3) + '******';
    }

    return `${maskedUser}@${domain}`;
}

async function triggerOtpFlow(action, email, payload) {
    pendingOtpAction = action;
    pendingPayload = payload;
    pendingOtpEmail = email;
    
    if (action === 'LOGIN' || action === 'RESET_PASSWORD') {
        document.getElementById('otp-target-display').textContent = maskEmail(email);
    } else {
        document.getElementById('otp-target-display').textContent = email;
    }

    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach(box => box.value = '');
    boxes[0].focus();

    document.getElementById('otp-modal-overlay').classList.remove('hidden');

    startOtpTimer();

    await sendRealOtpEmail(email, action);
}

async function sendRealOtpEmail(targetEmail, action) {
    try {
        const bodyData = { email: targetEmail, action: action };
        if (action === 'REGISTER' && typeof pendingPayload !== 'undefined' && pendingPayload && pendingPayload.username) {
            bodyData.username = pendingPayload.username;
        }
        
        const response = await fetch('/api/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            closeOtpModal();
            showToast(data.message || 'Failed to send OTP', 'error');
        }
    } catch (e) {
        closeOtpModal();
        showToast('Backend server unreachable. Cannot send OTP.', 'error');
        console.error('OTP Send error:', e);
    }
}

function closeOtpModal() {
    // 1. Hide the OTP drawer
    const otpDrawer = document.getElementById('otp-modal-overlay');
    if (otpDrawer) {
        otpDrawer.classList.add('hidden');
    }

    // 2. Clear running timer
    if (typeof otpTimerInterval !== 'undefined' && otpTimerInterval) {
        clearInterval(otpTimerInterval);
        otpTimerInterval = null;
    }
    if (typeof otpExpiryTimestamp !== 'undefined') {
        otpExpiryTimestamp = 0;
    }
    pendingOtpEmail = null;

    // 3. Clear all OTP input fields
    document.querySelectorAll('.otp-box, .otp-digit-input, #otp-input').forEach(input => {
        input.value = '';
    });

    // 4. Wipe login / registration form inputs completely
    document.querySelectorAll('form').forEach(form => form.reset());
    
    // Explicit fallback for known IDs
    const fieldIds = [
        'login-username', 'login-password', 'login-captcha-input',
        'reg-firstname', 'reg-lastname', 'reg-email', 'reg-username', 'reg-password', 'reg-captcha-input',
        'reset-email', 'reset-captcha-input'
    ];
    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // 5. Trigger fresh Captcha generation
    if (typeof generateCaptcha === 'function') {
        ['login', 'reg', 'reset'].forEach(type => {
            if (document.getElementById(`${type}-captcha-canvas`)) {
                generateCaptcha(type);
            }
        });
    }
}

function startOtpTimer() {
    if (otpTimerInterval) clearInterval(otpTimerInterval);
    
    const otpDuration = (pendingOtpAction === 'LOGIN') ? 60 : 120;
    otpExpiryTimestamp = Date.now() + otpDuration * 1000;
    
    const wrapper = document.getElementById('resend-wrapper');
    if (wrapper) {
        wrapper.innerHTML = `Resend OTP in <span id="countdown-display"></span>`;
        wrapper.classList.add('resend-disabled');
    }
    
    const proceedBtn = document.getElementById('btn-verify-otp');
    if (proceedBtn) proceedBtn.disabled = false;

    updateOtpTimerDisplay();
    otpTimerInterval = setInterval(updateOtpTimerDisplay, 1000);
}

function updateOtpTimerDisplay() {
    if (!otpExpiryTimestamp) return;
    
    const now = Date.now();
    const timeLeft = Math.max(0, Math.floor((otpExpiryTimestamp - now) / 1000));
    const displaySpan = document.getElementById('countdown-display');
    
    if (displaySpan) {
        if (pendingOtpAction === 'LOGIN') {
            displaySpan.textContent = `${timeLeft}s`;
        } else {
            const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const secs = (timeLeft % 60).toString().padStart(2, '0');
            displaySpan.textContent = `${mins}:${secs}`;
        }
    }

    if (timeLeft <= 0) {
        if (otpTimerInterval) clearInterval(otpTimerInterval);
        otpExpiryTimestamp = 0;
        
        const wrapper = document.getElementById('resend-wrapper');
        if (wrapper) {
            wrapper.innerHTML = `<a href="javascript:void(0)" id="resend-otp-btn" style="color: #38bdf8; font-weight: 600; text-decoration: underline; cursor: pointer;" onclick="resendOtpCode()">Resend OTP</a>`;
            wrapper.classList.remove('resend-disabled');
        }
        
        const proceedBtn = document.getElementById('btn-verify-otp');
        if (proceedBtn) proceedBtn.disabled = true;
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && otpExpiryTimestamp > 0) {
        updateOtpTimerDisplay();
    }
});

async function resendOtpCode() {
    const targetEmail = pendingOtpEmail || document.getElementById('otp-target-display').textContent;
    startOtpTimer();
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach(box => box.value = '');
    boxes[0].focus();

    await sendRealOtpEmail(targetEmail, pendingOtpAction);
}

function setupOtpBoxNavigation() {
    const boxes = document.querySelectorAll('.otp-box');
    boxes.forEach((box, idx) => {
        box.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val.length === 1 && idx < boxes.length - 1) {
                boxes[idx + 1].focus();
            }
            
            let fullCode = '';
            boxes.forEach(b => fullCode += b.value);
            if (fullCode.length === 6) {
                submitOtpVerification();
            }
        });

        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && idx > 0) {
                boxes[idx - 1].focus();
            }
        });

        box.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
            if (/^\d{6}$/.test(pasteData)) {
                for (let i = 0; i < Math.min(pasteData.length, boxes.length); i++) {
                    boxes[i].value = pasteData[i];
                }
                submitOtpVerification();
            }
        });
    });
}

async function submitOtpVerification() {
    const boxes = document.querySelectorAll('.otp-box');
    let enteredCode = '';
    boxes.forEach(b => enteredCode += b.value);

    if (enteredCode.length < 6) {
        showToast('Please enter the full 6-digit OTP code', 'error');
        return;
    }

    const btn = document.getElementById('btn-verify-otp');
    setButtonLoading(btn, true);
    
    const targetEmail = pendingOtpEmail || document.getElementById('otp-target-display').textContent;

    try {
        const response = await fetch('/api/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: targetEmail, otp: enteredCode, action: pendingOtpAction })
        });
        const data = await response.json();
        
        setButtonLoading(btn, false);

        if (!data.success) {
            showToast('Invalid OTP Code. Please check your Gmail inbox.', 'error');
            return;
        }

        closeOtpModal();

        if (pendingOtpAction === 'LOGIN') {
            completeLogin(pendingPayload.user);
        } else if (pendingOtpAction === 'REGISTER') {
            try {
                const regResponse = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pendingPayload)
                });
                const regData = await regResponse.json();
                
                if (regData.success) {
                    showToast('Registration successful! Please log in.', 'success');
                    const regForm = document.getElementById('register-form');
                    if (regForm) regForm.reset();
                    ['reg-firstname', 'reg-lastname', 'reg-email', 'reg-username', 'reg-password', 'reg-captcha-input'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = '';
                    });
                    if (typeof checkPasswordStrength === 'function') checkPasswordStrength('');
                    switchView('login');
                } else {
                    showToast(regData.message || 'Registration failed', 'error');
                }
            } catch (e) {
                showToast('Registration server error', 'error');
            }
        } else if (pendingOtpAction === 'RESET_PASSWORD') {
            document.getElementById('reset-verified-email').textContent = pendingPayload.userEmail;
            document.getElementById('forgot-password-form-1').classList.add('hidden');
            document.getElementById('forgot-password-form-2').classList.remove('hidden');

            // Auto-dismiss the OTP verified banner after 3.5 seconds
            const otpBanner = document.querySelector('#forgot-password-form-2 .step-indicator');
            if (otpBanner) {
                setTimeout(() => {
                    otpBanner.classList.add('fade-out');
                    // Remove from layout after transition completes (400ms)
                    setTimeout(() => { otpBanner.style.display = 'none'; }, 420);
                }, 3500);
            }
        }

    } catch (err) {
        setButtonLoading(btn, false);
        showToast('Cannot connect to server', 'error');
    }
}

/* ==========================================================================
   7. SESSION & DASHBOARD MANAGEMENT
   ========================================================================== */

function completeLogin(user) {
    currentUser = user;
    sessionStorage.setItem('bank_active_session', JSON.stringify(user));
    
    document.getElementById('dash-user-name').textContent = user.name;
    document.getElementById('dash-acc-num').textContent = `ACC: ${user.accountNumber}`;
    document.getElementById('dash-acc-type').textContent = user.accountType || 'Premier Vault Account';
    const db1 = document.getElementById('dash-balance');
    if (db1) {
        db1.setAttribute('data-actual-balance', user.balance || '0.00');
        if (db1.getAttribute('data-hidden') === 'false') db1.textContent = user.balance || '0.00';
    }
    
    const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    document.getElementById('dash-avatar').textContent = initials || 'JD';

    document.getElementById('last-login-time').textContent = `Just Now • ${new Date().toLocaleTimeString()} (Gmail OTP Verified)`;

    window.location.href = '/home/landingPage/homePage';
}

function checkExistingSession() {
    const sessionStr = sessionStorage.getItem('bank_active_session');
    if (!sessionStr) return;

    const onOverviewPage = window.location.pathname.startsWith('/home/landingPage/');

    try {
        const user = JSON.parse(sessionStr);
        if (onOverviewPage) {
            // Already on dashboard — just populate the DOM, do NOT redirect.
            currentUser = user;
            const nameEl = document.getElementById('dash-user-name');
            const accEl  = document.getElementById('dash-acc-num');
            const typeEl = document.getElementById('dash-acc-type');
            const balEl  = document.getElementById('dash-balance');
            const avEl   = document.getElementById('dash-avatar');
            const tsEl   = document.getElementById('last-login-time');
            if (nameEl) nameEl.textContent = user.name;
            if (accEl)  accEl.textContent  = `ACC: ${user.accountNumber}`;
            if (typeEl) typeEl.textContent  = user.accountType || 'Premier Vault Account';
            if (balEl) {
                balEl.setAttribute('data-actual-balance', user.balance || '0.00');
                if (balEl.getAttribute('data-hidden') === 'false') balEl.textContent = user.balance || '0.00';
            }
            if (avEl) {
                const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                avEl.textContent = initials || 'JD';
            }
            if (tsEl) tsEl.textContent = `Last Session • (Gmail OTP Verified)`;
        } else {
            // On the login SPA — redirect to dashboard since session is valid.
            window.location.href = '/home/landingPage/homePage';
        }
    } catch(e) {
        sessionStorage.removeItem('bank_active_session');
    }
}

function handleLogout() {
    sessionStorage.removeItem('bank_active_session');
    currentUser = null;
    // Navigate to server-side logout route which clears any server session
    // and redirects to /registration/welcome.
    window.location.href = '/logout';
}

function triggerQuickAction(actionName) {
    if (actionName === 'Overview') { window.location.href = '/home/landingPage/homePage'; return; }
    if (actionName === 'Accounts dashboard' || actionName === 'Accounts') { window.location.href = '/home/landingPage/manageRelationship/transactionAccounts'; return; }
    if (actionName === 'Personal Loan') { window.location.href = '/home/landingPage/loans/personal-loan/'; return; }
    const loanActions = ['Loans Info','Apply for Loan','Home Loan','Education Loan','Gold Loan','Loan Against Mutual Fund','Overdraft against Deposit','View Existing Loans','Manage Loans','Calculate Loan EMI','Check your Credit Score','View Loan Details'];
    if (loanActions.includes(actionName)) { window.location.href = '/home/landingPage/loans/manage'; return; }
    if (actionName === 'Fund Transfer' || actionName === 'Send Money') { window.location.href = '/home/landingPage/profilePage/send-money/fund-transfer'; return; }
    showTimeoutModal("This feature is currently under development.");
}

function showHelpModal(e) {
    e.preventDefault();
    showToast('Customer Help Desk: Call Toll Free 1-800-555-BANK or email support@bankportal.com', 'info');
}

/* ==========================================================================
   INTERACTIVE SPX BANK PLUGINS
   ========================================================================== */
function playCaptchaSound(type) {
    if ('speechSynthesis' in window) {
        const code = captchas[type];
        if (code) {
            const utterance = new SpeechSynthesisUtterance(code.split('').join(' '));
            utterance.rate = 0.75;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
            showToast('Reading CAPTCHA aloud...', 'success');
        }
    } else {
        showToast('Text-to-speech is not supported in your browser.', 'error');
    }
}

function toggleBalanceVisibility() {
    const balanceEl = document.getElementById('dash-balance');
    const eyeIcon = document.getElementById('balance-eye-icon');
    if (!balanceEl || !eyeIcon) return;

    const isHidden = balanceEl.getAttribute('data-hidden') === 'true';
    if (isHidden) {
        // Show balance
        balanceEl.textContent = currentUser ? currentUser.balance : (balanceEl.getAttribute('data-actual-balance') || '0.00');
        balanceEl.setAttribute('data-hidden', 'false');
        eyeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    } else {
        // Hide balance
        balanceEl.textContent = 'XXXX.XX';
        balanceEl.setAttribute('data-hidden', 'true');
        eyeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    }
}

function showTimeoutModal(message) {
    const modal = document.getElementById('timeout-modal-overlay');
    const textEl = document.getElementById('timeout-message-text');
    if (modal) {
        if (textEl && message) {
            textEl.textContent = message;
        }
        modal.classList.remove('hidden');
    }
}

function closeTimeoutModal() {
    const modal = document.getElementById('timeout-modal-overlay');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/* ==========================================================================
   8. UI UTILITIES (TOASTS & SPINNERS)
   ========================================================================== */

function getUsersFromStorage() {
    return [];
}

function setButtonLoading(button, isLoading) {
    const textEl = button.querySelector('.btn-text');
    const spinnerEl = button.querySelector('.btn-spinner');
    const arrowEl = button.querySelector('.btn-arrow');

    if (isLoading) {
        button.disabled = true;
        if (textEl) textEl.style.opacity = '0.5';
        if (spinnerEl) spinnerEl.classList.remove('hidden');
        if (arrowEl) arrowEl.classList.add('hidden');
    } else {
        button.disabled = false;
        if (textEl) textEl.style.opacity = '1';
        if (spinnerEl) spinnerEl.classList.add('hidden');
        if (arrowEl) arrowEl.classList.remove('hidden');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#059669" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
        iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1d4ed8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}
let previouslyActiveTab = null;

document.addEventListener('DOMContentLoaded', () => {
  const paymentsBtn    = document.getElementById('nav-payments-tab');
  const depositsBtn    = document.getElementById('nav-deposits-tab');
  const loansBtn       = document.getElementById('nav-loans-tab');
  const cardsBtn       = document.getElementById('nav-cards-tab');
  const investmentsBtn = document.getElementById('nav-investments-tab');
  const insuranceBtn   = document.getElementById('nav-insurance-tab');
  const servicesBtn    = document.getElementById('nav-services-tab');
  const megaMenu       = document.querySelector('.spx-mega-menu');
  const depositsMegaMenu = document.querySelector('.spx-deposits-mega-menu');
  const loansMegaMenu  = document.querySelector('.spx-loans-mega-menu');
  const cardsMegaMenu  = document.querySelector('.spx-cards-mega-menu');
  const investmentsMegaMenu = document.querySelector('.spx-investments-mega-menu');
  const insuranceMegaMenu = document.querySelector('.spx-insurance-mega-menu');
  const servicesMegaMenu = document.querySelector('.spx-services-mega-menu');
  const overlay        = document.getElementById('mega-menu-overlay');

  const searchTriggerBtn = document.getElementById('search-trigger-btn');
  const searchDropdown = document.getElementById('spx-search-dropdown');
  const notificationTriggerBtn = document.getElementById('notification-trigger-btn');
  const notificationDropdown = document.getElementById('spx-notification-dropdown');
  const navProfileBadge = document.getElementById('nav-profile-badge');

  function calculateSearchWidth() {
    if (!searchDropdown || !depositsBtn || !navProfileBadge) return;
    const parentRect = searchDropdown.offsetParent
        ? searchDropdown.offsetParent.getBoundingClientRect()
        : { left: 0 };
    const depositsRect = depositsBtn.getBoundingClientRect();
    const profileRect = navProfileBadge.getBoundingClientRect();

    const leftPos = depositsRect.left - parentRect.left;
    const width = profileRect.right - depositsRect.left;

    searchDropdown.style.left = leftPos + 'px';
    searchDropdown.style.width = width + 'px';
  }

  // ── Helper: close ALL mega-menus and restore previously-active tab ──
  function closeAllMenus(restoreTab) {
    if (megaMenu)        { megaMenu.classList.remove('active'); }
    if (depositsMegaMenu){ depositsMegaMenu.classList.remove('active'); }
    if (loansMegaMenu)   { loansMegaMenu.classList.remove('active'); }
    if (cardsMegaMenu)   { cardsMegaMenu.classList.remove('active'); }
    if (investmentsMegaMenu){ investmentsMegaMenu.classList.remove('active'); }
    if (insuranceMegaMenu){ insuranceMegaMenu.classList.remove('active'); }
    if (servicesMegaMenu){ servicesMegaMenu.classList.remove('active'); }
    if (searchDropdown)  { searchDropdown.classList.remove('active'); }
    if (notificationDropdown) { notificationDropdown.classList.remove('active'); }
    if (paymentsBtn)     { paymentsBtn.classList.remove('mega-active'); }
    if (depositsBtn)     { depositsBtn.classList.remove('mega-active'); }
    if (loansBtn)        { loansBtn.classList.remove('mega-active'); }
    if (cardsBtn)        { cardsBtn.classList.remove('mega-active'); }
    if (investmentsBtn)  { investmentsBtn.classList.remove('mega-active'); }
    if (insuranceBtn)    { insuranceBtn.classList.remove('mega-active'); }
    if (servicesBtn)     { servicesBtn.classList.remove('mega-active'); }
    if (overlay)         { overlay.classList.remove('active'); }
    if (restoreTab && previouslyActiveTab) {
      previouslyActiveTab.classList.add('active');
      previouslyActiveTab = null;
    }
  }

  // ── Helper: open a specific menu, centred under its trigger button ──
  function openMenu(menu, triggerBtn) {
    if (!menu || !triggerBtn) return;
    const tabRect    = triggerBtn.getBoundingClientRect();
    const parentRect = menu.offsetParent
        ? menu.offsetParent.getBoundingClientRect()
        : { left: 0 };
    const tabCentre  = tabRect.left + tabRect.width / 2 - parentRect.left;
    const menuHalf   = menu.offsetWidth / 2 || 270; // fallback 270 = 540/2
    menu.style.left      = (tabCentre - menuHalf) + 'px';
    menu.style.transform = 'none';
    menu.classList.add('active');
    triggerBtn.classList.add('mega-active');
    if (overlay) overlay.classList.add('active');
  }

  // ── Payments tab ──
  if (paymentsBtn && megaMenu) {
    paymentsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !megaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== paymentsBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);   // close Deposits (if open) without restoring
        openMenu(megaMenu, paymentsBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Deposits tab ──
  if (depositsBtn && depositsMegaMenu) {
    depositsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !depositsMegaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== depositsBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);   // close Payments (if open) without restoring
        openMenu(depositsMegaMenu, depositsBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Loans tab ──
  if (loansBtn && loansMegaMenu) {
    loansBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !loansMegaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== loansBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);   // close Payments/Deposits (if open) without restoring
        openMenu(loansMegaMenu, loansBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Cards tab ──
  if (cardsBtn && cardsMegaMenu) {
    cardsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !cardsMegaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== cardsBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);
        openMenu(cardsMegaMenu, cardsBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Investments tab ──
  if (investmentsBtn && investmentsMegaMenu) {
    investmentsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !investmentsMegaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== investmentsBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);
        openMenu(investmentsMegaMenu, investmentsBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Insurance tab ──
  if (insuranceBtn && insuranceMegaMenu) {
    insuranceBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !insuranceMegaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== insuranceBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);
        openMenu(insuranceMegaMenu, insuranceBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Services tab ──
  if (servicesBtn && servicesMegaMenu) {
    servicesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !servicesMegaMenu.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab && activeTab !== servicesBtn) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);
        openMenu(servicesMegaMenu, servicesBtn);
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Search Dropdown Modal ──
  if (searchTriggerBtn && searchDropdown) {
    searchTriggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !searchDropdown.classList.contains('active');
      if (isOpening) {
        // Snapshot active tab before closing it
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);
        calculateSearchWidth();
        searchDropdown.classList.add('active');
        if (overlay) overlay.classList.add('active');
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Notification Dropdown Modal ──
  if (notificationTriggerBtn && notificationDropdown) {
    notificationTriggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpening = !notificationDropdown.classList.contains('active');
      if (isOpening) {
        const activeTab = document.querySelector('.spx-nav-item.active');
        if (activeTab) {
          previouslyActiveTab = activeTab;
          activeTab.classList.remove('active');
        }
        closeAllMenus(false);
        notificationDropdown.classList.add('active');
        if (overlay) overlay.classList.add('active');
      } else {
        closeAllMenus(true);
      }
    });
  }

  // ── Outside-click / overlay-click: close everything ──
  document.addEventListener('click', (e) => {
    const clickedInsidePayments = paymentsBtn && paymentsBtn.contains(e.target);
    const clickedInsideDeposits = depositsBtn && depositsBtn.contains(e.target);
    const clickedInsideLoans    = loansBtn && loansBtn.contains(e.target);
    const clickedInsideCards    = cardsBtn && cardsBtn.contains(e.target);
    const clickedInsideInvestments = investmentsBtn && investmentsBtn.contains(e.target);
    const clickedInsideInsurance   = insuranceBtn && insuranceBtn.contains(e.target);
    const clickedInsideServices    = servicesBtn && servicesBtn.contains(e.target);
    const clickedSearchTrigger     = searchTriggerBtn && searchTriggerBtn.contains(e.target);
    const clickedInPaymentsMenu = megaMenu && megaMenu.contains(e.target);
    const clickedInDepositsMenu = depositsMegaMenu && depositsMegaMenu.contains(e.target);
    const clickedInLoansMenu    = loansMegaMenu && loansMegaMenu.contains(e.target);
    const clickedInCardsMenu    = cardsMegaMenu && cardsMegaMenu.contains(e.target);
    const clickedInInvestmentsMenu = investmentsMegaMenu && investmentsMegaMenu.contains(e.target);
    const clickedInInsuranceMenu   = insuranceMegaMenu && insuranceMegaMenu.contains(e.target);
    const clickedInServicesMenu    = servicesMegaMenu && servicesMegaMenu.contains(e.target);
    const clickedInSearchDropdown  = searchDropdown && searchDropdown.contains(e.target);
    const clickedNotificationTrigger = notificationTriggerBtn && notificationTriggerBtn.contains(e.target);
    const clickedInNotificationDropdown = notificationDropdown && notificationDropdown.contains(e.target);

    if (!clickedInsidePayments && !clickedInsideDeposits && !clickedInsideLoans && !clickedInsideCards && !clickedInsideInvestments && !clickedInsideInsurance && !clickedInsideServices && !clickedSearchTrigger && !clickedNotificationTrigger &&
        !clickedInPaymentsMenu && !clickedInDepositsMenu && !clickedInLoansMenu && !clickedInCardsMenu && !clickedInInvestmentsMenu && !clickedInInsuranceMenu && !clickedInServicesMenu && !clickedInSearchDropdown && !clickedInNotificationDropdown) {
      closeAllMenus(true);
    }
  });
});

// YONO Accounts Redesign - Subnav Tab Switching Logic
function switchYonoTab(tabName, element) {
    // 1. Update Active State on Tabs
    const tabs = document.querySelectorAll(".yono-subnav-tab");
    tabs.forEach(tab => tab.classList.remove("active"));
    element.classList.add("active");

    // 2. Update Breadcrumbs
    const breadcrumbDivider = document.getElementById("yono-breadcrumb-divider");
    const breadcrumbActive = document.getElementById("yono-breadcrumb-active");
    
    if (tabName !== "Transaction Accounts") {
        breadcrumbDivider.style.display = "inline";
        breadcrumbActive.style.display = "inline";
        breadcrumbActive.innerText = tabName;
    } else {
        breadcrumbDivider.style.display = "none";
        breadcrumbActive.style.display = "none";
    }

    // 3. Swap Main Layout Area (Left Sidebar + Right Panel)
    const layoutGrid = document.querySelector(".yono-layout-grid");
    
    // Check if original content is backed up; if not, back it up on the first switch
    if (!window.originalYonoContent) {
        window.originalYonoContent = layoutGrid.innerHTML;
    }

    if (tabName === "Transaction Accounts") {
        layoutGrid.innerHTML = window.originalYonoContent;
    } else if (tabName === "Loans") {
        window.location.href = '/home/landingPage/loans';
    } else {
        layoutGrid.innerHTML = `<div class="yono-empty-state"><p>No active records found for this section.</p></div>`;
    }
}

// YONO Statements Section Logic
function toggleStatementType() {
    const durationRadio = document.getElementById("selectDuration");
    const fyRadio = document.getElementById("selectFinancialYear");
    const durationSelect = document.getElementById("durationSelect");
    const fySelect = document.getElementById("fySelect");

    if (durationRadio && durationRadio.checked) {
        durationSelect.disabled = false;
        fySelect.disabled = true;
    } else if (fyRadio && fyRadio.checked) {
        durationSelect.disabled = true;
        fySelect.disabled = false;
    }
}

// YONO Secondary Tabs Logic
function switchSecondaryTab(tabId, element) {
    // 1. Update Active State on Secondary Tabs
    const tabs = document.querySelectorAll(".yono-secondary-tab");
    tabs.forEach(tab => tab.classList.remove("active"));
    element.classList.add("active");

    // 2. Toggle content views
    const summaryTab = document.getElementById("sec-tab-summary");
    const transactionsTab = document.getElementById("sec-tab-transactions");
    const statementsTab = document.getElementById("sec-tab-statements");
    
    if(summaryTab) summaryTab.style.display = "none";
    if(transactionsTab) transactionsTab.style.display = "none";
    if(statementsTab) statementsTab.style.display = "none";

    const activeTab = document.getElementById("sec-tab-" + tabId);
    if(activeTab) activeTab.style.display = "block";
}


/* ==========================================================================
   MERGED BANKING DATA + PROFILE + TRANSFER + STATEMENT FEATURES
   ========================================================================== */
async function fetchCurrentBankUser() {
    try {
        const response = await fetch('/api/me', { credentials: 'include' });
        if (!response.ok) return null;
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            sessionStorage.setItem('bank_active_session', JSON.stringify(data.user));
            return data.user;
        }
    } catch (e) { console.error('Current user fetch failed', e); }
    return null;
}

function populateBankHeaderUser(user) {
    if (!user) return;
    const avatar = document.getElementById('dash-avatar');
    if (avatar) avatar.textContent = (user.name || 'SPX').split(' ').map(x => x[0]).join('').substring(0,2).toUpperCase();
    const dashName = document.getElementById('dash-user-name'); if (dashName) dashName.textContent = user.name || '';
    const dashAcc = document.getElementById('dash-acc-num'); if (dashAcc) dashAcc.textContent = `ACC: ${user.accountNumber || ''}`;
    const dashBalance = document.getElementById('dash-balance');
    if (dashBalance) {
        dashBalance.setAttribute('data-actual-balance', user.balance || '0.00');
        if (dashBalance.getAttribute('data-hidden') === 'false') {
            dashBalance.textContent = user.balance || '0.00';
        }
    }
    const last = document.getElementById('last-login-time'); if (last) last.textContent = user.lastLogin ? `Last Login • ${user.lastLogin}` : 'Last Login • First login';
}

async function loadMergedAccountData() {
    const user = await fetchCurrentBankUser();
    if (!user) return;
    populateBankHeaderUser(user);
    if (document.getElementById('transactions-table-body')) loadTransactionHistory();
    const accountNodes = document.querySelectorAll('[data-account-number]'); accountNodes.forEach(n => n.textContent = user.accountNumber);
    const balanceNodes = document.querySelectorAll('[data-available-balance]'); balanceNodes.forEach(n => n.textContent = `₹${user.balance}`);
}

async function loadTransactionHistory() {
    const loading = document.getElementById('transactions-loading');
    const body = document.getElementById('transactions-table-body');
    if (!body) return;
    try {
        const response = await fetch('/api/transactions?limit=100', {credentials:'include'});
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed');
        if (loading) loading.style.display = 'none';
        if (!data.transactions.length) {
            body.innerHTML = '<div class="yono-empty-state" style="margin-top:10px;background:transparent;box-shadow:none"><p>No transactions found.</p></div>';
            return;
        }
        body.innerHTML = data.transactions.map(tx => {
            const incoming = tx.direction === 'IN';
            const sign = incoming ? '+' : '-';
            const color = incoming ? '#15803d' : '#b91c1c';
            return `<div class="yono-transaction-row" style="display:grid;grid-template-columns:20% 45% 18% 17%;gap:0;padding:14px 8px;border-bottom:1px solid #eee;align-items:center;font-size:12px">
                <div style="text-align:left;">${tx.date}</div>
                <div style="text-align:left; padding-left: 0;">
                    <div class="fw-bold text-dark small" style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${tx.title || tx.typeLabel}</div>
                    <div class="text-muted font-monospace" style="font-size: 11px; color: #64748b;">${tx.subtext || tx.description}</div>
                </div>
                <div style="font-weight:700;color:${color};text-align:right;padding-right:12px;">${sign}₹${tx.amount}</div>
                <div style="font-weight:600;text-align:right;">₹${tx.balanceAfter}</div>
            </div>`;
        }).join('');
    } catch (e) {
        if (loading) loading.innerHTML = '<p>Unable to load transactions.</p>';
    }
}

function handleStatementDurationChange() {
    const duration = document.getElementById('durationSelect');
    const custom = document.getElementById('customDateRow');
    if (duration && custom) custom.classList.toggle('active', duration.value === 'Custom Date Range');
}

function toggleStatementType() {
    const durationRadio = document.getElementById('selectDuration');
    const fyRadio = document.getElementById('selectFinancialYear');
    const durationSelect = document.getElementById('durationSelect');
    const fySelect = document.getElementById('fySelect');
    if (durationRadio && durationRadio.checked) { durationSelect.disabled=false; fySelect.disabled=true; }
    else if (fyRadio && fyRadio.checked) { durationSelect.disabled=true; fySelect.disabled=false; }
}

function downloadStatement() {
    const format = document.getElementById('statementFormat')?.value || 'pdf';
    const durationMode = document.getElementById('selectDuration')?.checked;
    const duration = document.getElementById('durationSelect')?.value || 'Current Month';
    const fy = document.getElementById('fySelect')?.value || '';
    const params = new URLSearchParams({format});
    if (durationMode) {
        params.set('duration', duration.toUpperCase().replace(/ /g,'_'));
        if (duration === 'Custom Date Range') {
            const start = document.getElementById('statementStartDate')?.value;
            const end = document.getElementById('statementEndDate')?.value;
            if (!start || !end) { showToast('Select both custom start and end dates.', 'error'); return; }
            params.set('start_date', start); params.set('end_date', end);
        }
    } else {
        params.set('financial_year', fy.replace(/\s/g,''));
    }
    window.location.href = `/api/transactions/statement?${params.toString()}`;
}

async function loadCustomerProfile() {
    const form = document.getElementById('profile-form');
    if (!form) return;
    try {
        const response = await fetch('/api/profile', {credentials:'include'});
        const data = await response.json();
        if (!data.success) return;
        const p=data.profile;
        const set=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||'';};
        set('profile-dob',p.date_of_birth); set('profile-mobile',p.mobile_number); set('profile-pan',p.pan); set('profile-father',p.father_name);
        set('profile-alt-email',p.alternate_email); set('profile-comm-address',p.communication_address); set('profile-perm-address',p.permanent_address);
        set('profile-marital',p.marital_status); set('profile-religion',p.religion); set('profile-category',p.category);
        const mid=document.getElementById('profile-mid-number'); if(mid) mid.textContent=p.mid_number || 'Not assigned';
        const last=document.getElementById('profile-last-login'); if(last) last.textContent=p.last_login_display || 'First login';
        updateProfileCompletion();
    } catch(e) { showToast('Unable to load profile information.', 'error'); }
}

function updateProfileCompletion() {
    const ids=['profile-dob','profile-mobile','profile-pan','profile-father','profile-alt-email','profile-comm-address','profile-perm-address','profile-marital','profile-religion','profile-category'];
    const filled=ids.filter(id=>document.getElementById(id)?.value?.trim()).length;
    const el=document.getElementById('profile-completion'); if(el) el.textContent=Math.round(filled/ids.length*100)+'%';
}

async function saveCustomerProfile() {
    const btn=document.getElementById('profile-save-btn');
    const fields=['date_of_birth','mobile_number','pan','father_name','alternate_email','communication_address','permanent_address','marital_status','religion','category'];
    const payload={}; fields.forEach(name=>{const el=document.getElementById('profile-'+({date_of_birth:'dob',mobile_number:'mobile',pan:'pan',father_name:'father',alternate_email:'alt-email',communication_address:'comm-address',permanent_address:'perm-address',marital_status:'marital',religion:'religion',category:'category'}[name])); payload[name]=el?.value||'';});
    if(btn) btn.disabled=true;
    try {
        const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});
        const data=await response.json();
        if(!response.ok || !data.success) throw new Error(data.message||'Unable to save');
        document.getElementById('profile-save-status').textContent='Saved just now'; updateProfileCompletion(); showToast(data.message,'success');
    } catch(e) { showToast(e.message,'error'); }
    finally { if(btn) btn.disabled=false; }
}

let verifiedSendRecipient=null;
function showSendError(message){const el=document.getElementById('send-error');if(el){el.textContent=message;el.style.display='block';}}
function clearSendError(){const el=document.getElementById('send-error');if(el){el.textContent='';el.style.display='none';}}
async function verifySendBeneficiary(){
    clearSendError(); const account=document.getElementById('send-account').value.trim(); const confirm=document.getElementById('send-account-confirm').value.trim();
    if(!account || account!==confirm){showSendError('Enter the account number twice. Both values must match exactly.');return;}
    const btn=document.getElementById('send-verify-btn'); if(btn) btn.disabled=true;
    try{const r=await fetch('/api/beneficiaries/verify',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({accountNumber:account,confirmAccountNumber:confirm})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Recipient verification failed');verifiedSendRecipient=d.recipient;document.getElementById('send-recipient-name').value=`${d.recipient.firstName} ${d.recipient.lastName}`;document.getElementById('send-recipient-verified').style.display='block';showToast('Recipient verified successfully.','success');}catch(e){verifiedSendRecipient=null;showSendError(e.message);}finally{if(btn)btn.disabled=false;}
}
function prepareTransferReview(){
    clearSendError(); const amount=Number(document.getElementById('send-amount')?.value||0); const note=document.getElementById('send-note')?.value||'';
    const balance=Number((currentUser?.balance||'0').replace(/,/g,''));
    if(!verifiedSendRecipient){showSendError('Please verify the recipient account first.');return;}
    if(amount<1000){showSendError('Minimum transfer amount is ₹1,000.');return;}
    if(amount>balance){showSendError('Amount cannot be greater than your available balance.');return;}
    document.getElementById('review-recipient').textContent=`${verifiedSendRecipient.firstName} ${verifiedSendRecipient.lastName}`;
    document.getElementById('review-recipient-account').textContent=verifiedSendRecipient.accountNumber;
    document.getElementById('review-amount').textContent=`₹${amount.toLocaleString('en-IN',{minimumFractionDigits:2})}`;
    document.getElementById('review-note').textContent=note||'-';
    document.getElementById('send-entry-view').style.display='none';document.getElementById('send-review-view').classList.add('active');document.getElementById('send-receipt-view').classList.remove('active');
    document.getElementById('send-step-1').classList.remove('active');document.getElementById('send-step-2').classList.add('active');
}
function backToTransferEdit(){document.getElementById('send-review-view').classList.remove('active');document.getElementById('send-entry-view').style.display='grid';document.getElementById('send-step-2').classList.remove('active');document.getElementById('send-step-1').classList.add('active');}
async function processTransfer(){
    clearSendError(); const amount=Number(document.getElementById('send-amount')?.value||0); const note=document.getElementById('send-note')?.value||'';
    try{const r=await fetch('/api/transfer',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({toAccount:verifiedSendRecipient.accountNumber,amount,note})});const d=await r.json();if(!r.ok||!d.success)throw new Error(d.message||'Transfer failed');
        document.getElementById('receipt-reference').textContent=d.referenceId;document.getElementById('receipt-date').textContent=d.date;document.getElementById('receipt-recipient').textContent=d.recipient;document.getElementById('receipt-amount').textContent=`₹${d.amount}`;document.getElementById('receipt-balance').textContent=`₹${d.newBalance}`;
        document.getElementById('send-review-view').classList.remove('active');document.getElementById('send-receipt-view').classList.add('active');document.getElementById('send-step-2').classList.remove('active');document.getElementById('send-step-3').classList.add('active');
        currentUser.balance=d.newBalance;sessionStorage.setItem('bank_active_session',JSON.stringify(currentUser));showToast(d.message,'success');
    }catch(e){showSendError(e.message);}
}

document.addEventListener('DOMContentLoaded', async () => {
    if (document.querySelector('.yono-accounts-wrapper') || document.getElementById('profile-form') || document.getElementById('send-entry-view')) {
        await loadMergedAccountData();
    }
    if (document.getElementById('profile-form')) {
        await loadCustomerProfile();
        document.querySelectorAll('#profile-form input,#profile-form select,#profile-form textarea').forEach(el=>el.addEventListener('input',updateProfileCompletion));
    }
    if (document.getElementById('durationSelect')) handleStatementDurationChange();
});

/* ========================================================================
   CUSTOMER LOANS
   ======================================================================== */
const SPX_LOAN_RATES = {PERSONAL:12.50, HOME:8.50, EDUCATION:9.00, GOLD:10.50, 'LOAN AGAINST MUTUAL FUND':9.50, 'OVERDRAFT AGAINST DEPOSIT':11.00};
function moneyINR(n){ return `₹${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function formatLoanAmount(input) {
    const existingError = document.getElementById('loan-amount-error');
    if (existingError) existingError.remove();
    
    let cursorPosition = input.selectionStart;
    let originalLength = input.value.length;
    
    let raw = input.value.replace(/[^0-9]/g, '');
    if (!raw) {
        input.value = '';
        const btn = document.getElementById('btn-continue-step4');
        if (btn) btn.disabled = false;
        updateLoanRate();
        return;
    }
    
    if (raw.length > 8) {
        raw = raw.slice(0, 8);
    }
    
    let num = parseInt(raw, 10);
    
    if (num > 10000000) {
        raw = raw.slice(0, -1);
        num = parseInt(raw, 10) || 0;
    }
    
    let formatted = num ? num.toLocaleString('en-IN') : '';
    input.value = formatted;
    
    let lengthDiff = formatted.length - originalLength;
    let newCursor = cursorPosition + lengthDiff;
    if (newCursor < 0) newCursor = 0;
    input.setSelectionRange(newCursor, newCursor);
    
    const btn = document.getElementById('btn-continue-step4');
    if (btn) btn.disabled = false;
    calculateLoanPreview();
}
function formatMonthlyIncome(input) {
    let cursorPosition = input.selectionStart;
    let originalLength = input.value.length;
    
    let raw = input.value.replace(/[^0-9]/g, '');
    if (!raw) {
        input.value = '';
        return;
    }
    
    if (raw.length > 8) {
        raw = raw.slice(0, 8);
    }
    
    let num = parseInt(raw, 10);
    let formatted = num ? num.toLocaleString('en-IN') : '';
    input.value = formatted;
    
    let lengthDiff = formatted.length - originalLength;
    let newCursor = cursorPosition + lengthDiff;
    if (newCursor < 0) newCursor = 0;
    input.setSelectionRange(newCursor, newCursor);
}
function updateLoanRate(){ const type=document.getElementById('loan-type')?.value; const el=document.getElementById('loan-calculator-preview'); if(el && type){ const r=SPX_LOAN_RATES[type]||12.5; const amt=Number(document.getElementById('loan-amount')?.value.replace(/,/g, '')||0); const tenure=Number(document.getElementById('loan-tenure')?.value||60); if(amt>=10000 && amt<=10000000){ calculateLoanPreview(); } else { el.innerHTML=`<div style="display: flex; flex-direction: column; gap: 8px; padding: 16px; background: #f8fafc; border-radius: 8px;"><div style="font-size: 13px; color: #64748b;">Estimated Monthly EMI</div><strong style="color: #5a287d; font-size: 24px;">Enter amount to calculate</strong><div style="font-size: 13px; color: #10b981; font-weight: 500;">Interest rate starting at ${r.toFixed(2)}% p.a.</div></div>`; } } }
let loanPreviewDebounceTimer = null;
async function calculateLoanPreview(force=false){ 
    clearTimeout(loanPreviewDebounceTimer);
    const amount=Number(document.getElementById('loan-amount')?.value.replace(/,/g, '')||0), tenure=Number(document.getElementById('loan-tenure')?.value||60), type=document.getElementById('loan-type')?.value||'PERSONAL', box=document.getElementById('loan-calculator-preview'); 
    if(!box)return; 
    if(amount<10000 || amount>10000000){updateLoanRate();return;} 
    
    const doFetch = async () => {
        try{
            const r=await fetch('/api/loans/calculate',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({loan_type:type,amount,tenure_months:tenure})});
            const d=await r.json();
            if(!d.success){box.innerHTML=`<span style="color:red">Estimate Error</span><strong>${d.message}</strong>`;return;}
            box.innerHTML=`<div style="display: flex; flex-direction: column; gap: 12px; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div>
                    <div style="font-size: 13px; color: #64748b; margin-bottom: 4px;">Estimated Monthly EMI</div>
                    <strong style="color: #5a287d; font-size: 24px; display: block;">${moneyINR(d.emi)} / month</strong>
                    <span style="font-size: 12px; font-weight: 600; color: #10b981; background: #d1fae5; padding: 2px 8px; border-radius: 12px;">${d.interest_rate.toFixed(2)}% p.a.</span>
                </div>
                <div style="height: 1px; background: #e2e8f0; margin: 4px 0;"></div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 14px; color: #64748b;">Total Interest</div>
                    <div style="font-size: 15px; color: #1e293b; font-weight: 500;">${moneyINR(d.total_interest)}</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 14px; color: #64748b;">Total Amount Payable (Principal + Interest)</div>
                    <div style="font-size: 15px; color: #1e293b; font-weight: 700;">${moneyINR(d.total_payable)}</div>
                </div>
            </div>`;
        }catch(e){if(force)showToast('Unable to calculate EMI right now.','error');}
    };

    if(force) doFetch();
    else loanPreviewDebounceTimer = setTimeout(doFetch, 350);
}
let pendingLoanApplication=null;
function getLoanFormData(){return {loan_type:document.getElementById('loan-type')?.value,amount:Number(document.getElementById('loan-amount')?.value.replace(/,/g, '')||0),tenure_months:Number(document.getElementById('loan-tenure')?.value||0),employment_type:document.getElementById('loan-employment')?.value,monthly_income:Number(document.getElementById('loan-income')?.value.replace(/,/g, '')||0),existing_emi:Number(document.getElementById('loan-existing-emi')?.value||0),purpose:document.getElementById('loan-purpose')?.value.trim()||''};}
async function submitLoanApplication(e){e.preventDefault();const data=getLoanFormData();if(data.amount<10000){showToast('Loan amount must be at least ₹10,000.','error');return;}if(!data.employment_type||data.monthly_income<=0){showToast('Please complete employment type and monthly income.','error');return;}const r=await fetch('/api/loans/calculate',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!d.success){showToast(d.message||'Unable to calculate loan.','error');return;}pendingLoanApplication={...data,rate:d.interest_rate,emi:d.emi,totalInterest:d.total_interest,totalPayable:d.total_payable};document.getElementById('loan-review-content').innerHTML=`<div class="spx-loan-review-grid"><div class="spx-loan-review-item"><span>Loan Type</span><strong>${data.loan_type.replaceAll('_',' ')}</strong></div><div class="spx-loan-review-item"><span>Amount</span><strong>${moneyINR(data.amount)}</strong></div><div class="spx-loan-review-item"><span>Interest Rate</span><strong>${d.interest_rate.toFixed(2)}% p.a.</strong></div><div class="spx-loan-review-item"><span>Tenure</span><strong>${data.tenure_months} months</strong></div><div class="spx-loan-review-item"><span>Estimated EMI</span><strong>${moneyINR(d.emi)} / month</strong></div><div class="spx-loan-review-item"><span>Monthly Income</span><strong>${moneyINR(data.monthly_income)}</strong></div><div class="spx-loan-review-item"><span>Employment</span><strong>${data.employment_type}</strong></div><div class="spx-loan-review-item"><span>Purpose</span><strong>${data.purpose||'Not specified'}</strong></div></div>`;document.getElementById('loan-review-panel').style.display='block';document.getElementById('loan-review-panel').scrollIntoView({behavior:'smooth',block:'start'});}
function closeLoanReview(){pendingLoanApplication=null;const p=document.getElementById('loan-review-panel');if(p)p.style.display='none';}
async function confirmLoanApplication(){if(!pendingLoanApplication)return;const r=await fetch('/api/loans/apply',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingLoanApplication)});const d=await r.json();if(!d.success){showToast(d.message||'Loan application failed.','error');return;}showToast(`Loan application ${d.reference_id} submitted successfully.`,'success');closeLoanReview();document.getElementById('loan-application-form')?.reset();updateLoanRate();loadMyLoans();}
async function loadMyLoans(){const box=document.getElementById('my-loans-container');if(!box)return;try{const r=await fetch('/api/loans',{credentials:'include'}),d=await r.json();if(!d.success)throw new Error(d.message);if(!d.loans.length){box.innerHTML='<div class="spx-loan-empty">You have no loan applications yet.</div>';document.getElementById('loan-payment-container').innerHTML='<div class="spx-loan-empty">Your repayment controls will appear when you have an active loan.</div>';return;}box.innerHTML=d.loans.map(l=>{
    const refDisplay = l.reference_id ? l.reference_id : `#LN-${l.id}`;
    const empType = l.employment_type || 'Salaried';
    const monthlyInc = l.monthly_income || 0;
    const purpose = l.purpose || 'No specific reason provided.';
    return `
    <div class="spx-loan-record loan-card-item" data-loan-id="${l.id}" style="cursor: pointer; transition: box-shadow 0.2s ease;">
      <div class="loan-card-summary">
        <div class="spx-loan-record-top" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <h3>${refDisplay} · ${l.loan_type}</h3>
            <small>Applied ${l.applied_at || '-'}</small>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="spx-loan-status ${String(l.status).toLowerCase()}">${l.status}</span>
            <svg class="chevron-icon" style="transition: transform 0.25s ease;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>

        <div class="spx-loan-metrics" style="display: flex; flex-wrap: wrap; gap: 16px;">
          <div class="spx-loan-metric"><span>Amount</span><strong>${moneyINR(l.amount)}</strong></div>
          <div class="spx-loan-metric"><span>Interest</span><strong>${Number(l.interest_rate||0).toFixed(2)}%</strong></div>
          <div class="spx-loan-metric"><span>EMI</span><strong>${moneyINR(l.emi)}</strong></div>
          <div class="spx-loan-metric"><span>Outstanding</span><strong>${moneyINR(l.outstanding_principal)}</strong></div>
        </div>
      </div>

      <!-- Hidden Expandable Drawer -->
      <div class="loan-card-details" style="display: none; border-top: 1px dashed #e2e8f0; margin-top: 14px; padding-top: 14px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 12px;">
          <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">Tenure Period</span><span style="font-size: 13px; font-weight: 600; color: #1e293b;">${l.tenure_months || '-'} Months</span></div>
          <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">Employment Type</span><span style="font-size: 13px; font-weight: 600; color: #1e293b;">${empType}</span></div>
          <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">Monthly Income</span><span style="font-size: 13px; font-weight: 600; color: #1e293b;">${moneyINR(monthlyInc)}</span></div>
          <div><span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">Application Status</span><span style="font-size: 13px; font-weight: 600; color: #2563eb;">${l.status === 'PENDING' ? 'Under Document Verification' : l.status}</span></div>
        </div>
        <div>
          <span style="font-size: 11px; color: #64748b; display: block; margin-bottom: 4px;">Purpose / Reason</span>
          <p style="font-size: 13px; color: #475569; background: #f8fafc; padding: 10px; border-radius: 6px; margin: 0; border: 1px solid #e2e8f0;">${purpose}</p>
        </div>
        ${l.admin_notes ? `<div style="margin-top:12px;font-size:11px;color:#666"><b>Admin note:</b> ${l.admin_notes}</div>` : ''}
      </div>
    </div>`;
}).join('');

box.querySelectorAll('.loan-card-item').forEach(item => {
    item.addEventListener('mouseenter', () => item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)');
    item.addEventListener('mouseleave', () => item.style.boxShadow = '');
    item.querySelector('.loan-card-summary').addEventListener('click', function() {
        const details = item.querySelector('.loan-card-details');
        const chevron = item.querySelector('.chevron-icon');
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
        if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });
});

const active=d.loans.filter(l=>l.status==='ACTIVE');const pay=document.getElementById('loan-payment-container');if(!active.length){pay.innerHTML='<div class="spx-loan-empty">No active loan is currently available for repayment.</div>';return;}pay.innerHTML=`<div class="spx-loan-payment-box"><label>Loan<select id="repay-loan-select">${active.map(l=>{const refDisplay = l.reference_id ? l.reference_id : `#LN-${l.id}`; return `<option value="${l.id}">${refDisplay} · ${l.loan_type} · Outstanding ${moneyINR(l.outstanding_principal)}</option>`;}).join('')}</select></label><label>Payment Amount (₹)<input id="repay-amount" type="number" min="1" step="100" placeholder="Enter amount"></label><button class="spx-loan-primary" onclick="paySelectedLoan()">Pay Loan</button></div><div id="loan-payment-history" style="margin-top:15px"></div>`;loadLoanPaymentHistory(active[0].id);}catch(e){box.innerHTML='<div class="spx-loan-empty">Unable to load loan records.</div>';}}
async function loadLoanPaymentHistory(id){const box=document.getElementById('loan-payment-history');if(!box)return;try{const r=await fetch(`/api/loans/${id}/payments`,{credentials:'include'}),d=await r.json();if(!d.success||!d.payments.length){box.innerHTML='';return;}box.innerHTML='<table class="spx-loan-table"><thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Principal</th><th>Interest</th><th>Outstanding</th></tr></thead><tbody>'+d.payments.map(p=>`<tr><td>${p.paid_at}</td><td>${p.reference_id}</td><td>${moneyINR(p.amount)}</td><td>${moneyINR(p.principal_component)}</td><td>${moneyINR(p.interest_component)}</td><td>${moneyINR(p.balance_after)}</td></tr>`).join('')+'</tbody></table>';}catch(e){}}
async function paySelectedLoan(){const id=document.getElementById('repay-loan-select')?.value, amount=Number(document.getElementById('repay-amount')?.value||0);if(!id||amount<=0){showToast('Enter a repayment amount.','error');return;}if(!confirm(`Pay ${moneyINR(amount)} toward loan #LN-${id}?`))return;const r=await fetch(`/api/loans/${id}/pay`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})});const d=await r.json();if(!d.success){showToast(d.message||'Loan payment failed.','error');return;}showToast(`Payment successful. Reference ${d.referenceId}`,'success');loadMyLoans();}

