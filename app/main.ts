import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line: string) => {
    const words = line.split(" ");
    const currentWord = words[words.length - 1];
    
    // Only complete if we're at the beginning and typing a command
    if (words.length === 1) {
      const builtins = ["echo ", "exit "];
      const hits = builtins.filter(cmd => cmd.startsWith(currentWord));

      return [hits, currentWord];
    }
    
    return [[], line];
  }
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
      } else if (quoteChar === '"' && (nextChar === '"' || nextChar === "\\")) {
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
    let redirectFile = "";
    let appendFile = "";
    let stderrRedirectFile = "";
    let stderrAppendFile = "";
    let cmdParts = parts;
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === ">" || parts[i] === "1>") {
        redirectFile = parts[i + 1];
        cmdParts = parts.slice(0, i);

        break;
      } else if (parts[i] === ">>" || parts[i] === "1>>") {
        appendFile = parts[i + 1];
        cmdParts = parts.slice(0, i);

        break;
      } else if (parts[i] === "2>") {
        stderrRedirectFile = parts[i + 1];
        cmdParts = parts.slice(0, i);

        break;
      } else if (parts[i] === "2>>") {
        stderrAppendFile = parts[i + 1];
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
        fs.writeFileSync(redirectFile, `${output}\n`);
      } else if (appendFile) {
        fs.appendFileSync(appendFile, `${output}\n`);
      } else if (stderrRedirectFile) {
        // echo doesn't write to stderr, so output normally and create empty file
        console.log(output);
        fs.writeFileSync(stderrRedirectFile, "");
      } else if (stderrAppendFile) {
        // echo doesn't write to stderr, so output normally and create empty file if needed
        console.log(output);

        if (!fs.existsSync(stderrAppendFile)) {
          fs.writeFileSync(stderrAppendFile, "");
        }
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
            } else if (appendFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "pipe", "inherit"]
              });

              if (result.stdout) {
                fs.appendFileSync(appendFile, result.stdout);
              }
            } else if (stderrRedirectFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "inherit", "pipe"]
              });

              if (result.stderr) {
                fs.writeFileSync(stderrRedirectFile, result.stderr);
              }
            } else if (stderrAppendFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "inherit", "pipe"]
              });

              if (result.stderr) {
                fs.appendFileSync(stderrAppendFile, result.stderr);
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
