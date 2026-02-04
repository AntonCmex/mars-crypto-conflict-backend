// src/services/GameService.js
const User = require('../models/User');
const Building = require('../models/Building');
const Transaction = require('../models/Transaction');
const GameLog = require('../models/GameLog');

class GameService {
  // Конфигурация игры (соответствует фронтенду)
  static CONFIG = {
    MINING_RATE: 0.001,
    BASE_STORAGE_CAPACITY: 100,
    
    BUILDING_COSTS: {
      base: 100,
      mining: 400,
      power: 400
    },
    
    FREE_BUILDINGS: {
      base: true,
      mining: true,
      power: true
    },
    
    UPGRADE_COSTS: {
      base: [50, 100, 200],
      mining: [100, 200, 400],
      power: [100, 200, 400]
    },
    
    UPGRADE_BONUSES: {
      base: [0.5, 1.0, 2.0],
      mining: [0.5, 1.0, 2.0],
      power: [2, 4, 8]
    },
    
    ENERGY_CONSUMPTION: {
      base: 0,
      mining: 2,
      power: 0
    },
    
    ENERGY_PRODUCTION: {
      base: 0,
      mining: 0,
      power: 5
    },
    
    UPKEEP_COSTS: {
      base: 0.0002,
      mining: 0.0002,
      power: 0.0002
    },
    
    UPGRADE_UPKEEP_MULTIPLIERS: {
      base: [1.5, 2.0, 2.5],
      mining: [1.5, 2.0, 2.5],
      power: [1.5, 2.0, 2.5]
    },
    
    WITHDRAWAL_MIN: 10,
    WITHDRAWAL_COOLDOWN: 24 * 60 * 60 * 1000, // 24 часа
    GAS_FEE: 0.001
  };

  /**
   * Получить или создать пользователя
   */
  static async getOrCreateUser(telegramUser) {
    try {
      const user = await User.findOrCreate(telegramUser);
      
      // Логируем вход
      await GameLog.create({
        user_id: user.id,
        action: 'user_login',
        details: {
          telegram_id: telegramUser.id,
          username: telegramUser.username,
          is_new_user: !user.created_at
        }
      });
      
      return user;
    } catch (error) {
      console.error('[GameService] Ошибка получения пользователя:', error);
      throw error;
    }
  }

