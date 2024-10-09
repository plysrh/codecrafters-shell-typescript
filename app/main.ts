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
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    if (char === "'" && !inQuotes) {
      inQuotes = true;
    } else if (char === "'" && inQuotes) {
      inQuotes = false;
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        parts.push(current);

        current = '';
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
    const command = parts[0];
    
    if (command === "exit") {
      const exitCode = parts[1] ? parseInt(parts[1], 10) : 0;

      process.exit(exitCode);
    } else if (command === "echo") {
      console.log(parts.slice(1).join(' '));
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
            spawnSync(fullPath, parts.slice(1), { stdio: "inherit", argv0: command });

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
