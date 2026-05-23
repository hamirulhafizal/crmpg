import type { ImageStepParameters, ImageTextLayer } from '@/app/lib/campaigns/image-step/types'

export const CAMPAIGN_WORKFLOW_MEDIA_BUCKET = 'campaign-workflow-media'

export function defaultImageStepParameters(stepOrder = 1): ImageStepParameters {
  return {
    step_order: stepOrder,
    delay_days: 0,
    send_time: '10:00',
    is_active: true,
    enable_typing: true,
    randomize_spaces: false,
    caption_template: '',
    background_path: '',
    background_mimetype: 'image/png',
    canvas_width: 1080,
    canvas_height: 1080,
    aspect_mode: 'square',
    layers: [],
  }
}

export function newImageTextLayer(variable = 'SenderName'): ImageTextLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    variable,
    x: 50,
    y: 50,
    font_family: 'Arial, sans-serif',
    font_size: 48,
    color: '#ffffff',
    align: 'center',
    font_weight: 700,
  }
}
