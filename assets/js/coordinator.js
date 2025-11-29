const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function runDelegatedJob({
  jobName = 'job',
  workers = [],
  concurrency = 2,
  onWorkerUpdate = () => {},
  onLog = () => {},
}) {
  const queue = workers.map((w) => ({ ...w, state: 'queued' }));
  const results = {};
  const startTime = now();

  return new Promise((resolve, reject) => {
    let active = 0;
    let finished = 0;
    const total = queue.length;

    const startNext = () => {
      if (finished === total) {
        const duration = Math.round(now() - startTime);
        onLog(`${jobName} finished in ${duration}ms with ${total} worker(s).`, 'info', { duration_ms: duration });
        resolve({ results, duration_ms: duration });
        return;
      }

      while (active < concurrency) {
        const nextIndex = queue.findIndex(
          (w) =>
            w.state === 'queued' &&
            (w.dependsOn || []).every((dep) => queue.find((q) => q.key === dep && q.state === 'done'))
        );

        if (nextIndex === -1) {
          // No eligible workers yet. If none are active, we are stuck.
          if (active === 0) {
            reject(new Error('No eligible workers to schedule. Check dependencies.'));
          }
          return;
        }

        const worker = queue[nextIndex];
        worker.state = 'running';
        const started = now();
        active += 1;
        onWorkerUpdate(worker.key, 'running', { started_at: started });
        onLog(`${worker.label || worker.key} started`, 'debug');

        Promise.resolve()
          .then(() => worker.run(results))
          .then((output) => {
            const duration = now() - started;
            worker.state = 'done';
            active -= 1;
            finished += 1;
            results[worker.key] = output;
            onWorkerUpdate(worker.key, 'done', { duration_ms: duration, output });
            onLog(`${worker.label || worker.key} completed in ${Math.round(duration)}ms`, 'info', {
              duration_ms: duration,
            });
            startNext();
          })
          .catch((err) => {
            const duration = now() - started;
            worker.state = 'error';
            active -= 1;
            onWorkerUpdate(worker.key, 'error', { error: err, duration_ms: duration });
            onLog(`${worker.label || worker.key} failed: ${err.message || err}`, 'error', {
              duration_ms: duration,
            });
            reject(err);
          });
      }
    };

    startNext();
  });
}
