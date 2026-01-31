-- Миграция: Добавление индивидуальной цены Kaspa для клиентов
-- Дата: 2026-01-31

-- Добавляем поле custom_price_kaspa в таблицу clients
ALTER TABLE clients ADD COLUMN custom_price_kaspa REAL;

-- Комментарий: custom_price_kaspa = NULL означает использование стандартной цены
-- Если задано значение, то клиент будет платить эту индивидуальную цену
