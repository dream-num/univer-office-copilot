export function officeEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== 'DEEPSEEK_API_KEY'),
  );
}
