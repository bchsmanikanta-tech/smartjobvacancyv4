#!/usr/bin/env python3
"""
AI Resume Analysis Engine
Extracts text from PDF, DOCX, and DOC resumes.
Performs comprehensive AI analysis:
  - Spelling Mistakes
  - Grammar & Wording Issues
  - Professional Language & Tone Improvements
  - Missing Resume Sections
  - Technical & Soft Skills Extraction
  - Contextual Keyword Suggestions
  - Estimated ATS Score & 5-Pillar Breakdown
  - Resume Strengths & Highlights
"""

import sys
import os
import re
import json
import base64
from typing import Dict, List, Any, Optional

# Optional text extraction dependencies
try:
    from pypdf import PdfReader
    PYPDF_AVAILABLE = True
except ImportError:
    try:
        from PyPDF2 import PdfReader
        PYPDF_AVAILABLE = True
    except ImportError:
        PYPDF_AVAILABLE = False

try:
    import docx
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

try:
    import olefile
    OLEFILE_AVAILABLE = True
except ImportError:
    OLEFILE_AVAILABLE = False


# ============================================================================
# 1. TEXT EXTRACTION ENGINE (PDF / DOCX / DOC)
# ============================================================================

def extract_text_from_scanned_pdf(file_path: str) -> str:
    """Extract text from scanned or image-based PDF using Windows built-in OCR."""
    import subprocess
    import tempfile

    ocr_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_helper.ps1")
    if not os.path.exists(ocr_script):
        return ""

    try:
        reader = PdfReader(file_path)
        all_ocr_text = []

        for i, page in enumerate(reader.pages):
            page_text = []
            if hasattr(page, "images"):
                for img_name, img_obj in page.images.items():
                    # Skip tiny decorations/icons
                    if len(img_obj.data) < 5000:
                        continue
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_img:
                        tmp_img.write(img_obj.data)
                        tmp_img_path = tmp_img.name

                    try:
                        cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-File", ocr_script, "-ImagePath", tmp_img_path]
                        res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
                        if res.returncode == 0 and res.stdout.strip():
                            page_text.append(res.stdout.strip())
                    except Exception as ocr_err:
                        print(f"OCR warning: {ocr_err}")
                    finally:
                        if os.path.exists(tmp_img_path):
                            try:
                                os.remove(tmp_img_path)
                            except Exception:
                                pass
            if page_text:
                all_ocr_text.append("\n".join(page_text))

        return "\n\n".join(all_ocr_text).strip()
    except Exception as e:
        print(f"OCR fallback error: {e}")
        return ""


def extract_text_from_pdf(file_path: str) -> str:
    """Extract plain text from a PDF file using pypdf, falling back to OCR for scanned PDFs."""
    if not PYPDF_AVAILABLE:
        raise RuntimeError("pypdf library is not installed. Please install it using: pip install pypdf")
    
    text_chunks = []
    try:
        reader = PdfReader(file_path)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ValueError("PDF file is password-protected and cannot be read.")
        
        for idx, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_chunks.append(page_text.strip())
    except Exception as e:
        if isinstance(e, (ValueError, RuntimeError)):
            raise e
        raise ValueError(f"Failed to extract text from PDF: {str(e)}")

    extracted = "\n\n".join(text_chunks).strip()
    
    # If text is empty or too short (scanned PDF without text layer), invoke OCR fallback
    if not extracted or len(extracted) < 30:
        ocr_extracted = extract_text_from_scanned_pdf(file_path)
        if ocr_extracted and len(ocr_extracted.strip()) >= 30:
            return ocr_extracted
        raise ValueError("The uploaded PDF appears to be empty or contains scanned images without selectable text.")
    
    return extracted


def extract_text_from_docx(file_path: str) -> str:
    """Extract plain text from a Word (.docx) document."""
    if not DOCX_AVAILABLE:
        raise RuntimeError("python-docx library is not installed. Please install it using: pip install python-docx")

    try:
        doc = docx.Document(file_path)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        # Also extract table text
        table_rows = []
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    table_rows.append(" | ".join(cells))
        
        all_lines = paragraphs + table_rows
        extracted = "\n".join(all_lines).strip()
        if not extracted:
            raise ValueError("The uploaded DOCX file contains no readable text.")
        return extracted
    except Exception as e:
        if isinstance(e, (ValueError, RuntimeError)):
            raise e
        raise ValueError(f"Failed to read DOCX document: {str(e)}")


