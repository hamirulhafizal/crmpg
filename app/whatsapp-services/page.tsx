'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WhatsAppConnection {
  id: string
  sender_number: string
  device_status: string
  last_connected_at: string | null
  last_disconnected_at: string | null
  messages_sent: number
  api_key?: string // Optional, for display purposes only
}

interface Birthday {
  id: string
  name: string | null
  sender_name: string | null
  save_name: string | null
  phone: string | null
  dob: string | null
  age: number | null
  birthday_date: string
  is_today: boolean
  already_sent: boolean
}

export default function WhatsAppServicesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [connection, setConnection] = useState<WhatsAppConnection | null>(null)
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<'idle' | 'processing' | 'qrcode' | 'connected' | 'error'>('idle')
  const [senderNumber, setSenderNumber] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Birthday automation state
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [isLoadingBirthdays, setIsLoadingBirthdays] = useState(false)
  const [selectedBirthdays, setSelectedBirthdays] = useState<Set<string>>(new Set())
  const [isSending, setIsSending] = useState(false)
  const [messageTemplate, setMessageTemplate] = useState('Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂')
  const [settings, setSettings] = useState<any>(null)
  const [scheduledTime, setScheduledTime] = useState('08:00')
  const [autoSendEnabled, setAutoSendEnabled] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      loadConnection()
      loadSettings()
      loadBirthdays()
    }
  }, [user])

  // Poll QR code status
  useEffect(() => {
    if (qrStatus === 'processing' && senderNumber && apiKey) {
      const interval = setInterval(async () => {
        await generateQR()
      }, 3000) // Poll every 3 seconds

      return () => clearInterval(interval)
    }
  }, [qrStatus, senderNumber, apiKey])

  const loadConnection = async () => {
    setIsCheckingConnection(true)
    setError(null)
    try {
      // Get connection status which includes full connection details
      const statusResponse = await fetch('/api/whatsapp/status')
      const statusResult = await statusResponse.json()

      if (statusResult.connection) {
        setConnection(statusResult.connection)
        // Always pre-fill sender number and API key from existing connection
        setSenderNumber(statusResult.connection.sender_number || '')
        if (statusResult.connection.api_key) {
          setApiKey(statusResult.connection.api_key)
        }
        setQrStatus(statusResult.connected ? 'connected' : 'idle')
      } else {
        // Try to get any existing connection (even if disconnected)
        const checkResponse = await fetch('/api/whatsapp/check-connection')
        const checkResult = await checkResponse.json()
        
        if (checkResult.has_connection && checkResult.connection) {
          setConnection(checkResult.connection)
          setSenderNumber(checkResult.connection.sender_number || '')
          if (checkResult.connection.api_key) {
            setApiKey(checkResult.connection.api_key)
          }
          setQrStatus(checkResult.connected ? 'connected' : 'idle')
        } else {
          // No connection found
          setConnection(null)
          setSenderNumber('')
          setApiKey('')
          setQrStatus('idle')
        }
      }
    } catch (err: any) {
      console.error('Error loading connection:', err)
      setError(err.message || 'Failed to load connection')
    } finally {
      setIsCheckingConnection(false)
    }
  }

  const checkConnection = async () => {
    try {
      const response = await fetch('/api/whatsapp/status')
      const result = await response.json()

      if (result.connection) {
        setConnection(result.connection)
        // Update sender number and API key if they exist
        if (result.connection.sender_number) {
          setSenderNumber(result.connection.sender_number)
        }
        if (result.connection.api_key) {
          setApiKey(result.connection.api_key)
        }
        setQrStatus(result.connected ? 'connected' : 'idle')
      } else {
        setConnection(null)
        setQrStatus('idle')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check connection')
    }
  }

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/whatsapp/settings')
      const result = await response.json()
      setSettings(result)
      if (result.default_template) {
        setMessageTemplate(result.default_template)
      }
      if (result.send_time) {
        // Convert TIME format (HH:MM:SS) to input format (HH:MM)
        const timeParts = result.send_time.split(':')
        setScheduledTime(`${timeParts[0]}:${timeParts[1]}`)
      }
      if (result.auto_send_enabled !== undefined) {
        setAutoSendEnabled(result.auto_send_enabled)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const loadBirthdays = async () => {
    setIsLoadingBirthdays(true)
    try {
      const response = await fetch('/api/birthday/upcoming?days=7')
      const result = await response.json()
      setBirthdays(result.birthdays || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load birthdays')
    } finally {
      setIsLoadingBirthdays(false)
    }
  }

  const generateQR = async () => {
    if (!senderNumber || !apiKey) {
      setError('Please enter your WhatsApp number and API key')
      return
    }

    setIsConnecting(true)
    setError(null)
    setQrStatus('processing')

    try {
      const response = await fetch('/api/whatsapp/generate-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_number: senderNumber,
          api_key: apiKey,
        }),
      })

      const result = await response.json()

      if (result.status === 'processing') {
        setQrStatus('processing')
        return
      }

      if (result.status === 'qrcode' && result.qrcode) {
        setQrCode(result.qrcode)
        setQrStatus('qrcode')
        // Continue polling
        setTimeout(() => {
          generateQR()
        }, 3000)
        return
      }

      if (result.status === 'connected') {
        setQrStatus('connected')
        setQrCode(null)
        await loadConnection()
        return
      }

      setError(result.message || 'Failed to generate QR code')
      setQrStatus('error')
    } catch (err: any) {
      setError(err.message || 'Failed to generate QR code')
      setQrStatus('error')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!connection) return

    if (!confirm('Are you sure you want to disconnect WhatsApp?')) {
      return
    }

    try {
      const response = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connection_id: connection.id,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setConnection(null)
        setSenderNumber('')
        setQrStatus('idle')
        setQrCode(null)
        // Reload connection to get updated status
        await loadConnection()
      } else {
        setError(result.error || 'Failed to disconnect')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBirthdays(new Set(birthdays.map(b => b.id)))
    } else {
      setSelectedBirthdays(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedBirthdays)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedBirthdays(newSelected)
  }

  const handleSendBirthday = async (customerId: string) => {
    if (!connection) {
      setError('Please connect WhatsApp first')
      return
    }

    setIsSending(true)
    try {
      const response = await fetch('/api/birthday/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: customerId,
          message_template: messageTemplate,
        }),
      })

      const result = await response.json()

      if (result.success) {
        await loadBirthdays()
        await checkConnection()
      } else {
        setError(result.error || 'Failed to send message')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  const handleBulkSend = async () => {
    if (selectedBirthdays.size === 0) {
      setError('Please select at least one customer')
      return
    }

    if (!connection) {
      setError('Please connect WhatsApp first')
      return
    }

    if (!confirm(`Send birthday messages to ${selectedBirthdays.size} customer(s)?`)) {
      return
    }

    setIsSending(true)
    try {
      const response = await fetch('/api/birthday/send-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_ids: Array.from(selectedBirthdays),
          message_template: messageTemplate,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setSelectedBirthdays(new Set())
        await loadBirthdays()
        await checkConnection()
        alert(`Successfully sent ${result.results.sent} messages`)
      } else {
        setError(result.error || 'Failed to send messages')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send messages')
    } finally {
      setIsSending(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      // Convert HH:MM to HH:MM:SS format for database
      const timeValue = scheduledTime.includes(':') 
        ? `${scheduledTime}:00` 
        : `${scheduledTime}:00:00`

      const response = await fetch('/api/whatsapp/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          default_template: messageTemplate,
          send_time: timeValue,
          auto_send_enabled: autoSendEnabled,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert('Settings saved successfully')
        await loadSettings() // Reload to get updated settings
      } else {
        setError(result.error || 'Failed to save settings')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings')
    }
  }

  if (loading || isCheckingConnection) {
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

  const todayBirthdays = birthdays.filter(b => b.is_today && !b.already_sent)
  const upcomingBirthdays = birthdays.filter(b => !b.is_today)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-slate-900">WhatsApp Services</h1>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* WhatsApp Connection Section */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">WhatsApp Connection</h2>

          {connection ? (
            <div className="space-y-4">
              {/* Connection Status Badge */}
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
                connection.device_status === 'Connected' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : connection.device_status === 'Connecting' 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {connection.device_status === 'Connected' ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : connection.device_status === 'Connecting' ? (
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                <span className="font-semibold">Status: {connection.device_status}</span>
              </div>

              {/* Connection Details */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm p-4 bg-slate-50 rounded-lg">
                  <div>
                    <span className="text-slate-600 font-medium">Device Number:</span>
                    <span className="ml-2 font-mono text-slate-900">{connection.sender_number}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 font-medium">Messages Sent:</span>
                    <span className="ml-2 font-medium text-slate-900">{connection.messages_sent || 0}</span>
                  </div>
                  {connection.last_connected_at && (
                    <div>
                      <span className="text-slate-600 font-medium">Last Connected:</span>
                      <span className="ml-2 text-slate-900">
                        {new Date(connection.last_connected_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {connection.last_disconnected_at && connection.device_status !== 'Connected' && (
                    <div>
                      <span className="text-slate-600 font-medium">Last Disconnected:</span>
                      <span className="ml-2 text-slate-900">
                        {new Date(connection.last_disconnected_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* API Key Display (masked) */}
                {connection.api_key && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className="text-sm font-medium text-slate-700">API Key:</span>
                        <span className="ml-2 font-mono text-sm text-slate-900 break-all">
                          {connection.api_key.length > 12 
                            ? `${connection.api_key.substring(0, 8)}...${connection.api_key.substring(connection.api_key.length - 4)}` 
                            : connection.api_key}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 ml-2 whitespace-nowrap">(Stored securely)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                {connection.device_status === 'Connected' ? (
                  <>
                    <button
                      onClick={checkConnection}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Refresh Status
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Disconnect WhatsApp
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={checkConnection}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Check Status
                    </button>
                    <button
                      onClick={() => {
                        setQrStatus('idle')
                        setQrCode(null)
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Reconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!connection && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> Enter your WhatsApp number and API key to connect. Your API key will be stored securely in the database.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    placeholder="60123456789"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">Format: 60123456789 (Malaysia)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Your WhatsApp API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">Your API key from Ustaz AI WhatsApp service</p>
                </div>
              </div>

              {qrStatus === 'qrcode' && qrCode && (
                <div className="flex flex-col items-center gap-4 p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-700">Scan this QR code with WhatsApp:</p>
                  <img src={qrCode} alt="QR Code" className="w-64 h-64 border-2 border-slate-300 rounded-lg" />
                  <p className="text-xs text-slate-500">Status: Waiting for scan...</p>
                </div>
              )}

              {qrStatus === 'processing' && (
                <div className="flex items-center gap-2 text-blue-600">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Processing QR code...</span>
                </div>
              )}

              <button
                onClick={generateQR}
                disabled={isConnecting || !senderNumber || !apiKey}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {isConnecting ? 'Connecting...' : connection && connection.device_status !== 'Connected' ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
              </button>
            </div>
          )}

          {/* Show connection form even when disconnected, below connection details */}
          {connection && connection.device_status !== 'Connected' && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>Connection Disconnected:</strong> Your WhatsApp is disconnected. Update your API key below and click "Reconnect" to reconnect.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    placeholder="60123456789"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    API Key (Update if needed)
                  </label>
                  <input
                    type="password"
                    placeholder="Enter API key to reconnect"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <button
                onClick={generateQR}
                disabled={isConnecting || !senderNumber || !apiKey}
                className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {isConnecting ? 'Connecting...' : 'Reconnect WhatsApp'}
              </button>
            </div>
          )}
        </div>

        {/* Birthday Automation Section */}
        {connection && connection.device_status === 'Connected' && (
          <>
            {/* Automation Settings */}
            <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Birthday Automation Settings</h2>
              <div className="space-y-6">
                {/* Auto-Send Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Enable Automatic Birthday Messages
                    </label>
                    <p className="text-xs text-slate-500">
                      Automatically send birthday wishes at your scheduled time
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSendEnabled}
                      onChange={(e) => setAutoSendEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Scheduled Time */}
                {autoSendEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Scheduled Time (Malaysia Time)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <div className="text-sm text-slate-600">
                        <p className="font-medium">Birthday messages will be sent automatically at {scheduledTime} Malaysia time</p>
                        <p className="text-xs text-slate-500 mt-1">The system checks every hour and sends messages at your scheduled time</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Message Template */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Birthday Message Template
                  </label>
                  <textarea
                    value={messageTemplate}
                    onChange={(e) => setMessageTemplate(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Variables: {'{'}SenderName{'}'}, {'{'}Name{'}'}, {'{'}Age{'}'}, {'{'}SaveName{'}'}, {'{'}PGCode{'}'}
                  </p>
                </div>

                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>

            {/* Today's Birthdays */}
            {todayBirthdays.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-slate-900">
                    Today's Birthdays ({todayBirthdays.length})
                  </h2>
                  <button
                    onClick={() => {
                      setSelectedBirthdays(new Set(todayBirthdays.map(b => b.id)))
                      handleBulkSend()
                    }}
                    disabled={isSending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400 transition-colors"
                  >
                    Send All
                  </button>
                </div>
                <div className="space-y-2">
                  {todayBirthdays.map((birthday) => (
                    <div
                      key={birthday.id}
                      className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <div>
                        <span className="font-medium text-slate-900">{birthday.sender_name || birthday.name}</span>
                        <span className="text-sm text-slate-600 ml-2">({birthday.age} years old)</span>
                        <span className="text-sm text-slate-600 ml-2">- {birthday.phone}</span>
                      </div>
                      <button
                        onClick={() => handleSendBirthday(birthday.id)}
                        disabled={isSending}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-slate-400 transition-colors"
                      >
                        Send
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Birthdays */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-200/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-slate-900">
                  Upcoming Birthdays (Next 7 Days)
                </h2>
                {selectedBirthdays.size > 0 && (
                  <button
                    onClick={handleBulkSend}
                    disabled={isSending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
                  >
                    Send Selected ({selectedBirthdays.size})
                  </button>
                )}
              </div>

              {isLoadingBirthdays ? (
                <div className="text-center py-8 text-slate-500">Loading...</div>
              ) : upcomingBirthdays.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No upcoming birthdays</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left w-12">
                          <input
                            type="checkbox"
                            checked={selectedBirthdays.size > 0 && selectedBirthdays.size === upcomingBirthdays.length}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded cursor-pointer"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase">Sender Name</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase">Birthday</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase">Age</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase">Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {upcomingBirthdays.map((birthday) => (
                        <tr key={birthday.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedBirthdays.has(birthday.id)}
                              onChange={(e) => handleSelectOne(birthday.id, e.target.checked)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {birthday.sender_name || birthday.name || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-800">
                            {new Date(birthday.birthday_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-800">{birthday.age || '-'}</td>
                          <td className="px-4 py-3 text-sm text-slate-800">{birthday.phone || '-'}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleSendBirthday(birthday.id)}
                              disabled={isSending || birthday.already_sent}
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                            >
                              {birthday.already_sent ? 'Sent' : 'Send'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

