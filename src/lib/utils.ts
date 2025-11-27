const exitWithError = (message: string, code = 1) => {
  console.error(message);
  process.exitCode = code;
  return process.exit();
};

export { exitWithError };
