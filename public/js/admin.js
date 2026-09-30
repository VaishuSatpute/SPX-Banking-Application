/* ==========================================================================
   SPX BANK — MASTER CONTROL CENTER (ADMIN CORE LOGIC & API ENGINE)
   ========================================================================== */

const ADMIN_TOKEN_KEY = 'spx_admin_jwt';
const ADMIN_USER_KEY = 'spx_admin_user';

// Check Auth state on page load
document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;
    
    // Login page bypass auth check
    if (currentPath === '/admin/login') {
        const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        if (token) {
            window.location.href = '/admin/dashboard';
        }
        return;
    }
    
    // Protected admin pages check
    if (currentPath.startsWith('/admin')) {
        const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        if (!token) {
            window.location.href = '/admin/login';
            return;
        }
        
        // Populate Admin User Profile Info in UI
        const adminUser = JSON.parse(sessionStorage.getItem(ADMIN_USER_KEY) || '{}');
        const nameEl = document.getElementById('topbar-admin-name');
        const sideNameEl = document.getElementById('sidebar-admin-name');
        if (nameEl) nameEl.textContent = adminUser.name || 'Gokul Kakde';
        if (sideNameEl) sideNameEl.textContent = adminUser.name || 'Gokul Kakde';
        
        // Route specific initializers
        if (currentPath.includes('/admin/dashboard')) loadDashboardData();
        else if (currentPath.includes('/admin/users/') && !currentPath.endsWith('/users')) loadUserDetailData();
        else if (currentPath.includes('/admin/users')) loadUsersTable();
        else if (currentPath.includes('/admin/loans')) loadLoansTable();
        else if (currentPath.includes('/admin/cards')) loadCardsTable();
        else if (currentPath.includes('/admin/transactions')) loadTransactionsTable();
        else if (currentPath.includes('/admin/audit-logs')) loadAuditLogsTable();
    }
});

/* ==========================================================================
   AUTHENTICATED FETCH HELPER
   ========================================================================== */
async function adminFetch(url, options = {}) {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
    };
    
    try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401 || response.status === 403) {
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
            sessionStorage.removeItem(ADMIN_USER_KEY);
            window.location.href = '/admin/login';
            return null;
        }
        return await response.json();
    } catch (e) {
        console.error('Admin API error:', e);
        showAdminToast('Cannot connect to bank operations server', 'error');
        return null;
    }
}

/* ==========================================================================
   AUTHENTICATION & LOGOUT
   ========================================================================== */
async function handleAdminLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const btn = document.getElementById('btn-admin-login');
    const errDiv = document.getElementById('admin-login-error');
    
    if (errDiv) errDiv.style.display = 'none';
    if (btn) btn.disabled = true;
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        
        if (btn) btn.disabled = false;
        
        if (data.success && data.token) {
            sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
            sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user));
            showAdminToast('Master Admin Authenticated! Entering Command Center...', 'success');
            setTimeout(() => {
                window.location.href = data.redirect || '/admin/dashboard';
            }, 600);
        } else {
            if (errDiv) {
                errDiv.textContent = data.message || 'Invalid master admin credentials';
                errDiv.style.display = 'block';
            }
            showAdminToast(data.message || 'Authentication failed', 'error');
        }
    } catch (e) {
        if (btn) btn.disabled = false;
        showAdminToast('Server error during admin login', 'error');
    }
}

function handleAdminLogout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_USER_KEY);
    window.location.href = '/admin/login';
}

/* ==========================================================================
   1. DASHBOARD DATA LOADER
   ========================================================================== */
