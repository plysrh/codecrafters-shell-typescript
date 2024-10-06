import { createInterface } from "readline";
import * as fs from "fs";
import * as path from "path";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function repl() {
  rl.question("$ ", (answer) => {
    const parts = answer.trim().split(' ');
    const command = parts[0];
    
    if (command === 'exit') {
      const exitCode = parts[1] ? parseInt(parts[1], 10) : 0;

      process.exit(exitCode);
    } else if (command === 'echo') {
      console.log(parts.slice(1).join(' '));
    } else if (command === 'type') {
      const targetCommand = parts[1];

      if (['echo', 'exit', 'type'].includes(targetCommand)) {
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
      console.log(`${answer}: command not found`);
    }
    repl();
  });
}

repl();
