// src/routes/user.js
const express = require('express');
const router = express.Router();
const GameService = require('../services/GameService');
const { mockTelegramAuth } = require('../middleware/auth');

/**
 * @route   GET /api/user/me
 * @desc    Получить данные текущего пользователя
 * @access  Private
 */
router.get('/me', mockTelegramAuth, async (req, res) => {
  try {
    // В реальном приложении берем из req.user (после верификации Telegram)
    // Сейчас используем mock данные
    const telegramUser = req.telegramUser || {
      id: req.query.telegram_id || 123456789,
      username: 'test_user',
      first_name: 'Test'
    };

    // Получаем или создаем пользователя
    const user = await GameService.getOrCreateUser(telegramUser);
    
    res.json({
      success: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        wallet_address: user.wallet_address,
        game_balance: parseFloat(user.game_balance),
        base_storage: parseFloat(user.base_storage),
        total_mined: parseFloat(user.total_mined),
        last_collect: user.last_collect,
        last_withdrawal: user.last_withdrawal,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('[API] Error getting user data:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching user data'
    });
  }
});

/**
 * @route   POST /api/user/create
 * @desc    Создать нового пользователя (для тестирования)
 * @access  Public (только для разработки)
 */
router.post('/create', async (req, res) => {
  try {
    const { telegram_id, username, first_name } = req.body;
    
    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'Telegram ID is required'
      });
    }

    const telegramUser = {
      id: telegram_id,
      username: username || `user_${telegram_id}`,
      first_name: first_name || 'Player'
    };

    const user = await GameService.getOrCreateUser(telegramUser);
    
    res.json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        game_balance: parseFloat(user.game_balance)
      }
    });
  } catch (error) {
    console.error('[API] Error creating user:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating user'
    });
  }
});

/**
 * @route   GET /api/user/stats
 * @desc    Получить статистику пользователя
 * @access  Private
 */
router.get('/stats', async (req, res) => {
  try {
    const telegramId = req.query.telegram_id;
    
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Telegram ID is required'
      });
    }

    // Находим пользователя
    const User = require('../models/User');
    const Building = require('../models/Building');
    const Transaction = require('../models/Transaction');
    
    const user = await User.findByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Получаем статистику
    const buildings = await Building.findByUserId(user.id);
    const buildingStats = await Building.getUserStats(user.id);
    const transactionStats = await Transaction.getUserStats(user.id);
    
    // Расчет времени игры (примерно)
    const playTimeHours = Math.floor(
      (new Date() - new Date(user.created_at)) / (1000 * 60 * 60)
    );
    
    res.json({
      success: true,
      stats: {
        player: {
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          joined_at: user.created_at,
          play_time_hours: playTimeHours
        },
        game: {
          total_mined: parseFloat(user.total_mined),
          game_balance: parseFloat(user.game_balance),
          base_storage: parseFloat(user.base_storage),
          buildings_count: buildings.length,
          has_base: buildings.some(b => b.type === 'base')
        },
        buildings: buildingStats,
        transactions: transactionStats
      }
    });
  } catch (error) {
    console.error('[API] Error getting user stats:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching user stats'
    });
  }
});

module.exports = router;