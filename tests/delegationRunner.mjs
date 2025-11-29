import { performance as perf } from 'perf_hooks';

// Provide a stable performance timer for Node environments running the scheduler.
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = perf;
}

import { runDelegatedJob } from '../assets/js/coordinator.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const updates = [];
  const results = await runDelegatedJob({
    jobName: 'delegation-selftest',
    concurrency: 1,
    workers: [
      {
        key: 'alpha',
        label: 'Alpha worker',
        run: async () => {
          await wait(25);
          return { value: 'ok-alpha' };
        },
      },
      {
        key: 'bravo',
        label: 'Bravo worker',
        dependsOn: ['alpha'],
        run: ({ alpha }) => {
          assert(alpha?.value === 'ok-alpha', 'Alpha result should be available before Bravo.');
          return { value: 'ok-bravo' };
        },
      },
    ],
    onWorkerUpdate: (key, state) => updates.push(`${key}:${state}`),
  });

  assert(updates[0] === 'alpha:running', 'Alpha should start first.');
  assert(updates.includes('alpha:done'), 'Alpha should complete.');
  assert(updates[updates.length - 1] === 'bravo:done', 'Bravo should finish last.');
  assert(results.results.alpha.value === 'ok-alpha', 'Alpha output should be captured.');
  assert(results.results.bravo.value === 'ok-bravo', 'Bravo output should be captured.');

  console.log('Delegation scheduler self-test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
