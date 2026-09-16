/**
 * SMART HIRE AI - REAL-TIME HOME PAGE CONTROLLER & AI MATCHING ENGINE
 * 100% Dynamic Database Connection - Zero Fake / Hardcoded Data
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------- UTILITIES ----------------
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        let iconClass = type === 'success' ? 'fa-solid fa-circle-check' : (type === 'error' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info');

        toast.innerHTML = `
            <i class="${iconClass} toast-icon"></i>
            <span class="toast-msg">${escapeHtml(message)}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ---------------- AUTH SESSION & NAVBAR ----------------
    const currentUser = window.auth?.getCurrentUser();
    if (currentUser) {
        const navAuthSection = document.getElementById('nav-auth-section');
        if (navAuthSection) {
            const roleUrl = window.auth.getRoleRedirectUrl(currentUser.role);
            const userShortName = (currentUser.fullName || currentUser.email || 'User').split(' ')[0];
            navAuthSection.innerHTML = `
                <a href="${roleUrl}" class="btn-primary" style="padding: 8px 18px; font-size: 0.86rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-gauge"></i> Dashboard (${escapeHtml(userShortName)})
                </a>
                <button type="button" class="btn-outline" id="btn-home-logout" style="padding: 7px 14px; font-size: 0.82rem; margin-left: 8px; border-color: rgba(239,68,68,0.4); color: #f87171;">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i>
                </button>
            `;
            document.getElementById('btn-home-logout')?.addEventListener('click', () => {
                window.auth?.logout();
            });
        }
    }

    // ---------------- REAL-TIME JOBS RETRIEVAL ----------------
    function getHomeJobs() {
        if (window.db && typeof window.db.getActiveJobs === 'function') {
            const dbJobs = window.db.getActiveJobs();
            if (dbJobs && Array.isArray(dbJobs)) {
                return dbJobs.map(j => ({
                    id: j.id || j.job_id,
                    title: j.title || 'Untitled Vacancy',
                    company: j.company || j.company_name || 'Verified Employer',
                    location: j.location || 'Flexible / Remote',
                    type: j.workMode || j.type || 'Full-time',
                    experience: j.experience || 'Fresher / Experienced',
                    salaryMonthly: j.salary || 'Competitive',
                    salaryNumeric: parseInt(String(j.salary).replace(/[^0-9]/g, ''), 10) || 0,
                    category: j.category || 'Software Development',
                    iconClass: j.iconClass || 'fa-solid fa-briefcase',
                    skills: Array.isArray(j.skills) ? j.skills : (j.skills ? String(j.skills).split(',').map(s => s.trim()) : []),
                    description: j.description || 'Job opening published by verified employer.',
                    requirements: Array.isArray(j.requirements) && j.requirements.length > 0 ? j.requirements : ['Bachelor Degree / Diploma in relevant discipline', 'Good communication & technical problem solving'],
                    createdAt: j.createdAt || j.created_at || null
                }));
            }
        }
        return [];
    }

    let JOBS_DATA = getHomeJobs();

    // ---------------- RENDER REAL-TIME JOBS ----------------
    const jobsContainer = document.getElementById('jobs-container');

    function renderJobs(jobsList) {
        if (!jobsContainer) return;
        jobsContainer.innerHTML = '';

        if (!jobsList || jobsList.length === 0) {
            jobsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(18,26,44,0.5); border-radius: 16px; border: 1px dashed var(--border-glass);">
                    <i class="fa-regular fa-folder-open" style="font-size: 2.6rem; color: var(--text-dim); margin-bottom: 14px; display: block;"></i>
                    <h3 style="font-size: 1.2rem; color: #fff; margin-bottom: 6px;">No job vacancies available right now.</h3>
                    <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px;">
                        ${JOBS_DATA.length === 0 ? 'Be the first company to post an open vacancy or check back soon.' : 'No vacancies match your current search filters. Try adjusting your keywords.'}
                    </p>
                    ${JOBS_DATA.length > 0 ? '<button class="btn-primary" id="btn-reset-filters" style="padding: 8px 20px; font-size: 0.84rem;">Reset All Filters</button>' : ''}
                </div>
            `;
            const resetBtn = document.getElementById('btn-reset-filters');
            if (resetBtn) resetBtn.addEventListener('click', () => {
                JOBS_DATA = getHomeJobs();
                renderJobs(JOBS_DATA);
            });
            return;
        }

        const user = window.auth?.getCurrentUser();
        const seekerProfile = (user && user.role === 'seeker' && window.db?.getSeekerProfile) 
            ? window.db.getSeekerProfile(user.email) 
            : null;

        jobsList.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-post-card glass-panel';

            // Real AI Match Score calculation (ONLY if user is logged in as Job Seeker with profile skills)
            let matchScoreBadge = '';
            if (seekerProfile && window.db?.calculateJobMatch) {
                const calculatedMatch = window.db.calculateJobMatch(job, seekerProfile);
                if (calculatedMatch !== null) {
                    matchScoreBadge = `
                        <div class="match-percentage-badge">
                            <i class="fa-solid fa-bolt"></i> ${calculatedMatch}% AI Match
                        </div>
                    `;
                } else {
                    matchScoreBadge = `
                        <div class="match-percentage-badge" style="background: rgba(56,189,248,0.12); color: #38bdf8; border-color: rgba(56,189,248,0.3);">
                            <i class="fa-solid fa-shield-halved"></i> Verified Post
                        </div>
                    `;
                }
            } else {
                matchScoreBadge = `
                    <div class="match-percentage-badge" style="background: rgba(56,189,248,0.12); color: #38bdf8; border-color: rgba(56,189,248,0.3);">
                        <i class="fa-solid fa-shield-halved"></i> Verified Post
                    </div>
                `;
            }

            const postedDate = job.createdAt 
                ? new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Active Opening';

            const skillsBadges = job.skills.length > 0 
                ? job.skills.slice(0, 5).map(s => `<span class="tag">${escapeHtml(s)}</span>`).join('')
                : '<span class="tag">General Skills</span>';

            card.innerHTML = `
                <div>
                    <div class="job-header-row">
                        <div class="job-co-badge">
                            <i class="${job.iconClass}"></i>
                        </div>
                        ${matchScoreBadge}
                    </div>
                    
                    <h3 class="job-post-title">${escapeHtml(job.title)}</h3>
                    <div class="job-co-name">
                        <i class="fa-regular fa-building"></i> ${escapeHtml(job.company)}
                    </div>

                    <div class="job-meta-row">
                        <div class="job-meta-item">
                            <i class="fa-solid fa-location-dot"></i> ${escapeHtml(job.location)}
                        </div>
                        <div class="job-meta-item">
                            <i class="fa-solid fa-user-graduate"></i>
                            <span class="${job.experience === 'Fresher' ? 'exp-badge-green' : ''}">${escapeHtml(job.experience)}</span>
                        </div>
                    </div>

                    <div class="job-skills-tags">
                        ${skillsBadges}
                    </div>

                    <div style="font-size: 0.76rem; color: var(--text-dim); margin-top: 10px;">
                        <i class="fa-regular fa-calendar-check"></i> Posted: ${postedDate}
                    </div>
                </div>

                <div class="job-card-actions-row">
                    <div class="job-salary-monthly">
                        💰 ${escapeHtml(job.salaryMonthly)}
                    </div>
                    <button class="btn-view-job" data-id="${job.id}">
                        View Job
                    </button>
                </div>
            `;
            jobsContainer.appendChild(card);
        });

        // Attach event listeners to "View Job" buttons
        document.querySelectorAll('.btn-view-job').forEach(btn => {
            btn.addEventListener('click', () => {
                const jobId = btn.getAttribute('data-id');
                openJobModal(jobId);
            });
        });
    }

    renderJobs(JOBS_DATA);

    // ---------------- REAL-TIME PLATFORM STATISTICS ----------------
    async function updateStatistics() {
        if (!window.db || typeof window.db.getPlatformStatistics !== 'function') return;
        try {
            const stats = await window.db.getPlatformStatistics();
            const elJobs = document.getElementById('stat-active-jobs');
            const elSeekers = document.getElementById('stat-job-seekers');
            const elComps = document.getElementById('stat-companies');
            const elApps = document.getElementById('stat-applications');

            if (elJobs) elJobs.textContent = stats.activeJobs;
            if (elSeekers) elSeekers.textContent = stats.jobSeekers;
            if (elComps) elComps.textContent = stats.companies;
            if (elApps) elApps.textContent = stats.applications;
        } catch (e) {
            console.warn("Notice: Real-time statistics fetch:", e);
        }
    }

    updateStatistics();

    // ---------------- REAL-TIME CATEGORY VACANCY COUNTS ----------------
    function getJobCountForCategory(jobs, cat) {
        if (!jobs || jobs.length === 0) return 0;
        const catLower = (cat || '').toLowerCase();
        
        return jobs.filter(j => {
            const jCat = (j.category || '').toLowerCase();
            const jTitle = (j.title || '').toLowerCase();
            const jSkills = (Array.isArray(j.skills) ? j.skills.join(' ') : String(j.skills || '')).toLowerCase();
            const text = `${jCat} ${jTitle} ${jSkills}`;

            if (catLower.includes('software')) {
                return jCat.includes('software') || text.includes('software') || text.includes('backend') || text.includes('full stack') || text.includes('fullstack') || text.includes('java') || text.includes('python') || text.includes('c++');
            }
            if (catLower.includes('web')) {
                return jCat.includes('web') || text.includes('web') || text.includes('frontend') || text.includes('react') || text.includes('angular') || text.includes('node') || text.includes('html');
            }
            if (catLower.includes('mobile')) {
                return jCat.includes('mobile') || text.includes('mobile') || text.includes('android') || text.includes('ios') || text.includes('flutter') || text.includes('react native');
            }
            if (catLower.includes('ai') || catLower.includes('machine learning')) {
                return jCat.includes('ai') || jCat.includes('machine learning') || text.includes('machine learning') || text.includes('artificial intelligence') || text.includes('nlp') || text.includes('deep learning');
            }
            if (catLower.includes('data science') || catLower.includes('data')) {
                return jCat.includes('data') || text.includes('data science') || text.includes('analyst') || text.includes('analytics') || text.includes('sql') || text.includes('power bi');
            }
            if (catLower.includes('cyber') || catLower.includes('security')) {
                return jCat.includes('security') || text.includes('cyber') || text.includes('security') || text.includes('penetration') || text.includes('soc');
            }
            if (catLower.includes('ui') || catLower.includes('ux') || catLower.includes('design')) {
                return jCat.includes('design') || jCat.includes('ui') || text.includes('ui') || text.includes('ux') || text.includes('figma') || text.includes('product design');
            }
            if (catLower.includes('engineering')) {
                return jCat.includes('engineering') || text.includes('engineer') || text.includes('devops') || text.includes('cloud') || text.includes('qa') || text.includes('hardware');
            }
            return jCat.includes(catLower) || text.includes(catLower);
        }).length;
    }

    function updateCategoryCounts() {
        const jobs = window.db?.getActiveJobs ? window.db.getActiveJobs() : [];
        document.querySelectorAll('.cat-count[data-cat]').forEach(el => {
            const cat = el.getAttribute('data-cat');
            const count = getJobCountForCategory(jobs, cat);
            el.textContent = `${count} Open Job${count === 1 ? '' : 's'}`;
        });
    }

    updateCategoryCounts();

    // Category Card Click -> Navigate to Search Vacancies filtered by Category
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', () => {
            const cat = card.getAttribute('data-cat');
            window.location.href = `search-vacancies.html?category=${encodeURIComponent(cat)}`;
        });
    });

    // ---------------- RECRUITER PREVIEW PIPELINE ----------------
    function updateRecruiterPreview() {
        const container = document.getElementById('company-preview-container');
        if (!container) return;

        const apps = window.db?.getApplications ? window.db.getApplications() : [];
        if (!apps || apps.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 24px 14px; color: var(--text-dim); font-size: 0.85rem;">
                    <i class="fa-solid fa-user-check" style="font-size: 2rem; margin-bottom: 10px; color: var(--text-muted); display: block;"></i>
                    <p style="margin-bottom: 4px; color: #fff; font-weight: 600;">Active Candidate Pipeline</p>
                    <p style="color: var(--text-muted); font-size: 0.78rem;">Automated applicant ranking activates immediately once vacancies are posted and candidate applications are submitted.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        apps.slice(0, 3).forEach(app => {
            const row = document.createElement('div');
            row.className = 'candidate-row';
            const initial = (app.fullName || app.applicantName || 'C').charAt(0).toUpperCase();
            row.innerHTML = `
                <div class="c-avatar">${initial}</div>
                <div class="c-info">
                    <strong>${escapeHtml(app.fullName || app.applicantName || 'Candidate')}</strong>
                    <small>${escapeHtml(app.jobTitle || 'Applicant')}</small>
                </div>
                <span class="match-badge" style="background: rgba(34,197,94,0.12); color: #22c55e; border-color: rgba(34,197,94,0.3); font-size: 0.76rem;">
                    <i class="fa-solid fa-check"></i> ${escapeHtml(app.status || 'Applied')}
                </span>
            `;
            container.appendChild(row);
        });
    }

    updateRecruiterPreview();

    // ---------------- REAL USER FEEDBACK ("WHAT OUR USERS SAY") ----------------
    function renderFeedback() {
        const container = document.getElementById('feedback-container');
        if (!container) return;

        const feedbackList = window.db?.getFeedback ? window.db.getFeedback() : [];
        container.innerHTML = '';

        if (!feedbackList || feedbackList.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(18,26,44,0.4); border-radius: 16px; border: 1px dashed var(--border-glass);">
                    <i class="fa-regular fa-comment-dots" style="font-size: 2.6rem; color: var(--text-dim); margin-bottom: 14px; display: block;"></i>
                    <h3 style="font-size: 1.15rem; color: #fff; margin-bottom: 6px;">No feedback yet.</h3>
                    <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 18px;">Be the first to share your experience with SmartJob Finder.</p>
                    <button class="btn-primary" id="btn-empty-feedback" style="padding: 10px 24px; font-size: 0.86rem;"><i class="fa-solid fa-pen-to-square"></i> Give Feedback</button>
                </div>
            `;
            document.getElementById('btn-empty-feedback')?.addEventListener('click', handleGiveFeedbackClick);
            return;
        }

        feedbackList.forEach(item => {
            const card = document.createElement('div');
            card.className = 'testi-card glass-panel';

            const rating = Math.max(1, Math.min(5, Number(item.rating || 5)));
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += i <= rating 
                    ? '<i class="fa-solid fa-star" style="color: #f59e0b;"></i>' 
                    : '<i class="fa-regular fa-star" style="color: #64748b;"></i>';
            }

            const dateStr = item.createdAt 
                ? new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Verified';

            const initial = (item.userName || 'U').charAt(0).toUpperCase();
            const isCompany = item.userRole === 'company' || item.userRole === 'employer';
            const roleLabel = isCompany ? 'Hiring Company' : 'Verified Candidate';
            const roleBg = isCompany 
                ? 'linear-gradient(135deg, #06b6d4, #3b82f6)' 
                : 'linear-gradient(135deg, #8b5cf6, #ec4899)';

            card.innerHTML = `
                <div class="stars" style="display: flex; gap: 4px; margin-bottom: 12px;">
                    ${starsHtml}
                </div>
                <p class="testi-text" style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 16px;">
                    "${escapeHtml(item.comment || '')}"
                </p>
                <div class="testi-user" style="display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--border-glass); padding-top: 12px;">
                    <div class="testi-avatar" style="background: ${roleBg}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff;">
                        ${initial}
                    </div>
                    <div>
                        <h5 style="color: #fff; font-size: 0.95rem; margin-bottom: 2px;">${escapeHtml(item.userName || 'Verified User')}</h5>
                        <small style="color: var(--text-dim); font-size: 0.78rem;">${roleLabel} &bull; ${dateStr}</small>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    renderFeedback();

    // ---------------- FEEDBACK MODAL LOGIC ----------------
    const feedbackModal = document.getElementById('feedback-modal');
    const btnCloseFeedback = document.getElementById('btn-close-feedback');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackRatingInput = document.getElementById('feedback-rating-input');

    function handleGiveFeedbackClick() {
        const user = window.auth?.getCurrentUser();
        if (!user) {
            showToast('Please sign in to share your feedback', 'info');
            openAuthModal('login');
            return;
        }
        if (feedbackModal) {
            feedbackModal.classList.add('active');
            document.getElementById('feedback-comment-input').value = '';
            document.getElementById('feedback-error').textContent = '';
            setRatingValue(5);
        }
    }

    function setRatingValue(val) {
        if (feedbackRatingInput) feedbackRatingInput.value = val;
        document.querySelectorAll('#star-rating-select .star-btn').forEach(star => {
            const starVal = Number(star.getAttribute('data-value'));
            if (starVal <= val) {
                star.className = 'fa-solid fa-star star-btn active';
                star.style.color = '#f59e0b';
            } else {
                star.className = 'fa-regular fa-star star-btn';
                star.style.color = '#64748b';
            }
        });
    }

    document.querySelectorAll('#star-rating-select .star-btn').forEach(star => {
        star.addEventListener('click', () => {
            const val = Number(star.getAttribute('data-value'));
            setRatingValue(val);
        });
    });

    document.getElementById('btn-give-feedback')?.addEventListener('click', handleGiveFeedbackClick);
    if (btnCloseFeedback) {
        btnCloseFeedback.addEventListener('click', () => feedbackModal?.classList.remove('active'));
    }

    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = window.auth?.getCurrentUser();
            if (!user) {
                showToast('Please sign in to submit feedback', 'error');
                return;
            }

            const comment = (document.getElementById('feedback-comment-input')?.value || '').trim();
            const rating = Number(feedbackRatingInput?.value || 5);

            if (!comment) {
                document.getElementById('feedback-error').textContent = 'Please enter your feedback comments.';
                return;
            }

            const submitBtn = document.getElementById('btn-submit-feedback');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
            }

            try {
                if (window.db?.saveFeedback) {
                    await window.db.saveFeedback({
                        userId: user.id,
                        userName: user.fullName || user.email.split('@')[0],
                        userEmail: user.email,
                        userRole: user.role || 'seeker',
                        rating: rating,
                        comment: comment
                    });
                }

                showToast('Thank you! Your feedback has been published.', 'success');
                feedbackModal?.classList.remove('active');
                renderFeedback();
            } catch (err) {
                showToast('Unable to submit feedback right now. Please try again.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Submit Feedback</span>';
                }
            }
        });
    }

    // ---------------- AI SEARCH & FILTERING ----------------
    const aiSearchInput = document.getElementById('ai-search-prompt');
    const btnAiSearch = document.getElementById('btn-ai-search');
    const chipButtons = document.querySelectorAll('.chip-item');

    function executeAiSearch(query) {
        if (!query) {
            renderJobs(JOBS_DATA);
            return;
        }

        const q = query.toLowerCase();

        const filtered = JOBS_DATA.filter(job => {
            const combined = `${job.title} ${job.company} ${job.location} ${job.category} ${job.experience} ${job.skills.join(' ')}`.toLowerCase();
            const words = q.split(' ').filter(w => w.length > 2 && !['and', 'the', 'for', 'want', 'with', 'in', 'completed'].includes(w));
            return words.some(word => combined.includes(word)) || 
                   (q.includes('vizag') && job.location.toLowerCase().includes('visakhapatnam')) ||
                   (q.includes('frontend') && (job.title.toLowerCase().includes('react') || job.category.toLowerCase().includes('web')));
        });

        renderJobs(filtered);
        document.getElementById('featured-jobs')?.scrollIntoView({ behavior: 'smooth' });
        showToast(filtered.length > 0 ? `Found ${filtered.length} matching vacancies in database` : 'No matching vacancies in database', 'info');
    }

    if (btnAiSearch && aiSearchInput) {
        btnAiSearch.addEventListener('click', () => executeAiSearch(aiSearchInput.value.trim()));
        aiSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeAiSearch(aiSearchInput.value.trim());
        });
    }

    chipButtons.forEach(chip => {
        chip.addEventListener('click', () => {
            const promptText = chip.getAttribute('data-prompt');
            if (aiSearchInput) aiSearchInput.value = promptText;
            executeAiSearch(promptText);
        });
    });

    // ---------------- QUICK SEARCH FILTER ----------------
    const btnQuickSearch = document.getElementById('btn-quick-search');
    if (btnQuickSearch) {
        btnQuickSearch.addEventListener('click', () => {
            const keyword = (document.getElementById('quick-keyword')?.value || '').toLowerCase().trim();
            const location = (document.getElementById('quick-location')?.value || '').toLowerCase().trim();
            const experience = document.getElementById('quick-experience')?.value || 'all';
            const salary = parseInt(document.getElementById('quick-salary')?.value || '0', 10);

            const filtered = JOBS_DATA.filter(job => {
                const matchKw = !keyword || `${job.title} ${job.skills.join(' ')} ${job.company}`.toLowerCase().includes(keyword);
                const matchLoc = !location || job.location.toLowerCase().includes(location);
                const matchExp = experience === 'all' || job.experience.toLowerCase().includes(experience.toLowerCase());
                const matchSal = isNaN(salary) || salary === 0 || job.salaryNumeric >= salary;
                return matchKw && matchLoc && matchExp && matchSal;
            });

            renderJobs(filtered);
            document.getElementById('featured-jobs')?.scrollIntoView({ behavior: 'smooth' });
            showToast(`Found ${filtered.length} matching vacancies`, 'info');
        });
    }

    // ---------------- CATEGORY PILLS FILTER ----------------
    const categoryPills = document.querySelectorAll('#category-pills .pill-btn');
    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const filter = pill.getAttribute('data-filter');
            if (filter === 'all') {
                renderJobs(JOBS_DATA);
            } else if (filter === 'Fresher') {
                renderJobs(JOBS_DATA.filter(j => j.experience.toLowerCase().includes('fresher')));
            } else if (filter === 'Visakhapatnam') {
                renderJobs(JOBS_DATA.filter(j => j.location.toLowerCase().includes('visakhapatnam') || j.location.toLowerCase().includes('vizag')));
            } else if (filter === 'Remote') {
                renderJobs(JOBS_DATA.filter(j => j.type.toLowerCase().includes('remote') || j.location.toLowerCase().includes('remote')));
            }
        });
    });

    // ---------------- AI FEATURES GATING & ROUTING ----------------
    function handleAiMatchingRouting() {
        const user = window.auth?.getCurrentUser();
        if (!user) {
            showToast('Please sign in as a Job Seeker to access AI Matching', 'info');
            openAuthModal('login');
            return;
        }
        if (user.role === 'employer' || user.role === 'company') {
            window.location.href = 'company-dashboard.html';
        } else {
            window.location.href = `seeker-dashboard.html?tab=tab-recommended&session_email=${encodeURIComponent(user.email)}&session_name=${encodeURIComponent(user.fullName)}&session_role=seeker`;
        }
    }

    function handleResumeScanRouting() {
        const user = window.auth?.getCurrentUser();
        if (!user) {
            showToast('Please sign in as a Job Seeker to scan and analyze your resume', 'info');
            openAuthModal('login');
            return;
        }
        if (user.role === 'employer' || user.role === 'company') {
            showToast('Resume ATS Analysis is for Job Seekers. Redirecting to company portal...', 'info');
            window.location.href = 'company-dashboard.html';
            return;
        }
        window.location.href = `seeker-dashboard.html?tab=tab-ats&session_email=${encodeURIComponent(user.email)}&session_name=${encodeURIComponent(user.fullName)}&session_role=seeker`;
    }

    function handleCareerAdvisorRouting() {
        const user = window.auth?.getCurrentUser();
        if (!user) {
            showToast('Please sign in as a Job Seeker to access AI Skill-Gap Analyzer', 'info');
            openAuthModal('login');
            return;
        }
        window.location.href = `seeker-dashboard.html?tab=tab-advisor&session_email=${encodeURIComponent(user.email)}&session_name=${encodeURIComponent(user.fullName)}&session_role=seeker`;
    }

    document.getElementById('btn-ai-match-modal')?.addEventListener('click', handleAiMatchingRouting);
    document.getElementById('btn-ai-match-card')?.addEventListener('click', handleAiMatchingRouting);
    document.getElementById('btn-scan-resume-trigger')?.addEventListener('click', handleResumeScanRouting);
    document.getElementById('footer-resume-scan')?.addEventListener('click', handleResumeScanRouting);
    document.getElementById('btn-smart-recom-trigger')?.addEventListener('click', handleAiMatchingRouting);
    document.getElementById('btn-career-guidance')?.addEventListener('click', handleCareerAdvisorRouting);

    // Explore All Vacancies Button
    document.getElementById('btn-load-more-jobs')?.addEventListener('click', () => {
        window.location.href = 'search-vacancies.html';
    });

    document.getElementById('btn-cta-find-jobs')?.addEventListener('click', () => {
        window.location.href = 'search-vacancies.html';
    });

    // Recruiter CTA Buttons
    document.getElementById('btn-register-company')?.addEventListener('click', () => {
        const user = window.auth?.getCurrentUser();
        if (user && (user.role === 'employer' || user.role === 'company')) {
            window.location.href = 'company-dashboard.html';
        } else {
            openAuthModal('register');
            const empRadio = document.querySelector('input[name="modal-user-role"][value="employer"]');
            if (empRadio) {
                empRadio.checked = true;
                empRadio.dispatchEvent(new Event('change'));
            }
        }
    });

    document.getElementById('btn-cta-post-job')?.addEventListener('click', () => {
        const user = window.auth?.getCurrentUser();
        if (user && (user.role === 'employer' || user.role === 'company')) {
            window.location.href = 'company-dashboard.html';
        } else {
            openAuthModal('register');
            const empRadio = document.querySelector('input[name="modal-user-role"][value="employer"]');
            if (empRadio) {
                empRadio.checked = true;
                empRadio.dispatchEvent(new Event('change'));
            }
        }
    });

    // ---------------- JOB DETAILS MODAL & 1-CLICK APPLY ----------------
    const jobDetailsModal = document.getElementById('job-details-modal');
    const modalJobTitle = document.getElementById('modal-job-title');
    const modalJobBody = document.getElementById('modal-job-body');
    const btnCloseJobModal = document.getElementById('btn-close-job-modal');

    function openJobModal(jobId) {
        const job = JOBS_DATA.find(j => String(j.id) === String(jobId));
        if (!job || !jobDetailsModal) return;

        modalJobTitle.innerHTML = `<i class="fa-solid fa-briefcase highlight"></i> ${escapeHtml(job.title)}`;
        modalJobBody.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="font-size: 1.1rem; color: #fff;">${escapeHtml(job.company)}</h4>
                    <span class="match-badge" style="background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 4px 10px; border-radius: 20px; font-size: 0.76rem;">
                        <i class="fa-solid fa-bolt"></i> Verified Job
                    </span>
                </div>
                <p style="color: var(--text-muted); font-size: 0.88rem; line-height: 1.6; margin-bottom: 14px;">${escapeHtml(job.description)}</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: rgba(15,23,42,0.6); padding: 14px; border-radius: 10px; margin-bottom: 18px;">
                    <div><strong>Location:</strong> <span style="color: var(--accent);">${escapeHtml(job.location)}</span></div>
                    <div><strong>Experience:</strong> ${escapeHtml(job.experience)}</div>
                    <div><strong>Compensation:</strong> <span style="color: #38bdf8; font-weight: 700;">${escapeHtml(job.salaryMonthly)}</span></div>
                    <div><strong>Work Mode:</strong> ${escapeHtml(job.type)}</div>
                </div>

                <h5 style="color: #fff; font-size: 0.95rem; margin-bottom: 8px;">Key Requirements:</h5>
                <ul style="color: var(--text-muted); font-size: 0.86rem; padding-left: 20px; line-height: 1.6; margin-bottom: 20px;">
                    ${job.requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
                </ul>

                <button class="btn-primary w-full" id="btn-submit-job-application">
                    <i class="fa-solid fa-paper-plane"></i>
                    <span>1-Click AI Apply Now</span>
                </button>
            </div>
        `;

        jobDetailsModal.classList.add('active');

        document.getElementById('btn-submit-job-application')?.addEventListener('click', async () => {
            const user = window.auth?.getCurrentUser();
            if (!user) {
                jobDetailsModal.classList.remove('active');
                openAuthModal('login');
                showToast('Please sign in to submit your job application', 'info');
                return;
            }

            if (user.role === 'employer' || user.role === 'company' || user.role === 'admin') {
                showToast('Employers cannot apply for jobs. Please sign in as a Job Seeker.', 'warning');
                return;
            }

            if (window.db?.hasCandidateApplied && window.db.hasCandidateApplied(job.id, user.email)) {
                showToast(`You have already submitted an application for "${job.title}"!`, 'warning');
                return;
            }

            const profile = window.db?.getSeekerProfile ? window.db.getSeekerProfile(user.email) : null;
            const appData = {
                id: 'app_' + Date.now(),
                jobId: job.id,
                jobTitle: job.title,
                company: job.company,
                fullName: profile?.fullName || user.fullName || user.email.split('@')[0],
                applicantName: profile?.fullName || user.fullName || user.email.split('@')[0],
                email: user.email,
                applicantEmail: user.email,
                phone: profile?.phone || user.phone || '',
                city: profile?.location || user.location || job.location,
                location: profile?.location || user.location || job.location,
                qualification: profile?.qualification || 'Bachelor Degree',
                experience: profile?.experience || job.experience,
                coverLetter: `Application submitted via 1-Click AI Apply for ${job.title}.`,
                status: 'Applied',
                appliedAt: new Date().toISOString()
            };

            if (window.db?.saveApplication) {
                await window.db.saveApplication(appData);
            }

            showToast(`Application successfully sent to ${job.company}! Redirecting to your dashboard...`, 'success');
            jobDetailsModal.classList.remove('active');
            setTimeout(() => {
                window.location.href = `seeker-dashboard.html?session_email=${encodeURIComponent(user.email)}&session_name=${encodeURIComponent(appData.fullName)}&session_role=seeker`;
            }, 800);
        });
    }

    if (btnCloseJobModal) {
        btnCloseJobModal.addEventListener('click', () => jobDetailsModal.classList.remove('active'));
    }

    // ---------------- AUTH MODAL & LOGIC ----------------
    const authModal = document.getElementById('auth-modal');
    const btnCloseAuth = document.getElementById('btn-close-auth');
    const navBtnLogin = document.getElementById('nav-btn-login');
    const navBtnRegister = document.getElementById('nav-btn-register');
    const modalTabLogin = document.getElementById('modal-tab-login');
    const modalTabRegister = document.getElementById('modal-tab-register');
    const modalLoginContainer = document.getElementById('modal-login-container');
    const modalRegisterContainer = document.getElementById('modal-register-container');
    const tabIndicator = authModal ? authModal.querySelector('.tab-indicator') : null;

    function openAuthModal(tab = 'login') {
        if (!authModal) return;
        authModal.classList.add('active');
        switchModalTab(tab);
    }

    function switchModalTab(tab) {
        if (tab === 'login') {
            modalTabLogin?.classList.add('active');
            modalTabRegister?.classList.remove('active');
            modalLoginContainer?.classList.add('active');
            modalRegisterContainer?.classList.remove('active');
            if (tabIndicator) tabIndicator.style.transform = 'translateX(0)';
        } else {
            modalTabRegister?.classList.add('active');
            modalTabLogin?.classList.remove('active');
            modalRegisterContainer?.classList.add('active');
            modalLoginContainer?.classList.remove('active');
            if (tabIndicator) tabIndicator.style.transform = 'translateX(100%)';
        }
    }

    if (navBtnLogin) navBtnLogin.addEventListener('click', () => openAuthModal('login'));
    if (navBtnRegister) navBtnRegister.addEventListener('click', () => openAuthModal('register'));
    if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => authModal.classList.remove('active'));
    if (modalTabLogin) modalTabLogin.addEventListener('click', () => switchModalTab('login'));
    if (modalTabRegister) modalTabRegister.addEventListener('click', () => switchModalTab('register'));

    document.querySelectorAll('.trigger-login').forEach(el => el.addEventListener('click', () => openAuthModal('login')));
    document.querySelectorAll('.trigger-register').forEach(el => el.addEventListener('click', () => openAuthModal('register')));

    // Role radio styling in register form
    document.querySelectorAll('input[name="modal-user-role"]').forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.role-card').forEach(rc => rc.classList.remove('active'));
            radio.closest('.role-card')?.classList.add('active');
        });
    });

    // Modal Login Submission
    const modalLoginForm = document.getElementById('modal-login-form');
    if (modalLoginForm) {
        modalLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('modal-login-email').value.trim();
            const password = document.getElementById('modal-login-password').value;
            const submitBtn = document.getElementById('btn-modal-submit-login');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
            }

            try {
                const res = await window.auth.login(email, password, true);
                showToast(`Welcome back, ${res.user.fullName}! Redirecting...`, 'success');
                const baseUrl = window.auth.getRoleRedirectUrl(res.user.role);
                const dest = `${baseUrl}?name=${encodeURIComponent(res.user.fullName)}&email=${encodeURIComponent(res.user.email)}&role=${encodeURIComponent(res.user.role)}&phone=${encodeURIComponent(res.user.phone || '')}`;
                setTimeout(() => {
                    window.location.href = dest;
                }, 400);
            } catch (err) {
                showToast(err.message, 'error');
                const passErr = document.getElementById('modal-login-password-error');
                if (passErr) {
                    passErr.textContent = err.message;
                    passErr.style.display = 'block';
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span class="btn-text">Sign In</span> <i class="fa-solid fa-arrow-right btn-icon"></i>';
                }
            }
        });
    }

    // Modal Register Submission
    const modalRegisterForm = document.getElementById('modal-register-form');
    if (modalRegisterForm) {
        modalRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('modal-reg-fullname').value.trim();
            const email = document.getElementById('modal-reg-email').value.trim();
            const password = document.getElementById('modal-reg-password').value;
            const confirmPassEl = document.getElementById('modal-reg-confirm-password');
            const confirmPassword = confirmPassEl ? confirmPassEl.value : password;
            const roleEl = document.querySelector('input[name="modal-user-role"]:checked');
            const role = roleEl ? roleEl.value : 'seeker';
            const submitBtn = document.getElementById('btn-modal-submit-reg');
            const confirmErrEl = document.getElementById('modal-reg-confirm-password-error');

            if (confirmErrEl) confirmErrEl.textContent = '';

            if (password !== confirmPassword) {
                if (confirmErrEl) confirmErrEl.textContent = 'Passwords do not match';
                showToast('Passwords do not match. Please verify your confirm password.', 'error');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
            }

            try {
                const res = await window.auth.register({ fullName, email, password, role });
                showToast(res.message || `Welcome to SmartHire AI, ${res.user.fullName}!`, 'success');
                const baseUrl = window.auth.getRoleRedirectUrl(res.user.role);
                const dest = `${baseUrl}?name=${encodeURIComponent(res.user.fullName)}&email=${encodeURIComponent(res.user.email)}&role=${encodeURIComponent(res.user.role)}&phone=${encodeURIComponent(res.user.phone || '')}`;
                setTimeout(() => {
                    window.location.href = dest;
                }, 1200);
            } catch (err) {
                showToast(err.message, 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span class="btn-text">Create Account</span> <i class="fa-solid fa-check btn-icon"></i>';
                }
            }
        });
    }

    // ---------------- MOBILE MENU TOGGLE ----------------
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.getElementById('nav-menu');
    if (mobileBtn && navMenu) {
        mobileBtn.addEventListener('click', () => {
            navMenu.classList.toggle('open');
        });
    }

    // ---------------- SUPABASE CLOUD SYNC & LOCAL LISTENERS ----------------
    window.addEventListener('storage', () => {
        JOBS_DATA = getHomeJobs();
        renderJobs(JOBS_DATA);
        updateStatistics();
        updateCategoryCounts();
        renderFeedback();
        updateRecruiterPreview();
    });

    // Trigger cloud refresh after startup
    setTimeout(async () => {
        if (window.db?.fetchJobsFromSupabase) {
            await window.db.fetchJobsFromSupabase();
            JOBS_DATA = getHomeJobs();
            renderJobs(JOBS_DATA);
            updateCategoryCounts();
        }
        if (window.db?.fetchFeedbackFromSupabase) {
            await window.db.fetchFeedbackFromSupabase();
            renderFeedback();
        }
        updateStatistics();
        updateRecruiterPreview();
    }, 800);
});
