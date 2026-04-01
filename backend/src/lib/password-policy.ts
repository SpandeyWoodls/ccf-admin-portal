export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Must be at least 8 characters");
  if (password.length > 128) errors.push("Must be at most 128 characters");
  if (!/[A-Z]/.test(password)) errors.push("Must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Must contain a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Must contain a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Must contain a special character");
  // Check against common passwords
  const common = ["password", "123456", "qwerty", "admin", "changeme", "letmein"];
  if (common.some(c => password.toLowerCase().includes(c))) errors.push("Password is too common");
  return { valid: errors.length === 0, errors };
}
