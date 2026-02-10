// src/app.js
// Главный файл сервера Mars Crypto Conflict

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Импорт маршрутов
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const walletRoutes = require('./routes/wallet');

// Middleware
const { verifyTelegramWebAppData, mockTelegramAuth, simpleAuth } = require('./middleware/auth');

// Создаем Express приложение
const app = express();
const PORT = process.env.PORT || 3000;

// ========== КОНФИГУРАЦИЯ ==========
const NODE_ENV = process.env.NODE_ENV || 'production';
const USE_MOCK_AUTH = process.env.USE_MOCK_AUTH === 'true';
const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';

console.log('='.repeat(50));
console.log('🚀 Mars Crypto Conflict Server');
console.log('='.repeat(50));
console.log(`📡 Режим: ${NODE_ENV}`);
console.log(`🔐 MOCK Auth: ${USE_MOCK_AUTH ? 'ON' : 'OFF'}`);
console.log(`🔓 Auth disabled: ${DISABLE_AUTH ? 'YES' : 'NO'}`);
console.log(`🕐 Запуск: ${new Date().toLocaleString()}`);

// ========== MIDDLEWARE ==========
// Разрешаем запросы с других доменов (для фронтенда)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Telegram-User-ID', 
    'X-Test-Mode',
    'X-Client',  // ✅ ДОБАВИТЬ ЭТО
    'Access-Control-Allow-Origin',  // ✅ ДОБАВИТЬ ЭТО
    'Access-Control-Allow-Headers'  // ✅ ДОБАВИТЬ ЭТО
  ],
  exposedHeaders: ['Content-Type', 'Authorization'],
  credentials: true  // ✅ ДОБАВИТЬ ЭТО
}));

// ✅ ЭТА СТРОКА ДОБАВЛЕНА
app.options('*', cors());

// Парсим JSON данные из запросов
app.use(express.json({ limit: '10mb' }));

// Парсим URL-encoded данные
app.use(express.urlencoded({ extended: true }));

// Логируем все запросы (для отладки)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // Логируем заголовки авторизации
  if (req.headers['authorization'] || req.headers['x-telegram-user-id']) {
    console.log('  Auth headers:', {
      auth: req.headers['authorization'] ? 'present' : 'missing',
      telegramId: req.headers['x-telegram-user-id'] || 'none',
      testMode: req.headers['x-test-mode'] || 'none'
    });
  }
  
  next();
});

// ========== МАРШРУТЫ API ==========

// 1. Главная страница и документация API
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Mars Crypto Conflict API работает!',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    auth_mode: DISABLE_AUTH ? 'disabled' : (USE_MOCK_AUTH ? 'mock' : 'telegram'),
    endpoints: {
      health: '/api/health',
      test: '/api/test',
      user: '/api/user/me',
      game: '/api/game/state',
      wallet: '/api/wallet/info'
    }
  });
});

// 2. Проверка здоровья системы
app.get('/api/health', async (req, res) => {
  try {
    // Подключаем базу данных
    const db = require('./config/database');
    
    // Проверяем подключение к базе
    const dbTest = await db.testConnection();
    
    // Формируем ответ
    const healthStatus = {
      status: 'healthy',
      server: {
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        auth_mode: DISABLE_AUTH ? 'disabled' : (USE_MOCK_AUTH ? 'mock' : 'telegram'),
        uptime: process.uptime() + ' seconds',
        port: PORT
      },
      database: dbTest,
      services: {
        postgres: dbTest.connected ? 'operational' : 'down',
        api: 'operational',
        auth: DISABLE_AUTH ? 'disabled' : 'enabled'
      }
    };
    
    // Если база не подключена, возвращаем ошибку
    if (!dbTest.connected) {
      healthStatus.status = 'degraded';
      healthStatus.message = 'Проблемы с подключением к базе данных';
      return res.status(500).json(healthStatus);
    }
    
    res.json(healthStatus);
    
  } catch (error) {
    console.error('❌ Ошибка в /api/health:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// 3. Простой эндпоинт для теста
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '✅ Тестовый эндпоинт работает!',
    data: {
      game: 'Mars Crypto Conflict',
      token: 'MNRT',
      blockchain: 'BSC',
      api_version: '2.0.0',
      auth_required: !DISABLE_AUTH
    }
  });
});

// ========== ВЫБОР СИСТЕМЫ АВТОРИЗАЦИИ ==========

console.log('\n🔐 Настройка системы авторизации...');

