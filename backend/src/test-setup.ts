// Test setup file for Jest in backend
const DEFAULT_TEST_KEY = 'oe3FdI9y3WTxUngovENTYMvTbjf+mhQOZ85a3elnVJU=';

if (!process.env.PII_ENCRYPTION_KEY) {
  process.env.PII_ENCRYPTION_KEY = DEFAULT_TEST_KEY;
}

if (!process.env.PII_HASH_KEY) {
  process.env.PII_HASH_KEY = DEFAULT_TEST_KEY;
}
