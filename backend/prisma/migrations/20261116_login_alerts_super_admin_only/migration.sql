-- Login/session alerts (REP_LOGIN_CONFLICT) are now for the super-admin only.
-- Remove the copies previously delivered to every other user.
DELETE FROM "user_notifications" n
USING "users" u
WHERE n."user_id" = u."id"
  AND n."metadata"->>'kind' = 'REP_LOGIN_CONFLICT'
  AND lower(u."email") <> 'mggouda@gmail.com';
