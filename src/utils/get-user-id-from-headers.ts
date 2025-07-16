import { AxiosRequestHeaders } from 'axios';

import { getUserIdFromToken } from '.';

export const getUserIdFromHeaders = (headers: AxiosRequestHeaders) => {
  const authHeaderToken = headers['Authorization'] || headers['authorization'];
  const token = authHeaderToken?.split(' ')[1];

  return getUserIdFromToken(token);
};
