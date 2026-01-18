'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { storage } from '@/app/lib/storage/indexeddb'
import { DEFAULT_PROMPT_TEMPLATE } from '@/app/lib/prompts/default-prompt'
import GoogleContactsIntegration from '@/app/components/GoogleContactsIntegration'

declare global {
  interface Window {
    googleContactsIntegration?: {
      signIn: () => void
      signOut: () => void
      importContacts: (data: ProcessedRow[]) => Promise<void>
      isSignedIn: () => boolean
      isLoading: () => boolean
      isInitialized: () => boolean
    }
  }
}

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
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [editedData, setEditedData] = useState<ProcessedRow[]>([])
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [dialogFormData, setDialogFormData] = useState<ProcessedRow | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  // Update transition names synchronously before paint (useLayoutEffect runs before browser paint)
  useLayoutEffect(() => {
    if (!isDialogOpen) return

    const mobileQuery = window.matchMedia('(max-width: 639px)')
    const desktopQuery = window.matchMedia('(min-width: 640px)')

    // Find dialog elements
    const mobileDialog = document.querySelector('[data-dialog="mobile"]') as HTMLElement
    const desktopDialog = document.querySelector('[data-dialog="desktop"]') as HTMLElement

    if (mobileDialog && desktopDialog) {
      if (mobileQuery.matches) {
        mobileDialog.style.viewTransitionName = 'dialog-transition'
        desktopDialog.style.viewTransitionName = 'none'
      } else if (desktopQuery.matches) {
        desktopDialog.style.viewTransitionName = 'dialog-transition'
        mobileDialog.style.viewTransitionName = 'none'
      }
    }
  }, [isDialogOpen])

  // Update transition names on resize
  useEffect(() => {
    if (!isDialogOpen) return

    const updateTransitionNames = () => {
      const mobileQuery = window.matchMedia('(max-width: 639px)')
      const desktopQuery = window.matchMedia('(min-width: 640px)')

      const mobileDialog = document.querySelector('[data-dialog="mobile"]') as HTMLElement
      const desktopDialog = document.querySelector('[data-dialog="desktop"]') as HTMLElement

      if (mobileDialog && desktopDialog) {
        if (mobileQuery.matches) {
          mobileDialog.style.viewTransitionName = 'dialog-transition'
          desktopDialog.style.viewTransitionName = 'none'
        } else if (desktopQuery.matches) {
          desktopDialog.style.viewTransitionName = 'dialog-transition'
          mobileDialog.style.viewTransitionName = 'none'
        }
      }
    }

    window.addEventListener('resize', updateTransitionNames)
    return () => window.removeEventListener('resize', updateTransitionNames)
  }, [isDialogOpen])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Check Google Contacts connection status
  useEffect(() => {
    if (typeof window !== 'undefined' && user) {
      checkGoogleConnection()
    }
  }, [user])

  // Handle dialog keyboard shortcuts and body scroll lock
  useEffect(() => {
    if (isDialogOpen) {
      // Prevent body scroll when dialog is open
      document.body.style.overflow = 'hidden'

      // Handle Escape key to close dialog
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsDialogOpen(false)
          setEditingRowIndex(null)
          setDialogFormData(null)
        }
      }

      window.addEventListener('keydown', handleEscape)

      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', handleEscape)
      }
    } else {
      document.body.style.overflow = ''
    }
  }, [isDialogOpen])

  const handleImportResult = (result: { success: boolean; message: string }) => {
    setImportResult(result)
    if (!result.success) {
      setError(result.message)
    }
    // Reset progress when import completes
    setImportProgress({ current: 0, total: 0 })
  }

  const handleImportProgress = (current: number, total: number) => {
    setImportProgress({ current, total })
  }

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

  const checkGoogleConnection = () => {
    setIsCheckingConnection(true)
    // Check every 500ms until Google API is initialized
    const checkInterval = setInterval(() => {
      if (window.googleContactsIntegration?.isInitialized()) {
        const connected = window.googleContactsIntegration.isSignedIn()
        setIsGoogleConnected(connected)
        setIsCheckingConnection(false)
        clearInterval(checkInterval)
      }
    }, 500)

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval)
      setIsCheckingConnection(false)
      if (!window.googleContactsIntegration?.isInitialized()) {
        setIsGoogleConnected(false)
      }
    }, 10000)
  }

  const handleConnectGoogleContacts = (e?: React.MouseEvent) => {
    // Prevent any default navigation
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    console.log('Connect Google Contacts clicked')
    console.log('window.googleContactsIntegration:', window.googleContactsIntegration)
    console.log('CLIENT_ID configured:', !!process.env.NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID)

    // Check if Google API is initialized
    if (!window.googleContactsIntegration) {
      const errorMsg = 'Google Contacts integration not ready. Please wait a moment and try again, or refresh the page. Make sure NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID is set in your environment variables.'
      setError(errorMsg)
      console.error('GoogleContactsIntegration not available on window object')
      console.error('Available window properties:', Object.keys(window).filter(k => k.includes('google')))
      return
    }

    if (!window.googleContactsIntegration.isInitialized()) {
      const errorMsg = 'Google API is still initializing. Please wait a moment and try again.'
      setError(errorMsg)
      console.error('Google API not initialized yet. Status:', {
        isInitialized: window.googleContactsIntegration.isInitialized(),
        isSignedIn: window.googleContactsIntegration.isSignedIn(),
      })
      return
    }

    // Use client-side Google Identity Services
    try {
      console.log('Calling signIn()...')
      window.googleContactsIntegration.signIn()
    } catch (error: any) {
      console.error('Error signing in to Google:', error)
      setError(`Failed to connect to Google Contacts: ${error.message || 'Unknown error'}`)
    }
  }

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsGoogleConnected(connected)
    if (connected) {
      setImportResult({
        success: true,
        message: 'Successfully connected to Google Contacts! You can now import contacts.',
      })
    }
  }, [])

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

  const handleRowClick = (rowIdx: number) => {
    const dataToDisplay = editedData.length > 0 ? editedData : processedData
    if (dataToDisplay.length === 0 || rowIdx >= dataToDisplay.length) {
      console.error('Invalid row index:', rowIdx, 'Total rows:', dataToDisplay.length)
      return
    }
    const rowData = { ...dataToDisplay[rowIdx] }

    // Use View Transitions API if supported
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        setDialogFormData(rowData)
        setEditingRowIndex(rowIdx)
        setIsDialogOpen(true)
      })
    } else {
      // Fallback for browsers without View Transitions support
      setDialogFormData(rowData)
      setEditingRowIndex(rowIdx)
      setIsDialogOpen(true)
    }
  }

  const handleDialogClose = () => {
    // Use View Transitions API if supported
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        setIsDialogOpen(false)
        setEditingRowIndex(null)
        setDialogFormData(null)
      })
    } else {
      // Fallback for browsers without View Transitions support
      setIsDialogOpen(false)
      setEditingRowIndex(null)
      setDialogFormData(null)
    }
  }

  const handleDialogFieldChange = (key: string, value: any) => {
    if (dialogFormData) {
      setDialogFormData({
        ...dialogFormData,
        [key]: value,
      })
    }
  }

  const handleDialogSave = () => {
    if (editingRowIndex !== null && dialogFormData) {
      const newEditedData = [...editedData]
      if (newEditedData.length === 0) {
        // Initialize editedData from processedData if empty
        newEditedData.push(...processedData)
      }
      newEditedData[editingRowIndex] = dialogFormData
      setEditedData(newEditedData)
      setProcessedData(newEditedData)
      handleDialogClose()
    }
  }

  const handleRowSelect = (rowIdx: number) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(rowIdx)) {
        newSet.delete(rowIdx)
      } else {
        newSet.add(rowIdx)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const dataToDisplay = editedData.length > 0 ? editedData : processedData
      setSelectedRows(new Set(dataToDisplay.map((_, idx) => idx)))
    } else {
      setSelectedRows(new Set())
    }
  }

  const handleBulkDelete = () => {
    if (selectedRows.size === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedRows.size} row${selectedRows.size > 1 ? 's' : ''}? This action cannot be undone.`
    )

    if (!confirmed) return

    const dataToDisplay = editedData.length > 0 ? editedData : processedData
    const indicesToDelete = Array.from(selectedRows).sort((a, b) => b - a) // Sort descending to delete from end

    // Create new array without selected rows
    let newData = [...dataToDisplay]
    indicesToDelete.forEach(idx => {
      newData.splice(idx, 1)
    })

    // Renumber rows starting from 1
    newData = newData.map((row, idx) => ({
      ...row,
      row_number: idx + 1,
    }))

    setEditedData(newData)
    setProcessedData(newData)
    setSelectedRows(new Set())
  }

  const getOrderedColumns = (firstRow: ProcessedRow): string[] => {
    const keys = Object.keys(firstRow)
    // Move SaveName or SAVENAME to first position
    const saveNameKey = keys.find(k =>
      k.toLowerCase() === 'savename' ||
      k.toLowerCase() === 'save_name' ||
      k === 'SaveName' ||
      k === 'SAVENAME'
    )

    if (saveNameKey) {
      return [saveNameKey, ...keys.filter(k => k !== saveNameKey)]
    }
    // If no SaveName, move SenderName to first
    const senderNameKey = keys.find(k =>
      k.toLowerCase() === 'sendername' ||
      k === 'SenderName'
    )
    if (senderNameKey) {
      return [senderNameKey, ...keys.filter(k => k !== senderNameKey)]
    }
    return keys
  }

  const handleImportToGoogleContacts = async () => {
    const dataToImport = editedData.length > 0 ? editedData : processedData

    if (dataToImport.length === 0) {
      setError('No processed data to import')
      return
    }

    // Check connection first
    if (!isGoogleConnected || !window.googleContactsIntegration?.isSignedIn()) {
      setError('Please connect your Google account first using the "Connect Google Contacts" button.')
      setImportResult({
        success: false,
        message: 'Google Contacts not connected. Please connect first.',
      })
      return
    }

    setIsImporting(true)
    setImportResult(null)
    setError(null)
    setImportProgress({ current: 0, total: dataToImport.length })

    try {
      // Use client-side Google Contacts integration
      if (window.googleContactsIntegration) {
        await window.googleContactsIntegration.importContacts(dataToImport)
      } else {
        throw new Error('Google Contacts integration not available. Please refresh the page.')
      }
    } catch (err: any) {
      console.error('Import error:', err)
      setError(err.message || 'Failed to import contacts to Google')
      setImportResult({
        success: false,
        message: err.message || 'Import failed',
      })
    } finally {
      setIsImporting(false)
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
      setEditedData([])
      setSelectedRows(new Set())
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
      setEditedData([])
      setSelectedRows(new Set())
      setDownloadUrl(null)

      // Save file to IndexedDB
      saveFileToStorage(droppedFile)
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setFileName('')
    setProcessedData([])
    setEditedData([])
    setSelectedRows(new Set())
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
    setEditedData([])
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
      setEditedData(processedRows) // Initialize edited data
      setSelectedRows(new Set()) // Clear selections when new data is processed

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
      setEditedData([])
      setSelectedRows(new Set())
      setDownloadUrl(null)
    } catch (err: any) {
      console.error('Failed to clear storage:', err)
      setError(err.message || 'Failed to clear storage')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownload = async () => {
    // Use editedData if available, otherwise use processedData
    const dataToDownload = editedData.length > 0 ? editedData : processedData

    if (dataToDownload.length === 0) {
      setError('No data to download')
      return
    }

    try {
      // Regenerate Excel file from current (possibly edited) data
      const generateResponse = await fetch('/api/excel/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: dataToDownload,
          originalHeaders: [],
        }),
      })

      if (!generateResponse.ok) {
        throw new Error('Failed to generate Excel file')
      }

      const blob = await generateResponse.blob()
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = fileName.replace(/\.[^/.]+$/, '') + '_processed.xlsx'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up the URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err: any) {
      setError('Failed to download file: ' + err.message)
    }
  }

  const handleSaveToDatabase = async () => {
    const dataToSave = editedData.length > 0 ? editedData : processedData

    // delete row_number 
    dataToSave.forEach(row => {
      delete row.row_number
    })

    if (dataToSave.length === 0) {
      setError('No data to save')
      return
    }

    if (!user) {
      setError('Please log in to save data')
      router.push('/login')
      return
    }

    setIsSaving(true)
    setSaveResult(null)
    setError(null)

    try {
      const response = await fetch('/api/customers/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customers: dataToSave,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save data')
      }

      // Use the message from the API if available, otherwise construct one
      const message = result.message || 
        (result.duplicates > 0 
          ? `Successfully saved ${result.count} new customer(s). ${result.duplicates} duplicate(s) skipped.`
          : `Successfully saved ${result.count} customer(s) to database!`)

      setSaveResult({
        success: true,
        message: message,
      })

      // Clear error if any
      setError(null)
    } catch (err: any) {
      console.error('Save error:', err)
      setError(err.message || 'Failed to save data to database')
      setSaveResult({
        success: false,
        message: err.message || 'Failed to save data',
      })
    } finally {
      setIsSaving(false)
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <Link
                href="/dashboard"
                className="text-slate-600 hover:text-slate-900 transition-colors text-sm sm:text-base"
              >
                <div className="flex flex-row items-center justify-start gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Dashboard
                </div>
              </Link>
              {/* <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Excel Processor</h1> */}
            </div>
          </div>
        </div>
      </header>

      {/* Google Contacts Integration Component */}
      <GoogleContactsIntegration
        onConnectionChange={handleConnectionChange}
        onImportResult={handleImportResult}
        onImportProgress={handleImportProgress}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Prompt Editor Section */}
        <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8 border border-slate-200/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <h3 className="text-lg sm:text-xl font-semibold text-slate-900">OpenAI Prompt Configuration</h3>
            <button
              onClick={() => setShowPromptEditor(!showPromptEditor)}
              className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center gap-2 w-full sm:w-auto"
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
                style={{ color: "black" }}
              />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetToDefaultPrompt}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200 w-full sm:w-auto"
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
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all duration-200 active:scale-[0.98] w-full sm:w-auto"
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
          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8 border border-slate-200/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Storage Information</h3>
              <button
                onClick={handleClearStorage}
                disabled={isDeleting || storedFiles.length === 0}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 w-full sm:w-auto"
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <p className="text-xs sm:text-sm text-slate-600 mb-1">Available Storage</p>
                <p className="text-base sm:text-lg font-semibold text-slate-900">
                  {storage.formatBytes(storageStats.quota - storageStats.usage)}
                </p>
              </div>
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <p className="text-xs sm:text-sm text-slate-600 mb-1">Used Storage</p>
                <p className="text-base sm:text-lg font-semibold text-slate-900">
                  {storage.formatBytes(storageStats.usage)}
                </p>
              </div>
              <div className="p-3 sm:p-4 bg-slate-50 rounded-lg">
                <p className="text-xs sm:text-sm text-slate-600 mb-1">Total Storage</p>
                <p className="text-base sm:text-lg font-semibold text-slate-900">
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
                          <p className="text-xs text-slate-500 break-words">
                            {storage.formatBytes(storedFile.size)} • {new Date(storedFile.uploadedAt).toLocaleDateString()} {new Date(storedFile.uploadedAt).toLocaleTimeString()}
                            {storedFile.processedData && ` • ${storedFile.processedData.length} rows processed`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2 sm:ml-3 flex-shrink-0">
                          <button
                            onClick={async () => {
                              try {
                                const loadedFile = storage.fileToBlob(storedFile)
                                setFile(loadedFile)
                                setFileName(loadedFile.name)
                                if (storedFile.processedData) {
                                  setProcessedData(storedFile.processedData)
                                  setEditedData(storedFile.processedData) // Initialize edited data
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
                                  setEditedData([])
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
                                    setEditedData([])
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
        <div id="upload-section" className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8 border border-slate-200/50">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-4 sm:mb-6">Upload Excel File</h2>

          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-300 rounded-xl p-6 sm:p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
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
              <p className="text-base sm:text-lg text-slate-600 mb-2">
                Click to upload or drag and drop
              </p>
              <p className="text-xs sm:text-sm text-slate-500">
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

              {/* Progress Section - shown below button when processing */}
              {isProcessing && (
                <div className="space-y-2 pt-4 border-t border-slate-200">
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
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Results Section */}
        {processedData.length > 0 && !isProcessing && (
          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8 border border-slate-200/50">
            <div className="flex flex-col gap-4 mb-4 sm:mb-6">
              <h3 className="text-lg font-semibold text-slate-900">
                Processed Results ({processedData.length} rows)
              </h3>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                {!isGoogleConnected && !isCheckingConnection && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        console.log('Button clicked - calling handleConnectGoogleContacts')
                        if (window.googleContactsIntegration && typeof (window.googleContactsIntegration as any).getStatus === 'function') {
                          console.log('Integration status:', (window.googleContactsIntegration as any).getStatus())
                        }
                        handleConnectGoogleContacts(e)
                      }}
                      className="px-4 sm:px-6 py-2 bg-blue-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Connect Google Contacts
                    </button>
                    {process.env.NODE_ENV === 'development' && (
                      <button
                        type="button"
                        onClick={() => {
                          const integration = window.googleContactsIntegration as any
                          const status = typeof integration?.getStatus === 'function' ? integration.getStatus() : null
                          console.log('Google Contacts Integration Status:', status)
                          alert(`Status:\n${JSON.stringify(status, null, 2)}`)
                        }}
                        className="px-3 py-1 text-xs bg-slate-200 text-slate-700 rounded"
                        title="Debug: Check integration status"
                      >
                        🔍 Debug
                      </button>
                    )}
                  </>
                )}
                {isGoogleConnected && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Connected</span>
                  </div>
                )}
                <button
                  onClick={handleImportToGoogleContacts}
                  disabled={isImporting || !isGoogleConnected}
                  className="px-4 sm:px-6 py-2 bg-purple-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-purple-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 w-full sm:w-auto relative overflow-hidden"
                >
                  {isImporting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 relative z-10" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="relative z-10 whitespace-nowrap">
                        {importProgress.total > 0
                          ? `Importing ${importProgress.current}/${importProgress.total} (${Math.round((importProgress.current / importProgress.total) * 100)}%)`
                          : 'Importing...'}
                      </span>
                      {importProgress.total > 0 && (
                        <>
                          <div
                            className="absolute inset-0 bg-purple-700 transition-all duration-300 ease-out"
                            style={{
                              width: `${(importProgress.current / importProgress.total) * 100}%`,
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-transparent" />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Import to Google Contacts
                    </>
                  )}
                </button>
                {(processedData.length > 0 || editedData.length > 0) && (
                  <>
                    <button
                      onClick={handleSaveToDatabase}
                      disabled={isSaving}
                      className="px-4 sm:px-6 py-2 bg-indigo-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          Save to Database
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="px-4 sm:px-6 py-2 bg-green-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Excel
                    </button>
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {selectedRows.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      className="px-4 sm:px-6 py-2 bg-red-600 text-white text-sm sm:text-base font-medium rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Selected ({selectedRows.size})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {importResult && (
              <div className={`mb-4 p-4 rounded-lg ${importResult.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
                }`}>
                <p className={`text-sm ${importResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                  {importResult.message}
                </p>
              </div>
            )}

            {saveResult && (
              <div className={`mb-4 p-4 rounded-lg ${saveResult.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
                }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${saveResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                    {saveResult.message}
                  </p>
                  {saveResult.success && (
                    <Link
                      href="/customers"
                      className="ml-4 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      View Customers →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Editable Table */}
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                {(() => {
                  const dataToDisplay = editedData.length > 0 ? editedData : processedData
                  if (dataToDisplay.length === 0) return null

                  return (
                    <>

                      <p className="text-xs text-slate-500 my-2 sm:px-0">
                        💡 Click any row to edit. Use checkboxes to select multiple rows for bulk deletion.
                      </p>

                      <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                        <table className="min-w-full divide-y divide-slate-200 border border-slate-200">
                          <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left border-r border-slate-200 w-12">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.size > 0 && selectedRows.size === dataToDisplay.length}
                                  onChange={(e) => handleSelectAll(e.target.checked)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded cursor-pointer"
                                  aria-label="Select all rows"
                                />
                              </th>
                              {getOrderedColumns(dataToDisplay[0]).map((key) => (
                                <th
                                  key={key}
                                  className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-semibold text-slate-900 uppercase tracking-wider border-r border-slate-200 whitespace-nowrap"
                                >
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-200">
                            {dataToDisplay.map((row, rowIdx) => (
                              <tr
                                key={rowIdx}
                                className={`hover:bg-blue-50 cursor-pointer transition-colors active:bg-blue-100 select-none group ${selectedRows.has(rowIdx) ? 'bg-blue-100' : ''}`}
                                onClick={(e) => {
                                  // Don't open dialog if clicking checkbox
                                  if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                                    return
                                  }
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleRowClick(rowIdx)
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleRowClick(rowIdx)
                                  }
                                }}
                              >
                                <td
                                  className="px-2 sm:px-4 py-2 border-r border-slate-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedRows.has(rowIdx)}
                                    onChange={() => handleRowSelect(rowIdx)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded cursor-pointer"
                                    aria-label={`Select row ${rowIdx + 1}`}
                                  />
                                </td>
                                {getOrderedColumns(row).map((key) => {
                                  const value = row[key]
                                  const displayValue = value !== null && value !== undefined ? String(value) : ''

                                  return (
                                    <td
                                      key={key}
                                      className="px-1 sm:px-2 py-2 text-xs sm:text-sm border-r border-slate-100"
                                    >
                                      <div className="min-h-[28px] sm:min-h-[32px] px-1 sm:px-2 py-1 text-slate-900 font-medium truncate max-w-[200px] sm:max-w-none group-hover:text-blue-700">
                                        {displayValue || '-'}
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Edit Row Dialog */}
        {isDialogOpen && editingRowIndex !== null && dialogFormData && (
          <>
            {/* Backdrop - closes dialog on click */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
              onClick={handleDialogClose}
            />

            {/* Dialog - Mobile: Full screen with view transition */}
            <div className="fixed inset-0 z-50 sm:hidden">
              <div
                data-dialog="mobile"
                className="absolute inset-0 bg-white rounded-t-3xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mobile Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between z-10">
                  <h2 className="text-lg font-semibold text-slate-900">Edit Row {editingRowIndex + 1}</h2>
                  <button
                    onClick={handleDialogClose}
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Mobile Content */}
                <div className="overflow-y-auto h-[calc(100vh-140px)] px-4 py-4">
                  <div className="space-y-4">
                    {getOrderedColumns(dialogFormData).map((key) => {
                      const value = dialogFormData[key]
                      const displayValue = value !== null && value !== undefined ? String(value) : ''
                      const isLongText = displayValue.length > 100

                      return (
                        <div key={key} className="space-y-2">
                          <label className="block text-sm font-medium text-slate-700">
                            {key}
                          </label>
                          {isLongText ? (
                            <textarea
                              value={displayValue}
                              onChange={(e) => handleDialogFieldChange(key, e.target.value)}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 resize-y min-h-[100px]"
                              placeholder={`Enter ${key}`}
                              rows={4}
                            />
                          ) : (
                            <input
                              type="text"
                              value={displayValue}
                              onChange={(e) => handleDialogFieldChange(key, e.target.value)}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                              placeholder={`Enter ${key}`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Mobile Footer */}
                <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-4 flex justify-end">
                  <button
                    onClick={handleDialogSave}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Dialog - Desktop: Sidebar with view transition */}
            <div className="hidden sm:block fixed inset-y-0 right-0 z-50">
              <div
                data-dialog="desktop"
                className="h-full bg-white shadow-2xl w-[30vw] max-w-[500px]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Desktop Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
                  <h2 className="text-xl font-semibold text-slate-900">Edit Row {editingRowIndex + 1}</h2>
                  <button
                    onClick={handleDialogClose}
                    className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Desktop Content */}
                <div className="overflow-y-auto h-[calc(100vh-140px)] px-6 py-6">
                  <div className="space-y-4">
                    {getOrderedColumns(dialogFormData).map((key) => {
                      const value = dialogFormData[key]
                      const displayValue = value !== null && value !== undefined ? String(value) : ''
                      const isLongText = displayValue.length > 100

                      return (
                        <div key={key} className="space-y-2">
                          <label className="block text-sm font-medium text-slate-700">
                            {key}
                          </label>
                          {isLongText ? (
                            <textarea
                              value={displayValue}
                              onChange={(e) => handleDialogFieldChange(key, e.target.value)}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 resize-y min-h-[100px]"
                              placeholder={`Enter ${key}`}
                              rows={4}
                            />
                          ) : (
                            <input
                              type="text"
                              value={displayValue}
                              onChange={(e) => handleDialogFieldChange(key, e.target.value)}
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                              placeholder={`Enter ${key}`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Desktop Footer */}
                <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end">
                  <button
                    onClick={handleDialogSave}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* View Transitions CSS */}
      <style jsx global>{`
        /* View Transitions - Enlarging animation */
        @supports (view-transition-name: none) {
          /* Default transition duration */
          ::view-transition-group(*),
          ::view-transition-old(*),
          ::view-transition-new(*) {
            animation-duration: 500ms;
            animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          /* Enlarging animation for dialog transition */
          ::view-transition-group(dialog-transition) {
            animation-duration: 500ms;
            animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          ::view-transition-old(dialog-transition),
          ::view-transition-new(dialog-transition) {
            animation-duration: 500ms;
            animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          /* Old view (row) - shrink and fade out */
          ::view-transition-old(dialog-transition) {
            animation-name: shrink-fade-out;
            z-index: 1;
          }

          /* New view (dialog) - enlarge and fade in */
          ::view-transition-new(dialog-transition) {
            animation-name: enlarge-fade-in;
            z-index: 2;
          }

          /* Keyframes for enlarging effect - smooth scale up */
          @keyframes enlarge-fade-in {
            from {
              opacity: 0;
              transform: scale(0.3);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          @keyframes shrink-fade-out {
            from {
              opacity: 1;
              transform: scale(1);
            }
            to {
              opacity: 0;
              transform: scale(0.3);
            }
          }

          /* Mobile: Drawer swipe-up animation (like Instagram comments) */
          @media (max-width: 640px) {
            ::view-transition-group(dialog-transition),
            ::view-transition-old(dialog-transition),
            ::view-transition-new(dialog-transition) {
              animation-duration: 350ms;
              animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
            }

            ::view-transition-new(dialog-transition) {
              animation-name: swipe-up-mobile;
            }

            ::view-transition-old(dialog-transition) {
              animation-name: swipe-down-mobile;
            }

            @keyframes swipe-up-mobile {
              from {
                opacity: 0;
                transform: translateY(100%);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes swipe-down-mobile {
              from {
                opacity: 1;
                transform: translateY(0);
              }
              to {
                opacity: 0;
                transform: translateY(100%);
              }
            }
          }

          /* Desktop: Sidebar transition with right-side enlarging */
          @media (min-width: 640px) {
            ::view-transition-new(dialog-transition) {
              animation-name: enlarge-fade-in-desktop;
            }

            ::view-transition-old(dialog-transition) {
              animation-name: shrink-fade-out-desktop;
            }

            @keyframes enlarge-fade-in-desktop {
              from {
                opacity: 0;
                transform: scale(0.4) translateX(30px);
              }
              to {
                opacity: 1;
                transform: scale(1) translateX(0);
              }
            }

            @keyframes shrink-fade-out-desktop {
              from {
                opacity: 1;
                transform: scale(1) translateX(0);
              }
              to {
                opacity: 0;
                transform: scale(0.4) translateX(30px);
              }
            }
          }
        }
      `}</style>
    </div>
  )
}

