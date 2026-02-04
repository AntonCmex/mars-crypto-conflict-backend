// src/routes/wallet.js
const express = require('express');
const router = express.Router();
const GameService = require('../services/GameService');
const Transaction = require('../models/Transaction');
const { validateRequiredFields } = require('../middleware/validation');

/**
 * @route   POST /api/wallet/save
 * @desc    Сохранить BSC адрес кошелька
 * @access  Private
 */
router.post('/save', validateRequiredFields(['telegram_id', 'wallet_address']), async (req, res) => {
  try {
    const { telegram_id, wallet_address } = req.body;
    
    const result = await GameService.updateWalletAddress(telegram_id, wallet_address);
    
    res.json({
      success: true,
      message: 'Wallet address saved successfully',
      wallet_address: result.wallet_address
    });
  } catch (error) {
    console.error('[API] Error saving wallet address:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to save wallet address'
    });
  }
});

/**
 * @route   POST /api/wallet/withdraw
 * @desc    Инициировать вывод средств
 * @access  Private
 */
router.post('/withdraw', validateRequiredFields(['telegram_id', 'amount']), async (req, res) => {
  try {
    const { telegram_id, amount } = req.body;
    
    const result = await GameService.initiateWithdrawal(telegram_id, parseFloat(amount));
    
    res.json({
      success: true,
      message: 'Withdrawal initiated successfully',
      transaction_id: result.transaction.id,
      new_balance: result.new_balance
    });
  } catch (error) {
    console.error('[API] Error initiating withdrawal:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to initiate withdrawal'
    });
  }
});

/**
 * @route   GET /api/wallet/transactions
 * @desc    Получить историю транзакций пользователя
 * @access  Private
 */
router.get('/transactions', async (req, res) => {
  try {
    const telegramId = req.query.telegram_id;
    
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Telegram ID is required'
      });
    }

    // Находим пользователя
    const user = await require('../models/User').findByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const transactions = await Transaction.findByUserId(user.id, 50);
    
    res.json({
      success: true,
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        status: tx.status,
        tx_hash: tx.tx_hash,
        created_at: tx.created_at,
        confirmed_at: tx.confirmed_at
      }))
    });
  } catch (error) {
    console.error('[API] Error getting transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching transactions'
    });
  }
});

/**
 * @route   GET /api/wallet/info
 * @desc    Получить информацию о кошельке пользователя
 * @access  Private
 */
router.get('/info', async (req, res) => {
  try {
    const telegramId = req.query.telegram_id;
    
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Telegram ID is required'
      });
    }

    // Находим пользователя
    const user = await require('../models/User').findByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Получаем статистику
    const totalWithdrawn = await Transaction.getTotalWithdrawn(user.id);
    const lastWithdrawal = await Transaction.getLastSuccessfulWithdrawal(user.id);
    const hasPending = await Transaction.hasPendingWithdrawal(user.id);
    
    // Проверяем кулдаун
    let canWithdraw = true;
    let nextWithdrawalIn = null;
    
    if (user.last_withdrawal) {
      const lastWithdrawalTime = new Date(user.last_withdrawal);
      const now = new Date();
      const hoursSinceLast = (now - lastWithdrawalTime) / (1000 * 60 * 60);
      
      if (hoursSinceLast < 24) {
        canWithdraw = false;
        nextWithdrawalIn = Math.ceil(24 - hoursSinceLast);
      }
    }

    res.json({
      success: true,
      wallet: {
        address: user.wallet_address,
        game_balance: parseFloat(user.game_balance),
        base_storage: parseFloat(user.base_storage),
        total_mined: parseFloat(user.total_mined)
      },
      withdrawal_info: {
        can_withdraw: canWithdraw && !hasPending && parseFloat(user.game_balance) >= 10,
        min_amount: 10,
        next_withdrawal_in_hours: nextWithdrawalIn,
        has_pending: hasPending,
        total_withdrawn: totalWithdrawn,
        last_withdrawal: lastWithdrawal ? {
          amount: parseFloat(lastWithdrawal.amount),
          date: lastWithdrawal.created_at
        } : null
      }
    });
  } catch (error) {
    console.error('[API] Error getting wallet info:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching wallet info'
    });
  }
});

/**
 * @route   GET /api/wallet/leaderboard
 * @desc    Получить таблицу лидеров
 * @access  Public
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const leaderboard = await GameService.getLeaderboard(limit);
    
    res.json({
      success: true,
      leaderboard: leaderboard
    });
  } catch (error) {
    console.error('[API] Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching leaderboard'
    });
  }
});

module.exports = router;