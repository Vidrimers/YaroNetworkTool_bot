-- Добавление поля max_devices для ограничения количества устройств
-- По умолчанию 2 устройства на клиента

ALTER TABLE clients ADD COLUMN max_devices INTEGER NOT NULL DEFAULT 2;

-- Индекс не требуется, так как это не поле для поиска
