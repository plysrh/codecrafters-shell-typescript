/**
 * Command Parser Module
 * 
 * This module handles parsing of shell command lines, including proper handling
 * of quotes, escape sequences, and special characters.
 */

/**
 * Parses a command line string into an array of arguments.
 * Handles single quotes, double quotes, and backslash escaping.
 * 
 * Quote behavior:
 * - Single quotes: Preserve all characters literally (no escaping)
 * - Double quotes: Allow escaping of " and \ characters
 * - Outside quotes: Backslash escapes any character
 * 
 * @param input - The command line string to parse
 * @returns Array of parsed arguments
 */
export function parseCommand(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoteChar = "";
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    if (char === "\\" && i + 1 < input.length) {
      const nextChar = input[i + 1];
      
      if (!quoteChar) {
        // Outside quotes: escape any character
        current += nextChar;
        i++;
      } else if (quoteChar === '"' && (nextChar === '"' || nextChar === "\\")) {
        // Inside double quotes: only escape " and \
        current += nextChar;
        i++;
      } else {
        // Inside single quotes or unescapable char in double quotes: literal backslash
        current += char;
      }
    } else if ((char === "'" || char === '"') && !quoteChar) {
      // Start of quoted section
      quoteChar = char;
    } else if (char === quoteChar) {
      // End of quoted section
      quoteChar = "";
    } else if (char === " " && !quoteChar) {
      // Space outside quotes: word boundary
      if (current) {
        parts.push(current);

        current = "";
      }
    } else {
      // Regular character: add to current word
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}