async function loadDashboardData() {
    const data = await adminFetch('/api/admin/dashboard');
    if (!data || !data.success) return;
    
    const stats = data.stats;
    
    // Populate User KPIs
    const totalUsers = document.getElementById('stat-total-users');
    const activeUsers = document.getElementById('stat-active-users');
    const lockedUsers = document.getElementById('stat-locked-users');
    if (totalUsers) totalUsers.textContent = stats.users.total || 0;
    if (activeUsers) activeUsers.textContent = `${stats.users.active || 0} Active`;
    if (lockedUsers) lockedUsers.textContent = `${stats.users.locked || 0} Locked`;
    
    // Populate Funds KPIs
    const totalDeposits = document.getElementById('stat-total-deposits');
    const totalAccounts = document.getElementById('stat-total-accounts');
    if (totalDeposits) totalDeposits.textContent = `₹${(stats.funds.total_deposits || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    if (totalAccounts) totalAccounts.textContent = `${stats.funds.total_accounts || 0} Accounts`;
    
    // Populate Loan KPIs
    const totalLoans = document.getElementById('stat-total-loans');
    const pendingLoans = document.getElementById('stat-pending-loans');
    if (totalLoans) totalLoans.textContent = `₹${(stats.loans.total_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    if (pendingLoans) pendingLoans.textContent = `${stats.loans.pending || 0} Pending Applications`;
    
    // Populate Cards KPIs
    const totalCards = document.getElementById('stat-total-cards');
    const activeCards = document.getElementById('stat-active-cards');
    if (totalCards) totalCards.textContent = stats.cards.total || 0;
    if (activeCards) activeCards.textContent = `${stats.cards.active || 0} Active Cards`;
    
    // Render Recent Audit Log Activity Feed
    const feedList = document.getElementById('dashboard-audit-feed');
    if (feedList && data.recent_logs) {
        feedList.innerHTML = data.recent_logs.map(log => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 16px; font-weight: 600; font-size: 12px; font-family: var(--font-mono);">${log.created_at}</td>
                <td style="padding: 12px 16px;">
                    <span class="status-badge ${log.status === 'SUCCESS' ? 'active' : 'locked'}">${log.action}</span>
                </td>
                <td style="padding: 12px 16px; font-size: 13px;">${log.details || '-'}</td>
                <td style="padding: 12px 16px; font-size: 12px; color: var(--admin-text-muted);">${log.admin_email}</td>
            </tr>
        `).join('');
    }
}

/* ==========================================================================
   2. USER MANAGEMENT TABLE & ACTIONS
   ========================================================================== */
let allUsersData = [];

async function loadUsersTable() {
    const data = await adminFetch('/api/admin/users');
    if (!data || !data.success) return;
    
    allUsersData = data.users || [];
    renderUsersTable(allUsersData);
}

function renderUsersTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    
    if (users.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--admin-text-muted);">No users found in simulated bank database.</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = users.map(user => `
        <tr>
            <td><strong style="font-family: var(--font-mono);">#USR-${user.id}</strong><div style="font-size:10px;color:var(--admin-text-muted);">MID: ${user.mid_number || '—'}</div></td>
            <td>
                <div style="font-weight: 700; color: var(--admin-text-main);">${user.first_name} ${user.last_name}</div>
                <div style="font-size: 11px; color: var(--admin-text-muted);">${user.email}</div>
            </td>
            <td><span style="font-family: var(--font-mono); font-weight: 600;">${user.account_number}</span></td>
            <td><strong style="color: #15803d;">₹${user.balance.toLocaleString('en-IN', {minimumFractionDigits: 2})}</strong></td>
            <td>
                <span class="status-badge ${user.account_status.toLowerCase()}">${user.account_status}</span>
            </td>
            <td style="font-size: 12px; color: var(--admin-text-muted);">${user.created_at || '-'}</td>
            <td>
                <a href="/admin/users/${user.id}" class="btn-action-small btn-action-primary">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    Manage Account
                </a>
            </td>
        </tr>
    `).join('');
}

function filterUsersTable() {
    const searchVal = (document.getElementById('search-users-input')?.value || '').toLowerCase();
    const statusVal = document.getElementById('filter-users-status')?.value || '';
    
    const filtered = allUsersData.filter(u => {
        const matchesSearch = !searchVal || 
            u.username.toLowerCase().includes(searchVal) ||
            u.email.toLowerCase().includes(searchVal) ||
            u.first_name.toLowerCase().includes(searchVal) ||
            u.last_name.toLowerCase().includes(searchVal) ||
            u.account_number.toLowerCase().includes(searchVal) || (u.mid_number || '').toLowerCase().includes(searchVal);
            
        const matchesStatus = !statusVal || u.account_status === statusVal;
        
        return matchesSearch && matchesStatus;
    });
    
    renderUsersTable(filtered);
}

/* ==========================================================================
   3. USER DETAIL PAGE LOADER & CONTROLS
   ========================================================================== */
let currentDetailUserId = null;

async function loadUserDetailData() {
    const pathParts = window.location.pathname.split('/');
    const userId = pathParts[pathParts.length - 1];
    currentDetailUserId = userId;
    
    const data = await adminFetch(`/api/admin/users/${userId}`);
    if (!data || !data.success) return;
    
    const user = data.user;
    const privileges = data.privileges || {};
    
    // Basic User Profile Info
    document.getElementById('user-detail-name').textContent = `${user.first_name} ${user.last_name}`;
    document.getElementById('user-detail-email').textContent = user.email;
    document.getElementById('user-detail-username').textContent = user.username;
    document.getElementById('user-detail-acc-num').textContent = user.account_number;
    document.getElementById('user-detail-balance').textContent = `₹${user.balance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    const info = data.add_info || {};
    const setInfo=(id,val)=>{const el=document.getElementById(id); if(el) el.textContent=val || '—';};
    setInfo('admin-user-mid', user.mid_number); setInfo('admin-user-last-login', user.last_login || 'Never');
    setInfo('admin-user-dob', info.date_of_birth); setInfo('admin-user-mobile', info.mobile_number); setInfo('admin-user-pan', info.pan);
    setInfo('admin-user-father', info.father_name); setInfo('admin-user-alt-email', info.alternate_email); setInfo('admin-user-marital', info.marital_status);
    setInfo('admin-user-religion', info.religion); setInfo('admin-user-category', info.category); setInfo('admin-user-comm-address', info.communication_address); setInfo('admin-user-perm-address', info.permanent_address);
    
    const statusBadge = document.getElementById('user-detail-status-badge');
    if (statusBadge) {
        statusBadge.textContent = user.account_status;
        statusBadge.className = `status-badge ${user.account_status.toLowerCase()}`;
    }
    
    // Privileges toggles
    document.getElementById('priv-online-banking').checked = !!privileges.online_banking;
    document.getElementById('priv-fund-transfer').checked = !!privileges.fund_transfer;
    document.getElementById('priv-card-access').checked = !!privileges.card_access;
    document.getElementById('priv-loan-app').checked = !!privileges.loan_application;
    document.getElementById('priv-high-value').checked = !!privileges.high_value_transfer;
    
    // Render Transactions History for this user
    const txBody = document.getElementById('user-detail-tx-body');
    if (txBody) {
        if (data.transactions.length === 0) {
            txBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--admin-text-muted);">No transaction records.</td></tr>`;
        } else {
            txBody.innerHTML = data.transactions.map(tx => `
                <tr>
                    <td style="font-family: var(--font-mono); font-size: 11px;">${tx.reference_id || tx.referenceId || tx.id}</td>
                    <td>
                        <div class="fw-bold text-dark small" style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${tx.title || tx.type}</div>
                        <div class="text-muted font-monospace" style="font-size: 11px; color: #64748b;">${tx.subtext || tx.description || ''}</div>
                    </td>
                    <td style="color: ${['CREDIT', 'TRANSFER_IN', 'DEPOSIT', 'ADMIN_CREDIT'].includes(tx.type) ? '#15803d' : '#b91c1c'}; font-weight: 700;">${['CREDIT', 'TRANSFER_IN', 'DEPOSIT', 'ADMIN_CREDIT'].includes(tx.type) ? '+' : '-'}₹${tx.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                    <td style="font-size: 12px;">₹${tx.balance_after.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                    <td style="font-size: 11px; color: var(--admin-text-muted);">${tx.created_at}</td>
                </tr>
            `).join('');
        }
    }
}

async function saveUserPrivileges() {
    if (!currentDetailUserId) return;
    
    const payload = {
        online_banking: document.getElementById('priv-online-banking').checked,
        fund_transfer: document.getElementById('priv-fund-transfer').checked,
        card_access: document.getElementById('priv-card-access').checked,
        loan_application: document.getElementById('priv-loan-app').checked,
        high_value_transfer: document.getElementById('priv-high-value').checked
    };
    
    const res = await adminFetch(`/api/admin/users/${currentDetailUserId}/privileges`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });
    
    if (res && res.success) {
        showAdminToast('User Privileges Updated & Saved!', 'success');
    } else {
        showAdminToast(res?.message || 'Failed to update privileges', 'error');
    }
}

async function changeUserAccountStatus(newStatus) {
    if (!currentDetailUserId) return;
    
    if (!confirm(`Are you sure you want to change this user's status to ${newStatus}?`)) return;
    
    const res = await adminFetch(`/api/admin/users/${currentDetailUserId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus, reason: 'Updated via Master Control Center' })
    });
    
    if (res && res.success) {
        showAdminToast(`User status updated to ${newStatus}`, 'success');
        loadUserDetailData();
    } else {
        showAdminToast(res?.message || 'Failed to update status', 'error');
    }
}

function openFundModal() {
    const modal = document.getElementById('fund-adjustment-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeFundModal() {
    const modal = document.getElementById('fund-adjustment-modal');
    if (modal) modal.classList.add('hidden');
}

async function submitFundAdjustment(e) {
    e.preventDefault();
    if (!currentDetailUserId) return;
    
    const amount = parseFloat(document.getElementById('fund-adj-amount').value || 0);
    const type = document.getElementById('fund-adj-type').value;
    const reason = document.getElementById('fund-adj-reason').value.trim();
    
    if (amount <= 0) {
        showAdminToast('Please enter a valid positive adjustment amount', 'error');
        return;
    }
    
    const res = await adminFetch(`/api/admin/users/${currentDetailUserId}/funds`, {
        method: 'POST',
        body: JSON.stringify({ amount, type, reason })
    });
    
    if (res && res.success) {
        showAdminToast(`Fund ${type} completed! New Balance: ₹${res.new_balance.toLocaleString('en-IN')}`, 'success');
        closeFundModal();
        loadUserDetailData();
    } else {
        showAdminToast(res?.message || 'Fund adjustment failed', 'error');
    }
}

/* ==========================================================================
   4. LOAN MANAGEMENT TABLE & ACTIONS
   ========================================================================== */
async function loadLoansTable() {
    const data = await adminFetch('/api/admin/loans');
    if (!data || !data.success) return;
    
    const container = document.getElementById('loans-list-container');
    if (!container) return;
    
    if (data.loans.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--admin-text-muted);">No loan applications in system.</div>`;
        return;
    }
    
    container.innerHTML = data.loans.map(loan => {
        let statusBadgeClass = loan.status === 'APPROVED' ? 'bg-success' : loan.status === 'REJECTED' ? 'bg-danger' : 'bg-warning text-dark';
        
        let actionButtons = '';
        if (loan.status === 'PENDING') {
            actionButtons = `
                <button onclick="handleLoanAction(${loan.id}, 'APPROVE')" class="btn btn-sm btn-success px-3 fw-medium">Approve</button>
                <button onclick="handleLoanAction(${loan.id}, 'REJECT')" class="btn btn-sm btn-danger px-3 fw-medium">Reject</button>
            `;
        } else if (loan.status === 'APPROVED') {
            actionButtons = `
                <button onclick="handleLoanAction(${loan.id}, 'DISBURSE')" class="btn btn-sm btn-success px-3 fw-medium">Disburse</button>
                <button onclick="handleLoanAction(${loan.id}, 'REJECT')" class="btn btn-sm btn-danger px-3 fw-medium">Reject</button>
            `;
        } else if (loan.status === 'ACTIVE') {
            actionButtons = `
                <button onclick="handleLoanAction(${loan.id}, 'CLOSE')" class="btn btn-sm btn-danger px-3 fw-medium">Close</button>
            `;
        } else {
            actionButtons = `<span style="font-size: 11px; color: var(--admin-text-muted);">${loan.disbursed_at || loan.approved_at || loan.status}</span>`;
        }

        return `
    <div class="card border rounded-3 shadow-sm bg-white overflow-hidden loan-admin-card mb-3" id="loan-card-${loan.id}">
       <!-- Card Header / Summary Row (Clickable) -->
       <div class="card-body p-3 p-md-4 loan-header-trigger" style="cursor: pointer;" data-target="drawer-${loan.id}">
         <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
           
           <!-- Left: Application Details & User Info -->
           <div>
             <div class="d-flex align-items-center gap-2 mb-1">
               <span class="fw-bold text-dark fs-6">${loan.reference_id || 'SPXPL-'+loan.id}</span>
               <span class="badge bg-light text-secondary border">PERSONAL</span>
             </div>
             <div class="text-muted small">
               <span class="fw-semibold text-dark">${loan.first_name} ${loan.last_name}</span> 
               <span class="mx-1">•</span> 
               <span>Acc: ${loan.account_number}</span>
               <span class="mx-1">•</span> 
               <span>Applied: ${loan.created_at || loan.applied_at}</span>
             </div>
           </div>

           <!-- Center: Requested Amount & Interest Badge -->
           <div class="d-flex align-items-center gap-4">
             <div>
               <div class="text-muted small text-uppercase" style="font-size: 11px;">Requested Amount</div>
               <div class="fw-bold text-dark fs-5">₹${(loan.amount).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
             </div>
             <div>
               <div class="text-muted small text-uppercase" style="font-size: 11px;">Tenure & Rate</div>
               <div class="fw-semibold text-secondary">${loan.interest_rate || 12.5}% (${loan.tenure_months || 12} mos)</div>
             </div>
           </div>

           <!-- Right: Status Badge, Action Buttons & Chevron -->
           <div class="d-flex align-items-center gap-2">
             <span class="badge ${statusBadgeClass} px-3 py-2 text-uppercase">
               ${loan.status}
             </span>

             ${actionButtons}

             <!-- Dropdown Accordion Chevron Icon -->
             <button class="btn btn-link text-muted p-1 ms-1 chevron-btn" type="button">
               <i class="fas fa-chevron-down transition-icon fs-6"></i>
             </button>
           </div>

         </div>
       </div>

       <!-- Collapsible Drawer (Hidden by Default) -->
       <div class="loan-details-drawer border-top bg-light p-3 p-md-4 d-none" id="drawer-${loan.id}">
         <div class="row g-4">
           
           <!-- Financial Info Chips -->
           <div class="col-lg-6">
             <h6 class="fw-bold text-dark mb-3"><i class="fas fa-info-circle text-primary me-2"></i>Application Breakdown</h6>
             
             <div class="row g-2 mb-3">
               <div class="col-6 col-sm-3">
                 <div class="p-2 bg-white rounded border text-center">
                   <div class="text-muted" style="font-size: 11px;">EMI</div>
                   <div class="fw-bold text-dark small">₹${(loan.calculated_emi || loan.emi || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                 </div>
               </div>
               <div class="col-6 col-sm-3">
                 <div class="p-2 bg-white rounded border text-center">
                   <div class="text-muted" style="font-size: 11px;">Tenure</div>
                   <div class="fw-bold text-dark small">${loan.tenure_months || 12} Months</div>
                 </div>
               </div>
               <div class="col-6 col-sm-3">
                 <div class="p-2 bg-white rounded border text-center">
                   <div class="text-muted" style="font-size: 11px;">Employment</div>
                   <div class="fw-bold text-dark small">${loan.employment_type || 'Salaried'}</div>
                 </div>
               </div>
               <div class="col-6 col-sm-3">
                 <div class="p-2 bg-white rounded border text-center">
                   <div class="text-muted" style="font-size: 11px;">Income</div>
                   <div class="fw-bold text-dark small">₹${(loan.monthly_income || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                 </div>
               </div>
             </div>

             <div class="p-3 bg-white rounded border">
               <span class="text-muted small d-block mb-1 font-monospace">PURPOSE / REASON</span>
               <p class="mb-0 text-dark small fw-medium">${loan.purpose || 'Personal Expenses'}</p>
             </div>
           </div>

           <!-- Uploaded Verification Documents (3 Separate Slots) -->
           <div class="col-lg-6">
             <h6 class="fw-bold text-dark mb-3"><i class="fas fa-folder-open text-primary me-2"></i>Verification Documents</h6>
             <div class="d-flex flex-column gap-2">
               
               <div class="p-2 bg-white border rounded d-flex align-items-center justify-content-between">
                 <div class="d-flex align-items-center">
                   <i class="fas fa-user-circle text-primary fs-5 me-2"></i>
                   <div>
                     <div class="fw-semibold small text-dark">Applicant Photo</div>
                     <div class="text-muted" style="font-size: 11px;">Passport Size Photo</div>
                   </div>
                 </div>
                 <a href="/static/uploads/${loan.photo_doc || loan.user_photo || 'default_photo.jpg'}" target="_blank" class="btn btn-sm btn-outline-primary py-1 px-3">
                   <i class="fas fa-external-link-alt me-1"></i> View Photo
                 </a>
               </div>

               <div class="p-2 bg-white border rounded d-flex align-items-center justify-content-between">
                 <div class="d-flex align-items-center">
                   <i class="fas fa-id-card text-success fs-5 me-2"></i>
                   <div>
                     <div class="fw-semibold small text-dark">Aadhaar Card</div>
                     <div class="text-muted" style="font-size: 11px;">Government ID Proof</div>
                   </div>
                 </div>
                 <a href="/static/uploads/${loan.aadhaar_doc || loan.aadhaar_file || 'sample_aadhaar.pdf'}" target="_blank" class="btn btn-sm btn-outline-primary py-1 px-3">
                   <i class="fas fa-external-link-alt me-1"></i> View Aadhaar
                 </a>
               </div>

               <div class="p-2 bg-white border rounded d-flex align-items-center justify-content-between">
                 <div class="d-flex align-items-center">
                   <i class="fas fa-file-invoice text-warning fs-5 me-2"></i>
                   <div>
                     <div class="fw-semibold small text-dark">PAN Card</div>
                     <div class="text-muted" style="font-size: 11px;">Tax & Identification Proof</div>
                   </div>
                 </div>
                 <a href="/static/uploads/${loan.pan_doc || loan.pan_file || 'sample_pan.pdf'}" target="_blank" class="btn btn-sm btn-outline-primary py-1 px-3">
                   <i class="fas fa-external-link-alt me-1"></i> View PAN
                 </a>
               </div>

             </div>
           </div>

         </div>
       </div>

    </div>`;
    }).join('');

    // Attach click listeners for expandable rows
    document.querySelectorAll('.loan-header-trigger').forEach(row => {
        row.addEventListener('click', function(e) {
            if (e.target.closest('button') || e.target.closest('a') || e.target.closest('form')) return;
            const targetDrawer = document.getElementById(this.dataset.target);
            const chevron = this.querySelector('.fa-chevron-down');
            if (targetDrawer) {
                if (targetDrawer.classList.contains('d-none')) {
                    targetDrawer.classList.remove('d-none');
                    if (chevron) chevron.style.transform = 'rotate(180deg)';
                } else {
                    targetDrawer.classList.add('d-none');
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                }
            }
        });
    });
}

async function handleLoanAction(loanId, action) {
    const notes = prompt(`Enter administrative note for loan #${loanId} (${action}):`, `${action} by Master Admin`);
    if (notes === null) return;
    
    const res = await adminFetch(`/api/admin/loans/${loanId}/action`, {
        method: 'PUT',
        body: JSON.stringify({ action, notes })
    });
    
    if (res && res.success) {
        showAdminToast(`Loan #${loanId} ${action}D!`, 'success');
        loadLoansTable();
    } else {
        showAdminToast(res?.message || 'Loan action failed', 'error');
    }
}

/* ==========================================================================
   5. CARD MANAGEMENT TABLE & ACTIONS
   ========================================================================== */
async function loadCardsTable() {
    const data = await adminFetch('/api/admin/cards');
    if (!data || !data.success) return;
    
    const tableBody = document.getElementById('cards-table-body');
    if (!tableBody) return;
    
    if (data.cards.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--admin-text-muted);">No card records found.</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = data.cards.map(card => `
        <tr>
            <td><strong style="font-family: var(--font-mono);">#CRD-${card.id}</strong></td>
            <td>
                <div style="font-weight: 700;">${card.first_name} ${card.last_name}</div>
                <div style="font-size: 11px; color: var(--admin-text-muted);">${card.email}</div>
            </td>
            <td><strong>${card.card_type}</strong></td>
            <td><span style="font-family: var(--font-mono); letter-spacing: 2px;">${card.card_number_masked}</span></td>
            <td><span class="status-badge ${card.status.toLowerCase()}">${card.status}</span></td>
            <td>
                ${card.status === 'REQUESTED' || card.status === 'PENDING' ? `
                    <button onclick="handleCardAction(${card.id}, 'ISSUE')" class="btn-action-small btn-action-success">Issue & Activate</button>
                ` : card.status === 'ACTIVE' ? `
                    <button onclick="handleCardAction(${card.id}, 'BLOCK')" class="btn-action-small btn-action-danger">Block Card</button>
                ` : `
                    <button onclick="handleCardAction(${card.id}, 'ACTIVATE')" class="btn-action-small btn-action-primary">Unblock</button>
                `}
            </td>
        </tr>
    `).join('');
}

async function handleCardAction(cardId, action) {
    if (!confirm(`Are you sure you want to perform action '${action}' on Card #${cardId}?`)) return;
    
    const res = await adminFetch(`/api/admin/cards/${cardId}/action`, {
        method: 'PUT',
        body: JSON.stringify({ action })
    });
    
    if (res && res.success) {
        showAdminToast(`Card #${cardId} updated to ${action}`, 'success');
        loadCardsTable();
    } else {
        showAdminToast(res?.message || 'Card action failed', 'error');
    }
}

/* ==========================================================================
   6. TRANSACTIONS & AUDIT LOG LOADERS
   ========================================================================== */
async function loadTransactionsTable() {
    const data = await adminFetch('/api/admin/transactions');
    if (!data || !data.success) return;
    
    const tableBody = document.getElementById('tx-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = data.transactions.map(tx => `
        <tr>
            <td style="font-family: var(--font-mono); font-size: 11px; font-weight: 700;">${tx.reference_id || tx.id}</td>
            <td>
                <div style="font-weight: 600;">${tx.first_name} ${tx.last_name}</div>
                <div style="font-size: 11px; color: var(--admin-text-muted);">${tx.account_number}</div>
            </td>
            <td>
                <div class="fw-bold text-dark small" style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${tx.title || tx.type}</div>
                <div class="text-muted font-monospace" style="font-size: 11px; color: #64748b;">${tx.subtext || tx.description || ''}</div>
            </td>
            <td style="color: ${['CREDIT', 'TRANSFER_IN', 'DEPOSIT', 'ADMIN_CREDIT'].includes(tx.type) ? '#15803d' : '#b91c1c'}; font-weight: 700;">${['CREDIT', 'TRANSFER_IN', 'DEPOSIT', 'ADMIN_CREDIT'].includes(tx.type) ? '+' : '-'}₹${tx.amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            <td>₹${tx.balance_after.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            <td><span class="status-badge active">${tx.status}</span></td>
            <td style="font-size: 11px; color: var(--admin-text-muted);">${tx.created_at}</td>
        </tr>
    `).join('');
}

async function loadAuditLogsTable() {
    const data = await adminFetch('/api/admin/audit-logs');
    if (!data || !data.success) return;
    
    const tableBody = document.getElementById('audit-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = data.audit_logs.map(log => `
        <tr>
            <td style="font-family: var(--font-mono); font-size: 11px;">#LOG-${log.id}</td>
            <td style="font-size: 12px; font-weight: 600;">${log.created_at}</td>
            <td><span class="status-badge ${log.status === 'SUCCESS' ? 'active' : 'locked'}">${log.action}</span></td>
            <td><strong style="color: var(--admin-accent);">${log.target_type || 'SYSTEM'} ${log.target_id ? '#' + log.target_id : ''}</strong></td>
            <td style="font-size: 12.5px;">${log.details || '-'}</td>
            <td style="font-size: 11px; color: var(--admin-text-muted);">${log.admin_email}</td>
        </tr>
    `).join('');
}

/* ==========================================================================
   TOAST NOTIFICATION ENGINE FOR ADMIN UI
   ========================================================================== */
function showAdminToast(message, type = 'info') {
    let container = document.getElementById('admin-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'admin-toast-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: toastIn 0.25s ease-out;
    `;
    
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

