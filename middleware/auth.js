// src/middleware/auth.js
const crypto = require('crypto');

// Временный секретный токен (в будущем вынесешь в .env)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

/**
 * Middleware для проверки авторизационных данных от Telegram Web App
 */
const verifyTelegramWebAppData = (req, res, next) => {
  try {
    // 1. Получаем initData из запроса
    let initData = req.headers['x-telegram-init-data'] || req.query.initData;
    
    if (!initData) {
      console.warn('[Auth] No Telegram initData provided');
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
  
  // Тестовые данные пользователя
  req.telegramUser = {
    id: 123456789,
    first_name: 'Test',
    last_name: 'User',
    username: 'test_user',
    language_code: 'ru',
    is_premium: true
  };
  
  req.isTelegramAuth = true;
  next();
};

module.exports = {
  verifyTelegramWebAppData,
  mockTelegramAuth
};