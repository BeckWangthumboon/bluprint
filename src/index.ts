#!/usr/bin/env bun

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { init } from './commands/init.js';

yargs(hideBin(process.argv))
  .scriptName('bluprint')
  .usage('$0 <command> [options]')
  .command(
    'init',
    'Initialize a new project',
    () => {},
    () => {
      init();
    }
  )
  .strict()
  .demandCommand(1)
  .version('0.0.1')
  .alias('h', 'help')
  .alias('v', 'version').argv;
