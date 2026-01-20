# Poker Pool Helper

A modern web-based poker pool management and scorekeeping application. Designed for seamless group play with real-time updates, score tracking, and automated payout calculations.

## Features

- **Real-time Gameplay**: Instant state synchronization between all players.
- **Dynamic Leaderboard**: Track sessions and net settlements across multiple games.
- **Automated Payouts**: Complex "Direct Joker" and "All Joker" multiplier calculations handled automatically.
- **Session Persistence**: Refresh your browser anytime without losing your hand or position.
- **Mobile Responsive**: Sleek glassmorphism UI that works perfectly on phones and desktops.
- **Easy Room Management**: Create rooms with a custom code and share with friends.

## Tech Stack

- **Frontend**: React (Vite), TypeScript, Vanilla CSS (Glassmorphism design).
- **Backend**: Node.js, Express, WebSocket (`ws`).
- **Shared**: Common TypeScript interfaces for type safety across the stack.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository
2. Install dependencies for the root, client, and server:
   ```bash
   npm install
   cd client && npm install
   cd ../server && npm install
   ```

### Running Locally

From the root directory, start both the client and server in development mode:

```bash
npm run dev
```

- Client: [http://localhost:5173](http://localhost:5173)
- Server: [ws://localhost:3000](ws://localhost:3000)

## Game Rules

1. **Wait for Players**: 2-4 players join via a room code.
2. **Setup**: Host chooses a "Game Amount" (base pot) and "Joker Amount" (multiplier base).
3. **Gameplay**:
   - Players pot card ranks (e.g., A, 7, K).
   - Draw cards or mark a foul (losing license).
   - Update Joker multipliers (Direct or All) based on license status.
4. **Victory**: The first player to clear their hand wins the pot plus joker penalties from other players.

## Author

**koko-mojo-astro**

## License

This project is for private use and educational purposes.
