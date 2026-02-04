// src/models/Building.js
const db = require('../config/database');

class Building {
  /**
   * Найти все здания пользователя
   */
  static async findByUserId(userId) {
    const query = 'SELECT * FROM buildings WHERE user_id = $1 ORDER BY type';
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Найти здание пользователя по типу
   */
  static async findByUserAndType(userId, buildingType) {
    const query = 'SELECT * FROM buildings WHERE user_id = $1 AND type = $2';
    const result = await db.query(query, [userId, buildingType]);
    return result.rows[0];
  }

  /**
   * Создать новое здание
   */
  static async create(userId, buildingData) {
    const query = `
      INSERT INTO buildings (
        user_id, type, level, x_coordinate, y_coordinate,
        efficiency, created_at, upgraded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;
    
    const values = [
      userId,
      buildingData.type,
      buildingData.level || 1,
      buildingData.x_coordinate || 0,
      buildingData.y_coordinate || 0,
      buildingData.efficiency || 1.0
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Удалить здание
   */
  static async delete(buildingId, userId) {
    const query = 'DELETE FROM buildings WHERE id = $1 AND user_id = $2 RETURNING *';
    const result = await db.query(query, [buildingId, userId]);
    return result.rows[0];
  }

  /**
   * Обновить позицию здания
   */
  static async updatePosition(buildingId, userId, x, y) {
    const query = `
      UPDATE buildings 
      SET x_coordinate = $1, y_coordinate = $2
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `;
    
    const result = await db.query(query, [x, y, buildingId, userId]);
    return result.rows[0];
  }

  /**
   * Улучшить здание
   */
  static async upgrade(buildingId, userId) {
    const query = `
      UPDATE buildings 
      SET level = level + 1, upgraded_at = NOW()
      WHERE id = $1 AND user_id = $2 AND level < 3
      RETURNING *
    `;
    
    const result = await db.query(query, [buildingId, userId]);
    return result.rows[0];
  }

  /**
   * Получить статистику по зданиям пользователя
   */
  static async getUserStats(userId) {
    const query = `
      SELECT 
        type,
        COUNT(*) as count,
        AVG(level)::numeric(3,1) as avg_level,
        SUM(CASE WHEN level = 1 THEN 1 ELSE 0 END) as level1,
        SUM(CASE WHEN level = 2 THEN 1 ELSE 0 END) as level2,
        SUM(CASE WHEN level = 3 THEN 1 ELSE 0 END) as level3
      FROM buildings 
      WHERE user_id = $1
      GROUP BY type
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Проверить, есть ли у пользователя здание данного типа
   */
  static async hasBuilding(userId, buildingType) {
    const query = 'SELECT 1 FROM buildings WHERE user_id = $1 AND type = $2 LIMIT 1';
    const result = await db.query(query, [userId, buildingType]);
    return result.rows.length > 0;
  }

  /**
   * Получить общее количество зданий пользователя
   */
  static async getTotalCount(userId) {
    const query = 'SELECT COUNT(*) as total FROM buildings WHERE user_id = $1';
    const result = await db.query(query, [userId]);
    return parseInt(result.rows[0].total);
  }
}

module.exports = Building;