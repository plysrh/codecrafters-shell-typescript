import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function parseCommand(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoteChar = "";
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    if (char === '\\' && i + 1 < input.length) {
      const nextChar = input[i + 1];

      if (!quoteChar) {
        // Outside quotes: escape any character
        current += nextChar;
        i++;
      } else if (quoteChar === '"' && (nextChar === '"' || nextChar === '\\')) {
        // Inside double quotes: only escape " and \
        current += nextChar;
        i++;
      } else {
        // Inside single quotes or unescapable char in double quotes: literal backslash
        current += char;
      }
    } else if ((char === "'" || char === '"') && !quoteChar) {
      quoteChar = char;
    } else if (char === quoteChar) {
      quoteChar = "";
    } else if (char === " " && !quoteChar) {
      if (current) {
        parts.push(current);

        current = "";
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

function repl() {
  rl.question("$ ", answer => {
    const parts = parseCommand(answer.trim());
    
    // Check for output redirection
    let redirectFile = '';
    let cmdParts = parts;
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === ">" || parts[i] === "1>") {
        redirectFile = parts[i + 1];
        cmdParts = parts.slice(0, i);

        break;
      }
    }
    
    const command = cmdParts[0];
    
    if (command === "exit") {
      const exitCode = parts[1] ? parseInt(parts[1], 10) : 0;

      process.exit(exitCode);
    } else if (command === "echo") {
      const output = cmdParts.slice(1).join(" ");

      if (redirectFile) {
        fs.writeFileSync(redirectFile, output + '\n');
      } else {
        console.log(output);
      }
    } else if (command === "pwd") {
      console.log(process.cwd());
    } else if (command === "cd") {
      let targetDir = parts[1];
      
      if (targetDir === "~") {
        targetDir = process.env.HOME || "";
      }

      try {
        process.chdir(targetDir);
      } catch {
        console.log(`cd: ${parts[1]}: No such file or directory`);
      }
    } else if (command === "type") {
      const targetCommand = parts[1];

      if (["echo", "exit", "type", "pwd", "cd"].includes(targetCommand)) {
        console.log(`${targetCommand} is a shell builtin`);
      } else {
        const pathDirs = process.env.PATH?.split(path.delimiter) || [];
        let found = false;
        
        for (const dir of pathDirs) {
          const fullPath = path.join(dir, targetCommand);

          try {
            const stats = fs.statSync(fullPath);

            if (stats.isFile() && (stats.mode & 0o111)) {
              console.log(`${targetCommand} is ${fullPath}`);

              found = true;

              break;
            }
          } catch {}
        }
        
        if (!found) {
          console.log(`${targetCommand}: not found`);
        }
      }
    } else {
      const pathDirs = process.env.PATH?.split(path.delimiter) || [];
      let found = false;
      
      for (const dir of pathDirs) {
        const fullPath = path.join(dir, command);

        try {
          const stats = fs.statSync(fullPath);

          if (stats.isFile() && (stats.mode & 0o111)) {
            if (redirectFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "pipe", "inherit"]
              });

              if (result.stdout) {
                fs.writeFileSync(redirectFile, result.stdout);
              }
            } else {
              spawnSync(fullPath, cmdParts.slice(1), { stdio: "inherit", argv0: command });
            }

            found = true;

            break;
          }
        } catch {}
      }
      
      if (!found) {
        console.log(`${answer}: command not found`);
      }
    }

    repl();
  });
}

repl();
