import 'server-only';

// 값은 실제로 사용할 때 읽는다. 비어 있으면 어떤 변수가 빠졌는지 바로 알려준다.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name}이(가) 비어 있습니다.`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabasePublishableKey() {
    return required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY');
  },
  get adminUserIds() {
    return required('ADMIN_USER_IDS')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  },
  get appBaseUrl() {
    return required('APP_BASE_URL').replace(/\/+$/, '');
  },
  get cafe24RedirectUri() {
    return `${this.appBaseUrl}/api/cafe24/oauth/callback`;
  },
  get cafe24ClientId() {
    return required('CAFE24_CLIENT_ID');
  },
  get cafe24ClientSecret() {
    return required('CAFE24_CLIENT_SECRET');
  },
  get cafe24TokenKey() {
    return required('CAFE24_TOKEN_ENCRYPTION_KEY');
  },
};
