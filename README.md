# Poker Pool Helper

A sleek, real-time poker pool management tool featuring automated payout calculations (Direct/All Joker rules), session persistence, and a modern glassmorphism UI. Built with React and InstantDB for seamless group gameplay.

## Features

- **Real-Time Synchronization:** Instant updates across all connected clients using InstantDB.
- **Automated Payouts:** Calculates complex settlements dynamically based on Direct and All Joker game rules.
- **Session Persistence:** Game state, history, and player profiles are securely saved and restored across sessions.
- **Modern UI/UX:** Built with TailwindCSS leveraging a sleek glassmorphism aesthetic.
- **Authentication:** Secure Google OAuth integration powered by InstantDB.
- **Comprehensive History:** Built-in leaderboards, game history tracking, and detailed pairwise settlement breakdowns.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend/Database:** InstantDB (Client-side real-time database)
- **Styling:** TailwindCSS
- **Icons:** Lucide React

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
   Create a `.env` file in the root directory and add your InstantDB App ID:
   ```env
   VITE_INSTANTDB_APP_ID=your_app_id_here
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

The output will be generated in the `dist` directory, ready to be deployed to your preferred static hosting provider (e.g., Vercel, Netlify).

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
