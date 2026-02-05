// src/config/database.js
// Конфигурация подключения к PostgreSQL для Render.com

const { Pool } = require('pg');
require('dotenv').config();

// Определяем конфигурацию подключения
let poolConfig;

// Проверяем наличие DATABASE_URL (используется на Render)
if (process.env.DATABASE_URL) {
  console.log('🔗 Используем DATABASE_URL для подключения к PostgreSQL');
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false  // Обязательно для Render PostgreSQL
    }
  };
} 
// Иначе используем отдельные параметры (для локальной разработки)
else {
  console.log('🏠 Используем локальные параметры БД');
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  };
}

// Добавляем общие настройки пула
Object.assign(poolConfig, {
  max: 10, // оптимальное количество подключений для Render
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Создаем пул подключений
const pool = new Pool(poolConfig);

// Событие при успешном подключении
pool.on('connect', () => {
  console.log('✅ Подключение к базе данных установлено');
});

// Событие при ошибке
pool.on('error', (err) => {
  console.error('❌ Ошибка базы данных:', err.message);
});

// Тестируем подключение при запуске
async function testInitialConnection() {
  try {
    const client = await pool.connect();
    console.log('🎯 Тестовый запрос к БД выполнен успешно');
    client.release();
  } catch (err) {
    console.error('⚠️  Не удалось подключиться к БД при запуске:', err.message);
    console.log('ℹ️  API будет работать в тестовом режиме без БД');
  }
}

// Запускаем тест подключения
testInitialConnection();

// Экспортируем функции для работы с базой
module.exports = {
  // Функция для выполнения SQL запросов
  query: (text, params) => pool.query(text, params),
  
  // Сам пул подключений
  pool,
  
  // Функция для проверки подключения
  testConnection: async () => {
    try {
      const result = await pool.query('SELECT NOW()');
      return {
        connected: true,
        timestamp: result.rows[0].now
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }
};
