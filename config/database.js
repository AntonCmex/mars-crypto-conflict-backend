// src/config/database.js
// Конфигурация подключения к PostgreSQL

const { Pool } = require('pg');
require('dotenv').config();

// Создаем пул подключений к базе данных
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20, // максимальное количество подключений
  idleTimeoutMillis: 30000, // время бездействия
  connectionTimeoutMillis: 2000, // таймаут подключения
});

// Событие при успешном подключении
pool.on('connect', () => {
  console.log('✅ Подключение к базе данных установлено');
});

// Событие при ошибке
pool.on('error', (err) => {
  console.error('❌ Ошибка базы данных:', err.message);
});

// Экспортируем функции для работы с базой
module.exports = {
  // Функция для выполнения SQL запросов
  query: (text, params) => pool.query(text, params),
  
  // Сам пул подключений (может понадобиться)
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
