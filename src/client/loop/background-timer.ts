const WORKER_SOURCE = 'let timer = null; onmessage = (event) => { clearInterval(timer); timer = event.data > 0 ? setInterval(() => postMessage(0), event.data) : null }'

let workerUrl: string | null = null

export function backgroundInterval(tick: () => void, ms: number): () => void {
  try {
    workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    worker.onmessage = () => tick()
    worker.postMessage(ms)
    return () => worker.terminate()
  } catch {
    const timer = setInterval(tick, ms)
    return () => clearInterval(timer)
  }
}
