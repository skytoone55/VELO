// Monday.com API Types

export interface MondayItem {
  id: string
  name: string
  column_values: MondayColumnValue[]
}

export interface MondayColumnValue {
  id: string
  text: string
  value: string | null
}

export interface MondayMutation {
  type: 'create' | 'update'
  boardId: string
  itemId?: string
  itemName?: string
  columnValues: Record<string, any>
}

export interface SyncResult {
  success: boolean
  direction: 'supabase_to_monday' | 'monday_to_supabase'
  itemsProcessed: number
  itemsCreated: number
  itemsUpdated: number
  itemsSkipped: number
  errors: SyncError[]
  timestamp: string
}

export interface SyncError {
  itemId?: string
  mondayItemId?: string
  boardId?: string
  error: string
  details?: any
}

export interface SyncStatus {
  lastSync: string | null
  lastSyncResult: SyncResult | null
  isConfigured: boolean
  isSyncing: boolean
}
