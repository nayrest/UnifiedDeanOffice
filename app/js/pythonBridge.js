import { spawn } from "child_process";

export function runPython(func, args = []) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", ["./app/python/app.py", func, ...args]);

    let result = "";
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      console.error("Ошибка Python:", data.toString());
    });

    pythonProcess.on("close", (code) => {
      if (code === 0) {
        resolve(JSON.parse(result));  // Пытаемся вернуть результат как JSON
      } else {
        reject(`Ошибка выполнения Python, код: ${code}`);
      }
    });
  });
}