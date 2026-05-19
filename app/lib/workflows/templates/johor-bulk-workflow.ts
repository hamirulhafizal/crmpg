import type { WorkflowDefinition } from '@/app/lib/workflows/types'

/** Visual n8n-style graph: WAHA bulk Johor customers (matches common n8n export layout). */
export function createJohorWahaBulkWorkflowDefinition(): WorkflowDefinition {
  return {
    version: 1,
    nodes: [
      {
        id: 'cron-trigger',
        type: 'crm.trigger.schedule',
        position: { x: 200, y: 300 },
        parameters: {
          display_name: 'Cron 8AM',
          cron_expression: '0 8 * * *',
        },
      },
      {
        id: 'supabase-get-customers',
        type: 'crm.data.supabase',
        position: { x: 450, y: 300 },
        parameters: {
          display_name: 'Get Johor Customers',
          operation: 'getAll',
          table: 'customers',
          audience_filters: { location_contains: 'Johor' },
        },
      },
      {
        id: 'loop-customers',
        type: 'crm.flow.loop',
        position: { x: 700, y: 300 },
        parameters: {
          display_name: 'Loop Customers One By One',
          batch_size: 1,
        },
      },
      {
        id: 'prepare-message',
        type: 'crm.data.set',
        position: { x: 950, y: 300 },
        parameters: {
          display_name: 'Prepare Message',
          message1: 'Assalamualaikum {{name}}, selamat pagi 😊',
          message2: 'Kami ingin berkongsi update terbaru untuk anda hari ini.',
        },
      },
      {
        id: 'send-message-1',
        type: 'crm.integration.waha',
        position: { x: 1200, y: 300 },
        parameters: {
          display_name: 'Send WhatsApp Message 1',
          step_order: 1,
          delay_days: 0,
          send_time: '08:00',
          message_template: 'Assalamualaikum {{name}}, selamat pagi 😊',
          is_active: true,
        },
      },
      {
        id: 'wait-random-1',
        type: 'crm.flow.wait',
        position: { x: 1450, y: 300 },
        parameters: {
          display_name: 'Wait 30-60 Sec',
          wait_min_seconds: 30,
          wait_max_seconds: 60,
        },
      },
      {
        id: 'send-message-2',
        type: 'crm.integration.waha',
        position: { x: 1700, y: 300 },
        parameters: {
          display_name: 'Send WhatsApp Message 2',
          step_order: 2,
          delay_days: 0,
          send_time: '08:01',
          message_template: 'Kami ingin berkongsi update terbaru untuk anda hari ini.',
          is_active: true,
        },
      },
      {
        id: 'update-db',
        type: 'crm.data.supabase',
        position: { x: 1950, y: 300 },
        parameters: {
          display_name: 'Update DB Sent',
          operation: 'update',
          table: 'customers',
        },
      },
      {
        id: 'wait-next-customer',
        type: 'crm.flow.wait',
        position: { x: 2200, y: 300 },
        parameters: {
          display_name: 'Wait Next Customer',
          wait_min_seconds: 10,
          wait_max_seconds: 30,
        },
      },
      {
        id: 'continue-loop',
        type: 'crm.flow.pass',
        position: { x: 2450, y: 300 },
        parameters: { display_name: 'Next Customer' },
      },
      {
        id: 'notify-owner',
        type: 'crm.integration.waha',
        position: { x: 2700, y: 500 },
        parameters: {
          display_name: 'Notify Sender Complete',
          step_order: 99,
          message_template: 'Sent to all customer done ✅',
          is_active: false,
        },
      },
    ],
    edges: [
      { id: 'e-cron-supabase', source: 'cron-trigger', target: 'supabase-get-customers' },
      { id: 'e-supabase-loop', source: 'supabase-get-customers', target: 'loop-customers' },
      {
        id: 'e-loop-prepare',
        source: 'loop-customers',
        target: 'prepare-message',
        sourceHandle: 'loop',
      },
      { id: 'e-prepare-send1', source: 'prepare-message', target: 'send-message-1' },
      { id: 'e-send1-wait1', source: 'send-message-1', target: 'wait-random-1' },
      { id: 'e-wait1-send2', source: 'wait-random-1', target: 'send-message-2' },
      { id: 'e-send2-update', source: 'send-message-2', target: 'update-db' },
      { id: 'e-update-waitnext', source: 'update-db', target: 'wait-next-customer' },
      { id: 'e-waitnext-next', source: 'wait-next-customer', target: 'continue-loop' },
      {
        id: 'e-next-loop',
        source: 'continue-loop',
        target: 'loop-customers',
        routing: 'loop-back',
        pathOffsetY: 110,
      },
      {
        id: 'e-loop-notify',
        source: 'loop-customers',
        target: 'notify-owner',
        sourceHandle: 'done',
      },
    ],
  }
}
