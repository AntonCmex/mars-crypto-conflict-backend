// src/middleware/validation.js
/**
 * Простой middleware для валидации входящих данных
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    // Пока это заглушка, которую мы наполним позже
    // Сейчас просто пропускаем запрос дальше
    console.log(`[Validation] Проверяем запрос на ${req.path}`);
    next();
  };
};

/**
 * Middleware для проверки наличия обязательных полей в теле запроса
 */
const validateRequiredFields = (fields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
};

module.exports = {
  validateRequest,
  validateRequiredFields
};