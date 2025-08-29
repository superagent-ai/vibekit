import { customAlphabet } from 'nanoid';

/**
 * Session ID Generator using short UUIDs
 * 
 * Generates 12-character IDs using a safe alphabet that excludes
 * ambiguous characters (no 0/O, 1/l/I) for better readability.
 * 
 * With 57^12 possible combinations, collision probability is virtually
 * zero even at massive scale.
 */
export class SessionIdGenerator {
  // Safe alphabet: no ambiguous characters
  private static readonly ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  private static readonly ID_LENGTH = 12;
  
  // Create the generator function with our custom alphabet
  private static generator = customAlphabet(SessionIdGenerator.ALPHABET, SessionIdGenerator.ID_LENGTH);
  
  /**
   * Generate a new session ID
   * @returns 12-character session ID like "Kq3f9TxR2mPa"
   */
  static generate(): string {
    return this.generator();
  }
  
  /**
   * Generate a session ID with a prefix
   * @param prefix - Prefix to add (e.g., "sub" for subtask)
   * @returns Prefixed session ID like "sub_Kq3f9TxR2mPa"
   */
  static generateWithPrefix(prefix: string): string {
    return `${prefix}_${this.generator()}`;
  }
  
  /**
   * Validate if a string is a valid session ID
   * @param id - String to validate
   * @returns true if valid session ID format
   */
  static validate(id: string): boolean {
    // Handle prefixed IDs by checking the last part
    const parts = id.split('_');
    const idPart = parts[parts.length - 1];
    
    // Check if it matches our expected format
    const pattern = new RegExp(`^[${this.ALPHABET}]{${this.ID_LENGTH}}$`);
    return pattern.test(idPart);
  }
  
  /**
   * Extract the ID part from a potentially prefixed ID
   * @param id - Full ID (may include prefix)
   * @returns The ID part without prefix
   */
  static extractId(id: string): string {
    const parts = id.split('_');
    return parts[parts.length - 1];
  }
  
  /**
   * Get statistics about ID generation
   * @returns Object with generation statistics
   */
  static getStats() {
    const totalCombinations = Math.pow(this.ALPHABET.length, this.ID_LENGTH);
    return {
      alphabetSize: this.ALPHABET.length,
      idLength: this.ID_LENGTH,
      totalCombinations: totalCombinations,
      totalCombinationsFormatted: totalCombinations.toExponential(2),
      collisionProbabilityAt1Million: (1000000 / totalCombinations).toExponential(2),
      exampleId: this.generate()
    };
  }
}

// Export a convenience function for quick generation
export const generateSessionId = () => SessionIdGenerator.generate();