# Poker Pool Helper

A sleek, real-time poker pool management tool featuring automated payout calculations (Direct/All Joker rules), session persistence, and a modern glassmorphism UI. Built with React and InstantDB for seamless group gameplay.

## Features

- **Real-Time Synchronization:** Instant updates across all connected clients using InstantDB.
- **Automated Payouts:** Calculates complex settlements dynamically based on Direct and All Joker game rules.
- **Session Persistence:** Game state, history, and player profiles are securely saved and restored across sessions.
- **Modern UI/UX:** Built with a custom glassmorphism design system and shared CSS tokens.
- **Authentication:** Secure Google OAuth integration powered by InstantDB.
- **Comprehensive History:** Built-in leaderboards, game history tracking, and detailed pairwise settlement breakdowns.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend/Database:** InstantDB (Client-side real-time database)
- **Styling:** Custom CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- An InstantDB account and app ID

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/koko-mojo-astro/poker-pool.git
   cd new-poker-pool
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
   VITE_INSTANT_APP_ID=your_instant_app_id
   VITE_INSTANT_CLIENT_NAME=google-web
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production

To create a production build:
```bash
npm run build
```

The output will be generated in the `dist` directory, ready to be deployed to a static hosting provider.

### Render Static Site

This app should be deployed on Render as a Static Site, not a Web Service.

- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Runtime env vars:
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_INSTANT_APP_ID`
  - `VITE_INSTANT_CLIENT_NAME`

The repo includes `render.yaml` to codify the expected Render configuration.

## Unit Testing

This project uses Vitest for unit testing with a jsdom environment.

### Run tests

```bash
npm run test
```

### Watch mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

### Test structure

- Unit tests live next to source files (for example: `src/lib/GameEngine.test.ts`).
- Shared test fixtures and helpers live in `src/test/fixtures/`.
- Core business logic (especially `GameEngine` rules and settlements) should be covered for any behavior change.

### Required pre-delivery checks

Run these before opening a PR or deploying:

```bash
npm run lint
npx tsc --noEmit
npm run test
```

## Architecture

This project recently transitioned from a traditional Node.js/WebSocket backend to a fully client-driven architecture using InstantDB. The core logic resides in:
- `src/lib/GameEngine.ts`: Handles game logic, state transitions, and payout calculations.
- `src/hooks/useGameState.ts`: Bridges the React frontend with InstantDB's real-time queries and transactions.
- `src/instant.schema.ts`: Defines the unified data model for users, rooms, and game history.

## Game Rules

The app implements standard poker pool rules, automating the tedious math:
- **Game Amount:** The base stake for winning a game.
- **Direct Joker:** Penalties applied directly to the player who drew the Joker.
- **All Joker:** Penalties applied across the board when a specific Joker condition is met.
- **Settlements:** At the end of each game, the system calculates pairwise settlements minimizing the number of transactions required between players.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open-source. Please see the LICENSE file for details.
