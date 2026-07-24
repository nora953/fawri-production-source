const conversationQueues = new Map<string, Promise<void>>();

export async function withConversationLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previousTask = conversationQueues.get(key) ?? Promise.resolve();

  let releaseCurrentTask!: () => void;

  const currentTask = new Promise<void>((resolve) => {
    releaseCurrentTask = resolve;
  });

  const chainedTask = previousTask.then(
    () => currentTask,
    () => currentTask,
  );

  conversationQueues.set(key, chainedTask);

  await previousTask.catch(() => undefined);

  try {
    return await task();
  } finally {
    releaseCurrentTask();

    if (conversationQueues.get(key) === chainedTask) {
      conversationQueues.delete(key);
    }
  }
}

export function getConversationLockKey(input: {
  merchantId: string;
  customerId: string;
}): string {
  return `${input.merchantId}::${input.customerId}`;
}
