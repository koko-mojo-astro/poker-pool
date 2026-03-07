# Poker Pool Overview

## What the app is

Poker Pool is a real-time multiplayer poker pool tracker built with React, TypeScript, Vite, and InstantDB. It is client-driven: there is no custom backend, no router, and no separate game service. InstantDB handles auth, persistence, relationships, and real-time sync.

The app tracks live room state, player hands, potted ranks, joker counters, winners, and historical settlements for repeated games in the same room session.

## Core user flow

1. User signs in with Google.
2. User creates a profile if one does not exist.
3. User creates a room or joins an existing room via room code.
4. Players wait in the room until the creator starts the game.
5. During play, users draw cards, pot ranks, mark fouls, and update joker counts.
6. When a player wins, the app records a `matches` history entry and updates cumulative room settlements.
7. The creator can restart for another match, or players can leave the room.

## Main architecture

- `src/App.tsx`: app shell and top-level screen selection.
- `src/hooks/useGameState.ts`: central orchestration hook for auth, queries, state shaping, and `sendMessage`.
- `src/lib/GameEngine.ts`: canonical game logic and atomic transaction layer.
- `src/lib/Deck.ts`: deck creation and shuffle/draw behavior.
- `src/instant.schema.ts`: InstantDB entities and links.
- `src/types.ts`: domain types and client action contracts.
- `src/components/`: screen and modal UI such as `Home`, `WaitingRoom`, `GameScreen`, `VictoryScreen`, `ProfileSettings`, and `LeaderboardModal`.
- `src/index.css`: shared design tokens and utility classes.

## Data model

### Entities

- `$users`: Instant auth users.
- `profiles`: display identity linked 1:1 with `$users`.
- `rooms`: live room/session aggregate.
- `roomPlayers`: per-player state within a room.
- `matches`: immutable history for completed games.

### Important room fields

- `roomCode`: join code for resolving rooms.
- `status`: `WAITING`, `PLAYING`, or `FINISHED`.
- `config`: game-level amounts such as base game amount and joker amount.
- `deck`: remaining deck after dealing and drawing.
- `pottedCards`: ranks that have already been potted.
- `turnOrder`: ordered player ids used for turn-relative payout rules.
- `winnerId`: winner of the current completed game.
- `totalSettlements`: cumulative session balance across all finished matches in the room.

### Important room-player fields

- `hand`: current cards.
- `cardCount`: hand size for easy rendering.
- `hasLicense`: whether the player can accumulate jokers.
- `jokerBalls`: `{ direct, all }`.
- `isCreator`: whether the player controls room lifecycle actions.

## Business logic

- The room is the live session container.
- A match is one completed game within that room session.
- `matches` should preserve completed-game history even after the room is deleted.
- `totalSettlements` is the ongoing ledger across the room's lifetime, while `matches.settlements` is specific to a single finished game.
- Screen state is derived from auth/profile presence and active room status, not URL routes.

## Game logic invariants

- `GameEngine` is the single source of truth for game-state mutations.
- Engine methods are `static async` and should batch related writes into one `db.transact([...txs])`.
- `startGame()` only runs in `WAITING`, only for the creator, and only with at least two players.
- Each player is dealt seven cards at game start.
- `drawCard()` skips cards whose rank already exists in `pottedCards`.
- `potCard()` pots a rank, grants the actor a license if needed, and removes that rank from every player's hand.
- A win is detected when any player's filtered hand reaches zero after potting.
- `markFoul()` removes the player's license and attempts to draw a non-potted penalty card.
- `updateJokerCount()` only allows positive increments when the player has a license and never allows counts below zero.
- Direct joker settlement pays the player above in `turnOrder`.
- All joker settlement charges all eligible opponents according to the configured amount.
- Pairwise netting is centralized in `GameEngine.computeSettlements()`.

## UI and styling conventions

- Dark-mode-only glassmorphism UI.
- Shared tokens and utility classes live in `src/index.css`.
- Common utilities include `.glass-panel`, `.btn-primary`, `.container`, and `.animate-fade-in`.
- Components use inline styles for local layout and composition.
- Do not introduce Tailwind, CSS Modules, styled-components, or a competing design system unless explicitly requested.

## Coding guidelines

- Use `db.useAuth()` and `db.useQuery()` for reactive data flow.
- Use `db.queryOnce()` for one-off lookups like room-code resolution.
- Use `id()` for new records and `tx` plus `db.transact()` for writes.
- Never call hooks conditionally; pass `null` to skip a query.
- Normalize linked InstantDB fields because some relations may arrive as arrays and others as single objects.
- Keep UI components focused on presentation and user actions; put game logic in `GameEngine`.
- Avoid propagating `any` beyond raw database-boundary code.

## Known quirks to keep in mind

- `RULES.md` is more accurate than `README.md`.
- `README.md` still mentions Tailwind and `VITE_INSTANTDB_APP_ID`, but the current code uses vanilla CSS and reads `VITE_INSTANT_APP_ID` in `src/lib/db.ts`.
- `generateRoomCode()` currently creates 8-character codes, so UI and validation should stay aligned with that rule.

## Recommended validation

- `npx tsc --noEmit`
- `npm run lint`
- Manual multi-client verification for create, join, start, draw, pot, foul, joker, finish, restart, and exit flows
