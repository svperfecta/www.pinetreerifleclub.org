# Restoration checks

The public restoration contains 125 valid HTML5 pages and 155 original non-HTML assets. Verification checks every page's title, description, canonical URL, language, viewport, heading and main landmark, plus local links and fragments.

The browser audit checks all pages for failed resource requests, broken images, remote asset dependencies and axe WCAG 2 A/AA and WCAG 2.1 A/AA findings. The machine-readable results are in `audit.json`; the homepage screenshot is `homepage.png`. CI repeats these checks on pushes and pull requests.

The EmDash seed is validated using its CLI. Both the static export and Cloudflare server builds are tested. The local development CMS has been initialized with the recovered content, and the database-backed homepage returns successfully.

## Manual work for the design phase

- Preserve access to historical results and documents during navigation changes.
- Replace recovered table-based layouts with responsive components. Fixed-width original layouts can require horizontal scrolling on mobile.
- Review heading order and table semantics with a screen reader, especially old match reports.
- Provide accessible transcripts for image-only newsletters and review PDF accessibility.
- Confirm current club dates, contacts and payment destinations with the club.
- Verify production pages, uploaded media, scheduled publishing and authentication after Cloudflare deployment. Local builds do not prove production resource configuration.

Automated rule checks are a useful gate, not a claim of full accessibility conformance.
