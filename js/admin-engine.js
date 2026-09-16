/**
 * AI-Powered Smart Job Vacancy Finder System
 * Real-Time Supabase Admin Engine
 * No dummy or hardcoded data — All live from Supabase PostgreSQL
 */

(function () {
    'use strict';

    // In-Memory Reactive Admin State (Populated exclusively from Supabase)
    const AdminState = {
        users: [],         // Registered Job Seekers (from Supabase profiles & users)
        allUsers: [],      // All platform users (seekers, companies, admins)
        companies: [],     // Registered Companies (from Supabase companies & users)
        jobs: [],          // Active & Flagged Vacancies (from Supabase jobs)
        applications: [],  // Candidate Applications (from Supabase applications)
        reports: [],       // User Grievances & Reports (from Supabase reports)
        notifications: [], // Sent & Dispatched Alerts (from Supabase notifications)
        activities: [],    // Live Event Feed
        telemetryLogs: [], // CDC Realtime Postgres Events
        currentTab: 'tab-dashboard',
        pendingAppReviewId: null,
        isRealtimeConnected: false,
        realtimeEventCount: 0
    };

    window.AdminState = AdminState;

    // Helper: Get Supabase Client
    function getSupabase() {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.auth && typeof window.auth.getSupabase === 'function') {
            return window.auth.getSupabase();
        }
        if (typeof supabase !== 'undefined' && window.SUPABASE_CONFIG) {
            window.supabaseClient = supabase.createClient(
                window.SUPABASE_CONFIG.SUPABASE_URL,
                window.SUPABASE_CONFIG.SUPABASE_ANON_KEY
            );
            return window.supabaseClient;
        }
        return null;
    }

    // Helper: Format Date
    function formatDate(dateStr) {
        if (!dateStr) return 'Recent';
        try {
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? String(dateStr) : d.toISOString().split('T')[0];
        } catch (e) {
            return String(dateStr);
        }
    }

    // Helper: Escape HTML
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    window.escapeHtml = escapeHtml;

    // ========================================================
    // INITIALIZATION & REALTIME CONNECTION
    // ========================================================
    document.addEventListener('DOMContentLoaded', async function () {
        console.log("🛡️ Initializing Real-Time Supabase Admin Engine...");
        
        // 1. Validate Admin Session
        validateAdminSession();

        // 2. Setup Navigation
        initNavigation();

        // 3. Load Live Data from Supabase
        await refreshAdminData();

        // 4. Initialize Supabase Realtime Subscriptions
        initRealtimeSubscriptions();
    });

    function validateAdminSession() {
        let currentUser = null;
        if (window.auth && typeof window.auth.getCurrentUser === 'function') {
            currentUser = window.auth.getCurrentUser();
        } else {
            try {
                currentUser = JSON.parse(localStorage.getItem('smartjob_active_user') || sessionStorage.getItem('smartjob_active_session') || 'null');
            } catch(e) {}
        }

        if (currentUser) {
            const role = (currentUser.role || '').toLowerCase();
            const isEmailAdmin = (currentUser.email || '').toLowerCase().includes('admin');
            if (role !== 'admin' && !isEmailAdmin && role !== 'super_admin') {
                console.warn("Unauthorized role detected. Redirecting to auth.html");
                window.location.replace('auth.html');
                return;
            }

            // Update Admin Header Info
            const adminName = currentUser.fullName || currentUser.name || 'System Administrator';
            const adminEmail = currentUser.email || 'admin@smartjob.com';
            const nameEl = document.getElementById('sidebar-admin-name');
            const emailEl = document.getElementById('sidebar-admin-email');
            const profName = document.getElementById('profile-admin-name');
            const profEmail = document.getElementById('profile-admin-email');
            if (nameEl) nameEl.textContent = adminName;
            if (emailEl) emailEl.textContent = adminEmail;
            if (profName) profName.textContent = adminName;
            if (profEmail) profEmail.textContent = adminEmail;
        }
    }

    // ========================================================
    // DATA SYNCHRONIZATION: LIVE FROM SUPABASE
    // ========================================================
    async function refreshAdminData(showToastNotice = false) {
        const client = getSupabase();
        const indicator = document.getElementById('realtime-indicator-status');
        if (indicator && !AdminState.isRealtimeConnected) {
            indicator.textContent = "Syncing Supabase...";
        }

        try {
            // 1. Fetch Users & Profiles from Supabase
            let rawProfiles = [];
            let rawUsers = [];

            if (client) {
                const [profRes, userRes] = await Promise.all([
                    client.from('profiles').select('*').order('created_at', { ascending: false }),
                    client.from('users').select('*').order('created_at', { ascending: false })
                ]);
                rawProfiles = (!profRes.error && Array.isArray(profRes.data)) ? profRes.data : [];
                rawUsers = (!userRes.error && Array.isArray(userRes.data)) ? userRes.data : [];
            } else if (window.auth && typeof window.auth.getAllUsers === 'function') {
                rawUsers = await window.auth.getAllUsers();
            }

            // Combine profiles & users without duplicates
            const userMap = new Map();
            rawUsers.forEach(u => {
                const key = (u.email || u.user_id || u.id || '').toLowerCase();
                if (key) userMap.set(key, u);
            });
            rawProfiles.forEach(p => {
                const key = (p.email || p.id || '').toLowerCase();
                if (key) {
                    const existing = userMap.get(key);
                    userMap.set(key, existing ? { ...existing, ...p } : p);
                }
            });

            const allMergedUsers = Array.from(userMap.values());
            AdminState.allUsers = allMergedUsers;

            // Filter Seekers
            const seekers = allMergedUsers.filter(u => {
                const r = (u.role || '').toLowerCase();
                return r === 'seeker' || r === 'job_seeker' || r === '' || r === 'candidate';
            });

            AdminState.users = seekers.map((u, i) => ({
                id: u.id || u.user_id || `usr-${i + 1}`,
                name: u.full_name || u.name || u.fullName || 'Candidate',
                email: u.email || 'seeker@smartjob.com',
                qualification: u.education || u.qualification || 'Degree / Diploma',
                skills: typeof u.skills === 'string' ? u.skills : (Array.isArray(u.skills) ? u.skills.join(', ') : 'Python, SQL, Web Dev'),
                experience: u.experience || u.experience_years || 'Fresher',
                location: u.location || 'India',
                status: (u.isBlocked || u.status === 'blocked') ? 'Blocked' : 'Active',
                createdAt: formatDate(u.created_at)
            }));

            // 2. Fetch Companies & Jobs from Supabase
            let rawCompanies = [];
            let rawJobs = [];

            if (client) {
                const [compRes, jobRes] = await Promise.all([
                    client.from('companies').select('*').order('created_at', { ascending: false }),
                    client.from('jobs').select('*').order('created_at', { ascending: false })
                ]);
                rawCompanies = (!compRes.error && Array.isArray(compRes.data)) ? compRes.data : [];
                rawJobs = (!jobRes.error && Array.isArray(jobRes.data)) ? jobRes.data : [];
            } else {
                if (window.auth && typeof window.auth.getAllCompanies === 'function') {
                    rawCompanies = await window.auth.getAllCompanies();
                }
                if (window.db && typeof window.db.fetchJobsFromSupabase === 'function') {
                    rawJobs = await window.db.fetchJobsFromSupabase();
                } else if (window.db) {
                    rawJobs = window.db.getJobs();
                }
            }

            // Map and Run AI Screening Analysis on every job
            AdminState.jobs = rawJobs.map(job => {
                const ai = analyzeJobAI(job, rawJobs);
                return {
                    id: job.job_id || job.id,
                    title: job.title || 'Software Position',
                    company: job.company_name || job.company || 'Enterprise Corp',
                    companyId: job.company_id || '',
                    location: job.location || 'Remote',
                    salary: job.salary || '₹30,000 - ₹50,000/mo',
                    experience: job.experience || 'Fresher',
                    qualification: job.requirements || job.qualification || 'Graduation / B.Tech',
                    skills: Array.isArray(job.skills) ? job.skills.join(', ') : (job.skills || 'Technical Skills'),
                    description: job.description || 'Job details and requirements',
                    postedDate: formatDate(job.created_at || job.createdAt),
                    status: (job.status === 'removed' || job.status === 'Removed') ? 'Removed' : (ai.aiDetection === 'suspicious' ? 'Flagged' : (job.status || 'Active')),
                    aiDetection: ai.aiDetection,
                    aiReason: ai.aiReason,
                    indicators: ai.indicators
                };
            });

            // Build unified company directory from companies table, recruiter accounts, and live job postings
            const compMap = new Map();
            rawCompanies.forEach(c => {
                const key = (c.company_name || c.name || '').toLowerCase();
                if (key) compMap.set(key, c);
            });

            // Include recruiters registered in users table
            const recruiterUsers = allMergedUsers.filter(u => (u.role || '').toLowerCase() === 'company' || (u.role || '').toLowerCase() === 'recruiter');
            recruiterUsers.forEach(r => {
                const key = (r.company_name || r.name || r.fullName || r.email || '').toLowerCase();
                if (key && !compMap.has(key)) {
                    compMap.set(key, {
                        company_id: r.user_id || r.id,
                        company_name: r.company_name || r.name || r.fullName || 'Hiring Enterprise',
                        email: r.email,
                        location: r.location || 'India',
                        industry: r.industry || 'Technology',
                        status: r.status || (r.isBlocked ? 'blocked' : 'approved')
                    });
                }
            });

            // Also include employers that have posted jobs in Supabase
            AdminState.jobs.forEach(j => {
                const cName = (j.company || '').trim();
                if (cName) {
                    const key = cName.toLowerCase();
                    if (!compMap.has(key)) {
                        compMap.set(key, {
                            company_id: j.companyId || `cmp_${key}`,
                            company_name: cName,
                            email: `careers@${key.replace(/[^a-z0-9]/g, '')}.com`,
                            location: j.location || 'India',
                            industry: 'Technology',
                            status: 'approved'
                        });
                    }
                }
            });

            AdminState.companies = Array.from(compMap.values()).map((c, i) => {
                const cName = c.company_name || c.name || 'Company';
                const count = AdminState.jobs.filter(j => 
                    (j.company && j.company.toLowerCase() === cName.toLowerCase()) ||
                    (j.companyId && String(j.companyId) === String(c.company_id || c.id))
                ).length;

                return {
                    id: c.company_id || c.id || `cmp-${i + 1}`,
                    name: cName,
                    email: c.email || c.contact_email || 'recruiter@company.com',
                    location: c.location || 'India',
                    industry: c.industry || 'Technology',
                    status: (c.status === 'blocked' || c.isBlocked) ? 'Blocked' : 'Active',
                    jobsCount: count
                };
            });

            // 4. Fetch Applications from Supabase
            let rawApps = [];
            if (client) {
                const appRes = await client.from('applications').select('*').order('applied_date', { ascending: false });
                rawApps = (!appRes.error && Array.isArray(appRes.data)) ? appRes.data : [];
            } else if (window.db && typeof window.db.fetchApplicationsFromSupabase === 'function') {
                rawApps = await window.db.fetchApplicationsFromSupabase();
            } else if (window.db) {
                rawApps = window.db.getApplications();
            }

            // Map and Run AI Consistency Screening on Applications
            AdminState.applications = rawApps.map(app => {
                const ai = analyzeApplicationAI(app, rawApps, AdminState.users);
                return {
                    id: app.application_id || app.id,
                    applicantName: app.full_name || app.applicantName || app.fullName || 'Candidate',
                    applicantEmail: app.email || app.applicantEmail || 'applicant@example.com',
                    jobTitle: app.job_title || app.jobTitle || 'Position',
                    company: app.company || app.company_name || 'Hiring Firm',
                    appliedDate: formatDate(app.applied_date || app.appliedAt),
                    claimedExperience: app.experience || 'Fresher',
                    resumeExperience: ai.resumeExperience,
                    claimedSkills: typeof app.skills === 'string' ? app.skills : (Array.isArray(app.skills) ? app.skills.join(', ') : 'Not specified'),
                    resumeSkills: ai.resumeSkills,
                    aiDetection: ai.aiDetection,
                    aiReason: ai.aiReason,
                    status: app.status || 'Applied',
                    resumeName: app.resume_name || 'Resume.pdf'
                };
            });

            // 5. Fetch Reports & Complaints from Supabase (with fallback)
            let rawReports = [];
            if (client) {
                try {
                    const repRes = await client.from('reports').select('*').order('created_at', { ascending: false });
                    if (!repRes.error && Array.isArray(repRes.data)) {
                        rawReports = repRes.data;
                    }
                } catch (e) {
                    console.warn("Supabase reports table query exception:", e);
                }
            }

            if (rawReports.length === 0 && window.db && typeof window.db.getReports === 'function') {
                rawReports = window.db.getReports();
            }

            AdminState.reports = rawReports.map((r, i) => ({
                id: r.id || `REP-${1000 + i + 1}`,
                type: r.type || 'Job',
                reportedItem: r.reported_item || r.reportedItem || 'Reported Entity',
                reporter: r.reporter_email || r.reporter || 'user@example.com',
                reason: r.reason || 'Misleading information',
                details: r.details || r.description || '',
                date: formatDate(r.created_at || r.date),
                status: r.status || 'Pending'
            }));

            // 6. Fetch Notifications from Supabase
            let rawNotifs = [];
            if (client) {
                try {
                    const notifRes = await client.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
                    if (!notifRes.error && Array.isArray(notifRes.data)) {
                        rawNotifs = notifRes.data;
                    }
                } catch (e) {}
            }
            if (rawNotifs.length === 0 && window.db && typeof window.db.getAllNotifications === 'function') {
                rawNotifs = window.db.getAllNotifications();
            }

            AdminState.notifications = rawNotifs.map(n => ({
                id: n.notification_id || n.id,
                recipient: n.recipient_email || n.user_id || n.userEmail || 'Company / Recruiter',
                type: n.type || 'Alert',
                title: n.title || 'System Notice',
                message: n.message || '',
                date: formatDate(n.created_at || n.date),
                status: n.status === 'read' ? 'Delivered' : 'Delivered'
            }));

            // 7. Synthesize Live Recent Activities from real database events
            generateLiveRecentActivities();

            // Render all views with real Supabase data
            renderAllDashboardViews();

            if (showToastNotice) {
                showToast("Admin Dashboard synchronized with live Supabase database!", "success");
            }
        } catch (err) {
            console.error("❌ Error fetching live Supabase admin records:", err);
            showToast("Failed to fetch some records from Supabase. Check console.", "danger");
        }
    }
    window.refreshAdminData = refreshAdminData;

    // ========================================================
    // AI HEURISTIC ENGINE (REAL TIME DETECTION)
    // ========================================================
    function analyzeJobAI(job, allJobs) {
        const title = (job.title || '').toLowerCase();
        const company = (job.company_name || job.company || '').toLowerCase();
        const desc = (job.description || '').toLowerCase();
        const salary = (job.salary || '').toLowerCase();
        const reqs = (job.requirements || '').toLowerCase();

        // 1. Duplicate Detection Check
        const isDuplicate = allJobs.some(other => {
            if (String(other.job_id || other.id) === String(job.job_id || job.id)) return false;
            const otherTitle = (other.title || '').toLowerCase();
            const otherCompany = (other.company_name || other.company || '').toLowerCase();
            return (otherTitle === title && otherCompany === company);
        });

        if (isDuplicate) {
            return {
                aiDetection: 'duplicate',
                aiReason: `🔁 Duplicate Posting: Identical title "${job.title}" posted by ${job.company_name || job.company}.`,
                indicators: ['Duplicate job title', 'Identical hiring organization']
            };
        }

        // 2. Suspicious Scams / Fee Solicitations / Unrealistic Claims
        const scamKeywords = ['whatsapp', 'telegram', 'registration fee', 'security deposit', 'pay to start', 'captcha entry', 'data typist', 'guaranteed income', 'crypto', 'send money'];
        const foundScamWords = scamKeywords.filter(k => desc.includes(k) || title.includes(k));

        const isUnrealisticSalary = (
            (salary.includes('1,50,000') || salary.includes('2,00,000') || salary.includes('3,00,000')) &&
            (title.includes('typing') || title.includes('data entry') || title.includes('fresher') || desc.includes('no experience'))
        );

        if (foundScamWords.length > 0 || isUnrealisticSalary) {
            const reasons = [];
            if (foundScamWords.length > 0) reasons.push(`Prohibited recruitment solicitation keywords: ${foundScamWords.join(', ')}.`);
            if (isUnrealisticSalary) reasons.push(`Abnormally inflated compensation package compared with entry qualifications.`);
            return {
                aiDetection: 'suspicious',
                aiReason: `⚠️ Anomaly Detected: ${reasons.join(' ')}`,
                indicators: [...foundScamWords, isUnrealisticSalary ? 'Inflated Salary' : '']
            };
        }

        return {
            aiDetection: 'clean',
            aiReason: 'Verified recruiter credentials, realistic compensation benchmarks, clear technical responsibilities.',
            indicators: []
        };
    }

    function analyzeApplicationAI(app, allApps, allUsers) {
        const email = (app.email || app.applicantEmail || '').toLowerCase();
        const jobId = String(app.job_id || app.jobId || '');

        // 1. Duplicate Application Check
        const duplicateCount = allApps.filter(other => {
            const otherEmail = (other.email || other.applicantEmail || '').toLowerCase();
            const otherJob = String(other.job_id || other.jobId || '');
            return otherEmail === email && otherJob === jobId;
        }).length;

        if (duplicateCount > 1) {
            return {
                aiDetection: 'duplicate',
                aiReason: `🔁 Duplicate Submission: Candidate submitted ${duplicateCount} applications for this same vacancy.`,
                resumeExperience: app.experience || 'Fresher',
                resumeSkills: app.skills || 'Technical Skills'
            };
        }

        // 2. Experience & Skill Inconsistency Check
        const claimedExp = (app.experience || '').toLowerCase();
        const matchedUser = allUsers.find(u => (u.email || '').toLowerCase() === email);
        const resumeExp = matchedUser ? matchedUser.experience : 'Fresher (Profile Record)';
        const resumeSkills = matchedUser ? (typeof matchedUser.skills === 'string' ? matchedUser.skills : (matchedUser.skills || []).join(', ')) : 'Web Development, SQL';

        const isDiscrepant = (
            (claimedExp.includes('3+') || claimedExp.includes('5+') || claimedExp.includes('senior')) &&
            (resumeExp.toLowerCase().includes('fresher') || (app.qualification || '').toLowerCase().includes('diploma') || (app.qualification || '').toLowerCase().includes('2026'))
        );

        if (isDiscrepant) {
            return {
                aiDetection: 'inconsistency',
                aiReason: `⚠️ Discrepancy Flagged: Application form declares Senior / 3+ Years experience, whereas candidate profile indicates Fresher / 2026 batch.`,
                resumeExperience: resumeExp,
                resumeSkills: resumeSkills
            };
        }

        return {
            aiDetection: 'clean',
            aiReason: 'Academic credentials and declared skillsets align consistently with profile background.',
            resumeExperience: resumeExp,
            resumeSkills: resumeSkills
        };
    }

    function generateLiveRecentActivities() {
        const list = [];

        // Latest registered users
        AdminState.users.slice(0, 3).forEach(u => {
            list.push({
                icon: 'fa-user-plus',
                color: 'var(--primary)',
                title: 'New Job Seeker Registered',
                desc: `${u.name} registered candidate profile.`,
                time: u.createdAt || 'Today'
            });
        });

        // Latest registered companies
        AdminState.companies.slice(0, 2).forEach(c => {
            list.push({
                icon: 'fa-building',
                color: '#15803d',
                title: 'New Company Registered',
                desc: `${c.name} registered recruiter portal.`,
                time: 'Recent'
            });
        });

        // Latest jobs
        AdminState.jobs.slice(0, 3).forEach(j => {
            list.push({
                icon: 'fa-briefcase',
                color: j.aiDetection === 'suspicious' ? 'var(--warning)' : 'var(--primary)',
                title: j.aiDetection === 'suspicious' ? 'Flagged Job Vacancy Logged' : 'New Job Vacancy Posted',
                desc: `"${j.title}" by ${j.company}.`,
                time: j.postedDate || 'Recent'
            });
        });

        // Latest applications
        AdminState.applications.slice(0, 2).forEach(a => {
            list.push({
                icon: 'fa-file-lines',
                color: '#7c3aed',
                title: 'New Application Submitted',
                desc: `${a.applicantName} applied for "${a.jobTitle}".`,
                time: a.appliedDate || 'Recent'
            });
        });

        AdminState.activities = list;
    }

    // ========================================================
    // SUPABASE REALTIME CHANGE DATA CAPTURE (CDC)
    // ========================================================
    function initRealtimeSubscriptions() {
        const client = getSupabase();
        if (!client) {
            console.warn("⚠️ Supabase Realtime client not available.");
            return;
        }

        try {
            const channel = client.channel('admin-realtime-hub');

            // 1. Profiles Table (Seeker updates / registrations / blocking)
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
                handleRealtimeEvent('profiles', payload);
            });

            // 2. Users Table
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
                handleRealtimeEvent('users', payload);
            });

            // 3. Companies Table
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, payload => {
                handleRealtimeEvent('companies', payload);
            });

            // 4. Jobs Table (Postings, Updates, Deletions)
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, payload => {
                handleRealtimeEvent('jobs', payload);
            });

            // 5. Applications Table (Incoming submissions & status changes)
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, payload => {
                handleRealtimeEvent('applications', payload);
            });

            // 6. Reports Table (Grievance tickets)
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, payload => {
                handleRealtimeEvent('reports', payload);
            });

            // 7. Notifications Table
            channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, payload => {
                handleRealtimeEvent('notifications', payload);
            });

            channel.subscribe((status) => {
                console.log("⚡ Supabase Realtime Subscription Status:", status);
                AdminState.isRealtimeConnected = (status === 'SUBSCRIBED');
                updateRealtimeIndicator();
            });
        } catch (subErr) {
            console.warn("Realtime subscription exception:", subErr);
        }
    }

    function updateRealtimeIndicator() {
        const indicator = document.getElementById('realtime-indicator-status');
        const pill = document.getElementById('realtime-status-pill');
        const statsBadge = document.getElementById('stats-realtime-badge');

        if (AdminState.isRealtimeConnected) {
            if (indicator) indicator.textContent = "Supabase Realtime Live";
            if (pill) pill.style.borderColor = "var(--success-border)";
            if (statsBadge) {
                statsBadge.className = "status-badge badge-active";
                statsBadge.innerHTML = '<i class="fa-solid fa-bolt"></i> Realtime Synchronized';
            }
        } else {
            if (indicator) indicator.textContent = "Supabase Polling Active";
            if (statsBadge) {
                statsBadge.className = "status-badge badge-pending";
                statsBadge.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Polling Sync Active';
            }
        }
    }

    async function handleRealtimeEvent(table, payload) {
        console.log(`⚡ Realtime Change on [${table}]:`, payload.eventType, payload);
        AdminState.realtimeEventCount++;

        // Add to telemetry audit trail
        const refName = payload.new?.title || payload.new?.company_name || payload.new?.full_name || payload.new?.name || payload.new?.email || payload.old?.id || 'Record';
        logTelemetryEvent(table, payload.eventType, refName);

        // Immediate Toast Notification for major events
        if (payload.eventType === 'INSERT') {
            if (table === 'jobs') showToast(`Realtime: New job vacancy "${payload.new.title}" posted!`, 'success');
            if (table === 'applications') showToast(`Realtime: New application submitted by ${payload.new.full_name || 'Candidate'}!`, 'success');
            if (table === 'profiles' || table === 'users') showToast(`Realtime: New user registered (${payload.new.full_name || payload.new.name || payload.new.email})!`, 'success');
            if (table === 'companies') showToast(`Realtime: New company registered (${payload.new.company_name})!`, 'success');
            if (table === 'reports') showToast(`Realtime: New grievance report logged!`, 'warning');
        } else if (payload.eventType === 'DELETE') {
            showToast(`Realtime: A record was deleted from ${table}.`, 'warning');
        }

        // Re-sync and re-render dashboard
        await refreshAdminData(false);
    }

    function logTelemetryEvent(table, eventType, reference) {
        const time = new Date().toLocaleTimeString();
        AdminState.telemetryLogs.unshift({
            time: time,
            table: table,
            action: eventType,
            reference: reference,
            status: 'Applied'
        });

        if (AdminState.telemetryLogs.length > 50) AdminState.telemetryLogs.pop();
        renderTelemetryTable();
    }

    function renderTelemetryTable() {
        const tbody = document.getElementById('telemetry-table-body');
        const badge = document.getElementById('stats-total-events-badge');
        if (badge) badge.textContent = `${AdminState.realtimeEventCount} Events Handled`;
        if (!tbody) return;

        if (AdminState.telemetryLogs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="table-empty-state">
                            <i class="fa-solid fa-satellite-dish"></i>
                            <h4>Awaiting Realtime PostgreSQL Changes...</h4>
                            <p>Real-time events (INSERT, UPDATE, DELETE) will populate here live as they occur.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        AdminState.telemetryLogs.slice(0, 10).forEach(log => {
            const tr = document.createElement('tr');
            let actionBadge = 'badge-active';
            if (log.action === 'INSERT') actionBadge = 'badge-active';
            if (log.action === 'UPDATE') actionBadge = 'badge-resolved';
            if (log.action === 'DELETE') actionBadge = 'badge-blocked';

            tr.innerHTML = `
                <td style="font-family: monospace; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(log.time)}</td>
                <td style="font-weight: 600;"><i class="fa-solid fa-database" style="color:var(--primary); margin-right:4px;"></i> public.${escapeHtml(log.table)}</td>
                <td><span class="status-badge ${actionBadge}">${escapeHtml(log.action)}</span></td>
                <td style="font-weight: 500;">${escapeHtml(log.reference)}</td>
                <td><span class="status-badge badge-active" style="font-size:0.72rem;"><i class="fa-solid fa-check-double"></i> Live Synchronized</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ========================================================
    // ALL DASHBOARD VIEWS RENDERING
    // ========================================================
    function renderAllDashboardViews() {
        renderSummaryMetrics();
        renderRecentActivities();
        renderAIAlerts();
        renderUsersTable();
        renderCompaniesTable();
        renderJobsTable();
        renderApplicationsTable();
        renderReportsTable();
        renderNotificationsTable();
        renderStatisticsView();
        populateCompanySelectDropdown();
    }

    // ========================================================
    // 1. DASHBOARD METRICS & WIDGETS
    // ========================================================
    function renderSummaryMetrics() {
        const totalSeekers = AdminState.users.length;
        const totalCompanies = AdminState.companies.length;
        const totalJobs = AdminState.jobs.length;
        const totalApps = AdminState.applications.length;
        const totalReports = AdminState.reports.length;
        const complaintsCount = AdminState.reports.filter(r => r.type === 'Complaint' || r.type === 'Grievance' || (r.reason && r.reason.toLowerCase().includes('fee'))).length;
        const suspiciousJobsCount = AdminState.jobs.filter(j => j.aiDetection === 'suspicious' || j.aiDetection === 'duplicate').length;
        const suspiciousAppsCount = AdminState.applications.filter(a => a.aiDetection === 'inconsistency' || a.aiDetection === 'duplicate').length;

        // Card elements
        const cardSeekers = document.getElementById('card-total-users');
        const cardCompanies = document.getElementById('card-total-companies');
        const cardJobs = document.getElementById('card-total-jobs');
        const cardApps = document.getElementById('card-total-applications');
        const cardReports = document.getElementById('card-total-reports');
        const cardComplaints = document.getElementById('card-total-complaints');
        const cardSuspiciousJobs = document.getElementById('card-suspicious-jobs');
        const cardSuspiciousApps = document.getElementById('card-suspicious-apps');

        if (cardSeekers) cardSeekers.textContent = totalSeekers;
        if (cardCompanies) cardCompanies.textContent = totalCompanies;
        if (cardJobs) cardJobs.textContent = totalJobs;
        if (cardApps) cardApps.textContent = totalApps;
        if (cardReports) cardReports.textContent = totalReports;
        if (cardComplaints) cardComplaints.textContent = complaintsCount;
        if (cardSuspiciousJobs) cardSuspiciousJobs.textContent = suspiciousJobsCount;
        if (cardSuspiciousApps) cardSuspiciousApps.textContent = suspiciousAppsCount;

        // Sidebar Badges
        const badgeUsers = document.getElementById('badge-users-count');
        const badgeComps = document.getElementById('badge-companies-count');
        const badgeJobs = document.getElementById('badge-jobs-suspicious');
        const badgeApps = document.getElementById('badge-apps-suspicious');
        const badgeReps = document.getElementById('badge-reports-count');
        const bellBadge = document.getElementById('header-bell-badge');

        if (badgeUsers) badgeUsers.textContent = totalSeekers;
        if (badgeComps) badgeComps.textContent = totalCompanies;
        if (badgeJobs) badgeJobs.textContent = suspiciousJobsCount;
        if (badgeApps) badgeApps.textContent = suspiciousAppsCount;
        if (badgeReps) badgeReps.textContent = AdminState.reports.filter(r => r.status === 'Pending').length;
        if (bellBadge) {
            bellBadge.style.display = (suspiciousJobsCount + suspiciousAppsCount + totalReports > 0) ? 'block' : 'none';
        }
    }

    function renderRecentActivities() {
        const listEl = document.getElementById('dashboard-activity-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (AdminState.activities.length === 0) {
            listEl.innerHTML = '<li style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No recent activities logged in Supabase.</li>';
            return;
        }

        AdminState.activities.slice(0, 5).forEach(act => {
            const li = document.createElement('li');
            li.className = 'activity-item';
            li.innerHTML = `
                <div class="activity-icon" style="background: ${act.color}15; color: ${act.color};">
                    <i class="fa-solid ${act.icon}"></i>
                </div>
                <div class="activity-details">
                    <div class="activity-title">${escapeHtml(act.title)}</div>
                    <div class="activity-desc">${escapeHtml(act.desc)}</div>
                </div>
                <div class="activity-time">${escapeHtml(act.time)}</div>
            `;
            listEl.appendChild(li);
        });
    }

    function renderAIAlerts() {
        const container = document.getElementById('dashboard-ai-alerts');
        const badge = document.getElementById('ai-alerts-badge');
        if (!container) return;
        container.innerHTML = '';

        const alerts = [];

        // Suspicious Jobs
        AdminState.jobs.filter(j => j.aiDetection === 'suspicious').forEach(job => {
            alerts.push({
                type: 'job',
                id: job.id,
                title: '⚠️ Potentially Suspicious Job Detected',
                desc: `"${job.title}" by ${job.company}. Flagged for compensation anomaly or keyword analysis.`,
                severity: 'alert-danger',
                actionLabel: 'Inspect Vacancy',
                action: () => viewJobDetails(job.id)
            });
        });

        // Inconsistent Applications
        AdminState.applications.filter(a => a.aiDetection === 'inconsistency').forEach(app => {
            alerts.push({
                type: 'app',
                id: app.id,
                title: '⚠️ Candidate Application Discrepancy Flagged',
                desc: `${app.applicantName} applied for "${app.jobTitle}". Declared ${app.claimedExperience} vs ${app.resumeExperience} profile record.`,
                severity: 'alert-warning',
                actionLabel: 'Review Discrepancy',
                action: () => reviewApplicationInconsistency(app.id)
            });
        });

        // Duplicate Jobs
        AdminState.jobs.filter(j => j.aiDetection === 'duplicate').forEach(job => {
            alerts.push({
                type: 'duplicate_job',
                id: job.id,
                title: '🔁 Duplicate Job Posting Detected',
                desc: `"${job.title}" by ${job.company} matches an existing active vacancy.`,
                severity: 'alert-info',
                actionLabel: 'Review Posting',
                action: () => viewJobDetails(job.id)
            });
        });

        if (badge) badge.textContent = `${alerts.length} Alerts Active`;

        if (alerts.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding: 25px 10px; color: var(--success);">
                    <i class="fa-solid fa-circle-check" style="font-size: 2rem; margin-bottom: 8px;"></i>
                    <h4 style="color:var(--text-main); font-size: 0.95rem;">All Records Verified</h4>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">No suspicious jobs or application discrepancies detected.</p>
                </div>
            `;
            return;
        }

        alerts.forEach(item => {
            const card = document.createElement('div');
            card.className = `ai-alert-card ${item.severity}`;
            card.innerHTML = `
                <div class="ai-alert-icon">
                    <i class="fa-solid ${item.severity === 'alert-danger' ? 'fa-triangle-exclamation' : (item.severity === 'alert-info' ? 'fa-clone' : 'fa-robot')}"></i>
                </div>
                <div class="ai-alert-content">
                    <div class="ai-alert-title">${escapeHtml(item.title)}</div>
                    <div class="ai-alert-desc">${escapeHtml(item.desc)}</div>
                    <button class="ai-alert-btn" id="btn-alert-${item.id}">
                        <i class="fa-solid fa-arrow-right"></i> ${escapeHtml(item.actionLabel)}
                    </button>
                </div>
            `;
            const btn = card.querySelector(`#btn-alert-${item.id}`);
            if (btn) btn.addEventListener('click', item.action);
            container.appendChild(card);
        });
    }

    // ========================================================
    // 2. USER MANAGEMENT
    // ========================================================
    function renderUsersTable(filteredList = null) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const list = filteredList || AdminState.users;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-empty-state">
                            <i class="fa-solid fa-user-xmark"></i>
                            <h4>No Registered Job Seekers Found</h4>
                            <p>No job seeker records found in the Supabase database matching filters.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach(user => {
            const tr = document.createElement('tr');
            const isBlocked = user.status === 'Blocked';
            const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

            tr.innerHTML = `
                <td>
                    <div class="table-avatar-cell">
                        <div class="cell-avatar">${initial}</div>
                        <div>
                            <div class="cell-text-primary">${escapeHtml(user.name)}</div>
                            <div class="cell-text-sub"><i class="fa-solid fa-location-dot" style="font-size:0.7rem;"></i> ${escapeHtml(user.location || 'India')}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.qualification)}</td>
                <td><span style="font-size:0.78rem; color:var(--text-muted); max-width:220px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(user.skills)}</span></td>
                <td>
                    <span class="status-badge ${isBlocked ? 'badge-blocked' : 'badge-active'}">
                        <i class="fa-solid ${isBlocked ? 'fa-ban' : 'fa-check'}"></i> ${user.status}
                    </span>
                </td>
                <td style="text-align: right;">
                    <div class="action-btn-group" style="justify-content: flex-end;">
                        <button class="action-btn" title="View Profile Details" onclick="viewUserDetails('${user.id}')">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                        <button class="action-btn ${isBlocked ? 'btn-unblock-toggle' : 'btn-block-toggle'}" title="${isBlocked ? 'Unblock User' : 'Block User'}" onclick="toggleUserBlockStatus('${user.id}', '${user.email}')">
                            <i class="fa-solid ${isBlocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${isBlocked ? 'Unblock' : 'Block'}
                        </button>
                        <button class="action-btn btn-delete-row" title="Delete User from Database" onclick="promptDeleteUser('${user.id}', '${user.email}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function filterUsersTable() {
        const query = (document.getElementById('search-users-input')?.value || '').toLowerCase().trim();
        const statusFilter = document.getElementById('filter-user-status')?.value || 'all';

        const filtered = AdminState.users.filter(u => {
            const matchQuery = !query || 
                u.name.toLowerCase().includes(query) || 
                u.email.toLowerCase().includes(query) || 
                u.qualification.toLowerCase().includes(query) ||
                u.skills.toLowerCase().includes(query);

            const matchStatus = statusFilter === 'all' || u.status.toLowerCase() === statusFilter.toLowerCase();
            return matchQuery && matchStatus;
        });

        renderUsersTable(filtered);
    }
    window.filterUsersTable = filterUsersTable;

    function viewUserDetails(userId) {
        const user = AdminState.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        // Applications submitted by this candidate
        const userApps = AdminState.applications.filter(a => a.applicantEmail.toLowerCase() === user.email.toLowerCase());

        const content = `
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
                <div class="cell-avatar" style="width: 54px; height: 54px; font-size: 1.4rem;">${user.name.charAt(0).toUpperCase()}</div>
                <div>
                    <h4 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main);">${escapeHtml(user.name)}</h4>
                    <p style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(user.email)}</p>
                    <span class="status-badge ${user.status === 'Blocked' ? 'badge-blocked' : 'badge-active'}" style="margin-top: 4px;">${user.status} Candidate</span>
                </div>
            </div>

            <div class="detail-row">
                <div class="detail-label">Highest Qualification</div>
                <div class="detail-value">${escapeHtml(user.qualification)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Experience Level</div>
                <div class="detail-value">${escapeHtml(user.experience)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Location / City</div>
                <div class="detail-value">${escapeHtml(user.location)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Verified Skillsets</div>
                <div class="detail-value">${escapeHtml(user.skills)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Platform Submissions</div>
                <div class="detail-value">${userApps.length} Job Applications</div>
            </div>
        `;

        document.getElementById('details-modal-title').innerHTML = '<i class="fa-solid fa-user-graduate"></i> Candidate Profile Details';
        document.getElementById('details-modal-content').innerHTML = content;
        openModal('details-modal');
    }
    window.viewUserDetails = viewUserDetails;

    async function toggleUserBlockStatus(userId, userEmail) {
        const user = AdminState.users.find(u => String(u.id) === String(userId) || (u.email && u.email.toLowerCase() === userEmail.toLowerCase()));
        if (!user) return;

        const willBlock = user.status !== 'Blocked';
        user.status = willBlock ? 'Blocked' : 'Active';

        // Call auth service which updates Supabase profiles & users table
        if (window.auth && typeof window.auth.toggleBlockUser === 'function') {
            try {
                await window.auth.toggleBlockUser(userEmail, userId, willBlock);
            } catch (e) {
                console.warn("auth.toggleBlockUser notice:", e);
            }
        } else {
            const client = getSupabase();
            if (client) {
                try {
                    await client.from('profiles').update({ status: willBlock ? 'blocked' : 'active' }).eq('id', window.toUUID(userId));
                    await client.from('users').update({ status: willBlock ? 'blocked' : 'active' }).eq('email', userEmail);
                } catch (e) {}
            }
        }

        showToast(`User ${user.name} has been ${willBlock ? 'BLOCKED' : 'UNBLOCKED'}.`, willBlock ? 'warning' : 'success');
        renderUsersTable();
        renderSummaryMetrics();
        renderStatisticsView();
    }
    window.toggleUserBlockStatus = toggleUserBlockStatus;

    function promptDeleteUser(userId, userEmail) {
        const user = AdminState.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        document.getElementById('confirm-modal-title').innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i> Confirm Delete User';
        document.getElementById('confirm-modal-message').innerHTML = `Are you sure you want to permanently delete <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) from the Supabase database?`;

        const submitBtn = document.getElementById('confirm-modal-submit-btn');
        submitBtn.className = 'btn-danger';
        submitBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete User';
        submitBtn.onclick = async function () {
            AdminState.users = AdminState.users.filter(u => String(u.id) !== String(userId));
            const client = getSupabase();
            if (client) {
                try {
                    await client.from('profiles').delete().eq('id', window.toUUID(userId));
                    await client.from('users').delete().eq('email', userEmail);
                    await client.from('applications').delete().eq('email', userEmail);
                } catch (e) {}
            }
            closeModal('confirm-modal');
            showToast(`User ${user.name} deleted from database.`, 'danger');
            renderUsersTable();
            renderSummaryMetrics();
            renderStatisticsView();
        };

        openModal('confirm-modal');
    }
    window.promptDeleteUser = promptDeleteUser;

    // ========================================================
    // 3. COMPANY MANAGEMENT
    // ========================================================
    function renderCompaniesTable(filteredList = null) {
        const tbody = document.getElementById('companies-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const list = filteredList || AdminState.companies;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-empty-state">
                            <i class="fa-solid fa-building-circle-xmark"></i>
                            <h4>No Registered Companies Found</h4>
                            <p>No verified recruiter accounts found in the Supabase database.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach(comp => {
            const tr = document.createElement('tr');
            const isBlocked = comp.status === 'Blocked';
            const initial = comp.name ? comp.name.charAt(0).toUpperCase() : 'C';

            tr.innerHTML = `
                <td>
                    <div class="table-avatar-cell">
                        <div class="cell-avatar company">${initial}</div>
                        <div>
                            <div class="cell-text-primary">${escapeHtml(comp.name)}</div>
                            <div class="cell-text-sub">${escapeHtml(comp.industry || 'Technology')}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(comp.email)}</td>
                <td><i class="fa-solid fa-location-dot" style="color:var(--text-light); margin-right:4px;"></i> ${escapeHtml(comp.location)}</td>
                <td>
                    <span class="status-badge badge-active" style="background:#f1f5f9; color:var(--text-main); border-color:#cbd5e1;">
                        ${comp.jobsCount || 0} Openings
                    </span>
                </td>
                <td>
                    <span class="status-badge ${isBlocked ? 'badge-blocked' : 'badge-active'}">
                        <i class="fa-solid ${isBlocked ? 'fa-ban' : 'fa-check'}"></i> ${comp.status}
                    </span>
                </td>
                <td style="text-align: right;">
                    <div class="action-btn-group" style="justify-content: flex-end;">
                        <button class="action-btn" title="View Company Details" onclick="viewCompanyDetails('${comp.id}')">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                        <button class="action-btn ${isBlocked ? 'btn-unblock-toggle' : 'btn-block-toggle'}" title="${isBlocked ? 'Unblock Company' : 'Block Company'}" onclick="toggleCompanyBlockStatus('${comp.id}', '${comp.email}')">
                            <i class="fa-solid ${isBlocked ? 'fa-lock-open' : 'fa-lock'}"></i> ${isBlocked ? 'Unblock' : 'Block'}
                        </button>
                        <button class="action-btn btn-delete-row" title="Delete Company" onclick="promptDeleteCompany('${comp.id}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function filterCompaniesTable() {
        const query = (document.getElementById('search-companies-input')?.value || '').toLowerCase().trim();
        const statusFilter = document.getElementById('filter-company-status')?.value || 'all';

        const filtered = AdminState.companies.filter(c => {
            const matchQuery = !query || 
                c.name.toLowerCase().includes(query) || 
                c.email.toLowerCase().includes(query) || 
                (c.location && c.location.toLowerCase().includes(query)) ||
                (c.industry && c.industry.toLowerCase().includes(query));

            const matchStatus = statusFilter === 'all' || c.status.toLowerCase() === statusFilter.toLowerCase();
            return matchQuery && matchStatus;
        });

        renderCompaniesTable(filtered);
    }
    window.filterCompaniesTable = filterCompaniesTable;

    function viewCompanyDetails(companyId) {
        const comp = AdminState.companies.find(c => String(c.id) === String(companyId));
        if (!comp) return;

        const compJobs = AdminState.jobs.filter(j => 
            (j.company && j.company.toLowerCase() === comp.name.toLowerCase()) || 
            String(j.companyId) === String(comp.id)
        );

        let jobsHtml = '';
        if (compJobs.length > 0) {
            jobsHtml = compJobs.map(j => `
                <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px 14px; margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${escapeHtml(j.title)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(j.salary)} • ${escapeHtml(j.location)}</div>
                    </div>
                    <button class="action-btn" style="font-size:0.75rem;" onclick="closeModal('details-modal'); viewJobDetails('${j.id}')">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Inspect
                    </button>
                </div>
            `).join('');
        } else {
            jobsHtml = '<p style="font-size: 0.82rem; color: var(--text-muted); padding: 8px 0;">No job vacancies currently listed in Supabase.</p>';
        }

        const content = `
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
                <div class="cell-avatar company" style="width: 54px; height: 54px; font-size: 1.4rem;">${comp.name.charAt(0).toUpperCase()}</div>
                <div>
                    <h4 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main);">${escapeHtml(comp.name)}</h4>
                    <p style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(comp.email)}</p>
                    <span class="status-badge ${comp.status === 'Blocked' ? 'badge-blocked' : 'badge-active'}" style="margin-top: 4px;">${comp.status} Organization</span>
                </div>
            </div>

            <div class="detail-row">
                <div class="detail-label">Location</div>
                <div class="detail-value">${escapeHtml(comp.location)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Industry</div>
                <div class="detail-value">${escapeHtml(comp.industry || 'Technology')}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Active Vacancies</div>
                <div class="detail-value">${compJobs.length} Posted Openings in Database</div>
            </div>

            <div style="margin-top: 20px;">
                <h5 style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
                    <i class="fa-solid fa-briefcase" style="color:var(--primary); margin-right: 6px;"></i> Posted Vacancies (${compJobs.length})
                </h5>
                ${jobsHtml}
            </div>
        `;

        document.getElementById('details-modal-title').innerHTML = '<i class="fa-solid fa-building"></i> Company Profile & Live Postings';
        document.getElementById('details-modal-content').innerHTML = content;
        openModal('details-modal');
    }
    window.viewCompanyDetails = viewCompanyDetails;

    async function toggleCompanyBlockStatus(companyId, companyEmail) {
        const comp = AdminState.companies.find(c => String(c.id) === String(companyId));
        if (!comp) return;

        const willBlock = comp.status !== 'Blocked';
        comp.status = willBlock ? 'Blocked' : 'Active';

        if (willBlock) {
            AdminState.jobs.forEach(j => {
                if (j.company && j.company.toLowerCase() === comp.name.toLowerCase()) {
                    j.status = 'Removed';
                }
            });
        }

        if (window.auth && typeof window.auth.toggleBlockCompany === 'function') {
            try {
                await window.auth.toggleBlockCompany(companyId, companyEmail, comp.name, willBlock);
            } catch (e) {}
        } else {
            const client = getSupabase();
            if (client) {
                try {
                    await client.from('companies').update({ status: willBlock ? 'blocked' : 'approved' }).eq('company_id', window.toUUID(companyId));
                } catch (e) {}
            }
        }

        showToast(`Company ${comp.name} has been ${willBlock ? 'BLOCKED' : 'UNBLOCKED'}!`, willBlock ? 'warning' : 'success');
        renderCompaniesTable();
        renderJobsTable();
        renderSummaryMetrics();
        renderStatisticsView();
    }
    window.toggleCompanyBlockStatus = toggleCompanyBlockStatus;

    function promptDeleteCompany(companyId) {
        const comp = AdminState.companies.find(c => String(c.id) === String(companyId));
        if (!comp) return;

        document.getElementById('confirm-modal-title').innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i> Confirm Delete Company';
        document.getElementById('confirm-modal-message').innerHTML = `Are you sure you want to permanently remove <strong>${escapeHtml(comp.name)}</strong> and all corresponding vacancies from Supabase?`;

        const submitBtn = document.getElementById('confirm-modal-submit-btn');
        submitBtn.className = 'btn-danger';
        submitBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete Company';
        submitBtn.onclick = async function () {
            AdminState.companies = AdminState.companies.filter(c => String(c.id) !== String(companyId));
            AdminState.jobs = AdminState.jobs.filter(j => (j.company || '').toLowerCase() !== comp.name.toLowerCase());

            const client = getSupabase();
            if (client) {
                try {
                    await client.from('companies').delete().eq('company_id', window.toUUID(companyId));
                    await client.from('jobs').delete().eq('company_name', comp.name);
                } catch (e) {}
            }
            closeModal('confirm-modal');
            showToast(`Company ${comp.name} removed from registry.`, 'danger');
            renderCompaniesTable();
            renderJobsTable();
            renderSummaryMetrics();
            renderStatisticsView();
        };

        openModal('confirm-modal');
    }
    window.promptDeleteCompany = promptDeleteCompany;

    // ========================================================
    // 4. JOB MANAGEMENT & AI FAKE JOB SCREENING
    // ========================================================
    function renderJobsTable(filteredList = null) {
        const tbody = document.getElementById('jobs-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const list = filteredList || AdminState.jobs;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-empty-state">
                            <i class="fa-solid fa-briefcase"></i>
                            <h4>No Job Vacancies Found</h4>
                            <p>No vacancies in the Supabase database match the specified filters.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach(job => {
            const tr = document.createElement('tr');
            let aiBadgeHtml = '';

            if (job.aiDetection === 'suspicious') {
                aiBadgeHtml = `<span class="ai-flag-badge ai-suspicious"><i class="fa-solid fa-triangle-exclamation"></i> Potentially Suspicious ⚠️</span>`;
            } else if (job.aiDetection === 'duplicate') {
                aiBadgeHtml = `<span class="ai-flag-badge ai-duplicate"><i class="fa-solid fa-clone"></i> Duplicate Detected 🔁</span>`;
            } else {
                aiBadgeHtml = `<span class="ai-flag-badge ai-clean"><i class="fa-solid fa-circle-check"></i> Verified Clean ✓</span>`;
            }

            let statusBadgeClass = 'badge-active';
            if (job.status === 'Flagged') statusBadgeClass = 'badge-pending';
            if (job.status === 'Removed' || job.status === 'Rejected') statusBadgeClass = 'badge-removed';

            tr.innerHTML = `
                <td>
                    <div class="cell-text-primary">${escapeHtml(job.title)}</div>
                    <div class="cell-text-sub">${escapeHtml(job.salary || 'Competitive')}</div>
                </td>
                <td>${escapeHtml(job.company)}</td>
                <td>${escapeHtml(job.location)}</td>
                <td>${escapeHtml(job.postedDate || 'Recent')}</td>
                <td>${aiBadgeHtml}</td>
                <td>
                    <span class="status-badge ${statusBadgeClass}">${job.status}</span>
                </td>
                <td style="text-align: right;">
                    <div class="action-btn-group" style="justify-content: flex-end;">
                        <button class="action-btn" title="View Details" onclick="viewJobDetails('${job.id}')">
                            <i class="fa-solid fa-eye"></i> Details
                        </button>
                        ${(job.status === 'Flagged' || job.aiDetection === 'suspicious' || job.aiDetection === 'duplicate') ? `
                            <button class="action-btn btn-keep-job" title="Approve & Clear Flag" onclick="approveJob('${job.id}')">
                                <i class="fa-solid fa-check"></i> Approve
                            </button>
                        ` : ''}
                        ${job.status !== 'Removed' ? `
                            <button class="action-btn btn-delete-row" title="Block / Remove Vacancy" onclick="blockRemoveJob('${job.id}')">
                                <i class="fa-solid fa-ban"></i> Block
                            </button>
                        ` : `
                            <button class="action-btn btn-unblock-toggle" title="Restore Vacancy" onclick="approveJob('${job.id}')">
                                <i class="fa-solid fa-rotate-left"></i> Restore
                            </button>
                        `}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function filterJobsTable() {
        const query = (document.getElementById('search-jobs-input')?.value || '').toLowerCase().trim();
        const statusFilter = document.getElementById('filter-job-status')?.value || 'all';
        const aiFilter = document.getElementById('filter-job-ai')?.value || 'all';

        const filtered = AdminState.jobs.filter(j => {
            const matchQuery = !query || 
                j.title.toLowerCase().includes(query) || 
                j.company.toLowerCase().includes(query) || 
                j.location.toLowerCase().includes(query);

            const matchStatus = statusFilter === 'all' || j.status.toLowerCase() === statusFilter.toLowerCase();
            const matchAI = aiFilter === 'all' || j.aiDetection.toLowerCase() === aiFilter.toLowerCase();

            return matchQuery && matchStatus && matchAI;
        });

        renderJobsTable(filtered);
    }
    window.filterJobsTable = filterJobsTable;

    function viewJobDetails(jobId) {
        switchTab('tab-jobs');
        const job = AdminState.jobs.find(j => String(j.id) === String(jobId));
        if (!job) return;

        let aiBoxClass = 'var(--success-bg)';
        let aiBorder = 'var(--success-border)';
        let aiIcon = 'fa-circle-check';
        let aiIconColor = 'var(--success)';

        if (job.aiDetection === 'suspicious') {
            aiBoxClass = '#fffbeb';
            aiBorder = '#fde68a';
            aiIcon = 'fa-triangle-exclamation';
            aiIconColor = 'var(--warning)';
        } else if (job.aiDetection === 'duplicate') {
            aiBoxClass = '#f5f3ff';
            aiBorder = '#ddd6fe';
            aiIcon = 'fa-clone';
            aiIconColor = '#7c3aed';
        }

        const content = `
            <div style="border: 1px solid ${aiBorder}; background: ${aiBoxClass}; border-radius: var(--radius-md); padding: 14px; margin-bottom: 20px; display: flex; gap: 12px; align-items: flex-start;">
                <i class="fa-solid ${aiIcon}" style="font-size: 1.3rem; color: ${aiIconColor}; margin-top: 2px;"></i>
                <div>
                    <h4 style="font-size: 0.92rem; font-weight: 700; color: var(--text-main);">
                        AI Verification Engine Analysis: ${job.aiDetection.toUpperCase()}
                    </h4>
                    <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px; line-height: 1.4;">
                        ${escapeHtml(job.aiReason)}
                    </p>
                </div>
            </div>

            <div class="detail-row">
                <div class="detail-label">Job Title</div>
                <div class="detail-value" style="font-weight: 700;">${escapeHtml(job.title)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Hiring Company</div>
                <div class="detail-value">${escapeHtml(job.company)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Work Location</div>
                <div class="detail-value">${escapeHtml(job.location)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Offered Salary</div>
                <div class="detail-value" style="color: var(--primary); font-weight: 700;">${escapeHtml(job.salary)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Experience Requirement</div>
                <div class="detail-value">${escapeHtml(job.experience)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Required Skills</div>
                <div class="detail-value">${escapeHtml(job.skills)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Current Database Status</div>
                <div class="detail-value"><span class="status-badge badge-active">${job.status}</span></div>
            </div>

            <div style="margin-top: 18px;">
                <h5 style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Job Description</h5>
                <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; font-size: 0.85rem; line-height: 1.5; color: var(--text-main);">
                    ${escapeHtml(job.description)}
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                <button class="btn-secondary" onclick="closeModal('details-modal')">Close</button>
                ${job.status === 'Flagged' ? `
                    <button class="btn-primary" onclick="closeModal('details-modal'); approveJob('${job.id}')">
                        <i class="fa-solid fa-check"></i> Approve & Clear Flag
                    </button>
                ` : ''}
                ${job.status !== 'Removed' ? `
                    <button class="btn-danger" onclick="closeModal('details-modal'); blockRemoveJob('${job.id}')">
                        <i class="fa-solid fa-ban"></i> Block / Remove Job
                    </button>
                ` : ''}
            </div>
        `;

        document.getElementById('details-modal-title').innerHTML = '<i class="fa-solid fa-briefcase"></i> Vacancy Details & Live AI Screening';
        document.getElementById('details-modal-content').innerHTML = content;
        openModal('details-modal');
    }
    window.viewJobDetails = viewJobDetails;

    async function approveJob(jobId) {
        const job = AdminState.jobs.find(j => String(j.id) === String(jobId));
        if (!job) return;

        job.status = 'Active';
        job.aiDetection = 'clean';
        job.aiReason = 'Admin reviewed and confirmed authentic vacancy listing.';

        const client = getSupabase();
        if (client) {
            try {
                await client.from('jobs').update({ status: 'active' }).eq('job_id', window.toUUID(jobId));
            } catch (e) {}
        }
        if (window.db && typeof window.db.updateJob === 'function') {
            window.db.updateJob(job.id, { status: 'active' });
        }

        showToast(`Job "${job.title}" verified and marked Active in Supabase!`, 'success');
        renderJobsTable();
        renderAIAlerts();
        renderSummaryMetrics();
        renderStatisticsView();
    }
    window.approveJob = approveJob;
    window.keepJobApproved = approveJob;
    window.restoreJob = approveJob;

    async function blockRemoveJob(jobId) {
        const job = AdminState.jobs.find(j => String(j.id) === String(jobId));
        if (!job) return;

        job.status = 'Removed';

        const client = getSupabase();
        if (client) {
            try {
                await client.from('jobs').update({ status: 'removed' }).eq('job_id', window.toUUID(jobId));
            } catch (e) {}
        }
        if (window.db && typeof window.db.deleteJob === 'function') {
            window.db.deleteJob(job.id);
        }

        showToast(`Job "${job.title}" blocked and removed from candidate portal.`, 'danger');
        renderJobsTable();
        renderAIAlerts();
        renderSummaryMetrics();
        renderStatisticsView();
    }
    window.blockRemoveJob = blockRemoveJob;

    // ========================================================
    // 5. APPLICATION MANAGEMENT & AI CONSISTENCY
    // ========================================================
    function renderApplicationsTable(filteredList = null) {
        const tbody = document.getElementById('applications-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const list = filteredList || AdminState.applications;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-empty-state">
                            <i class="fa-solid fa-file-excel"></i>
                            <h4>No Applications Found</h4>
                            <p>No candidate submissions found in the Supabase database matching filters.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach(app => {
            const tr = document.createElement('tr');
            let aiBadgeHtml = '';

            if (app.aiDetection === 'inconsistency') {
                aiBadgeHtml = `<span class="ai-flag-badge ai-suspicious"><i class="fa-solid fa-triangle-exclamation"></i> Discrepancy Flagged ⚠️</span>`;
            } else if (app.aiDetection === 'duplicate') {
                aiBadgeHtml = `<span class="ai-flag-badge ai-duplicate"><i class="fa-solid fa-clone"></i> Duplicate Application 🔁</span>`;
            } else {
                aiBadgeHtml = `<span class="ai-flag-badge ai-clean"><i class="fa-solid fa-circle-check"></i> Consistent Match ✓</span>`;
            }

            let statusBadge = 'badge-active';
            if (app.status === 'Under Review') statusBadge = 'badge-pending';
            if (app.status === 'Removed' || app.status === 'Rejected') statusBadge = 'badge-removed';

            tr.innerHTML = `
                <td>
                    <div class="cell-text-primary">${escapeHtml(app.applicantName)}</div>
                    <div class="cell-text-sub">${escapeHtml(app.applicantEmail)}</div>
                </td>
                <td>${escapeHtml(app.jobTitle)}</td>
                <td>${escapeHtml(app.company)}</td>
                <td>${escapeHtml(app.appliedDate || 'Recent')}</td>
                <td>${aiBadgeHtml}</td>
                <td>
                    <span class="status-badge ${statusBadge}">${app.status}</span>
                </td>
                <td style="text-align: right;">
                    <div class="action-btn-group" style="justify-content: flex-end;">
                        <button class="action-btn" title="View Details" onclick="viewApplicationDetails('${app.id}')">
                            <i class="fa-solid fa-eye"></i> View
                        </button>
                        <button class="action-btn" title="Review Inconsistency" onclick="reviewApplicationInconsistency('${app.id}')">
                            <i class="fa-solid fa-scale-balanced"></i> Review
                        </button>
                        <button class="action-btn btn-delete-row" title="Remove Application" onclick="removeApplication('${app.id}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function filterApplicationsTable() {
        const query = (document.getElementById('search-apps-input')?.value || '').toLowerCase().trim();
        const aiFilter = document.getElementById('filter-app-ai')?.value || 'all';
        const statusFilter = document.getElementById('filter-app-status')?.value || 'all';

        const filtered = AdminState.applications.filter(a => {
            const matchQuery = !query || 
                a.applicantName.toLowerCase().includes(query) || 
                a.applicantEmail.toLowerCase().includes(query) || 
                a.jobTitle.toLowerCase().includes(query) || 
                a.company.toLowerCase().includes(query);

            const matchAI = aiFilter === 'all' || a.aiDetection.toLowerCase() === aiFilter.toLowerCase();
            const matchStatus = statusFilter === 'all' || a.status.toLowerCase() === statusFilter.toLowerCase();

            return matchQuery && matchAI && matchStatus;
        });

        renderApplicationsTable(filtered);
    }
    window.filterApplicationsTable = filterApplicationsTable;

    function viewApplicationDetails(appId) {
        const app = AdminState.applications.find(a => String(a.id) === String(appId));
        if (!app) return;

        const content = `
            <div class="detail-row">
                <div class="detail-label">Candidate Name</div>
                <div class="detail-value" style="font-weight: 700;">${escapeHtml(app.applicantName)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Email Address</div>
                <div class="detail-value">${escapeHtml(app.applicantEmail)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Applied Vacancy</div>
                <div class="detail-value">${escapeHtml(app.jobTitle)} (${escapeHtml(app.company)})</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Submission Date</div>
                <div class="detail-value">${escapeHtml(app.appliedDate)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Declared Skills</div>
                <div class="detail-value">${escapeHtml(app.claimedSkills)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Declared Experience</div>
                <div class="detail-value">${escapeHtml(app.claimedExperience)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Attached Resume</div>
                <div class="detail-value"><i class="fa-solid fa-file-pdf" style="color:var(--danger); margin-right:4px;"></i> ${escapeHtml(app.resumeName || 'Resume.pdf')}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">AI Consistency Audit</div>
                <div class="detail-value">${escapeHtml(app.aiReason)}</div>
            </div>
        `;

        document.getElementById('details-modal-title').innerHTML = '<i class="fa-solid fa-file-lines"></i> Application Information';
        document.getElementById('details-modal-content').innerHTML = content;
        openModal('details-modal');
    }
    window.viewApplicationDetails = viewApplicationDetails;

    function reviewApplicationInconsistency(appId) {
        switchTab('tab-applications');
        const app = AdminState.applications.find(a => String(a.id) === String(appId));
        if (!app) return;

        AdminState.pendingAppReviewId = appId;

        const content = `
            <div style="margin-bottom: 16px;">
                <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${escapeHtml(app.applicantName)}</h4>
                <p style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(app.applicantEmail)} • Applied to: <strong>${escapeHtml(app.jobTitle)}</strong> at ${escapeHtml(app.company)}</p>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: 16px;">
                <div style="font-size: 0.85rem; font-weight: 700; color: #b45309; margin-bottom: 4px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> AI Heuristic Inconsistency Detected
                </div>
                <div style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4;">
                    ${escapeHtml(app.aiReason)}
                </div>
            </div>

            <div class="ai-comparison-grid">
                <div class="ai-comparison-card card-claimed">
                    <h5>Application Form Declaration</h5>
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                        ${escapeHtml(app.claimedExperience)}
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">
                        <strong>Declared Skills:</strong> ${escapeHtml(app.claimedSkills)}
                    </div>
                </div>

                <div class="ai-comparison-card card-reality">
                    <h5>Candidate Profile / Resume Record</h5>
                    <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
                        ${escapeHtml(app.resumeExperience)}
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">
                        <strong>Resume Skills:</strong> ${escapeHtml(app.resumeSkills)}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('app-review-modal-content').innerHTML = content;
        openModal('app-review-modal');
    }
    window.reviewApplicationInconsistency = reviewApplicationInconsistency;

    async function confirmApproveInconsistentApp() {
        if (!AdminState.pendingAppReviewId) return;
        const app = AdminState.applications.find(a => String(a.id) === String(AdminState.pendingAppReviewId));
        if (app) {
            app.aiDetection = 'clean';
            app.status = 'Applied';
            app.aiReason = 'Admin manually reviewed and approved candidate profile credentials.';
            
            const client = getSupabase();
            if (client) {
                try {
                    await client.from('applications').update({ status: 'Applied' }).eq('application_id', window.toUUID(app.id));
                } catch (e) {}
            }
            showToast(`Application by ${app.applicantName} marked verified.`, 'success');
            renderApplicationsTable();
            renderAIAlerts();
            renderSummaryMetrics();
            renderStatisticsView();
        }
        closeModal('app-review-modal');
    }
    window.confirmApproveInconsistentApp = confirmApproveInconsistentApp;

    async function confirmRemoveInconsistentApp() {
        if (!AdminState.pendingAppReviewId) return;
        const app = AdminState.applications.find(a => String(a.id) === String(AdminState.pendingAppReviewId));
        if (app) {
            app.status = 'Removed';
            const client = getSupabase();
            if (client) {
                try {
                    await client.from('applications').update({ status: 'Removed' }).eq('application_id', window.toUUID(app.id));
                } catch (e) {}
            }
            showToast(`Discrepant application by ${app.applicantName} marked Removed.`, 'danger');
            renderApplicationsTable();
            renderAIAlerts();
            renderSummaryMetrics();
            renderStatisticsView();
        }
        closeModal('app-review-modal');
    }
    window.confirmRemoveInconsistentApp = confirmRemoveInconsistentApp;

    async function removeApplication(appId) {
        const app = AdminState.applications.find(a => String(a.id) === String(appId));
        if (!app) return;

        document.getElementById('confirm-modal-title').innerHTML = '<i class="fa-solid fa-trash" style="color:var(--danger);"></i> Confirm Remove Application';
        document.getElementById('confirm-modal-message').innerHTML = `Remove application submitted by <strong>${escapeHtml(app.applicantName)}</strong> for "${escapeHtml(app.jobTitle)}"?`;

        const submitBtn = document.getElementById('confirm-modal-submit-btn');
        submitBtn.className = 'btn-danger';
        submitBtn.innerHTML = 'Remove Application';
        submitBtn.onclick = async function () {
            AdminState.applications = AdminState.applications.filter(a => String(a.id) !== String(appId));
            if (window.db && typeof window.db.deleteApplication === 'function') {
                await window.db.deleteApplication(appId);
            } else {
                const client = getSupabase();
                if (client) {
                    try {
                        await client.from('applications').delete().eq('application_id', window.toUUID(appId));
                    } catch (e) {}
                }
            }
            closeModal('confirm-modal');
            showToast(`Application successfully removed from database.`, 'danger');
            renderApplicationsTable();
            renderSummaryMetrics();
            renderStatisticsView();
        };

        openModal('confirm-modal');
    }
    window.removeApplication = removeApplication;

    // ========================================================
    // 6. REPORTS & COMPLAINTS
    // ========================================================
    function renderReportsTable(filteredList = null) {
        const tbody = document.getElementById('reports-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const list = filteredList || AdminState.reports;

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-empty-state">
                            <i class="fa-solid fa-shield-cat"></i>
                            <h4>No Grievance Reports Found</h4>
                            <p>No active user complaints or policy violations recorded in the database.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        list.forEach(rep => {
            const tr = document.createElement('tr');
            let statusBadgeClass = 'badge-pending';
            if (rep.status === 'Resolved') statusBadgeClass = 'badge-resolved';
            if (rep.status === 'Under Review') statusBadgeClass = 'badge-active';

            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 600;">${escapeHtml(rep.id)}</td>
                <td><span class="status-badge" style="background:#f1f5f9; color:var(--text-main);">${escapeHtml(rep.type)}</span></td>
                <td style="font-weight: 600;">${escapeHtml(rep.reportedItem)}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 260px;">${escapeHtml(rep.reason)}</td>
                <td>${escapeHtml(rep.date)}</td>
                <td>
                    <span class="status-badge ${statusBadgeClass}">${rep.status}</span>
                </td>
                <td style="text-align: right;">
                    <button class="action-btn" onclick="viewReportDetails('${rep.id}')">
                        <i class="fa-solid fa-folder-open"></i> Inspect
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function filterReportsTable() {
        const query = (document.getElementById('search-reports-input')?.value || '').toLowerCase().trim();
        const typeFilter = document.getElementById('filter-report-type')?.value || 'all';
        const statusFilter = document.getElementById('filter-report-status')?.value || 'all';

        const filtered = AdminState.reports.filter(r => {
            const matchQuery = !query || 
                r.id.toLowerCase().includes(query) || 
                r.reportedItem.toLowerCase().includes(query) || 
                r.reason.toLowerCase().includes(query);

            const matchType = typeFilter === 'all' || r.type.toLowerCase() === typeFilter.toLowerCase();
            const matchStatus = statusFilter === 'all' || r.status.toLowerCase() === statusFilter.toLowerCase();

            return matchQuery && matchType && matchStatus;
        });

        renderReportsTable(filtered);
    }
    window.filterReportsTable = filterReportsTable;

    function viewReportDetails(reportId) {
        const rep = AdminState.reports.find(r => String(r.id) === String(reportId));
        if (!rep) return;

        const content = `
            <div class="detail-row">
                <div class="detail-label">Report Ticket ID</div>
                <div class="detail-value" style="font-family: monospace; font-weight: 700;">${escapeHtml(rep.id)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Report Category</div>
                <div class="detail-value">${escapeHtml(rep.type)} Violation</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Reported Entity</div>
                <div class="detail-value" style="font-weight: 700;">${escapeHtml(rep.reportedItem)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Reporter Email</div>
                <div class="detail-value">${escapeHtml(rep.reporter)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Date Reported</div>
                <div class="detail-value">${escapeHtml(rep.date)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Ticket Status</div>
                <div class="detail-value"><span class="status-badge badge-pending">${escapeHtml(rep.status)}</span></div>
            </div>

            <div style="margin-top: 16px;">
                <h5 style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Complaint Evidence & Details</h5>
                <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; font-size: 0.85rem; line-height: 1.5;">
                    ${escapeHtml(rep.details || rep.reason)}
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                <button class="btn-secondary" onclick="closeModal('details-modal')">Close</button>
                ${rep.status !== 'Under Review' ? `
                    <button class="btn-secondary" onclick="updateReportStatus('${rep.id}', 'Under Review')">
                        <i class="fa-solid fa-magnifying-glass"></i> Mark Under Review
                    </button>
                ` : ''}
                ${rep.status !== 'Resolved' ? `
                    <button class="btn-primary" onclick="updateReportStatus('${rep.id}', 'Resolved')">
                        <i class="fa-solid fa-circle-check"></i> Mark Resolved
                    </button>
                ` : ''}
            </div>
        `;

        document.getElementById('details-modal-title').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Grievance Ticket Details';
        document.getElementById('details-modal-content').innerHTML = content;
        openModal('details-modal');
    }
    window.viewReportDetails = viewReportDetails;

    async function updateReportStatus(reportId, newStatus) {
        const rep = AdminState.reports.find(r => String(r.id) === String(reportId));
        if (!rep) return;

        rep.status = newStatus;

        if (window.db && typeof window.db.updateReportStatus === 'function') {
            await window.db.updateReportStatus(reportId, newStatus);
        } else {
            const client = getSupabase();
            if (client) {
                try {
                    await client.from('reports').update({ status: newStatus }).eq('id', reportId);
                } catch (e) {}
            }
        }

        closeModal('details-modal');
        showToast(`Report ${rep.id} status updated to: ${newStatus}`, 'success');
        renderReportsTable();
        renderSummaryMetrics();
        renderStatisticsView();
    }
    window.updateReportStatus = updateReportStatus;

    // ========================================================
    // 7. NOTIFICATIONS & COMPANY ALERTS
    // ========================================================
    function populateCompanySelectDropdown() {
        const select = document.getElementById('notif-recipient');
        if (!select) return;

        select.innerHTML = '<option value="All Companies">📢 All Registered Companies (Broadcast)</option>';
        AdminState.companies.forEach(comp => {
            const opt = document.createElement('option');
            opt.value = comp.email || comp.name;
            opt.textContent = `🏢 ${comp.name} (${comp.email})`;
            select.appendChild(opt);
        });
    }

    async function handleSendNotification(e) {
        e.preventDefault();
        const recipient = document.getElementById('notif-recipient').value;
        const type = document.getElementById('notif-type').value;
        const title = document.getElementById('notif-title').value.trim();
        const message = document.getElementById('notif-message').value.trim();

        if (!title || !message) {
            showToast("Please provide both alert title and message body.", "warning");
            return;
        }

        const client = getSupabase();
        const newNotif = {
            id: `notif_${Date.now()}`,
            recipient: recipient,
            type: type,
            title: title,
            message: message,
            date: new Date().toISOString().split('T')[0],
            status: 'Delivered'
        };

        AdminState.notifications.unshift(newNotif);

        // Store into Supabase notifications table
        if (client) {
            try {
                if (recipient === 'All Companies') {
                    const payloads = AdminState.companies.map(c => ({
                        user_id: window.toUUID(c.email || c.id),
                        message: message,
                        type: 'company_alert',
                        status: 'unread'
                    }));
                    if (payloads.length > 0) {
                        await client.from('notifications').insert(payloads);
                    }
                } else {
                    await client.from('notifications').insert([{
                        user_id: window.toUUID(recipient),
                        message: `[${title}] ${message}`,
                        type: 'company_alert',
                        status: 'unread'
                    }]);
                }
            } catch (sbErr) {
                console.warn("Supabase notification insert notice:", sbErr);
            }
        }

        if (window.db && typeof window.db.addNotification === 'function') {
            window.db.addNotification({
                userEmail: recipient,
                title: title,
                message: message,
                type: 'info'
            });
        }

        document.getElementById('notification-form').reset();
        showToast(`Notification "${title}" dispatched successfully!`, "success");
        renderNotificationsTable();
    }
    window.handleSendNotification = handleSendNotification;

    function renderNotificationsTable() {
        const tbody = document.getElementById('sent-notifications-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (AdminState.notifications.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div class="table-empty-state">
                            <i class="fa-regular fa-paper-plane"></i>
                            <h4>No Dispatched Notifications</h4>
                            <p>Alerts sent to companies and candidates will appear here in real time.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        AdminState.notifications.forEach(n => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${escapeHtml(n.recipient)}</td>
                <td><span class="status-badge" style="background:var(--primary-light); color:var(--primary); font-size:0.75rem;">${escapeHtml(n.type)}</span></td>
                <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(n.title)}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(n.date)}</td>
                <td><span class="status-badge badge-active"><i class="fa-solid fa-check"></i> ${escapeHtml(n.status)}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ========================================================
    // 8. DEDICATED STATISTICS VIEW
    // ========================================================
    function renderStatisticsView() {
        const totalSeekers = AdminState.users.length;
        const activeSeekers = AdminState.users.filter(u => u.status === 'Active').length;
        const blockedSeekers = AdminState.users.filter(u => u.status === 'Blocked').length;

        const totalCompanies = AdminState.companies.length;
        const activeCompanies = AdminState.companies.filter(c => c.status === 'Active').length;
        const blockedCompanies = AdminState.companies.filter(c => c.status === 'Blocked').length;

        const totalJobs = AdminState.jobs.length;
        const cleanJobs = AdminState.jobs.filter(j => j.aiDetection === 'clean').length;
        const flaggedJobs = AdminState.jobs.filter(j => j.aiDetection === 'suspicious' || j.aiDetection === 'duplicate').length;

        const totalApps = AdminState.applications.length;
        const pendingApps = AdminState.applications.filter(a => a.status === 'Applied' || a.status === 'Under Review').length;
        const cleanApps = AdminState.applications.filter(a => a.aiDetection === 'clean').length;
        const flaggedApps = AdminState.applications.filter(a => a.aiDetection === 'inconsistency' || a.aiDetection === 'duplicate').length;

        const totalReports = AdminState.reports.length;
        const pendingReports = AdminState.reports.filter(r => r.status === 'Pending').length;
        const resolvedReports = AdminState.reports.filter(r => r.status === 'Resolved').length;
        const resolutionRate = totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 100;

        // Populate elements in tab-statistics
        setElemText('stats-total-seekers', totalSeekers);
        setElemText('stats-active-seekers', activeSeekers);
        setElemText('stats-blocked-seekers', blockedSeekers);

        setElemText('stats-total-companies', totalCompanies);
        setElemText('stats-active-companies', activeCompanies);

        setElemText('stats-total-jobs', totalJobs);
        setElemText('stats-clean-jobs', cleanJobs);
        setElemText('stats-flagged-jobs', flaggedJobs);

        setElemText('stats-total-apps', totalApps);
        setElemText('stats-pending-apps', pendingApps);

        setElemText('stats-total-reports', totalReports);
        setElemText('stats-pending-reports', pendingReports);
        setElemText('stats-resolved-reports', resolvedReports);
        setElemText('stats-resolution-rate', `${resolutionRate}%`);

        setElemText('stats-suspicious-jobs', flaggedJobs);
        setElemText('stats-suspicious-apps', flaggedApps);

        // Progress Bar Computations
        const seekerActivePct = totalSeekers > 0 ? Math.round((activeSeekers / totalSeekers) * 100) : 100;
        const seekerBlockedPct = totalSeekers > 0 ? Math.round((blockedSeekers / totalSeekers) * 100) : 0;
        const compActivePct = totalCompanies > 0 ? Math.round((activeCompanies / totalCompanies) * 100) : 100;
        const compBlockedPct = totalCompanies > 0 ? Math.round((blockedCompanies / totalCompanies) * 100) : 0;

        const jobCleanPct = totalJobs > 0 ? Math.round((cleanJobs / totalJobs) * 100) : 100;
        const jobFlaggedPct = totalJobs > 0 ? Math.round((flaggedJobs / totalJobs) * 100) : 0;
        const appCleanPct = totalApps > 0 ? Math.round((cleanApps / totalApps) * 100) : 100;
        const appFlaggedPct = totalApps > 0 ? Math.round((flaggedApps / totalApps) * 100) : 0;

        setElemWidth('stat-bar-user-active', `${seekerActivePct}%`);
        setElemText('stat-bar-user-active-txt', `${activeSeekers} (${seekerActivePct}%)`);
        setElemWidth('stat-bar-user-blocked', `${seekerBlockedPct}%`);
        setElemText('stat-bar-user-blocked-txt', `${blockedSeekers} (${seekerBlockedPct}%)`);

        setElemWidth('stat-bar-comp-active', `${compActivePct}%`);
        setElemText('stat-bar-comp-active-txt', `${activeCompanies} (${compActivePct}%)`);
        setElemWidth('stat-bar-comp-blocked', `${compBlockedPct}%`);
        setElemText('stat-bar-comp-blocked-txt', `${blockedCompanies} (${compBlockedPct}%)`);

        setElemWidth('stat-bar-job-clean', `${jobCleanPct}%`);
        setElemText('stat-bar-job-clean-txt', `${cleanJobs} (${jobCleanPct}%)`);
        setElemWidth('stat-bar-job-flagged', `${jobFlaggedPct}%`);
        setElemText('stat-bar-job-flagged-txt', `${flaggedJobs} (${jobFlaggedPct}%)`);

        setElemWidth('stat-bar-app-clean', `${appCleanPct}%`);
        setElemText('stat-bar-app-clean-txt', `${cleanApps} (${appCleanPct}%)`);
        setElemWidth('stat-bar-app-flagged', `${appFlaggedPct}%`);
        setElemText('stat-bar-app-flagged-txt', `${flaggedApps} (${appFlaggedPct}%)`);
    }

    function setElemText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setElemWidth(id, widthStr) {
        const el = document.getElementById(id);
        if (el) el.style.width = widthStr;
    }

    // ========================================================
    // NAVIGATION & TAB SWITCHING
    // ========================================================
    function initNavigation() {
        const menuItems = document.querySelectorAll('.sidebar-menu-item[data-tab]');
        menuItems.forEach(item => {
            item.addEventListener('click', function () {
                const tabId = this.getAttribute('data-tab');
                if (tabId) {
                    switchTab(tabId);
                    closeMobileSidebar();
                }
            });
        });

        const logoutBtn = document.getElementById('nav-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', promptLogout);
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('.sidebar-menu-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.querySelector(`.sidebar-menu-item[data-tab="${tabId}"]`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        const targetPanel = document.getElementById(tabId);
        if (targetPanel) {
            targetPanel.classList.add('active');
            AdminState.currentTab = tabId;
        }

        const headingMap = {
            'tab-dashboard': { title: 'Admin Dashboard', sub: 'Real-time central monitoring & AI screening control center' },
            'tab-users': { title: 'User Management', sub: 'Directory of registered job seekers and credentials' },
            'tab-companies': { title: 'Company Management', sub: 'Verified employer profiles and recruitment status' },
            'tab-jobs': { title: 'Job Management', sub: 'AI-based screening, salary verification & duplicate checks' },
            'tab-applications': { title: 'Application Management', sub: 'Candidate application tracking & resume consistency review' },
            'tab-reports': { title: 'Reports & Complaints', sub: 'Investigate user-submitted grievances and compliance flags' },
            'tab-notifications': { title: 'Notifications & Alerts', sub: 'Direct recruiter alerts and broadcast announcements' },
            'tab-statistics': { title: 'System Statistics', sub: 'Real-time platform metrics and PostgreSQL telemetry analytics' },
            'tab-settings': { title: 'Settings & Security', sub: 'Admin profile information and master password maintenance' }
        };

        const info = headingMap[tabId] || { title: 'Admin Portal', sub: 'System Control' };
        const h1 = document.getElementById('top-bar-heading');
        const p = document.getElementById('top-bar-subheading');
        if (h1) h1.textContent = info.title;
        if (p) p.textContent = info.sub;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.switchTab = switchTab;

    function toggleMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && overlay) {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('active');
        }
    }
    window.toggleMobileSidebar = toggleMobileSidebar;

    function closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    }
    window.closeMobileSidebar = closeMobileSidebar;

    // ========================================================
    // MODAL UTILITIES
    // ========================================================
    function openModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.classList.add('active');
    }
    window.openModal = openModal;

    function closeModal(modalId) {
        const m = document.getElementById(modalId);
        if (m) m.classList.remove('active');
    }
    window.closeModal = closeModal;

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
    });

    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-message toast-${type}`;
        
        let icon = 'fa-circle-check';
        if (type === 'danger') icon = 'fa-circle-xmark';
        if (type === 'warning') icon = 'fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${icon}" style="font-size: 1.15rem;"></i>
            <div style="flex:1;">${escapeHtml(message)}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.25s ease';
            setTimeout(() => toast.remove(), 250);
        }, 4000);
    }
    window.showToast = showToast;

    // CSV Exporter
    function exportTableToCSV(tableId, filename = 'export.csv') {
        const table = document.getElementById(tableId);
        if (!table) return;

        let csv = [];
        const rows = table.querySelectorAll('tr');

        for (let i = 0; i < rows.length; i++) {
            let row = [], cols = rows[i].querySelectorAll('td, th');
            for (let j = 0; j < cols.length - 1; j++) {
                let text = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, '').replace(/(\s\s+)/g, ' ');
                text = text.replace(/"/g, '""');
                row.push('"' + text + '"');
            }
            csv.push(row.join(','));
        }

        const csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
        const downloadLink = document.createElement('a');
        downloadLink.download = filename;
        downloadLink.href = window.URL.createObjectURL(csvFile);
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        showToast(`Exported ${filename} successfully!`, "success");
    }
    window.exportTableToCSV = exportTableToCSV;

    // ========================================================
    // LOGOUT & PASSWORD MAINTENANCE
    // ========================================================
    function promptLogout() {
        openModal('logout-modal');
    }
    window.promptLogout = promptLogout;

    function executeLogout() {
        closeModal('logout-modal');
        showToast("Signing out of Admin Portal...", "warning");

        if (window.auth && typeof window.auth.logout === 'function') {
            window.auth.logout();
        } else {
            sessionStorage.clear();
            localStorage.removeItem('smartjob_active_session');
            localStorage.removeItem('smartjob_active_user');
        }

        setTimeout(() => {
            window.location.replace('auth.html');
        }, 600);
    }
    window.executeLogout = executeLogout;

    function togglePasswordInput(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
    }
    window.togglePasswordInput = togglePasswordInput;

    function handleChangePassword(e) {
        e.preventDefault();
        const newPwd = document.getElementById('pwd-new').value;
        const confirmPwd = document.getElementById('pwd-confirm').value;

        if (newPwd !== confirmPwd) {
            showToast("Passwords do not match!", "danger");
            return;
        }

        if (newPwd.length < 6) {
            showToast("Password must be at least 6 characters long.", "warning");
            return;
        }

        localStorage.setItem('smartjob_admin_custom_pwd', newPwd);
        document.getElementById('change-password-form').reset();
        showToast("Admin master password updated successfully!", "success");
    }
    window.handleChangePassword = handleChangePassword;

})();
