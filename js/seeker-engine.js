/**
 * ==============================================================================
 * Smart Job Vacancy Finder - Real-Time Seeker Engine
 * Pure Supabase CDC (Change Data Capture) Subscriptions & Real-Time Orchestration
 * Zero Hardcoded / Static Data Guarantee
 * ==============================================================================
 */

(function () {
    'use strict';

    class SeekerEngine {
        constructor() {
            this.client = null;
            this.activeChannel = null;
            this.user = null;
            this.userEmail = '';
            this.userId = '';
            this.isInitialized = false;
        }

        /**
         * Initialize the Seeker Engine and all Realtime subscriptions
         */
        async init() {
            if (this.isInitialized) return;

            // 1. Identify authenticated seeker
            this.user = window.auth?.getCurrentUser();
            if (!this.user) {
                console.log("ℹ️ SeekerEngine: Waiting for authenticated candidate session...");
                return;
            }

            this.userEmail = (this.user.email || '').trim().toLowerCase();
            this.userId = this.user.id || (window.toUUID ? window.toUUID(this.userEmail) : '');

            // 2. Obtain Supabase Client
            this.client = window.db?.getSupabase ? window.db.getSupabase() : null;
            if (!this.client && window.supabase && typeof window.supabase.createClient === 'function' && window.SUPABASE_CONFIG) {
                this.client = window.supabase.createClient(
                    window.SUPABASE_CONFIG.SUPABASE_URL,
                    window.SUPABASE_CONFIG.SUPABASE_ANON_KEY
                );
            }

            // 3. Update Navbar Connection Indicator
            this.renderConnectionBadge(this.client ? 'connected' : 'offline');

            // 4. Initial Cloud Hydration (Direct from Supabase)
            await this.hydrateCloudState();

            // 5. Establish Real-Time Subscriptions if Supabase is connected
            if (this.client) {
                this.setupRealtimeSubscriptions();
            }

            this.isInitialized = true;
            console.log("🚀 [SeekerEngine] Fully initialized with Supabase Realtime for candidate:", this.userEmail);
        }

        /**
         * Render live connection badge in the seeker navbar
         */
        renderConnectionBadge(status = 'connected') {
            const container = document.getElementById('seeker-realtime-badge');
            if (!container) {
                // Dynamically insert into navbar if not present
                const navActions = document.querySelector('.portal-navbar .nav-actions');
                if (navActions) {
                    const badge = document.createElement('div');
                    badge.id = 'seeker-realtime-badge';
                    navActions.insertBefore(badge, navActions.firstChild);
                    return this.renderConnectionBadge(status);
                }
                return;
            }

            if (status === 'connected') {
                container.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); border-radius: 20px; font-size: 0.76rem; font-weight: 700; color: #059669;';
                container.innerHTML = `
                    <span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></span>
                    <span>Supabase Realtime: Active</span>
                `;
            } else {
                container.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); border-radius: 20px; font-size: 0.76rem; font-weight: 700; color: #d97706;';
                container.innerHTML = `
                    <span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span>
                    <span>Local Cache Mode</span>
                `;
            }
        }

        /**
         * Hydrate candidate profile, jobs, applications, and saved jobs from Supabase
         */
        async hydrateCloudState() {
            try {
                if (!window.db) return;

                // A. Sync Candidate Profile
                if (typeof window.db.fetchSeekerProfileFromSupabase === 'function' && this.userEmail) {
                    await window.db.fetchSeekerProfileFromSupabase(this.userEmail);
                }

                // B. Sync Live Vacancies
                if (typeof window.db.fetchJobsFromSupabase === 'function') {
                    await window.db.fetchJobsFromSupabase();
                }

                // C. Sync Candidate Applications
                if (typeof window.db.fetchApplicationsFromSupabase === 'function') {
                    await window.db.fetchApplicationsFromSupabase();
                }

                // D. Sync Saved Jobs
                if (typeof window.db.syncSavedJobsFromSupabase === 'function' && this.userEmail) {
                    await window.db.syncSavedJobsFromSupabase(this.userEmail);
                }

                // E. Sync Notifications
                if (typeof window.db.fetchNotificationsFromSupabase === 'function') {
                    await window.db.fetchNotificationsFromSupabase();
                }

                // Refresh UI views
                this.refreshAllViews();
            } catch (err) {
                console.warn("⚠️ [SeekerEngine] Hydration notice:", err);
            }
        }

        /**
         * Setup real-time CDC subscriptions
         */
        setupRealtimeSubscriptions() {
            if (!this.client) return;

            const channelName = `seeker-realtime-${this.userId || 'guest'}-${Date.now()}`;
            this.activeChannel = this.client.channel(channelName);

            // 1. APPLICATIONS TABLE: Real-Time Lifecycle Tracking
            this.activeChannel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'applications' },
                async (payload) => {
                    console.log("⚡ [Realtime Applications Event]:", payload.eventType, payload.new || payload.old);
                    const app = payload.new || payload.old;
                    if (!app) return;

                    const appEmail = (app.email || '').trim().toLowerCase();
                    const appSeekerId = String(app.seeker_id || '').trim().toLowerCase();
                    const targetEmail = this.userEmail.toLowerCase();
                    const targetId = String(this.userId).toLowerCase();

                    // Filter only applications belonging to this candidate
                    const isCandidateApp = appEmail === targetEmail || (appSeekerId && (appSeekerId === targetId || appSeekerId === (window.toUUID ? window.toUUID(targetEmail).toLowerCase() : '')));
                    if (!isCandidateApp) return;

                    // Refresh applications cache from Supabase
                    if (window.db?.fetchApplicationsFromSupabase) {
                        await window.db.fetchApplicationsFromSupabase();
                    }

                    // Handle status transition alerts
                    if (payload.eventType === 'UPDATE' && payload.new) {
                        const newStatus = payload.new.status;
                        const jobTitle = payload.new.job_title || 'Application';
                        const company = payload.new.company || 'Employer';

                        this.handleApplicationStatusAlert(newStatus, jobTitle, company, payload.new.application_id);
                    }

                    // Re-render UI
                    this.refreshApplicationViews();
                }
            );

            // 2. JOBS TABLE: Real-Time Vacancy Additions & Updates
            this.activeChannel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'jobs' },
                async (payload) => {
                    console.log("⚡ [Realtime Jobs Event]:", payload.eventType, payload.new?.title || payload.old?.title);

                    if (window.db?.fetchJobsFromSupabase) {
                        await window.db.fetchJobsFromSupabase();
                    }

                    if (payload.eventType === 'INSERT' && payload.new) {
                        const title = payload.new.title || 'New Vacancy';
                        const company = payload.new.company_name || 'Verified Recruiter';
                        this.showNotificationToast(`💼 New Vacancy Posted: "${title}" at ${company}!`, 'info');
                    }

                    this.refreshJobViews();
                }
            );

            // 3. SAVED JOBS TABLE: Real-Time Bookmark Sync
            this.activeChannel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'saved_jobs' },
                async (payload) => {
                    if (window.db?.syncSavedJobsFromSupabase) {
                        await window.db.syncSavedJobsFromSupabase(this.userEmail);
                    }
                    if (typeof window.updateSavedJobsCount === 'function') {
                        window.updateSavedJobsCount();
                    }
                    if (typeof window.renderSavedJobs === 'function') {
                        window.renderSavedJobs();
                    }
                }
            );

            // 4. NOTIFICATIONS TABLE: Real-Time Alerts
            this.activeChannel.on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    const notif = payload.new;
                    if (!notif) return;
                    const notifTarget = (notif.user_id || '').toLowerCase();
                    const notifEmail = (notif.message || '').toLowerCase();

                    if (notifTarget === this.userId.toLowerCase() || notifEmail.includes(this.userEmail)) {
                        this.showNotificationToast(`🔔 ${notif.message}`, 'info');
                        if (typeof window.renderSeekerNotifications === 'function') {
                            window.renderSeekerNotifications();
                        }
                    }
                }
            );

            // 5. ACCOUNT SECURITY: Real-Time Administrator Block Watcher
            this.activeChannel.on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${this.userId}` },
                (payload) => {
                    if (payload?.new?.status === 'blocked') {
                        this.handleAccountBlocked();
                    }
                }
            );
            this.activeChannel.on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'users', filter: `user_id=eq.${this.userId}` },
                (payload) => {
                    if (payload?.new?.status === 'blocked') {
                        this.handleAccountBlocked();
                    }
                }
            );

            // Subscribe channel
            this.activeChannel.subscribe((status) => {
                console.log(`📡 [SeekerEngine Channel Status]: ${status}`);
                if (status === 'SUBSCRIBED') {
                    this.renderConnectionBadge('connected');
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    this.renderConnectionBadge('offline');
                }
            });
        }

        /**
         * Handle Real-Time Application Status Change Notifications
         */
        handleApplicationStatusAlert(status, jobTitle, company, appId) {
            let message = '';
            let type = 'info';

            if (status === 'Shortlisted') {
                message = `🌟 Fantastic news! You have been SHORTLISTED for "${jobTitle}" at ${company}!`;
                type = 'success';
            } else if (status === 'Interview Scheduled') {
                message = `📅 Interview Scheduled! An official interview invitation has been generated for "${jobTitle}" at ${company}.`;
                type = 'success';
            } else if (status === 'Offer Sent') {
                message = `🎉 Congratulations! You received an official JOB OFFER for "${jobTitle}" from ${company}!`;
                type = 'success';
            } else if (status === 'Under Review') {
                message = `ℹ️ Your application for "${jobTitle}" is currently Under Review by the hiring team.`;
                type = 'info';
            } else if (status === 'Rejected') {
                message = `Notice: Status updated for your application to "${jobTitle}" at ${company}.`;
                type = 'info';
            } else {
                message = `Application status for "${jobTitle}" updated to "${status}".`;
                type = 'info';
            }

            this.showNotificationToast(message, type);
        }

        /**
         * Handle Administrator Blocking
         */
        handleAccountBlocked() {
            console.warn("🚨 [ACCESS TERMINATED] Account blocked by administrator.");
            if (window.auth && typeof window.auth.logout === 'function') {
                window.auth.logout();
            } else {
                sessionStorage.clear();
                localStorage.removeItem('smartjob_active_session');
                localStorage.removeItem('smartjob_active_user');
            }
            alert("Your account has been blocked by the administrator. Please contact support.");
            window.location.replace("auth.html");
        }

        /**
         * Refresh all seeker dashboard views
         */
        refreshAllViews() {
            this.refreshApplicationViews();
            this.refreshJobViews();
            if (typeof window.updateSavedJobsCount === 'function') window.updateSavedJobsCount();
            if (typeof window.renderSeekerNotifications === 'function') window.renderSeekerNotifications();
        }

        /**
         * Refresh Application History Kanban & KPI counters
         */
        refreshApplicationViews() {
            if (typeof window.renderApplicationHistory === 'function') {
                window.renderApplicationHistory();
            }

            // Update Overview KPIs
            if (window.db && this.userEmail) {
                const myApps = window.db.getApplicationsForCandidate ? window.db.getApplicationsForCandidate(this.userEmail) : [];
                const selected = myApps.filter(a => a.status === 'Shortlisted' || a.status === 'Hired' || a.status === 'Offer Sent' || a.status === 'Offer Accepted').length;
                const active = myApps.filter(a => !a.status || a.status === 'Applied' || a.status === 'Under Review').length;

                const elApplied = document.getElementById('kpi-applied-jobs');
                const elSelected = document.getElementById('kpi-selected-jobs');
                const elActive = document.getElementById('kpi-active-apps');

                if (elApplied) elApplied.textContent = myApps.length;
                if (elSelected) elSelected.textContent = selected;
                if (elActive) elActive.textContent = active;
            }
        }

        /**
         * Refresh Job Boards & AI Recommendations
         */
        refreshJobViews() {
            if (typeof window.renderLiveJobsBoard === 'function') {
                window.renderLiveJobsBoard();
            }
            if (typeof window.renderAiRecommendedBoard === 'function') {
                window.renderAiRecommendedBoard();
            }
            if (window.db) {
                const activeJobs = window.db.getActiveJobs ? window.db.getActiveJobs() : (window.db.getJobs() || []);
                const kpiJobs = document.getElementById('kpi-available-jobs');
                if (kpiJobs) kpiJobs.textContent = activeJobs.length;
                if (typeof window.renderRecommendations === 'function') {
                    window.renderRecommendations(activeJobs);
                }
            }
        }

        /**
         * Present visual notification toast
         */
        showNotificationToast(message, type = 'info') {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type);
                return;
            }

            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-info';
            toast.innerHTML = `<i class="${icon}" style="color: ${type === 'success' ? '#10b981' : '#38bdf8'};"></i> <span>${message}</span>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(20px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        /**
         * Clean up channels
         */
        destroy() {
            if (this.activeChannel && this.client) {
                this.client.removeChannel(this.activeChannel);
                this.activeChannel = null;
            }
            this.isInitialized = false;
        }
    }

    // Expose singleton on window
    window.seekerEngine = new SeekerEngine();

})();
