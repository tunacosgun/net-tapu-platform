NetTapu Platform – Project Context

Project Overview

NetTapu is a production-grade real estate and land sales platform that includes a live online auction system.

The platform consists of:
	•	Web application
	•	iOS & Android mobile apps
	•	Admin panel
	•	Shared backend services
	•	Real-time live auction engine
	•	Payment & deposit management system

Core Purpose

The system enables users to:
	•	Browse land parcels on a map-based interface
	•	Purchase properties directly
	•	Participate in real-time live auctions
	•	Place bids with deposit verification
	•	Complete secure financial transactions

Critical System Components
	1.	Live Auction Engine
	•	Real-time bid processing
	•	Deterministic bid ordering
	•	Race condition prevention
	•	Legally compliant auction rules
	2.	Financial System
	•	Virtual POS integration
	•	Deposit (kaparo) management
	•	Refund workflows
	•	Audit-safe transaction logs
	3.	Data Integrity
	•	Single source of truth backend
	•	No eventual consistency on critical flows
	•	Cross-platform synchronization (web/mobile/admin)
	4.	Admin & CRM
	•	Property management
	•	Auction configuration
	•	User management
	•	Dealer/consultant system
	•	Campaign & analytics module

Architecture Principles
	•	Production-ready only (no demo logic)
	•	Modular but single backend authority
	•	High availability
	•	Secure by default
	•	Legally binding behavior compliance
