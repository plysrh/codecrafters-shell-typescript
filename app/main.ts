import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function repl() {
  rl.question("$ ", (answer) => {
    console.log(`${answer}: command not found`);
    repl();
  });
}

repl();
