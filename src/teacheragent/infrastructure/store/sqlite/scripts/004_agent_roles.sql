-- Agent role migration: teacher became tutor; knowledge_map is no longer a model role.
-- Historical call_logs are intentionally untouched because they are audit records.

DELETE FROM llm_profiles
WHERE role = 'knowledge_map';

DELETE FROM llm_profiles
WHERE role = 'teacher'
  AND EXISTS (
      SELECT 1 FROM llm_profiles AS tutor
      WHERE tutor.role = 'tutor' AND tutor.profile_id = llm_profiles.profile_id
  );

UPDATE llm_profiles SET role = 'tutor' WHERE role = 'teacher';

DELETE FROM llm_settings
WHERE role = 'knowledge_map';

DELETE FROM llm_settings
WHERE role = 'teacher'
  AND EXISTS (
      SELECT 1 FROM llm_settings AS tutor
      WHERE tutor.role = 'tutor'
  );

UPDATE llm_settings SET role = 'tutor' WHERE role = 'teacher';