def extract_text_from_doc(file_path: str) -> str:
    """
    Extract plain text from legacy Word 97-2004 (.doc) files.
    Attempts OLE file stream extraction first, falls back to ASCII/UTF-16 text salvage.
    """
    extracted_text = ""
    if OLEFILE_AVAILABLE:
        try:
            if olefile.isOleFile(file_path):
                ole = olefile.OleFileIO(file_path)
                if ole.exists('WordDocument'):
                    stream = ole.openstream('WordDocument').read()
                    # Filter printable text from binary stream
                    # Check UTF-16LE and ASCII strings
                    raw_utf16 = stream.decode('utf-16le', errors='ignore')
                    raw_ascii = stream.decode('latin1', errors='ignore')
                    # Find candidate readable words
                    words = re.findall(r'[A-Za-z0-9\.,@\-\+\#\s]{4,}', raw_utf16)
                    if len(" ".join(words)) > 100:
                        extracted_text = " ".join(words)
                    else:
                        words_ascii = re.findall(r'[A-Za-z0-9\.,@\-\+\#\s]{4,}', raw_ascii)
                        extracted_text = " ".join(words_ascii)
                ole.close()
        except Exception:
            pass

    if not extracted_text.strip():
        # Byte scanning fallback for legacy .doc
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            # Clean non-printable bytes
            matches = re.findall(b'[\x20-\x7E]{4,}', content)
            clean_strings = [m.decode('latin1', errors='ignore') for m in matches]
            extracted_text = "\n".join(clean_strings)
        except Exception as e:
            raise ValueError(f"Failed to parse legacy .doc file: {str(e)}")

    clean_result = re.sub(r'\s+', ' ', extracted_text).strip()
    if len(clean_result) < 40:
        raise ValueError("Could not extract readable text from .doc file. Please convert it to .docx or .pdf.")
    return clean_result


