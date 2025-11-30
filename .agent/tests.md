# Bluprint Tests Rules

Applies to: `tests/**/*` and any new test helpers.

This document defines testing practices, constraints, and organizational patterns that ensure reliable, maintainable tests across the Bluprint codebase.

---

## Hard Constraints

### 1. Deterministic and Isolated Tests

Tests must be deterministic and isolated: no network calls; no reliance on global git state; use temporary repos/dirs via helpers like `tests/helpers/tempRepo.ts`.

**Purpose:** Ensures tests are reproducible and don't interfere with developer's environment.

**Allowed Isolation Pattern:**
```ts
// tests/helpers/tempRepo.ts
import { execFileAsync } from 'child_process';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

export const createTempDir = (prefix = 'bluprint-test-') =>
  mkdtemp(path.join(tmpdir(), prefix));

export const initGitRepo = async (baseBranch = 'main'): Promise<string> => {
  const repoRoot = await createTempDir();
  await execFileAsync('git', ['init'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.email', 'tests@bluprint.local'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.name', 'Bluprint Tests'], { cwd: repoRoot });
  await execFileAsync('git', ['checkout', '-b', baseBranch], { cwd: repoRoot });
  await writeFile(path.join(repoRoot, '.gitignore'), '# temp repo\n');
  await execFileAsync('git', ['add', '.'], { cwd: repoRoot });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: repoRoot });
  return repoRoot;
};
```

**Forbidden Global State:**
```ts
// Incorrect: relying on developer's environment
describe('git operations', () => {
  it('should check current branch', () => {
    // This tests against developer's actual branch
    const currentBranch = getCurrentGitBranch(); // Reads global state
    expect(currentBranch).toBe('feature-xyz');
  });
});
```

### 2. Wrapper-Consistent Testing

Interact with FS/Git through the same wrappers as runtime code (`fsUtils`, `gitUtils`), mocking only when necessary (e.g., `vi.spyOn(gitUtils, 'gitGetRepoRoot')` in `tests/unit/lib/git.test.ts`).

**Purpose:** Tests actual implementation behavior, not mocked versions.

**Allowed Wrapper Usage:**
```ts
// tests/unit/lib/git.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gitUtils, gitTestHelpers } from '../../../src/lib/git.js';

describe('gitUtils', () => {
  beforeEach(async () => {
    ({ gitUtils } = await import('../../../src/lib/git.js'));
    gitTestHelpers.resetRepoRootCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    gitTestHelpers.resetRepoRootCache();
  });

  it('returns true when a branch exists', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync('/tmp/repo'));
    vi.spyOn(gitUtils, 'gitCheckBranchExists').mockReturnValue(okAsync(true));

    const result = await gitUtils.gitCheckBranchExists('main');

    expect(result.isOk()).toBe(true);
  });
});
```

**Forbidden Direct FS in Tests:**
```ts
// Incorrect: bypassing wrappers in tests
import fs from 'fs/promises';

describe('config loading', () => {
  it('should load config file', async () => {
    // Direct FS access - wrapper bypassed
    const content = await fs.readFile('/tmp/config.json');
    expect(content).toBeDefined();
  });
});
```

### 3. Result-Based Assertions

Assert on `Result`/`ResultAsync` outcomes using `isOk()` / `isErr()` paths and check `AppError` codes/messages where relevant.

**Purpose:** Tests proper error handling paths and ensures error contracts are maintained.

**Allowed Result Assertions:**
```ts
// tests/unit/lib/fs.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fsUtils } from '../../../src/lib/fs.js';
import { createAppError, type AppErrorCode } from '../../../src/types/errors.js';

describe('fsUtils.fsReadFile', () => {
  beforeEach(async () => {
    ({ fsUtils } = await import('../../../src/lib/fs.js'));
  });

  it('should return file content when file exists', async () => {
    vi.spyOn(fsUtils, 'fsReadFile').mockReturnValue(okAsync('file content'));

    const result = await fsUtils.fsReadFile('/existing/file.txt');

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('file content');
  });

  it('should return FS_NOT_FOUND when file missing', async () => {
    vi.spyOn(fsUtils, 'fsReadFile').mockReturnValue(
      err(createAppError('FS_NOT_FOUND', 'File not found'))
    );

    const result = await fsUtils.fsReadFile('/missing/file.txt');

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_NOT_FOUND');
      expect(result.error.message).toContain('not found');
    }
  });
});
```

