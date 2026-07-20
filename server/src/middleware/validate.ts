import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sendError } from '../utils/response';

export const validateBody = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        sendError(
          res,
          'VALIDATION_ERROR',
          'Invalid request payload',
          error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
          400
        );
        return;
      }
      next(error);
    }
  };
};
