import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from root or backend directory if not already loaded
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import { PrismaClient } from '@prisma/client';
import {
  checkIinHashDuplicates,
  formatDuplicateReport,
} from '../backend/src/common/db/iin-duplicates-checker.helper';

export async function runIinHashDuplicatesCheck(): Promise<boolean> {
  const prisma = new PrismaClient();

  try {
    const result = await checkIinHashDuplicates(prisma);
    const report = formatDuplicateReport(result);

    if (result.hasDuplicates) {
      console.error(report);
      return false;
    } else {
      console.log(report);
      return true;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runIinHashDuplicatesCheck()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error running duplicate IIN check:', err);
      process.exit(1);
    });
}
