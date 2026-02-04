// src/models/GameLog.js
const db = require('../config/database');

class GameLog {
  /**
   * Создать запись в логе
   */
  static async create(logData) {
    const query = `
      INSERT INTO game_logs (user_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;
    
    const values = [
      logData.user_id,
      logData.action,
      logData.details || {}
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Найти логи пользователя
   */
  static async findByUserId(userId, limit = 100) {
    const query = `
      SELECT * FROM game_logs 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await db.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Найти логи по действию
   */
  static async findByAction(userId, action, limit = 50) {
    const query = `
      SELECT * FROM game_logs 
      WHERE user_id = $1 AND action = $2
      ORDER BY created_at DESC 
      LIMIT $3
    `;
    
    const result = await db.query(query, [userId, action, limit]);
    return result.rows;
  }

  /**
   * Записать действие строительства
   */
  static async logBuildingAction(userId, action, buildingData) {
    return this.create({
      user_id: userId,
      action: `building_${action}`,
      details: {
        building_type: buildingData.type,
        building_level: buildingData.level || 1,
        coordinates: {
          x: buildingData.x_coordinate || 0,
          y: buildingData.y_coordinate || 0
        },
        cost: buildingData.cost || 0
      }
    });
  }

  /**
   * Записать действие сбора ресурсов
   */
  static async logCollection(userId, amount, storageBefore, storageAfter) {
    return this.create({
      user_id: userId,
      action: 'collect_resources',
      details: {
        amount: amount,
        storage_before: storageBefore,
        storage_after: storageAfter,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Записать действие улучшения
   */
  static async logUpgrade(userId, buildingId, buildingType, oldLevel, newLevel, cost) {
    return this.create({
      user_id: userId,
      action: 'upgrade_building',
      details: {
        building_id: buildingId,
        building_type: buildingType,
        old_level: oldLevel,
        new_level: newLevel,
        upgrade_cost: cost,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Записать действие с кошельком
   */
  static async logWalletAction(userId, action, data) {
    return this.create({
      user_id: userId,
      action: `wallet_${action}`,
      details: {
        ...data,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Получить статистику действий пользователя
   */
  static async getUserActivityStats(userId, days = 7) {
    const query = `
      SELECT 
        action,
        COUNT(*) as count,
        DATE(created_at) as date,
        MAX(created_at) as last_activity
      FROM game_logs 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY action, DATE(created_at)
      ORDER BY date DESC, count DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Получить последние действия пользователя
   */
  static async getRecentActivity(userId, hours = 24) {
    const query = `
      SELECT 
        action,
        details,
        created_at,
        EXTRACT(HOUR FROM NOW() - created_at) as hours_ago
      FROM game_logs 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
      ORDER BY created_at DESC
      LIMIT 50
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Очистить старые логи (старше 30 дней)
   */
  static async cleanupOldLogs(daysToKeep = 30) {
    const query = `
      DELETE FROM game_logs 
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
      RETURNING COUNT(*) as deleted_count
    `;
    
    const result = await db.query(query);
    return parseInt(result.rows[0].deleted_count);
  }
}

module.exports = GameLog;