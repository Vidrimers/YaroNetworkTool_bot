-- Добавление поля для отслеживания предупреждений о торрентах
-- Выполнить на сервере: sqlite3 database/yaronetworkbase.db < database/migrations/add_torrent_warnings.sql

-- Добавляем поле torrent_warnings (количество предупреждений)
ALTER TABLE clients ADD COLUMN torrent_warnings INTEGER DEFAULT 0;

-- Обновляем существующих клиентов
UPDATE clients SET torrent_warnings = 0 WHERE torrent_warnings IS NULL;
