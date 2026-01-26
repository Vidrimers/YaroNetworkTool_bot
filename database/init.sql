-- Инициализация базы данных для YaroNetworkTool Bot
-- Схема базы данных для управления VPN клиентами

-- Таблица клиентов
CREATE TABLE IF NOT EXISTS clients (
    uuid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    telegram_id INTEGER UNIQUE,
    email TEXT,
    
    -- Подписка
    subscription_days INTEGER NOT NULL DEFAULT 30,
    subscription_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    subscription_end DATETIME NOT NULL,
    
    -- Трафик
    traffic_limit_gb REAL NOT NULL DEFAULT 100.0,
    traffic_used_gb REAL NOT NULL DEFAULT 0.0,
    traffic_reset_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Статус
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'blocked', 'expired')),
    blocked_reason TEXT,
    
    -- Метаданные
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_connection DATETIME
);

-- Таблица запросов на продление
CREATE TABLE IF NOT EXISTS extension_requests (
    id TEXT PRIMARY KEY,
    client_uuid TEXT NOT NULL,
    telegram_id INTEGER NOT NULL,
    
    -- Запрошенный период
    requested_months INTEGER NOT NULL,
    requested_days INTEGER NOT NULL,
    
    -- Статус запроса
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'expired')),
    
    -- Детали одобрения/отказа
    approved_days INTEGER,
    admin_telegram_id INTEGER,
    denial_reason TEXT,
    
    -- Метаданные
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    expires_at DATETIME NOT NULL,
    
    FOREIGN KEY (client_uuid) REFERENCES clients(uuid) ON DELETE CASCADE
);

-- Таблица логов трафика
CREATE TABLE IF NOT EXISTS traffic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_uuid TEXT NOT NULL,
    date DATE NOT NULL,
    bytes_uploaded INTEGER NOT NULL DEFAULT 0,
    bytes_downloaded INTEGER NOT NULL DEFAULT 0,
    bytes_total INTEGER NOT NULL DEFAULT 0,
    connections_count INTEGER NOT NULL DEFAULT 0,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (client_uuid) REFERENCES clients(uuid) ON DELETE CASCADE,
    UNIQUE(client_uuid, date)
);

-- Индексы для оптимизации запросов
CREATE INDEX IF NOT EXISTS idx_clients_telegram_id ON clients(telegram_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_subscription_end ON clients(subscription_end);

CREATE INDEX IF NOT EXISTS idx_extension_requests_client_uuid ON extension_requests(client_uuid);
CREATE INDEX IF NOT EXISTS idx_extension_requests_status ON extension_requests(status);
CREATE INDEX IF NOT EXISTS idx_extension_requests_created_at ON extension_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_traffic_logs_client_uuid ON traffic_logs(client_uuid);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_date ON traffic_logs(date);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER IF NOT EXISTS update_clients_timestamp 
AFTER UPDATE ON clients
BEGIN
    UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE uuid = NEW.uuid;
END;

-- Триггер для автоматического истечения старых запросов
CREATE TRIGGER IF NOT EXISTS expire_old_requests
AFTER INSERT ON extension_requests
BEGIN
    UPDATE extension_requests 
    SET status = 'expired' 
    WHERE status = 'pending' 
    AND datetime(expires_at) < datetime('now');
END;
