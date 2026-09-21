function isSerializableTransactionConflict(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010' || !('meta' in error) || typeof error.meta !== 'object' || error.meta === null || !('code' in error.meta)) return false;
  return error.meta.code === '40001' || error.meta.code === '40P01';
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
