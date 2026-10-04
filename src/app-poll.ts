/** A brief reload must not turn a still-running install into a new install. */
export async function readAppJobWithRetry<T>(read: () => Promise<T>, sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read() } catch (error) {
      if (!/Failed to fetch|transport failure|HTTP 50[234]|NetworkError/i.test((error as Error).message)) throw error
      if (attempt >= 7) throw new Error('安装状态连接中断；记录已保留，请刷新页面继续查看，不要重复安装。')
      await sleep(1000)
    }
  }
}
