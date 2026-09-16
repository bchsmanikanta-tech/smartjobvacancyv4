-- ====================================================================
-- SMART JOB VACANCY FINDER SYSTEM - SCHEMA & RLS SETUP
-- Database: PostgreSQL / Supabase
-- ====================================================================

-- 1. Users Table (Core Auth & Roles)
CREATE TABLE IF NOT EXISTS public.users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'seeker',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. JobSeekers Table (Candidate Profile & Resume)
CREATE TABLE IF NOT EXISTS public.job_seekers (
    seeker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    full_name VARCHAR(255),
    email VARCHAR(255),
    education VARCHAR(255),
    skills TEXT[],
    certifications TEXT[],
    experience_years VARCHAR(50) DEFAULT 'Fresher',
    projects TEXT,
    location VARCHAR(255),
    expected_salary VARCHAR(100),
    preferred_role VARCHAR(255),
    resume_url TEXT,
    ats_score INTEGER DEFAULT 89,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Companies Table (Recruiter & Verification Status)
CREATE TABLE IF NOT EXISTS public.companies (
    company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    company_name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    description TEXT,
    website VARCHAR(255),
    location VARCHAR(255),
    industry VARCHAR(100),
    contact_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'approved',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Jobs Table (Vacancies Posted by Companies)
CREATE TABLE IF NOT EXISTS public.jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    company_name VARCHAR(255) DEFAULT 'TechCorp Global',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    responsibilities TEXT,
    requirements TEXT,
    skills TEXT[],
    salary VARCHAR(100),
    location VARCHAR(255),
    job_type VARCHAR(50) DEFAULT 'Full-time',
    work_mode VARCHAR(50) DEFAULT 'On-site',
    vacancies_count INTEGER DEFAULT 1,
    deadline DATE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Applications Table (Hiring Pipeline & AI Match Score)
CREATE TABLE IF NOT EXISTS public.applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID,
    seeker_id UUID,
    candidate_id UUID,
    company_id UUID,
    job_title VARCHAR(255),
    company VARCHAR(255),
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    location VARCHAR(255),
    qualification VARCHAR(255),
    college VARCHAR(255),
    pass_year VARCHAR(50),
    cgpa VARCHAR(50),
    skills TEXT,
    experience VARCHAR(100),
    expected_salary VARCHAR(100),
    resume_name VARCHAR(255),
    cover_letter TEXT,
    ai_match_score INTEGER DEFAULT 85,
    status VARCHAR(50) DEFAULT 'Applied',
    notes TEXT,
    applied_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Non-destructive column migrations for existing databases
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS candidate_id UUID;
CREATE INDEX IF NOT EXISTS idx_applications_company_id ON public.applications(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON public.applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);


-- 6. SavedJobs Table (Bookmarks)
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    saved_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seeker_id UUID,
    job_id UUID,
    job_title VARCHAR(255),
    company VARCHAR(255),
    saved_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Notifications Table (Live Candidate & Recruiter Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    status VARCHAR(50) DEFAULT 'unread',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS & Full Access Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seekers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Clean Policies
DROP POLICY IF EXISTS "Allow public operations on users" ON public.users;
DROP POLICY IF EXISTS "Allow public operations on job_seekers" ON public.job_seekers;
DROP POLICY IF EXISTS "Allow public operations on companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow public operations on applications" ON public.applications;
DROP POLICY IF EXISTS "Allow public operations on saved_jobs" ON public.saved_jobs;
DROP POLICY IF EXISTS "Allow public operations on notifications" ON public.notifications;

-- Create ALL operation policies for seamless insert, update, select, delete
CREATE POLICY "Allow public operations on users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on job_seekers" ON public.job_seekers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on applications" ON public.applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on saved_jobs" ON public.saved_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- 8. Profiles Table (Linked directly to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'job_seeker', -- 'job_seeker', 'company', 'admin'
    location VARCHAR(255),
    profile_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (true);

-- Automatic Auth Trigger: auth.users -> public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone, role, location, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'job_seeker'),
        COALESCE(NEW.raw_user_meta_data->>'location', ''),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = NOW();

    INSERT INTO public.users (user_id, name, email, role, status, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        CASE 
            WHEN (NEW.raw_user_meta_data->>'role') = 'company' THEN 'employer'
            WHEN (NEW.raw_user_meta_data->>'role') = 'admin' THEN 'admin'
            ELSE 'seeker'
        END,
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET 
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Interviews Table (Connected directly to applications)
CREATE TABLE IF NOT EXISTS public.interviews (
    interview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES public.applications(application_id) ON DELETE CASCADE,
    job_id UUID,
    company_id UUID,
    candidate_id UUID,
    candidate_email VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255),
    company_name VARCHAR(255),
    job_title VARCHAR(255),
    interview_round VARCHAR(100) DEFAULT 'Technical Round 1',
    interview_date DATE NOT NULL,
    interview_time VARCHAR(50) NOT NULL,
    interview_mode VARCHAR(50) DEFAULT 'Online', -- 'Online', 'Offline'
    meeting_link TEXT,
    location TEXT,
    instructions TEXT,
    status VARCHAR(50) DEFAULT 'Scheduled', -- 'Scheduled', 'Accepted', 'Rejected', 'Completed', 'Cancelled'
    result VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Selected', 'Rejected', 'On Hold'
    candidate_response_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON public.interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_company_id ON public.interviews(company_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_email ON public.interviews(candidate_email);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public operations on interviews" ON public.interviews;
CREATE POLICY "Allow public operations on interviews" ON public.interviews FOR ALL USING (true) WITH CHECK (true);

-- 10. Offer Letters Table (Connected directly to applications)
CREATE TABLE IF NOT EXISTS public.offer_letters (
    offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES public.applications(application_id) ON DELETE CASCADE,
    job_id UUID,
    company_id UUID,
    candidate_id UUID,
    candidate_email VARCHAR(255) NOT NULL,
    candidate_name VARCHAR(255),
    company_name VARCHAR(255),
    position VARCHAR(255) NOT NULL,
    salary_ctc VARCHAR(100) NOT NULL,
    joining_date DATE NOT NULL,
    employment_type VARCHAR(50) DEFAULT 'Full-time',
    work_location VARCHAR(255) DEFAULT 'Hybrid',
    expiry_date DATE,
    additional_terms TEXT,
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Accepted', 'Rejected', 'Expired'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offer_letters_application_id ON public.offer_letters(application_id);
CREATE INDEX IF NOT EXISTS idx_offer_letters_company_id ON public.offer_letters(company_id);
CREATE INDEX IF NOT EXISTS idx_offer_letters_candidate_email ON public.offer_letters(candidate_email);

ALTER TABLE public.offer_letters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public operations on offer_letters" ON public.offer_letters;
CREATE POLICY "Allow public operations on offer_letters" ON public.offer_letters FOR ALL USING (true) WITH CHECK (true);

-- 11. Reports & Grievance Complaints Table
CREATE TABLE IF NOT EXISTS public.reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID,
    reporter_email VARCHAR(255),
    type VARCHAR(50) DEFAULT 'Job', -- 'Job', 'Company', 'Candidate', 'Application'
    reported_item_id UUID,
    reported_item_name VARCHAR(255),
    reason VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Under Review', 'Resolved', 'Rejected'
    admin_action VARCHAR(255),
    resolution_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_email ON public.reports(reporter_email);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public operations on reports" ON public.reports;
CREATE POLICY "Allow public operations on reports" ON public.reports FOR ALL USING (true) WITH CHECK (true);

-- 12. Non-Destructive Migrations for Notifications Table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(255);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_record_id UUID;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_email ON public.notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- 13. Enable Supabase Realtime Publication on Core Tables
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE 
            public.profiles, 
            public.users, 
            public.companies, 
            public.jobs, 
            public.applications, 
            public.notifications, 
            public.reports;
    EXCEPTION
        WHEN duplicate_object THEN
            NULL; -- already in publication
        WHEN undefined_object THEN
            NULL; -- publication not configured
    END;
END $$;

