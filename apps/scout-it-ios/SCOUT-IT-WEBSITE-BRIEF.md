# Scout-It! Website Project Brief

**Domain:** https://scout-it.ai
**Purpose:** Marketing site + interactive demo for AI-powered procurement
**Target Audience:** B2B procurement teams, enterprise buyers, developers building agentic commerce

---

## Project Overview

Scout-It! is an AI procurement assistant built on the AURA agentic commerce stack. The website should showcase the product, explain the technology, and provide an interactive demo that connects to the live API.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Deployment:** Vercel
- **API:** https://aura-labsai-production.up.railway.app
- **Analytics:** Plausible (privacy-focused)

---

## Navigation & Information Architecture

```
scout-it.ai
├── / (Landing)
├── /demo (Interactive Demo)
├── /how-it-works (Product Explainer)
├── /developers (Docs Hub)
│   ├── /developers/sdk (Scout SDK)
│   ├── /developers/api (API Reference)
│   └── /developers/examples (Code Examples)
├── /app (iOS App - pre-launch)
└── /blog (Future - post-launch)
```

**Header Nav:** Demo | How It Works | Developers | Get the App
**Footer:** About | Privacy | Terms | GitHub | Twitter/X

---

## Pages & Sections

### 1. Landing Page (`/`)
- Hero with primary tagline (see Messaging below)
- Problem/solution narrative for B2B procurement pain points
- "How it works" 3-step visual (Intent → Compare → Purchase)
- Live demo CTA (prominent)
- Protocol trust badges (AP2, TAP, MCP)
- Social proof section (placeholder for future testimonials)
- Footer CTA: "Try the Demo" or "Get Early Access"

### 2. Interactive Demo (`/demo`)
- Embedded procurement flow (no sign-up required)
- Natural language intent input
- Real offer comparison from Beacon stubs
- Mandate chain visualization (collapsible detail view)
- **Fallback behavior:** If API is down, show cached demo data with banner: "Running in offline demo mode"
- Reset button to try different scenarios
- Suggested prompts: "50 USB-C hubs under $2000", "10 ergonomic keyboards for design team"

### 3. How It Works (`/how-it-works`)
- Visual step-by-step flow diagram
- Protocol deep-dives (expandable accordions):
  - **AP2:** Intent → Cart → Payment mandate chain
  - **TAP:** Visa Trusted Agent Protocol, HTTP signatures
  - **MCP:** Model Context Protocol for tool integration
- Security & compliance section
- "For technical details, see Developer Docs" CTA

### 4. For Developers (`/developers`)

**This is a docs hub, not a single page.** Content lives on-site (not external links).

#### `/developers` (Hub Landing)
- Quick start guide (5-minute integration)
- SDK installation: `npm install @aura-labs/scout-sdk`
- Link cards to sub-sections

#### `/developers/sdk`
- Full Scout SDK documentation
- TypeScript examples
- MCP client setup
- AP2 mandate creation
- TAP signature implementation

#### `/developers/api`
- OpenAPI/Swagger-style reference
- All endpoints with request/response examples
- Authentication (API keys for production)
- Rate limits and error codes

#### `/developers/examples`
- Complete code examples:
  - Basic procurement flow (Node.js)
  - React integration
  - iOS Swift example (link to app repo)
- GitHub repo links

### 5. iOS App (`/app`)

**Pre-launch strategy** (before App Store approval):
- App preview video/GIF showing the flow
- Feature highlights with screenshots
- "Join the Beta" email signup (Waitlist)
- TestFlight signup link (if available)
- "Coming to the App Store" badge

**Post-launch:**
- App Store download button
- QR code for mobile visitors
- User reviews/ratings widget

---

## Messaging Strategy

**Primary Audience:** B2B procurement teams (decision-makers)
**Secondary Audience:** Developers building agentic commerce

### Recommended Primary Headline
> **"Procurement on Autopilot"**

*Rationale: Clearly signals B2B focus and automation value. "AI That Shops For You" is more consumer-friendly and may confuse enterprise buyers.*

### Tagline Hierarchy
1. **"Procurement on Autopilot"** — Hero headline
2. **"AI That Shops For You"** — Subhead or demo page
3. **"Your AI Buying Agent"** — Developer docs context

### Value Props (in priority order)
1. **Save hours per purchase** — Natural language → purchase orders
2. **Best price, guaranteed** — Multi-vendor comparison in seconds
3. **Enterprise-grade security** — Visa TAP cryptographic identity
4. **Complete audit trail** — Every decision signed and verifiable

---

## Design Direction

- Clean, modern, professional (not playful)
- **Primary:** Blue `#3B82F6`
- **Accent:** Purple `#8B5CF6` (crypto/security elements)
- **Success:** Green `#10B981`
- **Background:** White / Slate-50 for light, Slate-900 for dark
- Dark mode support (respect system preference)
- Subtle animations on scroll (Framer Motion)
- Generous whitespace, clear hierarchy

### Accessibility Requirements
- WCAG 2.1 AA compliance minimum
- Color contrast ratios ≥ 4.5:1 for text
- Keyboard navigable (all interactive elements)
- Screen reader friendly (semantic HTML, ARIA labels)
- Focus indicators visible
- Reduced motion option respected

