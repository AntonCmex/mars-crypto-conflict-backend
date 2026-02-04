// src/routes/game.js
const express = require('express');
const router = express.Router();
const GameService = require('../services/GameService');
const Building = require('../models/Building');
const { validateRequiredFields } = require('../middleware/validation');

/**
 * @route   GET /api/game/buildings
 * @desc    Получить все здания пользователя
 * @access  Private
 */
router.get('/buildings', async (req, res) => {
  try {
    // Временно: используем Telegram ID из query (позже из auth middleware)
    const telegramId = req.query.telegram_id || req.user?.telegram_id;
    
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Telegram ID is required'
      });
    }

    // Получаем пользователя
    const user = await require('../models/User').findByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Получаем здания пользователя
    const buildings = await Building.findByUserId(user.id);
    
    res.json({
      success: true,
      buildings: buildings.map(b => ({
        id: b.id,
        type: b.type,
        level: b.level,
        x_coordinate: b.x_coordinate,
        y_coordinate: b.y_coordinate,
        efficiency: parseFloat(b.efficiency),
        created_at: b.created_at
      }))
    });
  } catch (error) {
    console.error('[API] Error getting buildings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching buildings'
    });
  }
});

/**
 * @route   POST /api/game/buildings/save
 * @desc    Сохранить здания пользователя
 * @access  Private
 */
router.post('/buildings/save', validateRequiredFields(['telegram_id', 'buildings']), async (req, res) => {
  try {
    const { telegram_id, buildings } = req.body;
    
    // Находим пользователя
    const user = await require('../models/User').findByTelegramId(telegram_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Удаляем старые здания пользователя
    const oldBuildings = await Building.findByUserId(user.id);
    // В реальном приложении мы бы обновляли, а не удаляли
    // Но для простоты сначала удаляем все, потом сохраняем новые
    
    // Валидация данных зданий
    const validBuildings = buildings.filter(b => 
      b.type && ['base', 'mining', 'power'].includes(b.type) &&
      typeof b.x_coordinate === 'number' &&
      typeof b.y_coordinate === 'number' &&
      b.level >= 1 && b.level <= 3
    );

    if (validBuildings.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid buildings provided'
      });
    }

    // Сохраняем здания
    const savedBuildings = [];
    
    // В реальном приложении нужно bulk insert или транзакция
    // Сейчас просто сохраняем по одному (для демо)
    for (const buildingData of validBuildings) {
      // Проверяем, есть ли уже такое здание
      const existing = await Building.findByUserAndType(user.id, buildingData.type);
      
      if (existing) {
        // Обновляем существующее
        // В реальном приложении нужно проверять ID и координаты
        continue; // Пропускаем для демо
      } else {
        // Создаем новое
        const building = await Building.create(user.id, {
          type: buildingData.type,
          level: buildingData.level || 1,
          x_coordinate: buildingData.x_coordinate,
          y_coordinate: buildingData.y_coordinate,
          efficiency: buildingData.efficiency || 1.0
        });
        savedBuildings.push(building);
      }
    }

    // Логируем действие
    await require('../models/GameLog').create({
      user_id: user.id,
      action: 'save_buildings',
      details: {
        count: savedBuildings.length,
        types: savedBuildings.map(b => b.type),
        timestamp: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: `Saved ${savedBuildings.length} buildings`,
      saved_count: savedBuildings.length,
      buildings: savedBuildings.map(b => ({
        id: b.id,
        type: b.type,
        level: b.level,
        x: b.x_coordinate,
        y: b.y_coordinate
      }))
    });
  } catch (error) {
    console.error('[API] Error saving buildings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while saving buildings'
    });
  }
});

/**
 * @route   POST /api/game/buildings/move
 * @desc    Переместить здание
 * @access  Private
 */
router.post('/buildings/move', validateRequiredFields(['telegram_id', 'building_id', 'x', 'y']), async (req, res) => {
  try {
    const { telegram_id, building_id, x, y } = req.body;
    
    const user = await require('../models/User').findByTelegramId(telegram_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Обновляем позицию
    const updated = await Building.updatePosition(building_id, user.id, x, y);
    
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Building not found or access denied'
      });
    }

    res.json({
      success: true,
      building: {
        id: updated.id,
        x: updated.x_coordinate,
        y: updated.y_coordinate
      }
    });
  } catch (error) {
    console.error('[API] Error moving building:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while moving building'
    });
  }
});

/**
 * @route   GET /api/game/state
 * @desc    Получить полное состояние игры
 * @access  Private
 */
router.get('/state', async (req, res) => {
  try {
    const telegramId = req.query.telegram_id || req.user?.telegram_id;
    
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Telegram ID is required'
      });
    }

    const gameState = await GameService.getUserGameState(telegramId);
    
    res.json({
      success: true,
      ...gameState
    });
  } catch (error) {
    console.error('[API] Error getting game state:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching game state'
    });
  }
});

/**
 * @route   POST /api/game/collect
 * @desc    Собрать ресурсы из хранилища
 * @access  Private
 */
router.post('/collect', validateRequiredFields(['telegram_id']), async (req, res) => {
  try {
    const { telegram_id } = req.body;
    
    const result = await GameService.collectResources(telegram_id);
    
    res.json(result);
  } catch (error) {
    console.error('[API] Error collecting resources:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error while collecting resources'
    });
  }
});

module.exports = router;