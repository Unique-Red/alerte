let emailEditor = null;
document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = 'https://alerte.pythonanywhere.com';
    const state = {
        tokens: {
            access: localStorage.getItem('super_admin_access_token'),
            refresh: localStorage.getItem('super_admin_refresh_token'),
        },
        user: JSON.parse(localStorage.getItem('super_admin_info')),
        currentView: 'dashboard',
        usersList: []
    };

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const mainContent = document.getElementById('main-content');
    const navLinks = document.querySelectorAll('.nav-link');
    const loader = document.getElementById('loader');
    const welcomeMessage = document.getElementById('welcome-message');

    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    const apiClient = {
        async request(method, path, data = null) {
            showLoader(true);
            const url = `${API_BASE_URL}${path}`;
            const headers = { 'Content-Type': 'application/json' };
            if (state.tokens.access) {
                headers['Authorization'] = `Bearer ${state.tokens.access}`;
            }

            const config = { method, headers, body: data ? JSON.stringify(data) : null };

            try {
                const response = await fetch(url, config);
                if (response.status === 204) return null;
                const responseData = await response.json();
                if (!response.ok) throw new Error(responseData.message || `HTTP error! Status: ${response.status}`);
                return responseData;
            } catch (error) {
                console.error(`API Error on ${method} ${path}:`, error);
                if (error.message.includes('token has expired')) handleLogout();
                throw error;
            } finally {
                showLoader(false);
            }
        },
        get(path) { return this.request('GET', path); },
        post(path, data) { return this.request('POST', path, data); },
        put(path, data) { return this.request('PUT', path, data); },
    };

    function getStatusBadge(status) {
        if (!status) return '<span class="badge bg-gray">Unknown</span>';
        status = String(status).toLowerCase();

        if (status === 'active' || status === 'approved') return '<span class="badge bg-success">Active</span>';
        if (status.includes('pending')) return '<span class="badge bg-warning">Pending</span>';
        if (status === 'rejected' || status === 'suspended') return '<span class="badge bg-danger">Rejected</span>';
        return `<span class="badge bg-warning">${status}</span>`;
    }

    function openModal(title, content) {
        if (modalTitle) modalTitle.textContent = title;
        if (modalBody) modalBody.innerHTML = content;
        if (modalOverlay) modalOverlay.classList.remove('hidden');
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.add('hidden'); });

    function renderDashboard(stats) {
        mainContent.innerHTML = `
            <div class="page-header"><h2>Dashboard Overview</h2></div>
            <div class="stats-grid">
                <div class="stat-card"><h4>Total Users</h4><div class="value">${stats.total_users || 0}</div></div>
                <div class="stat-card"><h4>Total Agencies</h4><div class="value">${stats.total_agencies || 0}</div></div>
                <div class="stat-card"><h4>Pending Approval</h4><div class="value">${stats.pending_agencies || 0}</div></div>
                <div class="stat-card"><h4>Active Agencies</h4><div class="value">${stats.active_agencies || 0}</div></div>
                <div class="stat-card"><h4>Total Agents</h4><div class="value">${stats.total_agents || 0}</div></div>
                <div class="stat-card"><h4>Active Alerts</h4><div class="value">${stats.active_alerts || 0}</div></div>
            </div>`;
    }

    function renderAgencies(agencies, viewType) {
        let title = viewType === 'pending-agencies' ? 'Pending Approvals' : 'All Agencies';
        if (!agencies || agencies.length === 0) {
            mainContent.innerHTML = `<div class="page-header"><h2>${title}</h2></div><p>No agencies found.</p>`;
            return;
        }

        let rows = agencies.map(agency => {
            const status = (agency.status || '').toLowerCase();
            let buttons = '';

            if (status.includes('pending')) {
                buttons = `
                    <button class="btn-approve" data-action="approve" data-agency-id="${agency.id}" title="Approve"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-reject" data-action="reject" data-agency-id="${agency.id}" title="Reject"><i class="fa-solid fa-xmark"></i></button>`;
            } else if (status === 'active') {
                buttons = `<button class="btn-reject" data-action="suspend" data-agency-id="${agency.id}" title="Suspend"><i class="fa-solid fa-ban"></i></button>`;
            } else {
                buttons = `<button class="btn-approve" data-action="activate" data-agency-id="${agency.id}" title="Re-activate"><i class="fa-solid fa-rotate-right"></i></button>`;
            }

            return `
            <tr>
                <td>#${agency.id}</td>
                <td><strong>${agency.name}</strong><br><small style="color:#777">${agency.type}</small></td>
                <td>${agency.email}</td>
                <td>${getStatusBadge(status)}</td>
                <td>${agency.admin_agent ? agency.admin_agent.full_name : '<span style="color:#999">No Admin</span>'}</td>
                <td class="action-btn-group">${buttons}</td>
            </tr>`;
        }).join('');

        mainContent.innerHTML = `
            <div class="page-header"><h2>${title}</h2></div>
            <div class="table-container">
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Agency Name</th><th>Email</th><th>Status</th><th>Admin</th><th>Actions</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    function renderUsers(users) {
        state.usersList = users;
        mainContent.innerHTML = `
            <div class="page-header"><h2>User Database</h2></div>
            <div class="search-bar">
                <input type="text" placeholder="Filter by name or email..." id="user-search-input">
            </div>
            <div class="table-container">
                <table class="admin-table">
                    <thead><tr><th>User</th><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead>
                    <tbody id="users-table-body"></tbody>
                </table>
            </div>`;
        renderUserRows(users);

        const searchInput = document.getElementById('user-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = state.usersList.filter(u =>
                    (u.first_name + ' ' + u.last_name).toLowerCase().includes(term) ||
                    (u.email || '').toLowerCase().includes(term)
                );
                renderUserRows(filtered);
            });
        }
    }

    function renderUserRows(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const firstName = user.first_name || 'User';
            const lastName = user.last_name || '';
            const fullName = `${firstName} ${lastName}`;
            const initial = firstName.charAt(0).toUpperCase();

            let avatarHtml;
            if (user.profile_picture) {
                avatarHtml = `
                    <div style="position:relative; width:35px; height:35px;">
                        <img src="${user.profile_picture}" class="user-thumb" 
                             style="width:35px; height:35px; border-radius:50%; object-fit:cover;"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                        <div class="user-thumb-text" 
                             style="display:none; width:35px; height:35px; border-radius:50%; background:#c62828; color:white; align-items:center; justify-content:center; font-weight:bold;">
                             ${initial}
                        </div>
                    </div>`;
            } else {
                avatarHtml = `<div class="user-thumb-text" style="width:35px; height:35px; border-radius:50%; background:#c62828; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold;">${initial}</div>`;
            }

            const verifiedBadge = user.is_verified
                ? '<span class="badge bg-success" style="font-size:0.7rem;"><i class="fa-solid fa-check"></i> Verified</span>'
                : '<span class="badge bg-danger" style="font-size:0.7rem;">Unverified</span>';

            return `
            <tr>
                <td>
                    <div class="user-cell" style="display:flex; align-items:center; gap:10px;">
                        ${avatarHtml}
                        <div><strong>${fullName}</strong><br><small style="color:#777">ID: ${user.id}</small></div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td>${user.phone_number || 'N/A'}</td>
                <td>${verifiedBadge}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td class="action-btn-group">
                    <button class="btn-view" data-action="view-user" data-user-id="${user.id}">View</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderTestNotification() {
        mainContent.innerHTML = `
            <div class="page-header"><h2>Push Notifications</h2></div>
            <div style="max-width:600px;">
                <form id="notification-form">
                    <div class="input-group"><label>Target User ID</label><input type="number" id="user_id" placeholder="Leave blank for ALL users"></div>
                    <div class="input-group"><label>Alert Title</label><input type="text" id="title" required placeholder="e.g. Security Alert"></div>
                    <div class="input-group"><label>Message Body</label><textarea id="body" required placeholder="Message content..."></textarea></div>
                    <button type="submit" class="btn-login">Send Notification</button>
                </form>
                <div id="notification-result" class="badge bg-success hidden" style="display:block; margin-top:15px; padding:10px;"></div>
            </div>`;
    }

    function renderSendEmail() {
        mainContent.innerHTML = `
            <div class="page-header"><h2>Send Email Blast</h2></div>
            <div style="max-width:700px;">
                <form id="email-form">
                    <div class="input-group">
                        <label>Target User ID</label>
                        <input type="number" id="email_user_id" placeholder="Leave blank (or 0) for ALL users">
                        <small style="color:#666">Enter a specific User ID, or leave as 0 to email everyone.</small>
                    </div>
                    
                    <div class="input-group">
                        <label>Subject Line</label>
                        <input type="text" id="email_subject" required placeholder="e.g. Important Update from Alerte">
                    </div>
                    
                    <div class="input-group">
                        <label>Email Body</label>
                        <div id="editor-container" style="height: 250px; background: white;"></div>
                        <div style="background:#e3f2fd; padding:10px; border-radius:0 0 5px 5px; font-size:0.85rem; color:#0d47a1; border:1px solid #bbdefb; border-top:none;">
                            <strong><i class="fa-solid fa-wand-magic-sparkles"></i> Personalization Tips:</strong><br>
                            Type these codes: 
                            <span style="background:white; padding:2px 6px; border-radius:4px; margin:2px;">{{first_name}}</span>
                            <span style="background:white; padding:2px 6px; border-radius:4px; margin:2px;">{{email}}</span>
                        </div>
                    </div>
                    
                    <div class="input-group" style="display:flex; align-items:center; gap:10px; margin-bottom:20px; margin-top:15px;">
                        <input type="checkbox" id="email_preview" style="width:auto; margin:0;">
                        <label for="email_preview" style="margin:0; cursor:pointer;">Preview Only (Send only to me first)</label>
                    </div>

                    <button type="submit" class="btn-login" style="background:#1565c0;">
                        <i class="fa-solid fa-paper-plane"></i> Send Email
                    </button>
                </form>

                <div id="email-result" class="badge bg-success hidden" style="display:block; margin-top:15px; padding:10px;"></div>
            </div>`;
    }

    async function loadView(viewName) {
        state.currentView = viewName;
        updateNavLinks();
        mainContent.innerHTML = `<div style="text-align:center; padding:50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#c62828;"></i></div>`;

        try {
            if (viewName === 'dashboard') {
                const stats = await apiClient.get('/admin/dashboard/stats');
                renderDashboard(stats);
            } else if (viewName === 'pending-agencies') {
                const agencies = await apiClient.get('/admin/agencies?status=pending_approval');
                renderAgencies(agencies, viewName);
            } else if (viewName === 'all-agencies') {
                const agencies = await apiClient.get('/admin/agencies');
                renderAgencies(agencies, viewName);
            } else if (viewName === 'users') {
                const users = await apiClient.get('/users/get_all');
                renderUsers(users);
            } else if (viewName === 'test-notification') {
                renderTestNotification();
            } else if (viewName === 'send-email') {
                renderSendEmail();
                
                setTimeout(() => {
                    const container = document.getElementById('editor-container');
                    
                    // Only initialize if it hasn't been done yet
                    if (container && !container.classList.contains('ql-container')) {
                        emailEditor = new Quill('#editor-container', {
                            theme: 'snow',
                            placeholder: 'Compose your email here...',
                            modules: {
                                toolbar: [
                                    ['bold', 'italic', 'underline', 'strike'],
                                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                    [{ 'header': [1, 2, 3, false] }],
                                    [{ 'color': [] }, { 'background': [] }],
                                    ['link', 'clean']
                                ]
                            }
                        });
                    }
                }, 0);
                // ------------------------------------
            }
        } catch (error) {
            mainContent.innerHTML = `<div class="badge bg-danger" style="display:block; padding:20px; text-align:center;">Failed to load data: ${error.message}</div>`;
        }
    }


    function updateNavLinks() {
        navLinks.forEach(link => {
            if (link.dataset.view === state.currentView) link.classList.add('active');
            else link.classList.remove('active');
        });
    }

    function setupEventListeners() {
        const loginForm = document.getElementById('login-form');
        const logoutButton = document.getElementById('logout-button');

        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (logoutButton) logoutButton.addEventListener('click', handleLogout);

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // Ensure we get the data attribute even if clicking the icon
                const view = e.target.closest('.nav-link')?.dataset.view;
                if (view) loadView(view);
            });
        });

        // Dynamic Clicks
        mainContent.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn || !btn.dataset.action) return;

            const action = btn.dataset.action;

            if (['approve', 'reject', 'suspend', 'activate'].includes(action)) {
                const agencyId = btn.dataset.agencyId;
                let newStatus = '';
                if (action === 'approve' || action === 'activate') newStatus = 'active';
                if (action === 'reject') newStatus = 'rejected';
                if (action === 'suspend') newStatus = 'suspended';

                if (confirm(`Are you sure you want to ${action} this agency?`)) {
                    try {
                        await apiClient.put(`/admin/agencies/${agencyId}/status`, { status: newStatus });
                        loadView(state.currentView);
                    } catch (error) { alert(`Error: ${error.message}`); }
                }
            }

            if (action === 'view-user') {
                const userId = parseInt(btn.dataset.userId);
                const user = state.usersList.find(u => u.id === userId);
                if (user) {
                    const firstName = user.first_name || 'User';
                    const initial = firstName.charAt(0).toUpperCase();
                    let avatarHtml = user.profile_picture
                        ? `<img src="${user.profile_picture}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid #eee;">`
                        : `<div style="width:80px; height:80px; border-radius:50%; background:#c62828; color:white; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:bold; margin:0 auto;">${initial}</div>`;

                    const content = `
                        <div style="text-align:center; margin-bottom:20px;">
                            ${avatarHtml}
                            <h3 style="margin-top:10px;">${user.first_name} ${user.last_name || ''}</h3>
                            <p style="color:#666">${user.email}</p>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; font-size:0.9rem;">
                            <div><strong>User ID:</strong> ${user.id}</div>
                            <div><strong>Phone:</strong> ${user.phone_number || 'N/A'}</div>
                            <div><strong>Provider:</strong> ${user.auth_provider || 'Email'}</div>
                            <div><strong>Google ID:</strong> ${user.google_id || 'N/A'}</div>
                            <div><strong>Joined:</strong> ${new Date(user.created_at).toDateString()}</div>
                            <div><strong>Updated:</strong> ${new Date(user.updated_at).toDateString()}</div>
                            <div style="grid-column:1/-1; border-top:1px solid #eee; padding-top:10px;">
                                <strong>Home Address:</strong><br>
                                ${user.home_address || 'Not Set'} <br>
                                <small>Postcode: ${user.postcode || 'N/A'}</small>
                            </div>
                            <div style="grid-column:1/-1; background:#f9f9f9; padding:10px; border-radius:5px;">
                                <strong>Coords (Lat/Long):</strong><br>
                                ${user.latitude || '0'}, ${user.longitude || '0'}
                            </div>
                        </div>`;
                    openModal("User Details", content);
                }
            }
        });

        // Form Handling (Notifications & Emails)
        mainContent.addEventListener('submit', async (e) => {

            // 1. PUSH NOTIFICATIONS
            if (e.target.id === 'notification-form') {
                e.preventDefault();
                const userId = document.getElementById('user_id').value;
                const resultDiv = document.getElementById('notification-result');

                try {
                    await apiClient.post('/admin/test-notification', {
                        user_id: userId ? parseInt(userId) : null,
                        title: document.getElementById('title').value,
                        body: document.getElementById('body').value
                    });
                    resultDiv.textContent = "Notification Sent Successfully!";
                    resultDiv.className = "badge bg-success";
                    resultDiv.classList.remove('hidden');
                } catch (error) {
                    resultDiv.textContent = `Error: ${error.message}`;
                    resultDiv.className = "badge bg-danger";
                    resultDiv.classList.remove('hidden');
                }
            }

            if (e.target.id === 'email-form') {
                e.preventDefault();
                
                const userIdInput = document.getElementById('email_user_id').value;
                const subject = document.getElementById('email_subject').value;
                const isPreview = document.getElementById('email_preview').checked;
                const btn = e.target.querySelector('button');
                const resultDiv = document.getElementById('email-result');

                // Get Editor Content
                const bodyContent = emailEditor ? emailEditor.root.innerHTML : '';
                if (!bodyContent || bodyContent === '<p><br></p>') {
                    alert("Please write a message body.");
                    return;
                }

                btn.disabled = true; 
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Queuing...';
                
                try {
                    // Send ONE request. Celery handles the rest.
                    const payload = {
                        user_id: userIdInput ? parseInt(userIdInput) : 0, // 0 = All Users
                        subject: subject,
                        body: bodyContent,
                        preview_only: isPreview
                    };

                    const response = await apiClient.post('/admin/send-email', payload);
                    
                    // Success Message
                    resultDiv.innerHTML = `
                        <strong><i class="fa-solid fa-check-circle"></i> Success!</strong><br>
                        Your email blast has been queued. The server is sending them in the background.<br>
                        <small>Task ID: ${response.task_id || 'Submitted'}</small>
                    `;
                    resultDiv.className = "badge bg-success";
                    resultDiv.classList.remove('hidden');

                    // Reset
                    if(!isPreview) {
                        e.target.reset();
                        if(emailEditor) emailEditor.setContents([]);
                    }

                } catch (error) {
                    resultDiv.textContent = `Error: ${error.message}`;
                    resultDiv.className = "badge bg-danger";
                    resultDiv.classList.remove('hidden');
                } finally {
                    btn.disabled = false; 
                    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Email';
                }
            }
        });
    }

    async function handleLogin(event) {
        event.preventDefault();
        const loginBtn = document.getElementById('login-button');
        const errBox = document.getElementById('login-error-message');
        loginBtn.disabled = true; loginBtn.textContent = 'Verifying...'; errBox.style.display = 'none';

        try {
            const data = await apiClient.post('/super-admin-auth/login', {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            });
            state.tokens.access = data.access_token;
            state.user = { id: data.super_admin_id, username: data.username };
            localStorage.setItem('super_admin_access_token', data.access_token);
            localStorage.setItem('super_admin_info', JSON.stringify(state.user));
            initApp();
        } catch (error) {
            errBox.textContent = "Invalid credentials"; errBox.style.display = 'block';
        } finally {
            loginBtn.disabled = false; loginBtn.textContent = 'Login';
        }
    }

    function handleLogout() {
        localStorage.clear();
        state.tokens.access = null;
        showView('login');
    }

    function showView(viewName) {
        if (viewName === 'app') {
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            if (welcomeMessage) welcomeMessage.textContent = `Welcome, ${state.user.username}`;
            loadView('dashboard');
        } else {
            appContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
        }
    }

    function showLoader(isLoading) {
        if (isLoading) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }

    function initApp() {
        if (state.tokens.access) {
            showView('app');
            setupEventListeners();
        } else {
            showView('login');
            const form = document.getElementById('login-form');
            if (form) form.addEventListener('submit', handleLogin);
        }
    }

    initApp();
});