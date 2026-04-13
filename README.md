# Bobora WalkGuard

Pedestrian route deviation detection engine for walking navigation.

## Current Milestone
Milestone 1: Route deviation engine only

## Goal
Build a reusable walking-route deviation engine that detects:
- on_route
- drifting
- deviated
- passed_turn

This milestone focuses only on the engine core and test harness.

## Out of Scope
- mobile UI
- map SDK integration
- backend API
- database
- user authentication
- production deployment

## Commands
- npm run test
- npm run test:run
- npm run typecheck
- npm run simulate

## Expected Output
The engine should accept synthetic walking samples and return route-state decisions that can later be connected to a mobile navigation app.