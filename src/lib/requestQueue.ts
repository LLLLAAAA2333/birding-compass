export const abortError = () =>
  new DOMException("Request cancelled", "AbortError");
type Subscriber = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
};
type Job = {
  key: string;
  work: (signal: AbortSignal) => Promise<unknown>;
  controller: AbortController;
  subscribers: Set<Subscriber>;
  started: boolean;
};

/** Consumer cancellation is independent; the transport stops when its last consumer leaves. */
export class RequestQueue {
  private jobs = new Map<string, Job>();
  private pending: Job[] = [];
  private active = 0;
  private pausedError: unknown = null;
  constructor(private readonly concurrency = 3) {}
  resume() {
    this.pausedError = null;
    this.pump();
  }
  run<T>(
    key: string,
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    priority = false,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.pausedError) return Promise.reject(this.pausedError);
    let job = this.jobs.get(key);
    if (!job) {
      job = {
        key,
        work,
        controller: new AbortController(),
        subscribers: new Set(),
        started: false,
      };
      this.jobs.set(key, job);
      if (priority) this.pending.unshift(job);
      else this.pending.push(job);
    } else if (priority && !job.started) {
      this.pending = [job, ...this.pending.filter((item) => item !== job)];
    }
    const current = job;
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        current.subscribers.delete(subscriber);
        subscriber.cleanup();
        reject(abortError());
        if (current.subscribers.size === 0) {
          current.controller.abort();
          if (this.jobs.get(key) === current) this.jobs.delete(key);
          this.pending = this.pending.filter((item) => item !== current);
        }
      };
      const subscriber: Subscriber = {
        resolve: (value) => resolve(value as T),
        reject,
        cleanup: () => signal?.removeEventListener("abort", cancel),
      };
      current.subscribers.add(subscriber);
      signal?.addEventListener("abort", cancel, { once: true });
      this.pump();
    });
  }
  private finish(job: Job, value: unknown, failed: boolean) {
    if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
    for (const subscriber of job.subscribers) {
      subscriber.cleanup();
      if (failed) subscriber.reject(value);
      else subscriber.resolve(value);
    }
    job.subscribers.clear();
  }
  private pump() {
    while (
      !this.pausedError &&
      this.active < this.concurrency &&
      this.pending.length
    ) {
      const job = this.pending.shift()!;
      if (!job.subscribers.size) continue;
      job.started = true;
      this.active++;
      void (async () => {
        try {
          const value = await job.work(job.controller.signal);
          if (job.controller.signal.aborted) throw abortError();
          this.finish(job, value, false);
        } catch (error) {
          this.finish(job, error, true);
          if (
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            error.status === 429
          ) {
            this.pausedError = error;
            for (const queued of this.pending.splice(0))
              this.finish(queued, error, true);
          }
        } finally {
          this.active--;
          this.pump();
        }
      })();
    }
  }
}