**Forbidden Generic Assertions:**
```ts
// Incorrect: not checking Result structure
it('should read file', async () => {
  const result = await fsUtils.fsReadFile('/test.txt');

  // Wrong: not checking isOk/isErr
  expect(result).toBeDefined();
  expect(result._unsafeUnwrap()).toBeTruthy();

  // Wrong: generic assertion without type safety
  expect(result).toBeTruthy();
});
```

### 4. Non-Destructive Test Environment

Do not modify the real working tree; use fixtures or temp directories under `tests/helpers`.

**Purpose:** Preserves developer's work and ensures tests don't have side effects.

**Allowed Test Isolation:**
```ts
// tests/integration/cli-init.test.ts
import { execFileAsync } from '../../helpers/tempRepo.js';
import { writeFile } from 'fs/promises';
import path from 'path';

describe('CLI: bluprint init', () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await createTempDir('cli-init-');
  });

  afterEach(async () => {
    // Clean up test directory
    await execFileAsync('rm', ['-rf', testRepo]);
  });

  it('should initialize bluprint configuration', async () => {
    const specPath = await writeFile(path.join(testRepo, 'spec.yaml'), 'valid spec content');

    // Run CLI against temporary repo
    const { stdout, exitCode } = await execFileAsync(
      process.execPath(),
      ['init', '--spec', specPath, '--base', 'main'],
      { cwd: testRepo }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('initialized successfully');
  });
});
```

**Forbidden Tree Modification:**
```ts
// Incorrect: tests modifying actual project files
describe('config tests', () => {
  it('should update config', () => {
    // Modifies real project files
    const configPath = path.resolve(process.cwd(), '.bluprint/config.json');
    await writeFile(configPath, JSON.stringify({ base: 'changed' }));
  });
});
```

---

## Soft Constraints

### 5. Table-Driven Validation Tests

Prefer table-driven tests for validation logic (e.g., spec parsing) and keep test names describing intent and expected outcome.

**Purpose:** Reduces test duplication and makes validation rules explicit and maintainable.

**Preferred Table-Driven Pattern:**
```ts
// tests/unit/lib/spec.test.ts
import { describe, it, expect } from 'vitest';
import { parseSpecification } from '../../../src/lib/spec.js';

describe('spec parsing validation', () => {
  const validationCases = [
    {
      name: 'rejects empty overview summary',
      input: { overview: { summary: '' } },
      expectedErrorCode: 'VALIDATION_ERROR',
      expectedErrorMessage: 'overview.summary is required and must be a non-empty string',
    },
    {
      name: 'rejects invalid goals format',
      input: { overview: { summary: 'Valid spec' }, goals: 'not-array' },
      expectedErrorCode: 'VALIDATION_ERROR',
      expectedErrorMessage: 'overview.goals must be an array of non-empty strings',
    },
    {
      name: 'accepts valid spec with optional fields',
      input: {
        overview: { summary: 'Valid spec' },
        goals: ['goal1', 'goal2'],
        motivation: { problem: 'Test problem' },
      },
      expectedErrorCode: undefined,
      expectedErrorMessage: undefined,
    },
  ];

  validationCases.forEach(({ name, input, expectedErrorCode, expectedErrorMessage }) => {
    it(`should ${name}`, async () => {
      const result = parseSpecification(input);

      if (expectedErrorCode) {
        expect(result.isErr()).toBe(true);
        expect(result.error.code).toBe(expectedErrorCode);
        if (expectedErrorMessage) {
          expect(result.error.message).toContain(expectedErrorMessage);
        }
      } else {
        expect(result.isOk()).toBe(true);
      }
    });
  });
});
```

**Avoided Monolithic Tests:**
```ts
// Avoided: multiple behaviors in one test without clear separation
it('should handle all spec validation', () => {
  // Too many assertions for different scenarios
  const input1 = { overview: { summary: '' } };
  const input2 = { overview: { summary: 'Valid' }, goals: 'invalid' };
  const input3 = { overview: { summary: 'Valid' }, constraints: 'invalid' };

  // Testing multiple different validation rules in one test
  expect(parseSpecification(input1).isErr()).toBe(true);
  expect(parseSpecification(input2).isErr()).toBe(true);
  expect(parseSpecification(input3).isErr()).toBe(true);
});
```

### 6. Minimal Mocking with Real Path Testing

Keep mocks minimal; prefer exercising real code paths with temp repos/files over heavy stubbing.

**Purpose:** Tests actual implementation behavior rather than mock assumptions.