def extract_resume_text(file_path: str) -> str:
    """Main extractor that selects the proper parser based on file extension."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.pdf':
        return extract_text_from_pdf(file_path)
    elif ext == '.docx':
        return extract_text_from_docx(file_path)
    elif ext == '.doc':
        return extract_text_from_doc(file_path)
    elif ext in ('.txt', '.rtf'):
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read().strip()
            if not text:
                raise ValueError("Text file is empty.")
            return text
    else:
        raise ValueError(f"Unsupported file extension '{ext}'. Only PDF, DOC, and DOCX formats are supported.")


# ============================================================================
# 2. RESUME SECTION SEGMENTATION
# ============================================================================

SECTION_HEADERS = {
    "summary": [
        r"professional\s+summary", r"career\s+summary", r"summary\s+of\s+qualifications",
        r"career\s+objective", r"objective", r"profile", r"about\s+me", r"personal\s+profile"
    ],
    "contact": [
        r"contact\s+information", r"contact\s+details", r"personal\s+details", r"contact\s+me"
    ],
    "education": [
        r"education", r"academic\s+background", r"academic\s+qualifications",
        r"educational\s+history", r"qualifications", r"degrees"
    ],
    "skills": [
        r"technical\s+skills", r"core\s+competencies", r"skills\s*(&|and)?\s*technologies",
        r"skills\s*(&|and)?\s*abilities", r"skills", r"competencies", r"key\s+skills",
        r"areas\s+of\s+expertise", r"tech\s+stack"
    ],
    "experience": [
        r"work\s+experience", r"professional\s+experience", r"employment\s+history",
        r"work\s+history", r"experience", r"career\s+history"
    ],
    "projects": [
        r"projects", r"personal\s+projects", r"academic\s+projects",
        r"key\s+projects", r"notable\s+projects", r"technical\s+projects"
    ],
    "certifications": [
        r"certifications", r"licenses\s*(&|and)?\s*certifications", r"professional\s+certifications",
        r"certificates", r"accreditations"
    ],
    "achievements": [
        r"achievements", r"honors\s*(&|and)?\s*awards", r"awards\s*(&|and)?\s*achievements",
        r"accomplishments", r"key\s+achievements"
    ],
    "internships": [
        r"internships", r"internship\s+experience", r"industrial\s+training", r"practical\s+training"
    ],
    "languages": [
        r"languages", r"language\s+proficiency", r"languages\s+known"
    ]
}

def segment_resume_sections(text: str) -> Dict[str, Any]:
    """Identify and parse individual resume sections."""
    # Pre-process: if headings appear inline (common in OCR streams), break them into distinct lines
    normalized_text = text
    for sec_name, patterns in SECTION_HEADERS.items():
        for pat in patterns:
            normalized_text = re.sub(r'(?i)(?<=[a-zA-Z0-9\.\,\:\!\?])\s+(' + pat + r')[\:\-\s]+', r'\n\n\1:\n', normalized_text)

    lines = [l.strip() for l in normalized_text.splitlines() if l.strip()]
    
    # 1. Contact Information Regexes
    email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text)
    phone_match = re.search(r'(?:\+?\d{1,3}[\s-]?)?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}', text)
    linkedin_match = re.search(r'(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9_-]+', text, re.IGNORECASE)
    github_match = re.search(r'(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9_-]+', text, re.IGNORECASE)
    portfolio_match = re.search(r'(?:https?://)?[a-zA-Z0-9-]+\.(?:github\.io|vercel\.app|netlify\.app|tech|dev|me|io|com)', text, re.IGNORECASE)
    
    # Candidate name extraction heuristic
    candidate_name = ""
    excluded_names = {"professional summary", "summary", "skills", "education", "projects", "experience", "contact", "certifications", "achievements", "curriculum", "resume"}
    for line in lines[:8]:
        if re.search(r'http|resume|curriculum vitae', line, re.IGNORECASE):
            continue
        # Strip email and phone if on the same line
        clean_line = re.sub(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '', line)
        clean_line = re.sub(r'(?:\+?\d{1,3}[\s-]?)?\(?\d{2,5}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}', '', clean_line)
        clean_header = re.split(r'[\/\|\-\–\—\:]|\b(?:Software\s+Engineer|Developer|Consultant|Architect|Full\s+Stack|Frontend|Backend|Engineer)\b', clean_line, flags=re.IGNORECASE)[0].strip()
        
        if clean_header.lower() in excluded_names:
            continue

        words = clean_header.split()
        if 1 <= len(words) <= 4 and all(w.isalpha() or '.' in w for w in words):
            candidate_name = clean_header
            break

    if not candidate_name and lines:
        for l in lines[:3]:
            w = l.split()[0] if l.split() else ""
            if w.isalpha() and len(w) >= 2 and w.lower() not in excluded_names:
                candidate_name = w
                break

    contact_info = {
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0) if phone_match else "",
        "linkedin": linkedin_match.group(0) if linkedin_match else "",
        "github": github_match.group(0) if github_match else "",
        "portfolio": portfolio_match.group(0) if portfolio_match else "",
        "name": candidate_name
    }

    # 2. Section Chunking
    sections = {k: "" for k in SECTION_HEADERS.keys()}
    current_sec = "summary"
    sec_buffers = {k: [] for k in SECTION_HEADERS.keys()}
    sec_buffers["other"] = []

    for line in lines:
        cleaned_line = line.strip()
        matched_section = None
        for sec_name, patterns in SECTION_HEADERS.items():
            for pat in patterns:
                # Match standalone headings like "## Education" or "EDUCATION:" or "EDUCATION"
                if re.fullmatch(r'[\#\*\-\s]*' + pat + r'[\:\-\s]*', cleaned_line, re.IGNORECASE) or \
                   re.match(r'^[\#\*\-\s]*' + pat + r'[\:\s]*$', cleaned_line, re.IGNORECASE):
                    matched_section = sec_name
                    break
            if matched_section:
                break
        
        if matched_section:
            current_sec = matched_section
        else:
            if current_sec in sec_buffers:
                sec_buffers[current_sec].append(cleaned_line)
            else:
                sec_buffers["other"].append(cleaned_line)

    for sec_name, buffer in sec_buffers.items():
        if sec_name != "other":
            sections[sec_name] = "\n".join(buffer).strip()

    sections["other"] = "\n".join(sec_buffers.get("other", [])).strip()
    sections["contact_info"] = contact_info
    return sections


# ============================================================================
# 3. KNOWLEDGE BASES (SPELLING, GRAMMAR, WEAK PHRASES, SKILLS)
# ============================================================================

COMMON_RESUME_SPELLING_ERRORS = {
    "developement": "development",
    "develope": "develop",
    "developper": "developer",
    "programing": "programming",
    "programer": "programmer",
    "experiance": "experience",
    "managment": "management",
    "manger": "manager",
    "recieved": "received",
    "achivement": "achievement",
    "achived": "achieved",
    "resposible": "responsible",
    "responsiblities": "responsibilities",
    "responsibilty": "responsibility",
    "seperate": "separate",
    "techincal": "technical",
    "maintainance": "maintenance",
    "colaborated": "collaborated",
    "co-ordinated": "coordinated",
    "enviroment": "environment",
    "commited": "committed",
    "proficienty": "proficiency",
    "qualifaction": "qualification",
    "implimented": "implemented",
    "knowlege": "knowledge",
    "referance": "reference",
    "succesful": "successful",
    "database": "database",
    "databse": "database",
    "framwork": "framework",
    "leaded": "led",
    "optmized": "optimized",
    "troubleshot": "troubleshot",
    "architechture": "architecture",
    "certifcate": "certificate",
    "curiculum": "curriculum",
    "engeneering": "engineering",
    "reponsible": "responsible",
    "conected": "connected"
}

WEAK_PHRASES_MAP = [
    {
        "pattern": r"\b(?:we\s+made\s+a\s+website|i\s+made\s+a\s+website)\b",
        "original": "We made a website",
        "suggested": "Developed a responsive web application using HTML, CSS, and modern JavaScript."
    },
    {
        "pattern": r"\b(?:worked\s+on\s+bugs|fixed\s+bugs)\b",
        "original": "Worked on bugs",
        "suggested": "Diagnosed and resolved critical software defects, enhancing system reliability and uptime."
    },
    {
        "pattern": r"\b(?:responsible\s+for\s+testing|did\s+testing)\b",
        "original": "Responsible for testing",
        "suggested": "Engineered and executed automated unit and end-to-end regression test suites."
    },
    {
        "pattern": r"\b(?:handled\s+customers|talked\s+to\s+clients)\b",
        "original": "Handled customers",
        "suggested": "Interfaced with key client stakeholders to resolve high-priority inquiries and elevate customer satisfaction."
    },
    {
        "pattern": r"\b(?:helped\s+the\s+team|assisted\s+team)\b",
        "original": "Helped the team",
        "suggested": "Collaborated with cross-functional teams to streamline sprint deliverables and adhere to agile milestones."
    },
    {
        "pattern": r"\b(?:was\s+in\s+charge\s+of\s+code)\b",
        "original": "Was in charge of code",
        "suggested": "Spearheaded core repository architecture, peer code reviews, and deployment pipelines."
    },
    {
        "pattern": r"\b(?:good\s+knowledge\s+of)\b",
        "original": "Good knowledge of",
        "suggested": "Demonstrated technical proficiency in"
    },
    {
        "pattern": r"\b(?:did\s+a\s+project\s+on)\b",
        "original": "Did a project on",
        "suggested": "Architected and deployed an end-to-end project leveraging"
    },
    {
        "pattern": r"\b(?:looking\s+for\s+a\s+job\s+where\s+i\s+can)\b",
        "original": "Looking for a job where I can",
        "suggested": "Seeking a high-impact engineering role to leverage technical expertise in driving scalable"
    }
]

GRAMMAR_PATTERNS = [
    {
        "pattern": r"\b(?:i\s+have\s+graduated\s+in\s+20\d\d)\b",
        "original": "I have graduated in [year]",
        "suggested": "Graduated in [year] with a degree in...",
        "explanation": "Use past tense and active voice without redundant personal pronouns."
    },
    {
        "pattern": r"\b(?:responsible\s+to\s+develop)\b",
        "original": "Responsible to develop",
        "suggested": "Responsible for developing",
        "explanation": "The preposition 'for' should follow 'responsible' when describing tasks."
    },
    {
        "pattern": r"\b(?:experience\s+in\s+working\s+with\s+a\s+many)\b",
        "original": "Experience in working with a many",
        "suggested": "Experience working with multiple",
        "explanation": "Grammatical redundancy: remove 'a' before 'many'."
    },
    {
        "pattern": r"\b(?:worked\s+as\s+a\s+developer\s+and\s+also\s+tester)\b",
        "original": "Worked as a developer and also tester",
        "suggested": "Served as a Full-Stack Developer and QA Engineer",
        "explanation": "Maintain parallel grammatical structure for professional roles."
    },
    {
        "pattern": r"\b(?:technologies\s+used\s+is)\b",
        "original": "Technologies used is",
        "suggested": "Technologies utilized include:",
        "explanation": "Subject-verb agreement: 'Technologies' is plural and requires a plural verb."
    },
    {
        "pattern": r"\b(?:completed\s+my\s+schooling\s+from)\b",
        "original": "Completed my schooling from",
        "suggested": "Completed secondary education at",
        "explanation": "Use standardized professional phrasing for education credentials."
    }
]

ALL_KNOWN_SKILLS = {
    "technical": [
        "Python", "Java", "C", "C++", "C#", ".NET", "JavaScript", "TypeScript", "HTML", "HTML5",
        "CSS", "CSS3", "SQL", "MySQL", "PostgreSQL", "MongoDB", "NoSQL", "SQLite", "Oracle",
        "React", "React.js", "Angular", "Vue", "Vue.js", "Node.js", "Express", "Express.js",
        "Django", "Flask", "FastAPI", "Spring Boot", "Git", "GitHub", "GitLab", "Docker",
        "Kubernetes", "AWS", "Amazon Web Services", "Azure", "Google Cloud", "GCP", "Linux",
        "REST", "RESTful APIs", "GraphQL", "CI/CD", "DevOps", "Machine Learning", "Deep Learning",
        "Data Science", "Data Analysis", "Pandas", "NumPy", "Scikit-learn", "TensorFlow", "PyTorch",
        "NLP", "Natural Language Processing", "Computer Vision", "OpenCV", "Tableau", "Power BI",
        "Tailwind CSS", "Bootstrap", "Redux", "Next.js", "Webpack", "Redis", "Kafka", "Microservices"
    ],
    "soft": [
        "Communication", "Written Communication", "Verbal Communication", "Problem Solving",
        "Critical Thinking", "Teamwork", "Collaboration", "Leadership", "Time Management",
        "Adaptability", "Agile", "Scrum", "Analytical Thinking", "Attention to Detail",
        "Negotiation", "Mentorship", "Public Speaking", "Work Ethic", "Conflict Resolution"
    ]
}

KEYWORD_ASSOCIATIONS = {
    "python": ["Python Development", "Data Analysis", "Pandas", "NumPy", "Scikit-learn", "FastAPI", "Django", "Object-Oriented Programming (OOP)"],
    "sql": ["Database Management", "Query Optimization", "Relational Database Design", "PostgreSQL", "MySQL", "Data Modeling"],
    "machine learning": ["Data Science", "Scikit-learn", "Supervised Learning", "Predictive Modeling", "Model Evaluation", "Pandas", "NumPy"],
    "data analysis": ["Data Visualization", "Pandas", "NumPy", "Statistical Analysis", "Business Intelligence", "Tableau", "Power BI"],
    "javascript": ["Frontend Architecture", "React.js", "Node.js", "ES6+", "Asynchronous Programming", "REST APIs", "DOM Manipulation"],
    "react": ["React Hooks", "State Management", "Redux", "Component Lifecycle", "Next.js", "Responsive Web Design"],
    "html": ["Semantic HTML5", "Web Accessibility (a11y)", "Cross-Browser Compatibility", "SEO Fundamentals"],
    "css": ["Modern CSS3", "Flexbox & CSS Grid", "Responsive Layouts", "Tailwind CSS", "Sass/SCSS"],
    "java": ["Java Enterprise (J2EE)", "Spring Boot", "Object-Oriented Design", "Design Patterns", "Maven", "Multithreading"],
    "git": ["Version Control", "Git Flow", "Branch Management", "Pull Requests", "Code Review"],
    "docker": ["Containerization", "Docker Compose", "Microservices Architecture", "Kubernetes", "DevOps CI/CD"],
    "aws": ["Cloud Infrastructure", "Amazon EC2", "AWS S3", "AWS Lambda", "Cloud Security", "Serverless Computing"],
    "c++": ["Memory Management", "Data Structures & Algorithms", "High-Performance Computing", "STL (Standard Template Library)"],
    "c#": [".NET Core", "ASP.NET MVC", "LINQ", "Entity Framework", "C# Backend Services"],
    "node.js": ["Express.js Framework", "Asynchronous Event Loop", "RESTful API Development", "Backend Architecture", "Microservices"]
}


# ============================================================================
# 4. ANALYSIS WORKERS
# ============================================================================

def find_spelling_mistakes(text: str) -> List[Dict[str, str]]:
    """Scan resume text for common spelling mistakes and typos."""
    mistakes = []
    seen = set()
    
    # Split text into tokens keeping punctuation boundaries
    words = re.findall(r'\b[A-Za-z-]+\b', text)
    for word in words:
        w_lower = word.lower()
        if w_lower in COMMON_RESUME_SPELLING_ERRORS and w_lower not in seen:
            correct = COMMON_RESUME_SPELLING_ERRORS[w_lower]
            if w_lower == correct.lower():
                continue
            seen.add(w_lower)
            # Preserve case if uppercase or capitalized
            if word.isupper():
                correct = correct.upper()
            elif word.istitle():
                correct = correct.capitalize()

            # Find snippet context
            context_match = re.search(r'([^\n.]{0,35}\b' + re.escape(word) + r'\b[^\n.]{0,35})', text, re.IGNORECASE)
            context = context_match.group(1).strip() if context_match else f"... {word} ..."

            mistakes.append({
                "incorrect": word,
                "suggestion": correct,
                "context": context
            })
    return mistakes


def find_grammar_and_tone_issues(text: str) -> Dict[str, List[Dict[str, str]]]:
    """Scan for grammatical mistakes and weak/informal language."""
    grammar_issues = []
    professional_improvements = []

    # 1. Grammar check
    for item in GRAMMAR_PATTERNS:
        match = re.search(item["pattern"], text, re.IGNORECASE)
        if match:
            grammar_issues.append({
                "original_sentence": match.group(0),
                "suggested_sentence": item["suggested"],
                "explanation": item["explanation"]
            })

    # Check for lowercase 'i' used as pronoun
    i_match = re.search(r'\b(i)\s+(?:am|have|worked|was|lead|developed)\b', text)
    if i_match:
        grammar_issues.append({
            "original_sentence": i_match.group(0),
            "suggested_sentence": i_match.group(0).replace('i', 'I', 1),
            "explanation": "Capitalize the personal pronoun 'I', or better yet, use third-person action verbs without pronouns."
        })

    # 2. Professional language check
    for item in WEAK_PHRASES_MAP:
        match = re.search(item["pattern"], text, re.IGNORECASE)
        if match:
            # Extract surrounding phrase
            start = max(0, match.start() - 15)
            end = min(len(text), match.end() + 25)
            snippet = text[start:end].strip()
            
            professional_improvements.append({
                "original_sentence": match.group(0),
                "suggested_sentence": item["suggested"],
                "context": snippet
            })

    return {
        "grammar_mistakes": grammar_issues,
        "professional_language": professional_improvements
    }


def analyze_missing_sections(sections: Dict[str, Any]) -> List[Dict[str, str]]:
    """Determine if standard core resume sections are absent."""
    missing = []
    
    section_checks = [
        {
            "key": "summary",
            "name": "Professional Summary",
            "min_words": 15,
            "suggestion": "Add a 2–3 line professional summary highlighting your key skills, technical focus, and primary career goal."
        },
        {
            "key": "skills",
            "name": "Skills",
            "min_words": 5,
            "suggestion": "Create a dedicated 'Skills' or 'Technical Competencies' section categorizing your programming languages, tools, and frameworks."
        },
        {
            "key": "education",
            "name": "Education",
            "min_words": 5,
            "suggestion": "Include your degree, university or college name, graduation year, and academic achievements or GPA."
        },
        {
            "key": "projects",
            "name": "Projects",
            "min_words": 15,
            "suggestion": "List 2–3 notable technical projects with bullet points detailing problem statement, tech stack utilized, and measurable outcomes."
        },
        {
            "key": "experience",
            "name": "Work Experience",
            "min_words": 15,
            "suggestion": "Add relevant employment, freelance, or internship history with action-oriented bullet points quantifying your impact."
        },
        {
            "key": "certifications",
            "name": "Certifications",
            "min_words": 3,
            "suggestion": "Include industry certifications (e.g. AWS, Oracle, Google, Coursera, HackerRank) to validate your specialized skill sets."
        },
        {
            "key": "achievements",
            "name": "Achievements & Honors",
            "min_words": 3,
            "suggestion": "Highlight hackathons, academic honors, open source contributions, or workplace recognitions to stand out."
        }
    ]

    for item in section_checks:
        content = sections.get(item["key"], "")
        words = content.split() if content else []
        if len(words) < item["min_words"]:
            missing.append({
                "section": item["name"],
                "status": "Missing" if len(words) == 0 else "Needs Expansion",
                "suggestion": item["suggestion"]
            })

    return missing


def extract_skills_and_keywords(text: str) -> Dict[str, Any]:
    """Detect technical and soft skills, and generate contextual keyword suggestions."""
    detected_technical = []
    detected_soft = []
    text_lower = " " + text.lower() + " "

    # 1. Technical Skills
    for skill in ALL_KNOWN_SKILLS["technical"]:
        # Safe word boundary match
        pattern = r'(?<![A-Za-z0-9])' + re.escape(skill.lower()) + r'(?![A-Za-z0-9])'
        if re.search(pattern, text_lower):
            if skill not in detected_technical:
                detected_technical.append(skill)

    # 2. Soft Skills
    for skill in ALL_KNOWN_SKILLS["soft"]:
        pattern = r'(?<![A-Za-z0-9])' + re.escape(skill.lower()) + r'(?![A-Za-z0-9])'
        if re.search(pattern, text_lower):
            if skill not in detected_soft:
                detected_soft.append(skill)

    # 3. Contextual Keyword Suggestions
    suggested_keywords = []
    detected_tech_lower = {s.lower() for s in detected_technical}

    for anchor_skill, related_list in KEYWORD_ASSOCIATIONS.items():
        if anchor_skill in detected_tech_lower:
            for kw in related_list:
                # Suggest keyword if not already explicitly in detected skills
                if kw not in detected_technical and kw.lower() not in detected_tech_lower and kw not in suggested_keywords:
                    suggested_keywords.append(kw)

    return {
        "technical_skills": detected_technical,
        "soft_skills": detected_soft,
        "suggested_keywords": suggested_keywords[:15],
        "suggested_keywords_label": "Suggested Keywords",
        "suggested_keywords_disclaimer": "Only add these keywords if you actually have the skill or experience."
    }


def calculate_ats_diagnostics(text: str, sections: Dict[str, Any], skills_info: Dict[str, Any], spelling_mistakes: list) -> Dict[str, Any]:
    """
    Calculate ATS-readiness score out of 100 broken down into 5 categories (/20 each).
    """
    word_count = len(text.split())
    contact = sections.get("contact_info", {})
    
    # 1. Keyword Relevance (Max 20)
    tech_count = len(skills_info.get("technical_skills", []))
    if tech_count >= 8:
        score_keywords = 20
    elif tech_count >= 5:
        score_keywords = 18
    elif tech_count >= 3:
        score_keywords = 14
    elif tech_count >= 1:
        score_keywords = 10
    else:
        score_keywords = 6

    # 2. Skills Quality & Diversity (Max 20)
    soft_count = len(skills_info.get("soft_skills", []))
    total_skills = tech_count + soft_count
    if total_skills >= 10 and soft_count >= 2:
        score_skills = 20
    elif total_skills >= 7:
        score_skills = 17
    elif total_skills >= 4:
        score_skills = 14
    else:
        score_skills = 8

    # 3. Structure & Formatting (Max 20)
    score_structure = 20
    # Deduct for missing core sections
    if not sections.get("summary"):
        score_structure -= 2
    if not sections.get("education"):
        score_structure -= 3
    if not sections.get("skills"):
        score_structure -= 3
    if not sections.get("experience") and not sections.get("projects"):
        score_structure -= 4
    score_structure = max(6, score_structure)

    # 4. Readability & Polish (Max 20)
    score_readability = 20
    # Deductions for spelling mistakes
    spell_deduction = min(8, len(spelling_mistakes) * 2)
    score_readability -= spell_deduction
    # Word count penalties
    if word_count < 150:
        score_readability -= 4
    elif word_count > 1200:
        score_readability -= 2
    score_readability = max(5, score_readability)

    # 5. Completeness & Contact Benchmarks (Max 20)
    score_completeness = 20
    if not contact.get("email"):
        score_completeness -= 4
    if not contact.get("phone"):
        score_completeness -= 4
    if not (contact.get("linkedin") or contact.get("github") or contact.get("portfolio")):
        score_completeness -= 2
    if not sections.get("projects"):
        score_completeness -= 2
    score_completeness = max(6, score_completeness)

    total_ats_score = score_keywords + score_skills + score_structure + score_readability + score_completeness
    
    # Rating Category Tag
    if total_ats_score >= 85:
        rating_tag = "Excellent - Highly ATS-Ready"
        rating_color = "#10b981"
    elif total_ats_score >= 70:
        rating_tag = "Good - Competitive Quality"
        rating_color = "#3b82f6"
    elif total_ats_score >= 50:
        rating_tag = "Moderate - Needs Optimization"
        rating_color = "#f59e0b"
    else:
        rating_tag = "Low - Significant Improvements Needed"
        rating_color = "#ef4444"

    return {
        "total_score": total_ats_score,
        "max_score": 100,
        "rating_tag": rating_tag,
        "rating_color": rating_color,
        "breakdown": {
            "keyword_relevance": {"score": score_keywords, "max": 20, "label": "Keyword Relevance"},
            "skills": {"score": score_skills, "max": 20, "label": "Skills"},
            "structure": {"score": score_structure, "max": 20, "label": "Structure"},
            "readability": {"score": score_readability, "max": 20, "label": "Readability"},
            "completeness": {"score": score_completeness, "max": 20, "label": "Completeness"}
        },
        "disclaimer": "This estimated ATS score represents general formatting, keyword density, and structural readiness. It is an indicative benchmark and does not guarantee passing any specific employer's proprietary screening software."
    }


def identify_resume_strengths(text: str, sections: Dict[str, Any], skills_info: Dict[str, Any], ats_info: Dict[str, Any]) -> List[str]:
    """Compile positive aspects that the resume currently excels at."""
    strengths = []
    contact = sections.get("contact_info", {})

    if contact.get("email") and contact.get("phone"):
        strengths.append("Complete contact details including professional email and phone number are clearly accessible.")
    if contact.get("linkedin") or contact.get("github") or contact.get("portfolio"):
        strengths.append("Includes verified professional links (LinkedIn, GitHub, or portfolio website).")
    
    if len(skills_info.get("technical_skills", [])) >= 5:
        strengths.append(f"Strong technical skill variety detected ({len(skills_info['technical_skills'])} distinct modern technologies identified).")
    
    if skills_info.get("soft_skills"):
        strengths.append(f"Demonstrates interpersonal competencies ({', '.join(skills_info['soft_skills'][:3])}).")

    if sections.get("projects"):
        strengths.append("Dedicated project section showcases hands-on engineering experience and practical application.")

    if sections.get("education"):
        strengths.append("Academic qualifications and degree credentials are explicitly stated.")

    if re.search(r'\b(?:increased|reduced|improved|boosted|optimized|achieved|delivered)\b', text, re.IGNORECASE):
        strengths.append("Contains impactful quantifiable action verbs that demonstrate workplace results.")

    if len(strengths) == 0:
        strengths.append("Clean plain-text formatting allows reliable machine readability and parsing.")

    return strengths


# ============================================================================
# 5. FULL PIPELINE ORCHESTRATOR
# ============================================================================

def analyze_resume_file(file_path: str, original_filename: Optional[str] = None) -> Dict[str, Any]:
    """Execute complete resume analysis pipeline on an uploaded file."""
    if not original_filename:
        original_filename = os.path.basename(file_path)

    file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 0
    file_size_kb = round(file_size_bytes / 1024, 2)

    # 1. Text Extraction
    try:
        raw_text = extract_resume_text(file_path)
    except Exception as e:
        return {
            "success": False,
            "filename": original_filename,
            "file_size_kb": file_size_kb,
            "error": str(e),
            "readable": False
        }

    # 2. Section Parsing
    sections = segment_resume_sections(raw_text)

    # 3. Spelling Mistakes
    spelling_mistakes = find_spelling_mistakes(raw_text)

    # 4. Grammar & Professional Language
    grammar_and_tone = find_grammar_and_tone_issues(raw_text)

    # 5. Missing Sections
    missing_sections = analyze_missing_sections(sections)

    # 6. Skills & Keyword Suggestions
    skills_and_keywords = extract_skills_and_keywords(raw_text)

    # 7. ATS Diagnostics
    ats_diagnostics = calculate_ats_diagnostics(raw_text, sections, skills_and_keywords, spelling_mistakes)

    # 8. Strengths
    strengths = identify_resume_strengths(raw_text, sections, skills_and_keywords, ats_diagnostics)

    return {
        "success": True,
        "readable": True,
        "filename": original_filename,
        "file_size_kb": file_size_kb,
        "candidate_name": sections["contact_info"].get("name") or "Candidate",
        "contact_info": sections["contact_info"],
        "extracted_sections": {
            "summary": sections.get("summary", ""),
            "skills": sections.get("skills", ""),
            "education": sections.get("education", ""),
            "experience": sections.get("experience", ""),
            "projects": sections.get("projects", ""),
            "certifications": sections.get("certifications", ""),
            "achievements": sections.get("achievements", ""),
            "internships": sections.get("internships", ""),
            "languages": sections.get("languages", "")
        },
        "raw_text_length": len(raw_text),
        "word_count": len(raw_text.split()),
        "analysis": {
            "spelling_mistakes": spelling_mistakes,
            "grammar_mistakes": grammar_and_tone["grammar_mistakes"],
            "professional_language": grammar_and_tone["professional_language"],
            "missing_sections": missing_sections,
            "skills_analysis": {
                "technical_skills": skills_and_keywords["technical_skills"],
                "soft_skills": skills_and_keywords["soft_skills"]
            },
            "keyword_suggestions": {
                "keywords": skills_and_keywords["suggested_keywords"],
                "label": skills_and_keywords["suggested_keywords_label"],
                "disclaimer": skills_and_keywords["suggested_keywords_disclaimer"]
            },
            "ats_analysis": ats_diagnostics,
            "resume_strengths": strengths
        }
    }


# ============================================================================
# 6. CLI & JSON DISPATCHER
# ============================================================================

def main():
    """Command-line runner supporting both file path and base64 JSON payload."""
    import argparse
    parser = argparse.ArgumentParser(description="AI Resume Analysis Engine")
    parser.add_argument("--file", help="Path to resume file (PDF, DOCX, DOC)")
    parser.add_argument("--name", help="Original filename", default="")
    parser.add_argument("--json-input", help="Direct JSON payload with base64 data", default="")
    args = parser.parse_args()

    if args.json_input:
        try:
            data = json.loads(args.json_input)
            filename = data.get("filename", "resume.pdf")
            b64_content = data.get("base64", "")
            
            # Decode to a temporary file
            import tempfile
            ext = os.path.splitext(filename)[1] or ".pdf"
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                tmp.write(base64.b64decode(b64_content))
                tmp_path = tmp.name

            result = analyze_resume_file(tmp_path, original_filename=filename)
            try:
                os.remove(tmp_path)
            except Exception:
                pass

            print(json.dumps(result, indent=2))
            return
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e), "readable": False}))
            sys.exit(1)

    if args.file:
        result = analyze_resume_file(args.file, original_filename=args.name or os.path.basename(args.file))
        print(json.dumps(result, indent=2))
        return

    # If piped via stdin
    if not sys.stdin.isatty():
        input_data = sys.stdin.read().strip()
        if input_data:
            try:
                data = json.loads(input_data)
                filename = data.get("filename", "resume.pdf")
                b64_content = data.get("base64", "")
                
                import tempfile
                ext = os.path.splitext(filename)[1] or ".pdf"
                with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                    tmp.write(base64.b64decode(b64_content))
                    tmp_path = tmp.name

                result = analyze_resume_file(tmp_path, original_filename=filename)
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

                print(json.dumps(result, indent=2))
                return
            except Exception as e:
                print(json.dumps({"success": False, "error": str(e), "readable": False}))
                sys.exit(1)

    parser.print_help()


if __name__ == "__main__":
    main()
