export type CodebaseFileEntry = {
  path: string;
  description: string;
};

export type CodebaseIndex = {
  generatedAt: string;
  files: CodebaseFileEntry[];
};
