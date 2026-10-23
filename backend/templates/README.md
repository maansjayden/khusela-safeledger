# Official DoJ&CD Form 06 (J480) Template Directory

Place the official South African Department of Justice and Constitutional Development Domestic Violence Act **Form 06 (`dv-Form06-J480.pdf`)** in this directory:

```text
khusela/backend/templates/dv-Form06-J480.pdf
```

### How `POST /api/v1/legal/generate-form06` Works
- **When `dv-Form06-J480.pdf` is present**: `pypdf` loads the official DoJ Form 06 pages, stamps the case chain-of-custody footer on Page 1 using `ReportLab`, and appends the structured **Section 4 Affidavit Narrative & ECTA Section 15 SHA-256 Forensic Evidence Schedule**.
- **When `dv-Form06-J480.pdf` is absent**: `ReportLab` dynamically generates a clean, court-ready standalone Form 06 (J480) Section 4 Protection Order Application PDF so the application never fails offline or in sandboxed environments.
