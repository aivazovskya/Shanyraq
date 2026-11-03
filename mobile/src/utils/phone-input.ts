/** Normalize pasted/formatted Kazakhstan numbers to +7 and ten national digits. */
export function normalizePhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '');
  if ((value.trimStart().startsWith('+') && digits.startsWith('7')) ||
      (digits.length > 10 && /^[78]/.test(digits))) {
    digits = digits.slice(1);
  }
  return '+7' + digits.slice(0, 10);
}

export function isCompletePhone(value: string): boolean {
  return /^\+7\d{10}$/.test(value);
}
