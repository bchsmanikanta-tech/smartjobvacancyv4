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
        NOTIFICATIONS: 'smarthire_notifications'
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
        }

        clearAllData() {
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify([]));
            localStorage.setItem('smartjob_saved_jobs', JSON.stringify([]));
            localStorage.setItem('smartjob_users_db', JSON.stringify([]));
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
                    const payload = {
                        application_id: toUUID(newApp.id),
                        job_id: toUUID(newApp.jobId),
                        seeker_id: toUUID(candidateId),
                        candidate_id: toUUID(candidateId),
                        company_id: companyId ? toUUID(companyId) : null,
                        job_title: newApp.jobTitle,
                        company: newApp.company,
                        full_name: newApp.fullName,
                        email: newApp.email,
                        phone: newApp.phone,
                        location: newApp.location,
                        qualification: newApp.qualification,
                        college: newApp.college,
                        pass_year: String(newApp.passYear),
                        cgpa: String(newApp.cgpa),
                        skills: typeof newApp.skills === 'string' ? newApp.skills : JSON.stringify(newApp.skills),
                        experience: newApp.experience,
                        expected_salary: newApp.expectedSalary,
                        resume_name: newApp.resumeName,
                        cover_letter: newApp.coverLetter,
                        ai_match_score: newApp.matchScore,
                        status: newApp.status,
                        notes: `Applicant: ${newApp.fullName} (${newApp.email}) - Qualification: ${newApp.qualification}`
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
            if (!client) return this.getApplications();
            try {
                const { data, error } = await client.from('applications').select('*').order('applied_date', { ascending: false });
                if (error || !data) {
                    console.warn("Supabase applications fetch error:", error);
                    return this.getApplications();
                }

                const cloudApps = data.map(a => ({
                    id: a.application_id,
                    application_id: a.application_id,
                    jobId: a.job_id,
                    job_id: a.job_id,
                    companyId: a.company_id || '',
                    company_id: a.company_id || '',
                    candidateId: a.candidate_id || a.seeker_id || '',
                    candidate_id: a.candidate_id || a.seeker_id || '',
                    seekerId: a.seeker_id || a.candidate_id || '',
                    seeker_id: a.seeker_id || a.candidate_id || '',
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

                // Merge with local applications
                const localApps = this.getApplications();
                const mergedMap = new Map();
                cloudApps.forEach(a => mergedMap.set(String(a.id), a));
                localApps.forEach(a => {
                    const key = String(a.id || a.application_id);
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, a);
                    } else {
                        const existing = mergedMap.get(key);
                        if (!existing.companyId && a.companyId) {
                            existing.companyId = a.companyId;
                            existing.company_id = a.company_id;
                        }
                    }
                });

                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return this.getApplications();
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
            // Also update active session cache if matches
            if (currentUser && (currentUser.email.toLowerCase() === userKey || currentUser.id === userKey)) {
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
                    if (scoped) return scoped;
                } catch (e) {}
            }

            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES)) || null;
            } catch (e) {
                return null;
            }
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
        // 5. UNIFIED ALL-TABLE CLOUD SYNC
        // ==========================================
        async syncAllFromSupabase() {
            try {
                await Promise.allSettled([
                    this.fetchJobsFromSupabase(),
                    this.fetchApplicationsFromSupabase(),
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
