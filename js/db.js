/**
 * SmartHire AI - Dual-Engine Permanent Database Persistence Service
 * Supabase PostgreSQL Cloud Sync + LocalStorage Fail-Safe Fallback
 */

(function () {
    const STORAGE_KEYS = {
        APPLICATIONS: 'smarthire_applications',
        JOBS: 'smarthire_jobs',
        PROFILES: 'smarthire_seeker_profiles',
        SAVED_JOBS: 'smarthire_saved_jobs',
        NOTIFICATIONS: 'smarthire_notifications',
        INTERVIEWS: 'smarthire_interviews',
        OFFERS: 'smarthire_offers',
        FEEDBACK: 'smarthire_user_feedback',
        REPORTS: 'smarthire_reports'
    };

    // Helper: Convert string IDs into valid RFC-4122 UUID format required by PostgreSQL
    function toUUID(str) {
        if (!str) return '00000000-0000-4000-8000-000000000000';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
            return str;
        }
        let hash1 = 0, hash2 = 0;
        for (let i = 0; i < str.length; i++) {
            hash1 = ((hash1 << 5) - hash1) + str.charCodeAt(i);
            hash1 |= 0;
            hash2 = ((hash2 << 7) - hash2) + str.charCodeAt(i);
            hash2 |= 0;
        }
        const h1 = Math.abs(hash1).toString(16).padStart(8, '0').slice(0, 8);
        const h2 = Math.abs(hash2).toString(16).padStart(8, '0').slice(0, 8);
        const h3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, '0').slice(0, 8);
        return `${h1}-a1b2-4c3d-8e4f-${(h2 + h3).slice(0, 12)}`;
    }
    window.toUUID = toUUID;

    // Helper: Generate fresh RFC-4122 UUID natively
    function generateUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    window.generateUUID = generateUUID;

    class DatabaseService {
        constructor() {
            this.supabase = null;
            this.initLocalStore();
            // Automatically synchronize from cloud database on startup
            setTimeout(() => this.syncAllFromSupabase(), 200);
        }

        getSupabase() {
            if (window.auth && window.auth.supabaseClient && window.auth.isSupabaseConnected) {
                this.supabase = window.auth.supabaseClient;
            } else if (window.supabase && typeof getSupabaseCredentials === 'function') {
                const creds = getSupabaseCredentials();
                if (creds.url && creds.key && creds.key.length >= 10) {
                    try {
                        this.supabase = window.supabase.createClient(creds.url, creds.key);
                    } catch (e) {
                        this.supabase = null;
                    }
                }
            }
            return this.supabase;
        }

        initLocalStore() {
            if (!localStorage.getItem(STORAGE_KEYS.JOBS)) {
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.APPLICATIONS)) {
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.SAVED_JOBS)) {
                localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
                localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.INTERVIEWS)) {
                localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.OFFERS)) {
                localStorage.setItem(STORAGE_KEYS.OFFERS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.FEEDBACK)) {
                localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.REPORTS)) {
                localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify([]));
            }
        }

        clearAllData() {
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.OFFERS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify([]));
            localStorage.setItem('smartjob_saved_jobs', JSON.stringify([]));
            localStorage.setItem('smartjob_users_db', JSON.stringify([]));
            localStorage.setItem('smartjob_admin_reports', JSON.stringify([]));
            localStorage.setItem('smarthire_chat_db', JSON.stringify({}));
            localStorage.removeItem(STORAGE_KEYS.PROFILES);
            localStorage.removeItem('smartjob_active_session');
            localStorage.removeItem('smartjob_remember_user');
            localStorage.removeItem('smartjob_active_user');
            if (window.auth && typeof window.auth.resetDatabase === 'function') {
                window.auth.resetDatabase();
            }
            console.log("🧹 All local database tables, users, jobs, and applications wiped clean!");
        }

        // ==========================================
        // 1. APPLICATIONS (ISOLATED & SECURE)
        // ==========================================
        async saveApplication(appData) {
            const currentAuth = window.auth?.getCurrentUser();
            const rawId = appData.id || generateUUID();
            const appId = toUUID(rawId);
            const applicantName = appData.fullName || appData.applicantName || currentAuth?.fullName || 'Candidate';
            const applicantEmail = (appData.email || appData.applicantEmail || currentAuth?.email || '').trim().toLowerCase();
            const matchScore = Number(appData.matchScore || appData.aiMatch || 90);
            const candidateId = toUUID(appData.candidateId || appData.candidate_id || appData.seekerId || appData.seeker_id || currentAuth?.id || applicantEmail);

            // Find matching job to associate companyId if not provided
            let companyId = appData.companyId || appData.company_id || '';
            const allJobs = this.getJobs();
            const targetJobIdStr = String(appData.jobId || appData.job_id || '');
            const matchedJob = allJobs.find(j => String(j.id) === targetJobIdStr || String(j.job_id) === targetJobIdStr);
            if (matchedJob) {
                companyId = companyId || matchedJob.companyId || matchedJob.company_id || '';
            }

            const targetJobId = matchedJob ? (matchedJob.job_id || matchedJob.id) : (appData.jobId || appData.job_id || appId);

            const newApp = {
                id: appId,
                application_id: appId,
                jobId: targetJobId,
                job_id: targetJobId,
                jobTitle: appData.jobTitle || matchedJob?.title || 'Software Engineer',
                company: appData.company || matchedJob?.company || 'TechCorp Global',
                company_name: appData.company || matchedJob?.company || 'TechCorp Global',
                companyId: companyId,
                company_id: companyId,
                candidateId: candidateId,
                candidate_id: candidateId,
                seekerId: candidateId,
                seeker_id: candidateId,
                fullName: applicantName,
                applicantName: applicantName,
                email: applicantEmail,
                applicantEmail: applicantEmail,
                phone: appData.phone || currentAuth?.phone || '',
                location: appData.location || appData.city || currentAuth?.location || 'Visakhapatnam',
                city: appData.city || appData.location || currentAuth?.location || 'Visakhapatnam',
                qualification: appData.qualification || 'B.Tech / Diploma',
                college: appData.college || '',
                passYear: appData.passYear || '2026',
                cgpa: appData.cgpa || '',
                skills: appData.skills || 'Python, Django, SQL',
                experience: appData.experience || 'Fresher',
                expectedSalary: appData.expectedSalary || '₹30,000/mo',
                resumeName: appData.resumeName || 'Resume.pdf',
                coverLetter: appData.coverLetter || '',
                aiMatch: matchScore,
                matchScore: matchScore,
                status: appData.status || 'Applied',
                appliedAt: appData.appliedAt || new Date().toISOString()
            };

            // 1. Persist to Local Storage
            const apps = this.getApplications();
            const existingIdx = apps.findIndex(a => 
                String(a.id) === String(newApp.id) || 
                (String(a.jobId || a.job_id) === String(newApp.jobId) && 
                 (a.applicantEmail || a.email)?.toLowerCase() === newApp.email.toLowerCase())
            );
            if (existingIdx >= 0) {
                apps[existingIdx] = newApp;
            } else {
                apps.unshift(newApp);
            }
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));

            // 2. Insert into Supabase Applications PostgreSQL Table
            const client = this.getSupabase();
            if (client) {
                try {
                    const effectiveSeekerId = candidateId || newApp.candidateId || newApp.seekerId || newApp.email || 'seeker_default';
                    const payload = {
                        application_id: toUUID(newApp.id),
                        job_id: toUUID(newApp.jobId),
                        seeker_id: toUUID(effectiveSeekerId),
                        job_title: newApp.jobTitle || 'Job Opening',
                        company: newApp.company || 'Employer',
                        full_name: newApp.fullName || 'Applicant',
                        email: newApp.email || '',
                        phone: newApp.phone || '',
                        location: newApp.location || newApp.city || '',
                        qualification: newApp.qualification || '',
                        college: newApp.college || '',
                        pass_year: String(newApp.passYear || ''),
                        cgpa: String(newApp.cgpa || ''),
                        skills: typeof newApp.skills === 'string' ? newApp.skills : JSON.stringify(newApp.skills || []),
                        experience: newApp.experience || '',
                        expected_salary: newApp.expectedSalary || '',
                        resume_name: newApp.resumeName || '',
                        cover_letter: newApp.coverLetter || '',
                        ai_match_score: Number(newApp.matchScore || newApp.aiMatch || 88),
                        status: newApp.status || 'Applied',
                        notes: `Applicant: ${newApp.fullName} (${newApp.email}) | Company: ${companyId || newApp.company || ''}`
                    };

                    const { data, error } = await client.from('applications').upsert([payload]).select();

                    if (error) {
                        console.error("❌ Supabase Applications Save Error:", error.message || error);
                    } else {
                        console.log("⚡ Application successfully stored in Supabase cloud table!", data);
                    }
                } catch (sbErr) {
                    console.warn("Supabase application insert exception:", sbErr);
                }
            }

            // 3. Dispatch Notification to Candidate
            this.addNotification({
                userId: candidateId,
                userEmail: newApp.email,
                title: 'Application Submitted',
                message: `Your application for "${newApp.jobTitle}" at ${newApp.company} was submitted successfully.`,
                type: 'success',
                link: 'seeker-dashboard.html?tab=tab-history'
            });

            // 4. Dispatch Notification to Company / Recruiter
            this.addNotification({
                userId: companyId,
                userEmail: newApp.company,
                title: 'New Candidate Application',
                message: `${newApp.fullName} applied for your opening: "${newApp.jobTitle}".`,
                type: 'info',
                link: 'company-dashboard.html'
            });

            return newApp;
        }

        hasCandidateApplied(jobId, candidateEmail) {
            if (!jobId || !candidateEmail) return false;
            const jId = String(jobId);
            const cEmail = String(candidateEmail).trim().toLowerCase();
            const apps = this.getApplications();
            return apps.some(a => {
                const aJob = String(a.jobId || a.job_id || '');
                const aMail = (a.applicantEmail || a.email || '').trim().toLowerCase();
                return aJob === jId && aMail === cEmail;
            });
        }

        getApplications() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS)) || [];
            } catch (e) {
                return [];
            }
        }

        // Candidate Application Isolation: Candidate only sees their own applications
        getApplicationsForCandidate(candidateEmailOrId) {
            if (!candidateEmailOrId) return [];
            const target = String(candidateEmailOrId).trim().toLowerCase();
            const all = this.getApplications();
            return all.filter(a => {
                const aMail = (a.applicantEmail || a.email || '').trim().toLowerCase();
                const aSeeker = String(a.seekerId || a.seeker_id || a.candidateId || a.candidate_id || '').trim().toLowerCase();
                return aMail === target || aSeeker === target;
            });
        }

        // Company Application Isolation: Company only sees applications for its own posted jobs
        getApplicationsForCompany(companyIdOrName, companyNameOrEmail = '', companyEmailFallback = '') {
            const arg1 = (companyIdOrName || '').trim().toLowerCase();
            const arg2 = (companyNameOrEmail || '').trim().toLowerCase();
            const arg3 = (companyEmailFallback || '').trim().toLowerCase();
            if (!arg1 && !arg2 && !arg3) return [];

            const companyJobs = this.getJobsForCompany(companyIdOrName, companyNameOrEmail, companyEmailFallback);
            const companyJobIds = new Set(companyJobs.map(j => String(j.id || j.job_id).toLowerCase()));

            const all = this.getApplications();
            const targets = [arg1, arg2, arg3].filter(Boolean);

            return all.filter(a => {
                if (a.id === 'app_101' || a.id === 'app_102' || a.id === 'app_103') return false;
                const aComp = (a.company || a.company_name || '').trim().toLowerCase();
                const aJobId = String(a.jobId || a.job_id || '').trim().toLowerCase();
                const aCompId = String(a.companyId || a.company_id || '').trim().toLowerCase();

                // 1. Matched directly by companyId
                const matchesCompanyId = targets.some(t => aCompId && aCompId === t);
                // 2. Matched because the application's jobId is in this company's jobs
                const matchesJobId = companyJobIds.has(aJobId);
                // 3. Matched by company name string
                const matchesName = targets.some(t => aComp && aComp === t);

                return matchesCompanyId || matchesJobId || matchesName;
            });
        }

        async fetchApplicationsFromSupabase() {
            const client = this.getSupabase();
            if (!client) {
                return (this.getApplications() || []).filter(a => a.id !== 'app_101' && a.id !== 'app_102' && a.id !== 'app_103');
            }
            try {
                const { data, error } = await client.from('applications').select('*').order('applied_date', { ascending: false });
                if (error || !data) {
                    console.warn("Supabase applications fetch error:", error);
                    return (this.getApplications() || []).filter(a => a.id !== 'app_101' && a.id !== 'app_102' && a.id !== 'app_103');
                }

                const cloudApps = data.map(a => ({
                    id: a.application_id,
                    application_id: a.application_id,
                    jobId: a.job_id,
                    job_id: a.job_id,
                    companyId: a.company_id || '',
                    company_id: a.company_id || '',
                    candidateId: a.seeker_id || '',
                    candidate_id: a.seeker_id || '',
                    seekerId: a.seeker_id || '',
                    seeker_id: a.seeker_id || '',
                    jobTitle: a.job_title,
                    company: a.company,
                    company_name: a.company,
                    applicantName: a.full_name,
                    fullName: a.full_name,
                    applicantEmail: a.email,
                    email: a.email,
                    phone: a.phone,
                    location: a.location,
                    city: a.location,
                    qualification: a.qualification,
                    college: a.college,
                    passYear: a.pass_year,
                    cgpa: a.cgpa,
                    skills: a.skills,
                    experience: a.experience,
                    expectedSalary: a.expected_salary,
                    resumeName: a.resume_name,
                    coverLetter: a.cover_letter,
                    matchScore: a.ai_match_score,
                    aiMatch: a.ai_match_score,
                    status: a.status || 'Applied',
                    appliedAt: a.applied_date
                }));

                // Merge with local applications, completely purging legacy dummy records
                const localApps = (this.getApplications() || []).filter(a => a.id !== 'app_101' && a.id !== 'app_102' && a.id !== 'app_103');
                const mergedMap = new Map();
                // 1. Cloud data takes precedence
                cloudApps.forEach(a => mergedMap.set(String(a.id), a));
                // 2. Add local non-dummy unsynced items
                localApps.forEach(a => {
                    const key = String(a.id || a.application_id);
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, a);
                    }
                });

                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return (this.getApplications() || []).filter(a => a.id !== 'app_101' && a.id !== 'app_102' && a.id !== 'app_103');
            }
        }

        async updateApplicationStatus(appId, newStatus) {
            const apps = this.getApplications();
            const idx = apps.findIndex(a => String(a.id) === String(appId));
            let targetApp = null;
            if (idx >= 0) {
                apps[idx].status = newStatus;
                targetApp = apps[idx];
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    const { error } = await client.from('applications').update({ status: newStatus }).eq('application_id', toUUID(appId));
                    if (error) console.warn("Supabase update error:", error.message);
                } catch (e) {
                    console.log("Supabase status update notice:", e);
                }
            }

            // Dispatch notification to candidate when status changes
            if (targetApp && (targetApp.applicantEmail || targetApp.email)) {
                const candMail = targetApp.applicantEmail || targetApp.email;
                this.addNotification({
                    userId: targetApp.seekerId || candMail,
                    userEmail: candMail,
                    title: 'Application Status Updated',
                    message: `Your application for "${targetApp.jobTitle}" at ${targetApp.company} is now marked as "${newStatus}".`,
                    type: newStatus === 'Rejected' ? 'warning' : 'success',
                    link: 'seeker-dashboard.html?tab=tab-history'
                });
            }

            return true;
        }

        async deleteApplication(appId) {
            let apps = this.getApplications();
            apps = apps.filter(a => String(a.id) !== String(appId) && String(a.application_id) !== String(appId));
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));

            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('applications').delete().eq('application_id', toUUID(appId));
                    console.log("⚡ Application deleted from Supabase cloud table!");
                } catch (e) {
                    console.warn("Supabase deleteApplication notice:", e);
                }
            }
            return true;
        }

        // ==========================================
        // 2. JOB VACANCIES (EMPLOYER POSTINGS & ISOLATION)
        // ==========================================
        async saveJob(jobData) {
            const currentAuth = window.auth?.getCurrentUser();
            const rawId = jobData.id || generateUUID();
            const jobId = toUUID(rawId);
            const companyId = jobData.companyId || jobData.company_id || currentAuth?.companyId || currentAuth?.company_id || currentAuth?.id || '';
            const companyName = (jobData.company || jobData.company_name || currentAuth?.companyName || currentAuth?.fullName || 'TechCorp Global').trim();
            const companyEmail = (jobData.companyEmail || jobData.email || currentAuth?.email || '').trim().toLowerCase();

            const newJob = {
                id: jobId,
                job_id: jobId,
                title: jobData.title,
                company: companyName,
                company_name: companyName,
                companyId: companyId,
                company_id: companyId,
                companyEmail: companyEmail,
                location: jobData.location || 'Visakhapatnam',
                salary: jobData.salary || '₹30,000 - ₹50,000/mo',
                type: jobData.type || jobData.workMode || 'Full-time',
                workMode: jobData.workMode || jobData.type || 'Hybrid',
                experience: jobData.experience || 'Fresher (Entry Level)',
                skills: Array.isArray(jobData.skills) ? jobData.skills : (jobData.skills ? String(jobData.skills).split(',').map(s => s.trim()).filter(Boolean) : ['General']),
                description: jobData.description || 'Job description',
                status: jobData.status || 'active',
                createdAt: jobData.createdAt || new Date().toISOString()
            };

            // 1. Save locally
            const jobs = this.getJobs();
            const existingIdx = jobs.findIndex(j => String(j.id) === String(newJob.id) || String(j.job_id) === String(newJob.id));
            if (existingIdx >= 0) {
                jobs[existingIdx] = newJob;
            } else {
                jobs.unshift(newJob);
            }
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));

            // 2. Insert/Upsert into Supabase Jobs PostgreSQL Table
            const client = this.getSupabase();
            if (client) {
                try {
                    const payload = {
                        job_id: toUUID(newJob.id),
                        company_id: companyId ? toUUID(companyId) : null,
                        company_name: newJob.company,
                        title: newJob.title,
                        description: newJob.description,
                        salary: newJob.salary,
                        location: newJob.location,
                        work_mode: newJob.workMode,
                        skills: newJob.skills,
                        status: 'active'
                    };

                    const { data, error } = await client.from('jobs').upsert([payload]).select();

                    if (error) {
                        console.error("❌ Supabase Jobs Insert Error:", error.message || error);
                    } else {
                        console.log("⚡ Vacancy successfully stored in Supabase PostgreSQL jobs table!", data);
                    }
                } catch (sbErr) {
                    console.warn("Supabase job insert notice:", sbErr);
                }
            }

            return newJob;
        }

        async updateJob(jobId, updatedFields) {
            const jobs = this.getJobs();
            const idx = jobs.findIndex(j => String(j.id) === String(jobId) || String(j.job_id) === String(jobId));
            if (idx >= 0) {
                jobs[idx] = { ...jobs[idx], ...updatedFields };
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    const updatePayload = {};
                    if (updatedFields.title) updatePayload.title = updatedFields.title;
                    if (updatedFields.company) updatePayload.company_name = updatedFields.company;
                    if (updatedFields.location) updatePayload.location = updatedFields.location;
                    if (updatedFields.salary) updatePayload.salary = updatedFields.salary;
                    if (updatedFields.description) updatePayload.description = updatedFields.description;
                    if (updatedFields.workMode) updatePayload.work_mode = updatedFields.workMode;
                    if (updatedFields.skills) updatePayload.skills = Array.isArray(updatedFields.skills) ? updatedFields.skills : updatedFields.skills.split(',').map(s => s.trim());
                    if (updatedFields.status) updatePayload.status = updatedFields.status;

                    await client.from('jobs').update(updatePayload).eq('job_id', toUUID(jobId));
                } catch (e) {
                    console.warn("Supabase updateJob notice:", e);
                }
            }
            return true;
        }

        async deleteJob(jobId) {
            let jobs = this.getJobs();
            jobs = jobs.filter(j => String(j.id) !== String(jobId) && String(j.job_id) !== String(jobId));
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));

            const client = this.getSupabase();
            if (client) {
                try {
                    const uuid = toUUID(jobId);
                    await client.from('jobs').delete().eq('job_id', uuid);
                    await client.from('applications').delete().eq('job_id', uuid);
                    console.log("⚡ Job deleted from Supabase cloud table!");
                } catch (e) {
                    console.warn("Supabase deleteJob notice:", e);
                }
            }
            return true;
        }

        getJobs() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.JOBS)) || [];
            } catch (e) {
                return [];
            }
        }

        // Return only active/available positions for candidates
        getActiveJobs() {
            const all = this.getJobs();
            return all.filter(j => !j.status || j.status.toLowerCase() === 'active');
        }

        // Return jobs strictly belonging to a specific company
        getJobsForCompany(companyIdOrName, companyNameOrEmail = '', companyEmailFallback = '') {
            const arg1 = (companyIdOrName || '').trim().toLowerCase();
            const arg2 = (companyNameOrEmail || '').trim().toLowerCase();
            const arg3 = (companyEmailFallback || '').trim().toLowerCase();
            const all = this.getJobs();
            if (!arg1 && !arg2 && !arg3) return [];

            const targets = [arg1, arg2, arg3].filter(Boolean);

            return all.filter(j => {
                const jComp = (j.company || j.company_name || '').trim().toLowerCase();
                const jCompId = String(j.companyId || j.company_id || '').trim().toLowerCase();
                const jCompMail = String(j.companyEmail || '').trim().toLowerCase();

                return targets.some(t => 
                    (jCompId && jCompId === t) ||
                    (jComp && jComp === t) ||
                    (jCompMail && jCompMail === t)
                );
            });
        }

        async fetchJobsFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getJobs();
            try {
                const { data, error } = await client.from('jobs').select('*').order('created_at', { ascending: false });
                if (error || !data) {
                    console.warn("Supabase jobs fetch notice:", error);
                    return this.getJobs();
                }

                const cloudJobs = data.map(j => ({
                    id: j.job_id,
                    job_id: j.job_id,
                    title: j.title,
                    company: j.company_name || 'TechCorp Global',
                    company_name: j.company_name || 'TechCorp Global',
                    companyId: j.company_id || '',
                    company_id: j.company_id || '',
                    location: j.location,
                    salary: j.salary,
                    skills: j.skills || [],
                    description: j.description,
                    workMode: j.work_mode || 'On-site',
                    type: j.work_mode || 'Full-time',
                    status: j.status || 'active',
                    createdAt: j.created_at
                }));

                // Merge cloud and local jobs
                const localJobs = this.getJobs();
                const mergedMap = new Map();
                cloudJobs.forEach(j => mergedMap.set(String(j.id), j));
                localJobs.forEach(j => {
                    const key = String(j.id || j.job_id);
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, j);
                    } else {
                        const existing = mergedMap.get(key);
                        if (!existing.companyEmail && j.companyEmail) {
                            existing.companyEmail = j.companyEmail;
                        }
                    }
                });

                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return this.getJobs();
            }
        }

        // ==========================================
        // 3. CANDIDATE PROFILE & RESUME METADATA (PER USER)
        // ==========================================
        async saveSeekerProfile(profileData, userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || profileData.email || currentUser?.email || 'default').trim().toLowerCase();
            const current = this.getSeekerProfile(userKey) || {};
            const updated = { 
                ...current, 
                ...profileData, 
                email: userKey !== 'default' ? userKey : (current.email || profileData.email || ''),
                updatedAt: new Date().toISOString() 
            };

            // 1. Store scoped per user
            localStorage.setItem(`smarthire_profile_${userKey}`, JSON.stringify(updated));
            if (updated.id) {
                localStorage.setItem(`smarthire_profile_${updated.id}`, JSON.stringify(updated));
            }
            // Also update active session cache if matches
            if (currentUser && (currentUser.email?.toLowerCase() === userKey || currentUser.id === userKey)) {
                const refreshedUser = { ...currentUser, ...updated };
                localStorage.setItem('smartjob_active_user', JSON.stringify(refreshedUser));
                sessionStorage.setItem('smartjob_active_user', JSON.stringify(refreshedUser));
            }
            // Backward compat
            localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));

            // 2. Persist to Supabase 'profiles' & 'job_seekers' tables
            const client = this.getSupabase();
            const authId = currentUser?.id;
            if (client && authId) {
                try {
                    const seekerUserId = toUUID(authId);
                    // Update profile row
                    await client.from('profiles').update({
                        full_name: updated.fullName || updated.full_name || currentUser.fullName,
                        phone: updated.phone || currentUser.phone || '',
                        location: updated.location || '',
                        updated_at: new Date().toISOString()
                    }).eq('id', seekerUserId);

                    // Upsert job_seekers row
                    await client.from('job_seekers').upsert({
                        user_id: seekerUserId,
                        full_name: updated.fullName || updated.full_name || currentUser.fullName,
                        email: userKey,
                        education: updated.education || updated.qualification || '',
                        skills: Array.isArray(updated.skills) ? updated.skills : (updated.skills ? String(updated.skills).split(',').map(s => s.trim()) : []),
                        experience_years: updated.experience || updated.experience_years || 'Fresher',
                        location: updated.location || '',
                        expected_salary: updated.expectedSalary || '',
                        ats_score: updated.atsScore || 89
                    });
                    console.log("⚡ Candidate profile updated in Supabase cloud database!");
                } catch (e) {
                    console.log("Supabase profile sync notice:", e);
                }
            }

            return updated;
        }

        getSeekerProfile(userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || currentUser?.email || 'default').trim().toLowerCase();
            
            if (userKey !== 'default') {
                try {
                    const scoped = JSON.parse(localStorage.getItem(`smarthire_profile_${userKey}`));
                    if (scoped && (!scoped.email || scoped.email.toLowerCase() === userKey)) {
                        return scoped;
                    }
                } catch (e) {}
            }

            // Only check legacy fallback if userKey is 'default' or if it matches the current user
            try {
                const legacy = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES));
                if (legacy) {
                    const legacyEmail = (legacy.email || '').trim().toLowerCase();
                    const legacyId = (legacy.id || legacy.userId || '').trim().toLowerCase();
                    // NEVER return legacy profile if it belongs to a different email/id
                    if (userKey === 'default' || legacyEmail === userKey || legacyId === userKey) {
                        return legacy;
                    }
                }
            } catch (e) {}

            // If no profile found but we have currentUser matching userKey, synthesize profile from currentUser
            if (currentUser && (userKey === 'default' || currentUser.email?.toLowerCase() === userKey || currentUser.id === userKey)) {
                return {
                    id: currentUser.id,
                    fullName: currentUser.fullName || currentUser.full_name || '',
                    email: currentUser.email || '',
                    phone: currentUser.phone || '',
                    location: currentUser.location || '',
                    role: currentUser.role || 'job_seeker'
                };
            }

            return null;
        }

        async fetchSeekerProfileFromSupabase(userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || currentUser?.email || 'default').trim().toLowerCase();
            const client = this.getSupabase();
            if (!client || userKey === 'default') return this.getSeekerProfile(userKey);

            try {
                const seekerUuid = toUUID(currentUser?.id || userKey);
                // 1. Query job_seekers table by email or user_id
                let jsData = null;
                const { data: jsByEmail } = await client.from('job_seekers').select('*').eq('email', userKey).maybeSingle();
                if (jsByEmail) {
                    jsData = jsByEmail;
                } else {
                    const { data: jsById } = await client.from('job_seekers').select('*').eq('user_id', seekerUuid).maybeSingle();
                    if (jsById) jsData = jsById;
                }

                // 2. Query profiles table
                const { data: profData } = await client.from('profiles').select('*').eq('id', seekerUuid).maybeSingle();

                if (jsData || profData) {
                    const existing = this.getSeekerProfile(userKey) || {};
                    const merged = {
                        ...existing,
                        id: seekerUuid,
                        email: userKey,
                        fullName: jsData?.full_name || profData?.full_name || existing.fullName || currentUser?.fullName || '',
                        phone: profData?.phone || existing.phone || currentUser?.phone || '',
                        location: jsData?.location || profData?.location || existing.location || '',
                        qualification: jsData?.education || existing.qualification || "Bachelor's Degree",
                        skills: (jsData?.skills && Array.isArray(jsData.skills) && jsData.skills.length > 0) ? jsData.skills : (existing.skills || []),
                        experience: jsData?.experience_years || existing.experience || 'Fresher',
                        expectedSalary: jsData?.expected_salary || existing.expectedSalary || '',
                        atsScore: jsData?.ats_score || existing.atsScore || 85,
                        updatedAt: new Date().toISOString()
                    };

                    localStorage.setItem(`smarthire_profile_${userKey}`, JSON.stringify(merged));
                    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(merged));
                    return merged;
                }
            } catch (e) {
                console.warn("Supabase fetchSeekerProfile notice:", e);
            }
            return this.getSeekerProfile(userKey);
        }

        // ==========================================
        // 3B. AI RESUME ANALYSIS PERSISTENCE & HISTORY
        // ==========================================
        async saveResumeAnalysis(analysisData, userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || currentUser?.email || 'default').trim().toLowerCase();
            
            const record = {
                ...analysisData,
                id: 'analysis_' + Date.now(),
                userKey: userKey,
                savedAt: new Date().toISOString()
            };

            // 1. Save latest analysis scoped to user
            try {
                localStorage.setItem(`smarthire_resume_analysis_${userKey}`, JSON.stringify(record));
                // Also update history list
                const historyKey = `smarthire_resume_history_${userKey}`;
                let history = [];
                try {
                    history = JSON.parse(localStorage.getItem(historyKey)) || [];
                } catch (e) {}
                history.unshift({
                    id: record.id,
                    filename: record.filename,
                    savedAt: record.savedAt,
                    atsScore: record.analysis?.ats_analysis?.total_score || 0,
                    technicalSkillsCount: record.analysis?.skills_analysis?.technical_skills?.length || 0,
                    spellingCount: record.analysis?.spelling_mistakes?.length || 0
                });
                // Keep last 10 entries
                localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 10)));
            } catch (e) {
                console.warn("Storage warning saving resume analysis:", e);
            }

            // 2. Extract ATS score & newly found skills to sync with candidate profile in Supabase
            const atsScore = record.analysis?.ats_analysis?.total_score || record.ats_score;
            const techSkills = record.analysis?.skills_analysis?.technical_skills || [];
            const softSkills = record.analysis?.skills_analysis?.soft_skills || [];
            const newSkills = [...techSkills, ...softSkills];

            const existingProfile = this.getSeekerProfile(userKey) || {};
            let mergedSkills = existingProfile.skills || [];
            if (typeof mergedSkills === 'string') {
                mergedSkills = mergedSkills.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (newSkills.length > 0) {
                const skillSet = new Set(mergedSkills.map(s => s.toLowerCase()));
                newSkills.forEach(s => {
                    if (s && !skillSet.has(s.toLowerCase())) {
                        mergedSkills.push(s);
                        skillSet.add(s.toLowerCase());
                    }
                });
            }

            try {
                await this.saveSeekerProfile({
                    atsScore: atsScore || existingProfile.atsScore || 85,
                    skills: mergedSkills,
                    lastResumeAnalyzed: record.filename,
                    lastResumeAnalysisDate: record.savedAt
                }, userKey);
            } catch (e) {
                console.warn("Profile sync error on resume analysis:", e);
            }

            // Emit custom event to refresh UI across active tabs
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('smarthire_resume_analyzed', {
                    detail: { record, atsScore, skills: mergedSkills }
                }));
            }

            return record;
        }

        getLatestResumeAnalysis(userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || currentUser?.email || 'default').trim().toLowerCase();
            try {
                const stored = localStorage.getItem(`smarthire_resume_analysis_${userKey}`);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        }

        getResumeAnalysisHistory(userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || currentUser?.email || 'default').trim().toLowerCase();
            try {
                const stored = localStorage.getItem(`smarthire_resume_history_${userKey}`);
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                return [];
            }
        }

        async applyResumeSkillSuggestions(newSkillsList = [], userEmailOrId = '') {
            const currentUser = window.auth?.getCurrentUser();
            const userKey = (userEmailOrId || currentUser?.email || 'default').trim().toLowerCase();
            const profile = this.getSeekerProfile(userKey) || {};

            let currentSkills = [];
            if (Array.isArray(profile.skills)) {
                currentSkills = [...profile.skills];
            } else if (typeof profile.skills === 'string' && profile.skills.trim()) {
                currentSkills = profile.skills.split(',').map(s => s.trim()).filter(Boolean);
            }

            const currentLower = new Set(currentSkills.map(s => s.toLowerCase()));
            const added = [];

            for (const skill of newSkillsList) {
                if (skill && !currentLower.has(skill.toLowerCase())) {
                    currentSkills.push(skill);
                    currentLower.add(skill.toLowerCase());
                    added.push(skill);
                }
            }

            const updatedProfile = await this.saveSeekerProfile({
                skills: currentSkills
            }, userKey);

            return { updatedProfile, addedSkills: added, totalSkills: currentSkills };
        }

        // ==========================================
        // NOTIFICATIONS SYSTEM (PER USER ISOLATION)
        // ==========================================
        getAllNotifications() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || [];
            } catch (e) {
                return [];
            }
        }

        async addNotification(notifData) {
            const newNotif = {
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                userId: String(notifData.userId || '').trim().toLowerCase(),
                userEmail: String(notifData.userEmail || '').trim().toLowerCase(),
                title: notifData.title || 'Notification',
                message: notifData.message || '',
                type: notifData.type || 'info', // 'success', 'info', 'warning'
                link: notifData.link || '',
                isRead: false,
                status: 'unread',
                createdAt: new Date().toISOString()
            };

            let notifs = this.getAllNotifications();
            notifs.unshift(newNotif);
            if (notifs.length > 150) notifs = notifs.slice(0, 150);
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));

            // Real-time custom event
            window.dispatchEvent(new CustomEvent('smartjob_new_notification', { detail: newNotif }));

            // Supabase Cloud sync
            const client = this.getSupabase();
            if (client && (newNotif.userId || newNotif.userEmail)) {
                try {
                    const uid = toUUID(newNotif.userId || newNotif.userEmail);
                    await client.from('notifications').insert([{
                        notification_id: toUUID(newNotif.id),
                        user_id: uid,
                        message: `${newNotif.title}: ${newNotif.message}`,
                        type: newNotif.type,
                        status: 'unread'
                    }]);
                } catch (e) {
                    console.log("Supabase notification insert notice:", e);
                }
            }

            return newNotif;
        }

        getNotifications(userEmailOrId) {
            if (!userEmailOrId) return [];
            const target = String(userEmailOrId).trim().toLowerCase();
            const all = this.getAllNotifications();
            return all.filter(n => {
                const nEmail = String(n.userEmail || '').trim().toLowerCase();
                const nUserId = String(n.userId || '').trim().toLowerCase();
                return nEmail === target || nUserId === target;
            });
        }

        markNotificationRead(notificationId, userEmailOrId) {
            let all = this.getAllNotifications();
            const idx = all.findIndex(n => String(n.id) === String(notificationId));
            if (idx >= 0) {
                all[idx].isRead = true;
                all[idx].status = 'read';
                localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
            }
            return true;
        }

        markAllNotificationsRead(userEmailOrId) {
            if (!userEmailOrId) return true;
            const target = String(userEmailOrId).trim().toLowerCase();
            let all = this.getAllNotifications();
            all.forEach(n => {
                const nEmail = String(n.userEmail || '').trim().toLowerCase();
                const nUserId = String(n.userId || '').trim().toLowerCase();
                if (nEmail === target || nUserId === target) {
                    n.isRead = true;
                    n.status = 'read';
                }
            });
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
            return true;
        }

        getUnreadNotificationCount(userEmailOrId) {
            const list = this.getNotifications(userEmailOrId);
            return list.filter(n => !n.isRead && n.status !== 'read').length;
        }

        // ==========================================
        // 4. SAVED JOBS (SUPABASE POSTGRESQL + LOCAL)
        // ==========================================
        getSavedJobs() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_JOBS) || localStorage.getItem('smartjob_saved_jobs') || '[]');
            } catch (e) {
                return [];
            }
        }

        async saveJobCloud(jobId, jobData, seekerEmail = '') {
            let saved = this.getSavedJobs();
            const idStr = String(jobId);
            if (!saved.includes(idStr)) {
                saved.push(idStr);
                localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify(saved));
                localStorage.setItem('smartjob_saved_jobs', JSON.stringify(saved));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    const seekerId = toUUID(seekerEmail || window.auth?.getCurrentUser()?.email || 'seeker_default');
                    const dbJobId = toUUID(idStr);
                    const savedId = toUUID((seekerEmail || 'seeker') + '_' + idStr);

                    const { data, error } = await client.from('saved_jobs').upsert({
                        saved_id: savedId,
                        seeker_id: seekerId,
                        job_id: dbJobId,
                        job_title: jobData?.title || 'Job Opening',
                        company: jobData?.company || 'Company',
                        saved_date: new Date().toISOString()
                    }).select();

                    if (error) {
                        console.warn("Supabase saved_jobs insert notice:", error.message || error);
                    } else {
                        console.log("⚡ Saved job synced with Supabase 'saved_jobs' database table!", data);
                    }
                } catch (e) {
                    console.log("Supabase saved_jobs notice:", e);
                }
            }
            return saved;
        }

        async removeSavedJobCloud(jobId, seekerEmail = '') {
            let saved = this.getSavedJobs();
            const idStr = String(jobId);
            saved = saved.filter(id => id !== idStr);
            localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify(saved));
            localStorage.setItem('smartjob_saved_jobs', JSON.stringify(saved));

            const client = this.getSupabase();
            if (client) {
                try {
                    const seekerId = toUUID(seekerEmail || window.auth?.getCurrentUser()?.email || 'seeker_default');
                    const dbJobId = toUUID(idStr);
                    await client.from('saved_jobs').delete().match({ seeker_id: seekerId, job_id: dbJobId });
                    console.log("⚡ Removed saved job from Supabase 'saved_jobs' table!");
                } catch (e) {
                    console.log("Supabase remove saved notice:", e);
                }
            }
            return saved;
        }

        async syncSavedJobsFromSupabase(seekerEmail = '') {
            const client = this.getSupabase();
            if (!client) return this.getSavedJobs();

            try {
                const seekerId = toUUID(seekerEmail || window.auth?.getCurrentUser()?.email || 'seeker_default');
                const { data, error } = await client.from('saved_jobs').select('*').eq('seeker_id', seekerId);
                if (!error && Array.isArray(data)) {
                    const cloudSavedIds = data.map(d => String(d.job_id));
                    const localSaved = this.getSavedJobs();
                    const merged = Array.from(new Set([...localSaved, ...cloudSavedIds]));
                    localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify(merged));
                    localStorage.setItem('smartjob_saved_jobs', JSON.stringify(merged));
                    return merged;
                }
            } catch (e) {
                console.log("Supabase sync saved_jobs error:", e);
            }
            return this.getSavedJobs();
        }

        // ==========================================
        // 5. INTERVIEWS (CONNECTED TO SAME APPLICATION)
        // ==========================================
        getInterviews() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.INTERVIEWS)) || [];
            } catch (e) {
                return [];
            }
        }

        getInterviewByApplicationId(appId) {
            if (!appId) return null;
            const target = String(appId).trim();
            const all = this.getInterviews();
            return all.find(i => String(i.applicationId || i.application_id) === target || String(i.id || i.interview_id) === target) || null;
        }

        getInterviewsForCandidate(candidateEmailOrId) {
            if (!candidateEmailOrId) return [];
            const target = String(candidateEmailOrId).trim().toLowerCase();
            const all = this.getInterviews();
            return all.filter(i => {
                const cMail = String(i.candidateEmail || i.candidate_email || '').trim().toLowerCase();
                const cId = String(i.candidateId || i.candidate_id || '').trim().toLowerCase();
                return cMail === target || cId === target;
            });
        }

        getInterviewsForCompany(companyIdOrName, companyEmail = '') {
            const all = this.getInterviews();
            const cId = String(companyIdOrName || '').trim().toLowerCase();
            const cEmail = String(companyEmail || '').trim().toLowerCase();
            if (!cId && !cEmail) return all;
            return all.filter(i => {
                const iCompId = String(i.companyId || i.company_id || '').trim().toLowerCase();
                const iCompName = String(i.companyName || i.company_name || '').trim().toLowerCase();
                return (cId && (iCompId === cId || iCompName === cId)) || (cEmail && iCompId === cEmail);
            });
        }

        async scheduleInterview(data) {
            const appId = toUUID(data.applicationId || data.application_id);
            const rawId = data.id || data.interview_id || generateUUID();
            const interviewId = toUUID(rawId);

            // Fetch matched application to preserve single-application record
            const apps = this.getApplications();
            const appIdx = apps.findIndex(a => String(a.id) === String(appId) || String(a.application_id) === String(appId));
            const targetApp = appIdx >= 0 ? apps[appIdx] : null;

            const candidateEmail = (data.candidateEmail || data.candidate_email || targetApp?.applicantEmail || targetApp?.email || '').trim().toLowerCase();
            const candidateName = data.candidateName || data.candidate_name || targetApp?.applicantName || targetApp?.fullName || 'Candidate';
            const companyName = data.companyName || data.company_name || targetApp?.company || 'Company';
            const companyId = data.companyId || data.company_id || targetApp?.companyId || targetApp?.company_id || '';
            const jobId = data.jobId || data.job_id || targetApp?.jobId || targetApp?.job_id || '';
            const jobTitle = data.jobTitle || data.job_title || targetApp?.jobTitle || 'Job Opening';

            const newInterview = {
                id: interviewId,
                interview_id: interviewId,
                applicationId: appId,
                application_id: appId,
                jobId: jobId ? toUUID(jobId) : null,
                job_id: jobId ? toUUID(jobId) : null,
                companyId: companyId ? toUUID(companyId) : null,
                company_id: companyId ? toUUID(companyId) : null,
                candidateId: targetApp?.candidateId ? toUUID(targetApp.candidateId) : null,
                candidate_id: targetApp?.candidateId ? toUUID(targetApp.candidateId) : null,
                candidateEmail: candidateEmail,
                candidate_email: candidateEmail,
                candidateName: candidateName,
                candidate_name: candidateName,
                companyName: companyName,
                company_name: companyName,
                jobTitle: jobTitle,
                job_title: jobTitle,
                interviewRound: data.interviewRound || data.round || 'Technical Round 1',
                interviewDate: data.interviewDate || data.date,
                interview_date: data.interviewDate || data.date,
                interviewTime: data.interviewTime || data.time,
                interview_time: data.interviewTime || data.time,
                interviewMode: data.interviewMode || data.mode || 'Online',
                interview_mode: data.interviewMode || data.mode || 'Online',
                meetingLink: data.meetingLink || data.meeting_link || '',
                meeting_link: data.meetingLink || data.meeting_link || '',
                location: data.location || '',
                instructions: data.instructions || data.notes || '',
                status: 'Scheduled', // 'Scheduled', 'Accepted', 'Rejected', 'Completed', 'Cancelled'
                result: 'Pending',   // 'Pending', 'Selected', 'Rejected', 'On Hold'
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // 1. Update/Add in Interviews Store
            const interviews = this.getInterviews();
            const existingIntIdx = interviews.findIndex(i => 
                String(i.id) === String(newInterview.id) || 
                String(i.applicationId || i.application_id) === String(appId)
            );
            if (existingIntIdx >= 0) {
                interviews[existingIntIdx] = { ...interviews[existingIntIdx], ...newInterview };
            } else {
                interviews.unshift(newInterview);
            }
            localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(interviews));

            // 2. Update existing application status (ONE application invariant - NO duplicates!)
            if (appIdx >= 0) {
                apps[appIdx].status = 'Interview Scheduled';
                apps[appIdx].interviewId = interviewId;
                apps[appIdx].interviewDetails = newInterview;
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            // 3. Sync to Supabase
            const client = this.getSupabase();
            if (client) {
                try {
                    const sbPayload = {
                        interview_id: interviewId,
                        application_id: appId,
                        job_id: newInterview.jobId,
                        company_id: newInterview.companyId,
                        candidate_id: newInterview.candidateId,
                        candidate_email: candidateEmail,
                        candidate_name: candidateName,
                        company_name: companyName,
                        job_title: jobTitle,
                        interview_round: newInterview.interviewRound,
                        interview_date: newInterview.interviewDate,
                        interview_time: newInterview.interviewTime,
                        interview_mode: newInterview.interviewMode,
                        meeting_link: newInterview.meetingLink,
                        location: newInterview.location,
                        instructions: newInterview.instructions,
                        status: newInterview.status,
                        result: newInterview.result,
                        updated_at: new Date().toISOString()
                    };
                    await client.from('interviews').upsert([sbPayload]);
                    await client.from('applications').update({ status: 'Interview Scheduled' }).eq('application_id', appId);
                } catch (e) {
                    console.warn("Supabase scheduleInterview notice:", e);
                }
            }

            // 4. Send Interview Invitation Notification to Candidate
            this.addNotification({
                userId: targetApp?.candidateId || candidateEmail,
                userEmail: candidateEmail,
                title: '📅 Interview Scheduled',
                message: `${companyName} has invited you for an interview for "${jobTitle}" on ${newInterview.interviewDate} at ${newInterview.interviewTime} (${newInterview.interviewMode}). Please review and confirm your attendance.`,
                type: 'info',
                link: 'seeker-dashboard.html?tab=tab-history'
            });

            window.dispatchEvent(new CustomEvent('smarthire_interview_updated', { detail: newInterview }));
            return newInterview;
        }

        async respondToInterview(interviewId, response, notes = '') {
            const intId = toUUID(interviewId);
            const interviews = this.getInterviews();
            const idx = interviews.findIndex(i => String(i.id) === String(interviewId) || String(i.interview_id) === String(interviewId) || String(i.id) === String(intId));
            if (idx === -1) return null;

            const targetInt = interviews[idx];
            targetInt.status = response; // 'Accepted' or 'Rejected'
            targetInt.candidate_response_at = new Date().toISOString();
            targetInt.candidateNotes = notes;
            targetInt.updatedAt = new Date().toISOString();
            interviews[idx] = targetInt;
            localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(interviews));

            // Update linked application
            const appId = targetInt.applicationId || targetInt.application_id;
            const newAppStatus = response === 'Accepted' ? 'Interview Accepted' : 'Interview Rejected';
            const apps = this.getApplications();
            const appIdx = apps.findIndex(a => String(a.id) === String(appId) || String(a.application_id) === String(appId));
            if (appIdx >= 0) {
                apps[appIdx].status = newAppStatus;
                if (!apps[appIdx].interviewDetails) apps[appIdx].interviewDetails = targetInt;
                else apps[appIdx].interviewDetails.status = response;
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            // Supabase sync
            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('interviews').update({ 
                        status: response, 
                        candidate_response_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('interview_id', toUUID(interviewId));
                    if (appId) {
                        await client.from('applications').update({ status: newAppStatus }).eq('application_id', toUUID(appId));
                    }
                } catch (e) {
                    console.warn("Supabase respondToInterview notice:", e);
                }
            }

            // Send notification to Company
            this.addNotification({
                userId: targetInt.companyId || targetInt.companyName,
                userEmail: targetInt.companyName,
                title: `Candidate ${response} Interview`,
                message: `${targetInt.candidateName} has ${response.toLowerCase()} the interview invitation for "${targetInt.jobTitle}" scheduled for ${targetInt.interviewDate}.`,
                type: response === 'Accepted' ? 'success' : 'warning',
                link: 'company-dashboard.html'
            });

            window.dispatchEvent(new CustomEvent('smarthire_interview_updated', { detail: targetInt }));
            return targetInt;
        }

        async updateInterviewResult(interviewId, result, feedback = '') {
            const interviews = this.getInterviews();
            const idx = interviews.findIndex(i => String(i.id) === String(interviewId) || String(i.interview_id) === String(interviewId));
            if (idx === -1) return null;

            const targetInt = interviews[idx];
            targetInt.result = result; // 'Selected', 'Rejected', 'On Hold'
            targetInt.status = 'Completed';
            targetInt.companyFeedback = feedback;
            targetInt.updatedAt = new Date().toISOString();
            interviews[idx] = targetInt;
            localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(interviews));

            // Update linked application
            const appId = targetInt.applicationId || targetInt.application_id;
            let newAppStatus = 'Interview Completed';
            if (result === 'Selected') newAppStatus = 'Selected';
            else if (result === 'Rejected') newAppStatus = 'Rejected';
            else if (result === 'On Hold') newAppStatus = 'On Hold';

            const apps = this.getApplications();
            const appIdx = apps.findIndex(a => String(a.id) === String(appId) || String(a.application_id) === String(appId));
            if (appIdx >= 0) {
                apps[appIdx].status = newAppStatus;
                if (!apps[appIdx].interviewDetails) apps[appIdx].interviewDetails = targetInt;
                else {
                    apps[appIdx].interviewDetails.result = result;
                    apps[appIdx].interviewDetails.status = 'Completed';
                }
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            // Supabase sync
            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('interviews').update({ 
                        result: result, 
                        status: 'Completed',
                        updated_at: new Date().toISOString()
                    }).eq('interview_id', toUUID(interviewId));
                    if (appId) {
                        await client.from('applications').update({ status: newAppStatus }).eq('application_id', toUUID(appId));
                    }
                } catch (e) {
                    console.warn("Supabase updateInterviewResult notice:", e);
                }
            }

            // Notification to candidate
            this.addNotification({
                userId: targetInt.candidateId || targetInt.candidateEmail,
                userEmail: targetInt.candidateEmail,
                title: result === 'Selected' ? '🎉 Congratulations! You are Selected' : 'Interview Result Update',
                message: result === 'Selected' 
                    ? `Great news! ${targetInt.companyName} has evaluated your interview and marked you as Selected for "${targetInt.jobTitle}". Your official offer letter will be sent soon.`
                    : `Your interview round for "${targetInt.jobTitle}" at ${targetInt.companyName} is marked as "${result}".`,
                type: result === 'Selected' ? 'success' : (result === 'Rejected' ? 'warning' : 'info'),
                link: 'seeker-dashboard.html?tab=tab-history'
            });

            window.dispatchEvent(new CustomEvent('smarthire_interview_updated', { detail: targetInt }));
            return targetInt;
        }

        async fetchInterviewsFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getInterviews();
            try {
                const { data, error } = await client.from('interviews').select('*').order('created_at', { ascending: false });
                if (error || !data) return this.getInterviews();
                const cloudInts = data.map(i => ({
                    id: i.interview_id,
                    interview_id: i.interview_id,
                    applicationId: i.application_id,
                    application_id: i.application_id,
                    jobId: i.job_id,
                    job_id: i.job_id,
                    companyId: i.company_id,
                    company_id: i.company_id,
                    candidateId: i.candidate_id,
                    candidate_id: i.candidate_id,
                    candidateEmail: i.candidate_email,
                    candidate_email: i.candidate_email,
                    candidateName: i.candidate_name,
                    candidate_name: i.candidate_name,
                    companyName: i.company_name,
                    company_name: i.company_name,
                    jobTitle: i.job_title,
                    job_title: i.job_title,
                    interviewRound: i.interview_round,
                    interviewDate: i.interview_date,
                    interview_date: i.interview_date,
                    interviewTime: i.interview_time,
                    interview_time: i.interview_time,
                    interviewMode: i.interview_mode,
                    interview_mode: i.interview_mode,
                    meetingLink: i.meeting_link,
                    meeting_link: i.meeting_link,
                    location: i.location,
                    instructions: i.instructions,
                    status: i.status || 'Scheduled',
                    result: i.result || 'Pending',
                    candidate_response_at: i.candidate_response_at,
                    createdAt: i.created_at,
                    updatedAt: i.updated_at
                }));

                const localInts = this.getInterviews();
                const mergedMap = new Map();
                cloudInts.forEach(i => mergedMap.set(String(i.id), i));
                localInts.forEach(i => {
                    const key = String(i.id || i.interview_id);
                    if (!mergedMap.has(key)) mergedMap.set(key, i);
                });
                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.INTERVIEWS, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return this.getInterviews();
            }
        }

        // ==========================================
        // 6. OFFER LETTERS (CONNECTED TO SAME APPLICATION)
        // ==========================================
        getOfferLetters() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFERS)) || [];
            } catch (e) {
                return [];
            }
        }

        getOfferByApplicationId(appId) {
            if (!appId) return null;
            const target = String(appId).trim();
            const all = this.getOfferLetters();
            return all.find(o => String(o.applicationId || o.application_id) === target || String(o.id || o.offer_id) === target) || null;
        }

        getOffersForCandidate(candidateEmailOrId) {
            if (!candidateEmailOrId) return [];
            const target = String(candidateEmailOrId).trim().toLowerCase();
            const all = this.getOfferLetters();
            return all.filter(o => {
                const cMail = String(o.candidateEmail || o.candidate_email || '').trim().toLowerCase();
                const cId = String(o.candidateId || o.candidate_id || '').trim().toLowerCase();
                return cMail === target || cId === target;
            });
        }

        getOffersForCompany(companyIdOrName, companyEmail = '') {
            const all = this.getOfferLetters();
            const cId = String(companyIdOrName || '').trim().toLowerCase();
            const cEmail = String(companyEmail || '').trim().toLowerCase();
            if (!cId && !cEmail) return all;
            return all.filter(o => {
                const oCompId = String(o.companyId || o.company_id || '').trim().toLowerCase();
                const oCompName = String(o.companyName || o.company_name || '').trim().toLowerCase();
                return (cId && (oCompId === cId || oCompName === cId)) || (cEmail && oCompId === cEmail);
            });
        }

        async sendOfferLetter(data) {
            const appId = toUUID(data.applicationId || data.application_id);
            const rawId = data.id || data.offer_id || generateUUID();
            const offerId = toUUID(rawId);

            // Fetch matched application to preserve single-application record
            const apps = this.getApplications();
            const appIdx = apps.findIndex(a => String(a.id) === String(appId) || String(a.application_id) === String(appId));
            const targetApp = appIdx >= 0 ? apps[appIdx] : null;

            const candidateEmail = (data.candidateEmail || data.candidate_email || targetApp?.applicantEmail || targetApp?.email || '').trim().toLowerCase();
            const candidateName = data.candidateName || data.candidate_name || targetApp?.applicantName || targetApp?.fullName || 'Candidate';
            const companyName = data.companyName || data.company_name || targetApp?.company || 'Company';
            const companyId = data.companyId || data.company_id || targetApp?.companyId || targetApp?.company_id || '';
            const jobId = data.jobId || data.job_id || targetApp?.jobId || targetApp?.job_id || '';
            const position = data.position || data.role || targetApp?.jobTitle || 'Software Engineer';
            const salaryCtc = data.salaryCtc || data.salary || data.ctc || '₹8,50,000 Per Annum';
            const joiningDate = data.joiningDate || data.joining_date;
            const employmentType = data.employmentType || data.employment_type || 'Full-time';
            const workLocation = data.workLocation || data.work_location || data.location || 'Hybrid';
            const expiryDate = data.expiryDate || data.expiry_date || '';
            const additionalTerms = data.additionalTerms || data.additional_terms || data.terms || '';

            const newOffer = {
                id: offerId,
                offer_id: offerId,
                applicationId: appId,
                application_id: appId,
                jobId: jobId ? toUUID(jobId) : null,
                job_id: jobId ? toUUID(jobId) : null,
                companyId: companyId ? toUUID(companyId) : null,
                company_id: companyId ? toUUID(companyId) : null,
                candidateId: targetApp?.candidateId ? toUUID(targetApp.candidateId) : null,
                candidate_id: targetApp?.candidateId ? toUUID(targetApp.candidateId) : null,
                candidateEmail: candidateEmail,
                candidate_email: candidateEmail,
                candidateName: candidateName,
                candidate_name: candidateName,
                companyName: companyName,
                company_name: companyName,
                position: position,
                salaryCtc: salaryCtc,
                salary_ctc: salaryCtc,
                joiningDate: joiningDate,
                joining_date: joiningDate,
                employmentType: employmentType,
                employment_type: employmentType,
                workLocation: workLocation,
                work_location: workLocation,
                expiryDate: expiryDate,
                expiry_date: expiryDate,
                additionalTerms: additionalTerms,
                additional_terms: additionalTerms,
                status: 'Pending', // 'Pending', 'Accepted', 'Rejected', 'Expired'
                sentAt: new Date().toISOString(),
                sent_at: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // 1. Update/Add in Offers Store
            const offers = this.getOfferLetters();
            const existingOffIdx = offers.findIndex(o => 
                String(o.id) === String(newOffer.id) || 
                String(o.applicationId || o.application_id) === String(appId)
            );
            if (existingOffIdx >= 0) {
                offers[existingOffIdx] = { ...offers[existingOffIdx], ...newOffer };
            } else {
                offers.unshift(newOffer);
            }
            localStorage.setItem(STORAGE_KEYS.OFFERS, JSON.stringify(offers));

            // 2. Update existing application status (ONE application invariant - NO duplicates!)
            if (appIdx >= 0) {
                apps[appIdx].status = 'Offer Sent';
                apps[appIdx].offerId = offerId;
                apps[appIdx].offerDetails = newOffer;
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            // 3. Supabase sync
            const client = this.getSupabase();
            if (client) {
                try {
                    const sbPayload = {
                        offer_id: offerId,
                        application_id: appId,
                        job_id: newOffer.jobId,
                        company_id: newOffer.companyId,
                        candidate_id: newOffer.candidateId,
                        candidate_email: candidateEmail,
                        candidate_name: candidateName,
                        company_name: companyName,
                        position: position,
                        salary_ctc: salaryCtc,
                        joining_date: joiningDate,
                        employment_type: employmentType,
                        work_location: workLocation,
                        expiry_date: expiryDate || null,
                        additional_terms: additionalTerms,
                        status: 'Pending',
                        sent_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    await client.from('offer_letters').upsert([sbPayload]);
                    await client.from('applications').update({ status: 'Offer Sent' }).eq('application_id', appId);
                } catch (e) {
                    console.warn("Supabase sendOfferLetter notice:", e);
                }
            }

            // 4. Candidate Notification
            this.addNotification({
                userId: targetApp?.candidateId || candidateEmail,
                userEmail: candidateEmail,
                title: '💼 Official Offer Letter Received',
                message: `${companyName} has issued your official Job Offer Letter for "${position}" (Salary: ${salaryCtc}). Please review the terms and respond.`,
                type: 'success',
                link: 'seeker-dashboard.html?tab=tab-history'
            });

            window.dispatchEvent(new CustomEvent('smarthire_offer_updated', { detail: newOffer }));
            return newOffer;
        }

        async respondToOffer(offerId, response, comments = '') {
            const offId = toUUID(offerId);
            const offers = this.getOfferLetters();
            const idx = offers.findIndex(o => String(o.id) === String(offerId) || String(o.offer_id) === String(offerId) || String(o.id) === String(offId));
            if (idx === -1) return null;

            const targetOffer = offers[idx];
            targetOffer.status = response; // 'Accepted' or 'Rejected'
            targetOffer.responded_at = new Date().toISOString();
            targetOffer.candidateComments = comments;
            targetOffer.updatedAt = new Date().toISOString();
            offers[idx] = targetOffer;
            localStorage.setItem(STORAGE_KEYS.OFFERS, JSON.stringify(offers));

            // Update linked application
            const appId = targetOffer.applicationId || targetOffer.application_id;
            const newAppStatus = response === 'Accepted' ? 'Offer Accepted' : 'Offer Rejected';
            const apps = this.getApplications();
            const appIdx = apps.findIndex(a => String(a.id) === String(appId) || String(a.application_id) === String(appId));
            if (appIdx >= 0) {
                apps[appIdx].status = newAppStatus;
                if (response === 'Accepted') {
                    apps[appIdx].confirmedJoiningDate = targetOffer.joiningDate || targetOffer.joining_date;
                }
                if (!apps[appIdx].offerDetails) apps[appIdx].offerDetails = targetOffer;
                else apps[appIdx].offerDetails.status = response;
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            // Supabase sync
            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('offer_letters').update({ 
                        status: response, 
                        responded_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }).eq('offer_id', toUUID(offerId));
                    if (appId) {
                        await client.from('applications').update({ status: newAppStatus }).eq('application_id', toUUID(appId));
                    }
                } catch (e) {
                    console.warn("Supabase respondToOffer notice:", e);
                }
            }

            // Notify Company
            this.addNotification({
                userId: targetOffer.companyId || targetOffer.companyName,
                userEmail: targetOffer.companyName,
                title: `Offer ${response} by Candidate`,
                message: `${targetOffer.candidateName} has ${response.toLowerCase()} the formal offer letter for "${targetOffer.position}".${response === 'Accepted' ? ` Confirmed Joining Date: ${targetOffer.joiningDate || targetOffer.joining_date}.` : ''}`,
                type: response === 'Accepted' ? 'success' : 'warning',
                link: 'company-dashboard.html'
            });

            window.dispatchEvent(new CustomEvent('smarthire_offer_updated', { detail: targetOffer }));
            return targetOffer;
        }

        async fetchOffersFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getOfferLetters();
            try {
                const { data, error } = await client.from('offer_letters').select('*').order('created_at', { ascending: false });
                if (error || !data) return this.getOfferLetters();
                const cloudOffers = data.map(o => ({
                    id: o.offer_id,
                    offer_id: o.offer_id,
                    applicationId: o.application_id,
                    application_id: o.application_id,
                    jobId: o.job_id,
                    job_id: o.job_id,
                    companyId: o.company_id,
                    company_id: o.company_id,
                    candidateId: o.candidate_id,
                    candidate_id: o.candidate_id,
                    candidateEmail: o.candidate_email,
                    candidate_email: o.candidate_email,
                    candidateName: o.candidate_name,
                    candidate_name: o.candidate_name,
                    companyName: o.company_name,
                    company_name: o.company_name,
                    position: o.position,
                    salaryCtc: o.salary_ctc,
                    salary_ctc: o.salary_ctc,
                    joiningDate: o.joining_date,
                    joining_date: o.joining_date,
                    employmentType: o.employment_type,
                    employment_type: o.employment_type,
                    workLocation: o.work_location,
                    work_location: o.work_location,
                    expiryDate: o.expiry_date,
                    expiry_date: o.expiry_date,
                    additionalTerms: o.additional_terms,
                    additional_terms: o.additional_terms,
                    status: o.status || 'Pending',
                    sentAt: o.sent_at,
                    sent_at: o.sent_at,
                    responded_at: o.responded_at,
                    createdAt: o.created_at,
                    updatedAt: o.updated_at
                }));

                const localOffers = this.getOfferLetters();
                const mergedMap = new Map();
                cloudOffers.forEach(o => mergedMap.set(String(o.id), o));
                localOffers.forEach(o => {
                    const key = String(o.id || o.offer_id);
                    if (!mergedMap.has(key)) mergedMap.set(key, o);
                });
                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.OFFERS, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return this.getOfferLetters();
            }
        }

        // ==========================================
        // 7. REAL USER FEEDBACK & REVIEWS
        // ==========================================
        getFeedback() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.FEEDBACK)) || [];
            } catch (e) {
                return [];
            }
        }

        async saveFeedback(feedbackData) {
            const rawId = feedbackData.id || generateUUID();
            const fbId = toUUID(rawId);
            const currentAuth = window.auth?.getCurrentUser();
            
            const newFeedback = {
                id: fbId,
                userId: feedbackData.userId || currentAuth?.id || 'anonymous',
                userName: feedbackData.userName || feedbackData.name || currentAuth?.fullName || 'Verified User',
                userEmail: (feedbackData.userEmail || feedbackData.email || currentAuth?.email || '').trim().toLowerCase(),
                userRole: feedbackData.userRole || feedbackData.role || currentAuth?.role || 'Job Seeker',
                rating: Math.max(1, Math.min(5, Number(feedbackData.rating || 5))),
                comment: (feedbackData.comment || feedbackData.feedback || '').trim(),
                createdAt: feedbackData.createdAt || new Date().toISOString()
            };

            const allFb = this.getFeedback();
            allFb.unshift(newFeedback);
            localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify(allFb));

            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('user_feedback').insert([{
                        id: fbId,
                        user_id: newFeedback.userId !== 'anonymous' ? toUUID(newFeedback.userId) : null,
                        user_name: newFeedback.userName,
                        user_email: newFeedback.userEmail,
                        user_role: newFeedback.userRole,
                        rating: newFeedback.rating,
                        comment: newFeedback.comment,
                        created_at: newFeedback.createdAt
                    }]);
                } catch (e) {
                    console.warn("Supabase user_feedback insert notice (saved locally):", e);
                }
            }

            return newFeedback;
        }

        async fetchFeedbackFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getFeedback();
            try {
                const { data, error } = await client.from('user_feedback').select('*').order('created_at', { ascending: false });
                if (error || !data) {
                    return this.getFeedback();
                }
                const cloudFb = data.map(f => ({
                    id: f.id,
                    userId: f.user_id,
                    userName: f.user_name || 'Verified User',
                    userEmail: f.user_email || '',
                    userRole: f.user_role || 'Job Seeker',
                    rating: Number(f.rating || 5),
                    comment: f.comment || '',
                    createdAt: f.created_at
                }));
                const localFb = this.getFeedback();
                const mergedMap = new Map();
                cloudFb.forEach(f => mergedMap.set(String(f.id), f));
                localFb.forEach(f => {
                    const key = String(f.id);
                    if (!mergedMap.has(key)) mergedMap.set(key, f);
                });
                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return this.getFeedback();
            }
        }

        // ==========================================
        // 8. REAL-TIME PLATFORM STATISTICS AGGREGATOR
        // ==========================================
        async getPlatformStatistics() {
            const activeJobs = (this.getActiveJobs() || []).length;
            const applications = (this.getApplications() || []).length;

            let jobSeekers = 0;
            let companies = 0;

            if (window.auth && typeof window.auth.getAllUsers === 'function') {
                try {
                    const allUsers = await window.auth.getAllUsers();
                    if (Array.isArray(allUsers)) {
                        jobSeekers = allUsers.filter(u => {
                            const r = (u.role || '').toLowerCase();
                            return r === 'seeker' || r === 'candidate' || (r !== 'company' && r !== 'employer' && r !== 'admin');
                        }).length;
                    }
                } catch (e) {
                    jobSeekers = 0;
                }
            }

            if (window.auth && typeof window.auth.getAllCompanies === 'function') {
                try {
                    const allComps = await window.auth.getAllCompanies();
                    if (Array.isArray(allComps)) {
                        companies = allComps.length;
                    }
                } catch (e) {
                    companies = 0;
                }
            }

            return {
                activeJobs,
                jobSeekers,
                companies,
                applications
            };
        }

        // ==========================================
        // 9. REAL SEEKER AI JOB MATCH CALCULATOR
        // ==========================================
        calculateJobMatch(job, userProfile) {
            if (!userProfile) return null;
            const rawSkills = userProfile.skills || '';
            const skillsArr = Array.isArray(rawSkills) ? rawSkills : String(rawSkills).split(/[\s,]+/);
            const userTokens = skillsArr.map(s => s.trim().toLowerCase()).filter(s => s.length > 1);
            if (userTokens.length === 0) return null;

            const jobSkills = Array.isArray(job.skills) ? job.skills.join(' ') : String(job.skills || '');
            const jobText = `${job.title || ''} ${jobSkills} ${job.description || ''} ${job.category || ''}`.toLowerCase();

            let matchedCount = 0;
            userTokens.forEach(token => {
                if (jobText.includes(token)) matchedCount++;
            });

            if (matchedCount === 0) return null;

            const baseScore = Math.round((matchedCount / Math.max(userTokens.length, 1)) * 60);
            const score = Math.min(99, Math.max(50, 40 + baseScore));
            return score;
        }

        // ==========================================
        // 10. REPORTS & COMPLAINTS (SUPABASE + LOCAL)
        // ==========================================
        getReports() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.REPORTS) || localStorage.getItem('smartjob_admin_reports') || '[]');
            } catch (e) {
                return [];
            }
        }

        async fetchReportsFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getReports();
            try {
                const { data, error } = await client.from('reports').select('*').order('created_at', { ascending: false });
                if (!error && Array.isArray(data)) {
                    const mapped = data.map(r => ({
                        id: r.report_id,
                        report_id: r.report_id,
                        reporter_id: r.reporter_id,
                        reporter: r.reporter_email,
                        reporter_email: r.reporter_email,
                        type: r.type || 'Job',
                        reportedItem: r.reported_item_name || 'Reported Item',
                        reported_item_name: r.reported_item_name,
                        reported_item_id: r.reported_item_id,
                        reason: r.reason,
                        description: r.description,
                        details: r.description,
                        status: r.status || 'Pending',
                        admin_action: r.admin_action || '',
                        resolution_details: r.resolution_details || '',
                        date: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'Recent',
                        createdAt: r.created_at
                    }));
                    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(mapped));
                    localStorage.setItem('smartjob_admin_reports', JSON.stringify(mapped));
                    return mapped;
                }
            } catch(e) {
                console.warn("fetchReportsFromSupabase notice:", e);
            }
            return this.getReports();
        }

        async createReport(reportData) {
            const rawId = reportData.id || generateUUID();
            const repId = toUUID(rawId);
            const newRep = {
                id: repId,
                report_id: repId,
                reporter_id: reportData.reporter_id ? toUUID(reportData.reporter_id) : null,
                reporter: reportData.reporter_email || reportData.reporter || 'Anonymous User',
                reporter_email: reportData.reporter_email || reportData.reporter || '',
                type: reportData.type || 'Job',
                reportedItem: reportData.reported_item_name || reportData.reportedItem || 'Listing',
                reported_item_name: reportData.reported_item_name || reportData.reportedItem || 'Listing',
                reported_item_id: reportData.reported_item_id ? toUUID(reportData.reported_item_id) : null,
                reason: reportData.reason || 'Misleading content',
                description: reportData.description || reportData.details || '',
                details: reportData.description || reportData.details || '',
                status: 'Pending',
                admin_action: '',
                resolution_details: '',
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            };

            let all = this.getReports();
            all.unshift(newRep);
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(all));
            localStorage.setItem('smartjob_admin_reports', JSON.stringify(all));

            // Sync to Supabase
            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('reports').insert([{
                        report_id: repId,
                        reporter_id: newRep.reporter_id,
                        reporter_email: newRep.reporter_email,
                        type: newRep.type,
                        reported_item_id: newRep.reported_item_id,
                        reported_item_name: newRep.reported_item_name,
                        reason: newRep.reason,
                        description: newRep.description,
                        status: 'Pending'
                    }]);
                } catch(e) {
                    console.warn("createReport Supabase insert notice:", e);
                }
            }

            // Also dispatch admin notification
            await this.addNotification({
                userId: 'admin',
                userEmail: 'admin@smartjob.com',
                title: `New Grievance Report: ${newRep.type}`,
                message: `${newRep.reporter} reported "${newRep.reportedItem}": ${newRep.reason}`,
                type: 'warning'
            });

            return newRep;
        }

        async updateReportStatus(reportId, newStatus, adminAction = '', resolutionDetails = '') {
            let all = this.getReports();
            const idx = all.findIndex(r => String(r.id) === String(reportId) || String(r.report_id) === String(reportId));
            if (idx >= 0) {
                all[idx].status = newStatus;
                if (adminAction) all[idx].admin_action = adminAction;
                if (resolutionDetails) all[idx].resolution_details = resolutionDetails;
                localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(all));
                localStorage.setItem('smartjob_admin_reports', JSON.stringify(all));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('reports').update({
                        status: newStatus,
                        admin_action: adminAction,
                        resolution_details: resolutionDetails,
                        updated_at: new Date().toISOString()
                    }).eq('report_id', toUUID(reportId));
                } catch(e) {
                    console.warn("updateReportStatus notice:", e);
                }
            }
            return true;
        }

        async deleteReport(reportId) {
            let all = this.getReports();
            all = all.filter(r => String(r.id) !== String(reportId) && String(r.report_id) !== String(reportId));
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(all));
            localStorage.setItem('smartjob_admin_reports', JSON.stringify(all));

            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('reports').delete().eq('report_id', toUUID(reportId));
                } catch(e) {}
            }
            return true;
        }

        // ==========================================
        // 11. ENHANCED NOTIFICATIONS DISPATCH
        // ==========================================
        async sendAdminAlert({ recipientId, recipientEmail, title, message, type = 'info', relatedRecordId = null }) {
            const notifId = toUUID(generateUUID());
            const recId = recipientId ? toUUID(recipientId) : (recipientEmail ? toUUID(recipientEmail) : null);
            const recEmail = (recipientEmail || '').trim().toLowerCase();

            const newNotif = {
                id: notifId,
                notification_id: notifId,
                userId: recId,
                user_id: recId,
                recipient_id: recId,
                recipientEmail: recEmail,
                recipient_email: recEmail,
                title: title,
                message: message,
                type: type,
                relatedRecordId: relatedRecordId ? toUUID(relatedRecordId) : null,
                related_record_id: relatedRecordId ? toUUID(relatedRecordId) : null,
                isRead: false,
                status: 'unread',
                createdAt: new Date().toISOString()
            };

            let notifs = this.getAllNotifications();
            notifs.unshift(newNotif);
            localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));

            // Sync to Supabase notifications table
            const client = this.getSupabase();
            if (client) {
                try {
                    await client.from('notifications').insert([{
                        notification_id: notifId,
                        user_id: recId,
                        message: `${title}: ${message}`,
                        type: type,
                        status: 'unread'
                    }]);
                } catch (e) {
                    console.warn("Supabase notification insert notice:", e);
                }
            }

            window.dispatchEvent(new CustomEvent('smartjob_new_notification', { detail: newNotif }));
            return newNotif;
        }

        // ==========================================
        // 12. UNIFIED ALL-TABLE CLOUD SYNC
        // ==========================================
        async syncAllFromSupabase() {
            try {
                await Promise.allSettled([
                    this.fetchJobsFromSupabase(),
                    this.fetchApplicationsFromSupabase(),
                    this.fetchInterviewsFromSupabase(),
                    this.fetchOffersFromSupabase(),
                    this.fetchFeedbackFromSupabase(),
                    this.fetchReportsFromSupabase(),
                    window.auth?.syncUsersFromSupabase?.()
                ]);
                console.log("🔄 Dual-Engine Database fully synced with Supabase PostgreSQL cloud!");
            } catch (err) {
                console.warn("Database full sync exception:", err);
            }
        }
    }

    window.db = new DatabaseService();
    window.resetFullDatabase = function() {
        if (window.db) window.db.clearAllData();
        if (window.auth) window.auth.resetDatabase();
    };
    console.log("📦 SmartHire Dual-Engine Database Service Ready!");
})();
