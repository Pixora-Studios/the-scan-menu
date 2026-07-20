import { Response } from 'express';

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details: any;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export const sendSuccess = <T>(res: Response, data: T, message = 'Success', status = 200): Response => {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    message,
  };
  return res.status(status).json(response);
};

export const sendError = (
  res: Response,
  code: string,
  message: string,
  details: any = null,
  status = 500
): Response => {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
  return res.status(status).json(response);
};
