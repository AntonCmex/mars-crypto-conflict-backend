// src/middleware/auth.js
const crypto = require('crypto');

// Временный секретный токен (в будущем вынесешь в .env)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

/**
 * Middleware для проверки авторизационных данных от Telegram Web App
 */
const verifyTelegramWebAppData = (req, res, next) => {
  try {
    console.log('[Auth] Attempting Telegram authentication...');
    
    // 1. Получаем initData из запроса
    let initData = req.headers['authorization']?.replace('tma ', '') || 
                   req.headers['x-telegram-init-data'] || 
                   req.query.initData;
    
    if (!initData) {
      console.warn('[Auth] No Telegram initData provided');
      
      // Проверяем тестовый режим
      const testUserId = req.headers['x-telegram-user-id'];
      if (testUserId && process.env.NODE_ENV === 'development') {
        console.log(`[Auth] Using test mode with user ID: ${testUserId}`);
        req.telegramUser = {
          id: parseInt(testUserId),
          first_name: 'Test',
          last_name: 'User',
          username: 'test_user',
          language_code: 'ru'
        };
        req.isTelegramAuth = true;
        return next();
      }
      
      return res.status(401).json({ 
        success: false, 
        error: 'Telegram authentication required' 
      });
    }

    // 2. Парсим строку initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) {
      console.warn('[Auth] No hash in initData');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Telegram initData format' 
      });
    }

    // 3. Подготавливаем строку для проверки
    const dataCheckEntries = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') {
        dataCheckEntries.push(`${key}=${value}`);
      }
    }
    
    // Сортируем по алфавиту
    dataCheckEntries.sort();
    const dataCheckString = dataCheckEntries.join('\n');
    
    // 4. Вычисляем секретный ключ
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();
    
    // 5. Вычисляем хеш и сравниваем
    const calculatedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    if (calculatedHash !== hash) {
      console.warn('[Auth] Hash verification failed');
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid Telegram Web App data' 
      });
    }
    
    // 6. Данные верифицированы — извлекаем информацию о пользователе
    const userDataStr = params.get('user');
    if (userDataStr) {
      try {
        req.telegramUser = JSON.parse(userDataStr);
        console.log(`[Auth] User authenticated: ${req.telegramUser.id} (@${req.telegramUser.username || 'no_username'})`);
      } catch (e) {
        console.error('[Auth] Failed to parse Telegram user data:', e);
        // Не прерываем выполнение, но отмечаем, что данных пользователя нет
        req.telegramUser = null;
      }
    } else {
      req.telegramUser = null;
    }
    
    // 7. Добавляем флаг авторизации
    req.isTelegramAuth = true;
    
    next();
  } catch (error) {
    console.error('[Auth] Error in Telegram verification:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal authentication error' 
    });
  }
};

/**
 * Упрощенный middleware для тестирования (без проверки хеша)
 * Используется только в режиме разработки
 */
const mockTelegramAuth = (req, res, next) => {
  console.log('[Auth] Using mock authentication (development mode)');
  
  // Получаем Telegram ID из заголовков или используем тестовый
  const telegramId = req.headers['x-telegram-user-id'] || 
                     req.headers['x-telegram-user-id'] || 
                     '123456789';
  
  const username = req.headers['x-telegram-username'] || 'test_user';
  const firstName = req.headers['x-telegram-first-name'] || 'Test';
  const lastName = req.headers['x-telegram-last-name'] || 'User';
  
  // Тестовые данные пользователя
  req.telegramUser = {
    id: parseInt(telegramId) || 123456789,
    first_name: firstName,
    last_name: lastName,
    username: username,
    language_code: 'ru',
    is_premium: true
  };
  
  console.log(`[Auth] Mock user authenticated: ${req.telegramUser.id} (@${req.telegramUser.username})`);
  
  req.isTelegramAuth = true;
  next();
};

/**
 * Простой middleware для тестирования - принимает любой запрос
 */
const simpleAuth = (req, res, next) => {
  console.log('[Auth] Using simple authentication (no verification)');
  
  // Получаем Telegram ID из заголовков или генерируем
  const telegramId = req.headers['x-telegram-user-id'] || 
                     `test_${Date.now()}`;
  
  req.telegramUser = {
    id: parseInt(telegramId) || Date.now(),
    first_name: 'Test',
    last_name: 'User',
    username: 'test_user',
    language_code: 'ru'
  };
  
  console.log(`[Auth] Simple auth - User ID: ${req.telegramUser.id}`);
  
  req.isTelegramAuth = true;
  next();
};

module.exports = {
  verifyTelegramWebAppData,
  mockTelegramAuth,
  simpleAuth
};
