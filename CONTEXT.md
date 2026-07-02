# PRD: Reddit 8-bit Overview Application

## 1. Product Description

A gamified Reddit client that visualizes a user's subscription ecosystem as an 8-bit, bird’s-eye view pixel-art office. The application transforms passive feed-scrolling into an interactive "management simulation" experience where users act as overseers of their subreddit data.

## 2. Technical Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **State Management:** TanStack Query (for data fetching/caching)
- **Animation:** Framer Motion (for smooth entity movement and UI transitions)
- **Styling:** CSS Modules
- **Graphics/Assets:** Procedural generation via SVG and geometric/mathematical rendering (avoiding external image assets where possible to maintain the 8-bit aesthetic).

## 3. Core Functional Requirements

### A. Authentication & Integration

- OAuth2 flow with Reddit.
- Fetch user-subscribed subreddits.
- Efficient polling/caching of subreddit listings (New/Hot/Rising/Trending).

### B. Visual Logic (The "8-bit Office")

- **Visuals:** All office assets (cubicles, desk layouts, workers) are rendered using SVG or CSS/Mathematical primitives to achieve the pixel-art look.
- **Cubicles:** Each subscribed subreddit is rendered as a distinct 2D "cubicle" layout.
- **Workers:** Posts are rendered as persistent "workers" within cubicles.
  - Visual distinction based on score/engagement (e.g., workers moving faster or changing color for trending posts).
- **Interaction Engine:**
  - Clicking a worker triggers a Framer Motion-based modal overlay.
  - Modal displays post metadata, content, and integrated comment preview.

### C. Configuration & Management

- **Persistence:** Local/database-backed settings for user preferences.
- **Filtering/Whitelisting:** A sidebar control panel to:
  - Whitelist/Blacklist subreddits to control visual density.
  - Toggle visibility based on post category (Hot, New, Top, etc.).
  - Set "worker" spawn rules.

## 4. User Journey

1. User authenticates via Reddit.
2. App generates a randomized but persistent office layout for the user's specific subreddits.
3. User monitors "worker" activity—clicking workers to read content.
4. User adjusts the "Office Policy" (filters/whitelists) in the settings menu to prune the noise.

## 5. Implementation Roadmap

1. [ ] **Setup:** Project initialization with Next.js/TypeScript/CSS Modules.
2. [ ] **Auth:** Implement Reddit OAuth flow.
3. [ ] **Layer 1:** Basic Grid/Cubicle layout prototyping using SVG/Math-based rendering.
4. [ ] **Layer 2:** Mock data to build Framer Motion interaction logic.
5. [ ] **Layer 3:** Integration with Reddit API (snoowrap or raw REST).
6. [ ] **Configuration:** Build UI for filtering and managing subscriptions.
