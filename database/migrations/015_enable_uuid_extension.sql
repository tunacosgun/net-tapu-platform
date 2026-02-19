-- Migration 015: Enable uuid-ossp extension
-- Run as: nettapu_migrator (superuser)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
