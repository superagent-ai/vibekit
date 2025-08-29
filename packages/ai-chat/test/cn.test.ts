import { describe, it, expect } from 'vitest';
import { cn } from '../src/utils/cn';

describe('cn utility', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
    expect(cn('p-4', 'm-2')).toBe('p-4 m-2');
  });

  it('should handle tailwind conflicts by keeping the last class', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('bg-red-100', 'bg-green-200')).toBe('bg-green-200');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', true && 'conditional')).toBe('base conditional');
    expect(cn('base', false && 'conditional')).toBe('base');
    expect(cn('base', null, undefined, 'valid')).toBe('base valid');
  });

  it('should handle arrays and objects', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('', null, undefined)).toBe('');
  });
});