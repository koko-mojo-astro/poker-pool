---
name: poker-pool-project-guide
description: Guides work in the Poker Pool codebase using the real project architecture, business flow, game logic, InstantDB patterns, and UI conventions. Use when building features, fixing bugs, reviewing changes, or explaining behavior in this repository.
---

# Poker Pool Project Guide

Use this skill when working anywhere in this repository.

## Quick Start

1. Anchor every change to the current architecture:
   - `src/hooks/useGameState.ts` orchestrates auth, data loading, and the `sendMessage` action layer.
   - `src/lib/GameEngine.ts` is the canonical home for game-state mutations and settlement logic.
   - `src/instant.schema.ts` is the schema source of truth.
   - `src/components/` contains screen and modal UI.
2. Keep the product model in mind:
   - This app is a real-time poker pool tracker, not a full betting engine.
   - Live room state is in `rooms` and `roomPlayers`.
   - Immutable history is stored in `matches`.
3. Before larger changes, read [project-overview.md](project-overview.md).

## Project Rules

- Do not add a router, custom backend, localStorage-based room state, or an extra state-management library unless explicitly requested.
- Keep business logic in `useGameState` and `GameEngine`, not scattered across components.
- Preserve the status-driven screen flow: signed out -> profile setup -> `Home` -> `WaitingRoom` -> `GameScreen` -> `VictoryScreen`.
- Use InstantDB reactively: `db.useAuth()`, `db.useQuery()`, `db.queryOnce()`, `tx`, `id()`, and batched `db.transact([...txs])`.
- Normalize linked InstantDB data because relations may arrive as either arrays or objects.
- Preserve the existing UI language: dark glassmorphism, CSS variables and utility classes from `src/index.css`, and inline styles for component-local layout.
- Preserve app layout: `#root` is flex column with `min-height: 100dvh`; main content is wrapped in `.app-scroll` (scrollable area); footer uses `.app-footer` and stays at the bottom of the viewport. Do not set `height: 100%` on `html` or `body`. `.container` is block-level (no flex: 1). GameScreen top bar shows Live Match, Room, Settlement Order, and leaderboard/exit only; the staged-visit bar appears inline in the "You" panel only when there are staged actions.

## Business Logic Checklist

- Room creation creates both a `rooms` record and a linked `roomPlayers` record for the creator.
- Joining a room resolves `roomCode` through `db.queryOnce()` and creates a linked `roomPlayers` record for the joining profile.
- `matches` must remain as the historical ledger for completed games.
- `rooms.totalSettlements` is the cumulative session balance and should not be overwritten with per-match-only data.
- Creator exit disbands the room; guest exit only removes that guest's `roomPlayers` record.

## Game Logic Checklist

- `startGame()` only runs for the creator while the room is in `WAITING` and has at least two players.
- Gameplay visit flow: only **normal pot** (POT_CARD with `cardId`) is staged in `stagedVisitActions` and committed with `COMMIT_VISIT`. **Wrong-ball pot** (POT_CARD with `rank`), **draw**, **foul**, and **joker** apply immediately: `sendMessage` gets a fresh room and calls `GameEngine.commitVisit(db, roomData, playerId, [single action])` with no staging. `GameEngine.applyVisitActions()` replays actions on a room snapshot; `GameEngine.commitVisit()` runs against a fresh room, resolves the winner, and persists in one transaction. There are no turn-based fields.
- `pottedCards` stores ranks only.
- Potting a rank removes every card of that rank from every player's hand.
- A successful first pot grants a license.
- Fouls revoke the license and try to draw a penalty card that is not already potted.
- Positive joker increments require a license; joker counts can never go below zero.
- Direct joker payouts depend on `turnOrder`; "above" means the previous player in the ordered array.
- Settlement netting belongs in `GameEngine.computeSettlements()`.

## Unit Testing Workflow

- Add or update unit tests for every behavior change in `src/lib/GameEngine.ts`, `src/hooks/useGameState.ts`, `src/lib/Deck.ts`, or settlement/card-rule logic.
- Keep test files colocated with implementation when possible (for example `src/lib/GameEngine.test.ts`) and use shared fixtures in `src/test/fixtures/`.
- Keep tests deterministic:
  - Mock InstantDB write surfaces (`db.transact`, `tx`, `id`) so tests remain unit-level.
  - Stub randomness (`Math.random`) for deck/order related scenarios.
  - Assert invariant outcomes (status transitions, potted-rank propagation, settlements, license/joker constraints), not implementation noise.
- For bug fixes, write a failing test first when practical, then implement the fix.

## Implementation Patterns

### Adding or changing a game action

1. Update the `ClientMessage` union and, if needed, the `VisitAction` type in `src/types.ts` (e.g. for new staged actions or `UNDO_VISIT_ACTION`, `CLEAR_VISIT_DRAFT`, `COMMIT_VISIT`).
2. For visit-scoped actions: add or update pure apply logic in `GameEngine` (e.g. `applyPotAction`, `applyVisitActions`) and the single commit path `commitVisit`; do not add per-action commit methods.
3. Wire the action through `sendMessage` in `src/hooks/useGameState.ts`. **Immediate-apply actions** (wrong-ball pot, draw, foul, joker): get fresh room data and call `GameEngine.commitVisit(db, roomData, playerId, [single action])`; do not stage. **Draft-only:** normal pot (POT_CARD with `cardId`) uses `stageVisitAction`; the user commits with `COMMIT_VISIT`, which calls `GameEngine.commitVisit` with all staged actions.
4. Update the relevant screen component to call `sendMessage` and, if needed, show the staged-visit bar (only when `stagedVisitActions.length > 0`).
5. Verify the resulting InstantDB shape still matches `src/instant.schema.ts`.

### Changing the data model

1. Edit `src/instant.schema.ts`.
2. Add indexes for any new field that will be filtered or ordered.
3. Update query code only after the schema supports the access pattern.
4. Keep JSON fields for flexible blobs such as hands, configs, settlements, and turn order.

### Reviewing or debugging

1. Start at `useGameState` to understand what UI state is derived.
2. Inspect `GameEngine` for rule enforcement and transaction boundaries.
3. Confirm the schema matches the queried fields and linked relations.
4. Check whether a bug is caused by array/object relation shape differences.

## Validation

- Run `npx tsc --noEmit` after substantive edits.
- Run `npm run lint` after substantive edits.
- Run `npm run test` after substantive edits, and ensure changed behavior has matching unit coverage.
- For gameplay changes, verify create/join/start/play/finish/restart/exit flows still behave correctly across multiple clients.

## Additional Resource

- [project-overview.md](project-overview.md): architecture, business domain, game rules, file map, and known repo quirks.
