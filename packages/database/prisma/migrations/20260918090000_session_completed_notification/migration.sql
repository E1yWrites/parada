-- Phase 15 remediation: drivers had no notification when a parking session
-- closed and its fee was priced. The fee row was written, but nothing told the
-- owner about it, so completion feedback depended on the driver happening to
-- open the sessions history.
ALTER TYPE "NotificationType" ADD VALUE 'SESSION_COMPLETED';
