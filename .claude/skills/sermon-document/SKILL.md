---
name: sermon-document
description: Pastor Devon's sermon notes style for Lance's Word export. Navy, tan, and white, Cinzel and Spectral fonts, Big Numeral section headings, Exposition, and Added References. Use when changing how Lance writes or renders sermon notes.
---

# Sermon Document Style (Lance)

Lance writes sermon notes as markdown with his markers. The `lance-docx` edge function (`supabase/functions/lance-docx/sermon.ts`) detects sermon notes (a `## THE TEXT` heading, or any `>>`, `@@`, or `++` line) and renders them in Pastor Devon's chosen style. Every other document keeps the original renderer.

The writing rules Lance follows live in Supabase, `lance_profile` row `document / sermon_notes_format`. Keep that row and this renderer in step.

## The look (chosen by Pastor Devon, November 2026)
- Colors: navy 1E2B45, tan 85683D, light tan CDB68E, tan block E9DCC6, highlight DCC59E, white page
- Fonts: Cinzel (title, main-point banners), Spectral (headings and body), Jost (small labels). Embedded in every file from `public/fonts/` (fetched from lance-roan.vercel.app, with raw GitHub as backup)
- No headers or footers, no church name, no pastor name, no service time, no color key
- Section headings are Big Numeral: large bold tan 01, 02, 03, then a bold navy title, then a short tan bar. No full-width rule lines
- The verse-by-verse section is called Exposition, never "Verse by Verse" or "Passage Context"
- Cross references sit under ADDED REFERENCES: reference, the KJV verse or a portion in quotes, then an italic tan line on why Pastor would use the verse ("This verse shows...")

## Markup and what each marker renders
| Lance writes | Renders as |
|---|---|
| `# Title` | Tan ❖, centered Cinzel navy title |
| `*big idea*` on the line after the title | Centered italic subtitle |
| `## THE TEXT` then `### Book 1:1-10` | Passage reference centered under the title, THE TEXT label |
| `>> 3 verse text` (inside THE TEXT) | Tan block with navy spine, tan verse number |
| `## THE SETTING`, `## EXPOSITION`, `## INTRODUCTION`, `## CONCLUSION` | Big Numeral heading (auto-numbered, title-cased) |
| `@@ v. 22 \| verse text` | VERSE 22 label, verse in navy italic with tan rule |
| `++ Reference \| verse text \| This verse shows...` | Added Reference (label appears once per group) |
| `## I. POINT TITLE (v. 24)` | Navy banner, white Cinzel title, verse range at right. A "The Message" Big Numeral heading appears before the first point |
| `>> verse` (inside a point) | Navy italic verse with tan rule |
| `### A. Sub-point` | Bold navy Spectral sub-heading |
| `#### Label` | Small tan Jost label |
| `- text` / indented `- text` | Tan square bullet / tan en dash |
| `==text==` | Bold on tan highlight |
| `^^text^^` | Bold navy on tan highlight. Alone on a line: centered bold italic punch line |
| `> quote \| Reference` | Centered italic pull quote with tan reference |
| `!! FOR YOUR WEEK:` then `!! - item` lines | Tan application block with tan spine |

## Writing rules
- KJV only, word for word, no "(KJV)" tags
- No em dashes, no semicolons in Pastor's wording (Scripture keeps its own punctuation)
- Banned document words: can, may, just, that, it, very, really, actually, certainly, probably, basically, could, maybe, however, moreover, furthermore, hence, deep, powerful, boost, unlock, discover, imagine, realm, craft, tapestry, illuminate, unveil, pivotal, intricate, testament, stark, landscape, navigating, exciting, remarkable, groundbreaking, utilize, embark, and the rest of the list in the profile row
- Active voice, "you" and "your", short sentences
