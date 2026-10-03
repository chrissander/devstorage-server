// All project operations, including reads, share the lock with deletion.
// This lock is intentionally process-local; run exactly one API process.
export class Locks {
  #tails = new Map();

  async run(key, operation) {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    this.#tails.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#tails.get(key) === current) this.#tails.delete(key);
    }
  }
}
