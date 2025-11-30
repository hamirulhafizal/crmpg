'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { storage } from '@/app/lib/storage/indexeddb'
import { DEFAULT_PROMPT_TEMPLATE } from '@/app/lib/prompts/default-prompt'

interface ProcessedRow {
  [key: string]: any
  Gender?: string
  Ethnicity?: string
  Age?: number | string
  Prefix?: string
  FirstName?: string
  SenderName?: string
  row_number?: number
}

interface StorageStats {
  quota: number
  usage: number
  usageDetails?: any
  persisted: boolean
}

export default function ExcelProcessorPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedData, setProcessedData] = useState<ProcessedRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [totalRows, setTotalRows] = useState(0)
  const [currentRow, setCurrentRow] = useState(0)
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null)
  const [storedFiles, setStoredFiles] = useState<any[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_PROMPT_TEMPLATE)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Initialize IndexedDB and load stored files
  useEffect(() => {
    if (typeof window !== 'undefined' && user) {
      const initStorage = async () => {
        try {
          await storage.init()
          await loadStoredFiles()
          await loadCustomPrompt()
          await updateStorageStats()
          // Request persistent storage
          await storage.requestPersistentStorage()
          await updateStorageStats()
        } catch (err) {
          console.error('Failed to initialize storage:', err)
        }
      }
      initStorage()
    }
  }, [user])

  const loadStoredFiles = async () => {
    try {
      const files = await storage.getAllFiles()
      setStoredFiles(files.sort((a, b) => b.uploadedAt - a.uploadedAt))
    } catch (err) {
      console.error('Failed to load stored files:', err)
    }
  }

  const updateStorageStats = async () => {
    try {
      const stats = await storage.getStorageStats()
      setStorageStats(stats)
    } catch (err) {
      console.error('Failed to update storage stats:', err)
    }
  }

  const loadCustomPrompt = async () => {
    try {
      const savedPrompt = await storage.getPrompt()
      if (savedPrompt) {
        setCustomPrompt(savedPrompt)
      }
    } catch (err) {
      console.error('Failed to load custom prompt:', err)
    }
  }

  const saveCustomPrompt = async () => {
    try {
      await storage.savePrompt(customPrompt)
      setPromptSaved(true)
      setTimeout(() => setPromptSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save custom prompt:', err)
      setError('Failed to save prompt: ' + (err as Error).message)
    }
  }

  const resetToDefaultPrompt = () => {
    if (confirm('Reset to default prompt? This will overwrite your custom prompt.')) {
      setCustomPrompt(DEFAULT_PROMPT_TEMPLATE)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
      ]
      
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError('Please upload a valid Excel file (.xlsx, .xls) or CSV file')
        return
      }

      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }

      setFile(selectedFile)
      setFileName(selectedFile.name)
      setError(null)
      setProcessedData([])
      setDownloadUrl(null)
      
      // Save file to IndexedDB
      saveFileToStorage(selectedFile)
    }
  }

  const saveFileToStorage = async (fileToSave: File) => {
    try {
      await storage.saveFile(fileToSave)
      await loadStoredFiles()
      await updateStorageStats()
    } catch (err) {
      console.error('Failed to save file to storage:', err)
      // Don't show error to user, just log it
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ]
      
      if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError('Please upload a valid Excel file (.xlsx, .xls) or CSV file')
        return
      }

      if (droppedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }

      setFile(droppedFile)
      setFileName(droppedFile.name)
      setError(null)
      setProcessedData([])
      setDownloadUrl(null)
      
      // Save file to IndexedDB
      saveFileToStorage(droppedFile)
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setFileName('')
    setProcessedData([])
    setDownloadUrl(null)
    setProgress(0)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleProcess = async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    setIsProcessing(true)
    setProgress(0)
    setError(null)
    setProcessedData([])
    setDownloadUrl(null)
    setCurrentRow(0)

    try {
      // Step 1: Upload and parse file
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('/api/excel/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error || 'Failed to upload file')
      }

      const uploadData = await uploadResponse.json()
      const rows = uploadData.data || []
      setTotalRows(rows.length)

      if (rows.length === 0) {
        throw new Error('No data found in the file')
      }

      // Step 2: Process each row with OpenAI
      const processedRows: ProcessedRow[] = []
      
      for (let i = 0; i < rows.length; i++) {
        setCurrentRow(i + 1)
        setProgress(Math.round(((i + 1) / rows.length) * 90)) // 90% for processing

        try {
          const processResponse = await fetch('/api/openai/process-row', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              rowData: rows[i],
              rowNumber: i + 1,
              customPrompt: customPrompt !== DEFAULT_PROMPT_TEMPLATE ? customPrompt : undefined,
            }),
          })

          if (!processResponse.ok) {
            const errorData = await processResponse.json()
            console.error(`Error processing row ${i + 1}:`, errorData)
            // Continue with original row data if processing fails
            processedRows.push({
              ...rows[i],
              row_number: i + 1,
              _error: errorData.error || 'Processing failed',
            })
            continue
          }

          const processData = await processResponse.json()
          const processedRow = {
            ...rows[i],
            ...processData.result,
            row_number: i + 1,
          }
          processedRows.push(processedRow)

          // Add small delay to avoid rate limiting
          if (i < rows.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (rowError: any) {
          console.error(`Error processing row ${i + 1}:`, rowError)
          processedRows.push({
            ...rows[i],
            row_number: i + 1,
            _error: rowError.message || 'Processing failed',
          })
        }
      }

      setProcessedData(processedRows)

      // Step 3: Generate Excel file
      setProgress(95)
      const generateResponse = await fetch('/api/excel/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: processedRows,
          originalHeaders: uploadData.headers || [],
        }),
      })

      if (!generateResponse.ok) {
        const errorData = await generateResponse.json()
        throw new Error(errorData.error || 'Failed to generate Excel file')
      }

      // Step 4: Create download URL
      const blob = await generateResponse.blob()
      const url = URL.createObjectURL(blob)
      setDownloadUrl(url)
      setProgress(100)
      
      // Update stored file with processed data
      if (file) {
        try {
          await storage.saveFile(file, processedRows)
          await loadStoredFiles()
          await updateStorageStats()
        } catch (err) {
          console.error('Failed to update stored file:', err)
        }
      }
    } catch (err: any) {
      console.error('Processing error:', err)
      setError(err.message || 'An error occurred while processing the file')
      setProgress(0)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClearStorage = async () => {
    if (!confirm('Are you sure you want to delete all stored files? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      await storage.clearAll()
      setStoredFiles([])
      await updateStorageStats()
      setFile(null)
      setFileName('')
      setProcessedData([])
      setDownloadUrl(null)
    } catch (err: any) {
      console.error('Failed to clear storage:', err)
      setError(err.message || 'Failed to clear storage')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownload = () => {
    if (downloadUrl) {
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName.replace(/\.[^/.]+$/, '') + '_processed.xlsx'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-slate-600 hover:text-slate-900 transition-colors"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="text-2xl font-semibold text-slate-900">Excel Processor</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Prompt Editor Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-200/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-slate-900">OpenAI Prompt Configuration</h3>
            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center gap-2"
            >
              {showPromptEditor ? (
                <>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  Hide Prompt
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Customize Prompt
                </>
              )}
            </button>
          </div>
          
          {showPromptEditor && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-sm text-slate-600 mb-2">
                  <strong>Available variables:</strong> Use <code className="bg-white px-1 py-0.5 rounded text-xs">{'{{name}}'}</code>, <code className="bg-white px-1 py-0.5 rounded text-xs">{'{{dob}}'}</code>, and <code className="bg-white px-1 py-0.5 rounded text-xs">{'{{rowNumber}}'}</code> in your prompt. They will be replaced with actual values during processing.
                </p>
                <p className="text-xs text-slate-500">
                  The prompt defines how OpenAI processes each row. Make sure to include instructions for the JSON output format you expect.
                </p>
              </div>
              
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="w-full h-96 p-4 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                placeholder="Enter your custom prompt..."
                spellCheck={false}
                style={{color:"black"}}
              />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetToDefaultPrompt}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200"
                  >
                    Reset to Default
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {promptSaved && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Prompt saved!
                    </span>
                  )}
                  <button
                    onClick={saveCustomPrompt}
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all duration-200 active:scale-[0.98]"
                  >
                    Save Prompt
                  </button>
                </div>
              </div>
              
              {customPrompt !== DEFAULT_PROMPT_TEMPLATE && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Using custom prompt.</strong> Your custom prompt will be used when processing files.
                  </p>
                </div>
              )}
            </div>
          )}
          
          {!showPromptEditor && customPrompt !== DEFAULT_PROMPT_TEMPLATE && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Custom prompt is active.</strong> Click "Customize Prompt" to view or edit it.
              </p>
            </div>
          )}
        </div>

        {/* Storage Stats Section */}
        {storageStats && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-slate-200/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Storage Information</h3>
              <button
                onClick={handleClearStorage}
                disabled={isDeleting || storedFiles.length === 0}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear All Storage
                  </>
                )}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Available Storage</p>
                <p className="text-lg font-semibold text-slate-900">
                  {storage.formatBytes(storageStats.quota - storageStats.usage)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Used Storage</p>
                <p className="text-lg font-semibold text-slate-900">
                  {storage.formatBytes(storageStats.usage)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1">Total Storage</p>
                <p className="text-lg font-semibold text-slate-900">
                  {storage.formatBytes(storageStats.quota)}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {storageStats.persisted ? (
                    <>
                      <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-green-600 font-medium">Persistent storage enabled</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-sm text-yellow-600">Storage may be cleared by browser</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {storedFiles.length} file{storedFiles.length !== 1 ? 's' : ''} stored
                </p>
              </div>
              
              {/* Stored Files List */}
              {storedFiles.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-700 mb-2">Stored Files:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {storedFiles.map((storedFile) => (
                      <div
                        key={storedFile.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {storedFile.fileName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {storage.formatBytes(storedFile.size)} • {new Date(storedFile.uploadedAt).toLocaleDateString()} {new Date(storedFile.uploadedAt).toLocaleTimeString()}
                            {storedFile.processedData && ` • ${storedFile.processedData.length} rows processed`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            onClick={async () => {
                              try {
                                const loadedFile = storage.fileToBlob(storedFile)
                                setFile(loadedFile)
                                setFileName(loadedFile.name)
                                if (storedFile.processedData) {
                                  setProcessedData(storedFile.processedData)
                                  // Generate download URL if processed data exists
                                  const generateResponse = await fetch('/api/excel/generate', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ data: storedFile.processedData, originalHeaders: [] }),
                                  })
                                  if (generateResponse.ok) {
                                    const blob = await generateResponse.blob()
                                    setDownloadUrl(URL.createObjectURL(blob))
                                  }
                                } else {
                                  setProcessedData([])
                                  setDownloadUrl(null)
                                }
                                setError(null)
                                // Scroll to upload section
                                document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })
                              } catch (err: any) {
                                setError('Failed to load file: ' + err.message)
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Delete "${storedFile.fileName}"?`)) {
                                try {
                                  await storage.deleteFile(storedFile.id)
                                  await loadStoredFiles()
                                  await updateStorageStats()
                                  if (file && fileName === storedFile.fileName) {
                                    setFile(null)
                                    setFileName('')
                                    setProcessedData([])
                                    setDownloadUrl(null)
                                  }
                                } catch (err: any) {
                                  setError('Failed to delete file: ' + err.message)
                                }
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div id="upload-section" className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-200/50">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">Upload Excel File</h2>
          
          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <svg
                className="mx-auto h-12 w-12 text-slate-400 mb-4"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-lg text-slate-600 mb-2">
                Click to upload or drag and drop
              </p>
              <p className="text-sm text-slate-500">
                Excel files (.xlsx, .xls) or CSV files up to 10MB
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg
                    className="h-8 w-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <div>
                    <p className="font-medium text-slate-900">{fileName}</p>
                    <p className="text-sm text-slate-500">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                  disabled={isProcessing}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <button
                onClick={handleProcess}
                disabled={isProcessing}
                className="w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Processing...' : 'Process with OpenAI'}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Progress Section */}
        {isProcessing && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-200/50">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Processing</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {totalRows > 0 && (
                <p className="text-sm text-slate-600 text-center">
                  Processing row {currentRow} of {totalRows}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results Section */}
        {processedData.length > 0 && !isProcessing && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 border border-slate-200/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">
                Processed Results ({processedData.length} rows)
              </h3>
              {downloadUrl && (
                <button
                  onClick={handleDownload}
                  className="px-6 py-2 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Excel
                </button>
              )}
            </div>
            
            {/* Preview Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    {Object.keys(processedData[0] || {}).map((key) => (
                      <th
                        key={key}
                        className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {processedData.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {Object.values(row).map((value: any, cellIdx) => (
                        <td key={cellIdx} className="px-4 py-3 text-sm text-slate-900">
                          {value !== null && value !== undefined ? String(value) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {processedData.length > 10 && (
                <p className="text-sm text-slate-600 mt-4 text-center">
                  Showing first 10 rows. Download the full file to see all {processedData.length} rows.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

