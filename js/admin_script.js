let emailEditor = null;
document.addEventListener('DOMContentLoaded', () => {

    const DEFAULT_API_BASE_URL = 'https://alerte.pythonanywhere.com';

    function getApiBaseUrl() {
        return localStorage.getItem('alerte_api_base_url') || DEFAULT_API_BASE_URL;
    }

    function setApiBaseUrl(newUrl) {
        if (!newUrl || newUrl.trim() === '' || newUrl.trim() === DEFAULT_API_BASE_URL) {
            localStorage.removeItem('alerte_api_base_url');
        } else {
            localStorage.setItem('alerte_api_base_url', newUrl.trim().replace(/\/+$/, ''));
        }
        updateServerBadge();
    }

    function updateServerBadge() {
        const badge = document.getElementById('active-server-badge');
        const badgeName = document.getElementById('active-server-name');
        if (!badge || !badgeName) return;

        const currentUrl = getApiBaseUrl();
        if (currentUrl === DEFAULT_API_BASE_URL) {
            badgeName.textContent = 'Production';
            badge.className = 'server-badge';
            badge.title = `Connected to: ${currentUrl}`;
        } else {
            badgeName.textContent = currentUrl.includes('127.0.0.1') || currentUrl.includes('localhost') ? 'Local Dev' : 'Custom';
            badge.className = 'server-badge dev';
            badge.title = `Connected to: ${currentUrl}`;
        }
    }

    const state = {
        tokens: {
            access: localStorage.getItem('super_admin_access_token'),
            refresh: localStorage.getItem('super_admin_refresh_token'),
        },
        user: JSON.parse(localStorage.getItem('super_admin_info') || 'null'),
        currentView: 'dashboard',
        usersList: [],
        attendanceFilters: { days: 30, state: '', lga: '' }
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

    async function attemptTokenRefresh() {
        if (!state.tokens.refresh) return false;
        try {
            const baseUrl = getApiBaseUrl();
            const res = await fetch(`${baseUrl}/super-admin-auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.tokens.refresh}`
                }
            });
            if (!res.ok) return false;
            const data = await res.json();
            if (data && data.access_token) {
                state.tokens.access = data.access_token;
                localStorage.setItem('super_admin_access_token', data.access_token);
                return true;
            }
        } catch (e) {
            console.warn('SuperAdmin token refresh failed:', e);
        }
        return false;
    }

    const apiClient = {
        async request(method, path, data = null, isRetry = false) {
            showLoader(true);
            const baseUrl = getApiBaseUrl();
            const url = `${baseUrl}${path}`;
            const headers = {};
            if (data !== null || method === 'POST' || method === 'PUT' || method === 'PATCH') {
                headers['Content-Type'] = 'application/json';
            }
            if (state.tokens.access) {
                headers['Authorization'] = `Bearer ${state.tokens.access}`;
            }

            const config = { method, headers, body: data ? JSON.stringify(data) : null };

            try {
                const response = await fetch(url, config);
                if (response.status === 204) return null;

                let responseData = null;
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    try {
                        responseData = await response.json();
                    } catch (e) {
                        responseData = null;
                    }
                }

                if (!responseData) {
                    const text = await response.text().catch(() => '');
                    responseData = { message: text ? (text.length > 250 ? text.slice(0, 250) + '...' : text) : `HTTP ${response.status}` };
                }

                // If unauthorized and we have a refresh token, try refreshing
                if (response.status === 401 && !isRetry && state.tokens.refresh) {
                    const refreshed = await attemptTokenRefresh();
                    if (refreshed) {
                        return this.request(method, path, data, true);
                    }
                }

                if (!response.ok) {
                    const errMsg = responseData.message || responseData.error || responseData.msg || responseData.description || `HTTP error! Status: ${response.status}`;
                    const err = new Error(errMsg);
                    err.status = response.status;
                    err.path = path;
                    err.data = responseData;
                    throw err;
                }

                return responseData;
            } catch (error) {
                console.error(`API Error on ${method} ${path}:`, error);
                const msg = String(error.message || '').toLowerCase();
                if ((error.status === 401 || (msg.includes('token') && msg.includes('expired'))) && !isRetry) {
                    const refreshed = await attemptTokenRefresh();
                    if (refreshed) {
                        return this.request(method, path, data, true);
                    } else {
                        handleLogout();
                    }
                }
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

    function renderViewError(viewTitle, error, retryFn) {
        const is500 = error.status === 500 || String(error.message || '').includes('500');
        const explanation = is500 
            ? 'The backend server experienced an Internal Server Error (500) while querying the database. The server administrator may need to run database migrations or inspect recent model changes.'
            : (error.message || 'An unexpected network error occurred.');

        mainContent.innerHTML = `
            <div class="page-header"><h2>${viewTitle}</h2></div>
            <div class="error-card">
                <i class="fa-solid fa-triangle-exclamation error-icon"></i>
                <h3>Unable to Fetch Data</h3>
                <p>${explanation}</p>
                <div style="display:flex; justify-content:center; gap:12px; margin-bottom:15px; flex-wrap:wrap;">
                    <button class="btn-retry" id="btn-view-retry">
                        <i class="fa-solid fa-rotate-right"></i> Retry Request
                    </button>
                    <button class="btn-retry" id="btn-view-diagnostics" style="background:#546e7a;">
                        <i class="fa-solid fa-wrench"></i> Server Settings & Diagnostics
                    </button>
                </div>
                <details style="text-align:left; margin-top:20px; border-top:1px solid #eee; padding-top:10px;">
                    <summary style="cursor:pointer; color:#777; font-size:0.85rem;">View Technical Diagnostics</summary>
                    <div class="diagnostics-box">
URL: ${getApiBaseUrl()}${error.path || ''}
Status: ${error.status || 'N/A'}
Error: ${error.message}
Response: ${JSON.stringify(error.data || null, null, 2)}
                    </div>
                </details>
            </div>`;

        const retryBtn = document.getElementById('btn-view-retry');
        if (retryBtn && typeof retryFn === 'function') {
            retryBtn.addEventListener('click', retryFn);
        }

        const diagBtn = document.getElementById('btn-view-diagnostics');
        if (diagBtn) {
            diagBtn.addEventListener('click', openServerSettingsModal);
        }
    }

    function renderDashboard(stats, errorWarning = null) {
        let warningBanner = '';
        if (errorWarning) {
            warningBanner = `
                <div class="alert-box alert-warning">
                    <div>
                        <strong><i class="fa-solid fa-triangle-exclamation"></i> Live Stats Notice:</strong>
                        <span>${errorWarning.message || 'Server returned 500 for stats count. Showing available and calculated data.'}</span>
                    </div>
                    <button class="btn-retry" id="btn-retry-dashboard">
                        <i class="fa-solid fa-rotate-right"></i> Retry Live Stats
                    </button>
                </div>`;
        }

        const totalUsersDisplay = (stats.total_users !== undefined && stats.total_users !== null) 
            ? stats.total_users 
            : '<span style="color:#c62828; font-size:1rem;" title="Endpoint /admin/dashboard/stats returned HTTP 500">Unavailable (500)</span>';

        const activeAlertsDisplay = (stats.active_alerts !== undefined && stats.active_alerts !== null) 
            ? stats.active_alerts 
            : '<span style="color:#c62828; font-size:1rem;" title="Endpoint /admin/dashboard/stats returned HTTP 500">Unavailable (500)</span>';

        mainContent.innerHTML = `
            <div class="page-header">
                <h2>Dashboard Overview</h2>
                <button class="btn-retry" id="btn-refresh-dashboard" style="background:#546e7a; padding:6px 12px; font-size:0.8rem;">
                    <i class="fa-solid fa-rotate-right"></i> Refresh
                </button>
            </div>
            ${warningBanner}
            <!-- Quick Link to Event Attendance -->
            <div style="background: linear-gradient(135deg, #1e3a8a, #0d47a1); color: white; padding: 18px 24px; border-radius: 10px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(13, 71, 161, 0.15); flex-wrap: wrap; gap: 15px;">
                <div>
                    <h3 style="margin: 0 0 5px 0; font-size: 1.15rem; color: #fff;"><i class="fa-solid fa-chart-line"></i> Event Attendance & Response Metrics</h3>
                    <p style="margin: 0; font-size: 0.85rem; color: #bbdefb;">Analyze how distress alerts, safety incidents, and abuse reports are attended to across states and LGAs.</p>
                </div>
                <button class="btn-view" id="btn-goto-attendance" style="background: white; color: #0d47a1; font-weight: 600; padding: 10px 18px; border-radius: 6px; border: none; cursor: pointer; white-space: nowrap;">
                    View Attendance Metrics <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>

            <div class="stats-grid">
                <div class="stat-card"><h4>Total Users</h4><div class="value">${totalUsersDisplay}</div></div>
                <div class="stat-card"><h4>Total Agencies</h4><div class="value">${stats.total_agencies || 0}</div></div>
                <div class="stat-card"><h4>Pending Approval</h4><div class="value">${stats.pending_agencies || 0}</div></div>
                <div class="stat-card"><h4>Active Agencies</h4><div class="value">${stats.active_agencies || 0}</div></div>
                <div class="stat-card"><h4>Total Agents</h4><div class="value">${stats.total_agents || 0}</div></div>
                <div class="stat-card"><h4>Active Alerts</h4><div class="value">${activeAlertsDisplay}</div></div>
            </div>`;

        const retryBtn = document.getElementById('btn-retry-dashboard');
        if (retryBtn) retryBtn.addEventListener('click', () => loadView('dashboard'));

        const refreshBtn = document.getElementById('btn-refresh-dashboard');
        if (refreshBtn) refreshBtn.addEventListener('click', () => loadView('dashboard'));

        const gotoAttendanceBtn = document.getElementById('btn-goto-attendance');
        if (gotoAttendanceBtn) gotoAttendanceBtn.addEventListener('click', () => loadView('event-attendance'));
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getRateMeterColor(pct) {
        if (pct >= 80) return 'green';
        if (pct >= 50) return 'amber';
        return 'red';
    }

    function renderEventAttendance(data, filters, errorWarning = null, cacheTimestamp = null) {
        const summary = data?.overall_attendance_summary || {};
        const distress = data?.distress_alerts || {};
        const incidents = data?.safety_incidents || {};
        const abuse = data?.abuse_reports || {};
        const agencies = Array.isArray(data?.agency_performance) ? data.agency_performance : [];

        let warningBanner = '';
        if (errorWarning) {
            const timeStr = cacheTimestamp ? new Date(cacheTimestamp).toLocaleTimeString() : 'earlier session';
            warningBanner = `
                <div class="alert-box alert-warning">
                    <div>
                        <strong><i class="fa-solid fa-clock-rotate-left"></i> Cached Data:</strong>
                        <span>Live server returned error (${errorWarning.status || 500}). Showing attendance metrics cached from ${timeStr}.</span>
                    </div>
                    <button class="btn-retry" id="btn-retry-attendance">
                        <i class="fa-solid fa-rotate-right"></i> Retry Sync
                    </button>
                </div>`;
        }

        const overallRate = summary.overall_attendance_rate_pct !== undefined ? summary.overall_attendance_rate_pct : 0;
        const alertRate = distress.attendance_rate_pct !== undefined ? distress.attendance_rate_pct : 0;
        const incidentRate = incidents.verification_rate_pct !== undefined ? incidents.verification_rate_pct : 0;
        const abuseRate = abuse.attendance_rate_pct !== undefined ? abuse.attendance_rate_pct : 0;

        mainContent.innerHTML = `
            <div class="page-header">
                <div>
                    <h2><i class="fa-solid fa-chart-line" style="color:#c62828;"></i> Event Attendance Metrics</h2>
                    <p style="color:#666; font-size:0.85rem; margin-top:4px;">
                        Comprehensive tracking on how distress alerts, safety incidents, and abuse reports are attended to.
                    </p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-retry" id="btn-refresh-attendance" style="background:#546e7a; padding:6px 14px; font-size:0.85rem;">
                        <i class="fa-solid fa-rotate-right"></i> Refresh
                    </button>
                </div>
            </div>

            ${warningBanner}

            <!-- Filters Bar -->
            <div class="metrics-filter-card">
                <form id="attendance-filter-form" class="filter-form-row">
                    <div class="filter-item">
                        <label><i class="fa-solid fa-calendar-days"></i> Time Window</label>
                        <select id="filter-days">
                            <option value="7" ${filters.days == 7 ? 'selected' : ''}>Last 7 Days</option>
                            <option value="14" ${filters.days == 14 ? 'selected' : ''}>Last 14 Days</option>
                            <option value="30" ${filters.days == 30 || !filters.days ? 'selected' : ''}>Last 30 Days (Default)</option>
                            <option value="60" ${filters.days == 60 ? 'selected' : ''}>Last 60 Days</option>
                            <option value="90" ${filters.days == 90 ? 'selected' : ''}>Last 90 Days</option>
                            <option value="180" ${filters.days == 180 ? 'selected' : ''}>Last 180 Days</option>
                            <option value="365" ${filters.days == 365 ? 'selected' : ''}>Last 1 Year</option>
                            <option value="0" ${filters.days === 0 || filters.days === '0' ? 'selected' : ''}>All Time (0)</option>
                        </select>
                    </div>
                    <div class="filter-item">
                        <label><i class="fa-solid fa-map-location-dot"></i> State Filter</label>
                        <input type="text" id="filter-state" value="${escapeHtml(filters.state || '')}" placeholder="e.g. Lagos, Abuja, Rivers">
                    </div>
                    <div class="filter-item">
                        <label><i class="fa-solid fa-city"></i> LGA Filter</label>
                        <input type="text" id="filter-lga" value="${escapeHtml(filters.lga || '')}" placeholder="e.g. Ikeja, Alimosho">
                    </div>
                    <div class="filter-actions">
                        <button type="submit" class="btn-retry" style="background:#c62828;">
                            <i class="fa-solid fa-filter"></i> Apply Filters
                        </button>
                        <button type="button" id="btn-reset-filters" class="btn-retry" style="background:#78909c;">
                            <i class="fa-solid fa-arrow-rotate-left"></i> Reset
                        </button>
                    </div>
                </form>
            </div>

            <!-- Top Hero KPI Summary -->
            <div class="metrics-hero-grid">
                <div class="hero-kpi-card accent-green">
                    <div class="kpi-label">
                        <span>Overall Attendance</span>
                        <i class="fa-solid fa-shield-halved" style="color:#2e7d32;"></i>
                    </div>
                    <div class="kpi-value">${overallRate}%</div>
                    <div class="rate-meter" style="margin-top:5px; padding-top:0; border:none;">
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(overallRate)}" style="width:${Math.min(overallRate, 100)}%;"></div>
                        </div>
                    </div>
                    <div class="kpi-sub" style="margin-top:8px;">
                        <i class="fa-solid fa-circle-check" style="color:#2e7d32;"></i>
                        <span>${summary.total_events_attended || 0} / ${summary.total_events_logged || 0} total events attended</span>
                    </div>
                </div>

                <div class="hero-kpi-card accent-blue">
                    <div class="kpi-label">
                        <span>Distress SOS Attended</span>
                        <i class="fa-solid fa-bell" style="color:#1976d2;"></i>
                    </div>
                    <div class="kpi-value">${alertRate}%</div>
                    <div class="rate-meter" style="margin-top:5px; padding-top:0; border:none;">
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(alertRate)}" style="width:${Math.min(alertRate, 100)}%;"></div>
                        </div>
                    </div>
                    <div class="kpi-sub" style="margin-top:8px;">
                        <i class="fa-solid fa-stopwatch" style="color:#1976d2;"></i>
                        <span>Avg response: <strong>${distress.avg_response_minutes || 0} min</strong></span>
                    </div>
                </div>

                <div class="hero-kpi-card accent-purple">
                    <div class="kpi-label">
                        <span>Safety Incidents Verified</span>
                        <i class="fa-solid fa-triangle-exclamation" style="color:#7b1fa2;"></i>
                    </div>
                    <div class="kpi-value">${incidentRate}%</div>
                    <div class="rate-meter" style="margin-top:5px; padding-top:0; border:none;">
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(incidentRate)}" style="width:${Math.min(incidentRate, 100)}%;"></div>
                        </div>
                    </div>
                    <div class="kpi-sub" style="margin-top:8px;">
                        <i class="fa-solid fa-check-double" style="color:#7b1fa2;"></i>
                        <span>${incidents.verified_count || 0} verified of ${incidents.total_reported || 0} reported</span>
                    </div>
                </div>

                <div class="hero-kpi-card">
                    <div class="kpi-label">
                        <span>Abuse Reports Actioned</span>
                        <i class="fa-solid fa-user-slash" style="color:#c62828;"></i>
                    </div>
                    <div class="kpi-value">${abuseRate}%</div>
                    <div class="rate-meter" style="margin-top:5px; padding-top:0; border:none;">
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(abuseRate)}" style="width:${Math.min(abuseRate, 100)}%;"></div>
                        </div>
                    </div>
                    <div class="kpi-sub" style="margin-top:8px;">
                        <i class="fa-solid fa-list-check" style="color:#c62828;"></i>
                        <span>${abuse.resolved_count || 0} resolved of ${abuse.total_reports || 0} reported</span>
                    </div>
                </div>
            </div>

            <!-- Deep Dive Breakdown Sections -->
            <div class="attendance-sections-grid">
                <!-- 1. Distress Alerts Attendance -->
                <div class="category-card">
                    <div class="category-card-header">
                        <h3><i class="fa-solid fa-person-burst" style="color:#c62828;"></i> Distress Alerts</h3>
                        <span class="badge bg-danger" style="font-size:0.8rem;">${distress.total_raised || 0} Total</span>
                    </div>
                    <div class="category-metrics-list">
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-check text-success"></i> Attended by Agency</span>
                            <span class="metric-val text-success">${distress.attended_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-flag-checkered" style="color:#2e7d32;"></i> Resolved by Agent</span>
                            <span class="metric-val">${distress.resolved_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-hourglass-start" style="color:#ef6c00;"></i> Pending Assignment</span>
                            <span class="metric-val">${distress.pending_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-xmark" style="color:#c62828;"></i> Unattended / Dropped</span>
                            <span class="metric-val text-danger">${distress.unattended_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-ban" style="color:#777;"></i> Cancelled by User</span>
                            <span class="metric-val" style="color:#777;">${distress.cancelled_count || 0}</span>
                        </div>
                        <div class="metric-row" style="background:#eef2f6; padding:8px 10px; border-radius:6px; margin-top:4px;">
                            <span class="metric-title"><strong>Avg Dispatch Time</strong></span>
                            <span class="metric-val" style="color:#1976d2;"><strong>${distress.avg_response_minutes || 0} min</strong></span>
                        </div>
                    </div>
                    <div class="rate-meter">
                        <div class="rate-meter-label">
                            <span>Attendance Rate</span>
                            <span>${distress.attendance_rate_pct || 0}%</span>
                        </div>
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(distress.attendance_rate_pct || 0)}" style="width:${Math.min(distress.attendance_rate_pct || 0, 100)}%;"></div>
                        </div>
                    </div>
                    <div class="rate-meter" style="margin-top:8px; border:none; padding-top:0;">
                        <div class="rate-meter-label">
                            <span>Resolution Rate</span>
                            <span>${distress.resolution_rate_pct || 0}%</span>
                        </div>
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(distress.resolution_rate_pct || 0)}" style="width:${Math.min(distress.resolution_rate_pct || 0, 100)}%;"></div>
                        </div>
                    </div>
                </div>

                <!-- 2. Safety Incidents Verification -->
                <div class="category-card">
                    <div class="category-card-header">
                        <h3><i class="fa-solid fa-triangle-exclamation" style="color:#f57f17;"></i> Safety Incidents</h3>
                        <span class="badge bg-warning" style="font-size:0.8rem;">${incidents.total_reported || 0} Total</span>
                    </div>
                    <div class="category-metrics-list">
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-circle-check text-success"></i> Verified by Agency</span>
                            <span class="metric-val text-success">${incidents.verified_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-circle-question" style="color:#f57f17;"></i> Unverified / In Review</span>
                            <span class="metric-val">${incidents.unverified_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-circle-xmark" style="color:#c62828;"></i> Rejected / False Report</span>
                            <span class="metric-val text-danger">${incidents.rejected_count || 0}</span>
                        </div>
                        <div class="metric-row" style="background:#eef2f6; padding:8px 10px; border-radius:6px; margin-top:28px;">
                            <span class="metric-title"><strong>Total Reported Incidents</strong></span>
                            <span class="metric-val"><strong>${incidents.total_reported || 0}</strong></span>
                        </div>
                    </div>
                    <div class="rate-meter">
                        <div class="rate-meter-label">
                            <span>Verification Rate</span>
                            <span>${incidents.verification_rate_pct || 0}%</span>
                        </div>
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(incidents.verification_rate_pct || 0)}" style="width:${Math.min(incidents.verification_rate_pct || 0, 100)}%;"></div>
                        </div>
                    </div>
                </div>

                <!-- 3. Abuse Reports Attendance -->
                <div class="category-card">
                    <div class="category-card-header">
                        <h3><i class="fa-solid fa-user-shield" style="color:#7b1fa2;"></i> Abuse Reports</h3>
                        <span class="badge bg-gray" style="font-size:0.8rem;">${abuse.total_reports || 0} Total</span>
                    </div>
                    <div class="category-metrics-list">
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-circle-check text-success"></i> Resolved / Reviewed</span>
                            <span class="metric-val text-success">${abuse.resolved_count || 0}</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-title"><i class="fa-solid fa-clock" style="color:#f57f17;"></i> Pending Investigation</span>
                            <span class="metric-val text-warning">${abuse.pending_count || 0}</span>
                        </div>
                        <div class="metric-row" style="background:#eef2f6; padding:8px 10px; border-radius:6px; margin-top:54px;">
                            <span class="metric-title"><strong>Total Abuse Reports</strong></span>
                            <span class="metric-val"><strong>${abuse.total_reports || 0}</strong></span>
                        </div>
                    </div>
                    <div class="rate-meter">
                        <div class="rate-meter-label">
                            <span>Action / Resolution Rate</span>
                            <span>${abuse.attendance_rate_pct || 0}%</span>
                        </div>
                        <div class="meter-track">
                            <div class="meter-fill ${getRateMeterColor(abuse.attendance_rate_pct || 0)}" style="width:${Math.min(abuse.attendance_rate_pct || 0, 100)}%;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Agency Attendance Performance Leaderboard -->
            <div style="margin-top:10px;">
                <div class="page-header" style="margin-bottom:15px;">
                    <h3><i class="fa-solid fa-building-shield" style="color:#1565c0;"></i> Agency Attendance Performance (${agencies.length})</h3>
                    <div class="search-bar" style="margin:0; max-width:300px;">
                        <input type="text" placeholder="Filter agencies..." id="agency-perf-search" style="padding:6px 10px; font-size:0.85rem;">
                    </div>
                </div>
                <div class="table-container">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>#ID</th>
                                <th>Agency</th>
                                <th>Type</th>
                                <th>Assigned Alerts</th>
                                <th>Resolved</th>
                                <th>Resolution Rate</th>
                                <th>Avg Response</th>
                            </tr>
                        </thead>
                        <tbody id="agency-perf-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        renderAgencyPerfRows(agencies);

        // Search listener for agencies
        const searchInput = document.getElementById('agency-perf-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = agencies.filter(a => 
                    (a.agency_name || '').toLowerCase().includes(term) ||
                    (a.agency_type || '').toLowerCase().includes(term)
                );
                renderAgencyPerfRows(filtered);
            });
        }

        // Filter form submit listener
        const filterForm = document.getElementById('attendance-filter-form');
        if (filterForm) {
            filterForm.addEventListener('submit', (e) => {
                e.preventDefault();
                state.attendanceFilters = {
                    days: document.getElementById('filter-days').value,
                    state: document.getElementById('filter-state').value,
                    lga: document.getElementById('filter-lga').value
                };
                loadView('event-attendance');
            });
        }

        // Reset filter listener
        const resetBtn = document.getElementById('btn-reset-filters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                state.attendanceFilters = { days: 30, state: '', lga: '' };
                loadView('event-attendance');
            });
        }

        // Retry & refresh listeners
        document.getElementById('btn-retry-attendance')?.addEventListener('click', () => loadView('event-attendance'));
        document.getElementById('btn-refresh-attendance')?.addEventListener('click', () => loadView('event-attendance'));
    }

    function renderAgencyPerfRows(agencies) {
        const tbody = document.getElementById('agency-perf-tbody');
        if (!tbody) return;

        if (!agencies || agencies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:25px; color:#777;">No agency attendance records found for this period.</td></tr>';
            return;
        }

        tbody.innerHTML = agencies.map(ag => {
            const resRate = ag.resolution_rate_pct !== undefined ? ag.resolution_rate_pct : 0;
            const rateBadge = resRate >= 80 
                ? `<span class="badge bg-success">${resRate}%</span>`
                : (resRate >= 50 ? `<span class="badge bg-warning">${resRate}%</span>` : `<span class="badge bg-danger">${resRate}%</span>`);

            return `
            <tr>
                <td>#${ag.agency_id}</td>
                <td><strong>${escapeHtml(ag.agency_name)}</strong></td>
                <td><span class="badge bg-gray">${escapeHtml(ag.agency_type || 'Unknown')}</span></td>
                <td><strong>${ag.total_assigned || 0}</strong></td>
                <td><span style="color:#2e7d32; font-weight:600;">${ag.resolved_count || 0}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${rateBadge}
                        <div class="meter-track" style="width:60px; height:6px;">
                            <div class="meter-fill ${getRateMeterColor(resRate)}" style="width:${Math.min(resRate, 100)}%;"></div>
                        </div>
                    </div>
                </td>
                <td><i class="fa-solid fa-stopwatch" style="color:#777; font-size:0.75rem;"></i> ${ag.avg_response_minutes || 0} min</td>
            </tr>`;
        }).join('');
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

    function renderUsers(users, errorWarning = null, cacheTimestamp = null) {
        const userList = Array.isArray(users) ? users : (users?.users || users?.data || []);
        state.usersList = userList;

        let warningBanner = '';
        if (errorWarning) {
            const timeStr = cacheTimestamp ? new Date(cacheTimestamp).toLocaleTimeString() : 'earlier session';
            warningBanner = `
                <div class="alert-box alert-warning">
                    <div>
                        <strong><i class="fa-solid fa-clock-rotate-left"></i> Cached Data:</strong>
                        <span>Live server returned error (${errorWarning.status || 500}). Displaying ${userList.length} user records cached from ${timeStr}.</span>
                    </div>
                    <button class="btn-retry" id="btn-retry-users">
                        <i class="fa-solid fa-rotate-right"></i> Retry Live Sync
                    </button>
                </div>`;
        }

        mainContent.innerHTML = `
            <div class="page-header">
                <h2>User Database (${userList.length})</h2>
                <button class="btn-retry" id="btn-refresh-users" style="background:#546e7a; padding:6px 12px; font-size:0.8rem;">
                    <i class="fa-solid fa-rotate-right"></i> Refresh
                </button>
            </div>
            ${warningBanner}
            <div class="search-bar">
                <input type="text" placeholder="Filter by name or email..." id="user-search-input">
            </div>
            <div class="table-container">
                <table class="admin-table">
                    <thead><tr><th>User</th><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead>
                    <tbody id="users-table-body"></tbody>
                </table>
            </div>`;

        renderUserRows(userList);

        const retryBtn = document.getElementById('btn-retry-users');
        if (retryBtn) retryBtn.addEventListener('click', () => loadView('users'));

        const refreshBtn = document.getElementById('btn-refresh-users');
        if (refreshBtn) refreshBtn.addEventListener('click', () => loadView('users'));

        const searchInput = document.getElementById('user-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = state.usersList.filter(u =>
                    ((u.first_name || '') + ' ' + (u.last_name || '')).toLowerCase().includes(term) ||
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

            const joinedDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A';

            return `
            <tr>
                <td>
                    <div class="user-cell" style="display:flex; align-items:center; gap:10px;">
                        ${avatarHtml}
                        <div><strong>${fullName}</strong><br><small style="color:#777">ID: ${user.id}</small></div>
                    </div>
                </td>
                <td>${user.email || 'N/A'}</td>
                <td>${user.phone_number || 'N/A'}</td>
                <td>${verifiedBadge}</td>
                <td>${joinedDate}</td>
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
                try {
                    const stats = await apiClient.get('/admin/dashboard/stats');
                    localStorage.setItem('alerte_dashboard_stats_cache', JSON.stringify({ stats, time: Date.now() }));
                    renderDashboard(stats);
                } catch (statsError) {
                    console.warn('Dashboard stats endpoint failed, trying agency metrics fallback...', statsError);
                    let fallbackStats = null;
                    try {
                        const agencies = await apiClient.get('/admin/agencies');
                        if (Array.isArray(agencies)) {
                            const cached = JSON.parse(localStorage.getItem('alerte_dashboard_stats_cache') || '{}');
                            fallbackStats = {
                                total_users: cached?.stats?.total_users,
                                total_agencies: agencies.length,
                                pending_agencies: agencies.filter(a => (a.status || '').toLowerCase().includes('pending')).length,
                                active_agencies: agencies.filter(a => (a.status || '').toLowerCase() === 'active').length,
                                total_agents: cached?.stats?.total_agents,
                                active_alerts: cached?.stats?.active_alerts
                            };
                        }
                    } catch (agencyError) {
                        console.warn('Agency metrics fallback also failed:', agencyError);
                    }

                    if (fallbackStats) {
                        renderDashboard(fallbackStats, {
                            message: `Backend endpoint /admin/dashboard/stats returned ${statsError.status || 500} (Server Error). Agency metrics were calculated directly from the active Agency registry.`,
                            error: statsError
                        });
                    } else {
                        const cached = JSON.parse(localStorage.getItem('alerte_dashboard_stats_cache') || '{}');
                        if (cached && cached.stats) {
                            renderDashboard(cached.stats, {
                                message: `Server returned error (${statsError.status || 500}). Displaying cached dashboard statistics from ${new Date(cached.time).toLocaleTimeString()}.`,
                                error: statsError
                            });
                        } else {
                            renderViewError('Dashboard Overview', statsError, () => loadView('dashboard'));
                        }
                    }
                }
            } else if (viewName === 'event-attendance') {
                const filters = state.attendanceFilters || { days: 30, state: '', lga: '' };
                const params = new URLSearchParams();
                if (filters.days !== undefined && filters.days !== '') params.append('days', filters.days);
                if (filters.state) params.append('state', filters.state.trim());
                if (filters.lga) params.append('lga', filters.lga.trim());
                const qs = params.toString() ? '?' + params.toString() : '';

                try {
                    const data = await apiClient.get('/admin/metrics/event-attendance' + qs);
                    localStorage.setItem('alerte_attendance_cache', JSON.stringify({ data, time: Date.now(), filters }));
                    renderEventAttendance(data, filters);
                } catch (attendError) {
                    console.warn('Event attendance metrics endpoint failed:', attendError);
                    const cached = JSON.parse(localStorage.getItem('alerte_attendance_cache') || '{}');
                    if (cached && cached.data) {
                        renderEventAttendance(cached.data, cached.filters || filters, attendError, cached.time);
                    } else {
                        renderViewError('Event Attendance Metrics', attendError, () => loadView('event-attendance'));
                    }
                }
            } else if (viewName === 'pending-agencies') {
                const agencies = await apiClient.get('/admin/agencies?status=pending_approval');
                renderAgencies(agencies, viewName);
            } else if (viewName === 'all-agencies') {
                const agencies = await apiClient.get('/admin/agencies');
                renderAgencies(agencies, viewName);
            } else if (viewName === 'users') {
                try {
                    const users = await apiClient.get('/users/get_all');
                    const userList = Array.isArray(users) ? users : (users?.users || users?.data || []);
                    localStorage.setItem('alerte_users_cache', JSON.stringify({ users: userList, time: Date.now() }));
                    renderUsers(userList);
                } catch (userError) {
                    console.warn('Users database endpoint failed:', userError);
                    const cached = JSON.parse(localStorage.getItem('alerte_users_cache') || '{}');
                    if (cached && cached.users && cached.users.length > 0) {
                        renderUsers(cached.users, userError, cached.time);
                    } else {
                        renderViewError('User Database', userError, () => loadView('users'));
                    }
                }
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
            }
        } catch (error) {
            renderViewError(viewName, error, () => loadView(viewName));
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

    function openServerSettingsModal() {
        const currentUrl = getApiBaseUrl();
        const content = `
            <div style="font-size:0.9rem;">
                <p style="color:#666; margin-bottom:15px;">Configure the backend API server used by the Admin Console. Default is PythonAnywhere production.</p>
                
                <div class="input-group">
                    <label>Active API Base URL</label>
                    <input type="text" id="custom-api-url" value="${currentUrl}" placeholder="e.g. https://alerte.pythonanywhere.com or http://127.0.0.1:5000">
                </div>

                <div style="display:flex; gap:8px; margin-bottom:12px;">
                    <button type="button" id="btn-quick-local" class="btn-retry" style="flex:1; background:#1565c0; font-size:0.78rem; justify-content:center; padding:7px 10px;">
                        <i class="fa-solid fa-laptop-code"></i> Localhost (5000)
                    </button>
                    <button type="button" id="btn-quick-prod" class="btn-retry" style="flex:1; background:#2e7d32; font-size:0.78rem; justify-content:center; padding:7px 10px;">
                        <i class="fa-solid fa-cloud"></i> Production API
                    </button>
                </div>

                <div style="display:flex; gap:10px; margin-bottom:20px;">
                    <button id="btn-save-server-url" class="btn-retry" style="flex:1; justify-content:center;">
                        <i class="fa-solid fa-floppy-disk"></i> Save & Apply
                    </button>
                    <button id="btn-reset-server-url" class="btn-retry" style="background:#78909c; justify-content:center;">
                        Reset Default
                    </button>
                </div>

                <div style="border-top:1px solid #eee; padding-top:15px; margin-top:10px;">
                    <h4 style="margin-bottom:10px; color:#333;"><i class="fa-solid fa-stethoscope"></i> Connectivity Diagnostics</h4>
                    <p style="font-size:0.8rem; color:#777; margin-bottom:10px;">Test endpoints against the active server with your current SuperAdmin credentials:</p>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <button id="btn-ping-stats" class="btn-view" style="font-size:0.75rem; padding:8px;">Test /dashboard/stats</button>
                        <button id="btn-ping-users" class="btn-view" style="font-size:0.75rem; padding:8px;">Test /users/get_all</button>
                        <button id="btn-ping-agencies" class="btn-view" style="font-size:0.75rem; padding:8px;">Test /admin/agencies</button>
                        <button id="btn-ping-attendance" class="btn-view" style="font-size:0.75rem; padding:8px; background:#1976d2;">Test /metrics/event-attendance</button>
                        <button id="btn-ping-refresh" class="btn-view" style="font-size:0.75rem; padding:8px; background:#455a64; grid-column:span 2;">Test Token Refresh</button>
                    </div>
                    <div id="ping-results" style="margin-top:12px; font-family:monospace; font-size:0.75rem; background:#263238; color:#eceff1; padding:10px; border-radius:5px; max-height:120px; overflow-y:auto; display:none;"></div>
                </div>
            </div>`;

        openModal("API Server & Connection Diagnostics", content);

        document.getElementById('btn-quick-local')?.addEventListener('click', () => {
            const input = document.getElementById('custom-api-url');
            if (input) input.value = 'http://127.0.0.1:5000';
            setApiBaseUrl('http://127.0.0.1:5000');
            modalOverlay.classList.add('hidden');
            loadView(state.currentView);
        });

        document.getElementById('btn-quick-prod')?.addEventListener('click', () => {
            const input = document.getElementById('custom-api-url');
            if (input) input.value = DEFAULT_API_BASE_URL;
            setApiBaseUrl(DEFAULT_API_BASE_URL);
            modalOverlay.classList.add('hidden');
            loadView(state.currentView);
        });

        document.getElementById('btn-save-server-url')?.addEventListener('click', () => {
            const val = document.getElementById('custom-api-url')?.value;
            setApiBaseUrl(val);
            modalOverlay.classList.add('hidden');
            loadView(state.currentView);
        });

        document.getElementById('btn-reset-server-url')?.addEventListener('click', () => {
            setApiBaseUrl('');
            modalOverlay.classList.add('hidden');
            loadView(state.currentView);
        });

        const logPing = (msg, isErr = false) => {
            const out = document.getElementById('ping-results');
            if (!out) return;
            out.style.display = 'block';
            out.innerHTML += `<div style="color:${isErr ? '#ef5350' : '#81c784'}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
            out.scrollTop = out.scrollHeight;
        };

        document.getElementById('btn-ping-stats')?.addEventListener('click', async () => {
            logPing("Pinging /admin/dashboard/stats...");
            try {
                const start = Date.now();
                const res = await apiClient.get('/admin/dashboard/stats');
                logPing(`OK (${Date.now() - start}ms) - Total Users: ${res.total_users || 0}`);
            } catch(e) {
                logPing(`ERROR: HTTP ${e.status || 'ERR'} - ${e.message}`, true);
            }
        });

        document.getElementById('btn-ping-users')?.addEventListener('click', async () => {
            logPing("Pinging /users/get_all...");
            try {
                const start = Date.now();
                const res = await apiClient.get('/users/get_all');
                const count = Array.isArray(res) ? res.length : (res?.users?.length || 0);
                logPing(`OK (${Date.now() - start}ms) - Fetched ${count} users`);
            } catch(e) {
                logPing(`ERROR: HTTP ${e.status || 'ERR'} - ${e.message}`, true);
            }
        });

        document.getElementById('btn-ping-agencies')?.addEventListener('click', async () => {
            logPing("Pinging /admin/agencies...");
            try {
                const start = Date.now();
                const res = await apiClient.get('/admin/agencies');
                logPing(`OK (${Date.now() - start}ms) - Fetched ${res.length || 0} agencies`);
            } catch(e) {
                logPing(`ERROR: HTTP ${e.status || 'ERR'} - ${e.message}`, true);
            }
        });

        document.getElementById('btn-ping-attendance')?.addEventListener('click', async () => {
            logPing("Pinging /admin/metrics/event-attendance (days=30)...");
            try {
                const start = Date.now();
                const res = await apiClient.get('/admin/metrics/event-attendance?days=30');
                const overallRate = res?.overall_attendance_summary?.overall_attendance_rate_pct ?? 'N/A';
                const totalEvents = res?.overall_attendance_summary?.total_events_logged ?? 0;
                logPing(`OK (${Date.now() - start}ms) - Rate: ${overallRate}%, Events: ${totalEvents}`);
            } catch(e) {
                logPing(`ERROR: HTTP ${e.status || 'ERR'} - ${e.message}`, true);
            }
        });

        document.getElementById('btn-ping-refresh')?.addEventListener('click', async () => {
            logPing("Testing token refresh...");
            const ok = await attemptTokenRefresh();
            if (ok) logPing("Refresh Success: New access token acquired");
            else logPing("Refresh Failed: Check refresh token or credentials", true);
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
            state.tokens.refresh = data.refresh_token || null;
            state.user = { id: data.super_admin_id, username: data.username };

            localStorage.setItem('super_admin_access_token', data.access_token);
            if (data.refresh_token) {
                localStorage.setItem('super_admin_refresh_token', data.refresh_token);
            }
            localStorage.setItem('super_admin_info', JSON.stringify(state.user));
            initApp();
        } catch (error) {
            errBox.textContent = error.message || "Invalid credentials"; errBox.style.display = 'block';
        } finally {
            loginBtn.disabled = false; loginBtn.textContent = 'Login';
        }
    }

    function handleLogout() {
        localStorage.removeItem('super_admin_access_token');
        localStorage.removeItem('super_admin_refresh_token');
        localStorage.removeItem('super_admin_info');
        state.tokens.access = null;
        state.tokens.refresh = null;
        state.user = null;
        showView('login');
    }

    function showView(viewName) {
        if (viewName === 'app') {
            loginContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            if (welcomeMessage) welcomeMessage.textContent = `Welcome, ${state.user ? state.user.username : 'Admin'}`;
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
        updateServerBadge();
        const serverBtn = document.getElementById('server-settings-btn');
        if (serverBtn) {
            serverBtn.removeEventListener('click', openServerSettingsModal);
            serverBtn.addEventListener('click', openServerSettingsModal);
        }

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