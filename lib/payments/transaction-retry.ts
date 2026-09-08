function isSerializableTransactionConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

export async function retrySerializableTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const maximumAttempts = 3;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSerializableTransactionConflict(error) || attempt === maximumAttempts) throw error;
    }
  }

  throw new Error('Serializable transaction retry exhausted.');
}
