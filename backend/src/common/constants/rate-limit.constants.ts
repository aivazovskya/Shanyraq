export const RATE_LIMITS = {
  GLOBAL: {
    LIMIT: 60,
    TTL: 60000, // 60s in ms
  },
  AUTH_REQUEST_OTP: {
    LIMIT: 3,
    TTL: 60000, // 60s in ms
  },
  AUTH_VERIFY_OTP: {
    LIMIT: 5,
    TTL: 60000,
  },
  AUTH_LOGIN_PASSWORD: {
    LIMIT: 5,
    TTL: 60000,
  },
  AUTH_SET_INITIAL_PASSWORD: {
    LIMIT: 3,
    TTL: 60000,
  },
  AUTH_STAFF_FORGOT_PASSWORD: {
    LIMIT: 3,
    TTL: 60000,
  },
  AUTH_STAFF_RESET_PASSWORD: {
    LIMIT: 3,
    TTL: 60000,
  },
  AUTH_PIN_RESET_REQUEST: {
    LIMIT: 3,
    TTL: 60000,
  },
  AUTH_PIN_RESET_CONFIRM: {
    LIMIT: 3,
    TTL: 60000,
  },
  AUTH_PIN_SET: {
    LIMIT: 3,
    TTL: 60000,
  },
  AUTH_REFRESH: {
    LIMIT: 20,
    TTL: 60000,
  },
  VOTING_CAST_VOTE: {
    LIMIT: 10,
    TTL: 60000,
  },
  PHONE_REQUEST_OTP: {
    LIMIT: 3,
    TTL: 600000, // 10 minutes in ms (600s)
  },
} as const;
