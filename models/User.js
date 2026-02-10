// src/models/User.js
const db = require('../config/database');

class User {
  /**
   * Найти пользователя по Telegram ID
   */
  static async findByTelegramId(telegramId) {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await db.query(query, [telegramId]);
    return result.rows[0];
  }

  /**
   * Найти пользователя по BSC кошельку
   */
  static async findByWalletAddress(walletAddress) {
    const query = 'SELECT * FROM users WHERE wallet_address = $1';
    const result = await db.query(query, [walletAddress]);
    return result.rows[0];
  }

  /**
   * Создать нового пользователя
   */
  static async create(telegramUser) {
    const query = `
      INSERT INTO users (
        telegram_id, username, 
        game_balance, base_storage, total_mined,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;
    
    const values = [
      telegramUser.id,
      telegramUser.username || null,
      0.0, // game_balance
      0.0, // base_storage
      0.0, // total_mined
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Получить или создать пользователя (findOrCreate)
   */
  static async findOrCreate(telegramUser) {
    let user = await this.findByTelegramId(telegramUser.id);
    
    if (!user) {
      user = await this.create(telegramUser);
      console.log(`[User Model] Создан новый пользователь: ID ${user.id}, Telegram: ${user.telegram_id}`);
    }
    
    return user;
  }

  /**
   * Обновить BSC адрес кошелька
   */
  static async updateWallet(telegramId, walletAddress) {
    const query = `
      UPDATE users 
      SET wallet_address = $1, updated_at = NOW()
      WHERE telegram_id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [walletAddress, telegramId]);
    return result.rows[0];
  }

  /**
   * Обновить баланс пользователя
   */
  static async updateBalance(telegramId, amount) {
    const query = `
      UPDATE users 
      SET game_balance = game_balance + $1, 
          total_mined = total_mined + $2,
          updated_at = NOW()
      WHERE telegram_id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [amount, amount > 0 ? amount : 0, telegramId]);
    return result.rows[0];
  }

  /**
   * Обновить энергию
   */
  static async updateEnergy(telegramId, production, consumption) {
    const query = `
      UPDATE users 
      SET energy_production = $1, 
          energy_consumption = $2,
          updated_at = NOW()
      WHERE telegram_id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [production, consumption, telegramId]);
    return result.rows[0];
  }

  /**
   * Обновить время последнего сбора
   */
  static async updateLastCollect(telegramId) {
    const query = `
      UPDATE users 
      SET last_collect = NOW(), updated_at = NOW()
      WHERE telegram_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [telegramId]);
    return result.rows[0];
  }

  /**
   * Обновить время последнего вывода
   */
  static async updateLastWithdrawal(telegramId) {
    const query = `
      UPDATE users 
      SET last_withdrawal = NOW(), updated_at = NOW()
      WHERE telegram_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [telegramId]);
    return result.rows[0];
  }

  /**
   * Получить топ пользователей по добыче
   */
  static async getTopUsers(limit = 10) {
    const query = `
      SELECT 
        id, telegram_id, username, first_name,
        total_mined, game_balance,
        created_at
      FROM users 
      ORDER BY total_mined DESC 
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  }
}

module.exports = User;