**Preferred Minimal Mocking:**
```ts
// tests/unit/lib/git.test.ts
describe('git path handling', () => {
  it('should use actual repo root from git command', async () => {
    // Mock only the git command that returns repo root
    vi.spyOn(gitUtils, 'gitRunRaw').mockReturnValue(
      okAsync({ stdout: '/tmp/test-repo\n', stderr: '', exitCode: 0 })
    );

    const result = await gitUtils.gitGetRepoRoot();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe('/tmp/test-repo');
  });

  it('should handle git command failures', async () => {
    // Let real git logic handle error cases
    vi.spyOn(gitUtils, 'gitRunRaw').mockReturnValue(
      err(createAppError('GIT_NOT_REPO', 'Not a git repository'))
    );

    const result = await gitUtils.gitGetRepoRoot();

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('GIT_NOT_REPO');
  });
});
```

**Avoided Over-Mocking:**
```ts
// Avoided: mocking every filesystem operation
describe('file operations', () => {
  beforeEach(() => {
    vi.spyOn(fsUtils, 'fsReadFile').mockReturnValue('mock content');
    vi.spyOn(fsUtils, 'fsWriteFile').mockReturnValue(okAsync());
    vi.spyOn(fsUtils, 'fsCheckAccess').mockReturnValue(okAsync(true));
    // Mocking everything - tests become brittle
  });

  it('should read file', async () => {
    const result = await fsUtils.fsReadFile('/test.txt');
    expect(result).toBe('mock content'); // Only testing mock
  });
});
```

### 7. Reusable Fixture Helpers

Use clear fixture/setup helpers instead of inlining boilerplate across tests.

**Purpose:** Reduces duplication and makes test intent clearer.

**Preferred Helper Reuse:**
```ts
// tests/helpers/specHelpers.ts
import path from 'path';
import { writeFile } from 'fs/promises';
import yaml from 'yaml';

export const writeValidSpec = async (repoRoot: string, overrides = {}) => {
  const spec = {
    overview: { summary: 'Valid test spec' },
    constraints: [],
    ...overrides,
  };

  const specPath = path.join(repoRoot, 'feature.yaml');
  await writeFile(specPath, yaml.dump(spec));
  return specPath;
};

// tests/unit/lib/spec.test.ts
import { writeValidSpec } from '../../helpers/specHelpers.js';

describe('spec validation', () => {
  it('should accept valid spec', async () => {
    const repoRoot = await createTempDir();
    const specPath = await writeValidSpec(repoRoot);

    const result = await parseSpecification({ spec: specPath });

    expect(result.isOk()).toBe(true);
  });
});
```

**Avoided Boilerplate Duplication:**
```ts
// Avoided: duplicating setup in each test
describe('multiple spec tests', () => {
  it('should accept spec with overview', async () => {
    const repoRoot = await createTempDir();
    // Duplicated spec creation logic
    const spec = { overview: { summary: 'Test' } };
    await writeFile(path.join(repoRoot, 'spec1.yaml'), yaml.dump(spec));

    const result = await parseSpecification({ spec: path.join(repoRoot, 'spec1.yaml') });
    expect(result.isOk()).toBe(true);
  });

  it('should accept spec with constraints', async () => {
    const repoRoot = await createTempDir();
    // Duplicated spec creation logic
    const spec = { overview: { summary: 'Test' }, constraints: [] };
    await writeFile(path.join(repoRoot, 'spec2.yaml'), yaml.dump(spec));

    const result = await parseSpecification({ spec: path.join(repoRoot, 'spec2.yaml') });
    expect(result.isOk()).toBe(true);
  });
});
```

---

## Process

### 8. Adding Unit Tests

When adding a unit test: place under `tests/unit/<area>/`, use temp helpers to create sandboxes, and cover success + failure branches.

**Required Steps:**
1. **Choose Appropriate Location** - `tests/unit/lib/<module>.test.ts` for lib modules
2. **Create Isolated Environment** - Use `beforeEach` with temp helpers
3. **Test Success Paths** - Verify happy path with realistic data
4. **Test Failure Modes** - Cover error codes and edge cases
5. **Use Real Wrappers** - Test through actual `fsUtils`/`gitUtils`
6. **Assert Result Types** - Check `isOk()`/`isErr()` and error codes