if (DISABLE_AUTH) {
  console.log('🔓 АВТОРИЗАЦИЯ ОТКЛЮЧЕНА - все запросы разрешены');
  
  // Простая заглушка для user
  app.use('/api/user', (req, res, next) => {
    req.telegramUser = {
      id: req.headers['x-telegram-user-id'] || Date.now(),
      first_name: 'Test',
      last_name: 'User',
      username: 'test_user'
    };
    next();
  }, userRoutes);
  
  // Для game и wallet используем simpleAuth
  app.use('/api/game', simpleAuth, gameRoutes);
  app.use('/api/wallet', simpleAuth, walletRoutes);
  
} else if (USE_MOCK_AUTH) {
  console.log('🎭 Используется MOCK авторизация');
  
  app.use('/api/user', mockTelegramAuth, userRoutes);
  app.use('/api/game', mockTelegramAuth, gameRoutes);
  app.use('/api/wallet', mockTelegramAuth, walletRoutes);
  
} else {
  console.log('🔐 Используется Telegram Web App авторизация');
  
  app.use('/api/user', verifyTelegramWebAppData, userRoutes);
  app.use('/api/game', verifyTelegramWebAppData, gameRoutes);
  app.use('/api/wallet', verifyTelegramWebAppData, walletRoutes);
}

// ========== АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ==========
const initializeDatabase = async () => {
  try {
    console.log('\n🔧 Инициализация базы данных...');
    const db = require('./config/database');
    
    // 1. Таблица пользователей (ПОЛНАЯ версия с updated_at)
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id VARCHAR(100) UNIQUE NOT NULL,
        username VARCHAR(100),
        first_name VARCHAR(100),
        wallet_address VARCHAR(100),
        game_balance DECIMAL(20, 8) DEFAULT 100.0,
        base_storage DECIMAL(20, 8) DEFAULT 50.0,
        total_mined DECIMAL(20, 8) DEFAULT 0.0,
        last_collect TIMESTAMP DEFAULT NOW(),
        last_withdrawal TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица users создана');
    
    // 2. Добавляем колонку updated_at если она не добавилась автоматически
    try {
      await db.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
      `);
      console.log('✅ Колонка updated_at проверена');
    } catch (alterError) {
      console.log('ℹ️  Колонка updated_at уже существует');
    }
    
    // 3. Тестовый пользователь
    await db.query(`
      INSERT INTO users (telegram_id, username, game_balance, base_storage) 
      VALUES ('test123', 'test_user', 100.0, 50.0)
      ON CONFLICT (telegram_id) DO NOTHING
    `);
    console.log('✅ Тестовый пользователь: test123');
    
    // 4. Проверяем что все работает
    const result = await db.query("SELECT COUNT(*) as user_count FROM users");
    console.log(`✅ База данных готова! Пользователей: ${result.rows[0].user_count}`);
    
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error.message);
    console.log('⚠️  Игра будет работать в тестовом режиме');
  }
};

// Запускаем инициализацию через 3 секунды после старта сервера
setTimeout(initializeDatabase, 3000);

// ========== ДОПОЛНИТЕЛЬНЫЕ ТАБЛИЦЫ ЧЕРЕЗ 5 СЕКУНД ==========
const initializeAdditionalTables = async () => {
  try {
    console.log('\n🔧 Создание дополнительных таблиц...');
    const db = require('./config/database');
    
    // 1. Таблица зданий
    await db.query(`
      CREATE TABLE IF NOT EXISTS buildings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        level INTEGER DEFAULT 1,
        x_coordinate INTEGER,
        y_coordinate INTEGER,
        efficiency DECIMAL(10, 4) DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица buildings создана');
    
    // 2. Таблица транзакций
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица transactions создана');
    
    // 3. Таблица логов игры
    await db.query(`
      CREATE TABLE IF NOT EXISTS game_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Таблица game_logs создана');
    
    console.log('🎯 Все таблицы базы данных готовы к работе!');
    
  } catch (error) {
    console.error('❌ Ошибка создания дополнительных таблиц:', error.message);
  }
};

// Запускаем создание дополнительных таблиц через 5 секунд
setTimeout(initializeAdditionalTables, 5000);

// ========== ОБРАБОТКА ОШИБОК ==========

// Обработка 404 ошибок (не найденные маршруты)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Маршрут ${req.method} ${req.url} не найден`,
    suggestion: 'Проверьте документацию API на главной странице (GET /)'
  });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('❌ Глобальная ошибка:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    stack: NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log('='.repeat(50));
  console.log('🔗 Доступные URL:');
  console.log(`   • Главная: http://localhost:${PORT}`);
  console.log(`   • Здоровье: http://localhost:${PORT}/api/health`);
  console.log(`   • Тест: http://localhost:${PORT}/api/test`);
  console.log('');
  console.log('⚡ Для остановки сервера нажми Ctrl+C');
  console.log('='.repeat(50));
});

// Экспортируем app для тестов
module.exports = app;
