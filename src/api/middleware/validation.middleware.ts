import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError as ExpressValidationError } from 'express-validator';
import { ValidationError } from '../../utils/errors';
import { body } from 'express-validator';

/**
 * Express validator middleware
 * Validates request using express-validator rules
 */
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map((error: any) => ({
      field: error.path || error.param || error.location,
      message: error.msg
    }));
    
    const error = new ValidationError('Validation failed', validationErrors);
    res.status(400).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }
  
  next();
};

// User validation rules
export const validateUserCreate = [
  body('email')
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  body('firstName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters long'),
  body('lastName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters long'),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Invalid role'),
  body('companyId')
    .optional()
    .isUUID()
    .withMessage('Invalid company ID')
];

export const validateUserUpdate = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email address')
    .normalizeEmail(),
  body('password')
    .optional()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('First name must be at least 2 characters long'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters long'),
  body('role')
    .optional()
    .isIn(['user', 'admin'])
    .withMessage('Invalid role'),
  body('companyId')
    .optional()
    .isUUID()
    .withMessage('Invalid company ID'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

// Company validation rules
export const validateCompanyCreate = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('logo')
    .optional()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  body('industry')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Industry must not exceed 50 characters'),
  body('size')
    .optional()
    .isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'])
    .withMessage('Invalid company size'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must not exceed 100 characters'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object')
];

export const validateCompanyUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Company name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('logo')
    .optional()
    .isURL()
    .withMessage('Logo must be a valid URL'),
  body('industry')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Industry must not exceed 50 characters'),
  body('size')
    .optional()
    .isIn(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'])
    .withMessage('Invalid company size'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must not exceed 100 characters'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object')
]; 