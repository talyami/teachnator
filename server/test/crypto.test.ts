import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey, hashSessionToken, maskApiKey } from '../src/lib/crypto.js';

describe('Crypto & Security Utilities', () => {
  const secret = 'test-secret-key-that-is-at-least-32-chars-long!';
  const sampleKey = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';

  it('should encrypt and decrypt an API key using AES-256-GCM', () => {
    const encrypted = encryptApiKey(sampleKey, secret);
    expect(encrypted).not.toBe(sampleKey);
    expect(encrypted.split(':').length).toBe(3); // iv:tag:ciphertext

    const decrypted = decryptApiKey(encrypted, secret);
    expect(decrypted).toBe(sampleKey);
  });

  it('should fail decryption when authentication tag or ciphertext is tampered with', () => {
    const encrypted = encryptApiKey(sampleKey, secret);
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    const tamperedCiphertext = parts[2].slice(0, -2) + 'aa';
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

    expect(() => decryptApiKey(tampered, secret)).toThrow();
  });

  it('should fail decryption when using the wrong secret', () => {
    const encrypted = encryptApiKey(sampleKey, secret);
    const wrongSecret = 'another-wrong-secret-that-is-32-chars-long!';

    expect(() => decryptApiKey(encrypted, wrongSecret)).toThrow();
  });

  it('should generate consistent SHA-256 hashes for session tokens', () => {
    const token = 'random-session-token-12345';
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken('different-token')).not.toBe(hash1);
  });

  it('should safely mask API keys for administrative displays', () => {
    const masked = maskApiKey(sampleKey);
    expect(masked).toBe('AIza...5P6Q');
    expect(masked).not.toContain('B2C3D4E5F6G7H8I9J0K1L2M3N4O');

    // Short keys <= 8 chars
    expect(maskApiKey('12345')).toBe('****');
    expect(maskApiKey('123')).toBe('****');
    expect(maskApiKey('123456789')).toBe('1234...6789');
  });
});
