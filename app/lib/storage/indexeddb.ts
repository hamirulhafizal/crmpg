// IndexedDB utility for storing Excel files and processed data
// Based on Storage API: https://whatpwacando.today/storage

const DB_NAME = 'ExcelProcessorDB'
const DB_VERSION = 2
const STORE_NAME = 'files'
const PROMPT_STORE_NAME = 'prompts'

interface StoredFile {
  id: string
  fileName: string
  fileData: ArrayBuffer
  uploadedAt: number
  size: number
  processedData?: any[]
}

class IndexedDBStorage {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          objectStore.createIndex('fileName', 'fileName', { unique: false })
          objectStore.createIndex('uploadedAt', 'uploadedAt', { unique: false })
        }
        if (!db.objectStoreNames.contains(PROMPT_STORE_NAME)) {
          const promptStore = db.createObjectStore(PROMPT_STORE_NAME, { keyPath: 'id' })
          promptStore.createIndex('isDefault', 'isDefault', { unique: false })
        }
      }
    })
  }

  async ensureDB(): Promise<void> {
    if (!this.db) {
      await this.init()
    }
  }

  async saveFile(file: File, processedData?: any[]): Promise<string> {
    await this.ensureDB()

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const arrayBuffer = await file.arrayBuffer()

    const storedFile: StoredFile = {
      id,
      fileName: file.name,
      fileData: arrayBuffer,
      uploadedAt: Date.now(),
      size: file.size,
      processedData,
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.add(storedFile)

      request.onsuccess = () => resolve(id)
      request.onerror = () => reject(new Error('Failed to save file'))
    })
  }

  async getFile(id: string): Promise<StoredFile | null> {
    await this.ensureDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => {
        resolve(request.result || null)
      }
      request.onerror = () => reject(new Error('Failed to get file'))
    })
  }

  async getAllFiles(): Promise<StoredFile[]> {
    await this.ensureDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result || [])
      }
      request.onerror = () => reject(new Error('Failed to get all files'))
    })
  }

  async deleteFile(id: string): Promise<void> {
    await this.ensureDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to delete file'))
    })
  }

  async clearAll(): Promise<void> {
    await this.ensureDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to clear storage'))
    })
  }

  async getStorageStats(): Promise<{
    quota: number
    usage: number
    usageDetails?: any
    persisted: boolean
  }> {
    try {
      // Check if Storage API is available
      if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
        console.warn('Storage API not available in this environment')
        return {
          quota: 0,
          usage: 0,
          persisted: false,
        }
      }

      // Get storage estimate
      const estimate = await navigator.storage.estimate()
      
      // Check if persistent storage is granted
      const persisted = navigator.storage.persisted
        ? await navigator.storage.persisted()
        : false

      return {
        quota: estimate.quota || 0,
        usage: estimate.usage || 0,
        usageDetails: (estimate as any).usageDetails,
        persisted,
      }
    } catch (error) {
      console.error('Failed to get storage stats:', error)
      return {
        quota: 0,
        usage: 0,
        persisted: false,
      }
    }
  }

  async requestPersistentStorage(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const persisted = await navigator.storage.persist()
        return persisted
      }
      return false
    } catch (error) {
      console.error('Failed to request persistent storage:', error)
      return false
    }
  }

  fileToBlob(file: StoredFile): File {
    const blob = new Blob([file.fileData], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    return new File([blob], file.fileName, {
      type: blob.type,
      lastModified: file.uploadedAt,
    })
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  async savePrompt(prompt: string): Promise<void> {
    await this.ensureDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([PROMPT_STORE_NAME], 'readwrite')
      const store = transaction.objectStore(PROMPT_STORE_NAME)
      const request = store.put({
        id: 'custom-prompt',
        prompt,
        updatedAt: Date.now(),
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('Failed to save prompt'))
    })
  }

  async getPrompt(): Promise<string | null> {
    await this.ensureDB()

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'))
        return
      }

      const transaction = this.db.transaction([PROMPT_STORE_NAME], 'readonly')
      const store = transaction.objectStore(PROMPT_STORE_NAME)
      const request = store.get('custom-prompt')

      request.onsuccess = () => {
        resolve(request.result?.prompt || null)
      }
      request.onerror = () => reject(new Error('Failed to get prompt'))
    })
  }
}

export const storage = new IndexedDBStorage()

