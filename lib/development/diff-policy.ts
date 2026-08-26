const forbiddenPatterns = [
  /(^|\/)\.env(?:\.|$)/u,
  /\.(?:pem|key|p12|pfx)$/iu,
  /(^|\/)(?:private-data|knowledge|obsidian-export)(\/|$)/iu,
  /^\.github\/workflows\//u,
  /(^|\/)(?:credentials|secrets?)(?:\.|\/|$)/iu,
];

export function assertSafeDevelopmentDiff(files: string[]) {
  const forbidden = files.find((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));
  if (forbidden) throw new Error(`FORBIDDEN_DEVELOPMENT_DIFF:${forbidden}`);
}
