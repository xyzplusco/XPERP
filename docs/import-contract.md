# XP ERP Import Contract

This document defines how source workbooks should enter the ERP. Every import must preserve source lineage and produce a review report.

## Required Source Files

| Source | Path | Purpose |
|---|---|---|
| Cleaned partner list | `data/XP_partner_list_cleaned_DB_ready.xlsx` | normalized people starter data |
| Original network list | `data/raw/00.XP_파트너 및 네트워크 리스트_260813.xlsx` | network segment, onboarding, document status |
| Deal list | `data/XP Deal list_대외비_20260805.xlsx` | projects, companies, PL/PM, weekly updates |
| To Go List | `data/raw/To Go List XYZ Plus (7).xlsx` | tasks, events, follow-ups, document gaps |

## Import Rules

1. Create one `import_sources` row per workbook sheet.
2. Create one `import_records` row per non-empty source row.
3. Store raw row text and raw JSON.
4. Upsert people and companies by normalized name plus email/phone when available.
5. Never silently discard rows. Use `needs_review` if mapping is uncertain.
6. Preserve original names even when normalized names are used for matching.
7. Create `document_requirements` for NDA/profile/appointment/MOU/contract mentions even when no file exists.
8. Create `tasks` for To Go rows with an owner, due date, project/company/person hint, or action phrase.
9. Report unmatched PL/PM/coordinator names.
10. Report duplicate-looking people and companies.

## Review Queues

The import should output review buckets:

- duplicate people candidates
- duplicate company candidates
- unmatched project members
- unmapped service sector values
- missing NDA/profile/appointment requirements
- To Go rows that need manual project/person assignment
- source rows skipped as headings or blanks