---

## API Integration

### Endpoints
```
Base URL: https://aura-labsai-production.up.railway.app

GET  /health             - Check API status (call on page load)
POST /sessions           - Create shopping session
GET  /sessions/:id       - Poll for offers
POST /sessions/:id/approve - Approve offer
POST /checkout           - Complete purchase (demo mode)
```

### Fallback & Error Handling

| Scenario | Behavior |
|----------|----------|
| API healthy | Live demo with real API calls |
| API down | Show cached demo data, display "Offline Demo Mode" banner |
| API slow (>5s) | Show skeleton loader, then timeout message with retry |
| Rate limited | Queue requests, show "High demand" message |
| Invalid response | Log error, show generic "Something went wrong" with retry |

### Cached Demo Data
Store a static JSON snapshot of a successful demo flow to use when API is unavailable. Include 3 mock offers from different Beacons.

---

## Demo Flow (Detailed)

1. **Intent Input**
   - Placeholder: "What do you need to procure?"
   - Suggested prompts as clickable chips
   - Budget/constraints expandable (optional)

2. **Searching State**
   - Animated searching indicator
   - "Contacting vendors..." status text
   - Show Beacon icons appearing

3. **Offers Display**
   - 2-4 offers in card format
   - Price, vendor, delivery date, key specs
   - "Best Value" badge on recommended

4. **Selection & Mandate**
   - User clicks "Select Offer"
   - Show mandate chain building (animated)
   - Intent ✓ → Cart ✓ → Payment (pending)

5. **Checkout**
   - Summary card
   - "Complete Purchase" button
   - TAP signature indicator

6. **Confirmation**
   - Success animation
   - Order ID
   - Full audit trail (expandable)
   - "Try Another" reset button

---

## Assets Checklist

| Asset | Owner | Status | Due |
|-------|-------|--------|-----|
| Logo (Scout-It! wordmark + icon) | Design | ⏳ Needed | Pre-launch |
| App Icon (1024x1024) | Design | ✅ iOS app has placeholder | Pre-launch |
| Favicon set (16, 32, 180, 512) | Design | ⏳ Needed | Pre-launch |
| Social preview (1200x630 OG image) | Design | ⏳ Needed | Pre-launch |
| Demo screenshots (desktop + mobile) | Dev | ⏳ After demo built | Pre-launch |
| iOS app screenshots | Dev | ⏳ After iOS build | App page |
| Protocol diagrams (AP2, TAP, MCP) | Design | ⏳ Needed | How It Works |
| Hero illustration/animation | Design | Nice-to-have | Post-launch |

---

## SEO & Content Strategy

### Technical SEO
- Semantic HTML (`<main>`, `<article>`, `<nav>`)
- Proper heading hierarchy (single H1 per page)
- Meta descriptions for all pages
- OpenGraph + Twitter Card meta tags
- Structured data (Organization, SoftwareApplication)
- XML sitemap
- robots.txt

### Target Keywords
- "AI procurement software"
- "automated purchasing agent"
- "B2B buying automation"
- "agentic commerce"
- "procurement AI assistant"

### Future Content (Post-Launch)
- `/blog` — Use cases, customer stories, protocol deep-dives
- `/changelog` — Product updates, SDK releases
- Integration guides (Slack, SAP, NetSuite)

---

## Launch Checklist

### Pre-Launch
- [ ] Domain DNS → Vercel
- [ ] SSL certificate (auto via Vercel)
- [ ] Environment variables configured
- [ ] Plausible analytics installed
- [ ] All pages responsive (mobile-first)
- [ ] Lighthouse score ≥ 90 (Performance, A11y, SEO)
- [ ] OG images + meta tags
- [ ] Favicon set installed
- [ ] 404 page styled
- [ ] Legal pages (Privacy, Terms) — even if placeholder

### Launch Day
- [ ] DNS propagated
- [ ] Test all demo flows
- [ ] API health check passing
- [ ] Social preview renders correctly
- [ ] Share on Twitter/X, LinkedIn

### Post-Launch
- [ ] Monitor analytics
- [ ] Collect feedback
- [ ] Iterate on demo based on drop-off points
- [ ] Add blog/changelog when ready

---

## Related Projects

| Project | Location | Status |
|---------|----------|--------|
| AURA Core API | Railway (production) | ✅ Live |
| Scout SDK | `aura-labs/sdks/scout-js` | ✅ Complete |
| Beacon SDK | `aura-labs/sdks/beacon-js` | ✅ Complete |
| iOS App | `aura-labs/apps/scout-it-ios` | ✅ Built, pending Xcode test |
| Website | This project | 🚧 Starting |

---

## Quick Start for New Workspace

```bash
# Scaffold the project
npx create-next-app@latest scout-it-site --typescript --tailwind --app

# Install additional deps
npm install framer-motion

# Set environment variable
NEXT_PUBLIC_API_URL=https://aura-labsai-production.up.railway.app
```

Then build pages in this order:
1. Landing page (get the hero right)
2. Demo page (core value demonstration)
3. How It Works
4. Developers hub
5. iOS App page

---

*Updated to address: developer docs scope, pre-launch app strategy, API fallback handling, navigation IA, accessibility, SEO, asset ownership, and messaging prioritization.*
