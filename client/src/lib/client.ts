import { type HttpInterceptor, withFetchDelegate, withInterceptor } from 'universal-client';
import { pb } from './pb';

const authInterceptor: HttpInterceptor = {
  onBeforeRequest: ({ headers }) => {
    const token = pb.authStore.token;
    if (!token) {
      return undefined;
    }

    return { headers: { ...headers, Authorization: token } };
  },
};

export function withAuthFetchDelegate(baseUrl: string) {
  return withFetchDelegate(baseUrl, withInterceptor(authInterceptor));
}
