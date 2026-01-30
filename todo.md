# Quality Assurance Dashboard - TODO

## Phase 1: Database Schema & Setup
- [x] Update Drizzle schema with Call, Transcript, and Analysis tables
- [x] Run database migration
- [x] Create seed data script with sample calls

## Phase 2: Backend API
- [x] Create tRPC procedures for listing calls
- [x] Create tRPC procedures for getting call details
- [x] Create tRPC procedures for getting transcripts
- [x] Create tRPC procedures for getting analysis

## Phase 3: Frontend UI
- [x] Design dashboard layout with navigation
- [x] Build call list view with table
- [x] Build call detail view with transcript
- [x] Build analysis view with compliance check
- [ ] Add filtering and search functionality (future enhancement)

## Phase 4: Testing & Deployment
- [x] Write Vitest tests for tRPC procedures
- [x] Test UI functionality
- [x] Create initial checkpoint

## Phase 5: OpenPhone API Integration
- [x] Request OPENPHONE_API_KEY from user
- [x] Create OpenPhone API client helper
- [x] Implement syncCalls function with pagination
- [x] Implement fetchTranscript function
- [x] Add database upsert logic for calls and transcripts
- [x] Create tRPC mutation for sync trigger
- [x] Add sync button to UI
- [x] Write Vitest tests for sync functionality
- [x] Test end-to-end sync process

## Phase 6: QA Analysis with LLM
- [x] Review Strategic Quo Setup Guide for QA criteria
- [x] Create qa-criteria.ts with structured LLM prompt
- [x] Implement analyzeCall function with LLM integration
- [x] Add database logic to save analysis results
- [x] Create tRPC mutation for triggering analysis
- [x] Add UI button to trigger analysis on calls
- [x] Write Vitest tests for analysis function
- [x] Test end-to-end analysis workflow

## Phase 7: Dashboard UI Enhancements
- [x] Create database queries for dashboard statistics
- [x] Add stats cards (Total Calls, Average QA Score, Compliance Rate)
- [x] Enhance CallDetails page with full analysis display
- [x] Add chat-style transcript view
- [x] Add Re-Analyze button to call details

## Phase 8: Script Optimizer
- [x] Create Script Optimizer page
- [x] Add database query for failed calls (negative sentiment or low scores)
- [x] Implement LLM integration for script improvement suggestions
- [x] Create UI to display script improvement recommendations
- [x] Write tests for script optimizer functionality
