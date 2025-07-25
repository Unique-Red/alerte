// admin_script.js
document.addEventListener('DOMContentLoaded', () => {

    // ==================================
    // --- CONFIGURATION & STATE ---
    // ==================================
    const API_BASE_URL = 'https://alerte.pythonanywhere.com'; // IMPORTANT: REPLACE
    const state = {
        tokens: {
            access: localStorage.getItem('super_admin_access_token'),
            refresh: localStorage.getItem('super_admin_refresh_token'),
        },
        user: JSON.parse(localStorage.getItem('super_admin_info')),
        currentView: 'dashboard',
    };

    // ==================================
    // --- DOM ELEMENT REFERENCES ---
    // ==================================
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const mainContent = document.getElementById('main-content');
    const navLinks = document.querySelectorAll('.nav-link');
    const loader = document.getElementById('loader');
    const welcomeMessage = document.getElementById('welcome-message');

    // ==================================
    // --- API CLIENT (AXIOS-LIKE) ---
    // ==================================
    const apiClient = {
        async request(method, path, data = null) {
            showLoader(true);
            const url = `${API_BASE_URL}${path}`;
            const headers = { 'Content-Type': 'application/json' };
            if (state.tokens.access) {
                headers['Authorization'] = `Bearer ${state.tokens.access}`;
            }

            const config = {
                method,
                headers,
                body: data ? JSON.stringify(data) : null,
            };

            try {
                const response = await fetch(url, config);
                // Handle non-JSON responses for specific cases if needed
                if (response.status === 204) { // No Content
                    return null;
                }
                const responseData = await response.json();
                if (!response.ok) {
                    throw new Error(responseData.message || `HTTP error! Status: ${response.status}`);
                }
                return responseData;
            } catch (error) {
                console.error(`API Error on ${method} ${path}:`, error);
                // Simple error handling for now. A real app would have token refresh logic here.
                if (error.message.includes('token has expired')) {
                    handleLogout(); // Simple logout on token expiry
                }
                throw error; // Re-throw to be caught by the caller
            } finally {
                showLoader(false);
            }
        },
        get(path) { return this.request('GET', path); },
        post(path, data) { return this.request('POST', path, data); },
        put(path, data) { return this.request('PUT', path, data); },
    };

    // ==================================
    // --- TEMPLATE RENDERERS ---
    // ==================================
    function renderDashboard(stats) {
        mainContent.innerHTML = `
            <h2>Dashboard</h2>
            <div class="stats-grid">
                <div class="stat-card"><div class="value">${stats.total_users}</div><div class="label">Total Users</div></div>
                <div class="stat-card"><div class="value">${stats.total_agencies}</div><div class="label">Total Agencies</div></div>
                <div class="stat-card"><div class="value">${stats.pending_agencies}</div><div class="label">Pending Agencies</div></div>
                <div class="stat-card"><div class="value">${stats.active_agencies}</div><div class="label">Active Agencies</div></div>
                <div class="stat-card"><div class="value">${stats.total_agents}</div><div class="label">Total Agents</div></div>
                <div class="stat-card"><div class="value">${stats.active_alerts}</div><div class="label">Active Alerts</div></div>
            </div>`;
    }

    function renderAgencies(agencies, viewType) {
        let title = viewType === 'pending-agencies' ? 'Pending Agency Approvals' : 'All Agencies';
        let rows = agencies.map(agency => `
            <tr>
                <td>${agency.id}</td>
                <td>${agency.name}</td>
                <td>${agency.type}</td>
                <td>${agency.email}</td>
                <td><span class="status status-${agency.status}">${agency.status.replace('_', ' ').toUpperCase()}</span></td>
                <td>${agency.admin_agent ? agency.admin_agent.full_name : 'N/A'}</td>
                <td class="action-buttons">
                    ${agency.status === 'pending_approval' ? `
                        <button class="button-success" data-action="approve" data-agency-id="${agency.id}">Approve</button>
                        <button class="button-danger" data-action="reject" data-agency-id="${agency.id}">Reject</button>
                    ` : agency.status === 'active' ? `
                        <button class="button-danger" data-action="suspend" data-agency-id="${agency.id}">Suspend</button>
                    ` : `
                        <button class="button-success" data-action="activate" data-agency-id="${agency.id}">Activate</button>
                    `}
                </td>
            </tr>`).join('');

        mainContent.innerHTML = `
            <h2>${title}</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th><th>Name</th><th>Type</th><th>Email</th><th>Status</th><th>Admin Agent</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="7">No agencies found.</td></tr>'}
                </tbody>
            </table>`;
    }

    function renderTestNotification() {
        mainContent.innerHTML = `
            <h2>Send Test Notification</h2>
            <form id="notification-form">
                <div class="input-group">
                    <label for="user_id">User ID (Leave blank for all)</label>
                    <input type="number" id="user_id" placeholder="Optional">
                </div>
                <div class="input-group">
                    <label for="title">Title</label>
                    <input type="text" id="title" required>
                </div>
                <div class="input-group">
                    <label for="body">Body</label>
                    <textarea id="body" required></textarea>
                </div>
                <button type="submit">Send Notification</button>
            </form>
            <div id="notification-result" class="result hidden"></div>`;
    }

    // ==================================
    // --- VIEW ROUTING & LOADING ---
    // ==================================
    async function loadView(viewName) {
        state.currentView = viewName;
        updateNavLinks();
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
            } else if (viewName === 'test-notification') {
                renderTestNotification();
            }
        } catch (error) {
            mainContent.innerHTML = `<p class="error-message" style="display:block;">Failed to load data: ${error.message}</p>`;
        }
    }

    function updateNavLinks() {
        navLinks.forEach(link => {
            if (link.dataset.view === state.currentView) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    // ==================================
    // --- EVENT HANDLERS ---
    // ==================================
    function setupEventListeners() {
        const loginForm = document.getElementById('login-form');
        const logoutButton = document.getElementById('logout-button');
        const signupForm = document.getElementById('signup-form');
        const showSignupLink = document.getElementById('show-signup-link');
        const showLoginLink = document.getElementById('show-login-link');
        
        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (signupForm) signupForm.addEventListener('submit', handleSignup);
        if (showSignupLink) showSignupLink.addEventListener('click', (e) => { e.preventDefault(); showView('signup'); });
        if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showView('login'); });
        
        if (logoutButton) logoutButton.addEventListener('click', handleLogout);

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.target.dataset.view;
                if (view) loadView(view);
            });
        });

        // Event delegation for dynamically created buttons/forms
        mainContent.addEventListener('click', async (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.action) {
                const action = e.target.dataset.action;
                const agencyId = e.target.dataset.agencyId;
                let newStatus = '';
                if (action === 'approve' || action === 'activate') newStatus = 'active';
                if (action === 'reject') newStatus = 'rejected';
                if (action === 'suspend') newStatus = 'suspended';
                
                if (newStatus && confirm(`Are you sure you want to ${action} this agency?`)) {
                    try {
                        await apiClient.put(`/admin/agencies/${agencyId}/status`, { status: newStatus });
                        alert(`Agency ${action}d successfully!`);
                        loadView(state.currentView); // Refresh the current view
                    } catch (error) {
                        alert(`Error: ${error.message}`);
                    }
                }
            }
        });

        mainContent.addEventListener('submit', async (e) => {
            if (e.target.id === 'notification-form') {
                e.preventDefault();
                const userId = document.getElementById('user_id').value || null;
                const title = document.getElementById('title').value;
                const body = document.getElementById('body').value;
                const resultDiv = document.getElementById('notification-result');
                
                try {
                    const result = await apiClient.post('/admin/test-notification', {
                        user_id: userId ? parseInt(userId) : null,
                        title,
                        body
                    });
                    resultDiv.textContent = `Success! Result: ${JSON.stringify(result)}`;
                    resultDiv.classList.remove('hidden');
                } catch (error) {
                    resultDiv.textContent = `Error: ${error.message}`;
                    resultDiv.classList.remove('hidden');
                }
            }
        });
    }

    // ==================================
    // --- AUTHENTICATION LOGIC ---
    // ==================================
    async function handleLogin(event) {
        event.preventDefault();
        const loginButton = document.getElementById('login-button');
        const errorMessageElement = document.getElementById('login-error-message');
        loginButton.disabled = true;
        loginButton.textContent = 'Logging in...';
        errorMessageElement.style.display = 'none';

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const data = await apiClient.post('/super-admin-auth/login', { username, password });
            state.tokens.access = data.access_token;
            state.tokens.refresh = data.refresh_token;
            state.user = { id: data.super_admin_id, username: data.username };
            
            localStorage.setItem('super_admin_access_token', state.tokens.access);
            localStorage.setItem('super_admin_refresh_token', state.tokens.refresh);
            localStorage.setItem('super_admin_info', JSON.stringify(state.user));
            
            initApp();
        } catch (error) {
            errorMessageElement.textContent = error.message;
            errorMessageElement.style.display = 'block';
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        }
    }

    function handleLogout() {
        localStorage.clear();
        state.tokens.access = null;
        state.tokens.refresh = null;
        state.user = null;
        showView('login');
    }

    // ==================================
    // --- INITIALIZATION ---
    // ==================================
    function showView(viewName) {
        if (viewName === 'app') {
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            welcomeMessage.textContent = `Welcome, ${state.user.username}!`;
            loadView('dashboard'); // Load initial view
        } else {
            appContainer.classList.add('hidden');
            loginContainer.classList.remove('hidden');
        }
    }
    
    function showLoader(isLoading) {
        if (isLoading) {
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    }

    function initApp() {
        if (state.tokens.access) {
            showView('app');
            setupEventListeners();
        } else {
            showView('login');
            setupEventListeners(); // Still need login listener
        }
    }

    initApp();
});