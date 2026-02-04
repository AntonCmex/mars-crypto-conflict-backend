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
const { verifyTelegramWebAppData, mockTelegramAuth } = require('./middleware/auth');
const { validateRequest, validateRequiredFields } = require('./middleware/validation');

// Создаем Express приложение
const app = express();
const PORT = process.env.PORT || 3000;

// ========== КОНФИГУРАЦИЯ ==========
const NODE_ENV = process.env.NODE_ENV || 'development';
const USE_MOCK_AUTH = NODE_ENV === 'development'; // В разработке используем mock авторизацию

// ========== MIDDLEWARE ==========
// Разрешаем запросы с других доменов (для фронтенда)
app.use(cors());

// Парсим JSON данные из запросов
app.use(express.json({ limit: '10mb' })); // Увеличиваем лимит для сохранения зданий

// Парсим URL-encoded данные
app.use(express.urlencoded({ extended: true }));

// Логируем все запросы (для отладки)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // Логируем body для POST запросов (кроме чувствительных данных)
  if (req.method === 'POST' && !req.url.includes('/wallet/save')) {
    console.log('Body:', JSON.stringify(req.body).substring(0, 200) + '...');
  }
  
  next();
});

// ========== МАРШРУТЫ API ==========

// 1. Главная страница и документация API
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Mars Crypto Conflict API работает!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    documentation: {
      user: {
        me: 'GET /api/user/me - данные пользователя',
        create: 'POST /api/user/create - создать пользователя (dev)',
        stats: 'GET /api/user/stats - статистика пользователя'
      },
      game: {
        state: 'GET /api/game/state - состояние игры',
        buildings: 'GET /api/game/buildings - здания пользователя',
        save_buildings: 'POST /api/game/buildings/save - сохранить здания',
        move_building: 'POST /api/game/buildings/move - переместить здание',
        collect: 'POST /api/game/collect - собрать ресурсы'
      },
      wallet: {
        save: 'POST /api/wallet/save - сохранить BSC адрес',
        withdraw: 'POST /api/wallet/withdraw - вывод средств',
        transactions: 'GET /api/wallet/transactions - история транзакций',
        info: 'GET /api/wallet/info - информация о кошельке',
        leaderboard: 'GET /api/wallet/leaderboard - таблица лидеров'
      },
      system: {
        health: 'GET /api/health - проверка здоровья системы',
        test: 'GET /api/test - тестовый эндпоинт'
      }
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
        uptime: process.uptime() + ' seconds',
        port: PORT,
        auth_mode: USE_MOCK_AUTH ? 'mock' : 'telegram'
      },
      database: dbTest,
      services: {
        postgres: dbTest.connected ? 'operational' : 'down',
        api: 'operational'
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
    message: 'Тестовый эндпоинт работает!',
    data: {
      game: 'Mars Crypto Conflict',
      token: 'MNRT',
      blockchain: 'BSC',
      api_version: '1.0.0'
    }
  });
});

// ========== ОСНОВНЫЕ МАРШРУТЫ API ==========

// API для пользователей
app.use('/api/user', userRoutes);

// API для игры (требует авторизацию)
if (USE_MOCK_AUTH) {
  console.log('🔓 Используется MOCK авторизация (режим разработки)');
  app.use('/api/game', mockTelegramAuth, gameRoutes);
  app.use('/api/wallet', mockTelegramAuth, walletRoutes);
} else {
  console.log('🔐 Используется Telegram Web App авторизация');
  app.use('/api/game', verifyTelegramWebAppData, gameRoutes);
  app.use('/api/wallet', verifyTelegramWebAppData, walletRoutes);
}

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
  console.log('='.repeat(50));
  console.log('🚀 Mars Crypto Conflict Server запущен!');
  console.log('='.repeat(50));
  console.log(`📡 Порт: ${PORT}`);
  console.log(`🌐 Режим: ${NODE_ENV}`);
  console.log(`🔐 Авторизация: ${USE_MOCK_AUTH ? 'MOCK (разработка)' : 'Telegram Web App'}`);
  console.log(`🕐 Время запуска: ${new Date().toLocaleString()}`);
  console.log('');
  console.log('🔗 Доступные URL:');
  console.log(`   • Главная: http://localhost:${PORT}`);
  console.log(`   • Здоровье: http://localhost:${PORT}/api/health`);
  console.log(`   • Тест: http://localhost:${PORT}/api/test`);
  console.log('');
  console.log('📋 Документация API доступна на главной странице');
  console.log('');
  console.log('⚡ Для остановки сервера нажми Ctrl+C');
  console.log('='.repeat(50));
});

// Обработка ошибок сервера
process.on('uncaughtException', (error) => {
  console.error('❌ Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанный промис:', reason);
});

// Экспортируем app для тестов
module.exports = app;