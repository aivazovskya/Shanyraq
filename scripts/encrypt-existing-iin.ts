import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root or backend directory if not already loaded
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import {
  encryptExistingIin,
  MigrationResult,
} from '../backend/src/common/crypto/pii-migration.helper';

export { encryptExistingIin, MigrationResult };

if (require.main === module) {
  encryptExistingIin()
    .then((res) => {
      console.log('✅ Миграция шифрования ИИН завершена успешно:');
      console.log(`   Всего пользователей с ИИН: ${res.total}`);
      console.log(`   Зашифровано/обновлено:     ${res.encrypted}`);
      console.log(`   Пропущено (уже зашифровано): ${res.skipped}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Ошибка миграции шифрования ИИН:', err);
      process.exit(1);
    });
}
