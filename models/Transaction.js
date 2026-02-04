// src/models/Transaction.js
const db = require('../config/database');

class Transaction {
  /**
   * Создать новую транзакцию
   */
  static async create(transactionData) {
    const query = `
      INSERT INTO transactions (
        user_id, type, amount, tx_hash, status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    
    const values = [
      transactionData.user_id,
      transactionData.type,
      transactionData.amount,
      transactionData.tx_hash || null,
      transactionData.status || 'pending',
      transactionData.metadata || {}
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Найти транзакции пользователя
   */
  static async findByUserId(userId, limit = 50) {
    const query = `
      SELECT * FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await db.query(query, [userId, limit]);
    return result.rows;
  }

  /**
   * Найти транзакцию по хешу
   */
  static async findByHash(txHash) {
    const query = 'SELECT * FROM transactions WHERE tx_hash = $1';
    const result = await db.query(query, [txHash]);
    return result.rows[0];
  }

  /**
   * Обновить статус транзакции
   */
  static async updateStatus(transactionId, status, txHash = null) {
    const query = `
      UPDATE transactions 
      SET status = $1, confirmed_at = NOW(), tx_hash = COALESCE($2, tx_hash)
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [status, txHash, transactionId]);
    return result.rows[0];
  }

  /**
   * Получить статистику по транзакциям пользователя
   */
  static async getUserStats(userId) {
    const query = `
      SELECT 
        type,
        COUNT(*) as count,
        SUM(amount) as total_amount,
        SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as successful_amount
      FROM transactions 
      WHERE user_id = $1
      GROUP BY type
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * Проверить, есть ли активная транзакция вывода у пользователя
   */
  static async hasPendingWithdrawal(userId) {
    const query = `
      SELECT 1 FROM transactions 
      WHERE user_id = $1 AND type = 'withdrawal' AND status = 'pending' 
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows.length > 0;
  }

  /**
   * Получить последнюю успешную транзакцию вывода
   */
  static async getLastSuccessfulWithdrawal(userId) {
    const query = `
      SELECT * FROM transactions 
      WHERE user_id = $1 AND type = 'withdrawal' AND status = 'success'
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Получить общую сумму выводов пользователя
   */
  static async getTotalWithdrawn(userId) {
    const query = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions 
      WHERE user_id = $1 AND type = 'withdrawal' AND status = 'success'
    `;
    
    const result = await db.query(query, [userId]);
    return parseFloat(result.rows[0].total);
  }
}

module.exports = Transaction;