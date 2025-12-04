#!/usr/bin/env bun

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { init } from './commands/init.js';
import { rules, validateRulesArgs } from './commands/rules.js';
import type { InitArgs, RulesArgs } from './types/commands.js';
import { displayError, displaySuccess } from './lib/exit.js';

yargs(hideBin(process.argv))
  .scriptName('bluprint')
  .usage('$0 <command> [options]')
  .command<InitArgs>(
    'init',
    'Initialize a new project',
    (cmd) => {
      cmd.option('spec', {
        type: 'string',
        description: 'Path to the spec YAML file',
        demandOption: true,
      });
      cmd.option('base', {
        type: 'string',
        description: 'Base git branch to work from',
        default: 'main',
      });
    },
    async (argv) => {
      const result = await init(argv);

      result.match(
        (successInfo) => {
          if (successInfo) {
            displaySuccess(successInfo);
          }
        },
        (error) => {
          displayError(error);
        },
      );
    },
  )
  .command<RulesArgs>(
    'rules',
    'Discover and index rules from embedded files or centralized directories',
    (cmd) => {
      cmd.option('rules-source', {
        type: 'string',
        choices: ['embedded', 'directory'] as const,
        description: 'Source type for rules (embedded file search or centralized directory)',
        demandOption: true,
      });
      cmd.option('rules-embedded-file', {
        type: 'string',
        description: 'File name to search for when rules-source=embedded',
      });
      cmd.option('rules-dir', {
        type: 'string',
        description: 'Directory to scan when rules-source=directory',
      });
      cmd.option('json', {
        type: 'boolean',
        description: 'Output JSON only',
        default: false,
      });
    },
    async (argv) => {
      const validationResult = validateRulesArgs(argv);
      if (validationResult.isErr()) {
        displayError(validationResult.error);
        return;
      }

      const result = await rules(validationResult.value);

      result.match(
        (successInfo) => {
          if (successInfo) {
            displaySuccess(successInfo);
          }
        },
        (error) => {
          displayError(error);
        },
      );
    },
  )
  /*
  .command<CheckArgs>(
    'check',
    'Evaluate the current branch against the Bluprint spec',
    (cmd) => cmd,
    async (argv) => {
      const result = await check(argv);

      result.match(
        (successInfo) => {
          if (successInfo) {
            displaySuccess(successInfo);
          }
        },
        (error) => {
          displayError(error);
        },
      );
    },
  )
    */
  .strict()
  .demandCommand(1)
  .version('0.0.1')
  .alias('h', 'help')
  .alias('v', 'version').argv;