**Example Unit Test Structure:**
```ts
// tests/unit/lib/fs.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fsUtils } from '../../../src/lib/fs.js';
import { initGitRepo } from '../../helpers/tempRepo.js';
import { createAppError, type AppErrorCode } from '../../../src/types/errors.js';

describe('fsUtils.fsWriteFile', () => {
  let repoRoot: string;

  beforeEach(async () => {
    ({ fsUtils } = await import('../../../src/lib/fs.js'));
    repoRoot = await initGitRepo();
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('should write file content successfully', async () => {
    const filePath = '/test/output.txt';
    const content = 'test content';

    const result = await fsUtils.fsWriteFile(filePath, content);

    expect(result.isOk()).toBe(true);

    // Verify actual file was written
    const actualContent = await fs.readFile(path.join(repoRoot, filePath));
    expect(actualContent).toBe(content);
  });

  it('should return FS_ERROR on write failure', async () => {
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await fsUtils.fsWriteFile('/protected/file.txt', 'content');

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('FS_ERROR');
  });
});
```

### 9. Adding Integration Tests

When adding an integration/CLI test: place under `tests/integration/`, set up a temp repo/spec as needed, run the command through the CLI entry, and assert on stdout/exit behavior.

**Required Steps:**
1. **Set Up Complete Environment** - Create temp repo with necessary files
2. **Execute Through CLI** - Run actual command or function being tested
3. **Assert CLI Output** - Check stdout, stderr, and exit codes
4. **Verify Side Effects** - Ensure files/directories created as expected
5. **Clean Test Environment** - Remove all temporary artifacts

**Example Integration Test:**
```ts
// tests/integration/cli-init.test.ts
import { describe, it, expect } from 'vitest';
import { execFileAsync } from '../../helpers/tempRepo.js';

describe('CLI: bluprint init', () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = await createTempDir('integration-init-');
  });

  afterEach(async () => {
    await execFileAsync('rm', ['-rf', testRepo]);
  });

  it('should initialize bluprint in new repository', async () => {
    // Create spec file for testing
    const specContent = `
overview:
  summary: "Test feature implementation"
  goals:
    - goal1: "Implement the feature"
    - goal2: "Write tests for the feature"
`;

    const specPath = `/tmp/test-spec.yaml`;
    await writeFile(specPath, specContent);

    // Execute CLI command
    const { stdout, stderr, exitCode } = await execFileAsync(
      process.execPath(),
      ['init', '--spec', specPath, '--base', 'main'],
      { cwd: testRepo }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Bluprint configuration initialized');
  });
});
```

### 10. Creating Test Helpers

When introducing new helpers: keep them side-effect free and reusable; document expected directory structure for fixtures and ensure cleanup is automatic or scoped to temp dirs.

**Helper Design Principles:**
- Accept repository root as parameter, don't assume current directory
- Return absolute paths for created files/directories
- Handle both creation and cleanup of temporary resources
- Provide clear JSDoc explaining purpose and usage
- Export multiple related functions from a single module

**Example Test Helper Module:**
```ts
// tests/helpers/fixtureHelpers.ts
import path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';

/**
 * Creates a temporary directory for test fixtures.
 *
 * @param baseDir - Root directory for test operations.
 * @param name - Name for the temporary directory.
 * @returns Promise resolving to absolute path of created directory.
 */
export const createTestTempDir = async (baseDir: string, name: string): Promise<string> => {
  const tempDir = path.join(tmpdir(), `bluprint-test-${name}-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
};

/**
 * Writes a specification file for testing.
 *
 * @param repoRoot - Repository root directory.
 * @param spec - Specification object to write.
 * @param filename - Name for the spec file.
 * @returns Promise resolving to absolute path of written spec file.
 */
export const writeTestSpec = async (
  repoRoot: string,
  spec: Record<string, unknown>,
  filename = 'feature.yaml'
): Promise<string> => {
  const specPath = path.join(repoRoot, filename);
  await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
  return specPath;
};

/**
 * Cleanup utility for temporary test directories.
 *
 * @param paths - Array of absolute paths to remove.
 * @returns Promise that resolves when all paths are removed.
 */
export const cleanupTestPaths = async (paths: string[]): Promise<void> => {
  await Promise.all(paths.map(p => fs.rm(p, { recursive: true, force: true })));
};
```

### 11. Test Environment Management

Manage test environments carefully to ensure tests don't interfere with each other or with development workflow.

**Environment Best Practices:**
- Use `beforeEach`/`afterEach` for test isolation
- Mock external dependencies only at test boundaries
- Preserve and restore original environment variables
- Use test-specific temp directories with predictable naming
- Ensure parallel test execution doesn't cause resource conflicts

**Example Environment Management:**
```ts
// tests/setup.ts or in individual test files
import { vi } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  // Set test-specific environment
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    CI: 'true',
  };
});

afterEach(() => {
  // Restore original environment
  process.env = originalEnv;
  vi.restoreAllMocks();
});
```