  /**
   * Получить полное состояние игры для пользователя
   */
  static async getUserGameState(userId) {
    try {
      const user = await User.findByTelegramId(userId);
      if (!user) {
        throw new Error('Пользователь не найден');
      }

      const buildings = await Building.findByUserId(user.id);
      const energy = this.calculateEnergy(buildings);
      
      // Рассчитываем добычу и обновляем состояние
      const miningData = await this.calculateAndUpdateMining(user, buildings);
      
      return {
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
          last_withdrawal: user.last_withdrawal
        },
        buildings: buildings.map(b => ({
          id: b.id,
          type: b.type,
          level: b.level,
          x_coordinate: b.x_coordinate,
          y_coordinate: b.y_coordinate,
          efficiency: parseFloat(b.efficiency),
          created_at: b.created_at
        })),
        mining: {
          rate: miningData.miningRate,
          net_rate: miningData.netMiningRate,
          active_miners: miningData.activeMiners,
          has_power: energy.production >= energy.consumption
        },
        energy: energy,
        storage: {
          current: parseFloat(user.base_storage),
          capacity: this.CONFIG.BASE_STORAGE_CAPACITY + 
                   (buildings.filter(b => b.type === 'base')
                    .reduce((sum, b) => sum + (this.CONFIG.UPGRADE_BONUSES.base[b.level - 1] || 0) * this.CONFIG.BASE_STORAGE_CAPACITY, 0)),
          is_full: parseFloat(user.base_storage) >= 
                   (this.CONFIG.BASE_STORAGE_CAPACITY + 
                    buildings.filter(b => b.type === 'base')
                    .reduce((sum, b) => sum + (this.CONFIG.UPGRADE_BONUSES.base[b.level - 1] || 0) * this.CONFIG.BASE_STORAGE_CAPACITY, 0))
        },
        can_collect: parseFloat(user.base_storage) > 0,
        free_buildings: {
          base: !buildings.some(b => b.type === 'base'),
          mining: !buildings.some(b => b.type === 'mining'),
          power: !buildings.some(b => b.type === 'power')
        }
      };
    } catch (error) {
      console.error('[GameService] Ошибка получения состояния игры:', error);
      throw error;
    }
  }

  /**
   * Рассчитать энергию
   */
  static calculateEnergy(buildings) {
    let production = 0;
    let consumption = 0;
    
    buildings.forEach(building => {
      if (this.CONFIG.ENERGY_PRODUCTION[building.type]) {
        let energy = this.CONFIG.ENERGY_PRODUCTION[building.type];
        if (building.level > 0 && building.type === 'power') {
          energy += this.CONFIG.UPGRADE_BONUSES.power[building.level - 1] || 0;
        }
        production += energy;
      }
      if (this.CONFIG.ENERGY_CONSUMPTION[building.type]) {
        consumption += this.CONFIG.ENERGY_CONSUMPTION[building.type];
      }
    });
    
    return { production, consumption, has_surplus: production >= consumption };
  }

  /**
   * Рассчитать добычу и обновить состояние
   */
  static async calculateAndUpdateMining(user, buildings) {
    try {
      const energy = this.calculateEnergy(buildings);
      const now = new Date();
      
      // Находим активные буровые
      const miningBuildings = buildings.filter(b => b.type === 'mining');
      const activeMiners = energy.has_surplus ? miningBuildings.length : 0;
      
      // Рассчитываем базовую добычу
      let totalMiningRate = 0;
      miningBuildings.forEach(building => {
        let rate = this.CONFIG.MINING_RATE;
        if (building.level > 0) {
          const bonus = this.CONFIG.UPGRADE_BONUSES.mining[building.level - 1] || 0;
          rate *= (1 + bonus);
        }
        totalMiningRate += rate;
      });
      
      // Учитываем только если есть энергия
      if (!energy.has_surplus) {
        totalMiningRate = 0;
      }
      
      // Рассчитываем расходы на содержание
      let totalUpkeep = 0;
      buildings.forEach(building => {
        let upkeep = this.CONFIG.UPKEEP_COSTS[building.type] || 0;
        if (building.level > 0) {
          const multiplier = this.CONFIG.UPGRADE_UPKEEP_MULTIPLIERS[building.type][building.level - 1] || 1;
          upkeep *= multiplier;
        }
        totalUpkeep += upkeep;
      });
      
      // Чистая добыча
      const netMiningRate = totalMiningRate - totalUpkeep;
      
      // Если пользователь давно не заходил, применяем добычу за прошедшее время
      if (user.last_collect) {
        const lastUpdate = new Date(user.last_collect);
        const secondsPassed = (now - lastUpdate) / 1000;
        
        if (secondsPassed > 0) {
          let minedAmount = 0;
          
          if (netMiningRate > 0) {
            // Добавляем добычу
            minedAmount = netMiningRate * secondsPassed;
            const capacity = this.CONFIG.BASE_STORAGE_CAPACITY + 
                           buildings.filter(b => b.type === 'base')
                           .reduce((sum, b) => sum + (this.CONFIG.UPGRADE_BONUSES.base[b.level - 1] || 0) * this.CONFIG.BASE_STORAGE_CAPACITY, 0);
            
            const currentStorage = parseFloat(user.base_storage);
            const availableSpace = capacity - currentStorage;
            minedAmount = Math.min(minedAmount, availableSpace);
            
            if (minedAmount > 0) {
              user.base_storage = currentStorage + minedAmount;
              user.total_mined = parseFloat(user.total_mined) + minedAmount;
            }
          } else if (netMiningRate < 0) {
            // Расходуем из хранилища
            const lossAmount = -netMiningRate * secondsPassed;
            const currentStorage = parseFloat(user.base_storage);
            
            if (currentStorage >= lossAmount) {
              user.base_storage = currentStorage - lossAmount;
            } else {
              user.base_storage = 0;
            }
          }
          
          // Обновляем время последнего обновления
          user.last_collect = now;
          
          // Сохраняем изменения в БД
          await User.updateBalance(user.telegram_id, 0); // Обновляем только хранилище и общую добычу
        }
      }
      
      return {
        miningRate: totalMiningRate,
        netMiningRate: netMiningRate,
        upkeepRate: totalUpkeep,
        activeMiners: activeMiners,
        hasPower: energy.has_surplus
      };
    } catch (error) {
      console.error('[GameService] Ошибка расчета добычи:', error);
      throw error;
    }
  }

  /**
   * Собрать ресурсы из хранилища
   */
  static async collectResources(userId) {
    try {
      const user = await User.findByTelegramId(userId);
      if (!user) {
        throw new Error('Пользователь не найден');
      }
      
      const storageAmount = parseFloat(user.base_storage);
      if (storageAmount <= 0) {
        throw new Error('Нет ресурсов для сбора');
      }
      
      // Обновляем баланс
      const updatedUser = await User.updateBalance(user.telegram_id, storageAmount);
      
      // Сбрасываем хранилище
      user.base_storage = 0;
      user.last_collect = new Date();
      
      // Логируем сбор
      await GameLog.logCollection(user.id, storageAmount, storageAmount, 0);
      
      return {
        success: true,
        collected: storageAmount,
        new_balance: parseFloat(updatedUser.game_balance),
        storage_after: 0
      };
    } catch (error) {
      console.error('[GameService] Ошибка сбора ресурсов:', error);
      throw error;
    }
  }

  /**
   * Построить здание
   */
  static async buildBuilding(userId, buildingData) {
    try {
      const user = await User.findByTelegramId(userId);
      if (!user) {
        throw new Error('Пользователь не найден');
      }
      
      const { type, x_coordinate, y_coordinate } = buildingData;
      
      // Проверяем требования
      const existingBuildings = await Building.findByUserId(user.id);
      
      // Проверка на наличие базы для других зданий
      if ((type === 'mining' || type === 'power') && 
          !existingBuildings.some(b => b.type === 'base')) {
        throw new Error('Сначала постройте базу');
      }
      
      // Проверка на дубликат базы
      if (type === 'base' && existingBuildings.some(b => b.type === 'base')) {
        throw new Error('У вас уже есть база');
      }
      
      // Проверка стоимости
      const isFirstFree = this.CONFIG.FREE_BUILDINGS[type] && 
                         !existingBuildings.some(b => b.type === type);
      const cost = isFirstFree ? 0 : this.CONFIG.BUILDING_COSTS[type];
      
      if (!isFirstFree && parseFloat(user.game_balance) < cost) {
        throw new Error(`Недостаточно средств. Нужно: ${cost} MNRT`);
      }
      
      // Проверка позиции (минимальное расстояние)
      for (const building of existingBuildings) {
        const distance = Math.sqrt(
          Math.pow(x_coordinate - building.x_coordinate, 2) + 
          Math.pow(y_coordinate - building.y_coordinate, 2)
        );
        if (distance < 60) {
          throw new Error('Слишком близко к другому зданию');
        }
      }
      
      // Списываем стоимость
      if (!isFirstFree) {
        await User.updateBalance(user.telegram_id, -cost);
      }
      
      // Создаем здание
      const building = await Building.create(user.id, {
        type: type,
        x_coordinate: x_coordinate,
        y_coordinate: y_coordinate,
        level: 1
      });
      
      // Логируем строительство
      await GameLog.logBuildingAction(user.id, 'build', {
        type: type,
        cost: cost,
        x_coordinate: x_coordinate,
        y_coordinate: y_coordinate
      });
      
      return {
        success: true,
        building: building,
        cost: cost,
        is_free: isFirstFree,
        new_balance: isFirstFree ? 
          parseFloat(user.game_balance) : 
          parseFloat(user.game_balance) - cost
      };
    } catch (error) {
      console.error('[GameService] Ошибка строительства:', error);
      throw error;
    }
  }

  /**
   * Обновить BSC адрес кошелька
   */
  static async updateWalletAddress(userId, walletAddress) {
    try {
      // Валидация BSC адреса
      if (!walletAddress.startsWith('0x') || walletAddress.length !== 42) {
        throw new Error('Неверный формат BSC адреса. Должен начинаться с 0x и быть 42 символа');
      }
      
      const user = await User.updateWallet(userId, walletAddress);
      
      // Логируем изменение адреса
      await GameLog.logWalletAction(user.id, 'update_address', {
        old_address: null, // В реальном приложении можно сохранять старый адрес
        new_address: walletAddress
      });
      
      return {
        success: true,
        wallet_address: walletAddress
      };
    } catch (error) {
      console.error('[GameService] Ошибка обновления адреса:', error);
      throw error;
    }
  }

  /**
   * Инициировать вывод средств
   */
  static async initiateWithdrawal(userId, amount) {
    try {
      const user = await User.findByTelegramId(userId);
      if (!user) {
        throw new Error('Пользователь не найден');
      }
      
      // Валидация
      if (!user.wallet_address) {
        throw new Error('Сначала укажите BSC адрес');
      }
      
      if (amount < this.CONFIG.WITHDRAWAL_MIN) {
        throw new Error(`Минимальная сумма вывода: ${this.CONFIG.WITHDRAWAL_MIN} MNRT`);
      }
      
      if (parseFloat(user.game_balance) < amount) {
        throw new Error('Недостаточно средств на балансе');
      }
      
      // Проверка кулдауна
      if (user.last_withdrawal) {
        const lastWithdrawal = new Date(user.last_withdrawal);
        const now = new Date();
        const hoursSinceLast = (now - lastWithdrawal) / (1000 * 60 * 60);
        
        if (hoursSinceLast < 24) {
          const remainingHours = 24 - hoursSinceLast;
          throw new Error(`Следующий вывод возможен через ${Math.ceil(remainingHours)} часов`);
        }
      }
      
      // Проверка на pending транзакции
      const hasPending = await Transaction.hasPendingWithdrawal(user.id);
      if (hasPending) {
        throw new Error('У вас уже есть незавершенная транзакция вывода');
      }
      
      // Создаем транзакцию
      const transaction = await Transaction.create({
        user_id: user.id,
        type: 'withdrawal',
        amount: amount,
        status: 'pending',
        metadata: {
          wallet_address: user.wallet_address,
          requested_at: new Date().toISOString()
        }
      });
      
      // Списываем сумму с баланса
      await User.updateBalance(user.telegram_id, -amount);
      
      // Обновляем время последнего вывода
      await User.updateLastWithdrawal(user.telegram_id);
      
      // Логируем вывод
      await GameLog.logWalletAction(user.id, 'withdraw_request', {
        amount: amount,
        transaction_id: transaction.id,
        wallet_address: user.wallet_address
      });
      
      return {
        success: true,
        transaction: transaction,
        new_balance: parseFloat(user.game_balance) - amount
      };
    } catch (error) {
      console.error('[GameService] Ошибка инициирования вывода:', error);
      throw error;
    }
  }

  /**
   * Получить таблицу лидеров
   */
  static async getLeaderboard(limit = 10) {
    try {
      const topUsers = await User.getTopUsers(limit);
      
      return topUsers.map((user, index) => ({
        rank: index + 1,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        total_mined: parseFloat(user.total_mined),
        game_balance: parseFloat(user.game_balance),
        buildings_count: 0, // Нужно будет добавить подсчет зданий
        joined_at: user.created_at
      }));
    } catch (error) {
      console.error('[GameService] Ошибка получения лидерборда:', error);
      throw error;
    }
  }
}

module.exports = GameService;