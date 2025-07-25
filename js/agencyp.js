// script.js
document.addEventListener('DOMContentLoaded', () => {

    // ==================================
    // --- CONFIGURATION & STATE ---
    // ==================================
    const API_BASE_URL = 'https://alerte.pythonanywhere.com'; // IMPORTANT: REPLACE
    const state = {
        tokens: {
            access: localStorage.getItem('agent_access_token'),
            refresh: localStorage.getItem('agent_refresh_token'),
        },
        agent: JSON.parse(localStorage.getItem('agent_info')),
        agencyProfile: null,
        agentList: [],
    };

    // ==================================
    // --- DOM ELEMENT REFERENCES ---
    // ==================================
    const loginContainer = document.getElementById('login-container');
    const signupContainer = document.getElementById('signup-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const loader = document.getElementById('loader');

    // Login
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loginErrorMessage = document.getElementById('login-error-message');
    const showSignupLink = document.getElementById('show-signup-link');
    
    // Signup
    const signupForm = document.getElementById('signup-form');
    const signupButton = document.getElementById('signup-button');
    const signupErrorMessage = document.getElementById('signup-error-message');
    const showLoginLink = document.getElementById('show-login-link');
    
    // Dashboard
    const agentNameDisplay = document.getElementById('agent-name-display');
    const agencyNameHeader = document.getElementById('agency-name-header');
    const agencyProfileContent = document.getElementById('agency-profile-content');
    const agentListContent = document.getElementById('agent-list-content');
    const logoutButton = document.getElementById('logout-button');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const addAgentBtn = document.getElementById('add-agent-btn');
    
    // Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // ==================================
    // --- API CLIENT ---
    // ==================================
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
                const responseData = await response.json();
                if (!response.ok) {
                    throw new Error(responseData.message || `HTTP error! Status: ${response.status}`);
                }
                return responseData;
            } catch (error) {
                console.error(`API Error on ${method} ${path}:`, error);
                if (error.message.includes('token has expired') || error.message.includes('Token has expired')) {
                    handleLogout(); // Simple logout on token expiry
                }
                throw error;
            } finally {
                showLoader(false);
            }
        },
        get(path) { return this.request('GET', path); },
        post(path, data) { return this.request('POST', path, data); },
        put(path, data) { return this.request('PUT', path, data); },
        delete(path) { return this.request('DELETE', path); }
    };

    // ==================================
    // --- RENDER FUNCTIONS ---
    // ==================================
    function renderAgencyProfile() {
        if (!state.agencyProfile) return;
        agencyNameHeader.textContent = state.agencyProfile.name;
        agencyProfileContent.innerHTML = `
            <p><strong>Email:</strong> ${state.agencyProfile.email}</p>
            <p><strong>Phone:</strong> ${state.agencyProfile.phone_number}</p>
            <p><strong>Type:</strong> ${state.agencyProfile.type}</p>
            <p><strong>Location:</strong> ${state.agencyProfile.location_description || 'Not set'}</p>
            <p><strong>Operating Hours:</strong> ${state.agencyProfile.operating_hours}</p>
        `;
    }

    function renderAgentList() {
        if (!state.agentList) return;
        const rows = state.agentList.map(agent => `
            <tr>
                <td>${agent.full_name}</td>
                <td>${agent.email}</td>
                <td>${agent.is_agency_admin ? 'Admin' : 'Agent'}</td>
                <td>${agent.is_active ? 'Active' : 'Inactive'}</td>
                <td class="action-buttons">
                    <button class="button-secondary" data-action="edit-agent" data-agent-id="${agent.id}">Edit</button>
                    <button class="button-danger" data-action="deactivate-agent" data-agent-id="${agent.id}">Deactivate</button>
                </td>
            </tr>
        `).join('');

        agentListContent.innerHTML = `
            <table class="agent-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${rows.length > 0 ? rows : '<tr><td colspan="5">No agents found.</td></tr>'}</tbody>
            </table>`;
    }

    // ==================================
    // --- MODAL & FORM LOGIC ---
    // ==================================
    function openModal(title, formHtml) {
        modalTitle.textContent = title;
        modalBody.innerHTML = formHtml;
        modalOverlay.classList.remove('hidden');
    }

    function closeModal() {
        modalOverlay.classList.add('hidden');
        modalTitle.textContent = '';
        modalBody.innerHTML = '';
    }

    function showEditProfileForm() {
        const p = state.agencyProfile;
        openModal("Edit Agency Profile", `
            <form id="edit-profile-form" class="modal-form">
                <div class="input-group"><label for="p_phone">Phone</label><input type="tel" id="p_phone" value="${p.phone_number}"></div>
                <div class="input-group"><label for="p_email">Email</label><input type="email" id="p_email" value="${p.email}"></div>
                <div class="input-group"><label for="p_loc">Location</label><input type="text" id="p_loc" value="${p.location_description}"></div>
                <div class="input-group"><label for="p_hours">Hours</label><input type="text" id="p_hours" value="${p.operating_hours}"></div>
                <button type="submit" class="button-primary">Save Changes</button>
            </form>`);
    }

    function showAddAgentForm() {
        openModal("Add New Agent", `
            <form id="add-agent-form" class="modal-form">
                <div class="input-group"><label for="a_name">Full Name</label><input type="text" id="a_name" required></div>
                <div class="input-group"><label for="a_email">Email</label><input type="email" id="a_email" required></div>
                <div class="input-group"><label for="a_pass">Initial Password</label><input type="password" id="a_pass" minlength="8" required></div>
                <div class="input-group"><label for="a_phone">Phone</label><input type="tel" id="a_phone" required></div>
                <div class="input-group"><label><input type="checkbox" id="a_is_admin"> Make Agency Admin</label></div>
                <button type="submit" class="button-primary">Create Agent</button>
            </form>`);
    }

    function showEditAgentForm(agentId) {
        const agent = state.agentList.find(a => a.id === agentId);
        if (!agent) return;
        openModal(`Edit Agent: ${agent.full_name}`, `
            <form id="edit-agent-form" class="modal-form" data-agent-id="${agent.id}">
                <div class="input-group"><label for="e_name">Full Name</label><input type="text" id="e_name" value="${agent.full_name}" required></div>
                <div class="input-group"><label><input type="checkbox" id="e_is_admin" ${agent.is_agency_admin ? 'checked' : ''}> Is Agency Admin</label></div>
                <div class="input-group"><label><input type="checkbox" id="e_is_active" ${agent.is_active ? 'checked' : ''}> Is Active</label></div>
                <button type="submit" class="button-primary">Update Agent</button>
            </form>`);
    }

    // ==================================
    // --- DASHBOARD DATA FETCHING ---
    // ==================================
    async function loadDashboardData() {
        try {
            const [profileData, agentsData] = await Promise.all([
                apiClient.get('/agency-admin/profile'),
                apiClient.get('/agency-admin/agents')
            ]);
            state.agencyProfile = profileData;
            state.agentList = agentsData;
            renderAgencyProfile();
            renderAgentList();
        } catch (error) {
            alert("Error loading dashboard data. You may be logged out.");
            handleLogout();
        }
    }

    // ==================================
    // --- EVENT HANDLERS ---
    // ==================================
    function setupEventListeners() {
        loginForm.addEventListener('submit', handleLogin);
        signupForm.addEventListener('submit', handleSignup);
        showSignupLink.addEventListener('click', (e) => { e.preventDefault(); showView('signup'); });
        showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showView('login'); });
        logoutButton.addEventListener('click', handleLogout);
        editProfileBtn.addEventListener('click', showEditProfileForm);
        addAgentBtn.addEventListener('click', showAddAgentForm);
        modalCloseBtn.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
        document.body.addEventListener('submit', handleFormSubmissions);
        document.body.addEventListener('click', handleActionClicks);
    }
    
    async function handleFormSubmissions(e) {
        if (e.target.id === 'edit-profile-form') {
            e.preventDefault();
            const payload = {
                agency_phone_number: document.getElementById('p_phone').value,
                agency_email: document.getElementById('p_email').value,
                agency_location_description: document.getElementById('p_loc').value,
                agency_operating_hours: document.getElementById('p_hours').value,
            };
            try {
                state.agencyProfile = await apiClient.put('/agency-admin/profile', payload);
                renderAgencyProfile();
                closeModal();
            } catch (error) { alert(`Error: ${error.message}`); }
        }
        
        if (e.target.id === 'add-agent-form') {
            e.preventDefault();
            const payload = {
                full_name: document.getElementById('a_name').value,
                email: document.getElementById('a_email').value,
                password: document.getElementById('a_pass').value,
                phone_number: document.getElementById('a_phone').value,
                is_agency_admin: document.getElementById('a_is_admin').checked,
            };
            try {
                const newAgent = await apiClient.post('/agency-admin/agents', payload);
                state.agentList.push(newAgent);
                renderAgentList();
                closeModal();
            } catch (error) { alert(`Error: ${error.message}`); }
        }

        if (e.target.id === 'edit-agent-form') {
            e.preventDefault();
            const agentId = e.target.dataset.agentId;
            const payload = {
                full_name: document.getElementById('e_name').value,
                is_agency_admin: document.getElementById('e_is_admin').checked,
                is_active: document.getElementById('e_is_active').checked,
            };
            try {
                const updatedAgent = await apiClient.put(`/agency-admin/agents/${agentId}`, payload);
                const index = state.agentList.findIndex(a => a.id == agentId);
                if (index !== -1) state.agentList[index] = updatedAgent;
                renderAgentList();
                closeModal();
            } catch (error) { alert(`Error: ${error.message}`); }
        }
    }

    async function handleActionClicks(e) {
        if (e.target.tagName !== 'BUTTON' || !e.target.dataset.action) return;
        
        const action = e.target.dataset.action;
        const agentId = e.target.dataset.agentId;

        if (action === 'edit-agent') {
            showEditAgentForm(parseInt(agentId));
        }

        if (action === 'deactivate-agent') {
            const agent = state.agentList.find(a => a.id == agentId);
            if (confirm(`Are you sure you want to deactivate agent: ${agent.full_name}?`)) {
                try {
                    await apiClient.delete(`/agency-admin/agents/${agentId}`);
                    const index = state.agentList.findIndex(a => a.id == agentId);
                    if (index !== -1) state.agentList[index].is_active = false;
                    renderAgentList();
                } catch (error) { alert(`Error: ${error.message}`); }
            }
        }
    }

    // ==================================
    // --- AUTH & INITIALIZATION ---
    // ==================================
    async function handleLogin(event) {
        event.preventDefault();
        loginButton.disabled = true;
        loginButton.textContent = 'Logging in...';
        loginErrorMessage.style.display = 'none';

        try {
            const data = await apiClient.post('/agency-auth/login', {
                email: document.getElementById('login-email').value,
                password: document.getElementById('login-password').value,
            });
            state.tokens.access = data.access_token;
            state.tokens.refresh = data.refresh_token;
            state.agent = { id: data.agent_id, agency_id: data.agency_id, is_admin: data.is_agency_admin, full_name: data.full_name };
            
            localStorage.setItem('agent_access_token', state.tokens.access);
            localStorage.setItem('agent_refresh_token', state.tokens.refresh);
            localStorage.setItem('agent_info', JSON.stringify(state.agent));
            
            initApp();
        } catch (error) {
            loginErrorMessage.textContent = error.message;
            loginErrorMessage.style.display = 'block';
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Login';
        }
    }
    
    async function handleSignup(event) {
        event.preventDefault();
        signupButton.disabled = true;
        signupButton.textContent = 'Registering...';
        signupErrorMessage.style.display = 'none';

        try {
            const payload = {
                agency_name: document.getElementById('agency_name').value,
                agency_type: document.getElementById('agency_type').value,
                agency_phone_number: document.getElementById('agency_phone_number').value,
                agency_email: document.getElementById('agency_email').value,
                agency_city: document.getElementById('agency_city').value,
                agency_country: document.getElementById('agency_country').value,
                agency_operating_hours: document.getElementById('agency_operating_hours').value,
                admin_agent_details: {
                    agent_full_name: document.getElementById('agent_full_name').value,
                    agent_email: document.getElementById('agent_email').value,
                    agent_password: document.getElementById('agent_password').value,
                    agent_phone_number: document.getElementById('agent_phone_number').value,
                }
            };
            
            await apiClient.post('/agency-onboarding/signup', payload);
            alert("Registration Successful!\n\nYour agency is now pending approval. You will be notified via email once it has been reviewed.");
            showView('login');

        } catch (error) {
            signupErrorMessage.textContent = error.message;
            signupErrorMessage.style.display = 'block';
        } finally {
            signupButton.disabled = false;
            signupButton.textContent = 'Register Agency';
        }
    }

    function handleLogout() {
        localStorage.clear();
        state.tokens.access = null;
        state.tokens.refresh = null;
        state.agent = null;
        showView('login');
    }

    function showView(viewName) {
        loginContainer.classList.add('hidden');
        signupContainer.classList.add('hidden');
        dashboardContainer.classList.add('hidden');

        if (viewName === 'login') loginContainer.classList.remove('hidden');
        else if (viewName === 'signup') signupContainer.classList.remove('hidden');
        else if (viewName === 'dashboard') {
            dashboardContainer.classList.remove('hidden');
            loadDashboardData();
        }
    }

    function showLoader(isLoading) {
        if (isLoading) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }

    function initApp() {
        // Re-read from localStorage in case it was updated in another tab.
        state.tokens.access = localStorage.getItem('agent_access_token');
        state.agent = JSON.parse(localStorage.getItem('agent_info'));

        if (state.tokens.access && state.agent) {
            showView('dashboard');
        } else {
            showView('login');
        }
        setupEventListeners();
    }

    initApp();
});